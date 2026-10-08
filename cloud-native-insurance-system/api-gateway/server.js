const express = require('express');
const SERVICE = 'api-gateway';
const PORT = process.env.PORT || 8080;

// Routing table: public path -> internal service (configured through environment variables)
const ROUTES = {
  '/api/customers': (process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001') + '/customers',
  '/api/policies':  (process.env.POLICY_SERVICE_URL   || 'http://localhost:3002') + '/policies',
  '/api/claims':    (process.env.CLAIM_SERVICE_URL    || 'http://localhost:3003') + '/claims'
};

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), service: SERVICE, level, msg, ...extra }));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.on('finish', () => log('info', 'request', { method: req.method, path: req.originalUrl, status: res.statusCode }));
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'UP', service: SERVICE }));

for (const [prefix, target] of Object.entries(ROUTES)) {
  app.use(prefix, async (req, res) => {
    try {
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const r = await fetch(target + req.url, {
        method: req.method,
        headers: { 'content-type': 'application/json' },
        body: hasBody ? JSON.stringify(req.body || {}) : undefined
      });
      res.status(r.status).type('application/json').send(await r.text());
    } catch (e) {
      log('error', 'upstream unavailable', { target, error: e.message });
      res.status(502).json({ error: 'upstream service unavailable' });
    }
  });
}

app.use((_req, res) => res.status(404).json({ error: 'route not found' }));

const server = app.listen(PORT, () => log('info', 'started', { port: PORT }));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
