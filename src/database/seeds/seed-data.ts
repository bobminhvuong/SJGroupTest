/**
 * Seed data taken from the example table in the SJ Assignment 2026 brief.
 *
 * - Raw open time ("Mon to Fri (9AM to 6PM)") is pre-normalized into typed columns:
 *     openDays  : weekday numbers (1 = Mon ... 7 = Sun)
 *     openFrom  : "HH:mm"
 *     openTo    : "HH:mm"
 *   "Always open" -> open all week 00:00–23:59.
 * - Structural nodes (BUILDING/FLOOR/OFFICE/OTHER) are not bookable: capacity/open* = null.
 * - Department is specified per booking, not tied to location.
 * - parentNumber references the parent node's locationNumber (the runner resolves it to parent_id).
 *
 * This file is independent of the entities for easier testing & review; the seed.ts
 * runner maps it into the repository on insert.
 */

export type LocationType =
  | 'BUILDING'
  | 'FLOOR'
  | 'OFFICE'
  | 'MEETING_ROOM'
  | 'OTHER';

export interface DepartmentSeed {
  code: string;
  name: string;
}

export interface LocationSeed {
  name: string;
  locationNumber: string; // unique
  parentNumber: string | null; // null = root node (Building)
  type: LocationType;
  capacity: number | null;
  openDays: number[] | null; // 1=Mon ... 7=Sun
  openFrom: string | null; // "HH:mm"
  openTo: string | null; // "HH:mm"
  departmentCodes: string[] | null; // departments allowed to book (bookable nodes only)
}

const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri
const MON_TO_SAT = [1, 2, 3, 4, 5, 6]; // Mon–Sat
const ALL_WEEK = [1, 2, 3, 4, 5, 6, 7]; // Mon–Sun

export const DEPARTMENT_SEED: DepartmentSeed[] = [
  { code: 'EFM', name: 'EFM' },
  { code: 'FSS', name: 'FSS' },
  { code: 'AVS', name: 'AVS' },
  { code: 'ASS', name: 'ASS' },
];

export const LOCATION_SEED: LocationSeed[] = [
  // ── Building A ────────────────────────────────────────────────────────────
  {
    name: 'Building A',
    locationNumber: 'A',
    parentNumber: null,
    type: 'BUILDING',
    capacity: null,
    openDays: null,
    openFrom: null,
    openTo: null,
    departmentCodes: null,
  },
  {
    name: 'Floor 1',
    locationNumber: 'A-01',
    parentNumber: 'A',
    type: 'FLOOR',
    capacity: null,
    openDays: null,
    openFrom: null,
    openTo: null,
    departmentCodes: null,
  },
  {
    name: 'Lobby Level1',
    locationNumber: 'A-01-Lobby',
    parentNumber: 'A-01',
    type: 'OTHER',
    capacity: null,
    openDays: null,
    openFrom: null,
    openTo: null,
    departmentCodes: null,
  },
  {
    name: 'Meeting Room 1',
    locationNumber: 'A-01-01',
    parentNumber: 'A-01',
    type: 'MEETING_ROOM',
    capacity: 10,
    openDays: WEEKDAYS,
    openFrom: '09:00',
    openTo: '18:00',
    departmentCodes: ['EFM'], // single department -> mismatch test uses FSS
  },
  {
    name: 'Meeting Room 2',
    locationNumber: 'A-01-02',
    parentNumber: 'A-01',
    type: 'MEETING_ROOM',
    capacity: 50,
    openDays: WEEKDAYS,
    openFrom: '09:00',
    openTo: '18:00',
    departmentCodes: ['EFM', 'FSS'], // multiple departments share this room
  },
  {
    name: 'Corridor Floor 1',
    locationNumber: 'A-01-Corridor',
    parentNumber: 'A-01',
    type: 'OTHER',
    capacity: null,
    openDays: null,
    openFrom: null,
    openTo: null,
    departmentCodes: null,
  },
  {
    name: 'Meeting Room 2',
    locationNumber: 'A-01-03',
    parentNumber: 'A-01',
    type: 'MEETING_ROOM',
    capacity: 5,
    openDays: MON_TO_SAT,
    openFrom: '09:00',
    openTo: '18:00',
    departmentCodes: ['AVS'],
  },

  // ── Building B ────────────────────────────────────────────────────────────
  {
    name: 'Building B',
    locationNumber: 'B',
    parentNumber: null,
    type: 'BUILDING',
    capacity: null,
    openDays: null,
    openFrom: null,
    openTo: null,
    departmentCodes: null,
  },
  {
    name: 'Floor 5',
    locationNumber: 'B-05',
    parentNumber: 'B',
    type: 'FLOOR',
    capacity: null,
    openDays: null,
    openFrom: null,
    openTo: null,
    departmentCodes: null,
  },
  {
    name: 'Utility Room',
    locationNumber: 'B-05-11',
    parentNumber: 'B-05',
    type: 'MEETING_ROOM',
    capacity: 30,
    openDays: ALL_WEEK,
    openFrom: '00:00',
    openTo: '23:59',
    departmentCodes: ['ASS'],
  },
  {
    name: 'Sanitary Room',
    locationNumber: 'B-05-12',
    parentNumber: 'B-05',
    type: 'MEETING_ROOM',
    capacity: 10,
    openDays: WEEKDAYS,
    openFrom: '09:00',
    openTo: '18:00',
    departmentCodes: ['EFM'],
  },
  {
    name: 'Meeting Toilet',
    locationNumber: 'B-05-13',
    parentNumber: 'B-05',
    type: 'MEETING_ROOM',
    capacity: 10,
    openDays: WEEKDAYS,
    openFrom: '09:00',
    openTo: '18:00',
    departmentCodes: ['FSS'],
  },
  {
    name: 'Genset Room',
    locationNumber: 'B-05-14',
    parentNumber: 'B-05',
    type: 'MEETING_ROOM',
    capacity: 100,
    openDays: ALL_WEEK,
    openFrom: '09:00',
    openTo: '18:00',
    departmentCodes: ['EFM', 'FSS', 'AVS', 'ASS'], // open to every department
  },
  {
    name: 'Pantry Floor 5',
    locationNumber: 'B-05-15',
    parentNumber: 'B-05',
    type: 'OTHER',
    capacity: null,
    openDays: null,
    openFrom: null,
    openTo: null,
    departmentCodes: null,
  },
  {
    name: 'Corridor Floor 5',
    locationNumber: 'B-05-Corridor',
    parentNumber: 'B-05',
    type: 'OTHER',
    capacity: null,
    openDays: null,
    openFrom: null,
    openTo: null,
    departmentCodes: null,
  },
];
