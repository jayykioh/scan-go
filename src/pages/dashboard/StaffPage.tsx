import React, { useState } from 'react';
import { Users, Plus, Pencil, Trash2, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { usePersistentState } from '../../hooks/usePersistentState';
import { createPortal } from 'react-dom';
import { StaffAccount } from '../../types';
import { MOCK_STAFF_ACCOUNTS } from '../../mockData';

const emptyStaff = (): StaffAccount => ({
  id: `staff_${Date.now()}`,
  name: '',
  pin: '',
  roles: { isKitchen: false, isWaiter: false, isCashier: true },
  isActive: true,
});

const roleLabel = (staff: StaffAccount) => {
  const roles = [];
  if (staff.roles.isKitchen) roles.push('Bếp');
  if (staff.roles.isWaiter) roles.push('Phục vụ');
  if (staff.roles.isCashier) roles.push('Thu ngân');
  return roles.join(', ') || 'Chưa cấp quyền';
};

const deserializeStaff = (value: string): StaffAccount[] => {
  const parsed = JSON.parse(value) as unknown[];
  const migrated = parsed
    .map((entry: any): StaffAccount | null => {
      if (entry?.roles && typeof entry.pin === 'string') {
        return {
          id: String(entry.id),
          name: String(entry.name || 'Nhân viên'),
          pin: entry.pin,
          roles: {
            isKitchen: Boolean(entry.roles.isKitchen),
            isWaiter: Boolean(entry.roles.isWaiter),
            isCashier: Boolean(entry.roles.isCashier),
          },
          isActive: entry.isActive !== false,
        };
      }

      if (entry?.role) {
        const role = String(entry.role).toLowerCase();
        return {
          id: String(entry.id || `staff_${Date.now()}`),
          name: String(entry.name || 'Nhân viên'),
          pin: '0000',
          roles: {
            isKitchen: role.includes('bếp') || role.includes('đầu'),
            isWaiter: role.includes('phục'),
            isCashier: role.includes('thu') || role.includes('quản'),
          },
          isActive: entry.status !== 'Nghỉ phép',
        };
      }

      return null;
    })
    .filter((entry): entry is StaffAccount => entry !== null);

  return migrated.length > 0 ? migrated : MOCK_STAFF_ACCOUNTS;
};

export default function StaffPage() {
  const [staffList, setStaffList] = usePersistentState<StaffAccount[]>('scango:staff:v1', MOCK_STAFF_ACCOUNTS, {
    deserialize: deserializeStaff,
  });
  const [editingStaff, setEditingStaff] = useState<StaffAccount | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<StaffAccount | null>(null);
  const toast = useToast();

  const handleOpenAdd = () => setEditingStaff(emptyStaff());
  const handleOpenEdit = (staff: StaffAccount) => setEditingStaff({ ...staff, roles: { ...staff.roles } });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    if (!editingStaff.name.trim()) {
      toast.error('Vui lòng nhập tên nhân sự');
      return;
    }

    if (!/^\d{3,6}$/.test(editingStaff.pin)) {
      toast.error('PIN phải gồm 3-6 chữ số');
      return;
    }

    if (!editingStaff.roles.isKitchen && !editingStaff.roles.isWaiter && !editingStaff.roles.isCashier) {
      toast.error('Chọn ít nhất một vai trò');
      return;
    }

    const normalized = { ...editingStaff, name: editingStaff.name.trim() };
    const exists = staffList.some(staff => staff.id === normalized.id);
    setStaffList(prev => exists
      ? prev.map(staff => staff.id === normalized.id ? normalized : staff)
      : [...prev, normalized]
    );
    setEditingStaff(null);
    toast.success(exists ? 'Đã cập nhật nhân sự' : 'Đã thêm nhân sự');
  };

  const handleToggleActive = (id: string) => {
    setStaffList(prev => prev.map(staff => staff.id === id ? { ...staff, isActive: !staff.isActive } : staff));
  };

  const handleConfirmDelete = () => {
    if (!deletingStaff) return;
    setStaffList(prev => prev.filter(staff => staff.id !== deletingStaff.id));
    toast.success(`Đã xóa nhân sự: ${deletingStaff.name}`);
    setDeletingStaff(null);
  };

  return (
    <div className="p-6 md:p-12 w-full max-w-6xl mx-auto animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-tighter flex items-center gap-3">
            <Users className="w-8 h-8" />
            Nhân sự
          </h1>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mt-2">Quản lý PIN, ca làm và vai trò simulator</p>
        </div>
        <button
          onClick={handleOpenAdd}
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
            <p className="text-sm font-bold text-zinc-900">PIN demo đang hoạt động</p>
            <p className="text-xs text-zinc-500">Mặc định: Thu ngân `1111`, Bếp `2222`, Phục vụ/Thu ngân `3333`.</p>
          </div>
        </div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{staffList.filter(staff => staff.isActive).length}/{staffList.length} active</span>
      </div>

      <div className="bg-white border-hard shadow-hard overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-zinc-950 text-white font-mono text-[10px] uppercase tracking-widest">
              <th className="p-4 font-bold border-b border-hard">Nhân sự</th>
              <th className="p-4 font-bold border-b border-hard">PIN</th>
              <th className="p-4 font-bold border-b border-hard">Vai trò</th>
              <th className="p-4 font-bold border-b border-hard">Trạng thái</th>
              <th className="p-4 font-bold border-b border-hard text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {staffList.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-500 font-mono text-sm uppercase tracking-widest">Chưa có nhân sự nào.</td>
              </tr>
            ) : staffList.map(staff => (
              <tr key={staff.id} className="hover:bg-zinc-50 transition-colors group">
                <td className="p-4 border-b border-hard">
                  <p className="font-bold text-zinc-900 uppercase tracking-tight">{staff.name}</p>
                  <p className="font-mono text-[10px] text-zinc-400 mt-1">#{staff.id.slice(-8)}</p>
                </td>
                <td className="p-4 font-mono text-xs font-bold text-zinc-600 border-b border-hard">{staff.pin}</td>
                <td className="p-4 font-mono text-xs text-zinc-600 border-b border-hard uppercase">{roleLabel(staff)}</td>
                <td className="p-4 border-b border-hard">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(staff.id)}
                    className={`font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-1 border-hard cursor-pointer ${staff.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'}`}
                  >
                    {staff.isActive ? 'Hoạt động' : 'Tạm ngưng'}
                  </button>
                </td>
                <td className="p-4 border-b border-hard text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleOpenEdit(staff)} className="p-2 border-hard text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer" title="Sửa">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeletingStaff(staff)} className="p-2 border-hard text-zinc-500 hover:text-white hover:bg-red-500 transition-colors cursor-pointer" title="Xóa">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingStaff && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border-hard shadow-[8px_8px_0_0_#09090b] w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b border-hard bg-zinc-950 text-white">
              <h2 className="font-mono font-bold text-sm uppercase tracking-widest">{staffList.some(staff => staff.id === editingStaff.id) ? 'Cập nhật nhân sự' : 'Thêm nhân sự mới'}</h2>
              <button onClick={() => setEditingStaff(null)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">Họ tên</label>
                <input type="text" autoFocus required value={editingStaff.name} onChange={e => setEditingStaff({ ...editingStaff, name: e.target.value })} className="w-full bg-zinc-50 border-hard px-4 py-3 font-bold text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors" placeholder="Nhập họ tên đầy đủ" />
              </div>
              <div className="space-y-2">
                <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">PIN đăng nhập</label>
                <input type="password" inputMode="numeric" maxLength={6} required value={editingStaff.pin} onChange={e => setEditingStaff({ ...editingStaff, pin: e.target.value.replace(/\D/g, '') })} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono font-bold tracking-[0.4em] text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors" placeholder="0000" />
              </div>
              <fieldset className="space-y-2">
                <legend className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">Vai trò</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    ['isKitchen', 'Bếp'],
                    ['isWaiter', 'Phục vụ'],
                    ['isCashier', 'Thu ngân'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 p-3 border-hard cursor-pointer hover:bg-zinc-50 font-bold text-xs uppercase tracking-widest">
                      <input type="checkbox" checked={editingStaff.roles[key as keyof StaffAccount['roles']]} onChange={e => setEditingStaff({ ...editingStaff, roles: { ...editingStaff.roles, [key]: e.target.checked } })} className="accent-orange-600" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 p-3 border-hard cursor-pointer hover:bg-zinc-50 font-bold text-xs uppercase tracking-widest">
                <input type="checkbox" checked={editingStaff.isActive} onChange={e => setEditingStaff({ ...editingStaff, isActive: e.target.checked })} className="accent-orange-600" />
                Tài khoản hoạt động
              </label>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setEditingStaff(null)} className="flex-1 bg-white border-hard text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-100 transition-colors cursor-pointer">Hủy</button>
                <button type="submit" className="flex-1 bg-zinc-950 border-hard text-white font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-800 transition-colors cursor-pointer">Lưu</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {deletingStaff && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border-hard shadow-[8px_8px_0_0_#ef4444] w-full max-w-sm">
            <div className="flex flex-col items-center text-center p-6 space-y-4">
              <div className="w-16 h-16 bg-red-100 border-hard flex items-center justify-center text-red-600"><AlertTriangle className="w-8 h-8" /></div>
              <div>
                <h3 className="font-bold text-xl text-zinc-900 uppercase tracking-tight">Xóa nhân sự?</h3>
                <p className="text-zinc-500 mt-2 text-sm">Xóa <span className="font-bold text-zinc-900">{deletingStaff.name}</span> khỏi hệ thống simulator.</p>
              </div>
              <div className="flex w-full gap-3 pt-2">
                <button onClick={() => setDeletingStaff(null)} className="flex-1 bg-white border-hard text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-100 transition-colors cursor-pointer">Hủy</button>
                <button onClick={handleConfirmDelete} className="flex-1 bg-red-600 border-hard text-white font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-red-700 transition-colors cursor-pointer shadow-[2px_2px_0_0_#7f1d1d]">Xóa ngay</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
