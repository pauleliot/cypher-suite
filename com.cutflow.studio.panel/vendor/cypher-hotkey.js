/**
 * Cypher Console : Ctrl+Espace dans Premiere ouvre la console d'effets (fenêtre flottante com.cypher.studio.console).
 *
 * Windows : lance tools/cypher-hotkey.ps1 (caché), qui réserve Ctrl+Espace seulement quand Premiere est au premier
 * plan et écrit « HOTKEY » à chaque appui. Une seule instance tourne (mutex) : la fenêtre cachée de Cypher
 * (hotkey.html, démarrée avec Premiere) et le panneau Cypher appellent start() ; si l'instance qui tenait le
 * raccourci s'arrête (panneau fermé), les autres relancent la leur quelques secondes plus tard.
 * macOS : tools/cypher-hotkey-mac.js (JavaScript for Automation, livré avec macOS) surveille ⌥Espace quand Premiere
 * est au premier plan ; macOS demande une fois l'autorisation « Accessibilité ». Sans elle, la console reste
 * accessible par Fenêtre › Extensions › Cypher Console, à qui on peut aussi donner ⌥Espace dans Premiere.
 */
(function () {
  'use strict';
  if (window.CypherHotkey) return;
  var CONSOLE_ID = 'com.cypher.studio.console';
  var child = null;
  var stopped = false;
  var retry = null;

  function openConsole() {
    // pont natif de CEP : le CSInterface.js livré avec Cypher est réduit et n'a pas requestOpenExtension
    try {
      if (window.__adobe_cep__ && window.__adobe_cep__.requestOpenExtension) window.__adobe_cep__.requestOpenExtension(CONSOLE_ID, '');
    } catch (e) {}
  }

  function extensionDir() {
    var p = decodeURIComponent(location.pathname).replace(/\/[^\/]*$/, '');
    return p.replace(/^\/([A-Za-z]:)/, '$1');
  }

  function start() {
    var node = window.cep_node;
    stopped = false;
    if (child || !node || typeof node.require !== 'function') return false;
    var proc = node.process;
    if (!proc || (proc.platform !== 'win32' && proc.platform !== 'darwin')) return false;
    var path = node.require('path');
    var cp = node.require('child_process');
    try {
      if (proc.platform === 'win32') {
        // une seule instance tient le raccourci : les suivantes attendent (mutex dans le script)
        var ps1 = path.join(extensionDir(), 'tools', 'cypher-hotkey.ps1');
        child = cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1], {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } else {
        // une seule instance : si une autre fenêtre Cypher l'a déjà lancée, on repasse plus tard
        var running = '';
        try { running = cp.execSync("pgrep -f 'cypher-hotkey-mac\.js' || true", { encoding: 'utf8' }); } catch (e) {}
        if (running.trim()) {
          clearTimeout(retry);
          retry = setTimeout(start, 15000);
          return false;
        }
        var jxa = path.join(extensionDir(), 'tools', 'cypher-hotkey-mac.js');
        child = cp.spawn('/usr/bin/osascript', ['-l', 'JavaScript', jxa], { stdio: ['pipe', 'pipe', 'ignore'] });
      }
    } catch (e) {
      child = null;
      return false;
    }
    var buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', function (d) {
      buffer += d;
      var lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      // « READY » au démarrage, « NOPERM » (macOS) si l'autorisation Accessibilité manque : macOS l'a déjà demandée
      for (var i = 0; i < lines.length; i++) if (lines[i].trim() === 'HOTKEY') openConsole();
    });
    var again = function () {
      child = null;
      if (stopped) return;
      // une autre instance tient peut-être déjà le raccourci (mutex) : on réessaie, au cas où elle s'arrêterait
      clearTimeout(retry);
      retry = setTimeout(start, 15000);
    };
    child.on('exit', again);
    child.on('error', again);
    return true;
  }

  function stop() {
    stopped = true;
    clearTimeout(retry);
    if (child) {
      try { child.kill(); } catch (e) {}
      child = null;
    }
  }

  // La console tourne sans Node (ouverture plus rapide) : elle demande le thème partagé au démarrage, la fenêtre
  // cachée (ou le panneau Cypher) le lit (suite-theme.js) et le lui renvoie par un événement CEP
  function sendTheme() {
    var cep = window.__adobe_cep__;
    if (!cep || !cep.dispatchEvent) return;
    try {
      var shared = window.SuiteTheme && window.SuiteTheme.read();
      if (!shared || !shared.theme) return;
      cep.dispatchEvent({ type: 'com.cypher.console.theme', scope: 'APPLICATION', appId: '', extensionId: '', data: JSON.stringify(shared.theme) });
    } catch (e) {}
  }
  try {
    if (window.__adobe_cep__ && window.__adobe_cep__.addEventListener) window.__adobe_cep__.addEventListener('com.cypher.console.ready', sendTheme);
  } catch (e) {}

  window.addEventListener('unload', stop);
  window.CypherHotkey = { start: start, stop: stop, openConsole: openConsole, sendTheme: sendTheme };
})();
