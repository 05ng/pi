import { Hono } from 'hono';
import { Env } from '../types';

const answerRoute = new Hono<{ Bindings: Env }>();

// Setup Answer Retrieval Endpoint (Private HTML View)
answerRoute.get('/answer/:id', async (c) => {
	const answerId = c.req.param('id');

	const file = await c.env.KNOWLEDGE_BASE.get(`answers/${answerId}.html`);
	if (!file) {
		return c.text('Answer not found or expired', 404);
	}

	const content = await file.text();
	return c.html(content);
});

export default answerRoute;
