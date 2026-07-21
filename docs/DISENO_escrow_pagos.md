# Diseño — Escrow de pagos (retención hasta post-evento)
**Autor:** Claude (QA/Arquitectura) · **Estado:** v1 para construir + revisar · **Decisión:** Carlos, 2026-07-20
**Regla de negocio:** el host NO recibe el dinero hasta que el evento se concreta + ventana de retención. Ventana configurable por admin, **default 24h, piso duro 0h** (nunca antes de que termine el evento; el sistema rechaza negativo).

**Alcance:** el escrow aplica SOLO a **tickets de evento** (entrega diferida = el evento sucede después). **Membresías y paquetes** se pagan **de inmediato** y **NO son reembolsables** (términos y condiciones) → sin escrow, sin flujo de reembolso. Solo les aplican sus fixes de seguridad (auth del payment intent + transacción de crédito), nunca lógica de reembolso.

**Preparar terreno (futuro cercano) — Super Host:** tier de host que cobra **al terminar el evento** (retención 0h). En v1 dejar **listo el campo `host.payoutTier`** y que el release resuelva la retención por host; el tier "super" se activa después sin re-arquitectura.

> Este doc es la fuente de verdad de la arquitectura de pagos. El plugin construye contra esto; QA revisa contra esto. No improvisar el flujo de dinero.

## 1. Por qué cambia el modelo
Hoy el ticket es un **destination charge** (`transfer_data.destination = host`): Stripe transfiere al host **al capturar** (semanas antes del evento). Si hay reembolso y el host ya gastó, el clawback falla. Solución: **separate charges and transfers** — Kinlo cobra a su propio balance y transfiere al host **después** del evento.

## 2. Flujo de cobro (crear PaymentIntent)
- PaymentIntent **sin** `transfer_data` ni `on_behalf_of` → los fondos caen en el balance de **la plataforma (Kinlo)**.
- Setear `transfer_group: <eventId>` para ligar cobro↔futura transferencia.
- Montos: server-authoritative (recomputar desde Firestore, como hoy). `grossAmount` = lo que paga el attendee; `hostAmount` = precio del evento; `platformFee`/`stripeFee` = lo de Kinlo.
- Escribir un **ledger** por pago (fuente de verdad del estado del dinero).

## 3. Ledger (nueva colección `paymentLedger/{paymentIntentId}`)
```
{ paymentIntentId, eventId, hostAccountId, hostUid, attendeeUid,
  grossAmount, hostAmount, platformFee, stripeFee, currency,
  state: 'held' | 'released' | 'refunded' | 'reversed' | 'frozen',
  capturedAt, eventEndAt, releaseAt,        // releaseAt = eventEndAt + retentionHours
  transferId?, refundId?, frozen: false,
  hostPenaltyOwed: 0 }                        // (c) fee de cancelación acumulado
```
- **Reglas Firestore:** `paymentLedger` = `allow read/write: if false` (solo Admin SDK). Nunca cliente.

## 4. Liberación del pago (release) — Cloud Function programada
- Cron cada hora (`releaseHostPayouts`): query `paymentLedger where state=='held' && releaseAt <= now && frozen==false`.
- Por cada uno, **idempotente**: `stripe.transfers.create({ amount: hostAmount - hostPenaltyOwed, currency, destination: hostAccountId, transfer_group: eventId }, { idempotencyKey: 'release_'+paymentIntentId })` → set `state:'released'`, guardar `transferId`. Si ya está 'released', skip.
- `releaseAt = eventEndAt + effectiveRetentionHours(host)`. **Retención efectiva por host** = `host.payoutTier == 'super' ? 0 : settings/payouts.retentionHours`. Global default **24h**, **piso duro 0h** (validar `>= 0` al escribir y al usar — nunca negativo). Super host (tier futuro, campo ya presente) = **0h**.
- Paginar el query (evitar el bug de collectionGroup sin límite del informe de auditoría).

## 5. Reembolsos (bajo escrow)
- **Antes de release (`state=='held'`) — el caso común:** `stripe.refunds.create({ payment_intent })` desde el balance de Kinlo (SIN `reverse_transfer` — no hubo transferencia). Host recibe **$0**. Set `state:'refunded'`. Trivial y sin sangrado.
- **Después de release (`state=='released'`) — raro:** revertir la transferencia `stripe.transfers.createReversal(transferId, { amount })` + `refunds.create`. Set `state:'reversed'`. Si el host no tiene saldo → balance negativo, se cobra de payouts futuros.
- **Fee de procesamiento de Stripe:** Stripe NO lo devuelve en un reembolso. Ese costo se maneja según quién canceló (abajo).

## 6. Quién paga el fee (decisión (c) = el host, en cancelación por host)
- **Cancela el attendee:** política actual (retiene fees no-reembolsables). Sin cambio.
- **Cancela el HOST (`hostCancelEvent`):** attendee reembolsado **completo** (incluye fees). El fee de procesamiento de Stripe que no se recupera se carga al host como **penalización**: `hostPenaltyOwed += stripeFee` en el ledger. Se **neta del próximo release** del host (§4). Nunca lo come Kinlo.
- v1: no hacemos débito directo a la cuenta del host (evita malabares de balance negativo) — se netea de futuros payouts. Si el host no tiene payouts futuros, queda como deuda registrada (admin la ve).

## 7. Controles de admin (dashboard)
- **Ventana de retención (global):** campo editable `retentionHours` (default 24, **piso 0** — el form y el server rechazan negativo). Nota de riesgo: poner el global en 0 re-abre el riesgo de reembolso para TODOS los hosts; para pago instantáneo usa el tier **super host**, no bajes el global.
- **Tier de host (`payoutTier`):** dejar el campo listo (default `standard`); admin podrá marcar `super` en el futuro para retención 0h.
- **Congelar/descongelar** un payout: toggle `frozen` en el ledger (disputa/reporte) → el release lo salta hasta descongelar.
- **Ver deuda:** `hostPenaltyOwed` por host; estado de cada pago (held/released/refunded/frozen).

## 8. Casos borde (decisiones v1)
- **Cambio de fecha del evento:** recomputar `releaseAt` al editar `eventEndAt`.
- **No-show / asistencia parcial:** fuera de v1 → se libera completo. (Roadmap: liberar según check-ins.)
- **Disputa/chargeback (webhook `charge.dispute.created`):** auto-`frozen:true` + notificar admin.
- **Evento multi-attendee:** un doc de ledger **por pago** (no agregado) → refund/freeze granular.
- **Host sin cuenta Stripe Connect al momento del release:** dejar 'held', reintentar, notificar host+admin.

## 9. Qué NO cambia
- Montos server-authoritative. Webhooks de Stripe con verificación de firma. Locks de Firestore de `payments/memberships` a solo-servidor. La verificación de firma de MP (fix aparte del informe).

## 10. Fixes de pago independientes del escrow (van igual, en paralelo)
Del informe de auditoría, NO dependen de escrow — hacerlos aparte:
- `createMembershipPaymentIntent` / `createPromotionPaymentIntent`: agregar auth (verifyBearer, userId del token).
- `reserveMembershipCredit`: envolver en `runTransaction`.
- Idempotencia del handler de ticket (`paymentWebhook.js:449`).
