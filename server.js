'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const COLORS = ['verde', 'giallo', 'rosso', 'blu'];
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const clients = new Set();
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(18).toString('hex');
if (!process.env.ADMIN_KEY) console.log(`Password docente per questa sessione: ${ADMIN_KEY}`);

function initialState() {
  return { round: 1, mode: 'waiting', votes: {} };
}

function readState() {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Number.isSafeInteger(saved.round) && saved.round > 0 &&
        ['waiting', 'showing'].includes(saved.mode) && saved.votes &&
        typeof saved.votes === 'object' && !Array.isArray(saved.votes)) {
      return saved;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return initialState();
}

let state = readState();

function saveState(nextState) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(nextState), { mode: 0o600 });
  fs.renameSync(temporary, DATA_FILE);
}

function snapshot() {
  const counts = Object.fromEntries(COLORS.map(color => [color, 0]));
  if (state.mode === 'showing') {
    for (const color of Object.values(state.votes)) {
      if (Object.hasOwn(counts, color)) counts[color]++;
    }
  }
  return { round: state.round, mode: state.mode, counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}

function authorized(req) {
  const supplied = req.headers['x-admin-key'];
  if (typeof supplied !== 'string') return false;
  const given = crypto.createHash('sha256').update(supplied).digest();
  const expected = crypto.createHash('sha256').update(ADMIN_KEY).digest();
  return crypto.timingSafeEqual(given, expected);
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

function broadcast() {
  const message = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const client of clients) client.write(message);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) {
        reject(new Error('Richiesta troppo grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('JSON non valido')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (req.method === 'GET' && pathname === '/api/state') return json(res, 200, snapshot());
  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method === 'POST' && ['/api/vote', '/api/reveal', '/api/reset'].includes(pathname)) {
    if (pathname !== '/api/vote' && !authorized(req)) {
      return json(res, 401, { error: 'Password docente non valida' });
    }
    let body;
    try { body = await readBody(req); }
    catch (error) { if (!res.destroyed) json(res, 400, { error: error.message }); return; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(res, 400, { error: 'Richiesta non valida' });
    }
    let nextState;
    if (pathname === '/api/vote') {
      if (state.mode !== 'waiting') return json(res, 409, { error: 'Votazione chiusa' });
      if (body.round !== state.round) return json(res, 409, { error: 'Il turno è cambiato' });
      if (typeof body.voterId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.voterId) ||
          !COLORS.includes(body.color)) return json(res, 400, { error: 'Voto non valido' });
      nextState = { ...state, votes: { ...state.votes, [body.voterId]: body.color } };
    } else if (pathname === '/api/reveal') {
      if (state.mode !== 'waiting') return json(res, 409, { error: 'Risultati già visibili' });
      nextState = { ...state, mode: 'showing' };
    } else {
      if (state.mode !== 'showing') return json(res, 409, { error: 'Il turno è già aperto' });
      nextState = { round: state.round + 1, mode: 'waiting', votes: {} };
    }
    try { saveState(nextState); }
    catch (error) { console.error(error); return json(res, 500, { error: 'Salvataggio non riuscito' }); }
    state = nextState;
    broadcast();
    return json(res, 200, snapshot());
  }

  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/vote': ['index.html', 'text/html; charset=utf-8'],
    '/results': ['index.html', 'text/html; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8']
  };
  if (req.method !== 'GET' || !Object.hasOwn(files, pathname)) {
    return json(res, 404, { error: 'Pagina non trovata' });
  }
  const [file, type] = files[pathname];
  fs.readFile(path.join(__dirname, 'public', file), (error, content) => {
    if (error) return json(res, 500, { error: 'File non disponibile' });
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  });
});

server.listen(PORT, HOST, () => console.log(`Pulsantiera disponibile su http://localhost:${PORT}/vote`));
