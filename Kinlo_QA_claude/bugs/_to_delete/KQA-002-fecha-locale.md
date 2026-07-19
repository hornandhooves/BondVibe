# KQA-002 — Fechas con locale hardcodeado e inconsistente (no siguen el idioma de la app)

- **Severidad:** P3 (i18n / consistencia)
- **Estado:** Nuevo
- **Pantalla / Flujo:** Cualquier fecha; visible en Business (PRO) -> Finance -> "Record an expense" (campo DATE).
- **Entorno:** iOS Simulator (iPhone 17 Pro, iOS 26.1); dispositivo en espanol, UI de la app en ingles.
- **Fecha:** 2026-07-17

## Pasos para reproducir
1. Business (PRO) -> Finance -> "Record an expense".
2. Campo DATE muestra "17 jul 2026" (formato espanol) dentro de una UI en ingles.
3. Otras fechas de la app se ven en ingles -> inconsistencia.

## Resultado esperado
Las fechas siguen el idioma de la app (i18n) y son consistentes entre pantallas.

## Resultado actual
- DateField formatea en es-MX ("17 jul 2026").
- Otras fechas/horas se formatean en en-US.
- Ninguna respeta el idioma de la app; se contradicen en la misma pantalla.

## Causa (codigo)
- src/components/DateField.js  L21: toLocaleDateString("es-MX", { day:"numeric", month:"short", year:"numeric" })
- src/utils/dateUtils.js       L31 y L72: toLocaleDateString("en-US", ...) / toLocaleTimeString("en-US", ...)

## Notas para Design (UX)
Decidir: fechas segun idioma de la app (recomendado) o segun locale del dispositivo, y el formato canonico.

## Fix sugerido (dev)
Helper central de fechas que reciba el locale activo de i18n (mapear i18n.language -> es-MX/en-US) y usarlo en DateField y dateUtils. Quitar locales hardcodeados.

## Test de regresion (propuesto)
Unit del helper: i18n "es" -> es-MX, "en" -> en-US. Guard: fallar si reaparece un literal "es-MX"/"en-US" en DateField/dateUtils.
