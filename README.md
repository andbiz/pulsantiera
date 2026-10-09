# Pulsantiera di voto

Webapp per votazioni istantanee a quattro colori. Richiede Node.js 18 o successivo.

## Avvio

```bash
npm start
```

Apri `http://localhost:3000/`, inserisci un codice di **4–24 lettere o cifre** (per esempio `CLASSE4A`) e premi **Crea sessione**. Il codice viene convertito in maiuscolo. La pagina risultati si apre mostrando il QR code da inquadrare per votare e il pulsante **Mostra risultati**. Nella stessa pagina quattro campi di testo permettono di dare un nome facoltativo a ciascun colore (massimo 40 caratteri): i nomi compaiono subito sui pulsanti di voto e sono vuoti per impostazione predefinita. **Azzera voti** cancella anche i nomi. Dopo la rivelazione, premi **Azzera voti** per aprire un nuovo turno.

Gli indirizzi della sessione sono:

- `http://localhost:3000/vote/CLASSE4A` per votare;
- `http://localhost:3000/results/CLASSE4A` per vedere i risultati e gestire i turni.

Salva i due URL nei bookmark. Non è possibile creare una sessione con un codice già in uso: viene mostrato un errore e devi sceglierne un altro. Codici diversi identificano sessioni indipendenti. Con un browser diverso sulla stessa rete, sostituisci `localhost` con l'indirizzo IP del server. Puoi scegliere una porta diversa con `PORT=4000 npm start`.

Puoi aprire un bookmark anche se la sessione non è ancora attiva: la pagina indica che la sessione va ricreata e offre un collegamento al modulo con il codice già inserito. I dati restano soltanto nella memoria del server: dopo un riavvio devi creare di nuovo la sessione usando lo stesso codice. I bookmark rimangono validi. Avvia una sola istanza del servizio se vuoi che tutti gli utenti vedano la stessa sessione.

## Pubblicazione su Render

Estrai i file e caricali in un repository GitHub, con `server.js`, `package.json` e `package-lock.json` alla radice. Crea un Web Service Node su Render, imposta **Build Command** a `npm install` e **Start Command** a `npm start`. Apri la radice dell'indirizzo assegnato al servizio e crea una sessione. Se il servizio viene riavviato o sospeso, ricrea la sessione con lo stesso codice: i link non cambiano.

## Accesso e limiti

Non ci sono password. Chiunque conosca un codice può ricavare **entrambi** gli URL sostituendo `/vote/` con `/results/`; può anche aprire la pagina risultati, cambiare i turni o aprire la sessione dal suo link. La distinzione fra link serve alla comodità d'uso, non limita i permessi. Non usare l'app per votazioni che richiedono protezione da interventi di altri utenti.

Ogni browser può esprimere un voto per turno e cambiarlo mentre il voto è aperto. Si può aggirare il limite usando altri browser o cancellando i dati locali. I risultati si vedono dopo aver premuto **Mostra risultati**. Questa app è adatta a votazioni informali, non a scrutini con requisiti di identità o segretezza.
