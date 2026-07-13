# Kinlo — Handoff de desarrollo

> **Para:** Claude Code (VS Code)
> **Repo base:** `hornandhooves/BondVibe` · rama `main`
> **Referencia visual:** `Kinlo - Flujo Eventos (Actual).dc.html` (sección FINAL: F1–F4)
> **Alcance:** navegación + Profile + modo Attending/Hosting + tab Business condicional + simplificación de Events. **NO** incluye el rediseño del Business Hub (se mantiene) ni el Marketplace de servicios (pausado).

---

## 0. Reglas para el desarrollo

1. **Trabaja sobre el código real del repo.** Antes de tocar nada, LEE los archivos listados en cada tarea. No inventes nombres de props, rutas ni componentes: confírmalos en el repo.
2. **Respeta el design system existente:** tokens en `src/constants/theme-tokens.js` (tema *Warmth*/Clean por defecto), tipografías Space Grotesk + Plus Jakarta Sans, morado primario `#7C3AED`. No introduzcas colores nuevos fuera de los tokens.
3. **No rediseñes el Business Hub.** Cualquier entrada a "your business" navega a la pantalla del hub **existente** tal cual está hoy.
4. **Cambios mínimos y localizados.** No refactorices lo que no pide la tarea.
5. **Marketplace de servicios = fuera de alcance.** No crear pantallas ni modelos para servicios (belleza/hogar/auto). Es monetización futura.

---

## 1. Archivos del repo relevantes (leer primero)

| Área | Archivo |
|---|---|
| Modo global | `src/contexts/ModeContext.js` |
| Header | `src/components/AppHeader.js` |
| Navegación / tabs | `src/navigation/AppNavigator.js` |
| Eventos (attendee) | `src/screens/MyEventsScreen.js` |
| Descubrir / buscar | `src/screens/SearchEventsScreen.js` |
| Detalle de evento | `src/screens/EventDetailScreen.js` |
| Rentas (flotilla) | `src/screens/RentalHubScreen.js` |
| Tokens de tema | `src/constants/theme-tokens.js` |
| Categorías | `src/utils/eventCategories.js` |
| Filtros | `src/components/search/EventFilters.js` |

> Confirma la ruta exacta de la pantalla del **Business Hub** y de **Manage/Hosting** en `AppNavigator.js` antes de empezar (el navigator ya elige raíz por `mode`).

---

## 2. Tareas

### T1 — Mover Profile al header y liberar el tab

**Objetivo:** el avatar de Profile vive arriba a la derecha del header (junto al ícono de mensajes). Profile deja de ser un tab.

- En `AppHeader.js`: añadir avatar tocable a la derecha (después de messages) que hace `navigation.navigate('Profile')`.
- En `AppNavigator.js`: quitar `Profile` del tab bar.
- Profile se abre como pantalla *pushed* (stack), no como tab.
- **Ref visual:** F1/F2 (header) y F3 (Profile).

### T2 — Tab Business condicional

**Objetivo:** el tab **Business** ocupa el slot liberado, pero sólo para quien puede administrar negocio.

- Regla de visibilidad:
  ```
  canManageBusiness = isHost || businesses.length > 0 || managesFleet
  ```
  Deriva `isHost` / `businesses` / `managesFleet` de las fuentes que YA existan (revisa `ModeContext`, contexto de usuario y `RentalHubScreen` para el caso flotilla). Si no existe una bandera de flotilla, usa la señal real disponible (p. ej. vehículos publicados > 0).
- Si `canManageBusiness` → renderizar tab **Business** (ícono maletín, badge PRO). Su pantalla destino es el **Business Hub existente** (sin cambios).
- Si es `false` → tab bar de 4: **Home · Wall · Events · Rentals**.
- **Ref visual:** handoff A1 (4 tabs) y A2 (5 tabs).

### T3 — Toggle de modo en Profile + tag persistente

**Objetivo:** un único control de modo, con estado siempre visible.

