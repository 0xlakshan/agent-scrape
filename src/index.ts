import 'dotenv/config';
import { SummaryOptions, BatchResult, BrowserContext, SummarizerError, PageMetadata } from './types';
import { isValidUrl, retryWithBackoff, sleep } from './utils';
import { withBrowser, navigate, extractAndCleanText, extractMetadata, extractLinks } from './browser';
import { summarizeContent, generateComparativeSummary } from './ai';
import { formatOutput, formatBatchOutput, saveToFileIfNeeded, loadUrlsFromFile } from './output';
import { PluginManager, SentimentAnalyzer, KeywordExtractor, ReadabilityScorer } from './plugins';
import { CONFIG } from './config';
import { Page } from 'puppeteer';

const pluginManager = new PluginManager();
pluginManager.register(new SentimentAnalyzer());
pluginManager.register(new KeywordExtractor());
pluginManager.register(new ReadabilityScorer());

async function cleanupBrowserSession(page: Page): Promise<void> {
  if (page.isClosed()) return;
  
  try {
    const client = await page.target().createCDPSession();
    await Promise.allSettled([
      client.send('Network.clearBrowserCookies'),
      client.send('Network.clearBrowserCache')
    ]);
    await client.detach();
  } catch (error) {
    console.warn('CDP cleanup failed:', error);
  }
}

async function processPlugins(
  content: string, 
  metadata: PageMetadata, 
  pluginNames: string[]
): Promise<{ analysis: Record<string, any>; tags: string[] }> {
  const processors = pluginNames
    .map(name => pluginManager.getProcessor(name))
    .filter((p): p is Exclude<typeof p, undefined> => Boolean(p));
  
  const results = await Promise.allSettled(
    processors.map(processor => processor.process(content, metadata))
  );
  
  return results.reduce((acc: { analysis: Record<string, any>; tags: string[] }, result, index) => {
    if (result.status === 'fulfilled') {
      const processor = processors[index];
      if (processor && result.value.analysis) {
        acc.analysis[processor.name] = result.value.analysis;
      }
      if (processor && result.value.tags && Array.isArray(result.value.tags)) {
        acc.tags.push(...result.value.tags);
      }
    }
    return acc;
  }, { analysis: {}, tags: [] });
}

