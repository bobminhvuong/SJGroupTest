import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Validates a path param id is a positive integer (bigint key) and returns it as a
 * STRING — matching how the app represents bigint (TypeORM returns ids as strings).
 * Replaces ParseUUIDPipe after switching keys from UUID to bigint.
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('id must be a positive integer');
    }
    return value;
  }
}
