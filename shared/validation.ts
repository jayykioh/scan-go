import { z } from 'zod';

export const isoUtcTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
    'Expected an ISO-8601 UTC timestamp',
  );

export const idSchema = z.string().min(1);

export const tenantIdSchema = idSchema;
export const uidSchema = idSchema;

export const nonNegativeIntSchema = z.number().int().nonnegative();
export const positiveIntSchema = z.number().int().positive();
export const vndSchema = nonNegativeIntSchema;

export const localeSchema = z.enum(['vi', 'en']);
export type AppLocale = z.infer<typeof localeSchema>;

export const timezoneSchema = z.string().min(1);

export const schemaVersionSchema = z.number().int().positive();
