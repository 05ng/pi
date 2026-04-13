import { Hono } from 'hono';
import { Env } from '../types';

const homeRoute = new Hono<{ Bindings: Env }>();

homeRoute.get('/', (c) => {
	return c.text('Personal Knowledge Assistant Webhook is running!');
});

export default homeRoute;
