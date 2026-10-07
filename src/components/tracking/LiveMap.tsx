'use client';

// public/leaflet boundary: react-leaflet evaluates `window` on import, so the map
// is loaded client-only. Nothing else here touches Leaflet.

import React from 'react';
import dynamic from 'next/dynamic';
import type { LatLng } from '@/domain/types';

const LeafletLiveMap = dynamic(() => import('./LeafletLiveMap').then(m => m.LeafletLiveMap), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-paper-2" aria-hidden />,
});

export function LiveMap({ position }: { position: LatLng }) {
  return <LeafletLiveMap position={position} />;
}

export default LiveMap;
