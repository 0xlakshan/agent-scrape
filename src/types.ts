export type BrowserContext = {
  browser: import('puppeteer').Browser;
  page: import('puppeteer').Page;
};

export type SummaryOptions = {
  length?: 'short' | 'medium' | 'long';
  format?: 'paragraphs' | 'bullets' | 'json';
  outputJson?: boolean;
  includeMetadata?: boolean;
  saveToFile?: string;
  batch?: boolean;
  comparative?: boolean;
  followLinks?: number;
  maxRetries?: number;
  retryDelay?: number;
  plugins?: string[];
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
  analysis?: Record<string, any>;
  tags?: string[];
  error?: string;
  retries?: number;
  processingTime?: number;
};

export type SummarySummary = {
  content: string;
  length: string;
  keyPoints?: string[];
};

export type JsonResult = {
  url: string;
  timestamp: string;
  processingTime: number;
  metadata: {
    title: string;
    description?: string;
    contentLength: number;
  };
  summary: SummarySummary;
  plugins?: Record<string, any>;
  status: 'success' | 'error';
  error?: string;
};

export type JsonBatchResult = {
  batchId: string;
  timestamp: string;
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalProcessingTime: number;
  };
  results: JsonResult[];
  comparative?: {
    commonThemes: string[];
    analysis: string;
  };
};

export type ContentChunk = {
  content: string;
  index: number;
  total: number;
  startChar: number;
  endChar: number;
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
