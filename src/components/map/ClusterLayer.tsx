'use client';

// Marker clustering for the map (spec §11.2): nearby markers merge into a count
// bubble and split as the user zooms in. Built on leaflet.markercluster; the
// popup is HTML built by the caller (escapeHtml below), so no React tree lives
// inside a cluster.

import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useMap } from 'react-leaflet';

export interface ClusterMarker {
  id: string;
  lat: number;
  lng: number;
  icon: L.Icon | L.DivIcon;
  popupHtml: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function ClusterLayer({ markers }: { markers: ClusterMarker[] }) {
  const map = useMap();

  useEffect(() => {
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], { icon: m.icon, keyboard: true, title: m.id });
      marker.bindPopup(m.popupHtml);
      group.addLayer(marker);
    }
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map, markers]);

  return null;
}
