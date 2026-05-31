import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { AppConfig } from '../types';
import { motion } from 'motion/react';
import { Save, Play, CheckCircle, AlertCircle, Clock, Github, Settings, LogOut } from 'lucide-react';

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  
  const [status, setStatus] = useState<{ isRunning: boolean; lastRunLog: string }>({ 
    isRunning: false, 
    lastRunLog: 'Fetching...'
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
    
    // Poll status periodically (since cron might run in the background)
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    
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
        // give brief visual feedback, then fetch latest status
        setTimeout(() => fetchStatus(), 1000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await fetch('/api/trigger-manual', {
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Github className="w-8 h-8 text-gray-900 mr-3" />
              <h1 className="text-xl font-bold text-gray-900 font-sans tracking-tight">Git Auto-Pusher</h1>
            </div>
            <div className="flex items-center">
              <button 
                onClick={onLogout}
                className="text-gray-500 hover:text-gray-700 flex items-center transition-colors text-sm"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto mt-8 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Status Panel */}
          <div className="md:col-span-1 space-y-6">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="bg-slate-800 px-4 py-3 flex items-center shadow-inner">
                <Clock className="text-slate-300 w-5 h-5 mr-2" />
                <h3 className="text-slate-100 font-medium">Scheduler Status</h3>
              </div>
              <div className="p-4">
                <div className="flex items-center mb-4">
                  <div className={`w-3 h-3 rounded-full mr-2 ${status.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {status.isRunning ? 'Active & Watching' : 'Inactive / Stopped'}
                  </span>
                </div>

                <div className="text-xs font-mono text-gray-500 bg-gray-50 p-3 rounded border border-gray-100 break-words">
                  {status.lastRunLog}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={handleTrigger}
                    disabled={triggering || !config.githubToken}
                    className="w-full flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                  >
                    {triggering ? 'Pushing...' : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Run Manual Push
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-blue-50 rounded-xl p-4 border border-blue-100"
            >
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Vercel Deployment</h4>
              <p className="text-xs text-blue-800">
                If deploying to Vercel, serverless functions handle crons via <code className="bg-blue-100 px-1 rounded">vercel.json</code>. The internal local cron here works great on long-running containers (VPS/Cloud Run). Vercel crons will ping the <strong>/api/cron</strong> endpoint identically.
              </p>
            </motion.div>
          </div>

          {/* Configuration Form */}
          <div className="md:col-span-2">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="border-b border-gray-200 px-6 py-4 flex items-center">
                <Settings className="text-gray-400 w-5 h-5 mr-2" />
                <h2 className="text-lg font-medium text-gray-900">Task Configuration</h2>
              </div>
              
              <div className="p-6">
                <form onSubmit={handleSave} className="space-y-6">
                  {/* GitHub Settings */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">GitHub Settings</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Personal Access Token</label>
                      <input 
                        type="password"
                        required
                        value={config.githubToken}
                        onChange={e => setConfig({...config, githubToken: e.target.value})}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm font-mono"
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      />
                      <p className="mt-1 text-xs text-gray-500">Requires 'repo' scope.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Repository Owner</label>
                        <input 
                          type="text"
                          required
                          value={config.repoOwner}
                          onChange={e => setConfig({...config, repoOwner: e.target.value})}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm"
                          placeholder="e.g. torvalds"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Repository Name</label>
                        <input 
                          type="text"
                          required
                          value={config.repoName}
                          onChange={e => setConfig({...config, repoName: e.target.value})}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm"
                          placeholder="e.g. linux"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Target Branch</label>
                        <input 
                          type="text"
                          required
                          value={config.branch}
                          onChange={e => setConfig({...config, branch: e.target.value})}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">File to Update</label>
                        <input 
                          type="text"
                          required
                          value={config.filePath}
                          onChange={e => setConfig({...config, filePath: e.target.value})}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm font-mono"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Commit Message Base</label>
                      <input 
                        type="text"
                        required
                        value={config.commitMessage}
                        onChange={e => setConfig({...config, commitMessage: e.target.value})}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  <hr className="border-gray-200" />

                  {/* Schedule Settings */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Schedule</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Cron Expression</label>
                      <input 
                        type="text"
                        required
                        value={config.cronExpression}
                        onChange={e => setConfig({...config, cronExpression: e.target.value})}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm font-mono"
                        placeholder="0 0 * * *"
                      />
                      <p className="mt-1 text-xs text-gray-500">Cron format (e.g., "0 0 * * *" for daily). Check <i>crontab.guru</i> for help.</p>
                    </div>

                    <div className="flex items-center">
                      <input
                        id="isActive"
                        type="checkbox"
                        checked={config.isActive}
                        onChange={e => setConfig({...config, isActive: e.target.checked})}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900 font-medium">
                        Enable Automated Commits
                      </label>
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center justify-center px-6 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Saving...' : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Configuration
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>

        </div>
      </main>
    </div>
  );
}
