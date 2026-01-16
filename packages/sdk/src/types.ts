import type { z } from "zod";

export type OutputFormat = "json" | "xml";

export interface ScrapeOptions<T extends z.ZodType = z.ZodType> {
  output?: OutputFormat;
  prompt: string;
  model?: string;
  schema: T;
  waitFor?: number;
  timeout?: number;
  postProcess?: (data: z.infer<T>) => z.infer<T> | Promise<z.infer<T>>;
}

export interface ScrapeResult<T> {
  url: string;
  data: T;
  format: OutputFormat;
}
