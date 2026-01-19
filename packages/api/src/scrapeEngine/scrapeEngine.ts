import type { Browser, Page } from "playwright";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import type {
  ScraperConfig,
  ScrapeRequest,
  ScrapePageResult,
  TokenEstimate,
  ModelPricing,
  CostEstimate,
} from "../types";
import { encoding_for_model, type TiktokenModel } from "tiktoken";

chromium.use(stealth());

export class ScrapeEngine {
  private browser: Browser | null = null;
  private readonly config: Required<ScraperConfig>;

  constructor(config: ScraperConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      userAgent:
        config.userAgent ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      viewport: config.viewport ?? {
        width: 1280,
        height: 720,
      },
      locale: config.locale ?? "en-US",
      timezoneId: config.timezoneId ?? "America/New_York",
    };
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: this.config.headless });
    }
    return this.browser;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(svg|path|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<(header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(
        /\s+(class|id|style|data-[\w-]+|aria-[\w-]+|role|onclick|on\w+)="[^"]*"/gi,
        "",
      )
      .replace(/<(\w+)[^>]*>\s*<\/\1>/gi, "")
      .replace(/\s+/g, " ")
      .replace(/>\s+</g, "><")
      .trim();
  }

  async scrape(request: ScrapeRequest): Promise<ScrapePageResult> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: this.config.userAgent,
      viewport: {
        width: this.config.viewport.width + Math.floor(Math.random() * 100),
        height: this.config.viewport.height + Math.floor(Math.random() * 100),
      },
      locale: this.config.locale,
      timezoneId: this.config.timezoneId,
    });

    const page = await context.newPage();

    try {
      await page.goto(request.url, {
        waitUntil: "domcontentloaded",
        timeout: request.timeout ?? 30000,
      });

      if (request.waitFor) {
        await page.waitForTimeout(request.waitFor);
      }

      const html = await page.content();
      const cleanedHtml = this.cleanHtml(html);

      return { html, cleanedHtml };
    } finally {
      await page.close();
      await context.close();
    }
  }

  estimateTokens(text: string, model: string): number {
    try {
      const modelMap: Record<string, TiktokenModel> = {
        "gemini-2.0-flash-exp": "gpt-4",
        "gemini-1.5-pro": "gpt-4",
        "gemini-1.5-flash": "gpt-3.5-turbo",
      };

      const tiktokenModel = modelMap[model] || "gpt-4";
      const encoder = encoding_for_model(tiktokenModel);
      const tokens = encoder.encode(text).length;
      encoder.free();
      return tokens;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }

  getModelPricing(model: string): ModelPricing {
    const pricing: Record<string, ModelPricing> = {
      "gemini-2.0-flash-exp": { input: 0, output: 0 },
      "gemini-1.5-pro": { input: 1.25, output: 5.0 },
      "gemini-1.5-flash": { input: 0.075, output: 0.3 },
    };
    return pricing[model] || { input: 0, output: 0 };
  }

  calculateCost(totalTokens: number, pricing: ModelPricing): CostEstimate {
    const estimatedInputCost = (totalTokens / 1_000_000) * pricing.input;
    const estimatedOutputCost = (totalTokens / 1_000_000) * pricing.output;

    return {
      inputCostPer1M: pricing.input,
      outputCostPer1M: pricing.output,
      estimatedInput: `$${estimatedInputCost.toFixed(4)}`,
      estimatedOutput: `$${estimatedOutputCost.toFixed(4)}`,
    };
  }

  estimateTokenUsage(
    prompt: string,
    cleanedHtml: string,
    schema: Record<string, unknown>,
    model: string,
  ): TokenEstimate {
    const fullPrompt = `${prompt}\n\nHTML:\n${cleanedHtml}`;
    const schemaText = JSON.stringify(schema);

    const promptTokens = this.estimateTokens(fullPrompt, model);
    const schemaTokens = this.estimateTokens(schemaText, model);

    return {
      prompt: promptTokens,
      schema: schemaTokens,
      total: promptTokens + schemaTokens,
    };
  }
}
