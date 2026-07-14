# Kinlo — Notas de trabajo

## `joinEvent` — Deploy 1 HECHO ✅ · Deploy 2 (regla) PENDIENTE

**Estado:** la función `joinEvent` está construida + desplegada, y los 2 call-sites
de cliente (EventDetailScreen + HowToAttendScreen) ya la usan. E2E 59/59 (cupo
atómico, idempotente, rechaza evento de pago). La regla sigue **permisiva** a
propósito → **Deploy 2 (endurecer attendees) NO se ha hecho**: hacerlo ahora
rompería el TestFlight actual (que aún usa arrayUnion directo). Desplegar la regla
endurecida (diff abajo) **solo después** de que un build nuevo con joinEvent esté
adoptado por los testers.

---

## (Original) Diseño de `joinEvent` — referencia

### Problema
El cupo de eventos se valida **solo en cliente y NO de forma atómica** →
riesgo de **overbooking** por carrera (dos usuarios leen el mismo snapshot,
ambos pasan el chequeo, ambos hacen `arrayUnion`). Además las reglas permiten
que cualquier signed-in se auto-agregue a `attendees` sin tope server-side.

### Modelo del dato (hoy)
- `attendees` = **array de UID strings** (canónico; docs legacy pueden tener
  objetos `{userId}`, normalizados por `getAttendeeIds()` en `utils/eventHelpers.js`).
  No es subcollection ni contador.
- Cupo = campo numérico `maxAttendees || maxPeople`.
- `participantCount`: existe pero se setea en `0` al crear y **nunca se actualiza**
  (campo muerto). El conteo real = `attendees.length`.
- Patrón de referencia ya existente: `redeemMembershipCredit` en
  `functions/index.js` usa `db.runTransaction`.

### Las 3 rutas de join (estado actual)
| Ruta | Dónde | Cómo agrega |
|------|-------|-------------|
| Evento gratis (A) | `src/screens/EventDetailScreen.js:272` (`proceedJoinPayOrFree`) | `arrayUnion` directo en cliente |
| Evento gratis (B) | `src/screens/HowToAttendScreen.js:93` (`handlePay`, fallback gratis) | `arrayUnion` directo en cliente |
| Pago | `functions/stripe/paymentWebhook.js:210` | `arrayUnion` (Admin SDK, post-pago) |
| Membresía | `src/screens/HowToAttendScreen.js:67` → `reserveMembershipCredit` (`functions/index.js:757`) | ya es Cloud Function (pero su `arrayUnion` tampoco valida cupo atómico) |

> OJO: HowToAttendScreen:93 NO es membresía — es un **2º call-site de join GRATIS**
> que sobrevive. Hay que migrar **ambos** call-sites de join gratis (A y B).

### Diseño de `joinEvent` (acordado, falta implementar)
- **Params:** `{ eventId }`. El `uid` viene de `request.auth` (no confiar en el cliente).
  No hace falta "tipo": `joinEvent` es solo para **eventos GRATIS**.
- **Validar en la transacción:**
  - Evento existe.
  - `status === "active"` (no cancelado).
  - **`price` es 0/ausente** ← crítico (si no, dejaría entrar gratis a eventos de pago).
  - No está lleno: `attendees.length < (maxAttendees || maxPeople)` → si no, `event_full`.
  - No es pasado (`event.date >= ahora`).
  - Idempotente: si ya es asistente, retornar éxito sin duplicar.
- **Membresía:** mantener `reserveMembershipCredit`, pero **agregarle el mismo
  chequeo de cupo dentro de su transacción**.
- **Pago:** el webhook queda **separado** (ya es server-side). Follow-up recomendado:
  validar cupo al **crear el PaymentIntent** (reservar lugar antes de cobrar).

### Regla de Firestore endurecida (PROPUESTA — no aplicada, pendiente de aprobar)
Reemplazar el branch permisivo `onlyUpdating(['attendees'])` por uno que permita
**solo SALIR** (quitarse a sí mismo); unirse pasa solo por `joinEvent`:

```
// Attendees: el cliente solo puede SALIR (quitarse a sí mismo).
// Unirse es server-only (joinEvent) para cupo atómico.
(request.resource.data.diff(resource.data)
   .affectedKeys().hasOnly(['attendees']) &&
 request.auth.uid in resource.data.attendees &&
 !(request.auth.uid in request.resource.data.attendees) &&
 request.resource.data.attendees.size() == resource.data.attendees.size() - 1)
```
- ✅ Salir sigue funcionando (quita exactamente 1, el propio uid).
- ✅ Unirse directo desde cliente queda bloqueado → forzado por `joinEvent`.
- ✅ No puede quitar a otros.
- ⚠️ Asume `attendees` como UID strings (legacy con objetos no podría "salir").
- ℹ️ `reserveMembershipCredit` y el webhook usan Admin SDK → no les afecta la regla.

### Plan de deploy (2 deploys, la regla AL FINAL)
1. **Deploy 1:** `joinEvent` (función) + migrar los **2** call-sites de join gratis
   (EventDetailScreen:272 y HowToAttendScreen:93) a `joinEvent` + chequeo de cupo
   en `reserveMembershipCredit` → **build nuevo**. (Regla aún permisiva → nada se rompe.)
2. **Esperar adopción** del build por los testers.
3. **Deploy 2:** la **regla endurecida** de `attendees`. (Desplegarla antes rompe el
   join en cualquier device en build viejo que aún hace `arrayUnion` directo.)

Razón del orden: la regla es instantánea/global; el fix del cliente llega por build
(gradual). En TestFlight con pocos testers se puede comprimir: deploy función → build
→ cuando testers actualicen → deploy regla.
