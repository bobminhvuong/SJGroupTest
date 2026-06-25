import { BadRequestException } from '@nestjs/common';

/**
 * Thrown when a booking violates a business rule (department / capacity / time /
 * overlap). Extends BadRequestException to return 400 with a clear reason message.
 */
export class BookingValidationException extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}
