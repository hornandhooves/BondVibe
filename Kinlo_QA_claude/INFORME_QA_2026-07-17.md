# Informe QA — Kinlo · 2026-07-17

_Preparado por Claude (Cowork/QA). Sesión: ronda de bugs KQA-001..004, deploy #30 (Memberships), y 2º pase exploratorio (Paso B)._

---

## Resumen ejecutivo

- **Ronda KQA (001–004):** 4 bugs arreglados y **verificados en `main`** (commits #32/#33/#34). Cubiertos por tests (12 `businessExpenses`, 63 `smoke.subfolders`, + greeting/formatDate/formatDateTime).
- **#30 (Memberships unificado):** desplegado en `kinlo-app-dev` (reglas + `assignPlanManually` + índices + migración; gate (a) confirmado en vivo; fallback retirado en #36) y **verificado en la UI**.
- **Paso B (2º pase exploratorio):** **sin bugs nuevos.** App uniformemente pulida.
- **Único fix pendiente:** endurecer el CI con lint (detalle abajo). No hay bugs de producto abiertos.

---

## SECCIÓN A — Para DEV (VSCode + plugin de Claude): ejecutar

> Es lo único "necesario" de código. Sigue el `CLAUDE.md`, rama propia → PR a `main`, gates verdes. No hay bugs de producto que arreglar.

### A1. Añadir lint al CI  (prioridad: hacer ya)

**Por qué:** esta sesión demostró **dos veces** que el lint caza lo que jest no:
- El `no-undef` de imports mal apareados en KQA-004b lo cazó el lint local (jest no, porque el smoke no ejercía ese path).
- El error de indentación en `functions/index.js:202` **bloqueó el deploy de #30** — lo cazó el `predeploy` de functions, no el CI.

Hoy `.github/workflows/ci.yml` corre **parity + jest, sin lint**.

**Tareas (rama `chore/ci-add-lint` → PR a main):**
1. En `.github/workflows/ci.yml`, agrega un paso de lint de la app **antes** del paso "Jest":
   ```yaml
         - name: ESLint (app)
           run: npm run lint
   ```
2. Agrega también lint de **functions** (para cazar en el PR lo que hoy solo se ve en el deploy):
   ```yaml
         - name: ESLint (functions)
           run: npm --prefix functions run lint
   ```
3. Renombra el job: `name: Lint + Jest + i18n parity`.
4. **Antes de abrir el PR:** corre `npm run lint` y `npm --prefix functions run lint` sobre `main`. Si hay errores viejos, arréglalos en el mismo PR — si no, el primer PR con el gate sale rojo por algo no relacionado.

### A2. Confirmar que el fix de lint de functions quedó en `main`

El deploy de #30 requirió arreglar `functions/index.js:202` (indentación de `.toISOString()`, 6→4 espacios) para que pasara el `predeploy` lint. **Confirma que ese fix está commiteado en `main`, no solo local** — si no, CI (tras A1) y el próximo deploy lo vuelven a topar.
```bash
git log -1 --oneline -- functions/index.js
git diff origin/main -- functions/index.js   # debe salir vacío
```
Si aparece sin commitear: commitéalo en una rama → PR (o incorpóralo al PR de A1).

### A3. (Opcional, ya listo) Ticket pre-existente
`Kinlo_QA_claude/INSTRUCCIONES_VSCODE_ci-add-lint.md` cubre A1; este informe lo amplía con A2 y el lint de functions.

---

## SECCIÓN B — Para DESIGN (Claude UX): revisar

> Todo esto **ya está en `main`/producción**. El pedido es un vistazo de confirmación, no rework.

### B1. Saludo de noche (KQA-001)
De 18:00 a 04:59 ahora se usa la clave `home.greetingNight` = **EN "Good evening" / ES "Buenas noches"** (antes decía "Good morning" a las 2 a.m.). Confirma que **"Good evening" lee bien de madrugada** (alternativa: "Good night"). Es solo copy.

### B2. Formato de fechas (KQA-002 / KQA-004)
~12 pantallas cambiaron de formato **numérico del dispositivo** ("7/17/2026") a **mes corto siguiendo el idioma** ("17 jul 2026" en ES / "Jul 17, 2026" en EN). La tabla exacta de qué pantallas cambian está en el PR #34. Confirma que el nuevo formato se ve bien donde aparece (Memberships, Finance, Agenda, Rentals, recibos, notificaciones…).

### B3. Fecha en recibos compartibles
`businessPaymentsService.receiptText` (recibo en texto plano que se comparte fuera de la app) ahora sigue el idioma de la app. Confirma que para una superficie que sale de la app está OK (lo normal es sí).

### B4. Resultado del 2º pase exploratorio (Paso B)
Recorrí en vivo: host onboarding, Rentals, Services, Business Hub, Memberships, PlanForm, Agenda, Profile, Settings, Wall. **Sin issues de UX nuevos.** Confirmado: honest-null ("—" en Rating/Finance sin datos), estados vacíos claros, i18n de fechas correcto, sin crashes. Nada que rehacer.

---

## Estado de verificación #30 (paso e — pixeles)

- ✅ **Memberships (host):** plan migrado "10" — `$1,000.00 MXN`, "10 credits · 30 days · class pack", badge **Manual** + "Both tiers". **Sin "Couldn't load"** → BUG C resuelto (regla `/plans/` desplegada).
- ✅ **PlanForm:** "How can people pay?" → **Sell online OFF** (nota Stripe) · **Assign manually ON** (badge PRO). Datos migrados correctos.
- ⏳ **Assign sheet (punto 3):** requiere un miembro y hay **0**. Componente `AssignPlanSheet` unit-tested + callable `assignPlanManually` desplegada. Falta demo en vivo con un miembro de prueba.

---

## Cobertura NO exhaustiva (para un 3er pase, opcional)
Matching en vivo (necesita evento + opt-in) · form de Create event (tecleo en simulador inestable → Maestro/manual) · Notifications/Inbox · crear Moments (cámara).
