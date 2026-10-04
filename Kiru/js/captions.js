/**
 * Kiru — sous-titres stylés (mot actif surligné, façon Shorts / Reels).
 *
 * Les mots de la transcription sont regroupés en blocs qui suivent les phrases (voir blocks).
 * Chaque « état » d'un bloc (mot actif i, éventuelle image d'apparition) est dessiné sur un canvas
 * transparent à la taille de la séquence, puis posé dans Premiere comme une image fixe : aucun
 * modèle d'animation (MOGRT) n'est nécessaire, le rendu est identique à l'aperçu.
 */
(function () {
  'use strict';

  /** Taille, marges, rayons… en fraction de la taille du texte (em) ; position et largeur en % de l'image */
  var BASE = {
    font: 'Urbanist', weight: 800, size: 6.2, upper: false, lineHeight: 1.18,
    color: '#ffffff', mode: 'box', accent: '#f26a2e', accentText: '#ffffff',
    padX: 0.2, padY: 0.06, radius: 0.22, stroke: 0, strokeColor: '#000000',
    shadow: 0.75, shadowBlur: 0.28, shadowY: 0.06, bg: 'none', bgColor: '#000000', bgOpacity: 0.55,
    y: 74, maxWidth: 82, maxWords: 6, maxLines: 2, oneWord: false, anim: 'pop', past: 'same', pastColor: '#ffffff',
    // lead : avance d'affichage (s) ; gap : trou entre deux sous-titres (s) ; sizePx : taille fixe en pixels de la
    // séquence (remplace size) ; slide : glissement de la boîte d'un mot à l'autre ; blur : flou de mouvement (0–1)
    lead: 0, gap: 0, sizePx: 0, slide: 0.6, blur: 0.5
  };
  var PRESETS = [
    { id: 'pop', name: 'Pop', style: {} },
    { id: 'af', name: 'AF', style: { font: 'Arial', weight: 700, sizePx: 48 } },
    { id: 'karaoke', name: 'Karaoké', style: { mode: 'color', accent: '#ffd400', stroke: 0.09, shadow: 0.5, anim: 'none', maxWords: 5 } },
    { id: 'hormozi', name: 'Impact', style: { font: 'Arial Black', weight: 900, upper: true, size: 7.2, mode: 'color', accent: '#3cff6b', stroke: 0.1, shadow: 0.6, maxWords: 3, maxLines: 2, anim: 'popWord' } },
    { id: 'word', name: 'Mot à mot', style: { oneWord: true, upper: true, size: 9, mode: 'none', stroke: 0.1, shadow: 0.6, anim: 'popWord', y: 66 } },
    { id: 'boxed', name: 'Bandeau', style: { weight: 700, size: 5.2, bg: 'block', bgOpacity: 0.62, mode: 'color', accent: '#ffcf4a', shadow: 0, maxWords: 7, anim: 'none', radius: 0.3 } },
    { id: 'classic', name: 'Classique', style: { weight: 600, size: 4.6, mode: 'none', stroke: 0.07, shadow: 0.4, maxWords: 12, maxLines: 2, y: 86, anim: 'none' } },
    { id: 'past', name: 'Lecture guidée', style: { mode: 'none', past: 'dim', pastColor: '#ffffff', color: '#9aa3b5', accent: '#ffffff', anim: 'none', shadow: 0.6 } }
  ];
  function style(s) { return Object.assign({}, BASE, s || {}); }

  function font(st, px) { return (st.weight || 800) + ' ' + Math.round(px) + 'px "' + st.font + '", Urbanist, sans-serif'; }
  function txt(st, w) { return st.upper ? w.toLocaleUpperCase() : w; }
  function hexA(hex, a) {
    var v = String(hex || '#000').replace('#', ''); if (v.length === 3) v = v.replace(/./g, '$&$&');
    return 'rgba(' + parseInt(v.slice(0, 2), 16) + ',' + parseInt(v.slice(2, 4), 16) + ',' + parseInt(v.slice(4, 6), 16) + ',' + a + ')';
  }

  // ==================== Mise en page ====================
  var mctx = null;
  /** Base des tailles en % : le petit côté (vertical 9:16 : un peu plus grand, comme les Shorts) */
  function sizeBase(W, H) { return H > W ? W * 1.25 : H; }
  /** Taille du texte en pixels de la séquence : fixe (sizePx) ou en % de la base */
  function pxSize(st, W, H) { return st.sizePx > 0 ? st.sizePx : st.size / 100 * sizeBase(W, H); }
  function measurer(st, W, H) {
    mctx = mctx || document.createElement('canvas').getContext('2d');
    var px = pxSize(st, W, H);
    mctx.font = font(st, px);
    var space = mctx.measureText(' ').width;
    return { px: px, space: space, w: function (t) { return mctx.measureText(t).width; } };
  }
  /** Lignes d'un bloc : [[indices de mots]] en respectant la largeur maximale */
  function wrap(texts, st, W, m) {
    var maxW = st.maxWidth / 100 * W, lines = [[]], cur = 0, pad = st.mode === 'box' ? st.padX * m.px * 2 : 0;
    texts.forEach(function (t, i) {
      var w = m.w(txt(st, t)) + pad;
      if (lines[lines.length - 1].length && cur + m.space + w > maxW) { lines.push([]); cur = 0; }
      cur += (lines[lines.length - 1].length ? m.space : 0) + w;
      lines[lines.length - 1].push(i);
    });
    return lines;
  }

  // ==================== Découpage en phrases ====================
  // mots qui appellent la suite : ne jamais finir un sous-titre dessus (« pour | C'est », « de la | maison »)
  var GLUE = ('le la les l un une des du de d à au aux en pour par sur sous dans avec sans chez vers entre ce cet cette ces ' +
    'mon ton son ma ta sa mes tes ses notre votre nos vos leur leurs je tu il elle on nous vous ils elles ne n se s me m te t ' +
    'y très plus moins si c j qu que qui dont the a an to of in on at for with from by my your his her its our their i we you they').split(' ');
  // verbes « liants » et petits mots : éviter, sans l'interdire
  var SOFT = 'est sont suis es sommes êtes ai as a avons avez ont va vais vas c\'est it\'s is are was be'.split(' ');
  // bons débuts de sous-titre
  var CONJ = 'et mais ou donc car parce puis alors ensuite quand comme lorsque pourtant and but or so because then when'.split(' ');
  var PREP = 'pour avec dans sans sur sous chez vers entre par pendant depuis grâce for with without into during'.split(' ');
  function bare(w) { return String(w).toLowerCase().replace(/^[«"“(]+|[.,!?;:…»"”)]+$/g, '').replace(/[’]/g, '\''); }
  function endsSentence(w) { return /[.?!…]["»”)]?$/.test(w); }
  function capital(w) { var r = String(w).replace(/^[«"“(]+/, ''); return /^[A-ZÀ-ÖØ-Ý]/.test(r) && r !== r.toUpperCase(); }
  // mots courants : avec une majuscule au milieu du texte, c'est un début de phrase (pas un nom propre)
  var STARTERS = ('c\'est ce cette ces je j\'ai tu il elle on nous vous ils elles le la les un une et mais donc alors puis ' +
    'que qui quand si oui non ok bon bah ben voilà en au du des de pour avec dans ça ça, it this that i\'m we you they the and but so').split(' ');
  /** Coupure obligatoire avant le mot i : fin de phrase, début de phrase évident, ou longue pause (pas après « et », « de »…) */
  function hardBreak(ws, i) {
    var a = ws[i - 1], b = ws[i], ba = bare(a.w);
    if (endsSentence(a.w)) return true;
    if (capital(b.w) && STARTERS.indexOf(bare(b.w)) >= 0) return true;
    return b.s - a.e > 0.9 && GLUE.indexOf(ba) < 0 && CONJ.indexOf(ba) < 0 && !/'$/.test(ba);
  }
  /** Coût d'une coupure entre a et b (négatif = bon endroit) */
  function breakCost(a, b) {
    var c = 0, ba = bare(a.w);
    if (GLUE.indexOf(ba) >= 0 || /^(l|d|j|c|qu|n|s|m|t)'$/.test(ba) || /^(d|l|qu)'une?$/.test(ba)) c += 6; // … « d'un | stage »
    else if (SOFT.indexOf(ba) >= 0) c += 2;
    if (/[,;:]["»”)]?$/.test(a.w)) c -= 3;
    // majuscule sans ponctuation avant : début de phrase que la ponctuation a manqué (souvent après une coupe)
    if (capital(b.w)) c -= 2; // peut-être un nom propre : simple préférence
    var bb = bare(b.w);
    if (CONJ.indexOf(ba) >= 0) c += 3; // un bloc ne finit pas sur « et », « ou », « mais »
    if (CONJ.indexOf(bb) >= 0) c -= 1.5;
    if (PREP.indexOf(bb) >= 0) c -= 1; // « qui agit | pour l'égalité »
    if (/^(de|des|du|d'.*)$/.test(bb)) c += 1.5; // « l'égalité | des chances » : le complément reste avec son nom
    c -= Math.min(3, Math.max(0, b.s - a.e) * 8);
    return c;
  }

  /**
   * Blocs de sous-titres : [{ words: [{w,s,e}], start, end }] (secondes de la séquence).
   * Coupure obligatoire entre deux phrases (ponctuation, majuscule d'un mot courant, pause > 0,9 s) ; à l'intérieur d'une phrase, les blocs sont
   * choisis ensemble (programmation dynamique) : tailles équilibrées, jamais sur un article ou une préposition,
   * de préférence sur une virgule, une pause, une conjonction ou une majuscule de début de phrase.
   * st.lead : avance d'affichage (s), le texte apparaît un peu avant d'être prononcé, comme à la télévision.
   */
  function blocks(words, st, W, H) {
    st = style(st);
    var lead = Math.max(0, Number(st.lead) || 0), ws = words.map(function (w) {
      return { w: w.w, s: Math.max(0, w.s - lead), e: Math.max(0.01, w.e - lead) };
    });
    var m = measurer(st, W, H), out = [];
    if (st.oneWord) ws.forEach(function (w) { out.push({ words: [w] }); });
    else {
      var a = 0;
      for (var i = 1; i <= ws.length; i++) {
        if (i < ws.length && !hardBreak(ws, i)) continue;
        split(ws.slice(a, i), st, W, m).forEach(function (b) { out.push({ words: b }); });
        a = i;
      }
    }
    // durées : le bloc reste affiché jusqu'au suivant si la pause est courte (pas de clignotement)
    out.forEach(function (b, k) {
      var next = out[k + 1];
      b.start = b.words[0].s;
      b.end = b.words[b.words.length - 1].e;
      if (next && next.words[0].s - b.end < 0.5) b.end = next.words[0].s;
      else b.end = Math.min(b.end + 0.2, next ? next.words[0].s : b.end + 0.2);
      // trou voulu entre deux sous-titres (sans jamais cacher le dernier mot avant qu'il soit prononcé)
      if (next && st.gap > 0) b.end = Math.max(b.words[b.words.length - 1].s + 0.1, Math.min(b.end, next.words[0].s - st.gap));
    });
    return out;
  }
  /** Meilleur découpage d'une phrase en blocs (au plus maxWords mots, maxLines lignes, 4,5 s) */
  function split(ph, st, W, m) {
    var n = ph.length, maxW = Math.max(1, st.maxWords), target = Math.max(2, Math.round(maxW * 0.75));
    if (n <= 1) return [ph];
    var best = [0], from = [0];
    for (var j = 1; j <= n; j++) {
      best[j] = Infinity;
      for (var i = Math.max(0, j - maxW); i < j; i++) {
        if (best[i] === Infinity) continue;
        var k = j - i, blk = ph.slice(i, j);
        var ok = k === 1 || (blk[k - 1].e - blk[0].s <= 4.5 && wrap(blk.map(function (x) { return x.w; }), st, W, m).length <= st.maxLines);
        if (!ok) continue;
        var c = Math.pow((k - target) / maxW, 2) * 6;
        if (k === 1) c += 4;
        if (j < n) c += breakCost(ph[j - 1], ph[j]);
        if (best[i] + c < best[j]) { best[j] = best[i] + c; from[j] = i; }
      }
    }
    var cuts = [], p = n;
    while (p > 0) { cuts.unshift([from[p], p]); p = from[p]; }
    return cuts.map(function (r) { return ph.slice(r[0], r[1]); });
  }

  /**
   * États à poser dans la timeline : [{ block, active, from, to, variant }] calés sur les images.
   * variant : 'in' = image d'apparition du bloc (légèrement réduit), 'pop' = mot actif agrandi.
   */
  function states(bl, st, fps) {
    st = style(st);
    var out = [], f = function (t) { return Math.round(t * fps) / fps; }, pf = 2 / fps;
    bl.forEach(function (b, bi) {
      b.words.forEach(function (w, i) {
        var from = f(i ? w.s : b.start), to = f(i < b.words.length - 1 ? b.words[i + 1].s : b.end);
        if (to - from < 0.5 / fps) return;
        var active = st.mode === 'none' && st.past !== 'dim' && !st.oneWord ? -1 : i;
        var variant = '';
        if (st.anim === 'popWord' && to - from > pf * 1.5) variant = 'pop';
        else if (st.anim === 'pop' && i === 0 && to - from > pf * 1.5) variant = 'in';
        if (variant) { out.push({ block: bi, active: active, from: from, to: f(from + pf), variant: variant }); from = f(from + pf); }
        var last = out[out.length - 1];
        // même image que l'état précédent (aucun surlignage) : on prolonge au lieu de dupliquer
        if (last && last.block === bi && last.active === active && !last.variant && active === -1 && Math.abs(last.to - from) < 1e-6) last.to = to;
        else out.push({ block: bi, active: active, from: from, to: to, variant: '' });
      });
    });
    return out;
  }

  // ==================== Dessin ====================
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /**
   * Dessine un bloc (mots, mot actif, variante d'animation) sur un canvas W×H transparent.
   * slideU (0–1, facultatif) : avancée du glissement de la boîte depuis le mot précédent (aperçu des sous-titres modifiables).
   */
  function draw(ctx, W, H, words, active, st, variant, slideU) {
    st = style(st);
    var texts = words.map(function (w) { return w.w; });
    var m = measurer(st, W, H), px = m.px, lh = px * st.lineHeight, lines = wrap(texts, st, W, m);
    var total = lines.length * lh, cy = st.y / 100 * H, top = cy - total / 2;
    var blockScale = variant === 'in' ? 0.86 : 1;
    ctx.save();
    ctx.translate(W / 2, cy); ctx.scale(blockScale, blockScale); ctx.translate(-W / 2, -cy);
    ctx.font = font(st, px); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    var boxPad = st.mode === 'box' ? st.padX * px : 0;
    var geo = lines.map(function (ln, li) {
      var widths = ln.map(function (i) { return m.w(txt(st, texts[i])) + boxPad * 2; });
      var lw = widths.reduce(function (a, b) { return a + b; }, 0) + m.space * (ln.length - 1);
      var x = (W - lw) / 2, y = top + lh * (li + 0.5), items = [];
      ln.forEach(function (i, k) { items.push({ i: i, x: x, w: widths[k] }); x += widths[k] + m.space; });
      return { y: y, x: (W - lw) / 2, w: lw, items: items };
    });
    // bandeau derrière tout le bloc
    if (st.bg === 'block') {
      var bx = Math.min.apply(null, geo.map(function (g) { return g.x; })) - px * 0.45, bw = Math.max.apply(null, geo.map(function (g) { return g.w; })) + px * 0.9;
      ctx.fillStyle = hexA(st.bgColor, st.bgOpacity);
      roundRect(ctx, bx, top - px * 0.2, bw, total + px * 0.4, st.radius * px * 1.4); ctx.fill();
    }
    // boîte du mot prononcé, sous tout le texte ; elle glisse depuis le mot précédent si slideU < 1
    var where = {};
    geo.forEach(function (g) { g.items.forEach(function (it) { where[it.i] = { x: it.x, y: g.y, w: it.w }; }); });
    if (st.mode === 'box' && where[active]) {
      var r = where[active], r0 = where[active - 1];
      if (r0 && slideU != null && slideU < 1) {
        var e = 1 - Math.pow(1 - Math.max(0, slideU), 3);
        r = { x: r0.x + (r.x - r0.x) * e, y: r0.y + (r.y - r0.y) * e, w: r0.w + (r.w - r0.w) * e };
      }
      ctx.save();
      var bs = variant === 'pop' ? 1.12 : 1;
      if (bs !== 1) { ctx.translate(r.x + r.w / 2, r.y); ctx.scale(bs, bs); ctx.translate(-r.x - r.w / 2, -r.y); }
      if (st.shadow > 0) { ctx.shadowColor = 'rgba(0,0,0,' + st.shadow * 0.5 + ')'; ctx.shadowBlur = st.shadowBlur * px * 0.6; ctx.shadowOffsetY = st.shadowY * px; }
      ctx.fillStyle = st.accent;
      roundRect(ctx, r.x, r.y - px * (0.5 + st.padY) - px * 0.04, r.w, px * (1 + st.padY * 2) + px * 0.08, st.radius * px);
      ctx.fill(); ctx.restore();
    }
    geo.forEach(function (g) {
      g.items.forEach(function (it) {
        var isActive = it.i === active, t = txt(st, texts[it.i]);
        var s = isActive && variant === 'pop' ? 1.12 : 1;
        ctx.save();
        if (s !== 1) { var cx = it.x + it.w / 2; ctx.translate(cx, g.y); ctx.scale(s, s); ctx.translate(-cx, -g.y); }
        var color = st.color;
        if (isActive) color = st.mode === 'box' ? st.accentText : st.mode === 'color' ? st.accent : st.past === 'dim' ? st.accent : st.color;
        else if (st.past === 'dim' && active >= 0 && it.i < active) color = st.pastColor;
        var tx = it.x + boxPad;
        if (st.shadow > 0 && !(isActive && st.mode === 'box')) {
          ctx.shadowColor = 'rgba(0,0,0,' + st.shadow + ')'; ctx.shadowBlur = st.shadowBlur * px; ctx.shadowOffsetY = st.shadowY * px;
        }
        if (st.stroke > 0) {
          ctx.lineWidth = st.stroke * px * 2; ctx.strokeStyle = st.strokeColor;
          ctx.strokeText(t, tx, g.y);
          ctx.shadowColor = 'transparent';
        }
        ctx.fillStyle = color;
        ctx.fillText(t, tx, g.y);
        ctx.restore();
      });
    });
    ctx.restore();
  }

  // ==================== SRT ====================
  function srtTime(t) {
    t = Math.max(0, t);
    var ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    var p = function (n, k) { n = String(n); while (n.length < k) n = '0' + n; return n; };
    return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + ',' + p(ms % 1000, 3);
  }
  function srt(bl, st, W, H) {
    st = style(st);
    var m = measurer(st, W, H);
    return bl.map(function (b, k) {
      var texts = b.words.map(function (w) { return txt(st, w.w); });
      var text = wrap(b.words.map(function (w) { return w.w; }), st, W, m).map(function (ln) { return ln.map(function (i) { return texts[i]; }).join(' '); }).join('\n');
      return (k + 1) + '\n' + srtTime(b.start) + ' --> ' + srtTime(b.end) + '\n' + text + '\n';
    }).join('\n');
  }

  /** Attend que la police soit chargée avant de dessiner (sinon le premier rendu prend une police de secours) */
  function ready(st) {
    st = style(st);
    try { return document.fonts.load(font(st, 40)).then(function () {}, function () {}); } catch (e) { return Promise.resolve(); }
  }

  /** Lignes d'un bloc telles qu'elles s'affichent (même découpe que l'aperçu) */
  function lines(block, st, W, H) {
    st = style(st);
    var m = measurer(st, W, H), texts = block.words.map(function (w) { return w.w; });
    return wrap(texts, st, W, m).map(function (ln) { return ln.map(function (i) { return txt(st, texts[i]); }).join(' '); });
  }

  window.KiruCaptions = { BASE: BASE, PRESETS: PRESETS, style: style, blocks: blocks, states: states, draw: draw, srt: srt, ready: ready, lines: lines,
    sizeBase: sizeBase, pxSize: pxSize, breakCost: breakCost, endsSentence: endsSentence, capital: capital, STARTERS: STARTERS };
})();
