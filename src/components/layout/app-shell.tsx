'use client';

import React from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { ToastProvider } from '@/components/toast-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { SimulationProvider } from '@/hooks/use-simulation';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <SimulationProvider>
          <Sidebar />
          <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-600/30">
            {children}
          </main>
        </SimulationProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
};
