import React from 'react';
import { motion } from 'motion/react';
import { SmartphoneNfc, Zap, ShieldCheck, ArrowRight, BarChart3, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function IntroducePage() {
  return (
    <div className="min-h-screen bg-[#F5F5F7] text-zinc-900 font-sans selection:bg-orange-500/30">
      {/* Navigation Bar */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-zinc-200 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-zinc-950 flex items-center justify-center border-hard">
              <SmartphoneNfc className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-xl tracking-tighter uppercase">ScanGo Lite</span>
          </div>
          <Link to="/" className="text-sm font-bold text-zinc-500 hover:text-zinc-900 uppercase tracking-widest flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Về Trang Chủ
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-100 text-orange-700 font-bold text-xs uppercase tracking-widest border-hard mb-8">
            <Zap className="w-4 h-4" /> Phiên bản Blueprint 2.0
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter leading-tight mb-6">
            Bán hàng <span className="text-orange-600">tối giản.</span><br />
            Không cần phần cứng.
          </h1>
          <p className="text-lg text-zinc-500 font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
            ScanGo Lite thiết kế riêng cho quán ăn, quán cà phê nhỏ. Trải nghiệm gọi món bằng QR và NFC chạm cực nhanh, tích hợp AI tự động phân tích vận hành.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/simulator" className="px-8 py-4 bg-zinc-900 text-white font-bold uppercase tracking-widest text-sm border-hard shadow-hard hover:-translate-y-1 hover:shadow-[4px_6px_0px_0px_#27272a] transition-all flex items-center gap-2">
              Trải Nghiệm Thử <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* 3 Core Pillars */}
      <section className="py-20 bg-zinc-950 text-white px-6 border-t-8 border-orange-500">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tighter uppercase mb-4">Ba Trụ Cột Giá Trị</h2>
            <p className="text-zinc-400 font-medium text-lg">Định vị khác biệt so với các phần mềm truyền thống.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-zinc-900 border border-zinc-800 p-8 shadow-[8px_8px_0_0_#000] hover:-translate-y-2 transition-transform"
            >
              <div className="w-12 h-12 bg-orange-600 flex items-center justify-center mb-6">
                <SmartphoneNfc className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold uppercase tracking-tight mb-4">Order Chạm NFC & QR</h3>
              <p className="text-zinc-400 leading-relaxed">
                Khách tự quét QR hoặc chạm thẻ NFC tại bàn. Giao diện order mượt mà, giúp tăng tốc độ gọi món và chống phá đơn ảo hiệu quả bằng công nghệ token hóa.
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-zinc-900 border border-zinc-800 p-8 shadow-[8px_8px_0_0_#000] hover:-translate-y-2 transition-transform"
            >
              <div className="w-12 h-12 bg-emerald-600 flex items-center justify-center mb-6">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold uppercase tracking-tight mb-4">AI Giúp Nhìn Ra Tiền</h3>
              <p className="text-zinc-400 leading-relaxed">
                Hệ thống AI tự tính lời lỗ theo món, tự động ẩn món khi hết nguyên liệu. Với gói Pro, bạn có thể hỏi đáp trực tiếp với AI về tình hình kinh doanh.
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-zinc-900 border border-zinc-800 p-8 shadow-[8px_8px_0_0_#000] hover:-translate-y-2 transition-transform"
            >
              <div className="w-12 h-12 bg-blue-600 flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold uppercase tracking-tight mb-4">Phân Quyền Rõ Ràng</h3>
              <p className="text-zinc-400 leading-relaxed">
                Chủ quán thấy toàn bộ doanh thu. Thu ngân xử lý thanh toán. Bếp chỉ thấy hàng đợi món. Chống thất thoát triệt để mà không cần thuê người giám sát.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-white border-t border-zinc-200 text-center">
        <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
          © 2026 ScanGo Lite. Blueprint 2.0.
        </p>
      </footer>
    </div>
  );
}
