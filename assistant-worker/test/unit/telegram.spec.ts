import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramBot } from '../../src/telegram';

// Mock global fetch
global.fetch = vi.fn();

describe('TelegramBot API Wrapper', () => {
	let bot: TelegramBot;

	beforeEach(() => {
		bot = new TelegramBot('fake_token');
		vi.resetAllMocks();
	});

	it('should compute getFileUrl properly', async () => {
		// Mock getFile response
		(global.fetch as any).mockResolvedValueOnce({
			json: async () => ({ ok: true, result: { file_path: 'photos/img.jpg' } })
		});

		const url = await bot.getFileUrl('fake_file_id');
		expect(url).toBe('https://api.telegram.org/file/botfake_token/photos/img.jpg');
		expect(global.fetch).toHaveBeenCalledWith('https://api.telegram.org/botfake_token/getFile?file_id=fake_file_id');
	});

	it('should format sendMessage payload as Markdown', async () => {
		(global.fetch as any).mockResolvedValueOnce({ ok: true });
		await bot.sendMessage(12345, '**Hello**');

		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.telegram.org/botfake_token/sendMessage',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					chat_id: 12345,
					text: '**Hello**',
					parse_mode: 'Markdown',
					disable_web_page_preview: true
				})
			})
		);
	});
});
