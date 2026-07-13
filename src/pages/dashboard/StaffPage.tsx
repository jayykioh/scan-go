import React, { useState } from 'react';
import { Users, Plus, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { usePersistentState } from '../../hooks/usePersistentState';

interface Staff {
  id: string;
  name: string;
  role: string;
  status: 'Hoạt động' | 'Nghỉ phép';
}

const INITIAL_STAFF: Staff[] = [
  { id: '1', name: 'Nguyễn Văn A', role: 'Thu Ngân', status: 'Hoạt động' },
  { id: '2', name: 'Trần Thị B', role: 'Đầu Bếp', status: 'Hoạt động' },
  { id: '3', name: 'Lê Văn C', role: 'Thu Ngân', status: 'Nghỉ phép' },
];

export default function StaffPage() {
  const [staffList, setStaffList] = usePersistentState<Staff[]>('scango:staff:v1', INITIAL_STAFF);
  const toast = useToast();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  // Form states
  const [formData, setFormData] = useState<Partial<Staff>>({
    name: '',
    role: 'Thu Ngân',
    status: 'Hoạt động'
  });

  const handleOpenAdd = () => {
    setFormData({ name: '', role: 'Thu Ngân', status: 'Hoạt động' });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (staff: Staff) => {
    setSelectedStaff(staff);
    setFormData(staff);
    setIsEditModalOpen(true);
  };

  const handleOpenDelete = (staff: Staff) => {
    setSelectedStaff(staff);
    setIsDeleteModalOpen(true);
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      toast.error('Vui lòng nhập tên nhân sự');
      return;
    }
    const newStaff: Staff = {
      id: Date.now().toString(),
      name: formData.name.trim(),
      role: formData.role || 'Thu Ngân',
      status: formData.status as 'Hoạt động' | 'Nghỉ phép' || 'Hoạt động'
    };
    setStaffList([...staffList, newStaff]);
    setIsAddModalOpen(false);
    toast.success(`Đã thêm nhân sự: ${newStaff.name}`);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !selectedStaff) {
      toast.error('Vui lòng nhập tên nhân sự');
      return;
    }
    setStaffList(staffList.map(s => s.id === selectedStaff.id ? { ...s, ...formData } as Staff : s));
    setIsEditModalOpen(false);
    toast.success(`Đã cập nhật thông tin: ${formData.name}`);
  };

  const handleConfirmDelete = () => {
    if (!selectedStaff) return;
    setStaffList(staffList.filter(s => s.id !== selectedStaff.id));
    setIsDeleteModalOpen(false);
    toast.success(`Đã xóa nhân sự: ${selectedStaff.name}`);
  };

  return (
    <div className="p-6 md:p-12 w-full max-w-5xl mx-auto animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-tighter flex items-center gap-3">
            <Users className="w-8 h-8" />
            Nhân sự
          </h1>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mt-2">Quản lý phân quyền & tài khoản</p>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="bg-orange-600 text-white font-mono font-bold text-xs uppercase tracking-widest px-6 py-3 border-hard shadow-hard flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Thêm nhân sự
        </button>
      </div>

      <div className="bg-white border-hard shadow-hard overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-zinc-950 text-white font-mono text-[10px] uppercase tracking-widest">
              <th className="p-4 font-bold border-b border-hard">ID</th>
              <th className="p-4 font-bold border-b border-hard">Họ Tên</th>
              <th className="p-4 font-bold border-b border-hard">Vai Trò</th>
              <th className="p-4 font-bold border-b border-hard">Trạng Thái</th>
              <th className="p-4 font-bold border-b border-hard text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {staffList.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-500 font-mono text-sm uppercase tracking-widest">
                  Chưa có nhân sự nào.
                </td>
              </tr>
            ) : (
              staffList.map((staff) => (
                <tr key={staff.id} className="hover:bg-zinc-50 transition-colors group">
                  <td className="p-4 font-mono text-xs font-bold text-zinc-500 border-b border-hard">
                    #{staff.id.slice(-4)}
                  </td>
                  <td className="p-4 font-bold text-zinc-900 border-b border-hard uppercase tracking-tight">
                    {staff.name}
                  </td>
                  <td className="p-4 font-mono text-xs text-zinc-600 border-b border-hard uppercase">
                    {staff.role}
                  </td>
                  <td className="p-4 border-b border-hard">
                    <span className={`font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-1 border-hard ${staff.status === 'Hoạt động' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'}`}>
                      {staff.status}
                    </span>
                  </td>
                  <td className="p-4 border-b border-hard text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleOpenEdit(staff)}
                        className="p-2 border-hard text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer" 
                        title="Sửa"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleOpenDelete(staff)}
                        className="p-2 border-hard text-zinc-500 hover:text-white hover:bg-red-500 transition-colors cursor-pointer" 
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border-hard shadow-[8px_8px_0_0_#09090b] w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b border-hard bg-zinc-950 text-white">
              <h2 className="font-mono font-bold text-sm uppercase tracking-widest">
                {isAddModalOpen ? 'Thêm nhân sự mới' : 'Cập nhật nhân sự'}
              </h2>
              <button 
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={isAddModalOpen ? handleSaveAdd : handleSaveEdit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">Họ tên</label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-zinc-50 border-hard px-4 py-3 font-bold text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors"
                  placeholder="Nhập họ tên đầy đủ"
                />
              </div>
              <div className="space-y-2">
                <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">Vai trò</label>
                <select 
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="w-full bg-zinc-50 border-hard px-4 py-3 font-bold text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors uppercase cursor-pointer"
                >
                  <option value="Quản Lý">Quản Lý</option>
                  <option value="Thu Ngân">Thu Ngân</option>
                  <option value="Đầu Bếp">Đầu Bếp</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">Trạng thái</label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as 'Hoạt động' | 'Nghỉ phép'})}
                  className="w-full bg-zinc-50 border-hard px-4 py-3 font-bold text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors uppercase cursor-pointer"
                >
                  <option value="Hoạt động">Hoạt động</option>
                  <option value="Nghỉ phép">Nghỉ phép</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                  className="flex-1 bg-white border-hard text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-zinc-950 border-hard text-white font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Warning Modal */}
      {isDeleteModalOpen && selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border-hard shadow-[8px_8px_0_0_#ef4444] w-full max-w-sm">
            <div className="flex flex-col items-center text-center p-6 space-y-4">
              <div className="w-16 h-16 bg-red-100 border-hard flex items-center justify-center text-red-600">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-xl text-zinc-900 uppercase tracking-tight">Xóa nhân sự?</h3>
                <p className="text-zinc-500 mt-2 text-sm">Bạn có chắc chắn muốn xóa <span className="font-bold text-zinc-900">{selectedStaff.name}</span> khỏi hệ thống? Hành động này không thể hoàn tác.</p>
              </div>
              <div className="flex w-full gap-3 pt-2">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 bg-white border-hard text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button 
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-600 border-hard text-white font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-red-700 transition-colors cursor-pointer shadow-[2px_2px_0_0_#7f1d1d]"
                >
                  Xóa ngay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
