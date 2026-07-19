# Pase exploratorio 2 (Paso B) — 2026-07-17

Recorrido en vivo (simulador iPhone 17 Pro, iOS 26.1): host onboarding (Become a host / community setup), Rentals ("Get around"), Services marketplace, Business Hub, Memberships, PlanForm, Agenda, Profile, Settings, Wall.

## Resultado: SIN bugs nuevos. La app se sostiene.
Confirmado en vivo:
- **Honest-null:** Profile Rating "—" (sin ratings); Finance "$0.00 MXN"/"—" (pase 1). Nada inventado.
- **i18n de fechas:** Agenda muestra los dias (FRI, SAT...) en ingles = siguen el idioma de la app (grupo-3, correcto). Consistente con KQA-002/004.
- **Estados vacios** claros en todas las areas (Rentals "No vehicles yet", Services "No services yet", Agenda "Nothing scheduled", Wall "Follow people...").
- **Sin crashes, pantallas blancas, keys i18n crudas ni layouts rotos.**
- Copys de IA honestos (Wall: "Kinlo AI is reading your community..." en loading).

## Cobertura NO exhaustiva (para un 3er pase, si se quiere)
- Matching (flujo en vivo): requiere evento + opt-in.
- Create event (form): tecleo en el simulador es inestable -> mejor Maestro/manual.
- Notifications / Inbox: no se alcanzo.
- Moments (crear): abre camara / media picker.

## #30 — verificacion de pixeles (paso e)
- OK Punto 1: Memberships (host) muestra el plan "10" ($1,000.00 MXN, 10 credits, 30 days, class pack) con badge Manual + Both tiers. SIN "Couldn't load" (BUG C resuelto -> regla /plans/ desplegada).
- OK Punto 2: PlanForm "How can people pay?" -> Sell online OFF (nota Stripe), Assign manually ON (badge PRO). Datos migrados correctos.
- Pendiente Punto 3: AssignPlanSheet requiere un miembro (0 existen); componente unit-tested + callable assignPlanManually desplegada.
