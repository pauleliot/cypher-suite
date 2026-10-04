/**
 * Kiru — transcription locale (whisper.cpp) avec horodatage de chaque mot.
 *
 *  1. le média est converti en WAV 16 kHz mono (ffmpeg, sinon décodeur Web Audio) ;
 *  2. whisper.cpp le transcrit en « un segment par mot » (-ml 1 -sow), sortie JSON ;
 *  3. les mots sont gardés en cache sur disque (chemin + taille + date + modèle + langue) :
 *     après une coupe, la séquence est retranscrite instantanément à partir du cache.
 *
 * Rien n'est envoyé en ligne. Modèles : https://huggingface.co/ggerganov/whisper.cpp
 */
(function () {
  'use strict';

  function req(name) {
    var n = window.cep_node, r = (n && typeof n.require === 'function' && n.require) || window.__kiruRequire;
    try { return r ? r(name) : null; } catch (e) { return null; }
  }
  var fs = req('fs'), pathMod = req('path'), cp = req('child_process'), os = req('os'), https = req('https');
  var proc = (window.cep_node && window.cep_node.process) || (typeof process !== 'undefined' ? process : null);
  var Buf = (window.cep_node && window.cep_node.Buffer) || (typeof Buffer !== 'undefined' ? Buffer : null);
  var win = proc && proc.platform === 'win32';

  var MODELS = [
    { id: 'large-v3-turbo-q5_0', name: 'Large v3 Turbo (compressé)', size: '574 Mo', hint: 'Recommandé : très bonne qualité en français, rapide' },
    { id: 'large-v3-q5_0', name: 'Large v3 (compressé)', size: '1,1 Go', hint: 'Le plus précis : moins de mots oubliés ou mal compris, 3 à 4 fois plus lent que Turbo' },
    { id: 'small', name: 'Small', size: '488 Mo', hint: 'Plus rapide, un peu moins précis' },
    { id: 'base', name: 'Base', size: '148 Mo', hint: 'Très rapide, pour essayer' },
    { id: 'large-v3-turbo', name: 'Large v3 Turbo', size: '1,6 Go', hint: 'Qualité maximale' }
  ];
  /** Hésitations, par défaut (français + anglais) ; la liste est modifiable dans les réglages */
  var FILLERS = 'euh, euhh, heu, heuu, hum, hmm, mmh, bah, bon ben, um, uh, uhm, erm';

  // ==================== Dossiers ====================
  function dataDir() {
    if (!pathMod || !proc) return '';
    var env = proc.env || {};
    var base = proc.platform === 'darwin' ? pathMod.join(env.HOME || '', 'Library', 'Application Support')
      : (env.APPDATA || pathMod.join(env.USERPROFILE || '', 'AppData', 'Roaming'));
    return pathMod.join(base, 'Kiru');
  }
  function ensureDir(d) { try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch (e) {} return d; }
  function modelsDir() { return pathMod.join(dataDir(), 'models'); }
  function modelPath(id) { return pathMod.join(modelsDir(), 'ggml-' + id + '.bin'); }
  function exists(p) { try { return !!p && fs.statSync(p).isFile(); } catch (e) { return false; } }
  function installedModels() { if (!fs || !pathMod) return []; return MODELS.filter(function (m) { return exists(modelPath(m.id)); }).map(function (m) { return m.id; }); }

  // ==================== whisper.cpp ====================
  function findIn(dir, names, depth) {
    try {
      var list = fs.readdirSync(dir);
      for (var i = 0; i < names.length; i++) if (list.indexOf(names[i]) >= 0 && exists(pathMod.join(dir, names[i]))) return pathMod.join(dir, names[i]);
      if (depth > 0) for (var j = 0; j < list.length; j++) {
        var sub = pathMod.join(dir, list[j]);
        try { if (fs.statSync(sub).isDirectory()) { var f = findIn(sub, names, depth - 1); if (f) return f; } } catch (e) {}
      }
    } catch (e2) {}
    return '';
  }
  /** whisper-cli (ou ses anciens noms) : chemin indiqué, dossier de Kiru, PATH, Homebrew */
  function findWhisper(custom) {
    if (!fs || !pathMod) return '';
    if (custom && exists(custom)) return custom;
    var names = win ? ['whisper-cli.exe', 'whisper-cpp.exe', 'whisper.exe'] : ['whisper-cli', 'whisper-cpp'];
    // version GPU d'abord si elle est installée
    var own = findIn(pathMod.join(dataDir(), 'whisper-gpu'), names, 3) || findIn(pathMod.join(dataDir(), 'whisper'), names.concat(win ? ['main.exe'] : []), 3);
    if (own) return own;
    var env = (proc && proc.env) || {};
    var dirs = String(env.PATH || env.Path || '').split(win ? ';' : ':')
      .concat(win ? [pathMod.join(env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links')] : ['/opt/homebrew/bin', '/usr/local/bin']);
    for (var i = 0; i < dirs.length; i++) {
      var f = dirs[i] && findIn(dirs[i].replace(/^"|"$/g, ''), names, 0);
      if (f) return f;
    }
    return '';
  }

  // ==================== Téléchargements (modèle, whisper.cpp pour Windows) ====================
  function download(url, dest, onProgress, redirects) {
    return new Promise(function (resolve, reject) {
      if (!https) return reject(new Error('Node.js indisponible'));
      var rq = https.get(url, { headers: { 'User-Agent': 'Kiru' } }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if ((redirects || 0) > 8) return reject(new Error('trop de redirections'));
          var next = /^https?:/.test(res.headers.location) ? res.headers.location : new URL(res.headers.location, url).toString();
          return resolve(download(next, dest, onProgress, (redirects || 0) + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('téléchargement refusé (HTTP ' + res.statusCode + ')')); }
        var total = Number(res.headers['content-length']) || 0, got = 0, part = dest + '.part';
        ensureDir(pathMod.dirname(dest));
        var out = fs.createWriteStream(part);
        res.on('data', function (c) { got += c.length; if (onProgress && total) onProgress(got / total); });
        res.pipe(out);
        out.on('finish', function () {
          out.close(function () {
            try { if (fs.existsSync(dest)) fs.unlinkSync(dest); fs.renameSync(part, dest); resolve(dest); } catch (e) { reject(e); }
          });
        });
        res.on('error', reject); out.on('error', reject);
      });
      rq.on('error', reject);
    });
  }
  function downloadModel(id, onProgress) {
    return download('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-' + id + '.bin', modelPath(id), onProgress);
  }
  function getJSON(url) {
    return new Promise(function (resolve, reject) {
      https.get(url, { headers: { 'User-Agent': 'Kiru', Accept: 'application/vnd.github+json' } }, function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          if (res.statusCode !== 200) return reject(new Error('GitHub (HTTP ' + res.statusCode + ')'));
          try { resolve(JSON.parse(Buf.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }
  /**
   * Windows : version précompilée de whisper.cpp, dézippée dans le dossier de Kiru. La dernière version
   * publiée n'a pas toujours de fichiers (les binaires sont sur des versions intermédiaires) : on prend la
   * plus récente qui contient whisper-bin-x64.zip.
   */
  /** Carte NVIDIA présente (pilote CUDA installé) : la version GPU de whisper.cpp est 10 à 20 fois plus rapide */
  function hasNvidia() {
    if (!win || !fs) return false;
    var sys = ((proc && proc.env && proc.env.SystemRoot) || 'C:\\Windows') + '\\System32\\nvcuda.dll';
    return exists(sys);
  }
  var GPU_ASSET = 'whisper-cublas-12.4.0-bin-x64.zip';
  function installWhisper(onProgress, gpu) {
    if (!win) return Promise.reject(new Error('macOS : installez whisper.cpp avec « brew install whisper-cpp »'));
    var asset = gpu ? GPU_ASSET : 'whisper-bin-x64.zip';
    var dir = ensureDir(pathMod.join(dataDir(), gpu ? 'whisper-gpu' : 'whisper')), zip = pathMod.join(dir, asset);
    return getJSON('https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=20').then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var a = (list[i].assets || []).filter(function (x) { return x.name === asset; })[0];
        if (a) return a.browser_download_url;
      }
      throw new Error('aucune version ' + (gpu ? 'GPU ' : '') + 'Windows de whisper.cpp trouvée sur GitHub');
    }).then(function (url) {
      return download(url, zip, onProgress);
    }).then(function () {
      return unzip(zip, dir).then(function () {
        try { fs.unlinkSync(zip); } catch (e) {}
        var exe = findIn(dir, ['whisper-cli.exe'], 3);
        if (!exe) throw new Error('archive de whisper.cpp illisible');
        return exe;
      });
    });
  }
  /** Windows : dézippe avec PowerShell (Expand-Archive) */
  function unzip(zip, dest) {
    return new Promise(function (resolve, reject) {
      ensureDir(dest);
      var ps = cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        'Expand-Archive -LiteralPath "' + zip + '" -DestinationPath "' + dest + '" -Force'], { windowsHide: true });
      ps.on('error', reject);
      ps.on('close', function (code) { if (code === 0) resolve(dest); else reject(new Error('archive illisible : ' + zip)); });
    });
  }

  // ==================== Audio 16 kHz mono ====================
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function wavFromFloat(samples, sr) {
    var n = samples.length, b = Buf.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
    b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (var i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
    return b;
  }
  var ctx16 = null;
  function toWav16k(file, ffmpeg) {
    var out = pathMod.join(os.tmpdir(), 'kiru-16k-' + hash(file) + '.wav');
    if (ffmpeg) {
      return new Promise(function (resolve, reject) {
        var err = '', ch = cp.spawn(ffmpeg, ['-y', '-v', 'error', '-nostdin', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out], { windowsHide: true });
        ch.stderr.on('data', function (b) { if (err.length < 400) err += b; });
        ch.on('error', reject);
        ch.on('close', function (code) { if (code === 0 && exists(out)) resolve(out); else reject(new Error('ffmpeg : ' + (err.trim().split('\n').pop() || 'code ' + code))); });
      });
    }
    return new Promise(function (resolve, reject) {
      if (fs.statSync(file).size > 1.2e9) return reject(new Error('fichier trop lourd sans ffmpeg'));
      var b = fs.readFileSync(file), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      ctx16 = ctx16 || new Ctx(1, 1, 16000);
      var p = ctx16.decodeAudioData(ab, function (buf) {
        var n = buf.length, mono = new Float32Array(n), c, i;
        for (c = 0; c < buf.numberOfChannels; c++) { var d = buf.getChannelData(c); for (i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
        try { fs.writeFileSync(out, wavFromFloat(mono, 16000)); resolve(out); } catch (e) { reject(e); }
      }, function () { reject(new Error('format non pris en charge sans ffmpeg')); });
      if (p && p.then) p.then(null, function () {});
    });
  }

  // ==================== Transcription ====================
  function cacheFile(key) { return pathMod.join(dataDir(), 'cache', 'tx-' + hash(key) + '.json'); }
  var memo = {};

  /**
   * Mots d'un fichier : [{ w, s, e }] en secondes du média source.
   * opts = { whisper, model, lang, prompt, ffmpeg, threads, onProgress(fraction, étape) }
   */
  function transcribe(file, opts) {
    var st;
    try { st = fs.statSync(file); } catch (e) { return Promise.reject(new Error('fichier introuvable : ' + file)); }
    // « dtw2 » : les transcriptions plus anciennes (temps imprécis, prises répétées oubliées) sont refaites
    var key = [file, st.size, st.mtimeMs, opts.model, opts.lang || 'auto', 'dtw4'].join('|'), cf = cacheFile(key);
    if (memo[key]) return Promise.resolve(memo[key]);
    try { var c = JSON.parse(fs.readFileSync(cf, 'utf8')); if (c && Array.isArray(c.words)) { c.file = cf; memo[key] = c; return Promise.resolve(c); } } catch (e2) {}
    var mp = modelPath(opts.model);
    if (!opts.whisper) return Promise.reject(new Error('whisper.cpp introuvable : installez-le dans Réglages > IA'));
    if (!exists(mp)) return Promise.reject(new Error('modèle « ' + opts.model + ' » absent : téléchargez-le dans Réglages > IA'));
    var progress = opts.onProgress || function () {};
    progress(0, 'conversion');
    var wav = null, env = null;
    return toWav16k(file, opts.ffmpeg).then(function (w) {
      wav = w;
      return runWhisper(opts, mp, wav, progress);
    }).then(function (words) {
      try { env = envelope(fs.readFileSync(wav)); } catch (e) { return words; }
      words = snapStarts(words, env);
      return secondPass(opts, mp, wav, words, env, progress).then(function (ws) { return smallGaps(opts, mp, wav, ws, env, progress); })
        .then(function (ws) { return trimEnds(ws, env); });
    }).then(function (words) {
      try { fs.unlinkSync(wav); } catch (e) {}
      var data = { file: cf, source: file, model: opts.model, lang: opts.lang || 'auto', words: words };
      ensureDir(pathMod.dirname(cf));
      if (!opts.noCache) try { fs.writeFileSync(cf, JSON.stringify({ source: file, model: data.model, lang: data.lang, words: words })); } catch (e3) {}
      if (!opts.noCache) memo[key] = data;
      return data;
    }, function (e) { if (wav) { try { fs.unlinkSync(wav); } catch (x) {} } throw e; });
  }

  // ==================== Contrôle par le son ====================
  var FR = 100; // trames d'énergie par seconde
  /** WAV 16 bits mono → énergie en dB toutes les 10 ms, avec le seuil de parole (bruit de fond + 18 dB) */
  function envelope(b) {
    var off = 12, data = -1, len = 0, sr = 16000;
    while (off + 8 <= b.length) {
      var id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
      if (id === 'fmt ') sr = b.readUInt32LE(off + 12);
      if (id === 'data') { data = off + 8; len = Math.min(sz, b.length - data); break; }
      off += 8 + sz + (sz & 1);
    }
    if (data < 0) throw new Error('wav');
    var hop = Math.round(sr / FR), n = Math.floor(len / 2 / hop), db = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0, p = data + i * hop * 2;
      for (var k = 0; k < hop; k++) { var v = b.readInt16LE(p + k * 2); s += v * v; }
      db[i] = 10 * Math.log(s / hop / 1073741824 + 1e-12) / Math.LN10;
    }
    var sorted = Array.prototype.slice.call(db).sort(function (x, y) { return x - y; });
    var thr = (sorted[Math.floor(n * 0.2)] || -90) + 18, voiced = new Uint8Array(n);
    for (var j = 0; j < n; j++) voiced[j] = db[j] > thr ? 1 : 0;
    return { voiced: voiced, n: n, sr: sr, data: data, buf: b };
  }
  function quietBefore(env, t, frames) { for (var k = Math.max(0, t - frames); k < t; k++) if (env.voiced[k]) return false; return true; }
  /**
   * Début des mots recalé sur le son : l'alignement de whisper tombe en moyenne 0,1 s après l'attaque.
   * Après un silence, le mot démarre à l'attaque mesurée ; sinon il est avancé de la moyenne.
   */
  function snapStarts(words, env) {
    var BIAS = 0.09;
    words.forEach(function (w, i) {
      var prev = words[i - 1], lo = prev ? prev.s + 0.02 : 0, s = w.s - BIAS;
      if (!prev || w.s - prev.e >= 0.25) {
        var c = Math.round(w.s * FR);
        for (var t = Math.max(1, c - 40); t <= Math.min(env.n - 1, c + 10); t++) {
          if (env.voiced[t] && quietBefore(env, t, 15)) { s = t / FR; break; }
        }
      }
      s = Math.max(lo, Math.min(s, w.s));
      w.s = Math.round(s * 1000) / 1000;
      if (w.e <= w.s) w.e = w.s + 0.05;
    });
    return clampEnds(words);
  }
  /**
   * Fin des mots recalée sur le son : dernière trame de voix du mot (+ 120 ms). Sans elle, la fin estimée
   * d'après la longueur du mot déborde dans le silence suivant (« populaires. » jusqu'à 0,9 s après la voix).
   */
  function trimEnds(words, env) {
    words.forEach(function (w) {
      var a = Math.round(w.s * FR), b = Math.min(env.n - 1, Math.round(w.e * FR)), last = -1;
      for (var t = b; t > a; t--) if (env.voiced[t]) { last = t; break; }
      // + 120 ms : la fin d'un mot qui s'éteint passe sous le seuil de voix
      if (last > 0 && last / FR + 0.12 > w.s + 0.1) w.e = Math.min(w.e, Math.round((last / FR + 0.12) * 1000) / 1000);
    });
    return words;
  }
  /** Un mot finit au plus tard quand le suivant commence */
  function clampEnds(words) {
    for (var i = 0; i + 1 < words.length; i++) if (words[i].e > words[i + 1].s) words[i].e = Math.max(words[i].s + 0.01, words[i + 1].s);
    return words;
  }
  /**
   * Passages où l'on parle sans mot transcrit : [[début, fin]] en secondes.
   * pad : marge autour des mots (s) ; minV / maxV : durée de voix du passage (s) ; sil : silence qui clôt un passage (s).
   */
  function uncovered(words, env, pad, minV, maxV, sil) {
    var cov = new Uint8Array(env.n), out = [];
    words.forEach(function (w) { for (var k = Math.max(0, Math.round((w.s - pad) * FR)); k < Math.min(env.n, Math.round((w.e + pad) * FR)); k++) cov[k] = 1; });
    for (var i = 0; i < env.n; i++) {
      if (!env.voiced[i] || cov[i]) continue;
      var j = i, v = 0, silent = 0;
      while (j < env.n && !cov[j] && silent < sil * FR) { if (env.voiced[j]) { v++; silent = 0; } else silent++; j++; }
      if (v >= minV * FR && v < maxV * FR) out.push([i / FR, (j - silent) / FR]);
      i = j;
    }
    return out;
  }
  /**
   * Réécoute des fenêtres [début, fin] (s) : mises bout à bout (séparées d'une seconde de silence) dans un seul
   * fichier, transcrites en une fois ; résout, pour chaque fenêtre, ses mots replacés à leur temps d'origine.
   */
  function relisten(opts, mp, wav, env, windows, tag) {
    var sr = env.sr, GAP = 1.0, parts = [], map = [], at = 0;
    windows.forEach(function (z) {
      var a = Math.max(0, z[0]), b = Math.min(env.n / FR, z[1]);
      parts.push(env.buf.slice(env.data + Math.round(a * sr) * 2, env.data + Math.round(b * sr) * 2), Buf.alloc(Math.round(GAP * sr) * 2));
      map.push({ at: at, len: b - a, src: a });
      at += b - a + GAP;
    });
    var pcm = Buf.concat(parts), hdr = Buf.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
    hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(sr, 24);
    hdr.writeUInt32LE(sr * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    var zw = wav.replace(/\.wav$/i, '') + '-' + tag + '.wav';
    try { fs.writeFileSync(zw, Buf.concat([hdr, pcm])); } catch (e) { return Promise.resolve(null); }
    return runWhisper(opts, mp, zw, function () {}).then(function (extra) {
      var per = map.map(function () { return []; });
      extra.forEach(function (w) {
        for (var i = 0; i < map.length; i++) {
          var m = map[i];
          if (w.s >= m.at - 0.05 && w.s < m.at + m.len) {
            var d = m.src - m.at;
            per[i].push({ w: w.w, s: Math.round((w.s + d) * 1000) / 1000, e: Math.round((Math.min(w.e, m.at + m.len) + d) * 1000) / 1000 });
            return;
          }
        }
      });
      return per;
    }, function () { return null; }).then(function (r) { try { fs.unlinkSync(zw); } catch (e) {} return r; });
  }
  function merge(words, add, env) {
    var all = words.concat(snapStarts(add, env)).sort(function (x, y) { return x.s - y.s; });
    for (var k = 1; k < all.length; k++) if (all[k].s <= all[k - 1].s) all[k].s = all[k - 1].s + 0.01;
    return clampEnds(all);
  }
  // phrases que whisper invente sur du bruit (génériques de sous-titrage vus à l'entraînement)
  var HALLU = /sous-titr|amara\.org|merci d'avoir regard|abonnez-vous|thanks for watching/i;
  var HALLU_SEQ = [['sous-titrage', "st'", '501'], ["st'", '501'], ['sous-titres', 'réalisés', 'par', 'la', 'communauté', "d'amara.org"]];
  function dropHallucinations(ws) {
    var norm = ws.map(function (x) { return x.w.toLowerCase().replace(/[.,!?;:…]+$/g, ''); }), skip = {};
    for (var i = 0; i < ws.length; i++) {
      HALLU_SEQ.forEach(function (p) {
        for (var k = 0; k < p.length; k++) if (norm[i + k] !== p[k]) return;
        for (k = 0; k < p.length; k++) skip[i + k] = true;
      });
    }
    return ws.filter(function (x, i) { return !skip[i]; });
  }
  /**
   * Second passage : whisper saute souvent les prises répétées. Les passages de voix restés sans mot sont mis
   * bout à bout (séparés de silences) dans un seul fichier, retranscrits, puis replacés à leur temps d'origine.
   */
  function secondPass(opts, mp, wav, words, env, progress) {
    var zones = uncovered(words, env, 0.25, 0.5, Infinity, 0.3);
    if (!zones.length) return Promise.resolve(words);
    progress(1, 'vérification');
    return relisten(opts, mp, wav, env, zones.map(function (z) { return [z[0] - 0.4, z[1] + 0.4]; }), 'oublis').then(function (per) {
      if (!per) return words;
      var add = [];
      per.forEach(function (ws) { ws.forEach(function (w) { if (!HALLU.test(w.w)) add.push(w); }); });
      return merge(words, add, env);
    });
  }

  /**
   * Troisième passage : mots isolés oubliés (souvent le premier d'une phrase, « Que | tu sois au lycée »).
   * Un court passage de voix sans mot est réécouté avec la suite de la phrase ; un mot n'est ajouté que si
   * la réécoute retrouve aussi au moins deux mots déjà transcrits autour (sinon : bruit, rire, invention).
   */
  function smallGaps(opts, mp, wav, words, env, progress) {
    var zones = uncovered(words, env, 0.08, 0.2, 0.5, 0.2);
    if (!zones.length) return Promise.resolve(words);
    progress(1, 'vérification');
    var wins = zones.map(function (z) { return [z[0] - 0.6, z[1] + 1.6]; });
    return relisten(opts, mp, wav, env, wins, 'mots').then(function (per) {
      if (!per) return words;
      var add = [];
      per.forEach(function (nw, k) {
        var z = zones[k], w0 = wins[k][0], w1 = wins[k][1];
        var old = words.filter(function (w) { return w.e > w0 && w.s < w1; });
        var a = old.map(function (w) { return normWord(w.w); }), b = nw.map(function (w) { return normWord(w.w); });
        // plus longue sous-suite commune : les mots de la réécoute qui n'y sont pas sont des candidats
        var L = [], i, j;
        for (i = 0; i <= a.length; i++) { L[i] = []; for (j = 0; j <= b.length; j++) L[i][j] = !i || !j ? 0 : a[i - 1] === b[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]); }
        if (L[a.length][b.length] < 2) return;
        var matched = {};
        for (i = a.length, j = b.length; i && j;) {
          if (a[i - 1] === b[j - 1]) { matched[j - 1] = true; i--; j--; } else if (L[i - 1][j] >= L[i][j - 1]) i--; else j--;
        }
        // groupes de mots non retrouvés : trois au plus (« Que tu sois » répété), collés à un mot retrouvé,
        // et au moins 0,1 s de parole par mot (sinon whisper a « entendu » des mots dans un bruit bref)
        for (var n = 0; n < nw.length;) {
          if (matched[n]) { n++; continue; }
          var m = n;
          while (m < nw.length && !matched[m]) m++;
          var span = (m < nw.length ? nw[m].s : nw[m - 1].e) - nw[n].s;
          if (m - n <= 3 && (matched[n - 1] || matched[m]) && span / (m - n) >= 0.1) {
            for (var q = n; q < m; q++) {
              var w = nw[q], key = b[q];
              if (!key || HALLU.test(w.w)) continue;
              // seulement dans le passage de voix muet (± 0,15 s), là où il manquait vraiment quelque chose
              if (w.s < z[0] - 0.15 || w.s > z[1] + 0.15) continue;
              // pas de doublon : le même mot n'existe pas déjà juste à côté
              var dup = words.concat(add).some(function (x) { return Math.abs(x.s - w.s) < 0.6 && normWord(x.w) === key; });
              if (!dup) add.push(w);
            }
          }
          n = m;
        }
      });
      return add.length ? merge(words, add, env) : words;
    });
  }

  /** Préréglage d'alignement DTW de whisper.cpp pour chaque modèle (temps des mots fiables) */
  function dtwPreset(modelFile) {
    var id = pathMod.basename(modelFile).replace(/^ggml-|\.bin$/g, '').replace(/-q\d.*$/, '');
    return { 'large-v3-turbo': 'large.v3.turbo', 'large-v3': 'large.v3', small: 'small', base: 'base', medium: 'medium' }[id] || '';
  }
  function runWhisper(opts, model, wav, progress) {
    var dtw = dtwPreset(model);
    return runWhisperArgs(opts, model, wav, progress, dtw).catch(function (e) {
      // ancienne version de whisper.cpp sans DTW : horodatage classique
      if (!dtw) throw e;
      return runWhisperArgs(opts, model, wav, progress, '');
    });
  }
  function runWhisperArgs(opts, model, wav, progress, dtw) {
    return new Promise(function (resolve, reject) {
      var base = wav.replace(/\.wav$/i, ''), err = '';
      var args = ['-m', model, '-f', wav, '-l', opts.lang || 'auto', '-ojf', '-of', base, '-pp',
        '-t', String(opts.threads || Math.max(2, Math.min(8, (os.cpus() || []).length - 1)))];
      // DTW : chaque jeton est recalé sur l'audio (l'attention « flash » le désactive, d'où -nfa)
      if (dtw) args.push('--dtw', dtw, '-nfa');
      // sans mémoire du texte précédent : sinon whisper saute les phrases répétées (prises successives)
      args.push('-mc', '0');
      if (opts.prompt) args.push('--prompt', opts.prompt);
      var ch;
      try { ch = cp.spawn(opts.whisper, args, { windowsHide: true, cwd: pathMod.dirname(opts.whisper) }); } catch (e) { return reject(e); }
      var onOut = function (b) {
        var s = String(b), m = s.match(/progress\s*=\s*(\d+)\s*%/g);
        if (m) progress(Number(m[m.length - 1].replace(/\D/g, '')) / 100, 'transcription');
        if (err.length < 2000) err += s;
      };
      ch.stdout.on('data', onOut); ch.stderr.on('data', onOut);
      ch.on('error', reject);
      ch.on('close', function (code) {
        var jf = base + '.json', data = null;
        try { data = JSON.parse(fs.readFileSync(jf, 'utf8')); fs.unlinkSync(jf); } catch (e) {}
        if (!data) {
          var last = err.trim().split('\n').filter(function (l) { return /error|failed|invalid/i.test(l); }).pop();
          return reject(new Error('whisper.cpp : ' + (last || 'échec (code ' + code + ')')));
        }
        resolve(parseWords(data.transcription || []));
      });
    });
  }

  /**
   * Jetons → mots. Un mot commence au jeton précédé d'une espace ; son début est le temps DTW du jeton
   * (sinon celui de whisper), sa fin le début du mot suivant, bornée selon sa longueur pour ne pas avaler les silences.
   * Ponctuation isolée recollée au mot précédent, bruits [Musique] retirés.
   */
  function parseWords(segs) {
    var raw = [];
    segs.forEach(function (sg, si) {
      var cur = null;
      (sg.tokens || []).forEach(function (tk) {
        var t = String(tk.text || '');
        if (!t || /^\[_|^<\|/.test(t)) return;
        var o = tk.offsets || {}, at = tk.t_dtw >= 0 ? tk.t_dtw / 100 : (o.from || 0) / 1000;
        if (!cur || /^\s/.test(t)) { cur = { w: '', s: at, seg: si }; raw.push(cur); }
        cur.w += t;
      });
    });
    var out = [];
    raw.forEach(function (x) {
      var t = x.w.replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (/^[.,!?;:…»”"')\]-]+$/.test(t) && out.length) { out[out.length - 1].w += t; return; }
      var prev = out[out.length - 1];
      if (prev && x.s <= prev.s) x.s = prev.s + 0.01;
      out.push({ w: t, s: x.s, seg: x.seg });
    });
    out = dropHallucinations(out.filter(function (x) { return !/^[\[(].*[\])]$/.test(x.w); }));
    return out.map(function (x, i) {
      // durée plausible d'après la longueur du mot (le temps DTW de la ponctuation finale tombe souvent tard)
      var letters = x.w.replace(/[^\p{L}\p{N}]/gu, '').length, next = out[i + 1];
      // premier mot d'un segment parfois aligné bien trop tôt : recollé au mot suivant de la même phrase
      var first = !i || out[i - 1].seg !== x.seg;
      if (first && next && next.seg === x.seg && next.s - x.s > 1.2) x.s = next.s - Math.min(0.6, Math.max(0.15, 0.075 * letters));
      var e = Math.min(next ? next.s : Infinity, x.s + Math.min(1.4, Math.max(0.25, 0.15 + 0.075 * letters)));
      if (e <= x.s) e = x.s + 0.05;
      return { w: x.w, s: Math.round(x.s * 1000) / 1000, e: Math.round(e * 1000) / 1000 };
    });
  }

  /** Correction d'un mot : enregistrée dans le cache, donc conservée après une coupe */
  function saveEdit(data, index, text) {
    if (!data || !data.words[index]) return;
    data.words[index].w = text;
    try { fs.writeFileSync(data.file, JSON.stringify({ source: data.source, model: data.model, lang: data.lang, words: data.words })); } catch (e) {}
  }
  function clearCache() {
    memo = {};
    var d = pathMod.join(dataDir(), 'cache');
    try { fs.readdirSync(d).forEach(function (f) { if (/^tx-.*\.json$/.test(f)) fs.unlinkSync(pathMod.join(d, f)); }); } catch (e) {}
  }

  function normWord(w) { return String(w).toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, '').trim(); }

  window.KiruText = {
    available: !!(fs && cp), MODELS: MODELS, FILLERS: FILLERS,
    dataDir: dataDir, modelPath: modelPath, installedModels: installedModels,
    findWhisper: findWhisper, installWhisper: installWhisper, downloadModel: downloadModel, hasNvidia: hasNvidia,
    download: download, getJSON: getJSON, unzip: unzip,
    isGpu: function (p) { return /whisper-gpu/i.test(String(p || '')); },
    transcribe: transcribe, saveEdit: saveEdit, clearCache: clearCache, parseWords: parseWords, normWord: normWord
  };
})();
