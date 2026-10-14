// The simulated clock (architecture rule 9): anchor, offset, jumps and the Dubai
// formatting helpers. Every expectation names its zone, so the result holds under
// any machine time zone (npm test runs under UTC and Asia/Dubai).

import { describe, it, expect, beforeEach } from 'vitest';
import * as clock from '@/lib/clock';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// 2026-10-09 19:00 in Dubai (UTC+4) is 15:00 UTC.
const NINE_OCT_19H_DUBAI = Date.parse('2026-10-09T15:00:00Z');

beforeEach(() => {
  clock.setAnchor(NINE_OCT_19H_DUBAI);
});

describe('anchor and offset', () => {
  it('now is the anchor plus the offset', () => {
    expect(clock.now()).toBe(NINE_OCT_19H_DUBAI);
    clock.setOffsetMs(5 * HOUR);
    expect(clock.getOffsetMs()).toBe(5 * HOUR);
    expect(clock.now()).toBe(NINE_OCT_19H_DUBAI + 5 * HOUR);
    clock.resetOffset();
    expect(clock.now()).toBe(NINE_OCT_19H_DUBAI);
  });

  it('getAnchor returns the set anchor', () => {
    expect(clock.getAnchor()).toBe(NINE_OCT_19H_DUBAI);
  });

  it('setAnchor clears any offset', () => {
    clock.setOffsetMs(HOUR);
    clock.setAnchor(NINE_OCT_19H_DUBAI + DAY);
    expect(clock.getOffsetMs()).toBe(0);
    expect(clock.now()).toBe(NINE_OCT_19H_DUBAI + DAY);
  });

  it('setDubaiTime sets the anchor from a Dubai wall-clock string', () => {
    clock.setOffsetMs(HOUR);
    clock.setDubaiTime('2026-10-10T08:30:00');
    expect(clock.getOffsetMs()).toBe(0);
    expect(clock.formatDubaiDateTime(clock.now())).toBe('10 Oct 08:30');
  });
});

describe('jumps', () => {
  it('jump adds to the offset and the jump helpers move the clock by their unit', () => {
    clock.jump(2 * HOUR);
    expect(clock.getOffsetMs()).toBe(2 * HOUR);
    clock.jumpBackHours(1);
    expect(clock.getOffsetMs()).toBe(HOUR);
    clock.jumpForwardHours(3);
    expect(clock.getOffsetMs()).toBe(4 * HOUR);
    clock.jumpBackDays(1);
    expect(clock.getOffsetMs()).toBe(4 * HOUR - DAY);
    clock.jumpForwardDays(2);
    expect(clock.getOffsetMs()).toBe(4 * HOUR + DAY);
    clock.resetOffset();
    clock.jumpBackWeeks(2);
    expect(clock.getOffsetMs()).toBe(-14 * DAY);
  });
});

describe('Dubai time helpers', () => {
  it('dubaiNow is the anchor shown on the Dubai calendar', () => {
    const d = clock.dubaiNow();
    expect([d.getHours(), d.getDate(), d.getMonth()]).toEqual([19, 9, 9]);
  });

  it('formats time, date and date-time in Dubai, 24-hour, with short day-month dates', () => {
    expect(clock.formatDubaiTime(NINE_OCT_19H_DUBAI)).toBe('19:00');
    expect(clock.formatDubaiDate(NINE_OCT_19H_DUBAI)).toBe('9 Oct');
    expect(clock.formatDubaiDateTime(NINE_OCT_19H_DUBAI)).toBe('9 Oct 19:00');
  });

  it('dubaiDateKey is a sortable YYYY-MM-DD in Dubai, even just after midnight UTC', () => {
    // 00:30 Dubai on 10 Oct is still 20:30 UTC on 9 Oct.
    const justAfterMidnightDubai = Date.parse('2026-10-09T20:30:00Z');
    expect(clock.dubaiDateKey(justAfterMidnightDubai)).toBe('2026-10-10');
    expect(clock.dubaiDateKey(NINE_OCT_19H_DUBAI)).toBe('2026-10-09');
  });

  it('dubaiToIso writes the Dubai wall time with its +04:00 offset', () => {
    expect(clock.dubaiToIso(NINE_OCT_19H_DUBAI)).toBe('2026-10-09T19:00:00+04:00');
  });

  it('isoFromDubai reads an ISO string as Dubai time and returns its instant', () => {
    expect(clock.isoFromDubai('2026-10-09T19:00:00')).toBe(NINE_OCT_19H_DUBAI);
    // A string that already carries its offset is taken as written, not shifted again.
    expect(clock.isoFromDubai('2026-10-09T19:00:00+04:00')).toBe(NINE_OCT_19H_DUBAI);
  });

  it('dubaiMsToDate returns a Date whose wall clock is Dubai time', () => {
    expect(clock.dubaiMsToDate(NINE_OCT_19H_DUBAI).getHours()).toBe(19);
  });

  it('startOfDubaiDay is midnight in Dubai on the same day', () => {
    expect(clock.startOfDubaiDay(NINE_OCT_19H_DUBAI)).toBe(Date.parse('2026-10-08T20:00:00Z'));
  });

  it('hours and minutes since a moment are measured from now()', () => {
    const threeHoursAgo = NINE_OCT_19H_DUBAI - 3 * HOUR - 10 * 60 * 1000;
    expect(clock.hoursSinceDubai(threeHoursAgo)).toBe(3);
    expect(clock.minutesSinceDubai(threeHoursAgo)).toBe(190);
  });

  it('differences between two instants are whole hours and whole days', () => {
    expect(clock.differenceInDubaiHours(NINE_OCT_19H_DUBAI, NINE_OCT_19H_DUBAI - 5 * HOUR)).toBe(5);
    expect(clock.differenceInDubaiDays(NINE_OCT_19H_DUBAI, NINE_OCT_19H_DUBAI - 3 * DAY)).toBe(3);
  });

  it('exposes the Dubai zone name', () => {
    expect(clock.DUBAI_TZ).toBe('Asia/Dubai');
  });
})
describe('startOfDubaiMonth', () => {
  it('returns first of month for mid-October', () => {
    // 2026-10-15 12:00 Dubai
    const ms = Date.parse('2026-10-15T12:00:00+04:00');
    expect(clock.startOfDubaiMonth(ms)).toBe(Date.parse('2026-10-01T00:00:00+04:00'));
  });

  it('returns October 1st for 1 Oct 00:30 Dubai', () => {
    const ms = Date.parse('2026-10-01T00:30:00+04:00');
    expect(clock.startOfDubaiMonth(ms)).toBe(Date.parse('2026-10-01T00:00:00+04:00'));
  });

  it('returns September 1st for 30 Sep 23:30 Dubai', () => {
    const ms = Date.parse('2026-09-30T23:30:00+04:00');
    expect(clock.startOfDubaiMonth(ms)).toBe(Date.parse('2026-09-01T00:00:00+04:00'));
  });
});

describe('lastMonthPeriod', () => {
  it('returns September 2026 at the October anchor', () => {
    // Anchor: 2026-10-09 19:00 Dubai
    const result = clock.lastMonthPeriod(NINE_OCT_19H_DUBAI);
    expect(result.label).toBe('September 2026');
    expect(result.from).toBe(Date.parse('2026-09-01T00:00:00+04:00'));
    expect(result.to).toBe(Date.parse('2026-10-01T00:00:00+04:00') - 60000);
  });
});
