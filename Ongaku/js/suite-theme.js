/**
 * Apparence partagée entre Cypher, Ongaku, Sori et Kiru (même fichier copié dans chaque panneau).
 *
 * Thème (fond / accent / principal), nom affiché, couleur du nom, presets enregistrés et police sont écrits dans
 *   Windows : %APPDATA%\CypherSuite\appearance.json
 *   macOS   : ~/Library/Application Support/CypherSuite/appearance.json
 * Chaque panneau garde ses propres onglets affichés. Un changement fait dans un panneau est repris
 * par les autres en direct (événement CEP + relecture du fichier toutes les 1,5 s).
 *
 *   SuiteTheme.read()            -> { theme, brandLabel, brandColor, userPresets } ou null
 *   SuiteTheme.write(a, 'Sori')  -> n'écrit que si les valeurs partagées ont changé
 *   SuiteTheme.watch(fn)         -> fn(valeurs) quand un autre panneau les modifie
 *
 * Police de l'interface : ce fichier s'en occupe seul (lecture, application, suivi des changements), les panneaux
 * n'ont qu'à afficher le sélecteur dans leurs réglages :
 *   SuiteTheme.mountFontPicker(el) -> boutons Urbanist / Space Grotesk / Inter / police importée + « Importer… »
 *   SuiteTheme.font()              -> { id, name } de la police en cours
 *   SuiteTheme.setFont(id)         -> 'urbanist', 'space-grotesk', 'inter' ou 'custom' (police importée)
 * Les polices livrées sont dans vendor/fonts/ (suite-fonts.css) ; une police importée (.ttf .otf .woff .woff2) est
 * copiée dans CypherSuite/fonts/ pour que tous les panneaux la retrouvent.
 */
