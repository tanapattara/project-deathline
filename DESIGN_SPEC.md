# Deadline — Mobile-First Responsive Design

This design specification extends the [Deadline implementation plan](./IMPLEMENTATION_PLAN.md). Mobile is the default layout; larger layouts enhance the same content and actions without changing the underlying workflow.

## 1. Design principles

1. **Deadline information first:** Title, calculated status, due time, and remaining time must be immediately scannable.
2. **One-handed mobile use:** Primary navigation and common actions remain reachable near the bottom of a phone screen.
3. **Progressive enhancement:** Start with one column and add columns, side navigation, and tables only when space supports them.
4. **Consistent actions:** Create, edit, complete, cancel, and delete use the same wording and hierarchy on every device.
5. **Accessible urgency:** Communicate status with text and iconography as well as color.
6. **Offline confidence:** Show connectivity and synchronization state without blocking offline CRUD.

## 2. Responsive system

Use fluid sizing by default and introduce layout changes at content-driven breakpoints.

| Range | Layout behavior |
| --- | --- |
| `< 480px` | Compact phone: one column, bottom navigation, full-width controls |
| `480–767px` | Large phone: one column with more generous spacing and paired controls where safe |
| `768–1023px` | Tablet: two-column dashboard areas and wider forms |
| `1024–1439px` | Desktop: persistent side navigation, multi-column dashboard, table view available |
| `≥ 1440px` | Wide desktop: centered, width-constrained content |

Recommended constraints:

```css
:root {
  --page-max-width: 1440px;
  --reading-max-width: 72ch;
  --touch-target: 44px;
  --space-page-inline: clamp(1rem, 3vw, 2rem);
  --space-section: clamp(1.25rem, 3vw, 2.5rem);
}

.page-content {
  width: min(100%, var(--page-max-width));
  margin-inline: auto;
  padding-inline: var(--space-page-inline);
}
```

Do not use device detection or separate mobile/desktop pages. Use media queries, flexible grids, `minmax()`, and container queries where useful.

## 3. Application shell

### Phone

- Compact top app bar: page title, offline/sync indicator, and overflow actions.
- Fixed bottom navigation: Dashboard, Deadlines, Add, and optional Statistics.
- Add is visually prominent but remains a labeled navigation item.
- Apply `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` in installed mode.
- Give page content enough bottom padding to remain clear of fixed navigation.

### Tablet

- Retain bottom navigation in portrait when it is easier to reach.
- A compact left rail may replace it in landscape when enough width is available.

### Desktop

- Persistent left sidebar with logo, labeled navigation, sync state, and update notice.
- Slim page header with title, contextual search, and primary page action.
- Centered, width-constrained main content.

Only one primary navigation pattern is visible at a time.

## 4. Design tokens

### Spacing

Use a 4px-based scale: `4, 8, 12, 16, 24, 32, 48, 64`.

- Phone page padding: 16px.
- Tablet page padding: 24px.
- Desktop page padding: 32px.
- Card padding: 16px on phone and 20–24px on larger screens.
- Minimum gap between unrelated touch actions: 8px.

### Typography

- Base text: `clamp(1rem, 0.96rem + 0.2vw, 1.125rem)`.
- Page title: `clamp(1.5rem, 1.25rem + 1vw, 2.25rem)`.
- Main countdown uses fluid sizing and tabular numerals; it may wrap into a 2×2 grid on narrow phones.
- Body line height: 1.5–1.65.
- Use no more than three clearly differentiated text sizes within one card.

### Status color

Define semantic tokens: `--status-upcoming`, `--status-due-soon`, `--status-due-today`, `--status-overdue`, `--status-completed`, `--status-completed-late`, and `--status-cancelled`.

Each badge includes text and an icon or shape. Maintain WCAG AA contrast and distinguish due soon, due today, and overdue rather than using the same red treatment.

### Controls

- Minimum interactive size: 44×44 CSS pixels.
- Inputs and buttons: at least 48px high on touch layouts.
- Preserve a clearly visible keyboard focus style.
- Keep destructive actions visually secondary until confirmation.

## 5. Page layouts

### Dashboard

Phone order:

1. Heading and synchronization state.
2. Nearest active deadline hero with title, due timestamp, live countdown, status, and View action.
3. Horizontally scrollable summary-card row with scroll snapping, or a two-column grid when labels fit.
4. Due today.
5. Overdue.
6. Upcoming.
7. Recent completions.

On tablet and desktop, summary cards become an auto-fit grid. The nearest deadline uses the wider primary column, while due-today and overdue lists may share a secondary column. Recent completions remain below active content.

