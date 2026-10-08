const express = require('express');
const SERVICE = 'claim-service';
const PORT = process.env.PORT || 3000;
const POLICY_URL = process.env.POLICY_SERVICE_URL || 'http://localhost:3002';

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), service: SERVICE, level, msg, ...extra }));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.on('finish', () => log('info', 'request', { method: req.method, path: req.originalUrl, status: res.statusCode }));
  next();
});

const claims = new Map();
let counter = 1;
const STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED'];

app.get('/health', (_req, res) => res.json({ status: 'UP', service: SERVICE }));

app.post('/claims', async (req, res) => {
  const { policyId, amount, description } = req.body || {};
  if (!policyId || !(amount > 0) || !description)
    return res.status(400).json({ error: 'policyId, amount (> 0) and description are required' });

  let policy;
  try {
    const r = await fetch(`${POLICY_URL}/policies/${policyId}`);
    if (r.status === 404) return res.status(404).json({ error: 'policy not found' });
    if (!r.ok) throw new Error('policy-service returned ' + r.status);
    policy = await r.json();
  } catch (e) {
    log('error', 'policy-service unavailable', { error: e.message });
    return res.status(503).json({ error: 'policy-service unavailable, try again later' });
  }

  if (policy.status !== 'ACTIVE') return res.status(409).json({ error: 'policy is not active' });

  const claim = {
    id: 'CL' + counter++, policyId, customerId: policy.customerId, amount, description,
    // Simple rule: a claim above the cover amount is rejected automatically
    status: amount > policy.coverAmount ? 'REJECTED' : 'SUBMITTED',
    createdAt: new Date().toISOString()
  };
  claims.set(claim.id, claim);
  res.status(201).json(claim);
});

app.get('/claims', (req, res) => {
  let list = [...claims.values()];
  if (req.query.policyId) list = list.filter(c => c.policyId === req.query.policyId);
  res.json(list);
});

app.get('/claims/:id', (req, res) => {
  const c = claims.get(req.params.id);
  c ? res.json(c) : res.status(404).json({ error: 'claim not found' });
});

// Adjuster decision: PATCH /claims/CL1/status  { "status": "APPROVED" }
app.patch('/claims/:id/status', (req, res) => {
  const c = claims.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'claim not found' });
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'status must be one of ' + STATUSES.join(', ') });
  c.status = status;
  res.json(c);
});

const server = app.listen(PORT, () => log('info', 'started', { port: PORT }));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
