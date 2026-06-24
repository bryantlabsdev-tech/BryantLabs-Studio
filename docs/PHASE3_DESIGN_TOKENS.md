# Phase 3 — Design Token System

Source: `src/styles/tokens.css` (imported via `src/index.css`)

## Surfaces

| Token | Value | Alias |
|-------|-------|-------|
| `--bg` | `#0a0b10` | `--bg-base` |
| `--bg-elevated` | `#181b24` | — |
| `--surface` | `#12151c` | `--bg-surface` |
| `--surface-hover` | `#1c212b` | `--bg-surface-2` |

## Borders

| Token | Value |
|-------|-------|
| `--border` | `#252b36` |
| `--border-strong` | `#343d4d` |

## Text

| Token | Role |
|-------|------|
| `--text-primary` | Headings, primary content |
| `--text-secondary` | Body, labels |
| `--text-muted` | Captions, hints |

## Semantic

| Token | Use |
|-------|-----|
| `--success` / `--success-soft` | Passed, verified |
| `--warning` / `--warning-soft` | Caution states |
| `--danger` / `--danger-soft` | Errors, destructive |

## Accent — Deep Indigo (single system)

| Token | Use |
|-------|-----|
| `--accent` | `#6366f1` — primary actions, active tabs |
| `--accent-hover` | `#818cf8` — hover, live indicators |
| `--accent-strong` | `#4f46e5` — pressed, borders |
| `--accent-muted` | `#a5b4fc` — chips, secondary accent text |
| `--accent-soft` | Tinted backgrounds |
| `--accent-border` | Subtle accent outlines |
| `--accent-glow` | Focus rings, glows |

## Typography

| Utility class | Token basis |
|---------------|-------------|
| `.text-heading` | 15px / 600 |
| `.text-subheading` | 13px / 600 |
| `.text-body` | 14px / 400 |
| `.text-caption` | 11px / 500 |

## Radii

| Token | Size |
|-------|------|
| `--radius-sm` | 6px |
| `--radius-md` | 10px |
| `--radius-lg` | 14px |
| `--radius-full` | pill |

## Motion

| Token | Value |
|-------|-------|
| `--duration-fast` | 120ms |
| `--duration-normal` | 200ms |
| `--duration-slow` | 320ms |
| `--ease-out` | Material standard |

## Button hierarchy

| Class | Role |
|-------|------|
| `.btn--primary` | Primary CTA |
| `.btn--secondary` | Secondary actions |
| `.btn--ghost` | Tertiary / links |
| `.btn--danger` | Destructive |

Legacy: `.prov-btn--primary`, `.open-btn--primary`, `.prov-btn--ghost` aligned to same tokens.

## Polish layer

`src/styles/polish.css` — Phase 3 overrides for empty states, center tabs, execution dashboard, chat, motion. Loaded after `App.css`.
