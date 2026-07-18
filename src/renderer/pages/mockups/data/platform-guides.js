// Target-platform look-and-feel guides for prompt generation.
// Output is always HTML/CSS — these just steer the visual language so a
// "Flutter" or "Android" project doesn't come back looking like a generic
// website skinned with the theme's raw hex/CSS values.

export const TECH = 'Plain HTML / CSS';

export const PLATFORM_GUIDES = {
  flutter: `

TARGET PLATFORM — Flutter (Material 3) mobile app, mocked in HTML/CSS:
- Frame the screen as a phone viewport (max-width ~420px, centered on the page) — not a wide desktop layout.
- Use Material 3 component conventions: a top AppBar; ElevatedButton/FilledButton style buttons (fully rounded or 20px radius, tonal elevation shadow instead of a hard border); filled/outlined Material text fields with floating labels; Cards with 12–16px radius and a soft elevation shadow rather than a 1px border; a FloatingActionButton (56px circle, bottom-right, elevation shadow) where a primary add/action exists; BottomNavigationBar for tab navigation.
- Translate the design system's Primary/Background/Surface colours into Material colour roles (primary, onPrimary, surface, onSurface) and use tonal elevation (layered surface shades) instead of borders to separate cards from the background.
- Prefer Material-style type scale and spacing (4/8px grid, bold rounded headlines) over a generic web font stack, unless the design system explicitly specifies otherwise.
- Use touch-sized targets (min 44px), single-column mobile-first layout, and bottom sheets instead of desktop dropdowns/hover menus.`,
  android: `

TARGET PLATFORM — Native Android (Material Design) app, mocked in HTML/CSS:
- Frame the screen as a phone viewport (max-width ~420px, centered on the page) — not a wide desktop layout.
- Use Android Material components: a Material top app bar, Material buttons/cards/text fields, ripple-style active states, a bottom navigation bar or FAB, and Snackbars (bottom, pill-shaped) instead of toasts/alerts.
- Use Material elevation shadows (not borders) to separate cards, sheets, and app bars from the background; treat 1dp ≈ 1px spacing in this HTML mock and keep to Android's 8dp spacing grid.
- Translate the design system's palette into Material colour roles (primary, onPrimary, surface, onSurface) rather than applying the hex values as flat, borderless web colours.
- Use touch-sized targets (min 48dp), single-column mobile-first layout, and bottom sheets instead of desktop dropdowns/hover menus.`,
};
