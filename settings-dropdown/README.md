# PlayerIQ Refactored Settings Dropdown Mockup

This standalone package implements a premium, ultra-compact, and highly accessible hybrid Settings Dropdown component custom-tailored for mobile devices. It is designed to constrain oversized panels into a scrollable, highly scannable control deck.

---

## 🚀 Quick Start / How to Run & Test

1. **Extract/Unzip** the package containing:
   - `index.html` (Component structure & mockup container viewports)
   - `styles.css` (Ultra-smooth transitions, layouts, and HSL colors)
   - `app.js` (Accordion, modal trigger, keyboard focus traps, and lazy loading)
   - `README.md` (Self-documentation and checklists)
2. **Open index.html** in any standard modern browser (Chrome, Safari, Firefox, Edge).
3. **Simulate Mobile View**:
   - Open Developer Tools (`F12` or `Ctrl + Shift + I` / `Cmd + Option + I`).
   - Click the **Device Toolbar Icon** to toggle mobile screen simulation.
   - Choose a preset device like **iPhone 12/13/14 Pro** or **Pixel 7** to review the fully optimized full-width mobile sliding sheet.
4. **Toggle Dropdown**:
   - Tap the premium **Gear / Settings Menu** trigger button at the top to toggle the redesigned Dropdown container.

---

## 💎 Layout & Visual Premium Mechanics

- **Hybrid Category Chips (Sticky Header)**: Sticky chip selectors act as quick navigations at the top. Clicking a chip automatically closes currently open accordion sections, toggles open the designated category section, and scrolls the parent scrollbar smoothly to that item.
- **Single-Open Accordion Stack**: Designed so only one accordion section may remain open at any given moment. This drastically cuts down vertical height scrolling and makes options highly scannable.
- **Compact Setting Rows**: Grid-aligned key-value pairs (Label on the left with description, and controls aligned perfectly to the right side).
- **Sub-Modal Custom Flyouts**: Heavy sections like *Subtitle Customizer* and *Download Manager* are trimmed to a clean trigger row inside the main list. Tapping the trigger opens a smooth, bottom-sliding overlay modal.

---

## ⚡ Lazy Load Performance Algorithms

Heavy lists and rich charts can cause rendering stutter when opening the settings drawer. In this mockup:
- **Storage Metrics Graphs & Offline Titles** are strictly **lazy loaded** inside the Download Manager Modal.
- The modal immediately displays a shimmering loader state.
- After a simulated `1200ms` API fetch delay, the actual graphs and titles are populated and transitioned smoothly into view.
- **Micro-Interaction Deleted Cache items**: Individual offline item row trash triggers let users visually slide-out and delete items from device cache storage.

---

## ♿ Comprehensive Accessibility (A11Y) Checklist

This component conforms to high-priority accessibility standards with full keyboard support and screen reader markers:

| ARIA Attribute / Interaction | Purpose | Conformance Status |
| :--- | :--- | :--- |
| `role="tablist"` & `role="tab"` | Identifies the top category filter chips as tabs. | ✅ Conforming |
| `aria-selected` | Dynamically updates the selected tab state for Screen Readers. | ✅ Conforming |
| `aria-expanded` | Set on accordion header triggers (`true` / `false`) to declare visibility state. | ✅ Conforming |
| `aria-controls` | Explicitly associates triggers with accordion panels and modal flyouts. | ✅ Conforming |
| `role="dialog"` & `aria-modal="true"` | Designates the flyout panels as overlay interactive dialog elements. | ✅ Conforming |
| `aria-hidden` | Used on modal overlays and closed menus to hide active nodes from focus maps. | ✅ Conforming |
| **Space & Enter Triggers** | Toggles accordion expansion and selects accent color chips. | ✅ Conforming |
| **Arrow Right / Left Keys** | Enables seamless focus navigation across top category chips. | ✅ Conforming |
| **Escape Key Closure** | Pressing `Esc` immediately closes active modals or settings dropdown. | ✅ Conforming |
| **Modal Focus Trapping** | Traps focus keys (Shift+Tab & Tab) within open modals to prevent background leakage. | ✅ Conforming |
| **Previously Focused Restores** | Closing a modal automatically shifts active page focus back to the originating button. | ✅ Conforming |

---

## 🎨 Harmony & Aesthetics

- Built using the gorgeous **Outfit** font-face.
- Harmony color palette featuring vibrant violet HSL scales (`#a855f7`) contrasting with solid dark high-contrast backgrounds (`#090a0f`, `#121420`).
- Glassmorphic accents with subtle border gradients to deliver a state-of-the-art cinematic streaming atmosphere.
