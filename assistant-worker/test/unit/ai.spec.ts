import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIGateway } from '../../src/ai';
import { createMockEnv } from '../setup';

describe('AIGateway Unit Tests', () => {
	let env: any;
	let ai: AIGateway;

	beforeEach(() => {
		env = createMockEnv();
		ai = new AIGateway(env);
	});

	it('should categorize markdown using Cloudflare AI by default', async () => {
		const mockResponse = { response: '{"category":"tech","summary":"test","title":"title"}' };
		env.AI.run.mockResolvedValue(mockResponse);

		const result = await ai.categorize('Hello world markdown');

		expect(env.AI.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', expect.any(Object));
		expect(result).toEqual({ category: 'tech', summary: 'test', title: 'title' });
	});

	it('should gracefully handle malformed JSON from categorization', async () => {
		const mockResponse = { response: 'Invalid output without json' };
		env.AI.run.mockResolvedValue(mockResponse);

		const result = await ai.categorize('Hello world markdown');

		// Falls back to safe default if regex fails
		expect(result).toEqual({ category: 'misc', summary: 'Uncategorized content', title: 'Untitled Document' });
	});

	it('should generate embeddings via BAAI model (handling array-of-arrays response)', async () => {
		env.AI.run.mockResolvedValue({ data: [[0.1, 0.2], [0.3, 0.4]] });
		const embeddings = await ai.generateEmbeddings(['chunk 1', 'chunk 2']);

		expect(env.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: ['chunk 1', 'chunk 2'] });
		expect(embeddings).toEqual([[0.1, 0.2], [0.3, 0.4]]);
	});

	it('should generate embeddings via BAAI model (handling array-of-objects response)', async () => {
		env.AI.run.mockResolvedValue({ 
			data: [
				{ embedding: [0.5, 0.6], index: 0 },
				{ embedding: [0.7, 0.8], index: 1 }
			] 
		});
		const embeddings = await ai.generateEmbeddings(['chunk 1', 'chunk 2']);

		expect(embeddings).toEqual([[0.5, 0.6], [0.7, 0.8]]);
	});

	it('should generate answer via Cloudflare AI', async () => {
		env.AI.run.mockResolvedValue({ response: 'This is the answer.' });
		const answer = await ai.answerQuestion('What is this?', ['Context 1', 'Context 2']);

		expect(env.AI.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', expect.any(Object));
		expect(answer).toBe('This is the answer.');
	});
});
