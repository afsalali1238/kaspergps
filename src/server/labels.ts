// Labels (spec §11.11, H4.3). A label belongs to the company that created it.
// Owners (Tenant Admin, Site User) see their own labels on their own assets;
// Kasper sees every company's. A renter never sees the owner's labels.

import type { Asset, AssetLabel, Label, Session } from '@/domain/types';
import { db, append, removeWhere, touch } from '@/server/db';
import { fail, ok, type OpResult } from '@/server/result';
import { recordAuditForSession } from '@/server/audit';
import { can } from '@/server/capabilities';
import { isAssetVisible } from '@/server/access';
import * as clock from '@/lib/clock';

export const LABEL_MAX_CHARS = 40;
export const LABELS_PER_ASSET_MAX = 20;

/** Assets whose labels this session may see: its company's own assets (Kasper: all). */
function ownsAsset(session: Session, asset: Asset): boolean {
  return session.isKasper || asset.ownerTenantId === session.tenantId;
}

/** The labels on one asset, as this session may see them. Renters see none. */
export function labelsOnAsset(session: Session, assetId: string): Label[] {
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset || !isAssetVisible(session, assetId) || !ownsAsset(session, asset)) return [];
  const ids = new Set(db.getState().assetLabels.filter(al => al.assetId === assetId).map(al => al.labelId));
  return db.getState().labels.filter(l => ids.has(l.id));
}

/** Label ids per visible asset, for the list column and the label filter. */
export function labelIdsByAsset(session: Session): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const al of db.getState().assetLabels) {
    if (!isAssetVisible(session, al.assetId)) continue;
    const asset = db.getState().assets.find(a => a.id === al.assetId);
    if (!asset || !ownsAsset(session, asset)) continue;
    out.set(al.assetId, [...(out.get(al.assetId) ?? []), al.labelId]);
  }
  return out;
}

/** Every label this session may manage or filter by: its company's labels (Kasper: all). */
export function labelsVisibleTo(session: Session): Label[] {
  return db.getState().labels.filter(l => session.isKasper || l.tenantId === session.tenantId);
}

/** How many assets carry a label. Used on the Labels tab and in the delete prompt. */
export function labelUsage(session: Session, labelId: string): number {
  if (!labelsVisibleTo(session).some(l => l.id === labelId)) return 0;
  return db.getState().assetLabels.filter(al => al.labelId === labelId).length;
}

function validName(raw: string): { name: string } | { error: string } {
  const name = raw.trim();
  if (!name) return { error: 'Enter a label name.' };
  if (name.length > LABEL_MAX_CHARS) return { error: `Labels are ${LABEL_MAX_CHARS} characters or fewer.` };
  return { name };
}

function nameTaken(tenantId: string, name: string, exceptId?: string): boolean {
  const wanted = name.toLowerCase();
  return db.getState().labels.some(l => l.tenantId === tenantId && l.id !== exceptId && l.name.toLowerCase() === wanted);
}

/** Assets the session may label, all from one company (Kasper must pick one company at a time). */
function labelableAssets(session: Session, assetIds: string[]): { tenantId: string } | { error: string } {
  if (!can(session, 'label.manage')) return { error: 'Your role can’t change labels.' };
  if (assetIds.length === 0) return { error: 'Pick at least one asset.' };
  const assets = assetIds.map(id => db.getState().assets.find(a => a.id === id));
  if (assets.some(a => !a || !isAssetVisible(session, a.id) || !ownsAsset(session, a))) {
    return { error: 'Only your company’s assets can be labelled.' };
  }
  const owners = new Set(assets.map(a => a!.ownerTenantId));
  if (owners.size > 1) return { error: 'Pick assets from one company at a time.' };
  return { tenantId: [...owners][0] };
}

/**
 * Add a label to assets, creating the label first if it is new. Returns how many
 * assets now carry it.
 */
