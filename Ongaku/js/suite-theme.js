/**
 * Apparence partagée entre Cypher, Ongaku et Sori (même fichier copié dans chaque panneau).
 *
 * Thème (fond / accent / principal), nom affiché, couleur du nom et presets enregistrés sont écrits dans
 *   Windows : %APPDATA%\CypherSuite\appearance.json
 *   macOS   : ~/Library/Application Support/CypherSuite/appearance.json
 * Chaque panneau garde ses propres onglets affichés. Un changement fait dans un panneau est repris
 * par les autres en direct (événement CEP + relecture du fichier toutes les 1,5 s).
 *
 *   SuiteTheme.read()            -> { theme, brandLabel, brandColor, userPresets } ou null
 *   SuiteTheme.write(a, 'Sori')  -> n'écrit que si les valeurs partagées ont changé
 *   SuiteTheme.watch(fn)         -> fn(valeurs) quand un autre panneau les modifie
 */
(function () {
  'use strict';
  if (window.SuiteTheme) return;

  var EVENT = 'com.cyphersuite.appearance.changed';
  var KEYS = ['theme', 'brandLabel', 'brandColor', 'userPresets'];

  function req(name) {
    var n = window.cep_node, w = window;
    var r = (n && typeof n.require === 'function' && n.require) ||
      (typeof w.__cypherRequire === 'function' && w.__cypherRequire) ||
      (typeof w.__ongakuRequire === 'function' && w.__ongakuRequire) ||
      (typeof w.__soriRequire === 'function' && w.__soriRequire) ||
      (typeof w.require === 'function' && w.require);
    try { return r ? r(name) : null; } catch (e) { return null; }
  }
  var fs = req('fs'), pathMod = req('path');
  var proc = (window.cep_node && window.cep_node.process) || (typeof process !== 'undefined' ? process : null);

  function filePath() {
    if (!fs || !pathMod || !proc || !proc.env) return null;
    var env = proc.env;
    var dir = proc.platform === 'darwin'
      ? pathMod.join(env.HOME || '', 'Library', 'Application Support', 'CypherSuite')
      : pathMod.join(env.APPDATA || pathMod.join(env.USERPROFILE || '', 'AppData', 'Roaming'), 'CypherSuite');
    return pathMod.join(dir, 'appearance.json');
  }
  var FILE = filePath();

  /** Ne garde que les valeurs partagées, dans un ordre stable (comparaison par chaîne) */
  function pick(a) {
    if (!a || typeof a !== 'object') return null;
    var t = a.theme || {};
    return {
      theme: { background: t.background, accent: t.accent, primary: t.primary },
      brandLabel: typeof a.brandLabel === 'string' ? a.brandLabel : '',
      brandColor: a.brandColor,
      userPresets: Array.isArray(a.userPresets) ? a.userPresets.map(function (p) {
        return { id: p.id, name: p.name, background: p.background, accent: p.accent, primary: p.primary, brandColor: p.brandColor };
      }) : []
    };
  }
  function valid(s) {
    var hex = /^#[0-9a-f]{6}$/i;
    return !!(s && s.theme && hex.test(s.theme.background) && hex.test(s.theme.accent) && hex.test(s.theme.primary) && hex.test(s.brandColor));
  }

  var lastText = null; // dernier contenu lu ou écrit : évite les allers-retours entre panneaux

  function read() {
    if (!FILE) return null;
    try {
      var s = pick(JSON.parse(fs.readFileSync(FILE, 'utf8')));
      if (!valid(s)) return null;
      lastText = JSON.stringify(s);
      return s;
    } catch (e) { return null; }
  }

  function write(appearance, source) {
    if (!FILE) return false;
    var s = pick(appearance);
    if (!valid(s)) return false;
    var text = JSON.stringify(s);
    if (text === lastText) return false;
    try {
      var dir = pathMod.dirname(FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      var out = JSON.parse(text);
      out.updatedAt = Date.now();
      out.updatedBy = source || '';
      var tmp = FILE + '.' + (source || 'tmp') + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
      fs.renameSync(tmp, FILE); // écriture atomique : un autre panneau ne lit jamais un fichier à moitié écrit
      lastText = text;
    } catch (e) { return false; }
    try {
      var cep = window.__adobe_cep__;
      if (cep && cep.dispatchEvent) {
        cep.dispatchEvent({ type: EVENT, scope: 'APPLICATION', appId: '', extensionId: '', data: source || '' });
      }
    } catch (e2) {}
    return true;
  }

  function watch(fn) {
    if (!FILE) return function () {};
    var mtime = 0;
    try { mtime = fs.statSync(FILE).mtimeMs; } catch (e) {}
    var check = function () {
      var m = 0;
      try { m = fs.statSync(FILE).mtimeMs; } catch (e) { return; }
      if (m === mtime) return;
      mtime = m;
      var before = lastText, s = read();
      if (s && JSON.stringify(s) !== before) fn(s);
    };
    var timer = setInterval(check, 1500);
    if (timer && typeof timer.unref === 'function') timer.unref();
    var onFocus = function () { check(); };
    window.addEventListener('focus', onFocus);
    try {
      var cep = window.__adobe_cep__;
      if (cep && cep.addEventListener) cep.addEventListener(EVENT, function () { setTimeout(check, 30); });
    } catch (e3) {}
    return function () { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }

  window.SuiteTheme = { available: !!FILE, file: FILE, read: read, write: write, watch: watch, pick: pick };
})();
