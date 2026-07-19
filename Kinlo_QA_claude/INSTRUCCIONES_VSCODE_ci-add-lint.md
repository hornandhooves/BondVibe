# Instrucciones VSCode — Añadir lint al CI (punto 4)

Rama `chore/ci-add-lint` → PR a main.

En `.github/workflows/ci.yml`, agrega un paso ESLint (antes del paso "Jest"):

    - name: ESLint
      run: npm run lint

Y renombra el job: `name: Lint + Jest + i18n parity`.

## Por qué
El CI corre *parity + jest* pero NO lint. Esta ronda demostró que lint atrapa lo que jest no: el `no-undef` de imports mal apareados en KQA-004b vivía en paths que el smoke render nunca ejercita.

## Antes de abrir el PR
Corre `npm run lint` sobre `main` y confirma exit 0 (el plugin ya lo vio limpio en la rama de #34). Si hubiera errores viejos, arréglalos o el primer PR con el gate saldría rojo por algo no relacionado.
