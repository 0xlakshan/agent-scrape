import { ContentProcessor, ProcessedContent } from '../types';
import { PageMetadata } from '../../types';

export class KeywordExtractor implements ContentProcessor {
  name = 'keyword-extractor';
  version = '1.0.0';
  description = 'Extracts keywords from content';

  async process(content: string, metadata: PageMetadata): Promise<ProcessedContent> {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ]);

    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    const keywords = Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count, frequency: count / words.length }));

    return {
      content,
      metadata,
      analysis: {
        keywords,
        totalWords: words.length,
        uniqueWords: wordCount.size
      },
      tags: keywords.slice(0, 5).map(k => k.word)
    };
  }
}