### All deadlines

Phone:

- Full-width search first.
- A Filter button opens a bottom sheet for status, priority, category, and dates.
- Keep the sort selector visible.
- Show active filters as removable chips with Clear all.
- Render deadlines as stacked cards.

Tablet:

- Search, filter, and sort form a wrapping toolbar.
- Cards use an auto-fit grid with a minimum useful width of 300px.

Desktop:

- Offer table/card view selection.
- Table columns prioritize Title, Status, Due, Priority, Progress, and Actions.
- Switch back to cards below the useful table width instead of creating page-level horizontal scrolling.

### Add and edit deadline

Phone:

- One field per row with labels above controls.
- Date and time may be separate controls if easier to use.
- Display validation immediately below its field.
- Use a sticky Save/Cancel area that accounts for safe areas and the virtual keyboard.

Tablet and desktop:

- Constrain the form to approximately 800px.
- Pair category/priority and date/time where space permits.
- Keep title, description, and notes full width.

### Deadline details

Phone:

- Show status, title, due timestamp, and countdown before secondary metadata.
- Use labeled metadata rows instead of a compressed table.
- Complete is the primary action for active items; Edit and Cancel are secondary.
- Keep Delete inside an overflow menu or separate danger section.

Desktop uses two columns: main details/countdown and secondary metadata/actions.

### Empty and error states

- Empty list: Add deadline.
- Empty filtered result: Clear filters.
- Missing record: Back to all deadlines.
- Every state includes a clear explanation and one useful recovery action.

## 6. Component behavior

### Deadline card

- Header: title and status badge.
- Body: due timestamp and countdown.
- Footer: priority, progress, and one primary action.
- Clamp list descriptions to two lines; show full text in details.
- Never shrink countdown text excessively just to keep it on one line.

### Filter and confirmation surfaces

- Filters use a bottom sheet on phones and a popover/modal on larger screens.
- Delete confirmation names the deadline, focuses Cancel first, and visually separates Delete.
- Modal variants trap focus and return it to the trigger on close.
- Do not use browser `confirm()` in the final design.

### Synchronization feedback

- Use non-blocking toasts for saved, deleted, synchronized, and update-ready messages.
- Show persistent compact Offline and Pending sync indicators.
- Never imply offline data reached the server before synchronization succeeds.
- Toast regions use `aria-live="polite"`.

## 7. Interaction and performance

- Debounce search by approximately 150–250ms; local filtering remains immediate.
- Use one shared timer for all countdowns rather than one timer per card.
- Pause nonessential rendering while the document is hidden, then recalculate on return.
- Respect `prefers-reduced-motion`.
- Use skeletons only for real asynchronous waits.
- Avoid large images and third-party font dependencies so the offline shell remains small.

## 8. Accessibility requirements

- Use semantic landmarks and one `h1` per screen.
- Associate every input with its label, help text, and errors.
- Do not announce countdown changes every second to screen readers; provide a readable due summary.
- Support keyboard-only operation for all navigation, cards, menus, sheets, and dialogs.
- Support 200% text zoom without clipped content or hidden actions.
- Allow portrait and landscape; do not lock installed PWA orientation.

## 9. Responsive acceptance checklist

- [ ] No page-level horizontal scrolling at 320px CSS width.
- [ ] All actions remain usable at 200% text zoom.
- [ ] Touch targets are at least 44×44 CSS pixels.
- [ ] Bottom navigation and sticky actions do not cover content or form fields.
- [ ] Phones use cards instead of compressed tables.
- [ ] Tablets use available width without stretching forms excessively.
- [ ] Desktops provide persistent navigation and efficient information density.
- [ ] Layout works in portrait, landscape, split-screen, and installed standalone modes.
- [ ] Offline and pending-sync states are visible without blocking local CRUD.
- [ ] Dialogs, sheets, menus, and navigation pass keyboard/focus checks.
- [ ] Status is understandable in grayscale and without relying on color.
- [ ] Countdown updates do not cause layout shift.

## 10. Verification viewport matrix

Test these CSS viewports and continuously resize between them:

| Viewport | Purpose |
| --- | --- |
| `320 × 568` | Minimum narrow phone |
| `390 × 844` | Common modern phone |
| `844 × 390` | Phone landscape/reduced height |
| `768 × 1024` | Tablet portrait |
| `1024 × 768` | Tablet landscape/small desktop |
| `1280 × 800` | Typical laptop |
| `1440 × 900` | Wide desktop |

Also verify 200% browser zoom, reduced motion, keyboard-only use, offline mode, long titles/categories, empty data, and a large dataset.
