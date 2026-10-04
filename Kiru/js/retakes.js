/**
 * Kiru — détection locale des reprises et faux départs (sans IA, instantané).
 *
 * Une reprise : on commence une phrase, on se trompe, on recommence. La phrase recommencée commence par les
 * mêmes mots que la tentative ratée (au moins 3 mots, ou 2 mots longs), peu après (moins de 70 mots / 45 s),
 * et les deux départs sont des débuts de phrase (après une ponctuation ou une pause). Tout ce qui précède la
 * dernière tentative est barré : la dernière prise est gardée. Les débuts répétés sur la même phrase
 * (« la première la première ») sont traités par les hésitations.
 */
(function () {
  'use strict';

  var MAX_WORDS = 70, MAX_SECONDS = 45, PAUSE = 0.45;

  function endsSentence(w) { return /[.?!…]["»”)]?$/.test(w); }

  /** marks : { indice de mot: raison } */
  function find(words, opts) {
    var norm = opts.normWord, n = words.length, nw = words.map(function (w) { return norm(w.w); }), marks = {};
    var isStart = function (i) {
      return i === 0 || endsSentence(words[i - 1].w) || words[i].s - words[i - 1].e >= PAUSE;
    };
    var i = 0;
    while (i < n) {
      if (!nw[i] || !isStart(i)) { i++; continue; }
      var best = -1, bestLen = 0;
      for (var j = i + 1; j < n && j - i <= MAX_WORDS && words[j].s - words[i].s <= MAX_SECONDS; j++) {
        if (!isStart(j) || nw[j] !== nw[i]) continue;
        var m = 0, chars = 0;
        while (i + m < j && j + m < n && nw[i + m] && nw[i + m] === nw[j + m]) { chars += nw[i + m].length; m++; }
        // assez de mots en commun pour être sûr que c'est la même phrase recommencée
        if ((m >= 3 && chars >= 10) || (m >= 2 && chars >= 14)) { best = j; bestLen = m; }
      }
      if (best > 0) {
        var phrase = nw.slice(best, best + Math.min(bestLen, 5)).join(' ');
        for (var k = i; k < best; k++) marks[k] = 'reprise : « ' + phrase + '… » recommencé plus loin';
        i = best;
        continue;
      }
      i++;
    }
    return marks;
  }

  /** Passages contigus : [[premier, dernier]] */
  function groups(marks) {
    var idx = Object.keys(marks).map(Number).sort(function (a, b) { return a - b; }), out = [];
    idx.forEach(function (i) {
      var g = out[out.length - 1];
      if (g && g[1] === i - 1) g[1] = i; else out.push([i, i]);
    });
    return out;
  }

  window.KiruRetakes = { find: find, groups: groups };
})();
