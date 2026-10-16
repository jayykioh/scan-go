// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffDirectoryEntry } from '@contracts/staff.contract';
import type { TenantTable } from '../../../data/adapters/table.adapter';
import ZoneEditorDialog from './ZoneEditorDialog';

afterEach(cleanup);

const table = (tableId: string, name: string, area: string | null): TenantTable => ({
  tableId,
  name,
  isActive: true,
  tokenVersion: 1,
  activeToken: `tok-${tableId}`,
  qrPayload: null,
  nfcWritten: false,
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  area,
  seats: 4,
  position: null,
  areaWaiterUids: [],
});

const waiter = (uid: string, displayName: string): StaffDirectoryEntry => ({
  schemaVersion: 1,
  tenantId: 'tenant-alpha',
  uid,
  email: `${uid}@example.com`,
  displayName,
  roles: ['waiter'],
  isActive: true,
  hasPin: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ZoneEditorDialog>> = {},
) {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render(
    <ZoneEditorDialog
      editingArea={null}
      tables={[
        table('t1', 'Bàn 1', null),
        table('t2', 'Bàn 2', 'Tầng 2'),
      ]}
      waiters={[waiter('w1', 'An'), waiter('w2', 'Bình')]}
      assignedWaiterUids={[]}
      areaLabels={['Khu chính', 'Tầng 2']}
      saving={false}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSave, onDelete, onClose };
}

/** REQ-TBL-009: the dialog authors a whole zone before one save. */
describe('ZoneEditorDialog', () => {
  it('blocks the save until the zone has a name and a table', () => {
    const { onSave } = renderDialog();

    const save = screen.getByRole('button', { name: 'Lưu khu vực' });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Tên khu vực'), {
      target: { value: 'Sân vườn' },
    });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/Bàn 1/));
    expect((save as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({
      originalLabel: null,
      label: 'Sân vườn',
      selectedTableIds: ['t1'],
      draftTables: [],
      waiterUids: [],
    });
  });

  it('adds and removes authored tables that only exist in the dialog', () => {
    const { onSave } = renderDialog();
    fireEvent.change(screen.getByLabelText('Tên khu vực'), {
      target: { value: 'Sân vườn' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Thêm bàn/ }));
    fireEvent.click(screen.getByRole('button', { name: /Thêm bàn/ }));

    fireEvent.change(screen.getByLabelText('Tên bàn mới 1'), {
      target: { value: 'Bàn 7' },
    });
    fireEvent.change(screen.getByLabelText('Số ghế bàn mới 1'), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByLabelText('Xoá bàn mới 2'));

    fireEvent.click(screen.getByRole('button', { name: 'Lưu khu vực' }));

    expect(onSave).toHaveBeenCalledWith({
      originalLabel: null,
      label: 'Sân vườn',
      selectedTableIds: [],
      draftTables: [{ name: 'Bàn 7', seats: '6' }],
      waiterUids: [],
    });
  });

  it('sends the ticked Waiters of the zone', () => {
    const { onSave } = renderDialog({ editingArea: 'Tầng 2' });
    fireEvent.click(screen.getByLabelText('Bình'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu khu vực' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        originalLabel: 'Tầng 2',
        label: 'Tầng 2',
        selectedTableIds: ['t2'],
        waiterUids: ['w2'],
      }),
    );
  });

  it('offers to delete a named zone, but never the default area', () => {
    renderDialog({ editingArea: 'Tầng 2' });
    expect(screen.getByRole('button', { name: /Xoá khu vực/ })).toBeTruthy();
    cleanup();

    renderDialog({ editingArea: 'Khu chính' });
    expect(screen.queryByRole('button', { name: /Xoá khu vực/ })).toBeNull();
  });

  it('warns that a duplicate name merges into the area that exists', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Tên khu vực'), {
      target: { value: 'Tầng 2' },
    });

    expect(screen.getByText(/gộp các bàn đã chọn/)).toBeTruthy();
  });
});
