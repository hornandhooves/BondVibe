# E2E con Maestro — BondVibe

Reemplaza el QA manual del simulador por tests **repetibles**. Cubren los
recorridos críticos de Services que se verificaron a mano esta sesión:
publicar con foto (upload a Storage), regresión KQA-S02 (admin conserva Panel),
y borrado de servicio (S-obs-1).

Estructura sugerida en el repo:

```
.maestro/
  config.yaml
  flows/
    provider-publish-photo.yaml
    admin-becomes-host-keeps-panel.yaml
    service-delete.yaml
```

## Correr localmente
1. Instala Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`
2. Levanta la app en el simulador iOS (dev build de Expo o la build de test).
3. Un flujo: `maestro test .maestro/flows/provider-publish-photo.yaml`
   Toda la suite: `maestro test .maestro`

## Prerequisitos (sin esto dan FALSO VERDE)
- **Estado de sesión (seed).** Los flujos NO crean cuentas; asumen un login previo:
  - `provider-publish-photo` y `service-delete` → **host APROBADO** logueado.
  - `admin-becomes-host-keeps-panel` → **admin que aún NO es host** (`hostApproved != true`).
  - Recomendado: script de seed (Firebase Admin SDK contra kinlo-app-dev o el emulador) + un `login.yaml` reutilizable invocado con `runFlow: login.yaml` al inicio de cada flujo.
- **bundleId.** Cada flujo abre con `appId: com.kinlo.app` — confírmalo en `app.json`/`app.config.js` (`ios.bundleIdentifier`) y ajústalo.
- **Selectores.** Usé texto visible en ES → frágil ante i18n y cambios de copy. Agrega `testID` a los elementos marcados `TODO testID` (en RN: `testID` → accessibilityIdentifier → Maestro `id:`) y cambia esos `tapOn:` de texto a `id:`.
- **Foto.** `provider-publish-photo` pre-concede el permiso y toca la 1a celda del picker por coordenada (frágil). Para CI 100% determinista: **build de test con el image picker stubbeado** que devuelva un asset fijo del bundle, y reemplaza el bloque de foto por un solo `tapOn: "Agregar"`.

## Meterlo a CI
- Job de GitHub Actions con runner macOS + simulador + `maestro test`.
- Dispáralo en PRs que toquen `src/screens/business/**`, `src/services/businessSessionsService.js` o `storage.rules`.
- Corre solo el humo: `maestro test --include-tags smoke .maestro`.

## TODO del plugin (para dejarlos en verde de verdad)
1. Confirmar bundleId.
2. Crear `login.yaml` + script de seed de las 3 cuentas (host aprobado / admin-no-host).
3. Agregar testIDs: `publish.name`, `publish.photo.0`, `photoPicker.done`, `home.avatar`, `myservice.menu.*`; cambiar selectores de texto → `id:`.
4. Stubbear el image picker en la build de test.
5. Correr cada flujo una vez, ajustar, y armar el job de CI.

> Cuando el plugin deje estos 3 flujos verdes, el recorrido de proveedor de
> Services queda verificado de forma automática y repetible. Cualquier cambio
> futuro en esas pantallas lo re-verifica CI, no una persona manejando el sim.
