import React, { lazy, Suspense, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSimulator } from '../layouts/SimulatorLayout';
import { useToast } from '../contexts/ToastContext';
import PhoneSimulator from '../components/PhoneSimulator';
import { ArrowLeft, Plus, X } from 'lucide-react';

const OwnerView = lazy(() => import('../components/OwnerView'));
const CashierView = lazy(() => import('../components/CashierView'));
const KitchenView = lazy(() => import('../components/KitchenView'));
const CustomerView = lazy(() => import('../components/CustomerView'));
const SoloOperatorView = lazy(() => import('../components/SoloOperatorView'));

function RoleLoading() {
  return (
    <div className="mx-auto flex aspect-[9/18.5] w-full max-w-[370px] items-center justify-center rounded-[48px] border-8 border-zinc-900 bg-white shadow-xl" role="status">
      <div className="text-center">
        <span className="mx-auto block size-7 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" aria-hidden="true" />
        <p className="mt-3 text-xs font-bold text-zinc-900 uppercase tracking-widest">Ðang t?i...</p>
      </div>
    </div>
  );
}

const ROLES = [
  { id: 'solo', label: 'Solo Operator' },
  { id: 'owner', label: 'Owner (Qu?n l?)' },
  { id: 'cashier', label: 'Thu Ngân' },
  { id: 'kitchen', label: 'KDS (B?p)' },
  { id: 'customer', label: 'Khách hàng' }
];

