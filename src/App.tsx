import React, { Suspense } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Nfc } from 'lucide-react';
import RootLayout from './layouts/RootLayout';
import AuthLayout from './layouts/AuthLayout';
import SimulatorLayout from './layouts/SimulatorLayout';
import DashboardLayout from './layouts/DashboardLayout';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { lazyRetry } from './utils/lazyRetry';
import { ToastProvider } from './contexts/ToastContext';

const LandingPage = lazyRetry(() => import('./pages/LandingPage'), 'LandingPage');
const IntroducePage = lazyRetry(() => import('./pages/IntroducePage'), 'IntroducePage');
const LoginPage = lazyRetry(() => import('./pages/LoginPage'), 'LoginPage');
const RegisterPage = lazyRetry(() => import('./pages/RegisterPage'), 'RegisterPage');
const StaffLoginPage = lazyRetry(() => import('./pages/StaffLoginPage'), 'StaffLoginPage');

const OverviewPage = lazyRetry(() => import('./pages/dashboard/OverviewPage'), 'OverviewPage');
const ManagementPage = lazyRetry(() => import('./pages/dashboard/ManagementPage'), 'ManagementPage');
const StaffPage = lazyRetry(() => import('./pages/dashboard/StaffPage'), 'StaffPage');
const SettingsPage = lazyRetry(() => import('./pages/dashboard/SettingsPage'), 'SettingsPage');
const MenuPage = lazyRetry(() => import('./pages/dashboard/MenuPage'), 'MenuPage');
const InventoryPage = lazyRetry(() => import('./pages/dashboard/InventoryPage'), 'InventoryPage');
const TablesPage = lazyRetry(() => import('./pages/dashboard/TablesPage'), 'TablesPage');
const SubscriptionPage = lazyRetry(() => import('./pages/dashboard/SubscriptionPage'), 'SubscriptionPage');
const FeedbackPage = lazyRetry(() => import('./pages/dashboard/FeedbackPage'), 'FeedbackPage');
const PromotionsPage = lazyRetry(() => import('./pages/dashboard/PromotionsPage'), 'PromotionsPage');

const SimulatorIndex = lazyRetry(() => import('./pages/SimulatorIndex'), 'SimulatorIndex');
const SimulatorRole = lazyRetry(() => import('./pages/SimulatorRole'), 'SimulatorRole');
const PublicMenuPage = lazyRetry(() => import('./pages/PublicMenuPage'), 'PublicMenuPage');

const FallbackLoader = () => (
  <div className="min-h-dvh w-full flex items-center justify-center bg-zinc-50 relative overflow-hidden">
    <div className="absolute inset-0 opacity-10 bg-noise pointer-events-none" />
    <motion.div 
      className="flex flex-col items-center justify-center gap-8 relative z-10"
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
      <div className="flex items-center gap-4">
        <motion.div 
          variants={{
            hidden: { opacity: 0, scale: 0.5, rotate: -90 },
            visible: { opacity: 1, scale: 1, rotate: 0, transition: { type: "spring", stiffness: 200, damping: 15 } }
          }}
          className="w-14 h-14 bg-orange-600 flex items-center justify-center border-hard shadow-hard"
        >
          <Nfc className="w-7 h-7 text-white" />
        </motion.div>
        <motion.span 
          variants={{
            hidden: { opacity: 0, x: -20 },
            visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } }
          }}
          className="text-4xl font-bold text-zinc-900 tracking-tighter uppercase font-mono"
        >
          ScanGo_
        </motion.span>
      </div>
      
      <motion.div 
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { delay: 0.6 } }
        }}
        className="flex gap-2"
      >
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-2 h-2 bg-orange-600 rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] border border-black" />
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.15 }} className="w-2 h-2 bg-orange-600 rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] border border-black" />
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.3 }} className="w-2 h-2 bg-orange-600 rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] border border-black" />
      </motion.div>
    </motion.div>
  </div>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <LandingPage />
      },
      {
        path: 'introduce',
        element: <IntroducePage />
      },
      {
        path: 'dashboard',
        element: <DashboardLayout />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'manage', element: <ManagementPage /> },
          { path: 'menu', element: <MenuPage /> },
          { path: 'promotions', element: <PromotionsPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          { path: 'tables', element: <TablesPage /> },
          { path: 'staff', element: <StaffPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'subscription', element: <SubscriptionPage /> },
          { path: 'feedback', element: <FeedbackPage /> }
        ]
      },
      {
        path: 'simulator',
        element: <SimulatorLayout />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            index: true,
            element: <SimulatorIndex />
          },
          {
            path: ':role',
            element: <SimulatorRole />
          }
        ]
      }
    ]
  },
  {
    path: '/menu/:tableId',
    element: <PublicMenuPage />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/staff',
    element: <StaffLoginPage />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/',
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: 'login',
        element: <LoginPage />
      },
      {
        path: 'register',
        element: <RegisterPage />
      }
    ]
  }
]);

export default function App() {
  const [initialLoading, setInitialLoading] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ToastProvider>
      <AnimatePresence mode="wait">
        {initialLoading ? (
          <motion.div key="splash" exit={{ opacity: 0, transition: { duration: 0.5 } }}>
            <FallbackLoader />
          </motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
            <Suspense fallback={<FallbackLoader />}>
              <RouterProvider router={router} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastProvider>
  );
}
