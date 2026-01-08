import * as fs from 'fs/promises';
import * as path from 'path';
import { PageContent, SummaryOptions, BatchResult, SummarizerError } from './types';
import { formatJsonSingle, formatJsonBatch } from './json-output';

export function formatOutput(
  summary: string,
  data: PageContent,
  options: SummaryOptions,
  processingTime: number = 0,
  error?: string,
  retries?: number
): string {
  if (options.format === 'json') {
    const jsonResult = formatJsonSingle(summary, data, options, processingTime, error, retries);
    return JSON.stringify(jsonResult, null, 2);
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
  output += '\n\n-----------------------\n';

  return output;
}

export function formatBatchOutput(results: BatchResult[], comparative?: string): string {
  // Check if JSON format should be used (detect from first result with plugins)
  const hasJsonFormat = results.some(r => r.analysis && typeof r.analysis === 'object');
  
  if (hasJsonFormat) {
    const jsonResult = formatJsonBatch(results, comparative);
    return JSON.stringify(jsonResult, null, 2);
  }

  let output = '\n=== BATCH SUMMARY RESULTS ===\n\n';
  output += `Total URLs processed: ${results.length}\n`;
  output += `Successful: ${results.filter(r => !r.error).length}\n`;
  output += `Failed: ${results.filter(r => r.error).length}\n\n`;

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

export async function saveToFileIfNeeded(
  output: string,
  options: SummaryOptions
): Promise<void> {
  if (!options.saveToFile) return;

  try {
    const dir = path.join(process.cwd(), 'summaries');
    await fs.mkdir(dir, { recursive: true });

    const filename = options.saveToFile.endsWith('.txt')
      ? options.saveToFile
      : `${options.saveToFile}.txt`;

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
