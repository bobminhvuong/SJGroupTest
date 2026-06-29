/**
 * Normalizes "Open Time" between the string input (DTO / assignment) and the typed
 * DB columns.
 *
 * DB columns (see Location entity):
 *   openDays : number[]  (1=Mon ... 7=Sun, per ISO-8601 / Postgres ISODOW)
 *   openFrom : "HH:mm"
 *   openTo   : "HH:mm"
 *
 * Supports two string syntaxes:
 *   - API DTO:    "MON-FRI:09:00-18:00", "MON-SUN:00:00-23:59", "ALWAYS"
 *   - single day: "MON:09:00-18:00"
 *
 * Convert ONCE at create/import time (no runtime parsing during booking validation).
 */

export interface OpenTimeValue {
  openDays: number[];
  openFrom: string; // "HH:mm"
  openTo: string; // "HH:mm"
}

const DAY_INDEX: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
};
const DAY_NAME = ['', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const ALL_WEEK = [1, 2, 3, 4, 5, 6, 7];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class OpenTimeFormatError extends Error {
  constructor(rule: string) {
    super(
      `Invalid openTimeRule "${rule}". Expected "ALWAYS" or "MON-FRI:09:00-18:00".`,
    );
    this.name = 'OpenTimeFormatError';
  }
}

/** Expand "MON-FRI" -> [1,2,3,4,5]; "MON" -> [1]. Supports week wrap (e.g. SAT-SUN). */
function expandDays(spec: string): number[] {
  const [fromRaw, toRaw] = spec.split('-');
  const from = DAY_INDEX[fromRaw?.toUpperCase()];
  if (!from) throw new OpenTimeFormatError(spec);
  if (!toRaw) return [from];
  const to = DAY_INDEX[toRaw.toUpperCase()];
  if (!to) throw new OpenTimeFormatError(spec);

  const days: number[] = [];
  let d = from;
  // Allow wrap (SAT-MON) by cycling through 7, though usually from <= to.
  for (let i = 0; i < 7; i++) {
    days.push(d);
    if (d === to) break;
    d = d === 7 ? 1 : d + 1;
  }
  return days;
}

/** Parse an openTimeRule string -> typed columns. Returns null if rule is null/empty. */
export function parseOpenTimeRule(
  rule: string | null | undefined,
): OpenTimeValue | null {
  if (rule == null || rule.trim() === '') return null;
  const normalized = rule.trim().toUpperCase();

  if (normalized === 'ALWAYS') {
    return { openDays: [...ALL_WEEK], openFrom: '00:00', openTo: '23:59' };
  }

  const [daysPart, timePart] =
    normalized.split(':', 2).length === 2
      ? [
          normalized.slice(0, normalized.indexOf(':')),
          normalized.slice(normalized.indexOf(':') + 1),
        ]
      : [undefined, undefined];
  if (!daysPart || !timePart) throw new OpenTimeFormatError(rule);

  const [fromTime, toTime] = timePart.split('-');
  if (!TIME_RE.test(fromTime ?? '') || !TIME_RE.test(toTime ?? '')) {
    throw new OpenTimeFormatError(rule);
  }
  if (fromTime >= toTime) {
    throw new Error(`openTimeRule "${rule}": openFrom must be before openTo.`);
  }

  return { openDays: expandDays(daysPart), openFrom: fromTime, openTo: toTime };
}

// ── Open-hours validation for bookings ────────────────────────────────────────

export interface WallClock {
  date: string; // "YYYY-MM-DD"
  hm: string; // "HH:mm"
  isoDow: number; // 1=Mon ... 7=Sun
}

/**
 * Wall-clock (date/time/weekday) of an absolute instant **in a given IANA timezone**.
 *
 * This is the single source of truth for time across the app: the booking is stored as
 * an absolute `timestamptz` (so overlap detection is exact), and open-hours are evaluated
 * by projecting that same instant into the configured business timezone. Two inputs that
 * denote the same instant therefore always agree on BOTH overlap and open-hours — the
 * previous "wall-clock-from-string vs absolute-instant" inconsistency is gone.
 *
 * Uses the built-in Intl API (no extra dependency, full IANA + DST support).
 */
export function wallClockInTz(date: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23', // 00..23 (avoid "24:00" for midnight)
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  const weekday = get('weekday'); // "Mon".."Sun"
  const isoDow = DAY_INDEX[weekday.toUpperCase()] ?? 0;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hm: `${get('hour')}:${get('minute')}`,
    isoDow,
  };
}

