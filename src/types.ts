export type BrowserContext = {
  browser: import('puppeteer').Browser;
  page: import('puppeteer').Page;
};

export type SummaryOptions = {
  length?: 'short' | 'medium' | 'long';
  format?: 'paragraphs' | 'bullets' | 'json';
  includeMetadata?: boolean;
  saveToFile?: string;
  batch?: boolean;
  comparative?: boolean;
  followLinks?: number;
  maxRetries?: number;
  retryDelay?: number;
};

export type PageMetadata = {
  title: string;
  description: string;
  url: string;
  timestamp: string;
};

export type PageContent = {
  text: string;
  metadata: PageMetadata;
  links?: string[];
};

export type BatchResult = {
  url: string;
  summary: string;
  metadata: PageMetadata;
  error?: string;
  retries?: number;
};

export class SummarizerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'SummarizerError';
  }
}
