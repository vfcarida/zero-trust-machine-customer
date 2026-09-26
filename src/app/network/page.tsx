'use client';

import React from 'react';
import { useSimulation } from '@/hooks/use-simulation';
import { Network, Terminal, Lock, HelpCircle, FileJson, Activity, CheckCircle } from 'lucide-react';

export default function NetworkPage() {
  const { ledger } = useSimulation();

  // Retrieve Ziti logs from the most recent transaction
  const lastZitiTx = ledger.find((item) => item.zitiSecured);
  const zitiLogs = lastZitiTx ? lastZitiTx.logs.filter((log) => !log.startsWith('[Gemma E2B]')) : [];

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center space-x-3">
          <Network className="text-indigo-400" size={32} />
          <span>OpenZiti Zero-Trust Overlay Mesh</span>
        </h1>
        <p className="text-slate-400 text-sm">
          Monitor encrypted tunnels, manage secure edge identities, and bootstrap native OpenZiti dark service routing.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Nodes Status and Routing Overview */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Active Network Nodes */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-4">
              <Activity className="text-indigo-400" size={18} />
              <span>Active Overlay Network Nodes</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs text-slate-450">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-1.5">
                <span className="text-[10px] text-slate-550 block">AGENT CLIENT</span>
                <span className="text-slate-200 font-bold block">Gemma Agent Client</span>
                <span className="text-emerald-400 text-[10px] flex items-center space-x-1">
                  <CheckCircle size={10} />
                  <span>Identity Enrolled</span>
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-1.5">
                <span className="text-[10px] text-slate-550 block">EDGE ROUTER</span>
                <span className="text-slate-200 font-bold block">aws-sao-router-01</span>
                <span className="text-emerald-400 text-[10px] flex items-center space-x-1">
                  <CheckCircle size={10} />
                  <span>mTLS Active</span>
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-1.5">
                <span className="text-[10px] text-slate-550 block">TARGET SERVICE</span>
                <span className="text-slate-200 font-bold block">ap4m-settlement</span>
                <span className="text-emerald-400 text-[10px] flex items-center space-x-1">
                  <Lock size={10} />
                  <span>Dark Endpoint OK</span>
                </span>
              </div>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 space-y-3 font-mono text-xs">
              <span className="text-slate-350 font-bold block">Zero-Trust Network Engineering Overview:</span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                The OpenZiti SDK establishes an outbound, encrypted mTLS session directly to the overlay mesh. 
                This resolves the <code className="text-indigo-400">ap4m-settlement-service</code> without exposing 
                any public merchant IP addresses or opening inbound firewall listening ports. 
                Because connections are outbound-only, network perimeter attack vectors such as port scanning, DDoS, and lateral traversal are systematically eliminated.
              </p>
            </div>
          </div>

          {/* Local Quickstart Guide */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-4">
              <HelpCircle className="text-indigo-400" size={18} />
              <span>How to Initialize Local OpenZiti Mesh</span>
            </h2>

            <div className="space-y-4 text-xs leading-relaxed text-slate-400 font-mono">
              <div className="space-y-1">
                <p className="text-slate-200 font-bold">1. Launch Local Controller</p>
                <p className="text-[11px]">
                  Use the official OpenZiti container to spin up a local controller and edge router:
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-indigo-400 overflow-x-auto text-[10px] mt-1.5">
                  docker run --name openziti-controller -d -p 8441:8441 openziti/quickstart
                </pre>
              </div>

              <div className="space-y-1 pt-2">
                <p className="text-slate-200 font-bold">2. Register Identities and Services</p>
                <p className="text-[11px]">
                  Use the controller CLI to create identities for the buyer agent and merchant provider:
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-indigo-400 overflow-x-auto text-[10px] mt-1.5">
                  {`# Create client and host identities\nziti edge create identity user agent-customer -a client-identities\nziti edge create identity device merchant-host -a host-identities\n\n# Register the AP4M settlement service\nziti edge create service ap4m-settlement-service`}
                </pre>
              </div>

              <div className="space-y-1 pt-2">
                <p className="text-slate-200 font-bold">3. Enroll Identity and Save JSON</p>
                <p className="text-[11px]">
                  Enroll the JWT certificate to generate the final identity JSON file:
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-indigo-400 overflow-x-auto text-[10px] mt-1.5">
                  {`# Execute enrollment\nziti edge enroll agent-customer.jwt -o ziti-identity.json`}
                </pre>
                <p className="text-[10px] text-slate-500 mt-1">
                  Move the generated <code className="text-indigo-400">ziti-identity.json</code> to your project root. The runtime automatically discovers the identity and activates real mTLS tunnels!
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Identities and Logs */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Identity JSON Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2 uppercase tracking-wider font-mono">
              <FileJson className="text-indigo-400" size={16} />
              <span>Network Identity</span>
            </h2>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-[11px] font-mono text-slate-400 space-y-3">
              <div className="flex justify-between">
                <span>Current Mode:</span>
                <span className="text-indigo-400 font-bold">EDGE SIMULATION</span>
              </div>
              <div className="flex justify-between">
                <span>File Path:</span>
                <span className="text-slate-500 font-bold">/ziti-identity.json</span>
              </div>
              <div className="flex justify-between">
                <span>Channel:</span>
                <span className="text-slate-500 font-bold">ap4m-settlement</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
              The identity file encapsulates the cryptographic private key, trusted CA certificates, and controller endpoints.
            </p>
          </div>

          {/* Transmission Logs Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between h-[360px]">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2 uppercase tracking-wider font-mono border-b border-slate-800 pb-3 mb-2">
                <Terminal className="text-indigo-400" size={16} />
                <span>Latest Tunnel Logs</span>
              </h2>

              <div className="overflow-y-auto space-y-2 max-h-[220px] font-mono text-[9px] text-slate-450 leading-tight scrollbar-thin">
                {zitiLogs.length > 0 ? (
                  zitiLogs.map((log, idx) => (
                    <div key={idx} className="border-l border-slate-850 pl-2 py-0.5 text-slate-350">
                      {log}
                    </div>
                  ))
                ) : (
                  <p className="text-slate-600 italic text-center py-10">No active logs. Execute a transaction on the dashboard to populate.</p>
                )}
              </div>
            </div>

            <div className="text-[9px] text-slate-550 font-mono text-center pt-2 border-t border-slate-850">
              Records from the latest established Zero-Trust connection.
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
