/**
 * Kiru — autocut pour Premiere Pro (interface du panneau).
 * JavaScript sans build : fonctionne tel quel dans CEP (Chromium 74+).
 */
(function () {
  'use strict';

  var APP_VERSION = '1.2.0'; // à garder identique à CSXS/manifest.xml
  var D = window.KiruDetect, Suite = window.SuiteTheme;
  var cs = new CSInterface();
  var inCEP = !!window.__adobe_cep__;
  var TICKS = 254016000000;

  // ==================== Icônes (tracés Lucide) ====================
  var ICONS = {
    scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    wave: '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
    library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    brackets: '<path d="M16 3h3v18h-3"/><path d="M8 21H5V3h3"/>',
    text: '<path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/>',
    captions: '<rect width="18" height="14" x="3" y="5" rx="2" ry="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>',
    brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
  };
  function icon(name, cls) { return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24">' + (ICONS[name] || '') + '</svg>'; }


  // ==================== Champ « nom + valeur » ====================
  /**
   * Valeur modifiable : clic = saisie au clavier, glisser horizontalement = réglage fin,
   * molette ou flèches = un pas (Maj : ×10). spec = { id, label, min, max, step, unit, hint, extra, scale }
   * scale : facteur d'affichage (1000 pour des secondes saisies en ms, 100 pour des fractions en %).
   */
  function numScale(sp) { return sp.scale || (sp.unit === 'ms' ? 1000 : 1); }
  function numText(sp, v) {
    var d = v * numScale(sp);
    if (sp.unit === 'ms') return d >= 1000 ? num(d / 1000, 2) + ' s' : Math.round(d) + ' ms';
    var dec = sp.step * numScale(sp) < 1 ? 1 : 0;
    return num(d, dec) + (sp.unit ? (sp.unit === '%' ? ' %' : ' ' + sp.unit) : '');
  }
  function numRow(sp, v) {
    return '<div class="nrow" title="' + esc(sp.hint || '') + '"><span class="nl">' + sp.label + (sp.extra || '') + '</span>' +
      '<span class="nv" tabindex="0" data-num="' + sp.id + '">' + numText(sp, v) + '</span></div>';
  }
  /** get(id) → valeur ; set(id, valeur) applique et redessine */
  function bindNums(root, specs, get, set) {
    var byId = {};
    specs.forEach(function (s) { byId[s.id] = s; });
    var clamp = function (sp, v) {
      v = Math.max(sp.min, Math.min(sp.max, v));
      return Math.round(v / sp.step) * sp.step;
    };
    var put = function (sp, el, v) { v = clamp(sp, v); set(sp.id, Number(v.toFixed(6))); el.textContent = numText(sp, get(sp.id)); };
    $$('[data-num]', root).forEach(function (el) {
      var sp = byId[el.getAttribute('data-num')];
      if (!sp) return;
      el.onmousedown = function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var x0 = e.clientX, v0 = get(sp.id), moved = false;
        // ~6 px par pas, au plus 300 pas sur toute la plage
        var stepPx = Math.max(1.5, 6 * Math.min(1, 300 / ((sp.max - sp.min) / sp.step)));
        var move = function (ev) {
          var dx = ev.clientX - x0;
          if (!moved && Math.abs(dx) < 3) return;
          moved = true; el.classList.add('drag'); document.body.classList.add('ew');
          put(sp, el, v0 + Math.round(dx / stepPx) * sp.step * (ev.shiftKey ? 10 : 1));
        };
        var up = function () {
          window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
          el.classList.remove('drag'); document.body.classList.remove('ew');
          if (!moved) edit();
        };
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      };
      var edit = function () {
        var inp = document.createElement('input'), sc = numScale(sp);
        inp.className = 'nv-edit';
        inp.value = String(Math.round(get(sp.id) * sc * 100) / 100).replace('.', ',');
        el.style.display = 'none'; el.parentNode.appendChild(inp); inp.focus(); inp.select();
        var done = false;
        var close = function (ok) {
          if (done) return; done = true;
          var x = parseFloat(String(inp.value).replace(',', '.').replace(/[^\d.\-]/g, ''));
          if (ok && isFinite(x)) put(sp, el, x / sc);
          inp.remove(); el.style.display = '';
        };
        inp.onkeydown = function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') close(true); else if (ev.key === 'Escape') close(false); };
        inp.onblur = function () { close(true); };
      };
      el.onwheel = function (e) { e.preventDefault(); put(sp, el, get(sp.id) + (e.deltaY < 0 ? 1 : -1) * sp.step * (e.shiftKey ? 10 : 1)); };
      el.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); edit(); return; }
        var d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault(); e.stopPropagation();
        put(sp, el, get(sp.id) + d * sp.step * (e.shiftKey ? 10 : 1));
      };
    });
  }

  // ==================== Préférences ====================
  var PREFS_KEY = 'kiru.prefs.v1';
  var DEFAULT_PREFS = {
    tab: 'text',
    tracks: [0], copy: true,
    ffmpeg: '', preferFfmpeg: false, epr: '',
    autoSel: true,
    // transcription locale (whisper.cpp) et nettoyage du texte
    tx: { model: 'large-v3-turbo-q5_0', whisper: '', lang: 'auto', fillers: (window.KiruText || {}).FILLERS || '', stutter: true },
    claudeKey: '', aiEngine: 'local', llmModel: 'qwen3-4b',
    // étape 1 « Nettoyer » : ce qu'« Analyser » repère
    // air : marge gardée de chaque côté d'un silence coupé (s) ; action : supprimer, couper seulement ou marqueurs
    clean: { silences: true, minPause: 0.6, air: 0.15, fillers: true, retakes: true, ai: false, action: 'delete' },
    // sous-titres : style complet (voir js/captions.js), destination, styles enregistrés
    cap: { preset: 'pop', style: null, target: 'mogrt', edited: false, kind: 'styled' },
    // sous-titres d'interview (classiques) : nettoyage IA, sortie, règles (voir js/subtitles.js)
    classic: { ai: true, out: 'premiere', rules: null },
    capStyles: []
  };
  var NESTED = ['tx', 'cap', 'clean', 'classic'];
  var prefs = (function () {
    var p = JSON.parse(JSON.stringify(DEFAULT_PREFS));
    try {
      var s = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      Object.keys(s).forEach(function (k) { if (NESTED.indexOf(k) >= 0) Object.assign(p[k], s[k]); else p[k] = s[k]; });
    } catch (e) {}
    if (!Array.isArray(p.capStyles)) p.capStyles = [];
    // sous-titres stylés : toujours en graphiques modifiables ; interview : Premiere ou SRT (plus de « les deux »)
    p.cap.target = 'mogrt';
    if (p.classic.out !== 'srt') p.classic.out = 'premiere';
    // 1.1 : IA locale par défaut ; ceux qui avaient déjà une clé API la gardent
    try { var s0 = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); if (!s0.aiV) { p.aiEngine = s0.claudeKey ? 'api' : 'local'; p.aiV = 1; }
      // 1.1 : sous-titres modifiables par défaut
      if (!s0.capV) { p.cap.target = 'mogrt'; p.capV = 1; }
      // 1.2 : parcours en deux étapes, on ouvre sur « 1 · Nettoyer »
      if (!s0.flowV) { p.tab = 'text'; p.flowV = 1; }
      if (p.tab === 'cut' || p.tab === 'profiles') p.tab = 'text';
      ['params', 'profileName', 'profileId', 'edited', 'action', 'inOut', 'profiles'].forEach(function (k) { delete p[k]; });
      // 1.2 : l'avance de 0,15 s a été retirée par défaut (le retard ressenti venait d'un casque Bluetooth)
      if (!s0.leadV) { if (p.cap.style && p.cap.style.lead === 0.15) p.cap.style.lead = 0; p.leadV = 1; } } catch (e) {}
    if (!Array.isArray(p.tracks)) p.tracks = [0];
    return p;
  })();
  var saveTimer = null;
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} }
  function savePrefsSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(savePrefs, 300); }
  /** Apparence modifiée dans Kiru : écrite aussi dans le fichier partagé (repris par Cypher, Ongaku et Sori) */
  function saveAppearance() {
    savePrefs();
    if (Suite && prefs.appearance) Suite.write(prefs.appearance, 'Kiru');
  }

  // ==================== État ====================
  var state = {
    sum: null, selTimer: null, playTimer: null, hover: false, reading: false, busy: false,
    player: -1
  };

  // ==================== Utilitaires ====================
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function css(name, a) { return 'rgba(' + getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim().split(/\s+/).join(',') + ',' + (a == null ? 1 : a) + ')'; }
  function num(x, d) { var f = Math.pow(10, d == null ? 2 : d); return String(Math.round(x * f) / f).replace('.', ','); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /** Durée lisible : 850 ms · 12,4 s · 3 min 05 s · 1 h 02 min */
  function fmtDur(s) {
    s = Math.max(0, s);
    if (s < 1) return Math.round(s * 1000) + ' ms';
    if (s < 60) return num(s, 1) + ' s';
    var m = Math.floor(s / 60), r = Math.round(s - m * 60);
    if (r === 60) { m++; r = 0; }
    if (m < 60) return m + ' min ' + pad2(r) + ' s';
    return Math.floor(m / 60) + ' h ' + pad2(m % 60) + ' min';
  }
  /** Position dans la timeline : m:ss,d */
  function fmtTC(t) {
    t = Math.max(0, t);
    var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t - Math.floor(t / 60) * 60;
    var ss = s.toFixed(1).replace('.', ','); if (s < 10) ss = '0' + ss;
    return (h ? h + ':' + pad2(m) : m) + ':' + ss;
  }
  function basename(p) { return String(p).split(/[\\\/]/).pop(); }

  var toastTimer = null;
  function toast(msg, kind, sticky) {
    var el = $('#toast');
    var ic = kind === 'err' ? 'alert' : kind === 'busy' ? 'activity' : 'check';
    el.innerHTML = '<div class="msg ' + (kind || 'ok') + '">' + icon(ic) + '<span>' + esc(msg) + '</span></div>';
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(function () { el.innerHTML = ''; }, kind === 'err' ? 7000 : 3500);
  }

  function copyText(text) {
    try { if (navigator.clipboard) { navigator.clipboard.writeText(text).catch(function () {}); return; } } catch (e) {}
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) {}
    ta.remove();
  }

  function nodeReq(name) {
    var n = window.cep_node;
    var r = (n && typeof n.require === 'function' && n.require) || window.__kiruRequire;
    try { return r ? r(name) : null; } catch (e) { return null; }
  }

  // ==================== Pont Premiere (ExtendScript) ====================
  var JSX_REV = 6; // = rev de jsx/Kiru_Premiere.jsx : le script hôte est rechargé s'il est plus ancien
  var JSX_PATH = decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\/[^\/]*$/, '') + '/jsx/Kiru_Premiere.jsx';
  function esLit(v) {
    return JSON.stringify(v).replace(/[^\x00-\x7e]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
  }
  /**
   * Appels courts : sans réponse au bout de ce délai, le moteur de scripts de Premiere est bloqué
   * (souvent par un autre panneau ou un script resté en attente) ; seul un redémarrage de Premiere le libère.
   */
  var QUICK = { summary: 20000, getPlayer: 10000, setPlayer: 10000, readTracks: 60000, wavPreset: 60000, snapshot: 60000, captionTrack: 30000 };
  var STUCK_MSG = 'Premiere ne répond plus aux scripts (moteur ExtendScript bloqué) : enregistrez le projet, puis redémarrez Premiere Pro.';
  function jsx(fn, args) {
    return new Promise(function (resolve) {
      if (!inCEP) return resolve({ success: false, error: 'Disponible uniquement dans Premiere Pro' });
      if (QUICK[fn]) {
        var timer = setTimeout(function () { setEngine(false); resolve({ success: false, error: STUCK_MSG }); }, QUICK[fn] * (state.busy ? 5 : 1));
        var done = resolve;
        resolve = function (v) { clearTimeout(timer); setEngine(true); done(v); };
      }
      var call = '$.Kiru.' + fn + '(' + (args || []).map(esLit).join(',') + ')';
      var script =
        '(function(){try{' +
        'if(typeof $.Kiru==="undefined"||!$.Kiru.' + fn + '||$.Kiru.rev!==' + JSX_REV + '){$.evalFile(new File(' + esLit(JSX_PATH) + '));}' +
        'return ' + call + ';' +
        '}catch(e){var m=String(e&&e.message?e.message:e)+(e&&e.line?" (ligne "+e.line+")":"");' +
        'return "{\\"success\\":false,\\"error\\":\\""+m.replace(/[\\\\"]/g,"\\\\$&").replace(/[\\r\\n]+/g," ")+"\\"}";}})()';
      cs.evalScript(script, function (r) {
        try { resolve(JSON.parse(r)); } catch (e) {
          resolve({ success: false, error: r === 'EvalScript error.' ? 'Script Premiere introuvable ou invalide (' + JSX_PATH + ')' : (r || 'Réponse vide de Premiere') });
        }
      });
    });
  }
  /** Appels par lots (progression affichée) ; échoue au premier lot en erreur */
  function batches(list, size, label, fn) {
    var out = [], n = Math.ceil(list.length / size), p = Promise.resolve();
    for (var i = 0; i < n; i++) {
      (function (i) {
        p = p.then(function () {
          if (label) toast(label + ' ' + Math.round(i / n * 100) + ' %', 'busy', true);
          return fn(list.slice(i * size, (i + 1) * size)).then(function (r) {
            if (!r || !r.success) throw new Error((r && r.error) || 'Réponse vide de Premiere');
            out.push(r);
          });
        });
      })(i);
    }
    return p.then(function () { return out; });
  }
  function errorsOf(results) {
    var e = [];
    results.forEach(function (r) { (r.errors || []).forEach(function (x) { if (e.length < 3) e.push(x); }); });
    return e;
  }

  // ==================== Analyse ====================
  function trackLabel(i) { return 'A' + (i + 1); }
  function sortedTracks() { return prefs.tracks.slice().sort(function (x, y) { return x - y; }); }
  function setBusy(on) {
    state.busy = on;
    $$('#btnAnalyze, #btnApply, [data-busy]').forEach(function (b) { b.disabled = on; });
  }



  /** WAV du mixage des pistes choisies, aligné sur la séquence (à effacer par l'appelant) */
  function exportMix(tracks, failed, nested) {
    var os = nodeReq('os'), path = nodeReq('path'), fs = nodeReq('fs');
    failed = failed || [];
    var why = failed.length ? 'Lecture impossible : ' + failed.slice(0, 2).join(' ; ') + '. ' : nested ? 'Séquence imbriquée ou clip sans fichier sur les pistes choisies. ' : '';
    var getPreset = prefs.epr && fs && fs.existsSync(prefs.epr) ? Promise.resolve(prefs.epr)
      : jsx('wavPreset').then(function (r) { return r.success ? r.preset : ''; });
    return getPreset.then(function (preset) {
      if (!preset) throw new Error(why + 'Installez ffmpeg, ou indiquez un preset d\'export WAV (.epr) dans Réglages > Analyse.');
      var out = path.join(os.tmpdir(), 'kiru-' + Date.now() + '.wav');
      toast('Export de l\'audio par Premiere (' + tracks.map(trackLabel).join(', ') + ')…', 'busy', true);
      return jsx('exportAudio', [out, preset, JSON.stringify(tracks)]).then(function (r) {
        if (!r.success) throw new Error(why + r.error);
        return r.path || out;
      });
    });
  }








  // ==================== Rendu : onglets ====================
  // parcours en deux étapes : 1 · couper l'inutile (silences compris), 2 · sous-titrer
  var TABS = [
    { id: 'text', label: '1 · Nettoyer', icon: 'scissors' },
    { id: 'captions', label: '2 · Sous-titres', icon: 'captions' }
  ];
  /** Onglets Texte et Sous-titres (js/tab-text.js, js/tab-captions.js), créés au démarrage */
  var tabs = {};
  function renderTabs() {
    // onglets connus seulement (« Silences » et « Profils » ont rejoint « 1 · Nettoyer »)
    var shown = appearance().visibleTabs.filter(function (id) { return TABS.some(function (t) { return t.id === id; }); });
    if (!shown.length) shown = TABS.map(function (t) { return t.id; });
    if (shown.indexOf(prefs.tab) < 0) prefs.tab = shown[0];
    $('#tabs').innerHTML = TABS.filter(function (t) { return shown.indexOf(t.id) >= 0; }).map(function (t) {
      return '<button data-tab="' + t.id + '" class="' + (prefs.tab === t.id ? 'active' : '') + '" title="' + esc(t.label) + '">' + icon(t.icon) + '<span>' + t.label + '</span></button>';
    }).join('');
    $$('#tabs button').forEach(function (b) {
      b.onclick = function () { prefs.tab = b.getAttribute('data-tab'); savePrefs(); renderTabs(); renderView(); };
    });
  }
  function renderView() {
    if (tabs.captions) tabs.captions.stop();
    if (prefs.tab === 'captions' && tabs.captions) tabs.captions.render();
    else if (tabs.text) tabs.text.render();
  }

  function toggle(id, on, label, title) {
    return '<label class="toggle ' + (on ? 'on' : '') + '" data-toggle="' + id + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><span class="sw"></span>' + label + '</label>';
  }
  function seg(id, value, options) {
    return '<div class="seg" data-seg="' + id + '">' + options.map(function (o) {
      return '<button data-v="' + o[0] + '" class="' + (String(value) === String(o[0]) ? 'on' : '') + '"' + (o[2] ? ' title="' + esc(o[2]) + '"' : '') + '>' + o[1] + '</button>';
    }).join('') + '</div>';
  }


  function renderTrackChips() {
    var el = $('#trackChips');
    if (!el) return;
    var tracks = state.sum && state.sum.audio ? state.sum.audio : (inCEP ? [] : [{ index: 0, name: 'Audio 1', clips: 1 }, { index: 1, name: 'Audio 2', clips: 1 }, { index: 2, name: 'Audio 3', clips: 0 }]);
    if (!tracks.length) { el.innerHTML = '<span class="hint">' + (state.sum && !state.sum.seq ? 'Aucune séquence' : 'Pistes…') + '</span>'; return; }
    el.innerHTML = tracks.map(function (t) {
      var on = prefs.tracks.indexOf(t.index) >= 0;
      return '<button class="chip' + (on ? ' on' : '') + (t.clips ? '' : ' empty') + '" data-track="' + t.index + '" title="' + esc(t.name) + ' · ' + t.clips + ' clip' + (t.clips > 1 ? 's' : '') + (t.locked ? ' · verrouillée (non coupée)' : '') + '">' +
        (t.locked ? icon('lock') : '') + trackLabel(t.index) + '</button>';
    }).join('');
    $$('[data-track]', el).forEach(function (b) {
      b.onclick = function () {
        var i = Number(b.getAttribute('data-track')), k = prefs.tracks.indexOf(i);
        if (k >= 0) { if (prefs.tracks.length > 1) prefs.tracks.splice(k, 1); } else prefs.tracks.push(i);
        prefs.tracks.sort(function (x, y) { return x - y; });
        savePrefs(); renderTrackChips();
      };
    });
  }












  function seqTpf() {
    var s = state.sum && state.sum.seq;
    return (s && s.ticksPerFrame) || (state.tx && state.tx.tpf) || TICKS / 25;
  }
  /** Coupe des plages [début, fin] (secondes) repérées dans « 1 · Nettoyer » (mots barrés, silences) */
  function cutRanges(secRanges, action, what) {
    var tpf = seqTpf(), tol = tpf / 2;
    var oldId = state.sum && state.sum.seq ? state.sum.seq.id : '';
    var ranges = secRanges.map(function (s) {
      return [Math.round(s[0] * TICKS / tpf) * tpf, Math.round(s[1] * TICKS / tpf) * tpf];
    }).filter(function (r) { return r[1] - r[0] >= tpf; });
    if (!ranges.length) { toast('Rien à couper : aucun passage d\'au moins une image.', 'err'); return Promise.resolve(); }
    var removed = 0;
    ranges.forEach(function (r) { removed += r[1] - r[0]; });
    setBusy(true);
    var p, summary = '';
    if (action === 'markers') {
      p = batches(ranges, 100, 'Pose des marqueurs…', function (part) { return jsx('addMarkers', [JSON.stringify(part), what === 'silences' ? 'Silence (Kiru)' : 'Coupe (Kiru)', 1]); })
        .then(function (res) {
          var n = 0; res.forEach(function (r) { n += r.markers; });
          summary = n + ' marqueur' + (n > 1 ? 's' : '') + ' posé' + (n > 1 ? 's' : '') + ' (' + fmtDur(removed / TICKS) + ').';
          return res;
        });
    } else {
      p = (prefs.copy ? jsx('cloneSequence', ['(Kiru)']).then(function (r) {
        if (!r.success) throw new Error(r.error);
        if (state.tx && state.tx.seqId === oldId) { state.tx.seqId = r.seq.id; state.tx.seqName = r.seq.name; }
        if (state.sum) state.sum.seq = r.seq;
      }) : Promise.resolve()).then(function () {
        toast('Lecture de la timeline…', 'busy', true);
        return jsx('snapshot');
      }).then(function (snap) {
        if (!snap.success) throw new Error(snap.error);
        var chunks = razorChunks(snap.items, ranges, tol);
        if (!chunks.length) return [{ success: true, cuts: 0, errors: [] }];
        return batches(chunks, 1, 'Coups de lame…', function (part) { return jsx('razorPlan', [JSON.stringify(part[0])]); });
      }).then(function (razorRes) {
        logTimes('lame', razorRes);
        var cuts = 0; razorRes.forEach(function (r) { cuts += r.cuts; });
        if (action === 'razor') {
          summary = cuts + ' coups de lame aux bords de ' + ranges.length + ' ' + what + ' : sélectionnez et supprimez ce que vous voulez.';
          return razorRes;
        }
        // une seule passe : chaque clip n'est lu qu'une fois
        return batches(ranges, ranges.length, 'Suppression des ' + what + '…', function (part) { return jsx('removeRanges', [JSON.stringify(part)]); })
          .then(function (remRes) {
            logTimes('suppression', remRes);
            return jsx('snapshot').then(function (snap) {
              if (!snap.success) throw new Error(snap.error);
              var sorted = ranges.slice().sort(function (x, y) { return x[0] - y[0]; });
              var before = function (s) {
                var t = 0;
                for (var i = 0; i < sorted.length && sorted[i][1] <= s + tol; i++) t += sorted[i][1] - sorted[i][0];
                return t;
              };
              var moves = snap.items.map(function (it) { return { id: it.id, s: it.s, target: it.s - before(it.s) }; })
                .filter(function (m) { return Math.abs(m.target - m.s) > tol; })
                .sort(function (x, y) { return x.s - y.s; })
                .map(function (m) { return { id: m.id, target: m.target }; });
              return batches(moves, 400, 'Recollage…', function (part) { return jsx('moveItems', [JSON.stringify(part)]); })
                .then(function (movRes) {
                  var n = 0; remRes.forEach(function (r) { n += r.removed; });
                  summary = ranges.length + ' ' + what + ' retirés (' + fmtDur(removed / TICKS) + ') · ' + n + ' morceaux supprimés.';
                  var cur = state.sum && state.sum.seq ? state.sum.seq.id : oldId;
                  if (state.tx && state.tx.seqId === cur && tabs.text) tabs.text.collapse(sorted);
                  return razorRes.concat(remRes, movRes);
                });
            });
          });
      });
    }
    return p.then(function (res) {
      var errs = errorsOf(res);
      toast(summary + (errs.length ? ' Erreurs : ' + errs.join(' ; ') : ''), errs.length ? 'err' : 'ok');
    }).catch(function (e) {
      toast(e.message || String(e), 'err');
    }).then(function () {
      setBusy(false);
      refreshSummary();
      if (prefs.tab === 'text' && tabs.text) tabs.text.render();
    });
  }

  /**
   * Coups de lame utiles, piste par piste, à partir d'une seule lecture de la timeline : un temps n'est gardé
   * que s'il tombe à l'intérieur d'un clip (pas dans un vide ni sur un raccord existant). Découpés en lots
   * d'environ 150 coups pour afficher la progression.
   */
  function razorChunks(items, ranges, tol) {
    var times = [];
    ranges.forEach(function (r) { times.push(r[0], r[1]); });
    times = times.filter(function (t, i) { return times.indexOf(t) === i; }).sort(function (x, y) { return x - y; });
    var tracks = {};
    items.forEach(function (it) {
      var key = it.k + it.t;
      (tracks[key] = tracks[key] || { k: it.k, t: it.t, spans: [] }).spans.push([it.s, it.e]);
    });
    var entries = [];
    Object.keys(tracks).forEach(function (key) {
      var tr = tracks[key], sp = tr.spans.sort(function (a, b) { return a[0] - b[0]; }), j = 0, need = [];
      times.forEach(function (t) {
        while (j < sp.length && sp[j][1] - tol <= t) j++;
        if (j < sp.length && sp[j][0] + tol < t) need.push(t);
      });
      // les vidéos d'abord : un coup sur la vidéo coupe souvent aussi le son lié (le coup sur l'audio devient inutile)
      if (need.length) entries.push({ k: tr.k, t: tr.t, times: need });
    });
    entries.sort(function (a, b) { return a.k === b.k ? a.t - b.t : a.k === 'v' ? -1 : 1; });
    var chunks = [], cur = [], n = 0;
    entries.forEach(function (e) {
      for (var i = 0; i < e.times.length; i += 150) {
        var part = { k: e.k, t: e.t, times: e.times.slice(i, i + 150) };
        if (n + part.times.length > 150 && cur.length) { chunks.push(cur); cur = []; n = 0; }
        cur.push(part); n += part.times.length;
      }
    });
    if (cur.length) chunks.push(cur);
    return chunks;
  }
  function logTimes(step, res) {
    var ms = 0; (res || []).forEach(function (r) { ms += r.ms || 0; });
    try { console.log('[Kiru] ' + step + ' : ' + ms + ' ms dans Premiere'); } catch (e) {}
  }


  // ==================== Séquence active ====================
  function refreshSummary() {
    if (!inCEP || state.busy || state.reading || document.hidden || closing) return;
    state.reading = true;
    jsx('summary').then(function (r) {
      state.reading = false;
      if (!r || !r.success) return;
      var before = JSON.stringify(state.sum);
      state.sum = r;
      if (JSON.stringify(r) === before) return;
      // pistes choisies qui n'existent plus : retirées
      if (r.audio && r.audio.length) {
        prefs.tracks = prefs.tracks.filter(function (i) { return i < r.audio.length; });
        if (!prefs.tracks.length) prefs.tracks = [0];
      }
      renderTrackChips();
    });
  }
  /** Tête de lecture suivie seulement quand la souris est sur le panneau */
  function refreshPlayer() {
    var onText = prefs.tab === 'text' && state.tx;
    if (!inCEP || state.busy || closing || !onText) return;
    jsx('getPlayer').then(function (r) {
      if (!r || !r.success || r.ticks < 0) return;
      var t = r.ticks / TICKS;
      if (Math.abs(t - state.player) > 0.02) {
        state.player = t;
        if (prefs.tab === 'text' && tabs.text) tabs.text.onPlayer(t);
      }
    });
  }
  function panelActive() { return state.hover || document.hasFocus(); }
  function watchSequence() {
    if (!inCEP) return;
    clearInterval(state.selTimer);
    refreshSummary();
    state.selTimer = setInterval(function () { if (prefs.autoSel && panelActive()) refreshSummary(); }, 2000);
    state.playTimer = setInterval(function () { if (state.hover) refreshPlayer(); }, 600);
    var root = document.documentElement;
    root.addEventListener('mouseenter', function () { state.hover = true; refreshSummary(); });
    root.addEventListener('mouseleave', function () { state.hover = false; });
    window.addEventListener('focus', function () { refreshSummary(); });
  }

  // ==================== Apparence (partagée avec Cypher, Ongaku et Sori) ====================
  var BUILTIN_PRESETS = [
    { id: 'defaut', name: 'Défaut', background: '#0c1322', accent: '#8ea8f7', primary: '#fbe6a6', brandColor: '#a9bfff', builtIn: true }
  ];
  var DEFAULT_APPEARANCE = {
    theme: { background: '#0c1322', accent: '#8ea8f7', primary: '#fbe6a6' },
    brandLabel: 'Studio', brandColor: '#a9bfff', visibleTabs: ['text', 'captions'], userPresets: []
  };
  function appearance() {
    if (!prefs.appearance) {
      prefs.appearance = JSON.parse(JSON.stringify(DEFAULT_APPEARANCE));
      // premier lancement : on reprend l'apparence déjà réglée dans Cypher / Ongaku / Sori
      var shared = Suite && Suite.read();
      if (shared) Object.assign(prefs.appearance, shared);
    }
    var a = prefs.appearance;
    a.theme = Object.assign({}, DEFAULT_APPEARANCE.theme, a.theme || {});
    if (!Array.isArray(a.userPresets)) a.userPresets = [];
    if (!Array.isArray(a.visibleTabs) || !a.visibleTabs.length) a.visibleTabs = DEFAULT_APPEARANCE.visibleTabs.slice();
    // 1.1 : nouveaux onglets Texte et Sous-titres affichés une fois chez ceux qui avaient déjà Kiru
    if (!prefs.tabsV) {
      prefs.tabsV = 2;
      a.visibleTabs = TABS.map(function (t) { return t.id; }).filter(function (id) { return id === 'text' || id === 'captions' || a.visibleTabs.indexOf(id) >= 0; });
    }
    return a;
  }
  /** Relit l'apparence partagée au démarrage (elle a pu changer dans un autre panneau) */
  function syncSharedAppearance() {
    var a = appearance(), shared = Suite && Suite.read();
    if (shared) { Object.assign(a, shared); savePrefs(); }
  }

  function normalizeHex(value) {
    var v = String(value || '').trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(v)) v = v.split('').map(function (c) { return c + c; }).join('');
    return /^[0-9a-f]{6}$/.test(v) ? '#' + v : null;
  }
  function hexToRgb(hex) {
    var v = (normalizeHex(hex) || '#000000').slice(1);
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function mixRgb(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }); }
  function luminance(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }

  /** Même calcul que Cypher, Ongaku et Sori : nuances zinc / accent / cream / ink posées en variables CSS */
  function applyTheme(theme) {
    var root = document.documentElement.style;
    var set = function (name, rgb) { root.setProperty('--' + name, rgb.join(' ')); };
    var bg = hexToRgb(theme.background), isLight = luminance(bg) > 0.55;
    var white = [255, 255, 255], black = [0, 0, 0];
    var towards = isLight ? [16, 16, 20] : [247, 245, 239];
    var neutral = { 950: 0.03, 900: 0.07, 800: 0.13, 700: 0.22, 600: 0.33, 500: 0.45, 400: 0.58, 300: 0.72, 200: 0.85, 100: 0.92, 50: 0.96 };
    set('ink', bg);
    Object.keys(neutral).forEach(function (s) { set('zinc-' + s, mixRgb(bg, towards, neutral[s])); });
    var accent = hexToRgb(theme.accent);
    var accentSteps = { 50: [white, 0.88], 100: [white, 0.76], 200: [white, 0.55], 300: [white, 0.3], 400: [accent, 0],
      500: [bg, 0.15], 600: [bg, 0.3], 700: [bg, 0.45], 800: [bg, 0.6], 900: [bg, 0.72], 950: [bg, 0.84] };
    Object.keys(accentSteps).forEach(function (s) { set('accent-' + s, mixRgb(accent, accentSteps[s][0], accentSteps[s][1])); });
    var primary = hexToRgb(theme.primary);
    var primarySteps = { 100: [white, 0.6], 200: [white, 0.3], 300: [primary, 0], 400: [black, 0.08], 500: [black, 0.18] };
    Object.keys(primarySteps).forEach(function (s) { set('cream-' + s, mixRgb(primary, primarySteps[s][0], primarySteps[s][1])); });
    root.setProperty('--line', isLight ? 'rgb(0 0 0 / 0.12)' : 'rgb(255 255 255 / 0.10)');
    root.setProperty('--line-strong', isLight ? 'rgb(0 0 0 / 0.22)' : 'rgb(255 255 255 / 0.18)');
    root.setProperty('--glass', isLight ? 'rgb(0 0 0 / 0.03)' : 'rgb(255 255 255 / 0.03)');
  }

  // ---------- Barre d'état ----------
  var projectName = '', projectTimer = null, closing = false, engineOk = true;
  /** État du moteur de scripts de Premiere, affiché dans la barre d'état */
  function setEngine(ok) {
    if (ok === engineOk) return;
    engineOk = ok;
    renderStatus();
  }
  function renderStatus() {
    var a = appearance(), el = $('#status');
    if (!el) return;
    var label = !inCEP ? 'Hors de Premiere Pro' : engineOk ? 'Connecté à Premiere Pro' : 'Premiere ne répond pas aux scripts';
    el.innerHTML =
      '<span class="dot' + (inCEP ? (engineOk ? ' on' : ' warn') : '') + '" title="' + esc(engineOk ? label : STUCK_MSG) + '"></span>' +
      '<button class="app" id="btnAbout" title="À propos de Kiru">Kiru</button>' +
      (a.brandLabel ? '<span style="color:' + esc(a.brandColor) + '">' + esc(a.brandLabel) + '</span>' : '') +
      (inCEP && projectName ? '<span>·</span><span class="proj" title="' + esc(projectName) + '">' + esc(projectName) + '</span>' : '') +
      '<span>·</span><span' + (engineOk ? '' : ' class="stuck" title="' + esc(STUCK_MSG) + '"') + '>' + label + '</span>';
    $('#btnAbout').onclick = function (e) { e.stopPropagation(); toggleAbout(); };
  }
  function toggleAbout(force) {
    var el = $('#about');
    var open = force !== undefined ? force : !el.classList.contains('open');
    if (!open) { el.classList.remove('open'); return; }
    el.innerHTML =
      '<div class="about-logo"><span class="logo-glyph"></span></div>' +
      '<div class="about-name">Kiru <span>' + APP_VERSION + '</span></div>' +
      '<div class="about-line">Par <b>Paul-Eliot</b></div>' +
      '<div class="about-line">Libre et Open Source</div>' +
      '<div class="about-line muted">Claude Code</div>' +
      '<div class="about-copy">© ' + new Date().getFullYear() + ' Paul-Eliot</div>';
    el.classList.add('open');
  }
  function watchProject() {
    if (!inCEP) return;
    var waiting = false;
    var refresh = function () {
      if (closing || waiting || state.busy) return; // pendant une coupe, le moteur est occupé par Kiru : pas de fausse alerte
      waiting = true;
      // sans réponse en 8 s : moteur de scripts bloqué (la barre d'état le signale)
      var watchdog = setTimeout(function () { setEngine(false); }, 8000);
      cs.evalScript('app.project ? app.project.name : ""', function (r) {
        waiting = false; clearTimeout(watchdog); setEngine(true);
        var ok = r && r !== 'EvalScript error.' && r !== 'undefined' && r !== 'null';
        var name = ok ? String(r) : '';
        if (name !== projectName) { projectName = name; renderStatus(); }
      });
    };
    refresh();
    projectTimer = setInterval(refresh, 5000);
  }

  function applyAppearance() {
    var a = appearance();
    applyTheme(a.theme);
    var bl = $('#brandLabel');
    bl.textContent = a.brandLabel;
    bl.style.color = a.brandColor;
    renderStatus();
  }

  function exportPresetCode(p) {
    return JSON.stringify({ cypherTheme: 1, name: p.name, background: p.background, accent: p.accent, primary: p.primary, brandColor: p.brandColor });
  }
  function parsePresetCode(code) {
    var data;
    try { data = JSON.parse(String(code).trim()); } catch (e) { throw new Error('code illisible : collez le texte obtenu avec « Exporter »'); }
    var background = normalizeHex(data.background), accent = normalizeHex(data.accent), primary = normalizeHex(data.primary);
    var brandColor = normalizeHex(data.brandColor || data.accent);
    if (!background || !accent || !primary || !brandColor) throw new Error('couleurs manquantes ou invalides dans le code');
    return { id: 'preset-' + Date.now(), name: String(data.name || 'Preset importé').slice(0, 40), background: background, accent: accent, primary: primary, brandColor: brandColor };
  }

  // ==================== Réglages (fenêtre centrée, onglets comme Cypher) ====================
  var setTab = 'analysis', setUi = { exportCode: '', showImport: false, importError: '', presetName: '', eprFound: null };
  function openSettings(tab) { if (typeof tab === 'string') setTab = tab; renderSettings(); $('#settings').classList.add('open'); }
  function closeSettings() { $('#settings').classList.remove('open'); setUi.exportCode = ''; setUi.showImport = false; setUi.importError = ''; }

  function hexField(key, label, value) {
    return '<div class="hexf"><input type="color" data-color="' + key + '" value="' + value + '" title="Choisir : ' + label + '"/>' +
      '<span>' + label + '</span><input type="text" class="hex" data-hex="' + key + '" value="' + value + '" spellcheck="false"/></div>';
  }
  function setToggle(id, on, label, hint) {
    return '<label class="toggle ' + (on ? 'on' : '') + '" data-set="' + id + '"><span class="sw"></span>' + label + '</label>' + (hint ? '<div class="hint">' + hint + '</div>' : '');
  }

  function renderSettings() {
    var s = $('#settings'), a = appearance();
    var tabs = [['analysis', 'Analyse', 'wave'], ['ai', 'IA', 'brain'], ['appearance', 'Apparence', 'sliders']];
    var body = '';
    if (setTab === 'ai') body = aiSettingsBody();
    else if (setTab === 'analysis') {
      var ff = D.findFfmpeg(prefs.ffmpeg);
      body =
        '<div class="sgroup"><h3>' + icon('wave') + 'Lecture de l\'audio</h3><div class="sbox">' +
        '<div class="hint">Pour transcrire, Kiru convertit le son des fichiers des pistes choisies avec le décodeur intégré. ' +
        'Pour les vidéos lourdes ou les formats non reconnus (MOV, MXF…), installez <b>ffmpeg</b> : il est trouvé automatiquement s\'il est dans le PATH.</div>' +
        '<div class="folder-row">' + icon('terminal') + '<span class="p" title="' + esc(ff) + '">' + (ff ? esc(ff) : 'ffmpeg non trouvé') + '</span>' +
          '<span class="pill ' + (ff ? 'accent' : '') + '">' + (ff ? 'prêt' : 'absent') + '</span></div>' +
        '<input class="text-input" id="ffmpegIn" placeholder="Chemin de ffmpeg (facultatif)" value="' + esc(prefs.ffmpeg) + '" spellcheck="false"/>' +
        setToggle('preferFfmpeg', prefs.preferFfmpeg, 'Utiliser ffmpeg en priorité', 'Plus rapide et plus léger en mémoire sur les longues vidéos.') +
        '<div class="srow"><button class="sbtn sm" id="clearCache" title="Les séquences seront retranscrites au prochain « Analyser »">' + icon('trash') + 'Vider le cache des transcriptions</button></div>' +
        '</div></div>' +
        '<div class="sgroup"><h3>' + icon('download') + 'Secours : export par Premiere</h3><div class="sbox">' +
        '<div class="hint">Si un fichier est illisible (ou pour une séquence imbriquée), Premiere exporte en WAV le mixage des seules pistes analysées ' +
        '(les autres sont coupées le temps de l\'export), puis Kiru le lit et l\'efface. Il faut un preset <b>Waveform Audio</b> (.epr) : ' +
        'Kiru cherche celui fourni avec Premiere.</div>' +
        '<input class="text-input" id="eprIn" placeholder="Preset .epr (vide = automatique)" value="' + esc(prefs.epr) + '" spellcheck="false"/>' +
        '<div class="srow"><button class="sbtn sm" id="findEpr"' + (inCEP ? '' : ' disabled') + '>' + icon('search') + 'Rechercher le preset</button>' +
        (setUi.eprFound != null ? '<span class="hint">' + (setUi.eprFound ? esc(basename(setUi.eprFound)) : 'aucun preset WAV trouvé') + '</span>' : '') + '</div>' +
        '</div></div>' +
        '<div class="sgroup"><h3>' + icon('scissors') + 'Coupe</h3><div class="sbox">' +
        '<div class="hint"><b>Supprimer</b> coupe toutes les pistes <b>déverrouillées</b> aux mêmes endroits puis recolle : la synchro est gardée. ' +
        'Verrouillez une piste (musique, habillage) pour qu\'elle reste intacte. Les coupes sont calées sur les images de la séquence.</div>' +
        '<div class="hint">Premiere peut annuler une coupe par script (Ctrl+Z), mais sur une longue séquence c\'est lent et parfois instable : ' +
        'gardez « Travailler sur une copie » activé.</div>' +
        setToggle('autoSel', prefs.autoSel, 'Suivre la séquence active', 'Les pistes proposées sont relues quand la souris est sur le panneau.') +
        '</div></div>';
    } else {
      var isCur = function (p) { return p.background === a.theme.background && p.accent === a.theme.accent && p.primary === a.theme.primary; };
      body =
        '<div class="shared-note">' + icon('link') + '<span>Apparence <b>partagée avec Cypher, Ongaku et Sori</b> : thème, nom affiché et presets se mettent à jour dans tous les panneaux.' +
        (Suite && Suite.file ? '<br/><span class="path">' + esc(Suite.file) + '</span>' : '') + '</span></div>' +
        '<div class="sgroup"><h3>Thème de couleurs</h3>' +
        '<div class="presets">' + BUILTIN_PRESETS.concat(a.userPresets).map(function (p) {
          return '<span class="preset-wrap"><button class="preset ' + (isCur(p) ? 'on' : '') + '" data-preset="' + esc(p.id) + '"><span class="dots">' +
            [p.background, p.accent, p.primary].map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' + esc(p.name) + '</button>' +
            (p.builtIn ? '' : '<button class="preset-rm" data-rmpreset="' + esc(p.id) + '" title="Supprimer ce preset">' + icon('x') + '</button>') + '</span>';
        }).join('') + '</div>' +
        '<div class="sbox">' + hexField('background', 'Fond', a.theme.background) + hexField('accent', 'Accent', a.theme.accent) + hexField('primary', 'Boutons & titres', a.theme.primary) + '</div>' +
        '<div class="srow wrap"><input class="pill-input" id="themeName" placeholder="Nom du preset" value="' + esc(setUi.presetName) + '"/>' +
        '<button class="sbtn sm" id="saveTheme"' + (setUi.presetName.trim() ? '' : ' disabled') + '>' + icon('plus') + 'Enregistrer</button>' +
        '<button class="sbtn sm" id="exportTheme">' + icon('copy') + 'Exporter</button>' +
        '<button class="sbtn sm" id="toggleThemeImport">' + icon('download') + 'Importer</button></div>' +
        (setUi.exportCode ? '<div class="hint">Code copié dans le presse-papiers, à partager tel quel (compatible Cypher, Ongaku et Sori) :</div><textarea class="code" readonly rows="2" id="exportThemeCode">' + esc(setUi.exportCode) + '</textarea>' : '') +
        (setUi.showImport ? '<textarea class="code" rows="2" id="importThemeCode" placeholder=\'Collez un code de preset : {"cypherTheme":1,"name":…}\'></textarea>' +
          (setUi.importError ? '<div class="err">' + esc(setUi.importError) + '</div>' : '') +
          '<div class="srow end"><button class="sbtn sm" id="applyThemeImport">' + icon('check') + 'Appliquer</button></div>' : '') +
        '</div>' +
        '<div class="sgroup"><h3>Nom affiché à côté de Kiru</h3><div class="sbox">' +
        '<input class="text-input" id="brandIn" placeholder="Laisser vide pour ne rien afficher" value="' + esc(a.brandLabel) + '"/>' +
        hexField('brandColor', 'Couleur du nom', a.brandColor) + '</div></div>' +
        '<div class="sgroup"><h3>Onglets affichés (propre à Kiru)</h3><div class="tabchecks">' + TABS.map(function (t) {
          var on = a.visibleTabs.indexOf(t.id) >= 0, last = on && a.visibleTabs.length === 1;
          return '<label class="tabcheck ' + (on ? 'on' : '') + (last ? ' locked' : '') + '"' + (last ? ' title="Au moins un onglet doit rester affiché"' : '') + '>' +
            '<input type="checkbox" data-vtab="' + t.id + '"' + (on ? ' checked' : '') + (last ? ' disabled' : '') + '/>' + icon(t.icon) + t.label + '</label>';
        }).join('') + '</div></div>' +
        '<button class="sbtn sm" id="resetAppearance" style="align-self:flex-start">' + icon('refresh') + 'Réinitialiser l\'apparence</button>';
    }

    s.innerHTML =
      '<div class="modal">' +
      '<div class="modal-head"><div class="ttl">' + icon('settings') + '<h2>Réglages</h2></div><button class="modal-x" id="closeSet">' + icon('x') + '</button></div>' +
      '<div class="modal-tabs">' + tabs.map(function (t) {
        return '<button data-settab="' + t[0] + '" class="' + (setTab === t[0] ? 'on' : '') + '">' + icon(t[2]) + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="modal-body">' + body + '</div>' +
      '<div class="modal-foot"><span class="hint">Kiru ' + APP_VERSION + ' · ' + (inCEP ? 'connecté à Premiere Pro' : 'hors Premiere (aperçu)') + '</span><button class="btn-primary" id="closeSet2">Fermer</button></div>' +
      '</div>';

    s.onclick = function (e) { if (e.target === s) closeSettings(); };
    $('#closeSet').onclick = closeSettings;
    $('#closeSet2').onclick = closeSettings;
    $$('[data-settab]', s).forEach(function (b) { b.onclick = function () { setTab = b.getAttribute('data-settab'); renderSettings(); }; });

    if (setTab === 'ai') bindAiSettings(s);
    else if (setTab === 'analysis') {
      $$('[data-set]', s).forEach(function (l) {
        l.onclick = function (e) {
          e.preventDefault();
          var id = l.getAttribute('data-set');
          prefs[id] = !prefs[id];
          savePrefs(); renderSettings();
        };
      });
      var bindPath = function (sel, key) {
        var inp = $(sel);
        inp.onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
        inp.onchange = function () { prefs[key] = inp.value.trim().replace(/^"|"$/g, ''); savePrefs(); renderSettings(); };
      };
      bindPath('#ffmpegIn', 'ffmpeg');
      bindPath('#eprIn', 'epr');
      $('#clearCache').onclick = function () { if (window.KiruText) window.KiruText.clearCache(); toast('Cache des transcriptions vidé.'); };
      $('#findEpr').onclick = function () {
        jsx('wavPreset').then(function (r) {
          setUi.eprFound = r.success ? r.preset : '';
          if (setUi.eprFound && !prefs.epr) toast('Preset trouvé : ' + basename(setUi.eprFound));
          renderSettings();
        });
      };
    } else {
      bindAppearance(s, a);
    }
  }

  // ---------- Réglages > IA : whisper.cpp, modèles, langue, hésitations, clé Claude ----------
  var LANGS = [['auto', 'Détection automatique'], ['fr', 'Français'], ['en', 'Anglais'], ['es', 'Espagnol'], ['de', 'Allemand'], ['it', 'Italien'], ['pt', 'Portugais'], ['nl', 'Néerlandais'], ['ja', 'Japonais']];
  function openURL(url) {
    try { if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) { window.cep.util.openURLInDefaultBrowser(url); return; } } catch (e) {}
    window.open(url, '_blank');
  }
  function aiSettingsBody() {
    var X = window.KiruText, wh = X.findWhisper(prefs.tx.whisper), inst = X.installedModels(), isWin = /win/i.test(navigator.platform);
    var dl = setUi.dl || {};
    return '<div class="sgroup"><h3>' + icon('mic') + 'Transcription locale (whisper.cpp)</h3><div class="sbox">' +
      '<div class="hint">La transcription tourne <b>sur cet ordinateur</b> : rien n\'est envoyé en ligne, aucun crédit. ' +
      'Elle sert à l\'onglet <b>Texte</b> (hésitations, prises ratées, chapitres) et aux <b>Sous-titres</b>. Chaque fichier n\'est transcrit qu\'une fois (cache).</div>' +
      '<div class="folder-row">' + icon('terminal') + '<span class="p" title="' + esc(wh) + '">' + (wh ? esc(wh) : 'whisper.cpp non trouvé') + '</span>' +
        '<span class="pill ' + (wh ? 'accent' : '') + '">' + (wh ? (X.isGpu(wh) ? 'GPU' : 'CPU') : 'absent') + '</span></div>' +
      (isWin && X.hasNvidia() && !X.isGpu(wh) ? '<div class="gpu-tip">' + icon('zap') + '<span>Carte <b>NVIDIA</b> détectée : la version GPU transcrit environ <b>10 à 20 fois plus vite</b> que la version processeur ' +
        '(téléchargement unique de 643 Mo depuis GitHub).</span></div>' : '') +
      '<div class="srow wrap">' +
        (isWin && X.hasNvidia() ? '<button class="sbtn sm" id="installWhisperGpu"' + (dl.what ? ' disabled' : '') + '>' + icon('zap') + (X.isGpu(wh) ? 'Réinstaller (GPU)' : 'Installer la version GPU · 643 Mo') + '</button>' : '') +
        (isWin ? '<button class="sbtn sm" id="installWhisper"' + (dl.what ? ' disabled' : '') + '>' + icon('download') + (wh && !X.isGpu(wh) ? 'Réinstaller (processeur)' : 'Version processeur · 8 Mo') + '</button>' : '<span class="hint">macOS : <b>brew install whisper-cpp</b> (utilise la puce Apple)</span>') +
        '<button class="sbtn sm" id="whisperPage">' + icon('globe') + 'Page de whisper.cpp</button>' +
        (dl.what === 'whisper' ? '<span class="hint" id="dlProgress">' + dl.pct + ' %</span>' : '') + '</div>' +
      '<input class="text-input" id="whisperIn" placeholder="Chemin de whisper-cli (facultatif)" value="' + esc(prefs.tx.whisper) + '" spellcheck="false"/>' +
      '</div></div>' +
      '<div class="sgroup"><h3>' + icon('layers') + 'Modèle</h3><div class="models">' + X.MODELS.map(function (m) {
        var has = inst.indexOf(m.id) >= 0, on = prefs.tx.model === m.id, busy = dl.what === 'model:' + m.id;
        return '<div class="model' + (on ? ' on' : '') + '" data-model="' + m.id + '"><div class="mi"><b>' + esc(m.name) + '</b><span>' + esc(m.hint) + ' · ' + m.size + '</span></div>' +
          (has ? '<span class="pill accent">installé</span>' : busy ? '<span class="pill" id="dlProgress">' + dl.pct + ' %</span>' :
            '<button class="sbtn sm" data-dl="' + m.id + '"' + (dl.what ? ' disabled' : '') + '>' + icon('download') + 'Télécharger</button>') + '</div>';
      }).join('') + '</div><div class="hint">Les modèles sont rangés dans <span class="path">' + esc(X.dataDir()) + '</span></div></div>' +
      '<div class="sgroup"><h3>' + icon('globe') + 'Langue et hésitations</h3><div class="sbox">' +
      '<label class="dd"><span>Langue parlée</span><select id="txLang">' + LANGS.map(function (l) { return '<option value="' + l[0] + '"' + (prefs.tx.lang === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></label>' +
      '<div class="hint">Hésitations repérées par la case <b>Hésitations</b> de l\'onglet « 1 · Nettoyer » (séparées par des virgules) :</div>' +
      '<textarea class="code" rows="2" id="fillersIn">' + esc(prefs.tx.fillers) + '</textarea>' +
      setToggle('stutter', prefs.tx.stutter, 'Retirer aussi les mots répétés (« le le », « je je »)', '') +
      '<div class="srow"><button class="sbtn sm" id="clearTx">' + icon('trash') + 'Vider le cache des transcriptions</button></div>' +
      '</div></div>' +
      '<div class="sgroup"><h3>' + icon('sparkles') + 'Relecture IA et chapitres</h3><div class="sbox">' +
      '<div class="hint">Sert à la case <b>Relecture IA</b> de « 1 · Nettoyer » (prises ratées, phrases abandonnées, discussions hors tournage) et au bouton <b>Chapitres</b>. ' +
      'Facultatif : Silences, Hésitations et Reprises marchent sans. L\'IA lit seulement le <b>texte</b> de la transcription, jamais le son ni l\'image : ' +
      'elle ne peut donc pas retrouver un mot mal entendu.</div>' +
      '<div class="opt"><span class="opt-l">Moteur</span>' + seg('aiEngine', prefs.aiEngine, [['local', 'IA locale (gratuite)'], ['claude-code', 'Abonnement Claude'], ['api', 'Clé API']]) + '</div>' +
      (prefs.aiEngine === 'local' ? localAiBody() : prefs.aiEngine === 'api'
        ? '<div class="hint">Clé à créer sur <b>console.anthropic.com</b> (facturée à l\'usage), gardée dans les préférences du panneau sur cet ordinateur.</div>' +
          '<input class="text-input" id="claudeKey" type="password" placeholder="Clé API Claude (sk-ant-…)" value="' + esc(prefs.claudeKey) + '" spellcheck="false" autocomplete="off"/>'
        : (function () {
            var cc = window.KiruAI.findClaudeCode();
            // état : vérifié dans cette session, sinon le dernier connu (revérifié discrètement à l'ouverture)
            var ok = setUi.ccOk != null ? setUi.ccOk : prefs.ccOk;
            if (!cc) {
              return '<div class="hint">Utilise <b>Claude Code</b>, installé avec l\'application Claude : aucune clé, c\'est ton abonnement Claude qui sert.</div>' +
                '<div class="cc-state off">' + icon('alert') + '<span><b>Claude Code introuvable</b> : installez l\'application Claude (claude.ai/download), puis rouvrez ces réglages.</span></div>';
            }
            if (ok === true) {
              return '<div class="cc-state on">' + icon('check') + '<span><b>Claude connecté</b> · ton abonnement Claude est utilisé pour la relecture, les chapitres et le nettoyage des sous-titres.</span>' +
                (setUi.ccTesting ? '<span class="pill">vérification…</span>' : '') + '</div>' +
                '<div class="srow wrap"><button class="sbtn sm" id="ccTest"' + (setUi.ccTesting ? ' disabled' : '') + '>' + icon('reset') + 'Vérifier</button>' +
                '<button class="sbtn sm" id="ccLogin">' + icon('key') + 'Changer de compte</button>' +
                (setUi.ccMsg ? '<span class="hint">' + esc(setUi.ccMsg) + '</span>' : '') + '</div>';
            }
            return '<div class="cc-state ' + (ok === false ? 'off' : '') + '">' + icon(ok === false ? 'alert' : 'key') + '<span><b>' +
                (setUi.ccTesting ? 'Vérification de la connexion…' : ok === false ? 'Claude n\'est pas encore connecté' : 'Connexion à vérifier') + '</b></span></div>' +
              '<div class="hint">À faire une seule fois : <b>Se connecter</b> ouvre une fenêtre ; tape <b>/login</b>, choisis ton abonnement Claude et valide dans le navigateur. ' +
                'Kiru détecte la connexion tout seul.</div>' +
              '<div class="srow wrap"><button class="btn-primary" id="ccLogin">' + icon('key') + '<span>Se connecter</span></button>' +
              '<button class="sbtn sm" id="ccTest"' + (setUi.ccTesting ? ' disabled' : '') + '>' + icon('check') + (setUi.ccTesting ? 'Vérification…' : 'Vérifier') + '</button>' +
              (setUi.ccMsg ? '<span class="hint">' + esc(setUi.ccMsg) + '</span>' : '') + '</div>';
          })()) +
      '</div></div>';
  }
  /** IA locale : llama.cpp (Vulkan ou processeur) + modèle, tout sur cet ordinateur */
  function localAiBody() {
    var L = window.KiruLLM, srv = L.findServer(), inst = L.installedModels(), dl = setUi.dl || {};
    return '<div class="hint">Tout tourne <b>sur cet ordinateur</b> avec <b>llama.cpp</b> et un petit modèle : gratuit, sans compte, rien n\'est envoyé. ' +
      'Un peu moins fin que Claude, mais il repère bien les prises ratées et propose des chapitres. ' + (L.hasVulkan() ? 'Utilise la carte graphique (Vulkan).' : '') + '</div>' +
      '<div class="folder-row">' + icon('terminal') + '<span class="p" title="' + esc(srv) + '">' + (srv ? esc(srv) : 'llama.cpp non installé') + '</span>' +
        '<span class="pill' + (srv ? ' accent' : '') + '">' + (srv ? (L.isGpu(srv) ? 'GPU' : 'CPU') : 'absent') + '</span></div>' +
      '<div class="srow wrap"><button class="sbtn sm" id="llmInstall"' + (dl.what ? ' disabled' : '') + '>' + icon('download') + (srv ? 'Réinstaller llama.cpp' : 'Installer l\'IA locale · ' + (L.hasVulkan() ? '32' : '18') + ' Mo') + '</button>' +
        (dl.what === 'llama' ? '<span class="hint" id="dlProgress">' + dl.pct + ' %</span>' : '') + '</div>' +
      '<div class="models">' + L.MODELS.map(function (m) {
        var has = inst.indexOf(m.id) >= 0, on = prefs.llmModel === m.id, busy = dl.what === 'llm:' + m.id;
        return '<div class="model' + (on ? ' on' : '') + '" data-llm="' + m.id + '"><div class="mi"><b>' + esc(m.name) + '</b><span>' + esc(m.hint) + ' · ' + m.size + '</span></div>' +
          (has ? '<span class="pill accent">installé</span>' : busy ? '<span class="pill" id="dlProgress">' + dl.pct + ' %</span>' :
            '<button class="sbtn sm" data-llmdl="' + m.id + '"' + (dl.what ? ' disabled' : '') + '>' + icon('download') + 'Télécharger</button>') + '</div>';
      }).join('') + '</div>';
  }

  function bindAiSettings(s) {
    var X = window.KiruText;
    var stop = function (e) { e.stopPropagation(); };
    var progress = function (what) {
      return function (f) {
        var pct = Math.round(f * 100);
        if (setUi.dl && setUi.dl.pct === pct) return;
        setUi.dl = { what: what, pct: pct };
        var el = $('#dlProgress'); if (el) el.textContent = pct + ' %';
      };
    };
    var done = function (msg) { return function () { setUi.dl = null; toast(msg); if ($('#settings').classList.contains('open')) renderSettings(); }; };
    var failed = function (e) { setUi.dl = null; toast(e.message || String(e), 'err'); if ($('#settings').classList.contains('open')) renderSettings(); };
    if ($('#installWhisper')) $('#installWhisper').onclick = function () {
      setUi.dl = { what: 'whisper', pct: 0 }; renderSettings();
      X.installWhisper(progress('whisper')).then(done('whisper.cpp installé.'), failed);
    };
    if ($('#installWhisperGpu')) $('#installWhisperGpu').onclick = function () {
      setUi.dl = { what: 'whisper', pct: 0 }; renderSettings();
      X.installWhisper(progress('whisper'), true).then(done('whisper.cpp GPU installé : les prochaines transcriptions utiliseront la carte graphique.'), failed);
    };
    $('#whisperPage').onclick = function () { openURL('https://github.com/ggml-org/whisper.cpp/releases'); };
    $$('[data-dl]', s).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var id = b.getAttribute('data-dl');
        setUi.dl = { what: 'model:' + id, pct: 0 }; prefs.tx.model = id; savePrefs(); renderSettings();
        X.downloadModel(id, progress('model:' + id)).then(done('Modèle téléchargé.'), failed);
      };
    });
    $$('[data-model]', s).forEach(function (r) {
      r.onclick = function () { prefs.tx.model = r.getAttribute('data-model'); savePrefs(); renderSettings(); };
    });
    var wi = $('#whisperIn');
    wi.onkeydown = stop;
    wi.onchange = function () { prefs.tx.whisper = wi.value.trim().replace(/^"|"$/g, ''); savePrefs(); renderSettings(); };
    $('#txLang').onchange = function () { prefs.tx.lang = this.value; savePrefs(); };
    var fi = $('#fillersIn');
    fi.onkeydown = stop;
    fi.oninput = function () { prefs.tx.fillers = fi.value; savePrefsSoon(); };
    $$('[data-set="stutter"]', s).forEach(function (l) { l.onclick = function (e) { e.preventDefault(); prefs.tx.stutter = !prefs.tx.stutter; savePrefs(); renderSettings(); }; });
    $('#clearTx').onclick = function () { X.clearCache(); toast('Cache des transcriptions vidé.'); };
    if ($('#llmInstall')) $('#llmInstall').onclick = function () {
      setUi.dl = { what: 'llama', pct: 0 }; renderSettings();
      window.KiruLLM.install(progress('llama')).then(done('IA locale installée.'), failed);
    };
    $$('[data-llmdl]', s).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var id = b.getAttribute('data-llmdl');
        setUi.dl = { what: 'llm:' + id, pct: 0 }; prefs.llmModel = id; savePrefs(); renderSettings();
        window.KiruLLM.downloadModel(id, progress('llm:' + id)).then(done('Modèle téléchargé.'), failed);
      };
    });
    $$('[data-llm]', s).forEach(function (r) {
      r.onclick = function () { prefs.llmModel = r.getAttribute('data-llm'); savePrefs(); renderSettings(); };
    });
    $$('[data-seg="aiEngine"] button', s).forEach(function (b) {
      b.onclick = function () { prefs.aiEngine = b.getAttribute('data-v'); savePrefs(); setUi.ccMsg = ''; renderSettings(); };
    });
    var ck = $('#claudeKey');
    if (ck) {
      ck.onkeydown = stop;
      ck.onchange = function () { prefs.claudeKey = ck.value.trim(); savePrefs(); toast(prefs.claudeKey ? 'Clé Claude enregistrée.' : 'Clé Claude retirée.'); };
    }
    if ($('#ccLogin')) $('#ccLogin').onclick = function () {
      if (!window.KiruAI.openLogin()) { setUi.ccMsg = 'Impossible d\'ouvrir Claude Code.'; return renderSettings(); }
      setUi.ccMsg = 'Dans la fenêtre : tape /login et valide dans le navigateur. Kiru vérifie tout seul la connexion…';
      renderSettings();
      ccWatch();
    };
    if ($('#ccTest')) $('#ccTest').onclick = function () { ccCheck(false); };
    // première ouverture : vérification discrète de la connexion
    if ((prefs.aiEngine || 'local') === 'claude-code' && window.KiruAI.findClaudeCode() && setUi.ccOk == null && !setUi.ccTesting) ccCheck(true);
  }
  /** Vérifie la connexion de Claude Code (silent : sans message d'erreur, pour l'affichage d'état) */
  function ccCheck(silent) {
    if (setUi.ccTesting) return Promise.resolve(setUi.ccOk);
    setUi.ccTesting = true; if (!silent) setUi.ccMsg = '';
    if (setTab === 'ai' && $('#settings').classList.contains('open')) renderSettings();
    return window.KiruAI.test({ engine: 'claude-code' }).then(function () {
      setUi.ccOk = true; setUi.ccMsg = ''; prefs.ccOk = true; savePrefs();
    }, function (e) {
      setUi.ccOk = false; prefs.ccOk = false; savePrefs();
      if (!silent || !e.login) setUi.ccMsg = e.message;
    }).then(function () {
      setUi.ccTesting = false;
      if ($('#settings').classList.contains('open') && setTab === 'ai') renderSettings();
      return setUi.ccOk;
    });
  }
  /** Après « Se connecter » : nouvelle vérification toutes les 8 s pendant 5 minutes, jusqu'à la connexion */
  var ccTimer = null;
  function ccWatch() {
    clearInterval(ccTimer);
    var t0 = Date.now();
    ccTimer = setInterval(function () {
      if (Date.now() - t0 > 300000) return clearInterval(ccTimer);
      if (setUi.ccTesting) return;
      ccCheck(true).then(function (ok) {
        if (!ok) return;
        clearInterval(ccTimer);
        toast('Claude connecté : vous pouvez fermer la fenêtre de Claude Code.');
      });
    }, 8000);
  }

  function bindAppearance(s, a) {
    var commit = function () { saveAppearance(); applyAppearance(); };
    var refreshPresetPills = function () {
      $$('[data-preset]', s).forEach(function (b) {
        var p = BUILTIN_PRESETS.concat(a.userPresets).filter(function (x) { return x.id === b.getAttribute('data-preset'); })[0];
        b.classList.toggle('on', !!p && p.background === a.theme.background && p.accent === a.theme.accent && p.primary === a.theme.primary);
      });
    };
    var setColor = function (key, hex) {
      if (key === 'brandColor') a.brandColor = hex; else a.theme[key] = hex;
      var c = s.querySelector('[data-color="' + key + '"]'), t = s.querySelector('[data-hex="' + key + '"]');
      if (c && c.value !== hex) c.value = hex;
      if (t && document.activeElement !== t) t.value = hex;
      commit(); refreshPresetPills();
    };
    $$('[data-color]', s).forEach(function (inp) { inp.oninput = function () { setColor(inp.getAttribute('data-color'), inp.value); }; });
    $$('[data-hex]', s).forEach(function (inp) {
      inp.oninput = function () { var hex = normalizeHex(inp.value); if (hex) setColor(inp.getAttribute('data-hex'), hex); };
      inp.onblur = function () { var k = inp.getAttribute('data-hex'); inp.value = k === 'brandColor' ? a.brandColor : a.theme[k]; };
    });
    $$('[data-preset]', s).forEach(function (b) {
      b.onclick = function () {
        var p = BUILTIN_PRESETS.concat(a.userPresets).filter(function (x) { return x.id === b.getAttribute('data-preset'); })[0];
        if (!p) return;
        a.theme = { background: p.background, accent: p.accent, primary: p.primary };
        a.brandColor = p.brandColor;
        commit(); renderSettings();
      };
    });
    $$('[data-rmpreset]', s).forEach(function (b) {
      b.onclick = function () { var id = b.getAttribute('data-rmpreset'); a.userPresets = a.userPresets.filter(function (p) { return p.id !== id; }); saveAppearance(); renderSettings(); };
    });
    var pn = $('#themeName');
    pn.oninput = function () { setUi.presetName = pn.value; $('#saveTheme').disabled = !pn.value.trim(); };
    var savePreset = function () {
      var name = setUi.presetName.trim();
      if (!name) return;
      var preset = { id: 'preset-' + Date.now(), name: name, background: a.theme.background, accent: a.theme.accent, primary: a.theme.primary, brandColor: a.brandColor };
      a.userPresets = a.userPresets.filter(function (p) { return p.name !== name; }).concat([preset]);
      setUi.presetName = '';
      saveAppearance(); renderSettings();
    };
    pn.onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') savePreset(); };
    $('#saveTheme').onclick = savePreset;
    $('#exportTheme').onclick = function () {
      setUi.exportCode = exportPresetCode({ name: setUi.presetName.trim() || 'Mon thème', background: a.theme.background, accent: a.theme.accent, primary: a.theme.primary, brandColor: a.brandColor });
      copyText(setUi.exportCode);
      renderSettings();
      var ec = $('#exportThemeCode'); if (ec) ec.select();
    };
    $('#toggleThemeImport').onclick = function () { setUi.showImport = !setUi.showImport; setUi.importError = ''; renderSettings(); if ($('#importThemeCode')) $('#importThemeCode').focus(); };
    if ($('#applyThemeImport')) $('#applyThemeImport').onclick = function () {
      try {
        var p = parsePresetCode($('#importThemeCode').value);
        a.userPresets = a.userPresets.filter(function (x) { return x.name !== p.name; }).concat([p]);
        a.theme = { background: p.background, accent: p.accent, primary: p.primary };
        a.brandColor = p.brandColor;
        setUi.showImport = false; setUi.importError = '';
        commit(); renderSettings();
        toast('Preset « ' + p.name + ' » importé et appliqué.');
      } catch (e) { setUi.importError = e.message; renderSettings(); }
    };
    $('#brandIn').oninput = function () { a.brandLabel = this.value.slice(0, 32); commit(); };
    $('#brandIn').onkeydown = function (e) { e.stopPropagation(); };
    $$('[data-vtab]', s).forEach(function (cb) {
      cb.onchange = function () {
        var id = cb.getAttribute('data-vtab');
        if (cb.checked) a.visibleTabs = TABS.map(function (t) { return t.id; }).filter(function (t) { return t === id || a.visibleTabs.indexOf(t) >= 0; });
        else if (a.visibleTabs.length > 1) a.visibleTabs = a.visibleTabs.filter(function (t) { return t !== id; });
        if (a.visibleTabs.indexOf(prefs.tab) < 0) prefs.tab = a.visibleTabs[0];
        savePrefs(); renderTabs(); renderView(); renderSettings();
      };
    });
    $('#resetAppearance').onclick = function () {
      var keep = a.userPresets;
      prefs.appearance = JSON.parse(JSON.stringify(DEFAULT_APPEARANCE));
      prefs.appearance.userPresets = keep;
      saveAppearance(); applyAppearance(); renderTabs(); renderView(); renderSettings();
    };
  }

  /** Un autre panneau (Cypher, Ongaku, Sori) a changé l'apparence partagée */
  function onSharedAppearance(shared) {
    var a = appearance();
    Object.assign(a, shared);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
    applyAppearance();
    if ($('#settings').classList.contains('open') && setTab === 'appearance') {
      var focused = document.activeElement && $('#settings').contains(document.activeElement);
      if (!focused) renderSettings();
    }
  }

  // ==================== Démarrage ====================
  function shutdown() {
    if (closing) return;
    closing = true;
    clearInterval(projectTimer); clearInterval(state.selTimer); clearInterval(state.playTimer);
  }

  /** Outils communs passés aux onglets Texte et Sous-titres */
  function makeTabs() {
    var K = {
      $: $, $$: $$, esc: esc, icon: icon, toast: toast, jsx: jsx, batches: batches, errorsOf: errorsOf,
      prefs: prefs, state: state, savePrefs: savePrefs, savePrefsSoon: savePrefsSoon, inCEP: inCEP, TICKS: TICKS,
      fmtTC: fmtTC, fmtDur: fmtDur, num: num, basename: basename, nodeReq: nodeReq, setBusy: setBusy,
      cutRanges: cutRanges, renderTrackChips: renderTrackChips, sortedTracks: sortedTracks, trackLabel: trackLabel,
      exportMix: exportMix, openSettings: openSettings, seg: seg, toggle: toggle, copyText: copyText, D: D, seqTpf: seqTpf,
      numRow: numRow, bindNums: bindNums,
      tabs: tabs, APP_VERSION: APP_VERSION,
      extDir: decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\/[^\/]*$/, '')
    };
    var T = window.KiruTabs || {};
    if (T.text) tabs.text = T.text(K);
    if (T.captions) tabs.captions = T.captions(K);
  }

  function init() {
    makeTabs();
    syncSharedAppearance();
    applyAppearance();
    watchProject();
    $('#btnSettings').innerHTML = icon('settings');
    $('#btnSettings').onclick = openSettings;
    renderTabs();
    renderView();
    watchSequence();
    if (Suite) Suite.watch(onSharedAppearance);

    document.addEventListener('keydown', function (e) {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range') return;
      var mod = e.ctrlKey || e.metaKey, tab = prefs.tab === 'text' || prefs.tab === 'captions' ? tabs[prefs.tab] : null;
      if (tab && tab.key && tab.key(e)) return;
      if (mod && e.code === 'Enter') { e.preventDefault(); if (tab) tab.apply(); }
      else if (e.code === 'Escape') { closeSettings(); toggleAbout(false); }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('#about')) toggleAbout(false); });
    window.addEventListener('beforeunload', shutdown);
    window.addEventListener('pagehide', shutdown);
    window.addEventListener('unload', shutdown);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshSummary();
    });
    if (!inCEP) setTimeout(function () { toast('Aperçu hors Premiere : « Analyser » simule une parole pour essayer les réglages ; la coupe est désactivée.'); }, 400);
  }

  init();
})();
