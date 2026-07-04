# 01 · Kinlo Design System — "Clean" (match the mockups)

Fuente de verdad visual: `Kinlo AI Features.dc.html` + `Kinlo Design System.dc.html`. Build every AI screen to look like these. Use tokens, never hardcode.

## Type
- **Space Grotesk** (600/700) — titles, numbers, prices, badges, metrics.
- **Plus Jakarta Sans** (400–800) — body, lists, labels, chat.

## Color tokens
```
bg        #F1F0F4    surface  #FFFFFF    sunken  #F7F5FB    frame  #DDDAE4
text      #1a1d29    textSec  #5b6072    muted   #8a8f9c    hairline #EEEDF2 / #E7E5EE
brand     #7C3AED    brandSoft #F1E9FE
brandGradient  linear-gradient(135deg, #7C3AED, #C026D3, #FF3E9A)   // CTAs & AI accents
--- AI surfaces (the differentiator's signature look) ---
aiDark    #160F22            aiPanel  linear-gradient(135deg,#2A1E3D,#42265C)
aiLilac   #C792EA            aiTextOnDark #e6ddf2
--- match types --- friend #1F8A6E/#E1F5EC · professional #4F5BD5/#E6EAFB · romantic #E91E8C/#FBE4F1
--- feedback --- success #1F8A6E · warn #B45309/#FBEFD6 · danger #c25b5b · limeGood #C3E88D
avatarPastels  #ECE6FB #FBE4F1 #E6EAFB #E1F5EC #FBEDE4
```

## The "AI" visual signature (use consistently so users learn "this is Claude")
- **AI surface** = dark panel (`aiDark` or `aiPanel` gradient) with `aiLilac` accents and white text.
- **AI mark** = sparkle icon (lucide `sparkles`), stroke 1.75, in lilac on dark / brand on light.
- **AI label** = short eyebrow: "Curated for you by Kinlo AI", "Why you're seeing this", "Claude drafted this", "AI community pulse", "Why you two click".
- Every AI output shows a one-line **reason** grounded in the user's data.

## Shape & elevation
- Radius: cards 16–22, chips/pills full, primary button 24–27, phone frame 34/46, tiles 12–14.
- Card shadow `0 1px 3px rgba(0,0,0,.06)`. Floating (tab bar, FAB, primary CTA) `0 8–10px 18–22px rgba(124,58,237,.28)` for brand buttons, `0 10px 30px rgba(30,20,50,.14)` neutral.
- Selection: 2px brand border; unselected 1.5px `#EEEDF2`. No neon borders, no glow.

## Core components (reuse the app's primitives)
- **Primary button:** h54, radius 27, brand gradient, white 16/700, brand shadow.
- **Secondary:** white, soft shadow, brand/muted text.
- **AICard:** dark surface, sparkle + eyebrow + grounded reason. New shared component.
- **EventCard / ListRow / Chip / Badge (incl. PRO) / Toggle / SegmentedControl / Avatar / SectionHeader (mono eyebrow) / StatusBar / TabBar** — as in the app.
- **Icons:** central `<Icon>` (lucide, `strokeWidth={1.75}`, `absoluteStrokeWidth`), color from token. Notion-like.

## Mobile layout
- Content padding 20; hit targets ≥44px; body 13–14.5, captions ≥11; spacing via flex/grid `gap` (8–16).
- Dark AI screens (Weekly Digest) invert text to white; keep brand gradient accents.
