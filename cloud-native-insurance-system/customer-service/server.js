const express = require('express');
const SERVICE = 'customer-service';
const PORT = process.env.PORT || 3000;

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), service: SERVICE, level, msg, ...extra }));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.on('finish', () => log('info', 'request', { method: req.method, path: req.originalUrl, status: res.statusCode }));
  next();
});

// In-memory store (replace with a managed database such as PostgreSQL in production)
const customers = new Map();
let counter = 1;

app.get('/health', (_req, res) => res.json({ status: 'UP', service: SERVICE }));

app.post('/customers', (req, res) => {
  const { name, email, phone } = req.body || {};
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: 'name and a valid email are required' });
  const customer = { id: 'C' + counter++, name, email, phone: phone || null, createdAt: new Date().toISOString() };
  customers.set(customer.id, customer);
  res.status(201).json(customer);
});

app.get('/customers', (_req, res) => res.json([...customers.values()]));

app.get('/customers/:id', (req, res) => {
  const c = customers.get(req.params.id);
  c ? res.json(c) : res.status(404).json({ error: 'customer not found' });
});

const server = app.listen(PORT, () => log('info', 'started', { port: PORT }));
process.on('SIGTERM', () => server.close(() => process.exit(0)));  // graceful shutdown for Kubernetes
