import type { LanguageModel } from "ai";

export type OutputFormat = "markdown" | "json" | "text" | "html";
export type AIMode = "stream" | "generate";

export interface RetryConfig {
  attempts?: number;
  delay?: number;
  backoff?: "linear" | "exponential";
}

export interface ScrapeOptions {
  output?: OutputFormat;
  model?: LanguageModel;
  aiMode?: AIMode;
  schema?: Record<string, unknown>;
  selectors?: string[];
  waitFor?: string;
  timeout?: number;
  retry?: RetryConfig;
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

export interface RawContent {
  html: string;
  text: string;
  metadata: PageMetadata;
}

export interface TransformOptions {
  mode?: AIMode;
  schema?: Record<string, unknown>;
}
