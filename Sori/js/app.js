/**
 * Sori — éditeur de courbes d'animation pour Premiere Pro (interface du panneau).
 * JavaScript sans build : fonctionne tel quel dans CEP (Chromium 74+).
 */
(function () {
  'use strict';

  var APP_VERSION = '1.3.0'; // à garder identique à CSXS/manifest.xml
  var C = window.SoriCurve, Suite = window.SuiteTheme;
  var cs = new CSInterface();
  var inCEP = !!window.__adobe_cep__;
  var TICKS = 254016000000;

  // ==================== Icônes (tracés Lucide) ====================
  var ICONS = {
    spline: '<circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/>',
    library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    move: '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/>',
    scale: '<path d="M21 3 9 15"/><path d="M12 3H3v18h18v-9"/><path d="M16 3h5v5"/><path d="M14 15H9v-5"/>',
    rotate: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    opacity: '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
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
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    unlink: '<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'
  };
  function icon(name, cls) { return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24">' + (ICONS[name] || '') + '</svg>'; }

  // ==================== Préférences ====================
  var PREFS_KEY = 'sori.prefs.v1', MEMO_KEY = 'sori.memo.v1';
  var DENSITY_LABELS = { light: 'Légère', adaptive: 'Précise', frame: 'Chaque image' };
  /** Flou de mouvement : angle d'obturation de l'effet Transformation */
  var BLUR_ANGLES = { low: 90, mid: 180, high: 360 };
  function blurLevel() { var a = prefs.autoTr.angle; return a <= 120 ? 'low' : a <= 270 ? 'mid' : 'high'; }
  var DEFAULT_PREFS = {
    tab: 'curve', view: 'value',
    curve: null, curveName: 'Ease In-Out', curveId: 'ease-in-out', edited: false,
    density: 'light',
    autoTr: { on: true, angle: 180 },
    loop: { on: false, mode: 'cycle' },
    presets: [], autoSel: true, memo: true
  };
  var prefs = (function () {
    var p = JSON.parse(JSON.stringify(DEFAULT_PREFS));
    try {
      var s = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      Object.keys(s).forEach(function (k) {
        if (k === 'autoTr' || k === 'loop') Object.assign(p[k], s[k]); else p[k] = s[k];
      });
      // v1.0 : « Flou de mouvement » -> Transformation auto ; densité « 1 sur 2 » retirée
      if (s.blur && !s.autoTr) p.autoTr.angle = s.blur.angle || 180;
      delete p.blur; delete p.mode; delete p.stagger; delete p.props;
      if (!DENSITY_LABELS[p.density]) p.density = 'light';
    } catch (e) {}
    if (!Array.isArray(p.presets)) p.presets = [];
    return p;
  })();
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} }
  /** Apparence modifiée dans Sori : écrite aussi dans le fichier partagé (repris par Mori et Ongaku) */
  function saveAppearance() {
    savePrefs();
    if (Suite && prefs.appearance) Suite.write(prefs.appearance, 'Sori');
  }

  var curve = (function () {
    try { if (prefs.curve && C.validCurve(prefs.curve)) return C.fromPoints(prefs.curve.points); } catch (e) {}
    return C.clone(C.findBuiltin('ease-in-out').curve);
  })();
  function saveCurve() { prefs.curve = C.serialize(curve); savePrefs(); }

  // ==================== État ====================
  var state = {
    sel: null, selTimer: null, applying: false, hover: false, applyUndo: [], lastAction: 'edit',
    selected: -1, history: [], future: [],
    refFrames: 0, fps: 25
  };

  // ==================== Utilitaires ====================
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function css(name, a) { return 'rgba(' + getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim().split(/\s+/).join(',') + ',' + (a == null ? 1 : a) + ')'; }
  function pct(x) { return Math.round(x * 100) + ' %'; }
  function num(x, d) { var f = Math.pow(10, d == null ? 2 : d); return String(Math.round(x * f) / f).replace('.', ','); }
  var COLORS = {};
  function refreshColors() {
    COLORS = {
      grid: css('zinc-700', 0.55), gridMinor: css('zinc-800', 0.6), gridStrong: css('zinc-500', 0.6), label: css('zinc-500'),
      curve: css('accent-300'), curveFill: css('accent-300', 0.09), cream: css('cream-300'), ink: css('ink'),
      handle: css('zinc-300', 0.7), sel: css('accent-200'), avg: css('cream-300', 0.35), ghost: css('zinc-400', 0.35)
    };
  }

  var toastTimer = null;
  function toast(msg, kind, sticky) {
    var el = $('#toast');
    var ic = kind === 'err' ? 'alert' : kind === 'busy' ? 'activity' : 'check';
    el.innerHTML = '<div class="msg ' + (kind || 'ok') + '">' + icon(ic) + '<span>' + esc(msg) + '</span></div>';
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(function () { el.innerHTML = ''; }, kind === 'err' ? 6000 : 3500);
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
    var r = (n && typeof n.require === 'function' && n.require) || window.__soriRequire;
    try { return r ? r(name) : null; } catch (e) { return null; }
  }

  // ==================== Pont Premiere (ExtendScript) ====================
  var JSX_REV = 12; // = rev de jsx/Sori_Premiere.jsx : le script hôte est rechargé s'il est plus ancien
  var JSX_PATH =decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\/[^\/]*$/, '') + '/jsx/Sori_Premiere.jsx';
  function esLit(v) {
    return JSON.stringify(v).replace(/[^\x00-\x7e]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
  }
  function jsx(fn, args) {
    return new Promise(function (resolve) {
      if (!inCEP) return resolve({ success: false, error: 'Disponible uniquement dans Premiere Pro' });
      var call = '$.Sori.' + fn + '(' + (args || []).map(esLit).join(',') + ')';
      var script =
        '(function(){try{' +
        'if(typeof $.Sori==="undefined"||!$.Sori.' + fn + '||$.Sori.rev!==' + JSX_REV + '){$.evalFile(new File(' + esLit(JSX_PATH) + '));}' +
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

  // ==================== Historique de l'éditeur ====================
  function snapshot() { return JSON.stringify(C.serialize(curve)); }
  function pushHistory() {
    state.lastAction = 'edit';
    state.history.push(snapshot());
    if (state.history.length > 80) state.history.shift();
    state.future = [];
  }
  function restore(json) {
    curve = C.fromPoints(JSON.parse(json).points);
    if (state.selected >= curve.points.length) state.selected = -1;
    markEdited(); saveCurve(); drawGraph(); renderInfo();
  }
  function undo() { if (!state.history.length) return; state.future.push(snapshot()); restore(state.history.pop()); }
  function redo() { if (!state.future.length) return; state.history.push(snapshot()); restore(state.future.pop()); }

  function markEdited() {
    if (!prefs.edited) { prefs.edited = true; updateCurveName(); }
  }
  function loadCurve(c, name, id) {
    pushHistory();
    curve = C.clone(c);
    prefs.curveName = name; prefs.curveId = id || ''; prefs.edited = false;
    state.selected = -1;
    saveCurve();
    updateCurveName(); drawGraph(); renderInfo();
  }
  function updateCurveName() {
    var el = $('#curveName');
    if (el) el.innerHTML = esc(prefs.curveName || 'Courbe') + (prefs.edited ? ' <i>modifiée</i>' : '');
    var cssEl = $('#cssOut');
    if (cssEl) {
      var s = C.cssString(curve);
      cssEl.textContent = s || (curve.points.length - 1) + ' segments · ' + (curve.points.length - 2) + ' sous-clé' + (curve.points.length > 3 ? 's' : '');
    }
  }

  // ==================== Éditeur de courbe (canvas) ====================
  var G = { cv: null, ctx: null, w: 0, h: 0, dpr: 1, pad: { l: 34, r: 14, t: 14, b: 22 }, range: null, drag: null, hover: null, freeze: false };

  function gx(t) { return G.pad.l + t * (G.w - G.pad.l - G.pad.r); }
  function gy(y) { var r = G.range; return G.pad.t + (r.hi - y) / (r.hi - r.lo) * (G.h - G.pad.t - G.pad.b); }
  function ix(px) { return (px - G.pad.l) / (G.w - G.pad.l - G.pad.r); }
  function iy(py) { var r = G.range; return r.hi - (py - G.pad.t) / (G.h - G.pad.t - G.pad.b) * (r.hi - r.lo); }

  function hSlope(h) { return h && Math.abs(h[0]) > 1e-6 ? h[1] / h[0] : 0; }
  var MAX_SPEED = 12;

  function computeRange() {
    var lo, hi, i, p;
    if (prefs.view === 'speed') {
      lo = 0; hi = 1.5;
      C.samples(curve, 40).forEach(function (seg) { seg.forEach(function (s) { lo = Math.min(lo, s.s); hi = Math.max(hi, s.s); }); });
      for (i = 0; i < curve.points.length; i++) {
        p = curve.points[i];
        if (p.o) { lo = Math.min(lo, hSlope(p.o)); hi = Math.max(hi, hSlope(p.o)); }
        if (p.i) { lo = Math.min(lo, hSlope(p.i)); hi = Math.max(hi, hSlope(p.i)); }
      }
      lo = Math.max(lo, -MAX_SPEED); hi = Math.min(hi, MAX_SPEED);
      var m = (hi - lo) * 0.1;
      return { lo: lo - m, hi: hi + m };
    }
    lo = 0; hi = 1;
    C.samples(curve, 40).forEach(function (seg) { seg.forEach(function (s) { lo = Math.min(lo, s.v); hi = Math.max(hi, s.v); }); });
    for (i = 0; i < curve.points.length; i++) {
      p = curve.points[i];
      if (p.o) { lo = Math.min(lo, p.v + p.o[1]); hi = Math.max(hi, p.v + p.o[1]); }
      if (p.i) { lo = Math.min(lo, p.v + p.i[1]); hi = Math.max(hi, p.v + p.i[1]); }
    }
    var mg = Math.max(0.12, (hi - lo) * 0.08);
    return { lo: lo - mg, hi: hi + mg };
  }

  /** Position écran des points et poignées (selon la vue) */
  function handlesGeometry() {
    var out = [], speed = prefs.view === 'speed';
    curve.points.forEach(function (p, k) {
      var sIn = hSlope(p.i), sOut = hSlope(p.o);
      if (p.i) out.push({ kind: 'in', k: k, x: gx(p.t + p.i[0]), y: gy(speed ? clampS(sIn) : p.v + p.i[1]), ax: gx(p.t), ay: gy(speed ? clampS(sIn) : p.v) });
      if (p.o) out.push({ kind: 'out', k: k, x: gx(p.t + p.o[0]), y: gy(speed ? clampS(sOut) : p.v + p.o[1]), ax: gx(p.t), ay: gy(speed ? clampS(sOut) : p.v) });
      var ay = speed ? gy(clampS(p.o ? sOut : sIn)) : gy(p.v);
      out.push({ kind: 'anchor', k: k, x: gx(p.t), y: ay, y2: speed && p.i && p.o ? gy(clampS(sIn)) : null });
    });
    return out;
  }
  function clampS(s) { return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, s)); }

  function setupCanvas() {
    var host = $('#graph');
    if (!host) { G.cv = null; return; }
    G.cv = host.querySelector('canvas');
    G.ctx = G.cv.getContext('2d');
    resizeCanvas();
    bindGraph(host);
    // la courbe suit la hauteur disponible : redessinée dès que sa zone change de taille
    if (window.ResizeObserver) {
      if (G.ro) G.ro.disconnect();
      G.ro = new ResizeObserver(function () { resizeCanvas(); drawGraph(); });
      G.ro.observe(host);
    }
  }
  function resizeCanvas() {
    if (!G.cv) return;
    var r = G.cv.parentNode.getBoundingClientRect();
    G.dpr = window.devicePixelRatio || 1;
    G.w = Math.max(100, r.width); G.h = Math.max(100, r.height);
    G.cv.width = Math.round(G.w * G.dpr); G.cv.height = Math.round(G.h * G.dpr);
    G.cv.style.width = G.w + 'px'; G.cv.style.height = G.h + 'px';
  }

  function drawGraph() {
    if (!G.cv || !document.body.contains(G.cv)) return;
    if (!G.freeze || !G.range) G.range = computeRange();
    var ctx = G.ctx, speed = prefs.view === 'speed';
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, G.w, G.h);
    ctx.font = '600 9px Urbanist, sans-serif';
    ctx.lineWidth = 1;

    // grille temporelle : images si la durée des clés est connue, sinon quarts
    var frames = state.refFrames, x0 = gx(0), x1 = gx(1), yTop = G.pad.t, yBot = G.h - G.pad.b;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = COLORS.label;
    if (frames > 1 && frames <= 240) {
      var step = frames <= 30 ? 1 : frames <= 60 ? 2 : frames <= 120 ? 5 : 10;
      for (var f = 0; f <= frames; f += step) {
        var x = gx(f / frames), major = f % (step * 5) === 0 || f === frames;
        ctx.strokeStyle = major ? COLORS.grid : COLORS.gridMinor;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, yTop); ctx.lineTo(Math.round(x) + 0.5, yBot); ctx.stroke();
        if (major) ctx.fillText(String(f), x, yBot + 5);
      }
    } else {
      for (var q = 0; q <= 4; q++) {
        var xq = gx(q / 4);
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath(); ctx.moveTo(Math.round(xq) + 0.5, yTop); ctx.lineTo(Math.round(xq) + 0.5, yBot); ctx.stroke();
        ctx.fillText(q * 25 + '%', xq, yBot + 5);
      }
    }
    // repères horizontaux
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    var hl = speed ? [[0, '0'], [1, '1×']] : [[0, '0%'], [0.5, '50%'], [1, '100%']];
    hl.forEach(function (h) {
      var y = gy(h[0]);
      if (y < yTop - 1 || y > yBot + 1) return;
      ctx.strokeStyle = h[0] === 0.5 ? COLORS.grid : COLORS.gridStrong;
      if (speed && h[0] === 1) { ctx.setLineDash([3, 3]); ctx.strokeStyle = COLORS.avg; }
      ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.label; ctx.fillText(h[1], x0 - 6, y);
    });
    if (speed) { ctx.fillStyle = COLORS.label; ctx.textAlign = 'left'; ctx.fillText('vitesse (× moyenne)', x0 + 4, yTop + 6); }

    // courbe
    var segs = C.samples(curve, 64);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (!speed) {
      ctx.beginPath(); ctx.moveTo(gx(0), gy(0));
      segs.forEach(function (seg) { seg.forEach(function (s) { ctx.lineTo(gx(s.t), gy(s.v)); }); });
      ctx.lineTo(gx(1), gy(0)); ctx.closePath(); ctx.fillStyle = COLORS.curveFill; ctx.fill();
    } else {
      // courbe de valeur en fantôme sous la vitesse
      ctx.strokeStyle = COLORS.ghost; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      var vy = function (v) { return G.pad.t + (1.15 - v) / 1.3 * (yBot - yTop); };
      ctx.beginPath();
      segs.forEach(function (seg, si) { seg.forEach(function (s, j) { if (!si && !j) ctx.moveTo(gx(s.t), vy(s.v)); else ctx.lineTo(gx(s.t), vy(s.v)); }); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = COLORS.curve; ctx.lineWidth = 2.4;
    segs.forEach(function (seg, si) {
      ctx.beginPath();
      seg.forEach(function (s, j) {
        var y = gy(speed ? clampS(s.s) : s.v);
        if (!j) ctx.moveTo(gx(s.t), y); else ctx.lineTo(gx(s.t), y);
      });
      ctx.stroke();
      // rupture de vitesse à un point : trait pointillé vertical
      if (speed && si < segs.length - 1) {
        var a = seg[seg.length - 1], b = segs[si + 1][0];
        if (Math.abs(a.s - b.s) > 0.02) {
          ctx.save(); ctx.setLineDash([2, 3]); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(gx(a.t), gy(clampS(a.s))); ctx.lineTo(gx(b.t), gy(clampS(b.s))); ctx.stroke(); ctx.restore();
        }
      }
    });

    // poignées puis points
    var geo = handlesGeometry();
    geo.forEach(function (g) {
      if (g.kind === 'anchor') return;
      var hot = G.hover && G.hover.kind === g.kind && G.hover.k === g.k;
      ctx.strokeStyle = COLORS.handle; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(g.x, g.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(g.x, g.y, hot ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.ink; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = COLORS.cream; ctx.stroke();
    });
    geo.forEach(function (g) {
      if (g.kind !== 'anchor') return;
      var sel = state.selected === g.k, end = g.k === 0 || g.k === curve.points.length - 1;
      if (g.y2 != null) {
        ctx.strokeStyle = COLORS.cream; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x, g.y2); ctx.stroke();
      }
      var r = end ? 5 : 5.5;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = end ? COLORS.cream : COLORS.curve;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      if (sel) { ctx.lineWidth = 2; ctx.strokeStyle = COLORS.sel; ctx.strokeRect(-r - 3, -r - 3, r * 2 + 6, r * 2 + 6); }
      ctx.restore();
    });
  }

  function hitTest(px, py) {
    var geo = handlesGeometry(), best = null, bd = 11;
    // poignées d'abord : elles sont souvent sur un point
    geo.forEach(function (g) {
      var d = Math.hypot(g.x - px, g.y - py) - (g.kind === 'anchor' ? 0 : 2);
      if (d < bd) { bd = d; best = g; }
    });
    return best;
  }

  function localXY(e) { var r = G.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  function bindGraph(host) {
    var cv = G.cv, tip = $('#tip');
    cv.onmousedown = function (e) {
      if (e.button !== 0) return;
      var xy = localXY(e), hit = hitTest(xy[0], xy[1]);
      if (!hit) { if (state.selected !== -1) { state.selected = -1; drawGraph(); renderInfo(); } return; }
      e.preventDefault();
      if (hit.kind === 'anchor') state.selected = hit.k;
      else if (state.selected !== hit.k) state.selected = hit.k;
      var endAnchor = hit.kind === 'anchor' && (hit.k === 0 || hit.k === curve.points.length - 1);
      if (endAnchor) { drawGraph(); renderInfo(); return; }
      pushHistory();
      G.drag = { kind: hit.kind, k: hit.k, moved: false };
      G.freeze = true;
      drawGraph(); renderInfo();
      var move = function (ev) {
        var p = localXY(ev);
        dragTo(G.drag, p[0], p[1], ev);
        G.drag.moved = true;
        markEdited(); updateCurveName();
        drawGraph(); renderInfo(); showTip(p[0], p[1]);
      };
      var up = function () {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (G.drag && !G.drag.moved) state.history.pop();
        G.drag = null; G.freeze = false;
        saveCurve(); drawGraph();
        tip.style.display = 'none';
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };
    cv.onmousemove = function (e) {
      if (G.drag) return;
      var xy = localXY(e), hit = hitTest(xy[0], xy[1]);
      var key = hit ? hit.kind + hit.k : '';
      if (key !== (G.hover ? G.hover.kind + G.hover.k : '')) { G.hover = hit; drawGraph(); }
      cv.style.cursor = hit ? (hit.kind === 'anchor' && (hit.k === 0 || hit.k === curve.points.length - 1) ? 'default' : 'grab') : 'crosshair';
      showTip(xy[0], xy[1]);
    };
    cv.onmouseleave = function () { if (!G.drag) { tip.style.display = 'none'; if (G.hover) { G.hover = null; drawGraph(); } } };
    cv.ondblclick = function (e) {
      var xy = localXY(e), hit = hitTest(xy[0], xy[1]);
      if (hit && hit.kind === 'anchor') { deletePoint(hit.k); return; }
      if (hit) return;
      var t = ix(xy[0]);
      if (t <= 0.005 || t >= 0.995) return;
      pushHistory();
      var k = C.split(curve, t);
      if (k < 0) { state.history.pop(); return; }
      state.selected = k;
      markEdited(); updateCurveName(); saveCurve(); drawGraph(); renderInfo();
      toast('Sous-clé ajoutée à ' + timeLabel(curve.points[k].t) + ' : la courbe est inchangée.');
    };
    void host;
  }

  function deletePoint(k) {
    if (k <= 0 || k >= curve.points.length - 1) return;
    pushHistory();
    C.removePoint(curve, k);
    state.selected = -1;
    markEdited(); updateCurveName(); saveCurve(); drawGraph(); renderInfo();
  }

  function timeLabel(t) {
    if (state.refFrames > 1) return 'l\'image ' + num(t * state.refFrames, 1) + ' / ' + state.refFrames;
    return pct(t);
  }

  function showTip(px, py) {
    var tip = $('#tip');
    if (!tip) return;
    var t = C.clamp(ix(px), 0, 1);
    if (px < G.pad.l || px > G.w - G.pad.r) { tip.style.display = 'none'; return; }
    var v = C.evaluate(curve, t), s = C.speedAt(curve, t);
    var tl = state.refFrames > 1 ? 'img ' + num(t * state.refFrames, 1) : pct(t);
    tip.textContent = tl + ' · ' + (prefs.view === 'speed' ? num(s) + '×' : pct(v));
    tip.style.display = 'block';
    tip.style.left = Math.min(G.w - 60, Math.max(4, px + 10)) + 'px';
    tip.style.top = Math.max(2, py - 26) + 'px';
    void py;
  }

  /** Déplacement d'un point / d'une poignée (vue valeur ou vitesse) */
  function dragTo(d, px, py, ev) {
    var pts = curve.points, p = pts[d.k], speed = prefs.view === 'speed';
    var t = ix(px), y = iy(py);
    if (ev.altKey && (d.kind === 'in' || d.kind === 'out')) p.broken = true;
    var linked = d.k > 0 && d.k < pts.length - 1 && !p.broken;
    if (d.kind === 'anchor') {
      var prev = pts[d.k - 1], next = pts[d.k + 1];
      var nt = C.clamp(t, prev.t + 0.01, next.t - 0.01);
      if (state.refFrames > 1 && !ev.shiftKey) nt = C.clamp(Math.round(nt * state.refFrames) / state.refFrames, prev.t + 0.005, next.t - 0.005);
      p.t = nt;
      if (!speed) p.v = ev.shiftKey ? p.v : y;
      C.constrain(curve);
      return;
    }
    var segDur = d.kind === 'out' ? pts[d.k + 1].t - p.t : p.t - pts[d.k - 1].t;
    var dt, slope;
    if (d.kind === 'out') {
      dt = C.clamp(t - p.t, speed ? segDur * 0.01 : 0, segDur);
      slope = speed ? y : (Math.abs(dt) > 1e-6 ? (y - p.v) / dt : 0);
      if (ev.shiftKey) slope = 0;
      p.o = speed || ev.shiftKey ? [dt, slope * dt] : [dt, y - p.v];
      if (linked && p.i) p.i = [p.i[0], hSlope(p.o) * p.i[0]];
    } else {
      dt = C.clamp(t - p.t, -segDur, speed ? -segDur * 0.01 : 0);
      slope = speed ? y : (Math.abs(dt) > 1e-6 ? (y - p.v) / dt : 0);
      if (ev.shiftKey) slope = 0;
      p.i = speed || ev.shiftKey ? [dt, slope * dt] : [dt, y - p.v];
      if (linked && p.o) p.o = [p.o[0], hSlope(p.i) * p.o[0]];
    }
    C.constrain(curve);
  }

  // ---------- Barre d'information du point sélectionné (valeurs modifiables au clic) ----------
  function renderInfo() {
    var el = $('#ptInfo');
    if (!el) return;
    var k = state.selected, pts = curve.points;
    if (k < 0 || k >= pts.length) {
      el.innerHTML = '<span class="hint" title="Glissez les poignées · double-clic sur la courbe : sous-clé · Alt : casser la tangente · Maj : poignée à plat"><b>Double-clic</b> : sous-clé · <b>Alt</b> : casser · <b>Maj</b> : à plat</span>';
      return;
    }
    var p = pts[k], parts = [];
    var label = k === 0 ? 'Départ' : k === pts.length - 1 ? 'Arrivée' : 'Sous-clé ' + k;
    parts.push('<b class="pt-name">' + label + '</b>');
    if (k > 0 && k < pts.length - 1) {
      parts.push('<span>temps <span class="editable" data-edit="t">' + (state.refFrames > 1 ? num(p.t * state.refFrames, 1) + ' img' : pct(p.t)) + '</span></span>');
      parts.push('<span>valeur <span class="editable" data-edit="v">' + pct(p.v) + '</span></span>');
    }
    var segIn = k > 0 ? p.t - pts[k - 1].t : 0, segOut = k < pts.length - 1 ? pts[k + 1].t - p.t : 0;
    if (p.i) parts.push('<span>entrée <span class="editable" data-edit="iInf" title="Influence">' + pct(-p.i[0] / segIn) + '</span> · <span class="editable" data-edit="iSpd" title="Vitesse">' + num(hSlope(p.i)) + '×</span></span>');
    if (p.o) parts.push('<span>sortie <span class="editable" data-edit="oInf" title="Influence">' + pct(p.o[0] / segOut) + '</span> · <span class="editable" data-edit="oSpd" title="Vitesse">' + num(hSlope(p.o)) + '×</span></span>');
    if (k > 0 && k < pts.length - 1) {
      parts.push('<button class="mini-btn" id="ptLink" title="' + (p.broken ? 'Tangentes indépendantes : cliquer pour les lier' : 'Tangentes liées : cliquer pour les séparer') + '">' + icon(p.broken ? 'unlink' : 'link') + '</button>');
      parts.push('<button class="mini-btn danger" id="ptDel" title="Supprimer la sous-clé (Suppr)">' + icon('trash') + '</button>');
    }
    el.innerHTML = parts.join('');
    $$('.editable', el).forEach(function (sp) { sp.onclick = function () { editValue(sp, k); }; });
    if ($('#ptLink')) $('#ptLink').onclick = function () {
      pushHistory();
      p.broken = !p.broken;
      if (!p.broken && p.i && p.o) { var s = (hSlope(p.i) + hSlope(p.o)) / 2; p.i[1] = s * p.i[0]; p.o[1] = s * p.o[0]; }
      markEdited(); updateCurveName(); saveCurve(); drawGraph(); renderInfo();
    };
    if ($('#ptDel')) $('#ptDel').onclick = function () { deletePoint(k); };
  }

  function editValue(sp, k) {
    var what = sp.getAttribute('data-edit'), p = curve.points[k], pts = curve.points;
    var segIn = k > 0 ? p.t - pts[k - 1].t : 0, segOut = k < pts.length - 1 ? pts[k + 1].t - p.t : 0;
    var cur = what === 't' ? (state.refFrames > 1 ? p.t * state.refFrames : p.t * 100)
      : what === 'v' ? p.v * 100 : what === 'iInf' ? -p.i[0] / segIn * 100 : what === 'oInf' ? p.o[0] / segOut * 100
      : what === 'iSpd' ? hSlope(p.i) : hSlope(p.o);
    var inp = document.createElement('input');
    inp.className = 'inline-edit';
    inp.value = String(Math.round(cur * 100) / 100).replace('.', ',');
    sp.replaceWith(inp);
    inp.focus(); inp.select();
    var done = false;
    var commit = function (apply) {
      if (done) return; done = true;
      var x = parseFloat(String(inp.value).replace(',', '.'));
      if (apply && isFinite(x)) {
        pushHistory();
        if (what === 't') {
          var nt = state.refFrames > 1 ? x / state.refFrames : x / 100;
          p.t = C.clamp(nt, pts[k - 1].t + 0.002, pts[k + 1].t - 0.002);
        } else if (what === 'v') p.v = x / 100;
        else if (what === 'iInf') { var s1 = hSlope(p.i), d1 = -C.clamp(x, 0.1, 100) / 100 * segIn; p.i = [d1, s1 * d1]; }
        else if (what === 'oInf') { var s2 = hSlope(p.o), d2 = C.clamp(x, 0.1, 100) / 100 * segOut; p.o = [d2, s2 * d2]; }
        else if (what === 'iSpd') { p.i[1] = x * p.i[0]; if (!p.broken && p.o && k < pts.length - 1 && k > 0) p.o[1] = x * p.o[0]; }
        else if (what === 'oSpd') { p.o[1] = x * p.o[0]; if (!p.broken && p.i && k > 0) p.i[1] = x * p.i[0]; }
        C.constrain(curve);
        markEdited(); updateCurveName(); saveCurve(); drawGraph();
      }
      renderInfo();
    };
    inp.onkeydown = function (e) { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); e.stopPropagation(); };
    inp.onblur = function () { commit(true); };
  }

  // ==================== Rendu : onglets ====================
  var TABS = [
    { id: 'curve', label: 'Courbe', icon: 'spline' },
    { id: 'library', label: 'Bibliothèque', icon: 'library' }
  ];
  function renderTabs() {
    var shown = appearance().visibleTabs;
    if (shown.indexOf(prefs.tab) < 0) prefs.tab = shown[0];
    $('#tabs').innerHTML = TABS.filter(function (t) { return shown.indexOf(t.id) >= 0; }).map(function (t) {
      return '<button data-tab="' + t.id + '" class="' + (prefs.tab === t.id ? 'active' : '') + '">' + icon(t.icon) + '<span>' + t.label + '</span></button>';
    }).join('');
    $$('#tabs button').forEach(function (b) {
      b.onclick = function () { prefs.tab = b.getAttribute('data-tab'); savePrefs(); renderTabs(); renderView(); };
    });
  }
  function renderView() {
    if (prefs.tab === 'library') renderLibrary(); else renderCurve();
  }

  function toggle(id, on, label) {
    return '<label class="toggle ' + (on ? 'on' : '') + '" data-toggle="' + id + '"><span class="sw"></span>' + label + '</label>';
  }
  function seg(id, value, options) {
    return '<div class="seg" data-seg="' + id + '">' + options.map(function (o) {
      return '<button data-v="' + o[0] + '" class="' + (String(value) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function dropdown(id, label, value, options) {
    return '<label class="dd"><span>' + label + '</span><select id="dd-' + id + '">' + options.map(function (op) {
      return '<option value="' + op[0] + '"' + (String(value) === String(op[0]) ? ' selected' : '') + '>' + op[1] + '</option>';
    }).join('') + '</select></label>';
  }

  var PROPS = [
    { id: 'position', label: 'Position', icon: 'move' },
    { id: 'scale', label: 'Échelle', icon: 'scale' },
    { id: 'rotation', label: 'Rotation', icon: 'rotate' },
    { id: 'opacity', label: 'Opacité', icon: 'opacity' }
  ];
  var PROP_LABEL = { position: 'Position', scale: 'Échelle', scaleWidth: 'Largeur', rotation: 'Rotation', opacity: 'Opacité' };

  // ---------- Onglet Courbe ----------
  function renderCurve() {
    var v = $('#view');
    v.innerHTML =
      '<div class="scroll">' +
      '<section class="card editor">' +
        '<div class="ed-head">' +
          seg('view', prefs.view, [['value', icon('trending') + '<span>Valeur</span>'], ['speed', icon('gauge') + '<span>Vitesse</span>']]) +
          '<span class="curve-name" id="curveName"></span>' +
          '<div class="ed-tools">' +
            '<button class="tool" id="btnUndo" title="Annuler (Ctrl+Z)">' + icon('undo') + '</button>' +
            '<button class="tool" id="btnRedo" title="Rétablir (Ctrl+Maj+Z)">' + icon('redo') + '</button>' +
            '<button class="tool" id="btnReset" title="Revenir au preset chargé">' + icon('reset') + '</button>' +
            '<button class="tool" id="btnSave" title="Enregistrer comme preset">' + icon('bookmark') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="save-row" id="saveRow" hidden><input class="pill-input" id="presetName" placeholder="Nom du preset" maxlength="40"/><button class="sbtn sm" id="savePresetBtn">' + icon('check') + 'Enregistrer</button></div>' +
        '<div class="graph" id="graph"><canvas></canvas><div class="tip" id="tip"></div></div>' +
        '<div class="ed-foot"><div class="pt-info" id="ptInfo"></div>' +
          '<button class="css-out" id="cssCopy" title="Copier (cubic-bezier CSS ou JSON)">' + icon('copy') + '<code id="cssOut"></code></button>' +
        '</div>' +
      '</section>' +
      '<section class="card apply">' +
        '<div class="opt-rows">' +
          '<div class="opt-row" title="Au clic sur Appliquer : l\'animation passe sur l\'effet Transformation (flou de mouvement) et la Trajectoire est remise à zéro">' +
            toggle('autoTr', prefs.autoTr.on, icon('wind') + 'Flou de mouvement') +
            '<div class="opt-extra' + (prefs.autoTr.on ? '' : ' off') + '">' + seg('blurLevel', blurLevel(), [['low', 'Faible'], ['mid', 'Moyen'], ['high', 'Élevé']]) + '</div></div>' +
          '<div class="opt-row">' + toggle('loop', prefs.loop.on, icon('repeat') + 'Boucle jusqu\'à la fin') +
            '<div class="opt-extra' + (prefs.loop.on ? '' : ' off') + '">' + seg('loopMode', prefs.loop.mode, [['cycle', 'Cycle'], ['pingpong', 'Ping-pong']]) + '</div></div>' +
        '</div>' +
        '<div class="apply-row"><div class="sel-line" id="selLine"></div>' +
          '<button class="btn-ghost undo-apply" id="btnUndoApply">' + icon('undo') + '<span>Annuler</span></button>' +
          '<button class="btn-primary big" id="btnApply" title="Appliquer la courbe aux clips sélectionnés (Ctrl+Entrée)">' + icon('zap') + '<span>Appliquer</span></button></div>' +
      '</section>' +
      '</div>';

    updateCurveName();
    setupCanvas();
    drawGraph();
    renderInfo();
    renderSelLine();

    $$('[data-seg]', v).forEach(function (s) {
      var id = s.getAttribute('data-seg');
      $$('button', s).forEach(function (b) {
        b.onclick = function () {
          var val = b.getAttribute('data-v');
          if (id === 'view') { prefs.view = val; G.range = null; }
          else if (id === 'blurLevel') prefs.autoTr.angle = BLUR_ANGLES[val];
          else if (id === 'loopMode') prefs.loop.mode = val;
          savePrefs();
          $$('button', s).forEach(function (x) { x.classList.toggle('on', x === b); });
          if (id === 'view') drawGraph();
        };
      });
    });
    $$('[data-toggle]', v).forEach(function (l) {
      l.onclick = function (e) {
        e.preventDefault();
        var id = l.getAttribute('data-toggle');
        prefs[id].on = !prefs[id].on;
        l.classList.toggle('on', prefs[id].on);
        var extra = l.parentNode.querySelector('.opt-extra');
        if (extra) extra.classList.toggle('off', !prefs[id].on);
        savePrefs();
      };
    });

    $('#btnUndo').onclick = undo;
    $('#btnRedo').onclick = redo;
    $('#btnReset').onclick = function () {
      var b = prefs.curveId && (C.findBuiltin(prefs.curveId) || userPreset(prefs.curveId));
      if (b) loadCurve(b.curve, b.name, b.id); else loadCurve(C.findBuiltin('linear').curve, 'Linéaire', 'linear');
    };
    $('#btnSave').onclick = function () {
      var row = $('#saveRow');
      row.hidden = !row.hidden;
      if (!row.hidden) { var n = $('#presetName'); n.value = prefs.edited ? '' : prefs.curveName; n.focus(); n.select(); }
    };
    var doSave = function () {
      var name = $('#presetName').value.trim();
      if (!name) return;
      saveUserPreset(name, curve);
      $('#saveRow').hidden = true;
    };
    $('#savePresetBtn').onclick = doSave;
    $('#presetName').onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') doSave(); if (e.key === 'Escape') $('#saveRow').hidden = true; };
    $('#cssCopy').onclick = function () {
      var s = C.cssString(curve) || C.exportJSON(prefs.curveName, curve);
      copyText(s);
      toast(C.cssString(curve) ? 'cubic-bezier copié.' : 'Courbe à plusieurs segments : JSON copié.');
    };
    $('#btnApply').onclick = apply;
    $('#btnUndoApply').onclick = undoApply;
    renderUndoBtn();
  }

  // ---------- Barre de sélection ----------
  function renderSelLine() {
    var el = $('#selLine');
    if (!el) return;
    if (!inCEP) { el.innerHTML = '<span class="dot"></span>Hors de Premiere Pro'; return; }
    var s = state.sel;
    if (!s) { el.innerHTML = '<span class="dot"></span>Lecture de la sélection…'; return; }
    if (!s.seq) { el.innerHTML = '<span class="dot"></span>Aucune séquence active.'; return; }
    if (!s.clips.length) { el.innerHTML = '<span class="dot"></span>Sélectionnez des clips animés.'; return; }
    var chosen = PROPS; // toutes les propriétés animées
    var ready = 0, parts = [];
    chosen.forEach(function (p) {
      var n = s.clips.filter(function (c) { return (c.counts[p.id] || 0) >= 2; }).length;
      if (n) { ready += n; parts.push('<b>' + p.label + '</b>' + (s.clips.length > 1 ? ' ' + n : '')); }
    });
    var total = s.total || s.clips.length;
    el.innerHTML = '<span class="dot ' + (ready ? 'on' : '') + '"></span>' + total + ' clip' + (total > 1 ? 's' : '') +
      (parts.length ? ' · ' + parts.join(' · ') : ' · <span class="warn">rien d\'animé (2 clés min.)</span>');
  }

  function refreshSelection() {
    if (!inCEP || state.applying || state.reading || G.drag || document.hidden || closing) return;
    state.reading = true;
    jsx('summary').then(function (r) {
      state.reading = false;
      if (!r || !r.success) return;
      state.sel = r;
      // échelle de temps de l'éditeur : durée entre les 2 premières clés du 1er clip
      var tpf = r.seq && r.seq.ticksPerFrame, frames = 0;
      if (tpf) state.fps = TICKS / tpf;
      if (tpf && r.clips.length) {
        var sp = r.clips[0].spans || {};
        for (var i = 0; i < PROPS.length && !frames; i++) if (sp[PROPS[i].id]) frames = Math.round(sp[PROPS[i].id] / tpf);
        if (!frames) Object.keys(sp).some(function (k) { frames = Math.round(sp[k] / tpf); return frames > 0; });
      }
      if (frames !== state.refFrames) { state.refFrames = frames; drawGraph(); renderInfo(); }
      renderSelLine();
      syncClipCurve(r);
    });
  }

  /**
   * La sélection n'est relue que lorsque la souris est sur le panneau (ou qu'il a le focus) : pendant que l'on
   * travaille dans la timeline (Ctrl+Z…), Sori n'interroge pas Premiere, ce qui évite les plantages.
   */
  function panelActive() { return state.hover || document.hasFocus(); }
  function watchSelection() {
    if (!inCEP) return;
    clearInterval(state.selTimer);
    refreshSelection();
    state.selTimer = setInterval(function () { if (prefs.autoSel && panelActive()) refreshSelection(); }, 2000);
    var root = document.documentElement;
    root.addEventListener('mouseenter', function () { state.hover = true; refreshSelection(); });
    root.addEventListener('mouseleave', function () { state.hover = false; });
    window.addEventListener('focus', function () { refreshSelection(); });
  }

  // ==================== Courbe du clip sélectionné ====================
  /**
   * Un clip déjà traité par Sori : sa courbe revient dans l'éditeur dès qu'il est sélectionné. On la retouche,
   * « Appliquer » recalcule les images clés à partir des clés d'origine (mémorisées).
   */
  function syncClipCurve(r) {
    var c = r.clips && r.clips[0], id = c ? c.id : '';
    if (id === state.clipId) return;
    state.clipId = id;
    if (!id || !prefs.memo) return;
    var memo = loadMemo(), best = null;
    Object.keys(memo).forEach(function (k) {
      var m = memo[k];
      if (k.indexOf(id + '|') === 0 && m.curve && (!best || m.at > best.at)) best = m;
    });
    if (!best) return;
    try { if (!C.validCurve(best.curve)) return; } catch (e) { return; }
    if (JSON.stringify(best.curve) === JSON.stringify(C.serialize(curve))) return;
    loadCurve(C.fromPoints(best.curve.points), best.curveName || 'Courbe du clip', best.curveId || '');
    toast('Courbe de « ' + c.name + ' » rechargée : modifiez-la puis Appliquer.');
  }

  // ==================== Injection ====================
  function loadMemo() { try { return JSON.parse(localStorage.getItem(MEMO_KEY) || '{}'); } catch (e) { return {}; } }
  function saveMemo(m) {
    var keys = Object.keys(m);
    if (keys.length > 1500) {
      keys.sort(function (a, b) { return (m[a].at || 0) - (m[b].at || 0); });
      keys.slice(0, keys.length - 1500).forEach(function (k) { delete m[k]; });
    }
    try { localStorage.setItem(MEMO_KEY, JSON.stringify(m)); } catch (e) {}
  }

  function lerp(a, b, u) {
    if (typeof a === 'number') return a + (b - a) * u;
    return a.map(function (x, i) { return x + (b[i] - x) * u; });
  }
  function near(a, b, tpf) { return Math.abs(a - b) <= Math.max(2, tpf * 0.02); }

  /**
   * Clés d'origine d'une propriété. Après un premier « Appliquer », Premiere ne contient plus que des clés
   * cuites : Sori se souvient des clés d'origine (et du décalage appliqué) pour pouvoir changer de courbe.
   */
  function sourceAnchors(clip, prop, memo, tpf) {
    var native = clip.props[prop], tr = TR_PROPS[prop] && clip.transform ? clip.transform[prop] : null;
    var m = prefs.memo ? memo[clip.id + '|' + prop] : null;
    if (m) {
      var cur = m.comp === 'transform' ? tr : native;
      var ks = cur && cur.keys;
      if (ks && ks.length >= 2 && near(ks[0].t, m.first, tpf) && near(ks[ks.length - 1].t, m.last, tpf)) {
        var anchors = m.anchors.map(function (a) {
          // valeurs relues dans Premiere : une clé d'origine retouchée à la main est prise en compte
          for (var i = 0; i < ks.length; i++) if (near(ks[i].t, a.t + m.offset, tpf)) return { t: a.t, v: ks[i].v };
          return { t: a.t, v: a.v };
        });
        return { anchors: anchors, memo: m, comp: m.comp };
      }
    }
    var copy = function (keys) { return keys.map(function (k) { return { t: k.t, v: k.v }; }); };
    if (native && native.keys.length >= 2) return { anchors: copy(native.keys), memo: null, comp: 'native' };
    // clés déjà sur l'effet Transformation (transfert automatique, ou posées à la main)
    if (tr && tr.keys.length >= 2) return { anchors: copy(tr.keys), memo: null, comp: 'transform' };
    return null;
  }

  var TR_PROPS = { position: true, scale: true, rotation: true };

  /** Valeurs neutres de la Trajectoire (clip centré, 100 %, sans rotation) */
  var MOTION_DEFAULT = { position: [0.5, 0.5], scale: 100, rotation: 0 };

  /**
   * Trajectoire -> effet Transformation : les clés de Position / Échelle / Rotation sont recopiées dans
   * Transformation avec leurs valeurs absolues, les valeurs fixes aussi, puis la Trajectoire est remise à zéro
   * (centrée, 100 %, 0°). Position : même point à l'écran, exprimé dans l'image source (clip 4K, etc.).
   * Modifie clip en mémoire (comme s'il était relu après le transfert). Renvoie { statics, trKeys, props, blocked }.
   */
  function transferClip(clip, seq, memo, tpf) {
    var out = { statics: [], trKeys: {}, props: [], blocked: [] };
    var trHas = function (p) { return clip.transform && clip.transform[p] && clip.transform[p].keys.length >= 1; };
    var moving = Object.keys(TR_PROPS).filter(function (p) {
      var n = clip.props[p] && clip.props[p].keys.length >= 2;
      if (n && trHas(p)) { out.blocked.push(p); return false; }
      return n;
    });
    if (!moving.length) return out;
    var frame = clip.frame || [seq.width, seq.height];
    var conv = function (p, v) {
      if (p !== 'position') return v;
      // Trajectoire neutre : le centre de l'image source se place au centre de la séquence (échelle 100 %)
      return [0.5 + (v[0] - 0.5) * seq.width / frame[0], 0.5 + (v[1] - 0.5) * seq.height / frame[1]];
    };
    Object.keys(TR_PROPS).forEach(function (p) {
      var pr = clip.props[p];
      if (!pr || out.blocked.indexOf(p) >= 0) return;
      if (moving.indexOf(p) >= 0) {
        var keys = pr.keys, tkeys = keys.map(function (k) { return { t: k.t, v: conv(p, k.v) }; });
        out.trKeys[p] = { target: 'transform', prop: p, keys: tkeys.map(function (k) { return [k.t, k.v]; }) };
        out.props.push(p);
        // clés d'origine mémorisées : converties elles aussi, pour pouvoir changer de courbe ensuite
        var id = clip.id + '|' + p, m = memo[id];
        if (m && m.comp === 'native' && near(keys[0].t, m.first, tpf) && near(keys[keys.length - 1].t, m.last, tpf)) {
          m.comp = 'transform';
          m.anchors = m.anchors.map(function (a) { return { t: a.t, v: conv(p, a.v) }; });
        } else delete memo[id];
        clip.transform = clip.transform || {};
        clip.transform[p] = { keys: tkeys, value: null };
      } else if (!trHas(p) && pr.keys.length < 2 && pr.value != null) {
        // propriété non animée : sa valeur passe aussi sur Transformation (ex. clip 4K réduit à 50 %)
        var v = pr.keys.length ? pr.keys[0].v : pr.value;
        out.statics.push({ target: 'transform', prop: p, staticValue: conv(p, v) });
      } else return;
      out.statics.push({ target: 'motion', prop: p, staticValue: MOTION_DEFAULT[p] });
      clip.props[p] = { keys: [], value: MOTION_DEFAULT[p] };
    });
    return out;
  }

  function valueAt(anchors, t) {
    var n = anchors.length;
    if (t <= anchors[0].t) return anchors[0].v;
    if (t >= anchors[n - 1].t) return anchors[n - 1].v;
    for (var k = 0; k < n - 1; k++) {
      var a = anchors[k], b = anchors[k + 1];
      if (t <= b.t) return lerp(a.v, b.v, C.evaluate(curve, (t - a.t) / (b.t - a.t)));
    }
    return anchors[n - 1].v;
  }

  /** Écart toléré par densité (part de l'amplitude) ; chaque image = aucune simplification */
  var DENSITY_TOL = { light: 0.012, adaptive: 0.003, frame: 0 };

  /** Clés cuites (temps en ticks, valeur) entre les clés d'origine, avec boucle éventuelle jusqu'à loopEnd */
  function bake(anchors, tpf, density, loop) {
    var times = [], values = [], forced = {}, k, j;
    for (k = 0; k < anchors.length - 1; k++) {
      var a = anchors[k], b = anchors[k + 1], n = Math.max(1, Math.round((b.t - a.t) / tpf));
      for (j = 0; j < n; j++) {
        if (!j) forced[times.length] = true;
        times.push(a.t + (b.t - a.t) * j / n);
        values.push(lerp(a.v, b.v, C.evaluate(curve, j / n)));
      }
    }
    var tA = anchors[0].t, tN = anchors[anchors.length - 1].t;
    forced[times.length] = true;
    times.push(tN); values.push(anchors[anchors.length - 1].v);
    if (loop && loop.end > tN + tpf / 2 && tN - tA >= tpf) {
      var D = tN - tA, prevCycle = 0, count = Math.floor((loop.end - tN) / tpf);
      for (var f = 1; f <= count; f++) {
        var t = tN + f * tpf, r = t - tA, cyc = Math.floor(r / D + 1e-9), rr = r - cyc * D;
        if (loop.mode === 'pingpong' && cyc % 2 === 1) rr = D - rr;
        if (cyc !== prevCycle) { forced[times.length - 1] = true; forced[times.length] = true; prevCycle = cyc; }
        times.push(t); values.push(valueAt(anchors, tA + rr));
      }
    }
    var keep, tol = DENSITY_TOL[density];
    if (tol) {
      var range = 0;
      for (k = 0; k < anchors.length - 1; k++) {
        var va = anchors[k].v, vb = anchors[k + 1].v;
        range = Math.max(range, typeof va === 'number' ? Math.abs(vb - va) : Math.max(Math.abs(vb[0] - va[0]), Math.abs(vb[1] - va[1])));
      }
      // seulement les clés nécessaires pour rester à moins de tol × l'amplitude de la courbe
      keep = C.simplify(times, values, Math.max(range * tol, 1e-6), forced);
    } else {
      keep = times.map(function (_, i) { return i; });
    }
    return keep.map(function (i) { return [Math.round(times[i]), values[i]]; });
  }

  // ---------- Annuler une application (sans le Ctrl+Z de Premiere, qui peut le faire planter) ----------
  function pushApplyUndo(entry) {
    state.applyUndo.push(entry);
    if (state.applyUndo.length > 10) state.applyUndo.shift();
    state.lastAction = 'apply';
    renderUndoBtn();
  }
  function renderUndoBtn() {
    var b = $('#btnUndoApply');
    if (!b) return;
    var last = state.applyUndo[state.applyUndo.length - 1];
    b.disabled = !last || state.applying;
    b.title = last ? 'Annuler « ' + last.name + ' » : remet les clips comme avant l\'application (Ctrl+Z dans Sori)' : 'Rien à annuler';
  }
  /** Opérations qui remettent un clip dans l'état lu avant l'application */
  function restoreOps(c) {
    var ops = [];
    var put = function (target, prop, info) {
      if (!info) return;
      if (info.keys && info.keys.length) ops.push({ target: target, prop: prop, keys: info.keys.map(function (k) { return [k.t, k.v]; }) });
      else if (info.value != null) ops.push({ target: target, prop: prop, staticValue: info.value });
    };
    ['position', 'scale', 'scaleWidth', 'rotation'].forEach(function (p) { put('motion', p, c.props[p]); });
    put('opacity', 'opacity', c.props.opacity);
    if (c.transform) ['position', 'scale', 'rotation'].forEach(function (p) { put('transform', p, c.transform[p]); });
    else {
      // effet ajouté par Sori : remis au neutre (aucun changement à l'image, sans flou) ; il peut être supprimé à la main
      ['position', 'scale', 'rotation'].forEach(function (p) { ops.push({ target: 'transform', prop: p, reset: true }); });
      ops.push({ target: 'transform', prop: 'shutter', staticValue: 0, optional: true });
    }
    return ops;
  }
  function undoApply() {
    var last = state.applyUndo[state.applyUndo.length - 1];
    if (!last || state.applying) return;
    if (!inCEP) return;
    state.applying = true;
    renderUndoBtn();
    toast('Annulation de « ' + last.name + ' »…', 'busy', true);
    var plan = { noSetup: true, clips: last.clips.map(function (c) { return { id: c.id, ops: restoreOps(c) }; }) };
    jsx('applyPlan', [JSON.stringify(plan)]).then(function (res) {
      if (!res.success) throw new Error(res.error);
      state.applyUndo.pop();
      try { localStorage.setItem(MEMO_KEY, last.memo); } catch (e) {}
      if (!state.applyUndo.length) state.lastAction = 'edit';
      var errs = res.errors && res.errors.length ? ' Erreurs : ' + res.errors.slice(0, 2).join(' ; ') : '';
      toast('« ' + last.name + ' » annulée : ' + res.clips + ' clip' + (res.clips > 1 ? 's' : '') + ' remis comme avant.' + errs, errs ? 'err' : 'ok');
    }).catch(function (e) { toast(e.message || String(e), 'err'); }).then(function () {
      state.applying = false;
      renderUndoBtn();
      refreshSelection();
    });
  }

  function apply() {
    if (state.applying) return;
    if (!inCEP) { toast('Disponible uniquement dans Premiere Pro.', 'err'); return; }
    state.applying = true;
    var btn = $('#btnApply');
    if (btn) btn.disabled = true;
    toast('Lecture des images clés…', 'busy', true);
    jsx('readSelection').then(function (r) {
      if (!r.success) throw new Error(r.error);
      if (!r.clips.length) throw new Error('Sélectionnez un ou plusieurs clips vidéo animés dans la timeline.');
      var seq = r.seq, tpf = seq.ticksPerFrame, memo = loadMemo(), now = Date.now();
      // état d'avant, pour « Annuler » (copie : transferClip modifie les clips en mémoire)
      var before = JSON.parse(JSON.stringify(r.clips)), memoBefore = JSON.stringify(memo);
      var plan = { shutter: prefs.autoTr.angle, clips: [] }, skipped = [], props = 0, keysTotal = 0;
      // toutes les propriétés animées (au moins 2 clés) des clips sélectionnés
      var chosen = PROPS.map(function (p) { return p.id; });
      r.clips.forEach(function (clip) {
        var offset = 0;
        var ops = [], done = {};
        var loop = prefs.loop.on ? { mode: prefs.loop.mode, end: clip.outPoint - tpf } : null;
        var list = chosen.slice();
        if (list.indexOf('scale') >= 0 && !clip.uniform && clip.props.scaleWidth && clip.props.scaleWidth.keys.length >= 2) list.push('scaleWidth');
        // Trajectoire -> Transformation d'abord (flou de mouvement), puis la courbe sur les clés recopiées
        var moved = prefs.autoTr.on ? transferClip(clip, seq, memo, tpf) : null;
        if (moved) ops = ops.concat(moved.statics);
        list.forEach(function (prop) {
          var src = sourceAnchors(clip, prop, memo, tpf);
          if (!src) {
            // sans clé : propriété simplement non animée ; une seule clé : sûrement un oubli, on le signale
            if (clip.props[prop] && clip.props[prop].keys.length === 1) skipped.push(clip.name + ' · ' + PROP_LABEL[prop]);
            return;
          }
          var anchors = src.anchors;
          var shifted = anchors.map(function (a) { return { t: a.t + offset, v: a.v }; });
          var keys = bake(shifted, tpf, prefs.density, loop);
          ops.push({ target: src.comp === 'transform' ? 'transform' : prop === 'opacity' ? 'opacity' : 'motion', prop: prop, keys: keys });
          done[prop] = true;
          props++; keysTotal += keys.length;
          // toutes les clés d'origine (même en mode 1re → dernière), aux temps d'avant décalage
          memo[clip.id + '|' + prop] = {
            anchors: src.anchors, offset: offset, comp: src.comp,
            first: keys[0][0], last: keys[keys.length - 1][0], at: now,
            // courbe appliquée : rechargée dans l'éditeur quand le clip est resélectionné
            curve: C.serialize(curve), curveName: prefs.curveName, curveId: prefs.curveId
          };
        });
        // propriétés transférées sans courbe appliquée (ex. clés « 1re → dernière » manquantes) : recopiées telles quelles
        if (moved) moved.props.forEach(function (p) { if (!done[p]) ops.push(moved.trKeys[p]); });
        if (ops.length) plan.clips.push({ id: clip.id, ops: ops });
      });
      if (!plan.clips.length) {
        throw new Error('Aucune propriété animée sur les clips sélectionnés : posez au moins 2 images clés (Position, Échelle, Rotation ou Opacité).');
      }
      toast('Injection de ' + keysTotal + ' images clés…', 'busy', true);
      return jsx('applyPlan', [JSON.stringify(plan)]).then(function (res) {
        if (!res.success) throw new Error(res.error);
        saveMemo(memo);
        if (res.trDiag) { try { localStorage.setItem('sori.trdiag', JSON.stringify(res.trDiag)); } catch (e) {} }
        var ids = plan.clips.map(function (c) { return c.id; });
        pushApplyUndo({ name: prefs.curveName || 'Courbe', memo: memoBefore, clips: before.filter(function (c) { return ids.indexOf(c.id) >= 0; }) });
        var msg = '« ' + (prefs.curveName || 'Courbe') + ' » appliquée : ' + res.clips + ' clip' + (res.clips > 1 ? 's' : '') + ', ' + props + ' propriété' + (props > 1 ? 's' : '') + ', ' + res.keys + ' clés.';
        if (res.errors && res.errors.length) toast(msg + ' Erreurs : ' + res.errors.slice(0, 3).join(' ; '), 'err');
        else if (skipped.length) toast(msg + ' Ignorés (une seule image clé) : ' + skipped.slice(0, 3).join(', ') + (skipped.length > 3 ? '…' : ''));
        else toast(msg);
      });
    }).catch(function (e) {
      toast(e.message || String(e), 'err');
    }).then(function () {
      state.applying = false;
      if ($('#btnApply')) $('#btnApply').disabled = false;
      renderUndoBtn();
      refreshSelection();
    });
  }

  // ==================== Bibliothèque ====================
  function userPreset(id) { return prefs.presets.filter(function (p) { return p.id === id; })[0] || null; }
  function saveUserPreset(name, c) {
    var existing = prefs.presets.filter(function (p) { return p.name === name; })[0];
    var p = { id: existing ? existing.id : 'u-' + Date.now(), name: name.slice(0, 40), curve: C.serialize(c) };
    prefs.presets = prefs.presets.filter(function (x) { return x.name !== name; }).concat([p]);
    prefs.curveName = p.name; prefs.curveId = p.id; prefs.edited = false;
    savePrefs(); updateCurveName();
    toast('Preset « ' + p.name + ' » enregistré dans la bibliothèque.');
  }

  var libUi = { showImport: false, importError: '', exportCode: '' };
  function renderLibrary() {
    var v = $('#view');
    var groups = [];
    if (prefs.presets.length) groups.push({ group: 'Mes presets', user: true, items: prefs.presets });
    groups = groups.concat(C.builtins());
    v.innerHTML =
      '<div class="scroll">' +
      '<div class="lib-bar">' +
        '<button class="sbtn" id="libImport">' + icon('download') + 'Coller / importer</button>' +
        '<button class="sbtn" id="libImportFile">' + icon('file') + 'Fichier…</button>' +
        '<button class="sbtn" id="libExport"' + (prefs.presets.length ? '' : ' disabled') + '>' + icon('upload') + 'Exporter mes presets</button>' +
        '<input type="file" id="libFile" accept=".json,.txt,application/json" hidden/>' +
      '</div>' +
      (libUi.showImport ?
        '<div class="card inner import-box"><textarea class="code" rows="3" id="importCode" placeholder="cubic-bezier(0.4, 0, 0.2, 1) · 0.4, 0, 0.2, 1 · JSON exporté par Sori ou un profil {&quot;name&quot;, &quot;bezier&quot;: […]}"></textarea>' +
        (libUi.importError ? '<div class="err">' + esc(libUi.importError) + '</div>' : '') +
        '<div class="srow end"><button class="sbtn sm" id="importCancel">Annuler</button><button class="sbtn sm" id="importApply">' + icon('check') + 'Importer</button></div></div>' : '') +
      (libUi.exportCode ? '<div class="card inner import-box"><div class="hint">Copié dans le presse-papiers : à coller dans Sori sur un autre poste, ou à transmettre à un motion designer (les courbes à 1 segment contiennent aussi leur cubic-bezier).</div><textarea class="code" readonly rows="3" id="exportCode">' + esc(libUi.exportCode) + '</textarea></div>' : '') +
      groups.map(function (g) {
        return '<div class="lib-group"><h4 class="section-title">' + esc(g.group) + '</h4><div class="preset-grid">' +
          g.items.map(function (p) {
            var cur = prefs.curveId === p.id;
            return '<div class="pcard' + (cur ? ' on' : '') + '" data-pid="' + esc(p.id) + '" title="Cliquer pour charger dans l\'éditeur">' +
              '<canvas class="pmini"></canvas><div class="pname">' + esc(p.name) + '</div>' +
              '<div class="pacts">' +
                '<button class="pact" data-quick="' + esc(p.id) + '" title="Charger et appliquer sur la sélection">' + icon('zap') + '</button>' +
                '<button class="pact" data-copy="' + esc(p.id) + '" title="Copier (cubic-bezier / JSON)">' + icon('copy') + '</button>' +
                (g.user ? '<button class="pact danger" data-del="' + esc(p.id) + '" title="Supprimer">' + icon('trash') + '</button>' : '') +
              '</div></div>';
          }).join('') + '</div></div>';
      }).join('') +
      '</div>';

    var find = function (id) {
      var u = userPreset(id);
      if (u) return { id: u.id, name: u.name, curve: C.fromPoints(u.curve.points) };
      return C.findBuiltin(id);
    };
    refreshColors();
    $$('.pcard', v).forEach(function (card) {
      var p = find(card.getAttribute('data-pid'));
      if (p) drawMini(card.querySelector('canvas'), p.curve);
      card.onclick = function (e) {
        if (e.target.closest('.pact')) return;
        loadCurve(p.curve, p.name, p.id);
        $$('.pcard', v).forEach(function (c) { c.classList.toggle('on', c === card); });
        toast('« ' + p.name + ' » chargé dans l\'éditeur.');
      };
    });
    $$('[data-quick]', v).forEach(function (b) {
      b.onclick = function () { var p = find(b.getAttribute('data-quick')); loadCurve(p.curve, p.name, p.id); renderLibrary(); apply(); };
    });
    $$('[data-copy]', v).forEach(function (b) {
      b.onclick = function () { var p = find(b.getAttribute('data-copy')); copyText(C.cssString(p.curve) || C.exportJSON(p.name, p.curve)); toast('« ' + p.name + ' » copié.'); };
    });
    $$('[data-del]', v).forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-del');
        prefs.presets = prefs.presets.filter(function (p) { return p.id !== id; });
        if (prefs.curveId === id) prefs.curveId = '';
        savePrefs(); renderLibrary();
      };
    });
    $('#libImport').onclick = function () { libUi.showImport = !libUi.showImport; libUi.importError = ''; libUi.exportCode = ''; renderLibrary(); if ($('#importCode')) $('#importCode').focus(); };
    if ($('#importCancel')) $('#importCancel').onclick = function () { libUi.showImport = false; renderLibrary(); };
    if ($('#importApply')) $('#importApply').onclick = function () { importText($('#importCode').value); };
    if ($('#importCode')) $('#importCode').onkeydown = function (e) { e.stopPropagation(); };
    $('#libImportFile').onclick = function () { $('#libFile').click(); };
    $('#libFile').onchange = function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { libUi.showImport = true; importText(String(rd.result)); };
      rd.readAsText(f);
      this.value = '';
    };
    $('#libExport').onclick = exportPresets;
  }

  function importText(text) {
    try {
      var list = C.parseAny(text);
      list.forEach(function (it) {
        var p = { id: 'u-' + Date.now() + '-' + Math.floor(Math.random() * 1e4), name: it.name, curve: C.serialize(it.curve) };
        prefs.presets = prefs.presets.filter(function (x) { return x.name !== it.name; }).concat([p]);
      });
      var last = list[list.length - 1];
      libUi.showImport = false; libUi.importError = '';
      savePrefs();
      loadCurve(last.curve, last.name, prefs.presets[prefs.presets.length - 1].id);
      renderLibrary();
      toast(list.length > 1 ? list.length + ' presets importés.' : 'Preset « ' + last.name + ' » importé et chargé.');
    } catch (e) {
      libUi.importError = e.message; libUi.showImport = true; renderLibrary();
      var ta = $('#importCode'); if (ta) ta.value = text;
    }
  }

  function exportPresets() {
    var data = {
      soriPresets: 1, app: 'Sori ' + APP_VERSION,
      presets: prefs.presets.map(function (p) {
        var c = C.fromPoints(p.curve.points), q = C.toCubic(c);
        var o = { name: p.name };
        if (q) o.cubicBezier = q.map(function (x) { return Math.round(x * 10000) / 10000; });
        o.points = p.curve.points;
        return o;
      })
    };
    var text = JSON.stringify(data, null, 1);
    copyText(text);
    libUi.exportCode = text; libUi.showImport = false;
    // fichier .json si la boîte d'enregistrement de CEP est disponible
    var fs = nodeReq('fs');
    try {
      if (fs && window.cep && window.cep.fs && window.cep.fs.showSaveDialogEx) {
        var res = window.cep.fs.showSaveDialogEx('Exporter les presets Sori', '', ['json'], 'Sori-presets.json');
        if (res && res.data) {
          var out = /\.json$/i.test(res.data) ? res.data : res.data + '.json';
          fs.writeFileSync(out, text, 'utf8');
          toast('Presets exportés : ' + out);
          renderLibrary();
          return;
        }
      }
    } catch (e) {}
    renderLibrary();
    var ec = $('#exportCode'); if (ec) ec.select();
    toast('Presets copiés dans le presse-papiers.');
  }

  function drawMini(cv, c) {
    var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    var w = Math.max(40, r.width), h = Math.max(30, r.height);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var lo = 0, hi = 1;
    var segs = C.samples(c, 32);
    segs.forEach(function (sg) { sg.forEach(function (s) { lo = Math.min(lo, s.v); hi = Math.max(hi, s.v); }); });
    var pad = 6, mg = (hi - lo) * 0.08;
    lo -= mg; hi += mg;
    var X = function (t) { return pad + t * (w - pad * 2); }, Y = function (v) { return pad + (hi - v) / (hi - lo) * (h - pad * 2); };
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    [0, 1].forEach(function (v) { ctx.beginPath(); ctx.moveTo(X(0), Math.round(Y(v)) + 0.5); ctx.lineTo(X(1), Math.round(Y(v)) + 0.5); ctx.stroke(); });
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.curve; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    segs.forEach(function (sg, si) { sg.forEach(function (s, j) { if (!si && !j) ctx.moveTo(X(s.t), Y(s.v)); else ctx.lineTo(X(s.t), Y(s.v)); }); });
    ctx.stroke();
  }

  // ==================== Apparence (partagée avec Mori et Ongaku) ====================
  var BUILTIN_PRESETS = [
    { id: 'defaut', name: 'Défaut', background: '#0c1322', accent: '#8ea8f7', primary: '#fbe6a6', brandColor: '#a9bfff', builtIn: true }
  ];
  var DEFAULT_APPEARANCE = {
    theme: { background: '#0c1322', accent: '#8ea8f7', primary: '#fbe6a6' },
    brandLabel: 'Studio', brandColor: '#a9bfff', visibleTabs: ['curve', 'library'], userPresets: []
  };
  function appearance() {
    if (!prefs.appearance) {
      prefs.appearance = JSON.parse(JSON.stringify(DEFAULT_APPEARANCE));
      // premier lancement : on reprend l'apparence déjà réglée dans Mori / Ongaku
      var shared = Suite && Suite.read();
      if (shared) Object.assign(prefs.appearance, shared);
    }
    var a = prefs.appearance;
    a.theme = Object.assign({}, DEFAULT_APPEARANCE.theme, a.theme || {});
    if (!Array.isArray(a.userPresets)) a.userPresets = [];
    if (!Array.isArray(a.visibleTabs) || !a.visibleTabs.length) a.visibleTabs = DEFAULT_APPEARANCE.visibleTabs.slice();
    return a;
  }
  /** Relit l'apparence partagée au démarrage (elle a pu changer dans Mori ou Ongaku) */
  function syncSharedAppearance() {
    // sans fichier partagé, on n'écrit rien : Mori ou Ongaku le créent avec leurs réglages actuels
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

  /** Même calcul que Mori et Ongaku : nuances zinc / accent / cream / ink posées en variables CSS */
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
  var projectName = '', projectTimer = null, closing = false;
  function renderStatus() {
    var a = appearance(), el = $('#status');
    if (!el) return;
    el.innerHTML =
      '<span class="dot' + (inCEP ? ' on' : '') + '" title="' + (inCEP ? 'Connecté à Premiere Pro' : 'Hors de Premiere Pro') + '"></span>' +
      '<button class="app" id="btnAbout" title="À propos de Sori">Sori</button>' +
      (a.brandLabel ? '<span style="color:' + esc(a.brandColor) + '">' + esc(a.brandLabel) + '</span>' : '') +
      (inCEP && projectName ? '<span>·</span><span class="proj" title="' + esc(projectName) + '">' + esc(projectName) + '</span>' : '') +
      '<span>·</span><span>' + (inCEP ? 'Connecté à Premiere Pro' : 'Hors de Premiere Pro') + '</span>';
    $('#btnAbout').onclick = function (e) { e.stopPropagation(); toggleAbout(); };
  }
  function toggleAbout(force) {
    var el = $('#about');
    var open = force !== undefined ? force : !el.classList.contains('open');
    if (!open) { el.classList.remove('open'); return; }
    el.innerHTML =
      '<div class="about-logo"><span class="logo-glyph"></span></div>' +
      '<div class="about-name">Sori <span>' + APP_VERSION + '</span></div>' +
      '<div class="about-line">Par <b>Paul-Eliot</b></div>' +
      '<div class="about-line">Libre et Open Source</div>' +
      '<div class="about-line muted">Claude Code</div>' +
      '<div class="about-copy">© ' + new Date().getFullYear() + ' Paul-Eliot</div>';
    el.classList.add('open');
  }
  function watchProject() {
    if (!inCEP) return;
    var refresh = function () {
      if (closing) return;
      cs.evalScript('app.project ? app.project.name : ""', function (r) {
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
    refreshColors();
    drawGraph();
    if (prefs.tab === 'library') $$('.pcard canvas').length && renderLibrary();
  }

  function exportPresetCode(p) {
    return JSON.stringify({ moriTheme: 1, name: p.name, background: p.background, accent: p.accent, primary: p.primary, brandColor: p.brandColor });
  }
  function parsePresetCode(code) {
    var data;
    try { data = JSON.parse(String(code).trim()); } catch (e) { throw new Error('code illisible : collez le texte obtenu avec « Exporter »'); }
    var background = normalizeHex(data.background), accent = normalizeHex(data.accent), primary = normalizeHex(data.primary);
    var brandColor = normalizeHex(data.brandColor || data.accent);
    if (!background || !accent || !primary || !brandColor) throw new Error('couleurs manquantes ou invalides dans le code');
    return { id: 'preset-' + Date.now(), name: String(data.name || 'Preset importé').slice(0, 40), background: background, accent: accent, primary: primary, brandColor: brandColor };
  }

  // ==================== Réglages (fenêtre centrée, onglets comme Mori) ====================
  var setTab = 'inject', setUi = { exportCode: '', showImport: false, importError: '', presetName: '' };
  function openSettings() { renderSettings(); $('#settings').classList.add('open'); }
  function closeSettings() { $('#settings').classList.remove('open'); setUi.exportCode = ''; setUi.showImport = false; setUi.importError = ''; }

  function hexField(key, label, value) {
    return '<div class="hexf"><input type="color" data-color="' + key + '" value="' + value + '" title="Choisir : ' + label + '"/>' +
      '<span>' + label + '</span><input type="text" class="hex" data-hex="' + key + '" value="' + value + '" spellcheck="false"/></div>';
  }
  function setToggle(id, on, label, hint) {
    return '<label class="toggle ' + (on ? 'on' : '') + '" data-set="' + id + '"><span class="sw"></span>' + label + '</label>' + (hint ? '<div class="hint">' + hint + '</div>' : '');
  }

  /** Paramètres de l'effet Transformation vus par le script lors du dernier « Appliquer » */
  function diagBlock() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem('sori.trdiag') || 'null'); } catch (e) {}
    if (!d) return '';
    return '<div class="sgroup"><h3>' + icon('activity') + 'Diagnostic Transformation</h3><div class="sbox">' +
      '<div class="hint">' + esc(d.comp) + ' — échelle écrite sur n° <b>' + d.scale + '</b>, largeur sur n° <b>' + d.width + '</b></div>' +
      '<div class="hint">' + d.names.map(function (n, i) {
        var mark = i === d.scale ? ' ← échelle' : i === d.width ? ' ← largeur' : i === d.position ? ' ← position' : i === d.rotation ? ' ← rotation' : i === d.shutter ? ' ← obturation' : '';
        return i + ' : ' + (n ? esc(n) : '<i>(sans nom)</i>') + (mark ? ' <b>' + mark + '</b>' : '');
      }).join('<br/>') + '</div></div></div>';
  }

  function renderSettings() {
    var s = $('#settings'), a = appearance();
    var tabs = [['inject', 'Injection', 'zap'], ['appearance', 'Apparence', 'sliders']];
    var body = '';
    if (setTab === 'inject') {
      var memoCount = Object.keys(loadMemo()).length;
      body =
        '<div class="sgroup"><h3>' + icon('zap') + 'Images clés</h3><div class="sbox">' +
        '<div class="hint">Premiere ne laisse pas un script régler l\'influence et la vitesse des poignées de Bézier (seulement le type de clé) : ' +
        'Sori ajoute donc quelques clés intermédiaires qui suivent la courbe. <b>Légère</b> = le minimum (écart ≤ 1,2 %), ' +
        '<b>Précise</b> = écart ≤ 0,3 %, <b>Chaque image</b> = fidélité totale. Les valeurs des clés d\'origine ne sont jamais modifiées.</div>' +
        '<div class="opt"><span class="opt-l">Densité des clés</span>' + seg('density', prefs.density, Object.keys(DENSITY_LABELS).map(function (k) { return [k, DENSITY_LABELS[k]]; })) + '</div>' +
        setToggle('memo', prefs.memo, 'Se souvenir des clés d\'origine', 'Permet de réappliquer une autre courbe sur un clip déjà traité : Sori retrouve les clés d\'origine au lieu de traiter chaque clé cuite comme une paire. ' + memoCount + ' propriété' + (memoCount > 1 ? 's' : '') + ' mémorisée' + (memoCount > 1 ? 's' : '') + '.') +
        '<div class="srow"><button class="sbtn sm danger" id="clearMemo"' + (memoCount ? '' : ' disabled') + '>' + icon('trash') + 'Oublier les clés mémorisées</button></div>' +
        '</div></div>' +
        '<div class="sgroup"><h3>' + icon('wind') + 'Flou de mouvement</h3><div class="sbox"><div class="hint">Option activée : posez vos images clés de Position, Échelle ou Rotation ' +
        'sur la <b>Trajectoire</b> comme d\'habitude. Au clic sur <b>Appliquer</b>, Sori ajoute l\'effet <b>Transformation</b>, y recopie les clés avec leurs valeurs, ' +
        'règle l\'angle d\'obturation (<b>Faible</b> 90°, <b>Moyen</b> 180°, <b>Élevé</b> 360°), remet la Trajectoire à zéro et applique la courbe. ' +
        'Les fois suivantes, « Appliquer » travaille directement sur les clés de Transformation.</div></div></div>' +
        diagBlock() +
        '<div class="sgroup"><h3>' + icon('spline') + 'Éditeur</h3><div class="sbox">' +
        setToggle('autoSel', prefs.autoSel, 'Suivre la sélection de la timeline', 'La grille de l\'éditeur passe en images (durée entre la première et la dernière clé du premier clip sélectionné).') +
        '</div></div>';
    } else {
      var isCur = function (p) { return p.background === a.theme.background && p.accent === a.theme.accent && p.primary === a.theme.primary; };
      body =
        '<div class="shared-note">' + icon('link') + '<span>Apparence <b>partagée avec Mori et Ongaku</b> : thème, nom affiché et presets se mettent à jour dans les trois panneaux.' +
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
        (setUi.exportCode ? '<div class="hint">Code copié dans le presse-papiers, à partager tel quel (compatible Mori et Ongaku) :</div><textarea class="code" readonly rows="2" id="exportThemeCode">' + esc(setUi.exportCode) + '</textarea>' : '') +
        (setUi.showImport ? '<textarea class="code" rows="2" id="importThemeCode" placeholder=\'Collez un code de preset : {"moriTheme":1,"name":…}\'></textarea>' +
          (setUi.importError ? '<div class="err">' + esc(setUi.importError) + '</div>' : '') +
          '<div class="srow end"><button class="sbtn sm" id="applyThemeImport">' + icon('check') + 'Appliquer</button></div>' : '') +
        '</div>' +
        '<div class="sgroup"><h3>Police</h3><div class="sbox" id="suiteFontBox"></div></div>' +
        '<div class="sgroup"><h3>Nom affiché à côté de Sori</h3><div class="sbox">' +
        '<input class="text-input" id="brandIn" placeholder="Laisser vide pour ne rien afficher" value="' + esc(a.brandLabel) + '"/>' +
        hexField('brandColor', 'Couleur du nom', a.brandColor) + '</div></div>' +
        '<div class="sgroup"><h3>Onglets affichés (propre à Sori)</h3><div class="tabchecks">' + TABS.map(function (t) {
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
      '<div class="modal-foot"><span class="hint">Sori ' + APP_VERSION + ' · ' + (inCEP ? 'connecté à Premiere Pro' : 'hors Premiere (aperçu)') + '</span><button class="btn-primary" id="closeSet2">Fermer</button></div>' +
      '</div>';

    s.onclick = function (e) { if (e.target === s) closeSettings(); };
    $('#closeSet').onclick = closeSettings;
    $('#closeSet2').onclick = closeSettings;
    $$('[data-settab]', s).forEach(function (b) { b.onclick = function () { setTab = b.getAttribute('data-settab'); renderSettings(); }; });

    if (setTab === 'inject') {
      $$('[data-set]', s).forEach(function (l) {
        l.onclick = function (e) {
          e.preventDefault();
          var id = l.getAttribute('data-set');
          prefs[id] = !prefs[id];
          savePrefs(); renderSettings();
        };
      });
      $$('[data-seg="density"] button', s).forEach(function (b) {
        b.onclick = function () { prefs.density = b.getAttribute('data-v'); savePrefs(); renderSettings(); };
      });
      $('#clearMemo').onclick = function () { saveMemo({}); try { localStorage.removeItem(MEMO_KEY); } catch (e) {} renderSettings(); toast('Clés mémorisées oubliées.'); };
    } else {
      bindAppearance(s, a);
    }
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
    if (Suite && Suite.mountFontPicker) Suite.mountFontPicker($('#suiteFontBox'));
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

  /** Un autre panneau (Mori, Ongaku) a changé l'apparence partagée */
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
    clearInterval(projectTimer); clearInterval(state.selTimer);
  }

  function init() {
    syncSharedAppearance();
    applyAppearance();
    watchProject();
    $('#btnSettings').innerHTML = icon('settings');
    $('#btnSettings').onclick = openSettings;
    renderTabs();
    renderView();
    watchSelection();
    if (Suite) Suite.watch(onSharedAppearance);

    document.addEventListener('keydown', function (e) {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); if (state.lastAction === 'apply' && state.applyUndo.length) undoApply(); else undo(); }
      else if (mod && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (mod && e.code === 'Enter') { e.preventDefault(); apply(); }
      else if ((e.code === 'Delete' || e.code === 'Backspace') && state.selected > 0 && prefs.tab === 'curve') { e.preventDefault(); deletePoint(state.selected); }
      else if (e.code === 'Escape') { closeSettings(); toggleAbout(false); if (state.selected !== -1) { state.selected = -1; drawGraph(); renderInfo(); } }
      else if (e.code === 'KeyV' && !mod && prefs.tab === 'curve') { prefs.view = prefs.view === 'value' ? 'speed' : 'value'; savePrefs(); renderView(); }
    });
    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        resizeCanvas(); drawGraph();
        if (prefs.tab === 'library') $$('.pcard').length && renderLibrary();
      }, 60);
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('#about')) toggleAbout(false); });
    window.addEventListener('beforeunload', shutdown);
    window.addEventListener('pagehide', shutdown);
    window.addEventListener('unload', shutdown);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshSelection();
    });
    if (!inCEP) setTimeout(function () { toast('Aperçu hors Premiere : l\'éditeur et la bibliothèque fonctionnent, l\'injection est désactivée.'); }, 400);
  }

  init();
})();
