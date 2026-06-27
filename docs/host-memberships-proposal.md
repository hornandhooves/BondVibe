# Host Memberships — Propuesta de diseño (UX + arquitectura)

> Estado: PROPUESTA. No implementado. Para discusión.
> Audiencia: Paid Hosts tipo academia/estudio (yoga, baile, gym, idiomas) que
> venden paquetes de clases / membresías y llevan control de asistencia.

## 1. Qué es y para quién

Permitir que un **Paid Host** venda **membresías** (paquetes de créditos / clases)
y gestione a sus miembros: cuántas clases incluye, vigencia, asistencia con
descuento de créditos, recordatorios de saldo y renovación.

El asistente, al inscribirse a un evento, elige **pagar por evento** o **usar un
crédito de su membresía**; el crédito se descuenta cuando asiste (no al
reservar). Si no le quedan créditos o expiró, se le invita a renovar.

## 2. Principios UX

1. **Crédito se descuenta al asistir, no al reservar.** Lo dijiste explícito y es
   lo justo: el no-show no debería perder crédito (salvo política del host).
   → Reserva = "hold" suave; check-in del host = descuento real.
2. **El asistente siempre ve su saldo antes de decidir.** En la pantalla del
   evento: "Te quedan 3 clases · vence el 12 ago". Sin sorpresas.
3. **Renovar es un CTA, nunca un bloqueo silencioso.** Si expiró/sin créditos,
   se muestra "Renovar" + "Pagar esta clase", nunca un error seco.
4. **El host gestiona desde un solo lugar** (Host Hub), no disperso.
5. **Reusar lo que ya existe**: Stripe Connect, modelo de fees (user paga fees),
   colección `payments`, recurrencia de eventos, notificaciones push.

## 3. Modelo de datos (Firestore)

### `membershipPlans/{planId}` — plantilla que define el host
```
hostId            // creatorId del host
name              // "10 clases", "Mensualidad ilimitada"
description
type              // "credits" | "unlimited"
creditsIncluded   // n (si type=credits)
validityDays      // vigencia desde la compra (ej. 30, 60, 90)
priceCentavos     // precio en centavos
currency          // "MXN"
active            // bool (archivar sin borrar historial)
createdAt / updatedAt
```

### `memberships/{membershipId}` — instancia comprada por un usuario
```
userId
hostId
planId
planName          // snapshot del nombre al momento de compra
type              // "credits" | "unlimited"
creditsTotal      // snapshot
creditsRemaining  // se descuenta al asistir
purchasedAt
expiresAt         // purchasedAt + validityDays
status            // "active" | "expired" | "depleted" | "cancelled"
paymentId         // ref a payments
createdAt / updatedAt
```

### `membershipRedemptions/{redemptionId}` — auditoría de cada descuento
```
membershipId
userId
hostId
eventId
eventTitle
creditsDeducted   // normalmente 1
redeemedAt        // momento del check-in
redeemedBy        // host uid (quién tomó asistencia)
status            // "redeemed" | "reversed" (si se revierte por error)
```

### Cambios menores a `events`
```
acceptsMembership // bool — si este evento admite créditos de membresía
creditCost        // default 1 (clases que cuesta; algunos talleres valen 2)
```

> El descuento de crédito se debe hacer en **Cloud Function / transacción**
> (no solo cliente) para evitar doble gasto y respetar reglas de seguridad.

## 4. UX del Host — nuevo "Host Hub"

Hoy el host no tiene panel propio. Propongo un **Host Hub** accesible desde
Profile ("Manage hosting") y/o un acceso en Home para Paid Hosts. Secciones:

### a) Membership Plans
- Lista de planes (activos/archivados).
- Crear/editar plan: nombre, tipo (créditos/ilimitada), # créditos, vigencia,
  precio. Preview de "qué verá el alumno".
- Archivar (no borrar) para no romper membresías vendidas.

### b) Members (registro de usuarios con membresía)
- Lista buscable: nombre, plan, **créditos restantes**, **vence**, estado
  (badge verde/ámbar/rojo).
- Filtros: activos / por vencer / vencidos / agotados.
- Orden por vencimiento próximo (lo más accionable arriba).

### c) Member detail
- Historial de compras, créditos, asistencias (redemptions).
- Acciones: ajustar créditos manualmente (con motivo), enviar recordatorio,
  marcar renovación, cancelar.

### d) Attendance / Check-in (clave)
- En cada evento, vista "Tomar asistencia": lista de inscritos.
- Por cada asistente que llegó → "Check-in" → descuenta 1 crédito (si vino con
  membresía) o marca asistencia (si pagó). Confirmación visual del saldo nuevo.
- Caso borde: si reservó con membresía pero ya no tiene crédito al momento del
  check-in (expiró entre reserva y clase) → host ve alerta y opción "cobrar" o
  "cortesía".

## 5. UX del Asistente

### Al inscribirse a un evento (RSVP / Checkout)
Si el evento `acceptsMembership` y el host vende membresías, mostrar **selector**:

```
¿Cómo quieres asistir?
( ) Usar 1 crédito de membresía    → "Te quedan 3 · vence 12 ago"
( ) Pagar esta clase  $150 MXN

[Confirmar]
```

Lógica:
- **Con membresía válida y créditos** → reserva con "hold" de 1 crédito.
- **Sin créditos / expirada** → el radio de membresía se ve deshabilitado con
  CTA "Renovar membresía" (abre compra de plan) + sigue disponible "Pagar
  esta clase".
