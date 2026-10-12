'use client';

// The label chips under an asset's header (spec §11.11): chips for the company's
// labels, and "+ Label" for managers. Removing a chip takes the label off this
// asset only.

import React, { useState } from 'react';
import { LabelCombobox } from './LabelCombobox';

export function AssetLabels({
  labels,
  options,
  canEdit,
  onAdd,
  onRemove,
  addLabel = '+ Label',
  removeText = 'Remove',
}: {
  labels: { id: string; name: string }[];
  options: { id: string; name: string }[];
  canEdit: boolean;
  onAdd: (choice: { labelId: string } | { name: string }) => string | null;
  onRemove: (labelId: string) => string | null;
  addLabel?: string;
  removeText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (labels.length === 0 && !canEdit) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2" aria-label="Labels">
      {labels.map(l => (
        <span key={l.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-line bg-paper text-[11px] text-grey-700">
          {l.name}
          {canEdit && (
            <button
              type="button"
              aria-label={`${removeText} ${l.name}`}
              onClick={() => setError(onRemove(l.id))}
              className="text-grey-500 hover:text-red leading-none"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {canEdit && !open && (
        <button type="button" onClick={() => setOpen(true)} className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-grey-500 text-grey-700 hover:border-ink">
          {addLabel}
        </button>
      )}
      {canEdit && open && (
        <LabelCombobox
          options={options}
          exclude={labels.map(l => l.id)}
          buttonLabel={addLabel}
          onChoose={choice => {
            setError(onAdd(choice));
            setOpen(false);
          }}
        />
      )}
      {error && <span role="alert" className="text-[11px] text-red w-full">{error}</span>}
    </div>
  );
}
