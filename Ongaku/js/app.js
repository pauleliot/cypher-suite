/**
 * Ongaku — interface du panneau (bibliothèque, lecteur, beats, effets de fin).
 * JavaScript sans build : fonctionne tel quel dans CEP (Chromium 74+).
 */
(function () {
  'use strict';

  var APP_VERSION = '1.8.0'; // à garder identique à CSXS/manifest.xml
  var Lib = window.OngakuLib, An = window.OngakuAnalysis, Fx = window.OngakuEffects;
  var cs = new CSInterface();
  var inCEP = !!window.__adobe_cep__;
  var hasNode = Lib.hasNode();

  // ==================== Icônes (tracés Lucide) ====================
  var ICONS = {
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    markIn: '<path d="M9 4H5v16h4"/><path d="M11 12h9"/><path d="m16 8 4 4-4 4"/>',
    markOut: '<path d="M15 4h4v16h-4"/><path d="M13 12H4"/><path d="m8 8-4 4 4 4"/>',
    library:'<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    folderPlus: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    disc: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 0 1 10 10"/>',
    waves: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    fade: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
  };
  function icon(name, cls) { return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24">' + (ICONS[name] || '') + '</svg>'; }

  // ==================== Préférences ====================
  var PREFS_KEY = 'ongaku.prefs.v1';
  var DEFAULT_PREFS = {
    libs: { music: [], sfx: [] }, category: 'music', fileMode: 'copy', favorites: [], tab: 'music', sort: 'name', filter: 'all', folderFilter: '',
    brand: 'Avril Films', renderDir: hasNode ? Lib.defaultRenderDir() : '',
    beats: { density: 'beat', mode: 'clip', color: 4, offset: 0 },
    fx: { effect: 'reverb', tail: 4, size: 0.6, mix: 0.9, window: 0.9, stop: 1.6, curve: 0.9, crackle: true, wow: true, fade: 3, snap: 'beat' }
  };
  var prefs = (function () {
    var p = JSON.parse(JSON.stringify(DEFAULT_PREFS));
    try {
      var s = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      Object.keys(s).forEach(function (k) {
        if (k === 'beats' || k === 'fx' || k === 'libs') Object.assign(p[k], s[k]); else p[k] = s[k];
      });
      // v1.0 : une seule liste de dossiers → section Musique
      if (s.folders && s.folders.length && !s.libs) p.libs.music = s.folders.slice();
      delete p.folders;
    } catch (e) {}
    return p;
  })();
  var CATS = {
    music: { label: 'Musique', icon: 'music', noun: 'morceau', search: 'Rechercher un titre, un artiste, un genre, « 120bpm »…' },
    sfx: { label: 'SFX', icon: 'zap', noun: 'effet', search: 'Rechercher un bruitage : whoosh, impact, riser…' }
  };
  function folders(cat) { return prefs.libs[cat || prefs.category] || []; }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} }
  /** Apparence modifiée dans Ongaku : écrite aussi dans le fichier partagé avec Mori et Sori */
  function saveAppearance() {
    savePrefs();
    if (window.SuiteTheme && prefs.appearance) window.SuiteTheme.write(prefs.appearance, 'Ongaku');
  }
  var favSet = new Set(prefs.favorites);

  // ==================== État ====================
  var state = {
    files: [], list: [], query: '', showLimit: 200, scanning: false,
    current: null, buffer: null, loadToken: 0,
    inPt: null, outPt: null, beatScale: 1,
    lastRender: null, pv: null
  };

  // ==================== Utilitaires ====================
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(t, precise) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = t - m * 60;
    if (precise) return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
    s = Math.floor(s);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function coverStyle(f) {
    if (f.cover) return 'background-image:url(' + f.cover + ')';
    var h = hash(f.title + f.artist) % 360;
    return 'background-image:linear-gradient(135deg,hsl(' + h + ',45%,42%),hsl(' + ((h + 50) % 360) + ',55%,20%))';
  }
  function css(name, a) { return 'rgba(' + getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim().split(/\s+/).join(',') + ',' + (a == null ? 1 : a) + ')'; }
  var COLORS = {};
  function refreshColors() {
    COLORS = {
      wave: css('zinc-500'), waveDim: css('zinc-600', 0.6), played: css('cream-300'), accent: css('accent-300'),
      accentFill: css('accent-300', 0.13), beat: 'rgba(255,255,255,0.55)', down: css('accent-300', 0.8),
      cream: css('cream-300'), ink: css('ink', 0.62), red: css('red-400')
    };
  }

  // ==================== Toast ====================
  var toastTimer = null;
  function toast(msg, kind, sticky) {
    var el = $('#toast');
    var ic = kind === 'err' ? 'alert' : kind === 'busy' ? 'activity' : 'check';
    el.innerHTML = '<div class="msg ' + (kind || 'ok') + '">' + icon(ic) + '<span>' + esc(msg) + '</span></div>';
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(function () { el.innerHTML = ''; }, kind === 'err' ? 6000 : 3500);
  }

  // ==================== Pont Premiere (ExtendScript) ====================
  /** Chemin absolu de jsx/Ongaku_Premiere.jsx, déduit de l'URL du panneau */
  var JSX_PATH = decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\/[^\/]*$/, '') + '/jsx/Ongaku_Premiere.jsx';

  /** Encode une chaîne en littéral ExtendScript 100 % ASCII (\uXXXX pour les accents) */
  function esLit(v) {
    return JSON.stringify(v).replace(/[^\x00-\x7e]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
  }

  function jsx(fn, args) {
    return new Promise(function (resolve) {
      if (!inCEP) return resolve({ success: false, error: 'Disponible uniquement dans Premiere Pro' });
      var call = '$.Ongaku.' + fn + '(' + (args || []).map(esLit).join(',') + ')';
      // si le script hôte n'est pas chargé, on le (re)charge ; toute exception est renvoyée en JSON lisible
      var script =
        '(function(){try{' +
        'if(typeof $.Ongaku==="undefined"||!$.Ongaku.' + fn + '){$.evalFile(new File(' + esLit(JSX_PATH) + '));}' +
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

  // ==================== Moteur de lecture (Web Audio) ====================
  var actx = null;
  var idleTimer = null, closing = false;
  function audio() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    if (actx.state === 'suspended') actx.resume();
    clearTimeout(idleTimer);
    return actx;
  }
  /** Sans lecture, on suspend la carte son : moins de ressources tenues quand Premiere ferme le panneau */
  function idleAudio() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (actx && !pb.playing && actx.state === 'running') actx.suspend(); }, 1500);
  }
  var pb = { src: null, startedAt: 0, offset: 0, playing: false };

  /** Buffer lu : la pré-écoute d'un effet si elle est affichée, sinon le morceau */
  function activeBuffer() { return state.pv ? state.pv.buf : state.buffer; }

  function position() {
    var b = activeBuffer();
    if (!b) return 0;
    if (pb.playing) return Math.min(b.duration, audio().currentTime - pb.startedAt);
    return pb.offset;
  }
  /** Position dans le morceau d'origine (même pendant la pré-écoute) */
  function trackPosition() { return state.pv ? state.pv.mainOffset : position(); }
  function stopSource() {
    if (pb.src) { var s = pb.src; pb.src = null; try { s.stop(); } catch (e) {} s.disconnect(); }
  }
  function play(from) {
    var buf = activeBuffer();
    if (!buf) return;
    stopSource();
    var c = audio();
    if (from == null) from = pb.offset;
    if (from >= buf.duration - 0.05) from = 0;
    var s = c.createBufferSource();
    s.buffer = buf;
    s.connect(c.destination);
    s.start(0, from);
    s.onended = function () {
      if (pb.src !== s) return;
      pb.src = null; pb.playing = false; pb.offset = 0;
      refreshTransport();
    };
    pb.src = s; pb.startedAt = c.currentTime - from; pb.playing = true;
    refreshTransport();
    tick();
  }
  function pause() {
    pb.offset = position();
    pb.playing = false;
    stopSource();
    refreshTransport();
    idleAudio();
  }
  function toggle() { if (pb.playing) pause(); else play(); }
  function seek(t) {
    var b = activeBuffer();
    t = Math.max(0, Math.min(t, b ? b.duration : 0));
    if (pb.playing) play(t); else { pb.offset = t; drawMain(); refreshTime(); }
  }

  var rafOn = false, lastFrame = 0;
  function tick(now) {
    if (closing) return;
    if (!pb.playing) { rafOn = false; drawMain(); refreshTime(); drawCurrentMini(); return; }
    if (!rafOn || !now || now - lastFrame > 33) {
      lastFrame = now || 0;
      drawMain(); refreshTime(); drawCurrentMini();
    }
    rafOn = true;
    requestAnimationFrame(tick);
  }

  /**
   * Pré-écoute d'un effet de fin : le lecteur affiche la forme d'onde du rendu (coupe + effet),
   * se lit / se parcourt comme un morceau, et « Retour » ramène au morceau d'origine.
   */
  function openPreview(buf, cut, label) {
    var mainOffset = state.pv ? state.pv.mainOffset : position();
    stopSource(); pb.playing = false;
    state.pv = { buf: buf, cut: cut, label: label, mainOffset: mainOffset, peaks: An.computePeaks(An.mixDown(buf), An.PEAK_COUNT) };
    renderPlayer();
    if (prefs.tab === 'fins') renderFins();
    play(Math.max(0, cut - 4));
  }
  function closePreview() {
    if (!state.pv) return;
    var back = state.pv.mainOffset;
    stopSource(); pb.playing = false;
    state.pv = null;
    pb.offset = back;
    renderPlayer();
    if (prefs.tab === 'fins') renderFins();
    idleAudio();
  }
  function stopPreview() { closePreview(); }

  // ==================== Bibliothèque ====================
  function getArrayBuffer(f) {
    if (f.synth) return Promise.resolve(Demo.wav(f).buffer);
    return Lib.readFileAsArrayBuffer(f.path);
  }

  function hydrate(f) {
    var g = Lib.guessFromName(f.name);
    f.title = g.title; f.artist = g.artist;
    var c = hasNode ? Lib.cacheGet(f) : null;
    if (c) {
      ['title', 'artist', 'genre', 'cover', 'duration', 'peaks', 'bpm', 'beats', 'downbeat', 'transients', 'tagged', 'analyzed'].forEach(function (k) {
        if (c[k] !== undefined && c[k] !== null && c[k] !== '') f[k] = c[k];
      });
      if (typeof f.peaks === 'string') f.peaks = Lib.unpackPeaks(f.peaks);
    }
    return f;
  }

  function rescan() {
    state.files = [];
    if (!hasNode) { state.files = Demo.files(); applyFilter(); if (prefs.tab === 'music') renderMusic(); return Promise.resolve(); }
    var jobs = [];
    Object.keys(CATS).forEach(function (cat) { folders(cat).forEach(function (dir) { jobs.push({ cat: cat, dir: dir }); }); });
    if (!jobs.length) { applyFilter(); return Promise.resolve(); }
    state.scanning = true;
    renderView();
    var seen = {};
    return Promise.all(jobs.map(function (j) { return Lib.scanFolder(j.dir); })).then(function (lists) {
      lists.forEach(function (list, k) {
        var cat = jobs[k].cat;
        list.forEach(function (f) {
          // un même fichier peut figurer dans les deux sections, jamais deux fois dans la même
          var key = cat + '|' + f.path.toLowerCase();
          if (seen[key]) return;
          seen[key] = 1;
          f.cat = cat;
          state.files.push(hydrate(f));
        });
      });
      state.scanning = false;
      // le morceau courant garde son objet (lecture en cours)
      if (state.current) {
        var same = state.files.filter(function (f) { return f.path === state.current.path && f.cat === state.current.cat; })[0];
        if (same) state.files[state.files.indexOf(same)] = state.current;
      }
      applyFilter();
      if (prefs.tab === 'music') renderMusic(); // compteurs Musique / SFX
      runTagQueue();
      if (!lists.some(function (l) { return l.length; })) toast('Aucun fichier audio trouvé dans les dossiers choisis.', 'err');
    });
  }

  function applyFilter() {
    var q = state.query.trim().toLowerCase();
    var words = q ? q.split(/\s+/) : [];
    var list = state.files.filter(function (f) {
      if (f.cat !== prefs.category) return false;
      if (prefs.filter === 'fav' && !favSet.has(f.path)) return false;
      if (prefs.folderFilter && f.folder !== prefs.folderFilter) return false;
      if (!words.length) return true;
      var hay = (f.title + ' ' + f.artist + ' ' + f.name + ' ' + (f.genre || '') + ' ' + (f.bpm ? Math.round(f.bpm) + 'bpm' : '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
    var by = prefs.sort;
    list.sort(function (a, b) {
      if (by === 'artist') return (a.artist || '~').localeCompare(b.artist || '~') || a.title.localeCompare(b.title);
      if (by === 'duration') return (a.duration || 1e9) - (b.duration || 1e9);
      if (by === 'bpm') return (a.bpm || 1e9) - (b.bpm || 1e9);
      if (by === 'recent') return (b.added || 0) - (a.added || 0);
      return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
    });
    state.list = list;
    if (prefs.tab === 'music') renderList();
  }

  // ---- file d'attente : tags ID3 ----
  var tagRunning = 0;
  function runTagQueue() {
    while (tagRunning < 2 && !closing) {
      var f = state.files.filter(function (x) { return !x.tagged && !x.synth; })[0];
      if (!f) return;
      f.tagged = true;
      tagRunning++;
      (function (f) {
        var p = Lib.extname(f.name) === '.mp3' || Lib.extname(f.name) === '.aif' || Lib.extname(f.name) === '.aiff'
          ? Lib.parseId3(f.path) : Promise.resolve(null);
        p.then(function (tags) {
          if (!tags) return {};
          var upd = {};
          if (tags.title) upd.title = tags.title;
          if (tags.artist) upd.artist = tags.artist;
          if (tags.genre) upd.genre = tags.genre;
          return tags.coverBlob ? Lib.blobToThumb(tags.coverBlob, 96).then(function (u) { if (u) upd.cover = u; return upd; }) : upd;
        }).then(function (upd) {
          Object.assign(f, upd);
          upd.tagged = true;
          Lib.cachePut(f, upd);
          updateRow(f);
          if (f === state.current) renderPlayerHead();
        }).catch(function () {}).then(function () { tagRunning--; runTagQueue(); });
      })(f);
    }
  }

  // ---- file d'attente : analyse (onde + BPM), priorité aux lignes visibles ----
  var visible = new Set();
  var anaRunning = false;
  function nextToAnalyze() {
    var pick = null;
    visible.forEach(function (f) { if (!pick && !f.analyzed && !f.failed && f !== state.current) pick = f; });
    if (pick) return pick;
    for (var i = 0; i < state.list.length; i++) {
      var f = state.list[i];
      if (!f.analyzed && !f.failed && f !== state.current) return f;
    }
    return null;
  }
  function runAnalysisQueue() {
    if (anaRunning || closing) return;
    var f = nextToAnalyze();
    if (!f) return;
    anaRunning = true;
    f.analyzing = true;
    updateRow(f);
    getArrayBuffer(f).then(An.analyze).then(function (res) {
      applyAnalysis(f, res);
    }).catch(function () {
      f.failed = true;
    }).then(function () {
      f.analyzing = false;
      updateRow(f);
      anaRunning = false;
      setTimeout(runAnalysisQueue, 40);
    });
  }
  function applyAnalysis(f, res) {
    f.duration = res.duration; f.peaks = res.peaks; f.bpm = res.bpm; f.beats = res.beats;
    f.downbeat = res.downbeat; f.transients = res.transients; f.analyzed = true;
    if (!f.synth && hasNode) Lib.cachePut(f, { duration: res.duration, peaks: res.peaks, bpm: res.bpm, beats: res.beats, downbeat: res.downbeat, transients: res.transients, analyzed: true });
    updateRow(f);
    if (f === state.current) { renderPlayerHead(); drawMain(); if (prefs.tab !== 'music') renderView(); }
  }

  // ==================== Chargement d'un morceau ====================
  function selectTrack(f, autoplay) {
    if (state.current === f) { if (state.pv) closePreview(); if (autoplay) toggle(); return; }
    stopSource(); stopPreview();
    pb.playing = false; pb.offset = 0;
    if (hasNode) dropUnusedExcerpt();
    var prev = state.current;
    state.current = f; state.buffer = null; state.inPt = null; state.outPt = null; state.beatScale = 1; state.lastRender = null;
    if (prev) updateRow(prev);
    updateRow(f);
    renderPlayer();
    if (prefs.tab !== 'music') renderView();
    var token = ++state.loadToken;
    getArrayBuffer(f).then(function (ab) {
      return An.decode(ab, audio().sampleRate);
    }).then(function (buf) {
      if (token !== state.loadToken) return;
      state.buffer = buf;
      if (!f.analyzed) return An.analyzeBuffer(buf).then(function (res) { if (token === state.loadToken) applyAnalysis(f, res); });
    }).then(function () {
      if (token !== state.loadToken) return;
      renderPlayer();
      if (prefs.tab !== 'music') renderView();
      if (autoplay) play(0);
    }).catch(function (e) {
      if (token !== state.loadToken) return;
      f.failed = true;
      renderPlayer();
      toast('Lecture impossible : ' + (e && e.message ? e.message : 'format non pris en charge'), 'err');
    });
  }

  // ==================== Beats ====================
  function mod(a, n) { return ((a % n) + n) % n; }
  function getBeats() {
    var f = state.current;
    if (!f || !f.beats || !f.beats.length) return [];
    var b = f.beats, db = f.downbeat || 0, out = [], i;
    if (state.beatScale === 2) {
      for (i = 0; i < b.length; i++) {
        out.push({ t: b[i], down: mod(i - db, 4) === 0 });
        if (i + 1 < b.length) out.push({ t: (b[i] + b[i + 1]) / 2, down: false });
      }
    } else if (state.beatScale === 0.5) {
      for (i = 0; i < b.length; i++) if (mod(i - db, 2) === 0) out.push({ t: b[i], down: mod(i - db, 8) === 0 });
    } else {
      for (i = 0; i < b.length; i++) out.push({ t: b[i], down: mod(i - db, 4) === 0 });
    }
    var off = (prefs.beats.offset || 0) / 1000, dur = f.duration || 1e9;
    return out.map(function (x) { return { t: Math.round((x.t + off) * 1000) / 1000, down: x.down }; })
      .filter(function (x) { return x.t >= 0 && x.t <= dur; });
  }
  function currentBpm() { var f = state.current; return f && f.bpm ? Math.round(f.bpm * state.beatScale * 10) / 10 : 0; }

  function markerList() {
    var d = prefs.beats.density, list;
    if (d === 'transients') {
      var off = (prefs.beats.offset || 0) / 1000;
      list = (state.current.transients || []).map(function (t) { return { t: Math.round((t + off) * 1000) / 1000, down: false }; });
    } else {
      list = getBeats();
      if (d === 'bar') list = list.filter(function (x) { return x.down; });
      else if (d === 'half') {
        var firstDown = -1;
        for (var i = 0; i < list.length; i++) if (list[i].down) { firstDown = i; break; }
        list = list.filter(function (x, k) { return mod(k - Math.max(0, firstDown), 2) === 0; });
      }
    }
    var r = region();
    if (r.set) list = list.filter(function (x) { return x.t >= r.a - 0.001 && x.t <= r.b + 0.001; });
    return list;
  }

  function snapTime(t) {
    var mode = prefs.fx.snap;
    if (mode === 'off') return t;
    var beats = getBeats();
    if (mode === 'bar') beats = beats.filter(function (b) { return b.down; });
    if (!beats.length) return t;
    var best = beats[0].t;
    beats.forEach(function (b) { if (Math.abs(b.t - t) < Math.abs(best - t)) best = b.t; });
    return best;
  }

  // ==================== Dessin des formes d'onde ====================
  function fitCanvas(cv) {
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return dpr;
  }

  /** Barres symétriques ; progress (0-1) colore la partie lue */
  function drawBars(ctx, peaks, w, h, dpr, barW, gap, progress, color, playedColor, minH) {
    var step = (barW + gap) * dpr, n = Math.floor(w / step), mid = h / 2;
    for (var i = 0; i < n; i++) {
      var s = Math.floor(i / n * peaks.length), e = Math.max(s + 1, Math.floor((i + 1) / n * peaks.length)), m = 0;
      for (var j = s; j < e; j++) if (peaks[j] > m) m = peaks[j];
      var bh = Math.max(minH * dpr, (m / 255) * (h * 0.94));
      ctx.fillStyle = (i + 0.5) / n <= progress ? playedColor : color;
      ctx.fillRect(i * step, mid - bh / 2, barW * dpr, bh);
    }
  }

  function drawMini(el, f) {
    var cv = el && el.querySelector('.mini canvas');
    if (!cv || !cv.clientWidth) return;
    var dpr = fitCanvas(cv), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!f.peaks) return;
    var prog = f === state.current && state.buffer ? trackPosition() / state.buffer.duration : 0;
    drawBars(ctx, f.peaks, cv.width, cv.height, dpr, 1.5, 1, prog, COLORS.wave, COLORS.played, 1);
    var io = f === state.current ? currentIO(f.path) : null;
    if (io) {
      var d = state.buffer ? state.buffer.duration : f.duration, W = cv.width, H = cv.height;
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(0, 0, io.a / d * W, H);
      ctx.fillRect(io.b / d * W, 0, W - io.b / d * W, H);
      ctx.fillStyle = COLORS.cream;
      ctx.fillRect(io.a / d * W, 0, dpr, H); ctx.fillRect(io.b / d * W - dpr, 0, dpr, H);
    }
  }
  function drawCurrentMini() { if (state.current) drawMini(rowEls.get(state.current.path), state.current); }

  var hover = { x: -1 };
  function drawMain() {
    var cv = $('#wave'), f = state.current;
    if (!cv || !f) return;
    var dpr = fitCanvas(cv), ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    var pos = position(), X;

    // pré-écoute d'un effet : forme d'onde du rendu, zone de l'effet teintée après la coupe
    if (state.pv) {
      var pv = state.pv, pdur = pv.buf.duration;
      X = function (t) { return (t / pdur) * w; };
      drawBars(ctx, pv.peaks, w, h, dpr, 2, 1, pos / pdur, COLORS.wave, COLORS.played, 1.5);
      var cx = X(pv.cut);
      ctx.fillStyle = COLORS.accentFill; ctx.fillRect(cx, 0, w - cx, h);
      ctx.fillStyle = COLORS.accent; ctx.fillRect(cx - dpr / 2, 0, dpr * 1.5, h);
      ctx.font = '800 ' + (9 * dpr) + 'px Urbanist, sans-serif';
      var lab = pv.label.toUpperCase(), lw = ctx.measureText(lab).width + 10 * dpr, lx = Math.min(cx + dpr, w - lw);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(lx, 0, lw, 14 * dpr, [0, 0, 4 * dpr, 0]); else ctx.rect(lx, 0, lw, 14 * dpr);
      ctx.fill();
      ctx.fillStyle = css('ink'); ctx.fillText(lab, lx + 5 * dpr, 10 * dpr);
      ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(X(pos)), 0, dpr, h);
      if (hover.x >= 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(Math.round(hover.x * dpr), 0, dpr, h); }
      return;
    }

    if (!f.peaks) return;
    var dur = f.duration || (state.buffer ? state.buffer.duration : 1);
    X = function (t) { return (t / dur) * w; };
    var tab = prefs.tab;

    drawBars(ctx, f.peaks, w, h, dpr, 2, 1, pos / dur, COLORS.wave, COLORS.played, 1.5);

    // grille de beats (onglet Beats uniquement)
    if (tab === 'beats' && f.beats) {
      var beats = getBeats(), pxPerBeat = beats.length > 1 ? (X(beats[1].t) - X(beats[0].t)) : 99;
      beats.forEach(function (b) {
        if (!b.down && pxPerBeat < 4 * dpr) return;
        var x = Math.round(X(b.t)) + 0.5;
        if (b.down) {
          ctx.fillStyle = COLORS.down; ctx.fillRect(x - dpr / 2, 0, dpr * 1.5, h);
          ctx.fillStyle = COLORS.accent; ctx.fillRect(x - 2 * dpr, 0, 4.5 * dpr, 3 * dpr);
        } else {
          ctx.fillStyle = COLORS.beat;
          ctx.fillRect(x, 0, dpr, 7 * dpr); ctx.fillRect(x, h - 7 * dpr, dpr, 7 * dpr);
        }
      });
      if (tab === 'beats' && prefs.beats.density === 'transients') {
        ctx.fillStyle = COLORS.cream;
        (f.transients || []).forEach(function (t) { ctx.beginPath(); ctx.arc(X(t), h - 3 * dpr, 1.6 * dpr, 0, 7); ctx.fill(); });
      }
    }

    // points In / Out : zone hors région assombrie + drapeaux (poignées déplaçables)
    if (state.inPt != null) { ctx.fillStyle = COLORS.ink; ctx.fillRect(0, 0, X(state.inPt), h); }
    if (state.outPt != null) { ctx.fillStyle = COLORS.ink; ctx.fillRect(X(state.outPt), 0, w - X(state.outPt), h); }
    ctx.font = '800 ' + (9 * dpr) + 'px Urbanist, sans-serif';
    function flag(t, label, right) {
      var x = X(t), tw = ctx.measureText(label).width + 10 * dpr, fh = 14 * dpr;
      ctx.fillStyle = COLORS.cream;
      ctx.fillRect(x - dpr, 0, 2 * dpr, h);
      var fx = right ? x - dpr : x + dpr - tw;
      fx = Math.max(0, Math.min(w - tw, fx));
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(fx, 0, tw, fh, [0, 0, right ? 4 * dpr : 0, right ? 0 : 4 * dpr]); else ctx.rect(fx, 0, tw, fh);
      ctx.fill();
      ctx.fillStyle = css('ink');
      ctx.fillText(label, fx + 5 * dpr, 10 * dpr);
    }
    if (state.inPt != null) flag(state.inPt, 'IN', true);
    if (state.outPt != null) flag(state.outPt, tab === 'fins' ? 'FIN' : 'OUT', false);

    // tête de lecture + survol
    if (state.buffer) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(X(pos)), 0, dpr, h); }
    if (hover.x >= 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(Math.round(hover.x * dpr), 0, dpr, h); }
  }

  // ==================== Rendu : lecteur ====================
  function renderPlayer() {
    var el = $('#player'), f = state.current;
    if (!f) {
      el.innerHTML = '<div class="empty-player"><div class="cover" style="background:rgba(255,255,255,.05)">' + icon('music') + '</div>' +
        '<div><div style="color:rgb(var(--zinc-100));font-weight:700;font-size:13px">Aucun morceau</div>' +
        '<div style="margin-top:2px">Cliquez sur un titre de la bibliothèque pour l\'écouter.</div></div></div>';
      return;
    }
    var waveHTML = '<div class="pl-wave" id="waveWrap"><canvas id="wave"></canvas><div class="hover-time" id="hoverTime"></div>' +
      (state.buffer ? '' : '<div class="loading">' + (f.failed ? 'Fichier illisible' : 'Chargement…') + '</div>') + '</div>';
    if (state.pv) {
      el.innerHTML =
        '<div class="pl-head" id="plHead"></div>' + waveHTML +
        '<div class="pl-controls">' +
        '<button class="play-btn" id="btnPlay" title="Lecture / pause (Espace)"></button>' +
        '<div class="time" id="time"></div>' +
        '<span class="pill cream">' + icon('headphones') + 'PRÉ-ÉCOUTE · ' + esc(state.pv.label.toUpperCase()) + '</span>' +
        '<div class="spacer"></div>' +
        '<button class="btn-ghost" id="btnBack" style="padding:7px 14px" title="Revenir au morceau d\'origine">' + icon('back') + 'Retour</button>' +
        '</div>';
      renderPlayerHead();
      refreshTransport();
      bindWave();
      $('#btnPlay').onclick = toggle;
      $('#btnBack').onclick = closePreview;
      requestAnimationFrame(drawMain);
      return;
    }
    el.innerHTML =
      '<div class="pl-head" id="plHead"></div>' + waveHTML +
      '<div class="pl-controls">' +
      '<button class="play-btn" id="btnPlay" title="Lecture / pause (Espace)"></button>' +
      '<div class="time" id="time"></div>' +
      '<div class="spacer"></div>' +
      '<div class="inout">' +
      '<button id="btnIn" title="Point d\'entrée à la position de lecture (touche I)">' + icon('markIn') + '<span>In</span></button>' +
      '<button id="btnOut" title="Point de sortie à la position de lecture (touche O)">' + icon('markOut') + '<span>Out</span></button>' +
      '<button id="btnClearIO" title="Effacer In / Out (touche X)">' + icon('x') + '</button>' +
      '</div>' +
      '<button class="btn-ghost" id="btnPlace" style="padding:7px 12px" title="Placer sur la timeline à la tête de lecture">' + icon('plus') + 'Placer</button>' +
      '<div class="chip-drag" id="dragCur" draggable="true" title="Glisser vers la timeline ou le projet">' + icon('grip') + 'Glisser</div>' +
      '</div>';
    renderPlayerHead();
    refreshTransport();
    bindWave();
    $('#btnPlay').onclick = toggle;
    $('#btnIn').onclick = markIn;
    $('#btnOut').onclick = markOut;
    $('#btnClearIO').onclick = clearInOut;
    refreshInOut();
    $('#btnPlace').onclick = function () { placeTrack(f); };
    bindDrag($('#dragCur'), function () { return dragPathFor(f); });
    refreshDragLabel();
    requestAnimationFrame(drawMain);
  }
  function renderPlayerHead() {
    var el = $('#plHead'), f = state.current;
    if (!el || !f) return;
    var bpm = currentBpm();
    el.innerHTML =
      '<div class="cover" style="' + coverStyle(f) + '">' + (f.cover ? '' : icon(f.cat === 'sfx' ? 'zap' : 'music')) + '</div>' +
      '<div class="pl-meta"><div class="pl-title">' + esc(f.title) + '</div><div class="pl-artist">' + esc(f.artist || f.name) + '</div></div>' +
      (bpm ? '<span class="pill accent">' + bpm + ' BPM</span>' : (f.analyzed ? '' : '<span class="pill">ANALYSE…</span>')) +
      '<button class="icon-btn" id="btnFavCur" title="Favori" style="' + (favSet.has(f.path) ? 'color:rgb(var(--cream-300))' : '') + '">' + icon('star', favSet.has(f.path) ? 'fill' : '') + '</button>';
    $('#btnFavCur').onclick = function () { toggleFav(f); };
  }
  function refreshTransport() {
    var b = $('#btnPlay');
    if (b) b.innerHTML = icon(pb.playing ? 'pause' : 'play', 'fill');
    refreshTime();
    if (state.current) {
      var r = rowEls.get(state.current.path);
      if (r) { r.classList.toggle('playing', pb.playing); var ov = r.querySelector('.ov'); if (ov) ov.innerHTML = icon(pb.playing ? 'pause' : 'play', 'fill'); }
    }
  }
  function refreshTime() {
    var el = $('#time');
    if (!el) return;
    var b = activeBuffer(), d = b ? b.duration : (state.current && state.current.duration) || 0;
    el.innerHTML = fmt(position()) + ' <span>/ ' + fmt(d) + '</span>';
  }

  function bindWave() {
    var wrap = $('#waveWrap'), tip = $('#hoverTime');
    var down = null;
    function tAt(e) {
      var r = wrap.getBoundingClientRect(), f = state.current;
      var ab = activeBuffer(), dur = (ab && ab.duration) || f.duration || 0;
      return { x: e.clientX - r.left, t: Math.max(0, Math.min(dur, (e.clientX - r.left) / r.width * dur)) };
    }
    function durNow() { return (state.buffer && state.buffer.duration) || state.current.duration || 1; }
    /** Poignée In / Out sous le pointeur (trait ou drapeau), sinon null */
    function handleAt(p, y) {
      if (state.pv) return null;
      var W = wrap.clientWidth, best = null, bd = 8;
      [['in', state.inPt], ['out', state.outPt]].forEach(function (hdl) {
        if (hdl[1] == null) return;
        var x = hdl[1] / durNow() * W;
        var d = Math.abs(p.x - x);
        // le drapeau dépasse d'environ 26 px du côté intérieur
        if (y < 16 && (hdl[0] === 'in' ? p.x >= x - 2 && p.x <= x + 26 : p.x <= x + 2 && p.x >= x - 30)) d = 0;
        if (d < bd) { bd = d; best = hdl[0]; }
      });
      return best;
    }
    wrap.onmousedown = function (e) {
      if (!state.buffer || e.button !== 0) return;
      var p0 = tAt(e), y0 = e.clientY - wrap.getBoundingClientRect().top;
      var hdl = handleAt(p0, y0);
      if (!hdl) { seek(p0.t); return; }
      e.preventDefault();
      function mv(ev) {
        var t = tAt(ev).t;
        if (prefs.tab === 'fins') t = snapTime(t);
        if (hdl === 'in') state.inPt = Math.min(t, state.outPt != null ? state.outPt - 0.2 : t);
        else state.outPt = Math.max(t, state.inPt != null ? state.inPt + 0.2 : t);
        drawMain();
      }
      function up() {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        afterIO();
      }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    };
    wrap.onmousemove = function (e) {
      if (!state.current) return;
      var p = tAt(e);
      hover.x = p.x;
      wrap.style.cursor = handleAt(p, e.clientY - wrap.getBoundingClientRect().top) ? 'ew-resize' : 'pointer';
      tip.style.display = 'block';
      tip.style.left = Math.max(18, Math.min(wrap.clientWidth - 18, p.x)) + 'px';
      tip.textContent = fmt(p.t, prefs.tab !== 'music');
      if (!pb.playing) drawMain();
    };
    wrap.onmouseleave = function () { hover.x = -1; tip.style.display = 'none'; if (!pb.playing) drawMain(); };
  }

  // ---------- Points In / Out (boutons + touches I / O / X) ----------
  function ioTime() { var t = trackPosition(); return prefs.tab === 'fins' ? snapTime(t) : t; }
  function afterIO() {
    refreshInOut(); refreshDragLabel(); drawMain(); drawCurrentMini();
    if (prefs.tab !== 'music') renderView();
    scheduleExcerpt();
  }
  function markIn() {
    if (!state.buffer || state.pv) return;
    var t = ioTime();
    if (state.outPt != null && t > state.outPt - 0.2) state.outPt = null;
    state.inPt = t;
    afterIO();
  }
  function markOut() {
    if (!state.buffer || state.pv) return;
    var t = ioTime();
    if (state.inPt != null && t < state.inPt + 0.2) state.inPt = null;
    state.outPt = t;
    afterIO();
  }
  function clearInOut() { state.inPt = null; state.outPt = null; dropUnusedExcerpt(); afterIO(); }
  function refreshInOut() {
    var bi = $('#btnIn'), bo = $('#btnOut'), bc = $('#btnClearIO');
    if (!bi) return;
    bi.classList.toggle('on', state.inPt != null);
    bo.classList.toggle('on', state.outPt != null);
    bi.title = state.inPt != null ? 'In : ' + fmt(state.inPt, true) + ' — cliquer pour le déplacer à la position de lecture (I)' : 'Point d\'entrée à la position de lecture (touche I)';
    bo.title = state.outPt != null ? 'Out : ' + fmt(state.outPt, true) + ' — cliquer pour le déplacer à la position de lecture (O)' : 'Point de sortie à la position de lecture (touche O)';
    bc.style.display = state.inPt != null || state.outPt != null ? '' : 'none';
  }
  /** Région de travail : In → Out, ou morceau entier */
  function region() {
    var d = state.buffer ? state.buffer.duration : (state.current && state.current.duration) || 0;
    return { a: state.inPt != null ? state.inPt : 0, b: state.outPt != null ? state.outPt : d, set: state.inPt != null || state.outPt != null };
  }

  function bindDrag(el, getPath) {
    el.addEventListener('dragstart', function (e) {
      var p = getPath();
      if (p === false) { e.preventDefault(); return; }
      if (!p) { e.preventDefault(); toast('Glisser-déposer disponible dans Premiere Pro avec vos fichiers.', 'err'); return; }
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('com.adobe.cep.dnd.file.0', p);
      e.dataTransfer.setData('text/plain', p);
    });
  }

  // ==================== Rendu : onglets ====================
  var TABS = [
    { id: 'music', label: 'Bibliothèque', icon: 'library' },
    { id: 'beats', label: 'Beats', icon: 'activity' },
    { id: 'fins', label: 'Fins', icon: 'wand' }
  ];
  function renderTabs() {
    var shown = appearance().visibleTabs;
    if (shown.indexOf(prefs.tab) < 0) prefs.tab = shown[0];
    $('#tabs').innerHTML = TABS.filter(function (t) { return shown.indexOf(t.id) >= 0; }).map(function (t) {
      return '<button data-tab="' + t.id + '" class="' + (prefs.tab === t.id ? 'active' : '') + '">' + icon(t.icon) + '<span>' + t.label + '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('#tabs').children, function (b) {
      b.onclick = function () {
        prefs.tab = b.getAttribute('data-tab'); savePrefs();
        renderTabs(); renderView(); drawMain();
      };
    });
  }

  function renderView() {
    if (prefs.tab === 'music') renderMusic();
    else if (prefs.tab === 'beats') renderBeats();
    else renderFins();
  }

  // ---------- Musique ----------
  var rowEls = new Map();
  var io = null;

  function catCount(cat) { return state.files.filter(function (f) { return f.cat === cat; }).length; }

  /** Barre Musique / SFX + dossiers de la section (ajout / filtre / retrait directement ici) */
  function libraryHeader() {
    var cat = prefs.category, dirs = folders(cat);
    var catTabs = '<div class="cat-tabs">' + Object.keys(CATS).map(function (c) {
      var n = catCount(c);
      return '<button data-cat="' + c + '" class="' + (c === cat ? 'on' : '') + '">' + icon(CATS[c].icon) + CATS[c].label +
        (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    var chips = '<div class="folders">' +
      (dirs.length > 1 ? '<button class="chip ' + (!prefs.folderFilter ? 'on' : '') + '" data-dir="">Tous les dossiers</button>' : '') +
      dirs.map(function (d, i) {
        return '<span class="chip folder-chip ' + (prefs.folderFilter === d ? 'on' : '') + '" data-dir="' + esc(d) + '" title="' + esc(d) + '">' +
          icon('folder') + esc(Lib.basename(d) || d) + '<button class="rm" data-rmdir="' + i + '" title="Retirer ce dossier">' + icon('x') + '</button></span>';
      }).join('') +
      '<button class="chip add-chip" id="btnAddDir">' + icon('folderPlus') + 'Ajouter un dossier</button>' +
      '</div>';
    return catTabs + chips;
  }

  function bindLibraryHeader(v) {
    Array.prototype.forEach.call(v.querySelectorAll('[data-cat]'), function (b) {
      b.onclick = function () {
        if (prefs.category === b.getAttribute('data-cat')) return;
        prefs.category = b.getAttribute('data-cat'); prefs.folderFilter = ''; state.showLimit = 200;
        savePrefs(); renderMusic(); applyFilter();
      };
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-dir]'), function (b) {
      b.onclick = function (e) {
        if (e.target.closest('[data-rmdir]')) return;
        prefs.folderFilter = b.getAttribute('data-dir'); savePrefs(); renderMusic(); applyFilter();
      };
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-rmdir]'), function (b) {
      b.onclick = function (e) { e.stopPropagation(); removeFolder(prefs.category, +b.getAttribute('data-rmdir')); };
    });
    var add = $('#btnAddDir', v);
    if (add) add.onclick = function () { addFolder(prefs.category); };
  }

  function renderMusic() {
    var v = $('#view'), cat = prefs.category, C = CATS[cat];
    if (hasNode && !folders(cat).length) {
      v.innerHTML = '<div class="lib-tools">' + libraryHeader() + '</div>' +
        '<div class="card empty" style="margin-top:8px"><div class="big">' + icon(C.icon) + '</div>' +
        '<h3>' + (cat === 'sfx' ? 'Ajoutez vos effets sonores' : 'Ajoutez votre musique') + '</h3>' +
        '<div>' + (cat === 'sfx'
          ? 'Choisissez vos dossiers de bruitages (whoosh, impacts, ambiances…) : Ongaku les scanne et affiche leur forme d\'onde.'
          : 'Choisissez un ou plusieurs dossiers : Ongaku les scanne, affiche les formes d\'onde et détecte le BPM de chaque morceau.') + '</div>' +
        '<button class="btn-primary" id="btnAddFirst">' + icon('folderPlus') + 'Choisir un dossier</button>' +
        '<div style="display:flex;gap:6px;width:100%;max-width:360px"><input class="text-input" id="pathFirst" placeholder="ou collez un chemin : ' +
        (cat === 'sfx' ? 'D:\\SFX' : 'D:\\Musique') + '"/><button class="btn-ghost" id="pathFirstOk" style="flex:0 0 auto;padding:6px 12px">OK</button></div></div>';
      bindLibraryHeader(v);
      $('#btnAddFirst').onclick = function () { addFolder(cat); };
      $('#pathFirstOk').onclick = function () { addFolderPath($('#pathFirst').value, cat); };
      $('#pathFirst').onkeydown = function (e) { if (e.key === 'Enter') addFolderPath(this.value, cat); };
      return;
    }
    var sorts = [['name', 'Titre'], ['artist', 'Artiste'], ['duration', 'Durée'], ['bpm', 'BPM'], ['recent', 'Récents']]
      .filter(function (o) { return cat === 'music' || (o[0] !== 'bpm' && o[0] !== 'artist'); });
    v.innerHTML =
      '<div class="lib-tools">' + libraryHeader() +
      '<div class="search">' + icon('search') + '<input id="q" placeholder="' + C.search + '" value="' + esc(state.query) + '"/></div>' +
      '<div class="toolbar">' +
      '<button class="chip ' + (prefs.filter === 'all' ? 'on' : '') + '" data-f="all">Tout</button>' +
      '<button class="chip ' + (prefs.filter === 'fav' ? 'on' : '') + '" data-f="fav">' + icon('star') + 'Favoris</button>' +
      '<div class="spacer"></div><span class="count" id="count"></span>' +
      '<select class="sort" id="sortSel">' + sorts.map(function (o) {
        return '<option value="' + o[0] + '"' + (prefs.sort === o[0] ? ' selected' : '') + '>Trier : ' + o[1] + '</option>';
      }).join('') + '</select>' +
      (hasNode ? '<button class="chip" id="btnRescan" title="Rescanner les dossiers">' + icon('refresh') + '</button>' : '') +
      '</div></div>' +
      '<div class="list" id="list"></div>';
    bindLibraryHeader(v);
    var qi = $('#q');
    qi.oninput = function () { state.query = qi.value; state.showLimit = 200; applyFilter(); };
    Array.prototype.forEach.call(v.querySelectorAll('[data-f]'), function (b) {
      b.onclick = function () { prefs.filter = b.getAttribute('data-f'); savePrefs(); renderMusic(); applyFilter(); };
    });
    $('#sortSel').onchange = function () { prefs.sort = this.value; savePrefs(); applyFilter(); };
    if ($('#btnRescan')) $('#btnRescan').onclick = function () { rescan().then(function () { toast(catCount(cat) + ' fichier(s) dans « ' + C.label + ' ».'); }); };
    bindList($('#list'));
    renderList();
  }

  function rowHTML(f) {
    var cur = f === state.current, fav = favSet.has(f.path);
    var sfx = f.cat === 'sfx';
    var sub = sfx ? Lib.basename(f.folder || '') : f.artist || (f.genre || Lib.basename(f.folder || ''));
    var dur = !f.duration ? '' : sfx && f.duration < 10 ? f.duration.toFixed(1) + ' s' : fmt(f.duration);
    return '<div class="cover" style="' + coverStyle(f) + '">' + (f.cover ? '' : icon(sfx ? 'zap' : 'music')) +
      '<div class="ov">' + icon(cur && pb.playing ? 'pause' : 'play', 'fill') + '</div></div>' +
      '<div class="meta"><div class="t" title="' + esc(f.name) + '">' + esc(f.title) + '</div><div class="a">' + esc(sub) + '</div></div>' +
      '<div class="mini"><canvas></canvas>' + (f.analyzing ? '<div class="analyzing">Analyse…</div>' : f.failed ? '<div class="analyzing">Illisible</div>' : '') + '</div>' +
      '<div class="right">' + (sfx ? '' : '<span class="bpm">' + (f.bpm ? Math.round(f.bpm) + ' BPM' : '') + '</span>') +
      '<span class="dur">' + dur + '</span>' +
      '<button class="act ' + (fav ? 'fav-on' : '') + '" data-act="fav" title="Favori">' + icon('star') + '</button>' +
      '<button class="act" data-act="place" title="Placer à la tête de lecture">' + icon('plus') + '</button>' +
      '<button class="act" data-act="import" title="Importer dans le projet (chutier Musique / SFX)">' + icon('download') + '</button></div>';
  }

  function renderList() {
    var list = $('#list');
    if (!list) return;
    rowEls.clear();
    visible.clear();
    if (io) io.disconnect();
    var cnt = $('#count');
    var noun = CATS[prefs.category].noun;
    if (cnt) cnt.textContent = state.scanning ? 'Scan…' : state.list.length + ' ' + noun + (state.list.length > 1 ? 's' : '');
    if (state.scanning) { list.innerHTML = '<div class="empty">' + icon('refresh') + 'Scan des dossiers…</div>'; return; }
    if (!state.list.length) {
      list.innerHTML = '<div class="empty">' + (catCount(prefs.category) ? 'Aucun résultat.' : 'Aucun fichier audio dans ces dossiers.') + '</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    var n = Math.min(state.list.length, state.showLimit);
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var f = en.target.__file;
        if (en.isIntersecting) { visible.add(f); drawMini(en.target, f); } else visible.delete(f);
      });
      runAnalysisQueue();
    }, { root: list, rootMargin: '200px 0px' });
    for (var i = 0; i < n; i++) {
      var f = state.list[i];
      var el = document.createElement('div');
      el.className = 'row' + (f === state.current ? ' current' : '') + (f === state.current && pb.playing ? ' playing' : '');
      el.draggable = true;
      el.__file = f;
      el.innerHTML = rowHTML(f);
      rowEls.set(f.path, el);
      frag.appendChild(el);
      io.observe(el);
    }
    list.innerHTML = '';
    list.appendChild(frag);
    if (state.list.length > n) {
      var more = document.createElement('div');
      more.className = 'more';
      more.innerHTML = '<button class="btn-ghost" style="margin:0 auto">Afficher plus (' + (state.list.length - n) + ')</button>';
      more.firstChild.onclick = function () { state.showLimit += 300; renderList(); };
      list.appendChild(more);
    }
  }

  function bindList(list) {
    list.addEventListener('click', function (e) {
      var row = e.target.closest('.row');
      if (!row) return;
      var f = row.__file, act = e.target.closest('[data-act]');
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'fav') toggleFav(f);
        else if (a === 'place') placeTrack(f);
        else if (a === 'import') importFile(f);
        return;
      }
      if (e.target.closest('.cover')) { selectTrack(f, true); return; }
      selectTrack(f, false);
    });
    list.addEventListener('dblclick', function (e) {
      var row = e.target.closest('.row');
      if (row && !e.target.closest('[data-act]') && !e.target.closest('.cover')) { if (!pb.playing) play(0); }
    });
    list.addEventListener('dragstart', function (e) {
      var row = e.target.closest('.row');
      if (!row) return;
      var f = row.__file;
      var p = dragPathFor(f);
      if (!p) { e.preventDefault(); return; }
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('com.adobe.cep.dnd.file.0', p);
      e.dataTransfer.setData('text/plain', p);
    });
  }

  function updateRow(f) {
    var el = rowEls.get(f.path);
    if (!el) return;
    el.className = 'row' + (f === state.current ? ' current' : '') + (f === state.current && pb.playing ? ' playing' : '');
    el.innerHTML = rowHTML(f);
    drawMini(el, f);
  }

  function toggleFav(f) {
    if (favSet.has(f.path)) favSet.delete(f.path); else favSet.add(f.path);
    prefs.favorites = Array.from(favSet); savePrefs();
    updateRow(f);
    if (f === state.current) renderPlayerHead();
    if (prefs.filter === 'fav') applyFilter();
  }

  // ---------- Dossiers Musique / SFX du projet ----------
  /**
   * Dossier de catégorie à la racine du projet (dossier du .prproj) : on prend le premier sous-dossier
   * dont le nom contient « sfx » (ex. 02_SFX) ou « musique » / « music » (ex. 01_Musique) ; sinon on crée
   * « SFX » ou « Musique ». null si le projet n'est pas encore enregistré.
   */
  var catDirs = {};
  var CAT_DIR = { music: { keys: ['musique', 'music'], create: 'Musique' }, sfx: { keys: ['sfx'], create: 'SFX' } };
  function projectRoot() { return hasNode && /\.prproj$/i.test(projectPath) ? Lib.dirname(projectPath) : ''; }
  /** Chemin du dossier de catégorie, sans rien créer (existant, sinon celui qui sera créé) */
  function findCatDir(cat) {
    var root = projectRoot(), def = CAT_DIR[cat] || CAT_DIR.music;
    if (!root) return null;
    if (catDirs[cat] && Lib.exists(catDirs[cat])) return catDirs[cat];
    var found = Lib.listDirs(root).sort().filter(function (n) {
      var low = n.toLowerCase();
      return def.keys.some(function (k) { return low.indexOf(k) >= 0; });
    })[0];
    return Lib.joinPath(root, found || def.create);
  }
  /** Idem, en créant le dossier : seulement au moment d'y écrire un fichier */
  function catDir(cat) {
    var dir = findCatDir(cat);
    if (!dir) return null;
    Lib.ensureDir(dir);
    catDirs[cat] = dir;
    return dir;
  }
  /** Dossier de sortie (rendus, extraits, copies) : dossier du projet, sinon dossier de secours */
  function outDir(cat, sub) {
    var d = catDir(cat);
    if (d) return d;
    var base = prefs.renderDir || Lib.defaultRenderDir();
    return sub ? Lib.joinPath(base, sub) : base;
  }
  /** Nom du chutier Premiere = nom du dossier disque (cohérence projet / disque) */
  function binNameFor(cat) { var d = findCatDir(cat); return d ? Lib.basename(d) : (cat === 'sfx' ? 'SFX' : 'Musique'); }
  function safeName(s) { return String(s).replace(/[<>:"/\\|?*]/g, '_'); }
  function isMp3(p) { return /\.mp3$/i.test(p); }
  function uniquePath(dir, base, ext) {
    var p = Lib.joinPath(dir, base + ext), k = 2;
    while (Lib.exists(p)) p = Lib.joinPath(dir, base + '_' + (k++) + ext);
    return p;
  }

  /** Format de sortie : fréquence (et résolution) du fichier source ; MP3 → WAV 16 bits à sa fréquence */
  var infoCache = {};
  function sourceFormat(f) {
    if (infoCache[f.path]) return Promise.resolve(infoCache[f.path]);
    var p = f.synth ? Promise.resolve(null) : Lib.audioInfo(f.path);
    return p.then(function (info) {
      var fmtOut = {
        sampleRate: info && info.sampleRate ? info.sampleRate : (state.buffer ? state.buffer.sampleRate : 48000),
        bits: info && info.format === 'mp3' ? 16 : info && info.bits === 16 ? 16 : 24,
        mp3: !!(info && info.format === 'mp3')
      };
      infoCache[f.path] = fmtOut;
      return fmtOut;
    });
  }

  /**
   * Fichier à importer dans Premiere selon la préférence :
   *  - « copier » : copie dans le dossier Musique / SFX du projet (MP3 → WAV à sa fréquence) ;
   *  - « sur place » : le fichier d'origine.
   * Les copies sont réutilisées (même nom, même taille) au lieu d'être dupliquées.
   */
  var prepared = {};
  function copyMode() { return prefs.fileMode !== 'link'; }
  function preparedKey(f) { return f.cat + '|' + f.path; }
  function preparedPath(f) {
    var p = prepared[preparedKey(f)];
    return p && Lib.exists(p) ? p : null;
  }
  function prepareForProject(f) {
    if (f.synth || !hasNode || !copyMode() || !projectRoot()) return Promise.resolve(f.path); // projet non enregistré : sur place
    var ready = preparedPath(f);
    if (ready) return Promise.resolve(ready);
    try {
      var dir = catDir(f.cat);
      var base = safeName(Lib.stripExt(f.name));
      if (!isMp3(f.path)) {
        var dst = copyIntoProject(f, dir, base);
        return Promise.resolve(dst);
      }
    } catch (e) { return Promise.reject(e); }
    return convertMp3(f, dir, base);
  }
  /** Copie WAV / AIFF / … dans le dossier du projet (réutilise une copie identique déjà présente) */
  function copyIntoProject(f, dir, base) {
    var same = Lib.joinPath(dir, safeName(f.name));
    var dst = f.path === same || (Lib.exists(same) && Lib.fileSize(same) === f.size) ? same : uniquePath(dir, base, Lib.extname(f.name));
    if (!Lib.exists(dst)) Lib.copyFileSync(f.path, dst);
    prepared[preparedKey(f)] = dst;
    return dst;
  }
  function convertMp3(f, dir, base) {
    // MP3 → WAV à la fréquence du MP3 (16 bits)
    var wav = Lib.joinPath(dir, base + '.wav');
    if (Lib.exists(wav)) { prepared[preparedKey(f)] = wav; return Promise.resolve(wav); }
    return sourceFormat(f).then(function (fo) {
      return Lib.readFileAsArrayBuffer(f.path).then(function (ab) { return An.decode(ab, fo.sampleRate); }).then(function (buf) {
        return Lib.writeFile(wav, Fx.encodeWav(buf, 16));
      }).then(function () { prepared[preparedKey(f)] = wav; return wav; });
    });
  }
  /** Libellé du dossier / chutier de destination pour les messages */
  function destLabel(f) { return copyMode() && projectRoot() ? '« ' + binNameFor(f.cat) + ' »' : 'le chutier « ' + binNameFor(f.cat) + ' »'; }

  // ---------- Actions Premiere ----------
  function placeTrack(f) {
    if (!f || f.synth) { toast('Placement disponible dans Premiere Pro avec vos propres fichiers.', 'err'); return; }
    var io = currentIO(f.path);
    toast(copyMode() && projectRoot() && isMp3(f.path) && !preparedPath(f) ? 'Conversion MP3 → WAV dans ' + destLabel(f) + '…' : io ? 'Placement de l\'extrait In → Out…' : 'Placement sur la timeline…', 'busy', true);
    prepareForProject(f).then(function (path) {
      var args = [path, f.duration || 60, io ? io.a : null, io ? io.b : null, f.cat, binNameFor(f.cat)];
      return jsx('insertAtPlayhead', args).then(function (r) {
        if (r.success) toast((io ? 'Extrait ' + fmt(io.a, true) + ' → ' + fmt(io.b, true) + ' placé' : 'Placé') + ' sur « ' + r.track + ' » à ' + fmt(r.at, true) + '.');
        else toast(r.error, 'err');
      });
    }).catch(function (e) { toast('Préparation impossible : ' + (e && e.message ? e.message : e), 'err'); });
  }
  function importFile(f) {
    if (f.synth) { toast('Import disponible dans Premiere Pro avec vos propres fichiers.', 'err'); return; }
    prepareForProject(f).then(function (path) {
      return jsx('importOnly', [path, f.cat, binNameFor(f.cat)]).then(function (r) {
        if (r.success) toast('« ' + f.title + ' » importé dans ' + destLabel(f) + (path !== f.path ? ' (copie dans le dossier du projet)' : '') + '.');
        else toast(r.error, 'err');
      });
    }).catch(function (e) { toast('Préparation impossible : ' + (e && e.message ? e.message : e), 'err'); });
  }

  // ---------- In / Out dans la bibliothèque ----------
  /** In / Out du morceau chargé s'il s'agit de ce fichier (sinon null = fichier entier) */
  function currentIO(path) {
    var f = state.current;
    if (!f || f.path !== path || (state.inPt == null && state.outPt == null)) return null;
    var r = region();
    return r.b - r.a > 0.05 ? { a: r.a, b: r.b } : null;
  }

  /**
   * Le glisser-déposer ne transporte qu'un fichier : quand In / Out est posé, on écrit l'extrait en WAV
   * (fréquence du fichier source, micro-fondus de 4 ms) dans le dossier Musique / SFX du projet.
   */
  var excerpt = { key: null, path: null }, excerptTimer = null;
  function excerptKey(f, io) { return f.path + '|' + io.a.toFixed(3) + '|' + io.b.toFixed(3); }
  /** Supprime l'extrait préparé s'il n'a jamais servi (In / Out effacés, autre morceau, fermeture) */
  function dropUnusedExcerpt() {
    if (excerpt.path && !excerpt.used && excerpt.created) Lib.removeFile(excerpt.path);
    excerpt.key = null; excerpt.path = null; excerpt.used = false; excerpt.created = false;
  }
  function scheduleExcerpt() { clearTimeout(excerptTimer); excerptTimer = setTimeout(buildExcerpt, 900); }
  function buildExcerpt() {
    var f = state.current, buf = state.buffer;
    if (!f || f.synth || !hasNode || !buf) return;
    var io = currentIO(f.path);
    if (!io) return;
    var key = excerptKey(f, io);
    if (excerpt.key === key && excerpt.path) return;
    // l'extrait précédent n'a jamais été glissé : on le supprime pour ne pas encombrer le dossier du projet
    if (excerpt.path && !excerpt.used && excerpt.created) Lib.removeFile(excerpt.path);
    excerpt.key = key; excerpt.path = null; excerpt.used = false; excerpt.created = false;
    refreshDragLabel();
    var tag = fmt(io.a, true).replace(':', 'm').replace('.', 's') + '-' + fmt(io.b, true).replace(':', 'm').replace('.', 's');
    var p = Lib.joinPath(outDir(f.cat, 'Extraits'), safeName(Lib.stripExt(f.name)) + '_' + tag + '.wav');
    var done = function () { if (excerpt.key === key) { excerpt.path = p; refreshDragLabel(); } };
    if (Lib.exists(p)) return done();
    sourceFormat(f).then(function (fo) {
      return Fx.renderSlice(buf, io.a, io.b, fo.sampleRate).then(function (out) { return Lib.writeFile(p, Fx.encodeWav(out, fo.bits)); });
    }).then(function () {
      if (excerpt.key === key) excerpt.created = true; else Lib.removeFile(p); // In / Out a bougé pendant l'écriture
      done();
    }).catch(function (e) { toast('Extrait impossible : ' + (e && e.message ? e.message : e), 'err'); });
  }
  /**
   * Chemin à glisser : extrait In / Out s'il est prêt ; sinon, en mode « copier », la copie dans le
   * dossier du projet (copie immédiate pour un WAV/AIFF, conversion à préparer pour un MP3).
   */
  function dragPathFor(f) {
    if (f.synth) return null;
    var io = currentIO(f.path);
    if (io) {
      if (excerpt.path && excerpt.key === excerptKey(f, io)) { excerpt.used = true; return excerpt.path; }
      toast('Extrait In → Out en préparation, réessayez dans un instant.', 'busy');
      buildExcerpt();
      return false;
    }
    if (!copyMode() || !projectRoot()) return f.path;
    var ready = preparedPath(f);
    if (ready) return ready;
    if (!isMp3(f.path)) {
      try { return copyIntoProject(f, catDir(f.cat), safeName(Lib.stripExt(f.name))); }
      catch (e) { toast('Copie impossible : ' + e.message, 'err'); return false; }
    }
    toast('Conversion MP3 → WAV dans ' + destLabel(f) + '… glissez à nouveau dans un instant.', 'busy');
    prepareForProject(f).then(function () { toast('Prêt : glissez « ' + f.title + ' » vers la timeline.'); refreshDragLabel(); })
      .catch(function (e) { toast('Conversion impossible : ' + e.message, 'err'); });
    return false;
  }
  function refreshDragLabel() {
    var el = $('#dragCur');
    if (!el || !state.current) return;
    var io = currentIO(state.current.path);
    el.innerHTML = icon('grip') + (io ? (excerpt.path && excerpt.key === excerptKey(state.current, io) ? 'Glisser l\'extrait' : 'Extrait…') : 'Glisser');
    el.title = io ? 'Glisser l\'extrait In → Out vers la timeline' : 'Glisser vers la timeline ou le projet';
    var pl = $('#btnPlace');
    if (pl) pl.title = io ? 'Placer l\'extrait In → Out à la tête de lecture' : 'Placer sur la timeline à la tête de lecture';
  }

  // ---------- Beats ----------
  var MARKER_COLORS = ['#4ade80', '#f87171', '#c084fc', '#fb923c', '#facc15', '#f4f4f5', '#60a5fa', '#22d3ee'];
  var MARKER_NAMES = ['Vert', 'Rouge', 'Violet', 'Orange', 'Jaune', 'Blanc', 'Bleu', 'Cyan'];

  function seg(name, value, options) {
    return '<div class="seg" data-seg="' + name + '">' + options.map(function (o) {
      return '<button data-v="' + o[0] + '" class="' + (String(value) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function bindSeg(root, name, cb) {
    var s = root.querySelector('[data-seg="' + name + '"]');
    if (!s) return;
    Array.prototype.forEach.call(s.children, function (b) {
      b.onclick = function () {
        Array.prototype.forEach.call(s.children, function (x) { x.classList.toggle('on', x === b); });
        cb(b.getAttribute('data-v'));
      };
    });
  }
  function noTrack(v, what) {
    v.innerHTML = '<div class="card empty"><div class="big">' + icon(what === 'beats' ? 'activity' : 'wand') + '</div><h3>Choisissez un morceau</h3>' +
      '<div>' + (what === 'beats'
        ? 'Sélectionnez un titre dans la Bibliothèque : Ongaku détecte le BPM et les temps, puis pose les marqueurs dans votre séquence.'
        : 'Sélectionnez un titre dans la Bibliothèque, puis choisissez le point de fin et l\'effet : reverb tail, vinyl stop ou fondu.') +
      '</div><button class="btn-primary" id="goMusic">' + icon('music') + 'Aller à la bibliothèque</button></div>';
    $('#goMusic').onclick = function () { prefs.tab = 'music'; savePrefs(); renderTabs(); renderView(); };
  }

  function renderBeats() {
    var v = $('#view'), f = state.current;
    if (!f) return noTrack(v, 'beats');
    var o = prefs.beats, list = f.analyzed ? markerList() : [];
    v.innerHTML =
      '<div class="scroll"><div class="card">' +
      '<div class="tiles">' +
      '<div class="tile"><div class="k">Tempo détecté</div><div class="v">' + (f.analyzed ? currentBpm() + ' BPM' : 'Analyse…') +
      '<span style="flex:1"></span><button class="chip" id="bpmHalf" title="Moitié">÷2</button><button class="chip" id="bpmDouble" title="Double">×2</button></div></div>' +
      '<div class="tile"><div class="k">Marqueurs à poser</div><div class="v">' + list.length + '</div></div>' +
      '</div>' +
      '<div class="hint" style="margin-top:10px">Traits pleins = <b>temps forts</b> (1er temps de chaque mesure). Avec <b>In</b> / <b>Out</b>, seuls les marqueurs de la zone sont posés.</div>' +
      '</div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:12px">' +
      '<div class="field"><div class="lbl">Un marqueur sur</div>' +
      seg('density', o.density, [['beat', 'Chaque temps'], ['half', '1 temps / 2'], ['bar', 'Chaque mesure'], ['transients', 'Transitoires']]) + '</div>' +
      '<div class="grid2">' +
      '<div class="field"><div class="lbl">Décalage <b id="offVal">' + (o.offset > 0 ? '+' : '') + o.offset + ' ms</b></div><input type="range" id="offset" min="-150" max="150" step="5" value="' + o.offset + '"/></div>' +
      '<div class="field"><div class="lbl">Couleur <b>' + MARKER_NAMES[o.color] + '</b></div><div class="swatches">' +
      MARKER_COLORS.map(function (c, i) { return '<button class="swatch ' + (o.color === i ? 'on' : '') + '" data-c="' + i + '" style="background:' + c + '" title="' + MARKER_NAMES[i] + '"></button>'; }).join('') +
      '</div></div></div>' +
      '<div class="hint">Les marqueurs sont posés <b>sur le clip</b> (dans le chutier Musique / SFX) : ils apparaissent sur toutes ses occurrences dans la timeline et le suivent quand vous le déplacez ou le raccourcissez.</div>' +
      '<div class="btn-row"><button class="btn-primary" id="btnMarkers"' + (list.length ? '' : ' disabled') + '>' + icon('flag') + 'Poser ' + list.length + ' marqueur' + (list.length > 1 ? 's' : '') + '</button>' +
      '<button class="btn-ghost danger" id="btnClear" style="flex:0 0 auto">' + icon('trash') + 'Effacer</button></div>' +
      '</div></div>';

    bindSeg(v, 'density', function (x) { o.density = x; savePrefs(); renderBeats(); drawMain(); });
    $('#bpmHalf').onclick = function () { state.beatScale = state.beatScale === 2 ? 1 : 0.5; renderBeats(); renderPlayerHead(); drawMain(); };
    $('#bpmDouble').onclick = function () { state.beatScale = state.beatScale === 0.5 ? 1 : 2; renderBeats(); renderPlayerHead(); drawMain(); };
    var off = $('#offset');
    off.oninput = function () { o.offset = +off.value; $('#offVal').textContent = (o.offset > 0 ? '+' : '') + o.offset + ' ms'; drawMain(); };
    off.onchange = function () { savePrefs(); renderBeats(); };
    Array.prototype.forEach.call(v.querySelectorAll('[data-c]'), function (b) {
      b.onclick = function () { o.color = +b.getAttribute('data-c'); savePrefs(); renderBeats(); };
    });
    $('#btnMarkers').onclick = function () {
      if (f.synth) { toast('Marqueurs disponibles dans Premiere Pro avec vos propres fichiers.', 'err'); return; }
      var l = markerList();
      toast('Pose de ' + l.length + ' marqueurs sur le clip…', 'busy', true);
      // les marqueurs vont sur le clip réellement importé (la copie du projet en mode « copier »)
      prepareForProject(f).then(function (path) {
        return jsx('addClipMarkers', [path, JSON.stringify(l), o.color, currentBpm() ? currentBpm() + ' BPM' : '', f.cat, binNameFor(f.cat)]).then(function (r) {
          if (r.success) toast(r.count + ' marqueur(s) posé(s) sur le clip « ' + r.name + ' »' + (r.removed ? ' (' + r.removed + ' ancien(s) remplacé(s))' : '') + '.');
          else toast(r.error, 'err');
        });
      }).catch(function (e) { toast('Préparation impossible : ' + (e && e.message ? e.message : e), 'err'); });
    };
    $('#btnClear').onclick = function () {
      if (f.synth) return;
      jsx('clearClipMarkers', [preparedPath(f) || f.path]).then(function (r) {
        if (r.success) toast(r.count + ' marqueur(s) Ongaku supprimé(s) du clip.'); else toast(r.error, 'err');
      });
    };
  }

  // ---------- Fins (effets) ----------
  var EFFECTS = [
    { id: 'reverb', name: 'Reverb tail', icon: 'waves', desc: 'Coupe nette, la réverbe du dernier accord s\'épanouit.' },
    { id: 'vinyl', name: 'Vinyl stop', icon: 'disc', desc: 'La platine ralentit jusqu\'à l\'arrêt.' },
    { id: 'fade', name: 'Fondu', icon: 'fade', desc: 'Fondu de sortie qui finit pile au point choisi.' }
  ];
  function slider(id, label, val, min, max, step, unit) {
    return '<div class="field"><div class="lbl">' + label + ' <b id="' + id + 'Val" class="editable" data-edit="' + id + '" data-min="' + min + '" data-max="' + max + '" title="Cliquer pour saisir une valeur">' + val + unit + '</b></div>' +
      '<input type="range" id="' + id + '" data-unit="' + unit + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"/></div>';
  }

  var VINYL_STYLES = [
    { id: 'motor', label: 'Moteur coupé', stop: 2, curve: 0.85 },
    { id: 'dj', label: 'DJ', stop: 1.2, curve: 1.25 },
    { id: 'brake', label: 'Frein à la main', stop: 0.55, curve: 1.9 }
  ];
  function vinylStyleOf(o) {
    var s = VINYL_STYLES.filter(function (x) { return Math.abs(x.stop - o.stop) < 0.01 && Math.abs(x.curve - o.curve) < 0.01; })[0];
    return s ? s.id : '';
  }

  function renderFins() {
    var v = $('#view'), f = state.current;
    if (!f) return noTrack(v, 'fins');
    var o = prefs.fx;
    var start = state.inPt != null ? state.inPt : 0;
    var params = o.effect === 'reverb'
      ? slider('tail', 'Longueur de la queue', o.tail, 1, 10, 0.5, ' s') + slider('size', 'Taille / douceur', o.size, 0, 1, 0.05, '') +
        slider('mix', 'Quantité', o.mix, 0.1, 1.5, 0.05, '') + slider('window', 'Envoi (avant la coupe)', o.window, 0.2, 3, 0.1, ' s')
      : o.effect === 'vinyl'
        ? slider('stop', 'Durée de l\'arrêt', o.stop, 0.3, 4, 0.05, ' s') + slider('curve', 'Freinage (élan → sec)', o.curve, 0.5, 2.5, 0.05, '') +
          '<div class="toggle ' + (o.crackle ? 'on' : '') + '" data-tg="crackle"><span class="sw"></span>Craquements du disque</div>' +
          '<div class="toggle ' + (o.wow ? 'on' : '') + '" data-tg="wow"><span class="sw"></span>Pleurage (wow)</div>'
        : slider('fade', 'Durée du fondu', o.fade, 0.5, 12, 0.5, ' s');
    var res = state.lastRender;
    v.innerHTML =
      '<div class="scroll">' +
      '<div class="fx-cards">' + EFFECTS.map(function (e) {
        return '<button class="fx-card ' + (o.effect === e.id ? 'on' : '') + '" data-fx="' + e.id + '"><div class="ic">' + icon(e.icon) + '</div>' +
          '<div class="n">' + e.name + '</div><div class="d">' + e.desc + '</div></button>';
      }).join('') + '</div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:12px">' +
      '<div class="summary">' + (state.outPt != null
        ? '<span class="editable" data-edit="in" title="Début (In) : cliquer pour saisir">' + fmt(start, true) + '</span>' + icon('back', 'flip') +
          '<b class="editable" data-edit="out" title="Point de fin (Out) : cliquer pour saisir">' + fmt(state.outPt, true) + '</b><span class="sep"></span>durée finale ' +
          '<b class="editable" data-edit="final" title="Durée finale : cliquer pour saisir (déplace la fin)">' + fmt(state.outPt - start + extraFor(o), true) + '</b>'
        : icon('markOut') + '<span>Posez la fin avec <b>Out</b> (touche O) sous l\'onde</span>') + '</div>' +
      '<div class="selects">' +
      dropdown('snap', 'Caler la fin sur', o.snap, [['beat', 'Le temps'], ['bar', 'La mesure'], ['off', 'Libre']]) +
      (o.effect === 'vinyl' ? dropdown('vstyle', 'Style', vinylStyleOf(o), [['', 'Personnalisé']].concat(VINYL_STYLES.map(function (s) { return [s.id, s.label]; }))) : '') +
      '</div>' +
      '<div class="grid2">' + params + '</div>' +
      '<div class="btn-row">' +
      '<button class="btn-ghost" id="btnPreview"' + (state.buffer && state.outPt != null ? '' : ' disabled') + '>' + icon('headphones') + (state.pv ? 'Recalculer' : 'Pré-écouter') + '</button>' +
      '<button class="btn-primary" id="btnRender"' + (state.buffer && state.outPt != null ? '' : ' disabled') + '>' + icon('plus') + 'Rendre &amp; placer</button>' +
      '</div>' +
      '<button class="btn-ghost" id="btnRenderOnly" style="align-self:center;padding:6px 14px"' + (state.buffer && state.outPt != null ? '' : ' disabled') + '>' + icon('download') + 'Rendre dans le chutier seulement</button>' +
      (res ? '<div class="result" id="resultChip" draggable="true" title="Glisser vers la timeline">' + icon('grip') + '<span class="nm">' + esc(Lib.basename(res.path)) + '</span>' +
        '<span class="pill">' + fmt(res.duration) + '</span><button class="act" id="btnReveal" title="Afficher dans l\'explorateur">' + icon('external') + '</button></div>' : '') +
      '</div></div>';

    Array.prototype.forEach.call(v.querySelectorAll('[data-fx]'), function (b) {
      b.onclick = function () { o.effect = b.getAttribute('data-fx'); savePrefs(); renderFins(); };
    });
    $('#dd-snap').onchange = function () {
      o.snap = this.value; savePrefs();
      if (state.inPt != null) state.inPt = snapTime(state.inPt);
      if (state.outPt != null) state.outPt = snapTime(state.outPt);
      afterIO();
    };
    if ($('#dd-vstyle')) $('#dd-vstyle').onchange = function () {
      var id = this.value, s = VINYL_STYLES.filter(function (x) { return x.id === id; })[0];
      if (s) { o.stop = s.stop; o.curve = s.curve; savePrefs(); }
      renderFins();
    };
    Array.prototype.forEach.call(v.querySelectorAll('[data-tg]'), function (t) {
      t.onclick = function () { var k = t.getAttribute('data-tg'); o[k] = !o[k]; savePrefs(); t.classList.toggle('on', o[k]); };
    });
    Array.prototype.forEach.call(v.querySelectorAll('input[type=range]'), function (inp) {
      inp.oninput = function () { o[inp.id] = +inp.value; $('#' + inp.id + 'Val').textContent = inp.value + inp.getAttribute('data-unit'); };
      inp.onchange = function () { savePrefs(); renderFins(); };
    });
    bindEditables(v, o);
    $('#btnPreview').onclick = function () { doRender('preview'); };
    $('#btnRender').onclick = function () { doRender('place'); };
    $('#btnRenderOnly').onclick = function () { doRender('import'); };
    if (res) {
      bindDrag($('#resultChip'), function () { return res.path; });
      $('#btnReveal').onclick = function (e) { e.stopPropagation(); Lib.reveal(res.path); };
    }
  }
  /** « 1:20.05 », « 1:20,05 », « 80.05 », « 80 » → secondes (NaN si illisible) */
  function parseTime(str) {
    var s = String(str).trim().replace(',', '.').replace(/\s*s$/i, '');
    var m = /^(\d+):(\d+(?:\.\d*)?)$/.exec(s);
    if (m) return +m[1] * 60 + +m[2];
    return /^\d+(\.\d*)?$/.test(s) ? +s : NaN;
  }

  /**
   * Valeurs cliquables de l'onglet Fins : un clic ouvre un petit champ, Entrée valide, Échap annule.
   * Réglages : bornés au curseur. Temps : In, Out (calés sur le temps si l'option est active) ou durée finale.
   */
  function bindEditables(v, o) {
    Array.prototype.forEach.call(v.querySelectorAll('.editable'), function (el) {
      el.onclick = function (e) {
        e.stopPropagation();
        var key = el.getAttribute('data-edit'), isTime = key === 'in' || key === 'out' || key === 'final';
        var inp = document.createElement('input');
        inp.className = 'inline-edit';
        inp.value = isTime ? el.textContent : String(o[key]);
        el.replaceWith(inp);
        inp.focus(); inp.select();
        var done = false;
        var finish = function (commit) {
          if (done) return;
          done = true;
          if (commit) {
            var val = isTime ? parseTime(inp.value) : parseFloat(String(inp.value).replace(',', '.'));
            if (!isFinite(val)) toast('Valeur illisible : ' + inp.value, 'err');
            else if (isTime) setTimeValue(key, val, o);
            else {
              var min = +el.getAttribute('data-min'), max = +el.getAttribute('data-max');
              o[key] = Math.round(Math.max(min, Math.min(max, val)) * 1000) / 1000;
              savePrefs();
            }
          }
          renderFins();
        };
        inp.onkeydown = function (ev) {
          if (ev.key === 'Enter') finish(true);
          else if (ev.key === 'Escape') { ev.stopPropagation(); finish(false); }
        };
        inp.onblur = function () { finish(true); };
      };
    });
  }
  function setTimeValue(key, val, o) {
    var dur = state.buffer ? state.buffer.duration : (state.current && state.current.duration) || 0;
    var start = state.inPt != null ? state.inPt : 0;
    if (key === 'final') { key = 'out'; val = start + val - extraFor(o); }
    val = Math.max(0, Math.min(dur, val));
    if (prefs.fx.snap !== 'off') val = snapTime(val);
    if (key === 'in') {
      if (state.outPt != null && val > state.outPt - 0.2) { toast('Le début doit précéder la fin.', 'err'); return; }
      state.inPt = val;
    } else {
      if (val < start + 0.5) { toast('La fin doit être au moins 0,5 s après le début.', 'err'); return; }
      state.outPt = val;
    }
    afterIO();
  }

  /** Menu déroulant compact (libellé au-dessus) */
  function dropdown(id, label, value, options) {
    return '<label class="dd"><span>' + label + '</span><select id="dd-' + id + '">' + options.map(function (op) {
      return '<option value="' + op[0] + '"' + (String(value) === String(op[0]) ? ' selected' : '') + '>' + op[1] + '</option>';
    }).join('') + '</select></label>';
  }
  function extraFor(o) { return o.effect === 'reverb' ? o.tail : o.effect === 'vinyl' ? o.stop + 0.15 : 0; }

  var FX_FILE = { reverb: 'ReverbTail', vinyl: 'VinylStop', fade: 'Fondu' };
  function doRender(kind) {
    var f = state.current;
    if (!state.buffer || state.outPt == null) return;
    var start = state.inPt != null ? state.inPt : 0, end = state.outPt;
    if (end - start < 0.5) { toast('Le point de fin doit être au moins 0,5 s après le début.', 'err'); return; }
    if (kind !== 'preview' && (!hasNode || f.synth)) { toast('Le rendu en fichier est disponible dans Premiere Pro avec vos propres morceaux.', 'err'); return; }
    var opts = Object.assign({}, prefs.fx, { start: start, end: end });
    var bin = binNameFor(f.cat);
    // rendu à la fréquence (et résolution) du fichier source : un MP3 44,1 kHz donne un WAV 44,1 kHz 16 bits
    sourceFormat(f).then(function (fo) {
      if (kind !== 'preview') opts.sampleRate = fo.sampleRate;
      toast(kind === 'preview' ? 'Calcul de la pré-écoute…' : 'Rendu de la fin en WAV ' + (fo.sampleRate / 1000).toLocaleString('fr-FR') + ' kHz · ' + fo.bits + ' bits…', 'busy', true);
      return Fx.render(state.buffer, opts).then(function (out) {
        if (kind === 'preview') {
          $('#toast').innerHTML = '';
          openPreview(out, end - start, EFFECTS.filter(function (x) { return x.id === opts.effect; })[0].name);
          return;
        }
        var t = fmt(end, true).replace(':', 'm').replace('.', 's');
        var p = uniquePath(outDir(f.cat), safeName(Lib.stripExt(f.name)) + '_Ongaku_' + FX_FILE[opts.effect] + '_' + t, '.wav');
        return Lib.writeFile(p, Fx.encodeWav(out, fo.bits)).then(function () {
          state.lastRender = { path: p, duration: out.duration };
          if (prefs.tab === 'fins') renderFins();
          if (kind === 'place') {
            return jsx('insertAtPlayhead', [p, out.duration, null, null, f.cat, bin]).then(function (r) {
              if (r.success) toast('Fin « ' + EFFECTS.filter(function (x) { return x.id === opts.effect; })[0].name + ' » placée sur « ' + r.track + ' » (fichier dans « ' + bin + ' »).');
              else toast('Rendu enregistré, mais : ' + r.error, 'err');
            });
          }
          return jsx('importOnly', [p, f.cat, bin]).then(function (r) {
            if (r.success) toast('Rendu importé dans « ' + bin + ' ».'); else toast('Rendu enregistré : ' + p);
          });
        });
      });
    }).catch(function (e) { toast('Rendu impossible : ' + (e && e.message ? e.message : e), 'err'); });
  }

  // ==================== Réglages ====================
  function pickFolder(title, cb) {
    var fsApi = window.cep && window.cep.fs;
    if (!fsApi) { toast('Sélecteur indisponible : collez le chemin du dossier dans le champ.', 'err'); return; }
    var r = fsApi.showOpenDialogEx ? fsApi.showOpenDialogEx(false, true, title, '') : fsApi.showOpenDialog(false, true, title, '');
    if (r && r.data && r.data.length) cb(r.data[0]);
  }
  function addFolderPath(p, cat) {
    cat = cat || prefs.category;
    p = String(p || '').trim().replace(/^"|"$/g, '').replace(/[\\/]+$/, '');
    if (!p) return;
    if (!Lib.exists(p)) { toast('Dossier introuvable : ' + p, 'err'); return; }
    var list = folders(cat);
    if (list.indexOf(p) >= 0) { toast('Ce dossier est déjà dans « ' + CATS[cat].label + ' ».', 'err'); return; }
    list.push(p);
    // on affiche la section où le dossier vient d'être ajouté
    prefs.category = cat; prefs.folderFilter = ''; prefs.tab = 'music';
    savePrefs();
    if ($('#settings').classList.contains('open')) renderSettings();
    renderTabs();
    rescan().then(function () { toast(catCount(cat) + ' fichier(s) dans « ' + CATS[cat].label + ' ».'); });
  }
  function addFolder(cat) {
    cat = cat || prefs.category;
    pickFolder(cat === 'sfx' ? 'Choisir un dossier d\'effets sonores' : 'Choisir un dossier musique', function (p) { addFolderPath(p, cat); });
  }
  function removeFolder(cat, i) {
    var d = folders(cat).splice(i, 1)[0];
    if (prefs.folderFilter === d) prefs.folderFilter = '';
    savePrefs();
    if ($('#settings').classList.contains('open')) renderSettings();
    rescan().then(renderView);
  }

  // ==================== Apparence (partagée avec Mori et Sori, presets compatibles) ====================
  var BUILTIN_PRESETS = [
    { id: 'defaut', name: 'Défaut', background: '#0c1322', accent: '#8ea8f7', primary: '#fbe6a6', brandColor: '#a9bfff', builtIn: true }
  ];
  var DEFAULT_APPEARANCE = {
    theme: { background: '#0c1322', accent: '#8ea8f7', primary: '#fbe6a6' },
    brandLabel: 'Avril Films', brandColor: '#a9bfff', visibleTabs: ['music', 'beats', 'fins'], userPresets: []
  };
  function appearance() {
    if (!prefs.appearance) {
      prefs.appearance = JSON.parse(JSON.stringify(DEFAULT_APPEARANCE));
      if (typeof prefs.brand === 'string') prefs.appearance.brandLabel = prefs.brand; // ancien réglage v1
    }
    var a = prefs.appearance;
    a.theme = Object.assign({}, DEFAULT_APPEARANCE.theme, a.theme || {});
    if (!Array.isArray(a.userPresets)) a.userPresets = [];
    if (!Array.isArray(a.visibleTabs) || !a.visibleTabs.length) a.visibleTabs = DEFAULT_APPEARANCE.visibleTabs.slice();
    return a;
  }

  /**
   * Démarrage : thème, nom affiché et presets viennent du fichier partagé (Mori, Ongaku, Sori).
   * S'il n'existe pas encore, Ongaku le crée avec ses propres réglages. Les onglets restent propres à Ongaku.
   */
  function syncSharedAppearance() {
    var S = window.SuiteTheme, a = appearance();
    if (!S) return;
    var shared = S.read();
    if (shared) { Object.assign(a, shared); savePrefs(); } else S.write(a, 'Ongaku');
  }
  /** Un autre panneau a changé l'apparence partagée : appliquée en direct */
  function onSharedAppearance(shared) {
    Object.assign(appearance(), shared);
    savePrefs();
    applyAppearance();
    var s = $('#settings');
    if (s.classList.contains('open') && setTab === 'appearance' && !(document.activeElement && s.contains(document.activeElement))) renderSettings();
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

  /** Même calcul que Mori : nuances zinc / accent / cream / ink posées en variables CSS */
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
    // lignes / verres : blancs translucides sur fond sombre, noirs sur fond clair
    root.setProperty('--line', isLight ? 'rgb(0 0 0 / 0.12)' : 'rgb(255 255 255 / 0.10)');
    root.setProperty('--line-strong', isLight ? 'rgb(0 0 0 / 0.22)' : 'rgb(255 255 255 / 0.18)');
    root.setProperty('--glass', isLight ? 'rgb(0 0 0 / 0.03)' : 'rgb(255 255 255 / 0.03)');
  }

  // ---------- Barre d'état : Ongaku · libellé · projet ouvert · connexion ----------
  var projectName = '', projectPath = '', projectTimer = null;
  function renderStatus() {
    var a = appearance(), el = $('#status');
    if (!el) return;
    el.innerHTML =
      '<span class="dot' + (inCEP ? ' on' : '') + '" title="' + (inCEP ? 'Connecté à Premiere Pro' : 'Hors de Premiere Pro') + '"></span>' +
      '<button class="app" id="btnAbout" title="À propos d\'Ongaku">Ongaku</button>' +
      (a.brandLabel ? '<span style="color:' + esc(a.brandColor) + '">' + esc(a.brandLabel) + '</span>' : '') +
      (inCEP && projectName ? '<span>·</span><span class="proj" title="' + esc(projectName) + '">' + esc(projectName) + '</span>' : '') +
      '<span>·</span><span>' + (inCEP ? 'Connecté à Premiere Pro' : 'Hors de Premiere Pro') + '</span>';
    $('#btnAbout').onclick = function (e) { e.stopPropagation(); toggleAbout(); };
  }

  /** Petite fenêtre « À propos » au-dessus de la barre d'état */
  function toggleAbout(force) {
    var el = $('#about');
    var open = force !== undefined ? force : !el.classList.contains('open');
    if (!open) { el.classList.remove('open'); return; }
    el.innerHTML =
      '<div class="about-logo"><span class="logo-glyph"></span></div>' +
      '<div class="about-name">Ongaku <span>' + APP_VERSION + '</span></div>' +
      '<div class="about-line">Par <b>Paul-Eliot</b></div>' +
      '<div class="about-line">Libre et Open Source</div>' +
      '<div class="about-line muted">Claude Code</div>' +
      '<div class="about-copy">© ' + new Date().getFullYear() + ' Paul-Eliot</div>';
    el.classList.add('open');
  }
  /** Nom du projet relu toutes les 5 s pour suivre un changement de projet */
  function watchProject() {
    if (!inCEP) return;
    var refresh = function () {
      if (closing) return;
      cs.evalScript('app.project ? app.project.name + "|" + app.project.path : ""', function (r) {
        var ok = r && r !== 'EvalScript error.' && r !== 'undefined' && r !== 'null';
        var parts = ok ? String(r).split('|') : ['', ''];
        var name = parts[0] || '', path = parts.slice(1).join('|');
        if (path !== projectPath) { projectPath = path; catDirs = {}; }
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
    drawMain();
    visible.forEach(function (f) { drawMini(rowEls.get(f.path), f); });
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
  var setTab = 'library', setUi = { exportCode: '', showImport: false, importError: '', presetName: '' };
  function openSettings() { renderSettings(); $('#settings').classList.add('open'); }
  function closeSettings() { $('#settings').classList.remove('open'); setUi.exportCode = ''; setUi.showImport = false; setUi.importError = ''; }

  function projectFoldersHint() {
    return 'À la racine du projet (dossier du .prproj), Ongaku utilise le dossier dont le nom contient <b>musique</b> ou <b>sfx</b> ' +
      '(ex. <b>01_Musique</b>, <b>02_SFX</b>) et le crée s\'il n\'existe pas ; le chutier Premiere porte le même nom. ' +
      'Les rendus d\'effets et les extraits In / Out y sont toujours écrits. En copie, un MP3 devient un WAV à sa fréquence.';
  }

  function hexField(key, label, value) {
    return '<div class="hexf"><input type="color" data-color="' + key + '" value="' + value + '" title="Choisir : ' + label + '"/>' +
      '<span>' + label + '</span><input type="text" class="hex" data-hex="' + key + '" value="' + value + '" spellcheck="false"/></div>';
  }

  function renderSettings() {
    var s = $('#settings'), a = appearance();
    var tabs = [['library', 'Bibliothèque', 'library'], ['renders', 'Rendus', 'wand'], ['appearance', 'Apparence', 'sliders']];
    var body = '';
    if (setTab === 'library') {
      body = Object.keys(CATS).map(function (cat) {
        var dirs = folders(cat);
        return '<div class="sgroup"><h3>' + icon(CATS[cat].icon) + 'Dossiers · ' + CATS[cat].label + '</h3><div class="sbox">' +
          (dirs.length ? dirs.map(function (d, i) {
            return '<div class="folder-row">' + icon('folder') + '<span class="p" title="' + esc(d) + '">' + esc(d) + '</span><button class="act" data-rm="' + cat + ':' + i + '" title="Retirer">' + icon('x') + '</button></div>';
          }).join('') : '<div class="hint">Aucun dossier pour l\'instant.</div>') +
          '<button class="sbtn" data-addcat="' + cat + '">' + icon('folderPlus') + 'Ajouter un dossier</button></div></div>';
      }).join('') +
        '<div class="sgroup"><h3>' + icon('download') + 'Fichiers ajoutés au projet</h3><div class="sbox">' +
        dropdown('fileMode', 'Quand un morceau ou un SFX est placé, importé ou glissé', prefs.fileMode === 'link' ? 'link' : 'copy', [
          ['copy', 'Copier dans le dossier Musique / SFX du projet'], ['link', 'Utiliser le fichier à son emplacement (sans copie)']]) +
        '<div class="hint">' + projectFoldersHint() + '</div></div></div>' +
        '<div class="sgroup"><h3>' + icon('refresh') + 'Analyse</h3><div class="sbox"><div class="hint">Formes d\'onde, BPM et tags sont mis en cache : chaque morceau n\'est analysé qu\'une fois.</div>' +
        '<button class="sbtn danger" id="clearCache">' + icon('refresh') + 'Vider le cache et tout réanalyser</button></div></div>';
    } else if (setTab === 'renders') {
      var root = projectRoot();
      body = '<div class="sgroup"><h3>' + icon('folder') + 'Dossiers du projet</h3><div class="sbox">' +
        (root ? Object.keys(CATS).map(function (cat) {
          var d = findCatDir(cat), there = Lib.exists(d);
          return '<div class="folder-row">' + icon(CATS[cat].icon) + '<span class="p" title="' + esc(d) + '">' + esc(d) + (there ? '' : ' (créé au premier fichier)') + '</span>' +
            (there ? '<button class="act" data-open="' + esc(d) + '" title="Ouvrir">' + icon('external') + '</button>' : '') + '</div>';
        }).join('') : '<div class="hint">Enregistrez le projet Premiere pour activer ses dossiers Musique / SFX.</div>') +
        '<div class="hint">' + projectFoldersHint() + '</div></div></div>' +
        '<div class="sgroup"><h3>' + icon('folder') + 'Dossier de secours (projet non enregistré)</h3><div class="sbox">' +
        '<div class="folder-row">' + icon('folder') + '<span class="p" title="' + esc(prefs.renderDir) + '">' + esc(prefs.renderDir || '—') + '</span></div>' +
        '<div class="srow"><button class="sbtn" id="pickRender">Changer…</button><button class="sbtn" id="openRender">' + icon('external') + 'Ouvrir</button></div>' +
        '<div class="hint">Rendus et extraits en WAV à la fréquence du fichier d\'origine (MP3 → WAV 16 bits à sa fréquence ; WAV / AIFF : même fréquence et même résolution).</div></div></div>';
    } else {
      var isCur = function (p) { return p.background === a.theme.background && p.accent === a.theme.accent && p.primary === a.theme.primary; };
      body =
        '<div class="hint">Apparence <b>partagée avec Mori et Sori</b> : thème, nom affiché et presets se mettent à jour dans les trois panneaux (les onglets affichés restent propres à Ongaku).</div>' +
        '<div class="sgroup"><h3>Thème de couleurs</h3>' +
        '<div class="presets">' + BUILTIN_PRESETS.concat(a.userPresets).map(function (p) {
          return '<span class="preset-wrap"><button class="preset ' + (isCur(p) ? 'on' : '') + '" data-preset="' + esc(p.id) + '"><span class="dots">' +
            [p.background, p.accent, p.primary].map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' + esc(p.name) + '</button>' +
            (p.builtIn ? '' : '<button class="preset-rm" data-rmpreset="' + esc(p.id) + '" title="Supprimer ce preset">' + icon('x') + '</button>') + '</span>';
        }).join('') + '</div>' +
        '<div class="sbox">' + hexField('background', 'Fond', a.theme.background) + hexField('accent', 'Accent', a.theme.accent) + hexField('primary', 'Boutons & titres', a.theme.primary) + '</div>' +
        '<div class="srow wrap"><input class="pill-input" id="presetName" placeholder="Nom du preset" value="' + esc(setUi.presetName) + '"/>' +
        '<button class="sbtn sm" id="savePreset"' + (setUi.presetName.trim() ? '' : ' disabled') + '>' + icon('plus') + 'Enregistrer</button>' +
        '<button class="sbtn sm" id="exportPreset">' + icon('copy') + 'Exporter</button>' +
        '<button class="sbtn sm" id="toggleImport">' + icon('download') + 'Importer</button></div>' +
        (setUi.exportCode ? '<div class="hint">Code copié dans le presse-papiers, à partager tel quel (compatible Mori et Sori) :</div><textarea class="code" readonly rows="2" id="exportCode">' + esc(setUi.exportCode) + '</textarea>' : '') +
        (setUi.showImport ? '<textarea class="code" rows="2" id="importCode" placeholder=\'Collez un code de preset : {"moriTheme":1,"name":…}\'></textarea>' +
          (setUi.importError ? '<div class="err">' + esc(setUi.importError) + '</div>' : '') +
          '<div class="srow end"><button class="sbtn sm" id="applyImport">' + icon('check') + 'Appliquer</button></div>' : '') +
        '</div>' +
        '<div class="sgroup"><h3>Police</h3><div class="sbox" id="suiteFontBox"></div></div>' +
        '<div class="sgroup"><h3>Nom affiché à côté d\'Ongaku</h3><div class="sbox">' +
        '<input class="text-input" id="brandIn" placeholder="Laisser vide pour ne rien afficher" value="' + esc(a.brandLabel) + '"/>' +
        hexField('brandColor', 'Couleur du nom', a.brandColor) + '</div></div>' +
        '<div class="sgroup"><h3>Onglets affichés</h3><div class="tabchecks">' + TABS.map(function (t) {
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
      '<div class="modal-foot"><span class="hint">Ongaku ' + APP_VERSION + ' · ' + (inCEP ? 'connecté à Premiere Pro' : 'hors Premiere (aperçu)') + '</span><button class="btn-primary" id="closeSet2">Fermer</button></div>' +
      '</div>';

    s.onclick = function (e) { if (e.target === s) closeSettings(); };
    $('#closeSet').onclick = closeSettings;
    $('#closeSet2').onclick = closeSettings;
    Array.prototype.forEach.call(s.querySelectorAll('[data-settab]'), function (b) {
      b.onclick = function () { setTab = b.getAttribute('data-settab'); renderSettings(); };
    });

    if (setTab === 'library') {
      $('#dd-fileMode').onchange = function () { prefs.fileMode = this.value; savePrefs(); toast(this.value === 'link' ? 'Les fichiers seront utilisés à leur emplacement.' : 'Les fichiers seront copiés dans le dossier du projet.'); };
      Array.prototype.forEach.call(s.querySelectorAll('[data-addcat]'), function (b) {
        b.onclick = function () { addFolder(b.getAttribute('data-addcat')); };
      });
      Array.prototype.forEach.call(s.querySelectorAll('[data-rm]'), function (b) {
        b.onclick = function () { var x = b.getAttribute('data-rm').split(':'); removeFolder(x[0], +x[1]); };
      });
      $('#clearCache').onclick = function () {
        Lib.clearCache();
        state.files.forEach(function (f) { f.analyzed = false; f.tagged = false; f.peaks = null; f.bpm = 0; f.cover = null; f.failed = false; });
        closeSettings();
        rescan().then(function () { toast('Cache vidé, réanalyse en cours.'); });
      };
    } else if (setTab === 'renders') {
      $('#pickRender').onclick = function () { pickFolder('Dossier des rendus Ongaku', function (p) { prefs.renderDir = p; savePrefs(); renderSettings(); }); };
      $('#openRender').onclick = function () { if (hasNode) { Lib.ensureDir(prefs.renderDir); Lib.openFolder(prefs.renderDir); } };
      Array.prototype.forEach.call(s.querySelectorAll('[data-open]'), function (b) { b.onclick = function () { Lib.openFolder(b.getAttribute('data-open')); }; });
    } else {
      bindAppearance(s, a);
    }
  }

  function bindAppearance(s, a) {
    var commit = function () { saveAppearance(); applyAppearance(); };
    var refreshPresetPills = function () {
      Array.prototype.forEach.call(s.querySelectorAll('[data-preset]'), function (b) {
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
    Array.prototype.forEach.call(s.querySelectorAll('[data-color]'), function (inp) {
      inp.oninput = function () { setColor(inp.getAttribute('data-color'), inp.value); };
    });
    Array.prototype.forEach.call(s.querySelectorAll('[data-hex]'), function (inp) {
      inp.oninput = function () { var hex = normalizeHex(inp.value); if (hex) setColor(inp.getAttribute('data-hex'), hex); };
      inp.onblur = function () { var k = inp.getAttribute('data-hex'); inp.value = k === 'brandColor' ? a.brandColor : a.theme[k]; };
    });
    Array.prototype.forEach.call(s.querySelectorAll('[data-preset]'), function (b) {
      b.onclick = function () {
        var p = BUILTIN_PRESETS.concat(a.userPresets).filter(function (x) { return x.id === b.getAttribute('data-preset'); })[0];
        if (!p) return;
        a.theme = { background: p.background, accent: p.accent, primary: p.primary };
        a.brandColor = p.brandColor;
        commit(); renderSettings();
      };
    });
    Array.prototype.forEach.call(s.querySelectorAll('[data-rmpreset]'), function (b) {
      b.onclick = function () { var id = b.getAttribute('data-rmpreset'); a.userPresets = a.userPresets.filter(function (p) { return p.id !== id; }); saveAppearance(); renderSettings(); };
    });
    var pn = $('#presetName');
    pn.oninput = function () { setUi.presetName = pn.value; $('#savePreset').disabled = !pn.value.trim(); };
    var savePreset = function () {
      var name = setUi.presetName.trim();
      if (!name) return;
      var preset = { id: 'preset-' + Date.now(), name: name, background: a.theme.background, accent: a.theme.accent, primary: a.theme.primary, brandColor: a.brandColor };
      a.userPresets = a.userPresets.filter(function (p) { return p.name !== name; }).concat([preset]);
      setUi.presetName = '';
      saveAppearance(); renderSettings();
    };
    pn.onkeydown = function (e) { if (e.key === 'Enter') savePreset(); };
    $('#savePreset').onclick = savePreset;
    $('#exportPreset').onclick = function () {
      setUi.exportCode = exportPresetCode({ name: setUi.presetName.trim() || 'Mon thème', background: a.theme.background, accent: a.theme.accent, primary: a.theme.primary, brandColor: a.brandColor });
      copyText(setUi.exportCode);
      renderSettings();
      var ec = $('#exportCode'); if (ec) ec.select();
    };
    $('#toggleImport').onclick = function () { setUi.showImport = !setUi.showImport; setUi.importError = ''; renderSettings(); if ($('#importCode')) $('#importCode').focus(); };
    if ($('#applyImport')) $('#applyImport').onclick = function () {
      try {
        var p = parsePresetCode($('#importCode').value);
        a.userPresets = a.userPresets.filter(function (x) { return x.name !== p.name; }).concat([p]);
        a.theme = { background: p.background, accent: p.accent, primary: p.primary };
        a.brandColor = p.brandColor;
        setUi.showImport = false; setUi.importError = '';
        commit(); renderSettings();
        toast('Preset « ' + p.name + ' » importé et appliqué.');
      } catch (e) { setUi.importError = e.message; renderSettings(); }
    };
    if (window.SuiteTheme && window.SuiteTheme.mountFontPicker) window.SuiteTheme.mountFontPicker($('#suiteFontBox'));
    $('#brandIn').oninput = function () { a.brandLabel = this.value.slice(0, 32); commit(); };
    Array.prototype.forEach.call(s.querySelectorAll('[data-vtab]'), function (cb) {
      cb.onchange = function () {
        var id = cb.getAttribute('data-vtab');
        if (cb.checked) a.visibleTabs = TABS.map(function (t) { return t.id; }).filter(function (t) { return t === id || a.visibleTabs.indexOf(t) >= 0; });
        else if (a.visibleTabs.length > 1) a.visibleTabs = a.visibleTabs.filter(function (t) { return t !== id; });
        if (a.visibleTabs.indexOf(prefs.tab) < 0) prefs.tab = a.visibleTabs[0];
        savePrefs(); renderTabs(); renderView(); drawMain(); renderSettings();
      };
    });
    $('#resetAppearance').onclick = function () {
      var keep = a.userPresets;
      prefs.appearance = JSON.parse(JSON.stringify(DEFAULT_APPEARANCE));
      prefs.appearance.userPresets = keep;
      saveAppearance(); applyAppearance(); renderTabs(); renderView(); renderSettings();
    };
  }

  function copyText(text) {
    try { if (navigator.clipboard) { navigator.clipboard.writeText(text).catch(function () {}); return; } } catch (e) {}
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) {}
    ta.remove();
  }

  // ==================== Démo (hors Premiere, sans Node) ====================
  var Demo = {
    list: null,
    files: function () {
      if (this.list) return this.list;
      var defs = [['Neon Drive', 'Ongaku Demo', 124], ['Slow Motion', 'Ongaku Demo', 92], ['Golden Hour', 'Ongaku Demo', 110]];
      this.list = defs.map(function (d, i) {
        return { path: 'demo://' + i, name: d[0] + '.wav', folder: 'Démo', cat: 'music', title: d[0], artist: d[1] + ' · ' + d[2] + ' BPM (synthé)', synth: d[2], added: i };
      }).concat(['Whoosh', 'Impact', 'Riser'].map(function (n, i) {
        return { path: 'demo://sfx' + i, name: n + '.wav', folder: 'SFX Démo', cat: 'sfx', title: n, artist: '', synth: 1, sfx: n, added: i };
      }));
      return this.list;
    },
    wav: function (f) {
      if (f.sfx) return this.sfxWav(f.sfx);
      return this.musicWav(f);
    },
    sfxWav: function (kind) {
      var sr = 44100, dur = kind === 'Riser' ? 4 : kind === 'Impact' ? 2.5 : 1.4, n = Math.floor(sr * dur);
      var L = new Float32Array(n), R = new Float32Array(n), seed = 7, lp = 0;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; }
      for (var i = 0; i < n; i++) {
        var t = i / sr, x = t / dur, s;
        if (kind === 'Whoosh') {
          var a = 0.02 + 0.5 * Math.sin(Math.PI * x); lp += (rnd() - lp) * (0.05 + 0.4 * Math.sin(Math.PI * x));
          s = lp * a * 1.6;
        } else if (kind === 'Impact') {
          s = Math.sin(2 * Math.PI * (40 + 120 * Math.exp(-t * 18)) * t) * Math.exp(-t * 2.2) * 0.9 + rnd() * Math.exp(-t * 25) * 0.5;
        } else {
          lp += (rnd() - lp) * (0.02 + x * 0.5);
          s = (lp * 0.8 + Math.sin(2 * Math.PI * (200 + 900 * x * x) * t) * 0.25) * x * x;
        }
        L[i] = s; R[i] = s * 0.9;
      }
      return Fx.encodeWav24({ numberOfChannels: 2, length: n, sampleRate: sr, getChannelData: function (c) { return c ? R : L; } });
    },
    musicWav: function (f) {
      var sr = 44100, bpm = f.synth, beat = 60 / bpm, dur = beat * 4 * 12, n = Math.floor(sr * dur);
      var L = new Float32Array(n), R = new Float32Array(n), seed = f.synth;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; }
      var chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 311.1]];
      for (var i = 0; i < n; i++) {
        var t = i / sr, b = t / beat, bi = Math.floor(b), ph = (b - bi) * beat, bar = Math.floor(bi / 4);
        var kick = Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-ph * 30)) * ph) * Math.exp(-ph * 9);
        var sn = (bi % 4 === 1 || bi % 4 === 3) ? rnd() * Math.exp(-ph * 22) * 0.45 : 0;
        var hph = (b * 2 - Math.floor(b * 2)) * beat / 2, hat = rnd() * Math.exp(-hph * 70) * 0.12;
        var ch = chords[bar % 4], pad = 0;
        for (var c = 0; c < 3; c++) pad += Math.sin(2 * Math.PI * ch[c] * t) * 0.07;
        var s = kick * 0.8 + sn + pad;
        L[i] = s + hat; R[i] = s - hat * 0.5;
      }
      return Fx.encodeWav24({ numberOfChannels: 2, length: n, sampleRate: sr, getChannelData: function (c) { return c ? R : L; } });
    }
  };

  // ==================== Démarrage ====================
  /**
   * Fermeture du panneau : sans nettoyage, Premiere attend la carte son, les lectures disque et
   * les analyses en cours (gros gel). On coupe tout et on écrit le cache tout de suite.
   */
  function shutdown() {
    if (closing) return;
    closing = true;
    try { stopSource(); pb.playing = false; } catch (e) {}
    clearTimeout(idleTimer); clearTimeout(excerptTimer); clearInterval(projectTimer);
    if (io) io.disconnect();
    visible.clear();
    state.buffer = null; state.pv = null;
    try { if (actx) actx.close(); } catch (e2) {}
    actx = null;
    try { Lib.flushCache(); } catch (e3) {}
    try { if (hasNode) dropUnusedExcerpt(); } catch (e4) {}
  }
  /** Panneau masqué (onglet de dock caché, fenêtre réduite) : on met le son en pause */
  function onHidden() {
    if (pb.playing) pause();
    try { if (actx && actx.state === 'running') actx.suspend(); } catch (e) {}
    try { Lib.flushCache(); } catch (e2) {}
  }

  /**
   * Premiere garde pour lui les touches (Espace = lecture de la timeline, I / O…) tant qu'un panneau
   * ne les réclame pas. On déclare celles d'Ongaku : elles arrivent au panneau quand il a le focus.
   * Codes : touches virtuelles Windows / codes de touche macOS.
   */
  function registerShortcuts() {
    if (!window.__adobe_cep__ || !window.__adobe_cep__.registerKeyEventsInterest) return;
    var mac = navigator.platform.indexOf('Mac') === 0;
    // Espace, I, O, X, flèche gauche, flèche droite, Échap
    var codes = mac ? [49, 34, 31, 7, 123, 124, 53] : [32, 73, 79, 88, 37, 39, 27];
    try { window.__adobe_cep__.registerKeyEventsInterest(JSON.stringify(codes.map(function (c) { return { keyCode: c }; }))); } catch (e) {}
  }

  function init() {
    syncSharedAppearance();
    applyAppearance();
    if (window.SuiteTheme) window.SuiteTheme.watch(onSharedAppearance);
    watchProject();
    $('#btnSettings').innerHTML = icon('settings');
    $('#btnSettings').onclick = openSettings;
    if (hasNode) Lib.loadCache();
    renderTabs();
    renderPlayer();
    renderView();
    rescan();

    registerShortcuts();
    var isTyping = function (e) { return /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable; };
    var isSpace = function (e) { return e.code === 'Space' || e.key === ' ' || e.keyCode === 32; };
    // un bouton qui garde le focus après un clic serait « cliqué » par Espace en plus du raccourci
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button, [draggable="true"]');
      if (b && b.blur && !isTyping(e)) b.blur();
    }, true);
    document.addEventListener('keyup', function (e) { if (isSpace(e) && !isTyping(e)) e.preventDefault(); });
    document.addEventListener('keydown', function (e) {
      if (isTyping(e)) return;
      if (isSpace(e)) { e.preventDefault(); if (!e.repeat) toggle(); }
      else if (e.code === 'ArrowRight' && activeBuffer()) seek(position() + 5);
      else if (e.code === 'ArrowLeft' && activeBuffer()) seek(position() - 5);
      else if (e.code === 'KeyI') markIn();
      else if (e.code === 'KeyO') markOut();
      else if (e.code === 'KeyX') clearInOut();
      else if (e.code === 'Escape') { closeSettings(); toggleAbout(false); }
    });
    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { drawMain(); visible.forEach(function (f) { drawMini(rowEls.get(f.path), f); }); }, 80);
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('#about')) toggleAbout(false); });
    window.addEventListener('beforeunload', shutdown);
    window.addEventListener('pagehide', shutdown);
    window.addEventListener('unload', shutdown);
    document.addEventListener('visibilitychange', function () { if (document.hidden) onHidden(); });
    if (window.__adobe_cep__ && window.__adobe_cep__.addEventListener) {
      try {
        window.__adobe_cep__.addEventListener('com.adobe.csxs.events.WindowVisibilityChanged', function (ev) {
          var d = ev && ev.data !== undefined ? String(ev.data) : '';
          if (d === 'false') onHidden();
        });
      } catch (e) {}
    }
    if (!inCEP) setTimeout(function () { toast(hasNode ? 'Hors Premiere Pro : les actions timeline sont désactivées.' : 'Aperçu hors Premiere : morceaux et SFX de démo synthétisés.'); }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
