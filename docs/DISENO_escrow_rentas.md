# DISEÑO — Escrow para rentas, servicios (slot) y tips · B3

> **Extiende `docs/DISENO_escrow_pagos.md`** (escrow de tickets de evento). Ese doc es
> la fuente de verdad de la **mecánica compartida**: ledger `paymentLedger`, estados
> `held/released/refunded/reversed/frozen`, cron `releaseHostPayouts`, refunds
> ledger-aware, penalty §6, admin §7. **Este doc define SOLO los deltas** para rentas,
> servicios *slot* y tips. NO re-implementes la mecánica: **reúsa `functions/stripe/escrow.js`
> y `functions/stripe/refunds.js`.**
>
> El plugin YA empezó B3 improvisando y se pausó. **Descarta lo improvisado y construye
> EXACTO contra este doc.** NO merge: QA revisa el PR.

---

## 0. Por qué este doc (estado actual)

`reserveVehicle` (index.js:**3432**, PI ~3557) y `reserveServiceBooking` (:**3685**, PI ~3805)
cobran con **destination charge + `on_behalf_of: host`**. Hoy el host es Merchant of Record
(MoR) y **ya absorbe los contracargos de pago**. Los eventos, antes del escrow, NO tenían
`on_behalf_of` — por eso ahí sí sangraba Kinlo.

Aquí el escrow **NO frena un sangrado activo**. Se hace por:
1. **Fiabilidad de reembolso** — retener el dinero evita el `reverse_transfer`, que falla si
   el host ya retiró (deja al host en negativo o deja el reembolso a medias).
2. **Consistencia** — un solo ledger / cron / path de refund para todo el marketplace.
3. **Ventana de retención + freeze** — poder congelar en disputa (§8 del doc de eventos).

## 1. Decisión de responsabilidad (MoR) — LOCKEADA

Bajo escrow (separate charges + transfers) se cobra al balance de Kinlo **sin `on_behalf_of`**
→ **Kinlo pasa a ser MoR**. Kinlo absorbe **solo los contracargos de PAGO**.

