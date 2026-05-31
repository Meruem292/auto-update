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
  commitCount: parseInt(process.env.GITHUB_COMMIT_COUNT || "1", 10),
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

    // 1. Verify Repository and Branch first for better error messages
    try {
      await octokit.rest.repos.get({
        owner: config.repoOwner,
        repo: config.repoName,
      });

      try {
        await octokit.rest.repos.getBranch({
          owner: config.repoOwner,
          repo: config.repoName,
          branch: config.branch,
        });
      } catch (branchError: any) {
        if (branchError.status === 404) {
          throw new Error(`Branch "${config.branch}" not found in repository "${config.repoOwner}/${config.repoName}".`);
        }
        throw branchError;
      }
    } catch (repoError: any) {
      if (repoError.status === 404) {
        throw new Error(`Repository "${config.repoOwner}/${config.repoName}" not found.`);
      }
      throw repoError;
    }

    let successCount = 0;
    const iterations = Math.max(1, Math.min(config.commitCount, 20)); // Limit to 20 for safety

    for (let i = 0; i < iterations; i++) {
        const timestamp = new Date().toISOString();
        const contentToPush = Buffer.from(`Automated update ${i+1}/${iterations} triggered at: ${timestamp}`).toString("base64");

        // Get the current file's SHA if it exists (needs to be updated before each commit)
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

        // Create or update the file
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: config.repoOwner,
          repo: config.repoName,
          path: config.filePath,
          message: `Automated cron commit [skip ci] (${i+1}/${iterations}) - ${timestamp}`,
          content: contentToPush,
          sha: fileSha,
          branch: config.branch,
        });
        successCount++;
        
        // Brief pause if doing multiple commits to avoid race conditions on SHA retrieval
        if (iterations > 1 && i < iterations - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    lastRunLog = `Success! ${successCount} commit(s) pushed to ${config.repoOwner}/${config.repoName} at ${new Date().toISOString()}`;
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
