import React from 'react';
import { Link } from 'react-router-dom';
import { Nfc, ChevronRight, Store, ChefHat, Wallet, Smartphone, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <div className="flex-1 flex flex-col items-center bg-noise min-h-dvh overflow-hidden relative">
      {/* Decorative architectural grid lines */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
        <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', backgroundSize: '100px 100px' }}></div>
      </div>

      {/* Header */}
      <header className="w-full px-6 md:px-12 py-8 flex justify-between items-center z-10 border-b border-hard bg-canvas/80 backdrop-blur-sm">
        <motion.div 
          className="flex items-center gap-3"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.2 }
            }
          }}
        >
          <motion.div 
            variants={{
              hidden: { opacity: 0, scale: 0.5, rotate: -90 },
              visible: { opacity: 1, scale: 1, rotate: 0, transition: { type: "spring", stiffness: 200, damping: 15 } }
            }}
            className="w-10 h-10 bg-orange-600 flex items-center justify-center border-hard shadow-hard"
          >
            <Nfc className="w-5 h-5 text-white" />
          </motion.div>
          <motion.span 
            variants={{
              hidden: { opacity: 0, x: -20 },
              visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } }
            }}
            className="text-2xl font-bold text-zinc-900 tracking-tighter uppercase font-mono"
          >
            ScanGo_
          </motion.span>
        </motion.div>
        <div className="flex items-center gap-6">
          <Link to="/login" className="font-mono text-xs font-bold text-zinc-600 hover:text-orange-600 uppercase tracking-widest cursor-pointer transition-colors">
            Đăng nhập
          </Link>
          <Link to="/register" className="font-mono text-xs font-bold bg-zinc-950 text-white px-5 py-2.5 hover:bg-zinc-800 transition-colors cursor-pointer border-hard shadow-hard active:translate-x-0.5 active:translate-y-0.5 active:shadow-none uppercase tracking-widest hidden sm:block">
            Khởi tạo
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 w-full flex flex-col z-10 px-6 md:px-12 max-w-[1600px]">
        
        {/* Asymmetrical Hero Layout */}
        <div className="w-full py-20 md:py-32 grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          <div className="lg:col-span-8 flex flex-col justify-center">
            <div className="mb-8">
              <span className="inline-flex items-center gap-2 bg-zinc-950 text-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest uppercase border-hard">
                <span className="w-2 h-2 bg-orange-600 rounded-none animate-pulse"></span>
                Vận hành tuyệt đối
              </span>
            </div>
            <motion.h1 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, type: "spring", bounce: 0.4 }}
              className="text-5xl md:text-7xl lg:text-8xl font-extrabold text-zinc-900 tracking-tighter leading-[0.9] uppercase mb-8"
            >
              Hệ thống<br />
              Đặt món <span className="text-orange-600">QR</span><br />
              Không POS.
            </motion.h1>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mt-8">
              <Link 
                to="/register" 
                className="flex items-center gap-3 bg-orange-600 text-white px-8 py-4 font-mono font-bold text-sm uppercase tracking-widest transition-all cursor-pointer border-hard shadow-hard hover:-translate-y-1 hover:shadow-[6px_8px_0px_0px_#27272a] active:translate-x-1 active:translate-y-1 active:shadow-none group"
              >
                Vận hành ngay
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link 
                to="/simulator" 
                className="flex items-center gap-3 bg-white text-zinc-900 px-8 py-4 font-mono font-bold text-sm uppercase tracking-widest transition-all cursor-pointer border-hard shadow-hard hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none group"
              >
                Xem mô phỏng
                <ArrowDownRight className="w-5 h-5 group-hover:translate-x-1 group-hover:translate-y-1 transition-transform" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col justify-end hidden lg:flex">
             <div className="border-l-4 border-zinc-950 pl-6 space-y-6">
                <p className="text-zinc-600 font-mono text-sm leading-relaxed tracking-wide">
                  / Tối ưu quy trình gọi món, nấu nướng và thanh toán chỉ với thiết bị di động cá nhân.
                </p>
                <p className="text-zinc-600 font-mono text-sm leading-relaxed tracking-wide">
                  / Cấu trúc máy chủ độc lập, hoạt động bền bỉ, loại bỏ chi phí phần cứng cồng kềnh.
                </p>
             </div>
          </div>

        </div>

        {/* Structural Feature Grid */}
        <div className="w-full mt-24 mb-32 border-t border-hard pt-16">
          <div className="flex justify-between items-end mb-12">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tighter uppercase">Cấu trúc<br/>Hệ thống</h2>
            <span className="font-mono text-xs text-zinc-400 uppercase tracking-widest">/ Tính năng cốt lõi</span>
          </div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.15 }
              }
            }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-hard bg-zinc-950"
          >
            {/* Feature 1 */}
            <motion.div variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } } }} className="bg-white p-8 border-b md:border-b-0 md:border-r border-hard group hover:bg-zinc-50 transition-colors">
              <div className="w-12 h-12 bg-orange-600 flex items-center justify-center border-hard shadow-hard mb-8 group-hover:-translate-y-1 transition-transform">
                <Store className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-xl uppercase tracking-tight mb-3">Quản lý trung tâm</h3>
              <p className="font-mono text-xs text-zinc-600 leading-relaxed">Điều hướng doanh thu, thiết lập menu và kiểm soát phân quyền nhân sự theo thời gian thực.</p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } } }} className="bg-white p-8 border-b md:border-b-0 md:border-r border-hard group hover:bg-zinc-50 transition-colors">
              <div className="w-12 h-12 bg-emerald-600 flex items-center justify-center border-hard shadow-hard mb-8 group-hover:-translate-y-1 transition-transform">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-xl uppercase tracking-tight mb-3">Giao thức Khách hàng</h3>
              <p className="font-mono text-xs text-zinc-600 leading-relaxed">Giao diện quét mã QR tinh gọn, tiếp nhận order ngay tại bàn không độ trễ.</p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } } }} className="bg-white p-8 border-b lg:border-b-0 lg:border-r border-hard group hover:bg-zinc-50 transition-colors">
              <div className="w-12 h-12 bg-amber-600 flex items-center justify-center border-hard shadow-hard mb-8 group-hover:-translate-y-1 transition-transform">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-xl uppercase tracking-tight mb-3">Terminal Bếp</h3>
              <p className="font-mono text-xs text-zinc-600 leading-relaxed">Màn hình KDS tiếp nhận trạng thái độc lập, đồng bộ hóa quy trình xuất món.</p>
            </motion.div>

            {/* Feature 4 */}
            <motion.div variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } } }} className="bg-white p-8 group hover:bg-zinc-50 transition-colors">
              <div className="w-12 h-12 bg-blue-600 flex items-center justify-center border-hard shadow-hard mb-8 group-hover:-translate-y-1 transition-transform">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-xl uppercase tracking-tight mb-3">Cổng thanh toán</h3>
              <p className="font-mono text-xs text-zinc-600 leading-relaxed">Xử lý hóa đơn nhanh chóng, chính xác. Tích hợp thanh toán số và quản lý dòng tiền.</p>
            </motion.div>
          </motion.div>
        </div>

      </main>
    </div>
  );
}
