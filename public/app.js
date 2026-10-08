'use strict';

const main = document.getElementById('main');
const connection = document.getElementById('connection');
const roundLabel = document.getElementById('round');
const colors = [
  { key: 'verde', name: 'Verde', hex: '#51c693' },
  { key: 'giallo', name: 'Giallo', hex: '#e9bb4d' },
  { key: 'rosso', name: 'Rosso', hex: '#e46e69' },
  { key: 'blu', name: 'Blu', hex: '#7699e8' }
];
const isResults = location.pathname === '/results';
let current = null;
let pending = false;
let notice = '';

document.getElementById('footer-role').textContent = isResults ? 'SCHERMATA RISULTATI' : 'SCHERMATA DI VOTO';
document.title = `${isResults ? 'Risultati' : 'Vota'} · Pulsantiera`;

function getVoterId() {
  let id = localStorage.getItem('pulsantiera-voter-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('pulsantiera-voter-id', id);
  }
  return id;
}

function choiceForRound() {
  try {
    const choice = JSON.parse(localStorage.getItem('pulsantiera-choice'));
    return choice?.round === current?.round ? choice.color : null;
  } catch { return null; }
}

function setConnection(online) {
  connection.className = `connection ${online ? 'online' : 'offline'}`;
  connection.innerHTML = `<span class="connection-dot"></span> ${online ? 'In diretta' : 'Riconnessione…'}`;
}

function renderVote() {
  const choice = choiceForRound();
  const closed = current.mode === 'showing';
  main.innerHTML = `<section class="vote-layout">
    <div class="vote-heading">
      <p class="eyebrow">SCHERMATA DI VOTO</p>
      <h1>La tua scelta<br>conta.</h1>
      <p class="intro">Premi un colore per esprimere il tuo voto.</p>
    </div>
    ${closed ? `<div class="closed-card"><div class="closed-icon" aria-hidden="true">◉</div><h2>Votazione conclusa</h2><p>${choice ? `Hai votato ${choice}. ` : ''}Attendi l'apertura del prossimo turno.</p></div>` : `
    <div class="vote-grid" role="group" aria-label="Scegli un colore">
      ${colors.map((color, index) => `<button type="button" class="vote-button ${color.key} ${choice === color.key ? 'selected' : ''}" data-color="${color.key}" aria-pressed="${choice === color.key}" ${pending ? 'disabled' : ''}>
        <span class="vote-number">0${index + 1} / 04</span>
        <span class="vote-bottom"><span class="vote-name">${color.name}</span><span class="vote-arrow" aria-hidden="true">↗</span></span>
      </button>`).join('')}
    </div>
    <p class="vote-help ${notice ? 'error' : ''}" role="status">${notice || (choice ? `Hai votato <strong>${choice}</strong>. Puoi cambiare scelta finché il turno è aperto.` : 'Un voto per dispositivo. Puoi cambiare scelta finché il turno è aperto.')}</p>`}
  </section>`;
  main.querySelectorAll('[data-color]').forEach(button => {
    button.addEventListener('click', () => act('/api/vote', { voterId: getVoterId(), color: button.dataset.color, round: current.round }, button.dataset.color));
  });
}

function renderResults() {
  if (current.mode === 'waiting') {
    main.innerHTML = `<section class="results-layout waiting">
      <div class="waiting-symbol" aria-hidden="true"><span></span></div>
      <p class="eyebrow">TURNO ${String(current.round).padStart(2, '0')} · VOTAZIONE APERTA</p>
      <h1>In attesa dei voti.</h1>
      <p class="intro">La votazione è aperta. Quando sei pronto, chiudi il turno e mostra i risultati a tutti.</p>
      <button class="primary-button" type="button" id="action" ${pending ? 'disabled' : ''}>Mostra risultati <span aria-hidden="true">↗</span></button>
      <p class="vote-help error" role="status">${notice}</p>
    </section>`;
    document.getElementById('action').addEventListener('click', () => act('/api/reveal', {}));
    return;
  }
  const max = Math.max(1, ...Object.values(current.counts));
  main.innerHTML = `<section class="results-layout">
    <div class="results-head"><div><p class="eyebrow">TURNO ${String(current.round).padStart(2, '0')} · VOTAZIONE CHIUSA</p>
      <h1>I risultati.</h1><p class="intro">Ecco come sono stati distribuiti i voti.</p></div>
      <div class="total-box"><strong>${current.total}</strong><span>VOTI TOTALI</span></div></div>
    <div class="results-panel" aria-label="Risultati per colore">
      ${colors.map(color => `<div class="result-row" style="--color:${color.hex};--width:${current.counts[color.key] / max * 100}%">
        <span class="result-name"><span class="result-dot" aria-hidden="true"></span>${color.name}</span>
        <div class="result-track" aria-hidden="true"><span class="result-bar"></span></div>
        <span class="result-count" aria-label="${current.counts[color.key]} voti">${current.counts[color.key]}</span>
      </div>`).join('')}
    </div>
    <div class="results-actions"><p class="${notice ? 'error' : ''}" role="status">${notice || 'Una nuova votazione azzera tutti i conteggi.'}</p>
      <button class="primary-button" type="button" id="action" ${pending ? 'disabled' : ''}>Nuova votazione <span aria-hidden="true">↗</span></button></div>
  </section>`;
  document.getElementById('action').addEventListener('click', () => act('/api/reset', {}));
}

function render() {
  if (!current) return;
  roundLabel.textContent = String(current.round).padStart(2, '0');
  if (isResults) renderResults(); else renderVote();
}

async function act(endpoint, body, color) {
  if (pending) return;
  const teacherAction = endpoint !== '/api/vote';
  let key = teacherAction ? sessionStorage.getItem('pulsantiera-admin-key') : null;
  if (teacherAction && !key) {
    key = window.prompt('Inserisci la password docente per gestire la votazione:');
    if (key === null) return;
    if (!key.trim()) { notice = 'Inserisci la password docente.'; render(); return; }
  }
  pending = true;
  notice = '';
  render();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (teacherAction) headers['X-Admin-Key'] = key;
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) sessionStorage.removeItem('pulsantiera-admin-key');
      throw new Error(result.error || 'Riprova tra poco');
    }
    if (teacherAction) sessionStorage.setItem('pulsantiera-admin-key', key);
    if (color) localStorage.setItem('pulsantiera-choice', JSON.stringify({ round: result.round, color }));
    current = result;
  } catch (error) {
    notice = error.message;
    await refresh();
  } finally {
    pending = false;
    render();
  }
}

async function refresh() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) return;
    current = await response.json();
    render();
  } catch { /* EventSource reconnects automatically. */ }
}

const events = new EventSource('/api/events');
events.onopen = () => setConnection(true);
events.onerror = () => setConnection(false);
events.onmessage = event => {
  const next = JSON.parse(event.data);
  if (current && (next.round !== current.round || next.mode !== current.mode)) notice = '';
  current = next;
  render();
};
window.addEventListener('focus', refresh);
refresh();