- El toggle **Attending / Hosting** vive dentro de Profile (F3). Escribe a `ModeContext` (persistente en `kinlo.mode`, como hoy).
- Quitar el toggle de modo del `AppHeader` si existía como control; sustituirlo por un **tag no interactivo** que refleja el modo actual (`● Attending` verde / `● Hosting` morado) en el header de las pantallas.
- El tag debe leerse de `ModeContext` para mantenerse sincronizado.
- **Ref visual:** tags en F1 (Attending) y F2 (Hosting); toggle en F3.

### T4 — Events de un solo eje

**Objetivo:** eliminar la duplicidad de "Hosting". La raíz del tab Events la decide el modo.

**T4a · Attending (`MyEventsScreen.js`) — ref F1**
- **Quitar** los sub-tabs Joined/Hosting.
- Dejar sólo el segmentado **Upcoming / Past**.
- Añadir barra **Discover** fija arriba que navega a `SearchEventsScreen`.
- Añadir carrusel **horizontal image-forward** ("Popular …", tarjetas ~186px). **No** usar el nombre "Experiences".
- Mantener **My Memberships** en fila compacta (ver §3).
- Tarjetas de eventos con estado (Going / precio).

**T4b · Hosting = "Your events" — ref F2**
- Es la pantalla base del modo Hosting (la actual `Manage`/hosting), **reordenada**. No toca el Business Hub.
- Renombrar el título a **"Your events"** (antes "hosted events").
- Añadir **buscador de evento** + segmentado **Upcoming / Past**.
- Botón **Create event** destacado.
- Cada card con acciones **Check-in · Roster · Edit** y barra de progreso de aforo.

### T5 — Profile enriquecido (ref F3)

Añadir a la pantalla Profile, sobre el toggle de modo:

- Fila superior: **Followers · Follows · Rating** (rating con estrella).
- Grid de stats: **Hosted**, **Published**, **Carpool trips**, **Communities** (miembro de comunidades).
- Tira de detalle de **Carpool** (riders, km compartidos, rating de carpool).
- Bloque de **Personalidad** (tipo + intereses en chips).
- Poblar con datos reales del modelo de usuario; si un dato no existe aún, ocúltalo (no muestres placeholders vacíos).

---

## 3. My Memberships — enrutamiento (no cambia el diseño)

Se mantiene el componente actual. Aclaración de flujos:

- **Host (oferta):** crea/gestiona membresías y packages desde **Business Hub › "Memberships & packages"** (dentro del hub existente).
- **Attendee (compra/uso):** ve y adquiere membresías desde **Events** (entrada "My Memberships"), y consulta las suyas desde **Profile › My memberships**.

No mezclar ambos: la creación es sólo del lado Business Hub.

---

## 4. Fuera de alcance (pausado)

- Marketplace de servicios (belleza, hogar, auto, plomería, etc.).
- Cualquier rediseño interno del Business Hub.
- No renombrar `Rentals` en esta fase.

---

## 5. Checklist de PR

- [ ] Avatar de Profile en header; Profile fuera del tab bar.
- [ ] Tab Business visible sólo con `canManageBusiness`; destino = hub actual.
- [ ] Tab bar: 4 (attendee) / 5 (host o flotilla).
- [ ] Toggle de modo sólo en Profile; tag de modo persistente en header, leyendo `ModeContext`.
- [ ] `MyEventsScreen` sin sub-tabs; Discover + Upcoming/Past + carrusel image-forward.
- [ ] "Your events" (hosting) con búsqueda + Upcoming/Past + Create + acciones por card.
- [ ] Profile con followers/follows, rating, stats (hosted/published/carpool/communities), carpool, personalidad.
- [ ] My Memberships intacto; oferta sólo desde Business Hub.
- [ ] Sin colores/fuentes fuera de `theme-tokens.js`.
- [ ] Business Hub y Marketplace **sin tocar**.
