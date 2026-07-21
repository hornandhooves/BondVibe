# Backend spec — Callables admin de payouts (contrato para Diseño 2)

Contexto: la UI admin de payouts (Diseño 2) muestra el ledger de escrow y actúa
sobre él. Pero `paymentLedger` y `hostPayoutAccounts` son **DENY-ALL** (solo Admin
SDK — firestore.rules:946/951). El cliente **no** puede leerlos. Por eso la UI **NO**
se construye como cliente-directo-a-Firestore para el ledger; necesita las callables
de abajo. **NO relajes las reglas deny-all** — que el ledger de dinero no lo lea
ningún cliente es intencional.

## Ya existe (NO rehacer)
- **Freeze/unfreeze:** `setPayoutFrozen` (index.js:2820) — el toggle Congelar de Diseño 2.
- **Retención:** `settings/payouts.retentionHours` — el admin lo lee/escribe **directo**
  (firestore.rules:959: `read` signed-in, `write` admin con floor `>= 0`). El stepper
  `[− 24h +]` de Diseño 2 escribe ahí; la validación "entero ≥ 0" ya la refuerza la regla.

## Faltan (construir — todas `onCall`, `isAdmin` obligatorio, reusan escrow.js/refunds.js)

**1. `adminListPayouts({ status?, type?, cursor?, limit=25 })`**
- Admin SDK lee `paymentLedger` paginado (`orderBy capturedAt desc`). Filtros opcionales por
  `state` (held/released/refunded/reversed/frozen) y `type` (event_ticket/rental/service_booking).
- Devuelve por fila lo que la UI pinta: `paymentIntentId, type, sourceId, bizId, hostUid,
  buyerUid, grossAmount, hostAmount, platformFee, stripeFee, currency, state, frozen,
  releaseAt, deliveryEndAt, transferId, refundId, hostPenaltyOwed` + `nextCursor`.
- **Deuda de host:** para los `hostUid` de la página, leer `hostPayoutAccounts/{hostUid}.penaltyOwed`
  (deny-all → solo Admin SDK) → alimenta la card "Deuda de hosts" (dos fuentes §5 clawback + §6 fee).

**2. `adminReleasePayout({ paymentIntentId })`** — botón "Liberar ahora"
- `isAdmin`. Fetch del `ledgerDoc`; llama `escrow.releaseOnePayout(stripe, db, ledgerDoc)`
  (ya idempotente, transaccional, gate `state==="held"`, netea `hostPenaltyOwed`). Libera aunque
  `releaseAt` sea futuro (esa es la semántica de "ahora"). Devuelve el outcome.

**3. `adminRefundPayout({ paymentIntentId, reason? })`** — botón "Reembolsar"
- `isAdmin`. Llama `refunds.processRefund(paymentIntentId, …)` (ledger-aware: held→refund,
  released→reversal+refund). La UI ya pide confirmación (irreversible).

## Reglas de oro
- `isAdmin` en las 3 (mismo patrón que `setPayoutFrozen`). Sin excepción.
- **Reusar** `escrow.releaseOnePayout` y `refunds.processRefund` — NO reimplementar el flujo de
  dinero. La idempotencia y los checks de estado ya viven ahí.
- No tocar las reglas deny-all de `paymentLedger`/`hostPayoutAccounts`.
- Tests: no-admin → permission-denied; release de held → transfer + `released`; refund de held →
  `refunded`; refund de released → `reversed`; list pagina y filtra por state/type.

## Secuencia de construcción
1. Estas 3 callables (backend) → PR aparte, QA revisa.
2. La UI de Diseño 2 (contra el `.dc.html` de Design) consume estas callables + `setPayoutFrozen`
   + el write directo de `settings/payouts`. → PR aparte, QA revisa.

PR aparte cada uno. NO merge: QA revisa.
