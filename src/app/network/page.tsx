'use client';

import React from 'react';
import { useSimulation } from '@/hooks/use-simulation';
import { Network, Terminal, Lock, HelpCircle, FileJson, Server, Activity, CheckCircle } from 'lucide-react';
import { APPROVED_MERCHANTS } from '@/lib/constants';

export default function NetworkPage() {
  const { ledger } = useSimulation();

  // Get Ziti logs from the most recent transaction (if any)
  const lastZitiTx = ledger.find((item) => item.zitiSecured);
  const zitiLogs = lastZitiTx ? lastZitiTx.logs.filter((log) => !log.startsWith('[Gemma E2B]')) : [];

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-8">
      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center space-x-3">
          <Network className="text-indigo-400" size={32} />
          <span>OpenZiti Zero-Trust Overlay Mesh</span>
        </h1>
        <p className="text-slate-400 text-sm">
          Monitor your Zero-Trust overlay connections, load secure certificates, and learn how to run real network traffic.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Connection Status panel */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Active Network Topology */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-4">
              <Activity className="text-indigo-400" size={18} />
              <span>Active Network Tunnel Nodes</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs text-slate-400">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
                <span className="text-[10px] text-slate-500 block">ENROLLER</span>
                <span className="text-slate-200 font-bold block">Gemma Agent Client</span>
                <span className="text-emerald-400 text-[10px] flex items-center space-x-1">
                  <CheckCircle size={10} />
                  <span>Enrolled Context</span>
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
                <span className="text-[10px] text-slate-500 block">EDGE ROUTER</span>
                <span className="text-slate-200 font-bold block">aws-sao-router-01</span>
                <span className="text-emerald-400 text-[10px] flex items-center space-x-1">
                  <CheckCircle size={10} />
                  <span>mTLS Handshake OK</span>
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
                <span className="text-[10px] text-slate-500 block">TARGET SERVICE</span>
                <span className="text-slate-200 font-bold block">ap4m-settlement</span>
                <span className="text-emerald-400 text-[10px] flex items-center space-x-1">
                  <Lock size={10} />
                  <span>Dark Endpoint Active</span>
                </span>
              </div>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80 space-y-3">
              <span className="text-xs font-bold text-slate-300 font-mono block">Zero-Trust Overlay Network Topology Info:</span>
              <p className="text-xs text-slate-400 leading-relaxed">
                The OpenZiti SDK in this application creates an outbound-only TCP session directly to the
                Ziti router mesh. It establishes a secure tunnel for target service <code className="text-indigo-400 font-mono">ap4m-settlement-service</code>. 
                Because the overlay relies on outbound connections, the target merchant endpoint does not need to expose public IP addresses, DNS domains, 
                or listening inbound ports, eliminating the entire remote attack surface (no DDoS, zero port scans, zero firewall leaks).
              </p>
            </div>
          </div>

          {/* Setup Guide */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-4">
              <HelpCircle className="text-indigo-400" size={18} />
              <span>How to Configure OpenZiti Locally</span>
            </h2>

            <div className="space-y-4 text-xs leading-relaxed text-slate-400 font-mono">
              <div className="space-y-1">
                <p className="text-slate-200 font-bold">1. Spin up a Local OpenZiti Controller</p>
                <p className="text-[11px]">
                  Use the OpenZiti quickstart script to run a local controller and edge router in Docker or directly:
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-indigo-400 overflow-x-auto text-[10px] mt-1.5">
                  docker run --name openziti-controller -d -p 8441:8441 openziti/quickstart
                </pre>
              </div>

              <div className="space-y-1 pt-2">
                <p className="text-slate-200 font-bold">2. Create Identities and Services</p>
                <p className="text-[11px]">
                  Inside your Ziti Controller CLI, create an identity for the Machine Customer Agent, the Target Merchant host, 
                  and bind the service permissions:
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-indigo-400 overflow-x-auto text-[10px] mt-1.5">
                  {`# Create client and host identities\nziti edge create identity user agent-customer -a client-identities\nziti edge create identity device merchant-host -a host-identities\n\n# Create ap4m service\nziti edge create service ap4m-settlement-service`}
                </pre>
              </div>

              <div className="space-y-1 pt-2">
                <p className="text-slate-200 font-bold">3. Enroll the Agent and save Identity JSON</p>
                <p className="text-[11px]">
                  Enroll the client identity to obtain the final cryptographic JSON config file. Save this file to the root of this project folder:
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-indigo-400 overflow-x-auto text-[10px] mt-1.5">
                  {`# Enroll client using CLI to output JSON config\nziti edge enroll agent-customer.jwt -o ziti-identity.json`}
                </pre>
                <p className="text-[10px] text-slate-500 mt-1">
                  Place the file named <code className="text-indigo-400">ziti-identity.json</code> in this project directory. The backend API route will automatically detect it and switch from simulation to real-time mTLS tunneling!
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Right column: Identity File Info & Logs */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Identity File Loader Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2 uppercase tracking-wider font-mono">
              <FileJson className="text-indigo-400" size={16} />
              <span>Identity config</span>
            </h2>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-[11px] font-mono text-slate-400 space-y-3">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="text-indigo-400 font-bold">SIMULATION FALLBACK</span>
              </div>
              <div className="flex justify-between">
                <span>File Path:</span>
                <span className="text-slate-500 font-bold">/ziti-identity.json</span>
              </div>
              <div className="flex justify-between">
                <span>Target:</span>
                <span className="text-slate-500">ap4m-settlement</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
              Identity JSON contains your client private key, root CA certificates, controller URL, and identity signature. 
              Never expose this file publicly!
            </p>
          </div>

          {/* Recent Transmission logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between h-[360px]">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2 uppercase tracking-wider font-mono border-b border-slate-800 pb-3 mb-2">
                <Terminal className="text-indigo-400" size={16} />
                <span>Last Tunnel Logs</span>
              </h2>

              <div className="overflow-y-auto space-y-2 max-h-[220px] font-mono text-[9px] text-slate-400 leading-tight">
                {zitiLogs.length > 0 ? (
                  zitiLogs.map((log, idx) => (
                    <div key={idx} className="border-l border-slate-800 pl-2 py-0.5 text-slate-300">
                      {log}
                    </div>
                  ))
                ) : (
                  <p className="text-slate-600 italic text-center py-10">No secure overlay connection logs. Send a transaction from the home screen first.</p>
                )}
              </div>
            </div>

            <div className="text-[10px] text-slate-500 font-mono text-center pt-2 border-t border-slate-800/80">
              Logs represent real-time traffic status.
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
