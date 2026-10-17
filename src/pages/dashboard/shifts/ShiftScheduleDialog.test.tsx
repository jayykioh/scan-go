// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffDirectoryEntry } from '@contracts/staff.contract';
import ShiftScheduleDialog from './ShiftScheduleDialog';

afterEach(cleanup);

const member = (
  uid: string,
  displayName: string,
  isActive = true,
): StaffDirectoryEntry => ({
  schemaVersion: 1,
  tenantId: 'tenant-a',
  uid,
  email: `${uid}@example.com`,
  displayName,
  roles: ['waiter'],
  isActive,
  hasPin: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const STAFF = [member('uid-a', 'An'), member('uid-b', 'Bình')];

describe('ShiftScheduleDialog', () => {
  it('will not save until the Owner has picked a Staff member', () => {
    const onSave = vi.fn();
    render(
      <ShiftScheduleDialog
        defaultDay="20261017"
        staff={STAFF}
        saving={false}
        onSave={onSave}
        onClose={() => undefined}
      />,
    );
    const save = screen.getByRole('button', { name: 'Lưu ca làm' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the chosen interval for every ticked Staff member', () => {
    const onSave = vi.fn();
    render(
      <ShiftScheduleDialog
        defaultDay="20261017"
        staff={STAFF}
        saving={false}
        onSave={onSave}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Bắt đầu'), {
      target: { value: '08:30' },
    });
    fireEvent.change(screen.getByLabelText('Kết thúc'), {
      target: { value: '12:30' },
    });
    fireEvent.change(screen.getByLabelText('Tên ca (không bắt buộc)'), {
      target: { value: 'Ca sáng' },
    });
    fireEvent.click(screen.getByLabelText('An'));
    fireEvent.click(screen.getByLabelText('Bình'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ca làm' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      dayKey: '20261017',
      startTime: '08:30',
      endTime: '12:30',
      label: 'Ca sáng',
      staffUids: ['uid-a', 'uid-b'],
    });
  });

  it('refuses an end that is not after the start', () => {
    render(
      <ShiftScheduleDialog
        defaultDay="20261017"
        staff={STAFF}
        saving={false}
        onSave={vi.fn()}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByLabelText('An'));
    fireEvent.change(screen.getByLabelText('Kết thúc'), {
      target: { value: '07:00' },
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'Giờ kết thúc phải sau giờ bắt đầu.',
    );
    const save = screen.getByRole('button', { name: 'Lưu ca làm' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });
});
