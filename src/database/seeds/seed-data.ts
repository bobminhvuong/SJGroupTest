/**
 * Dữ liệu seed lấy từ bảng ví dụ trong đề SJ Assignment 2026.
 *
 * - Open time thô ("Mon to Fri (9AM to 6PM)") đã được chuẩn hoá sẵn về cột typed:
 *     openDays  : số thứ trong tuần (1 = Mon ... 7 = Sun)
 *     openFrom  : "HH:mm"
 *     openTo    : "HH:mm"
 *   "Always open" -> mở cả tuần 00:00–23:59.
 * - Node cấu trúc (BUILDING/FLOOR/OTHER) không bookable: department/capacity/open* = null.
 * - parentNumber tham chiếu locationNumber của node cha (runner tự resolve sang parent_id).
 *
 * File này độc lập với entity để dễ test & review; runner seed.ts (Phase 1) sẽ map
 * vào repository khi insert.
 */

export type LocationType = 'BUILDING' | 'FLOOR' | 'ROOM' | 'OTHER';

export interface DepartmentSeed {
  code: string;
  name: string;
}

export interface LocationSeed {
  name: string;
  locationNumber: string; // unique
  parentNumber: string | null; // null = node gốc (Building)
  type: LocationType;
  departmentCode: string | null;
  capacity: number | null;
  openDays: number[] | null; // 1=Mon ... 7=Sun
  openFrom: string | null; // "HH:mm"
  openTo: string | null; // "HH:mm"
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
  { name: 'Building A', locationNumber: 'A', parentNumber: null, type: 'BUILDING', departmentCode: null, capacity: null, openDays: null, openFrom: null, openTo: null },
  { name: 'Floor 1', locationNumber: 'A-01', parentNumber: 'A', type: 'FLOOR', departmentCode: null, capacity: null, openDays: null, openFrom: null, openTo: null },
  { name: 'Lobby Level1', locationNumber: 'A-01-Lobby', parentNumber: 'A-01', type: 'OTHER', departmentCode: null, capacity: null, openDays: null, openFrom: null, openTo: null },
  { name: 'Meeting Room 1', locationNumber: 'A-01-01', parentNumber: 'A-01', type: 'ROOM', departmentCode: 'EFM', capacity: 10, openDays: WEEKDAYS, openFrom: '09:00', openTo: '18:00' },
  { name: 'Meeting Room 2', locationNumber: 'A-01-02', parentNumber: 'A-01', type: 'ROOM', departmentCode: 'FSS', capacity: 50, openDays: WEEKDAYS, openFrom: '09:00', openTo: '18:00' },
  { name: 'Corridor Floor 1', locationNumber: 'A-01-Corridor', parentNumber: 'A-01', type: 'OTHER', departmentCode: null, capacity: null, openDays: null, openFrom: null, openTo: null },
  { name: 'Meeting Room 2', locationNumber: 'A-01-03', parentNumber: 'A-01', type: 'ROOM', departmentCode: 'AVS', capacity: 5, openDays: MON_TO_SAT, openFrom: '09:00', openTo: '18:00' },

  // ── Building B ────────────────────────────────────────────────────────────
  { name: 'Building B', locationNumber: 'B', parentNumber: null, type: 'BUILDING', departmentCode: null, capacity: null, openDays: null, openFrom: null, openTo: null },
  { name: 'Floor 5', locationNumber: 'B-05', parentNumber: 'B', type: 'FLOOR', departmentCode: null, capacity: null, openDays: null, openFrom: null, openTo: null },
  { name: 'Utility Room', locationNumber: 'B-05-11', parentNumber: 'B-05', type: 'ROOM', departmentCode: 'ASS', capacity: 30, openDays: ALL_WEEK, openFrom: '00:00', openTo: '23:59' },
  { name: 'Sanitary Room', locationNumber: 'B-05-12', parentNumber: 'B-05', type: 'ROOM', departmentCode: 'EFM', capacity: 10, openDays: WEEKDAYS, openFrom: '09:00', openTo: '18:00' },
  { name: 'Meeting Toilet', locationNumber: 'B-05-13', parentNumber: 'B-05', type: 'ROOM', departmentCode: 'EFM', capacity: 10, openDays: WEEKDAYS, openFrom: '09:00', openTo: '18:00' },
  { name: 'Genset Room', locationNumber: 'B-05-14', parentNumber: 'B-05', type: 'ROOM', departmentCode: 'ASS', capacity: 100, openDays: ALL_WEEK, openFrom: '09:00', openTo: '18:00' },
  { name: 'Pantry Floor 5', locationNumber: 'B-05-15', parentNumber: 'B-05', type: 'OTHER', departmentCode: null, capacity: null, openDays: null, openFrom: null, openTo: null },
  { name: 'Corridor Floor 5', locationNumber: 'B-05-Corridor', parentNumber: 'B-05', type: 'OTHER', departmentCode: null, capacity: null, openDays: null, openFrom: null, openTo: null },
];
