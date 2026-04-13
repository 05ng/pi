import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { createMockEnv } from '../setup';

describe("Home Route (Integration)", () => {
	it("responds with webhook running message", async () => {
		const env = createMockEnv();
		const request = new Request("http://localhost/");
		
		// Bypass execution context wrapper
		const response = await app.fetch(request, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
		
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Personal Knowledge Assistant Webhook is running!");
	});
});
