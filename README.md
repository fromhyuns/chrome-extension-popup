# QA Lens

A Chrome extension that inspects CSS properties and design tokens of any element on any website.

## Features

### Real-time Element Inspection
- Hover to preview elements with overlay highlighting
- Click to select and inspect full CSS properties
- Click again on the same element to drill into nested children
- Arrow keys to navigate the DOM tree (parent / child / siblings)

### Design Token Detection
- Detects CSS custom properties (`var(--token-name)`) used in styles
- Supports shorthand property lookup (`margin` → `margin-top`, `font` → `font-size`, etc.)
- Resolves unit conversions (`rem`, `em`, `vh`, `%` → `px`) for accurate token matching
- Scans `@media`, `@supports`, and other nested CSS rules
- Checks `data-token`, `data-component`, `data-icon`, `data-testid` attributes
- Recognizes icon library class names (Font Awesome, Material Icons, etc.)

### Inspected Properties

| Section | Details |
|---------|---------|
| **Typography** | Font family, size, weight, line-height, letter-spacing + token values + font preview |
| **Colors** | Text color, background color (with inherited detection), gradient support with color stops |
| **WCAG Contrast** | Contrast ratio calculation, AA/AAA level badges |
| **Box Model** | Visual margin / padding / content diagram |
| **Spacing** | Gap, margin, padding values with token detection |
| **Attributes** | Display, position, border, border-radius, opacity, overflow + tokens |

### UI & UX
- **Shadow DOM isolation** — styles never conflict with the inspected page
- **Draggable FAB** — reposition the floating action button anywhere on screen
- **Right-edge anchoring** — FAB and panel stay anchored to the right on viewport resize
- **Viewport size display** — live viewport dimensions in the footer
- **Click to copy** — click any value to copy it to clipboard
- **Keyboard shortcuts** — accessible via the Shortcuts button in the footer

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Click` | Inspect element (repeat to go deeper) |
| `↑` `↓` `←` `→` | Navigate DOM tree |
| `ESC` | Pause inspection |
| `₩` (backtick) | Resume inspection |

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `extension` folder

## Project Structure

```
extension/
├── manifest.json       # Chrome extension manifest (MV3)
├── background.js       # Service worker — handles extension icon click
├── content.js          # Main inspector logic (Shadow DOM widget)
├── content.css         # Overlay styles for hover/select highlights
├── generate_icons.py   # Icon generator script (requires Pillow)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Tech Stack

- **Chrome Extension Manifest V3**
- **Vanilla JavaScript** — no frameworks or dependencies
- **Shadow DOM** — complete style isolation from host page
- **CSS Custom Properties** — design token detection engine
