# Kinlo · Community Matching — Handoff para Claude Code (VS Code)

> **App / producto: Kinlo.** (El repo puede seguir llamándose `bondvibe`; es el nombre interno. En UI y copys usa **Kinlo**.)
> Pega este archivo en la **raíz del repo** y ábrelo con Claude Code.
> Referencia visual: `Kinlo Community Matching v2.dc.html` (canvas con las 4 fases + estados de pago E1–E4).
> Stack asumido: Expo / React Native + Firebase (Firestore, Auth, Cloud Functions) + Stripe.
> **Regla de oro:** las pantallas nuevas DEBEN respetar el sistema de diseño de §7 (tema "Clean" de Kinlo). No inventes estilos nuevos.

Tiers: **Kinlo Pro** = suscripción del **anfitrión** (incluye Community Matching). **Kinlo Plus** = suscripción del **asistente** (matches ilimitados).

---

## 0.1 PROMPT para pegar en Claude Code
```
Lee HANDOFF_COMMUNITY_MATCHING.md en la raíz. Vas a implementar la feature "Community Matching"
en la app Kinlo (Expo/React Native + Firebase + Stripe) siguiendo ese documento al pie de la letra.

Reglas duras (no negociables):
- El matching se abre DESPUÉS del evento (gating temporal); durante el evento está bloqueado (pantalla B2).
- Hay tope de matches por evento; al superarlo, el asistente pasa a Kinlo Plus (paywall C4 → checkout E3).
- Community Matching es feature de Kinlo Pro (anfitrión); si el host no es Pro, mostrar upsell (E1/E2).
- Respeta el sistema de diseño del §7 (tema Clean). Reutiliza ThemeContext, theme-tokens.js,
  CategoryIcon y AvatarFrame. NO inventes estilos ni dupliques tokens.

Implementa en este orden y detente a que yo revise cada bloque:
1. Data model Firestore + security rules (§4).
2. Cloud Functions (§5): ventanas de tiempo, límite de matches y Stripe (Kinlo Pro y Kinlo Plus).
3. Gating de estado (§3): ocultar grid y mostrar B2 hasta opensAt.
4. Pantallas A1–D4 + estados de pago E1–E4 (§6) con los copys del §8.
5. Paywalls + Stripe checkout (§10).

No toques flujos existentes fuera de este alcance. Antes de escribir código, dame el plan de
archivos que vas a crear/editar y espera mi OK.
```

## 0.2 Cómo trabajar (para Claude Code)
1. Lee §1–§3 (feature + reglas de negocio).
2. Implementa en el orden del prompt (§0.1).
3. Reutiliza componentes existentes: `ThemeContext`, `theme-tokens.js`, `CategoryIcon`, `AvatarFrame`.
4. Cada pantalla debe verse como los mockups. §7 es la fuente de verdad de estilo.
5. No cambies el flujo aprobado: matching **post-evento** + **tope con paywall**.

---

## 1. Resumen de la feature
Community Matching permite que los **asistentes de un evento** se conozcan **con un propósito** (no es dating): Friend / Professional / Romantic. Es **opt-in**, **privacidad primero**, y solo está disponible si el anfitrión tiene **Kinlo Pro**.

Reutiliza lo que ya existe en el proyecto:
- **Test de personalidad** → alimenta el `% de compatibilidad` y el orden de la grilla.
- **AI** → sugiere "N personas encajan contigo" y genera rompehielos.
- **QR de check-in** → confirma asistencia (descuenta 1 crédito Pro) y condiciona quién aparece.

## 2. Reglas de negocio CLAVE
1. **El matching se abre DESPUÉS del evento (gating temporal).**
   - Durante el evento está **bloqueado** (pantalla B2): no queremos gente en el teléfono; genera expectativa/curiosidad.
   - El **host** define cuándo abre: `now` | `1h_before` | `after_checkin` | **`after_event` (default)** y cuándo cierra: `24h` | `3d` | `1w` | `forever`.
