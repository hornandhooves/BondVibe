# Kinlo — Design System (fuente de verdad: `src/constants/theme-tokens.js`)

> Este documento refleja lo que la app **realmente** usa. Reemplaza cualquier
> "Kinlo 2025 Design System" con neumorfismo/glassmorphism/indigo — eso NO es congruente
> con el código. Sistema real: **Bold-Pop / Clean**, plano, cálido, con firma morada→magenta.
>
> Verificado token por token contra `theme-tokens.js` (WARMTH, AURORA, BRAND, TYPE,
> SPACING, RADII, AI, MATCH_COLORS, ELEVATION). Si algo aquí y el código difieren,
> **gana el código** — actualiza este doc.

## Filosofía
Plano y con carácter ("Bold-Pop"), no neumorfismo ni glassmorphism. Tarjetas planas con
**borde fino** y sombra mínima; el color y la tipografía cargan la personalidad. Dos temas
del mismo sistema: **Warmth (light, primario)** y **Aurora (dark)**.

## Tipografía (NO System/Inter)
- **Space Grotesk** — display, wordmark, números, headers. Pesos: `700Bold`, `600SemiBold` (máx 700).
- **Plus Jakarta Sans** — UI/body. Pesos: 400/500/600/700/800.
- Ramp (`TYPE`): displayLg 40 · display 28 · titleLg 20 · title 18 · body 14.5 · label 13 ·
  eyebrow 11 (uppercase, tracking .8, en Space Grotesk) · caption 11.5.
- Montos/números: Space Grotesk con `letterSpacing -0.5`.

## Color — Warmth (light, primario)
- background `#F1F0F4` · surface `#FFFFFF` · sunken `#F7F5FB` · frame `#DDDAE4`
- text `#1a1d29` · textSecondary `#5b6072` · textTertiary `#8a8f9c`
- **primary/brand `#7C3AED`** (light `#9461f7`, dark `#6320c4`) · brandSoft `#F1E9FE`
- secondary/success `#1F8A6E` · successBg `#E1F5EC` · warning `#B45309` · error `#c25b5b`
- border `#EEEDF2` · borderStrong `#DDDAE4` · dark surface puntual `#160F22` · lilac `#C792EA`

## Color — Aurora (dark)
- background `#160F22` · surface `#1E1438` · surfaceElevated `#261A48` · sunken `#12092E`
- text `#F0EEFB` · primary `#9461f7` · secondary `#1F8A6E` · success `#3DE0A0`
- border `rgba(255,255,255,.08)` · warning `#FFB23D` · error `#FF6B6B`

## Gradiente de marca (mismo en ambos temas)
`#7C3AED → #C026D3 → #FF3E9A` (135°). Cálido opcional: `#E91E8C → #F0573D`.
Úsalo en CTAs primarios y momentos hero — **no** el `#667EEA→#764BA2` del doc viejo.

## Superficies IA (firma "esto es Claude", oscuras en ambos temas)
`AI.bg #160F22` · panel gradiente `#2A1E3D → #42265C` · accent `#C792EA` · texto `#e6ddf2` · lima `#C3E88D`.

## Colores por tipo de match
friend `#1F8A6E`/`#E1F5EC` · professional `#4F5BD5`/`#E6EAFB` · romantic `#E91E8C`/`#FBE4F1`.
Avatar pastels: `#ECE6FB #FBE4F1 #E6EAFB #E1F5EC #FBEDE4`.

## Espaciado (4pt base, NO 8pt)
`SPACING`: xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32 · **screen 20** · **card 16**.
Usa los tokens, nunca números ad-hoc.

## Radios
`RADII`: tile 12 · card 18 · cardLg 22 · button 27 · sheet 28 · pill 999.

## Elevación (sombra mínima, cross-platform)
`ELEVATION.card` = sombra muy sutil (`#000` y1 r3 opacity .06 / Android elevation 2) — **el default de tarjetas casi no tiene sombra; en su lugar borde `#EEEDF2`**.
`floatingBrand` (CTA morado, y9 r22 opacity .28 / Android 8) y `floatingNeutral` (y10 r30 opacity .14 / Android 10) solo en flotantes/CTA.
No hay "glow por todos lados" ni glassmorphism como sistema.

## Iconografía
Set de íconos **a medida de Kinlo** (`src/components/Icon.js`, SVG). **Sin emoji ni íconos de
sistema** (SF Symbols/Material) en la UI. Avatares = fotos reales.

## Reglas prácticas
1. `import { WARMTH, AURORA, FONTS, TYPE, SPACING, RADII, ELEVATION, AI, MATCH_COLORS } from '../constants/theme-tokens'` — nunca hardcodear.
2. Tarjeta = surface + `border 1px` (`colors.border`), radio `RADII.card`, sin sombra (o `ELEVATION.card`).
3. CTA primario = gradiente de marca (`BRAND.gradient`) + `ELEVATION.floatingBrand`.
4. Texto siempre con `TYPE.*` + color del tema (`colors.text` / `colors.textSecondary`).
5. Sin `BlurView` como sistema (existe `surfaceGlass` para casos puntuales, no como estética global).
6. Temas: `const colors = isDark ? AURORA : WARMTH` (vía `ThemeContext`).

## Deuda de diseño
`src/components/modern/` (`ModernButton.js`, `GlassCard.js`) **fue eliminado** — era código
muerto de la estética vieja, sin importar por ninguna pantalla. Las pantallas
`ModernLoginScreen` / `ModernHomeScreen` / `ModernEventFeed` que citaba el doc viejo nunca
existieron. Si alguien crea equivalentes, deben nacer con este sistema (Warmth/Aurora ·
Bold-Pop).

**Huérfano restante:** `src/constants/DesignSystem.js` — ya no lo importa nadie (sus únicos
consumidores eran los dos componentes borrados). Sus `Colors` sí derivan de `theme-tokens`,
pero su `Spacing` es rejilla 8pt (no la de 4pt), sus `Radius` no son los `RADII`, y su
`Typography` usa solo `fontWeight` **sin `fontFamily`** → fuente del sistema, justo lo que
este doc prohíbe. **No lo importes**: usa `theme-tokens` (`TYPE`, `SPACING`, `RADII`).
Candidato a borrado.

---
**Versión real:** Warmth/Aurora · Bold-Pop. Fuente: `src/constants/theme-tokens.js`. Si un doc dice neumorfismo/glass/indigo/System-font, está desactualizado.
