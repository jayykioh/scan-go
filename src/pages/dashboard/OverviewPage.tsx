import React from 'react';
import { Link } from 'react-router-dom';
import { Nfc, ArrowRight } from 'lucide-react';

export default function OverviewPage() {
  return (
    <div className="flex-1 p-6 md:p-12 flex flex-col items-center justify-center text-center relative h-full">
      {/* Decorative architectural grid lines */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]">
        <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', backgroundSize: '100px 100px' }}></div>
      </div>

      <div className="max-w-md w-full bg-white p-10 border-hard shadow-hard relative z-10">
        <div className="w-16 h-16 bg-zinc-950 flex items-center justify-center mx-auto mb-8 border-hard">
          <Nfc className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold text-zinc-900 mb-4 uppercase tracking-tighter">Trung tâm<br/>Điều hành</h1>
        <p className="font-mono text-xs text-zinc-500 mb-10 uppercase tracking-widest leading-relaxed">
          Hệ thống đã sẵn sàng.<br/>Khởi động máy trạm mô phỏng.
        </p>

        <Link 
          to="/simulator" 
          className="flex items-center justify-center gap-3 w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 uppercase font-mono tracking-widest text-xs border-hard shadow-hard transition-all cursor-pointer hover:-translate-y-1 hover:shadow-[4px_6px_0px_0px_#27272a] active:translate-x-1 active:translate-y-1 active:shadow-none group"
        >
          Mở Giao Diện Bán Hàng
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
