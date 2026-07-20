import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Nfc, LayoutGrid, Users, Settings, LogOut, UtensilsCrossed, Table2, CircleDollarSign, CreditCard } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DashboardLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/login');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 font-mono font-bold uppercase tracking-widest text-xs transition-all cursor-pointer text-left border-hard shadow-hard ${isActive
      ? 'bg-white text-zinc-900 translate-x-1'
      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
    }`;

  return (
    <div className="flex-1 flex min-h-dvh">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-zinc-950 text-white flex flex-col hidden md:flex border-r border-hard relative overflow-hidden">
        {/* Subtle noise over dark background */}
        <div className="absolute inset-0 opacity-10 bg-noise pointer-events-none" />

        <div className="relative z-10 p-6 mb-4">
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
              className="text-xl font-bold uppercase font-mono tracking-tighter"
            >
              ScanGo_
            </motion.span>
          </motion.div>
        </div>

        <nav className="relative z-10 flex-1 px-4 space-y-3">
          <NavLink end to="/dashboard" className={navLinkClass}>
            <LayoutGrid className="w-4 h-4" />
            Doanh thu
          </NavLink>
          <NavLink to="/dashboard/manage" className={navLinkClass}>
            <CircleDollarSign className="w-4 h-4" />
            Quản lý quán
          </NavLink>
          <NavLink to="/dashboard/menu" className={navLinkClass}>
            <UtensilsCrossed className="w-4 h-4" />
            Thực đơn
          </NavLink>
          <NavLink to="/dashboard/tables" className={navLinkClass}>
            <Table2 className="w-4 h-4" />
            Sơ đồ Bàn
          </NavLink>
          <NavLink to="/dashboard/staff" className={navLinkClass}>
            <Users className="w-4 h-4" />
            Nhân sự
          </NavLink>
          <NavLink to="/dashboard/subscription" className={navLinkClass}>
            <CreditCard className="w-4 h-4" />
            Gói Dịch Vụ
          </NavLink>
          <NavLink to="/dashboard/settings" className={navLinkClass}>
            <Settings className="w-4 h-4" />
            Cấu hình
          </NavLink>
        </nav>

        <div className="relative z-10 p-4 border-t border-hard">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full text-zinc-500 hover:text-red-500 font-mono font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer text-left"
          >
            <LogOut className="w-4 h-4" />
            Thoát
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-y-auto bg-zinc-50">
        <Outlet />
      </main>
    </div>
  );
}
