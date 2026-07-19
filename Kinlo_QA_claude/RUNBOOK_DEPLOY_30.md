# Runbook — Deploy #30 (Memberships unification) + hosting hardening 3/3

_Re-QA'd por Claude el 2026-07-17 contra el código de `origin/feat/memberships-unified`. Lo ejecuta Carlos desde `main` (necesita red + credenciales). Claude no deploya ni migra (CLAUDE.md §2)._

## ⚠️ Riesgo #1 — leer antes de nada
`firebase deploy --only firestore:rules` sube el archivo COMPLETO, no un delta. `main` tiene reglas **sin desplegar acumuladas**: la regla `plans` (de #30) **y** el hardening de hosting (`role`/`hostConfig` server-only, de #26, pausado). Verifiqué que el hardening ya está en `main` pero prod no lo tiene. → Este deploy **NO es aditivo**: convierte la activación de hosting en server-only en prod, en el mismo shot.
Por eso el **prereq (a) es obligatorio**: un cliente viejo (pre-#26) escribe `role:'host'` directo, y la regla nueva lo rechaza → esos usuarios no podrían hacerse host. El cliente nuevo (usa los callables `activateHost`/`deferHostType`) debe estar adoptado ANTES.

## Pre-flight
- [ ] `firebase login` ok · `firebase projects:list` muestra `kinlo-app-dev` · `.firebaserc` default = `kinlo-app-dev`.
- [ ] Llave `kinlo-app-dev-fcm-sa.json` en la raíz (o `GOOGLE_APPLICATION_CREDENTIALS`) — la migración se NIEGA a correr con otra llave.
- [ ] #30 mergeado a `main`; estás en `main` con `git pull`.
- [ ] (recomendado) Reconfirma en la consola de Firebase el ruleset desplegado actual. El doc lo verificó el 2026-07-17 ("prod no tiene ni `plans` ni hardening"); confirma que sigue igual para que el deploy no sorprenda. Es lo único que YO no pude verificar (sin acceso a Firebase).

## (a) GATE — cliente nuevo adoptado  [load-bearing]
En el device con el build nuevo: **activa hosting**. Debe funcionar contra las reglas ACTUALES (aún sin hardening) — eso prueba que el cliente usa el callable, no un write directo de `role`.
- ✅ Activa bien → seguir.
- ⛔ Falla / build viejo → PARA. Adopta el build nuevo primero. No deployees reglas.

## (b) Merge #30 a `main`.

## (c) Deploy desde `main`
```bash
git checkout main && git pull origin main
firebase deploy --only firestore:rules --project kinlo-app-dev        # plans + hardening 3/3 (NO aditivo)
firebase deploy --only functions:assignPlanManually --project kinlo-app-dev
firebase deploy --only firestore:indexes --project kinlo-app-dev      # si hay pendientes
```
Verifica: consola → Rules muestra `match /plans` y el hardening; en el device, activar/diferir hosting SIGUE funcionando. Si eso se rompe aquí → (a) no se cumplió → rollback de reglas.

## (d) Migración — dry-run → auditar → aplicar
```bash
node scripts/migrate-plans.mjs            # DRY RUN (no escribe). Lee la salida completa.
```
**GATE de auditoría:** doc por doc, confirma que el paquete real "10" mapea como esperas — `credits` (de credits/creditsIncluded), `price` (de priceCents/priceCentavos), y channel (packages→manual, membershipPlans→online). Si algo mapea raro → PARA, no apliques.
```bash
node scripts/migrate-plans.mjs --apply    # Escribe. Additive + idempotente.
```
Solo CREA en `plans`; nunca toca packages/membershipPlans/activePackage. Re-correrlo no duplica (`migratedFrom`). Al terminar imprime el recordatorio de cleanup.

## (e) Verificar en el device (pixeles)
- [ ] MembershipsScreen muestra el "10" migrado como membresía manual.
- [ ] PlanFormScreen lo edita.
- [ ] Ruta de compra online filtra bien.
- [ ] AssignPlanSheet asigna E2E contra el callable real.

## Post-deploy — cleanup
- [ ] Quita el fallback transitional en `src/screens/HostMembershipsScreen.js:51` (grep `TRANSITIONAL — REMOVE AFTER PLANS MIGRATION`). Lee legacy `membershipPlans` solo mientras `plans` esté vacío — ya no aplica. En su propia rama/PR.

## Rollback
- **Reglas:** re-deploy del `firestore.rules` anterior desde git. OJO: el rollback también DES-hardena hosting (vuelve client-writable).
- **Migración:** borra los docs de `plans` con `migratedFrom` (las fuentes nunca se tocaron).
- **Red de seguridad:** mientras `plans` esté vacío (antes de `--apply` o tras rollback), HostMemberships lee el legacy `membershipPlans` → la compra del asistente nunca se cae.

## Qué verifiqué (re-QA)
- migrate-plans.mjs: dry-run por defecto, additive, idempotente (`migratedFrom`), rechaza llave != kinlo-app-dev. ✅
- Diff de reglas main↔rama = solo la regla `plans` (aditiva). ✅
- Hardening role/hostConfig YA en `main` sin desplegar → el deploy lo sube (no aditivo; (a) obligatorio). ✅
- assignPlanManually existe (functions/index.js:143); fallback transitional en HostMembershipsScreen.js:51. ✅
- NO verificable desde aquí: ruleset EN VIVO de prod → reconfirmar en consola antes del deploy.