**NO** absorbe daño / robo / uso indebido del vehículo. El **depósito y cualquier daño/robo se
liquidan OFF-PLATFORM** entre host y renter — ya es así hoy (comentario en `reserveVehicle`:
*"the deposit/damage/theft are settled off-platform"*; `completeRental`: *"BondVibe does not
hold a deposit"*). O sea: el cambio de responsabilidad es **acotado a contracargos de pago**,
no a responsabilidad física. Y está hedgeado porque Kinlo retiene los fondos durante la
ventana: la mayoría de reembolsos salen del dinero retenido (sin clawback) y una disputa
congela el ledger.

**Alternativa descartada** — "preservar host = MoR" (manual capture / hold en tarjeta, o
separate charges manteniendo la liability del host): añade complejidad real, no encaja limpio
en el modelo de eventos, y el único beneficio (dejar los contracargos de pago en el host) no
compensa perder la fiabilidad de reembolso y la consistencia. Lo ÚNICO que reabriría esto: una
obligación legal en MX de que el host DEBA ser MoR en rentas de vehículo. **Carlos: si eso
aplica, dilo antes de construir.**

## 2. Scope

**DENTRO:** `reserveVehicle` (rentas de vehículo) · `reserveServiceBooking` (servicios modo
**slot**) · tips (§6, decisión distinta).

**FUERA:** memberships y promotions (decidido: inmediato / no reembolsable / 100% plataforma) ·
servicios modo **quote** (la función ya los rechaza con `quote_only`) · depósitos de renta
(off-platform) · penalización de cancelación del host §6 para rentas/servicios (**follow-up**,
NO en este PR).

## 3. Cambio en el PaymentIntent (ambas funciones)

Cambiar el PI al modelo escrow **idéntico a `createEventPaymentIntent`**:
- **QUITAR** `on_behalf_of`, `transfer_data` y `application_fee_amount`.
- Cobrar `pricing.totalAmount` al **balance de Kinlo**.
- `transfer_group = rentalId` (renta) / `bookingId` (servicio).
- Conservar `metadata.type` (`"rental"` / `"service_booking"`) + ids (`rentalId` | `bizId`+`bookingId`).

Todo lo demás (auth + email_verified, validación, reserva atómica anti-doble-booking, cálculo
de pricing con `rentalPlatformFeePercent` / `eventPlatformFeePercent`) **NO cambia**.

## 4. Ledger — generalización de §3 (sin romper eventos)

`paymentLedger/{paymentIntentId}` gana campos genéricos:

| campo | evento | renta | servicio |
|---|---|---|---|
| `type` | `event_ticket` | `rental` | `service_booking` |
| `sourceId` | eventId | rentalId | bookingId |
| `bizId` | — | — | bizId (booking en subcolección) |
| `deliveryEndAt` | start + durationMinutes | `endAt` (retorno) | `end` (= start + durationMin) |
| `buyerUid` | attendeeUid | renterId | buyerUid |
| `hostUid` | creatorId | `businessOwnerUid \|\| ownerId` | `ownerUid` |
| `hostAmount` | hostReceives | hostReceivesCentavos | hostReceivesCentavos |

- **Conservar `eventId`** en el ledger para no romper #45 (o mapea `eventId = sourceId` cuando `type==event_ticket`).
- `releaseAt = deliveryEndAt + retentionHours` (misma ventana admin, mismo **piso 0h**).
- Kinlo retiene `grossAmount − hostAmount` (= platformFee + stripeFee), igual que eventos.

**IMPORTANTE:** NO uses `eventEndAtMs` para renta/servicio — asume `durationMinutes`, que no
existe ahí. El `deliveryEnd` de renta (`endAt`) y de servicio (`end`) ya es un **ISO string** en
el doc → pásalo directo por `dateToMillis` (el helper de a3eef33).

## 5. Webhook (`paymentWebhook.js`)

Agregar ramas para `type: "rental"` y `type: "service_booking"` que creen el ledger `held`.
**OJO:** a diferencia de eventos, los **montos NO viajan en el metadata del PI** → leerlos del doc:
- renta: `rentals/{rentalId}` → `hostReceivesCentavos`, `platformFeeCentavos`, `stripeFeeCentavos`,
  `totalCentavos`; `hostAccountId = stripeAccountId`; `deliveryEndAt = endAt`.
- servicio: `businesses/{bizId}/bookings/{bookingId}` → mismos campos; `deliveryEndAt = end`.

Mantener el resto igual que eventos: `state:'held'`, `frozen:false`, `hostPenaltyOwed:0`,
`merge:true` idempotente, ledger escrito ANTES del doc de pago.

## 6. Tips — decisión (a), NO escrow

`createTipPaymentIntent` (index.js:**968**) es destination charge **sin `on_behalf_of`** y con
`application_fee_amount: 0` → hoy Kinlo (MoR) absorbe el **100% de un tip disputado**, sin fee
que lo compense. Es la única exposición 100% de Kinlo que queda.

**Decisión:** NO meter tips al escrow (romper el UX de "regalo instantáneo al host" no vale).
En su lugar: **agregar `on_behalf_of: stripeAccountId`** al PI del tip → el host pasa a MoR y
absorbe el contracargo; el tip sigue instantáneo. Cambio de **1 línea**. Los tips **NO tocan el
ledger ni el cron**. (Hazlo en este mismo PR o en uno chico aparte — como prefiera QA.)

## 7. Release y refunds (reuso, casi sin cambios)

- **Release:** `releaseHostPayouts` + `releaseOnePayout` sirven tal cual. Único cambio: en
  `releaseOnePayout`, `transfer_group = l.sourceId` (hoy hardcodeado a `l.eventId`).
- **Refunds:** `refunds.js` es ledger-aware por `paymentIntentId`. **Verifica** que
  `held → refund` y `released → (reversal + refund)` funcionen para renta/servicio (ej.
  cancelación de renta antes y después del release). Generaliza si asume campos de evento.

## 8. Pruebas (Stripe test, cuenta Connect con capacidad de transfers)

- Captura de renta → ledger `held`, `releaseAt = endAt + retención`, no-null.
- Captura de servicio slot → ledger `held`, `releaseAt = end + retención`.
- Cancelación de renta en `held` → refund sin reversal; ledger → `refunded`.
- (si aplica) renta en `released` → reversal + refund; ledger → `reversed`.
- Tip con `on_behalf_of` → el contracargo simulado recae en el **host**, no en Kinlo.

**PR aparte. NO merge: QA revisa.**
