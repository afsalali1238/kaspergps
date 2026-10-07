import { describe, expect, it } from 'vitest';
import type { CustomerLabelState } from '@/domain/customer-labels';
import {
  addLabelToAssets, labelsForAsset, parseCustomerLabelState, removeLabelFromAssets,
} from '@/domain/customer-labels';

const initial: CustomerLabelState = {
  labels: [{ id: 'l-one', tenantId: 't-one', name: 'Urgent', createdBy: 'u-one', createdAt: 1 }],
  assignments: [{ labelId: 'l-one', assetId: 'a-one', tenantId: 't-one' }],
};

function add(name: string, assetIds: string[] = ['a-two']) {
  return addLabelToAssets(initial, {
    tenantId: 't-one', assetIds, name, createdBy: 'u-one', createdAt: 2, newLabelId: 'l-new',
  });
}

describe('customer labels', () => {
  it('reads only labels assigned to the asset in its tenant', () => {
    expect(labelsForAsset(initial, 'a-one', 't-one').map(label => label.name)).toEqual(['Urgent']);
    expect(labelsForAsset(initial, 'a-one', 't-two')).toEqual([]);
  });

  it('reuses a case-insensitive tenant label and creates a new assignment', () => {
    const result = add('urgent');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.label.id).toBe('l-one');
    expect(result.state.labels).toHaveLength(1);
    expect(labelsForAsset(result.state, 'a-two', 't-one')).toEqual([initial.labels[0]]);
  });

  it('creates a unique label and enforces the 40 character limit', () => {
    const result = add('Ready for work');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.labels.at(-1)?.name).toBe('Ready for work');
    expect(add('x'.repeat(41)).ok).toBe(false);
  });

  it('removes only the selected assignment and tenant', () => {
    const result = removeLabelFromAssets(initial, { tenantId: 't-one', assetIds: ['a-one'], labelId: 'l-one' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(labelsForAsset(result.state, 'a-one', 't-one')).toEqual([]);
  });

  it('enforces the 20-label limit for each asset', () => {
    const labels = Array.from({ length: 20 }, (_, index) => ({
      id: `l-${index}`, tenantId: 't-one', name: `Label ${index}`, createdBy: 'u-one', createdAt: 1,
    }));
    const fullState: CustomerLabelState = {
      labels,
      assignments: labels.map(label => ({ labelId: label.id, assetId: 'a-full', tenantId: 't-one' })),
    };
    const result = addLabelToAssets(fullState, {
      tenantId: 't-one', assetIds: ['a-full'], name: 'Extra', createdBy: 'u-one', createdAt: 2, newLabelId: 'l-extra',
    });
    expect(result.ok).toBe(false);
  });

  it('drops invalid, duplicate and cross-tenant records from stored state', () => {
    const serialized = JSON.stringify({
      labels: [
        initial.labels[0],
        { ...initial.labels[0], id: 'l-duplicate', name: ' urgent ' },
        { ...initial.labels[0], id: 'l-long', name: 'x'.repeat(41) },
      ],
      assignments: [
        initial.assignments[0],
        initial.assignments[0],
        { labelId: 'l-one', assetId: 'a-other', tenantId: 't-two' },
      ],
    });
    const parsed = parseCustomerLabelState(serialized, initial);
    expect(parsed.labels.map(label => label.name)).toEqual(['Urgent']);
    expect(parsed.assignments).toHaveLength(1);
  });

  it('falls back safely when stored state is invalid', () => {
    expect(parseCustomerLabelState('{broken', initial)).toBe(initial);
  });
});
