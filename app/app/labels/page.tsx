'use client';

import React, { useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Badge, Button, EmptyState } from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible } from '@/server/access';
import { can } from '@/server/capabilities';
import { getReadingForAsset, getReadingsForAsset } from '@/server/telemetry/simulator';
import type { Asset, Label } from '@/domain/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function addAudit(sessionUserId: string, tenantId: string | null, action: string, detail: string, assetId?: string) {
  const sequence = seed.auditEntries.length + 1;
  seed.auditEntries.push({
    id: `au-${String(sequence).padStart(3, '0')}`,
    at: clock.now(),
    actorUserId: sessionUserId,
    action,
    tenantId: tenantId ?? undefined,
    assetId,
    detail,
  });
}

export default function LabelsPage() {
  const session = useStore(state => state.session);
  const phase = useStore(state => state.demoSwitches.phase);
  const now = clock.now();
  const [filterLabelId, setFilterLabelId] = useState('all');
  const [bulkLabelId, setBulkLabelId] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [labelName, setLabelName] = useState('');
  const [tenantScope, setTenantScope] = useState(() => seed.tenants[0]?.id ?? '');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  const visibleAssets = useMemo(() => {
    if (!session || phase === 'day_one' || !can(session, 'label.view')) return [];
    return seed.assets.filter(asset =>
      !asset.retiredAt && isAssetVisible(session, asset.id) && (session.isKasper || asset.ownerTenantId === session.tenantId)
    );
  }, [phase, session]);
  const selectedTenantId = session?.isKasper ? tenantScope : session?.tenantId ?? '';
  const visibleLabels = useMemo(() => {
    if (!session || phase === 'day_one' || !can(session, 'label.view')) return [];
    return seed.labels.filter(label => session.isKasper ? label.tenantId === selectedTenantId : label.tenantId === session.tenantId);
  }, [phase, revision, selectedTenantId, session]);
  const scopedLabelIds = useMemo(() => new Set(visibleLabels.map(label => label.id)), [visibleLabels]);
  const labelIdsForAsset = (asset: Asset) => seed.assetLabels
    .filter(link => link.assetId === asset.id && scopedLabelIds.has(link.labelId))
    .map(link => link.labelId);
  const filteredAssets = useMemo(() => visibleAssets.filter(asset =>
    filterLabelId === 'all' || labelIdsForAsset(asset).includes(filterLabelId)
  ), [filterLabelId, revision, scopedLabelIds, visibleAssets]);
  const managedAssets = useMemo(() => filteredAssets.filter(asset =>
    session?.isKasper || asset.ownerTenantId === session?.tenantId
  ), [filteredAssets, session]);
  const locations = useMemo(() => {
    return filteredAssets.map(asset => {
      getReadingsForAsset(asset, now - DAY_MS, now);
      return { asset, reading: getReadingForAsset(asset) };
    });
  }, [filteredAssets, now, revision]);
  const scopeTenants = useMemo(() => {
    const tenantIds = new Set(visibleAssets.map(asset => asset.ownerTenantId));
    return seed.tenants.filter(tenant => tenantIds.has(tenant.id));
  }, [visibleAssets]);
  const selectedLabel = visibleLabels.find(label => label.id === bulkLabelId);

  const toggleAsset = (assetId: string) => {
    setSelectedAssetIds(current => current.includes(assetId)
      ? current.filter(id => id !== assetId)
      : [...current, assetId]);
  };

  const createLabel = () => {
    if (!session || phase === 'day_one' || !can(session, 'label.manage')) {
      setNotice('You cannot create labels.');
      return;
    }
    if (!selectedTenantId || !labelName.trim() || labelName.trim().length > 40) {
      setNotice('Enter a label name of 40 characters or fewer and choose a tenant.');
      return;
    }
    if (!session.isKasper && selectedTenantId !== session.tenantId) {
      setNotice('You cannot create labels for another tenant.');
      return;
    }
    const name = labelName.trim();
    if (seed.labels.some(label => label.tenantId === selectedTenantId && label.name.toLowerCase() === name.toLowerCase())) {
      setNotice('A label with that name already exists.');
      return;
    }
    const id = `l-${selectedTenantId}-${clock.now()}-${seed.labels.length + 1}`;
    const label: Label = {
      id,
      tenantId: selectedTenantId,
      name,
      createdBy: session.userId,
      createdAt: clock.now(),
    };
    seed.labels.push(label);
    addAudit(session.userId, selectedTenantId, 'label.create', `Label "${name}" created`);
    setLabelName('');
    setBulkLabelId(id);
    setFilterLabelId('all');
    setNotice('Label added.');
    setRevision(value => value + 1);
  };

  const addLabelToSelected = () => {
    if (!session || phase === 'day_one' || !can(session, 'label.manage')) {
      setNotice('You cannot assign labels.');
      return;
    }
    if (!selectedLabel || selectedAssetIds.length === 0) {
      setNotice('Choose a label and at least one asset.');
      return;
    }
    if (!session.isKasper && selectedLabel.tenantId !== session.tenantId) {
      setNotice('You cannot assign another tenant’s label.');
      return;
    }
    const selected = visibleAssets.filter(asset => selectedAssetIds.includes(asset.id));
    const permitted = selected.filter(asset =>
      isAssetVisible(session, asset.id) && asset.ownerTenantId === selectedLabel.tenantId
    );
    if (permitted.length !== selectedAssetIds.length) {
      setNotice('Some selected assets cannot be changed. Choose assets owned by this tenant.');
      return;
    }
    const wouldExceedLimit = permitted.some(asset => {
      const alreadyAssigned = seed.assetLabels.some(link => link.labelId === selectedLabel.id && link.assetId === asset.id && link.tenantId === selectedLabel.tenantId);
      const assignedCount = seed.assetLabels.filter(link => link.assetId === asset.id && link.tenantId === selectedLabel.tenantId).length;
      return !alreadyAssigned && assignedCount >= 20;
    });
    if (wouldExceedLimit) {
      setNotice('An asset cannot have more than 20 labels.');
      return;
    }
    let added = 0;
    for (const asset of permitted) {
      const exists = seed.assetLabels.some(link => link.labelId === selectedLabel.id && link.assetId === asset.id && link.tenantId === selectedLabel.tenantId);
      if (!exists) {
        seed.assetLabels.push({ labelId: selectedLabel.id, assetId: asset.id, tenantId: selectedLabel.tenantId });
        added += 1;
      }
    }
    addAudit(session.userId, selectedLabel.tenantId, 'label.assign', `Label "${selectedLabel.name}" added to ${added} assets`);
    setNotice(`Added "${selectedLabel.name}" to ${added} asset${added === 1 ? '' : 's'}.`);
    setSelectedAssetIds([]);
    setRevision(value => value + 1);
  };

  const removeLabelFromSelected = () => {
    if (!session || phase === 'day_one' || !can(session, 'label.manage')) {
      setNotice('You cannot change labels.');
      return;
    }
    if (!selectedLabel || selectedAssetIds.length === 0) {
      setNotice('Choose a label and at least one asset.');
      return;
    }
    if (!session.isKasper && selectedLabel.tenantId !== session.tenantId) {
      setNotice('You cannot change another tenant’s labels.');
      return;
    }
    const permittedIds = new Set(visibleAssets
      .filter(asset => selectedAssetIds.includes(asset.id) && isAssetVisible(session, asset.id) && asset.ownerTenantId === selectedLabel.tenantId)
      .map(asset => asset.id));
    if (permittedIds.size !== selectedAssetIds.length) {
      setNotice('Some selected assets cannot be changed. Choose assets owned by this tenant.');
      return;
    }
    const before = seed.assetLabels.length;
    for (let index = seed.assetLabels.length - 1; index >= 0; index -= 1) {
      const link = seed.assetLabels[index];
      if (link.labelId === selectedLabel.id && link.tenantId === selectedLabel.tenantId && permittedIds.has(link.assetId)) {
        seed.assetLabels.splice(index, 1);
      }
    }
    const removed = before - seed.assetLabels.length;
    addAudit(session.userId, selectedLabel.tenantId, 'label.unassign', `Label "${selectedLabel.name}" removed from ${removed} assets`);
    setNotice(`Removed "${selectedLabel.name}" from ${removed} asset${removed === 1 ? '' : 's'}.`);
    setSelectedAssetIds([]);
    setRevision(value => value + 1);
  };

  const confirmDeleteLabel = (label: Label) => {
    if (!session || phase === 'day_one' || !can(session, 'label.manage')) {
      setNotice('You cannot delete labels.');
      return;
    }
    if (!session.isKasper && label.tenantId !== session.tenantId) {
      setNotice('You cannot delete another tenant’s label.');
      return;
    }
    const assigned = seed.assetLabels.filter(link => link.labelId === label.id && link.tenantId === label.tenantId);
    for (let index = seed.assetLabels.length - 1; index >= 0; index -= 1) {
      const link = seed.assetLabels[index];
      if (link.labelId === label.id && link.tenantId === label.tenantId) seed.assetLabels.splice(index, 1);
    }
    const labelIndex = seed.labels.findIndex(item => item.id === label.id && item.tenantId === label.tenantId);
    if (labelIndex >= 0) seed.labels.splice(labelIndex, 1);
    addAudit(session.userId, label.tenantId, 'label.delete', `Label "${label.name}" removed from ${assigned.length} assets`);
    setFilterLabelId(current => current === label.id ? 'all' : current);
    setBulkLabelId(current => current === label.id ? '' : current);
    setDeleteConfirmId(null);
    setNotice(`Removed "${label.name}" from ${assigned.length} assets.`);
    setRevision(value => value + 1);
  };

  if (!session) return null;

  const canManage = phase !== 'day_one' && can(session, 'label.manage');
  const mapCentre = locations.find(item => item.reading)?.reading;

  if (phase === 'day_one') {
    return <div className="space-y-4"><h1 className="text-lg font-semibold text-ink">Labels</h1><EmptyState title="Not available" description="Labels are available in Phase 2." /></div>;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-ink">Labels</h1>
        <p className="mt-1 text-sm text-grey-500">Filter assets by label and update labels for selected assets.</p>
      </header>

      {notice && <p role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-grey-700">{notice}</p>}

      {session.isKasper && (
        <label className="block max-w-sm text-xs font-medium text-grey-500">
          Tenant
          <select value={selectedTenantId} onChange={event => { setTenantScope(event.target.value); setBulkLabelId(''); setFilterLabelId('all'); setSelectedAssetIds([]); }} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">
            {scopeTenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
          </select>
        </label>
      )}

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-xs font-medium text-grey-500">
            Filter map and list
            <select value={filterLabelId} onChange={event => setFilterLabelId(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">
              <option value="all">All assets</option>
              {visibleLabels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}
            </select>
          </label>
          <label className="min-w-[220px] flex-1 text-xs font-medium text-grey-500">
            Bulk label
            <select disabled={!canManage} value={bulkLabelId} onChange={event => setBulkLabelId(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">
              <option value="">Choose a label</option>
              {visibleLabels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={addLabelToSelected} disabled={!canManage || !bulkLabelId || selectedAssetIds.length === 0}>Add label</Button>
            <Button type="button" size="sm" variant="secondary" onClick={removeLabelFromSelected} disabled={!canManage || !bulkLabelId || selectedAssetIds.length === 0}>Remove label</Button>
          </div>
        </div>

        <form className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4" onSubmit={event => { event.preventDefault(); createLabel(); }}>
            <label className="min-w-[220px] flex-1 text-xs font-medium text-grey-500">
              New label
              <input disabled={!canManage} value={labelName} onChange={event => setLabelName(event.target.value)} maxLength={40} placeholder="For example, Project Alpha" className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink" />
            </label>
            <Button type="submit" size="sm" disabled={!canManage || !labelName.trim() || !selectedTenantId}>Create label</Button>
          </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line p-3">
          <h2 className="text-sm font-semibold text-ink">Map · {filteredAssets.length} asset{filteredAssets.length === 1 ? '' : 's'}</h2>
        </div>
        <div className="h-[360px] bg-paper">
          <MapContainer center={mapCentre ? [mapCentre.lat, mapCentre.lng] : [25.2048, 55.2708]} zoom={10} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {locations.filter(item => item.reading).map(({ asset, reading }) => {
              if (!reading) return null;
              return (
                <CircleMarker key={asset.id} center={[reading.lat, reading.lng]} radius={7} pathOptions={{ color: '#141518', fillColor: '#FFC400', fillOpacity: 0.9 }}>
                  <Popup>
                    <strong>{asset.code}</strong><br />
                    {asset.name}<br />
                    {labelIdsForAsset(asset).map(id => visibleLabels.find(label => label.id === id)?.name).filter(Boolean).join(', ') || 'No label'}
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Asset list</h2>
            <p className="mt-0.5 text-xs text-grey-500">{filteredAssets.length} visible</p>
          </div>
          {canManage && (
            <button type="button" className="text-xs text-grey-700 underline" onClick={() => setSelectedAssetIds(selectedAssetIds.length ? [] : managedAssets.map(asset => asset.id))}>
              {selectedAssetIds.length ? 'Clear selection' : 'Select visible assets'}
            </button>
          )}
        </div>
        {filteredAssets.length === 0 ? (
          <EmptyState title="No assets for this label" description="Choose another label filter to see assets." />
        ) : (
          <ul className="divide-y divide-line">
            {filteredAssets.map(asset => {
              const labels = labelIdsForAsset(asset).map(id => visibleLabels.find(label => label.id === id)).filter((label): label is Label => Boolean(label));
              const reading = locations.find(item => item.asset.id === asset.id)?.reading;
              const selectable = canManage && (session.isKasper || asset.ownerTenantId === session.tenantId);
              return (
                <li key={asset.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  {selectable && <input aria-label={`Select ${asset.code}`} type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAsset(asset.id)} className="accent-ink" />}
                  <div className="min-w-[130px] flex-1">
                    <div className="text-sm font-medium text-ink"><span className="font-mono">{asset.code}</span> — {asset.name}</div>
                    <div className="mt-0.5 text-xs text-grey-500">{seed.sites.find(site => site.id === asset.homeSiteId)?.name ?? 'No site'} · {reading ? clock.formatDubaiDateTime(new Date(reading.deviceTime).getTime()) : 'No position'}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {labels.length ? labels.map(label => <Badge key={label.id} variant="yellow">{label.name}</Badge>) : <span className="text-xs text-grey-500">No labels</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Labels</h2>
        {visibleLabels.length === 0 ? (
          <EmptyState title="No labels yet" description="Create a label to group assets you can manage." />
        ) : (
          <div className="space-y-2">
            {visibleLabels.map(label => {
              const assetCount = seed.assetLabels.filter(link => link.labelId === label.id && link.tenantId === label.tenantId).length;
              const confirming = deleteConfirmId === label.id;
              return (
                <article key={label.id} className="rounded-lg border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium text-ink">{label.name}</h3>
                      <p className="mt-0.5 text-xs text-grey-500">{assetCount} asset{assetCount === 1 ? '' : 's'}</p>
                    </div>
                    <Button type="button" size="sm" variant="ghost" disabled={!canManage} onClick={() => setDeleteConfirmId(confirming ? null : label.id)} title={canManage ? undefined : 'You do not have permission to delete labels'}>Delete</Button>
                  </div>
                  {confirming && (
                    <div className="mt-3 rounded-lg border border-red/20 bg-red/5 p-3">
                      <p className="text-sm text-ink">Remove &apos;{label.name}&apos; from {assetCount} assets?</p>
                      <div className="mt-2 flex gap-2">
                        <Button type="button" size="sm" variant="danger" disabled={!canManage} onClick={() => confirmDeleteLabel(label)}>Remove label</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
