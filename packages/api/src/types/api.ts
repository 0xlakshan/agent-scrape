export interface ScrapeRequestBody {
  url: string;
  prompt: string;
  model?: string;
  schema: Record<string, unknown>;
  output?: "json" | "xml";
  waitFor?: number;
  timeout?: number;
}

export interface ScrapeResponse {
  success: true;
  data: unknown;
}

export interface TokenUsageRequestBody {
  url: string;
  prompt: string;
  model?: string;
  schema: Record<string, unknown>;
  waitFor?: number;
  timeout?: number;
}

export interface TokenUsageResponse {
  success: true;
  tokens: {
    prompt: number;
    schema: number;
    total: number;
  };
  estimatedCost?: {
    inputCostPer1M: number;
    outputCostPer1M: number;
    estimatedInput: string;
    estimatedOutput: string;
  };
}

export interface ErrorResponse {
  error: string;
}
