import { describe, it, expect, vi } from 'vitest';
import { parseWebLink, parseImageLocal } from '../../src/parser';
import { createMockEnv } from '../setup';

global.fetch = vi.fn();

describe('Parser Utilities', () => {
	it('parseWebLink should extract markdown from raw HTML wrapper', async () => {
		const mockHtml = `
		<html>
			<head><title>Test Title</title></head>
			<body>
				<nav>Ignore me</nav>
				<article>
					<h1>Article Heading</h1>
					<p>Article paragraph text here.</p>
				</article>
				<script>alert("ignore")</script>
			</body>
		</html>
		`;
		
		(global.fetch as any).mockResolvedValueOnce({ text: async () => mockHtml });

		const result = await parseWebLink('https://example.com/article');
		
		expect(result.title).toBe('Test Title');
		expect(result.markdown).toContain('# Article Heading');
		expect(result.markdown).toContain('Article paragraph text here.');
		expect(result.markdown).not.toContain('Ignore me');
		expect(result.markdown).not.toContain('alert');
	});

	it('parseImageLocal should call Cloudflare vision AI on buffer', async () => {
		const env = createMockEnv();
		env.AI.run.mockResolvedValueOnce({ response: 'I see a dog.' });

		const mockBuffer = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // Fake PNG bytes
		const content = await parseImageLocal(env, mockBuffer);

		expect(env.AI.run).toHaveBeenCalledWith('@cf/meta/llama-3.2-11b-vision-instruct', expect.any(Object));
		expect(content).toBe('I see a dog.');
	});
});
