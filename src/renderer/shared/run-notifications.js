'use strict';

// Fires a native OS notification and, if the user has configured Telegram in
// Settings, a Telegram push — so a long-running Workflow/Issue Runner "Run
// All" reaches the user whether or not the desktop app is in view. Telegram
// send is a no-op (returns { ok:false }) when unconfigured, so it's always
// safe to call.
export async function notifyRunComplete({ title, body }) {
  window.app.showNotification({ title, body });
  try {
    await window.app.telegram.send(`*${title}*\n${body}`);
  } catch (_) {}
}
