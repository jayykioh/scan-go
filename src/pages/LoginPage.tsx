import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/dashboard');
  };

  return (
    <div className="w-full">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900 tracking-tighter uppercase mb-2">Đăng nhập</h1>
        <p className="font-mono text-xs text-zinc-500 uppercase tracking-wider">Truy cập hệ thống POS của bạn</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="email" className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest flex justify-between">
            <span>Email</span>
            <span className="text-zinc-400 font-normal">Bắt buộc</span>
          </label>
          <input
            id="email"
            type="email"
            placeholder="nam@scango.vn"
            required
            className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:ring-0 focus:border-orange-600 transition-colors rounded-none font-mono text-sm placeholder:text-zinc-300 shadow-sm"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-end mb-1">
            <label htmlFor="password" className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest">
              Mật khẩu
            </label>
            <a href="#" className="font-mono text-[10px] text-zinc-500 hover:text-orange-600 cursor-pointer underline underline-offset-4">
              Khôi phục?
            </a>
          </div>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            required
            className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:ring-0 focus:border-orange-600 transition-colors rounded-none font-mono text-sm placeholder:text-zinc-300 shadow-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-zinc-950 text-white font-bold py-4 mt-8 border-hard shadow-hard hover:-translate-y-1 hover:shadow-[4px_6px_0px_0px_#27272a] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2 group uppercase tracking-widest text-xs"
        >
          Truy cập hệ thống
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </form>

      <div className="mt-12 pt-6 border-t border-hard">
        <p className="font-mono text-xs text-zinc-500">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-bold text-zinc-900 hover:text-orange-600 cursor-pointer underline underline-offset-4 transition-colors">
            Khởi tạo ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
