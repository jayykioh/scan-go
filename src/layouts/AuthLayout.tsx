import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Nfc } from 'lucide-react';

export default function AuthLayout() {
  return (
    <div className="min-h-dvh flex flex-col md:flex-row font-sans antialiased selection:bg-zinc-900 selection:text-white bg-noise">
      {/* Left Panel - Editorial Impact */}
      <div className="w-full md:w-5/12 lg:w-1/2 bg-zinc-950 text-white flex flex-col justify-between p-8 md:p-12 border-b md:border-b-0 md:border-r border-hard relative overflow-hidden">
        {/* Subtle noise over dark background */}
        <div className="absolute inset-0 opacity-10 bg-noise pointer-events-none" />
        
        <div className="relative z-10 flex items-center gap-3">
          <Link 
            to="/" 
            className="w-10 h-10 bg-orange-600 flex items-center justify-center border-hard shadow-hard transition-transform active:translate-x-1 active:translate-y-1 hover:-translate-y-0.5 cursor-pointer"
            aria-label="Home"
          >
            <Nfc className="w-5 h-5 text-white" />
          </Link>
          <span className="text-xl font-bold tracking-tighter uppercase font-mono">ScanGo_</span>
        </div>

        <div className="relative z-10 mt-20 mb-10 md:mb-0">
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold leading-[0.9] tracking-tighter mb-6 uppercase">
            Hệ thống<br />Vận hành<br /><span className="text-orange-600">Tuyệt đối.</span>
          </h1>
          <p className="text-zinc-400 font-mono text-xs md:text-sm uppercase tracking-widest max-w-sm border-l-2 border-orange-600 pl-4">
            Loại bỏ thiết bị thừa. Đơn giản hóa quy trình. POS qua mã QR trực tiếp từ trình duyệt.
          </p>
        </div>
        
        <div className="relative z-10 hidden md:block">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
            ScanGo System v1.0.0 // Tối ưu hóa cho tốc độ
          </p>
        </div>
      </div>

      {/* Right Panel - Stark Form Area */}
      <main className="w-full md:w-7/12 lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-white relative">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
