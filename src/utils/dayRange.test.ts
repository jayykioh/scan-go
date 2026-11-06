import { describe, expect, it } from 'vitest';
import {
  addDaysToDayKey,
  dateInputFromDayKey,
  dayKeyFromDateInput,
  dayRangeLength,
  formatDayKeyLabel,
  validateDayRange,
} from './dayRange';

describe('day range helpers (REQ-RPT-001, REQ-ORD-007)', () => {
  it('converts between a date input value and a day key', () => {
    expect(dayKeyFromDateInput('2026-11-06')).toBe('20261106');
    expect(dayKeyFromDateInput('')).toBeNull();
    expect(dayKeyFromDateInput('2026-13-40')).toBeNull();
    expect(dateInputFromDayKey('20261106')).toBe('2026-11-06');
  });

  it('moves across month and year boundaries', () => {
    expect(addDaysToDayKey('20261231', 1)).toBe('20270101');
    expect(addDaysToDayKey('20261101', -1)).toBe('20261031');
    expect(addDaysToDayKey('20240228', 1)).toBe('20240229');
  });

  it('counts an inclusive range and formats the label', () => {
    expect(dayRangeLength('20261101', '20261107')).toBe(7);
    expect(dayRangeLength('20261107', '20261107')).toBe(1);
    expect(formatDayKeyLabel('20261106')).toBe('06/11/2026');
  });

  it('reports a reversed range and one longer than the cap', () => {
    expect(validateDayRange('20261107', '20261101')).toBe(
      'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
    );
    expect(validateDayRange('20260101', '20260331')).toBe('Chọn tối đa 62 ngày.');
    expect(validateDayRange('20261101', '20261107')).toBeNull();
  });
});
