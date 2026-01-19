export interface ScraperConfig {
  headless?: boolean;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
  locale?: string;
  timezoneId?: string;
}

export interface ScrapeRequest {
  url: string;
  waitFor?: number;
  timeout?: number;
}

export interface ScrapePageResult {
  html: string;
  cleanedHtml: string;
}

export interface TokenEstimate {
  prompt: number;
  schema: number;
  total: number;
}

export interface ModelPricing {
  input: number;
  output: number;
}

export interface CostEstimate {
  inputCostPer1M: number;
  outputCostPer1M: number;
  estimatedInput: string;
  estimatedOutput: string;
}
