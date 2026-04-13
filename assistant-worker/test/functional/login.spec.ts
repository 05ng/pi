import { describe, it, expect, vi } from "vitest";
import app from "../../src/index";
import { createMockEnv } from '../setup';
import * as OTPAuth from 'otpauth';

describe("Login Route (Integration)", () => {
	it("GET /login returns HTML", async () => {
		const env = createMockEnv();
		const req = new Request("http://localhost/login", { method: 'GET' });
		const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
		
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("Secure Access");
	});

	it("POST /login with invalid code redirects back to login with error", async () => {
		const env = createMockEnv();
		
		const formData = new FormData();
		formData.append("code", "000000"); // Invalid mock OTP
		
		const req = new Request("http://localhost/login", { 
			method: 'POST',
			body: formData
		});

		const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
		
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toContain("/login?error=");
	});

	it("POST /login with valid code mints JWT and redirects to dashboard", async () => {
		const env = createMockEnv();
		
		const totp = new OTPAuth.TOTP({
			issuer: "KnowledgeAssistant",
			label: "Dashboard",
			algorithm: "SHA1",
			digits: 6,
			period: 30,
			secret: OTPAuth.Secret.fromBase32(env.MFA_SECRET)
		});
		const validCode = totp.generate();

		const formData = new FormData();
		formData.append("code", validCode);
		
		const req = new Request("http://localhost/login", { 
			method: 'POST',
			body: formData
		});

		const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
		
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/dashboard");
		expect(res.headers.get("Set-Cookie")).toContain("auth_session=");
	});
});
