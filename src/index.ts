import { SummaryOptions, BatchResult, BrowserContext, SummarizerError } from './types';
import { isValidUrl, retryWithBackoff, sleep } from './utils';
import { withBrowser, navigate, extractAndCleanText, extractMetadata, extractLinks } from './browser';
import { summarizeContent, generateComparativeSummary } from './ai';
import { formatOutput, formatBatchOutput, saveToFileIfNeeded, loadUrlsFromFile } from './output';

async function processUrl(
  url: string,
  options: SummaryOptions,
  ctx: BrowserContext
): Promise<BatchResult> {
  let retries = 0;

  return retryWithBackoff(
    async () => {
      try {
        await navigate(ctx.page, url);

        const [text, metadata] = await Promise.all([
          extractAndCleanText(ctx.page),
          extractMetadata(ctx.page),
        ]);

        const summary = await summarizeContent(text, options);

        return {
          url,
          summary,
          metadata,
          retries: retries > 0 ? retries : undefined,
        };
      } catch (error) {
        retries++;
        throw error;
      }
    },
    {
      maxRetries: options.maxRetries || 3,
      baseDelay: options.retryDelay || 2000,
      operation: `Processing ${url}`
    }
  ).catch(error => ({
    url,
    summary: '',
    metadata: { title: '', description: '', url, timestamp: new Date().toISOString() },
    error: error instanceof Error ? error.message : 'Unknown error',
    retries: retries > 0 ? retries : undefined,
  }));
}

async function summarizeWebsite(url: string, options: SummaryOptions = {}) {
  if (!isValidUrl(url)) {
    throw new SummarizerError(
      'Invalid URL format. Please provide a valid http:// or https:// URL',
      'INVALID_URL',
      false
    );
  }

  await withBrowser(async ({ browser, page }) => {
    await retryWithBackoff(
      async () => navigate(page, url),
      {
        maxRetries: options.maxRetries || 3,
        baseDelay: options.retryDelay || 2000,
        operation: `Navigating to ${url}`
      }
    );

    const [text, metadata] = await Promise.all([
      retryWithBackoff(
        async () => extractAndCleanText(page),
        {
          maxRetries: options.maxRetries || 3,
          baseDelay: options.retryDelay || 1000,
          operation: 'Extracting text'
        }
      ),
      retryWithBackoff(
        async () => extractMetadata(page),
        {
          maxRetries: options.maxRetries || 3,
          baseDelay: options.retryDelay || 1000,
          operation: 'Extracting metadata'
        }
      ),
    ]);

    const links = options.followLinks ? await extractLinks(page, url) : [];

    const summary = await summarizeContent(text, options);
    const output = formatOutput(summary, { text, metadata, links }, options);
    console.log(output);

    if (options.followLinks && links.length > 0) {
      console.log(`\n📎 Found ${links.length} related links. Processing ${Math.min(links.length, options.followLinks)}...\n`);

      const linkResults: BatchResult[] = [];
      const linksToProcess = links.slice(0, options.followLinks);

      for (let i = 0; i < linksToProcess.length; i++) {
        const link = linksToProcess[i];
        console.log(`Processing link ${i + 1}/${linksToProcess.length}: ${link}`);

        const result = await processUrl(link, { ...options, includeMetadata: true }, { browser, page });
        linkResults.push(result);

        await sleep(1000);
      }

      const batchOutput = formatBatchOutput(linkResults);
      console.log(batchOutput);

      if (options.saveToFile) {
        const linkFilename = options.saveToFile.replace(/\.txt$/, '') + '_links.txt';
        await saveToFileIfNeeded(batchOutput, { ...options, saveToFile: linkFilename });
      }
    }

    await saveToFileIfNeeded(output, options);
  });
}

