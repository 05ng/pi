import { AIGateway } from './ai';
import { TelegramBot } from './telegram';
import { KnowledgeService } from './services/knowledge';

export class Orchestrator {
	private ai: AIGateway;
	private bot: TelegramBot;
	private env: any;

	constructor(env: any) {
		this.env = env;
		this.ai = new AIGateway(env);
		this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
	}

	async handleAsk(chatId: number, question: string, baseUrl: string) {
		try {
			await this.bot.sendChatAction(chatId, 'typing');
			
			const embeddings = await this.ai.generateEmbeddings([question]);
			const queryVector = embeddings[0];

			if (!queryVector || queryVector.length === 0) {
				throw new Error("Failed to generate search vector for your question.");
			}

			const results = await this.env.VECTOR_INDEX.query(queryVector, {
				topK: 5,
				returnMetadata: 'all'
			});

			const contextDocs = results.matches
				.map((m: any) => `[Title: ${m?.metadata?.title || 'Unknown'}]\n${m?.metadata?.filePath || 'Unknown'}`);

			const answer = await this.ai.answerQuestion(question, contextDocs);
			const uuid = crypto.randomUUID();
			
			const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Knowledge Answer</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-4 md:p-10 bg-slate-900 text-slate-100">
<div class="max-w-3xl mx-auto prose prose-invert">
${answer.replace(/\n/g, '<br/>')}
</div>
</body>
</html>`;
			await this.env.KNOWLEDGE_BASE.put(`answers/${uuid}.html`, htmlContent);

			const viewLink = `${baseUrl}/answer/${uuid}`;
			const formattedAnswer = `${answer}\n\n[📖 View on Web](${viewLink})`;

			await this.bot.sendMessage(chatId, formattedAnswer, true);

		} catch (e: any) {
			console.error("Ask Pipeline Failure:", e);
			await this.bot.sendMessage(chatId, `❌ **Error:** ${e.message}`, false);
		}
	}

	async handleIngestion(chatId: number, text: string) {
		try {
			await this.bot.sendChatAction(chatId, 'typing');
			const meta = await this.ai.categorize(text);
			const category = meta.category || 'misc';

			const knowledgeService = new KnowledgeService(this.env);
			const result = await knowledgeService.ingestDocument(meta.title, category, text);

			await this.bot.sendMessage(
				chatId,
				`✅ **Ingested into Hub**\n\n**Title:** ${result.title}\n**Category:** ${result.category}\n\n*Document has been vectorized for future recall.*`
			);
		} catch (e: any) {
			console.error('Ingestion Failure:', e);
			await this.bot.sendMessage(chatId, `❌ **Ingestion Failed:** ${e.message}`, false);
		}
	}

	async handleMediaIngestion(chatId: number, message: any) {
		try {
			await this.bot.sendMessage(chatId, "⚙️ **Processing incoming media...**");
			await this.bot.sendChatAction(chatId, 'typing');

			let fileId = '';
			let fileName = 'uploaded_file';
			let mimeType = '';

			if (message.photo) {
				fileId = message.photo[message.photo.length - 1].file_id;
				fileName = `photo_${Date.now()}.jpg`;
				mimeType = 'image/jpeg';
			} else if (message.document) {
				fileId = message.document.file_id;
				fileName = message.document.file_name || 'document';
				mimeType = message.document.mime_type || '';
			}

			const fileUrl = await this.bot.getFileUrl(fileId);
			const response = await fetch(fileUrl);
			const arrayBuffer = await response.arrayBuffer();

			let content = '';
			if (mimeType.startsWith('image/')) {
				const { parseImageLocal } = await import('./parser');
				content = await parseImageLocal(this.env, new Uint8Array(arrayBuffer));
			} else {
				content = `[File: ${fileName}]\n(Binary content stored in R2)`;
			}

			if (!content || content.trim().length === 0) {
				throw new Error("Could not extract any meaningful text from this file.");
			}

			await this.handleIngestion(chatId, content);

		} catch (e: any) {
			console.error("Media Ingestion Failure:", e);
			await this.bot.sendMessage(chatId, `❌ **Media Pipeline Failed:** ${e.message}`, false);
		}
	}
}
