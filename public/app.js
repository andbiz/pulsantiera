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
const route = location.pathname.match(/^\/(vote|results)\/([A-Z0-9]{4,24})$/);
const code = route?.[2];
const isResults = route?.[1] === 'results';
const api = code ? `/api/s/${code}` : '';
let current = null;
let pending = false;
let notice = '';

document.getElementById('footer-role').textContent = !code ? 'CREA UNA SESSIONE' : isResults ? 'SCHERMATA RISULTATI' : 'SCHERMATA DI VOTO';
document.querySelector('.brand').href = '/';
if (code) document.getElementById('session-code').textContent = `SESSIONE ${code}`;
else document.querySelector('.round-label').hidden = true;
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
    const choice = JSON.parse(localStorage.getItem(`pulsantiera-choice-${code}`));
    return choice?.round === current?.round && choice?.instance === current?.instance ? choice.color : null;
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
    button.addEventListener('click', () => act('vote', { voterId: getVoterId(), color: button.dataset.color, round: current.round, instance: current.instance }, button.dataset.color));
  });
}

function renderResults() {
  const controls = `<div class="session-tools">
    <strong>SESSIONE ${code}</strong>
    <button type="button" data-copy="vote">Copia link di voto</button>
    <button type="button" data-copy="results">Copia link risultati</button>
    <small>Ricreando una sessione con questo codice, i link restano identici e i voti ricominciano da zero.</small>
  </div>`;
  function bindControls() {
    main.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
      const kind = button.dataset.copy;
      const url = new URL(`/${kind}/${code}`, location.origin);
      try { await navigator.clipboard.writeText(url.href); button.textContent = 'Copiato!'; }
      catch { notice = 'Impossibile copiare: seleziona il link dalla barra degli indirizzi.'; render(); }
    }));
  }
  if (current.mode === 'waiting') {
    main.innerHTML = `<section class="results-layout waiting">
      ${controls}<div class="waiting-symbol" aria-hidden="true"><span></span></div>
      <p class="eyebrow">TURNO ${String(current.round).padStart(2, '0')} · VOTAZIONE APERTA</p>
      <h1>In attesa dei voti.</h1>
      <p class="intro">La votazione è aperta. Quando sei pronto, chiudi il turno e mostra i risultati a tutti.</p>
      <button class="primary-button" type="button" id="action" ${pending ? 'disabled' : ''}>Mostra risultati <span aria-hidden="true">↗</span></button>
      <p class="vote-help error" role="status">${notice}</p>
    </section>`;
    document.getElementById('action').addEventListener('click', () => act('reveal', { instance: current.instance }));
    bindControls();
    return;
  }
  const max = Math.max(1, ...Object.values(current.counts));
  main.innerHTML = `<section class="results-layout">
    ${controls}<div class="results-head"><div><p class="eyebrow">TURNO ${String(current.round).padStart(2, '0')} · VOTAZIONE CHIUSA</p>
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
  document.getElementById('action').addEventListener('click', () => act('reset', { instance: current.instance }));
  bindControls();
}

function render() {
  if (!current) return;
  roundLabel.textContent = String(current.round).padStart(2, '0');
  if (isResults) renderResults(); else renderVote();
}

async function act(endpoint, body, color) {
  if (pending) return;
  pending = true;
  notice = '';
  render();
  try {
    const response = await fetch(`${api}/${endpoint}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Riprova tra poco');
    }
    if (color) localStorage.setItem(`pulsantiera-choice-${code}`, JSON.stringify({ instance: result.instance, round: result.round, color }));
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
    const response = await fetch(`${api}/state`, { cache: 'no-store' });
    if (response.status === 404) { renderMissing(); return; }
    if (!response.ok) return;
    current = await response.json();
    render();
  } catch { /* EventSource reconnects automatically. */ }
}

function renderMissing() {
  current = null;
  main.innerHTML = `<section class="results-layout waiting"><p class="eyebrow">SESSIONE ${code}</p>
    <h1>Sessione non attiva.</h1><p class="intro">Crea una nuova sessione con lo stesso codice per riutilizzare questo link.</p>
    <a class="secondary-button" href="/?code=${code}">Crea sessione</a></section>`;
}

function connect() {
const events = new EventSource(`${api}/events`);
events.onopen = () => setConnection(true);
events.onerror = () => setConnection(false);
events.onmessage = event => {
  const next = JSON.parse(event.data);
  if (current && (next.instance !== current.instance || next.round !== current.round || next.mode !== current.mode)) notice = '';
  current = next;
  render();
};
window.addEventListener('focus', refresh);
refresh();
}

function renderHome() {
  document.title = 'Nuova sessione · Pulsantiera';
  document.getElementById('connection').hidden = true;
  main.innerHTML = `<section class="results-layout waiting">
    <p class="eyebrow">PULSANTIERA · SESSIONI INDIPENDENTI</p>
    <h1>Una votazione<br>per ogni gruppo.</h1>
    <p class="intro">Scegli un codice per i tuoi link. Ricrea la sessione con lo stesso codice per riutilizzare i bookmark e azzerare i voti.</p>
    <form id="create-form" class="session-form">
      <label for="create-code">Codice della sessione</label>
      <input id="create-code" pattern="[A-Za-z0-9]{4,24}" minlength="4" maxlength="24" autocapitalize="characters" autocomplete="off" placeholder="Es. CLASSE4A" required>
      <button class="primary-button" type="submit">Crea sessione <span aria-hidden="true">↗</span></button>
      <p id="create-notice" class="vote-help error" role="status"></p>
    </form>
    <form id="join-form" class="session-form">
      <label for="join-code">Hai già un codice?</label>
      <input id="join-code" pattern="[A-Za-z0-9]{4,24}" maxlength="24" placeholder="Es. CLASSE4A" required>
      <button type="submit" class="secondary-button">Apri votazione</button>
    </form>
  </section>`;
  const requestedCode = new URLSearchParams(location.search).get('code');
  if (requestedCode && /^[A-Z0-9]{4,24}$/.test(requestedCode)) document.getElementById('create-code').value = requestedCode;
  document.getElementById('join-form').addEventListener('submit', event => {
    event.preventDefault();
    location.href = `/vote/${document.getElementById('join-code').value.trim().toUpperCase()}`;
  });
  document.getElementById('create-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const chosenCode = document.getElementById('create-code').value.trim().toUpperCase();
      const response = await fetch('/api/sessions', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: chosenCode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Creazione non riuscita');
      location.href = `/results/${result.code}`;
    } catch (error) { document.getElementById('create-notice').textContent = error.message; button.disabled = false; }
  });
}
if (code) connect(); else renderHome();
