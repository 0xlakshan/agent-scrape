import { PageMetadata } from '../types';

export interface ProcessedContent {
  content: string;
  metadata: PageMetadata;
  analysis?: Record<string, any>;
  tags?: string[];
}

export interface ContentProcessor {
  name: string;
  version: string;
  description: string;
  process(content: string, metadata: PageMetadata): Promise<ProcessedContent>;
}

export interface PluginConfig {
  enabled: boolean;
  options?: Record<string, any>;
}

export interface PluginRegistry {
  [pluginName: string]: {
    processor: ContentProcessor;
    config: PluginConfig;
  };
}
