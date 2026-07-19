# Kinlo_QA_claude

Carpeta de QA generada con Claude (Cowork). Aquí viven los artefactos de pruebas:

- `PLAN_DE_PRUEBAS.md` — estrategia, alcance y prioridades.
- `BUG_TEMPLATE.md` — plantilla para reportar cada bug.
- `BUGS_INDEX.md` — índice / tracking de todos los bugs.
- `screenshots/` — capturas de cada bug (nombradas `KQA-XXX-*.png`).

## Flujo
Exploratorio (Claude) → reporte aquí → Design (Claude UX) → VSCode + plugin de Claude (fix) → re-QA + test de regresión.

## Convenciones
- **IDs:** `KQA-001`, `KQA-002`…
- **Severidad:** `P0` crash/dinero · `P1` funcional roto · `P2` menor · `P3` UX/copy · `P4` cosmético.
- **Regresión:** un test por bug, estilo `<Pantalla>.kqaXXX.test.js`.
