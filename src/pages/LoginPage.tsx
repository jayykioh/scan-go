import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Phone } from 'lucide-react';
import {
  confirmPhoneCode,
  isFirebaseConfigured,
  startPhoneSignIn,
} from '../data/adapters/auth.adapter';
import { bootstrapTenant } from '../data/adapters/tenant.adapter';
import { getBackendMode } from '../services/firebase/client';
import { useToast } from '../contexts/ToastContext';

function toE164(input: string): string {
  const value = input.replace(/[^\d+]/g, '');
  if (value.startsWith('+')) return value;
  if (value.startsWith('0')) return `+84${value.slice(1)}`;
  return `+${value}`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const [configured] = useState(() => isFirebaseConfigured());
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recaptchaRef.current) return;
    setLoading(true);
    try {
      await startPhoneSignIn(toE164(phone), recaptchaRef.current);
      setStep('code');
      toast.info('Đã gửi mã OTP. Kiểm tra tin nhắn.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Không gửi được OTP.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await confirmPhoneCode(code.trim());
      await bootstrapTenant();
      toast.success('Đăng nhập thành công.');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Mã OTP không đúng.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900 tracking-tighter uppercase mb-2">
          Đăng nhập
        </h1>
        <p className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
          Truy cập hệ thống POS của bạn
        </p>
        <span
          className={`inline-block mt-3 px-2 py-1 border-hard font-mono text-[10px] uppercase tracking-widest ${
            getBackendMode() === 'local'
              ? 'bg-blue-50 text-blue-700'
              : 'bg-zinc-100 text-zinc-600'
          }`}
        >
          {getBackendMode() === 'local' ? 'Local emulator' : 'Cloud backend'}
        </span>
      </div>

      {!configured && (
        <div className="mb-6 p-4 border-hard bg-amber-50 font-mono text-[11px] leading-relaxed text-amber-900">
          Firebase chưa được cấu hình. Sao chép <b>.env.example</b> sang{' '}
          <b>.env.local</b> và điền sáu giá trị <b>VITE_FIREBASE_*</b>, rồi tải
          lại trang.
        </div>
      )}

      {step === 'phone' ? (
        <form onSubmit={handleSendCode} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="phone"
              className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest flex justify-between"
            >
              <span>Số điện thoại</span>
              <span className="text-zinc-400 font-normal">Bắt buộc</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              required
              disabled={!configured || loading}
              className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:ring-0 focus:border-orange-600 transition-colors rounded-none font-mono text-sm placeholder:text-zinc-300 shadow-sm disabled:opacity-50"
            />
          </div>

          <div ref={recaptchaRef} />

          <button
            type="submit"
            disabled={!configured || loading}
            className="w-full bg-zinc-950 text-white font-bold py-4 mt-8 border-hard shadow-hard hover:-translate-y-1 hover:shadow-[4px_6px_0px_0px_#27272a] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2 group uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Phone className="w-4 h-4" />
            {loading ? 'Đang gửi...' : 'Gửi mã OTP'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="code"
              className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest flex justify-between"
            >
              <span>Mã OTP</span>
              <span className="text-zinc-400 font-normal">
                Gửi tới {toE164(phone)}
              </span>
            </label>
            <input
              id="code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              required
              autoFocus
              className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:ring-0 focus:border-orange-600 transition-colors rounded-none font-mono text-sm tracking-[0.5em] placeholder:text-zinc-300 shadow-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-950 text-white font-bold py-4 mt-8 border-hard shadow-hard hover:-translate-y-1 hover:shadow-[4px_6px_0px_0px_#27272a] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2 group uppercase tracking-widest text-xs disabled:opacity-50"
          >
            Truy cập hệ thống
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            type="button"
            onClick={() => setStep('phone')}
            className="w-full font-mono text-[10px] text-zinc-500 hover:text-orange-600 uppercase tracking-widest cursor-pointer"
          >
            Đổi số điện thoại
          </button>
        </form>
      )}

      <div className="mt-12 pt-6 border-t border-hard">
        <p className="font-mono text-xs text-zinc-500">
          Chưa có tài khoản?{' '}
          <Link
            to="/register"
            className="font-bold text-zinc-900 hover:text-orange-600 cursor-pointer underline underline-offset-4 transition-colors"
          >
            Khởi tạo ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
