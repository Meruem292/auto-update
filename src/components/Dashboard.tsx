import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Play, Clock, Github, Save, LogOut, Settings2, Terminal, AlertCircle } from 'lucide-react';

interface AppConfig {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  filePath: string;
  branch: string;
  cronExpression: string;
  isActive: boolean;
}

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [status, setStatus] = useState<{ isRunning: boolean; lastRunLog: string; cronExpression: string }>({
    isRunning: false,
    lastRunLog: 'Fetching status...',
    cronExpression: '* * * * *'
  });

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setConfig(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Poll status every 10s
    return () => clearInterval(interval);
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setSaveStatus('success');
        fetchStatus();
      } else {
        setSaveStatus('error');
      }
    } catch (e) {
      setSaveStatus('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await fetch('/api/trigger-manual', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchStatus();
    } finally {
      setTriggering(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-12">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Github className="w-8 h-8 text-slate-900 mr-3" />
              <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">Auto-Commit Dashboard</h1>
            </div>
            <div className="flex items-center">
              <button
                onClick={onLogout}
                className="text-slate-500 hover:text-slate-700 flex items-center transition-colors text-sm font-medium"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto mt-8 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column: Status & Control */}
          <div className="lg:col-span-1 space-y-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="bg-slate-900 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center">
                  <Clock className="text-slate-400 w-5 h-5 mr-2" />
                  <h3 className="text-white font-semibold">Scheduler</h3>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${status.isRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                  {status.isRunning ? 'Running' : 'Inactive'}
                </div>
              </div>
              
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                   <div className="text-xs text-slate-500 font-mono">CRON: {status.cronExpression}</div>
                   {status.isRunning && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>}
                </div>

                <div className="mb-6">
                  <div className="text-[10px] items-center flex font-bold text-slate-400 uppercase tracking-widest mb-2">
                    <Terminal className="w-3 h-3 mr-1" />
                    Last Activity
                  </div>
                  <div className="text-xs font-mono text-slate-300 bg-slate-900 p-4 rounded-xl break-words leading-relaxed min-h-[6rem] shadow-inner selection:bg-slate-700">
                    {status.lastRunLog}
                  </div>
                </div>

                <button
                  onClick={handleTrigger}
                  disabled={triggering}
                  className="w-full flex items-center justify-center p-3 text-sm font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-slate-200"
                >
                  {triggering ? '...' : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Manual Commit
                    </>
                  )}
                </button>
              </div>
            </motion.div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-amber-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                   <h4 className="text-sm font-bold text-amber-900 mb-1">Serverless Note</h4>
                   <p className="text-xs text-amber-800 leading-relaxed">
                     When running on Vercel, the internal local interval is restricted to daily runs on the free tier. This dashboard works best in persistent environments.
                   </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Settings Form */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="border-b border-slate-100 px-8 py-5 flex items-center bg-slate-50/50">
                <Settings2 className="text-slate-400 w-5 h-5 mr-3" />
                <h2 className="text-lg font-bold text-slate-900">Configuration</h2>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-4 md:col-span-2">
                    <div className="flex items-center justify-between">
                       <label className="block text-sm font-bold text-slate-700">Push to GitHub</label>
                       <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={config.isActive} 
                          onChange={(e) => setConfig({ ...config, isActive: e.target.checked })}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
                        <span className="ml-3 text-xs font-semibold text-slate-500 uppercase tracking-tighter">
                          {config.isActive ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <FormItem label="GitHub Access Token" desc="Personal Access Token with 'repo' scope">
                    <input
                      type="password"
                      value={config.githubToken}
                      onChange={(e) => setConfig({ ...config, githubToken: e.target.value })}
                      className="form-input"
                      placeholder="ghp_xxxxxxxxxxxx"
                    />
                  </FormItem>

                  <FormItem label="Cron Schedule" desc="Standard cron syntax (e.g., '*/15 * * * *')">
                    <input
                      type="text"
                      value={config.cronExpression}
                      onChange={(e) => setConfig({ ...config, cronExpression: e.target.value })}
                      className="form-input font-mono text-xs"
                      placeholder="* * * * *"
                    />
                  </FormItem>

                  <FormItem label="Repository Owner" desc="Username or Organization">
                    <input
                      type="text"
                      value={config.repoOwner}
                      onChange={(e) => setConfig({ ...config, repoOwner: e.target.value })}
                      className="form-input"
                    />
                  </FormItem>

                  <FormItem label="Repository Name" desc="Exact name of the destination repo">
                    <input
                      type="text"
                      value={config.repoName}
                      onChange={(e) => setConfig({ ...config, repoName: e.target.value })}
                      className="form-input"
                    />
                  </FormItem>

                  <FormItem label="File Path" desc="Relative path to modify (e.g. log.txt)">
                    <input
                      type="text"
                      value={config.filePath}
                      onChange={(e) => setConfig({ ...config, filePath: e.target.value })}
                      className="form-input"
                    />
                  </FormItem>

                  <FormItem label="Branch" desc="Target branch (usually main or master)">
                    <input
                      type="text"
                      value={config.branch}
                      onChange={(e) => setConfig({ ...config, branch: e.target.value })}
                      className="form-input"
                    />
                  </FormItem>
                </div>

                <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    {saveStatus === 'success' && <span className="text-emerald-500 text-sm font-medium flex items-center animate-out fade-out duration-300">Settings updated successfully</span>}
                    {saveStatus === 'error' && <span className="text-rose-500 text-sm font-medium">Failed to update settings</span>}
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center px-8 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 shadow-lg shadow-slate-200"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      </main>
      
      <style>{`
        .form-input {
          @apply w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all text-sm;
        }
      `}</style>
    </div>
  );
}

function FormItem({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-bold text-slate-800">{label}</label>
      <p className="text-[11px] text-slate-400 leading-tight mb-2">{desc}</p>
      {children}
    </div>
  );
}
