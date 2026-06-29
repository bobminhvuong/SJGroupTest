import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger schema for the unified error body produced by HttpExceptionFilter.
 * Used in @ApiResponse decorators so the docs show the real error shape.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    description:
      'Human-readable message (string, or array for validation errors).',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Attendees (12) exceed room capacity (10)',
  })
  message!: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: '2026-06-26T03:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/v1/bookings' })
  path!: string;
}
