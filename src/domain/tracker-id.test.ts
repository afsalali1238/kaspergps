// Unit tests for the standard-Luhn IMEI / SIM-ICCID rules (spec 11.9, 11.14).
import { describe, it, expect } from 'vitest';
import { isValidIccid, isValidImei, imeiCheckDigit, luhnValid, makeImei } from './tracker-id';
import { db } from '@/server/db';

describe('tracker-id — Luhn', () => {
  it('accepts the canonical Luhn example 79927398713', () => {
    expect(luhnValid('79927398713')).toBe(true);
  });

  it('rejects a number with a wrong check digit', () => {
    expect(luhnValid('79927398710')).toBe(false);
  });

  it('every seeded IMEI is 15 digits and passes Luhn', () => {
    for (const t of db.getState().trackers) {
      expect(t.imei).toMatch(/^\d{15}$/);
      expect(luhnValid(t.imei)).toBe(true);
      expect(isValidImei(t.imei)).toBe(true);
    }
  });

  it('generates valid IMEIs from a 14-digit body', () => {
    for (const last6 of ['000001', '123456', '999999']) {
      const body = '35209310' + last6;
      const imei = makeImei(body);
      expect(imei).toHaveLength(15);
      expect(imei.slice(0, 14)).toBe(body);
      expect(isValidImei(imei)).toBe(true);
      expect(imeiCheckDigit(body)).toBe(Number(imei[14]));
    }
  });

  it('rejects a 15-digit number whose last digit is wrong', () => {
    const good = makeImei('35209310000001');
    const bad = good.slice(0, 14) + String((Number(good[14]) + 1) % 10);
    expect(isValidImei(bad)).toBe(false);
  });

  it('rejects IMEIs that are not 15 digits', () => {
    expect(isValidImei('12345')).toBe(false);
    expect(isValidImei('3520931000000101')).toBe(false);
    expect(isValidImei('35209310000001a')).toBe(false);
  });
});

describe('tracker-id — SIM ICCID', () => {
  it('accepts 19- and 20-digit ICCIDs starting with 89', () => {
    expect(isValidIccid('89' + '1'.repeat(17))).toBe(true);
    expect(isValidIccid('89' + '123456789012345678')).toBe(true);
  });

  it('rejects ICCIDs that are too short, too long or do not start 89', () => {
    expect(isValidIccid('89971' + '1'.repeat(13))).toBe(false); // 18 digits
    expect(isValidIccid('89' + '1'.repeat(19))).toBe(false); // 21 digits
    expect(isValidIccid('8812345678901234567')).toBe(false); // does not start 89
    expect(isValidIccid('1234567890123456789')).toBe(false);
  });

  it('accepts every seeded SIM ICCID', () => {
    for (const t of db.getState().trackers) {
      expect(isValidIccid(t.simIccid)).toBe(true);
    }
  });
});
