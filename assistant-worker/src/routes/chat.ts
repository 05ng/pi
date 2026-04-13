import { Hono } from 'hono';
import { Env } from '../types';
import { getLayout } from './layout';
import { AIGateway } from '../ai';
import { KnowledgeService } from '../services/knowledge';

const chatRoute = new Hono<{ Bindings: Env }>();

// 1. Render Chat UI
chatRoute.get('/chat', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT DISTINCT category FROM documents ORDER BY category ASC').all() as any;
    const categories = results.map((r: any) => r.category);

    const content = `
    <div class="flex h-[calc(100vh-64px)] overflow-hidden animate-fade-up">
        <!-- Sidebar: Categories -->
        <aside class="w-64 border-r border-white/5 flex flex-col bg-white/[0.02]">
            <div class="p-6 border-b border-white/5">
                <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Context Filter</h3>
            </div>
            <nav class="flex-grow overflow-y-auto p-3 space-y-1" id="category-nav">
                <button onclick="selectCategory(null)" class="cat-btn w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/5 text-indigo-400 bg-indigo-500/10 border border-indigo-500/20" data-cat="all">
                    <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-3"></span>
                    All Knowledge
                </button>
                ${categories.map((cat: string) => `
                    <button onclick="selectCategory('${cat}')" class="cat-btn w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/5 text-slate-400 border border-transparent" data-cat="${cat}">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-700 mr-3"></span>
                        <span class="capitalize">${cat}</span>
                    </button>
                `).join('')}
            </nav>
            <div class="p-4 border-t border-white/5">
                <button onclick="requestBackfill()" class="w-full px-4 py-2 rounded-lg text-[10px] font-bold text-slate-500 hover:text-indigo-400 border border-dashed border-white/10 hover:border-indigo-500/30 transition-all uppercase tracking-tighter">
                    Refresh Index (Backfill)
                </button>
            </div>
        </aside>

        <!-- Main Chat Window -->
        <section class="flex-grow flex flex-col bg-slate-900/50">
            <!-- Chat Header -->
            <div class="px-8 py-4 border-b border-white/5 flex items-center justify-between glass">
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <svg class="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                    </div>
                    <div>
                        <h4 class="text-sm font-bold text-white">AI Assistant</h4>
                        <p class="text-[10px] text-slate-500" id="current-context">Context: All Knowledge</p>
                    </div>
                </div>
            </div>

            <!-- Messages Stream -->
            <div id="chat-stream" class="flex-grow overflow-y-auto p-8 space-y-6 scroll-smooth">
                <div class="flex justify-start">
                    <div class="max-w-[80%] glass rounded-3xl p-5 text-sm text-slate-300 rounded-bl-none border-blue-500/10">
                        Hello! I'm your knowledge assistant. Select a category on the left to focus my search, or ask me anything from your entire hub.
                    </div>
                </div>
            </div>

            <!-- Input Area -->
            <div class="p-8 border-t border-white/5">
                <div class="max-w-4xl mx-auto relative">
                    <textarea 
                        id="chat-input" 
                        rows="1" 
                        oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
                        class="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-16 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all resize-none overflow-hidden" 
                        placeholder="Ask your knowledge base..."></textarea>
                    <button 
                        onclick="sendMessage()" 
                        id="send-btn"
                        class="absolute right-3 bottom-3 p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7m0 0l-7 7m7-7H3"/></svg>
                    </button>
                </div>
                <p class="text-center text-[9px] text-slate-600 mt-3 uppercase tracking-widest font-bold">Powered by Deepseek + Cloudflare Vectorize</p>
            </div>
        </section>
    </div>

    <style>
        #chat-stream::-webkit-scrollbar { width: 4px; }
        .message-ai { border-left: 3px solid #6366f1; }
        .message-user { border-right: 3px solid #1e293b; text-align: right; }
        @keyframes messageIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-message { animation: messageIn 0.3s ease-out forwards; }
    </style>

    <script>
        let selectedCategory = null;

        function selectCategory(cat) {
            selectedCategory = cat;
            document.getElementById('current-context').innerText = "Context: " + (cat ? cat.toUpperCase() : 'All Knowledge');
            
            // UI Update
            document.querySelectorAll('.cat-btn').forEach(btn => {
                btn.classList.remove('text-indigo-400', 'bg-indigo-500/10', 'border-indigo-500/20');
                btn.classList.add('text-slate-400', 'border-transparent');
                btn.querySelector('span').classList.remove('bg-indigo-500');
                btn.querySelector('span').classList.add('bg-slate-700');
            });

            const activeBtn = document.querySelector('[data-cat="' + (cat || 'all') + '"]');
            activeBtn.classList.remove('text-slate-400', 'border-transparent');
            activeBtn.classList.add('text-indigo-400', 'bg-indigo-500/10', 'border-indigo-500/20');
            activeBtn.querySelector('span').classList.remove('bg-slate-700');
            activeBtn.querySelector('span').classList.add('bg-indigo-500');
        }

        async function sendMessage() {
            const input = document.getElementById('chat-input');
            const stream = document.getElementById('chat-stream');
            const btn = document.getElementById('send-btn');
            const text = input.value.trim();

            if (!text) return;

            // 1. Add User Message
            appendMessage('user', text);
            input.value = "";
            input.style.height = "";
            btn.disabled = true;

            // 2. Add AI Loading State
            const loaderId = appendMessage('ai', '<div class="flex space-x-1"><div class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div><div class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-100"></div><div class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-200"></div></div>');

            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text, category: selectedCategory })
                });

                const data = await res.json();
                const loader = document.getElementById(loaderId);
                if (data.ok) {
                    loader.innerHTML = data.answer.replace(/\\n/g, '<br/>');
                } else {
                    loader.innerHTML = '<span class="text-red-400">Error: ' + data.error + '</span>';
                }
            } catch (err) {
                console.error(err);
            } finally {
                btn.disabled = false;
                stream.scrollTop = stream.scrollHeight;
            }
        }

        function appendMessage(role, text) {
            const id = 'msg-' + Date.now();
            const stream = document.getElementById('chat-stream');
            const div = document.createElement('div');
            const alignClass = (role === 'user' ? 'justify-end' : 'justify-start');
            div.className = 'flex ' + alignClass + ' animate-message';
            
            const msgClass = (role === 'user' ? 'rounded-br-none border-white/5 bg-white/5 text-slate-300' : 'rounded-bl-none border-indigo-500/20 text-slate-100');
            div.innerHTML = '<div id="' + id + '" class="max-w-[85%] glass rounded-2xl p-4 text-sm ' + msgClass + '">' + text + '</div>';
            
            stream.appendChild(div);
            stream.scrollTop = stream.scrollHeight;
            return id;
        }

        // Handle Enter key
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        async function requestBackfill() {
            showModal({ title: "Re-vectorize Documents?", text: "This will refresh your search index to include category metadata for existing documents. It may take a minute." }, async (confirmed) => {
                if (confirmed) {
                    const btn = document.querySelector('[onclick="requestBackfill()"]');
                    const oldText = btn.innerText;
                    btn.innerText = "PROCESSING...";
                    btn.disabled = true;
                    try {
                        const res = await fetch('/api/knowledge/backfill', { method: 'POST' });
                        const data = await res.json();
                        showModal({ title: "Success", text: "Successfully updated " + data.count + " documents." }, () => window.location.reload());
                    } catch (e) {
                        showModal({ title: "Error", text: e.message }, () => {});
                    } finally {
                        btn.innerText = oldText;
                        btn.disabled = false;
                    }
                }
            });
        }
    </script>
    `;

    return c.html(getLayout('Chat', content));
});

