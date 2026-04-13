export class TelegramBot {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	async getFile(fileId: string): Promise<any> {
		const url = `https://api.telegram.org/bot${this.token}/getFile?file_id=${fileId}`;
		const res = await fetch(url);
		const data = await res.json() as any;
		if (!data.ok) throw new Error(`Telegram error: ${data.description}`);
		return data.result;
	}

	async getFileBuffer(filePath: string): Promise<ArrayBuffer> {
		const url = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
		const res = await fetch(url);
		return res.arrayBuffer();
	}

	async getFileUrl(fileId: string): Promise<string> {
		const data = await this.getFile(fileId);
		return `https://api.telegram.org/file/bot${this.token}/${data.file_path}`;
	}

	async sendChatAction(chatId: number, action: string) {
		const url = `https://api.telegram.org/bot${this.token}/sendChatAction`;
		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: chatId, action: action })
		});
	}

	async sendMessage(chatId: number, text: string, disableWebPagePreview = true) {
		const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
		const body = {
			chat_id: chatId,
			text: text,
			parse_mode: 'Markdown',
			disable_web_page_preview: disableWebPagePreview
		};

		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	}
}
