import express from "express";
import { scrapeController, closeScraper as closeScrapeController } from "./controllers/scrape";
import { tokenUsageController, closeScraper as closeTokenController } from "./controllers/token-usage";

const app = express();
app.use(express.json());

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.post("/scrape", scrapeController);

app.post("/token-usage", tokenUsageController);

export function startServer(port: string | number = process.env.PORT || 3000): ReturnType<typeof app.listen> {
  const server = app.listen(port, () =>
    console.log(`Scrape API running on port ${port}`),
  );

  const shutdown = async (): Promise<void> => {
    console.log("\nShutting down...");
    await closeScrapeController();
    await closeTokenController();
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  
  return server;
}

export { app };

if (import.meta.url === `file://${process.argv[1]}`) startServer();
