# Phase 3 — Remaining Visual Debt

## Completed

- Design token file with deep indigo accent
- Center tab overflow (Editor / Execution / Preview / More)
- Enhanced `EmptyState` (icon + action)
- Button hierarchy utilities
- Execution dashboard spacing, chips, panels
- Chat / run block hover and spacing
- Bulk replacement of `#818cf8` / `#6366f1` hex accents in `App.css`
- Motion tokens and subtle transitions

## Remaining debt

| Area | Issue |
|------|-------|
| `App.css` size (~10k lines) | Many component styles still inline; not tokenized |
| rgba fallbacks | Some gradients still use raw `color-mix` percentages |
| Empty states | ~15 views use text-only `EmptyState` without icons yet |
| Light mode | Not supported |
| Monaco theme | Editor colors independent of app tokens |
| Provider pills | Success/warning dots use hardcoded `#3dd68c`, `#e8b84a` |
| Status bar | Not refreshed in Phase 3 |
| Icon rail | No polish pass |
| Command palette | Legacy styling |
| Generated screenshots | Capture manually from `npm run electron:dev` |

## Before / after

Screenshots should be captured locally:

1. **Before reference**: git stash or prior build — overcrowded 7-tab center bar, mixed blue/purple accents
2. **After**:
   - Center workbench with 3 tabs + More menu
   - Explorer empty state with icon + Choose Project
   - Agent chat with run blocks and improved spacing
   - Execution dashboard with panel hierarchy and status chips

## Suggested Phase 4 (visual only)

- Migrate high-traffic views to shared `EmptyState` with icons
- Split `App.css` into domain modules importing tokens
- Monaco theme sync to `--surface` / `--accent`
- Icon rail + status bar token pass