2. **Tope de matches → paywall Kinlo Plus (asistente).**
   - El host fija `maxMatches`: `10` | `20` | `50` | `unlimited`.
   - Asistente con `plan == 'free'` que alcanza `maxMatches` → paywall Kinlo Plus (C4 → checkout E3 → éxito E4). Con `plan == 'kinlo_plus'` → ilimitado.
3. **Community Matching = feature de Kinlo Pro (host).**
   - Solo visible/activable si `users/{host}.hostPlan == 'pro'`. Si no, upsell Kinlo Pro (E1 → checkout E2).
4. **Privacidad/consentimiento** (§9): opt-in explícito, doble consentimiento para mensajería, el host nunca ve quién dio like a quién.

## 3. Flujo / máquina de estados
```
Compra boleto → (Opt-in A1) → (Consentimiento A2) → (Perfil A3) → (Looking-for A4)
     │
     ├─ Durante el evento:  Check-in QR (B1)  →  Matching BLOQUEADO (B2)   [now < opensAt]
     │
     └─ opensAt (p.ej. fin del evento):
            Grid "Quién estuvo aquí" (C1) → Perfil (C2) → like
                 ├─ like recíproco → MATCH (C3) → mensajería (si allowMessaging)
                 └─ matchCount == maxMatches && plan==free → PAYWALL (C4) → Checkout Stripe (E3) → ¡Activado! (E4)
            → cierra en closesAfter → "Personas que conociste" (D1, retención)

Host sin Pro → intenta activar Matching (D2) → upsell Kinlo Pro (E1) → Checkout Stripe (E2) → Pro activo
```
`event.matching`: `disabled` → `enabled_locked` (antes de opensAt) → `open` (opensAt..closesAt) → `closed`.

## 4. Modelo de datos (Firestore) + reglas
```
events/{eventId}
  matching: {
    enabled: bool,
    isProFeature: true,
    types: ['friend'|'professional'|'romantic'],
    opensAt: 'now'|'1h_before'|'after_checkin'|'after_event',
    opensAtResolved: Timestamp,
    closesAfter: '24h'|'3d'|'1w'|'forever',
    closesAtResolved: Timestamp,
    allowMessaging: bool,
    maxMatches: 10|20|50|-1        // -1 = ilimitado
  }

matchProfiles/{eventId}/attendees/{userId}
  photoUrl, displayName, age?, bio, interests[], profession, languages[],
  lookingFor[], icebreaker, available: bool,
  visibility: 'everyone'|'same_gender'|'opposite_gender'|'organizer'|'hidden',
  checkedIn: bool, checkedInAt, consentAt

likes/{eventId}/edges/{fromUid}_{toUid}      // PRIVADO (host nunca lo lee)
matches/{eventId}/pairs/{matchId}            // matchId = sort(uidA,uidB).join('_')
matchChats/{matchId}/messages/{msgId}        // solo con match + allowMessaging

users/{uid}
  plan: 'free'|'kinlo_plus', planRenewsAt?, stripeCustomerId?,
  hostPlan: 'none'|'pro', hostProRenewsAt?,
  matchCountByEvent: { [eventId]: number }
```
**Security rules (resumen):**
- `matchProfiles`: lectura solo por usuarios con `checkedIn == true` del MISMO evento y según `visibility`. Escritura solo del dueño.
- `likes`: create solo por `from == auth.uid`. **Lectura del host PROHIBIDA**; solo Functions.
- `matches`/`matchChats`: solo los dos `users` del match.
- `events/{}.matching`: escritura solo por el host y solo si `hostPlan == 'pro'`.
- Analytics del host = doc agregado escrito por Function; nunca expone pares ni likes.

