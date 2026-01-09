import type { LanguageModelV1 } from 'ai';

export type OutputFormat = 'markdown' | 'json' | 'text' | 'html';
export type ScrapingEngine = 'puppeteer' | 'firecrawl';
export type AIMode = 'stream' | 'generate';

export interface RetryConfig {
  attempts?: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
}

export interface ScrapeOptions {
  output?: OutputFormat;
  model?: LanguageModelV1;
  aiMode?: AIMode;
  schema?: Record<string, unknown>;
  selectors?: string[];
  postProcess?: (data: ScrapedData) => ScrapedData | Promise<ScrapedData>;
}

export interface ScrapedData {
  url: string;
  content: string;
  format: OutputFormat;
  metadata: PageMetadata;
  structured?: Record<string, unknown>;
}

export interface PageMetadata {
  title: string;
  description: string;
  timestamp: string;
}

export interface EngineOptions {
  selectors?: string[];
  waitFor?: string;
  timeout?: number;
}

export interface RawContent {
  html: string;
  text: string;
  metadata: PageMetadata;
}

export interface ScraperConfig {
  engine?: ScrapingEngine;
  model?: LanguageModelV1;
  output?: OutputFormat;
  firecrawl?: { apiKey: string };
  retry?: RetryConfig;
}

export abstract class Engine {
  abstract scrape(url: string, options?: EngineOptions): Promise<RawContent>;
  abstract dispose(): Promise<void>;
}
