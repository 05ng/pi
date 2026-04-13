# ✨ Knowledge Assistant

<div align="center">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
  <img src="https://img.shields.io/badge/Hono-000000?style=for-the-badge&logo=hono&logoColor=white" />
  <img src="https://img.shields.io/badge/Vector-Index-50C878?style=for-the-badge&logo=vector-index&logoColor=white" />
  <img src="https://img.shields.io/badge/D1-Database-34D399?style=for-the-badge&logo=sqlite&logoColor=white" />
  <br>
  <strong>A high-performance, serverless personal intelligence engine built on the Cloudflare stack.</strong>
</div>

---

## 🚀 Overview

Knowledge Assistant is an advanced serverless RAG (Retrieval-Augmented Generation) engine designed for personal or team intelligence management. It bypasses the common limitations of purely semantic search by employing a **Smart Hybrid Retrieval** strategy, ensuring 100% precision for critical facts while maintaining deep semantic discovery.

## 🛠️ Tech Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/) (Hono)
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (Serverless SQL)
- **Object Storage:** [Cloudflare R2](https://developers.cloudflare.com/r2/) (For raw document persistence)
- **Vector Search:** [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/) (Neural search index)
- **Background Jobs:** [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) (Durable indexing pipeline)
- **AI Models:** `@cf/baai/bge-base-en-v1.5` (Embeddings) & Google Gemini/DeepSeek (LLM)

## ✨ Key Features

### 🧠 Smart Hybrid Retrieval
The routing engine automatically chooses the most accurate retrieval method based on your query:
- **Direct Date Scan**: 100% accurate lookups for specific dates (e.g., "NAV on 01/01/2025") via raw R2 text scanning.
- **Year Range Scan**: Complete extraction of all records within a specific year for performance analysis.
- **Semantic Search**: Deep discovery for open-ended questions using neural vector reranking.

### ⚡ Durable Indexing Pipeline
Upload or edit documents in a beautiful dark-mode Knowledge Hub. The system handles indexing in the background using **Cloudflare Workflows**, ensuring that even massive documents are vectorized reliably without blocking the UI.

### 🧹 Proactive Vector Housekeeping
Maintains high search relevance with built-in maintenance tools:
- **Orphan Detection**: Scans and purges vectors from historically deleted documents.
- **Tombstone Tracking**: Ensures clean cleanup for every document delete action.
- **Maintenance UI**: One-click nuclear reset and re-indexing capability.

### 🔐 Enterprise-Grade Security
- **MFA Required**: Secure dashboard login with TOTP (Google Authenticator) support.
- **Secret Management**: Built-in protection against credential leaks in source code.
- **Access Control**: Hardened middleware ensuring only your `ALLOWED_USER_ID` can access the intelligence hub.

## 💰 Cost Efficiency

Designed for developers who value performance without the overhead.

- **Infrastructure ($0)**: Runs entirely on **Cloudflare's Free Tier** (Workers, D1, R2, Vectorize, and Workflows). No monthly substrate fees.
- **Intelligence (Cent-scale)**: Uses the **DeepSeek API**—one of the world's most cost-effective LLMs—providing high-reasoning capabilities at a fraction of the cost of other providers.
- **Smart Retrieval**: Reduces LLM token usage by employing a highly precise hybrid retrieval engine that only sends the most relevant data to the model.

## 📦 Getting Started

### Prerequisites
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-upgrading/) installed and authenticated.
- A Cloudflare account with D1, R2, and Vectorize enabled.

### Installation

1. **Clone & Install**
   ```bash
   git clone https://github.com/05ng/pi.git
   cd assistant-worker
   npm install
   ```

2. **Configure Local Environment**
   Open the `assistant-worker` directory and create your local secrets file:
   ```bash
   cp .dev.vars.example .dev.vars
   ```
   Open `.dev.vars` and fill in your actual API keys and secrets.

3. **Initialize Resources**
   ```bash
   npx wrangler d1 create mywiki-metadata-db
   npx wrangler r2 bucket create mywiki-kb
   npx wrangler vectorize create mywiki-vectors --dimensions=768 --metric=cosine
   ```

3. **Configure Secrets**
   Set up your production environment variables:
   ```bash
   npx wrangler secret put DEEPSEEK_API_KEY
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put MFA_SECRET
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put ALLOWED_USER_ID
   ```

4. **Deploy**
   ```bash
   npm run deploy
   ```

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request or open an issue for any bugs or feature requests.

---
<div align="center">
  Built with ❤️ by the Intelligence Team
</div>
