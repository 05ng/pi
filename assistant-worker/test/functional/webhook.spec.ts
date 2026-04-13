import { describe, it, expect, vi } from "vitest";
import app from "../../src/index";
import { createMockEnv } from '../setup';

describe("Webhook Route (Integration)", () => {
	it("rejects traffic without correct webhook secret token", async () => {
		const env = createMockEnv();
		const req = new Request("http://localhost/webhook", {
			method: 'POST',
			body: JSON.stringify({ message: { text: 'hello' } })
		});
		
		const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
		
		expect(res.status).toBe(401);
		expect(await res.text()).toBe('Unauthorized Webhook Source');
	});

	it("drops message from unauthorized user ID gracefully", async () => {
		const env = createMockEnv();
		const req = new Request("http://localhost/webhook", {
			method: 'POST',
			headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET },
			body: JSON.stringify({ 
				message: { chat: { id: 1 }, from: { id: 9999999 }, text: '/ask Something' } 
			})
		});
		
		const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
		
		// Should return 200 OK so telegram doesn't retry, but doing nothing
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it("queues async handler correctly for /ask command with authorized user", async () => {
		const env = createMockEnv();
		const req = new Request("http://localhost/webhook", {
			method: 'POST',
			headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET },
			body: JSON.stringify({ 
				message: { 
					chat: { id: 100 }, 
					from: { id: parseInt(env.ALLOWED_USER_ID) }, 
					text: '/ask What is vitest?' 
				} 
			})
		});
		
		let waitPromise: Promise<any> | undefined;
		const ctx = {
			waitUntil: (p: Promise<any>) => { waitPromise = p; },
			passThroughOnException: () => {}
		};

		const res = await app.fetch(req, env as any, ctx as any);
		
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(waitPromise).toBeDefined(); // Ensures the handleAsk task was sent to background worker task queue
	});
});