(function () {
  'use strict';
  if (window.SuiteTheme) return;

  var EVENT = 'com.cyphersuite.appearance.changed';
  var FONTS = [
    { id: 'urbanist', name: 'Urbanist' },
    { id: 'space-grotesk', name: 'Space Grotesk' },
    { id: 'inter', name: 'Inter' }
  ];
  var CUSTOM_FAMILY = 'Suite Custom';
  var FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var FONT_TYPES = { ttf: ['font/ttf', 'truetype'], otf: ['font/otf', 'opentype'], woff: ['font/woff', 'woff'], woff2: ['font/woff2', 'woff2'] };
  var MAX_FONT_BYTES = 8 * 1024 * 1024;
  // dossier vendor/fonts/ du panneau, d'après l'adresse de ce script (vendor/suite-theme.js ou js/suite-theme.js)
  var SCRIPT_DIR = (function () {
    var s = document.currentScript && document.currentScript.src ? document.currentScript.src.split('?')[0] : '';
    return s.replace(/[^\/]*$/, '');
  })();
  var FONTS_DIR_URL = /\/vendor\/$/.test(SCRIPT_DIR) ? SCRIPT_DIR + 'fonts/' : SCRIPT_DIR + '../vendor/fonts/';

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

  /** Contenu brut du fichier ({} s'il manque ou est illisible) */
  function raw() {
    if (!FILE) return {};
    try {
      var o = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }

  function save(out, source) {
    var dir = pathMod.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    out.updatedAt = Date.now();
    out.updatedBy = source || '';
    var tmp = FILE + '.' + (source || 'tmp') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
    fs.renameSync(tmp, FILE); // écriture atomique : un autre panneau ne lit jamais un fichier à moitié écrit
  }

  /** Prévient les autres panneaux (Premiere ne transmet l'événement qu'avec son identifiant et celui de la fenêtre) */
  function announce(source) {
    try {
      var cep = window.__adobe_cep__;
      if (!cep || !cep.dispatchEvent) return;
      var appId = '', ext = '';
      try { appId = JSON.parse(cep.getHostEnvironment()).appId || ''; } catch (e) {}
      try { ext = cep.getExtensionId(); } catch (e) {}
      cep.dispatchEvent({ type: EVENT, scope: 'APPLICATION', appId: appId, extensionId: ext, data: source || '' });
    } catch (e2) {}
  }

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
      var out = JSON.parse(text);
      // la police ne passe pas par les panneaux (setFont) : celle du fichier est conservée
      var cur = raw();
      if (cur.font) out.font = cur.font;
      if (cur.fontName) out.fontName = cur.fontName;
      if (cur.fontFile) out.fontFile = cur.fontFile;
      save(out, source);
      lastText = text;
    } catch (e) { return false; }
    announce(source);
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

  // ==================== Police de l'interface ====================
  var current = { id: 'urbanist', name: 'Urbanist', file: '' };
  var appliedKey = '';
  var pickers = [];

  function fontFromFile() {
    var o = raw();
    var id = typeof o.font === 'string' ? o.font : 'urbanist';
    if (id === 'custom' && typeof o.fontFile === 'string' && o.fontFile) {
      return { id: 'custom', name: String(o.fontName || 'Police importée'), file: pathMod.basename(o.fontFile) };
    }
    for (var i = 0; i < FONTS.length; i++) {
      // la police importée reste proposée même quand une autre est choisie
      if (FONTS[i].id === id) return { id: id, name: FONTS[i].name, file: typeof o.fontFile === 'string' ? pathMod.basename(o.fontFile) : '', customName: String(o.fontName || '') };
    }
    return { id: 'urbanist', name: 'Urbanist', file: '' };
  }

  function customPath(file) {
    return pathMod.join(pathMod.dirname(FILE), 'fonts', file);
  }

  function ensureStyle(id, tag) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  /** Feuille des polices livrées (chargée seulement quand une autre police qu'Urbanist sert, ou pour l'aperçu) */
  function loadBundled() {
    var link = ensureStyle('suite-fonts', 'link');
    if (!link.href) {
      link.rel = 'stylesheet';
      link.href = FONTS_DIR_URL + 'suite-fonts.css';
    }
  }

  /** @font-face de la police importée (lue par Node : aucun accès fichier demandé à la page) */
  function loadCustom(file) {
    var style = ensureStyle('suite-font-custom', 'style');
    if (style.getAttribute('data-file') === file) return true;
    try {
      var ext = (file.split('.').pop() || '').toLowerCase(), type = FONT_TYPES[ext];
      if (!type) return false;
      var data = fs.readFileSync(customPath(file));
      if (data.length > MAX_FONT_BYTES) return false;
      style.textContent = "@font-face { font-family: '" + CUSTOM_FAMILY + "'; font-display: swap; src: url(data:" + type[0] + ';base64,' + data.toString('base64') + ") format('" + type[1] + "'); }";
      style.setAttribute('data-file', file);
      return true;
    } catch (e) { return false; }
  }

  function applyFont(f) {
    current = f;
    var key = f.id + '|' + f.file;
    if (key !== appliedKey) {
      appliedKey = key;
      var family = '';
      if (f.id === 'custom') family = loadCustom(f.file) ? "'" + CUSTOM_FAMILY + "'" : '';
      else if (f.id !== 'urbanist') {
        loadBundled();
        family = "'" + f.name + "'";
      }
      // Urbanist : la feuille du panneau reprend la main ; sinon la police choisie passe devant
      // (.font-sans : dans Cypher, le conteneur de l'application fixe lui-même la police)
      ensureStyle('suite-font', 'style').textContent = family ? 'html body, html body #root, html body .font-sans { font-family: ' + family + ', Urbanist, ' + FALLBACK + ' !important; }' : '';
    }
    for (var i = pickers.length - 1; i >= 0; i--) {
      if (document.body && document.body.contains(pickers[i])) renderPicker(pickers[i]);
      else pickers.splice(i, 1);
    }
  }

  function setFont(id, custom) {
    if (!FILE) return false;
    try {
      var out = raw();
      out.font = id;
      if (custom) {
        out.fontName = custom.name;
        out.fontFile = custom.file;
      }
      if (id === 'custom' && !out.fontFile) return false;
      save(out, 'font');
    } catch (e) { return false; }
    applyFont(fontFromFile());
    announce('font');
    return true;
  }

  /** Copie la police choisie dans CypherSuite/fonts/ puis la sélectionne ; renvoie '' ou un message d'erreur */
  function importFont(file, done) {
    var ext = (String(file.name).split('.').pop() || '').toLowerCase();
    if (!FONT_TYPES[ext]) return done('Format non pris en charge : choisissez un fichier .ttf, .otf, .woff ou .woff2.');
    if (file.size > MAX_FONT_BYTES) return done('Police trop lourde (8 Mo au plus).');
    var reader = new FileReader();
    reader.onerror = function () { done('Lecture de la police impossible.'); };
    reader.onload = function () {
      try {
        var BufferCtor = (req('buffer') || {}).Buffer;
        var bytes = BufferCtor.from(new Uint8Array(reader.result));
        var dir = pathMod.join(pathMod.dirname(FILE), 'fonts');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        // nom daté : les panneaux ouverts rechargent la police même si elle remplace une précédente
        var stored = 'custom-' + Date.now() + '.' + ext;
        fs.writeFileSync(pathMod.join(dir, stored), bytes);
        var previous = raw().fontFile;
        var name = String(file.name).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 40);
        if (!setFont('custom', { name: name, file: stored })) return done('Enregistrement de la police impossible.');
        if (previous && previous !== stored) {
          try { fs.unlinkSync(customPath(pathMod.basename(previous))); } catch (e) {}
        }
        done('');
      } catch (e) { done('Enregistrement de la police impossible.'); }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderPicker(el) {
    var customName = current.id === 'custom' ? current.name : current.customName;
    var options = FONTS.concat(current.file ? [{ id: 'custom', name: customName || 'Police importée' }] : []);
    var base = 'border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;background:rgb(var(--zinc-950));';
    var html = '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">';
    options.forEach(function (f) {
      var on = f.id === current.id;
      var family = f.id === 'custom' ? "'" + CUSTOM_FAMILY + "'" : "'" + f.name + "'";
      html += '<button type="button" data-suite-font="' + f.id + '" title="Police de l\'interface, dans tous les panneaux" style="' + base +
        'font-family:' + family.replace(/"/g, '') + ',sans-serif;' +
        'border:1px solid rgb(var(--' + (on ? 'accent-400' : 'zinc-800') + '));color:rgb(var(--' + (on ? 'zinc-50' : 'zinc-400') + '))"></button>';
    });
    html += '<button type="button" data-suite-font-import style="' + base + 'border:1px dashed rgb(var(--zinc-700));color:rgb(var(--zinc-300))">Importer une police…</button>' +
      '<input type="file" accept=".ttf,.otf,.woff,.woff2" style="display:none" /></div>' +
      '<div data-suite-font-msg style="margin-top:6px;font-size:10.5px;line-height:1.4;color:rgb(var(--zinc-500))"></div>';
    el.innerHTML = html;
    var buttons = el.querySelectorAll('[data-suite-font]');
    for (var i = 0; i < buttons.length; i++) buttons[i].textContent = options[i].name; // nom de fichier : jamais en HTML
    var msg = el.querySelector('[data-suite-font-msg]');
    var say = function (text, isError) {
      msg.textContent = text;
      msg.style.color = isError ? '#fca5a5' : 'rgb(var(--zinc-500))';
    };
    say(FILE ? 'Commune à Cypher, Ongaku, Sori et Kiru. Police importée : .ttf, .otf, .woff ou .woff2.' : 'Choix de la police indisponible ici (panneau ouvert hors de Premiere).', false);
    el.onclick = function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      if (t.hasAttribute('data-suite-font')) {
        if (!setFont(t.getAttribute('data-suite-font'))) say('Enregistrement de la police impossible.', true);
      } else if (t.hasAttribute('data-suite-font-import')) el.querySelector('input[type=file]').click();
    };
    el.querySelector('input[type=file]').onchange = function () {
      var file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      if (!FILE) return say('Choix de la police indisponible ici.', true);
      importFont(file, function (error) { if (error) say(error, true); });
    };
  }

  function mountFontPicker(el) {
    if (!el) return;
    loadBundled(); // aperçu : chaque bouton est écrit dans sa police
    if (current.file) loadCustom(current.file);
    if (pickers.indexOf(el) < 0) pickers.push(el);
    renderPicker(el);
  }

  if (FILE) {
    applyFont(fontFromFile());
    // suivi des changements faits par un autre panneau (indépendant de watch() : ne touche pas à lastText)
    var fontMtime = 0;
    try { fontMtime = fs.statSync(FILE).mtimeMs; } catch (e) {}
    var checkFont = function () {
      var m = 0;
      try { m = fs.statSync(FILE).mtimeMs; } catch (e) { return; }
      if (m === fontMtime) return;
      fontMtime = m;
      var f = fontFromFile();
      if (f.id + '|' + f.file + '|' + f.name !== current.id + '|' + current.file + '|' + current.name) applyFont(f);
    };
    var fontTimer = setInterval(checkFont, 1500);
    if (fontTimer && typeof fontTimer.unref === 'function') fontTimer.unref();
    window.addEventListener('focus', checkFont);
    try {
      var cepFont = window.__adobe_cep__;
      if (cepFont && cepFont.addEventListener) cepFont.addEventListener(EVENT, function () { setTimeout(checkFont, 40); });
    } catch (e4) {}
  }

  window.SuiteTheme = {
    available: !!FILE, file: FILE, read: read, write: write, watch: watch, pick: pick,
    fonts: FONTS, font: function () { return { id: current.id, name: current.name }; }, setFont: function (id) { return setFont(id); },
    mountFontPicker: mountFontPicker
  };
})();
