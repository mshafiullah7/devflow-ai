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
 * @param {string} href  Path relative to the HTML file (e.g. 'pages/user-stories/user-stories.css')
 */
export function injectCss(href) {
  const id = href.replace(/[^a-z0-9]/gi, '-');
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.id      = id;
    link.rel     = 'stylesheet';
    link.href    = href;
    link.onload  = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
}

/**
 * Removes a previously injected stylesheet.
 * @param {string} href  Same href passed to injectCss()
 */
export function removeCss(href) {
  document.getElementById(href.replace(/[^a-z0-9]/gi, '-'))?.remove();
}

export function inlineMarkdown(s) {
  return s
    .replace(/`([^`]+)`/g,          '<code>$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g,  '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,      '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,          '<em>$1</em>')
    .replace(/~~(.+?)~~/g,          '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}

export function renderMarkdown(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines    = text.split('\n');
  const out      = [];
  let inCode     = false;
  let codeLines  = [];
  let inUl       = false;
  let inOl       = false;
  let lastBlock  = '';

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; lastBlock = 'list'; }
    if (inOl) { out.push('</ol>'); inOl = false; lastBlock = 'list'; }
  };

  let inTable    = false;
  let tableLines = [];

  const flushTable = () => {
    if (!inTable) return;
    inTable = false;
    if (tableLines.length < 2) {
      tableLines.forEach(l => out.push(`<p>${inlineMarkdown(esc(l))}</p>`));
      tableLines = [];
      lastBlock = 'p';
      return;
    }
    const parseRow = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const isSep    = r => /^\|?[\s\-|:]+\|?$/.test(r) && r.includes('-');
    const sepIdx   = tableLines.findIndex(isSep);
    const headRows = sepIdx > 0 ? tableLines.slice(0, sepIdx) : [];
    const bodyRows = tableLines.slice(sepIdx + 1);

    let html = '<table class="md-table">';
    if (headRows.length) {
      html += '<thead>';
      headRows.forEach(r => {
        html += '<tr>' + parseRow(r).map(c => `<th>${inlineMarkdown(esc(c))}</th>`).join('') + '</tr>';
      });
      html += '</thead>';
    }
    if (bodyRows.length) {
      html += '<tbody>';
      bodyRows.forEach(r => {
        html += '<tr>' + parseRow(r).map(c => `<td>${inlineMarkdown(esc(c))}</td>`).join('') + '</tr>';
      });
      html += '</tbody>';
    }
    html += '</table>';
    out.push(html);
    tableLines = [];
    lastBlock = 'table';
  };

  let inSvg    = false;
  let svgLines = [];

  for (const line of lines) {
    if (!inCode && !inSvg && line.trimStart().toLowerCase().startsWith('<svg')) {
      closeList();
      inSvg    = true;
      svgLines = [line];
      if (line.includes('</svg>')) {
        out.push(`<div class="md-svg">${svgLines.join('\n')}</div>`);
        svgLines = []; inSvg = false; lastBlock = 'svg';
      }
      continue;
    }
    if (inSvg) {
      svgLines.push(line);
      if (line.includes('</svg>')) {
        out.push(`<div class="md-svg">${svgLines.join('\n')}</div>`);
        svgLines = []; inSvg = false; lastBlock = 'svg';
      }
      continue;
    }

    if (line.trimStart().startsWith('```')) {
      closeList();
      if (inCode) {
        out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
        codeLines = [];
        inCode    = false;
        lastBlock = 'code';
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(esc(line)); continue; }

    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      closeList();
      const lvl = hm[1].length;
      out.push(`<h${lvl}>${esc(hm[2])}</h${lvl}>`);
      lastBlock = 'heading';
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(line)) {
      closeList();
      out.push('<hr>');
      lastBlock = 'hr';
      continue;
    }

    const ulm = line.match(/^[-*+]\s+(.*)/);
    if (ulm) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inlineMarkdown(esc(ulm[1]))}</li>`);
      lastBlock = 'list';
      continue;
    }

    const olm = line.match(/^\d+\.\s+(.*)/);
    if (olm) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${inlineMarkdown(esc(olm[1]))}</li>`);
      lastBlock = 'list';
      continue;
    }

    const bqm = line.match(/^>\s?(.*)/);
    if (bqm) {
      closeList();
      out.push(`<blockquote>${inlineMarkdown(esc(bqm[1]))}</blockquote>`);
      lastBlock = 'blockquote';
      continue;
    }

    if (line.trim().startsWith('|')) {
      closeList();
      inTable = true;
      tableLines.push(line.trim());
      continue;
    }

    if (inTable) flushTable();

    if (line.trim() === '') {
      closeList();
      if (lastBlock === 'p') { out.push('<br>'); lastBlock = 'br'; }
      continue;
    }

    closeList();
    out.push(`<p>${inlineMarkdown(esc(line))}</p>`);
    lastBlock = 'p';
  }

  closeList();
  if (inTable) flushTable();
  if (inCode) out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  return out.join('');
}
