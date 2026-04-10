/**
 * Escapes a string for safe interpolation into HTML.
 */
export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/**
 * Returns a human-readable relative time string (e.g. "3h ago").
 * Accepts SQLite datetime strings ("YYYY-MM-DD HH:MM:SS") or ISO strings.
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
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

/**
 * Returns the uppercased first character of a name (used for avatar initials).
 */
export function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

/**
 * Formats a date string as a short locale date (e.g. "Apr 9, 2026").
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/**
 * Injects a <link> stylesheet into <head> (idempotent — safe to call multiple times).
 * @param {string} href  Path relative to the HTML file (e.g. 'pages/project/project.css')
 */
export function injectCss(href) {
  const id = href.replace(/[^a-z0-9]/gi, '-');
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id   = id;
    link.rel  = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

/**
 * Removes a previously injected stylesheet.
 * @param {string} href  Same href passed to injectCss()
 */
export function removeCss(href) {
  document.getElementById(href.replace(/[^a-z0-9]/gi, '-'))?.remove();
}
