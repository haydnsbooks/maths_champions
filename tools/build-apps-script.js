/**
 * Builds ONE file to paste into Apps Script: apps-script/Code.gs
 * Run after changing anything in server/:   node tools/build-apps-script.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const order = ['Config.js', 'Store.js', 'Fluency.js', 'Rooms.js', 'Code.js'];
const header = '/**\n * TRIALS OF OLYMPUS — Apps Script server (all-in-one)\n' +
  ' * Paste this WHOLE file into Code.gs in Apps Script (replace everything), Save, then\n' +
  ' * Deploy > Manage deployments > Edit > Version: New version > Deploy.\n' +
  ' * Generated from server/*.js by tools/build-apps-script.js — edit those files, not this one.\n */\n';
const body = order.map(f => '\n// ===================== ' + f.replace('.js', '') + ' =====================\n' +
  fs.readFileSync(path.join(ROOT, 'server', f), 'utf8')).join('\n');
fs.mkdirSync(path.join(ROOT, 'apps-script'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), header + body);
console.log('Wrote apps-script/Code.gs (' + (header + body).length + ' characters)');
