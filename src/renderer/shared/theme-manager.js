const STORAGE_KEY = 'devflow-theme';
const VALID = ['light', 'dark', 'midnight'];

// Mirrors --surface-header / --text-primary per theme in styles/app.css —
// the main process can't read CSS custom properties, so the title bar
// overlay colors are synced here whenever the theme is applied or changed.
const TITLEBAR_COLORS = {
  light:    { color: '#f4f3ef', symbolColor: '#1a1916' },
  dark:     { color: '#13151f', symbolColor: '#c9d3e0' },
  midnight: { color: '#060608', symbolColor: '#cbd5e1' },
};

function syncTitleBarOverlay(id) {
  window.app?.setTitleBarOverlay?.(TITLEBAR_COLORS[id] || TITLEBAR_COLORS.dark);
}

export function getTheme() {
  const v = localStorage.getItem(STORAGE_KEY);
  return VALID.includes(v) ? v : 'dark';
}

export function setTheme(id) {
  if (!VALID.includes(id)) return;
  localStorage.setItem(STORAGE_KEY, id);
  document.documentElement.dataset.theme = id;
  syncTitleBarOverlay(id);
}

export function applyStoredTheme() {
  const id = getTheme();
  document.documentElement.dataset.theme = id;
  syncTitleBarOverlay(id);
}
