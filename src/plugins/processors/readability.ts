import { ContentProcessor, ProcessedContent } from '../types';
import { PageMetadata } from '../../types';

export class ReadabilityScorer implements ContentProcessor {
  name = 'readability-scorer';
  version = '1.0.0';
  description = 'Calculates readability scores for content';

  async process(content: string, metadata: PageMetadata): Promise<ProcessedContent> {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const syllables = this.countSyllables(content);

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    
    let readingLevel = 'Graduate';
    if (fleschScore >= 90) readingLevel = 'Very Easy';
    else if (fleschScore >= 80) readingLevel = 'Easy';
    else if (fleschScore >= 70) readingLevel = 'Fairly Easy';
    else if (fleschScore >= 60) readingLevel = 'Standard';
    else if (fleschScore >= 50) readingLevel = 'Fairly Difficult';
    else if (fleschScore >= 30) readingLevel = 'Difficult';

    return {
      content,
      metadata,
      analysis: {
        fleschScore: Math.round(fleschScore * 10) / 10,
        readingLevel,
        sentences: sentences.length,
        words: words.length,
        syllables,
        avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
        avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100
      },
      tags: [readingLevel.toLowerCase().replace(' ', '-')]
    };
  }

  private countSyllables(text: string): number {
    return text
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .replace(/[aeiouy]+/g, 'a')
      .replace(/a$/, '')
      .length || 1;
  }
}
