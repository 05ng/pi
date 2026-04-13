import { describe, it, expect, vi } from "vitest";
import app from "../../src/index";
import { createMockEnv } from '../setup';
import { sign } from 'hono/jwt';

describe("Dashboard Route (Integration)", () => {
	it("rejects unauthorized access and redirects to login", async () => {
		const env = createMockEnv();
		const req = new Request("http://localhost/dashboard");
		const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
		
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/login");
	});

	it("renders dashboard using DB data when authorized", async () => {
		const env = createMockEnv();
		
		// Mock database results
		const mockDocs = [{
			id: 'doc1', title: 'A doc', category: 'Testing', file_path: 'kb/testing/doc1.md', created_at: Date.now()
		}];
		const mockHistory = [{
			query: 'test query', status: 'RUNNING', success_count: 5, fail_count: 0, total_count: 10, created_at: Date.now()
		}];
		
		env.DB.prepare.mockImplementation((str: string) => ({
			all: vi.fn().mockResolvedValue(
				str.includes('research_history') ? { results: mockHistory } : { results: mockDocs }
			)
		}));

		// Generate valid jwt
		const token = await sign({ user: 'admin', exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) }, env.JWT_SECRET, 'HS256');

		const req = new Request("http://localhost/dashboard", {
			headers: { 'Cookie': `auth_session=${token}` }
		});
		
		const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
		
		expect(res.status).toBe(200);
		const html = await res.text();
		
		// Verify rendered documents
		expect(html).toContain("A doc");
		expect(html).toContain("1 Documents Indexed");
		
		// Verify active workflow rendered
		expect(html).toContain("test query");
		expect(html).toContain("5 / 10");
	});
});
