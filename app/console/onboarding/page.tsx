'use client';

import React, { useState } from 'react';
import {
  Button,
} from '@/components/ui';
import { useSession } from '@/hooks';

const STEPS = [
  { id: 1, title: 'Company', description: 'Name, type, licence no.' },
  { id: 2, title: 'Sites', description: 'Add one or more on the map.' },
  { id: 3, title: 'People', description: 'First admin + optional more users.' },
  { id: 4, title: 'Assets', description: 'Add assets one by one or paste CSV.' },
  { id: 5, title: 'Hardware', description: 'Trackers and CAN adapters.' },
  { id: 6, title: 'Review', description: 'Summary of everything.' },
];

export default function OnboardingPage() {
  const session = useSession();

  const [currentStep, setCurrentStep] = useState(1);
  const [draft, setDraft] = useState({
    company: { name: '', type: 'client', licenceNo: '' },
    sites: [] as { name: string; lat: number; lng: number; radius: number }[],
    people: [] as { name: string; email: string; role: string; sites: string[] }[],
    assets: [] as { code: string; name: string; type: string; class: string; make: string; model: string; year: number; plate: string; site: string; behaviour: string }[],
    hardware: { trackers: [] as { imei: string; sim: string }[], adapters: [] as { serial: string; model: string }[] },
  });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <div className="text-sm text-grey-500">Only Kasper staff can access the console.</div>
      </div>
    );
  }

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return draft.company.name && draft.company.type;
      case 2:
        return draft.sites.length > 0;
      case 3:
        return draft.people.length > 0;
      case 4:
        return draft.assets.length > 0;
      case 5:
        return true;
      case 6:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    } else {
      showToast('Company created successfully!');
      setCurrentStep(1);
      setDraft({
        company: { name: '', type: 'client', licenceNo: '' },
        sites: [],
        people: [],
        assets: [],
        hardware: { trackers: [], adapters: [] },
      });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const addSite = () => {
    setDraft(prev => ({
      ...prev,
      sites: [...prev.sites, { name: '', lat: 25.2048, lng: 55.2708, radius: 500 }],
    }));
  };

  const addPerson = () => {
    setDraft(prev => ({
      ...prev,
      people: [...prev.people, { name: '', email: '', role: 'tenant_admin', sites: [] }],
    }));
  };

  const addAsset = () => {
    setDraft(prev => ({
      ...prev,
      assets: [...prev.assets, { code: '', name: '', type: '', class: 'truck', make: '', model: '', year: 2020, plate: '', site: '', behaviour: 'drives_between_sites' }],
    }));
  };

  const addTracker = () => {
    setDraft(prev => ({
      ...prev,
      hardware: {
        ...prev.hardware,
        trackers: [...prev.hardware.trackers, { imei: '', sim: '' }],
      },
    }));
  };

  const addAdapter = () => {
    setDraft(prev => ({
      ...prev,
      hardware: {
        ...prev.hardware,
        adapters: [...prev.hardware.adapters, { serial: '', model: 'ALL-CAN300' }],
      },
    }));
  };

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink mb-4">Onboard a company</h1>
      <p className="text-sm text-grey-500 mb-6">
        A 6-step wizard to create a new tenant with all its data.
      </p>

      {/* Progress */}
      <div className="flex gap-2 mb-6">
        {STEPS.map(step => (
          <div
            key={step.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
              currentStep === step.id
                ? 'bg-yellow/10 border-yellow-dark/40 text-yellow'
                : currentStep > step.id
                ? 'bg-green/10 border-green/30 text-green'
                : 'bg-surface border-line text-grey-500'
            }`}
          >
            <span className="font-mono">{step.id}</span>
            <span>{step.title}</span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-surface border border-line rounded-lg p-4 mb-6">
        {currentStep === 1 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-3">Company</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-grey-500 font-medium">Name</label>
                <input
                  type="text"
                  value={draft.company.name}
                  onChange={e => setDraft(prev => ({ ...prev, company: { ...prev.company, name: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className="text-xs text-grey-500 font-medium">Type</label>
                <select
                  value={draft.company.type}
                  onChange={e => setDraft(prev => ({ ...prev, company: { ...prev.company, type: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                >
                  <option value="vendor">Vendor</option>
                  <option value="client">Client</option>
                  <option value="both">Vendor + Client</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-grey-500 font-medium">Trade licence no. (optional)</label>
                <input
                  type="text"
                  value={draft.company.licenceNo}
                  onChange={e => setDraft(prev => ({ ...prev, company: { ...prev.company, licenceNo: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  placeholder="Licence number"
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-3">Sites</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={addSite}>Add site</Button>
              </div>
              {draft.sites.map((site, index) => (
                <div key={index} className="border border-line rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={site.name}
                      onChange={e => {
                        const newSites = [...draft.sites];
                        newSites[index] = { ...newSites[index], name: e.target.value };
                        setDraft(prev => ({ ...prev, sites: newSites }));
                      }}
                      className="flex-1 px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Site name"
                    />
                    <button onClick={() => {
                      const newSites = [...draft.sites];
                      newSites.splice(index, 1);
                      setDraft(prev => ({ ...prev, sites: newSites }));
                    }} className="text-red text-xs">Remove</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={site.lat}
                      onChange={e => {
                        const newSites = [...draft.sites];
                        newSites[index] = { ...newSites[index], lat: parseFloat(e.target.value) || 0 };
                        setDraft(prev => ({ ...prev, sites: newSites }));
                      }}
                      className="w-full px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Lat"
                    />
                    <input
                      type="number"
                      value={site.lng}
                      onChange={e => {
                        const newSites = [...draft.sites];
                        newSites[index] = { ...newSites[index], lng: parseFloat(e.target.value) || 0 };
                        setDraft(prev => ({ ...prev, sites: newSites }));
                      }}
                      className="w-full px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Lng"
                    />
                    <input
                      type="number"
                      value={site.radius}
                      onChange={e => {
                        const newSites = [...draft.sites];
                        newSites[index] = { ...newSites[index], radius: parseInt(e.target.value) || 500 };
                        setDraft(prev => ({ ...prev, sites: newSites }));
                      }}
                      className="w-full px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Radius (m)"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-3">People</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={addPerson}>Add person</Button>
              </div>
              {draft.people.map((person, index) => (
                <div key={index} className="border border-line rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      type="text"
                      value={person.name}
                      onChange={e => {
                        const newPeople = [...draft.people];
                        newPeople[index] = { ...newPeople[index], name: e.target.value };
                        setDraft(prev => ({ ...prev, people: newPeople }));
                      }}
                      className="px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Name"
                    />
                    <input
                      type="email"
                      value={person.email}
                      onChange={e => {
                        const newPeople = [...draft.people];
                        newPeople[index] = { ...newPeople[index], email: e.target.value };
                        setDraft(prev => ({ ...prev, people: newPeople }));
                      }}
                      className="px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Email"
                    />
                  </div>
                  <select
                    value={person.role}
                    onChange={e => {
                      const newPeople = [...draft.people];
                      newPeople[index] = { ...newPeople[index], role: e.target.value };
                      setDraft(prev => ({ ...prev, people: newPeople }));
                    }}
                    className="w-full px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink mb-2"
                  >
                    <option value="tenant_admin">Tenant Admin</option>
                    <option value="site_user">Site User</option>
                  </select>
                  <div className="text-xs text-grey-500">
                    Sites: {person.sites.join(', ') || 'None'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-3">Assets</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={addAsset}>Add asset</Button>
              </div>
              {draft.assets.map((asset, index) => (
                <div key={index} className="border border-line rounded-lg p-3">
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <input
                      type="text"
                      value={asset.code}
                      onChange={e => {
                        const newAssets = [...draft.assets];
                        newAssets[index] = { ...newAssets[index], code: e.target.value };
                        setDraft(prev => ({ ...prev, assets: newAssets }));
                      }}
                      className="px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Code"
                    />
                    <input
                      type="text"
                      value={asset.name}
                      onChange={e => {
                        const newAssets = [...draft.assets];
                        newAssets[index] = { ...newAssets[index], name: e.target.value };
                        setDraft(prev => ({ ...prev, assets: newAssets }));
                      }}
                      className="px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Name"
                    />
                    <button onClick={() => {
                      const newAssets = [...draft.assets];
                      newAssets.splice(index, 1);
                      setDraft(prev => ({ ...prev, assets: newAssets }));
                    }} className="text-red text-xs">Remove</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <input
                      type="text"
                      value={asset.type}
                      onChange={e => {
                        const newAssets = [...draft.assets];
                        newAssets[index] = { ...newAssets[index], type: e.target.value };
                        setDraft(prev => ({ ...prev, assets: newAssets }));
                      }}
                      className="px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Type"
                    />
                    <select
                      value={asset.class}
                      onChange={e => {
                        const newAssets = [...draft.assets];
                        newAssets[index] = { ...newAssets[index], class: e.target.value };
                        setDraft(prev => ({ ...prev, assets: newAssets }));
                      }}
                      className="px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    >
                      <option value="truck">Truck</option>
                      <option value="light_vehicle">Light vehicle</option>
                      <option value="plant">Plant</option>
                      <option value="lifting">Lifting</option>
                      <option value="power">Power</option>
                    </select>
                    <input
                      type="text"
                      value={asset.behaviour}
                      onChange={e => {
                        const newAssets = [...draft.assets];
                        newAssets[index] = { ...newAssets[index], behaviour: e.target.value };
                        setDraft(prev => ({ ...prev, assets: newAssets }));
                      }}
                      className="px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      placeholder="Behaviour"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-3">Hardware</h2>
            <div className="space-y-3">
              <div className="border border-line rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-ink">Trackers</h3>
                  <Button variant="secondary" size="sm" onClick={addTracker}>Add tracker</Button>
                </div>
                {draft.hardware.trackers.map((tracker, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={tracker.imei}
                      onChange={e => {
                        const newTrackers = [...draft.hardware.trackers];
                        newTrackers[index] = { ...newTrackers[index], imei: e.target.value };
                        setDraft(prev => ({ ...prev, hardware: { ...prev.hardware, trackers: newTrackers } }));
                      }}
                      className="w-1/2 px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink font-mono"
                      placeholder="IMEI"
                    />
                    <input
                      type="text"
                      value={tracker.sim}
                      onChange={e => {
                        const newTrackers = [...draft.hardware.trackers];
                        newTrackers[index] = { ...newTrackers[index], sim: e.target.value };
                        setDraft(prev => ({ ...prev, hardware: { ...prev.hardware, trackers: newTrackers } }));
                      }}
                      className="w-1/2 px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink font-mono"
                      placeholder="SIM"
                    />
                  </div>
                ))}
              </div>
              <div className="border border-line rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-ink">CAN adapters</h3>
                  <Button variant="secondary" size="sm" onClick={addAdapter}>Add adapter</Button>
                </div>
                {draft.hardware.adapters.map((adapter, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={adapter.serial}
                      onChange={e => {
                        const newAdapters = [...draft.hardware.adapters];
                        newAdapters[index] = { ...newAdapters[index], serial: e.target.value };
                        setDraft(prev => ({ ...prev, hardware: { ...prev.hardware, adapters: newAdapters } }));
                      }}
                      className="w-1/2 px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink font-mono"
                      placeholder="Serial"
                    />
                    <select
                      value={adapter.model}
                      onChange={e => {
                        const newAdapters = [...draft.hardware.adapters];
                        newAdapters[index] = { ...newAdapters[index], model: e.target.value };
                        setDraft(prev => ({ ...prev, hardware: { ...prev.hardware, adapters: newAdapters } }));
                      }}
                      className="w-1/2 px-2 py-1 text-sm rounded border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    >
                      <option value="LVCAN200">LVCAN200</option>
                      <option value="ALL-CAN300">ALL-CAN300</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentStep === 6 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-3">Review</h2>
            <div className="space-y-3">
              <div className="border border-line rounded-lg p-3">
                <h3 className="text-xs font-medium text-ink mb-1">Company</h3>
                <div className="text-sm text-grey-700">{draft.company.name} ({draft.company.type})</div>
                {draft.company.licenceNo && <div className="text-xs text-grey-500">Licence: {draft.company.licenceNo}</div>}
              </div>
              <div className="border border-line rounded-lg p-3">
                <h3 className="text-xs font-medium text-ink mb-1">Sites ({draft.sites.length})</h3>
                {draft.sites.map((site, index) => (
                  <div key={index} className="text-sm text-grey-700">{site.name}</div>
                ))}
              </div>
              <div className="border border-line rounded-lg p-3">
                <h3 className="text-xs font-medium text-ink mb-1">People ({draft.people.length})</h3>
                {draft.people.map((person, index) => (
                  <div key={index} className="text-sm text-grey-700">{person.name} — {person.role}</div>
                ))}
              </div>
              <div className="border border-line rounded-lg p-3">
                <h3 className="text-xs font-medium text-ink mb-1">Assets ({draft.assets.length})</h3>
                {draft.assets.map((asset, index) => (
                  <div key={index} className="text-sm text-grey-700">{asset.code} — {asset.name}</div>
                ))}
              </div>
              <div className="border border-line rounded-lg p-3">
                <h3 className="text-xs font-medium text-ink mb-1">Hardware</h3>
                <div className="text-sm text-grey-700">Trackers: {draft.hardware.trackers.length}</div>
                <div className="text-sm text-grey-700">Adapters: {draft.hardware.adapters.length}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={handleBack} disabled={currentStep === 1}>
          Back
        </Button>
        <Button onClick={handleNext} disabled={!canGoNext()}>
          {currentStep === 6 ? 'Create company' : 'Next'}
        </Button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
