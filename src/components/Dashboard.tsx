import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Play, Clock, Github, ShieldCheck, LogOut, Database } from 'lucide-react';

interface AppConfig {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  filePath: string;
  branch: string;
}

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
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
  }, [token]);

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
              <h1 className="text-xl font-bold text-gray-900 font-sans tracking-tight">Vercel Auto-Pusher</h1>
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
              <div className="bg-slate-800 px-4 py-3 flex items-center">
                <Clock className="text-slate-300 w-5 h-5 mr-2" />
                <h3 className="text-slate-100 font-medium">Cron Status (Vercel)</h3>
              </div>
              <div className="p-4">
                <div className="flex items-center mb-4">
                  <div className="w-3 h-3 rounded-full mr-2 bg-green-500 animate-pulse"></div>
                  <span className="text-sm font-medium text-gray-700">
                    Vercel Serverless Active
                  </span>
                </div>

                <div className="text-xs font-mono text-gray-500 bg-gray-50 p-3 rounded border border-gray-100 break-words mb-4 min-h-[4rem]">
                  {status.lastRunLog}
                </div>

                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  On Vercel Free (Hobby), scheduled tasks are automatically executed reliably once every 24 hours at midnight.
                </p>

                <button
                  onClick={handleTrigger}
                  disabled={triggering}
                  className="w-full flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {triggering ? 'Pushing...' : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Test Push Now
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>

          {/* Read Only Env Config */}
          <div className="md:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center">
                  <Database className="text-gray-400 w-5 h-5 mr-2" />
                  <h2 className="text-lg font-medium text-gray-900">Environment Variables</h2>
                </div>
                <div className="flex items-center text-xs text-slate-500">
                  <ShieldCheck className="w-4 h-4 mr-1 text-green-500" /> Serverless Safe
                </div>
              </div>

              <div className="p-6">
                <p className="text-sm text-gray-600 mb-6 font-medium">To run safely and persistently for free on Vercel, this application pulls configuration directly from your Vercel Environment Variables instead of an unstable local data file.</p>

                <div className="space-y-4">
                  {/* GitHub Settings mapped locally */}
                  <ConfigRow label="GITHUB_TOKEN" value={config.githubToken || "[MISSING]"} isMissing={!config.githubToken} />
                  <ConfigRow label="GITHUB_REPO_OWNER" value={config.repoOwner || "[MISSING]"} isMissing={!config.repoOwner} />
                  <ConfigRow label="GITHUB_REPO_NAME" value={config.repoName || "[MISSING]"} isMissing={!config.repoName} />
                  <ConfigRow label="GITHUB_FILE_PATH" value={config.filePath} isMissing={false} />
                  <ConfigRow label="GITHUB_BRANCH" value={config.branch} isMissing={false} />
                  <ConfigRow label="CRON_SECRET" value="Automatically injected by Vercel" isMissing={false} />

                  <div className="mt-8 bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-800">
                    <strong>Manage your configuration:</strong> Go to your Vercel Project Dashboard → Settings → Environment Variables to add or edit these credentials, then trigger a redeploy.
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </main>
    </div>
  );
}

function ConfigRow({ label, value, isMissing }: { label: string, value: string, isMissing: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-3 border-b border-gray-100 last:border-0 items-center">
      <dt className="text-sm font-medium text-gray-500 font-mono">{label}</dt>
      <dd className={`text-sm sm:col-span-2 p-2 rounded \${isMissing ? 'bg-red-50 text-red-600 font-bold' : 'bg-slate-50 text-slate-700 font-mono'}`}>
        {value}
      </dd>
    </div>
  );
}
