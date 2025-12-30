import { SummarizerError } from './types';

export class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private lastRequestTime = 0;

  constructor(
    private maxConcurrent: number = 1,
    private minDelay: number = 1000
  ) { }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.minDelay) {
            await new Promise(r => setTimeout(r, this.minDelay - timeSinceLastRequest));
          }

          this.lastRequestTime = Date.now();
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processQueue();
        }
      });

      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift();
    if (task) {
      task();
    }
  }
}

export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelay: number; operation: string }
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof SummarizerError && !error.retryable) {
        throw error;
      }

      if (attempt < options.maxRetries) {
        const delay = options.baseDelay * Math.pow(2, attempt);
        console.log(`⚠️  ${options.operation} failed (attempt ${attempt + 1}/${options.maxRetries + 1}). Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new SummarizerError(
    `${options.operation} failed after ${options.maxRetries + 1} attempts: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    false
  );
}

export function removeDuplicateLines(text: string): string {
  const seen = new Set<string>();
  return text
    .split('\n')
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      if (normalized.length < 30) return true;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join('\n');
}
