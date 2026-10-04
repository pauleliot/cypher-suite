/**
 * Kiru — onglet « 1 · Nettoyer » : couper l'inutile à partir de la transcription.
 *
 * « Analyser » transcrit la séquence si besoin puis repère, selon les cases cochées : les silences (pauses
 * entre les mots), les hésitations et mots répétés, les reprises et faux départs, et (relecture IA) les prises
 * ratées ou discussions hors tournage. Tout est barré dans le texte pour vérification ; chaque mot reste
 * cliquable (tête de lecture), sélectionnable (glisser, Suppr) et corrigeable (double-clic, gardé pour les
 * sous-titres). « Couper » retire les passages barrés avec la même coupe que l'onglet Silences.
 */
(function () {
  'use strict';
  window.KiruTabs = window.KiruTabs || {};

  window.KiruTabs.text = function (K) {
    var X = window.KiruText, AI = window.KiruAI, $ = K.$, $$ = K.$$, esc = K.esc, icon = K.icon;
    var prefs = K.prefs, state = K.state, TICKS = K.TICKS;
    // gap[i] : pause avant le mot i repérée (true = coupée, false = gardée)
    var ui = { cut: {}, why: {}, gap: {}, sel: null, anchor: -1, down: false, moved: false, search: '', hits: {}, chapters: null, now: -1, painted: [] };
    function air() { var a = Number(prefs.clean.air); return isNaN(a) ? 0.15 : a; } // gardé de chaque côté d'une pause coupée

    function words() { return state.tx ? state.tx.words : []; }
    function resetUi() { ui.cut = {}; ui.why = {}; ui.gap = {}; ui.sel = null; ui.chapters = null; ui.now = -1; ui.painted = []; computeHits(); }
    function endsSentence(w) { return /[.?!…]["»”)]?$/.test(w); }

    /** Phrases : fin de ponctuation ou pause > 1,2 s ; { id (1…), a, b (indices de mots), start, text } */
    function sentences(ws) {
      var out = [], cur = null;
      ws.forEach(function (w, i) {
        if (!cur || endsSentence(ws[i - 1].w) || w.s - ws[i - 1].e > 1.2) { cur = { id: out.length + 1, a: i, b: i, start: w.s, text: '' }; out.push(cur); }
        cur.b = i; cur.text += (cur.text ? ' ' : '') + w.w;
      });
      return out;
    }

    // ==================== Démo hors Premiere ====================
    var DEMO = 'Bonjour à tous et bienvenue dans cette vidéo. Aujourd\'hui on va voir euh comment monter une vidéo euh beaucoup plus vite. ' +
      'Alors la première la première étape c\'est de c\'est de. Alors la première étape, c\'est de couper les silences automatiquement. ' +
      'Ensuite on ajoute des sous-titres qui donnent envie de regarder jusqu\'au bout. Et voilà, c\'est aussi simple que ça !';
    function demoTx() {
      var t = 0.4, ws = DEMO.split(' ').map(function (w, i, arr) {
        var d = 0.16 + w.length * 0.035, o = { w: w, s: Math.round(t * 1000) / 1000, e: Math.round((t + d) * 1000) / 1000 };
        t += d + (endsSentence(w) ? 0.7 : 0.06);
        void i; void arr;
        return o;
      });
      return { seqId: 'demo', seqName: 'Démo', words: ws, tracks: [0], tpf: TICKS / 25, lang: 'fr', width: 1080, height: 1920 };
    }

    // ==================== Transcription ====================
    /** Transcrit la séquence active ; résout true si la transcription est prête (keepBusy : enchaîné par Analyser) */
    function transcribe(keepBusy) {
      if (state.busy && !keepBusy) return Promise.resolve(false);
      if (!K.inCEP) { state.tx = demoTx(); resetUi(); render(); K.toast('Aperçu hors Premiere : transcription simulée.'); return Promise.resolve(true); }
      var whisper = X.findWhisper(prefs.tx.whisper);
      if (!whisper || X.installedModels().indexOf(prefs.tx.model) < 0) {
        K.toast(!whisper ? 'Installez whisper.cpp (Réglages > IA).' : 'Téléchargez le modèle choisi (Réglages > IA).', 'err');
        K.openSettings('ai');
        return Promise.resolve(false);
      }
      var tracks = K.sortedTracks();
      var opts = { whisper: whisper, model: prefs.tx.model, lang: prefs.tx.lang, ffmpeg: K.D.findFfmpeg(prefs.ffmpeg) };
      // pas de consigne (« prompt ») : testée sur des rushs, elle faisait sauter des prises entières et inventer des phrases
      var progress = function (label) {
        return function (f, step) {
          var what = step === 'conversion' ? 'Préparation de l\'audio' : step === 'vérification' ? 'Recherche des phrases oubliées' : 'Transcription';
          K.toast(what + ' · ' + label + (step === 'transcription' ? ' · ' + Math.round(f * 100) + ' %' : ''), 'busy', true);
        };
      };
      K.setBusy(true);
      K.toast('Lecture des pistes…', 'busy', true);
      var done = false;
      return K.jsx('readTracks', [JSON.stringify(tracks)]).then(function (r) {
        if (!r.success) throw new Error(r.error);
        var seq = r.seq, clips = r.clips.filter(function (c) { return !c.disabled && c.end > c.start; });
        if (!clips.length) throw new Error('Aucun clip sur ' + tracks.map(K.trackLabel).join(', ') + ' : choisissez les pistes où se trouve la voix.');
        var nested = clips.some(function (c) { return c.nested || !c.path; }), paths = [];
        clips.forEach(function (c) { if (c.path && !c.nested && paths.indexOf(c.path) < 0) paths.push(c.path); });
        var byPath = {}, failed = [], p = Promise.resolve();
        if (!nested) paths.forEach(function (path, i) {
          p = p.then(function () {
            return X.transcribe(path, Object.assign({}, opts, { onProgress: progress((i + 1) + '/' + paths.length + ' ' + K.basename(path)) }))
              .then(function (d) { byPath[path] = d; }, function (e) {
                if (/^whisper|modèle/.test(e.message)) throw e; // whisper lui-même en échec : inutile d'exporter
                failed.push(K.basename(path) + ' (' + e.message + ')');
              });
          });
        });
        return p.then(function () {
          if (!nested && !failed.length) return mapWords(clips, byPath);
          // secours : Premiere exporte le mixage des pistes, transcrit tel quel (temps de la séquence)
          return K.exportMix(tracks, failed, nested).then(function (wav) {
            return X.transcribe(wav, Object.assign({}, opts, { noCache: true, onProgress: progress('export Premiere') })).then(function (d) {
              try { K.nodeReq('fs').unlinkSync(wav); } catch (e) {}
              return d.words.map(function (w, i) { return { w: w.w, s: w.s, e: w.e, ref: { data: d, i: i } }; });
            });
          });
        }).then(function (ws) {
          ws = expand(ws); // corrections en plusieurs mots, gardées dans le cache
          state.tx = { seqId: seq.id, seqName: seq.name, words: ws, tracks: tracks, tpf: seq.ticksPerFrame, lang: prefs.tx.lang, width: seq.width, height: seq.height };
          resetUi(); if (prefs.tab === 'text') render();
          var tip = X.hasNvidia() && !X.isGpu(whisper) ? ' Astuce : installez la version GPU de whisper (Réglages > IA), 10 à 20 fois plus rapide.' : '';
          K.toast('« ' + seq.name + ' » transcrite : ' + ws.length + ' mots.' + tip);
          done = true;
        });
      }).catch(function (e) {
        K.toast(e.message || String(e), 'err');
      }).then(function () { if (!keepBusy) K.setBusy(false); return done; });
    }
    /** La transcription en mémoire correspond-elle à la séquence active ? */
    function fresh() {
      var tx = state.tx;
      return !!tx && (!K.inCEP || !(state.sum && state.sum.seq) || state.sum.seq.id === tx.seqId);
    }

    /**
     * Un mot corrigé en plusieurs (« milieu » → « milieux populaires ») devient autant de mots, qui se partagent
     * sa durée (prolongée jusqu'au mot suivant si besoin) ; chacun garde le lien vers la transcription en cache.
     */
    function expand(ws) {
      var out = [];
      ws.forEach(function (w, i) {
        var parts = String(w.w).split(/\s+/).filter(Boolean);
        if (parts.length < 2) { out.push(w); return; }
        var next = ws[i + 1], end = Math.max(w.e, Math.min(next ? next.s : w.e + 0.4 * parts.length, w.s + 0.35 * parts.length));
        var step = (end - w.s) / parts.length;
        parts.forEach(function (p, k) {
          out.push(Object.assign({}, w, { w: p, s: w.s + step * k, e: w.s + step * (k + 1),
            ref: w.ref ? { data: w.ref.data, i: w.ref.i, part: k + (w.ref.part || 0), parts: parts.length } : null }));
        });
      });
      return out;
    }
    /** Instant qui représente un mot : un peu après son début (sa fin peut déborder dans le silence suivant) */
    function anchor(w) { return w.s + Math.min(0.08, (w.e - w.s) / 2); }
    /** Mots des fichiers → temps de la séquence, selon le point d'entrée et la vitesse de chaque clip */
    function mapWords(clips, byPath) {
      var out = [];
      clips.forEach(function (c) {
        var d = byPath[c.path];
        if (!d) return;
        var sp = Math.abs(c.speed || 1), st = c.start / TICKS, en = c.end / TICKS, srcIn = c.inPoint / TICKS, srcOut = srcIn + (en - st) * sp;
        d.words.forEach(function (w, i) {
          // un mot appartient au clip où il commence (son milieu peut tomber dans un silence coupé)
          var at = anchor(w);
          if (at < srcIn || at >= srcOut) return;
          out.push({ w: w.w, s: Math.max(st, st + (w.s - srcIn) / sp), e: Math.min(en, st + (w.e - srcIn) / sp), ref: { data: d, i: i }, track: c.track });
        });
      });
      out.sort(function (a, b) { return a.s - b.s; });
      // même voix sur deux pistes (micro + caméra) : un seul exemplaire
      var res = [];
      out.forEach(function (w) {
        for (var k = res.length - 1; k >= 0 && k >= res.length - 4; k--) {
          var p = res[k];
          if (p.track !== w.track && X.normWord(p.w) === X.normWord(w.w) && Math.min(p.e, w.e) - Math.max(p.s, w.s) > 0.4 * Math.min(p.e - p.s, w.e - w.s)) return;
        }
        res.push(w);
      });
      return res;
    }

    // ==================== Rendu ====================
    var PAUSE = { id: 'minPause', label: 'à partir de', min: 0.2, max: 3, step: 0.1, unit: 's', hint: 'Durée minimale d\'une pause pour qu\'elle soit coupée' };
    var AIR = { id: 'air', label: 'marge', min: 0, max: 0.5, step: 0.01, unit: 'ms', hint: 'Air gardé avant et après la parole autour de chaque silence coupé' };
    function applyLabel() { return { razor: 'Couper', markers: 'Marquer' }[prefs.clean.action] || 'Supprimer'; }
    function ctog(id, label, title) {
      return '<label class="toggle ' + (prefs.clean[id] ? 'on' : '') + '" data-clean="' + id + '" title="' + esc(title) + '"><span class="sw"></span>' + label + '</label>';
    }
    function render() {
      var v = $('#view');
      if (!v) return;
      var c = prefs.clean;
      v.innerHTML =
        '<div class="scroll">' +
        '<section class="card txcard">' +
          '<div class="wave-head">' +
            '<span class="wave-title" id="txTitle"></span>' +
            '<button class="btn-ghost sm" id="btnAnalyze" data-busy title="Retranscrire les pistes choisies (whisper.cpp, sur cet ordinateur)">' + icon('mic') + '<span>Transcrire</span></button>' +
          '</div>' +
          '<div class="tx-tools">' +
            '<label class="search">' + icon('search') + '<input id="txSearch" placeholder="Rechercher…" value="' + esc(ui.search) + '" spellcheck="false"/><span id="txHits"></span></label>' +
            '<button class="sbtn" id="txChapters" data-busy title="L\'IA propose des chapitres YouTube (marqueurs)">' + icon('list') + '<span>Chapitres</span></button>' +
            '<button class="sbtn" id="txExport" title="Exporter la transcription avec ses timecodes">' + icon('download') + '<span>Exporter</span></button>' +
          '</div>' +
          '<div class="tx-export" id="txExportRow" hidden>' +
            '<button class="sbtn sm" data-export="premiere" data-busy title="Piste de sous-titres dans la séquence : le texte apparaît dans le panneau Texte de Premiere (onglet Sous-titres)">' + icon('captions') + 'Sous-titres Premiere</button>' +
            '<button class="sbtn sm" data-export="srt" title="Fichier .srt (Premiere : Texte > Sous-titres > Importer ; YouTube…)">' + icon('download') + 'Fichier SRT</button>' +
            '<button class="sbtn sm" data-export="txt" title="Une phrase par ligne précédée de son timecode ; aussi copié dans le presse-papiers">' + icon('copy') + 'Texte + timecodes</button>' +
          '</div>' +
          '<div class="tx" id="tx"></div>' +
          '<div class="tx-sel" id="txSel"></div>' +
        '</section>' +
        (ui.chapters ? chaptersCard() : '') +
        '<section class="card stepcard">' +
          '<div class="step-head"><span class="step-n">1</span><div class="step-t"><b>Couper l\'inutile</b>' +
            '<span>Kiru transcrit la séquence et barre ce qui ne sert pas dans le texte ci-dessus. Vérifiez, puis appliquez.</span></div></div>' +
          '<div class="clean-opts">' +
            '<div class="clean-row">' + ctog('silences', 'Silences', 'Pauses entre les mots, gardées avec un peu d\'air') + K.numRow(PAUSE, c.minPause) + K.numRow(AIR, air()) + '</div>' +
            ctog('fillers', 'Hésitations', 'euh, hum… et mots répétés (« le le »). Liste modifiable dans Réglages > IA') +
            ctog('retakes', 'Reprises et faux départs', 'Phrase recommencée : seule la dernière prise est gardée') +
            ctog('ai', 'Relecture IA', 'L\'IA relit le sens : prises ratées, phrases abandonnées, discussions hors tournage (plus lent)') +
          '</div>' +
          '<div class="step-actions"><div class="chips" id="trackChips"></div>' +
            '<button class="btn-primary" id="btnClean" data-busy title="Transcrire si besoin, puis repérer ce qui est coché">' + icon('sparkles') + '<span>Analyser</span></button></div>' +
        '</section>' +
        '<section class="card apply">' +
          '<div class="opt-rows"><div class="opt-row">' + K.toggle('copy', prefs.copy, icon('layers') + 'Garder la séquence d\'origine intacte',
            'Kiru duplique la séquence (« … (Kiru) ») et coupe le double : l\'original reste tel quel, pour revenir en arrière à tout moment') +
            '<span class="hint">coupe une copie</span></div>' +
            '<div class="opt-row"><span class="opt-l">' + icon('scissors') + 'Action</span>' + K.seg('cleanAction', prefs.clean.action || 'delete', [
              ['delete', 'Supprimer', 'Coupe toutes les pistes déverrouillées et recolle : la synchro est gardée'],
              ['razor', 'Couper seulement', 'Coups de lame aux bords des passages, sans rien supprimer'],
              ['markers', 'Marqueurs', 'Un marqueur sur chaque passage, la séquence n\'est pas touchée']]) + '</div></div>' +
          '<div class="apply-row"><div class="sel-line" id="txLine"></div>' +
            '<button class="btn-ghost sm" id="txClear" data-busy title="Rétablir tous les mots barrés et silences">' + icon('reset') + '<span>Rétablir</span></button>' +
            '<button class="btn-primary big" id="btnApply" title="Appliquer aux passages repérés (Ctrl+Entrée)">' + icon('scissors') + '<span>' + applyLabel() + '</span></button></div>' +
        '</section>' +
        '</div>';
      K.renderTrackChips();
      renderWords(); renderSel(); renderFoot();
      bind();
      K.setBusy(state.busy);
    }

    function renderWords() {
      var el = $('#tx'), tx = state.tx;
      if (!el) return;
      var title = $('#txTitle');
      if (!tx) {
        var ready = X.findWhisper(prefs.tx.whisper) && X.installedModels().indexOf(prefs.tx.model) >= 0;
        el.innerHTML = '<div class="empty"><div class="big">' + icon('text') + '</div><h3>Le texte de la séquence s\'affichera ici</h3>' +
          '<div>Cochez ce qu\'il faut repérer puis « Analyser » : tout ce qui est inutile est barré ici pour que vous le vérifiiez. La même transcription sert ensuite aux sous-titres.</div>' +
          (K.inCEP && !ready ? '<button class="sbtn" id="txSetup">' + icon('download') + 'Installer la transcription locale</button>' : '') + '</div>';
        if ($('#txSetup')) $('#txSetup').onclick = function () { K.openSettings('ai'); };
        if (title) title.innerHTML = '';
        return;
      }
      var stale = K.inCEP && state.sum && state.sum.seq && state.sum.seq.id !== tx.seqId;
      if (title) title.innerHTML = '<b>' + esc(tx.seqName) + '</b> · ' + tx.words.length + ' mots' + (stale ? ' <span class="warn">autre séquence</span>' : '');
      var ws = tx.words, html = [], prevEnd = 0;
      sentences(ws).forEach(function (s, k) {
        if (k && ws[s.a].s - prevEnd > 1.5) html.push('</p><p>');
        for (var i = s.a; i <= s.b; i++) {
          if (i in ui.gap) html.push(gapHtml(i));
          var w = ws[i], cls = 'wd' + (ui.cut[i] ? ' cut' : '') + (ui.hits[i] ? ' hit' : '') + (i === ui.now ? ' now' : '');
          html.push('<span class="' + cls + '" data-i="' + i + '" title="' + K.fmtTC(w.s) + (ui.why[i] ? ' · ' + esc(ui.why[i]) : '') + '">' + esc(w.w) + '</span> ');
        }
        prevEnd = ws[s.b].e;
      });
      el.innerHTML = '<p>' + html.join('') + '</p>';
      ui.painted = [];
      paintSel();
    }
    /** Pause repérée avant le mot i : coupée (barrée) ou gardée, clic pour basculer */
    function gapHtml(i) {
      var ws = words(), d = ws[i].s - ws[i - 1].e, on = ui.gap[i];
      return '<span class="gap' + (on ? ' cut' : '') + '" data-g="' + i + '" title="Pause de ' + d.toFixed(1).replace('.', ',') + ' s · clic : ' + (on ? 'la garder' : 'la couper') + '">' +
        d.toFixed(1).replace('.', ',') + ' s</span> ';
    }
    function span(i) { return $('#tx .wd[data-i="' + i + '"]'); }
    function paintSel() {
      ui.painted.forEach(function (i) { var s = span(i); if (s) s.classList.remove('sel'); });
      ui.painted = [];
      if (!ui.sel) return;
      for (var i = ui.sel[0]; i <= ui.sel[1]; i++) { var s = span(i); if (s) { s.classList.add('sel'); ui.painted.push(i); } }
    }
    function renderSel() {
      var el = $('#txSel'), ws = words();
      if (!el) return;
      if (!ui.sel || !ws.length) {
        el.innerHTML = ws.length ? '<span class="hint"><b>Clic</b> : tête de lecture · <b>glisser</b> : sélectionner · <b>Suppr</b> : barrer · <b>double-clic</b> : corriger un mot</span>' : '';
        return;
      }
      var a = ui.sel[0], b = ui.sel[1], allCut = true;
      for (var i = a; i <= b; i++) if (!ui.cut[i]) { allCut = false; break; }
      var text = ws.slice(a, b + 1).map(function (w) { return w.w; }).join(' ');
      el.innerHTML = '<span class="sel-text" title="' + esc(text) + '">« ' + esc(text.length > 48 ? text.slice(0, 46) + '…' : text) + ' »</span>' +
        '<span class="hint">' + (b - a + 1) + ' mot' + (b > a ? 's' : '') + ' · ' + K.fmtDur(ws[b].e - ws[a].s) + '</span>' +
        '<button class="sbtn sm" id="selCut">' + icon(allCut ? 'reset' : 'scissors') + (allCut ? 'Garder' : 'Barrer') + '</button>' +
        (a === b ? '<button class="sbtn sm" id="selEdit">' + icon('type') + 'Corriger</button>' : '') +
        '<button class="sbtn sm" id="selMarker" title="Marqueur sur ce passage">' + icon('flag') + '</button>';
      $('#selCut').onclick = function () { mark(a, b, !allCut, 'manuel'); };
      if ($('#selEdit')) $('#selEdit').onclick = function () { editWord(a); };
      $('#selMarker').onclick = function () {
        if (!K.inCEP) return K.toast('Disponible dans Premiere Pro.', 'err');
        var tpf = K.seqTpf(), r = [Math.round(ws[a].s * TICKS / tpf) * tpf, Math.round(ws[b].e * TICKS / tpf) * tpf, text.slice(0, 60)];
        K.jsx('addMarkers', [JSON.stringify([r]), text.slice(0, 60), 4]).then(function (res) { K.toast(res.success ? 'Marqueur posé.' : res.error, res.success ? 'ok' : 'err'); });
      };
    }
    function cutStats() {
      var r = ranges(), d = 0, g = 0;
      r.forEach(function (x) { d += x[1] - x[0]; });
      Object.keys(ui.gap).forEach(function (i) { if (ui.gap[i]) g++; });
      return { n: r.length, dur: d, words: Object.keys(ui.cut).length, gaps: g };
    }
    function renderFoot() {
      var el = $('#txLine');
      if (!el) return;
      var tx = state.tx, s = cutStats();
      var dot = '<span class="dot' + (s.n ? ' on' : '') + '"></span>';
      if (!tx) { el.innerHTML = dot + 'Pas encore de transcription'; return; }
      var parts = [];
      if (s.words) parts.push(s.words + ' mot' + (s.words > 1 ? 's' : ''));
      if (s.gaps) parts.push(s.gaps + ' silence' + (s.gaps > 1 ? 's' : ''));
      el.innerHTML = dot + (s.n ? parts.join(' · ') + ' · <b>−' + K.fmtDur(s.dur) + '</b>' : 'Rien à couper');
    }

    function mark(a, b, on, reason) {
      for (var i = a; i <= b; i++) {
        if (on) { ui.cut[i] = true; ui.why[i] = reason || 'manuel'; } else { delete ui.cut[i]; delete ui.why[i]; }
        var s = span(i);
        if (s) s.classList.toggle('cut', !!on);
      }
      renderSel(); renderFoot();
    }

    function editWord(i) {
      var s = span(i), w = words()[i];
      if (!s || !w) return;
      var inp = document.createElement('input');
      inp.className = 'inline-edit wd-edit'; inp.value = w.w;
      inp.style.width = Math.max(60, s.offsetWidth + 30) + 'px';
      s.replaceWith(inp); inp.focus(); inp.select();
      var done = false;
      var commit = function (ok) {
        if (done) return; done = true;
        var v = inp.value.replace(/\s+/g, ' ').trim();
        if (ok && v && v !== w.w) {
          if (w.ref) {
            // mot issu d'une correction en plusieurs mots : on remplace sa part dans l'entrée du cache
            var full = v;
            if (w.ref.parts) {
              var src = String(w.ref.data.words[w.ref.i].w).split(/\s+/);
              src[w.ref.part] = v; full = src.join(' ');
            }
            X.saveEdit(w.ref.data, w.ref.i, full);
          }
          w.w = v;
          var n = v.split(' ').length;
          if (n > 1) {
            // les marques (barré, raison, silence) des mots suivants se décalent d'autant
            var shift = function (o) { var r = {}; Object.keys(o).forEach(function (k) { var j = Number(k); r[j > i ? j + n - 1 : j] = o[k]; }); return r; };
            ui.cut = shift(ui.cut); ui.why = shift(ui.why); ui.gap = shift(ui.gap);
            state.tx.words = expand(state.tx.words);
            computeHits();
          }
          renderFoot();
        }
        renderWords(); renderSel();
      };
      inp.onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); };
      inp.onblur = function () { commit(true); };
    }

    // ==================== Analyse : couper l'inutile ====================
    /** Analyser : transcription si besoin (instantanée grâce au cache), puis chaque détection cochée */
    function clean() {
      if (state.busy) return;
      var c = prefs.clean;
      if (!c.silences && !c.fillers && !c.retakes && !c.ai) return K.toast('Cochez au moins une chose à repérer.', 'err');
      if (c.ai && !needClaude(true)) return;
      K.setBusy(true);
      (fresh() ? Promise.resolve(true) : transcribe(true)).then(function (ok) {
        if (!ok) return;
        ui.cut = {}; ui.why = {}; ui.gap = {};
        var r = { pauses: c.silences ? markPauses(c.minPause) : 0, fillers: c.fillers ? markFillers() : 0, retakes: c.retakes ? markRetakes() : 0, ai: 0 };
        render();
        return (c.ai ? aiTakes().then(function (n) { r.ai = n; }) : Promise.resolve()).then(function () {
          renderWords(); renderSel(); renderFoot();
          var s = cutStats(), parts = [];
          if (r.pauses) parts.push(r.pauses + ' silence' + (r.pauses > 1 ? 's' : ''));
          if (r.fillers) parts.push(r.fillers + ' hésitation' + (r.fillers > 1 ? 's' : ''));
          if (r.retakes) parts.push(r.retakes + ' mot' + (r.retakes > 1 ? 's' : '') + ' de reprises');
          if (r.ai) parts.push(r.ai + ' mot' + (r.ai > 1 ? 's' : '') + ' relevés par l\'IA');
          var first = $('#tx .wd.cut, #tx .gap.cut'); if (first) first.scrollIntoView({ block: 'nearest' });
          K.toast(parts.length ? 'À couper : ' + parts.join(', ') + ' (−' + K.fmtDur(s.dur) + '). Vérifiez dans le texte (survol = raison, clic sur un silence = le garder), puis « ' + applyLabel() + ' ».'
            : 'Rien d\'inutile trouvé avec ces réglages.');
        });
      }).catch(aiFailed).then(function () { K.setBusy(false); });
    }
    /** Silences : pauses entre deux mots d'au moins minPause secondes */
    function markPauses(minPause) {
      var ws = words(), n = 0;
      for (var i = 1; i < ws.length; i++) {
        if (ws[i].s - ws[i - 1].e >= Math.max(minPause, air() * 2 + 0.05)) { ui.gap[i] = true; n++; }
      }
      return n;
    }
    function markFillers() {
      var ws = words();
      var list = String(prefs.tx.fillers || '').split(',').map(function (s) { return X.normWord(s); }).filter(Boolean).map(function (s) { return s.split(/\s+/); });
      var n = 0, put = function (i, why) { if (!ui.cut[i]) { ui.cut[i] = true; ui.why[i] = why; n++; } };
      var nw = ws.map(function (w) { return X.normWord(w.w); });
      for (var i = 0; i < ws.length; i++) {
        for (var k = 0; k < list.length; k++) {
          var ph = list[k], ok = true;
          for (var j = 0; j < ph.length; j++) if (nw[i + j] !== ph[j]) { ok = false; break; }
          if (ok) { for (j = 0; j < ph.length; j++) put(i + j, 'hésitation'); break; }
        }
        if (prefs.tx.stutter && nw[i]) {
          // « le le » / « c'est de c'est de » : la première occurrence est barrée
          if (nw[i] === nw[i + 1] && ws[i + 1].s - ws[i].e < 0.8) put(i, 'répétition');
          else if (nw[i + 1] && nw[i] === nw[i + 2] && nw[i + 1] === nw[i + 3] && ws[i + 2].s - ws[i + 1].e < 0.8) { put(i, 'répétition'); put(i + 1, 'répétition'); }
        }
      }
      return n;
    }

    /** Reprises et faux départs, détectés sur cet ordinateur (js/retakes.js) : la dernière prise est gardée */
    function markRetakes() {
      var marks = window.KiruRetakes.find(words(), { normWord: X.normWord }), n = 0;
      Object.keys(marks).forEach(function (i) { if (!ui.cut[i]) { n++; ui.cut[i] = true; ui.why[i] = marks[i]; } });
      return n;
    }

    /** Moteur choisi dans Réglages > IA : abonnement Claude (Claude Code) ou clé API */
    function aiCfg() {
      return { engine: prefs.aiEngine || 'local', key: prefs.claudeKey, model: prefs.llmModel,
        onStatus: function (msg) { K.toast(msg, 'busy', true); } };
    }
    function needClaude(beforeTx) {
      if (!beforeTx && !words().length) { K.toast('Transcrivez d\'abord la séquence.', 'err'); return false; }
      var c = aiCfg(), L = window.KiruLLM;
      if (c.engine === 'local') {
        if (!L.findServer() || L.installedModels().indexOf(c.model) < 0) {
          K.toast('IA locale à installer : Réglages > IA > « Installer l\'IA locale » puis télécharger le modèle (une seule fois).', 'err');
          K.openSettings('ai');
          return false;
        }
        return true;
      }
      if (c.engine === 'api' && !c.key) { K.toast('Ajoutez votre clé API Claude, ou passez par votre abonnement (Réglages > IA).', 'err'); K.openSettings('ai'); return false; }
      if (c.engine !== 'api' && !AI.findClaudeCode()) { K.toast('Claude Code introuvable : installez l\'application Claude, ou utilisez une clé API (Réglages > IA).', 'err'); K.openSettings('ai'); return false; }
      return true;
    }
    function aiFailed(e) {
      K.toast(e.message || String(e), 'err');
      if (e.login) K.openSettings('ai');
    }
    /** Relecture IA (moteur choisi dans Réglages > IA) : phrases ratées, abandonnées, hors tournage ; résout le nombre de mots barrés */
    function aiTakes() {
      var ss = sentences(words());
      K.toast((aiCfg().engine === 'local' ? 'L\'IA locale relit ' : 'Claude relit ') + ss.length + ' phrases' + (aiCfg().engine === 'claude-code' ? ' (Claude Code, environ 20 à 60 s)' : '') + '…', 'busy', true);
      return AI.badTakes(aiCfg(), ss.map(function (s) { return { id: s.id, start: s.start, text: s.text }; })).then(function (list) {
        var n = 0;
        list.forEach(function (it) {
          var s = ss[it.id - 1];
          if (!s) return;
          for (var i = s.a; i <= s.b; i++) { if (!ui.cut[i]) n++; ui.cut[i] = true; ui.why[i] = 'IA : ' + it.reason; }
        });
        return n;
      });
    }
    function chapters() {
      if (state.busy || !needClaude()) return;
      var ss = sentences(words());
      K.setBusy(true);
      K.toast((aiCfg().engine === 'local' ? 'L\'IA locale' : 'Claude') + ' découpe la vidéo en chapitres…', 'busy', true);
      AI.chapters(aiCfg(), ss.map(function (s) { return { id: s.id, start: s.start, text: s.text }; }), state.tx.lang !== 'auto' ? state.tx.lang : '').then(function (list) {
        list = list.filter(function (c) { return ss[c.id - 1]; }).sort(function (a, b) { return a.id - b.id; });
        if (!list.length) throw new Error('L\'IA n\'a proposé aucun chapitre.');
        ui.chapters = list.map(function (c, k) { return { t: k ? ss[c.id - 1].start : 0, title: c.title }; });
        render();
        K.toast(list.length + ' chapitres proposés : modifiez les titres si besoin.');
      }).catch(aiFailed).then(function () { K.setBusy(false); });
    }
    // ==================== Export de la transcription ====================
    /** Mots gardés (les passages barrés sont laissés de côté) */
    function keptWords() { return words().filter(function (w, i) { return !ui.cut[i]; }); }
    function timecode(t, fps) {
      var f = Math.round(t * fps), r = Math.round(fps), p = function (n) { return (n < 10 ? '0' : '') + n; };
      return p(Math.floor(f / (r * 3600))) + ':' + p(Math.floor(f / (r * 60)) % 60) + ':' + p(Math.floor(f / r) % 60) + ':' + p(f % r);
    }
    function exportTx(kind) {
      var tx = state.tx, ws = keptWords();
      if (!tx || !ws.length) return K.toast('Transcrivez d\'abord la séquence.', 'err');
      var fs = K.nodeReq('fs'), path = K.nodeReq('path'), os = K.nodeReq('os');
      var C = window.KiruCaptions, W = tx.width || 1920, H = tx.height || 1080, fps = TICKS / (tx.tpf || TICKS / 25);
      // sous-titres de lecture : phrases découpées comme le style « Classique » (2 lignes, jusqu'à 12 mots)
      var cs = C.style({ font: 'Arial', weight: 400, size: 4.6, maxWords: 12, maxLines: 2, maxWidth: 90 });
      var bl = C.blocks(ws, cs, W, H);
      var d = new Date(), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
      var proj = state.sum && state.sum.seq && state.sum.seq.project;
      var dir = path.join(proj ? path.dirname(proj) : path.join(os.homedir(), 'Documents'), 'Kiru', 'Transcriptions');
      var base = path.join(dir, String(tx.seqName).replace(/[\\\/:*?"<>|]+/g, '-').slice(0, 60) + ' ' + stamp);
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return K.toast('Dossier impossible à créer : ' + dir, 'err'); }
      if (kind === 'txt') {
        var lines = sentences(ws).map(function (s) { return '[' + timecode(s.start, fps) + '] ' + s.text; });
        fs.writeFileSync(base + '.txt', lines.join('\r\n') + '\r\n', 'utf8');
        K.copyText(lines.join('\n'));
        return K.toast('Transcription enregistrée (' + lines.length + ' phrases) et copiée : ' + base + '.txt');
      }
      fs.writeFileSync(base + '.srt', C.srt(bl, cs, W, H), 'utf8');
      if (kind === 'srt') return K.toast('Fichier SRT enregistré (' + bl.length + ' sous-titres) : ' + base + '.srt');
      if (!K.inCEP) return K.toast('Disponible dans Premiere Pro.', 'err');
      K.setBusy(true);
      K.jsx('srtCaptions', [base + '.srt', 'Kiru — Transcription ' + stamp]).then(function (r) {
        K.toast(r.success ? bl.length + ' sous-titres ajoutés à la séquence : panneau Texte > Sous-titres pour les relire et les modifier.' : r.error, r.success ? 'ok' : 'err');
      }).then(function () { K.setBusy(false); });
    }

    function ytTime(t) { t = Math.floor(t); var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s; }
    function chaptersCard() {
      return '<section class="card chapters"><div class="ed-head"><span class="section-title">Chapitres</span><span class="curve-name"></span>' +
        '<div class="ed-tools"><button class="sbtn sm" id="chMarkers" data-busy>' + icon('flag') + 'Marqueurs</button>' +
        '<button class="sbtn sm" id="chCopy">' + icon('copy') + 'Copier pour YouTube</button>' +
        '<button class="tool" id="chClose" title="Fermer">' + icon('x') + '</button></div></div>' +
        '<ol class="ch-list">' + ui.chapters.map(function (c, k) {
          return '<li><button class="ch-t" data-cht="' + k + '">' + ytTime(c.t) + '</button><input class="ch-title" data-ch="' + k + '" value="' + esc(c.title) + '" maxlength="80"/></li>';
        }).join('') + '</ol></section>';
    }

    function computeHits() {
      ui.hits = {};
      var q = X.normWord(ui.search), ws = words();
      if (!q) return 0;
      var parts = q.split(/\s+/), nw = ws.map(function (w) { return X.normWord(w.w); }), n = 0;
      for (var i = 0; i < ws.length; i++) {
        var ok = true;
        for (var j = 0; j < parts.length; j++) {
          var x = nw[i + j];
          if (x == null || (parts.length === 1 ? x.indexOf(parts[0]) < 0 : x !== parts[j] && !(j === parts.length - 1 && x.indexOf(parts[j]) === 0))) { ok = false; break; }
        }
        if (ok) { for (j = 0; j < parts.length; j++) ui.hits[i + j] = true; n++; }
      }
      return n;
    }

    // ==================== Interactions ====================
    function bind() {
      $('#btnAnalyze').onclick = function () { transcribe(); };
      $('#btnClean').onclick = clean;
      $$('[data-clean]').forEach(function (l) {
        l.onclick = function (e) {
          e.preventDefault();
          var id = l.getAttribute('data-clean');
          prefs.clean[id] = !prefs.clean[id]; l.classList.toggle('on', prefs.clean[id]); K.savePrefs();
        };
      });
      K.bindNums($('#view'), [PAUSE, AIR], function (id) { return id === 'air' ? air() : prefs.clean.minPause; }, function (id, v) {
        prefs.clean[id] = v; K.savePrefsSoon();
        if (id === 'air') renderFoot(); // la durée retirée change avec la marge
      });
      $$('[data-seg="cleanAction"] button').forEach(function (b) {
        b.onclick = function () {
          prefs.clean.action = b.getAttribute('data-v'); K.savePrefs();
          $$('[data-seg="cleanAction"] button').forEach(function (x) { x.classList.toggle('on', x === b); });
          var lbl = $('#btnApply span'); if (lbl) lbl.textContent = applyLabel();
        };
      });
      $('#txChapters').onclick = chapters;
      $('#txExport').onclick = function () { var r = $('#txExportRow'); r.hidden = !r.hidden; };
      $$('[data-export]').forEach(function (b) { b.onclick = function () { exportTx(b.getAttribute('data-export')); }; });
      $('#btnApply').onclick = apply;
      $('#txClear').onclick = function () { ui.cut = {}; ui.why = {}; ui.gap = {}; renderWords(); renderSel(); renderFoot(); };
      $$('[data-toggle="copy"]').forEach(function (l) {
        l.onclick = function (e) { e.preventDefault(); prefs.copy = !prefs.copy; l.classList.toggle('on', prefs.copy); K.savePrefs(); };
      });
      var si = $('#txSearch');
      var updHits = function () {
        var n = computeHits();
        $('#txHits').innerHTML = ui.search ? n + '<button class="mini-btn" id="hitMarkers" title="Marqueur sur chaque occurrence">' + icon('flag') + '</button>' : '';
        $$('#tx .wd').forEach(function (s) { s.classList.toggle('hit', !!ui.hits[s.getAttribute('data-i')]); });
        if ($('#hitMarkers')) $('#hitMarkers').onclick = function (e) { e.preventDefault(); hitMarkers(); };
        var first = $('#tx .wd.hit'); if (first) first.scrollIntoView({ block: 'nearest' });
      };
      si.oninput = function () { ui.search = si.value; updHits(); };
      si.onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Escape') { si.value = ''; ui.search = ''; updHits(); } };
      if (ui.search) updHits();

      var tx = $('#tx');
      tx.onmousedown = function (e) {
        var g = e.target.closest('.gap');
        if (g && e.button === 0) {
          e.preventDefault();
          var gi = Number(g.getAttribute('data-g'));
          ui.gap[gi] = !ui.gap[gi];
          g.outerHTML = gapHtml(gi).replace(/ $/, '');
          renderFoot();
          return;
        }
        var s = e.target.closest('.wd');
        if (!s || e.button !== 0) { if (!e.target.closest('input')) { ui.sel = null; paintSel(); renderSel(); } return; }
        e.preventDefault();
        var i = Number(s.getAttribute('data-i'));
        if (e.shiftKey && ui.sel) ui.sel = [Math.min(ui.sel[0], i), Math.max(ui.sel[1], i)];
        else ui.sel = [i, i];
        ui.anchor = e.shiftKey && ui.sel ? ui.sel[0] : i; ui.down = true; ui.moved = !!e.shiftKey;
        paintSel();
        var up = function () {
          window.removeEventListener('mouseup', up);
          ui.down = false;
          if (!ui.moved) {
            var w = words()[i];
            state.player = w.s;
            onPlayer(w.s);
            if (K.inCEP) K.jsx('setPlayer', [Math.round(w.s * TICKS)]);
          }
          renderSel();
        };
        window.addEventListener('mouseup', up);
      };
      tx.onmouseover = function (e) {
        if (!ui.down) return;
        var s = e.target.closest('.wd');
        if (!s) return;
        var i = Number(s.getAttribute('data-i'));
        if (i !== ui.anchor) ui.moved = true;
        ui.sel = [Math.min(ui.anchor, i), Math.max(ui.anchor, i)];
        paintSel();
      };
      tx.ondblclick = function (e) { var s = e.target.closest('.wd'); if (s) editWord(Number(s.getAttribute('data-i'))); };

      if (ui.chapters) {
        $$('[data-ch]').forEach(function (inp) {
          inp.onkeydown = function (e) { e.stopPropagation(); };
          inp.oninput = function () { ui.chapters[Number(inp.getAttribute('data-ch'))].title = inp.value; };
        });
        $$('[data-cht]').forEach(function (b) {
          b.onclick = function () { var t = ui.chapters[Number(b.getAttribute('data-cht'))].t; if (K.inCEP) K.jsx('setPlayer', [Math.round(t * TICKS)]); };
        });
        $('#chClose').onclick = function () { ui.chapters = null; render(); };
        $('#chCopy').onclick = function () {
          K.copyText(ui.chapters.map(function (c) { return ytTime(c.t) + ' ' + c.title; }).join('\n'));
          K.toast('Chapitres copiés : à coller dans la description YouTube.');
        };
        $('#chMarkers').onclick = function () {
          if (!K.inCEP) return K.toast('Disponible dans Premiere Pro.', 'err');
          var tpf = K.seqTpf();
          var list = ui.chapters.map(function (c) { var t = Math.round(c.t * TICKS / tpf) * tpf; return [t, t, c.title]; });
          K.jsx('addMarkers', [JSON.stringify(list), 'Chapitre', 5, 'chapter']).then(function (r) {
            K.toast(r.success ? r.markers + ' marqueurs de chapitre posés.' : r.error, r.success ? 'ok' : 'err');
          });
        };
      }
    }
    function hitMarkers() {
      if (!K.inCEP) return K.toast('Disponible dans Premiere Pro.', 'err');
      var ws = words(), tpf = K.seqTpf(), list = [];
      Object.keys(ui.hits).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) {
        if (ui.hits[i - 1]) return;
        var t = Math.round(ws[i].s * TICKS / tpf) * tpf;
        list.push([t, t, ui.search]);
      });
      K.jsx('addMarkers', [JSON.stringify(list), ui.search, 3]).then(function (r) { K.toast(r.success ? r.markers + ' marqueurs « ' + ui.search + ' ».' : r.error, r.success ? 'ok' : 'err'); });
    }

    /** Raccourcis quand l'onglet Texte est affiché : Suppr = barrer / rétablir la sélection */
    function key(e) {
      if (!ui.sel) return false;
      if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        var all = true;
        for (var i = ui.sel[0]; i <= ui.sel[1]; i++) if (!ui.cut[i]) { all = false; break; }
        mark(ui.sel[0], ui.sel[1], !all, 'manuel');
        return true;
      }
      if (e.code === 'Escape') { ui.sel = null; paintSel(); renderSel(); }
      return false;
    }

    /** Mot sous la tête de lecture (surligné, gardé visible) */
    function onPlayer(t) {
      var ws = words(), lo = 0, hi = ws.length - 1, idx = -1;
      while (lo <= hi) { var m = (lo + hi) >> 1; if (ws[m].s <= t) { idx = m; lo = m + 1; } else hi = m - 1; }
      if (idx >= 0 && t > ws[idx].e + 0.4) idx = -1;
      if (idx === ui.now) return;
      var old = span(ui.now); if (old) old.classList.remove('now');
      ui.now = idx;
      var s = span(idx);
      if (s) { s.classList.add('now'); if (!ui.down) s.scrollIntoView({ block: 'nearest' }); }
    }

    // ==================== Coupe ====================
    /**
     * Plages à couper : passages barrés (du début du 1er mot jusqu'au mot gardé suivant, avec un peu d'air)
     * et silences coupés (la pause moins la marge de chaque côté) ; fusionnées si elles se touchent.
     */
    function ranges() {
      var w = words(), out = [], i = 0;
      while (i < w.length) {
        if (!ui.cut[i]) { i++; continue; }
        var j = i;
        while (j + 1 < w.length && ui.cut[j + 1]) j++;
        var a = Math.max(i ? w[i - 1].e : 0, w[i].s - 0.03);
        var b = j + 1 < w.length ? Math.max(w[j].e, w[j + 1].s - 0.04) : w[j].e + 0.05;
        out.push([a, b]);
        i = j + 1;
      }
      Object.keys(ui.gap).forEach(function (k) {
        k = Number(k);
        if (!ui.gap[k] || !w[k] || !w[k - 1]) return;
        var a = w[k - 1].e + air(), b = w[k].s - air();
        if (b - a > 0.05) out.push([a, b]);
      });
      out.sort(function (x, y) { return x[0] - y[0]; });
      var merged = [];
      out.forEach(function (r) {
        var last = merged[merged.length - 1];
        if (last && r[0] <= last[1] + 0.01) last[1] = Math.max(last[1], r[1]); else merged.push([r[0], r[1]]);
      });
      return merged;
    }
    function apply() {
      if (state.busy) return;
      var tx = state.tx;
      if (!tx) return K.toast('Transcrivez d\'abord la séquence.', 'err');
      var r = ranges();
      if (!r.length) return K.toast('Rien à couper : lancez « Analyser », ou sélectionnez des mots puis Suppr.', 'err');
      if (!K.inCEP) return K.toast('Disponible dans Premiere Pro : ici, seul l\'aperçu fonctionne.', 'err');
      if (state.sum && state.sum.seq && state.sum.seq.id !== tx.seqId) return K.toast('La séquence active n\'est pas celle transcrite : retranscrivez-la (le cache rend ça instantané).', 'err');
      K.cutRanges(r, prefs.clean.action || 'delete', 'passages');
    }
    /** Après la coupe : les mots suivent (supprimés ou avancés), les corrections sont gardées */
    function collapse(sortedTicks) {
      var tx = state.tx, R = sortedTicks.map(function (r) { return [r[0] / TICKS, r[1] / TICKS]; }), out = [];
      tx.words.forEach(function (w) {
        var at = anchor(w), shift = 0;
        for (var k = 0; k < R.length; k++) {
          if (at >= R[k][0] && at < R[k][1]) return;
          if (R[k][1] <= at) shift += R[k][1] - R[k][0];
        }
        out.push(Object.assign({}, w, { s: w.s - shift, e: w.e - shift }));
      });
      tx.words = out;
      resetUi();
    }

    return {
      render: render, apply: apply, key: key, onPlayer: onPlayer, collapse: collapse, transcribe: transcribe, fresh: fresh,
      pending: function () { return ranges().length > 0; },
      demo: function () { if (!state.tx) { state.tx = demoTx(); resetUi(); } }
    };
  };
})();
