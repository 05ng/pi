export interface Env {
	// Bindings
	KNOWLEDGE_BASE: any; // R2Bucket
	DB: any; // D1Database
	VECTOR_INDEX: any; // VectorizeIndex
	RESEARCH_WORKFLOW: any; // Workflow configuration
	AI: any; // Cloudflare AI binding
	
	// Vars
	DEFAULT_AI: string;
	DEEPSEEK_API_KEY?: string;
	TELEGRAM_BOT_TOKEN: string;
	WEBHOOK_SECRET: string;
	ALLOWED_USER_ID: string;
	MFA_SECRET: string;
	JWT_SECRET: string;
	TAVILY_API_KEY?: string;
}
