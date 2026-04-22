import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser
  app.use(express.json());

  // API constraints check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy Nasdaq Data
  app.get("/api/nasdaq", async (req, res) => {
    try {
      const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/^IXIC?range=1d&interval=5m', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!response.ok) throw new Error("Failed to fetch data from Yahoo Finance");
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching Nasdaq data:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
