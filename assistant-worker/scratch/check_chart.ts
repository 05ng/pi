import { Env } from '../src/types';

export default {
	async fetch(request: Request, env: Env) {
		const docId = "5595428f-0764-4787-9a86-f616b38e4a7b";
		const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<any>();
		if (!doc) return new Response("Doc not found in DB");

		const obj = await env.KNOWLEDGE_BASE.get(doc.file_path);
		if (!obj) return new Response("Markdown not found in R2 at " + doc.file_path);

		const text = await obj.text();
		const has2025 = text.includes('2025');
		const lines = text.split('\n').length;

		return new Response(JSON.stringify({
			title: doc.title,
			path: doc.file_path,
			length: text.length,
			lines,
			has2025,
			sample: text.substring(0, 500),
      lastLines: text.substring(text.length - 1000)
		}, null, 2));
	}
}
