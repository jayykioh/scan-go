import React, { useCallback, useEffect, useState } from 'react';
import { Users, Plus, Pencil, X, AlertTriangle, ShieldCheck, KeyRound, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { StaffAccount, StaffRole } from '@contracts/staff.contract';
import { useToast } from '../../contexts/ToastContext';
import { useActiveTenantId } from '../../hooks/useActiveTenantId';
import {
  createStaff,
  listStaff,
  resetStaffPin,
  setStaffActive,
  updateStaff,
} from '../../data/adapters/staff.adapter';

interface RoleBooleans {
  isKitchen: boolean;
  isWaiter: boolean;
  isCashier: boolean;
}

interface StaffForm {
  mode: 'create' | 'edit';
  uid: string | null;
  displayName: string;
  email: string;
  password: string;
  pin: string;
  roles: RoleBooleans;
}

const ROLE_OPTIONS: Array<{ key: keyof RoleBooleans; role: StaffRole; label: string }> = [
  { key: 'isKitchen', role: 'kitchen', label: 'Bếp' },
  { key: 'isWaiter', role: 'waiter', label: 'Phục vụ' },
  { key: 'isCashier', role: 'cashier', label: 'Thu ngân' },
];

const ROLE_LABELS: Record<StaffRole, string> = {
  kitchen: 'Bếp',
  waiter: 'Phục vụ',
  cashier: 'Thu ngân',
};

function rolesToBooleans(roles: StaffRole[]): RoleBooleans {
  return {
    isKitchen: roles.includes('kitchen'),
    isWaiter: roles.includes('waiter'),
    isCashier: roles.includes('cashier'),
  };
}

function booleansToRoles(roles: RoleBooleans): StaffRole[] {
  const selected: StaffRole[] = [];
  if (roles.isKitchen) selected.push('kitchen');
  if (roles.isWaiter) selected.push('waiter');
  if (roles.isCashier) selected.push('cashier');
  return selected;
}

function roleLabel(staff: StaffAccount): string {
  const labels = staff.roles.map((role) => ROLE_LABELS[role]);
  return labels.join(', ') || 'Chưa cấp quyền';
}

const emptyForm = (): StaffForm => ({
  mode: 'create',
  uid: null,
  displayName: '',
  email: '',
  password: '',
  pin: '',
  roles: { isKitchen: false, isWaiter: false, isCashier: true },
});

const editForm = (staff: StaffAccount): StaffForm => ({
  mode: 'edit',
  uid: staff.uid,
  displayName: staff.displayName ?? '',
  email: staff.email ?? '',
  password: '',
  pin: '',
  roles: rolesToBooleans(staff.roles),
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Thao tác nhân sự thất bại.';
}

export default function StaffPage() {
  const tenantId = useActiveTenantId();
  const toast = useToast();
  const [staffList, setStaffList] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffForm | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setStaffList(await listStaff(tenantId));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !editingStaff || saving) return;

    const displayName = editingStaff.displayName.trim();
    const roles = booleansToRoles(editingStaff.roles);
    if (!displayName) {
      toast.error('Vui lòng nhập tên nhân sự');
      return;
    }
    if (roles.length === 0) {
      toast.error('Chọn ít nhất một vai trò');
      return;
    }

    setSaving(true);
    try {
      if (editingStaff.mode === 'create') {
        if (!/^\d{4,10}$/.test(editingStaff.pin)) {
          toast.error('PIN phải gồm 4-10 chữ số');
          return;
        }
        await createStaff({
          tenantId,
          email: editingStaff.email.trim(),
          password: editingStaff.password,
          displayName,
          roles,
          permissions: [],
          pin: editingStaff.pin,
        });
        toast.success('Đã tạo tài khoản nhân viên');
      } else if (editingStaff.uid) {
        await updateStaff({
          tenantId,
          uid: editingStaff.uid,
          displayName,
          roles,
          permissions: [],
        });
        if (editingStaff.pin) {
          if (!/^\d{4,10}$/.test(editingStaff.pin)) {
            toast.error('PIN phải gồm 4-10 chữ số');
            return;
          }
          await resetStaffPin({
            tenantId,
            uid: editingStaff.uid,
            pin: editingStaff.pin,
          });
        }
        toast.success('Đã cập nhật nhân sự');
      }
      setEditingStaff(null);
      await refresh();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (staff: StaffAccount) => {
    if (!tenantId) return;
    try {
      await setStaffActive({
        tenantId,
        uid: staff.uid,
        isActive: !staff.isActive,
      });
      toast.success(staff.isActive ? 'Đã tạm ngưng nhân sự' : 'Đã kích hoạt nhân sự');
      await refresh();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  if (!tenantId) {
    return (
      <div className="p-6 md:p-12 w-full max-w-3xl mx-auto">
        <div className="border-hard bg-white p-8 shadow-hard space-y-3">
          <ShieldCheck className="w-8 h-8 text-orange-600" />
          <h1 className="text-2xl font-black uppercase tracking-tight text-zinc-950">
            Nhân sự
          </h1>
          <p className="text-sm text-zinc-600">
            Chọn hoặc tạo cửa hàng trước khi quản lý nhân sự.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-12 w-full max-w-6xl mx-auto animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-tighter flex items-center gap-3">
            <Users className="w-8 h-8" />
            Nhân sự
          </h1>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mt-2">
            Tài khoản, vai trò và PIN đăng nhập
          </p>
        </div>
        <button
          onClick={() => setEditingStaff(emptyForm())}
          className="bg-orange-600 text-white font-mono font-bold text-xs uppercase tracking-widest px-6 py-3 border-hard shadow-hard flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Thêm nhân sự
        </button>
      </div>

      <div className="mb-5 bg-white border-hard shadow-hard p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-sm font-bold text-zinc-900">Tài khoản do chủ quán tạo</p>
            <p className="text-xs text-zinc-500">
              Mỗi nhân viên có email, mật khẩu và PIN riêng. PIN chỉ lưu dạng băm.
            </p>
          </div>
        </div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {staffList.filter((staff) => staff.isActive).length}/{staffList.length} active
        </span>
      </div>

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border-hard shadow-hard overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[820px]">
          <thead>
            <tr className="bg-zinc-950 text-white font-mono text-[10px] uppercase tracking-widest">
              <th className="p-4 font-bold border-b border-hard">Nhân sự</th>
              <th className="p-4 font-bold border-b border-hard">Email</th>
              <th className="p-4 font-bold border-b border-hard">Vai trò</th>
              <th className="p-4 font-bold border-b border-hard">Trạng thái</th>
              <th className="p-4 font-bold border-b border-hard text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && staffList.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-500 font-mono text-sm uppercase tracking-widest">
                  <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> Đang tải
                </td>
              </tr>
            ) : staffList.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-500 font-mono text-sm uppercase tracking-widest">
                  Chưa có nhân sự nào. Bấm "Thêm nhân sự" để tạo tài khoản.
                </td>
              </tr>
            ) : (
              staffList.map((staff) => (
                <tr key={staff.uid} className="hover:bg-zinc-50 transition-colors group">
                  <td className="p-4 border-b border-hard">
                    <p className="font-bold text-zinc-900 uppercase tracking-tight">
                      {staff.displayName ?? 'Nhân viên'}
                    </p>
                    <p className="font-mono text-[10px] text-zinc-400 mt-1">
                      #{staff.uid.slice(-8)} · {staff.hasPin ? 'Đã đặt PIN' : 'Chưa có PIN'}
                    </p>
                  </td>
                  <td className="p-4 font-mono text-xs text-zinc-600 border-b border-hard">
                    {staff.email ?? '—'}
                  </td>
                  <td className="p-4 font-mono text-xs text-zinc-600 border-b border-hard uppercase">
                    {roleLabel(staff)}
                  </td>
                  <td className="p-4 border-b border-hard">
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(staff)}
                      className={`font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-1 border-hard cursor-pointer ${
                        staff.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {staff.isActive ? 'Hoạt động' : 'Tạm ngưng'}
                    </button>
                  </td>
                  <td className="p-4 border-b border-hard text-right">
                    <button
                      onClick={() => setEditingStaff(editForm(staff))}
                      className="p-2 border-hard text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                      title="Sửa"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingStaff &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white border-hard shadow-[8px_8px_0_0_#09090b] w-full max-w-md">
              <div className="flex justify-between items-center p-4 border-b border-hard bg-zinc-950 text-white">
                <h2 className="font-mono font-bold text-sm uppercase tracking-widest">
                  {editingStaff.mode === 'create' ? 'Thêm nhân sự mới' : 'Cập nhật nhân sự'}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Họ tên
                  </label>
                  <input
                    type="text"
                    autoFocus
                    required
                    value={editingStaff.displayName}
                    onChange={(e) =>
                      setEditingStaff({ ...editingStaff, displayName: e.target.value })
                    }
                    className="w-full bg-zinc-50 border-hard px-4 py-3 font-bold text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors"
                    placeholder="Nhập họ tên đầy đủ"
                  />
                </div>

                {editingStaff.mode === 'create' && (
                  <>
                    <div className="space-y-2">
                      <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">
                        Email đăng nhập
                      </label>
                      <input
                        type="email"
                        required
                        value={editingStaff.email}
                        onChange={(e) =>
                          setEditingStaff({ ...editingStaff, email: e.target.value })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors"
                        placeholder="nhanvien@quan.vn"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">
                        Mật khẩu tạm
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={editingStaff.password}
                        onChange={(e) =>
                          setEditingStaff({ ...editingStaff, password: e.target.value })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors"
                        placeholder="Ít nhất 6 ký tự"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">
                    {editingStaff.mode === 'create' ? 'PIN đăng nhập ca' : 'PIN mới (bỏ trống nếu giữ nguyên)'}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={10}
                    required={editingStaff.mode === 'create'}
                    value={editingStaff.pin}
                    onChange={(e) =>
                      setEditingStaff({
                        ...editingStaff,
                        pin: e.target.value.replace(/\D/g, ''),
                      })
                    }
                    className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono font-bold tracking-[0.4em] text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors"
                    placeholder="0000"
                  />
                </div>

                <fieldset className="space-y-2">
                  <legend className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Vai trò
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {ROLE_OPTIONS.map(({ key, label }) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 p-3 border-hard cursor-pointer hover:bg-zinc-50 font-bold text-xs uppercase tracking-widest"
                      >
                        <input
                          type="checkbox"
                          checked={editingStaff.roles[key]}
                          onChange={(e) =>
                            setEditingStaff({
                              ...editingStaff,
                              roles: { ...editingStaff.roles, [key]: e.target.checked },
                            })
                          }
                          className="accent-orange-600"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingStaff(null)}
                    className="flex-1 bg-white border-hard text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-100 transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-zinc-950 border-hard text-white font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    Lưu
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      <div className="mt-6 flex items-start gap-3 border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <p className="text-xs leading-relaxed">
          Nhân viên đăng nhập tại màn hình đăng nhập bằng email và mật khẩu tạm, sau đó nhập PIN ca.
          Chủ quán nên đổi mật khẩu tạm cho nhân viên khi bàn giao.
        </p>
      </div>
    </div>
  );
}
