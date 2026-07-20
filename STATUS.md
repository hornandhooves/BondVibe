# BondVibe — Estado del proyecto (fuente de verdad)

> **LÉEME PRIMERO antes de empezar cualquier trabajo.** Este archivo es el
> registro autoritativo de lo que está construido, mergeado y desplegado.
> Si aquí dice **DONE**, está hecho — no lo re-hagas ni lo re-marques como
> pendiente. Cuando mergees o despliegues algo, **actualiza este archivo**.

**Última actualización:** 2026-07-19 · por: QA (Claude) · `main`: `b55c591`

---

## Entornos
| Env  | Firebase project   | Notas |
|------|--------------------|-------|
| dev  | `kinlo-app-dev`    | target de desarrollo / pre-prod activo |
| prod | _no levantado aún_ | nacerá en Node 22 (ya está en el `package.json` de main) |

## Runtime / infra desplegada (kinlo-app-dev)
- **Cloud Functions:** 92/92 en **nodejs22** ACTIVE · `firebase-functions@7.3.0`. (migrado en #40, 2026-07-19)
- **Storage rules:** **DESPLEGADAS ✅** — regla de fotos de services (`businesses/{bizId}/services/**`: `write` si `uid==bizId` + imagen <10 MB). **Probado en vivo: la foto sube y renderiza. NO está pendiente `firebase deploy --only storage`.**
- **Firestore rules:** gates `at_customer` (verified+insured) y `publicListing` (host aprobado) ya en main.
- **Crons (Cloud Scheduler):** 4 desplegadas y ACTIVE (`businessRemindersCron`, `businessSessionRemindersCron`, `businessMomentumDetectorCron`, `expireServiceReservations`).

## Features enviadas
- **Services — flujo de proveedor (P0–P3)** — PR #39, cerrado. "Publicar" es la acción (sin toggle "listar"), con Category, fotos, slot/quote, `at_customer` con gate verified+insured. QA §1/§2/§4/§5 PASS + 2 confirmaciones en vivo (KQA-S02, foto). Design §3 👍.

## Pendientes abiertos
- _(ninguno en este workstream)_

---

## Playbook de deploy (aprendido)
- **Cambio de runtime** (`engines.node`) NO cabe en un solo `deploy --only functions` (cupo ~60 mutaciones/min, ~92 funciones) → desplegar **por batches de ~25-30 con pausa ~60 s**, verificando `nodejs22 ACTIVE` por batch.
- **Reglas** (storage/firestore) se despliegan como archivo completo: `firebase deploy --only storage` / `--only firestore:rules`.
- **CI** (`.github/workflows/ci.yml`) = lint + jest + i18n parity. **NO** auto-despliega; los deploys son manuales.
- **Merge a main:** solo con CI verde + OK de QA. Bypass admin (`gh pr merge --admin`) solo cuando no hay segundo revisor y el cambio ya está verificado.

## Historial de bugs (todos cerrados en main)
- KQA-S01 priceCents en quote (`cc2abc6`) · KQA-S02 admin-safe `activateHost` (`42386db`) · S-obs-1..5 (`1ed49ca`, `3ea95d6`) · quoteFree→"Cotización" (`b3d4f27`).

## Cómo actualizar este archivo
Al mergear un PR o desplegar: edita la sección correspondiente + la línea de
fecha/commit de arriba. Si cierras un pendiente, muévelo a "enviadas/desplegada"
con su commit. Mantenlo corto: es un ledger, no un diario.
