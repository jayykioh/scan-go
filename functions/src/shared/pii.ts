/**
 * Personal-data masking shared by every AI input path (NFR-PRIV-002).
 *
 * Phone numbers, emails, and long digit runs are replaced before feedback or
 * an Owner question reaches a provider. Raw text stays in the
 * permission-controlled field.
 */
export const PII_REDACTED = '[redacted]';

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/g;
const LONG_DIGITS_PATTERN = /\d{8,}/g;

export function maskPersonalData(text: string): string {
  return text
    .replace(EMAIL_PATTERN, PII_REDACTED)
    .replace(PHONE_PATTERN, PII_REDACTED)
    .replace(LONG_DIGITS_PATTERN, PII_REDACTED);
}

/** True when masking changed the text, so the caller can count masked rows. */
export function containsPersonalData(text: string): boolean {
  return maskPersonalData(text) !== text;
}
