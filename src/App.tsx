import React, { Suspense, lazy } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import AuthLayout from './layouts/AuthLayout';
import SimulatorLayout from './layouts/SimulatorLayout';
import DashboardLayout from './layouts/DashboardLayout';

const LandingPage = lazy(() => import('./pages/LandingPage'));
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
  <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F5F7]">
    <div className="flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-zinc-200 border-t-orange-500 rounded-full animate-spin"></div>
      <p className="mt-4 text-sm font-bold text-zinc-500 uppercase tracking-widest animate-pulse">Đang tải...</p>
    </div>
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
  return (
    <ToastProvider>
      <Suspense fallback={<FallbackLoader />}>
        <RouterProvider router={router} />
      </Suspense>
    </ToastProvider>
  );
}
