/**
 * Sori — modèle de courbe (valeur normalisée 0 → 1 sur un temps normalisé 0 → 1).
 *
 * Une courbe est une suite de points d'ancrage reliés par des segments de Bézier cubiques :
 *   { t, v, i: [dt, dv] | null, o: [dt, dv] | null, broken: bool }
 * i / o = poignées d'entrée / de sortie, relatives au point (dt ≤ 0 pour i, ≥ 0 pour o).
 * Le premier point est (0, 0), le dernier (1, 1) : ils correspondent aux deux images clés.
 * Les poignées restent dans la largeur de leur segment : la courbe est toujours une fonction du temps.
 */
(function () {
  'use strict';

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function clone(c) { return JSON.parse(JSON.stringify(c)); }

  function bez(a, b, c, d, u) { var m = 1 - u; return m * m * m * a + 3 * m * m * u * b + 3 * m * u * u * c + u * u * u * d; }
  function dbez(a, b, c, d, u) { var m = 1 - u; return 3 * m * m * (b - a) + 6 * m * u * (c - b) + 3 * u * u * (d - c); }

  /** Points de contrôle absolus du segment k : [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] */
  function ctrl(c, k) {
    var a = c.points[k], b = c.points[k + 1];
    return [[a.t, a.v], [a.t + a.o[0], a.v + a.o[1]], [b.t + b.i[0], b.v + b.i[1]], [b.t, b.v]];
  }

  /** Paramètre u tel que x(u) = x (Newton, puis dichotomie si besoin) */
  function solveU(p, x) {
    var x0 = p[0][0], x1 = p[1][0], x2 = p[2][0], x3 = p[3][0];
    if (x3 - x0 < 1e-12) return 0;
    var u = clamp((x - x0) / (x3 - x0), 0, 1), i;
    for (i = 0; i < 8; i++) {
      var e = bez(x0, x1, x2, x3, u) - x, d = dbez(x0, x1, x2, x3, u);
      if (Math.abs(e) < 1e-9) return u;
      if (Math.abs(d) < 1e-7) break;
      u -= e / d;
      if (u < 0 || u > 1) break;
    }
    var lo = 0, hi = 1;
    for (i = 0; i < 40; i++) {
      u = (lo + hi) / 2;
      if (bez(x0, x1, x2, x3, u) < x) lo = u; else hi = u;
    }
    return u;
  }

  function segmentAt(c, t) {
    var pts = c.points;
    for (var k = 0; k < pts.length - 2; k++) if (t <= pts[k + 1].t) return k;
    return pts.length - 2;
  }

  /** Valeur normalisée de la courbe au temps t ∈ [0, 1] */
  function evaluate(c, t) {
    t = clamp(t, 0, 1);
    var k = segmentAt(c, t), p = ctrl(c, k);
    return bez(p[0][1], p[1][1], p[2][1], p[3][1], solveU(p, t));
  }

  /** Vitesse (dv/dt) : 1 = vitesse moyenne d'un mouvement linéaire */
  function slopeInSegment(p, u) {
    var dx = dbez(p[0][0], p[1][0], p[2][0], p[3][0], u), dy = dbez(p[0][1], p[1][1], p[2][1], p[3][1], u);
    if (Math.abs(dx) < 1e-9) {
      // poignée d'influence nulle : on regarde un peu plus loin sur le segment
      var u2 = u < 0.5 ? u + 1e-3 : u - 1e-3;
      dx = dbez(p[0][0], p[1][0], p[2][0], p[3][0], u2); dy = dbez(p[0][1], p[1][1], p[2][1], p[3][1], u2);
      if (Math.abs(dx) < 1e-12) return 0;
    }
    return dy / dx;
  }
  function speedAt(c, t) {
    t = clamp(t, 0, 1);
    var k = segmentAt(c, t), p = ctrl(c, k);
    return slopeInSegment(p, solveU(p, t));
  }

  /** Échantillons (t, v, vitesse) pour le tracé, segment par segment (les ruptures de vitesse restent visibles) */
  function samples(c, perSeg) {
    var out = [], n = perSeg || 48;
    for (var k = 0; k < c.points.length - 1; k++) {
      var p = ctrl(c, k), seg = [];
      for (var j = 0; j <= n; j++) {
        var u = j / n;
        seg.push({ t: bez(p[0][0], p[1][0], p[2][0], p[3][0], u), v: bez(p[0][1], p[1][1], p[2][1], p[3][1], u), s: slopeInSegment(p, clamp(u, 1e-4, 1 - 1e-4)) });
      }
      out.push(seg);
    }
    return out;
  }

  /** Poignées ramenées dans leur segment ; la pente est conservée quand la largeur est rognée */
  function constrain(c) {
    var pts = c.points;
    pts[0].t = 0; pts[0].v = 0; pts[0].i = null;
    pts[pts.length - 1].t = 1; pts[pts.length - 1].v = 1; pts[pts.length - 1].o = null;
    for (var k = 0; k < pts.length - 1; k++) {
      var a = pts[k], b = pts[k + 1], dur = b.t - a.t;
      if (!a.o) a.o = [dur / 3, 0];
      if (!b.i) b.i = [-dur / 3, 0];
      if (a.o[0] > dur) { a.o[1] *= dur / a.o[0]; a.o[0] = dur; }
      if (a.o[0] < 0) a.o[0] = 0;
      if (b.i[0] < -dur) { b.i[1] *= -dur / b.i[0]; b.i[0] = -dur; }
      if (b.i[0] > 0) b.i[0] = 0;
    }
    return c;
  }

  /**
   * Sous-image clé non destructive (De Casteljau) : coupe le segment au temps t.
   * La forme de la courbe est strictement identique, un point d'ancrage apparaît.
   * Renvoie l'index du nouveau point.
   */
  function split(c, t) {
    var k = segmentAt(c, t), p = ctrl(c, k), u = solveU(p, t);
    if (u < 1e-4 || u > 1 - 1e-4) return -1;
    var L = function (a, b) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
    var p01 = L(p[0], p[1]), p12 = L(p[1], p[2]), p23 = L(p[2], p[3]);
    var p012 = L(p01, p12), p123 = L(p12, p23), m = L(p012, p123);
    var a = c.points[k], b = c.points[k + 1];
    a.o = [p01[0] - p[0][0], p01[1] - p[0][1]];
    b.i = [p23[0] - p[3][0], p23[1] - p[3][1]];
    c.points.splice(k + 1, 0, { t: m[0], v: m[1], i: [p012[0] - m[0], p012[1] - m[1]], o: [p123[0] - m[0], p123[1] - m[1]], broken: false });
    return k + 1;
  }

  function removePoint(c, idx) {
    if (idx <= 0 || idx >= c.points.length - 1) return false;
    c.points.splice(idx, 1);
    constrain(c);
    return true;
  }

  // ==================== Construction ====================
  function fromCubic(x1, y1, x2, y2) {
    return constrain({ points: [
      { t: 0, v: 0, i: null, o: [clamp(x1, 0, 1), y1] },
      { t: 1, v: 1, i: [clamp(x2, 0, 1) - 1, y2 - 1], o: null }
    ] });
  }
  /** cubic-bezier CSS si la courbe n'a qu'un segment, sinon null */
  function toCubic(c) {
    if (c.points.length !== 2) return null;
    var a = c.points[0], b = c.points[1];
    return [a.o[0], a.o[1], 1 + b.i[0], 1 + b.i[1]];
  }

  /**
   * Courbe approchant une fonction f (0 → 1) avec des points aux temps ts :
   * poignées de Hermite (1/3 du segment) calées sur les pentes à gauche / à droite de chaque point.
   */
  function fromFunction(f, ts) {
    var h = 1e-5, pts = ts.map(function (t) { return { t: t, v: f(t), i: null, o: null, broken: true }; });
    for (var k = 0; k < pts.length - 1; k++) {
      var a = pts[k], b = pts[k + 1], d = b.t - a.t;
      var sOut = (f(Math.min(1, a.t + h)) - a.v) / h;
      var sIn = (b.v - f(Math.max(0, b.t - h))) / h;
      a.o = [d / 3, sOut * d / 3];
      b.i = [-d / 3, -sIn * d / 3];
    }
    pts[0].v = 0; pts[pts.length - 1].v = 1;
    return constrain({ points: pts });
  }

  /** Temps des extrema de f (+ les milieux entre eux) : points d'ancrage d'une oscillation */
  function extremaTimes(f, withMid) {
    var n = 4000, ts = [0], prev = null;
    for (var i = 1; i < n; i++) {
      var t = i / n, d = f(t + 1e-5) - f(t - 1e-5);
      if (prev !== null && (d > 0) !== (prev > 0) && Math.abs(d) + Math.abs(prev) > 1e-9) ts.push(t);
      prev = d;
    }
    ts.push(1);
    if (!withMid) return ts;
    var out = [];
    for (var j = 0; j < ts.length; j++) {
      out.push(ts[j]);
      if (j < ts.length - 1) out.push((ts[j] + ts[j + 1]) / 2);
    }
    return out;
  }

  function mirror(f) { return function (t) { return 1 - f(1 - t); }; }
  var C4 = 2 * Math.PI / 3;
  // formule usuelle, sans son saut de 0,1 % en t = 1 (remise à l'échelle pour finir exactement à 1)
  function elasticRaw(t) { return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * C4) + 1; }
  var ELASTIC_END = elasticRaw(1);
  function elasticOut(t) { return elasticRaw(clamp(t, 0, 1)) / ELASTIC_END; }
  function bounceOut(t) {
    var n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
    if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
    t -= 2.625 / d1; return n1 * t * t + 0.984375;
  }
  var BOUNCE_TS = [0, 0.5 / 2.75, 1 / 2.75, 1.5 / 2.75, 2 / 2.75, 2.25 / 2.75, 2.5 / 2.75, 2.625 / 2.75, 1];

  // ==================== Presets intégrés ====================
  var BUILTIN = [
    { group: 'Standard', items: [
      ['linear', 'Linéaire', [0, 0, 1, 1]],
      ['ease', 'Ease', [0.25, 0.1, 0.25, 1]],
      ['ease-in', 'Ease In', [0.42, 0, 1, 1]],
      ['ease-out', 'Ease Out', [0, 0, 0.58, 1]],
      ['ease-in-out', 'Ease In-Out', [0.42, 0, 0.58, 1]],
      ['smooth', 'Smooth', [0.75, 0, 0.25, 1]]
    ] },
    { group: 'Cubic', items: [
      ['cubic-in', 'Cubic In', [0.32, 0, 0.67, 0]],
      ['cubic-out', 'Cubic Out', [0.33, 1, 0.68, 1]],
      ['cubic-in-out', 'Cubic In-Out', [0.65, 0, 0.35, 1]],
      ['quint-out', 'Quint Out', [0.22, 1, 0.36, 1]],
      ['quint-in-out', 'Quint In-Out', [0.83, 0, 0.17, 1]]
    ] },
    { group: 'Expo', items: [
      ['expo-in', 'Expo In', [0.7, 0, 0.84, 0]],
      ['expo-out', 'Expo Out', [0.16, 1, 0.3, 1]],
      ['expo-in-out', 'Expo In-Out', [0.87, 0, 0.13, 1]]
    ] },
    { group: 'Back / Overshoot', items: [
      ['back-in', 'Back In', [0.36, 0, 0.66, -0.56]],
      ['back-out', 'Back Out', [0.34, 1.56, 0.64, 1]],
      ['back-in-out', 'Back In-Out', [0.68, -0.6, 0.32, 1.6]]
    ] },
    { group: 'Élastique & rebond', items: [
      ['elastic-out', 'Elastic Out', function () { return fromFunction(elasticOut, extremaTimes(elasticOut, true)); }],
      ['elastic-in', 'Elastic In', function () { var f = mirror(elasticOut); return fromFunction(f, extremaTimes(f, true)); }],
      ['bounce-out', 'Bounce Out', function () { return fromFunction(bounceOut, BOUNCE_TS); }],
      ['bounce-in', 'Bounce In', function () { return fromFunction(mirror(bounceOut), BOUNCE_TS.map(function (t) { return 1 - t; }).reverse()); }]
    ] }
  ];
  var builtinCache = null;
  function builtins() {
    if (builtinCache) return builtinCache;
    builtinCache = BUILTIN.map(function (g) {
      return { group: g.group, items: g.items.map(function (it) {
        var curve = typeof it[2] === 'function' ? it[2]() : fromCubic(it[2][0], it[2][1], it[2][2], it[2][3]);
        return { id: it[0], name: it[1], curve: curve, builtIn: true };
      }) };
    });
    return builtinCache;
  }
  function findBuiltin(id) {
    var all = builtins();
    for (var g = 0; g < all.length; g++) for (var i = 0; i < all[g].items.length; i++) if (all[g].items[i].id === id) return all[g].items[i];
    return null;
  }

  // ==================== Import / export ====================
  function r4(x) { return Math.round(x * 10000) / 10000; }
  function cssString(c) {
    var q = toCubic(c);
    if (!q) return null;
    return 'cubic-bezier(' + q.map(function (x) { return String(r4(x)); }).join(', ') + ')';
  }
  function serialize(c) {
    return { points: c.points.map(function (p) {
      var o = { t: r4(p.t), v: r4(p.v) };
      if (p.i) o.i = [r4(p.i[0]), r4(p.i[1])];
      if (p.o) o.o = [r4(p.o[0]), r4(p.o[1])];
      if (p.broken) o.broken = true;
      return o;
    }) };
  }
  function exportJSON(name, c) {
    var o = { soriCurve: 1, name: name || 'Courbe' };
    var q = toCubic(c);
    if (q) o.cubicBezier = q.map(r4);
    o.points = serialize(c).points;
    return JSON.stringify(o);
  }
  function validCurve(c) {
    if (!c || !Array.isArray(c.points) || c.points.length < 2) return false;
    for (var i = 0; i < c.points.length; i++) {
      var p = c.points[i];
      if (!isFinite(p.t) || !isFinite(p.v)) return false;
      if (i > 0 && p.t <= c.points[i - 1].t) return false;
    }
    return true;
  }
  function fromPoints(pts) {
    var c = { points: pts.map(function (p) {
      return { t: +p.t, v: +p.v, i: p.i ? [+p.i[0], +p.i[1]] : null, o: p.o ? [+p.o[0], +p.o[1]] : null, broken: !!p.broken };
    }) };
    if (!validCurve(c)) throw new Error('points de courbe invalides');
    return constrain(c);
  }

  /**
   * Lit un ou plusieurs profils : « cubic-bezier(a, b, c, d) », « a, b, c, d », [a, b, c, d],
   * JSON Sori ({ soriCurve, name, points }), liste de presets, ou objet { x1, y1, x2, y2 } / { bezier: [...] }.
   * Renvoie [{ name, curve }].
   */
  function parseAny(text) {
    var s = String(text || '').trim();
    if (!s) throw new Error('rien à importer');
    var m = s.match(/cubic-bezier\s*\(([^)]*)\)/i);
    var nums = function (str) { return str.split(/[\s,;]+/).filter(Boolean).map(Number); };
    var fromNums = function (n, name) {
      if (n.length !== 4 || n.some(function (x) { return !isFinite(x); })) throw new Error('il faut 4 nombres : x1, y1, x2, y2');
      if (n[0] < 0 || n[0] > 1 || n[2] < 0 || n[2] > 1) throw new Error('x1 et x2 doivent être entre 0 et 1');
      return { name: name || 'cubic-bezier(' + n.join(', ') + ')', curve: fromCubic(n[0], n[1], n[2], n[3]) };
    };
    if (m) return [fromNums(nums(m[1]))];
    if (/^[\s\d.,;+\-eE]+$/.test(s)) return [fromNums(nums(s))];
    var data;
    try { data = JSON.parse(s); } catch (e) { throw new Error('format non reconnu : collez un cubic-bezier(…) ou un JSON exporté'); }
    var one = function (d, fallbackName) {
      if (Array.isArray(d) && d.length === 4 && d.every(function (x) { return typeof x === 'number'; })) return fromNums(d, fallbackName);
      if (!d || typeof d !== 'object') throw new Error('profil illisible');
      var name = String(d.name || d.title || fallbackName || 'Import').slice(0, 40);
      if (Array.isArray(d.points)) return { name: name, curve: fromPoints(d.points) };
      var b = d.cubicBezier || d.bezier || d.curve || d.value;
      if (typeof b === 'string') return { name: name, curve: parseAny(b)[0].curve };
      if (Array.isArray(b)) return fromNums(b.map(Number), name);
      if (isFinite(d.x1) && isFinite(d.y1) && isFinite(d.x2) && isFinite(d.y2)) return fromNums([+d.x1, +d.y1, +d.x2, +d.y2], name);
      throw new Error('profil sans courbe : « ' + name + ' »');
    };
    if (Array.isArray(data) && !(data.length === 4 && data.every(function (x) { return typeof x === 'number'; }))) {
      return data.map(function (d, i) { return one(d, 'Import ' + (i + 1)); });
    }
    if (data && Array.isArray(data.presets)) return data.presets.map(function (d, i) { return one(d, 'Import ' + (i + 1)); });
    return [one(data)];
  }

  // ==================== Échantillonnage pour la timeline ====================
  /**
   * Simplification : garde les indices dont la suppression déformerait l'animation de plus que tol
   * (interpolation linéaire entre clés gardées). forced = indices toujours gardés.
   */
  function simplify(times, values, tol, forced) {
    var n = times.length;
    if (n <= 2) return times.map(function (_, i) { return i; });
    var keep = [0], last = 0;
    var dist = function (a, b) {
      if (typeof a === 'number') return Math.abs(a - b);
      var d = 0; for (var i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d;
    };
    var lerp = function (a, b, u) {
      if (typeof a === 'number') return a + (b - a) * u;
      return a.map(function (x, i) { return x + (b[i] - x) * u; });
    };
    var okSpan = function (i0, j) {
      for (var k = i0 + 1; k < j; k++) {
        var u = (times[k] - times[i0]) / (times[j] - times[i0]);
        if (dist(lerp(values[i0], values[j], u), values[k]) > tol) return false;
      }
      return true;
    };
    for (var j = 2; j < n; j++) {
      if (forced && forced[j - 1]) { keep.push(j - 1); last = j - 1; continue; }
      if (!okSpan(last, j)) { keep.push(j - 1); last = j - 1; }
    }
    keep.push(n - 1);
    return keep;
  }

  window.SoriCurve = {
    clone: clone, clamp: clamp, ctrl: ctrl, evaluate: evaluate, speedAt: speedAt, samples: samples,
    constrain: constrain, split: split, removePoint: removePoint, segmentAt: segmentAt,
    fromCubic: fromCubic, toCubic: toCubic, fromPoints: fromPoints, validCurve: validCurve,
    builtins: builtins, findBuiltin: findBuiltin,
    cssString: cssString, serialize: serialize, exportJSON: exportJSON, parseAny: parseAny,
    simplify: simplify
  };
})();
