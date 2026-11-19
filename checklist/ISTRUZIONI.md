# Checklist Quadri FR – v1 – passaggi da fare nei pannelli web

Ordine consigliato: 1 → 2 → 3 → 4. Ogni blocco "Testo per Claude in Chrome" si incolla così com'è.

---

## 1. Supabase: rendere visibile lo schema "checklist" alle pagine (obbligatorio)

Senza questo passaggio le pagine e le funzioni non leggono i dati (oggi rispondono "versione non disponibile").
La sicurezza resta garantita dalle regole RLS già attive e provate.

**Testo per Claude in Chrome**

```
Apri https://supabase.com/dashboard/project/hlspvqhegnpavanyhkrt e vai nelle impostazioni dell'API dati
(di solito: Project Settings → Data API, oppure Settings → API → sezione "Data API settings").
Trova il campo "Exposed schemas" (schemi esposti). Adesso contiene: public, graphql_public, ferie.
AGGIUNGI lo schema "checklist" senza togliere nessuno di quelli già presenti.
NON aggiungere "checklist_priv". Salva.
Poi dimmi l'elenco degli schemi esposti come appare dopo il salvataggio.
Non cambiare nessun'altra impostazione.
```

---

## 2. Google Cloud: account di servizio per leggere il foglio

Cosa succede: si crea un "utente robot" Google che può solo leggere i fogli condivisi con lui.
La sua chiave (file JSON) va in Supabase come segreto: non passa da me e non finisce nelle pagine.

Passi:
1. Crea un progetto Google Cloud (o usane uno tuo), ad esempio "checklist-quadri".
2. Attiva l'API "Google Sheets API".
3. Crea un account di servizio "checklist-lettore", **senza** ruoli sul progetto (non servono).
4. Crea una chiave di tipo JSON e scaricala.
5. Annota l'email dell'account di servizio (finisce con `.iam.gserviceaccount.com`).

⚠️ Se Google risponde che la creazione di chiavi è bloccata da un criterio dell'organizzazione
("iam.disableServiceAccountKeyCreation"), fermati e dimmelo: è un blocco messo di default su alcuni
account Google Workspace e va tolto dall'amministratore dell'organizzazione.

**Testo per Claude in Chrome**

```
Apri https://console.cloud.google.com con il mio account Google.
1) Crea un nuovo progetto chiamato "checklist-quadri" (se esiste già, usalo).
2) In quel progetto vai su "API e servizi" → "Libreria", cerca "Google Sheets API" e attivala.
3) Vai su "IAM e amministrazione" → "Account di servizio" → "Crea account di servizio".
   Nome: checklist-lettore. Descrizione: Legge il Piano consegna per la Checklist Quadri.
   Nel passaggio dei ruoli NON assegnare nessun ruolo: salta e completa.
4) Apri l'account appena creato → scheda "Chiavi" → "Aggiungi chiave" → "Crea nuova chiave" → tipo JSON → Crea.
   Il file JSON viene scaricato: NON aprirlo, NON copiarne il contenuto da nessuna parte e NON mostrarmelo.
5) Dimmi solo l'indirizzo email dell'account di servizio (quello che finisce con .iam.gserviceaccount.com)
   e il nome del file scaricato.
Se compare un errore sulla creazione delle chiavi bloccata da un criterio dell'organizzazione, fermati e riportami il testo esatto.
```

### 2b. Inserire la chiave in Supabase
Quando hai il file JSON dimmelo: ti faccio comparire io la richiesta del segreto **GOOGLE_SA_JSON**
nel pannello Supabase, e lì incolli tutto il contenuto del file. In alternativa:
Supabase → Edge Functions → Secrets → nuovo segreto `GOOGLE_SA_JSON` = contenuto completo del file.

### 2c. Condividere il foglio con l'account di servizio
Il file "Piano consegna Mannarini_Gantt" è di admin@frgroup.org: deve condividerlo chi ne ha il permesso.

**Testo per Claude in Chrome**

```
Apri https://docs.google.com/spreadsheets/d/10NvJxKpjupHClky9qjAPjKEieeldT8vI7JZsMuDLjGw/edit
Clicca "Condividi". Aggiungi questo indirizzo: [INCOLLA QUI L'EMAIL DELL'ACCOUNT DI SERVIZIO]
Ruolo: "Visualizzatore". Togli la spunta "Invia notifica". Clicca "Condividi".
Se Google avvisa che il file non può essere condiviso fuori dall'organizzazione, fermati e riportami il messaggio esatto.
Non cambiare altre condivisioni.
```

---

## 3. Cloudflare: il "guscio" delle pagine (Worker)

Le pagine /checklist/mannarini e /checklist/admin le serve un piccolo Worker separato:
non tocca il resto di app.ardigitalmarketer.it. Il codice del Worker è qui (pubblico, contiene solo la chiave pubblica):
https://raw.githubusercontent.com/romagnuoloantonio85-cyber/ar-nova/claude/checklist-quadri-fr-mannarini-smsza7/checklist/guscio/worker.js

Le future versioni delle pagine (v2, v3…) si pubblicano da Supabase: il Worker non va più toccato.

**Testo per Claude in Chrome**

```
Apri https://dash.cloudflare.com con il mio account.
1) Vai su "Workers e Pages" → "Crea" → "Crea Worker". Nome: checklist-guscio. Distribuisci il worker di esempio.
2) Clicca "Modifica codice". Cancella tutto il codice di esempio e incolla ESATTAMENTE il contenuto di questa pagina:
   https://raw.githubusercontent.com/romagnuoloantonio85-cyber/ar-nova/claude/checklist-quadri-fr-mannarini-smsza7/checklist/guscio/worker.js
   (aprila in un'altra scheda, seleziona tutto e copia). Clicca "Distribuisci".
3) Torna nelle impostazioni del worker checklist-guscio → "Domini e route" (Settings → Domains & Routes) → "Aggiungi" → "Route".
   Zona: ardigitalmarketer.it
   Route: app.ardigitalmarketer.it/checklist/*
   Salva.
4) Controlla che esista anche la route senza barra finale: se il pannello lo consente aggiungi pure app.ardigitalmarketer.it/checklist
   (non è indispensabile).
5) Apri https://app.ardigitalmarketer.it/checklist/mannarini e https://app.ardigitalmarketer.it/checklist/admin
   e dimmi cosa compare (dovrebbe esserci la schermata "Entra" con il campo email, oppure un messaggio di errore: riportamelo).
6) Apri https://app.ardigitalmarketer.it/ e verifica che la pagina principale del sito funzioni come prima.
Non modificare altri Worker, altre route o le impostazioni DNS.
Se la zona ardigitalmarketer.it non è nell'account o "app" non è con la nuvola arancione (proxy), fermati e dimmelo.
```

---

## 4. Resend
Non serve nessun passaggio: la chiave RESEND_API_KEY è già tra i segreti e il mittente
notifiche@ardigitalmarketer.it è già usato con successo da un'altra app dello stesso progetto.
Le mail della checklist partono come "Checklist Quadri FR <notifiche@ardigitalmarketer.it>".

---

## Cosa mi devi ancora dare
- **Voci della checklist** (gruppi e voci) dal flusso n8n: incollale qui o mandami l'export JSON del flusso.
- **Email delle persone di Mannarini** che compileranno (le abilito io o dalla pagina admin → "Cablatori e accessi").
