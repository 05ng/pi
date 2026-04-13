import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Env } from './types';
import { parseExcel, parsePdf, parseWordDoc, parseImageLocal } from './parser';
import { KnowledgeService } from './services/knowledge';
import { TelegramBot } from './telegram';

export class IngestionWorkflow extends WorkflowEntrypoint<Env, { 
    fileKey: string, 
    fileName: string, 
    category: string, 
    chatId?: number, 
    docId: string,
    mode?: 'NEW' | 'REINDEX'
}> {
    async run(event: WorkflowEvent<{ 
        fileKey: string, 
        fileName: string, 
        category: string, 
        chatId?: number, 
        docId: string,
        mode?: 'NEW' | 'REINDEX'
    }>, step: WorkflowStep) {
        let { fileKey, fileName, category, chatId, docId, mode } = event.payload;
        
        // Smart Mode Detection for Legacy/Ghost tasks
        if (!mode) {
            if (fileKey && fileKey.startsWith('kb/')) {
                mode = 'REINDEX';
                console.log(`[Workflow] 🔄 Auto-detected REINDEX mode (ID: ${docId})`);
            } else {
                mode = 'NEW';
                console.log(`[Workflow] 🆕 Defaulting to NEW mode (ID: ${docId})`);
            }
        }

        const bot = new TelegramBot(this.env.TELEGRAM_BOT_TOKEN);
        const knowledgeService = new KnowledgeService(this.env);

        try {
            console.log(`[Workflow] Active Mode: ${mode}, File: ${fileName}, ID: ${docId}`);

            // 0. Mark as Ingesting
            await step.do('mark-ingesting', async () => {
                await this.env.DB.prepare('UPDATE documents SET status = ?1 WHERE id = ?2')
                    .bind('INGESTING', docId).run();
            });

            let markdown = "";

            if (mode === 'REINDEX') {
                // REINDEX MODE: Fetch existing markdown from R2
                markdown = await step.do('fetch-existing-markdown', async () => {
                    const doc = await this.env.DB.prepare('SELECT file_path FROM documents WHERE id = ?').bind(docId).first<{file_path: string}>();
                    if (!doc?.file_path) throw new Error("Document file_path not found for re-indexing.");
                    
                    const obj = await this.env.KNOWLEDGE_BASE.get(doc.file_path);
                    if (!obj) throw new Error(`Markdown file not found in R2 at ${doc.file_path}`);
                    
                    return await obj.text();
                });
            } else {
                // NEW MODE: Download binary and parse
                const binary = await step.do('download-binary', async () => {
                    console.log(`[Workflow] Downloading ${fileKey} from R2...`);
                    const obj = await this.env.KNOWLEDGE_BASE.get(fileKey);
                    if (!obj) throw new Error(`Object ${fileKey} not found in R2`);
                    const buf = await obj.arrayBuffer();
                    console.log(`[Workflow] Download complete. Size: ${buf.byteLength} bytes.`);
                    return buf;
                });

                markdown = await step.do('parse-content', { 
                    retries: { limit: 1, delay: 1000 } 
                }, async () => {
                    const ext = fileName.split('.').pop()?.toLowerCase();
                    console.log(`[Workflow] Parsing content. Format: ${ext}, docId: ${docId}`);
                    let text = "";
                    
                    if (ext === 'docx') text = await parseWordDoc(binary);
                    else if (ext === 'xlsx' || ext === 'xls') text = await parseExcel(binary);
                    else if (ext === 'pdf') {
                        console.log("[Workflow] Entering PDF parser step...");
                        text = await parsePdf(binary);
                    }
                    else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
                        console.log("[Workflow] Entering Vision OCR step...");
                        text = await parseImageLocal(this.env, new Uint8Array(binary));
                    }
                    
                    if (!text || text.trim().length < 5) {
                        console.warn("[Workflow] Parser returned suspiciously thin content.");
                        throw new Error("Extracted text was too short or empty. Conversion aborted to prevent data loss.");
                    }
                    console.log(`[Workflow] Parsing successful. Snippet: ${text.substring(0, 100)}...`);
                    return text;
                });
            }

            // 3. Ingest into Knowledge Hub
            await step.do('ingest-markdown', async () => {
                console.log(`[Workflow] Ingesting markdown to knowledge service. docId: ${docId}`);
                const title = fileName.replace(/\.[^/.]+$/, ""); // strip extension
                await knowledgeService.ingestDocument(title, category, markdown, docId);
                
                // Cleanup temp binary only for NEW uploads
                if (mode === 'NEW') {
                    console.log(`[Workflow] Deleting temporary R2 file: ${fileKey}`);
                    await this.env.KNOWLEDGE_BASE.delete(fileKey);
                }
            });

            // 5. Notify Telegram
            if (chatId) {
                await step.do('notify-user', async () => {
                    await bot.sendMessage(
                        chatId, 
                        `✅ **Background Processing Complete**\n\n**File:** ${fileName}\n**Category:** ${category}\n\n*Document has been converted to Markdown and is now searchable.*`
                    );
                });
            }
        } catch (e: any) {
            console.error("Workflow Failure:", e);
            await step.do('mark-failed', async () => {
                await this.env.DB.prepare('UPDATE documents SET status = ?1 WHERE id = ?2')
                    .bind('FAILED', docId).run();
            });
            
            if (chatId) {
                await bot.sendMessage(chatId, `❌ **Process Failed:** ${fileName}\n\nError: ${e.message}\n\nYou can try again from the Knowledge Hub.`);
            }
            throw e;
        }
    }
}
