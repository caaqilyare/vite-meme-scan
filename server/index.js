import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.resolve(process.cwd(), 'server', 'db.json');
const DIST_PATH = path.resolve(process.cwd(), 'dist');
const TX_FEE = 4.3; // USD fee per transaction (buy/sell)

app.use(cors());
app.use(express.json());

function initialState() {
  return {
    user: { name: 'Munasar', balance: 65 },
    positions: {},
    history: [],
    activity: { move: 72, exercise: 58, stand: 8, meetings: 3, reminders: 1, nextFocusMins: 25, balanceDelta: 182 },
    lastScannedMint: "",
    todos: {},
    // history items: { id, ts, side: 'buy'|'sell', mint, name?, symbol?, price, qty, value }
  };
}

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = initialState();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return initialState();
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

app.get('/api/state', (req, res) => {
  const db = readDB();
  // ensure defaults
  if (!db.user || typeof db.user.balance !== 'number') {
    db.user = { name: 'Munasar', balance: 65 };
    writeDB(db);
  }
  if (!db.history) db.history = [];
  if (!db.activity) db.activity = { move: 72, exercise: 58, stand: 8, meetings: 3, reminders: 1, nextFocusMins: 25, balanceDelta: 182 };
  if (typeof db.lastScannedMint !== 'string') db.lastScannedMint = "";
  res.json(db);
});

// update activity widgets (partial update)
app.post('/api/activity', (req, res) => {
  const { move, exercise, stand, meetings, reminders, nextFocusMins, balanceDelta } = req.body || {};
  const db = readDB();
  db.activity = {
    ...(db.activity || {}),
    ...(Number.isFinite(move) ? { move: Number(move) } : {}),
    ...(Number.isFinite(exercise) ? { exercise: Number(exercise) } : {}),
    ...(Number.isFinite(stand) ? { stand: Number(stand) } : {}),
    ...(Number.isFinite(meetings) ? { meetings: Number(meetings) } : {}),
    ...(Number.isFinite(reminders) ? { reminders: Number(reminders) } : {}),
    ...(Number.isFinite(nextFocusMins) ? { nextFocusMins: Number(nextFocusMins) } : {}),
    ...(Number.isFinite(balanceDelta) ? { balanceDelta: Number(balanceDelta) } : {}),
  };
  writeDB(db);
  res.json(db);
});

// persist last scanned mint
app.post('/api/last-scanned', (req, res) => {
  const { mint } = req.body || {};
  if (!mint || typeof mint !== 'string') {
    return res.status(400).json({ error: 'Invalid mint' });
  }
  const db = readDB();
  db.lastScannedMint = mint;
  writeDB(db);
  res.json(db);
});

// update user name
app.post('/api/user', (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  const db = readDB();
  db.user = { ...(db.user || {}), name: name.trim() };
  writeDB(db);
  res.json(db);
});

// deposit funds
app.post('/api/deposit', (req, res) => {
  const { amount } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  const db = readDB();
  const bal = Number(db?.user?.balance ?? 0) + amt;
  db.user = { ...(db.user || { name: 'caaqil' }), balance: Number(bal.toFixed(6)) };
  writeDB(db);
  res.json(db);
});

app.post('/api/buy', (req, res) => {
  const { mint, price, qty, name, symbol, marketCap } = req.body || {};
  if (!mint || !Number.isFinite(price) || !Number.isFinite(qty) || price <= 0 || qty <= 0) {
    return res.status(400).json({ error: 'Invalid buy params' });
  }
  const db = readDB();
  const cost = price * qty;
  const total = cost + TX_FEE;
  if (db.user.balance < total) {
    return res.status(400).json({ error: `Insufficient balance (need $${total.toFixed(2)} incl. $${TX_FEE.toFixed(2)} fee)` });
  }
  // update balance
  db.user.balance = Number((db.user.balance - total).toFixed(6));
  // update position (avg price)
  const pos = db.positions[mint] || { qty: 0, avgPrice: 0, name, symbol };
  const newQty = pos.qty + qty;
  const newAvg = newQty > 0 ? ((pos.avgPrice * pos.qty) + cost) / newQty : 0;
  db.positions[mint] = { qty: Number(newQty.toFixed(6)), avgPrice: Number(newAvg.toFixed(8)), name: name ?? pos.name, symbol: symbol ?? pos.symbol };
  // history
  db.history.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ts: Date.now(), side: 'buy', mint, name, symbol, price, qty, value: Number(cost.toFixed(6)), fee: TX_FEE, marketCap: Number.isFinite(marketCap) ? Number(marketCap) : undefined });
  writeDB(db);
  res.json(db);
});

app.post('/api/sell', (req, res) => {
  const { mint, price, qty, marketCap } = req.body || {};
  if (!mint || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'Invalid sell params' });
  }
  const db = readDB();
  const pos = db.positions[mint];
  if (!pos || pos.qty <= 0) {
    return res.status(400).json({ error: 'No position' });
  }
  const sellQty = Number.isFinite(qty) && qty > 0 ? Math.min(qty, pos.qty) : pos.qty;
  const proceeds = price * sellQty;
  // ensure user can cover fee (from proceeds or existing balance)
  if (db.user.balance + proceeds < TX_FEE) {
    return res.status(400).json({ error: `Insufficient balance for $${TX_FEE.toFixed(2)} fee` });
  }
  db.user.balance = Number((db.user.balance + proceeds - TX_FEE).toFixed(6));
  const remaining = pos.qty - sellQty;
  if (remaining <= 0.0000001) {
    delete db.positions[mint];
  } else {
    db.positions[mint] = { ...pos, qty: Number(remaining.toFixed(6)) };
  }
  db.history.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ts: Date.now(), side: 'sell', mint, name: pos.name, symbol: pos.symbol, price, qty: sellQty, value: Number(proceeds.toFixed(6)), fee: TX_FEE, marketCap: Number.isFinite(marketCap) ? Number(marketCap) : undefined });
  writeDB(db);
  res.json(db);
});

// Upsert per-token checklist
// body: { mint: string, items: Array<{ id: string, text: string, done: boolean }> }
app.post('/api/todos', (req, res) => {
  const { mint, items } = req.body || {};
  if (!mint || typeof mint !== 'string' || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Invalid todos payload' });
  }
  const db = readDB();
  db.todos = db.todos || {};
  db.todos[mint] = items.map(it => ({ id: String(it.id), text: String(it.text || ''), done: !!it.done }));
  writeDB(db);
  res.json(db);
});

// Reset all data to initial state
app.post('/api/reset', (req, res) => {
  const initial = initialState();
  writeDB(initial);
  res.json(initial);
});

// Serve built frontend (if present)
app.use(express.static(DIST_PATH));

// SPA fallback to index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = path.join(DIST_PATH, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return next();
});

app.listen(PORT, () => {
  console.log(`JSON server running at http://localhost:${PORT}`);
});
