'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import { hasCapability } from '@/server/access';
import type { Label } from '@/domain/types';

function assetsForLabel(labelId: string): string[] {
  return seed.assetLabels
    .filter(al => al.labelId === labelId)
    .map(al => al.assetId);
}

export default function LabelsPage() {
  const store = useStore;
  const session = store.getState().session;

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const canManage = hasCapability(session!, 'label.manage');

  // Customers see only their own tenant's labels.
  const visibleLabels = useMemo(() => {
    if (!session) return [];
    return seed.labels.filter(l => {
      if (l.tenantId !== session.tenantId) return false;
      if (searchQuery && !l.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [session, searchQuery]);

  const createLabel = (name: string) => {
    if (!session) return;
    if (!name.trim() || name.length > 40) return;
    const duplicate = seed.labels.find(l =>
      l.name.toLowerCase() === name.toLowerCase() &&
      l.tenantId === session.tenantId
    );
    if (duplicate) {
      showToast('A label with this name already exists.');
      return;
    }
    showToast(`Label "${name}" created.`);
    setShowCreateForm(false);
    setNewLabelName('');
  };

  const deleteLabel = (label: Label) => {
    const assetCodes = assetsForLabel(label.id)
      .map(id => seed.assets.find(a => a.id === id)?.code)
      .filter(Boolean)
      .join(', ');
    if (assetCodes) {
      if (!window.confirm(`Remove "${label.name}" from ${assetCodes}?`)) return;
    }
    showToast(`"${label.name}" deleted.`);
  };

  const renameLabel = (label: Label) => {
    const newName = window.prompt(`Rename "${label.name}" to:`);
    if (newName && newName.trim().length >= 1 && newName.trim().length <= 40) {
      showToast(`Label renamed to "${newName.trim()}".`);
    }
  };

  if (!session) return null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          placeholder="Search labels…"
        />
        {canManage && (
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>Create label</Button>
        )}
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Labels</h1>
          <p className="text-sm text-grey-500 mt-1">
            Organise your assets with custom labels. Labels belong to your tenant and can be applied to any of your assets.
          </p>
        </div>
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
              <Button onClick={() => createLabel(newLabelName)}>Create</Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {visibleLabels.map(label => {
          const assetIds = assetsForLabel(label.id);
          const assetCodes = assetIds.map(id => seed.assets.find(a => a.id === id)?.code).filter(Boolean);
          return (
            <div key={label.id} className="bg-surface border border-line rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="yellow">{label.name}</Badge>
                    <span className="text-xs text-grey-500">{assetCodes.length} asset{assetCodes.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-xs text-grey-500 mt-1">
                    Assets: {assetCodes.join(', ') || 'No assets'}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                    onClick={() => renameLabel(label)}
                  >
                    Rename
                  </button>
                  {canManage && (
                    <button
                      className="text-xs px-2 py-1 rounded bg-red/10 border border-red/30 text-red hover:bg-red/20"
                      onClick={() => deleteLabel(label)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {visibleLabels.length === 0 && (
          <EmptyState
            title="No labels"
            description="Create a label to organise your assets."
          />
        )}
      </div>

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        Labels are scoped to your tenant. They help you group assets across sites and jobs.
        Use the search box to filter labels by name.
      </div>
    </div>
  );
}
