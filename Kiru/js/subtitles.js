/**
 * Kiru — sous-titres d'interview (classiques) : nettoyage par l'IA, re-découpage par idées, timing calé sur les images.
 *
 *  1. Nettoyage : l'IA (Claude conseillé) reçoit les phrases numérotées et renvoie leur texte corrigé (orthographe,
 *     accords, ponctuation, sans hésitations, répétitions ni faux départs). Elle ne voit jamais de timecodes.
 *  2. Alignement : chaque mot du texte nettoyé est rattaché à un mot transcrit (même mot ou mot corrigé) ; il en
 *     reprend le temps. Les mots transcrits sans correspondant sont les passages supprimés (listés pour vérification) :
 *     un sous-titre commence donc au premier mot gardé, jamais sur le « euh » qui le précède.
 *  3. Découpage : par phrases et idées (jamais entre un article et son nom…), 2 lignes de 42 caractères au plus,
 *     1 à 6 s, 17 caractères par seconde au plus ; coupure de ligne à l'endroit le plus naturel.
 *  4. Timing : images entières ; écart d'au moins 3 images entre deux sous-titres ; un écart de moins de 12 images
 *     est ramené à exactement 3 (enchaînement sans clignotement) ; aucun chevauchement.
 */
(function () {
  'use strict';

  var RULES = { maxChars: 42, maxLines: 2, minDur: 1, maxDur: 6, maxCps: 17, minGap: 3, joinGap: 12 };

  // ==================== 1. Nettoyage par l'IA ====================
  var SYSTEM =
    'Tu nettoies la transcription automatique d\'une interview vidéo pour en faire des sous-titres. ' +
    'Tu reçois des phrases numérotées. Pour CHAQUE phrase, renvoie son texte nettoyé :\n' +
    '- corrige l\'orthographe, les accords, la ponctuation et les majuscules ;\n' +
    '- supprime les hésitations (euh, heu, hum, ben, bah…) et les répétitions orales (« sur sur », « et et », « je je ») ;\n' +
    '- supprime les faux départs : un début de phrase abandonné puis repris ne garde que la reprise ;\n' +
    '- garde les mots de l\'intervenant dans le même ordre : ne reformule pas au-delà du nécessaire, ne résume pas, ' +
    'n\'ajoute rien, sauf pour corriger un mot manifestement mal transcrit ou un accord ;\n' +
    '- garde le ton de l\'intervenant (tutoiement, familiarité, expressions) ;\n' +
    '- si une phrase entière n\'est qu\'une hésitation ou un faux départ, renvoie un texte vide.\n' +
    'Renvoie toutes les phrases, dans l\'ordre, avec leur numéro.';
  var SCHEMA = {
    type: 'object', additionalProperties: false, required: ['sentences'],
    properties: { sentences: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'text'],
      properties: { id: { type: 'integer' }, text: { type: 'string' } } } } }
  };

  function endsSentence(w) { return /[.?!…]["»”)]?$/.test(w); }
  /** Phrases (ponctuation ou pause > 1,2 s) : [{ id, a, b (indices de mots), text }] */
  function sentences(ws) {
    var out = [], cur = null;
    ws.forEach(function (w, i) {
      if (!cur || endsSentence(ws[i - 1].w) || w.s - ws[i - 1].e > 1.2) { cur = { id: out.length + 1, a: i, b: i, text: '' }; out.push(cur); }
      cur.b = i; cur.text += (cur.text ? ' ' : '') + w.w;
    });
    return out;
  }
  /**
   * Texte nettoyé de chaque phrase : { id: texte }. Par paquets (80 phrases pour Claude, 25 pour l'IA locale),
   * une phrase non renvoyée garde son texte d'origine.
   */
  function clean(cfg, ss, onStatus) {
    var size = cfg.engine === 'local' ? 25 : 80, parts = [], res = {}, p = Promise.resolve();
    for (var i = 0; i < ss.length; i += size) parts.push(ss.slice(i, i + size));
    parts.forEach(function (part, k) {
      p = p.then(function () {
        if (onStatus) onStatus('Nettoyage du texte par ' + (cfg.engine === 'local' ? 'l\'IA locale' : 'Claude') + (parts.length > 1 ? ' · partie ' + (k + 1) + '/' + parts.length : '') + '…');
        var user = part.map(function (s) { return '[' + s.id + '] ' + s.text; }).join('\n');
        // autant de phrases qu'envoyées (sinon le petit modèle local peut renvoyer une liste vide)
        var schema = JSON.parse(JSON.stringify(SCHEMA));
        schema.properties.sentences.minItems = part.length; schema.properties.sentences.maxItems = part.length;
        return window.KiruAI.ask(cfg, SYSTEM, user, schema).then(function (r) {
          var n = 0;
          (r.sentences || []).forEach(function (x) { if (part.some(function (s) { return s.id === x.id; })) { res[x.id] = String(x.text || ''); n++; } });
          if (n < part.length / 2) throw new Error('l\'IA n\'a pas renvoyé le texte nettoyé (' + n + ' phrases sur ' + part.length + ') : réessayez, ou utilisez Claude (Réglages > IA)');
        });
      });
    });
    return p.then(function () { return res; });
  }

  // ==================== 2. Alignement texte nettoyé ↔ mots transcrits ====================
  function norm(w) { return String(w).toLowerCase().replace(/[’`]/g, '\'').replace(/[^\p{L}\p{N}']+/gu, ''); }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  /** Coût de remplacer le mot transcrit a par le mot nettoyé b : 0 identique, faible si proche (accord, faute) */
  function subCost(a, b) {
    if (a === b) return 0;
    if (!a || !b) return 2.5;
    var r = lev(a, b) / Math.max(a.length, b.length);
    // mot proche (accord, faute) : peu coûteux ; mot différent (« bancard » → « parcours ») : remplacement à vérifier,
    // préféré à « supprimé + ajouté » quand il prend la place exacte d'un mot
    return r <= 0.5 ? 0.6 + r : 1.9;
  }
  function similar(a, b) { return a === b || (a && b && lev(a, b) / Math.max(a.length, b.length) <= 0.5); }
  /** Mots du texte nettoyé (la ponctuation isolée « ? » est recollée au mot précédent) */
  function tokens(text) {
    var out = [];
    String(text).replace(/\s+/g, ' ').trim().split(' ').forEach(function (t) {
      if (!t) return;
      if (!norm(t) && out.length) out[out.length - 1] += (/^[?!:;»]/.test(t) ? ' ' : '') + t; else out.push(t);
    });
    return out;
  }
  /**
   * Alignement d'une phrase : mots nettoyés [{w, s, e, src}] (src : indice du mot transcrit repris, -1 si ajouté)
   * et indices des mots transcrits supprimés.
   */
  function align(orig, text) {
    var tk = tokens(text), a = orig.map(function (w) { return norm(w.w); }), b = tk.map(norm);
    var m = a.length, n = b.length, D = [], P = [], i, j;
    for (i = 0; i <= m; i++) { D[i] = []; P[i] = []; for (j = 0; j <= n; j++) {
      if (!i && !j) { D[i][j] = 0; continue; }
      var best = Infinity, from = '';
      if (i && j) { var c = D[i - 1][j - 1] + subCost(a[i - 1], b[j - 1]); if (c < best) { best = c; from = 'm'; } }
      if (i) { var c2 = D[i - 1][j] + 1; if (c2 < best) { best = c2; from = 'd'; } }   // mot transcrit supprimé
      if (j) { var c3 = D[i][j - 1] + 1.2; if (c3 < best) { best = c3; from = 'i'; } } // mot ajouté par l'IA
      D[i][j] = best; P[i][j] = from;
    } }
    var map = [], removed = [];
    for (i = m, j = n; i || j;) {
      var f = P[i][j];
      if (f === 'm') { map[j - 1] = i - 1; i--; j--; } else if (f === 'd') { removed.unshift(i - 1); i--; } else { map[j - 1] = -1; j--; }
    }
    var out = tk.map(function (t, k) { var src = map[k]; return { w: t, src: src, s: src >= 0 ? orig[src].s : null, e: src >= 0 ? orig[src].e : null }; });
    // remplacements par un mot différent : signalés pour vérification
    var replaced = [];
    out.forEach(function (x, k) { if (x.src >= 0 && b[k] && !similar(a[x.src], b[k])) replaced.push({ from: orig[x.src], to: x.w }); });
    var added = out.filter(function (x) { return x.src < 0 && norm(x.w); }).length;
    // mots ajoutés : placés entre leurs voisins
    out.forEach(function (x, k) {
      if (x.s != null) return;
      var prev = null, next = null, q;
      for (q = k - 1; q >= 0; q--) if (out[q].s != null) { prev = out[q]; break; }
      for (q = k + 1; q < out.length; q++) if (out[q].s != null) { next = out[q]; break; }
      x.s = prev ? prev.e : next ? Math.max(0, next.s - 0.2) : orig.length ? orig[0].s : 0;
      x.e = next ? Math.max(x.s + 0.05, next.s) : x.s + 0.2;
    });
    return { words: out, removed: removed, replaced: replaced, added: added };
  }

  // ==================== 3. Découpage par idées ====================
  /** Lignes d'un bloc : une si elle tient, sinon la coupure la plus naturelle et équilibrée ; null si impossible */
  function layout(ws, R) {
    var C = window.KiruCaptions, texts = ws.map(function (w) { return w.w; }), one = texts.join(' ');
    if (one.length <= R.maxChars) return [one];
    if (R.maxLines < 2) return null;
    var best = null, bestC = Infinity;
    for (var k = 1; k < texts.length; k++) {
      var l1 = texts.slice(0, k).join(' '), l2 = texts.slice(k).join(' ');
      if (l1.length > R.maxChars || l2.length > R.maxChars) continue;
      var c = Math.abs(l1.length - l2.length) / 8 + Math.max(0, C.breakCost({ w: texts[k - 1], s: 0, e: 0 }, { w: texts[k], s: 0, e: 0 }));
      if (/^\d/.test(texts[k])) c += 4; // « Article | 1 », « 25 | ans » : le nombre reste avec son mot
      if (c < bestC) { bestC = c; best = [l1, l2]; }
    }
    return best;
  }
  /** Meilleur découpage d'une phrase en sous-titres (programmation dynamique) */
  function split(ph, R) {
    var C = window.KiruCaptions, n = ph.length, best = [0], from = [0];
    for (var j = 1; j <= n; j++) {
      best[j] = Infinity;
      for (var i = j - 1; i >= 0; i--) {
        var blk = ph.slice(i, j), chars = blk.map(function (w) { return w.w; }).join(' ').length;
        if (chars > R.maxChars * R.maxLines + 2) break;
        if (best[i] === Infinity) continue;
        var dur = blk[blk.length - 1].e - blk[0].s, k = j - i;
        if (k > 1 && (dur > R.maxDur || !layout(blk, R))) continue;
        // sous-titres pleins mais lisibles : ni trop rapides (car./s), ni trop courts
        var c = Math.pow((chars - R.maxChars * 1.4) / R.maxChars, 2) * 2;
        var cps = chars / Math.max(dur, R.minDur);
        if (cps > R.maxCps) c += (cps - R.maxCps) * 0.5;
        if (dur < R.minDur) c += 1.5;
        if (k === 1 && n > 1) c += 3;
        if (j < n) c += C.breakCost(ph[j - 1], ph[j]) + (/^\d/.test(ph[j].w) || /^\d/.test(ph[j - 1].w) && /^[a-zà-ÿ]/.test(ph[j].w) ? 3 : 0);
        if (best[i] + c < best[j]) { best[j] = best[i] + c; from[j] = i; }
      }
      if (best[j] === Infinity) { best[j] = best[j - 1] + 5; from[j] = j - 1; } // mot seul trop long : bloc à lui seul
    }
    var cuts = [], p = n;
    while (p > 0) { cuts.unshift(ph.slice(from[p], p)); p = from[p]; }
    return cuts;
  }
  /** Mots nettoyés → blocs [{ words, lines }] ; une phrase (ou une pause de plus de 1,5 s) commence toujours un bloc */
  function blocks(ws, R) {
    var out = [], a = 0;
    for (var i = 1; i <= ws.length; i++) {
      if (i < ws.length && !endsSentence(ws[i - 1].w) && ws[i].s - ws[i - 1].e <= 1.5) continue;
      if (i > a) split(ws.slice(a, i), R).forEach(function (b) { out.push({ words: b, lines: layout(b, R) || [b.map(function (w) { return w.w; }).join(' ')] }); });
      a = i;
    }
    return out;
  }

  // ==================== 4. Timing en images ====================
  function timing(bl, fps, R) {
    bl.forEach(function (b) {
      b.f0 = Math.round(b.words[0].s * fps);
      b.f1 = Math.max(b.f0 + 1, Math.round(b.words[b.words.length - 1].e * fps));
    });
    bl.forEach(function (b, k) {
      var next = bl[k + 1];
      // durée minimale (sans empiéter sur le suivant)
      if (b.f1 - b.f0 < R.minDur * fps) b.f1 = b.f0 + Math.round(R.minDur * fps);
      if (!next) return;
      if (next.f0 <= b.f0) next.f0 = b.f0 + 1;
      var gap = next.f0 - b.f1;
      // écart trop court (ou chevauchement) : la fin recule ; écart de moins de 12 images : ramené à 3 (enchaînement)
      if (gap < R.joinGap) b.f1 = next.f0 - R.minGap;
      b.f1 = Math.min(b.f1, b.f0 + Math.round(R.maxDur * fps));
      if (b.f1 <= b.f0) b.f1 = Math.min(next.f0 - 1, b.f0 + 1);
    });
    return bl;
  }

  // ==================== Ensemble ====================
  /**
   * words : mots de la séquence [{w, s, e}] ; opts = { ai: cfg|null, fps, rules, onStatus }.
   * Résout { blocks: [{ f0, f1, lines, words }], removed: [{ s, e, text, kind }], fps }.
   */
  function build(words, opts) {
    var R = Object.assign({}, RULES, opts.rules || {}), fps = opts.fps || 25, ss = sentences(words);
    var cleaned = opts.ai ? clean(opts.ai, ss, opts.onStatus) : Promise.resolve(localClean(words, ss));
    return cleaned.then(function (texts) {
      var ws = [], removed = [], notes = [];
      ss.forEach(function (s) {
        var orig = words.slice(s.a, s.b + 1), text = texts[s.id] != null ? texts[s.id] : s.text;
        var r = align(orig, text);
        // l'IA a ajouté des mots jamais prononcés (phrase « complétée ») : nettoyage refusé pour cette phrase
        if (r.added > Math.max(2, orig.length * 0.2)) {
          notes.push({ s: orig[0].s, e: orig[orig.length - 1].e, text: text, kind: 'texte ajouté par l\'IA, refusé' });
          r = align(orig, localClean(words, [s])[s.id]);
        }
        r.replaced.forEach(function (x) { notes.push({ s: x.from.s, e: x.from.e, text: x.from.w + ' → ' + x.to, kind: 'mot corrigé' }); });
        r.words.forEach(function (w) { ws.push({ w: w.w, s: w.s, e: w.e }); });
        // passages supprimés : mots transcrits consécutifs sans correspondant
        var run = null;
        r.removed.forEach(function (i) {
          if (!norm(orig[i].w)) return; // ponctuation seule : rien à signaler
          if (run && i === run.last + 1) { run.last = i; run.ws.push(orig[i]); }
          else { if (run) removed.push(run); run = { last: i, ws: [orig[i]] }; }
        });
        if (run) removed.push(run);
      });
      for (var k = 1; k < ws.length; k++) if (ws[k].s < ws[k - 1].s) ws[k].s = ws[k - 1].s;
      var bl = timing(blocks(ws, R), fps, R);
      return {
        fps: fps, blocks: bl,
        // à vérifier, dans l'ordre du film : passages supprimés, mots corrigés, nettoyages refusés
        removed: removed.map(function (r) {
          var t = r.ws.map(function (w) { return w.w; }).join(' ');
          return { s: r.ws[0].s, e: r.ws[r.ws.length - 1].e, text: t, kind: kind(t) };
        }).concat(notes).sort(function (x, y) { return x.s - y.s; })
      };
    });
  }
  var FILLERS = /^(euh+|heu+|hum+|hmm+|mmh+|ben|bah|bon ben|um+|uh+|erm)$/;
  function kind(t) {
    var parts = t.split(/\s+/).map(norm).filter(Boolean);
    if (parts.length && parts.every(function (p) { return FILLERS.test(p); })) return 'hésitation';
    var half = parts.length / 2;
    if (parts.length >= 2 && parts.length % 2 === 0 && parts.slice(0, half).join(' ') === parts.slice(half).join(' ')) return 'répétition';
    return parts.length <= 2 ? 'répétition ou mot retiré' : 'faux départ ou passage retiré';
  }
  /** Sans IA : seules les hésitations et les mots doublés sont retirés */
  function localClean(words, ss) {
    var out = {};
    ss.forEach(function (s) {
      var ws = words.slice(s.a, s.b + 1).map(function (w) { return w.w; }), keep = [];
      ws.forEach(function (w, i) {
        var n = norm(w);
        if (FILLERS.test(n)) return;
        if (i + 1 < ws.length && n && n === norm(ws[i + 1])) return;
        keep.push(w);
      });
      out[s.id] = keep.join(' ');
    });
    return out;
  }

  // ==================== Sorties ====================
  function tc(f, fps, sep) {
    var r = Math.round(fps), p = function (n, k) { n = String(n); while (n.length < (k || 2)) n = '0' + n; return n; };
    if (sep === 'srt') { var ms = Math.round(f / fps * 1000); return p(Math.floor(ms / 3600000)) + ':' + p(Math.floor(ms / 60000) % 60) + ':' + p(Math.floor(ms / 1000) % 60) + ',' + p(ms % 1000, 3); }
    return p(Math.floor(f / (r * 3600))) + ':' + p(Math.floor(f / (r * 60)) % 60) + ':' + p(Math.floor(f / r) % 60) + ':' + p(f % r);
  }
  function srt(res) {
    return res.blocks.map(function (b, k) {
      return (k + 1) + '\n' + tc(b.f0, res.fps, 'srt') + ' --> ' + tc(b.f1, res.fps, 'srt') + '\n' + b.lines.join('\n') + '\n';
    }).join('\n');
  }
  function report(res) {
    return res.removed.map(function (r) {
      return tc(Math.round(r.s * res.fps), res.fps) + ' → ' + tc(Math.round(r.e * res.fps), res.fps) + '  [' + r.kind + ']  « ' + r.text + ' »';
    }).join('\r\n');
  }

  window.KiruSubs = { RULES: RULES, build: build, srt: srt, report: report, tc: tc, align: align, blocks: blocks, timing: timing };
})();
