import type { ScraperConfig, ScrapeOptions, ScrapedData, Engine, RetryConfig } from './types';
import { PuppeteerEngine, FirecrawlEngine } from './engines';
import { Transformer } from './transformer';
import { EngineError, ConfigError } from './errors';

const DEFAULT_RETRY: RetryConfig = { attempts: 3, delay: 1000, backoff: 'exponential' };

export class Scraper {
  private engines: Map<string, Engine> = new Map();
  private config: ScraperConfig;

  constructor(config: ScraperConfig = {}) {
    this.config = config;
  }

  private getEngine(name: string): Engine {
    if (!this.engines.has(name)) {
      if (name === 'firecrawl') {
        if (!this.config.firecrawl?.apiKey) throw new ConfigError('Firecrawl API key required');
        this.engines.set(name, new FirecrawlEngine(this.config.firecrawl.apiKey));
      } else {
        this.engines.set(name, new PuppeteerEngine());
      }
    }
    return this.engines.get(name)!;
  }

  private async withRetry<T>(fn: () => Promise<T>, config: RetryConfig = {}): Promise<T> {
    const { attempts = DEFAULT_RETRY.attempts!, delay = DEFAULT_RETRY.delay!, backoff = DEFAULT_RETRY.backoff } = { ...this.config.retry, ...config };
    let lastError: Error | undefined;

    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (i < attempts - 1) {
          const wait = backoff === 'exponential' ? delay * Math.pow(2, i) : delay * (i + 1);
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }
    throw new EngineError(`Failed after ${attempts} attempts: ${lastError?.message}`, lastError);
  }

  async scrape(url: string, options: ScrapeOptions = {}): Promise<ScrapedData> {
    const engineName = this.config.engine ?? 'puppeteer';
    const engine = this.getEngine(engineName);

    const raw = await this.withRetry(() => engine.scrape(url, { selectors: options.selectors }));

    const model = options.model ?? this.config.model;
    const format = options.output ?? this.config.output ?? 'text';
    const transformer = new Transformer(model);

    const transformed = await transformer.transform(raw, format, { mode: options.aiMode, schema: options.schema });

    let result: ScrapedData = { url, content: transformed.content, format, metadata: raw.metadata, structured: transformed.structured };

    if (options.postProcess) {
      result = await options.postProcess(result);
    }
    return result;
  }

  async scrapeBatch(urls: string[], options: ScrapeOptions = {}): Promise<ScrapedData[]> {
    return Promise.all(urls.map(url => this.scrape(url, options)));
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.engines.values()].map(e => e.dispose()));
    this.engines.clear();
  }
}
