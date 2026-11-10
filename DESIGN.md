---
name: Grab Inventory (SEC WH)
description: A calm stock tool in Grab green on tinted-white paper, with one dashboard of decision-grade KPIs and flat hairline surfaces.
colors:
  paper: "#f3f6f4"
  paper-2: "#e9eeeb"
  paper-3: "#dde5e1"
  cotton: "#fcfefd"
  ink: "#161a1d"
  ink-2: "#2b3236"
  muted: "#4b4b4b"
  rule: "#dbe3de"
  rule-2: "#c3cdc7"
  brand: "#00b14f"
  brand-deep: "#006a2f"
  brand-tint: "#ccefdc"
  board: "#00873b"
  board-hover: "#006a2f"
  board-type: "#fcfefd"
  focus: "#00873b"
  ok: "#006a2f"
  ok-bg: "#ccefdc"
  warn: "#7b4c00"
  warn-bg: "#fdf4d9"
  bad: "#a51f1e"
  bad-bg: "#fdecea"
  info: "#225899"
  info-bg: "#e5f1ff"
  negative-stock: "#5c0109"
  chart-in: "#00873b"
  chart-out: "#225899"
  fill-ok: "#00b14f"
  fill-low: "#f7c942"
  fill-out: "#d33b36"
typography:
  display:
    fontFamily: "'Inter', ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
  figure:
    fontFamily: "'Roboto Mono', ui-monospace, 'SF Mono', Consolas, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-type}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.board-hover}"
  button-ghost:
    backgroundColor: "{colors.cotton}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  input-field:
    backgroundColor: "{colors.cotton}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.cotton}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  nav-tab:
    textColor: "{colors.muted}"
    padding: "0 12px"
  nav-tab-active:
    textColor: "{colors.ink}"
  badge:
    rounded: "{rounded.pill}"
    padding: "2px 12px"
---

# Design System: Grab Inventory (SEC WH)

Redesigned 2026-11-06 with Hallmark (brand: Grab, spec fetched from grab.com on 2026-11-06; shape: app screen). This file describes the shipped system; `client/styles/Theme.html` holds the tokens.

## Overview

**Creative North Star: "The Quiet Ledger, in Grab green"**

A stock tool that stays out of the way. Surfaces are cotton cards on a faintly green-tinted paper, separated by 1px rules, never by shadow. Grab green is the one strong colour: the primary button, the current tab, the logo and the chart ink. Colour is spent on meaning only: a status says what a record is, two chart hues say receipts (green) and issues (blue).

The home page is a decision surface, not a greeting: five figures that answer "what needs me now, and how healthy is the warehouse", one trend chart, and three small breakdowns. Everything on it either leads to an action or explains a number.

**Key Characteristics:**
- Tinted-white paper, cotton cards, near-black ink, hairline rules, no resting shadow.
- One typeface (Inter, full Vietnamese diacritics, the same family grab.com uses) plus Roboto Mono for codes and number columns.
- Top bar of four underlined tabs on desktop; fixed bottom bar under 860px.
- Status colour always paired with a word, never colour alone.
- Bilingual (Vietnamese/English) copy must fit the same layout.

## Colors

Source: grab.com homepage CSS, fetched 2026-11-06 (spec kept in `toolshallmark-workrand-spec.md`, outside the project so clasp never pushes it). Nothing here is recalled from memory.

