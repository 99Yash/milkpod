# UI Polish Patterns

Reference doc distilled from [Details That Make Interfaces Feel Better](https://jakub.kr/writing/details-that-make-interfaces-feel-better).

---

## 1. Text Wrapping — `text-wrap: balance`

Distributes text evenly across lines, avoiding orphaned words on the last line.

```css
.heading { text-wrap: balance; }
```

Tailwind: `text-balance`

**When to use:** Headings, card titles, hero text — any short multi-line text block.
**Alternative:** `text-wrap: pretty` (slower algorithm, better for body text).

---

## 2. Concentric Border Radius

Nested elements need proportional radii: **outer = inner + padding**.

```
outer-radius: 20px
inner-radius: 12px  /* 20 - 8 */
padding: 8px
```

**Anti-pattern:** Same border-radius on parent and child — creates a visual "pinch" at corners.

**When to use:** Cards with inner content areas, nested containers, button groups with backgrounds.

---

## 3. Animate Icons Contextually

Icons that appear/disappear alongside interactions should animate with opacity, scale, and blur — not just pop in/out.

- Use spring animations (Motion library) for natural feel
- Transition: opacity + scale + blur simultaneously
- Conditional rendering with animation states

**When to use:** Action icons on hover, status indicators, contextual controls (edit, delete, expand).

---

## 4. Crisp Text Rendering — `-webkit-font-smoothing: antialiased`

```css
body { -webkit-font-smoothing: antialiased; }
```

Tailwind: `antialiased` on root layout.

- Default macOS: subpixel antialiasing (heavier)
- With `antialiased`: grayscale antialiasing (thinner, crisper)

**When to use:** Apply globally to the root element. Standard for modern web apps.

---

## 5. Tabular Numbers — `font-variant-numeric: tabular-nums`

Makes all digits equal width so numbers don't shift when updating.

```css
.counter { font-variant-numeric: tabular-nums; }
```

Tailwind: `tabular-nums`

**When to use:** Counters, timers, timestamps, prices, progress indicators, tables with numeric columns.
**Caveat:** Some fonts (e.g., Inter) change numeral appearance with this property — check visually.

---

## 6. Interruptible Animations

| Type | Behavior | Best for |
|------|----------|----------|
| CSS transitions | Interpolate toward latest state; can be interrupted mid-flight | User interactions (hover, toggle, expand) |
| Keyframe animations | Fixed timeline; don't retarget after start | Staged sequences that run once (enter, exit, loading) |

**Anti-pattern:** Using keyframe animations for interactive state changes — feels broken when users change intent mid-interaction.

---

## 7. Split & Stagger Entering Elements

Break entrance animations into smaller chunks with staggered delays.

```css
@keyframes enter {
  from {
    transform: translateY(8px);
    filter: blur(5px);
    opacity: 0;
  }
}

.entering {
  animation: enter 800ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  animation-delay: calc(var(--delay, 0ms) * var(--stagger, 0));
}
```

**Stagger values:**
- Sections: 100ms between groups
- Words in a title: 80ms between words

**Combine:** opacity + blur + translateY for rich entrance feel.

---

## 8. Subtle Exit Animations

Exits should be less dramatic than entrances — less movement, same blur/opacity.

| Property | Entrance | Exit (full) | Exit (subtle) |
|----------|----------|-------------|---------------|
| translateY | 8px | calc(-100% - 4px) | -12px |
| opacity | 0 → 1 | 1 → 0 | 1 → 0 |
| blur | 5px → 0 | 0 → 4px | 0 → 4px |
| duration | 800ms | 450ms | 450ms |

Use spring animation with zero bounce for exits.

**Principle:** Exiting elements don't need the same movement and attention. Keep some motion to indicate direction.

---

## 9. Optical Alignment (Not Geometric)

Shapes need visual adjustment, not pixel-perfect centering.

**Common case:** Button with text + icon — apply slightly smaller padding on the icon side.

```css
/* Icon on right side of button */
.btn-icon-right {
  padding-right: 10px; /* vs 14px on text side */
}
```

**Best practice:** Fix icon alignment in the SVG itself when possible.
**When to use:** Play buttons in circles, icons next to text, arrow indicators.

---

## 10. Shadows Instead of Borders

Multi-layer box-shadow with transparency instead of solid borders — adds depth and works on any background.

```css
.card {
  box-shadow:
    0px 0px 0px 1px rgba(0, 0, 0, 0.06),
    0px 1px 2px -1px rgba(0, 0, 0, 0.06),
    0px 2px 4px 0px rgba(0, 0, 0, 0.04);
  transition: box-shadow 150ms ease;
}

.card:hover {
  box-shadow:
    0px 0px 0px 1px rgba(0, 0, 0, 0.08),
    0px 1px 2px -1px rgba(0, 0, 0, 0.08),
    0px 2px 4px 0px rgba(0, 0, 0, 0.06);
}
```

**Advantages over borders:**
- Adds depth perception
- Uses transparency — adapts to any background color
- Works on images and colored surfaces
- Smooth hover transitions

---

## 11. Outline on Images

A subtle 1px outline with low opacity creates consistent depth on images.

```css
.image-overlay {
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

/* Dark mode */
.dark .image-overlay {
  outline-color: rgba(255, 255, 255, 0.1);
}
```

**When to use:** Thumbnails, avatars, media cards — anywhere images sit on variable backgrounds.
