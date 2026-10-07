/**
 * Cypher Console : console d'effets façon FX Console (fenêtre flottante ouverte par Ctrl+Espace / ⌥Espace).
 *
 * Écrite sans React ni l'application Cypher pour s'ouvrir le plus vite possible : la page ne charge que les styles
 * précompilés, le thème partagé (suite-theme.js) et ce script. On tape le nom d'un effet, Entrée l'applique aux
 * clips sélectionnés de la timeline (effet vidéo -> clips vidéo, effet audio -> clips audio).
 *
 * Clavier : ↑ ↓ choisir · Entrée appliquer et fermer · Maj+Entrée appliquer sans fermer · Tab Tout/Vidéo/Audio ·
 * Ctrl+D (⌘D) favori · Échap fermer. Champ vide : favoris puis derniers effets utilisés.
 */
(function () {
  'use strict';

  var KEYS = { effects: 'cypher.console.effects', favorites: 'cypher.console.favorites', recents: 'cypher.console.recents' };
  var cep = window.__adobe_cep__ || null;

  // ---------- stockage ----------
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  // ---------- thème partagé (mêmes calculs que applyTheme du panneau Cypher) ----------
  function hexToRgb(hex) {
    var v = String(hex || '').replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(v)) v = v.replace(/(.)/g, '$1$1');
    if (!/^[0-9a-f]{6}$/i.test(v)) v = '000000';
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    return [0, 1, 2].map(function (i) {
      return Math.round(a[i] + (b[i] - a[i]) * t);
    });
  }
  function applyTheme(theme) {
    if (!theme || !theme.background) return;
    var root = document.documentElement.style;
    var set = function (n, rgb) {
      root.setProperty('--' + n, rgb.join(' '));
    };
    var bg = hexToRgb(theme.background);
    var light = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255 > 0.55;
    var white = [255, 255, 255], black = [0, 0, 0], towards = light ? [16, 16, 20] : [247, 245, 239];
    set('ink', bg);
    var n = { 950: 0.03, 900: 0.07, 800: 0.13, 700: 0.22, 600: 0.33, 500: 0.45, 400: 0.58, 300: 0.72, 200: 0.85, 100: 0.92, 50: 0.96 };
    Object.keys(n).forEach(function (k) {
      set('zinc-' + k, mix(bg, towards, n[k]));
    });
    var ac = hexToRgb(theme.accent);
    var a = { 50: [white, 0.88], 100: [white, 0.76], 200: [white, 0.55], 300: [white, 0.3], 400: [ac, 0], 500: [bg, 0.15], 600: [bg, 0.3], 700: [bg, 0.45], 800: [bg, 0.6], 900: [bg, 0.72], 950: [bg, 0.84] };
    Object.keys(a).forEach(function (k) {
      set('accent-' + k, mix(ac, a[k][0], a[k][1]));
    });
    var pr = hexToRgb(theme.primary);
    var p = { 100: [white, 0.6], 200: [white, 0.3], 300: [pr, 0], 400: [black, 0.08], 500: [black, 0.18] };
    Object.keys(p).forEach(function (k) {
      set('cream-' + k, mix(pr, p[k][0], p[k][1]));
    });
  }
  // événement CEP vers les autres fenêtres de Premiere : sans l'identifiant de l'application (« PPRO ») et celui de
  // la fenêtre, Premiere ne le transmet pas
  function sendCepEvent(type, data) {
    var c = window.__adobe_cep__;
    if (!c || !c.dispatchEvent) return;
    var appId = 'PPRO', ext = '';
    try { appId = JSON.parse(c.getHostEnvironment()).appId || appId; } catch (e) {}
    try { ext = c.getExtensionId(); } catch (e) {}
    c.dispatchEvent({ type: type, scope: 'APPLICATION', appId: appId, extensionId: ext, data: data });
  }
  // la console n'a pas Node : le thème vient de la fenêtre cachée de Cypher (événement CEP), et le dernier reçu est
  // gardé pour s'afficher tout de suite aux couleurs du thème à l'ouverture suivante
  applyTheme(read('cypher.console.theme', null));
  if (cep && cep.addEventListener) {
    try {
      cep.addEventListener('com.cypher.console.theme', function (ev) {
        try {
          var data = typeof ev === 'string' ? JSON.parse(ev) : ev;
          if (data && data.data !== undefined) data = data.data;
          var theme = typeof data === 'string' ? JSON.parse(data) : data;
          if (theme && theme.background) {
            applyTheme(theme);
            write('cypher.console.theme', theme);
          }
        } catch (e) {}
      });
      sendCepEvent('com.cypher.console.ready', '');
    } catch (e) {}
  }

  // ---------- Premiere ----------
  function evalScript(script) {
    return new Promise(function (resolve) {
      if (!cep) return resolve('');
      var done = false;
      var timer = setTimeout(function () {
        if (!done) {
          done = true;
          resolve('ERR|Premiere ne répond pas');
        }
      }, 15000);
      try {
        cep.evalScript(script, function (r) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(String(r || ''));
        });
      } catch (e) {
        clearTimeout(timer);
        resolve('ERR|' + e);
      }
    });
  }
  var q = function (s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  };

  // liste des effets : une ligne par effet, « V\t » ou « A\t » devant (pas de JSON côté ExtendScript)
  var LIST_SCRIPT =
    '(function(){try{app.enableQE();var v=qe.project.getVideoEffectList(),a=qe.project.getAudioEffectList(),o=[];' +
    'for(var i=0;i<v.length;i++)o.push("V\\t"+v[i]);for(var j=0;j<a.length;j++)o.push("A\\t"+a[j]);return o.join("\\n");}' +
    'catch(e){return "ERR|"+e;}})()';

  function applyScript(effect) {
    return (
      '(function(){try{' +
      'var seq=app.project?app.project.activeSequence:null;if(!seq)return "ERR|Ouvrez une séquence dans la timeline";' +
      'app.enableQE();var qseq=qe.project.getActiveSequence();var name=' + q(effect.name) + ';var audio=' + (effect.kind === 'audio') + ';' +
      'var fx=audio?qe.project.getAudioEffectByName(name):qe.project.getVideoEffectByName(name);' +
      'if(!fx)return "ERR|Effet introuvable : "+name;' +
      'var applied=0,missed=0,other=0;' +
      'function scan(tracks,isAudio,apply){for(var t=0;t<tracks.numTracks;t++){var track=tracks[t],qitems=null,used={};' +
      'for(var c=0;c<track.clips.numItems;c++){var clip=track.clips[c];if(!clip.isSelected())continue;if(!apply){other++;continue;}' +
      'if(!qitems){var qt=isAudio?qseq.getAudioTrackAt(t):qseq.getVideoTrackAt(t);qitems=[];' +
      'for(var k=0;k<qt.numItems;k++){var it=qt.getItemAt(k);if(it&&it.type!=="Empty")qitems.push(it);}}' +
      'var it2=qitems[c];if(!it2||(it2.name&&clip.name&&it2.name!==clip.name)){it2=null;' +
      'for(var j=0;j<qitems.length;j++){if(!used[j]&&qitems[j].name===clip.name){it2=qitems[j];used[j]=true;break;}}}else used[c]=true;' +
      'if(!it2){missed++;continue;}if(isAudio)it2.addAudioEffect(fx);else it2.addVideoEffect(fx);applied++;}}}' +
      'scan(seq.videoTracks,false,!audio);scan(seq.audioTracks,true,audio);' +
      'if(applied===0)return "ERR|"+(other>0?(audio?"Les clips sélectionnés sont des clips vidéo : choisissez un effet vidéo ou sélectionnez l\'audio":"Les clips sélectionnés sont des clips audio : choisissez un effet audio ou sélectionnez la vidéo"):(missed>0?"Clip sélectionné introuvable pour Premiere":"Sélectionnez des clips dans la timeline"));' +
      'return "OK|"+applied;' +
      '}catch(e){return "ERR|"+e;}})()'
    );
  }

  // ---------- état ----------
  var effects = read(KEYS.effects, []);
  var favorites = read(KEYS.favorites, []);
  var recents = read(KEYS.recents, []);
  var kindFilter = 'all';
  var cursorKey = null;
  var busy = false;
  var results = [];

  var keyOf = function (e) {
    return e.kind + ':' + e.name;
  };
  var fold = function (s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  };

  /** Pertinence (0 = écarté) : début du nom > début d'un mot > contenu > lettres dans l'ordre (« gsbl » -> gaussian blur) */
  function score(name, query) {
    var n = fold(name), s = fold(query).trim();
    if (!s) return 1;
    if (n === s) return 1000;
    if (n.indexOf(s) === 0) return 800 - n.length;
    var words = s.split(/\s+/).filter(Boolean);
    var wordStart = words.every(function (w) {
      return new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(n);
    });
    if (wordStart) return 600 - n.length;
    if (n.indexOf(s) >= 0) return 400 - n.length;
    if (words.every(function (w) { return n.indexOf(w) >= 0; })) return 300 - n.length;
    var i = 0;
    for (var c = 0; c < n.length && i < s.length; c++) if (n[c] === s[i]) i++;
    return i === s.length ? 100 - n.length / 10 : 0;
  }

  // ---------- interface ----------
  var $ = function (id) {
    return document.getElementById(id);
  };
  var input = $('q'), list = $('list'), foot = $('foot'), count = $('count'), spinner = $('spin');
  var ICON_VIDEO = '<svg class="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/></svg>';
  var ICON_AUDIO = '<svg class="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6M19.4 18.4a9 9 0 0 0 0-12.7"/></svg>';
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var HELP = 'Entrée : appliquer · Maj+Entrée : sans fermer · Tab : vidéo/audio · Ctrl+D : favori · Échap : fermer';

  function setInfo(text, isError) {
    foot.textContent = text || HELP;
    foot.className = 'truncate ' + (text ? (isError ? 'text-red-300' : 'text-emerald-200') : '');
  }

  function compute() {
    var query = input.value;
    var pool = effects.filter(function (e) {
      return kindFilter === 'all' || e.kind === kindFilter;
    });
    if (!query.trim()) {
      var keys = favorites.concat(recents.filter(function (k) { return favorites.indexOf(k) < 0; }));
      results = keys
        .map(function (k) {
          for (var i = 0; i < pool.length; i++) if (keyOf(pool[i]) === k) return pool[i];
          return null;
        })
        .filter(Boolean);
      return;
    }
    results = pool
      .map(function (e) {
        var sc = score(e.name, query);
        if (sc > 0 && favorites.indexOf(keyOf(e)) >= 0) sc += 40;
        if (sc > 0 && recents.indexOf(keyOf(e)) >= 0) sc += 20;
        return { e: e, sc: sc };
      })
      .filter(function (x) { return x.sc > 0; })
      .sort(function (a, b) { return b.sc - a.sc || a.e.name.localeCompare(b.e.name); })
      .slice(0, 60)
      .map(function (x) { return x.e; });
  }

  function cursorIndex() {
    if (!cursorKey) return 0;
    for (var i = 0; i < results.length; i++) if (keyOf(results[i]) === cursorKey) return i;
    return 0;
  }

  function render() {
    compute();
    count.textContent = effects.length ? effects.length + ' effets' : '';
    var ci = cursorIndex();
    var html = '';
    if (!results.length) {
      var msg = input.value.trim()
        ? 'Aucun effet ne correspond.'
        : effects.length
        ? 'Tapez le nom d’un effet. Vos favoris (★) et derniers effets s’afficheront ici.'
        : 'Lecture des effets installés…';
      html = '<div class="px-4 py-6 text-center text-xs text-zinc-500">' + msg + '</div>';
    } else {
      if (!input.value.trim()) html += '<div class="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">Favoris et récents</div>';
      results.forEach(function (e, i) {
        var fav = favorites.indexOf(keyOf(e)) >= 0, cur = i === ci;
        html +=
          '<div data-i="' + i + '" data-current="' + cur + '" class="row mx-1.5 px-2.5 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer ' + (cur ? 'bg-white/[0.08]' : '') + '">' +
          (e.kind === 'audio' ? ICON_AUDIO : ICON_VIDEO) +
          '<span class="flex-1 min-w-0 truncate text-[13px] ' + (cur ? 'text-zinc-50' : 'text-zinc-200') + '">' + esc(e.name) + '</span>' +
          '<button data-star="' + i + '" title="' + (fav ? 'Retirer des favoris (Ctrl+D)' : 'Ajouter aux favoris (Ctrl+D)') + '" class="flex-shrink-0 text-sm leading-none cursor-pointer ' +
          (fav ? 'text-cream-300' : cur ? 'text-zinc-500 hover:text-cream-300' : 'text-transparent') + '">★</button></div>';
      });
    }
    list.innerHTML = html;
    var el = list.querySelector('[data-current="true"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
    document.querySelectorAll('[data-kind]').forEach(function (b) {
      var on = b.getAttribute('data-kind') === kindFilter;
      b.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition cursor-pointer ' + (on ? 'bg-cream-300 text-ink' : 'text-zinc-400 hover:text-zinc-100');
    });
  }

  function closeWindow() {
    try {
      if (cep) cep.closeExtension();
    } catch (e) {}
  }

  function toggleFavorite(e) {
    if (!e) return;
    var k = keyOf(e);
    favorites = favorites.indexOf(k) >= 0 ? favorites.filter(function (x) { return x !== k; }) : [k].concat(favorites);
    write(KEYS.favorites, favorites);
    render();
  }

  function apply(e, keepOpen) {
    if (!e || busy) return;
    busy = true;
    setInfo('Application de « ' + e.name + ' »…');
    evalScript(applyScript(e)).then(function (r) {
      busy = false;
      if (r.indexOf('OK|') !== 0) {
        setInfo(r.indexOf('ERR|') === 0 ? r.slice(4) : 'Effet non appliqué.', true);
        return;
      }
      var n = parseInt(r.slice(3), 10) || 1;
      recents = [keyOf(e)].concat(recents.filter(function (k) { return k !== keyOf(e); })).slice(0, 12);
      write(KEYS.recents, recents);
      setInfo('« ' + e.name + ' » appliqué à ' + n + ' clip' + (n > 1 ? 's' : '') + '.');
      if (!keepOpen) setTimeout(closeWindow, 450);
      else render();
    });
  }

  function move(delta) {
    var i = Math.max(0, Math.min(results.length - 1, cursorIndex() + delta));
    if (results[i]) cursorKey = keyOf(results[i]);
    render();
  }

  input.addEventListener('input', function () {
    cursorKey = null;
    render();
  });
  document.addEventListener('keydown', function (ev) {
    var k = ev.key;
    if (k === 'ArrowDown') move(1);
    else if (k === 'ArrowUp') move(-1);
    else if (k === 'Enter') apply(results[cursorIndex()], ev.shiftKey);
    else if (k === 'Escape') closeWindow();
    else if (k === 'Tab') {
      kindFilter = kindFilter === 'all' ? 'video' : kindFilter === 'video' ? 'audio' : 'all';
      cursorKey = null;
      render();
    } else if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'd') toggleFavorite(results[cursorIndex()]);
    else return;
    ev.preventDefault();
  });
  list.addEventListener('mousemove', function (ev) {
    var row = ev.target.closest && ev.target.closest('[data-i]');
    if (!row) return;
    var e = results[+row.getAttribute('data-i')];
    if (e && keyOf(e) !== cursorKey && row.getAttribute('data-current') !== 'true') {
      cursorKey = keyOf(e);
      render();
    }
  });
  list.addEventListener('click', function (ev) {
    var star = ev.target.closest && ev.target.closest('[data-star]');
    if (star) {
      toggleFavorite(results[+star.getAttribute('data-star')]);
      return;
    }
    var row = ev.target.closest && ev.target.closest('[data-i]');
    if (row) apply(results[+row.getAttribute('data-i')]);
  });
  document.querySelectorAll('[data-kind]').forEach(function (b) {
    b.addEventListener('click', function () {
      kindFilter = b.getAttribute('data-kind');
      cursorKey = null;
      render();
      input.focus();
    });
  });
  // à chaque ouverture : champ prêt à taper, texte précédent sélectionné
  var focus = function () {
    setInfo('');
    setTimeout(function () {
      input.focus();
      input.select();
    }, 20);
  };
  window.addEventListener('focus', focus);

  render();
  focus();

  // liste relue dans Premiere à chaque ouverture (plugins ajoutés) ; celle en mémoire s'affiche tout de suite
  if (cep) {
    spinner.style.display = '';
    evalScript(LIST_SCRIPT).then(function (r) {
      spinner.style.display = 'none';
      if (!r || r.indexOf('ERR|') === 0) {
        if (!effects.length) setInfo('Liste des effets indisponible' + (r ? ' : ' + r.slice(4) : '') + '.', true);
        return;
      }
      var seen = {};
      var fresh = r.split('\n').map(function (line) {
        var tab = line.indexOf('\t');
        var name = line.slice(tab + 1).trim();
        var e = { name: name, kind: line.charAt(0) === 'A' ? 'audio' : 'video' };
        return name && !seen[keyOf(e)] && (seen[keyOf(e)] = true) ? e : null;
      }).filter(Boolean);
      if (fresh.length) {
        effects = fresh;
        write(KEYS.effects, effects);
        render();
      }
    });
  }
  window.__consoleReady = performance.now();
})();