// 2. Chat API Logic
chatRoute.post('/api/chat', async (c) => {
    try {
        const { message, category } = await c.req.json();
        const ai = new AIGateway(c.env);
        console.log(`[Chat] Incoming message for category: ${category || 'ALL'}`);

        let contextDocs: string[] = [];

        // ── ROUTING DECISION ────────────────────────────────────────────────
        // If the user specifies an exact date (any common format) AND references a
        // known document by name, use Direct Scan instead of semantic search.
        // Detect DD/MM/YYYY or YYYY-MM-DD in the message
        const ddmmyyyyMatch = message.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
        const yyyymmddMatch = message.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        let usedDirectScan = false;
        let targetDateNormalized: string | null = null; // always DD/MM/YYYY for file search

        if (ddmmyyyyMatch) {
            targetDateNormalized = ddmmyyyyMatch[0]; // already DD/MM/YYYY
        } else if (yyyymmddMatch) {
            // Convert YYYY-MM-DD → DD/MM/YYYY
            const [, y, m, d] = yyyymmddMatch;
            targetDateNormalized = `${d}/${m}/${y}`;
        }

        if (targetDateNormalized) {
            const { results: allDocs } = await c.env.DB.prepare('SELECT id, title, file_path FROM documents').all();
            const targetDoc = (allDocs as any[]).find(doc =>
                message.toLowerCase().includes(doc.title.toLowerCase())
            );

            if (targetDoc?.file_path) {
                console.log(`[Chat] ⚡ Direct Scan Mode: date="${targetDateNormalized}" in doc="${targetDoc.title}"`);
                usedDirectScan = true;

                const obj = await c.env.KNOWLEDGE_BASE.get(targetDoc.file_path);
                if (obj) {
                    const fullText = await obj.text();
                    const lines = fullText.split('\n');
                    const matchIdx = lines.findIndex(l => l.includes(targetDateNormalized!));
                    if (matchIdx !== -1) {
                        const start = Math.max(0, matchIdx - 3);
                        const end = Math.min(lines.length - 1, matchIdx + 4);
                        const snippet = lines.slice(start, end + 1).join('\n');
                        contextDocs.push(`=== DOCUMENT: ${targetDoc.title} [DIRECT MATCH FOR ${targetDateNormalized}] ===\n\n${snippet}`);
                        console.log(`[Chat] ✅ Found "${targetDateNormalized}": ${snippet.substring(0, 120).replace(/\n/g, ' ')}`);
                    } else {
                        contextDocs.push(`=== DOCUMENT: ${targetDoc.title} ===\n\n[NOTE: The date "${targetDateNormalized}" was not found in this document. It may be a non-trading day (e.g. public holiday).]`);
                        console.log(`[Chat] ℹ️ "${targetDateNormalized}" not found in "${targetDoc.title}" (non-trading day?)`);
                    }
                } else {
                    console.warn(`[Chat] ⚠️ Document file not found in R2 for: ${targetDoc.title}`);
                }
            }
        }

        // ── YEAR-BASED SCAN ─────────────────────────────────────────────────
        // For queries like "NAV performance in 2025" (year mentioned, no specific date),
        // scan the R2 document for all rows from that year.
        if (!usedDirectScan) {
            const yearOnlyMatch = message.match(/\b(20\d{2})\b/);
            if (yearOnlyMatch) {
                const { results: allDocs } = await c.env.DB.prepare('SELECT id, title, file_path FROM documents').all();
                const targetDoc = (allDocs as any[]).find(doc =>
                    message.toLowerCase().includes(doc.title.toLowerCase())
                );
                if (targetDoc?.file_path) {
                    const targetYear = yearOnlyMatch[1];
                    console.log(`[Chat] ⚡ Year Scan Mode: year="${targetYear}" in doc="${targetDoc.title}"`);
                    usedDirectScan = true;
                    const obj = await c.env.KNOWLEDGE_BASE.get(targetDoc.file_path);
                    if (obj) {
                        const fullText = await obj.text();
                        const lines = fullText.split('\n');
                        // Collect header lines + all data rows for the target year
                        const headerLines = lines.slice(0, 6).join('\n');
                        const yearLines = lines.filter(l => l.includes(`/${targetYear}`) || l.includes(`${targetYear}/`));
                        const yearSnippet = yearLines.join('\n');
                        console.log(`[Chat] ✅ Year Scan: found ${yearLines.length} rows for ${targetYear}, returning all ${yearLines.length}`);
                        contextDocs.push(`=== DOCUMENT: ${targetDoc.title} [YEAR SCAN FOR ${targetYear}] ===\n\n${headerLines}\n\n${yearSnippet}`);
                    }
                }
            }
        }

        // ── SEMANTIC SEARCH ─────────────────────────────────────────────────
        // Use vector search for all other queries (or as supplemental context).
        if (!usedDirectScan) {
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            let searchMessage = message;
            const isoDateMatches = message.match(/(\d{4})-(\d{2})-(\d{2})/g);
            if (isoDateMatches) {
                isoDateMatches.forEach((dStr: string) => {
                    const [y, m, d] = dStr.split('-');
                    const mIdx = parseInt(m) - 1;
                    searchMessage += ` ${d}/${m}/${y} ${months[mIdx]} ${y} ${months[mIdx].substring(0, 3)} ${y}`;
                });
                console.log(`[Chat] Augmented search query: ${searchMessage}`);
            }

            const embeds = await ai.generateEmbeddings([searchMessage]);
            const queryVector = embeds[0];

            const options: any = { topK: 20, returnMetadata: 'all' };
            if (category) {
                const cat = category.toLowerCase();
                if (cat !== 'all') {
                    options.filter = { category: { "$in": [cat, "inbox"] } };
                    console.log(`[Chat] Applying category filter: ${cat} OR inbox`);
                }
            }

            let results = await c.env.VECTOR_INDEX.query(queryVector, options);
            console.log(`[Chat] Initial search (${category || 'ALL'}) returned ${results.matches?.length || 0} matches.`);

            if ((!results.matches || results.matches.length === 0) && options.filter) {
                console.warn(`[Chat] ⚠️ 0 matches found in "${category}". Retrying search across ALL categories...`);
                delete options.filter;
                results = await c.env.VECTOR_INDEX.query(queryVector, options);
                console.log(`[Chat] Fallback search returned ${results.matches?.length || 0} matches.`);
            }

            // Temporal reranking
            const targetYearMatch = message.match(/\b(20\d{2})\b/);
            const targetYear = targetYearMatch ? targetYearMatch[0] : null;
            if (targetYear && results.matches) {
                results.matches.sort((a: any, b: any) => {
                    const aHas = a.metadata?.text?.includes(targetYear);
                    const bHas = b.metadata?.text?.includes(targetYear);
                    if (aHas && !bHas) return -1;
                    if (!aHas && bHas) return 1;
                    return b.score - a.score;
                });
            }

            console.log(`[Chat] Top 20 Retrieval Audit:`);
            results.matches?.forEach((m: any, i: number) => {
                const snip = (m?.metadata?.text || "").substring(0, 100).replace(/\n/g, ' ');
                console.log(`  #${i} [Score:${m.score.toFixed(3)}] ${m?.metadata?.title} (${m?.metadata?.category}) | Snippet: ${snip}...`);
            });

            const vectorDocs = results.matches?.map((m: any) => {
                const title = m?.metadata?.title || 'Unknown Document';
                const chunkText = m?.metadata?.text || '(Content missing)';
                return chunkText.includes('=== DOCUMENT:') ? chunkText : `=== DOCUMENT: ${title} ===\n${chunkText}`;
            }) || [];

            contextDocs.push(...vectorDocs);
        }

        // ── ASK AI ───────────────────────────────────────────────────────────
		const answer = await ai.answerQuestion(message, contextDocs);
		return c.json({ ok: true, answer });

	} catch (e: any) {
		console.error("Chat API Error:", e);
		return c.json({ ok: false, error: e.message }, 500);
	}
});

// 3. Backfill API
chatRoute.post('/api/knowledge/backfill', async (c) => {
	try {
		const knowledgeService = new KnowledgeService(c.env);
		const count = await knowledgeService.backfillDocuments();
		return c.json({ ok: true, count });
	} catch (e: any) {
		return c.json({ ok: false, error: e.message }, 500);
	}
});

export default chatRoute;
