# Instrucciones VSCode — Cleanup post-migración #30 (quitar fallback transitional)

## ⛔ FRENO: NO ejecutar hasta DESPUÉS de `node scripts/migrate-plans.mjs --apply`
Con éxito en kinlo-app-dev (colección `plans` poblada). ANTES de eso, este fallback es lo que mantiene viva la compra del asistente mientras `plans` está vacío — quitarlo antes = outage.

## Cambio
Archivo: `src/screens/HostMembershipsScreen.js`, función `load()` (~L41-66). El propio comentario del código lista los pasos:
1. Quita `getHostMembershipPlans(hostId, { activeOnly: true })` del `Promise.all` y su binding `legacy`.
2. `const data = unified.length ? unified : legacy;` → `const data = unified;`
3. Borra el bloque de comentario `// TRANSITIONAL — REMOVE AFTER PLANS MIGRATION ...`.
4. Si nada más en el archivo usa `getHostMembershipPlans`, quita ese import (viene de `membershipService`). **Verifica antes de borrarlo.**

## Cierre
Rama `chore/remove-plans-transitional-fallback` → PR a main. Gates: `npm run lint && npm test && node scripts/check-i18n-parity.js`. (El smoke ya monta HostMembershipsScreen → jest confirma que sigue renderizando; lint caza el import huérfano.)
