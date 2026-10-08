# Pulsantiera di voto

Webapp per votazioni istantanee su una rete condivisa, senza dipendenze esterne.

## Avvio

Serve Node.js 18 o successivo. Dalla cartella del progetto:

```bash
npm start
```

Apri `http://localhost:3000/vote` per votare e `http://localhost:3000/results` per controllare la votazione. Per usare altri dispositivi sulla stessa rete, sostituisci `localhost` con l'indirizzo IP del computer che esegue il server. Puoi impostare la porta con `PORT=4000 npm start`.

La password docente viene stampata nel terminale all'avvio se non imposti `ADMIN_KEY`. Quando premi **Mostra risultati** o **Nuova votazione**, la pagina te la chiede e la ricorda nella scheda del browser per il resto della sessione. Per una password stabile, avvia con `ADMIN_KEY='una-password-lunga-e-casuale' npm start`.

## Pubblicazione su Render

1. Estrai l'archivio e carica **i file estratti** in un nuovo repository GitHub (la radice del repository deve contenere `server.js` e `package.json`). Non caricare la cartella `data/`.
2. Su [Render](https://dashboard.render.com/), scegli **New → Web Service**, collega il repository e seleziona **Node**. Imposta **Build Command** su `npm install` e **Start Command** su `npm start`.
3. In **Environment**, aggiungi `ADMIN_KEY` con una password lunga e segreta. Scegli il piano e avvia il deploy. Non inserire la password nei file caricati su GitHub.
4. Il servizio avrà un indirizzo simile a `https://nome-app.onrender.com`. Condividi `https://nome-app.onrender.com/vote` con gli studenti e apri `https://nome-app.onrender.com/results` sul tuo dispositivo o sul proiettore. Entrambe le pagine sono pubbliche; solo i pulsanti che gestiscono il turno chiedono la password.

**Per una lezione:** se scegli il piano gratuito, apri entrambe le pagine qualche minuto prima. Render può sospendere il servizio dopo 15 minuti senza traffico e il primo accesso successivo può richiedere circa un minuto. Nel piano gratuito i dati salvati sul disco del servizio si perdono a un riavvio o a un nuovo deploy: usalo per votazioni estemporanee, non per risultati da conservare. Per mantenere i dati serve un servizio con disco persistente o un database esterno.

Ogni browser può esprimere un voto per turno. Finché il turno è aperto, può cambiare scelta premendo un altro colore; il conteggio rimane di un solo voto. Nella schermata risultati, **Mostra risultati** chiude il voto e mostra i conteggi; **Nuova votazione** azzera i conteggi e riapre il turno. Le pagine si aggiornano in tempo reale. I dati sono salvati in `data/state.json` e sopravvivono al riavvio del server.

L'identificativo del votante è salvato nel browser e può essere aggirato usando un altro browser o cancellando i dati locali. La pagina risultati è visibile a tutti; la password protegge i comandi, non l'accesso alla pagina. Questa versione è adatta a votazioni informali, non a scrutinî con requisiti di identità o segretezza.
