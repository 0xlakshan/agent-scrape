import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { PageContent, SummaryOptions, BatchResult, SummarizerError, JsonResult, JsonBatchResult } from './types';

export function formatOutput(
  summary: string,
  data: PageContent,
  options: SummaryOptions,
  processingTime: number = 0,
  analysis?: Record<string, any>,
  tags?: string[]
): string {
  if (options.outputJson) {
    return formatJsonOutput(summary, data, options, processingTime, analysis, tags);
  }

  let output = '\n--- Website Summary ---\n\n';

  if (options.includeMetadata) {
    output += `Title: ${data.metadata.title}\n`;
    output += `URL: ${data.metadata.url}\n`;
    output += `Date: ${new Date(data.metadata.timestamp).toLocaleString()}\n`;
    if (data.metadata.description) {
      output += `Description: ${data.metadata.description}\n`;
    }
    output += '\n';
  }

  output += summary;
  
  if (analysis && Object.keys(analysis).length > 0) {
    output += '\n\n=== Plugin Analysis ===\n\n';
    for (const [name, result] of Object.entries(analysis)) {
      output += `${name}:\n`;
      output += `${JSON.stringify(result, null, 2)}\n\n`;
    }
  }
  
  if (tags && tags.length > 0) {
    output += `Tags: ${tags.join(', ')}\n`;
  }
  
  output += '\n-----------------------\n';

  return output;
}

function formatJsonOutput(
  summary: string,
  data: PageContent,
  options: SummaryOptions,
  processingTime: number,
  analysis?: Record<string, any>,
  tags?: string[]
): string {
  // extract key points if available
  let keyPoints: string[] = [];
  if (options.format === 'json') {
    try {
      const parsed = JSON.parse(summary);
      if (parsed.keyPoints && Array.isArray(parsed.keyPoints)) {
        keyPoints = parsed.keyPoints;
      }
    } catch {
      // not json formatted summary, extract first 2-3 sentences as key points
      const sentences = summary.match(/[^.!?]+[.!?]+/g) || [];
      keyPoints = sentences.slice(0, 3).map(s => s.trim());
    }
  } else {
    const sentences = summary.match(/[^.!?]+[.!?]+/g) || [];
    keyPoints = sentences.slice(0, 3).map(s => s.trim());
  }

  const result: JsonResult = {
    url: data.metadata.url,
    timestamp: data.metadata.timestamp,
    processingTime,
    metadata: {
      title: data.metadata.title,
      description: data.metadata.description,
      contentLength: data.text.length,
    },
    summary: {
      content: summary,
      length: options.length || 'medium',
      keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
    },
    status: 'success',
    ...(analysis && Object.keys(analysis).length > 0 && { analysis }),
    ...(tags && tags.length > 0 && { tags }),
  };

  return JSON.stringify(result, null, 2);
}

export function formatBatchOutput(
  results: BatchResult[],
  comparative?: string,
  options?: SummaryOptions,
  batchTotalTime: number = 0
): string {
  if (options?.outputJson) {
    return formatJsonBatch(results, comparative, batchTotalTime);
  }

  let output = '\n=== BATCH SUMMARY RESULTS ===\n\n';
  output += `Total URLs processed: ${results.length}\n`;
  output += `Successful: ${results.filter(r => !r.error).length}\n`;
  output += `Failed: ${results.filter(r => r.error).length}\n`;
  if (batchTotalTime > 0) {
    output += `Total processing time: ${(batchTotalTime / 1000).toFixed(2)}s\n`;
  }
  output += '\n';

  results.forEach((result, index) => {
    output += `\n--- Summary ${index + 1} ---\n`;
    output += `URL: ${result.url}\n`;

    if (result.error) {
      output += `ERROR: ${result.error}\n`;
      if (result.retries) {
        output += `Attempts: ${result.retries + 1}\n`;
      }
    } else {
      output += `Title: ${result.metadata.title}\n`;
      output += `Date: ${new Date(result.metadata.timestamp).toLocaleString()}\n`;
      if (result.processingTime) {
        output += `Processing time: ${(result.processingTime / 1000).toFixed(2)}s\n`;
      }
      if (result.retries) {
        output += `Retries: ${result.retries}\n`;
      }
      output += `\n${result.summary}\n`;
    }
    output += '\n' + '-'.repeat(50) + '\n';
  });

  if (comparative) {
    output += '\n\n=== COMPARATIVE ANALYSIS ===\n\n';
    output += comparative;
    output += '\n\n' + '='.repeat(50) + '\n';
  }

  return output;
}

function formatJsonBatch(
  results: BatchResult[],
  comparative: string | undefined,
  batchTotalTime: number
): string {
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  // extract common themes using same sentence-splitting approach as codebase
  let commonThemes: string[] = [];
  if (comparative) {
    const sentences = comparative.match(/[^.!?]+[.!?]+/g) || [];
    commonThemes = sentences
      .slice(0, 3)
      .map(s => s.trim())
      .filter(t => t.length > 0);
  }

  const jsonResults: JsonResult[] = results.map(r => ({
    url: r.url,
    timestamp: r.metadata.timestamp,
    processingTime: r.processingTime || 0,
    metadata: {
      title: r.metadata.title,
      description: r.metadata.description,
      contentLength: r.summary.length,
    },
    summary: {
      content: r.summary,
      length: 'medium',
    },
    status: r.error ? 'error' : 'success',
    error: r.error,
  }));

  const batchId = randomBytes(8).toString('hex');

  const batch: JsonBatchResult = {
    batchId,
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      totalProcessingTime: batchTotalTime,
    },
    results: jsonResults,
  };

  if (comparative && commonThemes.length > 0) {
    batch.comparative = {
      commonThemes,
      analysis: comparative,
    };
  }

  return JSON.stringify(batch, null, 2);
}

export async function saveToFileIfNeeded(
  output: string,
  options: SummaryOptions
): Promise<void> {
  if (!options.saveToFile) return;

  try {
    const dir = path.join(process.cwd(), 'summaries');
    await fs.mkdir(dir, { recursive: true });

    const extension = options.outputJson ? '.json' : '.txt';
    const filename = options.saveToFile.endsWith(extension)
      ? options.saveToFile
      : `${options.saveToFile}${extension}`;

    await fs.writeFile(path.join(dir, filename), output, 'utf-8');
    console.log(`\n✓ Summary saved to: summaries/${filename}`);
  } catch (error) {
    throw new SummarizerError(
      `Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'FILE_SAVE_FAILED',
      false
    );
  }
}

export async function loadUrlsFromFile(filepath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    throw new SummarizerError(
      `Failed to read URL file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'FILE_READ_FAILED',
      false
    );
  }
}
