import { Hono } from 'hono';
import { Env } from '../types';
import { getLayout } from './layout';
import { KnowledgeService } from '../services/knowledge';

const knowledgePageRoute = new Hono<{ Bindings: Env }>();

// 1. Knowledge Hub List View
knowledgePageRoute.get('/knowledge', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT * FROM documents ORDER BY created_at DESC').all();

	const documentsByCategory = results.reduce((acc: any, doc: any) => {
		const cat = (doc.category || 'misc').toLowerCase();
		if (!acc[cat]) acc[cat] = [];
		acc[cat].push(doc);
		return acc;
	}, {});

	const categories = Object.keys(documentsByCategory).sort();

	const content = `
    <div class="max-w-7xl mx-auto p-8 space-y-12 animate-fade-up">
        <div class="flex items-center justify-between">
            <div>
                <h2 class="text-3xl font-bold text-white">Knowledge Hub</h2>
                <p class="text-slate-500 text-sm mt-1">Manage and organize your gathered intelligence.</p>
            </div>
            <div class="flex items-center gap-3">
                <button id="purge-orphans-btn" onclick="purgeOrphansOnly()"
                    class="px-4 py-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 font-bold text-sm transition-all flex items-center gap-2"
                    title="Scan for and remove orphaned vectors from deleted documents">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    PURGE ORPHANS
                </button>
                <button id="purge-all-btn" onclick="purgeAllAndReindex()"
                    class="px-4 py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold text-sm transition-all flex items-center gap-2"
                    title="Purge all orphaned vectors and re-index every document">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    PURGE ALL & REINDEX
                </button>
                <a href="/knowledge/new" class="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 flex items-center">
                    <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    New Document
                </a>
            </div>
        </div>

        <!-- Quick Upload Dropzone -->
        <div id="upload-zone" class="glass rounded-3xl p-10 border-2 border-dashed border-white/10 hover:border-indigo-500/50 transition-all text-center group">
            <input type="file" id="file-input" class="hidden" multiple onchange="handleFileSelect(event)">
            <div class="flex flex-col items-center cursor-pointer" onclick="document.getElementById('file-input').click()">
                <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg class="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                </div>
                <h3 class="text-xl font-bold text-white">Advanced Document Loader</h3>
                <p class="text-slate-500 text-sm mt-2 max-w-md">Drop PDF, Word, Excel, or Image files here. They will be automatically converted to Markdown and indexed via background workflow.</p>
                <div class="mt-6 flex flex-wrap justify-center gap-2">
                    <span class="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] font-bold text-slate-500">PDF</span>
                    <span class="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] font-bold text-slate-500">DOCX</span>
                    <span class="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] font-bold text-slate-500">XLSX</span>
                    <span class="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] font-bold text-slate-500">IMG</span>
                </div>
                <div class="mt-4 flex items-center gap-3" onclick="event.stopPropagation()">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Category:</label>
                    <input type="text" id="upload-category" placeholder="e.g. pimco, scb cio, inbox" value="inbox"
                        class="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors w-56"
                        onclick="event.stopPropagation()">
                </div>
            </div>
            
            <!-- Upload Queue -->
            <div id="upload-queue" class="hidden mt-8 border-t border-white/5 pt-8 space-y-3 text-left max-w-2xl mx-auto">
                <h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Processing Queue</h4>
                <div id="queue-items"></div>
            </div>
        </div>

        <div class="space-y-16 pb-20">
            ${results.length === 0 ? `
                <div class="glass rounded-3xl p-20 text-center flex flex-col items-center">
                    <div class="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-6 border border-white/5">
                        <svg class="w-10 h-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                    </div>
                    <h2 class="text-2xl font-bold mb-2">Empty Hub</h2>
                    <p class="text-slate-500 max-w-sm">Start by creating a new document or forwarding content via Telegram.</p>
                </div>
            ` : categories.map(cat => `
                <section id="section-${cat}" class="scroll-mt-24">
                    <div class="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                        <h2 class="text-2xl font-bold capitalize flex items-center">
                            <span class="text-indigo-500 mr-3 opacity-50">#</span>
                            ${cat}
                        </h2>
                        <span class="text-xs font-mono text-slate-600">${documentsByCategory[cat].length} entries</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        ${documentsByCategory[cat].map((doc: any) => `
                            <div class="document-card group relative">
                                <div class="glass rounded-2xl p-6 hover-lift flex flex-col h-full border-white/5 group-hover:border-indigo-500/30 transition-all">
                                    <div class="flex justify-between items-start mb-4">
                                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                                            ${cat}
                                        </div>
                                        <div class="flex items-center space-x-2">
                                            <button onclick="requestDelete(event, '${doc.id}')" class="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all">
                                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div class="flex-grow">
                                        <h3 class="text-lg font-semibold mb-3 text-slate-100 group-hover:text-white line-clamp-2">${doc.title || 'Untitled'}</h3>
                                        <p class="text-slate-500 text-xs mb-6 font-mono truncate">${doc.file_path}</p>
                                    </div>

                                    <div class="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                                        <span class="text-[10px] text-slate-600 font-mono">${new Date(doc.created_at).toLocaleDateString()}</span>
                                        <div class="flex items-center space-x-4">
                                            ${doc.status === 'FAILED' ? `
                                                <button onclick="retryIngestion('${doc.id}')" class="text-orange-400 hover:text-orange-300 text-xs font-bold flex items-center transition-colors">
                                                    RETRY
                                                </button>
                                            ` : ''}
                                            
                                            ${doc.status === 'READY' || !doc.status ? `
                                                <button onclick="refreshDocument('${doc.id}')" class="text-indigo-400 hover:text-indigo-300 text-xs font-bold flex items-center transition-colors group/refresh" title="Deep Re-index">
                                                    <svg class="w-3.5 h-3.5 mr-1 group-hover/refresh:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                    REFRESH
                                                </button>
                                                <div class="h-3 w-px bg-white/10"></div>
                                                <a href="/knowledge/edit/${doc.id}" class="text-slate-400 hover:text-white text-xs font-bold transition-colors">
                                                    EDIT
                                                </a>
                                                <div class="h-3 w-px bg-white/10"></div>
                                                <a href="/download/${doc.id}" target="_blank" class="text-emerald-400 hover:emerald-300 text-xs font-bold flex items-center transition-colors">
                                                    READ
                                                    <svg class="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                                </a>
                                            ` : `
                                                <div class="flex items-center space-x-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                                                    <div class="w-1.5 h-1.5 rounded-full ${doc.status === 'FAILED' ? 'bg-red-500' : 'bg-blue-400 animate-pulse'}"></div>
                                                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">${doc.status}</span>
                                                </div>
                                            `}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>
            `).join('')}
        </div>
    </div>
    <script>
        async function handleFileSelect(event) {
            const files = event.target.files;
            if (!files.length) return;
            
            const queue = document.getElementById('upload-queue');
            const items = document.getElementById('queue-items');
            queue.classList.remove('hidden');

            for (const file of files) {
                const id = 'up-' + Math.random().toString(36).substr(2, 9);
                const item = document.createElement('div');
                item.id = id;
                item.className = 'glass bg-white/5 rounded-2xl p-4 flex items-center justify-between animate-fade-up';
                item.innerHTML = '<div class="flex items-center space-x-4">' +
                    '<div class="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">' +
                    '<svg class="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>' +
                    '</div>' +
                    '<div>' +
                    '<p class="text-sm font-bold text-white">' + file.name + '</p>' +
                    '<p class="text-[10px] text-slate-500">Pending Background Ingestion...</p>' +
                    '</div>' +
                    '</div>' +
                    '<div class="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20">' +
                    '<span class="text-[10px] font-bold text-indigo-400">UPLOADING</span>' +
                    '</div>';
                items.appendChild(item);

                const formData = new FormData();
                formData.append('file', file);
                const categoryInput = document.getElementById('upload-category');
                formData.append('category', categoryInput ? categoryInput.value.trim() || 'inbox' : 'inbox');

                try {
                    const res = await fetch('/api/knowledge/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (data.ok) {
                        item.querySelector('span').innerText = 'QUEUED';
                        item.querySelector('p:last-child').innerText = 'Added to persistent database. Refresh to see progress.';
                        // Optionally refresh after a short delay
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        throw new Error(data.error);
                    }
                } catch (err) {
                    item.querySelector('span').innerText = 'FAILED';
                    item.querySelector('span').className = 'text-[10px] font-bold text-red-400';
                    item.querySelector('p:last-child').innerText = err.message;
                }
            }
        }

        async function refreshDocument(id) {
            if(!confirm('Re-index this document in the background? This will ensure all data is searchable.')) return;
            try {
                const res = await fetch('/api/documents/reindex/' + id, { method: 'POST' });
                if (res.ok) window.location.reload();
            } catch (err) { console.error(err); }
        }

        async function retryIngestion(id) {
            try {
                const res = await fetch('/api/documents/retry/' + id, { method: 'POST' });
                if (res.ok) window.location.reload();
            } catch (err) { console.error(err); }
        }

        async function requestDelete(event, id) {
            event.preventDefault();
            event.stopPropagation();
            if(confirm('Delete document?')) {
                try {
                    const res = await fetch('/api/documents/' + id, { method: 'DELETE' });
                    if (res.ok) window.location.reload();
                } catch (err) { console.error(err); }
            }
        }

        async function purgeOrphansOnly() {
            showModal({ title: '🔍 Purge Orphan Vectors?', text: 'This will scan the vector index for entries from deleted documents and remove them. Existing documents will NOT be re-indexed. Continue?' }, async (confirmed) => {
                if (!confirmed) return;
                const btn = document.getElementById('purge-orphans-btn');
                btn.disabled = true;
                btn.innerText = 'SCANNING...';
                try {
                    const res = await fetch('/api/knowledge/purge-orphans', { method: 'POST' });
                    const data = await res.json();
                    showModal({ title: '✅ Orphan Sweep Done', text: 'Tombstones cleared: ' + (data.tombstonesCleared || 0) + '. Orphaned vector sets purged: ' + (data.orphansCleared || 0) + '.' }, () => {});
                } catch (err) {
                    showModal({ title: 'Error', text: err.message }, () => {});
                } finally {
                    btn.disabled = false;
                    btn.innerText = '🔍 PURGE ORPHANS';
                }
            });
        }

        async function purgeAllAndReindex() {
            showModal({ title: '🗑️ Purge All & Reindex?', text: 'This will delete ALL existing vectors and re-index every document from scratch in the background. This is useful for housekeeping after multiple failed uploads. Continue?' }, async (confirmed) => {
                if (!confirmed) return;
                const btn = document.getElementById('purge-all-btn');
                btn.disabled = true;
                btn.innerText = 'PURGING...';
                try {
                    const res = await fetch('/api/knowledge/maintenance', { method: 'POST' });
                    const data = await res.json();
                    showModal({ title: '✅ Housekeeping Done', text: 'Re-indexed: ' + data.count + ' doc(s). Tombstones cleared: ' + (data.tombstonesCleared || 0) + '. Orphans purged: ' + (data.orphansCleared || 0) + '.' }, () => window.location.reload());
                } catch (err) {
                    showModal({ title: 'Error', text: err.message }, () => {});
                } finally {
                    btn.disabled = false;
                    btn.innerText = '🗑️ PURGE ALL & REINDEX';
                }
            });
        }
    </script>
    `;

	return c.html(getLayout('Knowledge', content));
});

// 2. Upload API
knowledgePageRoute.post('/api/knowledge/upload', async (c) => {
	try {
		const formData = await c.req.parseBody();
		const file = formData.file as File;
		const category = (formData.category as string) || 'inbox';

		if (!file) {
			return c.json({ ok: false, error: 'No file uploaded' }, 400);
		}

		// 1. Create a placeholder in D1
		const docId = crypto.randomUUID();
		await c.env.DB.prepare(
			'INSERT INTO documents (id, title, category, file_path, status) VALUES (?1, ?2, ?3, ?4, ?5)'
		).bind(docId, file.name, category, `pending/${docId}/${file.name}`, 'PENDING').run();

		// 2. Save binary to R2 (temporary)
		const fileKey = `uploads/${docId}-${file.name}`;
		await c.env.KNOWLEDGE_BASE.put(fileKey, await file.arrayBuffer(), {
			httpMetadata: { contentType: file.type }
		});

		// 3. Trigger Ingestion Workflow
		await c.env.INGESTION_WORKFLOW.create({
			params: {
				fileKey,
				fileName: file.name,
				category,
				chatId: Number(c.env.ALLOWED_USER_ID), // Notify the owner
				docId,
				mode: 'NEW'
			}
		});

		return c.json({ ok: true, docId });

	} catch (e: any) {
		console.error("Upload Error:", e);
		return c.json({ ok: false, error: e.message }, 500);
	}
});

// Debug endpoint to inspect stored R2 content for a specific document
knowledgePageRoute.get('/api/documents/debug/:id', async (c) => {
	try {
		const id = c.req.param('id');
		const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<any>();
		if (!doc) return c.json({ error: "Document not found in DB" }, 404);

		const obj = await c.env.KNOWLEDGE_BASE.get(doc.file_path);
		if (!obj) return c.json({ error: `Markdown not found in R2 at: ${doc.file_path}`, db_record: doc }, 404);

		const text = await obj.text();
		const lines = text.split('\n');
		const yearMatches = text.match(/\b(20\d{2})\b/g) || [];
		const uniqueYears = Array.from(new Set(yearMatches)).sort();

		return c.json({
			id: doc.id,
			title: doc.title,
			file_path: doc.file_path,
			status: doc.status,
			total_chars: text.length,
			total_lines: lines.length,
			unique_years_detected: uniqueYears,
			head_1000: text.substring(0, 1000),
			tail_1000: text.substring(text.length - 1000),
		});
	} catch (e: any) {
		return c.json({ error: e.message }, 500);
	}
});

knowledgePageRoute.post('/api/documents/retry/:id', async (c) => {
	try {
		const id = c.req.param('id');
		const knowledgeService = new KnowledgeService(c.env);
		await knowledgeService.retryIngestion(id);
		return c.json({ ok: true });
	} catch (e: any) {
		return c.json({ ok: false, error: e.message }, 500);
	}
});

knowledgePageRoute.post('/api/documents/reindex/:id', async (c) => {
	try {
		const id = c.req.param('id');
		const knowledgeService = new KnowledgeService(c.env);
		await knowledgeService.triggerReindex(id);
		return c.json({ ok: true });
	} catch (e: any) {
		return c.json({ ok: false, error: e.message }, 500);
	}
});

// Purge orphaned vectors for a document ID (even if the DB record is gone)
knowledgePageRoute.post('/api/documents/purge-vectors/:id', async (c) => {
	try {
		const id = c.req.param('id');
		console.log(`[Purge] Beginning orphaned vector purge for ID: ${id}`);
		let batchCount = 0;
		for (let i = 0; i < 500; i += 100) {
			const vectorIds = Array.from({ length: 100 }, (_, j) => `${id}-${i + j}`);
			await c.env.VECTOR_INDEX.deleteByIds(vectorIds);
			batchCount++;
		}
		console.log(`[Purge] Completed. Purged ${batchCount} batches for ID: ${id}`);
		return c.json({ ok: true, batches: batchCount, id });
	} catch (e: any) {
		return c.json({ ok: false, error: e.message }, 500);
	}
});

// Purge orphans only — tombstone sweep + vector scan without re-indexing
knowledgePageRoute.post('/api/knowledge/purge-orphans', async (c) => {
	try {
		const { results } = await c.env.DB.prepare('SELECT id FROM documents').all();
		const validDocIds = new Set((results as any[]).map((d: any) => d.id));
		let tombstonesCleared = 0;
		let orphansCleared = 0;

		// Phase 1: Tombstone sweep
		await c.env.DB.prepare(
			`CREATE TABLE IF NOT EXISTS vector_tombstones (id TEXT PRIMARY KEY, deleted_at INTEGER)`
		).run();
		const { results: tombstones } = await c.env.DB.prepare('SELECT id FROM vector_tombstones').all();
		for (const tomb of tombstones as any[]) {
			for (let i = 0; i < 500; i += 100) {
				const vectorIds = Array.from({ length: 100 }, (_, j) => `${tomb.id}-${i + j}`);
				await c.env.VECTOR_INDEX.deleteByIds(vectorIds);
			}
			await c.env.DB.prepare('DELETE FROM vector_tombstones WHERE id = ?').bind(tomb.id).run();
			console.log(`[PurgeOrphans] Swept tombstone: ${tomb.id}`);
			tombstonesCleared++;
		}

		// Phase 2: Orphan scan — sample broad searches, detect unknown docIds
		const orphanIds = new Set<string>();
		const sampleQueries = [
			'financial data NAV performance fund',
			'market news analysis investment',
			'historical prices returns chart',
			'error page document unknown',
		];
		for (const query of sampleQueries) {
			const embedRes = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [query] });
			if (!embedRes?.data?.[0]) continue;
			const searchRes = await c.env.VECTOR_INDEX.query(embedRes.data[0], { topK: 20, returnMetadata: 'none' });
			for (const match of (searchRes.matches || [])) {
				const lastDash = match.id.lastIndexOf('-');
				const docId = match.id.substring(0, lastDash);
				if (docId && !validDocIds.has(docId)) orphanIds.add(docId);
			}
		}
		for (const orphanId of orphanIds) {
			for (let i = 0; i < 500; i += 100) {
				const vectorIds = Array.from({ length: 100 }, (_, j) => `${orphanId}-${i + j}`);
				await c.env.VECTOR_INDEX.deleteByIds(vectorIds);
			}
			console.log(`[PurgeOrphans] 🗑️ Purged orphan: ${orphanId}`);
			orphansCleared++;
		}

		console.log(`[PurgeOrphans] ✅ Done. Tombstones: ${tombstonesCleared}, Orphans: ${orphansCleared}`);
		return c.json({ ok: true, tombstonesCleared, orphansCleared });
	} catch (e: any) {
		console.error('[PurgeOrphans] Error:', e);
		return c.json({ ok: false, error: e.message }, 500);
	}
});

knowledgePageRoute.post('/api/knowledge/maintenance', async (c) => {
	try {
		const { results } = await c.env.DB.prepare('SELECT id, title FROM documents').all();
		console.log(`[Maintenance] Starting full purge & reindex for ${results.length} document(s)...`);
		
		const knowledgeService = new KnowledgeService(c.env);
		let count = 0;
		
		for (const doc of results as any[]) {
			// 1. Purge all 500 potential vector IDs in batches of 100
			for (let i = 0; i < 500; i += 100) {
				const vectorIds = Array.from({ length: 100 }, (_, j) => `${doc.id}-${i + j}`);
				await c.env.VECTOR_INDEX.deleteByIds(vectorIds);
			}
			console.log(`[Maintenance] Purged vectors for: "${doc.title}" (${doc.id})`);

			// 2. Queue durable background re-index
			await knowledgeService.triggerReindex(doc.id);
			console.log(`[Maintenance] Queued re-index for: "${doc.title}"`);
			count++;
		}

		// Phase 2: Sweep tombstones — purge vectors for historically deleted documents
		let tombstonesCleared = 0;
		try {
			await c.env.DB.prepare(
				`CREATE TABLE IF NOT EXISTS vector_tombstones (id TEXT PRIMARY KEY, deleted_at INTEGER)`
			).run();
			const { results: tombstones } = await c.env.DB.prepare('SELECT id FROM vector_tombstones').all();
			for (const tomb of tombstones as any[]) {
				for (let i = 0; i < 500; i += 100) {
					const vectorIds = Array.from({ length: 100 }, (_, j) => `${tomb.id}-${i + j}`);
					await c.env.VECTOR_INDEX.deleteByIds(vectorIds);
				}
				await c.env.DB.prepare('DELETE FROM vector_tombstones WHERE id = ?').bind(tomb.id).run();
				console.log(`[Maintenance] Swept tombstone: ${tomb.id}`);
				tombstonesCleared++;
			}
		} catch (tombErr) {
			console.warn('[Maintenance] Tombstone sweep skipped:', tombErr);
		}

		// Phase 3: Orphan Scan — detect vectors for documents no longer in D1
		// Sample the vector space with broad queries, extract docIds from vector IDs, purge unknowns
		let orphansCleared = 0;
		try {
			const validDocIds = new Set((results as any[]).map((d: any) => d.id));
			const orphanIds = new Set<string>();

			const sampleQueries = [
				'financial data NAV performance fund',
				'market news analysis investment',
				'historical prices returns chart'
			];

			for (const query of sampleQueries) {
				const embedRes = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [query] });
				if (!embedRes?.data?.[0]) continue;

				const searchRes = await c.env.VECTOR_INDEX.query(embedRes.data[0], { topK: 20, returnMetadata: 'none' });
				for (const match of (searchRes.matches || [])) {
					// Vector IDs are "{uuid}-{idx}" — extract docId by stripping last segment
					const lastDash = match.id.lastIndexOf('-');
					const docId = match.id.substring(0, lastDash);
					if (docId && !validDocIds.has(docId)) {
						orphanIds.add(docId);
					}
				}
			}

			for (const orphanId of orphanIds) {
				for (let i = 0; i < 500; i += 100) {
					const vectorIds = Array.from({ length: 100 }, (_, j) => `${orphanId}-${i + j}`);
					await c.env.VECTOR_INDEX.deleteByIds(vectorIds);
				}
				console.log(`[Maintenance] 🗑️ Purged orphan vector set: ${orphanId}`);
				orphansCleared++;
			}
		} catch (orphanErr) {
			console.warn('[Maintenance] Orphan scan skipped:', orphanErr);
		}

		console.log(`[Maintenance] ✅ Done. Re-indexed: ${count}, Tombstones: ${tombstonesCleared}, Orphans: ${orphansCleared}`);
		return c.json({ ok: true, count, tombstonesCleared, orphansCleared });
	} catch (e: any) {
		console.error('[Maintenance] Error:', e);
		return c.json({ ok: false, error: e.message }, 500);
	}
});

knowledgePageRoute.get('/knowledge/new', (c) => renderEditor(c));
knowledgePageRoute.get('/knowledge/edit/:id', async (c) => {
	const id = c.req.param('id');
	const knowledgeService = new KnowledgeService(c.env);
	const doc = await knowledgeService.getDocument(id);
	if (!doc) return c.redirect('/knowledge');
	return renderEditor(c, doc);
});

function renderEditor(c: any, doc: any = null) {
	const extraScripts = `
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css">
    <script src="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js"></script>
    <style>
        .CodeMirror { 
            background: rgba(15, 23, 42, 0.4) !important; 
            border: 1px solid rgba(255, 255, 255, 0.05) !important;
            border-radius: 0 0 16px 16px;
            color: #f8fafc !important;
            font-family: 'JetBrains Mono', monospace;
            height: calc(100vh - 350px) !important;
            min-height: 500px;
        }
        .editor-toolbar { 
            background: rgba(30, 41, 59, 0.5) !important; 
            border: 1px solid rgba(255, 255, 255, 0.05) !important;
            border-bottom: none !important;
            border-radius: 16px 16px 0 0;
        }
        .editor-toolbar button { color: #94a3b8 !important; }
        .editor-toolbar button:hover, .editor-toolbar button.active { 
            color: #fff !important; 
            background: rgba(255, 255, 255, 0.1) !important; 
        }
        .editor-preview { background: #0f172a !important; color: #f8fafc !important; }
    </style>
    `;

	const content = `
    <div class="max-w-6xl mx-auto p-8 space-y-8 animate-fade-up">
        <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
                <a href="/knowledge" class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </a>
                <h2 class="text-2xl font-bold text-white">${doc ? 'Edit Knowledge' : 'New Knowledge'}</h2>
            </div>
            <div class="flex items-center space-x-3">
                <button id="save-btn" onclick="saveDocument()" class="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20 flex items-center">
                    <span id="save-text">Save Knowledge</span>
                    <svg id="save-spinner" class="hidden w-4 h-4 ml-2 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </div>
        </div>

        <div class="glass rounded-3xl p-8 space-y-6">
            <div class="grid grid-cols-2 gap-6">
                <div>
                    <label class="block text-[10px] uppercase font-bold text-slate-500 mb-1 ml-1">Title</label>
                    <input type="text" id="doc-title" value="${doc?.title || ''}" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors" placeholder="e.g. Serverless Architecture Patterns">
                </div>
                <div>
                    <label class="block text-[10px] uppercase font-bold text-slate-500 mb-1 ml-1">Category</label>
                    <input type="text" id="doc-category" value="${doc?.category || ''}" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors" placeholder="e.g. technology, research">
                </div>
            </div>
            <div>
                <label class="block text-[10px] uppercase font-bold text-slate-500 mb-1 ml-1">Content (Markdown)</label>
                <textarea id="doc-content">${doc?.content || ''}</textarea>
            </div>
        </div>
    </div>
    <script>
        let easyMDE;
        window.onload = () => {
            easyMDE = new EasyMDE({
                element: document.getElementById('doc-content'),
                forceSync: true,
                spellChecker: false,
                status: ["lines", "words", "cursor"],
                placeholder: "# Start writing...",
                toolbar: ["bold", "italic", "heading", "|", "quote", "unordered-list", "ordered-list", "|", "link", "image", "table", "|", "preview", "side-by-side", "fullscreen", "|", "guide"]
            });
        };

        async function saveDocument() {
            const title = document.getElementById('doc-title').value.trim();
            const category = document.getElementById('doc-category').value.trim();
            const content = easyMDE.value().trim();

            if (!title || !content) {
                showModal({ title: "Validation Error", text: "Title and Content are required." }, () => {});
                return;
            }

            const saveBtn = document.getElementById('save-btn');
            const saveText = document.getElementById('save-text');
            const saveSpinner = document.getElementById('save-spinner');

            saveBtn.disabled = true;
            saveText.innerText = "Saving...";
            saveSpinner.classList.remove('hidden');

            try {
                const docId = "${doc?.id || ''}";
                const method = docId ? 'PUT' : 'POST';
                const url = docId ? '/api/documents/' + docId : '/api/documents';
                
                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, category, content })
                });

                const data = await res.json();
                if (data.ok) {
                    window.location.href = '/knowledge';
                } else {
                    throw new Error(data.error || "Failed to save");
                }
            } catch (err) {
                showModal({ title: "Error", text: err.message }, () => {});
                saveBtn.disabled = false;
                saveText.innerText = "Save Knowledge";
                saveSpinner.classList.add('hidden');
            }
        }
    </script>
    `;

	return c.html(getLayout(doc ? 'Edit' : 'New Knowledge', content, extraScripts));
}

export default knowledgePageRoute;
