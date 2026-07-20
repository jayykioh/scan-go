import React, { Suspense, lazy } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Nfc } from 'lucide-react';
import RootLayout from './layouts/RootLayout';
import AuthLayout from './layouts/AuthLayout';
import SimulatorLayout from './layouts/SimulatorLayout';
import DashboardLayout from './layouts/DashboardLayout';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const IntroducePage = lazy(() => import('./pages/IntroducePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));

const OverviewPage = lazy(() => import('./pages/dashboard/OverviewPage'));
const ManagementPage = lazy(() => import('./pages/dashboard/ManagementPage'));
const StaffPage = lazy(() => import('./pages/dashboard/StaffPage'));
const SettingsPage = lazy(() => import('./pages/dashboard/SettingsPage'));
const MenuPage = lazy(() => import('./pages/dashboard/MenuPage'));
const TablesPage = lazy(() => import('./pages/dashboard/TablesPage'));
const SubscriptionPage = lazy(() => import('./pages/dashboard/SubscriptionPage'));

const SimulatorIndex = lazy(() => import('./pages/SimulatorIndex'));
const SimulatorRole = lazy(() => import('./pages/SimulatorRole'));
const PublicMenuPage = lazy(() => import('./pages/PublicMenuPage'));

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
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'manage', element: <ManagementPage /> },
          { path: 'menu', element: <MenuPage /> },
          { path: 'tables', element: <TablesPage /> },
          { path: 'staff', element: <StaffPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'subscription', element: <SubscriptionPage /> }
        ]
      },
      {
        path: 'simulator',
        element: <SimulatorLayout />,
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
    element: <PublicMenuPage />
  },
  {
    path: '/',
    element: <AuthLayout />,
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

import { ToastProvider } from './contexts/ToastContext';

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
