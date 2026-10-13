import { describe, it, expect } from 'vitest';
import { NOT_MEASURED, formatAed, formatHours, formatKm, formatNumber, formatPct, formatSpeed, formatVolts } from './format';

const missing = [null, undefined, NaN, Infinity, -Infinity];

describe('format — every helper', () => {
  it('reads "Not measured" for a missing value, never 0', () => {
    for (const fn of [formatNumber, formatHours, formatKm, formatSpeed, formatAed, formatPct, formatVolts]) {
      for (const v of missing) expect(fn(v)).toBe(NOT_MEASURED);
    }
    expect(NOT_MEASURED).toBe('Not measured');
  });

  it('never prints a raw float', () => {
    const raw = 37.599999999999994;
    for (const out of [formatNumber(raw, 1), formatHours(raw), formatKm(raw), formatSpeed(raw), formatAed(raw, 2), formatPct(raw), formatVolts(raw)]) {
      expect(out).not.toMatch(/\d\.\d{3,}/);
    }
  });
});

describe('format — numbers', () => {
  it('groups thousands and rounds to the decimals asked', () => {
    expect(formatNumber(8420)).toBe('8,420');
    expect(formatNumber(8420.46, 1)).toBe('8,420.5');
    expect(formatNumber(1234567.891, 2)).toBe('1,234,567.89');
    expect(formatNumber(0.4)).toBe('0');
    expect(formatNumber(-0.04, 1)).toBe('0.0'); // never "-0.0"
    expect(formatNumber(-1250)).toBe('-1,250');
  });

  it('hours carry one decimal like the ECU meter', () => {
    expect(formatHours(8420)).toBe('8,420.0 h');
    expect(formatHours(3.75)).toBe('3.8 h');
    expect(formatHours(0)).toBe('0.0 h');
    expect(formatHours(12.345, 2)).toBe('12.35 h');
  });

  it('kilometres: one decimal under 10 km, whole above', () => {
    expect(formatKm(3.44)).toBe('3.4 km');
    expect(formatKm(9.96)).toBe('10.0 km');
    expect(formatKm(12.6)).toBe('13 km');
    expect(formatKm(152340.2)).toBe('152,340 km');
    expect(formatKm(0)).toBe('0.0 km');
  });

  it('speed is whole km/h', () => {
    expect(formatSpeed(61.6)).toBe('62 km/h');
    expect(formatSpeed(2)).toBe('2 km/h');
    expect(formatSpeed(0.3)).toBe('0 km/h');
  });

  it('money is AED with grouping, whole by default', () => {
    expect(formatAed(83250)).toBe('AED 83,250');
    expect(formatAed(4162.5, 2)).toBe('AED 4,162.50');
    expect(formatAed(11585.12)).toBe('AED 11,585');
    expect(formatAed(-1200)).toBe('AED -1,200');
    expect(formatAed(-0.2)).toBe('AED 0');
    expect(formatAed(0)).toBe('AED 0');
  });

  it('percent and volts', () => {
    expect(formatPct(75.94)).toBe('76%');
    expect(formatPct(75.94, 1)).toBe('75.9%');
    expect(formatPct(100)).toBe('100%');
    expect(formatVolts(24.06)).toBe('24.1 V');
    expect(formatVolts(12)).toBe('12.0 V');
  });
});