### Brand and action
- **Grab Green** (#00b14f): the logo, the current-tab underline, the stock-meter and "well stocked" fills. Too light for text or small marks (2.8:1 on cotton), so it never carries words.
- **Board** (#00873b) with **Board Type** (#fcfefd): the filled primary button, the avatar, bar and line fills, the focus ring. It is Grab green darkened just enough for 4.5:1 with light text. Hover is **Brand Deep** (#006a2f).
- **Brand Tint** (#ccefdc) and **Mist** (#e9f6ef): selected rows, hover fills, "ok" badge background.

### Neutral
- **Paper** (#f3f6f4): page background. **Paper 2** (#e9eeeb) and **Paper 3** (#dde5e1): hover rows, meter tracks, chips.
- **Cotton** (#fcfefd): cards, tables, inputs, header, dialogs. Never pure white.
- **Rule** (#dbe3de) and **Rule 2** (#c3cdc7): card borders and dividers; input borders and hover.
- **Ink** (#161a1d): primary text. **Ink 2** (#2b3236) and **Muted** (#4b4b4b, as on grab.com): secondary text, labels, placeholders (all at least 4.5:1 on paper).

### Status (always with text or an icon)
- **OK** #006a2f on #ccefdc. **Warn** #7b4c00 on #fdf4d9 (low stock, slow stock). **Bad** #a51f1e on #fdecea (out of stock, errors, destructive). **Info** #225899 on #e5f1ff (pending approvals, inflow in lists). **Negative stock** #5c0109, solid with light text: a data error that must stay unmistakable.
- Pending approval is neutral ink with a dashed outline.

### Chart
- **Receipts** #00873b and **Issues** #225899 are the only two series colours (validated for colour-blind separation; Grab orange was rejected because green and orange collapse under protan vision). Stock age is an ordered green-grey ramp #9db0a6, #74877e, #4d5f58, #26322d, darker means older. The stock-health bar uses #00b14f, #f7c942, #d33b36 and the negative maroon, each row labelled in words.

### Named Rules
**The Green-Is-Action Rule.** Grab green marks the brand and the thing to press next. It does not fill large areas, headings or decoration.
**The Words-With-Colour Rule.** A status, a chart segment or a stat tone is always accompanied by its word. Never rely on hue alone.
**The Tinted-Neutral Rule.** Neutrals lean faintly green; pure white and cool grey are out of system.

## Typography

**Font:** Inter (400 / 500 / 600 / 700), the family grab.com uses on the web, with system-ui fallbacks, loaded asynchronously; the page must stay usable on the fallback. **Roboto Mono** (400 / 500) for SKU codes, version strings and aligned number columns. Both cover Vietnamese diacritics. (Grab Community, the brand display face, is proprietary and not available to the app.)

### Hierarchy
- **Stat value** (600, 28px, -0.02em, proportional figures): the five home figures.
- **Headline** (600, 22px, 1.15): page titles. **Title** (600, 15px): panel and section headings.
- **Body** (400, 15px, 1.55): default; table text 14px; helper text 13px.
- **Label** (500, 13px, sentence case, muted): form labels, stat labels, table heads at 12px.
- **Figure** (Roboto Mono 500, tabular): codes and columns of numbers only; large single figures stay in Inter.

### Named Rules
**The Diacritic Room Rule.** Line-height at or above 1.45 for anything that may be Vietnamese.
**The Two-Language Fit Rule.** Test the longer of the Vietnamese and English strings.
**The Sentence-Case Rule.** No uppercase labels and no tracked letters anywhere.

## Layout

One scrolling column, max 1360px, under a 56px header. Content padding 24px 32px on desktop, 16px on phones with room for the bottom bar. Spacing follows a 4px grid (2 is allowed as a nudge). The home page is a 12-column grid: a five-tile stat strip, then the trend chart (8) beside the attention list (4), then three breakdowns (4 + 4 + 4). Under 1100px the strip becomes 3 across and panels pair up; under 700px everything stacks.

Navigation: top tabs (Home, Stock, Reports, Manage) with an underlined sub-nav for grouped pages. At 860px and below the tabs move to a fixed bottom bar. Admin-only areas are hidden from staff, not disabled.

## Elevation

Flat. Cards carry a 1px rule and no shadow. Floating UI only: popovers, the notification box, tooltips and dialogs use a small shadow (`0 4px 16px` or `0 8px 20px`, blur under 24px).

## Shapes

8px for controls, 12px for cards and tables, 16px for dialogs. Badges and the help button are round. Borders are 1px; no coloured side stripes.

## Components

### Buttons
36px tall (30px small, 44px on coarse pointers). **Primary:** Grab-green board fill, board-type text, 500 weight; one per view. **Ghost:** cotton fill, rule-2 border, ink text. **Danger:** ghost with bad-coloured text; `danger-solid` only for a confirmed destructive step. Disabled is paper-2 fill, muted text, not-allowed cursor.

### Inputs
Cotton fill, 1px rule-2 border, 36px high (44px with 16px text on touch). Focus is a 2px green outline drawn inside the border; the border itself never changes.

### Stat strip (home)
Five tiles in one bordered container with dividers. Label, a 28px value, a muted foot line aligned to the bottom, optional 4px meter. Tappable tiles (pending, attention) are buttons and lift to a faint paper tint on hover. Only "needs action" values take a status colour.

### Charts
Lines 2px, grid and axis hairlines, no dashes, labels in muted ink. The receipts/issues chart has a legend with totals, a crosshair tooltip on hover/touch, and a "view as table" disclosure. Bars are single-hue and never wider than a thin band; values sit at the bar end.

### Tables
Inside a card. Heads 12px / 500 muted, sentence case, rule below. Rows 10px padding, faint hover (#f0f5f2). On phones each row becomes a labelled block. Codes use Roboto Mono.

### Navigation
Header cotton with a rule below. Tabs are muted text; the current tab is ink with a 2px Grab-green underline. Sub-nav uses the same underline. Mobile: fixed bar, 22px icons over 12px labels, current tab on paper-2.

## Do's and Don'ts

### Do
- Keep one filled primary button per view.
- Pair every status colour with a word, in both languages.
- Keep controls at least 36px on desktop and 44px on coarse pointers; 16px input text on touch.
- Honour `prefers-reduced-motion`; transitions are about .12s and only for colour or opacity.
- Write every new string in Vietnamese and English.

### Don't
- Don't fill large areas with colour, use gradients, glows or resting shadows.
- Don't use uppercase or letter-spaced labels, middle dots, or arrows glued to link text.
- Don't mix units in a total without showing the unit; sum per unit.
- Don't put an icon in a coloured tile above a number.
- Don't add a second typeface.
