# CORTEX — FCM Push Messages + Email Tester
> Pronto da implementare in Firebase Cloud Messaging / Resend

---

## FCM PUSH NOTIFICATIONS

### Benvenuto (immediato post-registrazione)
```
Titolo: Benvenuto in Cortex! 🧠
Corpo: Il tuo secondo cervello è pronto. Crea il primo mazzo e inizia subito.
Deep link: /app?page=materiale&action=create
```

### D1 — Reminder primo studio (24h dopo registrazione, se non ha studiato)
```
Titolo: Hai 5 minuti? ⚡
Corpo: Una sessione veloce al giorno basta per ricordare tutto il doppio.
Deep link: /app?page=home&mode=quick
```

### D3 — Costruire l'abitudine (72h, se streak = 0)
```
Titolo: La memoria si allena come un muscolo 💪
Corpo: 3 minuti al giorno per 7 giorni = risultati che durano mesi. Inizia la streak.
Deep link: /app?page=home
```

### D7 — Reward utente attivo (7 giorni, se streak >= 3)
```
Titolo: Hai una streak di [X] giorni! 🔥
Corpo: Sei già nel top 10% degli studenti Cortex. Continua così.
Deep link: /app?page=home
```

### D7 — Re-engagement utente inattivo (7 giorni, se streak = 0)
```
Titolo: I tuoi mazzi ti aspettano 📚
Corpo: Hai [N] flashcard da ripassare. 5 minuti e sei a posto.
Deep link: /app?page=home
```

### D30 — Win-back (30 giorni inattivo)
```
Titolo: Sei scomparso... 👀
Corpo: I tuoi compagni di duello ti cercano. Torna e scala la leaderboard.
Deep link: /app?page=community
```

### Pre-Maturità (1 Giugno 2026 — 16 giorni prima)
```
Titolo: Maturità tra 16 giorni ⏳
Corpo: Attiva Quick Mode Maturità: 10 minuti al giorno sui contenuti chiave.
Deep link: /app?page=home&filter=maturita
```

### Lancio Feature (ad hoc)
```
Titolo: Novità: [Nome Feature] 🚀
Corpo: [Descrizione breve benefit]. Provalo subito.
Deep link: /app?page=[pagina-feature]
```

### Neural Duels — Sfida ricevuta
```
Titolo: [NomeAvversario] ti sfida! ⚔️
Corpo: Accetta il duello e difendi il tuo posto in classifica.
Deep link: /app?page=community&tab=duels
```

---

## EMAIL AI 12 TESTER — RICHIESTA RECENSIONE PLAY STORE

> Da inviare via Resend il giorno del lancio (18 Maggio) o subito dopo

**Da:** francesco@cortexapp.it  
**Oggetto:** Hai 2 minuti? 🧠 Ti chiedo un favore importante

---

```
Ciao [Nome],

sei stato uno dei primi 12 a credere in Cortex quando era ancora in beta.

Oggi l'app è live su Google Play — e ho bisogno di te.

Le prime recensioni sono fondamentali per il ranking: Google mostra le app 
nuove solo se hanno almeno qualche recensione reale. Senza quello, nessuno 
ci trova.

Ti chiedo solo 2 minuti:

👉 [LASCIA UNA RECENSIONE SU PLAY STORE]
   https://play.google.com/store/apps/details?id=it.cortexapp

Non devi scrivere un romanzo — anche solo "Ottima app per studiare, 
la uso ogni giorno" aiuta enormemente.

Se hai trovato qualcosa che non va o vuoi suggerire qualcosa, rispondimi 
direttamente a questa email — leggo tutto personalmente.

Grazie davvero.

Francesco
fondatore di Cortex 🧠

P.S. Se vuoi invitare qualcuno, il link è cortexapp.it — ogni nuovo utente 
è un passo verso rendere Cortex sostenibile e gratuita per tutti.
```

---

## EMAIL LANCIO — ANNUNCIO GENERALE (per mailing list / social)

**Oggetto:** 🧠 Cortex è live su Google Play

```
È successo.

Dopo mesi di sviluppo, test, bug fix e notti insonni — Cortex è finalmente 
su Google Play.

Cosa puoi fare con Cortex oggi:

• Caricare un PDF → flashcard AI in 30 secondi
• Studiare con ripetizione spaziata (SRS scientifico)
• Sfidare altri studenti in Neural Duels in tempo reale
• Simulare l'esame orale con Boss Mode AI
• Preparare la Maturità 2026 (37 giorni)

È gratis. Senza pubblicità.

[SCARICA SU GOOGLE PLAY]
https://play.google.com/store/apps/details?id=it.cortexapp

Ci vediamo dentro.

Francesco
cortexapp.it
```

---
*Documento generato: 12 Maggio 2026*
