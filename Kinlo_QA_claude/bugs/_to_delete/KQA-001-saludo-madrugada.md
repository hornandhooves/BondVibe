# KQA-001 — Saludo "Good morning" en la madrugada

- **Severidad:** P4 (cosmético / pulido)
- **Estado:** Nuevo
- **Pantalla / Flujo:** Home (HomeScreen) — saludo del encabezado
- **Entorno:** iOS Simulator (iPhone 17 Pro, iOS 26.1)
- **Fecha:** 2026-07-17

## Pasos para reproducir
1. Hora del dispositivo entre 00:00 y 04:59 (ej. 2:06 a.m.).
2. Abre la app -> tab Home.

## Resultado esperado
Saludo acorde a la madrugada (ej. "Good evening" / "Buenas noches").

## Resultado actual
Muestra "Good morning" a las 2:06 a.m.

## Causa (codigo)
src/screens/HomeScreen.js  (getGreeting, ~L80-84):
    const hour = new Date().getHours();
    if (hour < 12) return t("home.greetingMorning");
    if (hour < 18) return t("home.greetingAfternoon");
    return t("home.greetingEvening");
Cualquier hora < 12 (incluida 0-4:59) cae en "morning".

## Notas para Design (UX)
Definir los cortes del saludo. Sugerencia: 0-4 noche, 5-11 manana, 12-17 tarde, 18-23 noche.
Decidir si se agrega un 4o saludo "night" o se reutiliza "evening".

## Fix sugerido (dev)
Extraer getGreeting a un util puro (src/utils/greeting.js) que reciba la hora y ajustar cortes.

## Test de regresion (propuesto)
src/utils/__tests__/greeting.test.js: horas 0-4 -> night/evening; 5-11 -> morning; 12-17 -> afternoon; 18-23 -> evening.
