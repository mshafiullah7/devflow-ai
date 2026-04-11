const STORAGE_KEY = 'devflow-theme';
const VALID = ['light', 'dark', 'midnight'];

export function getTheme() {
  const v = localStorage.getItem(STORAGE_KEY);
  return VALID.includes(v) ? v : 'dark';
}

export function setTheme(id) {
  if (!VALID.includes(id)) return;
  localStorage.setItem(STORAGE_KEY, id);
  document.documentElement.dataset.theme = id;
}

export function applyStoredTheme() {
  document.documentElement.dataset.theme = getTheme();
}
