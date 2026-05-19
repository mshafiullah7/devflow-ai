let _container = null;

function _getContainer() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.id = 'toast-container';
  Object.assign(_container.style, {
    position:      'fixed',
    top:           '16px',
    right:         '16px',
    zIndex:        '99999',
    display:       'flex',
    flexDirection: 'column',
    gap:           '8px',
    pointerEvents: 'none',
  });
  document.body.appendChild(_container);
  return _container;
}

const BG = { error: '#c0392b', warning: '#b7770d', success: '#1e8449' };

export function showToast(message, type = 'error') {
  const container = _getContainer();
  const el = document.createElement('div');
  Object.assign(el.style, {
    padding:      '10px 14px',
    borderRadius: '6px',
    maxWidth:     '360px',
    fontSize:     '13px',
    lineHeight:   '1.4',
    color:        '#fff',
    background:   BG[type] ?? BG.error,
    boxShadow:    '0 2px 8px rgba(0,0,0,0.35)',
    opacity:      '0',
    transition:   'opacity 0.2s ease',
    pointerEvents:'auto',
    wordBreak:    'break-word',
    cursor:       'default',
  });
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => { el.style.opacity = '1'; });

  const dismiss = () => {
    el.style.opacity = '0';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  };
  el.addEventListener('click', dismiss);
  setTimeout(dismiss, 5000);
}
