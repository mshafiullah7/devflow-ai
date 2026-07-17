let _container = null;

function _getContainer() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.id = 'toast-container';
  Object.assign(_container.style, {
    position:      'fixed',
    left:          '50%',
    bottom:        '24px',
    transform:     'translateX(-50%)',
    zIndex:        '99999',
    display:       'flex',
    flexDirection: 'column-reverse',
    alignItems:    'center',
    gap:           '8px',
    pointerEvents: 'none',
  });
  document.body.appendChild(_container);
  return _container;
}

// Accent stripe only — the toast body itself follows the current theme.
const ACCENT = {
  error:   'var(--danger, #ef4444)',
  warning: '#eab308',
  success: '#22c55e',
};

export function showToast(message, type = 'error') {
  const container = _getContainer();
  const el = document.createElement('div');
  Object.assign(el.style, {
    padding:      '9px 16px',
    borderRadius: 'var(--radius-sm, 8px)',
    maxWidth:     '480px',
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    fontSize:     '12.5px',
    lineHeight:   '1.4',
    color:        'var(--text-primary, #1a1916)',
    background:   'var(--surface, #fff)',
    border:       '1px solid var(--border, #d4dae8)',
    borderLeft:   `3px solid ${ACCENT[type] ?? ACCENT.error}`,
    boxShadow:    'var(--shadow, 0 4px 24px rgba(0,0,0,0.12))',
    opacity:      '0',
    transform:    'translateY(6px)',
    transition:   'opacity 0.2s ease, transform 0.2s ease',
    pointerEvents:'auto',
    cursor:       'default',
  });
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => {
    el.style.opacity   = '1';
    el.style.transform = 'translateY(0)';
  });

  const dismiss = () => {
    el.style.opacity   = '0';
    el.style.transform = 'translateY(6px)';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  };
  el.addEventListener('click', dismiss);
  setTimeout(dismiss, 5000);
}
