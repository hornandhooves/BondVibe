# Kinlo 2025 - Design System

## 🎨 Design Philosophy

Kinlo's 2025 design system combines **neumorphism** with **glassmorphism** to create an ultra-modern, sophisticated interface that feels both futuristic and approachable.

## Color Palette

### Dark Mode (Primary)
- **Background**: `#0A0E27` - Deep space blue
- **Surface**: `#131829` - Elevated dark blue
- **Primary**: `#6366F1` - Electric indigo
- **Secondary**: `#EC4899` - Vibrant pink
- **Accent**: `#06B6D4` - Neon cyan

### Gradients
- **Primary Gradient**: `#667EEA → #764BA2`
- **Accent Gradient**: `#06B6D4 → #3B82F6`
- **Success**: `#10B981 → #059669`

## Typography

### Font Stack
- Primary: System Default (San Francisco on iOS, Roboto on Android)
- Fallback: Inter, Satoshi, General Sans

### Scale
- **H1**: 32px, weight 800, -0.5 tracking
- **H2**: 28px, weight 700, -0.3 tracking
- **H3**: 24px, weight 700, -0.2 tracking
- **H4**: 20px, weight 600
- **Body**: 16px, weight 400
- **Caption**: 14px, weight 400
- **Small**: 12px, weight 500

## Spacing System

8pt Grid System:
- **XS**: 4px
- **SM**: 8px
- **MD**: 16px
- **LG**: 24px
- **XL**: 32px
- **XXL**: 48px

## Border Radius

- **XS**: 8px
- **SM**: 12px
- **MD**: 16px
- **LG**: 20px
- **XL**: 24px
- **Full**: 9999px (circular)

## Shadows & Elevation

### Shadow Levels
- **SM**: Subtle lift (4px blur)
- **MD**: Standard cards (8px blur)
- **LG**: Modals (16px blur)
- **XL**: Floating elements (24px blur)
- **Glow**: Primary color glow effect

## Components

### Buttons
- **Primary**: Gradient background with glow
- **Secondary**: Solid color
- **Ghost**: Transparent with border
- **States**: Scale animation on press (0.95)

### Cards
- **Glass Effect**: Blur + semi-transparent background
- **Border**: 1px subtle border
- **Shadow**: Elevated with depth

### Input Fields
- **Background**: Surface color
- **Border**: 1px border
- **Focus**: Primary color border + glow
- **Icons**: 20px, left-aligned

### Badges & Pills
- **Shape**: Fully rounded (pill)
- **Background**: Semi-transparent with blur
- **Border**: Optional glow for active state

## Animations

### Timing
- **Fast**: 150ms
- **Normal**: 250ms
- **Slow**: 350ms
- **Very Slow**: 500ms

### Easing
- Spring animations for touch interactions
- Smooth transitions for state changes

## Navigation

### Bottom Tab Bar
- **Position**: Floating, 20px from bottom
- **Background**: Glassmorphism with blur
- **Active State**: Gradient pill
- **Icons**: 24px for inactive, 20px for active

### Screen Transitions
- **Default**: Slide from right
- **Modal**: Fade + scale

## Micro-interactions

### Hover/Press States
- Scale: 0.95 on press
- Ripple effect on touch
- Smooth color transitions

### Loading States
- Skeleton screens with shimmer
- Spinner with primary color
- Progress bars with gradient

## Accessibility

- Minimum touch target: 44x44px
- Contrast ratio: WCAG AAA compliant
- Text size: Scales with system settings
- VoiceOver/TalkBack support

## Responsive Behavior

### Mobile First
- Optimized for 375px - 428px width
- Touch-friendly spacing
- Bottom navigation for thumb reach

### Tablet
- Expanded layouts
- Side navigation option
- Multi-column grids

## Best Practices

1. **Always use the design system constants**
```javascript
   import { Colors, Typography, Spacing, Radius } from '../constants/DesignSystem';
```

2. **Prefer gradients for primary actions**
```javascript
   <LinearGradient colors={['#667EEA', '#764BA2']} />
```

3. **Use BlurView for glassmorphism**
```javascript
   <BlurView intensity={20} tint="dark" />
```

4. **Implement micro-animations**
```javascript
   Animated.spring(scaleAnim, { toValue: 0.95 })
```

5. **Maintain consistent spacing**
```javascript
   marginBottom: Spacing.lg // instead of marginBottom: 24
```

## Component Examples

See the following files for implementation examples:
- `ModernButton.js` - Button variations
- `GlassCard.js` - Card components
- `ModernLoginScreen.js` - Full screen example
- `ModernHomeScreen.js` - Bento grid layout
- `ModernEventFeed.js` - List with glassmorphism

## Future Enhancements

- [ ] Dark/Light mode toggle
- [ ] Custom theme engine
- [ ] Animation presets library
- [ ] Component storybook
- [ ] Design tokens export for Figma

---

**Version**: 2.0.0  
**Last Updated**: 2025  
**Maintained by**: Kinlo Team
