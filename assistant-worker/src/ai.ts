import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export interface CategorizationResult {
	category: string;
	summary: string;
	title: string;
}

export class AIGateway {
	constructor(private env: any) {}

	async categorize(markdown: string): Promise<CategorizationResult> {
		const prompt = `Analyze the markdown. Return ONLY valid JSON containing three keys: "category" (a 1-word lowercase tag), "summary" (a short 1-sentence summary), and "title" (a short plain-text title).\n\nMarkdown:\n${markdown.substring(0, 10000)}`;

		if (this.env.DEFAULT_AI === 'gemini' && this.env.GEMINI_API_KEY) {
			const genAI = new GoogleGenerativeAI(this.env.GEMINI_API_KEY);
			const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
			const result = await model.generateContent(prompt);
			return this.parseJSONSafe(result.response.text());
		}

		if (this.env.DEFAULT_AI === 'deepseek' && this.env.DEEPSEEK_API_KEY) {
			const openai = new OpenAI({ apiKey: this.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com', timeout: 25000 });
			const completion = await openai.chat.completions.create({
				model: 'deepseek-chat',
				messages: [{ role: 'user', content: prompt }]
			});
			return this.parseJSONSafe(completion.choices[0].message.content || '');
		}

		// Fallback to Cloudflare AI
		const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
			messages: [{ role: 'user', content: prompt }]
		});
		return this.parseJSONSafe((response as any).response);
	}

	async generateEmbeddings(textChunks: string[]): Promise<number[][]> {
		const batchSize = 10;
		const results: number[][] = [];

		for (let i = 0; i < textChunks.length; i += batchSize) {
			const batch = textChunks.slice(i, i + batchSize);
			console.log(`[AI] Generating embeddings for batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(textChunks.length / batchSize)}`);

			try {
				const embedResponse = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: batch });

				if (!embedResponse || !embedResponse.data || !Array.isArray(embedResponse.data)) {
					console.error("AI Embedding batch failed:", embedResponse);
					continue;
				}

				const batchEmbeds = embedResponse.data.map((item: any) => {
					if (Array.isArray(item)) return item;
					if (item && typeof item === 'object' && Array.isArray(item.embedding)) return item.embedding;
					return [];
				});
				results.push(...batchEmbeds);
			} catch (err: any) {
				// Detect CF Workers AI daily quota error (4006)
				if (err?.message?.includes('4006') || err?.message?.includes('daily free allocation')) {
					throw new Error('⚠️ Cloudflare Workers AI daily quota exceeded (10,000 neurons/day). Semantic search is unavailable until quota resets tomorrow. Direct date/year queries still work.');
				}
				throw err;
			}
		}

		return results;
	}

	async answerQuestion(question: string, contextDocs: string[]): Promise<string> {
		const context = contextDocs.join('\n\n---\n\n');
		const prompt = `You are a professional research assistant specialized in accurate data extraction from documents and financial tables.
Your goal is to answer the user's question based STRICTLY on the Context provided below.

⚠️ HALLUCINATION SHIELD:
- Do NOT use dummy/example funds or data from your training set (e.g. "Fund A", "Fund B").
- ONLY use information found inside the "=== DOCUMENT: [Title] ===" markers below.
- If the exact requested date or value is not found in the provided context, state: "The requested data for [Date] is not present in the provided documents."
- **YEAR PRECISION**: Verify the year EXACTLY. The contexts might contain 2013 data which looks like 2025. Never confuse years.
- **NO GUESSING**: Never calculate or infer NAV for a date not explicitly found in the table (e.g. market holidays). Report it as not available.

INSTRUCTIONS FOR TABLES:
- Use the "[COLUMN HEADERS]" section to identify column positions accurately. 
- For NAV requests, look for the "NAV" column and read the corresponding value.
- Match dates exactly (DD/MM/YYYY vs YYYY-MM-DD). The context includes date format variations.
- Always cite the DOCUMENT TITLE exactly as shown in the marker.

Format your response in professional Markdown.

--- Context Documents ---
${context.substring(0, 50000)}`;

		if (this.env.DEFAULT_AI === 'deepseek' && this.env.DEEPSEEK_API_KEY) {
			const openai = new OpenAI({ apiKey: this.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com', timeout: 25000 });
			const completion = await openai.chat.completions.create({
				model: 'deepseek-chat',
				messages: [
					{ role: 'system', content: prompt },
					{ role: 'user', content: question }
				]
			});
			return completion.choices[0].message.content || '';
		}

		// Cloudflare AI Fallback
		const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
			messages: [
				{ role: 'system', content: prompt },
				{ role: 'user', content: question }
			]
		});
		return (response as any).response;
	}

	private parseJSONSafe(str: string): CategorizationResult {
		try {
			const match = str.match(/\{[\s\S]*\}/);
			if (match) return JSON.parse(match[0]);
		} catch (e) { }
		return { category: 'misc', summary: 'Uncategorized content', title: 'Untitled Document' };
	}
}
