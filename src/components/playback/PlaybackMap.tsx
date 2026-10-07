'use client';

// The Leaflet map itself. Loaded client-only through next/dynamic because
// react-leaflet touches `window` at module evaluation and cannot be server-rendered.

import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as clock from '@/lib/clock';
import type { PlaybackEvent, PlaybackEventKind, TrackPoint } from '@/domain/trips';

export interface PlaybackMarker {
  lat: number;
  lng: number;
  heading: number;
}

const STATE_COLOURS = {
  moving: '#1F9A6D',
  stationary: '#B89000',
  off: '#9A9CA1',
  nodata: 'transparent',
} as const;

export const EVENT_STYLES: Record<PlaybackEventKind, { colour: string; glyph: string }> = {
  trip_start: { colour: '#1F9A6D', glyph: '▶' },
  trip_stop: { colour: '#9A9CA1', glyph: '■' },
  harsh_brake: { colour: '#D64545', glyph: '!' },
  harsh_accel: { colour: '#D64545', glyph: '!' },
  harsh_corner: { colour: '#D64545', glyph: '!' },
  harsh_driving: { colour: '#D64545', glyph: '!' },
  overspeed: { colour: '#D64545', glyph: '▲' },
  geofence_enter: { colour: '#2F6FD0', glyph: '⤓' },
  geofence_exit: { colour: '#2F6FD0', glyph: '⤒' },
  refuel: { colour: '#B89000', glyph: '▲' },
  fuel_drop: { colour: '#B89000', glyph: '▼' },
  power_cut: { colour: '#D64545', glyph: '⚡' },
  towing: { colour: '#7A4FD0', glyph: '⇄' },
};

function FitBounds({ points }: { points: TrackPoint[] }) {
  const map = useMap();
  const fitted = useRef<string>('');
  const key = `${points.length}:${points[0]?.t ?? 0}:${points[points.length - 1]?.t ?? 0}`;
  useEffect(() => {
    if (fitted.current === key || points.length === 0) return;
    fitted.current = key;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32] });
  }, [map, points, key]);
  return null;
}

function markerIcon(heading: number, colour: string): L.DivIcon {
  return L.divIcon({
    className: 'playback-marker',
    html: `<div style="transform: rotate(${Math.round(heading)}deg)">
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r="10" fill="${colour}" stroke="white" stroke-width="2.5"/>
        <path d="M13 3.5 L17 10 L13 8.5 L9 10 Z" fill="white"/>
      </svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export interface PlaybackMapProps {
  /** Downsampled track for drawing. */
  points: TrackPoint[];
  /** Polylines behind the marker. */
  trail: [number, number][][];
  /** Polylines ahead of the marker, drawn faint. */
  ahead: [number, number][][];
  events: PlaybackEvent[];
  marker: PlaybackMarker | null;
  markerColour: string;
  onEventClick: (atMs: number) => void;
}

export function PlaybackMap({ points, trail, ahead, events, marker, markerColour, onEventClick }: PlaybackMapProps) {
  if (points.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-grey-500">
        No readings in this period.
      </div>
    );
  }

  const icon = markerIcon(marker?.heading ?? 0, markerColour);

  return (
    <MapContainer
      center={[points[0].lat, points[0].lng]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {ahead.map((positions, i) => (
        <Polyline key={`ahead-${i}`} positions={positions} pathOptions={{ color: '#C9CBD0', weight: 3, opacity: 0.7 }} />
      ))}
      {trail.map((positions, i) => (
        <Polyline key={`trail-${i}`} positions={positions} pathOptions={{ color: STATE_COLOURS.moving, weight: 4 }} />
      ))}
      {events.map(event => (
        <CircleMarker
          key={event.id}
          center={[event.lat, event.lng]}
          radius={5}
          pathOptions={{
            color: EVENT_STYLES[event.kind].colour,
            fillColor: 'white',
            fillOpacity: 1,
            weight: 2,
          }}
          eventHandlers={{ click: () => onEventClick(event.atMs) }}
        >
          <Tooltip>
            {event.label}
            {event.detail ? ` · ${event.detail}` : ''} · {clock.formatDubaiTime(event.atMs)}
          </Tooltip>
        </CircleMarker>
      ))}
      {marker && <Marker position={[marker.lat, marker.lng]} icon={icon} />}
    </MapContainer>
  );
}

export default PlaybackMap;
