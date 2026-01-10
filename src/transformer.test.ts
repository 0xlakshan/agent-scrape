import { describe, it, expect, vi } from 'vitest';
import { Transformer } from './transformer';
import type { RawContent } from './types';

const mockRawContent: RawContent = {
  html: '<div><h1>Test Title</h1><p>Test content</p></div>',
  text: 'Test Title\nTest content',
  metadata: {
    title: 'Test Page',
    description: 'Test description',
    timestamp: '2024-01-01T00:00:00Z'
  }
};

describe('Transformer', () => {
  describe('without AI model', () => {
    const transformer = new Transformer();

    it('returns html format as-is', async () => {
      const result = await transformer.transform(mockRawContent, 'html');
      expect(result.content).toBe(mockRawContent.html);
      expect(result.format).toBe('html');
    });

    it('returns text format from raw text', async () => {
      const result = await transformer.transform(mockRawContent, 'text');
      expect(result.content).toBe(mockRawContent.text);
      expect(result.format).toBe('text');
    });
  });

  describe('with AI model', () => {
    const mockModel = {
      doGenerate: vi.fn(),
      doStream: vi.fn()
    };

    const transformer = new Transformer(mockModel as any);

    it('transforms content using AI model', async () => {
      vi.doMock('ai', () => ({
        generateText: vi.fn().mockResolvedValue({ text: 'Transformed content' })
      }));

      const { generateText } = await import('ai');
      const result = await transformer.transform(mockRawContent, 'markdown');

      expect(generateText).toHaveBeenCalledWith({
        model: mockModel,
        prompt: expect.stringContaining('Convert to clean markdown')
      });
      expect(result.content).toBe('Transformed content');
      expect(result.format).toBe('markdown');
    });

    it('parses JSON format and adds structured data', async () => {
      const jsonResponse = '{"title": "Test", "content": "data"}';
      
      vi.doMock('ai', () => ({
        generateText: vi.fn().mockResolvedValue({ text: jsonResponse })
      }));

      const { generateText } = await import('ai');
      const result = await transformer.transform(mockRawContent, 'json');

      expect(result.structured).toEqual({ title: 'Test', content: 'data' });
    });

    it('handles invalid JSON gracefully', async () => {
      const invalidJson = 'invalid json response';
      
      vi.doMock('ai', () => ({
        generateText: vi.fn().mockResolvedValue({ text: invalidJson })
      }));

      const result = await transformer.transform(mockRawContent, 'json');
      expect(result.structured).toEqual({ raw: invalidJson });
    });
  });
});
