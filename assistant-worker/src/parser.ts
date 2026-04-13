import * as cheerio from 'cheerio';
// @ts-ignore
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { extractText, getDocumentProxy } from 'unpdf';
import { Buffer } from 'node:buffer';

/**
 * Cleanly extracts text payload into Markdown from a given URL
 */
export async function parseWebLink(url: string): Promise<{ title: string; markdown: string }> {
	const res = await fetch(url, { headers: { 'User-Agent': 'KnowledgeBot/1.0' } });
	const html = await res.text();
	const $ = cheerio.load(html);

	// Strip out typical noise wrappers
	$('script, style, nav, footer, iframe, noscript, svg, header').remove();

	const title = $('title').text() || 'Web Content';
	
	// Format structural elements for loose markdown spacing
	$('p, div, br').append('\n');
	$('h1, h2, h3, h4, h5, h6').prepend('\n# ').append('\n');
	$('li').prepend('\n- ');
	
	// Attempt to extract the core article text
	let mainContent = $('article').text() || $('main').text() || $('body').text() || '';

	return { title, markdown: mainContent.trim() };
}

/**
 * Extracts text from a PDF Buffer using Worker-compatible unpdf
 */
export async function parsePdf(buffer: ArrayBuffer): Promise<string> {
	const sizeKB = Math.round(buffer.byteLength / 1024);
	console.log(`[Parser] Starting PDF parse. Size: ${sizeKB}KB`);
	try {
		const start = Date.now();
		let { text } = await extractText(new Uint8Array(buffer));
		const duration = Date.now() - start;
		
		// Handle cases where 'text' might be an array of strings (pages)
		if (Array.isArray(text)) {
			text = text.join('\n');
		}

		console.log(`[Parser] PDF parse complete in ${duration}ms. Extracted ${text?.length || 0} chars.`);
		return (text || "").trim() || "*(No text extracted from PDF. This might be a scan. Consider AI Vision OCR fallback)*";
	} catch (e: any) {
		console.error("[Parser] PDF Parsing CRITICAL error:", e.message, e.stack);
		return `❌ PDF Parsing failed: ${e.message}`;
	}
}

/**
 * Extracts text from an Office DOCX file
 */
export async function parseWordDoc(buffer: ArrayBuffer): Promise<string> {
	const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
	return result.value || "*(Word document was empty)*";
}

/**
 * Extracts text and tables from an XLSX file, converting each sheet to a Markdown table
 */
export async function parseExcel(buffer: ArrayBuffer): Promise<string> {
	try {
		const workbook = XLSX.read(buffer, { type: 'array' });
		let markdown = '';

		for (const sheetName of workbook.SheetNames) {
			const sheet = workbook.Sheets[sheetName];
			const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

			if (rows.length === 0) continue;

			markdown += `### Sheet: ${sheetName}\n\n`;
			
			// Create MD table
			const headers = rows[0].map(h => String(h || '').trim());
			markdown += `| ${headers.join(' | ')} |\n`;
			markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

			for (let i = 1; i < rows.length; i++) {
				const row = rows[i].map(v => String(v || '').trim());
				markdown += `| ${row.join(' | ')} |\n`;
			}
			markdown += '\n\n';
		}

		return markdown.trim() || "*(Excel workbook was empty)*";
	} catch (e: any) {
		console.error("Excel Parsing error:", e);
		return `❌ Excel Parsing failed: ${e.message}`;
	}
}

import { Buffer } from 'node:buffer';

/**
 * Placeholder for Image to Text AI Parsing (uses Workers AI)
 */
export async function parseImageLocal(env: any, uint8Array: Uint8Array): Promise<string> {
	// Base64 encode the binary to avert maximum call stack spread exceptions
	const b64 = Buffer.from(uint8Array).toString('base64');
	const uri = `data:image/jpeg;base64,${b64}`;

	const payload = {
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: "Describe this image in detailed markdown. Extract all legible text." },
					{ type: "image_url", image_url: { url: uri } }
				]
			}
		]
	};

	try {
		const res = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', payload);
		return res?.response || "";
	} catch (e: any) {
		// Cloudflare Workers AI frequently requires a physical TOS agreement prior to first use of new Meta deployments
		if (e.message && e.message.toLowerCase().includes('agree')) {
			console.log('Sending mandatory Meta License agreement signal over Cloudflare...');
			await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: 'agree' });
			const retryRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', payload);
			return retryRes?.response || "";
		}
		throw e;
	}
}
