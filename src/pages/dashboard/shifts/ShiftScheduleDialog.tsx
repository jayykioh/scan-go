import React, { useEffect, useState } from 'react';
import { XCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { StaffDirectoryEntry } from '@contracts/staff.contract';
import { combineDayAndTime, todayDayKey } from './shiftPlan';

export interface ShiftDraft {
  dayKey: string;
  startTime: string;
  endTime: string;
  label: string;
  staffUids: string[];
}

export interface ShiftScheduleDialogProps {
  /** Day the dialog opens on; the Owner can change it. */
  defaultDay?: string;
  /** Candidates: active directory members the Owner may put on the Shift. */
  staff: StaffDirectoryEntry[];
  saving: boolean;
  onSave: (draft: ShiftDraft) => void;
  onClose: () => void;
}

/**
 * Plan one interval for several Staff members (REQ-HRM-004). The Owner picks
 * who works; a Staff member never chooses their own Shift. Nothing is written
 * until Lưu, and the server rejects the whole save on any overlap.
 */
export default function ShiftScheduleDialog({
  defaultDay,
  staff,
  saving,
  onSave,
  onClose,
}: ShiftScheduleDialogProps) {
  const [dayKey, setDayKey] = useState(defaultDay ?? todayDayKey());
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [label, setLabel] = useState('');
  const [staffUids, setStaffUids] = useState<string[]>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  const toggleStaff = (uid: string): void => {
    setStaffUids((current) =>
      current.includes(uid)
        ? current.filter((entry) => entry !== uid)
        : [...current, uid],
    );
  };

  const ordered =
    startTime.length > 0 &&
    endTime.length > 0 &&
    Date.parse(combineDayAndTime(dayKey, endTime)) >
      Date.parse(combineDayAndTime(dayKey, startTime));
  const canSave =
    !saving && staffUids.length > 0 && startTime.length > 0 && endTime.length > 0 && ordered;

  const inputClass =
    'w-full border-hard bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-orange-600';
  const labelClass =
    'font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-900';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-zinc-950/40 p-4 pt-10 backdrop-blur-sm">
      <div
        data-testid="shift-scheduler"
        className="w-full max-w-xl animate-fadeIn border-hard bg-white shadow-hard"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hard bg-zinc-50 p-6">
          <div>
            <h3 className="text-lg font-bold uppercase tracking-tight">
              Thêm ca làm
            </h3>
            <p className="mt-1 text-xs font-medium text-zinc-500">
              Chọn ngày, giờ và nhân viên. Nhân viên không tự chọn ca; giờ công
              chỉ tính từ lúc nhân viên nhận ca.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Đóng"
            className="flex h-11 w-11 shrink-0 items-center justify-center border-hard bg-white shadow-hard hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <form
          className="space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            onSave({ dayKey, startTime, endTime, label: label.trim(), staffUids });
          }}
        >
          <div className="space-y-2">
            <label className={labelClass} htmlFor="shift-day">
              Ngày
            </label>
            <input
              id="shift-day"
              type="date"
              required
              value={`${dayKey.slice(0, 4)}-${dayKey.slice(4, 6)}-${dayKey.slice(6, 8)}`}
              onChange={(event) =>
                setDayKey(event.target.value.replaceAll('-', ''))
              }
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={labelClass} htmlFor="shift-start">
                Bắt đầu
              </label>
              <input
                id="shift-start"
                type="time"
                required
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass} htmlFor="shift-end">
                Kết thúc
              </label>
              <input
                id="shift-end"
                type="time"
                required
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          {!ordered && (
            <p role="alert" className="text-xs font-bold text-red-600">
              Giờ kết thúc phải sau giờ bắt đầu.
            </p>
          )}

          <div className="space-y-2">
            <label className={labelClass} htmlFor="shift-label">
              Tên ca (không bắt buộc)
            </label>
            <input
              id="shift-label"
              type="text"
              maxLength={40}
              placeholder="Ca sáng"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className={inputClass}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className={labelClass}>
              Nhân viên ({staffUids.length} đã chọn)
            </legend>
            {staff.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Chưa có nhân viên nào đang hoạt động.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto border-hard">
                {staff.map((member) => (
                  <label
                    key={member.uid}
                    className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-b-0 hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      checked={staffUids.includes(member.uid)}
                      onChange={() => toggleStaff(member.uid)}
                      aria-label={member.displayName ?? member.uid}
                      className="h-5 w-5"
                    />
                    <span className="text-sm font-bold text-zinc-900">
                      {member.displayName ?? member.uid}
                    </span>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      {member.roles.join(', ')}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex flex-col gap-3 border-t border-hard pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-11 border-hard bg-white px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest shadow-hard hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="min-h-11 bg-orange-600 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white border-hard shadow-hard hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu ca làm'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
