# Indice de bugs — Kinlo QA (Claude)

_Actualizado: 2026-07-17_

| ID | Titulo | Area | Sev | Estado | Regresion |
|----|--------|------|-----|--------|-----------|
| KQA-001 | Saludo "Good morning" en la madrugada | Home | P4 | Verificado en main (02c61b7) | 12 tests |
| KQA-002 | Fechas locale hardcodeado/inconsistente | DateField/dateUtils | P3 | Verificado en main (02c61b7) | 2 tests |
| KQA-003 | MatchPersonScreen sin guard de profile | matching | P4 | Verificado en main (02c61b7) | 3 tests |
| KQA-004 | Centralizar formateo de fecha/hora | global | P3 | Verificado en main (#33+#34) | +2 tests |

**Severidad:** P0 crash/dinero · P1 funcional roto · P2 menor · P3 UX/copy · P4 cosmetico.

## Ronda KQA — CERRADA (2026-07-17)
4 tickets verificados en main. Sin bugs nuevos en el 2o pase exploratorio (ver PASE_B_EXPLORATORIO.md).

## Estado de pendientes
- **#30 deploy Memberships: DESPLEGADO Y VERIFICADO** (rules + assignPlanManually + indexes + migracion; gate (a) confirmado en vivo; fallback retirado en #36). Pixeles (paso e): puntos 1 y 2 OK en vivo; punto 3 (assign sheet) requiere un miembro.
- **Paso B (2o pase exploratorio): HECHO** — sin bugs nuevos.
- **CI-lint: PENDIENTE** — ci.yml corre parity+jest sin lint. Ticket listo (INSTRUCCIONES_VSCODE_ci-add-lint.md). Reforzado por el lint de functions que bloqueo el deploy de #30.