export interface OpenHoursCheck {
  ok: boolean;
  reason?: string;
}

/** Trim "HH:mm:ss" (Postgres TIME) or "HH:mm" down to "HH:mm" for string comparison. */
function hm(value: string): string {
  return value.slice(0, 5);
}

/**
 * Checks whether [start, end] (absolute instants) falls within the room's open hours,
 * evaluated in `timeZone`. The booking must fit within a single calendar day in that
 * timezone. Returns { ok, reason } so the service can build a clear error message.
 */
export function checkOpenHours(
  start: Date,
  end: Date,
  room: { openDays: number[]; openFrom: string; openTo: string },
  timeZone: string,
): OpenHoursCheck {
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, reason: 'invalid time format' };
  }
  const s = wallClockInTz(start, timeZone);
  const e = wallClockInTz(end, timeZone);
  if (s.date !== e.date) {
    return { ok: false, reason: 'booking must start and end on the same day' };
  }
  if (!room.openDays.includes(s.isoDow)) {
    return { ok: false, reason: 'day is outside open days' };
  }
  if (s.hm < hm(room.openFrom)) {
    return { ok: false, reason: 'starts before opening time' };
  }
  if (e.hm > hm(room.openTo)) {
    return { ok: false, reason: 'ends after closing time' };
  }
  return { ok: true };
}

/**
 * Absolute [from, to) instants bounding a calendar date in `timeZone` — used to filter
 * bookings by day consistently with how they are stored (timestamptz) and validated.
 * `to` is the start of the next day, so the range is half-open.
 */
export function dayRangeInTz(
  dateStr: string,
  timeZone: string,
): { from: Date; to: Date } {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const from = zonedMidnight(y, mo, d, timeZone);
  const to = zonedMidnight(y, mo, d + 1, timeZone);
  return { from, to };
}

/** UTC instant of local midnight (y-mo-d 00:00) in `timeZone`. Handles the tz offset. */
function zonedMidnight(
  y: number,
  mo: number,
  d: number,
  timeZone: string,
): Date {
  // Start from the naive UTC guess, then correct by the zone's offset at that instant.
  const naiveUtc = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const guess = new Date(naiveUtc);
  const wc = wallClockInTz(guess, timeZone);
  const [gh, gm] = wc.hm.split(':').map(Number);
  const seenUtc = Date.UTC(
    +wc.date.slice(0, 4),
    +wc.date.slice(5, 7) - 1,
    +wc.date.slice(8, 10),
    gh,
    gm,
  );
  const offset = seenUtc - naiveUtc; // tz offset in ms
  return new Date(naiveUtc - offset);
}

/** Format typed columns -> compact string for client/log. Null if not bookable. */
export function formatOpenTimeRule(
  value: Partial<OpenTimeValue> | null,
): string | null {
  if (!value?.openDays?.length || !value.openFrom || !value.openTo) return null;
  const days = [...value.openDays].sort((a, b) => a - b);
  // Postgres TIME returns "HH:mm:ss"; normalize to "HH:mm" for brevity & consistency.
  const from = value.openFrom.slice(0, 5);
  const to = value.openTo.slice(0, 5);

  if (days.length === 7 && from === '00:00' && to === '23:59') {
    return 'ALWAYS';
  }

  // Collapse consecutive days into "MON-FRI"; list non-contiguous ones as "MON,WED".
  const ranges: string[] = [];
  let start = days[0];
  let prev = days[0];
  for (let i = 1; i <= days.length; i++) {
    const cur = days[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push(
      start === prev ? DAY_NAME[start] : `${DAY_NAME[start]}-${DAY_NAME[prev]}`,
    );
    start = cur;
    prev = cur;
  }
  return `${ranges.join(',')}:${from}-${to}`;
}