- **No tiene membresía** pero el host vende → mostrar "¿Primera vez? Compra un
  paquete y ahorra" (cross-sell suave) además de pagar la clase.

### "My Memberships" (en Profile del asistente)
- Tarjetas por membresía: host, plan, créditos restantes (anillo de progreso),
  fecha de vencimiento, botón "Renovar".
- Historial de asistencias que descontaron crédito.

## 6. Pagos

- Compra de membresía = pago Stripe al host vía **Stripe Connect** existente.
- Reusar el modelo "user paga fees": `createMembershipPaymentIntent`
  (clonando `createEventPaymentIntent`), con `metadata.type = "membership"`.
- Webhook crea el doc `memberships` con `creditsRemaining = creditsIncluded` y
  `expiresAt`. (Igual que hoy el webhook agrega attendees.)
- Nuevo `payments.type = "membership"`.

## 7. Recordatorios (Cloud Functions programadas)

`onSchedule` diaria que recorre `memberships` activas:
- **Saldo bajo** (≤ 2 créditos): push + notif in-app "Te quedan 2 clases".
- **Por vencer** (7 días y 1 día antes de `expiresAt`): "Tu membresía vence
  pronto · Renovar".
- **Vencida** (al pasar `expiresAt`): cambia `status=expired` + notif "Venció ·
  Renovar". (También marcar `status=depleted` cuando `creditsRemaining=0`.)

Reusa el sistema de notificaciones/push que ya existe.

## 8. Descuento de crédito — flujo técnico seguro

1. RSVP con membresía → Cloud Function `reserveMembershipCredit` valida
   (activa, con créditos, evento acepta membresía) y crea reserva (hold).
2. Host check-in → `redeemMembershipCredit` (transacción):
   - relee membership, valida, `creditsRemaining -= creditCost`,
   - crea `membershipRedemptions`, si llega a 0 → `status=depleted`.
3. Cancelación dentro de ventana → `releaseMembershipCredit` revierte el hold.

> Hacerlo server-side evita doble gasto y condiciones de carrera; las reglas de
> Firestore deben prohibir que el cliente modifique `creditsRemaining`
> directamente.

## 9. Recomendación de fases (MVP primero)

**Fase 1 — MVP (vende y descuenta):**
- Host crea planes · alumno compra (Stripe) · "My Memberships" · selector
  pago/crédito en RSVP · host toma asistencia y descuenta crédito · lista de
  miembros con saldo/vencimiento.

**Fase 2 — Retención:**
- Recordatorios automáticos (saldo bajo, por vencer, vencida) · flujo de
  renovación de 1 toque.

**Fase 3 — Avanzado:**
- Planes ilimitados / auto-renovación (suscripción Stripe recurrente) ·
  analítics del host (ingresos, asistencia, churn) · ajustes masivos.

## 10. Decisiones (CERRADAS)

1. **Modelo**: AMBOS — paquetes de créditos (N clases) **y** ilimitada por tiempo.
2. **Descuento**: al **check-in del host** (la reserva pone hold, el check-in
   descuenta).
3. **Renovación**: AMBAS — recompra manual **y** auto-renovación (suscripción
   Stripe recurrente).
4. **Cancelación/no-show**: se **devuelve el crédito si cancela ≥ 2 h antes** del
   inicio del evento. Dentro de las 2 h, el crédito se pierde (hold se convierte
   en consumo).
5. **Alcance**: Fase 1 + Fase 2 + (de Fase 3, **solo analytics del host**).

### Implicaciones de "ambos" e "ilimitada"
- `membershipPlans.type`: "credits" | "unlimited".
- En planes `unlimited` no hay `creditsRemaining`; la validez es solo por fecha
  (`expiresAt`). El check-in marca asistencia pero **no descuenta** crédito.
- Auto-renovación usa **Stripe Subscriptions** sobre el Connected Account del
  host. `memberships.autoRenew = true`, `stripeSubscriptionId`. El webhook de
  `invoice.paid` renueva créditos / extiende `expiresAt`.

## 11. Plan de construcción (rebanadas verticales)

Cada rebanada es demostrable y se commitea/valida por separado.

- **Slice 1 — Fundación + planes del host** *(en curso)*: reglas + índices +
  `membershipService` (CRUD de planes) + Host Hub + pantalla "Membership Plans"
  (crear/listar/archivar) + accesos en Profile/Home para Paid Hosts.
- **Slice 2 — Compra de membresía**: `createMembershipPaymentIntent` + webhook
  crea `memberships` + pantalla de compra + "My Memberships" del alumno.
- **Slice 3 — Reserva y check-in**: selector pago/crédito en RSVP (hold) +
  pantalla de asistencia del host + `redeemMembershipCredit` (transacción) +
  devolución de crédito en cancelación ≥ 2 h.
- **Slice 4 — Recordatorios (Fase 2)**: Cloud Function programada (saldo bajo,
  por vencer, vencida) + renovación de 1 toque.
- **Slice 5 — Auto-renovación (Fase 2)**: Stripe Subscriptions + webhooks de
  invoice + toggle de auto-renew.
- **Slice 6 — Analytics del host (Fase 3 parcial)**: ingresos, miembros activos,
  asistencia, por vencer/churn.
