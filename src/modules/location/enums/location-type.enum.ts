/**
 * Node type in the location tree. Only MEETING_ROOM is bookable; BUILDING/FLOOR/OTHER are
 * structural nodes (department/capacity/open* = NULL).
 */
export enum LocationType {
  BUILDING = 'BUILDING',
  FLOOR = 'FLOOR',
  OFFICE = 'OFFICE',
  MEETING_ROOM = 'MEETING_ROOM',
  OTHER = 'OTHER',
}
