import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Octokit } from "octokit";

const app = express();
app.use(express.json());

const router = express.Router();

// In-memory log for serverless instances (resets after cold reboots)
let lastRunLog = "Never run";

const getConfig = () => ({
  githubToken: process.env.GITHUB_TOKEN || "",
  repoOwner: process.env.GITHUB_REPO_OWNER || "",
  repoName: process.env.GITHUB_REPO_NAME || "",
  filePath: process.env.GITHUB_FILE_PATH || "automated-update.txt",
  branch: process.env.GITHUB_BRANCH || "main",
});

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
  const conf = getConfig();
  res.json({
    ...conf,
    githubToken: conf.githubToken ? "•••••••••••• [Hidden in ENV]" : "", // mask it
  });
});

async function triggerCommit() {
  const config = getConfig();
  if (!config.githubToken || !config.repoOwner || !config.repoName) {
    lastRunLog = `Failed: Missing GitHub config (GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME) in Environment Variables.`;
    return { success: false, log: lastRunLog };
  }
  try {
    const octokit = new Octokit({ auth: config.githubToken });
    const timestamp = new Date().toISOString();
    const contentToPush = Buffer.from(`Automated update triggered at: ${timestamp}`).toString("base64");

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
      isRunning: true, // Serverless crons are handled externally, always ready
      lastRunLog
   });
});

router.post("/trigger-manual", requireAdmin, async (req: Request, res: Response) => {
   const result = await triggerCommit();
   res.json(result);
});

router.all("/cron", async (req: Request, res: Response) => {
   const authHeader = req.headers.authorization;
   const vercelCronSecret = process.env.CRON_SECRET;

   // Secure verification (CRON_SECRET is injected globally by Vercel inside cron requests)
   if (vercelCronSecret && authHeader !== `Bearer ${vercelCronSecret}`) {
      res.status(401).json({ error: "Unauthorized vercel cron execution" });
      return;
   }

   const result = await triggerCommit();
   res.status(result.success ? 200 : 500).json(result);
});

app.use("/api", router);
app.use("/", router);

export default app;
