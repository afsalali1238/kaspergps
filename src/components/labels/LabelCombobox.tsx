'use client';

// Pick an existing label or create one (spec §11.11). Typing filters the
// company's labels; a name that matches none offers to create it.

import React, { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui';

export const LABEL_NAME_MAX = 40;

export type LabelChoice = { labelId: string } | { name: string };

export function LabelCombobox({
  options,
  onChoose,
  buttonLabel = 'Add label',
  placeholder = 'Label name',
  exclude = [],
}: {
  options: { id: string; name: string }[];
  onChoose: (choice: LabelChoice) => void;
  buttonLabel?: string;
  placeholder?: string;
  /** Label ids to leave out of the suggestions (already applied). */
  exclude?: string[];
}) {
  const [text, setText] = useState('');
  const listId = useId();
  const trimmed = text.trim();

  const matches = useMemo(() => {
    const q = trimmed.toLowerCase();
    return options.filter(o => !exclude.includes(o.id) && (!q || o.name.toLowerCase().includes(q)));
  }, [options, exclude, trimmed]);

  const exact = options.find(o => o.name.toLowerCase() === trimmed.toLowerCase());
  const canCreate = trimmed.length > 0 && !exact;

  const choose = (choice: LabelChoice) => {
    onChoose(choice);
    setText('');
  };

  return (
    <div className="inline-flex flex-col gap-1 relative">
      <div className="flex items-center gap-1">
        <input
          type="text"
          role="combobox"
          aria-expanded={matches.length > 0 || canCreate}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={buttonLabel}
          value={text}
          maxLength={LABEL_NAME_MAX}
          placeholder={placeholder}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && trimmed) {
              e.preventDefault();
              if (exact) choose({ labelId: exact.id });
              else choose({ name: trimmed });
            }
          }}
          className="px-2 py-1 text-xs rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink w-44"
        />
        <Button size="sm" variant="secondary" disabled={!trimmed} onClick={() => (exact ? choose({ labelId: exact.id }) : choose({ name: trimmed }))}>
          {buttonLabel}
        </Button>
      </div>
      {(matches.length > 0 || canCreate) && (
        <ul id={listId} role="listbox" aria-label="Labels" className="absolute top-full mt-1 z-10 w-56 max-h-48 overflow-y-auto bg-surface border border-line rounded-lg shadow-md">
          {matches.map(o => (
            <li key={o.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => choose({ labelId: o.id })} className="w-full text-left px-3 py-1.5 text-xs text-grey-700 hover:bg-paper-2">
                {o.name}
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={false}>
              <button type="button" onClick={() => choose({ name: trimmed })} className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-paper-2 border-t border-line">
                Create “{trimmed}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
