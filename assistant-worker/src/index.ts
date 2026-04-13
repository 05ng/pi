import { Hono } from 'hono';
import { IngestionWorkflow } from './workflow';
import { Env } from './types';
import { authMiddleware } from './middleware';

import homeRoute from './routes/home';
import loginRoute from './routes/login';
import webhookRoute from './routes/webhook';
import dashboardRoute from './routes/dashboard';
import documentsRoute from './routes/documents';
import downloadRoute from './routes/download';
import answerRoute from './routes/answer';
import knowledgePageRoute from './routes/knowledge_page';
import chatRoute from './routes/chat';

// Export workflows so Cloudflare can find them
export { IngestionWorkflow };

const app = new Hono<{ Bindings: Env }>();

// Mount middleware
app.use('/*', authMiddleware);

// Mount routes
app.route('/', homeRoute);
app.route('/', loginRoute);
app.route('/', webhookRoute);
app.route('/', dashboardRoute);
app.route('/', documentsRoute);
app.route('/', downloadRoute);
app.route('/', answerRoute);
app.route('/', knowledgePageRoute);
app.route('/', chatRoute);

export default app;
