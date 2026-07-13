import React from 'react';
import { Settings, Save } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="p-6 md:p-12 w-full max-w-3xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-tighter flex items-center gap-3">
            <Settings className="w-8 h-8" />
            Cấu hình
          </h1>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mt-2">Thiết lập thông tin cửa hàng</p>
        </div>
      </div>

      <div className="bg-white border-hard shadow-hard p-6 md:p-10">
        <form className="space-y-8">
          <div className="space-y-3">
            <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Tên cửa hàng</label>
            <input 
              type="text" 
              defaultValue="Phở Kinh Kỳ"
              className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors uppercase tracking-tight"
            />
          </div>

          <div className="space-y-3">
            <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Mã số thuế / Kinh doanh</label>
            <input 
              type="text" 
              defaultValue="0101234567"
              className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors uppercase tracking-tight"
            />
          </div>

          <div className="space-y-3">
            <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Loại hình kinh doanh</label>
            <select className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm font-bold text-zinc-900 focus:outline-none focus:border-orange-600 cursor-pointer transition-colors uppercase">
              <option value="quan_an">Quán ăn / Phở</option>
              <option value="quan_cafe">Quán Café</option>
              <option value="nha_hang">Nhà hàng / Quán nhậu</option>
            </select>
          </div>

          <div className="space-y-3 pt-6 border-t border-hard">
            <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Tiền tệ & Thanh toán</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-4 border-hard cursor-pointer hover:bg-zinc-50 transition-colors">
                <input type="radio" name="paymentType" className="w-4 h-4 accent-orange-600" defaultChecked />
                <span className="font-mono text-xs font-bold uppercase tracking-widest">Trả sau (Ăn xong tính)</span>
              </label>
              <label className="flex items-center gap-3 p-4 border-hard cursor-pointer hover:bg-zinc-50 transition-colors">
                <input type="radio" name="paymentType" className="w-4 h-4 accent-orange-600" />
                <span className="font-mono text-xs font-bold uppercase tracking-widest">Trả trước (Làm món)</span>
              </label>
            </div>
          </div>

          <div className="pt-8">
            <button type="button" className="w-full bg-zinc-950 text-white font-mono font-bold text-xs uppercase tracking-widest px-6 py-4 border-hard shadow-hard flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer">
              <Save className="w-4 h-4" />
              Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