## 5. Cloud Functions
- `resolveMatchingWindow(eventId)` — calcula `opensAtResolved`/`closesAtResolved` desde la hora fin del evento.
- `openMatchingOnEventEnd` (scheduled/trigger) — `enabled_locked → open` al llegar `opensAtResolved`; push "el matching abrió".
- `createLikeAndMaybeMatch(eventId, toUid)` — transacción: valida ventana abierta + `checkedIn`; **valida `matchCount < maxMatches` o `plan=='kinlo_plus'`**; crea like; si hay recíproco crea `match` (+ chat si `allowMessaging`) e incrementa `matchCountByEvent`.
- `closeMatching` (scheduled) — `open → closed` en `closesAtResolved`.
- `aggregateHostAnalytics(eventId)` — participantes, matches, conversaciones, `plusUpgrades`; nunca expone pares.
- **Stripe:**
  - `startHostProCheckout(uid)` — suscripción Kinlo Pro; webhook set `hostPlan='pro'`.
  - `startKinloPlusCheckout(uid)` — suscripción Kinlo Plus; webhook set `plan='kinlo_plus'`.
  - `stripeWebhook` — maneja `customer.subscription.created/updated/deleted` para setear/limpiar `hostPlan`/`plan`.

## 6. Pantallas (mapa a los mockups v2)
| ID | Pantalla | Nota |
|----|----------|------|
| A1 | Opt-in post-compra | Sheet tras checkout. "Se abre al terminar". |
| A2 | Consentimiento | 4 puntos + Aceptar → `consentAt`. |
| A3 | Perfil de matching | Switch Público/Matching. Doc `matchProfiles`. |
| A4 | ¿Qué buscas? | Chips contextuales según `types`. |
| B1 | Check-in QR | `checkedIn=true` + crédito Pro. Copy: abre al terminar. |
| **B2** | **Bloqueado (NUEVO)** | Si `now < opensAtResolved`. Lock + countdown + teaser BLUR + "Avísame". |
| C1 | Grid "Quién estuvo aquí" | Solo `checkedIn`. Banner "terminó · abierto". Banner AI (test). |
| C2 | Perfil de alguien | Me interesa / pasar / mensaje. Reportar/Bloquear/Ocultar. |
| C3 | Match | Overlay al recíproco. Mensajería si `allowMessaging`. |
| **C4** | **Paywall Kinlo Plus (NUEVO)** | Cuando `matchCount==maxMatches && plan=='free'`. |
| D1 | Personas que conociste | Post-cierre. Retención → próximo evento. |
| **D2** | **Host controls (Kinlo Pro)** | Badge PRO. Default `opensAt='after_event'`. Tope 10/20/50/∞. |
| D3 | Host analytics | Solo agregados + "Asistentes en Kinlo Plus". |
| D4 | Visibilidad & seguridad | 5 opciones + borrar datos + salir. |
| **E1** | **Upsell Kinlo Pro (NUEVO)** | Host sin Pro. Beneficios + precio ($29/mes) + "Hazte Pro". |
| **E2** | **Checkout Kinlo Pro (NUEVO)** | Stripe. Resumen plan + método + total. |
| **E3** | **Checkout Kinlo Plus (NUEVO)** | Stripe. Desde C4. $7/mes. |
| **E4** | **Kinlo Plus activado (NUEVO)** | Éxito. "Matches ilimitados" → volver al matching. |

## 7. Sistema de diseño — DEBE respetarse (tema "Clean")
**Tipografía**
- Títulos, números, precios, badges: **Space Grotesk** (600/700).
- Cuerpo, listas, labels: **Plus Jakarta Sans** (400–800).

