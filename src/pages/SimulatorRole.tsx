import React, { lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSimulator } from '../layouts/SimulatorLayout';
import PhoneSimulator from '../components/PhoneSimulator';
import { Sparkles, Building, Wallet, ChefHat, Smartphone, Flame, Check, Plus, ArrowLeft } from 'lucide-react';

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
        <p className="mt-3 text-xs font-bold text-zinc-900 uppercase font-mono tracking-widest">Đang tải...</p>
      </div>
    </div>
  );
}

export default function SimulatorRole() {
  const { role } = useParams<{ role: string }>();
  const ctx = useSimulator();

  return (
    <div className="min-h-dvh bg-noise text-zinc-900 flex flex-col font-sans antialiased animate-fadeIn">
      
      {/* Workspace Header */}
      <header className="bg-white border-b border-hard px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10 select-none">
        <div className="flex items-center gap-4">
          <Link to="/simulator" className="w-12 h-12 bg-zinc-950 flex items-center justify-center shadow-hard border-hard hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer group">
            <ArrowLeft className="w-6 h-6 text-white group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div>
            <p className="font-mono text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Active Terminal</p>
            <h1 className="text-xl font-bold text-zinc-900 tracking-tighter uppercase flex items-center gap-2 mt-0.5">
              {ctx.tenantConfig.shopName}
              <span className="text-[10px] bg-orange-600 text-white px-2 py-0.5 font-bold tracking-widest border-hard">
                {role?.toUpperCase()}
              </span>
            </h1>
          </div>
        </div>

        {/* Workspace controls */}
        <div className="w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <nav aria-label="Chuyển vai trò" className="bg-white border-hard p-1 flex w-max min-w-full md:min-w-0 gap-1 shadow-hard">
            <Link 
              to="/simulator"
              className="px-4 py-2 font-mono font-bold uppercase tracking-widest text-xs bg-white text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer flex items-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              Đổi vai
            </Link>
            {['solo', 'owner', 'cashier', 'kitchen', 'customer'].map((r) => (
              <Link 
                key={r}
                to={`/simulator/${r}`}
                className={`px-4 py-2 font-mono font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer ${
                  role === r ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                {r}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Sandbox Workspace Layout */}
      <main className="flex-1 p-6 lg:p-10 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Simulation Control Panel */}
        <section className="lg:col-span-1 bg-white border-hard shadow-hard p-6 space-y-8 h-fit select-none">
          <div className="flex items-center gap-2 border-b border-hard pb-4">
            <Flame className="w-5 h-5 text-orange-600" />
            <h2 className="font-mono text-sm font-bold text-zinc-900 uppercase tracking-widest">Trình điều khiển</h2>
          </div>

          <div className="space-y-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-bold block">Đơn đang xử lý</span>
            {ctx.orders.length === 0 ? (
              <p className="font-mono text-xs text-zinc-400 uppercase tracking-widest">Không có dữ liệu</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {ctx.orders.map((o: any) => (
                  <span key={o.id} className={`font-mono text-[10px] font-bold px-3 py-1 border-hard uppercase tracking-widest ${
                    o.status === 'pending' ? 'bg-amber-100 text-amber-900' :
                    o.status === 'cooking' ? 'bg-orange-100 text-orange-900' :
                    o.status === 'ready' ? 'bg-emerald-100 text-emerald-900' :
                    'bg-zinc-100 text-zinc-900'
                  }`}>
                    B{o.tableId}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-hard">
            <button 
              onClick={ctx.triggerAutoOrderSimulation}
              className="w-full bg-zinc-950 hover:bg-zinc-800 text-white py-4 font-mono font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors cursor-pointer border-hard"
            >
              <Plus className="w-4 h-4" /> Bơm đơn ảo
            </button>
            <button 
              onClick={ctx.handleClearAllOrders}
              className="w-full bg-white hover:bg-zinc-100 text-zinc-900 py-4 font-mono font-bold text-xs uppercase tracking-widest border-hard transition-colors cursor-pointer"
            >
              Reset dữ liệu đơn
            </button>
          </div>
        </section>

        {/* Synced Phone Simulator Display */}
        <section className="lg:col-span-3 flex justify-center">
          <div className="w-full max-w-[380px]">
            <Suspense fallback={<RoleLoading />}>
              {role === 'solo' && (
                <PhoneSimulator 
                  actorName="Solo" 
                  actorColor="#ea580c" 
                  onboardStatus={ctx.soloOnboarded ? 'All-In-One' : 'Setup Onboarding'}
                >
                  <SoloOperatorView 
                    tenantConfig={ctx.tenantConfig}
                    setTenantConfig={ctx.setTenantConfig}
                    tables={ctx.tables}
                    orders={ctx.orders}
                    setOrders={ctx.setOrders}
                    menuItems={ctx.menuItems}
                    setMenuItems={ctx.setMenuItems}
                    loyaltyMembers={ctx.loyaltyMembers}
                    setLoyaltyMembers={ctx.setLoyaltyMembers}
                    onboardCompleted={ctx.soloOnboarded}
                    setOnboardCompleted={ctx.setSoloOnboarded}
                  />
                </PhoneSimulator>
              )}
              {role === 'owner' && (
                <PhoneSimulator 
                  actorName="Owner" 
                  actorColor="#f97316" 
                  onboardStatus={ctx.ownerOnboarded ? 'Dashboard Active' : 'Setup Onboarding'}
                >
                  <OwnerView 
                    tenantConfig={ctx.tenantConfig}
                    setTenantConfig={ctx.setTenantConfig}
                    menuItems={ctx.menuItems}
                    setMenuItems={ctx.setMenuItems}
                    orders={ctx.orders}
                    loyaltyMembers={ctx.loyaltyMembers}
                    onTriggerNfcTag={ctx.handleOwnerNfcAllocation}
                    onboardCompleted={ctx.ownerOnboarded}
                    setOnboardCompleted={ctx.setOwnerOnboarded}
                    setViewMode={() => {}}
                    setSimulationTableId={ctx.setSimulationTableId}
                    tables={ctx.tables}
                    setTables={ctx.setTables}
                  />
                </PhoneSimulator>
              )}
              {role === 'cashier' && (
                <PhoneSimulator 
                  actorName="Cashier" 
                  actorColor="#3b82f6" 
                  onboardStatus={ctx.cashierOnboarded ? 'Live Active' : 'Enter PIN'}
                >
                  <CashierView 
                    tenantConfig={ctx.tenantConfig}
                    tables={ctx.tables}
                    orders={ctx.orders}
                    setOrders={ctx.setOrders}
                    loyaltyMembers={ctx.loyaltyMembers}
                    setLoyaltyMembers={ctx.setLoyaltyMembers}
                  />
                </PhoneSimulator>
              )}
              {role === 'kitchen' && (
                <PhoneSimulator 
                  actorName="Kitchen" 
                  actorColor="#f59e0b" 
                  onboardStatus={ctx.kitchenOnboarded ? 'Active Queue' : 'Kitchen SignIn'}
                >
                  <KitchenView 
                    tenantConfig={ctx.tenantConfig}
                    orders={ctx.orders}
                    setOrders={ctx.setOrders}
                    menuItems={ctx.menuItems}
                    setMenuItems={ctx.setMenuItems}
                    onboardCompleted={ctx.kitchenOnboarded}
                    setOnboardCompleted={ctx.setKitchenOnboarded}
                    tables={ctx.tables}
                  />
                </PhoneSimulator>
              )}
              {role === 'customer' && (
                <PhoneSimulator 
                  actorName="Customer" 
                  actorColor="#10b981" 
                  onboardStatus="Contactless Client"
                  nfcActive={ctx.nfcTriggeredAlert !== null}
                >
                  <div className="flex-1 flex flex-col relative bg-zinc-50">
                    <CustomerView 
                      tenantConfig={ctx.tenantConfig}
                      menuItems={ctx.menuItems}
                      orders={ctx.orders}
                      setOrders={ctx.setOrders}
                      loyaltyMembers={ctx.loyaltyMembers}
                      setLoyaltyMembers={ctx.setLoyaltyMembers}
                      simulationTableId={ctx.simulationTableId}
                      setSimulationTableId={ctx.setSimulationTableId}
                      tables={ctx.tables}
                    />
                  </div>
                </PhoneSimulator>
              )}
            </Suspense>
          </div>
        </section>

      </main>
    </div>
  );
}
