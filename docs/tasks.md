# Project Tasks Tracking: Personal Knowledge Assistant

## ✅ Completed Tasks

### Core Architecture
- `[x]` **Worker Initialization:** Scaffolded Cloudflare Worker project using TypeScript and the Hono web framework.
- `[x]` **Storage Bindings:** Bound Cloudflare R2 (knowledge base files), D1 (SQL metadata), and Vectorize (RAG embeddings) securely in `wrangler.jsonc`.
- `[x]` **Database Schema:** Created `schema.sql` to initialize the document tracking table in D1.

### Markdown Parsing Engine (TypeScript alternatives)
- `[x]` **Web Links:** Implemented HTML DOM extraction using `cheerio` and converted to clean markdown using `turndown`.
- `[x]` **Office Files:** Integrated `mammoth.js` for `.docx` extraction.
- `[x]` **PDFs:** Integrated `pdf-parse` for pure JS text buffer extraction.
- `[x]` **Images:** Added Cloudflare Workers AI Vision model placeholders.

### AI & Orchestration
- `[x]` **Gemini Orchestration:** Bootstrapped API keys for `GoogleGenerativeAI` targeting `gemini-1.5-pro` and `flash`.
- `[x]` **Categorization Engine:** Built prompts forcing the LLM to return `category`, `summary`, and `title` keys as JSON.
- `[x]` **Vector Generation:** Leveraged Cloudflare's `@cf/baai/bge-base-en-v1.5` text-embedding model for splitting documents.
- `[x]` **RAG Engine:** Constructed the `/ask` pipeline to extract Vectorize correlations and feed context directly to Gemini.

### Webhook & Interfaces
- `[x]` **Telegram Abstraction:** Added fetching pipelines logic for downloading photos/files directly via Telegram Bot API using the raw bot token.
- `[x]` **File Dashboard:** Created the `/dashboard` endpoint equipped with a heavily styled, responsive, glassmorphism Tailwind UI.
- `[x]` **Markdown Viewer:** Engineered the `/download/:id` endpoint for delivering backend `.md` blobs directly to the UI.

### Security
- `[x]` **Webhook Secret Hash:** Implemented checking `X-Telegram-Bot-Api-Secret-Token` header.
- `[x]` **Sender Whitelisting:** Implemented hardcoded check against `ALLOWED_USER_ID` preventing database poisoning by random Telegram accounts.
- `[x]` **UI Auth:** Gated the Markdown downloads and dashboard queries securely behind `DASHBOARD_TOKEN`.

---

## 🚀 To Be Implemented / Upcoming Operations

### 1. Cloudflare Account Provisioning (User Action)
- `[ ]` Provision the R2 `mywiki-kb` bucket on the dashboard or via CLI.
- `[ ]` Provision the Vectorize `mywiki-vectors` index.
- `[ ]` Generate the D1 Database and inject `schema.sql`.

### 2. Environment Variables Integration (User Action)
- `[ ]` Configure `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, `ALLOWED_USER_ID`, and `DASHBOARD_TOKEN` tightly into `wrangler.jsonc`.

### 3. Final Deployment & Webhook binding (User Action)
- `[ ]` Execute `npm run deploy` to publish the worker online to `.workers.dev`.
- `[ ]` Complete the Telegram HTTP GET request to `setWebhook`, permanently syncing the Telegram application against Cloudflare.

### 4. Future Enhancements (Post-V1)
- `[ ]` **Recursive Chunking:** Improve the naive 500-character chunking algorithm to semantic sentence-aware splitting (e.g. LangChain text splitter approach) when documents become extremely large.
- `[ ]` **Session Memory:** Modify D1 schema to keep track of a "chat history" so the `/ask` command can have subsequent conversational follow-up questions.
- `[ ]` **Dashboard Pagination:** The current dashboard pulls `SELECT *`. When the database exceeds thousands of items, we'll implement standard cursor-based pagination.
