import React from 'react';
import { Users, Plus, Pencil, Trash2 } from 'lucide-react';

const MOCK_STAFF = [
  { id: 1, name: 'Nguyễn Văn A', role: 'Thu Ngân', status: 'Hoạt động' },
  { id: 2, name: 'Trần Thị B', role: 'Đầu Bếp', status: 'Hoạt động' },
  { id: 3, name: 'Lê Văn C', role: 'Thu Ngân', status: 'Nghỉ phép' },
];

export default function StaffPage() {
  return (
    <div className="p-6 md:p-12 w-full max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-tighter flex items-center gap-3">
            <Users className="w-8 h-8" />
            Nhân sự
          </h1>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mt-2">Quản lý phân quyền & tài khoản</p>
        </div>
        <button className="bg-orange-600 text-white font-mono font-bold text-xs uppercase tracking-widest px-6 py-3 border-hard shadow-hard flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer">
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
            {MOCK_STAFF.map((staff) => (
              <tr key={staff.id} className="hover:bg-zinc-50 transition-colors group">
                <td className="p-4 font-mono text-xs font-bold text-zinc-500 border-b border-hard">
                  #{staff.id.toString().padStart(3, '0')}
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
                    <button className="p-2 border-hard text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer" aria-label="Sửa">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button className="p-2 border-hard text-zinc-500 hover:text-white hover:bg-red-500 transition-colors cursor-pointer" aria-label="Xóa">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