export default function SimulatorRole() {
  const { role: urlRole } = useParams<{ role: string }>();
  const navigate = useNavigate();
  const ctx = useSimulator();
  const toast = useToast();

  const leftRole = urlRole || 'customer';
  const [rightRole, setRightRole] = useState<string | null>(null);

  const renderRoleView = (r: string) => {
    switch(r) {
      case 'solo': return <SoloOperatorView tenantConfig={ctx.tenantConfig} setTenantConfig={ctx.setTenantConfig} tables={ctx.tables} orders={ctx.orders} setOrders={ctx.setOrders} menuItems={ctx.menuItems} setMenuItems={ctx.setMenuItems} loyaltyMembers={ctx.loyaltyMembers} setLoyaltyMembers={ctx.setLoyaltyMembers} onboardCompleted={ctx.soloOnboarded} setOnboardCompleted={ctx.setSoloOnboarded} />;
      case 'owner': return <OwnerView tenantConfig={ctx.tenantConfig} setTenantConfig={ctx.setTenantConfig} menuItems={ctx.menuItems} setMenuItems={ctx.setMenuItems} orders={ctx.orders} loyaltyMembers={ctx.loyaltyMembers} onTriggerNfcTag={ctx.handleOwnerNfcAllocation} onboardCompleted={ctx.ownerOnboarded} setOnboardCompleted={ctx.setOwnerOnboarded} setViewMode={() => {}} setSimulationTableId={ctx.setSimulationTableId} tables={ctx.tables} setTables={ctx.setTables} />;
      case 'cashier': return <CashierView tenantConfig={ctx.tenantConfig} tables={ctx.tables} orders={ctx.orders} setOrders={ctx.setOrders} loyaltyMembers={ctx.loyaltyMembers} setLoyaltyMembers={ctx.setLoyaltyMembers} />;
      case 'kitchen': return <KitchenView tenantConfig={ctx.tenantConfig} orders={ctx.orders} setOrders={ctx.setOrders} menuItems={ctx.menuItems} setMenuItems={ctx.setMenuItems} onboardCompleted={ctx.kitchenOnboarded} setOnboardCompleted={ctx.setKitchenOnboarded} tables={ctx.tables} />;
      case 'customer': return <div className="flex-1 flex flex-col relative bg-zinc-50 h-full w-full"><CustomerView tenantConfig={ctx.tenantConfig} menuItems={ctx.menuItems} orders={ctx.orders} setOrders={ctx.setOrders} loyaltyMembers={ctx.loyaltyMembers} setLoyaltyMembers={ctx.setLoyaltyMembers} simulationTableId={ctx.simulationTableId} setSimulationTableId={ctx.setSimulationTableId} tables={ctx.tables} /></div>;
      default: return null;
    }
  };

  const getActorInfo = (r: string) => {
    switch(r) {
      case 'solo': return { name: 'Solo', color: '#ea580c', status: ctx.soloOnboarded ? 'All-In-One' : 'Setup Onboarding', isTablet: false };
      case 'owner': return { name: 'Owner', color: '#f97316', status: ctx.ownerOnboarded ? 'Dashboard Active' : 'Setup Onboarding', isTablet: false };
      case 'cashier': return { name: 'Cashier', color: '#3b82f6', status: ctx.cashierOnboarded ? 'Live Active' : 'Enter PIN', isTablet: true };
      case 'kitchen': return { name: 'Kitchen', color: '#f59e0b', status: ctx.kitchenOnboarded ? 'Active Queue' : 'Kitchen SignIn', isTablet: true };
      case 'customer': return { name: 'Customer', color: '#10b981', status: 'Contactless Client', isTablet: false };
      default: return { name: 'Unknown', color: '#000', status: '', isTablet: false };
    }
  };

  const renderSimulatorFrame = (r: string, isRight: boolean = false) => {
    const info = getActorInfo(r);
    const isTabletMode = info.isTablet;
    
    return (
      <div className={`relative flex flex-col items-center justify-center h-full w-full ${rightRole && !isRight ? 'hidden lg:flex' : 'flex'}`}>
        <div className="absolute top-0 left-0 right-0 z-50 p-4 flex justify-center -translate-y-8">
          <div className="bg-zinc-950 rounded-2xl p-1.5 flex items-center shadow-xl border border-zinc-800 backdrop-blur-md">
            <select 
              value={r}
              onChange={(e) => {
                if (isRight) setRightRole(e.target.value);
                else navigate(`/simulator/${e.target.value}`);
              }}
              className="bg-transparent text-white font-bold text-sm px-4 py-2 outline-none cursor-pointer appearance-none pr-8"
              style={{ backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '1em' }}
            >
              {ROLES.map(roleOpt => (
                <option key={roleOpt.id} value={roleOpt.id} className="text-zinc-900 bg-white">{roleOpt.label}</option>
              ))}
            </select>
            {isRight && (
              <button 
                onClick={() => setRightRole(null)}
                className="p-2 ml-1 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                title="Ðóng màn h?nh"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className={`transition-all duration-500 ease-in-out ${isTabletMode ? 'w-full max-w-[500px] aspect-[4/3]' : 'w-full max-w-[370px]'} max-h-[85vh]`}>
          <PhoneSimulator 
            actorName={info.name} 
            actorColor={info.color} 
            onboardStatus={info.status}
            nfcActive={ctx.nfcTriggeredAlert !== null}
            isTablet={isTabletMode}
          >
            <Suspense fallback={<RoleLoading />}>
              {renderRoleView(r)}
            </Suspense>
          </PhoneSimulator>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-dvh bg-[#F5F5F7] text-zinc-900 flex flex-col font-sans antialiased animate-fadeIn overflow-hidden">
      
      <header className="absolute top-6 left-6 z-50 flex flex-wrap gap-3 select-none">
        <Link to="/simulator" className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg border border-zinc-200 hover:scale-105 transition-transform cursor-pointer shrink-0">
          <ArrowLeft className="w-5 h-5 text-zinc-600" />
        </Link>
        
        <div className="bg-white rounded-full px-5 py-2 shadow-lg border border-zinc-200 flex flex-wrap items-center gap-4">
          <div className="flex flex-col hidden sm:flex">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Test Environment</span>
            <span className="text-sm font-bold text-zinc-900">{ctx.tenantConfig.shopName}</span>
          </div>
          <div className="w-px h-8 bg-zinc-200 mx-2 hidden sm:block"></div>
          
          <button 
            onClick={() => { ctx.triggerAutoOrderSimulation(); toast.success('Ð? thêm 1 ðõn hàng ?o'); }}
            className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-bold text-xs bg-orange-50 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Ðõn ?o
          </button>
          
          <button 
            onClick={() => { ctx.handleClearAllOrders(); toast.info('Ð? xóa toàn b? ðõn hàng'); }}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-700 font-bold text-xs bg-zinc-100 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" /> Xóa Data
          </button>
        </div>
      </header>

      <main className="flex-1 w-full h-dvh flex flex-col lg:flex-row items-center justify-center p-4 lg:p-8 pt-24 gap-12 overflow-hidden bg-noise relative">
        
        <div className={`h-full flex items-center justify-center transition-all ${rightRole ? 'lg:w-1/2 w-full' : 'w-full'}`}>
          {renderSimulatorFrame(leftRole, false)}
        </div>

        {rightRole ? (
          <div className="w-full lg:w-1/2 h-full flex items-center justify-center animate-fadeIn hidden lg:flex">
            {renderSimulatorFrame(rightRole, true)}
          </div>
        ) : (
          <div className="absolute right-12 top-1/2 -translate-y-1/2 z-40 hidden lg:block">
            <button 
              onClick={() => setRightRole('kitchen')}
              className="flex flex-col items-center justify-center gap-3 w-24 h-48 bg-white/50 hover:bg-white border-2 border-dashed border-zinc-300 rounded-[2rem] text-zinc-400 hover:text-orange-500 hover:border-orange-300 transition-all cursor-pointer backdrop-blur-sm group shadow-sm hover:shadow-lg"
              title="M? thêm thi?t b? gi? l?p"
            >
              <div className="w-10 h-10 rounded-full bg-zinc-100 group-hover:bg-orange-100 flex items-center justify-center transition-colors">
                <Plus className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-center px-2">Thêm<br/>Màn H?nh</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
