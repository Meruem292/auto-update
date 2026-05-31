import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import cron from "node-cron";
import { Octokit } from "octokit";

const CONFIG_FILE = path.join(process.cwd(), "cron-config.json");

interface AppConfig {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  filePath: string;
  branch: string;
  commitMessage: string;
  cronExpression: string;
  isActive: boolean;
}

const defaultConfig: AppConfig = {
  githubToken: "",
  repoOwner: "",
  repoName: "",
  filePath: "automated-update.txt",
  branch: "main",
  commitMessage: "Automated cron commit [skip ci]",
  cronExpression: "0 0 * * *",
  isActive: false,
};

let currentCronTask: any = null;
let appConfig: AppConfig = { ...defaultConfig };
let lastRunLog: string = "Never run";

// Load config from disk
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    appConfig = { ...defaultConfig, ...JSON.parse(data) };
  } catch (error) {
    appConfig = { ...defaultConfig };
    console.log("No existing config found, using defaults");
  }
}

// Save config to disk
async function saveConfig(newConfig: AppConfig) {
  appConfig = newConfig;
  await fs.writeFile(CONFIG_FILE, JSON.stringify(appConfig, null, 2), "utf-8");
  setupCron();
}

// The core logic to push a commit to GitHub
async function triggerCommit() {
  if (!appConfig.githubToken || !appConfig.repoOwner || !appConfig.repoName) {
    lastRunLog = `Failed at ${new Date().toISOString()}: Missing required GitHub configuration.`;
    console.error(lastRunLog);
    return false;
  }

  try {
    const octokit = new Octokit({ auth: appConfig.githubToken });
    const timestamp = new Date().toISOString();
    const contentToPush = Buffer.from(`Automated update triggered at: ${timestamp}`).toString("base64");

    let fileSha: string | undefined;

    // 1. Get the current file's SHA if it exists
    try {
      const response = await octokit.rest.repos.getContent({
        owner: appConfig.repoOwner,
        repo: appConfig.repoName,
        path: appConfig.filePath,
        ref: appConfig.branch,
      });

      if (!Array.isArray(response.data) && response.data.type === 'file') {
         fileSha = response.data.sha;
      }
    } catch (error: any) {
      if (error.status !== 404) {
        throw error;
      }
      // 404 means the file doesn't exist yet, which is fine!
    }

    // 2. Create or update the file
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: appConfig.repoOwner,
      repo: appConfig.repoName,
      path: appConfig.filePath,
      message: appConfig.commitMessage + ` - ${timestamp}`,
      content: contentToPush,
      sha: fileSha,
      branch: appConfig.branch,
    });

    lastRunLog = `Success! Commit pushed to ${appConfig.repoOwner}/${appConfig.repoName} on branch ${appConfig.branch} at ${timestamp}`;
    console.log(lastRunLog);
    return true;
  } catch (error: any) {
    lastRunLog = `Failed at ${new Date().toISOString()}: ${error.message}`;
    console.error("Error executing commit push:", error);
    return false;
  }
}

// Set up the local cron job (runs in background for long-lived servers)
function setupCron() {
  if (currentCronTask) {
    currentCronTask.stop();
    currentCronTask = null;
  }

  if (appConfig.isActive && appConfig.cronExpression) {
     if (cron.validate(appConfig.cronExpression)) {
        console.log(`Setting up local cron task: ${appConfig.cronExpression}`);
        currentCronTask = cron.schedule(appConfig.cronExpression, () => {
           console.log("Local cron triggered...");
           triggerCommit();
        });
     } else {
        console.error(`Invalid cron expression: ${appConfig.cronExpression}`);
     }
  }
}


async function startServer() {
  await loadConfig();
  setupCron();

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // === API ENDPOINTS ===

  // Simple auth middleware
  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  app.post("/api/login", (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
       res.json({ success: true, token: process.env.ADMIN_PASSWORD });
    } else {
       res.status(401).json({ success: false, error: "Invalid password" });
    }
  });

  app.get("/api/config", requireAdmin, (req, res) => {
    res.json(appConfig);
  });

  app.post("/api/config", requireAdmin, async (req, res) => {
    try {
      await saveConfig(req.body);
      res.json({ success: true, config: appConfig });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  
  app.get("/api/status", requireAdmin, (req, res) => {
     res.json({ 
        isRunning: !!currentCronTask && appConfig.isActive,
        lastRunLog
     });
  });

  app.post("/api/trigger-manual", requireAdmin, async (req, res) => {
     const success = await triggerCommit();
     res.json({ success, log: lastRunLog });
  });

  // Vercel Cron Endpoint (Serverless external trigger)
  // Can be secured via Vercel Cron secret locally testing skips it unless set
  app.all("/api/cron", async (req, res) => {
     const authHeader = req.headers.authorization;
     const vercelCronSecret = process.env.CRON_SECRET;
     
     if (vercelCronSecret && authHeader !== `Bearer ${vercelCronSecret}`) {
        return res.status(401).json({ error: "Unauthorized vercel cron" });
     }

     if (!appConfig.isActive) {
        return res.status(200).json({ status: "skipped", reason: "Scheduler is set to inactive."});
     }

     const success = await triggerCommit();
     res.status(success ? 200 : 500).json({ 
        success, 
        log: lastRunLog,
        timestamp: new Date().toISOString()
     });
  });

  // === VITE MIDDLEWARE (Development) ===
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}

startServer();
