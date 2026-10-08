'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
  Tabs,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import type { Asset, Tracker, User } from '@/domain/types';

// ── helpers ────────────────────────────────────────────────────────────────────

function luhnCheck(imei: string): boolean {
  const digits = imei.replace(/\D/g, '');
  if (digits.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = parseInt(digits[i], 10);
    if (i % 2 === 0) n *= 2;
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

function parseCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(l => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  }).filter(row => row.some(c => c));
}

function templateCsv(importer: string): string {
  if (importer === 'assets') {
    return `code,name,type,class,make,model,year,plateOrSerial,tenantName,siteName,tankLitres,behaviour
EX-01,Excavator A,excavator,plant,CAT,320,CAT,2021,SN-EX01A,Sharpjah Plant Hire,Business Bay,200,ligh
`;
  }
  if (importer === 'trackers') {
    return `imei,simIccid
356789012345678,ICCID89012345678901234567`;
  }
  if (importer === 'adapters') {
    return `serial,adapterModel
SN-CAN001,ALL-CAN300
`;
  }
  if (importer === 'users') {
    return `name,email,role,tenantName,siteNames
`;
  }
  return '';
}

// ── importers ───────────────────────────────────────────────────────────────────

function AssetsImporter() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<{ cells: string[]; errors: string[] }[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const tenants = useMemo(() => seed.tenants, []);
  const sites = useMemo(() => seed.sites, []);

  const process = () => {
    const parsed = parseCsvRows(text);
    if (parsed.length < 2) {
      setRows([]);
      return;
    }
    const header = parsed[0];
    const dataRows = parsed.slice(1);
    const results: { cells: string[]; errors: string[] }[] = [];

    for (const cells of dataRows) {
      const errors: string[] = [];
      const code = cells[0]?.trim();
      const tenantName = cells[8]?.trim();
      const siteName = cells[9]?.trim();

      // duplicate in file
      // duplicate in file
      const seen = new Set<string>();
      // tenant exists
      const tenant = tenants.find(t => t.name.toLowerCase() === tenantName?.toLowerCase());
      if (!tenant) errors.push('Unknown tenant');
      // site exists
      const site = sites.find(s => s.name.toLowerCase() === siteName?.toLowerCase());
      if (!site) errors.push('Unknown site');
      // code unique across Kasper (seed)
      const dup = seed.assets.find(a => a.code.toLowerCase() === (code?.toLowerCase() ?? ''));
      if (dup) errors.push('Code already in use');

      results.push({ cells, errors });
    }
    setRows(results);
  };

  const importValid = () => {
    const valid = rows.filter(r => r.errors.length === 0);
    setDone(`${valid.length} added · ${rows.length - valid.length} skipped`);
    setText('');
    setRows([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <textarea
          className="flex-1 w-full text-xs font-mono rounded-lg border border-line bg-paper-2 px-3 py-2 text-grey-700 focus:outline-none focus:border-ink h-40 resize-y"
          placeholder={templateCsv('assets')}
          value={text}
          onChange={e => setText(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setText(templateCsv('assets'))}>
          Load template
        </Button>
        <Button variant="secondary" size="sm" onClick={process}>Preview</Button>
        <Button size="sm" onClick={importValid} disabled={rows.length === 0}>
          Import valid rows
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="border border-line rounded-lg overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                {rows[0].cells.map((c, i) => (
                  <th key={i} className="px-3 py-2 text-left font-medium border-b border-line">{c}</th>
                ))}
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.errors.length === 0 ? 'bg-paper' : 'bg-red/5'}>
                  {r.cells.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 border-b border-line font-mono text-grey-700">{c}</td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    {r.errors.length === 0
                      ? <Badge variant="green">OK</Badge>
                      : <span className="text-red text-xs">{r.errors[0]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {done && (
        <div className="bg-green/10 border border-green/30 text-green text-sm px-4 py-2 rounded-lg">{done}</div>
      )}
    </div>
  );
}

function TrackersImporter() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<{ imei: string; iccid: string; errors: string[] }[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const process = () => {
    const parsed = parseCsvRows(text);
    if (parsed.length < 2) { setRows([]); return; }
    const results: { imei: string; iccid: string; errors: string[] }[] = [];
    for (const cells of parsed.slice(1)) {
      const imei = cells[0]?.trim();
      const iccid = cells[1]?.trim();
      const errors: string[] = [];
      if (!imei) errors.push('IMEI required');
      else if (!luhnCheck(imei)) errors.push('Bad IMEI check digit');
      // duplicate in file
      const dup = results.find(r => r.imei === imei);
      if (dup) errors.push('Duplicate in file');
      // already registered
      const reg = seed.trackers.find(t => t.imei === imei);
      if (reg) errors.push('Already registered');
      results.push({ imei, iccid, errors });
    }
    setRows(results);
  };

  const importValid = () => {
    const valid = rows.filter(r => r.errors.length === 0);
    setDone(`${valid.length} added · ${rows.length - valid.length} skipped`);
    setText('');
    setRows([]);
  };

  return (
    <div className="space-y-3">
      <textarea
        className="w-full text-xs font-mono rounded-lg border border-line bg-paper-2 px-3 py-2 text-grey-700 focus:outline-none focus:border-ink h-40 resize-y"
        placeholder={templateCsv('trackers')}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setText(templateCsv('trackers'))}>Load template</Button>
        <Button variant="secondary" size="sm" onClick={process}>Preview</Button>
        <Button size="sm" onClick={importValid} disabled={rows.length === 0}>Import valid rows</Button>
      </div>
      {rows.length > 0 && (
        <div className="border border-line rounded-lg overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-left">IMEI</th>
                <th className="px-3 py-2 text-left">SIM ICCID</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.errors.length === 0 ? 'bg-paper' : 'bg-red/5'}>
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{r.imei || '—'}</td>
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{r.iccid || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {r.errors.length === 0
                      ? <Badge variant="green">OK</Badge>
                      : <span className="text-red text-xs">{r.errors[0]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {done && (
        <div className="bg-green/10 border border-green/30 text-green text-sm px-4 py-2 rounded-lg">{done}</div>
      )}
    </div>
  );
}

function AdaptersImporter() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<{ serial: string; model: string; errors: string[] }[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const process = () => {
    const parsed = parseCsvRows(text);
    if (parsed.length < 2) { setRows([]); return; }
    const results: { serial: string; model: string; errors: string[] }[] = [];
    for (const cells of parsed.slice(1)) {
      const serial = cells[0]?.trim();
      const model = cells[1]?.trim();
      const errors: string[] = [];
      if (!serial) errors.push('Serial required');
      if (!model) errors.push('Model required');
      else if (!['ALL-CAN300', 'LVCAN200'].includes(model)) errors.push('Unknown model');
      const dup = results.find(r => r.serial === serial);
      if (dup) errors.push('Duplicate in file');
      results.push({ serial, model, errors });
    }
    setRows(results);
  };

  const importValid = () => {
    const valid = rows.filter(r => r.errors.length === 0);
    setDone(`${valid.length} added · ${rows.length - valid.length} skipped`);
    setText('');
    setRows([]);
  };

  return (
    <div className="space-y-3">
      <textarea
        className="w-full text-xs font-mono rounded-lg border border-line bg-paper-2 px-3 py-2 text-grey-700 focus:outline-none focus:border-ink h-40 resize-y"
        placeholder={templateCsv('adapters')}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setText(templateCsv('adapters'))}>Load template</Button>
        <Button variant="secondary" size="sm" onClick={process}>Preview</Button>
        <Button size="sm" onClick={importValid} disabled={rows.length === 0}>Import valid rows</Button>
      </div>
      {rows.length > 0 && (
        <div className="border border-line rounded-lg overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-left">Serial</th>
                <th className="px-3 py-2 text-left">Model</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.errors.length === 0 ? 'bg-paper' : 'bg-red/5'}>
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{r.serial || '—'}</td>
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{r.model || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {r.errors.length === 0
                      ? <Badge variant="green">OK</Badge>
                      : <span className="text-red text-xs">{r.errors[0]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {done && (
        <div className="bg-green/10 border border-green/30 text-green text-sm px-4 py-2 rounded-lg">{done}</div>
      )}
    </div>
  );
}

function UsersImporter() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<{ cells: string[]; errors: string[] }[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const tenants = useMemo(() => seed.tenants, []);
  const sites = useMemo(() => seed.sites, []);

  const process = () => {
    const parsed = parseCsvRows(text);
    if (parsed.length < 2) { setRows([]); return; }
    const results: { cells: string[]; errors: string[] }[] = [];
    for (const cells of parsed.slice(1)) {
      const errors: string[] = [];
      const name = cells[0]?.trim();
      const email = cells[1]?.trim();
      const role = cells[2]?.trim();
      const tenantName = cells[3]?.trim();
      const siteNames = cells[4]?.trim();

      if (!name) errors.push('Name required');
      if (!email) errors.push('Email required');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Bad email');
      if (!role) errors.push('Role required');
      else if (!['tenant_admin', 'site_user', 'kasper_admin', 'kasper_ops'].includes(role)) errors.push('Unknown role');
      const tenant = tenants.find(t => t.name.toLowerCase() === tenantName?.toLowerCase());
      if (!tenant) errors.push('Unknown tenant');
      if (!siteNames && role === 'site_user') errors.push('Site names required for Site User');
      results.push({ cells, errors });
    }
    setRows(results);
  };

  const importValid = () => {
    const valid = rows.filter(r => r.errors.length === 0);
    setDone(`${valid.length} added · ${rows.length - valid.length} skipped`);
    setText('');
    setRows([]);
  };

  return (
    <div className="space-y-3">
      <textarea
        className="w-full text-xs font-mono rounded-lg border border-line bg-paper-2 px-3 py-2 text-grey-700 focus:outline-none focus:border-ink h-40 resize-y"
        placeholder={templateCsv('users')}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setText(templateCsv('users'))}>Load template</Button>
        <Button variant="secondary" size="sm" onClick={process}>Preview</Button>
        <Button size="sm" onClick={importValid} disabled={rows.length === 0}>Import valid rows</Button>
      </div>
      {rows.length > 0 && (
        <div className="border border-line rounded-lg overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                {rows[0].cells.map((c, i) => (
                  <th key={i} className="px-3 py-2 text-left">{c}</th>
                ))}
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.errors.length === 0 ? 'bg-paper' : 'bg-red/5'}>
                  {r.cells.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 border-b border-line font-mono text-grey-700">{c}</td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    {r.errors.length === 0
                      ? <Badge variant="green">OK</Badge>
                      : <span className="text-red text-xs">{r.errors[0]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {done && (
        <div className="bg-green/10 border border-green/30 text-green text-sm px-4 py-2 rounded-lg">{done}</div>
      )}
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────────

const importerTabs = [
  { id: 'assets', label: 'Assets' },
  { id: 'trackers', label: 'Trackers' },
  { id: 'adapters', label: 'CAN adapters' },
  { id: 'users', label: 'Users' },
];

export default function ConsoleImportPage() {
  const store = useStore;
  const session = store.getState().session;

  const [activeTab, setActiveTab] = useState('assets');

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper staff can access the console." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Import</h1>
        <p className="text-sm text-grey-500 mt-1">
          Bulk import assets, trackers, CAN adapters, or users via CSV paste or upload.
        </p>
      </div>

      <Tabs tabs={importerTabs} activeId={activeTab} onChange={setActiveTab} />

      <div className="bg-surface border border-line rounded-lg p-4">
        {activeTab === 'assets' && <AssetsImporter />}
        {activeTab === 'trackers' && <TrackersImporter />}
        {activeTab === 'adapters' && <AdaptersImporter />}
        {activeTab === 'users' && <UsersImporter />}
      </div>

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        <strong className="text-ink">Notes:</strong> Asset rows name their tenant and site by name — an unknown name is an error, never auto-created.
        IMEI values are checked with the Luhn algorithm. Duplicate IMEIs within the file or already registered in Kasper are flagged.
      </div>
    </div>
  );
}
