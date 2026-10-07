import type { AssetLabel, Label } from '@/domain/types';

export const CUSTOMER_LABELS_STORAGE_KEY = 'kasper.customer-labels.v1';
export const MAX_CUSTOMER_LABEL_LENGTH = 40;
export const MAX_LABELS_PER_ASSET = 20;

export interface CustomerLabelState {
  labels: Label[];
  assignments: AssetLabel[];
}

export type LabelOperationResult =
  | { ok: true; state: CustomerLabelState; label: Label }
  | { ok: false; error: string };

function isLabel(value: unknown): value is Label {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Label>;
  return typeof candidate.id === 'string'
    && typeof candidate.tenantId === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.createdBy === 'string'
    && (typeof candidate.createdAt === 'string' || typeof candidate.createdAt === 'number');
}

function isAssetLabel(value: unknown): value is AssetLabel {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AssetLabel>;
  return typeof candidate.labelId === 'string'
    && typeof candidate.assetId === 'string'
    && typeof candidate.tenantId === 'string';
}

export function parseCustomerLabelState(serialized: string | null, fallback: CustomerLabelState): CustomerLabelState {
  if (!serialized) return fallback;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const candidate = parsed as { labels?: unknown; assignments?: unknown };
    if (!Array.isArray(candidate.labels) || !Array.isArray(candidate.assignments)) return fallback;
    const labels: Label[] = [];
    const labelIds = new Set<string>();
    const names = new Set<string>();
    for (const value of candidate.labels) {
      if (!isLabel(value)) continue;
      const name = value.name.trim();
      const nameKey = `${value.tenantId}:${name.toLocaleLowerCase()}`;
      if (!name || name.length > MAX_CUSTOMER_LABEL_LENGTH || labelIds.has(value.id) || names.has(nameKey)) continue;
      labelIds.add(value.id);
      names.add(nameKey);
      labels.push({ ...value, name });
    }
    const labelsById = new Map(labels.map(label => [label.id, label]));
    const assignments: AssetLabel[] = [];
    const assignmentKeys = new Set<string>();
    const assetLabelCounts = new Map<string, number>();
    for (const value of candidate.assignments) {
      if (!isAssetLabel(value)) continue;
      const label = labelsById.get(value.labelId);
      if (!label || label.tenantId !== value.tenantId) continue;
      const assignmentKey = `${value.tenantId}:${value.assetId}:${value.labelId}`;
      if (assignmentKeys.has(assignmentKey)) continue;
      const assetKey = `${value.tenantId}:${value.assetId}`;
      const count = assetLabelCounts.get(assetKey) ?? 0;
      if (count >= MAX_LABELS_PER_ASSET) continue;
      assignmentKeys.add(assignmentKey);
      assetLabelCounts.set(assetKey, count + 1);
      assignments.push(value);
    }
    return { labels, assignments };
  } catch {
    return fallback;
  }
}

export function labelsForAsset(state: CustomerLabelState, assetId: string, tenantId: string): Label[] {
  const labelIds = new Set(
    state.assignments
      .filter(a => a.assetId === assetId && a.tenantId === tenantId)
      .map(a => a.labelId),
  );
  return state.labels.filter(label => label.tenantId === tenantId && labelIds.has(label.id));
}

export function labelsForTenant(state: CustomerLabelState, tenantId: string): Label[] {
  return state.labels.filter(label => label.tenantId === tenantId);
}

export function addLabelToAssets(state: CustomerLabelState, input: {
  tenantId: string;
  assetIds: string[];
  name: string;
  createdBy: string;
  createdAt: string | number | Date;
  newLabelId: string;
}): LabelOperationResult {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Enter a label name.' };
  if (name.length > MAX_CUSTOMER_LABEL_LENGTH) {
    return { ok: false, error: `Label names must be ${MAX_CUSTOMER_LABEL_LENGTH} characters or fewer.` };
  }
  if (input.assetIds.length === 0) return { ok: false, error: 'Select at least one asset.' };

  const existing = state.labels.find(label =>
    label.tenantId === input.tenantId && label.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  const label = existing ?? {
    id: input.newLabelId,
    tenantId: input.tenantId,
    name,
    createdBy: input.createdBy,
    createdAt: input.createdAt instanceof Date ? input.createdAt.getTime() : input.createdAt,
  };
  const uniqueAssetIds = [...new Set(input.assetIds)];
  for (const assetId of uniqueAssetIds) {
    const attachedIds = new Set(state.assignments
      .filter(a => a.assetId === assetId && a.tenantId === input.tenantId)
      .map(a => a.labelId));
    if (!attachedIds.has(label.id) && attachedIds.size >= MAX_LABELS_PER_ASSET) {
      return { ok: false, error: `${assetId} already has ${MAX_LABELS_PER_ASSET} labels.` };
    }
  }

  const assignments = [...state.assignments];
  for (const assetId of uniqueAssetIds) {
    if (!assignments.some(a => a.assetId === assetId && a.tenantId === input.tenantId && a.labelId === label.id)) {
      assignments.push({ assetId, tenantId: input.tenantId, labelId: label.id });
    }
  }
  const nextState = {
    labels: existing ? state.labels : [...state.labels, label],
    assignments,
  };
  return { ok: true, state: nextState, label };
}

export function removeLabelFromAssets(state: CustomerLabelState, input: {
  tenantId: string;
  assetIds: string[];
  labelId: string;
}): { ok: true; state: CustomerLabelState } | { ok: false; error: string } {
  const label = state.labels.find(item => item.id === input.labelId && item.tenantId === input.tenantId);
  if (!label) return { ok: false, error: 'Label not found.' };
  if (input.assetIds.length === 0) return { ok: false, error: 'Select at least one asset.' };
  const assetIds = new Set(input.assetIds);
  return {
    ok: true,
    state: {
      labels: state.labels,
      assignments: state.assignments.filter(a =>
        !(a.tenantId === input.tenantId && a.labelId === input.labelId && assetIds.has(a.assetId)),
      ),
    },
  };
}
