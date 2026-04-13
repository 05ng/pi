import { vi } from 'vitest';

export const createMockEnv = () => ({
	DEFAULT_AI: 'cloudflare',
	TELEGRAM_BOT_TOKEN: 'mock_bot_token',
	WEBHOOK_SECRET: 'mock_webhook_secret',
	ALLOWED_USER_ID: '123456789',
	MFA_SECRET: 'MOCKSECRET',
	JWT_SECRET: 'mock_jwt_secret',
	TAVILY_API_KEY: 'mock_tavily_key',
	KNOWLEDGE_BASE: {
		get: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
	DB: {
		prepare: vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnThis(),
			first: vi.fn(),
			all: vi.fn().mockResolvedValue({ results: [] }),
			run: vi.fn().mockResolvedValue({ success: true }),
		})
	},
	VECTOR_INDEX: {
		insert: vi.fn(),
		query: vi.fn().mockResolvedValue({ matches: [] }),
		deleteByIds: vi.fn(),
	},
	RESEARCH_WORKFLOW: {
		create: vi.fn(),
	},
	AI: {
		run: vi.fn(),
	}
});
