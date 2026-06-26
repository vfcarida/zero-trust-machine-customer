'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cpu, X, Menu, ShieldCheck } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { DynamicIcon } from '@/components/dynamic-icon';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Barra superior Mobile */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Cpu className="text-white" size={20} />
          </div>
          <span className="text-lg font-black text-slate-100">
            Cliente<span className="text-indigo-400">Máquina</span>
          </span>
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
        >
          {collapsed ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Overlay Mobile */}
      {collapsed && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setCollapsed(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen bg-slate-950 border-r border-slate-900 flex flex-col transition-transform duration-300',
          'w-64 lg:translate-x-0',
          collapsed ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo Branding */}
        <div className="px-6 py-6 border-b border-slate-900 bg-slate-950">
          <Link href="/" className="flex items-center space-x-3" onClick={() => setCollapsed(false)}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Cpu className="text-white" size={22} />
            </div>
            <div>
              <h1 className="text-[15px] font-black text-white tracking-tight leading-tight">
                Cliente<span className="text-indigo-400">Máquina</span>
              </h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                M2M Zero-Trust Pay
              </p>
            </div>
          </Link>
        </div>

        {/* Menu de Navegação */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto bg-slate-950">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setCollapsed(false)}
                className={cn(
                  'flex items-center space-x-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all',
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
                )}
              >
                <DynamicIcon
                  name={item.icon}
                  size={20}
                  className={cn(isActive ? 'text-white' : 'text-slate-500')}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Indicadores de Conexão */}
        <div className="px-4 py-4 border-t border-slate-900 bg-slate-950">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2 px-3 py-2 bg-indigo-950/40 border border-indigo-900/30 rounded-xl">
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
              <span className="text-[11px] font-bold text-indigo-300 font-mono">Gemma 4 E2B (Local)</span>
            </div>
            <div className="flex items-center space-x-2 px-3 py-2 bg-emerald-950/40 border border-emerald-900/30 rounded-xl">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-300 font-mono">Malha OpenZiti (mTLS)</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
