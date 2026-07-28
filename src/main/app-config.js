'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

function _configPath() {
  return path.join(app.getPath('userData'), 'app-config.json');
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(_configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  fs.writeFileSync(_configPath(), JSON.stringify(data, null, 2), 'utf8');
}

function getConfigValue(key) {
  return readConfig()[key] ?? null;
}

function setConfigValue(key, value) {
  const cfg = readConfig();
  cfg[key] = value;
  writeConfig(cfg);
}

/**
 * One-time migration: seeds default values for app-config keys that have
 * never been explicitly set by the user, so the default is explicit and
 * stable across upgrades instead of relying on undefined-fallback logic
 * scattered across the renderer. Idempotent — only writes when a key is
 * truly absent, so it's safe to call on every startup.
 */
function migrateConfigDefaults() {
  const cfg = readConfig();
  let changed = false;

  // Terminal now defaults to opening in a separate window rather than an
  // integrated tab; existing installs that never touched this setting pick
  // up the new default explicitly here.
  if (!('terminalOpenMode' in cfg)) {
    cfg.terminalOpenMode = 'window';
    changed = true;
  }

  if (changed) writeConfig(cfg);
}

function _encrypt(plain) {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plain).toString('base64');
  }
  // safeStorage unavailable (headless/test) — base64 only, not secure
  return Buffer.from(plain).toString('base64');
}

function _decrypt(enc) {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  }
  return Buffer.from(enc, 'base64').toString('utf8');
}

function getCloudSyncConfig() {
  const sync = { ...(readConfig().cloudSync || {}) };
  if (sync.password_enc) {
    try { sync.password = _decrypt(sync.password_enc); } catch { sync.password = ''; }
    delete sync.password_enc;
  }
  return sync;
}

function setCloudSyncConfig(data) {
  const cfg  = readConfig();
  const prev = cfg.cloudSync || {};
  const { password, ...rest } = data;

  const next = { ...rest };
  if (password) {
    next.password_enc = _encrypt(password);
  } else if (prev.password_enc) {
    next.password_enc = prev.password_enc;
  }

  cfg.cloudSync = next;
  writeConfig(cfg);
}

function getTelegramConfig() {
  const tg = readConfig().telegram || {};
  const result = { chatId: tg.chatId || '' };
  if (tg.botToken_enc) {
    try { result.botToken = _decrypt(tg.botToken_enc); } catch { result.botToken = ''; }
    result.botToken_enc = tg.botToken_enc;
  } else {
    result.botToken = '';
  }
  return result;
}

function setTelegramConfig({ botToken, chatId }) {
  const cfg = readConfig();
  const prev = cfg.telegram || {};
  const next = { chatId: chatId || '' };
  if (botToken) {
    next.botToken_enc = _encrypt(botToken);
  } else if (prev.botToken_enc) {
    next.botToken_enc = prev.botToken_enc;
  }
  cfg.telegram = next;
  writeConfig(cfg);
}

module.exports = { getConfigValue, setConfigValue, migrateConfigDefaults, getCloudSyncConfig, setCloudSyncConfig, getTelegramConfig, setTelegramConfig };
