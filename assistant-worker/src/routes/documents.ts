import { Hono } from 'hono';
import { Env } from '../types';
import { KnowledgeService } from '../services/knowledge';

const documentsRoute = new Hono<{ Bindings: Env }>();

// Get Document Content
documentsRoute.get('/api/documents/:id', async (c) => {
	const id = c.req.param('id');
	const knowledgeService = new KnowledgeService(c.env);
	const doc = await knowledgeService.getDocument(id);
	if (!doc) return c.json({ ok: false, error: 'Document not found' }, 404);
	return c.json({ ok: true, document: doc });
});

// Create Document
documentsRoute.post('/api/documents', async (c) => {
	try {
		const { title, category, content } = await c.req.json();
		if (!title || !content) {
			return c.json({ ok: false, error: 'Title and content are required' }, 400);
		}

		const knowledgeService = new KnowledgeService(c.env);
		const result = await knowledgeService.ingestDocument(title, category, content);
		return c.json({ ok: true, document: result });
	} catch (e: any) {
		console.error('Failed to create document', e);
		return c.json({ ok: false, error: e.message }, 500);
	}
});

// Update Document - saves immediately to R2, then triggers durable background re-index
documentsRoute.put('/api/documents/:id', async (c) => {
	const id = c.req.param('id');
	try {
		const { title, category, content } = await c.req.json();
		if (!title || !content) {
			return c.json({ ok: false, error: 'Title and content are required' }, 400);
		}

		const knowledgeService = new KnowledgeService(c.env);
		const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<any>();
		if (!doc) return c.json({ ok: false, error: 'Document not found' }, 404);

		const safeCategory = (category || doc.category || 'misc').toLowerCase().trim();
		const filePath = `kb/${safeCategory}/${id}.md`;

		// 1. Save new content to R2 immediately (fast)
		await c.env.KNOWLEDGE_BASE.put(filePath, content, {
			httpMetadata: { contentType: 'text/markdown' }
		});

		// 2. Update D1 metadata and mark as PENDING (re-index in progress)
		await c.env.DB.prepare(
			'UPDATE documents SET title = ?1, category = ?2, file_path = ?3, status = ?4 WHERE id = ?5'
		).bind(title, safeCategory, filePath, 'PENDING', id).run();

		// 3. Queue durable background re-index workflow
		await knowledgeService.triggerReindex(id);

		console.log(`[Update] Saved and queued re-index for: "${title}" (${id})`);
		return c.json({ ok: true, document: { id, title, category: safeCategory } });
	} catch (e: any) {
		console.error('Failed to update document', e);
		return c.json({ ok: false, error: e.message }, 500);
	}
});

// Update Document Category Native Edge Endpoint
documentsRoute.post('/api/documents/:id/category', async (c) => {
	const id = c.req.param('id');
	try {
		const payload = await c.req.json();
		const newCategory = payload.category;

		if (!newCategory) {
			return c.json({ ok: false, error: "Missing category" }, 400);
		}

		// Since category changed, we should ideally re-vectorize to update R2 path and metadata
		// But for now, we'll keep the existing logic and just update metadata in D1 if requested.
		// Actually, let's use KnowledgeService to ensure paths are consistent if we want to be robust.
		
		const knowledgeService = new KnowledgeService(c.env);
		const doc = await knowledgeService.getDocument(id);
		if (doc) {
			await knowledgeService.ingestDocument(doc.title, newCategory, doc.content, id);
		} else {
			await c.env.DB.prepare('UPDATE documents SET category = LOWER(?) WHERE id = ?').bind(newCategory, id).run();
		}
		
		return c.json({ ok: true });
	} catch (e) {
		console.error("Failed to update category", e);
		return c.json({ ok: false }, 500);
	}
});

// Cascading Delete Document Native Edge Endpoint
documentsRoute.delete('/api/documents/:id', async (c) => {
	const id = c.req.param('id');
	try {
		// 1. Fetch R2 path and purge raw markdown file
		const record = await c.env.DB.prepare('SELECT file_path FROM documents WHERE id = ?').bind(id).first();
		if (record && record.file_path) {
			await c.env.KNOWLEDGE_BASE.delete(record.file_path as string);
		}

		// 2. Delete index metadata from D1 Database
		await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();

		// 3. Record in tombstone table so maintenance can purge vectors later
		await c.env.DB.prepare(
			`CREATE TABLE IF NOT EXISTS vector_tombstones (id TEXT PRIMARY KEY, deleted_at INTEGER)`
		).run();
		await c.env.DB.prepare(
			'INSERT OR REPLACE INTO vector_tombstones (id, deleted_at) VALUES (?, ?)'
		).bind(id, Date.now()).run();

		// 4. Purge vector embeddings in batches of 100 (Vectorize API limit)
		for (let i = 0; i < 500; i += 100) {
			const vectorIds = Array.from({ length: 100 }, (_, j) => `${id}-${i + j}`);
			await c.env.VECTOR_INDEX.deleteByIds(vectorIds);
		}

		return c.json({ ok: true });
	} catch (e) {
		console.error("Failed to purge document", e);
		return c.json({ ok: false }, 500);
	}
});

export default documentsRoute;
