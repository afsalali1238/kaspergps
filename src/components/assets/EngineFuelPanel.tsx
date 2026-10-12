'use client';

// Engine & fuel tab (spec §11.3, J5.3).
//
// Everything here is measured by the CAN adapter and carries one of the three
// allowed source labels — ECU, ECU · partial or Estimated — or says "Not measured"
// when the vehicle's own CAN check removed that parameter (§6.4 rule 2). A value
// that was never measured is never printed as 0.
//
// The seven-day fuel chart comes from fuelWeekFor(): the level gauge per day with
// a refuel ▲ / drop ▼ marker, and litres used per day (the ECU counter where the
// asset reports one, otherwise the gauge's falls converted with the tank size).

import React, { useMemo } from 'react';
import {
  CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { SourceLabel, TierChip } from '@/components/ui';
import { ecuHoursAt, fuelWeekFor, hoursSourceFor, last7DaysIgnition, tierOf, type FuelWeek } from '@/server/api';
import * as clock from '@/lib/clock';
import { useT } from '@/i18n';
import type { Asset, ParamKey, Reading } from '@/domain/types';

/** Plain words for the diagnostic trouble codes the seed produces (spec §11.3). */
const DTC_WORDS: Record<string, string> = {
  'SPN 110 FMI 0': 'Engine coolant temperature high',
};

const n0 = (v: number) => Math.round(v).toString();
const n1 = (v: number) => v.toFixed(1);

interface TileProps {
  label: string;
  value: string;
  /** The three allowed source labels, or `null` when the value isn't measured. */
  source?: 'ECU' | 'ECU · partial' | 'Estimated' | null;
  /** Why the value isn't shown, when it isn't. */
  note?: string;
}

function Tile({ label, value, source, note }: TileProps) {
  const t = useT();
  return (
    <div className="border border-line rounded-lg p-3">
      <div className="text-xs text-grey-500 font-medium uppercase">{label}</div>
      <div className="text-lg font-semibold text-ink mt-1 font-mono">{value}</div>
      <div className="mt-1">
        {source ? (
          <SourceLabel source={source} inline />
        ) : (
          <span className="text-xs text-grey-500">{note ?? t('common.not_available', 'Not available')}</span>
        )}
      </div>
    </div>
  );
}

export function EngineFuelPanel({ asset, reading }: { asset: Asset; reading: Reading | null }) {
  const t = useT();

  const week: FuelWeek | null = useMemo(() => fuelWeekFor(asset, clock.now()), [asset]);
  const hoursSource = hoursSourceFor(asset);
  const hasEcuHours = hoursSource === 'ECU' || hoursSource === 'ECU · partial';
  const ignitionWeek = useMemo(
    () => (hasEcuHours ? null : last7DaysIgnition(asset, clock.now())),
    [asset, hasEcuHours]
  );

  const supports = (param: ParamKey) => asset.canProfile.supported.includes(param);

  // Active fault codes: null when the vehicle's CAN check removed the parameter,
  // an empty list when the vehicle reports none, otherwise the codes themselves.
  const faults: string[] | null = supports('faultCodes') ? (reading?.activeDtcs ?? []) : null;

  return (
    <div className="bg-surface border border-line rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-ink">{t('asset_detail.tabs.engine_fuel', 'Engine & fuel')}</div>
        <TierChip tier={tierOf(asset.canProfile.adapter)} />
      </div>

      {/* Hours, live engine values, AdBlue — one tile each, source labelled. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-testid="engine-tiles">
        {hasEcuHours ? (
          <Tile
            label={hoursSource === 'ECU'
              ? t('asset_detail.engine.ecu_hours', 'Engine hours · ECU')
              : t('asset_detail.engine.ecu_hours_partial', 'Engine hours · ECU · partial')}
            value={`${n1(ecuHoursAt(asset, clock.now()))} h`}
            source={hoursSource}
          />
        ) : (
          <Tile
            label={t('asset_detail.utilisation.source_ignition', 'Ignition hours · Estimated')}
            value={`${n1(ignitionWeek?.days.reduce((sum, d) => sum + d.movingHours + d.stationaryHours, 0) ?? 0)} h`}
            source="Estimated"
          />
        )}

        <Tile
          label={t('asset_detail.engine.rpm', 'Engine RPM')}
          value={supports('rpm') && reading?.rpm !== undefined ? `${n0(reading.rpm)} rpm` : t('common.not_measured', 'Not measured')}
          source={supports('rpm') ? 'ECU' : null}
        />
        <Tile
          label={t('asset_detail.engine.coolant', 'Coolant')}
          value={supports('coolantTemp') && reading?.coolantC !== undefined ? `${n0(reading.coolantC)} °C` : t('common.not_measured', 'Not measured')}
          source={supports('coolantTemp') ? 'ECU' : null}
        />
        <Tile
          label={t('asset_detail.engine.load', 'Engine load')}
          value={supports('engineLoad') && reading?.engineLoadPct !== undefined ? `${n0(reading.engineLoadPct)}%` : t('common.not_measured', 'Not measured')}
          source={supports('engineLoad') ? 'ECU' : null}
        />
        <Tile
          label={t('asset_detail.engine.fuel_level', 'Fuel level')}
          value={supports('fuelLevel') && reading?.fuelLevelPct !== undefined ? `${n0(reading.fuelLevelPct)}%` : t('common.not_measured', 'Not measured')}
          source={supports('fuelLevel') ? 'ECU' : null}
        />
        <Tile
          label={t('asset_detail.engine.adblue', 'AdBlue')}
          value={supports('adBlue') && reading?.adBluePct !== undefined ? `${n0(reading.adBluePct)}%` : t('common.not_measured', 'Not measured')}
          source={supports('adBlue') ? 'ECU' : null}
        />
      </div>

      {/* Seven-day fuel chart: level with refuel ▲ and drop ▼ markers. */}
      {week && week.hasLevel && (
        <div data-testid="fuel-week">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-medium text-grey-500 uppercase">{t('asset_detail.engine.fuel_week', 'Fuel level — last 7 days')}</div>
            <SourceLabel source="ECU" inline />
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={week.days} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#E8E8E3" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9A9CA1" />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                  stroke="#9A9CA1"
                  width={42}
                  tickFormatter={(value: number) => `${value}%`}
                />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="levelPct"
                  name={t('asset_detail.engine.fuel_level', 'Fuel level')}
                  stroke="#141518"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                {week.days.filter(d => d.refuel && d.levelPct !== null).map(d => (
                  <ReferenceDot key={`up-${d.key}`} x={d.date} y={d.levelPct as number} r={4} fill="#1F9A6D" stroke="none"
                    label={{ value: '▲', position: 'top', fontSize: 10, fill: '#1F9A6D' }} />
                ))}
                {week.days.filter(d => d.drop && d.levelPct !== null).map(d => (
                  <ReferenceDot key={`down-${d.key}`} x={d.date} y={d.levelPct as number} r={4} fill="#D64545" stroke="none"
                    label={{ value: '▼', position: 'bottom', fontSize: 10, fill: '#D64545' }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Fuel used per day. */}
      {week && week.days.some(d => d.usedL !== null) && (
        <div data-testid="fuel-used-days">
          <div className="text-xs font-medium text-grey-500 uppercase mb-1">{t('asset_detail.engine.fuel_used_per_day', 'Fuel used per day')}</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-grey-500 text-left">
                <th className="py-1 font-medium">{t('asset_detail.utilisation.day', 'Day')}</th>
                <th className="py-1 font-medium text-right">{t('asset_detail.engine.used_l', 'Used (L)')}</th>
                <th className="py-1 font-medium">{t('asset_detail.engine.source', 'Source')}</th>
                <th className="py-1 font-medium">{t('asset_detail.engine.events', 'Refuel / drop')}</th>
              </tr>
            </thead>
            <tbody>
              {week.days.map(day => (
                <tr key={day.key} className="border-t border-line">
                  <td className="py-1.5 text-grey-700">{day.date}</td>
                  <td className="py-1.5 text-right font-mono text-ink">{day.usedL === null ? '—' : n1(day.usedL)}</td>
                  <td className="py-1.5">{day.usedL === null ? <span className="text-grey-500">{t('common.not_measured', 'Not measured')}</span> : <SourceLabel source={day.usedSource} inline />}</td>
                  <td className="py-1.5 text-grey-700">
                    {day.refuel && <span className="text-green mr-2" title={t('asset_detail.engine.refuel', 'Refuel')}>▲ {t('asset_detail.engine.refuel', 'Refuel')}</span>}
                    {day.drop && <span className="text-red" title={t('asset_detail.engine.drop', 'Fuel drop')}>▼ {t('asset_detail.engine.drop', 'Fuel drop')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {week && !week.hasLevel && (
        <p className="text-xs text-grey-500">
          {t('asset_detail.engine.no_level_gauge', 'Fuel level: the level sensor is not fitted on this vehicle, so litres come from the ECU fuel counter.')}
        </p>
      )}

      {/* Active fault codes with plain descriptions (spec §11.3). */}
      <div data-testid="engine-faults">
        <div className="text-xs font-medium text-grey-500 uppercase mb-1">{t('asset_detail.engine.fault_codes', 'Active fault codes')}</div>
        {faults === null ? (
          <p className="text-sm text-grey-500">{t('common.not_measured', 'Not measured')}</p>
        ) : faults.length === 0 ? (
          <p className="text-sm text-grey-500">{t('asset_detail.engine.no_faults', 'No active fault codes.')}</p>
        ) : (
          <ul className="space-y-1">
            {faults.map(code => (
              <li key={code} className="text-sm text-ink">
                <span className="font-mono">{code}</span>
                {DTC_WORDS[code] ? ` — ${t(`asset_detail.dtc.${code}`, DTC_WORDS[code])}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
