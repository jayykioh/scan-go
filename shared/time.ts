export const STORE_TIMEZONE = 'UTC';
export const DISPLAY_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function nowUtcIso(): string {
  return new Date().toISOString();
}

export function toUtcIso(value: Date | number | string): string {
  return new Date(value).toISOString();
}
