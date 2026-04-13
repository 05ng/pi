import { AIGateway } from '../ai';
import { Env } from '../types';

export class KnowledgeService {
	private ai: AIGateway;

	constructor(private env: Env) {
		this.ai = new AIGateway(env);
	}

	/**
	 * Ingests a document: saves to R2, updates D1, and creates embeddings in Vectorize.
	 * If id is provided, it updates existing; otherwise creates new.
	 */
	/**
	 * Ingests a document: saves to R2, updates D1, and creates embeddings in Vectorize.
	 * If id is provided, it updates existing; otherwise creates new.
	 */
	async ingestDocument(title: string, category: string, content: string, existingId?: string) {
		const uuid = existingId || crypto.randomUUID();
		const safeCategory = (category || "misc").toLowerCase().trim();
		const filePath = `kb/${safeCategory}/${uuid}.md`;
		console.log(`[Ingest] >> Indexing Document: "${title}" | Category: ${safeCategory} | Length: ${content.length} chars`);

		// [Ingest Audit] Detect year range to verify full-text indexing
		const yearsFound = new Set<string>();
		const yearMatches = content.match(/\b(20\d{2})\b/g);
		if (yearMatches) yearMatches.forEach(y => yearsFound.add(y));
		const sortedYears = Array.from(yearsFound).sort();
		console.log(`[Ingest Audit] "${title}" contains unique years: ${sortedYears.join(', ')}`);

		// 1. If updating, purge old vectors to prevent category desync
		if (existingId) {
			console.log(`[Ingest] Purging old vectors for: ${existingId} (in batches of 100)`);
			// Vectorize limits deleteByIds to 100 IDs per call
			for (let i = 0; i < 500; i += 100) {
				const vectorIds = Array.from({ length: 100 }, (_, j) => `${existingId}-${i + j}`);
				await this.env.VECTOR_INDEX.deleteByIds(vectorIds);
			}
		}

		// 2. Save to R2
		await this.env.KNOWLEDGE_BASE.put(filePath, content, {
			customMetadata: { title, category: safeCategory }
		});

		// 3. Table-Aware Vectorize (using AI)
		const lines = content.split('\n');
		let tableHeader = "";
		// Detect table header (first instance of | ... |)
		for (let i = 0; i < Math.min(lines.length, 50); i++) {
			if (lines[i].trim().startsWith('|') && lines[i+1]?.includes('---')) {
				tableHeader = `${lines[i]}\n${lines[i+1]}`;
				break;
			}
		}

		const chunks: string[] = [];
		let currentChunk = "";
		const targetChunkSize = 800; // Larger chunks for more context

		for (const line of lines) {
			if ((currentChunk.length + line.length) > targetChunkSize && currentChunk.length > 0) {
				const header = `=== DOCUMENT: ${title} ===` + (tableHeader && currentChunk.includes('|') ? `\n\n[COLUMN HEADERS]\n${tableHeader}` : "");
				chunks.push(`${header}\n\n${currentChunk.trim()}`);
				currentChunk = "";
			}
			currentChunk += line + "\n";
		}
		if (currentChunk.trim().length > 0) {
			const header = `=== DOCUMENT: ${title} ===` + (tableHeader && currentChunk.includes('|') ? `\n\n[COLUMN HEADERS]\n${tableHeader}` : "");
			chunks.push(`${header}\n\n${currentChunk.trim()}`);
		}

		console.log(`[Ingest] Generated ${chunks.length} chunks. Starting AI Embedding...`);
		const embeds = await this.ai.generateEmbeddings(chunks);

		const vectors = embeds.map((vec: any[], idx: number) => ({
			id: `${uuid}-${idx}`,
			values: vec,
			metadata: { 
				filePath, 
				title, 
				category: safeCategory,
				text: chunks[idx] 
			}
		}));

		// Batch inserts (50 at a time) to prevent Cloudflare constraints
		const insertBatchSize = 50;
		for (let i = 0; i < vectors.length; i += insertBatchSize) {
			const batch = vectors.slice(i, i + insertBatchSize);
			console.log(`[Ingest] Vectorize Insert Batch: ${Math.floor(i / insertBatchSize) + 1} of ${Math.ceil(vectors.length / insertBatchSize)}`);
			await this.env.VECTOR_INDEX.insert(batch);
		}

		// 4. Update D1
		if (existingId) {
			await this.env.DB.prepare(
				'UPDATE documents SET title = ?1, category = ?2, file_path = ?3, status = ?4 WHERE id = ?5'
			).bind(title, safeCategory, filePath, 'READY', existingId).run();
		} else {
			await this.env.DB.prepare(
				'INSERT INTO documents (id, title, category, file_path, status) VALUES (?1, ?2, ?3, ?4, ?5)'
			).bind(uuid, title, safeCategory, filePath, 'READY').run();
		}

		return { id: uuid, title, category: safeCategory, filePath };
	}

	/**
	 * Re-vectorizes all documents using the background workflow engine.
	 */
	async backfillDocuments() {
		console.log("[Backfill] --- Global Hub Durable Re-indexing ---");
		const { results } = await this.env.DB.prepare('SELECT id, title FROM documents').all();
		
		console.log(`[Backfill] Queueing ${results.length} documents for background re-indexing...`);
		
		for (const doc of results as any) {
			await this.triggerReindex(doc.id);
		}

		console.log(`[Backfill] All ${results.length} documents queued.`);
		return results.length;
	}

	async getDocument(id: string) {
		const record = await this.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<any>();
		if (!record) return null;

		const object = await this.env.KNOWLEDGE_BASE.get(record.file_path as string);
		if (!object) return null;

		const content = await object.text();
		return {
			...record,
			content
		};
	}

	/**
	 * Shared logic to trigger background ingestion with auto-mode detection.
	 */
	async queueIngestion(id: string) {
		const doc = await this.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<any>();
		if (!doc) throw new Error("Document not found");

		// Auto-detect mode based on file path
		const isMarkdown = doc.file_path && doc.file_path.startsWith('kb/');
		const mode = isMarkdown ? 'REINDEX' : 'NEW';
		
		console.log(`[Service] Smart Trigger Detection: mode=${mode} for id=${id}`);

		// Re-trigger workflow with correct mode
		await this.env.INGESTION_WORKFLOW.create({
			id: `${mode.toLowerCase()}-${id}-${Date.now()}`,
			params: {
				fileKey: doc.file_path,
				fileName: doc.title,
				category: doc.category,
				docId: id,
				chatId: Number(this.env.ALLOWED_USER_ID),
				mode: mode
			}
		});

		// Ensure status is PENDING to show progress in UI
		await this.env.DB.prepare('UPDATE documents SET status = ?1 WHERE id = ?2')
			.bind('PENDING', id).run();

		return { ok: true, mode };
	}

	/**
	 * Triggers a durable background workflow to re-index a document.
	 */
	async triggerReindex(id: string) {
		console.log(`[Service] Manual Re-index Request for: ${id}`);
		return await this.queueIngestion(id);
	}

	/**
	 * Retries a background ingestion job.
	 */
	async retryIngestion(id: string) {
		console.log(`[Service] Manual Retry Request for: ${id}`);
		return await this.queueIngestion(id);
	}
}