**Colores**
- Fondo app `#F1F0F4` · Tarjeta `#FFFFFF` · Marco teléfono `#DDDAE4`.
- Texto: tinta `#1a1d29` · secundario `#5b6072` · atenuado `#8a8f9c` / `#9aa0ac`.
- Bordes/hairlines: `#EDEBF2`, `#E7E5EE`.
- **Gradiente de marca** (CTAs primarios): `linear-gradient(135deg,#7C3AED,#C026D3,#FF3E9A)`. Sólido `#7C3AED`; superficie violeta suave `#F1E9FE`.
- **Tipos de match:** Friend `#1F8A6E`/`#E1F5EC` · Professional `#4F5BD5`/`#E6EAFB` · Romantic `#E91E8C`/`#FBE4F1`.
- Avatares pastel: `#ECE6FB #FBE4F1 #E6EAFB #E1F5EC #FBEDE4`.
- Superficies oscuras (check-in / paywall): `#1a1622` / `#160F22`; acento lila `#C792EA`.
- Éxito `#1F8A6E` · alerta cálida `#B45309`/`#FBEFD6` · peligro `#c25b5b`.

**Forma / elevación**
- Radios: tarjetas 16–22, chips/píldoras full, botón 26–27, marco 34/46, avatares circulares.
- Sombra tarjeta: `0 1px 3px rgba(0,0,0,.06–.08)`. Flotantes: `0 10px 30px rgba(30,20,50,.14)`.
- Selección: borde 2px del color; no seleccionado 1.5px `#EDEBF2`.

**Componentes**
- **Botón primario:** alto 54, radio 27, gradiente de marca, texto `#fff` 16/700, sombra `0 10px 22px rgba(124,58,237,.3)`.
- **Botón secundario:** blanco, sombra suave, texto `#8a8f9c`/`#7C3AED` 700.
- **Segmented control:** track `#E7E5EE`, item activo blanco con sombra o gradiente.
- **Toggle:** 46×28, on `#1F8A6E`/gradiente; thumb blanco 22.
- **Tab bar:** píldora flotante blanca radio 35, activo pastilla `#F1E9FE` + ícono `#7C3AED`.
- **Chips:** píldora 12.5/600; seleccionado borde de marca + check.
- **Badge PRO:** píldora gradiente de marca + ícono corona + "PRO" 11/800 blanco.
- **Barra de estado:** 9:41 + señal/wifi/batería; blanco sobre fondos oscuros.
- **Tarjeta de pago (Stripe):** rect 40×28 gradiente `#1a1f36→#3a4166`, "•••• 4242", "vía Stripe", pie "Pago seguro vía Stripe" con candado.

**Íconos:** estilo lucide, `stroke-width` 1.9–2, `round`, sin relleno (salvo corazón lleno en "Me interesa"). Reutilizar `CategoryIcon`.

**Layout mobile:** ancho 416, padding lateral 20, alto tarjeta 864. Hit targets ≥44px. Cuerpo 13.5–14.5, captions ≥11. Espaciado con flex/grid + `gap` (9–16).

## 8. Copys (ES) — usar tal cual
- Opt-in (A1): **"Este evento incluye Community Matching"** · "Se abre al terminar el evento." · `Sí, quiero participar` / `No, gracias`.
- Bloqueado (B2): **"Se abre cuando termine el evento"** · "Disfruta el evento y conoce gente en persona." · `Avísame cuando abra`.
- Post-evento (C1): **"El evento terminó · el matching está abierto"**.
- Paywall (C4): **"Alcanzaste tus 20 matches"** · "Sigue conociendo gente con Kinlo Plus." · `Hazte Kinlo Plus` / `Tal vez luego`.
- Host (D2): badge **PRO** · "Incluido en tu plan Kinlo Pro" · "Al superar el tope, el asistente pasa a Kinlo Plus para seguir."
- Upsell Pro (E1): **"Activa Community Matching con Kinlo Pro"** · `Hazte Pro` / `Ahora no`.
- Checkout Pro (E2): `Suscribirme · $29/mes`. Checkout Plus (E3): `Suscribirme · $7/mes`.
- Éxito Plus (E4): **"¡Ya eres Kinlo Plus!"** · "Matches ilimitados desbloqueados." · `Volver al matching`.

## 9. Privacidad, Términos y Responsabilidad (legal)
> Objetivo: que **Kinlo** no sea responsable por problemas de encuentros/conducta que no controla. **Revisar con abogado** y adaptar a jurisdicción.

