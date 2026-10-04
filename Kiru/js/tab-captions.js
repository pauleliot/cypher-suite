/**
 * Kiru — onglet Sous-titres : style en direct, puis génération dans Premiere.
 *
 *  - Images stylées : un PNG transparent par état (mot actif), posé sur une piste vidéo libre ;
 *    rendu identique à l'aperçu, aucune dépendance (pas de MOGRT ni d'After Effects).
 *  - Sous-titres Premiere : fichier SRT importé en piste de sous-titres (texte modifiable, style de Premiere).
 *  - Fichier SRT : pour YouTube ou un autre logiciel.
 * Les mots viennent de la transcription de l'étape « 1 · Nettoyer » (corrections comprises), ou sont transcrits ici.
 */
(function () {
  'use strict';
  window.KiruTabs = window.KiruTabs || {};

  window.KiruTabs.captions = function (K) {
    var C = window.KiruCaptions, $ = K.$, $$ = K.$$, esc = K.esc, icon = K.icon;
    var prefs = K.prefs, state = K.state, TICKS = K.TICKS;
    var raf = 0, t0 = 0, cache = null;
    var ui = { saving: false };
    var FONTS = ['Urbanist', 'Arial Black', 'Impact', 'Montserrat', 'Poppins', 'Inter', 'Segoe UI Black', 'Bebas Neue', 'Helvetica Neue', 'Arial'];

    function presets() {
      return C.PRESETS.concat(prefs.capStyles.map(function (s) { return { id: s.id, name: s.name, style: s.style, user: true }; }));
    }
    function preset(id) { return presets().filter(function (p) { return p.id === id; })[0] || C.PRESETS[0]; }
    function st() {
      if (!prefs.cap.style) prefs.cap.style = C.style(preset(prefs.cap.preset).style);
      return C.style(prefs.cap.style);
    }
    function frame() {
      var s = state.sum && state.sum.seq, tx = state.tx;
      return [(s && s.width) || (tx && tx.width) || 1920, (s && s.height) || (tx && tx.height) || 1080];
    }

    /** Mots de l'aperçu : début de la transcription (ramené à 0), sinon une phrase d'exemple */
    var SAMPLE = 'Et si ajouter des sous-titres était enfin facile ? Un clic, et chaque mot s\'allume au bon moment.';
    function sampleWords() {
      var tx = state.tx;
      if (tx && tx.words.length) {
        var ws = tx.words.slice(0, 24), off = ws[0].s;
        return ws.map(function (w) { return { w: w.w, s: w.s - off, e: w.e - off }; });
      }
      var t = 0.2;
      return SAMPLE.split(' ').map(function (w) {
        var d = 0.18 + w.length * 0.03, o = { w: w, s: t, e: t + d };
        t += d + (/[?.!]$/.test(w) ? 0.45 : 0.07);
        return o;
      });
    }
    function computed() {
      if (cache) return cache;
      // sortie « Modifiables » : l'aperçu prend la police que recevra le modèle (installée sur l'ordinateur)
      var f = frame(), s = prefs.cap.target === 'mogrt' ? Object.assign(st(), mogrtFont(st())) : st(), fps = 30;
      var bl = C.blocks(sampleWords(), s, f[0], f[1]);
      cache = { W: f[0], H: f[1], st: s, bl: bl, states: C.states(bl, s, fps), dur: bl.length ? bl[bl.length - 1].end + 0.6 : 1 };
      return cache;
    }
    function invalidate() { cache = null; }

    // ==================== Aperçu ====================
    function drawBackdrop(ctx, W, H, t) {
      var g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#2b3448'); g.addColorStop(0.55, '#4a3f3a'); g.addColorStop(1, '#1d2230');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // « scène » floue : quelques taches lumineuses qui bougent doucement
      [[0.25, 0.3, '#f2b27a'], [0.75, 0.25, '#7fa2ff'], [0.55, 0.62, '#d9d2c3']].forEach(function (b, k) {
        var x = (b[0] + Math.sin(t * 0.3 + k) * 0.03) * W, y = (b[1] + Math.cos(t * 0.25 + k) * 0.03) * H, r = Math.min(W, H) * 0.35;
        var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, b[2] + '55'); rg.addColorStop(1, b[2] + '00');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      });
    }
    function drawPreview() {
      var cv = $('#capPreview');
      if (!cv) { stop(); return; }
      var c = computed(), box = cv.parentNode.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      // l'aperçu garde le format de la séquence (16:9, 9:16…) dans la place disponible
      var maxW = box.width, maxH = Math.max(160, Math.min(box.height || 9e9, c.H > c.W ? 420 : 300));
      var scale = Math.min(maxW / c.W, maxH / c.H), w = Math.round(c.W * scale), h = Math.round(c.H * scale);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px';
      }
      var ctx = cv.getContext('2d'), now = (performance.now() - t0) / 1000, t = now % c.dur;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      drawBackdrop(ctx, c.W, c.H, now);
      var cur = null;
      for (var i = 0; i < c.states.length; i++) if (c.states[i].from <= t && t < c.states[i].to) { cur = c.states[i]; break; }
      if (cur) {
        // glissement de la boîte : propre aux sous-titres modifiables (le modèle l'anime dans Premiere)
        var bw = c.bl[cur.block].words, u = null;
        if (prefs.cap.target === 'mogrt' && c.st.slide > 0 && cur.active > 0 && bw[cur.active]) u = (t - bw[cur.active].s) / (c.st.slide * 0.3);
        C.draw(ctx, c.W, c.H, bw, cur.active, c.st, cur.variant, u);
      }
      raf = requestAnimationFrame(drawPreview);
    }
    function start() { stop(); t0 = performance.now(); raf = requestAnimationFrame(drawPreview); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    // ==================== Contrôles ====================
    /** Valeurs numériques : nom + chiffre modifiable (clic, glisser, molette) — voir bindNums dans app.js */
    var NUMS = [
      // taille : réglée en % de l'image, affichée en pixels de la séquence (voir nums)
      { id: 'size', label: 'Taille', min: 2.5, max: 14, step: 0.1, unit: 'px' },
      { id: 'radius', label: 'Arrondi de la boîte', min: 0, max: 0.5, step: 0.01, unit: '%', scale: 100 },
      { id: 'y', label: 'Position verticale', min: 8, max: 95, step: 1, unit: '%', hint: '0 % = en haut, 100 % = en bas' },
      { id: 'maxWidth', label: 'Largeur max. du texte', min: 20, max: 100, step: 1, unit: '%', hint: 'Largeur de la zone de texte, en % de l\'image : au-delà, le texte passe à la ligne' },
      { id: 'maxWords', label: 'Mots par bloc (max.)', min: 1, max: 14, step: 1, unit: '' },
      { id: 'gap', label: 'Trou entre sous-titres', min: 0, max: 1, step: 0.01, unit: 'ms', scale: 1000, hint: 'Écran sans texte entre deux sous-titres qui se suivent' },
      { id: 'lead', label: 'Avance', min: 0, max: 0.5, step: 0.01, unit: 'ms', scale: 1000, hint: 'Le texte s\'affiche un peu avant d\'être prononcé' },
      { id: 'slide', label: 'Glissement de la boîte', min: 0, max: 1, step: 0.05, unit: '%', scale: 100, hint: 'La boîte glisse d\'un mot au suivant (sous-titres modifiables) ; 0 = elle saute' },
      { id: 'blur', label: 'Flou de mouvement', min: 0, max: 1, step: 0.05, unit: '%', scale: 100, hint: 'Flou sur le glissement et le pop (sous-titres modifiables) ; 0 = aucun' },
      { id: 'stroke', label: 'Contour', min: 0, max: 0.2, step: 0.005, unit: '%', scale: 100 },
      { id: 'shadow', label: 'Ombre', min: 0, max: 1, step: 0.05, unit: '%', scale: 100 },
      { id: 'bgOpacity', label: 'Opacité du bandeau', min: 0.1, max: 1, step: 0.05, unit: '%', scale: 100 }
    ];
    /** Champs numériques ; la taille s'affiche en pixels de la séquence active */
    function nums() {
      var f = frame(), base = C.sizeBase(f[0], f[1]);
      return NUMS.map(function (n) { return n.id === 'size' ? Object.assign({}, n, { scale: base / 100 }) : n; });
    }
    function numVal(id) {
      var s = st();
      if (id === 'size' && s.sizePx > 0) { var f = frame(); return s.sizePx / (C.sizeBase(f[0], f[1]) / 100); }
      return s[id];
    }
    function range(id) {
      var sp = nums().filter(function (n) { return n.id === id; })[0];
      return K.numRow(sp, numVal(id));
    }
    function color(id, label) {
      return '<label class="colorf"><input type="color" data-capc="' + id + '" value="' + esc(st()[id]) + '"/><span>' + label + '</span></label>';
    }
    function segc(id, label, options) {
      var v = String(st()[id]);
      return '<div class="field"><div class="lbl"><span>' + label + '</span></div><div class="seg" data-caps="' + id + '">' + options.map(function (o) {
        return '<button data-v="' + o[0] + '" class="' + (v === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div></div>';
    }
    function tog(id, label) {
      return '<label class="toggle ' + (st()[id] ? 'on' : '') + '" data-capt="' + id + '"><span class="sw"></span>' + label + '</label>';
    }

    /** En-tête de l'étape 2 : type de sous-titres, transcription ou correction du texte */
    function stepCard(ready) {
      var classic = prefs.cap.kind === 'classic';
      return '<section class="card stepcard">' +
        '<div class="step-head"><span class="step-n">2</span><div class="step-t"><b>Sous-titres</b>' +
          '<span>' + (classic ? 'Classiques (interview) : texte nettoyé par l\'IA, découpé par idées, temps calés sur la voix.'
            : 'Découpés phrase par phrase (jamais « … pour | C\'est … »), chaque mot s\'allume quand il est prononcé.') + '</span></div>' +
          (ready ? '<button class="btn-ghost sm" id="capFix" title="Un mot faux ou manquant ? Double-cliquez dessus dans le texte pour le corriger (plusieurs mots possibles)">' + icon('type') + '<span>Corriger le texte</span></button>'
            : '<button class="btn-primary" id="capTx" data-busy title="Transcrire la séquence active (instantané si elle l\'a déjà été, même après une coupe)">' + icon('mic') + '<span>Transcrire</span></button>') +
        '</div>' +
        K.seg('capKind', prefs.cap.kind || 'styled', [
          ['styled', 'Stylés (Shorts, Reels)', 'Mot prononcé mis en avant, animations, modèle modifiable'],
          ['classic', 'Classiques (interview)', 'Sous-titres de lecture : nettoyés par l\'IA, SRT et piste de sous-titres Premiere']]) +
      '</section>';
    }
    function bindStep() {
      $$('[data-seg="capKind"] button').forEach(function (b) {
        b.onclick = function () { prefs.cap.kind = b.getAttribute('data-v'); K.savePrefs(); render(); };
      });
      if ($('#capFix')) $('#capFix').onclick = function () {
        var t = $('#tabs [data-tab="text"]'); if (t) t.click();
        K.toast('Double-cliquez sur un mot pour le corriger (vous pouvez en taper plusieurs), Entrée pour valider : les sous-titres reprendront la correction.');
      };
      if ($('#capTx')) $('#capTx').onclick = function () {
        if (!K.tabs.text) return;
        K.tabs.text.transcribe().then(function (ok) { if (ok && prefs.tab === 'captions') render(); });
      };
    }

    // ==================== Sous-titres classiques (interview) ====================
    var S = window.KiruSubs, last = null; // dernier résultat (sous-titres + passages supprimés)
    var RULE_NUMS = [
      { id: 'maxChars', label: 'Caractères par ligne (max.)', min: 20, max: 60, step: 1, unit: '' },
      { id: 'minDur', label: 'Durée minimale', min: 0.3, max: 3, step: 0.1, unit: 's' },
      { id: 'maxDur', label: 'Durée maximale', min: 2, max: 10, step: 0.5, unit: 's' },
      { id: 'maxCps', label: 'Vitesse de lecture (max.)', min: 10, max: 30, step: 1, unit: 'car./s' },
      { id: 'minGap', label: 'Écart minimal', min: 0, max: 12, step: 1, unit: 'images', hint: 'Entre deux sous-titres ; plus court : la fin du précédent recule' },
      { id: 'joinGap', label: 'Enchaîner si l\'écart est sous', min: 0, max: 50, step: 1, unit: 'images', hint: 'Un écart plus court est ramené à l\'écart minimal (pas de clignotement)' }
    ];
    /**
     * Règles en vigueur. Séquence verticale : lignes plus courtes (30 caractères par défaut), sinon Premiere,
     * dont la zone de sous-titres est étroite en 9:16, renvoie lui-même à la ligne et affiche 3 lignes.
     */
    function vertical() { var f = frame(); return f[1] > f[0]; }
    function rules() {
      var r = Object.assign({}, S.RULES, prefs.classic.rules || {});
      if (vertical()) r.maxChars = (prefs.classic.rules && prefs.classic.rules.maxCharsV) || 30;
      return r;
    }
    function engineName() {
      var e = prefs.aiEngine || 'local';
      if (e === 'claude-code') return prefs.ccOk === true ? '<b class="ok-text">Claude connecté</b>' : prefs.ccOk === false ? '<b class="warn">Claude non connecté</b>' : 'Claude (abonnement)';
      return { local: 'IA locale', api: 'Claude (clé API)' }[e];
    }
    function classicHtml() {
      var c = prefs.classic, r = rules();
      return '<section class="card params">' +
          '<h4 class="section-title">Nettoyage</h4>' +
          '<div class="opt-rows"><div class="opt-row">' + K.toggle('clAi', c.ai, icon('sparkles') + 'Nettoyer le texte avec l\'IA',
            'Orthographe, accords, ponctuation, majuscules ; hésitations, répétitions et faux départs retirés sans changer le sens') +
            '<span class="hint">' + engineName() + ' · <a href="#" id="clEngine">changer</a></span></div></div>' +
          (c.ai && (prefs.aiEngine || 'local') === 'local' ? '<div class="hint">Pour une interview, <b>Claude</b> nettoie nettement mieux que l\'IA locale (Réglages > IA).</div>' : '') +
          '<h4 class="section-title">Règles</h4>' +
          '<div class="nums">' + RULE_NUMS.map(function (sp) {
            if (sp.id === 'maxChars' && vertical()) sp = Object.assign({}, sp, { label: 'Caractères par ligne (vertical)', hint: 'Séquence 9:16 : lignes plus courtes, sinon Premiere ajoute une 3e ligne' });
            return K.numRow(sp, r[sp.id]);
          }).join('') +
            '<div class="nrow"><span class="nl">Lignes (max.)</span>' + K.seg('clLines', r.maxLines, [[1, '1'], [2, '2']]) + '</div></div>' +
        '</section>' +
        '<section class="card apply">' +
          '<div class="opt-rows"><div class="opt-row"><span class="opt-l">' + icon('captions') + 'Sortie</span>' +
            K.seg('clOut', c.out === 'srt' ? 'srt' : 'premiere', [
              ['premiere', 'Sous-titres Premiere', 'Piste de sous-titres dans la séquence, modifiable dans le panneau Texte'],
              ['srt', 'Fichier SRT', 'Fichier .srt à côté du projet, sans toucher à la séquence']]) + '</div></div>' +
          '<div class="apply-row"><div class="sel-line" id="clLine">' + resultLine() + '</div>' +
            '<button class="btn-primary big" id="btnApply" title="Créer les sous-titres (Ctrl+Entrée)">' + icon('captions') + '<span>Créer</span></button></div>' +
        '</section>' +
        (last ? resultHtml() : '');
    }
    function resultLine() {
      if (!state.tx || !state.tx.words.length) return '<span class="dot"></span>Pas encore de transcription';
      if (!last) return '<span class="dot on"></span>' + state.tx.words.length + ' mots · ' + esc(state.tx.seqName);
      return '<span class="dot on"></span><b>' + last.blocks.length + '</b> sous-titres · ' + last.removed.length + ' passages supprimés';
    }
    function resultHtml() {
      var fps = last.fps;
      return '<section class="card cl-result">' +
        '<div class="ed-head"><span class="section-title">Passages supprimés · à vérifier</span><div class="ed-tools">' +
          '<button class="sbtn sm" id="clCopy" title="Copier la liste">' + icon('copy') + 'Copier</button></div></div>' +
        (last.removed.length ? '<ol class="cl-list">' + last.removed.map(function (r, k) {
          return '<li><button class="ch-t" data-clt="' + r.s + '">' + S.tc(Math.round(r.s * fps), fps) + '</button>' +
            '<span class="cl-kind">' + esc(r.kind) + '</span><span class="cl-text">« ' + esc(r.text) + ' »</span></li>';
        }).join('') + '</ol>' : '<div class="hint">Aucun passage supprimé.</div>') +
        '<div class="ed-head"><span class="section-title">Sous-titres</span></div>' +
        '<ol class="cl-list subs">' + last.blocks.map(function (b) {
          return '<li><button class="ch-t" data-clt="' + (b.f0 / fps) + '">' + S.tc(b.f0, fps) + '</button>' +
            '<span class="cl-text">' + b.lines.map(esc).join('<br/>') + '</span></li>';
        }).join('') + '</ol>' +
      '</section>';
    }
    function bindClassic() {
      var c = prefs.classic;
      $$('[data-toggle="clAi"]').forEach(function (l) {
        l.onclick = function (e) { e.preventDefault(); c.ai = !c.ai; K.savePrefs(); render(); };
      });
      if ($('#clEngine')) $('#clEngine').onclick = function (e) { e.preventDefault(); K.openSettings('ai'); };
      K.bindNums($('#view'), RULE_NUMS, function (id) { return rules()[id]; }, function (id, v) {
        c.rules = Object.assign({}, S.RULES, c.rules || {});
        c.rules[id === 'maxChars' && vertical() ? 'maxCharsV' : id] = v; // longueur de ligne propre au format vertical
        K.savePrefsSoon();
      });
      $$('[data-seg="clLines"] button').forEach(function (b) {
        b.onclick = function () {
          c.rules = Object.assign({}, S.RULES, c.rules || {}); c.rules.maxLines = Number(b.getAttribute('data-v')); K.savePrefs();
          $$('[data-seg="clLines"] button').forEach(function (x) { x.classList.toggle('on', x === b); });
        };
      });
      $$('[data-seg="clOut"] button').forEach(function (b) {
        b.onclick = function () { c.out = b.getAttribute('data-v'); K.savePrefs(); $$('[data-seg="clOut"] button').forEach(function (x) { x.classList.toggle('on', x === b); }); };
      });
      $('#btnApply').onclick = apply;
      $$('[data-clt]').forEach(function (b) {
        b.onclick = function () { if (K.inCEP) K.jsx('setPlayer', [Math.round(Number(b.getAttribute('data-clt')) * TICKS)]); };
      });
      if ($('#clCopy')) $('#clCopy').onclick = function () { K.copyText(S.report(last).replace(/\r\n/g, '\n')); K.toast('Liste des passages supprimés copiée.'); };
    }
    /** Créer : nettoyage (IA) → découpage → timing → SRT et/ou piste de sous-titres Premiere + liste des suppressions */
    function applyClassic(tx, seq) {
      var c = prefs.classic, fs = K.nodeReq('fs'), path = K.nodeReq('path'), os = K.nodeReq('os');
      var fps = seq ? TICKS / seq.ticksPerFrame : TICKS / (tx.tpf || TICKS / 25);
      var ai = null;
      if (c.ai) {
        ai = { engine: prefs.aiEngine || 'local', key: prefs.claudeKey, model: prefs.llmModel, onStatus: function (m) { K.toast(m, 'busy', true); } };
        if (ai.engine === 'api' && !ai.key) { K.openSettings('ai'); return K.toast('Ajoutez votre clé API Claude, ou choisissez l\'abonnement Claude (Réglages > IA).', 'err'); }
      }
      var root = seq && seq.project ? path.dirname(seq.project) : path.join(os.homedir(), 'Documents');
      var dir = path.join(root, 'Kiru', 'Sous-titres'), base = path.join(dir, safe(tx.seqName) + ' ' + stamp());
      K.setBusy(true);
      K.toast(ai ? 'Nettoyage du texte…' : 'Découpage des sous-titres…', 'busy', true);
      S.build(tx.words, { ai: ai, fps: fps, rules: rules(), onStatus: function (m) { K.toast(m, 'busy', true); } }).then(function (res) {
        last = res;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(base + '.srt', S.srt(res), 'utf8');
        fs.writeFileSync(base + ' - passages supprimés.txt', S.report(res) + '\r\n', 'utf8');
        var msg = res.blocks.length + ' sous-titres, ' + res.removed.length + ' passages supprimés (liste ci-dessous). SRT : ' + base + '.srt';
        if (c.out === 'srt' || !K.inCEP) return msg;
        return K.jsx('srtCaptions', [base + '.srt', 'Kiru — Sous-titres ' + stamp()]).then(function (r) {
          if (!r.success) throw new Error(r.error);
          return res.blocks.length + ' sous-titres ajoutés à la séquence (panneau Texte > Sous-titres), ' + res.removed.length + ' passages supprimés à vérifier ci-dessous.';
        });
      }).then(function (msg) {
        render(); K.toast(msg);
        var el = $('.cl-result'); if (el) el.scrollIntoView({ block: 'start' });
      }).catch(function (e) {
        K.toast(e.message || String(e), 'err');
        if (e.login) K.openSettings('ai');
      }).then(function () { K.setBusy(false); });
    }

    function render() {
      var v = $('#view'), s = st(), tx = state.tx;
      if (!v) return;
      var ready = tx && tx.words.length && (!K.tabs.text || K.tabs.text.fresh());
      if (prefs.cap.kind === 'classic') {
        stop();
        v.innerHTML = '<div class="scroll">' + stepCard(ready) + classicHtml() + '</div>';
        bindStep(); bindClassic();
        K.setBusy(state.busy);
        return;
      }
      v.innerHTML =
        '<div class="scroll">' +
        stepCard(ready) +
        '<section class="card capcard">' +
          '<div class="cap-presets">' + presets().map(function (p) {
            return '<span class="preset-wrap"><button class="chip' + (prefs.cap.preset === p.id ? ' on' : '') + '" data-capp="' + esc(p.id) + '">' + esc(p.name) + '</button>' +
              (p.user ? '<button class="preset-rm" data-caprm="' + esc(p.id) + '" title="Supprimer ce style">' + icon('x') + '</button>' : '') + '</span>';
          }).join('') + '</div>' +
          '<div class="cap-stage"><canvas id="capPreview"></canvas></div>' +
          '<div class="ed-head"><span class="curve-name" id="capName"></span><div class="ed-tools">' +
            '<button class="tool" id="capReset" title="Revenir au style choisi">' + icon('reset') + '</button>' +
            '<button class="tool" id="capSave" title="Enregistrer ce style">' + icon('bookmark') + '</button></div></div>' +
          '<div class="save-row" id="capSaveRow" hidden><input class="pill-input" id="capStyleName" placeholder="Nom du style" maxlength="30"/><button class="sbtn sm" id="capSaveBtn">' + icon('check') + 'Enregistrer</button></div>' +
        '</section>' +
        '<section class="card params capparams">' +
          '<h4 class="section-title">Texte</h4>' +
          '<div class="grid2">' +
            '<div class="field"><div class="lbl"><span>Police</span></div><input class="text-input sm" id="capFont" list="capFonts" value="' + esc(s.font) + '" spellcheck="false"/>' +
              '<datalist id="capFonts">' + FONTS.map(function (f) { return '<option value="' + f + '">'; }).join('') + '</datalist></div>' +
            segc('weight', 'Graisse', [[400, 'Normal'], [600, 'Semi'], [700, 'Gras'], [800, 'Extra'], [900, 'Black']]) +
            range('size') +
            '<div class="field"><div class="lbl"><span>Couleurs</span></div><div class="colors">' + color('color', 'Texte') + tog('upper', 'MAJUSCULES') + '</div></div>' +
          '</div>' +
          '<h4 class="section-title">Mot prononcé</h4>' +
          '<div class="grid2">' +
            segc('mode', 'Mise en avant', [['box', 'Boîte'], ['color', 'Couleur'], ['none', 'Aucune']]) +
            '<div class="field"><div class="lbl"><span>Couleurs</span></div><div class="colors">' + color('accent', s.mode === 'box' ? 'Boîte' : 'Mot') + (s.mode === 'box' ? color('accentText', 'Texte') : '') + '</div></div>' +
            segc('anim', 'Animation', [['none', 'Aucune'], ['pop', 'Apparition'], ['popWord', 'Pop du mot']]) +
            (s.mode === 'box' ? range('radius') : segc('past', 'Mots déjà dits', [['same', 'Normaux'], ['dim', 'Différents']])) +
            (s.mode === 'box' ? range('slide') : '') +
          '</div>' +
          '<h4 class="section-title">Mise en page</h4>' +
          '<div class="grid2">' +
            range('y') +
            range('maxWidth') +
            range('maxWords') +
            segc('maxLines', 'Lignes', [[1, '1'], [2, '2'], [3, '3']]) +
            range('gap') +
            range('lead') +
            '<div class="field"><div class="lbl"><span>Affichage</span></div><div class="colors">' + tog('oneWord', 'Un mot à la fois') + '</div></div>' +
          '</div>' +
          '<h4 class="section-title">Effets</h4>' +
          '<div class="grid2">' +
            range('stroke') +
            range('shadow') +
            range('blur') +
            '<div class="field"><div class="lbl"><span>Contour / bandeau</span></div><div class="colors">' + color('strokeColor', 'Contour') + tog('bgOn', 'Bandeau') + color('bgColor', 'Bandeau') + '</div></div>' +
            range('bgOpacity') +
          '</div>' +
        '</section>' +
        '<section class="card apply">' +
          // un graphique modifiable (modèle Kiru Pop) par sous-titre : texte, temps, couleurs… réglables dans Premiere
          '<div class="apply-row"><div class="sel-line" id="capLine"></div>' +
            '<button class="btn-primary big" id="btnApply" title="Poser les sous-titres dans la séquence, modifiables dans « Objets graphiques essentiels » (Ctrl+Entrée)">' + icon('captions') + '<span>Générer</span></button></div>' +
        '</section>' +
        '</div>';
      updateName(); renderLine(); bind();
      K.setBusy(state.busy);
      C.ready(s).then(function () { invalidate(); start(); });
      void tx;
    }
    function updateName() {
      var el = $('#capName');
      if (el) el.innerHTML = esc(preset(prefs.cap.preset).name) + (prefs.cap.edited ? ' <i>modifié</i>' : '');
    }
    function renderLine() {
      var el = $('#capLine'), tx = state.tx;
      if (!el) return;
      if (!tx || !tx.words.length) { el.innerHTML = '<span class="dot"></span>Pas encore de transcription : « Transcrire » ci-dessus · ici : aperçu'; return; }
      var f = frame(), s = st(), bl = C.blocks(tx.words, s, f[0], f[1]);
      var n = prefs.cap.target === 'stills' ? C.states(bl, s, TICKS / K.seqTpf()).length : 0;
      el.innerHTML = '<span class="dot on"></span><b>' + bl.length + '</b> sous-titres' + (n ? ' · ' + n + ' images' : '') + ' · ' + esc(tx.seqName);
    }

    function set(id, value) {
      if (!prefs.cap.style) prefs.cap.style = st();
      prefs.cap.style[id] = value;
      prefs.cap.edited = true;
      K.savePrefsSoon(); invalidate(); updateName();
    }
    var lineTimer = null;
    function bind() {
      bindStep();
      $$('[data-capp]').forEach(function (b) {
        b.onclick = function () {
          var p = preset(b.getAttribute('data-capp'));
          prefs.cap.preset = p.id; prefs.cap.style = C.style(p.style); prefs.cap.edited = false;
          K.savePrefs(); render();
        };
      });
      $$('[data-caprm]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-caprm');
          prefs.capStyles = prefs.capStyles.filter(function (x) { return x.id !== id; });
          if (prefs.cap.preset === id) prefs.cap.preset = 'pop';
          K.savePrefs(); render();
        };
      });
      K.bindNums($('#view'), nums(), numVal, function (id, v) {
        if (id === 'size') set('sizePx', 0); // taille réglée à la main : en % de l'image (suit le format de la séquence)
        set(id, v);
        clearTimeout(lineTimer); lineTimer = setTimeout(renderLine, 250);
      });
      $$('[data-capc]').forEach(function (inp) { inp.oninput = function () { set(inp.getAttribute('data-capc'), inp.value); }; });
      $$('[data-caps]').forEach(function (sg) {
        var id = sg.getAttribute('data-caps');
        $$('button', sg).forEach(function (b) {
          b.onclick = function () {
            var raw = b.getAttribute('data-v'), v = /^\d+$/.test(raw) ? Number(raw) : raw;
            set(id, v);
            if (id === 'mode') { render(); return; }
            $$('button', sg).forEach(function (x) { x.classList.toggle('on', x === b); });
            renderLine();
          };
        });
      });
      $$('[data-capt]').forEach(function (l) {
        l.onclick = function (e) {
          e.preventDefault();
          var id = l.getAttribute('data-capt'), s = st();
          if (id === 'bgOn') set('bg', s.bg === 'block' ? 'none' : 'block');
          else set(id, !s[id]);
          l.classList.toggle('on', id === 'bgOn' ? st().bg === 'block' : !!st()[id]);
          renderLine();
        };
      });
      $$('[data-capt="bgOn"]').forEach(function (l) { l.classList.toggle('on', st().bg === 'block'); });
      var fi = $('#capFont');
      fi.onkeydown = function (e) { e.stopPropagation(); };
      fi.onchange = function () { set('font', fi.value.trim() || 'Urbanist'); C.ready(st()).then(invalidate); renderLine(); };
      $('#capReset').onclick = function () { prefs.cap.style = C.style(preset(prefs.cap.preset).style); prefs.cap.edited = false; K.savePrefs(); render(); };
      $('#capSave').onclick = function () {
        var row = $('#capSaveRow'); row.hidden = !row.hidden;
        if (!row.hidden) { var n = $('#capStyleName'); n.value = ''; n.focus(); }
      };
      var save = function () {
        var name = $('#capStyleName').value.trim();
        if (!name) return;
        var id = 'cs-' + Date.now();
        prefs.capStyles = prefs.capStyles.filter(function (x) { return x.name !== name; }).concat([{ id: id, name: name, style: st() }]);
        prefs.cap.preset = id; prefs.cap.edited = false;
        K.savePrefs(); render();
        K.toast('Style « ' + name + ' » enregistré.');
      };
      $('#capSaveBtn').onclick = save;
      $('#capStyleName').onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') save(); };
      $('#btnApply').onclick = apply;
    }

    // ==================== Génération ====================
    function safe(s) { return String(s).replace(/[\\\/:*?"<>|]+/g, '-').trim().slice(0, 60) || 'Sequence'; }
    function stamp() {
      var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
      return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    }
    // ==================== Sous-titres modifiables (modèle « Kiru Pop ») ====================
    // police d'origine du modèle (installée avec Kiru), utilisée si celle du style n'est pas sur l'ordinateur
    var MOGRT_FONT = { font: 'Montserrat', weight: 800 };
    // « 3 » : nouveau nom à chaque version du modèle, sinon Premiere réutiliserait l'ancien déjà importé dans le projet
    function mogrtPath() { return K.extDir + '/assets/captions/Kiru Pop 3.mogrt'; }

    /** Familles de polices installées (noms du registre sous Windows, des fichiers sous macOS), en minuscules */
    var fontList = null;
    function installedFonts() {
      if (fontList) return fontList;
      fontList = [];
      var cp = K.nodeReq('child_process'), fs = K.nodeReq('fs'), os = K.nodeReq('os'), path = K.nodeReq('path');
      try {
        if (os.platform() === 'win32') {
          ['HKLM', 'HKCU'].forEach(function (h) {
            try {
              String(cp.execSync('reg query "' + h + '\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"', { windowsHide: true })).split(/\r?\n/).forEach(function (l) {
                var m = /^\s+(.+?)\s+REG_\w+/.exec(l); if (m) fontList.push(m[1].toLowerCase());
              });
            } catch (e) {}
          });
        } else {
          ['/Library/Fonts', '/System/Library/Fonts', '/System/Library/Fonts/Supplemental', path.join(os.homedir(), 'Library/Fonts')].forEach(function (d) {
            try { fs.readdirSync(d).forEach(function (f) { fontList.push(f.toLowerCase().replace(/[-_]/g, ' ')); }); } catch (e) {}
          });
        }
      } catch (e2) {}
      return fontList;
    }
    function hasFont(family) {
      var f = String(family || '').toLowerCase(), list = installedFonts();
      if (!list.length) return true; // liste illisible : on fait confiance au style
      return list.some(function (n) { return n.indexOf(f) === 0 || n.replace(/\s+/g, '').indexOf(f.replace(/\s+/g, '')) === 0; });
    }
    /** Police donnée au modèle : celle du style si elle est installée, sinon Montserrat */
    function mogrtFont(s) { return hasFont(s.font) ? { font: s.font, weight: s.weight } : MOGRT_FONT; }
    /** Nom PostScript attendu par Premiere (« Arial » gras → « Arial-BoldMT », « Montserrat » 800 → « Montserrat-ExtraBold ») */
    var WEIGHTS = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
    var PS = {
      'arial': { 400: 'ArialMT', 600: 'Arial-BoldMT', 700: 'Arial-BoldMT', 800: 'Arial-BoldMT', 900: 'Arial-Black' },
      'arial black': 'Arial-Black', 'impact': 'Impact', 'segoe ui black': 'SegoeUI-Black', 'bebas neue': 'BebasNeue-Regular',
      'helvetica neue': { 400: 'HelveticaNeue', 700: 'HelveticaNeue-Bold', 800: 'HelveticaNeue-Bold', 900: 'HelveticaNeue-Black' }
    };
    function psName(font, weight) {
      var w = Number(weight) || 400, k = String(font).toLowerCase(), fix = PS[k];
      if (typeof fix === 'string') return fix;
      if (fix) return fix[w] || fix[400];
      return String(font).replace(/\s+/g, '') + '-' + (WEIGHTS[w] || 'Regular');
    }
    function rgb(hex) {
      var v = String(hex || '#ffffff').replace('#', ''); if (v.length === 3) v = v.replace(/./g, '$&$&');
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    }
    /**
     * Un clip du modèle par bloc ; le modèle est une composition 1920 × 1920 centrée sur l'image : tailles et
     * position sont ramenées à cette échelle (f), puis le clip est mis à l'échelle de la séquence.
     */
    function placeMogrt(seq, s, W, H, tpf, fps) {
      var fs = K.nodeReq('fs'), mog = mogrtPath();
      if (!fs.existsSync(mog)) throw new Error('Modèle « Kiru Pop 3 » absent (assets/captions) : réinstallez Kiru.');
      var sm = Object.assign({}, s, mogrtFont(s)), f = Math.max(W, H) / 1920, ps = psName(sm.font, sm.weight);
      var px = C.pxSize(sm, W, H), yComp = (sm.y / 100 * H) / f + (1920 - H / f) / 2;
      var active = sm.mode === 'box' ? sm.accentText : sm.mode === 'color' ? sm.accent : sm.color;
      var bl = C.blocks(state.tx.words, sm, W, H);
      var items = bl.map(function (b) {
        // le clip commence sur l'image qui précède le premier mot ; les temps des mots partent de ce début réel
        var f0 = Math.floor(b.start * fps + 1e-6), t0 = f0 / fps;
        return {
          s: f0 * tpf, e: Math.round(b.end * fps) * tpf,
          p: {
            'Texte': { text: C.lines(b, sm, W, H).join('\r'), font: ps },
            // tous les calques du modèle (texte et mesures de la boîte) prennent cette police
            'Police': ps,
            'Temps des mots (s)': b.words.map(function (w) { return Math.max(0, w.s - t0).toFixed(2); }).join(';'),
            // Premiere borne ces curseurs à 0–100 : Taille = demi-taille de police, Position Y = % de la hauteur du modèle
            'Taille': Math.round(px / f / 2 * 10) / 10, 'Position Y': Math.round(yComp / 1920 * 10000) / 100,
            'Couleur du texte': rgb(sm.color), 'Boîte': sm.mode === 'box', 'Couleur de la boîte': rgb(sm.accent),
            'Couleur du mot prononcé': rgb(active), 'Arrondi de la boîte': Math.round(sm.radius * 100),
            'Marge de la boîte': Math.round(sm.padX * 100), 'Ombre': Math.round(sm.shadow * 100), 'Pop': sm.anim === 'none' ? 0 : 12,
            'Glissement': Math.round(sm.slide * 100), 'Flou de mouvement': Math.round(sm.blur * 100)
          }
        };
      }).filter(function (it) { return it.e > it.s; });
      var track = -1;
      return K.jsx('captionTrack', [items[0].s, items[items.length - 1].e, -1]).then(function (r) {
        if (!r.success) throw new Error(r.error);
        track = r.track;
        return K.batches(items, 25, 'Pose des sous-titres modifiables…', function (part) {
          return K.jsx('placeMogrts', [mog, track, f * 100, JSON.stringify(part)]);
        });
      }).then(function (res) {
        var n = 0, miss = {}, clamp = {};
        res.forEach(function (r) {
          n += r.placed || 0;
          (r.missing || []).forEach(function (m) { miss[m] = true; });
          (r.clamped || []).forEach(function (m) { clamp[m] = true; });
        });
        var errs = K.errorsOf(res), m = Object.keys(miss), c = Object.keys(clamp);
        K.toast(n + ' sous-titres modifiables posés sur V' + (track + 1) + ' : sélectionnez-en un, puis Fenêtre > Objets graphiques essentiels.' +
          (m.length ? ' Paramètres non trouvés : ' + m.join(', ') + '.' : '') +
          (c.length ? ' Valeurs refusées par Premiere (' + c.join(', ') + ') : un ancien modèle « Kiru Pop » est resté dans le projet, supprimez-le du chutier « Motion Graphics Template Media ».' : '') +
          (errs.length ? ' Erreurs : ' + errs.join(' ; ') : ''), errs.length || m.length || c.length ? 'err' : 'ok');
      });
    }

    function apply() {
      if (state.busy) return;
      var tx = state.tx;
      if (!tx || !tx.words.length) return K.toast('Transcrivez d\'abord la séquence (bouton « Transcrire » ci-dessus).', 'err');
      if (!K.inCEP) return K.toast('Disponible dans Premiere Pro : ici, seul l\'aperçu fonctionne.', 'err');
      var seq = state.sum && state.sum.seq;
      if (!seq || seq.id !== tx.seqId) { render(); return K.toast('La séquence active n\'est pas celle transcrite : « Transcrire » ci-dessus (instantané grâce au cache).', 'err'); }
      if (K.tabs.text && K.tabs.text.pending()) return K.toast('L\'étape 1 a repéré des passages à couper : appliquez-les (ou « Rétablir ») dans « 1 · Nettoyer » avant de sous-titrer.', 'err');
      if (prefs.cap.kind === 'classic') return applyClassic(tx, seq);
      var fs = K.nodeReq('fs'), path = K.nodeReq('path'), os = K.nodeReq('os');
      var Buf = (window.cep_node && window.cep_node.Buffer) || window.Buffer;
      var W = seq.width, H = seq.height, tpf = seq.ticksPerFrame, fps = TICKS / tpf, s = st(), when = stamp();
      var root = seq.project ? path.dirname(seq.project) : path.join(os.homedir(), 'Documents');
      var dir = path.join(root, 'Kiru', 'Sous-titres', safe(seq.name) + ' ' + when), bin = 'Kiru — Sous-titres ' + when;
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return K.toast('Dossier impossible à créer : ' + dir, 'err'); }
      K.setBusy(true);
      var track = -1, bl;
      C.ready(s).then(function () {
        bl = C.blocks(tx.words, s, W, H);
        var srtPath = path.join(dir, safe(seq.name) + '.srt');
        fs.writeFileSync(srtPath, C.srt(bl, s, W, H), 'utf8');
        if (prefs.cap.target === 'srt') { K.toast('Fichier SRT enregistré : ' + srtPath); return null; }
        if (prefs.cap.target === 'mogrt') return placeMogrt(seq, s, W, H, tpf, fps);
        if (prefs.cap.target === 'native') {
          return K.jsx('srtCaptions', [srtPath, bin]).then(function (r) {
            if (!r.success) throw new Error(r.error);
            K.toast(bl.length + ' sous-titres ajoutés dans une piste de sous-titres Premiere.');
          });
        }
        // une image par état, à la taille de la séquence
        var sts = C.states(bl, s, fps), cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d'), files = [], items = [], i = 0;
        var step = function () {
          var t1 = Date.now();
          while (i < sts.length && Date.now() - t1 < 150) {
            var x = sts[i];
            ctx.clearRect(0, 0, W, H);
            C.draw(ctx, W, H, bl[x.block].words, x.active, s, x.variant);
            var f = path.join(dir, 'kiru_' + ('0000' + (i + 1)).slice(-5) + '.png');
            fs.writeFileSync(f, Buf.from(cv.toDataURL('image/png').split(',')[1], 'base64'));
            files.push(f);
            items.push({ f: f, s: Math.round(x.from * fps) * tpf, e: Math.round(x.to * fps) * tpf });
            i++;
          }
          K.toast('Rendu des sous-titres ' + Math.round(i / sts.length * 100) + ' %', 'busy', true);
          return i < sts.length ? new Promise(function (r) { setTimeout(r, 0); }).then(step) : null;
        };
        return Promise.resolve().then(step).then(function () {
          return K.jsx('captionTrack', [items[0].s, items[items.length - 1].e, -1]);
        }).then(function (r) {
          if (!r.success) throw new Error(r.error);
          track = r.track;
          return K.batches(files, 300, 'Import des images…', function (part) { return K.jsx('importFiles', [JSON.stringify(part), bin]); });
        }).then(function () {
          return K.batches(items, 60, 'Pose des sous-titres…', function (part) { return K.jsx('placeStills', [bin, track, JSON.stringify(part)]); });
        }).then(function (res) {
          var n = 0; res.forEach(function (r) { n += r.placed; });
          var errs = K.errorsOf(res);
          K.toast(bl.length + ' sous-titres posés sur V' + (track + 1) + ' (' + n + ' images, chutier « ' + bin + ' »).' + (errs.length ? ' Erreurs : ' + errs.join(' ; ') : ''), errs.length ? 'err' : 'ok');
        });
      }).catch(function (e) {
        K.toast(e.message || String(e), 'err');
      }).then(function () { K.setBusy(false); });
    }

    return { render: render, apply: apply, stop: stop };
  };
})();
