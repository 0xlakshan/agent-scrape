import type { Request, Response } from "express";
import type {
  TokenUsageRequestBody,
  TokenUsageResponse,
  ErrorResponse,
} from "../types/api";
import { ScrapeEngine } from "../scrapeEngine/scrapeEngine";

const scrapeEngine = new ScrapeEngine();

export async function tokenUsageController(
  req: Request<{}, TokenUsageResponse | ErrorResponse, TokenUsageRequestBody>,
  res: Response<TokenUsageResponse | ErrorResponse>,
): Promise<void> {
  const {
    url,
    prompt,
    model = "gemini-2.0-flash-exp",
    schema,
    waitFor,
    timeout = 30000,
  } = req.body;

  if (!url || !prompt || !schema) {
    res.status(400).json({ error: "url, prompt, and schema are required" });
    return;
  }

  try {
    const { cleanedHtml } = await scrapeEngine.scrape({
      url,
      waitFor,
      timeout,
    });

    const tokens = scrapeEngine.estimateTokenUsage(
      prompt,
      cleanedHtml,
      schema,
      model,
    );
    const pricing = scrapeEngine.getModelPricing(model);
    const estimatedCost = scrapeEngine.calculateCost(tokens.total, pricing);

    res.json({
      success: true,
      tokens,
      estimatedCost,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function closeScraper(): Promise<void> {
  await scrapeEngine.closeBrowser();
}
