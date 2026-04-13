import { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { Env } from './types';

export const authMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
	const path = new URL(c.req.url).pathname;
	
	// Unprotected routes
	if (path === '/webhook' || path === '/login' || path === '/') {
		return next();
	}

	// Protected routes (Dashboard, Downloads, Answers) require JWT Session
	const sessionToken = getCookie(c, 'auth_session');
	if (!sessionToken) {
		return c.redirect('/login');
	}

	try {
		await verify(sessionToken, c.env.JWT_SECRET, 'HS256');
		return next();
	} catch (e: any) {
		// Clear the corrupt/expired cookie so it doesn't loop forever
		setCookie(c, 'auth_session', '', { maxAge: 0, path: '/' });
		return c.redirect(`/login?error=jwt_${encodeURIComponent(e.message)}`);
	}
};
