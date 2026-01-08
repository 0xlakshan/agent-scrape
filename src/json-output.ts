import { v4 as uuidv4 } from 'uuid';
import { PageContent, SummaryOptions, BatchResult, PageMetadata } from './types';

export interface JsonSingleResult {
  url: string;
  timestamp: string;
  metadata: {
    title: string;
    description: string;
    contentLength: number;
    processingTime: number;
  };
  summary: {
    content: string;
    length: string;
    keyPoints: string[];
  };
  plugins?: Record<string, any>;
  status: 'success' | 'error';
  error?: string;
  retries?: number;
}

export interface JsonBatchResult {
  batchId: string;
  timestamp: string;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
  results: JsonSingleResult[];
  comparative?: {
    commonThemes: string[];
    analysis: string;
  };
}

function extractKeyPoints(summary: string): string[] {
  const bulletPoints = summary.match(/^[•\-\*]\s+(.+)$/gm);
  if (bulletPoints) {
    return bulletPoints.map(point => point.replace(/^[•\-\*]\s+/, '').trim());
  }
  
  const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 20);
  return sentences.slice(0, 3).map(s => s.trim());
}

export function formatJsonSingle(
  summary: string,
  data: PageContent,
  options: SummaryOptions,
  processingTime: number = 0,
  error?: string,
  retries?: number
): JsonSingleResult {
  const result: JsonSingleResult = {
    url: data.metadata.url,
    timestamp: data.metadata.timestamp,
    metadata: {
      title: data.metadata.title,
      description: data.metadata.description,
      contentLength: data.text?.length || 0,
      processingTime: Math.round(processingTime * 100) / 100
    },
    summary: {
      content: summary,
      length: options.length || 'medium',
      keyPoints: extractKeyPoints(summary)
    },
    status: error ? 'error' : 'success'
  };

  if (error) {
    result.error = error;
  }

  if (retries !== undefined && retries > 0) {
    result.retries = retries;
  }

  return result;
}

export function formatJsonBatch(
  results: BatchResult[],
  comparative?: string,
  batchId?: string
): JsonBatchResult {
  const jsonResults: JsonSingleResult[] = results.map(result => ({
    url: result.url,
    timestamp: result.metadata.timestamp,
    metadata: {
      title: result.metadata.title,
      description: result.metadata.description,
      contentLength: 0, // Not available in BatchResult
      processingTime: 0  // Not tracked in current implementation
    },
    summary: {
      content: result.summary,
      length: 'medium', // Default since not stored in BatchResult
      keyPoints: extractKeyPoints(result.summary)
    },
    plugins: result.analysis,
    status: result.error ? 'error' : 'success',
    ...(result.error && { error: result.error }),
    ...(result.retries !== undefined && result.retries > 0 && { retries: result.retries })
  }));

  const successful = results.filter(r => !r.error).length;
  const failed = results.length - successful;

  const batchResult: JsonBatchResult = {
    batchId: batchId || uuidv4(),
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      successful,
      failed
    },
    results: jsonResults
  };

  if (comparative) {
    const themes = extractCommonThemes(results);
    batchResult.comparative = {
      commonThemes: themes,
      analysis: comparative
    };
  }

  return batchResult;
}

function extractCommonThemes(results: BatchResult[]): string[] {
  const allTags = results
    .filter(r => r.tags && !r.error)
    .flatMap(r => r.tags || []);
  
  const tagCounts = allTags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(tagCounts)
    .filter(([_, count]) => count > 1)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 5)
    .map(([tag]) => tag);
}
