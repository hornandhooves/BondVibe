# Instrucciones para el plugin de Claude en VSCode — Fixes QA (Paso A)

Pega esto al plugin de Claude en VSCode (o dile: "lee Kinlo_QA_claude/INSTRUCCIONES_VSCODE.md y ejecútalo").

---

Sigue el `CLAUDE.md` de este repo (Kinlo). Implementa 3 fixes de QA documentados en `Kinlo_QA_claude/bugs/` (KQA-001, KQA-002, KQA-003).

Reglas: trabaja en una rama nueva `fix/qa-claude-kqa-001-002-003` y abre un PR a `main` (NUNCA commitees a main directo). Respeta paridad i18n EN/ES, nada hardcodeado, tokens de tema, sin secretos. Antes del PR, deja verdes: `npm run lint`, `npm test` y `node scripts/check-i18n-parity.js`.

## KQA-001 — Saludo del Home (P4)
1. Crea `src/utils/greeting.js`:

       export function getGreetingKey(hour) {
         if (hour >= 5 && hour < 12) return "home.greetingMorning";
         if (hour >= 12 && hour < 18) return "home.greetingAfternoon";
         return "home.greetingNight";
       }

2. En `src/screens/HomeScreen.js`, reemplaza el `getGreeting` inline (~L80-85) por `t(getGreetingKey(new Date().getHours()))`.
3. Agrega la key i18n `home.greetingNight` en EN ("Good evening") y ES ("Buenas noches") — en AMBOS archivos de idioma (paridad).
4. Agrega `src/utils/__tests__/greeting.test.js` (el test está en `Kinlo_QA_claude/bugs/KQA-001.md`).

## KQA-002 — Formato de fechas (P3)
1. Crea `src/utils/formatDate.js`:

       import i18n from "../i18n";
       const localeFor = (lng = i18n.language) =>
         (String(lng).startsWith("es") ? "es-MX" : "en-US");
       export const formatDate = (d, opts = { day: "numeric", month: "short", year: "numeric" }, lng) =>
         new Date(d).toLocaleDateString(localeFor(lng), opts);
       export const formatTime = (d, opts = { hour: "numeric", minute: "2-digit" }, lng) =>
         new Date(d).toLocaleTimeString(localeFor(lng), opts);

2. Reemplaza el `toLocaleDateString("es-MX", …)` de `src/components/DateField.js` (L21) y los `toLocaleDateString/TimeString("en-US", …)` de `src/utils/dateUtils.js` (L31, L72) por `formatDate`/`formatTime`. No dejes literales "es-MX"/"en-US" fuera de `formatDate.js`.
3. Agrega `src/utils/__tests__/formatDate.test.js` (el test está en `Kinlo_QA_claude/bugs/KQA-002.md`).

## KQA-003 — Guard de MatchPersonScreen (P4)
1. En `src/screens/matching/MatchPersonScreen.js`, justo después de `const { eventId, eventTitle, profile } = route.params || {};`, agrega un guard temprano: `if (!profile) return null;` (o un fallback / `navigation.goBack()`).
2. Agrega un test de regresión que monte `MatchPersonScreen` con `route.params = {}` y espere que NO truene (esto exige el guard).

## Cierre
Corre `npm run lint && npm test && node scripts/check-i18n-parity.js`. Si todo verde, abre el PR describiendo los 3 fixes y enlazando KQA-001/002/003.
