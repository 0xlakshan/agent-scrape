import type { EngineOptions, RawContent } from './types';

export abstract class Engine {
  abstract scrape(url: string, options?: EngineOptions): Promise<RawContent>;
  abstract dispose(): Promise<void>;
}
