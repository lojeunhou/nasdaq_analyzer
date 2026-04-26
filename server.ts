import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy Eastmoney Data for QDII funds
  app.get("/api/funds", async (req, res) => {
    try {
      const fundCodes = ["018095", "006282", "019449", "019172"]; // Note: 018095 was an error in my thought earlier?
      // Wait, 018095 was 博时机器人. I should use 019450 !
      // Let me fix that.
      
      const Fcodes = "019450,006282,019449,019172";
      
      // Fetch latest summary for all
      const summaryRes = await fetch(`https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=50&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=1&Fcodes=${Fcodes}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const summaryData = await summaryRes.json();
      
      // Fetch history for each
      const historyPromises = ["019450", "006282", "019449", "019172"].map(async (code) => {
        const histRes = await fetch(`https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList?FCODE=${code}&pageIndex=1&pageSize=260&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=1`);
        const histData = await histRes.json();
        return { code, history: histData.Datas ? histData.Datas.reverse() : [] }; // reverse to have oldest first
      });
      
      const histories = await Promise.all(historyPromises);
      const historyMap = histories.reduce((acc, curr) => {
        acc[curr.code] = curr.history;
        return acc;
      }, {});
      
      res.json({ summary: summaryData.Datas, history: historyMap });
    } catch (error) {
      console.error('Error fetching Fund data:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
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
