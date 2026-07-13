import React from 'react';
import { Outlet } from 'react-router-dom';

export default function RootLayout() {
  return (
    <div className="min-h-dvh bg-noise text-zinc-900 flex flex-col font-sans antialiased selection:bg-zinc-900 selection:text-white">
      <Outlet />
    </div>
  );
}
