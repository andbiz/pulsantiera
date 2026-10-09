'use strict';

const main = document.getElementById('main');
const colors = [
  { key: 'verde', name: 'Verde' },
  { key: 'rosso', name: 'Rosso' },
  { key: 'blu', name: 'Blu' },
  { key: 'giallo', name: 'Giallo' }
];
const route = location.pathname.match(/^\/(vote|results)\/([A-Z0-9]{4,24})$/);
const code = route?.[2];
const isResults = route?.[1] === 'results';
const api = code ? `/api/s/${code}` : '';
let current = null;
let pending = false;
let notice = '';

document.title = `${isResults ? 'Risultati' : 'Vota'} · Pulsantiera`;

function esc(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

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

function renderVote() {
  const choice = choiceForRound();
  const closed = current.mode === 'showing';
  main.innerHTML = `<section class="vote-layout">
    <div class="vote-grid" role="group" aria-label="Scegli un colore">
      ${colors.map(color => `<button type="button" class="vote-button ${color.key} ${choice === color.key ? 'selected' : ''}" data-color="${color.key}" aria-label="${esc(current.labels[color.key] || color.name)}" aria-pressed="${choice === color.key}" ${pending || closed ? 'disabled' : ''}>${esc(current.labels[color.key])}</button>`).join('')}
    </div>
    <span class="visually-hidden" id="vote-notice" role="status"></span>
  </section>`;
  main.querySelector('#vote-notice').textContent = notice;
  main.querySelectorAll('[data-color]').forEach(button => {
    button.addEventListener('click', () => act('vote', { voterId: getVoterId(), color: button.dataset.color, round: current.round, instance: current.instance }, button.dataset.color));
  });
}

function renderWaiting() {
  const existing = main.querySelector('.waiting-only');
  if (existing) {
    // Keep the form in place so typing is not interrupted by live updates.
    document.getElementById('action').disabled = pending;
    main.querySelectorAll('[data-label]').forEach(input => {
      if (input !== document.activeElement) input.value = current.labels[input.dataset.label];
    });
    return;
  }
  const qrUrl = new URL(`${api}/qr`, location.origin);
  qrUrl.searchParams.set('target', new URL(`/vote/${code}`, location.origin).href);
  main.innerHTML = `<section class="waiting-only">
    <img class="voting-qr" src="${qrUrl.pathname}${qrUrl.search}" alt="QR code per la votazione">
    <div class="label-fields">
      ${colors.map(color => `<input class="label-input ${color.key}" data-label="${color.key}" maxlength="40" autocomplete="off" aria-label="Nome ${color.name}" value="${esc(current.labels[color.key])}">`).join('')}
    </div>
    <button class="primary-button" type="button" id="action" ${pending ? 'disabled' : ''}>Mostra risultati</button>
    <span class="visually-hidden" id="waiting-notice" role="status"></span>
  </section>`;
  const waitingNotice = main.querySelector('#waiting-notice');
  waitingNotice.textContent = notice;
  main.querySelector('.voting-qr').addEventListener('error', () => {
    waitingNotice.textContent = 'Impossibile caricare il QR code per la votazione.';
  });
  let saveTimer;
  main.querySelector('.label-fields').addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const labels = Object.fromEntries([...main.querySelectorAll('[data-label]')].map(input => [input.dataset.label, input.value]));
      try {
        const response = await fetch(`${api}/labels`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instance: current.instance, labels }) });
        if (!response.ok) throw new Error((await response.json()).error);
        waitingNotice.textContent = '';
      } catch (error) { waitingNotice.textContent = error.message || 'Salvataggio non riuscito'; }
    }, 300);
  });
  document.getElementById('action').addEventListener('click', () => act('reveal', { instance: current.instance }));
}

function renderResults() {
  if (current.mode === 'waiting') {
    renderWaiting();
    return;
  }
  const total = current.total;
  main.innerHTML = `<section class="results-only" aria-label="Risultati della votazione">
    <div class="results-bars">
      ${colors.map(color => `<div class="proportion-row" role="group" aria-label="${esc(current.labels[color.key] || color.name)}: ${current.counts[color.key]} voti">
        <div class="proportion-track" role="progressbar" aria-label="${esc(current.labels[color.key] || color.name)}" aria-valuemin="0" aria-valuemax="${total || 1}" aria-valuenow="${current.counts[color.key]}">
          <span class="proportion-bar ${color.key}" style="--width:${total ? current.counts[color.key] / total * 100 : 0}%"></span>
          <span class="proportion-label">${esc(current.labels[color.key])}</span>
        </div>
        <span class="proportion-count">${current.counts[color.key]}</span>
      </div>`).join('')}
    </div>
    <button class="primary-button" type="button" id="action" ${pending ? 'disabled' : ''}>Azzera voti</button>
    <span class="visually-hidden" role="status">${notice}</span>
  </section>`;
  document.getElementById('action').addEventListener('click', () => act('reset', { instance: current.instance }));
}

function render() {
  if (!current) return;
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
  main.innerHTML = `<a class="primary-button" href="/?code=${code}">Crea sessione</a>`;
}

function connect() {
  const events = new EventSource(`${api}/events`);
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
  main.innerHTML = `<form id="create-form" class="create-form">
    <input id="create-code" aria-label="Codice della sessione" pattern="[A-Za-z0-9]{4,24}" minlength="4" maxlength="24" autocapitalize="characters" autocomplete="off" placeholder="Codice sessione" required autofocus>
    <button class="primary-button" type="submit">Crea sessione</button>
  </form>`;
  const input = document.getElementById('create-code');
  const requestedCode = new URLSearchParams(location.search).get('code');
  if (requestedCode && /^[A-Z0-9]{4,24}$/.test(requestedCode)) input.value = requestedCode;
  input.addEventListener('input', () => input.setCustomValidity(''));
  document.getElementById('create-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const response = await fetch('/api/sessions', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.value.trim().toUpperCase() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Creazione non riuscita');
      location.href = `/results/${result.code}`;
    } catch (error) {
      input.setCustomValidity(error.message);
      input.reportValidity();
      button.disabled = false;
    }
  });
}
if (code) connect(); else renderHome();
