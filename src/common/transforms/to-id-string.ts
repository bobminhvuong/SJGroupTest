import { Transform } from 'class-transformer';

/**
 * Normalize an id (number | bigint) -> string to match the app's bigint keys
 * (TypeORM returns bigint as string). null/undefined pass through unchanged.
 */
export const ToIdString = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : value,
  );
