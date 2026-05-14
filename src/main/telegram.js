'use strict';

const https = require('node:https');

function sendMessage(botToken, chatId, text, parseMode = 'Markdown') {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode });
    const req  = https.request(
      {
        hostname: 'api.telegram.org',
        path:     `/bot${botToken}/sendMessage`,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let raw = '';
        res.on('data', d => { raw += d; });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (json.ok) resolve(json);
            else reject(new Error(json.description || 'Telegram API error'));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendMessage };
