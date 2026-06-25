import { BadRequestException } from '@nestjs/common';

/**
 * Ném khi booking vi phạm rule nghiệp vụ (department / capacity / time / overlap).
 * Kế thừa BadRequestException để trả 400 với message rõ lý do.
 */
export class BookingValidationException extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}
