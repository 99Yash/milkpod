# UI Polish Plan

Apply patterns from `docs/ui-polish-patterns.md` to the milkpod codebase. Each task targets specific files.

---

## ~~Task 1 — Global Text & Font Baseline~~ ✅

Apply globally in root layout and CSS:
- `text-wrap: balance` on headings
- `-webkit-font-smoothing: antialiased` on body (verify it's set)
- `font-variant-numeric: tabular-nums` on numeric elements

**Files to audit:**
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/chat/daily-quota.tsx` (quota numbers)
- `apps/web/src/components/chat/word-limit-picker.tsx` (word counts)
- `apps/web/src/components/billing/pricing-grid.tsx` (prices)
- `apps/web/src/components/asset/transcript/chapter-progress-bar.tsx` (timestamps/progress)
- `apps/web/src/components/chat/timestamp-link.tsx` (timestamps)

**Reference patterns:** 1, 4, 5

---

## ~~Task 2 — Card Shadows & Image Outlines~~ ✅

Replace solid borders with multi-layer shadows on cards. Add subtle outlines on thumbnails/images.

**Files to audit:**
- `apps/web/src/components/library/asset-card.tsx` (video thumbnails + card container)
- `apps/web/src/components/library/collection-card.tsx` (card container)
- `apps/web/src/components/moments/moment-card.tsx` (card container)
- `apps/web/src/components/comments/comment-card.tsx` (card container)
- `apps/web/src/components/chat/ai-avatar.tsx` (avatar image)
- `apps/web/src/components/chat/video-moment-dialog.tsx` (video preview)

**Reference patterns:** 10, 11

---

## ~~Task 3 — Concentric Border Radii~~ ✅

Audit nested containers for matching radii and fix with outer = inner + padding formula.

**Files to audit:**
- `apps/web/src/components/library/asset-card.tsx` (card > thumbnail)
- `apps/web/src/components/library/collection-card.tsx`
- `apps/web/src/components/moments/moment-card.tsx`
- `apps/web/src/components/chat/chat-panel.tsx` (input area)
- `apps/web/src/components/billing/pricing-grid.tsx` (plan cards)
- `apps/web/src/components/ui/card.tsx` (base card component)
- `apps/web/src/components/ui/dialog.tsx` (dialog > inner content)

**Reference pattern:** 2

---

## ~~Task 4 — Enter/Exit Animations & Staggering~~ ✅

Add or improve entrance animations with staggered reveals. Make exit animations subtle.

**Files to audit:**
- `apps/web/src/components/chat/message.tsx` (chat messages entering)
- `apps/web/src/components/chat/thread-sidebar.tsx` (sidebar slide in/out)
- `apps/web/src/components/chat/tool-result.tsx` (tool results appearing)
- `apps/web/src/components/chat/shimmer-text.tsx` (loading animation)
- `apps/web/src/components/library/asset-list.tsx` (cards entering view)
- `apps/web/src/components/library/collection-list.tsx` (cards entering view)
- `apps/web/src/components/moments/moments-tab.tsx` (moment cards)
- `apps/web/src/components/dashboard/dashboard-content.tsx` (dashboard sections)
- `apps/web/src/app/globals.css` (define reusable @keyframes)

**Reference patterns:** 7, 8

---

## ~~Task 5 — Interruptible Animations & Contextual Icons~~ ✅

Ensure interactive animations use CSS transitions (not keyframes). Add contextual icon animations.

**Files to audit:**
- `apps/web/src/components/dashboard/sidebar-toggle.tsx` (toggle animation)
- `apps/web/src/components/chat/model-picker.tsx` (picker open/close)
- `apps/web/src/components/chat/chat-panel.tsx` (input focus states)
- `apps/web/src/components/library/search-filter-bar.tsx` (filter expand/collapse)
- `apps/web/src/components/asset/asset-tab-bar.tsx` (tab switching)
- `apps/web/src/components/library/asset-card.tsx` (hover action icons)
- `apps/web/src/components/moments/moment-card.tsx` (hover action icons)
- `apps/web/src/components/share/share-dialog.tsx` (copy icon feedback)

**Reference patterns:** 3, 6

---

## ~~Task 6 — Optical Alignment Sweep~~ ✅

Audit buttons with icons, play buttons, and icon+text pairs for optical alignment.

**Files to audit:**
- `apps/web/src/components/chat/chat-panel.tsx` (send button with icon)
- `apps/web/src/components/chat/timestamp-link.tsx` (play icon + timestamp)
- `apps/web/src/components/asset/transcript/transcript-toolbar.tsx` (toolbar buttons)
- `apps/web/src/components/library/url-input-form.tsx` (submit button)
- `apps/web/src/components/ui/button.tsx` (base button — icon variants)
- `apps/web/src/components/moments/moment-preset-switcher.tsx` (preset buttons)
- `apps/web/src/components/billing/pricing-grid.tsx` (CTA buttons)

**Reference pattern:** 9
