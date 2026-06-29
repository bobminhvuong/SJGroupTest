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

/**
 * Array variant of {@link ToIdString}: normalizes every element (number | bigint) -> string.
 * Non-array values pass through unchanged (validators report the type error).
 */
export const ToIdStringArray = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? (value as unknown[]).map((v) =>
          typeof v === 'number' || typeof v === 'bigint' ? String(v) : v,
        )
      : value,
  );
