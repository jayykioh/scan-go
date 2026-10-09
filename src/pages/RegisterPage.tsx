import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  isFirebaseConfigured,
  mapAuthError,
  registerOwner,
  registerWithEmail,
} from '../data/adapters/auth.adapter';
import { useToast } from '../contexts/ToastContext';

export default function RegisterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [configured] = useState(() => isFirebaseConfigured());
  const [displayName, setDisplayName] = useState('');
  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await registerWithEmail(email.trim(), password, displayName);
      await registerOwner(shopName.trim(), displayName.trim() || null);
      toast.success('Khởi tạo thành công.');
      navigate('/dashboard');
    } catch (error) {
      toast.error(mapAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900 tracking-tighter uppercase mb-2">Tạo hệ thống mới</h1>
        <p className="font-mono text-xs text-zinc-500 uppercase tracking-wider">Khởi tạo không gian POS của riêng bạn</p>
      </div>

      {!configured && (
        <div className="mb-6 p-4 border-hard bg-amber-50 font-mono text-[11px] leading-relaxed text-amber-900">
          Firebase chưa được cấu hình. Sao chép <b>.env.example</b> sang{' '}
          <b>.env.local</b> và điền sáu giá trị <b>VITE_FIREBASE_*</b>, rồi tải
          lại trang.
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="displayName" className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest flex justify-between">
            <span>Tên chủ cửa hàng</span>
            <span className="text-zinc-400 font-normal">Bắt buộc</span>
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nguyễn Văn Nam"
            required
            autoComplete="name"
            disabled={!configured || loading}
            className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:ring-0 focus:border-orange-600 transition-colors rounded-none font-mono text-sm placeholder:text-zinc-300 shadow-sm disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="shopName" className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest flex justify-between">
            <span>Tên cửa hàng</span>
            <span className="text-zinc-400 font-normal">Bắt buộc</span>
          </label>
          <input
            id="shopName"
            type="text"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Phở Kinh Kỳ"
            required
            disabled={!configured || loading}
            className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:ring-0 focus:border-orange-600 transition-colors rounded-none font-mono text-sm placeholder:text-zinc-300 shadow-sm disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest flex justify-between">
            <span>Email định danh</span>
            <span className="text-zinc-400 font-normal">Bắt buộc</span>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nam@scango.vn"
            required
            autoComplete="email"
            disabled={!configured || loading}
            className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:ring-0 focus:border-orange-600 transition-colors rounded-none font-mono text-sm placeholder:text-zinc-300 shadow-sm disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest">
            Mật khẩu
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            autoComplete="new-password"
            disabled={!configured || loading}
            className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:ring-0 focus:border-orange-600 transition-colors rounded-none font-mono text-sm placeholder:text-zinc-300 shadow-sm disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={!configured || loading}
          className="w-full bg-orange-600 text-white font-bold py-4 mt-8 border-hard shadow-hard hover:-translate-y-1 hover:shadow-[4px_6px_0px_0px_#27272a] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2 group uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Đang khởi tạo...' : 'Khởi tạo'}
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </form>

      <div className="mt-12 pt-6 border-t border-hard">
        <p className="font-mono text-xs text-zinc-500">
          Đã có không gian?{' '}
          <Link to="/login" className="font-bold text-zinc-900 hover:text-orange-600 cursor-pointer underline underline-offset-4 transition-colors">
            Truy cập
          </Link>
        </p>
      </div>
    </div>
  );
}
