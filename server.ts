import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiApp from "./api/index";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Mount the serverless API routes uniformly for local development
  app.use(apiApp);

  // === VITE MIDDLEWARE (Development) ===
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving for local long-running nodes
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend proxy running on port ${PORT}`);
  });
}

startServer();
