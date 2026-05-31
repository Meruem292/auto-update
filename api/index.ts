import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Octokit } from "octokit";
import fs from "fs/promises";
import path from "path";
import cron from "node-cron";

const app = express();
app.use(express.json());

const router = express.Router();
const CONFIG_FILE = path.join(process.cwd(), "cron-config.json");

// In-memory log for serverless instances (resets after cold reboots)
let lastRunLog = "Never run";
let currentCronTask: any = null;

interface AppConfig {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  filePath: string;
  branch: string;
  cronExpression: string;
  isActive: boolean;
}

const defaultConfig: AppConfig = {
  githubToken: process.env.GITHUB_TOKEN || "",
  repoOwner: process.env.GITHUB_REPO_OWNER || "",
  repoName: process.env.GITHUB_REPO_NAME || "",
  filePath: process.env.GITHUB_FILE_PATH || "automated-update.txt",
  branch: process.env.GITHUB_BRANCH || "main",
  cronExpression: "0 0 * * *",
  isActive: false,
};

let appConfig: AppConfig = { ...defaultConfig };

async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    appConfig = { ...defaultConfig, ...JSON.parse(data) };
  } catch (error) {
    appConfig = { ...defaultConfig };
  }
}

async function saveConfig(newConfig: AppConfig) {
  appConfig = newConfig;
  await fs.writeFile(CONFIG_FILE, JSON.stringify(appConfig, null, 2), "utf-8");
  setupLocalCron();
}

function setupLocalCron() {
  if (currentCronTask) {
    currentCronTask.stop();
    currentCronTask = null;
  }

  if (appConfig.isActive && appConfig.cronExpression && cron.validate(appConfig.cronExpression)) {
    console.log(`Setting up local cron: ${appConfig.cronExpression}`);
    currentCronTask = cron.schedule(appConfig.cronExpression, async () => {
      console.log("Local cron executing...");
      await triggerCommit();
    });
  }
}

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const adminPass = process.env.ADMIN_PASSWORD;
  
  if (!adminPass) {
      res.status(500).json({ error: "ADMIN_PASSWORD not set on server" });
      return;
  }
  if (!authHeader || authHeader !== `Bearer ${adminPass}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
  }
  next();
};

router.post("/login", (req: Request, res: Response) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD;
  
  if (!adminPass) {
     res.status(500).json({ success: false, error: "ADMIN_PASSWORD missing in Environment Variables" });
     return;
  }
  if (password === adminPass) {
     res.json({ success: true, token: adminPass });
  } else {
     res.status(401).json({ success: false, error: "Invalid password" });
  }
});

router.get("/config", requireAdmin, (req: Request, res: Response) => {
  res.json({
    ...appConfig,
    githubToken: appConfig.githubToken ? "••••••••••••" : "", // mask it
  });
});

router.post("/config", requireAdmin, async (req: Request, res: Response) => {
  const newConfig = req.body;
  if (newConfig.githubToken === "••••••••••••") {
    newConfig.githubToken = appConfig.githubToken;
  }
  await saveConfig(newConfig);
  res.json({ success: true, config: appConfig });
});

async function triggerCommit() {
  const config = appConfig;
  if (!config.githubToken || !config.repoOwner || !config.repoName) {
    lastRunLog = `Failed: Missing GitHub config.`;
    return { success: false, log: lastRunLog };
  }
  try {
    const octokit = new Octokit({ auth: config.githubToken });
    const timestamp = new Date().toISOString();
    const contentToPush = Buffer.from(`Automated update triggered at: ${timestamp}`).toString("base64");

    // 1. Verify Repository and Branch
    await octokit.rest.repos.get({ owner: config.repoOwner, repo: config.repoName });
    await octokit.rest.repos.getBranch({ owner: config.repoOwner, repo: config.repoName, branch: config.branch });

    // 2. Get File SHA
    let fileSha: string | undefined;
    try {
      const response = await octokit.rest.repos.getContent({
        owner: config.repoOwner,
        repo: config.repoName,
        path: config.filePath,
        ref: config.branch,
      });
      if (!Array.isArray(response.data) && response.data.type === 'file') {
         fileSha = response.data.sha;
      }
    } catch (error: any) {
      if (error.status !== 404) throw error;
    }

    // 3. Update File
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: config.repoOwner,
      repo: config.repoName,
      path: config.filePath,
      message: `Automated cron commit [skip ci] - ${timestamp}`,
      content: contentToPush,
      sha: fileSha,
      branch: config.branch,
    });

    lastRunLog = `Success! Committed to ${config.repoOwner}/${config.repoName} at ${timestamp}`;
    return { success: true, log: lastRunLog };
  } catch (error: any) {
    lastRunLog = `Failed at ${new Date().toISOString()}: ${error.message}`;
    return { success: false, log: lastRunLog };
  }
}

router.get("/status", requireAdmin, (req: Request, res: Response) => {
   res.json({
      isRunning: appConfig.isActive,
      lastRunLog,
      cronExpression: appConfig.cronExpression
   });
});

router.post("/trigger-manual", requireAdmin, async (req: Request, res: Response) => {
   const result = await triggerCommit();
   res.json(result);
});

router.all("/cron", async (req: Request, res: Response) => {
   const authHeader = req.headers.authorization;
   const vercelCronSecret = process.env.CRON_SECRET;

   if (vercelCronSecret && authHeader !== `Bearer ${vercelCronSecret}`) {
      res.status(401).json({ error: "Unauthorized vercel cron execution" });
      return;
   }

   if (!appConfig.isActive) {
      res.json({ status: "skipped", reason: "Scheduler is disabled" });
      return;
   }

   const result = await triggerCommit();
   res.status(result.success ? 200 : 500).json(result);
});

app.use("/api", router);
app.use("/", router);

// Initialize
loadConfig().then(() => setupLocalCron());

export default app;
