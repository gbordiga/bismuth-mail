# Analisi Completa e Valutazione per Miglioramenti Incrementali

**Progetto:** Bismuth Mail v0.2.3  
**Data analisi:** 24 Febbraio 2026  
**Branch:** cursor/analisi-miglioramenti-incrementali-1e57

---

## 1. Executive Summary

Bismuth Mail è un'applicazione ben strutturata per campagne email self-hosted, con stack moderno (Next.js 16, React 19, TypeScript 5.9, Dexie/IndexedDB). L'architettura è chiara e la CI è configurata correttamente. Le principali opportunità di miglioramento riguardano: **manutenibilità** (componenti troppo grandi), **copertura test**, **resilienza** (error boundaries), **accessibilità** e **ottimizzazione bundle**.

---

## 2. Analisi dello Stato Attuale

### 2.1 Architettura e Stack

| Aspetto | Valutazione | Note |
|---------|-------------|------|
| Framework | ✅ Solido | Next.js 16 App Router, React 19 |
| Type safety | ✅ Buono | TypeScript 5.9, Zod per validazione API |
| Database | ✅ Adeguato | Dexie/IndexedDB con migrazioni v1–v4 |
| CI/CD | ✅ Funzionante | Lint, type-check, test, build su push/PR |
| Documentazione | ⚠️ Base | README e CHANGELOG presenti, mancano API docs |

### 2.2 Metriche Componenti

| Componente | Righe | Complessità | Priorità refactor |
|------------|-------|-------------|-------------------|
| `email-list-section.tsx` | 839 | Alta | 🔴 Alta |
| `newsletter-editor.tsx` | 786 | Alta | 🔴 Alta |
| `send-campaign.tsx` | 632 | Media-Alta | 🟡 Media |
| `smtp-config.tsx` | 308 | Media | 🟢 Bassa |
| `backup-section.tsx` | 302 | Media | 🟢 Bassa |
| `sender-section.tsx` | 288 | Media | 🟢 Bassa |
| `app-shell.tsx` | 170 | Bassa | ✅ OK |

**Totale componenti principali:** ~3.325 righe, con forte concentrazione in 3 file.

### 2.3 Copertura Test

| Area | Coperta | Non coperta |
|------|---------|-------------|
| Validazioni Zod | ✅ `validations.test.ts` | — |
| Email builder | ✅ `email-builder.test.ts` | — |
| API routes | ❌ | `test`, `send`, `send-batch` |
| Context (SendingProvider) | ❌ | `sending-context.tsx` |
| Componenti React | ❌ | Tutti |
| Database (Dexie) | ❌ | `db.ts` |
| CSV parsing | ❌ | `email-list-section.tsx` |

**Stima copertura:** ~15–20% del codice critico.

### 2.4 Pattern Ricorrenti e Duplicazione

- **Caricamento da IndexedDB:** Ogni sezione usa `useState` + `useEffect` + `useCallback` per caricare dati. Nessun hook condiviso (`useDbTable`, `useSmtpConfigs`, ecc.).
- **Gestione errori:** Toast per errori, nessun error boundary React.
- **Accessibilità:** ARIA/role presenti soprattutto nei componenti UI (shadcn), meno nelle sezioni custom.

---

## 3. Roadmap Miglioramenti Incrementali

### Fase 1 — Quick Wins (1–2 settimane)

#### 1.1 Error Boundary Globale
**Effort:** Basso | **Impatto:** Alto

Aggiungere un `ErrorBoundary` React che catturi crash e mostri un messaggio di recupero invece di una schermata bianca.

```tsx
// components/error-boundary.tsx
// Wrappa l'app in layout.tsx
```

**Benefici:** Migliore UX in caso di bug, evitare perdita contesto utente.

---

#### 1.2 Hook `useDbTable` per ridurre duplicazione
**Effort:** Medio | **Impatto:** Medio

Creare un hook generico per caricare tabelle Dexie:

```ts
// hooks/use-db-table.ts
export function useDbTable<T>(table: EntityTable<T, "id">) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  // ...
}
```

**Benefici:** Meno codice ripetuto, caricamento consistente, più facile aggiungere cache/ottimizzazioni.

---

#### 1.3 Test API route `send-batch`
**Effort:** Basso | **Impatto:** Alto

Aggiungere test Vitest per `/api/smtp/send-batch` con mock di Nodemailer. Verificare:
- Validazione Zod (body invalido)
- Gestione errori transienti
- Sostituzione merge fields
- Escape HTML

**Benefici:** Maggiore sicurezza su modifiche future, regressioni evitate.

---

### Fase 2 — Manutenibilità (2–4 settimane)

#### 2.1 Refactor `email-list-section.tsx` (839 righe)
**Effort:** Alto | **Impatto:** Alto

Suddividere in:
- `EmailListSection.tsx` — orchestratore
- `EmailListTable.tsx` — tabella liste
- `ContactTable.tsx` — tabella contatti
- `CsvImportDialog.tsx` — import CSV
- `ContactFormDialog.tsx` — form contatto
- `hooks/use-email-lists.ts` — logica caricamento/CRUD

