const express = require('express');
const SERVICE = 'policy-service';
const PORT = process.env.PORT || 3000;
const CUSTOMER_URL = process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001';

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), service: SERVICE, level, msg, ...extra }));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.on('finish', () => log('info', 'request', { method: req.method, path: req.originalUrl, status: res.statusCode }));
  next();
});

const PLANS = {            // base yearly price and rate on the cover amount
  health: { base: 3000, rate: 0.012 },
  motor:  { base: 2500, rate: 0.020 },
  life:   { base: 4000, rate: 0.006 },
  home:   { base: 1800, rate: 0.004 }
};

function premium(type, age, cover) {
  const p = PLANS[type];
  let amount = p.base + cover * p.rate;
  if (age > 60) amount *= 1.6; else if (age > 45) amount *= 1.3; else if (age > 30) amount *= 1.1;
  return Math.round(amount);
}

const policies = new Map();
let counter = 1;

app.get('/health', (_req, res) => res.json({ status: 'UP', service: SERVICE }));

app.get('/policies/plans', (_req, res) => res.json(PLANS));

app.post('/policies', async (req, res) => {
  const { customerId, type, age, coverAmount } = req.body || {};
  if (!customerId || !PLANS[type] || !(age >= 18 && age <= 80) || !(coverAmount >= 100000))
    return res.status(400).json({ error: 'customerId, type (' + Object.keys(PLANS).join('/') + '), age 18-80 and coverAmount >= 100000 are required' });

  try {   // service-to-service call: verify the customer exists
    const r = await fetch(`${CUSTOMER_URL}/customers/${customerId}`);
    if (r.status === 404) return res.status(404).json({ error: 'customer not found' });
    if (!r.ok) throw new Error('customer-service returned ' + r.status);
  } catch (e) {
    log('error', 'customer-service unavailable', { error: e.message });
    return res.status(503).json({ error: 'customer-service unavailable, try again later' });
  }

  const policy = {
    id: 'P' + counter++, customerId, type, coverAmount,
    yearlyPremium: premium(type, age, coverAmount),
    status: 'ACTIVE', issuedAt: new Date().toISOString()
  };
  policies.set(policy.id, policy);
  res.status(201).json(policy);
});

app.get('/policies', (req, res) => {
  let list = [...policies.values()];
  if (req.query.customerId) list = list.filter(p => p.customerId === req.query.customerId);
  res.json(list);
});

app.get('/policies/:id', (req, res) => {
  const p = policies.get(req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'policy not found' });
});

const server = app.listen(PORT, () => log('info', 'started', { port: PORT }));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
