import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../../src/orchestrator';
import { createMockEnv } from '../setup';
import { TelegramBot } from '../../src/telegram';

vi.mock('../../src/telegram', () => {
	return {
		TelegramBot: vi.fn().mockImplementation(() => ({
			sendMessage: vi.fn(),
			sendChatAction: vi.fn(),
			getFileUrl: vi.fn(),
		}))
	};
});

describe('Orchestrator Unit Tests', () => {
	let env: any;
	let orchestrator: Orchestrator;

	beforeEach(() => {
		env = createMockEnv();
		orchestrator = new Orchestrator(env);
		vi.clearAllMocks();
	});

	it('handleAsk should query vector index and send answer', async () => {
		env.VECTOR_INDEX.query.mockResolvedValueOnce({
			matches: [{ metadata: { title: 'Doc 1', filePath: 'kb/doc1.md' } }]
		});
		
		env.AI.run.mockResolvedValueOnce({ data: [[0.5]] }); // Vector embeddings mock
		env.AI.run.mockResolvedValueOnce({ response: 'Mocked Answer' }); // Answer generation mock

		await orchestrator.handleAsk(100, 'What is doc 1?', 'http://base');

		expect(env.VECTOR_INDEX.query).toHaveBeenCalled();
		expect(env.KNOWLEDGE_BASE.put).toHaveBeenCalledWith(
			expect.stringContaining('answers/'),
			expect.stringContaining('Mocked Answer') // HTML wrapper check
		);
	});

	it('handleIngestion should store document, vectorize, and insert metadata to D1', async () => {
		env.AI.run.mockResolvedValueOnce({ response: '{"category":"test","title":"Test Title"}' }); // AI classify
		env.AI.run.mockResolvedValueOnce({ data: [[0.1, 0.2]] }); // AI embeddings

		await orchestrator.handleIngestion(100, 'Some new document content');

		expect(env.KNOWLEDGE_BASE.put).toHaveBeenCalledWith(
			expect.stringMatching('kb/test/'),
			'Some new document content',
			expect.any(Object)
		);
		
		expect(env.VECTOR_INDEX.insert).toHaveBeenCalled();
		expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO documents'));
	});

    it('handleTopicResearch should create workflow and execute tavily fetch', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ results: [{ url: 'http://test1.com', content: 'test content' }] })
        });

        // AI topic mock
        env.AI.run.mockResolvedValueOnce({ response: 'research' });

        await orchestrator.handleTopicResearch(100, 'Latest tech news');

        expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO locks'));
        expect(global.fetch).toHaveBeenCalledWith('https://api.tavily.com/search', expect.any(Object));
        
        expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO research_history'));
        expect(env.RESEARCH_WORKFLOW.create).toHaveBeenCalled();
    });
});
