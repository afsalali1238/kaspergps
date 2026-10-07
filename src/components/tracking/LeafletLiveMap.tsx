'use client';

// One live dot for the public tracking page — no route, no history, no other data
// (spec 11.6). Client-only because Leaflet needs the browser.

import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '@/domain/types';

export function LeafletLiveMap({ position }: { position: LatLng }) {
  const dot = L.divIcon({
    className: 'kasper-live-dot',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#1F9A6D;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  return (
    <MapContainer center={[position.lat, position.lng]} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[position.lat, position.lng]} icon={dot} />
    </MapContainer>
  );
}

export default LeafletLiveMap;
