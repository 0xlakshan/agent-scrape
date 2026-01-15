import express from "express";
import { chromium, Browser } from "playwright";

const app = express();
app.use(express.json());

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.post("/scrape", async (req, res) => {
  const { url, timeout = 30000 } = req.body;

  if (!url) return res.status(400).json({ error: "url is required" });

  try {
    const b = await getBrowser();
    const page = await b.newPage();

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout });
      const html = await page.content();
      res.json({ success: true, data: { html } });
    } finally {
      await page.close();
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export function startServer(port = process.env.PORT || 3000) {
  const server = app.listen(port, () =>
    console.log(`Scrape API running on port ${port}`),
  );

  const shutdown = async () => {
    console.log("\nShutting down...");
    await closeBrowser();
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return server;
}

export { app };

// Auto-start when run directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer();
}
