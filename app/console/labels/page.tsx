'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useDb } from '@/server/db';
import { useStore } from '@/store';

interface Label {
  id: string;
  name: string;
  tenantId: string;
  createdAt: string;
  assetIds: string[];
}

const LABELS: Label[] = [
  { id: 'l-1', name: 'Project Alpha', tenantId: 't-alnoor', createdAt: '2026-09-01', assetIds: ['a-fb12', 'a-fb14'] },
  { id: 'l-2', name: 'Urgent delivery', tenantId: 't-emirates', createdAt: '2026-09-05', assetIds: ['a-ex04', 'a-ex07'] },
  { id: 'l-3', name: 'Maintenance due', tenantId: 't-marina', createdAt: '2026-09-10', assetIds: ['a-cr02'] },
];

export default function LabelsPage() {
  const seed = useDb(s => s);
  const store = useStore;
  const session = store.getState().session;

  const [searchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const visibleLabels = useMemo(() => {
    if (!session) return [];
    return LABELS.filter(l => {
      if (l.tenantId !== session.tenantId && !session.isKasper) return false;
      if (searchQuery && !l.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [session, searchQuery]);

  if (!session) return null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Labels</h1>
          <p className="text-sm text-grey-500 mt-1">
            Organize assets with custom labels.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>Create label</Button>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {showCreateForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Create label</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Name (≤ 40 characters)</label>
              <input
                type="text"
                value={newLabelName}
                onChange={e => setNewLabelName(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder="Enter label name"
                maxLength={40}
              />
              {newLabelName.length > 40 && (
                <div className="text-xs text-red mt-1">Label name is too long</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setShowCreateForm(false); setNewLabelName(''); }}>Cancel</Button>
              <Button onClick={() => { setShowCreateForm(false); setNewLabelName(''); showToast('Label created'); }}>Create</Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {visibleLabels.map(label => (
          <div key={label.id} className="bg-surface border border-line rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="yellow">{label.name}</Badge>
                  <span className="text-xs text-grey-500">{label.assetIds.length} assets</span>
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  Assets: {label.assetIds.map(id => seed.assets.find(a => a.id === id)?.code).join(', ')}
                </div>
              </div>
              <div className="flex gap-1">
                <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                  Rename
                </button>
                <button className="text-xs px-2 py-1 rounded bg-red/10 border border-red/30 text-red hover:bg-red/20">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {visibleLabels.length === 0 && (
          <EmptyState
            title="No labels"
            description="Create a label to organize your assets."
          />
        )}
      </div>
    </div>
  );
}
