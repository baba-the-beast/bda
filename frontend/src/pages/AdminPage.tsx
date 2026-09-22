import React, { useEffect, useState } from 'react';
import { Shield, Users, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { User } from '../types';

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [tab, setTab] = useState<'users' | 'audit' | 'security'>('users');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'users') {
        const u = await api.listUsers();
        setUsers(u);
      } else if (tab === 'audit') {
        const l = await api.getAuditLogs(50);
        setAuditLogs(l);
      } else if (tab === 'security') {
        const s = await api.getSecurityEvents(50);
        setSecurityEvents(s);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Administration &amp; Security</h1>
        <p className="text-sm text-slate-400">
          Role-Based Access Control &bull; Security Audit Trail &bull; Incident Monitoring
        </p>
      </div>

      <div className="flex border-b border-slate-800 space-x-2">
        <button
          onClick={() => setTab('users')}
          className={`pb-3 px-4 font-semibold text-sm flex items-center space-x-2 border-b-2 transition ${
            tab === 'users' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Accounts &amp; RBAC</span>
        </button>

        <button
          onClick={() => setTab('audit')}
          className={`pb-3 px-4 font-semibold text-sm flex items-center space-x-2 border-b-2 transition ${
            tab === 'audit' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Log Trail</span>
        </button>

        <button
          onClick={() => setTab('security')}
          className={`pb-3 px-4 font-semibold text-sm flex items-center space-x-2 border-b-2 transition ${
            tab === 'security' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Security Events</span>
        </button>
      </div>

      {loading && <div className="p-8 text-center text-slate-500">Loading administrative records...</div>}

      {!loading && tab === 'users' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role</th>
                <th className="p-3">Workspace</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/30">
                  <td className="p-3 font-semibold text-white">{u.full_name}</td>
                  <td className="p-3 font-mono text-xs">{u.email}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                      u.role === 'ADMIN'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : u.role === 'ANALYST'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-400">{u.workspace_id}</td>
                  <td className="p-3">
                    <span className="text-xs text-emerald-400 font-semibold flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'audit' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Action</th>
                <th className="p-3">Target</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {auditLogs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/30">
                  <td className="p-3 font-mono text-xs text-slate-400">{l.timestamp}</td>
                  <td className="p-3 font-mono text-xs text-cyan-400">{l.actor}</td>
                  <td className="p-3 font-semibold text-white">{l.action}</td>
                  <td className="p-3 font-mono text-xs text-slate-400">{l.target_resource}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {l.result} ({l.status_code})
                    </span>
                  </td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs text-slate-500">
                    No audit records recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'security' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Event Type</th>
                <th className="p-3">Severity</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {securityEvents.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30">
                  <td className="p-3 font-mono text-xs text-slate-400">{s.timestamp}</td>
                  <td className="p-3 font-semibold text-rose-400">{s.event_type}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {s.severity}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs text-slate-300">{s.actor || 'anonymous'}</td>
                  <td className="p-3 text-xs text-slate-400 font-mono">{JSON.stringify(s.details)}</td>
                </tr>
              ))}
              {securityEvents.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs text-slate-500">
                    No security incidents recorded. System running normally.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