async function summarizeBatch(urls: string[], options: SummaryOptions = {}) {
  const results: BatchResult[] = [];

  await withBrowser(async (ctx) => {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\nProcessing ${i + 1}/${urls.length}: ${url}`);

      if (!isValidUrl(url)) {
        results.push({
          url,
          summary: '',
          metadata: { title: '', description: '', url, timestamp: new Date().toISOString() },
          error: 'Invalid URL format',
        });
        continue;
      }

      const result = await processUrl(url, options, ctx);
      results.push(result);

      await sleep(1000);
    }
  });

  let comparativeSummary: string | undefined;
  if (options.comparative && results.filter(r => !r.error).length >= 2) {
    console.log('\n🔄 Generating comparative analysis...\n');
    comparativeSummary = await generateComparativeSummary(results.filter(r => !r.error), options);
  }

  const output = formatBatchOutput(results, comparativeSummary);
  console.log(output);

  await saveToFileIfNeeded(output, options);
}

function parseArgs(): { urls: string[]; options: SummaryOptions } {
  const args = process.argv.slice(2);

  if (!args.length || args.includes('--help')) {
    console.log(`
Usage: node summarizer.js <url|file> [options]

Options:
  --length <type>        Summary length: short, medium, long (default: medium)
  --format <type>        Output format: paragraphs, bullets, json (default: paragraphs)
  --metadata             Include page metadata
  --save <filename>      Save summary to file
  --batch <file>         Process multiple URLs from a file
  --comparative          Generate comparative analysis (batch mode only)
  --follow <n>           Follow and summarize N internal links from the page
  --max-retries <n>      Maximum retry attempts for failed requests (default: 3)
  --retry-delay <ms>     Base delay between retries in milliseconds (default: 2000)
  --help                 Show this help message

Examples:
  node summarizer.js https://example.com --length short --metadata
  node summarizer.js --batch urls.txt --comparative --save report
  node summarizer.js https://example.com --follow 5 --max-retries 5
  node summarizer.js https://example.com --retry-delay 3000 --max-retries 2
    `);
    process.exit(0);
  }

  const options: SummaryOptions = {};
  let urls: string[] = [];
  let batchFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--length':
        if (i + 1 >= args.length) {
          throw new SummarizerError(
            '--length requires a value (short, medium, or long)',
            'INVALID_ARGS',
            false
          );
        }
        const length = args[++i];
        if (!['short', 'medium', 'long'].includes(length)) {
          throw new SummarizerError(
            `Invalid length: ${length}. Must be short, medium, or long`,
            'INVALID_ARGS',
            false
          );
        }
        options.length = length as SummaryOptions['length'];
        break;

      case '--format':
        if (i + 1 >= args.length) {
          throw new SummarizerError(
            '--format requires a value (paragraphs, bullets, or json)',
            'INVALID_ARGS',
            false
          );
        }
        const format = args[++i];
        if (!['paragraphs', 'bullets', 'json'].includes(format)) {
          throw new SummarizerError(
            `Invalid format: ${format}. Must be paragraphs, bullets, or json`,
            'INVALID_ARGS',
            false
          );
        }
        options.format = format as SummaryOptions['format'];
        break;

      case '--metadata':
        options.includeMetadata = true;
        break;

      case '--save':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--save requires a filename', 'INVALID_ARGS', false);
        }
        options.saveToFile = args[++i];
        break;

      case '--batch':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--batch requires a filename', 'INVALID_ARGS', false);
        }
        batchFile = args[++i];
        options.batch = true;
        break;

      case '--comparative':
        options.comparative = true;
        break;

      case '--follow':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--follow requires a number', 'INVALID_ARGS', false);
        }
        const count = parseInt(args[++i], 10);
        if (isNaN(count) || count < 1 || count > 20) {
          throw new SummarizerError(
            'Follow count must be between 1 and 20',
            'INVALID_ARGS',
            false
          );
        }
        options.followLinks = count;
        break;

      case '--max-retries':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--max-retries requires a number', 'INVALID_ARGS', false);
        }
        const retries = parseInt(args[++i], 10);
        if (isNaN(retries) || retries < 0 || retries > 10) {
          throw new SummarizerError(
            'Max retries must be between 0 and 10',
            'INVALID_ARGS',
            false
          );
        }
        options.maxRetries = retries;
        break;

      case '--retry-delay':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--retry-delay requires a number', 'INVALID_ARGS', false);
        }
        const delay = parseInt(args[++i], 10);
        if (isNaN(delay) || delay < 100 || delay > 30000) {
          throw new SummarizerError(
            'Retry delay must be between 100 and 30000 milliseconds',
            'INVALID_ARGS',
            false
          );
        }
        options.retryDelay = delay;
        break;

      default:
        if (!args[i].startsWith('--')) {
          urls.push(args[i]);
        } else {
          throw new SummarizerError(
            `Unknown option: ${args[i]}. Use --help for usage information`,
            'INVALID_ARGS',
            false
          );
        }
    }
  }

  return { urls: batchFile ? [batchFile] : urls, options };
}

(async () => {
  try {
    const { urls, options } = parseArgs();

    if (options.batch && urls.length > 0) {
      const urlList = await loadUrlsFromFile(urls[0]);
      await summarizeBatch(urlList, options);
    } else if (urls.length === 1) {
      await summarizeWebsite(urls[0], options);
    } else if (urls.length > 1) {
      await summarizeBatch(urls, options);
    } else {
      throw new SummarizerError(
        'No URL provided. Use --help for usage information',
        'INVALID_ARGS',
        false
      );
    }
  } catch (error) {
    if (error instanceof SummarizerError) {
      console.error(`\n❌ Error [${error.code}]: ${error.message}\n`);
      process.exit(1);
    }
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
})();
