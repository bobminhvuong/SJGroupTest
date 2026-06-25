/**
 * Node type in the location tree. Only ROOM is bookable; BUILDING/FLOOR/OTHER are
 * structural nodes (department/capacity/open* = NULL).
 */
export enum LocationType {
  BUILDING = 'BUILDING',
  FLOOR = 'FLOOR',
  ROOM = 'ROOM',
  OTHER = 'OTHER',
}