export function addLabelToAssets(
  session: Session,
  target: { labelId: string } | { name: string },
  assetIds: string[],
): OpResult<number> {
  const scope = labelableAssets(session, assetIds);
  if ('error' in scope) return fail(scope.error);
  const tenantId = scope.tenantId;

  let label: Label | undefined;
  if ('labelId' in target) {
    label = db.getState().labels.find(l => l.id === target.labelId && l.tenantId === tenantId);
    if (!label) return fail('That label isn’t available for these assets.');
  } else {
    const checked = validName(target.name);
    if ('error' in checked) return fail(checked.error);
    label = db.getState().labels.find(l => l.tenantId === tenantId && l.name.toLowerCase() === checked.name.toLowerCase());
    if (!label) {
      // A counter, not the clock: two labels made in one millisecond must not share an id.
      const next = db.getState().labels.reduce((max, l) => Math.max(max, Number(l.id.split('-').pop()) || 0), 0) + 1;
      label = {
        id: `l-${tenantId}-${next}`,
        tenantId,
        name: checked.name,
        createdBy: session.userId,
        createdAt: new Date(clock.now()).toISOString(),
      };
      append('labels', label);
    }
  }

  let added = 0;
  for (const assetId of assetIds) {
    const already = db.getState().assetLabels.some(al => al.assetId === assetId && al.labelId === label!.id);
    if (already) continue;
    const count = db.getState().assetLabels.filter(al => al.assetId === assetId && al.tenantId === tenantId).length;
    if (count >= LABELS_PER_ASSET_MAX) {
      const code = db.getState().assets.find(a => a.id === assetId)?.code ?? assetId;
      return fail(`${code} already has ${LABELS_PER_ASSET_MAX} labels.`);
    }
    const row: AssetLabel = { labelId: label.id, assetId, tenantId };
    append('assetLabels', row);
    added += 1;
  }
  recordAuditForSession(session, { action: 'label.apply', tenantId, detail: `“${label.name}” added to ${added} asset${added === 1 ? '' : 's'}` });
  return ok(added, added === 0 ? `Already labelled “${label.name}”.` : `“${label.name}” added to ${added} asset${added === 1 ? '' : 's'}.`);
}

/** Remove a label from assets. */
export function removeLabelFromAssets(session: Session, labelId: string, assetIds: string[]): OpResult<number> {
  const label = db.getState().labels.find(l => l.id === labelId);
  if (!label) return fail('Label not found.');
  const scope = labelableAssets(session, assetIds);
  if ('error' in scope) return fail(scope.error);
  if (scope.tenantId !== label.tenantId) return fail('That label belongs to another company.');
  const removed = removeWhere('assetLabels', al => al.labelId === labelId && assetIds.includes(al.assetId));
  recordAuditForSession(session, { action: 'label.remove', tenantId: label.tenantId, detail: `“${label.name}” removed from ${removed} asset${removed === 1 ? '' : 's'}` });
  return ok(removed, `“${label.name}” removed from ${removed} asset${removed === 1 ? '' : 's'}.`);
}

/** Rename a label. The name stays unique per company. */
export function renameLabel(session: Session, labelId: string, raw: string): OpResult<Label> {
  if (!can(session, 'label.manage')) return fail('Your role can’t change labels.');
  const label = labelsVisibleTo(session).find(l => l.id === labelId);
  if (!label) return fail('Label not found.');
  const checked = validName(raw);
  if ('error' in checked) return fail(checked.error);
  if (nameTaken(label.tenantId, checked.name, label.id)) return fail('A label with this name already exists.');
  const from = label.name;
  label.name = checked.name;
  touch('labels');
  recordAuditForSession(session, { action: 'label.rename', tenantId: label.tenantId, detail: `Label “${from}” renamed to “${label.name}”` });
  return ok(label, `Renamed to “${label.name}”.`);
}

/** Delete a label and take it off every asset. The screen asks first (§11.11). */
export function deleteLabel(session: Session, labelId: string): OpResult<number> {
  if (!can(session, 'label.manage')) return fail('Your role can’t change labels.');
  const label = labelsVisibleTo(session).find(l => l.id === labelId);
  if (!label) return fail('Label not found.');
  const assets = removeWhere('assetLabels', al => al.labelId === labelId);
  removeWhere('labels', l => l.id === labelId);
  recordAuditForSession(session, { action: 'label.delete', tenantId: label.tenantId, detail: `Label “${label.name}” deleted from ${assets} asset${assets === 1 ? '' : 's'}` });
  return ok(assets, `“${label.name}” deleted.`);
}
