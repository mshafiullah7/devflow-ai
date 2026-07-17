### ☀️ Light Theme Specification
```text
Color Palette:
- Primary: #61be8b
- Background: #ffffff
- Surface: #f8faf8
- Text primary: #0f172a
- Text secondary: #475569
- Border: #e2e8f0
- Danger: #ef4444
- Hero Header: linear-gradient(135deg, #1b6b40 0%, #236e47 60%, #2d8a57 100%)

Typography:
- Font family: 'Manrope', system-ui, sans-serif
- Heading: font-weight 800, font-size 22px, tracking-tight
- Body: font-weight 500, font-size 14px, line-height 1.5

Components:
- Layout: Full width, responsive controls, no phone container limitations.
- Header: Large green gradient hero block banner (#1b6b40 to #2d8a57) with white text, rounded bottom edges, containing total balance in large typography and wealth breakdown progress bar.
- Cards: border-radius 12px (xl), background #f8faf8, border 1px solid #e2e8f0, subtle shadow-sm.
- Buttons: border-radius 12px, padding 8px 16px, font-weight 600. Active states/chips use semi-transparent green background (rgba(97, 190, 139, 0.12)) and green text (#61be8b).
- Inputs: border-radius 12px, background #f1f5f9, border 1px solid #cbd5e1, focus-border #61be8b.
- Progress bars: thin height 6px, background #f1f5f9, primary color progress fill (#13ec5b).
- Bottom Sheets: Slide up from the bottom with a 24px top border-radius, dark semi-transparent backdrop blur (backdrop-blur-sm bg-black/50), a center handle bar at the top, and scrollable content panel.
```

Platform: Flutter (Material 3) — mocked in HTML/CSS
- Frame: phone viewport, max-width ~420px, centered on the page (not desktop-wide)
- Buttons: fully rounded or 20px radius, tonal elevation shadow instead of a border (ElevatedButton/FilledButton style)
- Text fields: filled/outlined Material style with floating label, not plain bordered inputs
- Cards: 12–16px radius, soft elevation shadow (box-shadow), no 1px border
- FAB: 56px circle, bottom-right, elevation shadow, used for the primary add/action
- Navigation: Material top AppBar; BottomNavigationBar for tab navigation
- Colours: map Primary/Background/Surface above to Material roles (primary, onPrimary, surface, onSurface); use layered surface tones (elevation) instead of borders to separate cards from the background
- Touch targets: minimum 44px; single-column mobile-first layout; bottom sheets instead of desktop dropdowns/hover menus

---

### 🌙 Dark Theme Specification
```text
Color Palette:
- Primary: #13ec5b
- Background: #102216
- Surface: #1a2e22
- Text primary: #ffffff
- Text secondary: #cbd5e1
- Border: #1e3d2c
- Danger: #ef4444
- Hero Header: linear-gradient(135deg, #1b6b40 0%, #236e47 60%, #2d8a57 100%)

Typography:
- Font family: 'Manrope', system-ui, sans-serif
- Heading: font-weight 800, font-size 22px, tracking-tight
- Body: font-weight 500, font-size 14px, line-height 1.5

Components:
- Layout: Full width, responsive controls, no phone container limitations.
- Header: Large green gradient hero block banner (#1b6b40 to #2d8a57) with white text, rounded bottom edges, containing total balance in large typography and wealth breakdown progress bar.
- Cards: border-radius 12px (xl), background #1a2e22, border 1px solid #1e3d2c, shadow-md.
- Buttons: border-radius 12px, padding 8px 16px, font-weight 600. Active states/chips use semi-transparent green background (rgba(97, 190, 139, 0.18)) and green text (#61be8b).
- Inputs: border-radius 12px, background rgba(255, 255, 255, 0.05), border 1px solid #1e3d2c, focus-border #13ec5b.
- Progress bars: thin height 6px, background rgba(255, 255, 255, 0.1), primary color progress fill (#13ec5b).
- Bottom Sheets: Slide up from the bottom with a 24px top border-radius, dark semi-transparent backdrop blur (backdrop-blur-sm bg-black/60), a center handle bar at the top, and scrollable content panel.
```

Platform: Flutter (Material 3) — mocked in HTML/CSS
- Frame: phone viewport, max-width ~420px, centered on the page (not desktop-wide)
- Buttons: fully rounded or 20px radius, tonal elevation shadow instead of a border (ElevatedButton/FilledButton style)
- Text fields: filled/outlined Material style with floating label, not plain bordered inputs
- Cards: 12–16px radius, soft elevation shadow (box-shadow), no 1px border
- FAB: 56px circle, bottom-right, elevation shadow, used for the primary add/action
- Navigation: Material top AppBar; BottomNavigationBar for tab navigation
- Colours: map Primary/Background/Surface above to Material roles (primary, onPrimary, surface, onSurface); use layered surface tones (elevation) instead of borders to separate cards from the background
- Touch targets: minimum 44px; single-column mobile-first layout; bottom sheets instead of desktop dropdowns/hover menus