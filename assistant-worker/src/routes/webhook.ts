import { Hono } from 'hono';
import { Env } from '../types';
import { Orchestrator } from '../orchestrator';

const webhookRoute = new Hono<{ Bindings: Env }>();

webhookRoute.post('/webhook', async (c) => {
	try {
		// 1. Authenticate that the request is actually from Telegram via our Webhook Secret
		const secretToken = c.req.header('X-Telegram-Bot-Api-Secret-Token');
		if (secretToken !== c.env.WEBHOOK_SECRET) {
			return c.text('Unauthorized Webhook Source', 401);
		}

		const update = await c.req.json();
		console.log('Received Telegram update:', update);

		const message = update.message;
		if (message) {
			const chatId = message.chat.id;
			const userId = message.from?.id?.toString();
			const text = message.text || message.caption || '';
			
			// 2. Prevent malicious poisoning by restricting who the Bot listens to
			if (userId !== c.env.ALLOWED_USER_ID) {
				console.log(`Unauthorized user attempted access: ${userId}`);
				return c.json({ ok: true }); // Return OK to drop the message from Telegram queue silently
			}

			const orchestrator = new Orchestrator(c.env);

			if (text.startsWith('/ask')) {
				const question = text.replace('/ask', '').trim();
				if (!question) {
					return c.json({ ok: true });
				}
				// Pass the absolute webhook origin so Telegram can assemble a clickable hyperlink
				const baseUrl = new URL(c.req.url).origin;
				// Execute asynchronously without blocking webhook closure
				c.executionCtx.waitUntil(orchestrator.handleAsk(chatId, question, baseUrl));
			} else if (text.startsWith('/feed')) {
				// Require explicit /feed command to avoid digesting random conversational text
				const feedText = text.replace('/feed', '').trim();
				if (feedText) {
					c.executionCtx.waitUntil(orchestrator.handleIngestion(chatId, feedText));
				}
			} else if (text.startsWith('/search')) {
				const query = text.replace('/search', '').trim();
				if (query) {
					c.executionCtx.waitUntil(orchestrator.handleTopicResearch(chatId, query));
				}
			} else if (text.startsWith('/clear_research')) {
				c.executionCtx.waitUntil(orchestrator.handleClearResearch(chatId));
			} else if (message.photo || message.document) {
				// Automatically ingest images and raw files without explicitly requiring /feed
				c.executionCtx.waitUntil(orchestrator.handleMediaIngestion(chatId, message));
			}
		}

		// Acknowledge receipt to Telegram API
		return c.json({ ok: true });
	} catch (error) {
		console.error('Webhook processing error:', error);
		// Return 200 anyway so Telegram doesn't keep retrying on parsing failures during dev
		return c.json({ ok: false, error: 'Failed' });
	}
});

export default webhookRoute;