async function processUrl(
  url: string,
  options: SummaryOptions,
  ctx: BrowserContext
): Promise<BatchResult> {
  let retries = 0;
  const startTime = Date.now();

  return retryWithBackoff(
    async () => {
      try {
        await navigate(ctx.page, url);

        const [text, metadata] = await Promise.all([
          extractAndCleanText(ctx.page),
          extractMetadata(ctx.page),
        ]);

        const summary = await summarizeContent(text, options);

        let analysis: Record<string, any> = {};
        let tags: string[] = [];

        if (options.plugins && options.plugins.length > 0) {
          const pluginResults = await processPlugins(text, metadata, options.plugins);
          analysis = pluginResults.analysis;
          tags = pluginResults.tags;
        }

        const processingTime = Date.now() - startTime;
        const output = formatOutput(summary, { text, metadata, links: [] }, options, processingTime, analysis, tags);
        console.log(output);
        
        await saveToFileIfNeeded(output, options);

        return {
          url,
          summary,
          metadata,
          analysis: Object.keys(analysis).length > 0 ? analysis : undefined,
          tags: tags.length > 0 ? [...new Set(tags)] : undefined,
          retries: retries > 0 ? retries : undefined,
          processingTime,
        };
      } catch (error) {
        retries++;
        throw error;
      } finally {
        await cleanupBrowserSession(ctx.page);
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
    processingTime: Date.now() - startTime,
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

  const pageStartTime = Date.now();

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

    let analysis: Record<string, any> = {};
    let tags: string[] = [];

    if (options.plugins && options.plugins.length > 0) {
      const pluginResults = await processPlugins(text, metadata, options.plugins);
      analysis = pluginResults.analysis;
      tags = pluginResults.tags;
    }

    const processingTime = Date.now() - pageStartTime;
    const output = formatOutput(summary, { text, metadata, links }, options, processingTime, analysis, tags);
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

        if (i < linksToProcess.length - 1) {
          await sleep(1000);
        }
      }

      const batchTotalTime = Date.now() - pageStartTime;
      const batchOutput = formatBatchOutput(linkResults, undefined, options, batchTotalTime);
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
  let processedCount = 0;
  const batchStartTime = Date.now();

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
          processingTime: 0,
        });
        continue;
      }

      try {
        const result = await processUrl(url, options, ctx);
        results.push(result);
        processedCount++;

        if (i < urls.length - 1) {
          await sleep(CONFIG.PROCESSING.BATCH_DELAY);
        }

        if (processedCount > 0 && processedCount % CONFIG.PROCESSING.MEMORY_REFRESH_INTERVAL === 0 && i < urls.length - 1) {
          console.log('\n🔄 Refreshing browser page to free memory...');
          try {
            await ctx.page.close();
            ctx.page = await ctx.browser.newPage();
            await ctx.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
          } catch (refreshError) {
            console.warn('Warning: Failed to refresh page, continuing with existing page:', refreshError);
          }
        }
      } catch (error) {
        console.error(`Unexpected error processing ${url}:`, error);
        results.push({
          url,
          summary: '',
          metadata: { title: '', description: '', url, timestamp: new Date().toISOString() },
          error: error instanceof Error ? error.message : 'Unexpected error occurred',
          processingTime: 0,
        });
      }
    }
  });

  let comparativeSummary: string | undefined;
  if (options.comparative && results.filter(r => !r.error).length >= 2) {
    console.log('\n🔄 Generating comparative analysis...\n');
    try {
      comparativeSummary = await generateComparativeSummary(results.filter(r => !r.error), options);
    } catch (error) {
      console.error('Failed to generate comparative summary:', error);
    }
  }

  const batchTotalTime = Date.now() - batchStartTime;
  const output = formatBatchOutput(results, comparativeSummary, options, batchTotalTime);
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
  --output <type>        Output mode: text, json (default: text) - structured JSON output
  --metadata             Include page metadata
  --save <filename>      Save summary to file
  --batch <file>         Process multiple URLs from a file
  --comparative          Generate comparative analysis (batch mode only)
  --follow <n>           Follow and summarize N internal links from the page
  --plugins <names>      Enable analysis plugins (comma-separated: sentiment-analyzer,keyword-extractor,readability-scorer)
  --max-retries <n>      Maximum retry attempts for failed requests (default: 3)
  --retry-delay <ms>     Base delay between retries in milliseconds (default: 2000)
  --help                 Show this help message

Examples:
  node summarizer.js https://example.com --length short --metadata
  node summarizer.js https://example.com --output json --metadata
  node summarizer.js --batch urls.txt --comparative --output json --save report
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

      case '--output':
        if (i + 1 >= args.length) {
          throw new SummarizerError(
            '--output requires a value (text or json)',
            'INVALID_ARGS',
            false
          );
        }
        const output = args[++i];
        if (!['text', 'json'].includes(output)) {
          throw new SummarizerError(
            `Invalid output: ${output}. Must be text or json`,
            'INVALID_ARGS',
            false
          );
        }
        options.outputJson = output === 'json';
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

      case '--plugins':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--plugins requires plugin names', 'INVALID_ARGS', false);
        }
        options.plugins = args[++i].split(',').map(p => p.trim());
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
      
      // provide helpful suggestions based on error type
      if (error.code === 'NO_CONTENT') {
        console.log('Suggestions:');
        console.log('  - Try a different URL with more static content');
        console.log('  - Wait a moment and retry (some sites block rapid requests)');
        console.log('  - Check if the site requires JavaScript (try using --follow)');
      } else if (error.code === 'RATE_LIMITED') {
        console.log('Suggestions:');
        console.log('  - Increase retry delay: --retry-delay 5000');
        console.log('  - Reduce batch size (process fewer URLs at once)');
        console.log('  - Wait before retrying (server needs time to recover)');
      } else if (error.code === 'MAX_RETRIES_EXCEEDED' && error.message.includes('quota')) {
        console.log('Suggestions:');
        console.log('  - Check your API quota at: https://ai.google.dev/usage');
        console.log('  - Upgrade your plan or wait for quota reset');
        console.log('  - For batch processing: split into smaller files');
      } else if (error.code === 'MAX_RETRIES_EXCEEDED') {
        console.log('Suggestions:');
        console.log('  - Increase max retries: --max-retries 5');
        console.log('  - Increase retry delay: --retry-delay 3000');
        console.log('  - Check your internet connection');
      }
      console.log();
      process.exit(1);
    }
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
})();
