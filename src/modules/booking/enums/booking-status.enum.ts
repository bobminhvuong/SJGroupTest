/** Booking status. Overlap only considers CONFIRMED bookings (not soft-deleted). */
export enum BookingStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}
