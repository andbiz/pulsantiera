'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const COLORS = ['verde', 'giallo', 'rosso', 'blu'];
const CODE_PATTERN = /^[A-Z0-9]{4,24}$/;
const sessions = new Map();
const clients = new Map();

function initialState() { return { instance: crypto.randomUUID(), round: 1, mode: 'waiting', votes: {} }; }
function snapshot(session) {
  const counts = Object.fromEntries(COLORS.map(color => [color, 0]));
  if (session.mode === 'showing') {
    for (const color of Object.values(session.votes)) if (Object.hasOwn(counts, color)) counts[color]++;
  }
  return { instance: session.instance, round: session.round, mode: session.mode, counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(data));
}
function broadcast(code) {
  const message = `data: ${JSON.stringify(snapshot(sessions.get(code)))}\n\n`;
  for (const client of clients.get(code) || []) client.write(message);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) { reject(new Error('Richiesta troppo grande')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(JSON.parse(body)); }
      catch { reject(new Error('JSON non valido')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'POST' && pathname === '/api/sessions') {
    let body;
    try { body = await readBody(req); }
    catch (error) { if (!res.destroyed) json(res, 400, { error: error.message }); return; }
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!CODE_PATTERN.test(code)) {
      return json(res, 400, { error: 'Usa da 4 a 24 lettere o numeri, senza spazi o simboli.' });
    }
    if (!sessions.has(code) && sessions.size >= 10000) {
      return json(res, 503, { error: 'Limite di sessioni raggiunto' });
    }
    sessions.set(code, initialState());
    broadcast(code);
    return json(res, 201, { code });
  }

  const route = pathname.match(/^\/api\/s\/([A-Z0-9]{4,24})\/(state|events|vote|reveal|reset|qr)$/);
  if (route) {
    const [, code, action] = route;
    const session = sessions.get(code);
    if (!session) return json(res, 404, { error: 'Sessione non attiva. Ricreala usando lo stesso codice.' });
    if (req.method === 'GET' && action === 'state') return json(res, 200, snapshot(session));
    if (req.method === 'GET' && action === 'qr') {
      const requestUrl = new URL(req.url, 'http://localhost');
      const targetValue = requestUrl.searchParams.get('target');
      const host = req.headers['x-forwarded-host']?.split(',')[0].trim() || req.headers.host;
      const forwardedProtocol = req.headers['x-forwarded-proto']?.split(',')[0].trim();
      const protocol = forwardedProtocol === 'https' || req.socket.encrypted ? 'https' : 'http';
      let target;
      try {
        target = new URL(targetValue);
        const origin = new URL(`${protocol}://${host}`).origin;
        if (target.origin !== origin || target.pathname !== `/vote/${code}` ||
            target.search || target.hash || target.username || target.password) {
          return json(res, 400, { error: 'Indirizzo del QR code non valido' });
        }
      } catch {
        return json(res, 400, { error: 'Indirizzo del QR code non valido' });
      }
      try {
        const image = await QRCode.toBuffer(target.href, { width: 320, margin: 2 });
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
        res.end(image);
      } catch (error) {
        console.error('QR code generation failed:', error);
        json(res, 500, { error: 'Impossibile generare il QR code' });
      }
      return;
    }
    if (req.method === 'GET' && action === 'events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive',
        'Referrer-Policy': 'no-referrer' });
      res.write(`data: ${JSON.stringify(snapshot(session))}\n\n`);
      if (!clients.has(code)) clients.set(code, new Set());
      clients.get(code).add(res);
      req.on('close', () => { clients.get(code)?.delete(res); if (!clients.get(code)?.size) clients.delete(code); });
      return;
    }
    if (req.method === 'POST' && ['vote', 'reveal', 'reset'].includes(action)) {
      let body;
      try { body = await readBody(req); }
      catch (error) { if (!res.destroyed) json(res, 400, { error: error.message }); return; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json(res, 400, { error: 'Richiesta non valida' });
      }
      const active = sessions.get(code);
      if (body.instance !== active.instance) {
        return json(res, 409, { error: 'La sessione è cambiata' });
      }
      let nextState;
      if (action === 'vote') {
        if (active.mode !== 'waiting') return json(res, 409, { error: 'Votazione chiusa' });
        if (body.round !== active.round || body.instance !== active.instance) {
          return json(res, 409, { error: 'La sessione o il turno è cambiato' });
        }
        if (typeof body.voterId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.voterId) ||
            !COLORS.includes(body.color)) return json(res, 400, { error: 'Voto non valido' });
        nextState = { ...active, votes: { ...active.votes, [body.voterId]: body.color } };
      } else if (action === 'reveal') {
        if (active.mode !== 'waiting') return json(res, 409, { error: 'Risultati già visibili' });
        nextState = { ...active, mode: 'showing' };
      } else {
        if (active.mode !== 'showing') return json(res, 409, { error: 'Il turno è già aperto' });
        nextState = { ...active, round: active.round + 1, mode: 'waiting', votes: {} };
      }
      sessions.set(code, nextState);
      broadcast(code);
      return json(res, 200, snapshot(nextState));
    }
    return json(res, 405, { error: 'Metodo non consentito' });
  }

  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8']
  };
  const page = pathname.match(/^\/(vote|results)\/([A-Z0-9]{4,24})$/);
  if (req.method !== 'GET' || !(Object.hasOwn(files, pathname) || page)) {
    return json(res, 404, { error: 'Pagina non trovata' });
  }
  const [file, type] = files[page ? '/' : pathname];
  fs.readFile(path.join(__dirname, 'public', file), (error, content) => {
    if (error) return json(res, 500, { error: 'File non disponibile' });
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(content);
  });
});
server.listen(PORT, HOST, () => console.log(`Pulsantiera disponibile su http://localhost:${PORT}/`));
