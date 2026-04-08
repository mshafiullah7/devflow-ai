export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC.
  // Replacing the space with 'T' and appending 'Z' ensures correct UTC parsing
  // regardless of the host machine's local timezone.
  const normalized = dateStr.toString().replace(' ', 'T').replace(/Z?$/, 'Z');
  const diff  = Date.now() - new Date(normalized).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}
