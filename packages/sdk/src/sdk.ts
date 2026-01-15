import type {
  ScrapeOptions,
  ScrapedData,
  RawContent,
  RetryConfig,
} from "./types";
import { Transformer } from "./transformer";
import { EngineError } from "./errors";

const API_URL = process.env.SCRAPE_API_URL || "http://localhost:3000";
const DEFAULT_RETRY: RetryConfig = {
  attempts: 3,
  delay: 1000,
  backoff: "exponential",
};

export class Scraper {
  private config: ScrapeOptions;

  constructor(config: ScrapeOptions = {}) {
    this.config = config;
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = {},
  ): Promise<T> {
    const {
      attempts = DEFAULT_RETRY.attempts!,
      delay = DEFAULT_RETRY.delay!,
      backoff = DEFAULT_RETRY.backoff,
    } = { ...this.config.retry, ...config };
    let lastError: Error | undefined;

    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (i < attempts - 1) {
          const wait =
            backoff === "exponential"
              ? delay * Math.pow(2, i)
              : delay * (i + 1);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
    throw new EngineError(
      `Failed after ${attempts} attempts: ${lastError?.message}`,
      lastError,
    );
  }

  private async fetchScrape(
    url: string,
    options: ScrapeOptions = {},
  ): Promise<RawContent> {
    const res = await fetch(`${API_URL}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        selectors: options.selectors,
        waitFor: options.waitFor,
        timeout: options.timeout,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new EngineError(json.error || `API error: ${res.status}`);
    }

    return json.data;
  }

  async scrape(url: string, options: ScrapeOptions = {}): Promise<ScrapedData> {
    const raw = await this.withRetry(() => this.fetchScrape(url, options));

    const model = options.model ?? this.config.model;
    const format = options.output ?? this.config.output ?? "html";
    const transformer = new Transformer(model);

    const transformed = await transformer.transform(raw, format, {
      mode: options.aiMode,
      schema: options.schema,
    });

    let result: ScrapedData = {
      url,
      content: transformed.content,
      format,
      metadata: raw.metadata,
      structured: transformed.structured,
    };

    if (options.postProcess) result = await options.postProcess(result);
    return result;
  }

  async scrapeBatch(
    urls: string[],
    options: ScrapeOptions = {},
  ): Promise<ScrapedData[]> {
    return Promise.all(urls.map((url) => this.scrape(url, options)));
  }
}