**Consentimiento & datos**
- Participación **opcional** y por **opt-in**; registrar consentimiento con timestamp.
- Datos: preferencias, intereses, likes, matches, mensajes (moderación/anti-acoso), perfil.
- Compartición: **solo** con asistentes del mismo evento; nunca público ni buscable. Mensajería solo tras **match mutuo**.
- Derechos: borrar historial, borrar mensajes, salir del matching (eliminación efectiva).
- Acceso del organizador: **nunca** ve quién dio like a quién; solo agregados.
- Contacto (teléfono/correo/redes/ubicación) oculto hasta consentimiento mutuo.

**Cláusulas de responsabilidad (T&C)**
1. **Plataforma neutral.** Kinlo provee una herramienta para conectar asistentes; no organiza, patrocina ni supervisa reuniones ni controla la conducta de los usuarios.
2. **Sin verificación de antecedentes.** No verificamos identidad ni antecedentes. El usuario interactúa y se reúne **bajo su propio riesgo**.
3. **Asunción de riesgo.** Conocer personas —en línea o en persona— conlleva riesgos que el usuario acepta.
4. **Sin garantías ("AS IS").** Servicio "tal cual", sin garantía de resultados, compatibilidad, seguridad o conducta de terceros.
5. **Limitación de responsabilidad.** En la máxima medida legal, Kinlo no responde por daños indirectos, incidentales o consecuentes; responsabilidad total limitada a lo pagado en los últimos 12 meses (o el mínimo legal).
6. **Indemnización.** El usuario mantiene indemne a Kinlo por reclamos derivados de su uso, conducta o encuentros.
7. **Conducta & +18.** Solo mayores de 18. Prohibido acoso, contenido ilícito, suplantación, uso comercial no autorizado. Podemos suspender cuentas.
8. **Responsabilidad del organizador.** Seguridad, logística y legalidad del evento son del host, no de Kinlo.
9. **Moderación & reportes.** Ofrecemos reportar/bloquear/ocultar; el usuario debe reportar abusos. Podemos conservar mensajes para moderación.
10. **Ley aplicable y disputas.** [Definir jurisdicción] y arbitraje/vía de resolución.

## 10. Modelo de negocio (fases) + gating
- **Fase 1 (Launch):** fee por boleto + **Kinlo Pro** (host, incluye Community Matching). Gate: matching solo si `hostPlan=='pro'`. Precio host sugerido ~$29/mes (−20% anual).
- **Fase 2:** **Kinlo Plus** (asistente, $5–10/mes; usamos $7) + recomendaciones AI. Gate: `maxMatches` → paywall (C4→E3). Stripe subscription.
- **Fase 3:** sponsors post-match, analíticas anónimas para hosts, paquetes corporativos.
- **Fase 4:** networking entre comunidades, concierge de relaciones AI, planes enterprise (conferencias).

## 11. Checklist de implementación
- [ ] `events.matching` (§4) + editor host (D2), default `opensAt='after_event'`.
- [ ] Resolver ventanas por Function.
- [ ] Gating: ocultar grid y mostrar B2 mientras `now < opensAtResolved`.
- [ ] Opt-in (A1) + consentimiento (A2) con timestamps.
- [ ] `matchProfiles` + visibilidad + switch público/matching (A3, A4, D4).
- [ ] Check-in QR marca `checkedIn` + crédito Pro (B1).
- [ ] `createLikeAndMaybeMatch` con `maxMatches` + plan.
- [ ] Gate Kinlo Pro para activar matching + upsell (E1/E2).
- [ ] Paywall Kinlo Plus (C4→E3→E4) + Stripe + webhook.
- [ ] Analytics agregadas (D3) sin exponer pares.
- [ ] Security rules (§4) + test: host no puede leer `likes`.
- [ ] T&C y política (§9) integrados en onboarding.
- [ ] QA visual contra `Kinlo Community Matching v2.dc.html` (§7).
