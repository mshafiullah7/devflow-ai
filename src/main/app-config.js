'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

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

module.exports = { getConfigValue, setConfigValue };
