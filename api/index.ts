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

    // 1. Verify Repository and Branch first for better error messages
    try {
      const { data: repoData } = await octokit.rest.repos.get({
        owner: config.repoOwner,
        repo: config.repoName,
      });

      // Verification of branch
      try {
        await octokit.rest.repos.getBranch({
          owner: config.repoOwner,
          repo: config.repoName,
          branch: config.branch,
        });
      } catch (branchError: any) {
        if (branchError.status === 404) {
          throw new Error(`Branch "${config.branch}" not found in repository "${config.repoOwner}/${config.repoName}". Please check if your default branch is "master" or "main".`);
        }
        throw branchError;
      }

    } catch (repoError: any) {
      if (repoError.status === 404) {
        throw new Error(`Repository "${config.repoOwner}/${config.repoName}" not found. Check your GITHUB_REPO_OWNER and GITHUB_REPO_NAME environment variables.`);
      }
      if (repoError.status === 401 || repoError.status === 403) {
        throw new Error(`Permission denied. Check if your GITHUB_TOKEN is valid and has "repo" scope.`);
      }
      throw repoError;
    }

    // 2. Get the current file's SHA if it exists
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
      // 404 just means file doesn't exist yet, which is fine
    }

    // 3. Create or update the file
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
