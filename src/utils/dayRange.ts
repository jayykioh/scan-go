import { REPORTING_MAX_RANGE_DAYS } from '@contracts/reporting.contract';

/**
 * Helpers for the tenant-local `yyyymmdd` day keys the reports and the Order
 * history use. Date inputs are browser-local; the server resolves a day key to
 * the tenant's midnight (REQ-RPT-001, REQ-ORD-007).
 */

export function localDayKey(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/** `YYYY-MM-DD` from an `<input type="date">` to a day key; null when empty. */
export function dayKeyFromDateInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return value.replaceAll('-', '');
}

export function dateInputFromDayKey(dayKey: string): string {
  return `${dayKey.slice(0, 4)}-${dayKey.slice(4, 6)}-${dayKey.slice(6, 8)}`;
}

export function addDaysToDayKey(dayKey: string, amount: number): string {
  const date = new Date(
    Date.UTC(
      Number(dayKey.slice(0, 4)),
      Number(dayKey.slice(4, 6)) - 1,
      Number(dayKey.slice(6, 8)),
    ),
  );
  date.setUTCDate(date.getUTCDate() + amount);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/** `dd/MM/yyyy` label for a day key. */
export function formatDayKeyLabel(dayKey: string): string {
  return `${dayKey.slice(6, 8)}/${dayKey.slice(4, 6)}/${dayKey.slice(0, 4)}`;
}

/** Inclusive day count between two keys. */
export function dayRangeLength(fromDay: string, toDay: string): number {
  const from = Date.UTC(
    Number(fromDay.slice(0, 4)),
    Number(fromDay.slice(4, 6)) - 1,
    Number(fromDay.slice(6, 8)),
  );
  const to = Date.UTC(
    Number(toDay.slice(0, 4)),
    Number(toDay.slice(4, 6)) - 1,
    Number(toDay.slice(6, 8)),
  );
  return Math.floor((to - from) / 86_400_000) + 1;
}

/** User-facing problem with a range, or null when it is usable. */
export function validateDayRange(
  fromDay: string,
  toDay: string,
  maxDays: number = REPORTING_MAX_RANGE_DAYS,
): string | null {
  if (fromDay > toDay) {
    return 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
  }
  if (dayRangeLength(fromDay, toDay) > maxDays) {
    return `Chọn tối đa ${maxDays} ngày.`;
  }
  return null;
}
