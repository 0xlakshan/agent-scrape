import { ContentProcessor, ProcessedContent } from '../types';
import { PageMetadata } from '../../types';

export class SentimentAnalyzer implements ContentProcessor {
  name = 'sentiment-analyzer';
  version = '1.0.0';
  description = 'Analyzes sentiment of content';

  async process(content: string, metadata: PageMetadata): Promise<ProcessedContent> {
    const words = content.toLowerCase().split(/\s+/);
    
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'best', 'perfect', 'awesome'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'worst', 'disappointing', 'poor', 'failed', 'broken'];
    
    const positiveCount = words.filter(word => positiveWords.includes(word)).length;
    const negativeCount = words.filter(word => negativeWords.includes(word)).length;
    
    let sentiment = 'neutral';
    let score = 0;
    
    if (positiveCount > negativeCount) {
      sentiment = 'positive';
      score = (positiveCount - negativeCount) / words.length;
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
      score = (negativeCount - positiveCount) / words.length;
    }

    return {
      content,
      metadata,
      analysis: {
        sentiment,
        score: Math.round(score * 1000) / 1000,
        positiveWords: positiveCount,
        negativeWords: negativeCount
      },
      tags: [sentiment]
    };
  }
}
