import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import AuthLayout from './layouts/AuthLayout';
import SimulatorLayout from './layouts/SimulatorLayout';
import DashboardLayout from './layouts/DashboardLayout';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

import OverviewPage from './pages/dashboard/OverviewPage';
import StaffPage from './pages/dashboard/StaffPage';
import SettingsPage from './pages/dashboard/SettingsPage';
import MenuPage from './pages/dashboard/MenuPage';
import TablesPage from './pages/dashboard/TablesPage';

import SimulatorIndex from './pages/SimulatorIndex';
import SimulatorRole from './pages/SimulatorRole';

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
          { path: 'menu', element: <MenuPage /> },
          { path: 'tables', element: <TablesPage /> },
          { path: 'staff', element: <StaffPage /> },
          { path: 'settings', element: <SettingsPage /> }
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
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
