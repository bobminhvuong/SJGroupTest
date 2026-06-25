import {
  checkOpenHours,
  formatOpenTimeRule,
  OpenTimeFormatError,
  parseOpenTimeRule,
  wallClockOf,
} from './open-time';

describe('parseOpenTimeRule', () => {
  it('parses MON-FRI', () => {
    expect(parseOpenTimeRule('MON-FRI:09:00-18:00')).toEqual({
      openDays: [1, 2, 3, 4, 5],
      openFrom: '09:00',
      openTo: '18:00',
    });
  });

  it('parses MON-SAT', () => {
    expect(parseOpenTimeRule('MON-SAT:09:00-18:00')?.openDays).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('parses MON-SUN', () => {
    expect(parseOpenTimeRule('MON-SUN:09:00-18:00')?.openDays).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('expands ALWAYS to full week 00:00-23:59', () => {
    expect(parseOpenTimeRule('ALWAYS')).toEqual({
      openDays: [1, 2, 3, 4, 5, 6, 7],
      openFrom: '00:00',
      openTo: '23:59',
    });
  });

  it('parses a single day', () => {
    expect(parseOpenTimeRule('WED:09:00-18:00')?.openDays).toEqual([3]);
  });

  it('is case-insensitive', () => {
    expect(parseOpenTimeRule('mon-fri:09:00-18:00')?.openDays).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('returns null for null/empty', () => {
    expect(parseOpenTimeRule(null)).toBeNull();
    expect(parseOpenTimeRule('')).toBeNull();
    expect(parseOpenTimeRule('   ')).toBeNull();
  });

  it('throws on bad day token', () => {
    expect(() => parseOpenTimeRule('XYZ:09:00-18:00')).toThrow(
      OpenTimeFormatError,
    );
  });

  it('throws on bad time', () => {
    expect(() => parseOpenTimeRule('MON-FRI:9-18')).toThrow(
      OpenTimeFormatError,
    );
    expect(() => parseOpenTimeRule('MON-FRI:25:00-26:00')).toThrow(
      OpenTimeFormatError,
    );
  });

  it('throws when from >= to', () => {
    expect(() => parseOpenTimeRule('MON-FRI:18:00-09:00')).toThrow();
  });
});

describe('formatOpenTimeRule', () => {
  it('formats contiguous range', () => {
    expect(
      formatOpenTimeRule({
        openDays: [1, 2, 3, 4, 5],
        openFrom: '09:00',
        openTo: '18:00',
      }),
    ).toBe('MON-FRI:09:00-18:00');
  });

  it('collapses full open week to ALWAYS (strips Postgres seconds)', () => {
    expect(
      formatOpenTimeRule({
        openDays: [1, 2, 3, 4, 5, 6, 7],
        openFrom: '00:00:00',
        openTo: '23:59:00',
      }),
    ).toBe('ALWAYS');
  });

  it('strips seconds from HH:mm:ss', () => {
    expect(
      formatOpenTimeRule({
        openDays: [1, 2, 3, 4, 5, 6],
        openFrom: '09:00:00',
        openTo: '18:00:00',
      }),
    ).toBe('MON-SAT:09:00-18:00');
  });

  it('lists discontiguous days', () => {
    expect(
      formatOpenTimeRule({
        openDays: [1, 3, 5],
        openFrom: '09:00',
        openTo: '18:00',
      }),
    ).toBe('MON,WED,FRI:09:00-18:00');
  });

  it('returns null when not bookable', () => {
    expect(formatOpenTimeRule(null)).toBeNull();
    expect(
      formatOpenTimeRule({ openDays: [], openFrom: '09:00', openTo: '18:00' }),
    ).toBeNull();
  });

  it('round-trips with parseOpenTimeRule', () => {
    const rule = 'MON-FRI:09:00-18:00';
    expect(formatOpenTimeRule(parseOpenTimeRule(rule))).toBe(rule);
  });
});

describe('wallClockOf', () => {
  it('reads wall-clock ignoring offset', () => {
    expect(wallClockOf('2026-06-26T10:30:00+07:00')).toEqual({
      date: '2026-06-26',
      hm: '10:30',
      isoDow: 5, // Friday
    });
  });

  it('maps Saturday/Sunday to ISO 6/7', () => {
    expect(wallClockOf('2026-06-27T10:00:00+07:00')?.isoDow).toBe(6);
    expect(wallClockOf('2026-06-28T10:00:00+07:00')?.isoDow).toBe(7);
  });

  it('returns null on malformed input', () => {
    expect(wallClockOf('not-a-date')).toBeNull();
  });
});

describe('checkOpenHours', () => {
  const monFri = {
    openDays: [1, 2, 3, 4, 5],
    openFrom: '09:00',
    openTo: '18:00',
  };

  it('accepts a weekday within hours', () => {
    expect(
      checkOpenHours(
        '2026-06-26T10:00:00+07:00',
        '2026-06-26T11:00:00+07:00',
        monFri,
      ).ok,
    ).toBe(true);
  });

  it('rejects weekend for MON-FRI room', () => {
    const r = checkOpenHours(
      '2026-06-27T10:00:00+07:00',
      '2026-06-27T11:00:00+07:00',
      monFri,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/open days/);
  });

  it('rejects start before opening', () => {
    expect(
      checkOpenHours(
        '2026-06-26T08:00:00+07:00',
        '2026-06-26T09:30:00+07:00',
        monFri,
      ).ok,
    ).toBe(false);
  });

  it('rejects end after closing', () => {
    expect(
      checkOpenHours(
        '2026-06-26T17:00:00+07:00',
        '2026-06-26T19:00:00+07:00',
        monFri,
      ).ok,
    ).toBe(false);
  });

  it('rejects bookings spanning two days', () => {
    const r = checkOpenHours(
      '2026-06-26T17:00:00+07:00',
      '2026-06-27T10:00:00+07:00',
      monFri,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/same day/);
  });

  it('accepts hours stored with seconds (Postgres TIME)', () => {
    expect(
      checkOpenHours('2026-06-26T09:00:00+07:00', '2026-06-26T18:00:00+07:00', {
        openDays: [1, 2, 3, 4, 5],
        openFrom: '09:00:00',
        openTo: '18:00:00',
      }).ok,
    ).toBe(true);
  });
});
