'use client';

// Geofence map (spec §11.12): a drawing editor for one circle or polygon, and a
// dashed overlay of existing geofences. Geometry is passed in and out as plain
// values, so the screen owns the data and this file only draws it. Drawing and
// editing use @geoman-io/leaflet-geoman-free.

import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

export type ShapeValue =
  | { type: 'circle'; center: { lat: number; lng: number }; radiusM: number }
  | { type: 'polygon'; points: { lat: number; lng: number }[] };

export interface OverlayFence {
  id: string;
  name: string;
  shape: ShapeValue;
  colour: string;
}

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function shapeKey(shape: ShapeValue | null): string {
  if (!shape) return 'none';
  if (shape.type === 'circle') return `c:${shape.center.lat.toFixed(6)},${shape.center.lng.toFixed(6)},${Math.round(shape.radiusM)}`;
  return `p:${shape.points.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(';')}`;
}

function readLayer(layer: L.Layer): ShapeValue | null {
  if (layer instanceof L.Circle) {
    const c = layer.getLatLng();
    return { type: 'circle', center: { lat: c.lat, lng: c.lng }, radiusM: Math.round(layer.getRadius()) };
  }
  if (layer instanceof L.Polygon) {
    const ring = layer.getLatLngs()[0] as L.LatLng[];
    return { type: 'polygon', points: ring.map(p => ({ lat: p.lat, lng: p.lng })) };
  }
  return null;
}

function makeLayer(shape: ShapeValue): L.Circle | L.Polygon {
  if (shape.type === 'circle') {
    return L.circle([shape.center.lat, shape.center.lng], { radius: shape.radiusM, color: '#D4A000', weight: 2, fillOpacity: 0.12 });
  }
  return L.polygon(shape.points.map(p => [p.lat, p.lng] as [number, number]), { color: '#D4A000', weight: 2, fillOpacity: 0.12 });
}

/** The one shape being created or edited, drawn on the map with geoman's tools. */
function DrawingLayer({ shape, onChange }: { shape: ShapeValue | null; onChange: (shape: ShapeValue | null) => void }) {
  const map = useMap();
  const layerRef = useRef<L.Circle | L.Polygon | null>(null);
  const keyRef = useRef<string>('none');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Geoman toolbar: draw a circle or polygon, edit, remove.
  useEffect(() => {
    map.pm.addControls({
      position: 'topleft',
      drawCircle: true,
      drawPolygon: true,
      drawMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircleMarker: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
      dragMode: false,
      editMode: true,
      removalMode: true,
    });
    map.pm.setPathOptions({ color: '#D4A000', fillColor: '#D4A000' });
    const onCreate = (event: L.LeafletEvent) => {
      const e = event as unknown as { shape: string; layer: L.Layer };
      const next = readLayer(e.layer);
      map.removeLayer(e.layer);
      if (!next) return;
      onChangeRef.current(next);
    };
    const onRemove = () => onChangeRef.current(null);
    map.on('pm:create', onCreate);
    map.on('pm:remove', onRemove);
    return () => {
      map.off('pm:create', onCreate);
      map.off('pm:remove', onRemove);
      map.pm.removeControls();
    };
  }, [map]);

  // Keep the drawn layer in step with the value. A change made by dragging on the
  // map updates the value first, so the key matches and nothing is redrawn.
  useEffect(() => {
    const key = shapeKey(shape);
    if (key === keyRef.current && layerRef.current) return;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    keyRef.current = key;
    if (!shape) return;
    const layer = makeLayer(shape);
    layer.addTo(map);
    layer.pm.enable({ allowSelfIntersection: false });
    const sync = () => {
      const next = readLayer(layer);
      if (!next) return;
      keyRef.current = shapeKey(next);
      onChangeRef.current(next);
    };
    layer.on('pm:edit', sync);
    layer.on('pm:update', sync);
    layer.on('pm:dragend', sync);
    layer.on('pm:markerdragend', sync);
    layer.on('pm:vertexadded', sync);
    layer.on('pm:vertexremoved', sync);
    layerRef.current = layer;
  }, [map, shape]);

  return null;
}

/** Fit the editor to the current shape, or to the first overlay fence, on arrival. */
function FitTo({ shape, fallback }: { shape: ShapeValue | null; fallback: ShapeValue[] }) {
  const map = useMap();
  useEffect(() => {
    const target = shape ?? fallback[0];
    if (!target) return;
    // Bounds from the geometry itself: a layer that is not on a map has no bounds to read.
    const bounds = target.type === 'circle'
      ? circleBounds(target.center, target.radiusM)
      : L.latLngBounds(target.points.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    // Only on arrival: later edits must not move the map under the user.
  }, [map]);
  return null;
}

/** Bounds of a circle: 1 degree of latitude is about 111.32 km. */
function circleBounds(center: { lat: number; lng: number }, radiusM: number): L.LatLngBounds {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return L.latLngBounds([center.lat - dLat, center.lng - dLng], [center.lat + dLat, center.lng + dLng]);
}

function Overlay({ fences }: { fences: OverlayFence[] }) {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup();
    for (const f of fences) {
      const layer = f.shape.type === 'circle'
        ? L.circle([f.shape.center.lat, f.shape.center.lng], { radius: f.shape.radiusM, color: f.colour, weight: 2, dashArray: '6 4', fillOpacity: 0.05 })
        : L.polygon(f.shape.points.map(p => [p.lat, p.lng] as [number, number]), { color: f.colour, weight: 2, dashArray: '6 4', fillOpacity: 0.05 });
      layer.bindTooltip(f.name, { sticky: true });
      group.addLayer(layer);
    }
    group.addTo(map);
    return () => { map.removeLayer(group); };
  }, [map, fences]);
  return null;
}

export function GeofenceEditor({
  shape,
  onChange,
  overlay = [],
  height = 360,
}: {
  shape: ShapeValue | null;
  onChange: (shape: ShapeValue | null) => void;
  overlay?: OverlayFence[];
  height?: number;
}) {
  const start: [number, number] = shape?.type === 'circle'
    ? [shape.center.lat, shape.center.lng]
    : shape?.points[0] ? [shape.points[0].lat, shape.points[0].lng] : [25.2048, 55.2708];
  return (
    <div className="rounded-lg overflow-hidden border border-line" style={{ height }} data-testid="geofence-editor">
      <MapContainer center={start} zoom={12} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={TILE_URL} attribution="&copy; OpenStreetMap" />
        <Overlay fences={overlay} />
        <DrawingLayer shape={shape} onChange={onChange} />
        <FitTo shape={shape} fallback={overlay.map(f => f.shape)} />
      </MapContainer>
    </div>
  );
}

/** The dashed overlay as a layer, for any map that already exists (the /app toggle, spec §11.12). */
export function GeofenceOverlayLayer({ fences }: { fences: OverlayFence[] }) {
  return <Overlay fences={fences} />;
}
