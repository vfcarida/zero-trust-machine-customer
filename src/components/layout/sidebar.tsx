'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cpu, X, Menu, ShieldAlert, ShieldCheck } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { DynamicIcon } from '@/components/dynamic-icon';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Cpu className="text-white" size={20} />
          </div>
          <span className="text-lg font-black text-slate-900">
            ZT-Machine<span className="text-indigo-600">Customer</span>
          </span>
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-slate-100"
        >
          {collapsed ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile overlay */}
      {collapsed && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setCollapsed(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300',
          'w-64 lg:translate-x-0',
          collapsed ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="px-6 py-6 border-b border-slate-800 bg-slate-950">
          <Link href="/" className="flex items-center space-x-3" onClick={() => setCollapsed(false)}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Cpu className="text-white" size={22} />
            </div>
            <div>
              <h1 className="text-[15px] font-black text-white tracking-tight leading-tight">
                ZT-Machine<span className="text-indigo-400">Customer</span>
              </h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Zero-Trust M2M Pay
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto bg-slate-900">
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
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
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

        {/* Status badge */}
        <div className="px-4 py-4 border-t border-slate-800 bg-slate-950">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2 px-3 py-2 bg-indigo-950/60 border border-indigo-900/50 rounded-xl">
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
              <span className="text-[11px] font-bold text-indigo-300">Gemma 4 E2B — Local</span>
            </div>
            <div className="flex items-center space-x-2 px-3 py-2 bg-emerald-950/60 border border-emerald-900/50 rounded-xl">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-300">OpenZiti Overlay Network</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
