import { Hono } from 'hono';
import { Env } from '../types';
import { getLayout } from './layout';
import { UsageService } from '../services/usage';

const dashboardRoute = new Hono<{ Bindings: Env }>();

dashboardRoute.get('/dashboard', async (c) => {
	try {
		// 1. Fetch metadata counts from D1
		const { results: docCounts } = await c.env.DB.prepare('SELECT category, count(*) as count FROM documents GROUP BY category').all() as any;
		const totalDocs = docCounts.reduce((acc: number, cur: any) => acc + cur.count, 0);

		// 2. Fetch AI Balance (External Deepseek/Gemini)
		let balanceStatus = "No data";
		if (c.env.DEFAULT_AI === 'deepseek' && c.env.DEEPSEEK_API_KEY) {
			try {
				const balRes = await fetch('https://api.deepseek.com/user/balance', {
					headers: { 'Authorization': `Bearer ${c.env.DEEPSEEK_API_KEY}`, 'Accept': 'application/json' }
				});
				if (balRes.ok) {
					const balData: any = await balRes.json();
					if (balData.is_available && balData.balance_infos) {
						const cny = balData.balance_infos.find((b: any) => b.currency === 'CNY');
						const usd = balData.balance_infos.find((b: any) => b.currency === 'USD');
						balanceStatus = cny ? `¥${cny.total_balance}` : (usd ? `$${usd.total_balance}` : "0.00");
					}
				}
			} catch (e) { console.error(e); }
		}

        // 4. Fetch Cloudflare Usage Estimates
        const usageService = new UsageService(c.env);
        const usage = await usageService.getUsageSummary();

		const content = `
        <div class="max-w-7xl mx-auto p-8 space-y-12 animate-fade-up">
            <!-- Header Stats -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="glass rounded-3xl p-8 flex flex-col justify-between h-48">
                    <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Knowledge Base</p>
                    <div class="mt-2">
                        <h2 class="text-5xl font-bold text-white">${totalDocs}</h2>
                        <p class="text-sm text-slate-400 mt-1">Total Indexed Documents</p>
                    </div>
                </div>
                <div class="glass rounded-3xl p-8 flex flex-col justify-between h-48 border-blue-500/20 shadow-lg shadow-blue-500/5">
                    <p class="text-[10px] font-bold text-blue-400 uppercase tracking-widest">External AI Balance</p>
                    <div class="mt-2">
                        <h2 class="text-5xl font-bold text-white">${balanceStatus}</h2>
                        <p class="text-sm text-slate-400 mt-1">${c.env.DEFAULT_AI === 'deepseek' ? 'Deepseek Cloud' : 'Google Gemini API'}</p>
                    </div>
                </div>                 <div class="glass rounded-3xl p-8 flex flex-col justify-between h-48 border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                    <p class="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Verified Charges (MTD)</p>
                    <div class="mt-2">
                        <h2 class="text-5xl font-bold text-white">\$$${usage.totalProjectedCost}</h2>
                        <p class="text-sm text-slate-400 mt-1">R2 &amp; D1 · Live API</p>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- Data Insight Panel -->
                <div class="lg:col-span-2 glass rounded-3xl p-10 flex flex-col justify-center items-center text-center space-y-6">
                    <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                        <svg class="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <div>
                        <h3 class="text-2xl font-bold text-white">Knowledge Hub Active</h3>
                        <p class="text-slate-400 max-w-md mx-auto mt-2">Your serverless brain is operational. Documents are being indexed into filtered categories for high-precision retrieval.</p>
                    </div>
                    <div class="flex space-x-4 pt-4">
                        <div class="px-6 py-3 rounded-2xl bg-white/5 border border-white/5">
                            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">System Health</p>
                            <p class="text-sm font-bold text-emerald-400">Optimal</p>
                        </div>
                        <div class="px-6 py-3 rounded-2xl bg-white/5 border border-white/5">
                            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Sync Mode</p>
                            <p class="text-sm font-bold text-blue-400">Reactive</p>
                        </div>
                    </div>
                </div>

                <!-- Usage Details -->
                <div class="glass rounded-3xl p-8 space-y-8 self-start">
                    <h3 class="text-lg font-bold text-white flex items-center justify-between">
                        Cloudflare Usage
                        <span class="text-[10px] font-normal text-emerald-500 uppercase">Live · API</span>
                    </h3>
                    
                    <div class="space-y-6">
                        ${usage.services.map(s => `
                            <div class="space-y-2">
                                <div class="flex justify-between text-xs">
                                    <span class="text-slate-400 font-medium">${s.name}</span>
                                    <span class="text-white font-bold">\$$${s.cost}</span>
                                </div>
                                <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div class="h-full bg-indigo-500 rounded-full" style="width: ${s.percent || 0}%"></div>
                                </div>
                                <div class="flex justify-between text-[10px]">
                                    <span class="text-slate-500">${s.note || s.usage}</span>
                                    <span class="text-slate-600">${s.limit || ''}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="mt-6 pt-6 border-t border-white/5 space-y-3">
                        <a href="https://dash.cloudflare.com/?to=/:account/ai/workers-ai" target="_blank" 
                           class="flex items-center justify-between text-xs text-indigo-400 hover:text-indigo-300 transition-colors group">
                            <span>⚡ View Workers AI Neuron Usage</span>
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        </a>
                        <p class="text-[10px] text-slate-600 leading-relaxed">
                            R2 &amp; D1 pulled live from Cloudflare GraphQL. Fetched: ${usage.fetchedAt}
                        </p>
                    </div>

                    <button onclick="requestBackfill()" class="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold transition-all uppercase tracking-widest border border-white/5">
                        <span>Refresh Search Index</span>
                    </button>
                </div>
            </div>
            
            <div class="flex justify-center">
                <a href="/knowledge" class="flex items-center space-x-2 text-indigo-400 hover:text-indigo-300 text-sm font-bold transition-all group">
                    <span>Explore Knowledge Assets</span>
                    <svg class="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </a>
            </div>
        </div>

        <script>
            async function requestBackfill() {
                showModal({ title: "Re-vectorize Documents?", text: "This will refresh your search index to include category metadata for existing documents." }, async (confirmed) => {
                    if (confirmed) {
                        try {
                            const res = await fetch('/api/knowledge/backfill', { method: 'POST' });
                            const data = await res.json();
                            showModal({ title: "Success", text: "Successfully updated " + data.count + " documents." }, () => window.location.reload());
                        } catch (e) {
                            showModal({ title: "Error", text: e.message }, () => {});
                        }
                    }
                });
            }
        </script>
        `;

		return c.html(getLayout('Dashboard', content));

	} catch (e) {
		console.error("Dashboard error", e);
		return c.text("Error loading dashboard", 500);
	}
});

export default dashboardRoute;
