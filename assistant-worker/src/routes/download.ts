import { Hono } from 'hono';
import { Env } from '../types';

const downloadRoute = new Hono<{ Bindings: Env }>();

// View/Download underlying raw markdown file endpoint
downloadRoute.get('/download/:id', async (c) => {
	const id = c.req.param('id');
	
	try {
		// Look up the exact file path from D1 metadata
		const fileRecord = await c.env.DB.prepare('SELECT file_path FROM documents WHERE id = ?').bind(id).first();
		if (!fileRecord || !fileRecord.file_path) return c.text('Not found', 404);

		// Pull Markdown File Object out of R2 Bucket
		const object = await c.env.KNOWLEDGE_BASE.get(fileRecord.file_path as string);
		if (!object) return c.text('File missing in R2 Storage', 404);

		const text = await object.text();
		return c.text(text, 200, {
			'Content-Type': 'text/markdown; charset=utf-8'
		});
	} catch (e) {
		return c.text('Error retrieving document', 500);
	}
});

export default downloadRoute;
