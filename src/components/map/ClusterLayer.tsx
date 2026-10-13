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
  /** Shown on click when the page has no onSelect. */
  popupHtml?: string;
  /** Accessible name for the marker (keyboard and screen readers). */
  title?: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * With `onSelect`, a marker click (or Enter on a focused marker) selects the asset
 * and the page shows its panel (UI-UPGRADE §6); without it the marker opens its popup.
 */
export function ClusterLayer({ markers, onSelect }: { markers: ClusterMarker[]; onSelect?: (id: string) => void }) {
  const map = useMap();

  useEffect(() => {
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], { icon: m.icon, keyboard: true, title: m.title ?? m.id, alt: m.title ?? m.id });
      if (onSelect) marker.on('click', () => onSelect(m.id));
      else if (m.popupHtml) marker.bindPopup(m.popupHtml);
      group.addLayer(marker);
    }
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map, markers, onSelect]);

  return null;
}
