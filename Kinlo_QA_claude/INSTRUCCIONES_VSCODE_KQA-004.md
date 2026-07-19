# Instrucciones VSCode — KQA-004 (centralizar formateo de fecha/hora)

Pega al plugin de Claude en VSCode, o dile: "lee Kinlo_QA_claude/INSTRUCCIONES_VSCODE_KQA-004.md y ejecutalo".

---

Sigue el CLAUDE.md del repo. Aplica KQA-004 (ver Kinlo_QA_claude/bugs/KQA-004.md): rutea las llamadas `toLocale*` de FECHA/HORA restantes por el helper `src/utils/formatDate.js` (`formatDate`/`formatTime`). Rama nueva `fix/qa-kqa-004-date-locale-sweep` -> PR a main (NUNCA a main directo). Su PROPIO PR. Deja verdes `npm run lint`, `npm test` y `node scripts/check-i18n-parity.js`.

## REGLA DE ORO — NO tocar dinero
`src/utils/pricing.js` (L71,105,106) y `src/utils/membershipUtils.js` (L106) usan `toLocaleString("es-MX")` para MXN a proposito. NO los toques.

## MATIZ de formato (importante, no es find-replace ciego)
Varias llamadas del Grupo 1 usan `toLocaleDateString()` SIN opciones -> hoy muestran el numerico del dispositivo (ej. "7/17/2026"). `formatDate(d)` por defecto da "17 jul 2026" (mes corto), asi que al migrarlas CAMBIA el formato visible.
- Recomendado: estandarizar al default del helper (mes corto) por consistencia.
- Si algun caso debe seguir numerico, pasa `formatDate(d, { day:"numeric", month:"numeric", year:"numeric" })`.
- Lista en el PR cuales cambiaron de formato para que Design de un vistazo.

## Grupo 2 — hardcodeada a un idioma (el arreglo mas claro)
- `src/screens/AskKinloScreen.js:42`: `toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" })` -> `formatDate(new Date(ev.date), { weekday:"short", month:"short", day:"numeric" })`.

## Grupo 1 — sin locale (usan el del dispositivo) -> al helper (conserva las opciones de cada una)
- src/screens/MyMembershipsScreen.js:92,93
- src/screens/MembershipSaleScreen.js:24
- src/screens/NotificationsScreen.js:264
- src/screens/AdminDashboardScreen.js:1251 (fecha) y 1411 (`toLocaleString` = fecha+hora)
- src/screens/CheckInScannerScreen.js:107 (`toLocaleString` = fecha+hora)
- src/screens/VehicleBookingsScreen.js:25 (`toLocaleDateString(undefined, {day,month})`)
- src/screens/business/BusinessFinanceScreen.js:184
- src/screens/business/BusinessExpensesScreen.js:256
- src/screens/business/MemberRecordScreen.js:295,328
- src/screens/business/MessageLogScreen.js:27
- src/screens/business/MomentumCardScreen.js:299
- src/screens/business/ClassRosterScreen.js:95 (solo el fallback `new Date(cls.date).toLocaleDateString()`)
- src/screens/business/AvailabilityScreen.js:75 (solo el fallback `new Date(s.date).toLocaleDateString()`)

Para los que combinan fecha+hora (`toLocaleString`), agrega si hace falta un `formatDateTime(d, opts, lng)` a formatDate.js (mismo patron de `localeFor`), o usa `formatDate` + `formatTime`.

## Grupo 3 — ya usan i18n.language (OPCIONAL, solo consistencia)
Feed, EventChat, SessionDetail, BusinessDashboard, Agenda (varios + helpers), SessionsAgenda, Classes, SetTarget, TargetTracker, Staff, Availability:20, ClassRoster:24. Correctos en comportamiento; migrarlos es cosmetico. Dejalos o unificalos si queda limpio.

## Tests + cierre
Ajusta/agrega tests donde aplique (ej. que AskKinlo ya no dependa de en-US). Corre los 3 gates. PR describiendo que grupos migraste y que formatos cambiaron.