**Benefici:** File <200 righe, testabilità, riuso componenti.

---

#### 2.2 Refactor `newsletter-editor.tsx` (786 righe)
**Effort:** Alto | **Impatto:** Alto

Suddividere in:
- `NewsletterEditor.tsx` — layout principale
- `BlockEditor.tsx` — gestione blocchi
- `BlockRenderer.tsx` — rendering blocchi
- `BlockConfigPanel.tsx` — pannello configurazione blocco
- `CampaignList.tsx` — lista campagne
- `hooks/use-newsletters.ts` — logica CRUD

**Benefici:** Stessi di 2.1.

---

#### 2.3 Test `SendingProvider`
**Effort:** Medio | **Impatto:** Medio

Test con `@testing-library/react` per:
- Flusso `startSend` → `abortSend`
- Aggiornamento `sendProgress`
- Gestione errori e toast

**Benefici:** Fiducia nelle modifiche al flusso di invio.

---

### Fase 3 — Qualità e Sicurezza (2–3 settimane)

#### 3.1 Rate limiting API
**Effort:** Medio | **Impatto:** Sicurezza

Aggiungere rate limiting alle route `/api/smtp/*` (es. `@upstash/ratelimit` o middleware custom) per evitare abusi se l'app è esposta pubblicamente.

---

#### 3.2 Documentazione credenziali SMTP
**Effort:** Basso | **Impatto:** Chiarezza

Aggiornare README con sezione "Sicurezza":
- Le credenziali SMTP passano dal client alle API (accettabile per self-hosted)
- Raccomandazioni: HTTPS, ambiente privato, non esporre pubblicamente senza auth

---

#### 3.3 Audit accessibilità
**Effort:** Medio | **Impatto:** Inclusività

- Eseguire `eslint-plugin-jsx-a11y`
- Verificare navigazione da tastiera nelle sezioni custom
- Aggiungere `aria-live` per progress invio
- Verificare contrasto colori (WCAG AA)

---

### Fase 4 — Performance e UX (1–2 settimane)

#### 4.1 Lazy loading sezioni
**Effort:** Basso | **Impatto:** Bundle size

Usare `React.lazy` + `Suspense` per le sezioni meno usate (es. Backup, Send Campaign) e caricarle solo quando selezionate.

---

#### 4.2 Offline detection
**Effort:** Basso | **Impatto:** UX

Mostrare un banner o disabilitare "Invia campagna" quando `navigator.onLine === false`, dato che l'invio richiede rete.

---

#### 4.3 Migliorare messaggi di errore
**Effort:** Basso | **Impatto:** UX

- Messaggi più specifici per errori SMTP comuni (auth failed, connection refused)
- Link a documentazione o suggerimenti di risoluzione

---

## 4. Priorità Consigliate

| # | Miglioramento | Fase | Effort | Impatto | ROI |
|---|---------------|------|--------|---------|-----|
| 1 | Error Boundary | 1 | Basso | Alto | ⭐⭐⭐ |
| 2 | Test API send-batch | 1 | Basso | Alto | ⭐⭐⭐ |
| 3 | Hook useDbTable | 1 | Medio | Medio | ⭐⭐ |
| 4 | Refactor email-list-section | 2 | Alto | Alto | ⭐⭐ |
| 5 | Refactor newsletter-editor | 2 | Alto | Alto | ⭐⭐ |
| 6 | Test SendingProvider | 2 | Medio | Medio | ⭐⭐ |
| 7 | Rate limiting API | 3 | Medio | Sicurezza | ⭐⭐ |
| 8 | Doc sicurezza SMTP | 3 | Basso | Chiarezza | ⭐ |
| 9 | Audit a11y | 3 | Medio | Inclusività | ⭐⭐ |
| 10 | Lazy loading sezioni | 4 | Basso | Performance | ⭐ |

---

## 5. Riepilogo Tecnico

### Punti di forza
- Stack moderno e coerente
- Validazione Zod su tutte le API
- Migrazioni DB ben gestite
- CI completa (lint, type-check, test, build)
- Retry e gestione errori transienti nell'invio

### Aree di miglioramento
- Componenti monolitici (>600 righe)
- Copertura test limitata
- Assenza error boundaries
- Duplicazione logica caricamento DB
- Documentazione sicurezza assente

### Rischio tecnico attuale
**Medio-basso.** L'app è funzionante e stabile. Il debito tecnico è principalmente manutenibilità e resilienza, non funzionalità critiche.

---

## 6. Prossimi Passi Immediati

1. **Implementare Error Boundary** — 1–2 ore
2. **Aggiungere 2–3 test per send-batch** — 2–3 ore
3. **Creare `useDbTable` e migrare una sezione** — 3–4 ore (proof of concept)

Questi tre interventi forniscono valore immediato con rischio minimo e preparano il terreno per i refactor successivi.
