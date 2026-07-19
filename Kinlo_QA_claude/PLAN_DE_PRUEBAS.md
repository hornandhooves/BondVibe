# Plan de Pruebas — Kinlo (QA con Claude)

**Proyecto:** Kinlo (repo `hornandhooves/BondVibe`) · **Fecha:** 2026-07-17 · **Autor:** Claude (Cowork)
**Stack confirmado:** Expo SDK 54 · React Native 0.81.5 · React 19.1.0 · Firebase (Firestore + Functions) · Stripe + Mercado Pago · react-native-maps · i18n (i18next, EN/ES).

---

## 1. Estado actual del testing (lo que YA tienes)

Kinlo ya tiene una base de pruebas **madura**. La estrategia es *construir encima*, no reinventar:

- **Unit / componente:** Jest (`jest-expo`) + React Native Testing Library + `jest-native`. Setup sólido en `jest/setup.js` (mocks de módulos nativos: async-storage, safe-area, maps, localización, social-auth) y `__mocks__/firebase.js`.
- **E2E de UI:** Maestro (`.maestro/*.yaml`) — `p0-login`, `p0-smoke-tabs`, `p0-smoke-logged-out`, `e2e-attendee`. Usa `testID`s (`tab-home`, `home-search`, `header-notifications`, `mode-hosting`…).
- **E2E de backend:** `scripts/e2e-rules.js` + `e2e-membership.js` contra el emulador de Firebase (`npm run test:e2e`).
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) en cada PR a `main`: paridad i18n EN/ES + `CI=true npx jest`.
- **Docs QA:** `QA.md` (checklist manual por área) y `QA_OFFLINE.md` (pase offline en dispositivo). Ya usas numeración `BUG N` y prioridades `P0–P4`.
- **Cobertura hoy:** ~11 tests de pantalla + ~15 de servicio/util + un `smoke.test.js` que monta las pantallas de **nivel superior**.

## 2. Los tipos de test aplicados a Kinlo

- **Unitarios** — lógica pura de un `service`/`util`: `pricing.js` (`formatCentavos`), fechas/`duration`, filtros como `getFeaturedEvents` (BUG 37), el patrón honest-null `"—"`. Rápidos, muchos.
- **Integración** — un servicio + Firestore (mockeado) trabajando juntos, o una pantalla + su servicio + navegación. Ej: `HomeScreen` cargando sus carruseles.
- **E2E / UI (Maestro)** — el usuario real en el simulador: login → 5 tabs → buscar → wall → perfil. Los que más confianza dan; los más lentos y frágiles.
- **Otros relevantes aquí:** *smoke* (¿monta sin crashear?), *regresión* (que un `BUG N` no vuelva), *snapshot/visual* (fidelidad al mock — tienes PIXEL-FIDELITY SPEC), *reglas de seguridad* de Firestore (E2E backend), *accesibilidad* e *i18n parity* (ya en CI).

## 3. Estrategia y prioridades por riesgo

Pirámide: **muchos** unit · **algunos** integración · **pocos** E2E. Priorizamos por dónde más duele un bug:

1. **Dinero** — Stripe, Mercado Pago, membresías/paquetes, `pricing`, finanzas del negocio (honest-null).
2. **Auth / onboarding** — signup, verificación, login/logout, handle, comportamiento offline (QA_OFFLINE).
3. **Módulo negocio (CRM/ERP)** — miembros, check-in, agenda, metas, dashboard.
4. **Discovery / eventos** — home, búsqueda, join/leave, featured.
5. **Matching / wall / rentals.**

## 4. Gaps de cobertura detectados

- ⚠️ **`smoke.test.js` no cubre subcarpetas:** monta `src/screens/*Screen.js` (nivel superior) pero **no** `src/screens/business/*` ni `src/screens/matching/*` → ~65+ pantallas sin guard anti "pantalla blanca". *Arreglo barato y de alto valor: hacer el smoke recursivo.*
- La mayoría de los ~70 `services` no tienen unit tests (pagos, membresías, asistencia, matching, carpool…).
- El módulo de **negocio/finanzas** —justo donde el honest-null importa— está casi sin cobertura.

## 5. Cómo vamos a trabajar (el loop)

Encaja con tu flujo (Design → VSCode+Claude → QA):

1. **Exploratorio** — yo manejo el simulador (con tu permiso) y recorro los flujos.
2. **Documento el bug** en `Kinlo_QA_claude/` con `BUG_TEMPLATE` (repro, esperado/actual, severidad, **captura**, archivo sospechoso y notas para Design).
3. **Tú:** Design (Claude como UX) → VSCode + plugin de Claude (fix e implementación).
4. **De vuelta conmigo:** escribo/actualizo el **test de regresión** que reproduce el bug y hago **re-QA**.

Reglas del repo que respeto: ramas `test/qa-claude-*` → PR (nunca `main` directo) · paridad EN/ES · tokens de tema (sin colores hardcodeados) · nunca secretos · nunca inventar datos (honest-null).

## 6. Convenciones

- **ID de bug:** `KQA-001`, `KQA-002`… (namespace propio para no chocar con tu histórico `BUG N`; si prefieres que continúe la serie global `BUG N`, lo cambio).
- **Severidad:** `P0` crash/bloqueo/pérdida de dinero · `P1` funcional roto · `P2` funcional menor · `P3` UX/copy · `P4` cosmético.
- **Regresión:** un test por bug, estilo `<Pantalla>.kqa001.test.js` (espejo de tu `.bug6.test.js`).
- **Dónde corre qué:** yo **leo/escribo** el repo y **manejo el simulador** (y puedo correr flujos Maestro). Correr `npm test` / Maestro / EAS de forma confiable es en **tu Mac** (o CI); puedo intentar Jest en el sandbox pero no lo garantizo.

## 7. Entregables

- Carpeta `Kinlo_QA_claude/`: `README.md`, `PLAN_DE_PRUEBAS.md` (este archivo), `BUG_TEMPLATE.md`, `BUGS_INDEX.md`, `screenshots/`.
- Reportes de bug + capturas, indexados en `BUGS_INDEX.md`.
- Tests nuevos (unit/integración/E2E) + regresión, en ramas con PR.

## 8. Próximos pasos (propuesto)

1. **(ahora)** Tu visto bueno o ajustes a este plan.
2. **Exploratorio** en el simulador — requiere que apruebes acceso a la app **Simulator** en tu Mac (te saldrá un diálogo).
3. Documento hallazgos y escribo los tests de regresión.
4. Relleno gaps: primero el **smoke recursivo** + servicios de dinero.

---

*Sugerencia: puedo añadir `Kinlo_QA_claude/` a `.gitignore` si no quieres versionar capturas y reportes — dime.*
