# Instrucciones VSCode — KQA-004 ROUND 2 (completar el sweep de fechas)

Contexto: el PR #33 fue correcto pero el ticket original quedo CORTO (grep truncado). Cubrio 15 sitios; quedan **20 mas** de la MISMA clase. Esta es la lista COMPLETA y autoritativa (grep sin truncar, re-QA 2026-07-17).

Aplica igual que #33: preserva las opciones de cada sitio (tu metodo del script abort-on-ambiguity funciono), tabla de cambios de formato para Design, su PROPIO PR (`fix/qa-kqa-004b-date-sweep` -> a main), gates verdes (lint, jest, check-i18n-parity). Helpers ya existen: `formatDate`, `formatTime`, `formatDateTime` en src/utils/formatDate.js.

## REGLA DE ORO — dinero NO se toca
pricing.js, membershipUtils.js, promotionService.js:36, FinanceScreen.js:18 (MX$) usan es-MX para MXN a proposito. NO tocar.

## A) Bare (locale del dispositivo) -> helper  (9)
- src/screens/HostCRMScreen.js:205 — r.lastDate.toLocaleDateString() -> formatDate
- src/screens/HostAnalyticsScreen.js:305 — exp.toLocaleDateString() -> formatDate
- src/screens/HowToAttendScreen.js:175 — expiry.toLocaleDateString() -> formatDate
- src/screens/AnalyticsDetailScreen.js:27 — new Date(ms).toLocaleDateString() -> formatDate
- src/screens/MembershipHistoryScreen.js:52 — toLocaleDateString(undefined, {month,day,year}) -> formatDate(ms, {month:"short",day:"numeric",year:"numeric"})
- src/screens/EventChatScreen.js:1140 — toLocaleTimeString([], {...}) -> formatTime (conserva opciones)
- src/components/business/MomentumCard.js:84 — toLocaleDateString() -> formatDate
- src/components/business/CreditCard.js:51 — toLocaleDateString() -> formatDate
- src/services/businessPaymentsService.js:108 — new Date(payment.date).toLocaleString() dentro de receiptText() -> formatDateTime. NOTA: es un recibo compartible en texto plano; confirma con Design que la fecha del recibo siga el idioma (lo normal es si).

## B) Hardcodeadas a un idioma (FECHAS) -> helper  (11)
- src/screens/CreateEventScreen.js:374 — ("en-US", options) -> formatDate(date, options)
- src/screens/YourWeekScreen.js:35 — ("en-US", {weekday,month,day}) -> formatDate
- src/screens/FinanceScreen.js:22 — ("en", {month, year:"2-digit"}) -> formatDate (CONSERVA year:"2-digit")
- src/screens/RentalHubScreen.js:192 — ("es-MX", {day,month}) -> formatDate  (es-MX de FECHA, no dinero)
- src/screens/RentalHubScreen.js:193 — ("es-MX", {day,month}) -> formatDate
- src/screens/ActiveRentalScreen.js:157 — ("es-MX", {day,month,year}) -> formatDate  (fecha, no dinero)
- src/components/EventCard.js:17 — ('en-US', options) -> formatDate
- src/components/RecurrenceModal.js:222 — ("en-US", {...}) -> formatDate
- src/components/RecurrenceModal.js:230 — ("en-US", {...}) -> formatDate
- src/components/EventRatings.js:63 — ("en-US", {...}) -> formatDate
- src/components/FeaturedCarousel.js:39 — ("en-US", {...}) -> formatDate

## Matiz de formato
Grupo A (sin opciones) cambia el formato visible (numerico -> mes corto), como en #33. Grupo B ya trae opciones -> solo cambia el locale, no el layout. Lista en el PR cuales cambian.

## Grupo 3 (ya usan i18n.language) — NO tocar, ya son correctos.
