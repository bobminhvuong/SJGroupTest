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

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Reads the "wall clock" (date/time/weekday) EXACTLY as sent in the string — ignoring
 * the offset. This makes "reject weekend bookings" correct in the requester's local
 * time, independent of the server timezone. Returns null on a malformed string.
 */
export function wallClockOf(iso: string): WallClock | null {
  const m = ISO_RE.exec(iso);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  // getUTCDay: 0=Sun..6=Sat -> convert to ISO 1=Mon..7=Sun.
  const dow = new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay();
  const isoDow = dow === 0 ? 7 : dow;
  return { date: `${y}-${mo}-${d}`, hm: `${hh}:${mm}`, isoDow };
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
 * Checks whether [startIso, endIso] falls within the room's open hours.
 * Compares wall-clock directly (no runtime rule parsing). The booking must fit within
 * a single day. Returns { ok, reason } so the service can build a clear error message.
 */
export function checkOpenHours(
  startIso: string,
  endIso: string,
  room: { openDays: number[]; openFrom: string; openTo: string },
): OpenHoursCheck {
  const start = wallClockOf(startIso);
  const end = wallClockOf(endIso);
  if (!start || !end) return { ok: false, reason: 'invalid time format' };
  if (start.date !== end.date) {
    return { ok: false, reason: 'booking must start and end on the same day' };
  }
  if (!room.openDays.includes(start.isoDow)) {
    return { ok: false, reason: 'day is outside open days' };
  }
  if (start.hm < hm(room.openFrom)) {
    return { ok: false, reason: 'starts before opening time' };
  }
  if (end.hm > hm(room.openTo)) {
    return { ok: false, reason: 'ends after closing time' };
  }
  return { ok: true };
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
