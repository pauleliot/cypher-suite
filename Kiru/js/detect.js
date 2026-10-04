/**
 * Kiru — lecture de l'audio et détection des silences.
 *
 * Enveloppe : niveau RMS en dBFS par fenêtres de 10 ms (100 valeurs / s), canaux mélangés.
 * Sources, de la plus rapide à la plus universelle :
 *   1. WAV lu en flux par Node (n'importe quelle taille, sans tout charger en mémoire) ;
 *   2. décodage Web Audio (MP3, AAC / M4A / MP4, OGG, FLAC… selon le moteur de CEP) ;
 *   3. ffmpeg s'il est installé (tous formats, en flux) ;
 *   4. secours géré par app.js : export WAV des pistes analysées par Premiere.
 *
 * Détection : passages sous le seuil d'au moins « silence min », îlots sonores trop courts absorbés
 * (clics, souffles), puis marges conservées avant / après la parole.
 */
(function () {
  'use strict';

  var RATE = 100;               // valeurs d'enveloppe par seconde
  var FLOOR = -100;             // dBFS d'un silence numérique
  var WEB_AUDIO_MAX = 1.2e9;    // au-delà, le décodage Web Audio charge trop de mémoire

  function req(name) {
    var n = window.cep_node, r = (n && typeof n.require === 'function' && n.require) || window.__kiruRequire;
    try { return r ? r(name) : null; } catch (e) { return null; }
  }
  var fs = req('fs'), pathMod = req('path'), cp = req('child_process');
  var proc = (window.cep_node && window.cep_node.process) || (typeof process !== 'undefined' ? process : null);
  var Buf = (window.cep_node && window.cep_node.Buffer) || (typeof Buffer !== 'undefined' ? Buffer : null);

  function db(ms) { return ms > 1e-10 ? Math.max(FLOOR, 10 * Math.log(ms) / Math.LN10) : FLOOR; }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // ==================== WAV en flux ====================
  function readHeader(fd, size) {
    var buf = Buf.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    var riff = buf.toString('ascii', 0, 4);
    if ((riff !== 'RIFF' && riff !== 'RF64') || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
    var pos = 12, fmt = null, data = null, ds64 = 0, h = Buf.alloc(8);
    while (pos + 8 <= size && !(fmt && data)) {
      fs.readSync(fd, h, 0, 8, pos);
      var id = h.toString('ascii', 0, 4), len = h.readUInt32LE(4);
      if (id === 'ds64') {
        var d = Buf.alloc(16); fs.readSync(fd, d, 0, 16, pos + 8);
        ds64 = d.readUInt32LE(8) + d.readUInt32LE(12) * 4294967296;
      } else if (id === 'fmt ') {
        var f = Buf.alloc(Math.min(len, 40)); fs.readSync(fd, f, 0, f.length, pos + 8);
        fmt = { tag: f.readUInt16LE(0), ch: f.readUInt16LE(2), sr: f.readUInt32LE(4), align: f.readUInt16LE(12), bits: f.readUInt16LE(14) };
        if (fmt.tag === 0xfffe && f.length >= 26) fmt.tag = f.readUInt16LE(24);
      } else if (id === 'data') {
        if (len === 0xffffffff && ds64) len = ds64;
        data = { offset: pos + 8, length: Math.min(len, size - pos - 8) };
      }
      pos += 8 + len + (len & 1);
    }
    if (!fmt || !data || !fmt.ch || !fmt.sr) return null;
    if (!((fmt.tag === 1 && (fmt.bits === 16 || fmt.bits === 24 || fmt.bits === 32 || fmt.bits === 8)) || (fmt.tag === 3 && fmt.bits === 32))) return null;
    return { fmt: fmt, data: data };
  }

  /** Enveloppe d'un WAV lue par blocs de 4 Mo, sans bloquer l'interface */
  function envelopeFromWav(file, onProgress) {
    if (!fs) return Promise.reject(new Error('Node.js indisponible'));
    var fd, size;
    try { fd = fs.openSync(file, 'r'); size = fs.fstatSync(fd).size; } catch (e) { return Promise.reject(e); }
    var h = readHeader(fd, size);
    if (!h) { fs.closeSync(fd); return Promise.reject(new Error('WAV non PCM')); }
    var fmt = h.fmt, bps = fmt.bits >> 3, frameBytes = fmt.align || bps * fmt.ch;
    var hop = fmt.sr / RATE, total = Math.floor(h.data.length / frameBytes);
    var env = new Float32Array(Math.ceil(total / hop) + 1);
    var chunkFrames = Math.max(1, Math.floor(4194304 / frameBytes)), buf = Buf.alloc(chunkFrames * frameBytes);
    var frame = 0, acc = 0, cnt = 0, idx = 0, nextEdge = hop;
    var scale = fmt.tag === 3 ? 1 : 1 / Math.pow(2, fmt.bits - 1), inv = 1 / fmt.ch;
    function step() {
      var n = Math.min(chunkFrames, total - frame);
      if (n <= 0) {
        if (cnt) env[idx++] = db(acc / cnt);
        fs.closeSync(fd);
        return Promise.resolve({ env: env.subarray(0, idx), rate: RATE, duration: total / fmt.sr });
      }
      fs.readSync(fd, buf, 0, n * frameBytes, h.data.offset + frame * frameBytes);
      for (var i = 0; i < n; i++) {
        var o = i * frameBytes, s = 0;
        for (var c = 0; c < fmt.ch; c++) {
          var p = o + c * bps, v;
          if (fmt.tag === 3) v = buf.readFloatLE(p);
          else if (bps === 2) v = buf.readInt16LE(p);
          else if (bps === 3) v = buf.readIntLE(p, 3);
          else if (bps === 4) v = buf.readInt32LE(p);
          else v = buf[p] - 128;
          s += v * scale;
        }
        s *= inv; acc += s * s; cnt++;
        if (frame + i + 1 >= nextEdge) { env[idx++] = db(acc / cnt); acc = 0; cnt = 0; nextEdge += hop; }
      }
      frame += n;
      if (onProgress) onProgress(frame / total);
      return tick().then(step);
    }
    return step().catch(function (e) { try { fs.closeSync(fd); } catch (e2) {} throw e; });
  }

  // ==================== Web Audio ====================
  var ctx = null;
  function envelopeFromBuffer(buffer) {
    var n = buffer.length, ch = buffer.numberOfChannels, hop = buffer.sampleRate / RATE;
    var datas = []; for (var c = 0; c < ch; c++) datas.push(buffer.getChannelData(c));
    var env = new Float32Array(Math.ceil(n / hop) + 1), idx = 0, acc = 0, cnt = 0, edge = hop;
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (c = 0; c < ch; c++) s += datas[c][i];
      s /= ch; acc += s * s; cnt++;
      if (i + 1 >= edge) { env[idx++] = db(acc / cnt); acc = 0; cnt = 0; edge += hop; }
    }
    if (cnt) env[idx++] = db(acc / cnt);
    return { env: env.subarray(0, idx), rate: RATE, duration: buffer.duration };
  }
  function envelopeFromWebAudio(file) {
    return new Promise(function (resolve, reject) {
      if (!fs) return reject(new Error('Node.js indisponible'));
      var size = fs.statSync(file).size;
      if (size > WEB_AUDIO_MAX) return reject(new Error('fichier trop lourd pour le décodage intégré'));
      var b = fs.readFileSync(file), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      // 16 kHz mono : la parole est entière, le décodage prend 3 fois moins de mémoire
      ctx = ctx || new Ctx(1, 1, 16000);
      var done = function (buf) { resolve(envelopeFromBuffer(buf)); };
      var p = ctx.decodeAudioData(ab, done, function () { reject(new Error('format non pris en charge par le décodeur intégré')); });
      if (p && p.then) p.then(null, function () {});
    });
  }

  // ==================== ffmpeg ====================
  function exists(p) { try { return !!p && fs.statSync(p).isFile(); } catch (e) { return false; } }
  function findFfmpeg(custom) {
    if (!fs || !pathMod || !proc) return '';
    if (custom && exists(custom)) return custom;
    var win = proc.platform === 'win32', exe = win ? 'ffmpeg.exe' : 'ffmpeg';
    var dirs = String((proc.env && (proc.env.PATH || proc.env.Path)) || '').split(win ? ';' : ':');
    dirs = dirs.concat(win
      ? ['C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin', pathMod.join(proc.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links'), 'C:\\ProgramData\\chocolatey\\bin', pathMod.join(proc.env.USERPROFILE || '', 'scoop', 'shims')]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/opt/local/bin']);
    for (var i = 0; i < dirs.length; i++) {
      var p = dirs[i] && pathMod.join(dirs[i].replace(/^"|"$/g, ''), exe);
      if (p && exists(p)) return p;
    }
    return '';
  }
  /** Audio décodé par ffmpeg en flux : mono 8 kHz 16 bits, aucune limite de taille */
  function envelopeFromFfmpeg(ffmpeg, file) {
    return new Promise(function (resolve, reject) {
      if (!cp) return reject(new Error('Node.js indisponible'));
      var SR = 8000, hop = SR / RATE, acc = 0, cnt = 0, rest = null, err = '';
      var env = [], child;
      try { child = cp.spawn(ffmpeg, ['-v', 'error', '-nostdin', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le', 'pipe:1'], { windowsHide: true }); }
      catch (e) { return reject(e); }
      child.stdout.on('data', function (b) {
        if (rest) { b = Buf.concat([rest, b]); rest = null; }
        var n = b.length >> 1;
        for (var i = 0; i < n; i++) {
          var v = b.readInt16LE(i * 2) / 32768;
          acc += v * v;
          if (++cnt >= hop) { env.push(db(acc / cnt)); acc = 0; cnt = 0; }
        }
        if (b.length & 1) rest = b.slice(b.length - 1);
      });
      child.stderr.on('data', function (b) { if (err.length < 400) err += b.toString(); });
      child.on('error', reject);
      child.on('close', function (code) {
        if (cnt) env.push(db(acc / cnt));
        if (code !== 0 && !env.length) return reject(new Error('ffmpeg : ' + (err.trim().split('\n').pop() || 'code ' + code)));
        resolve({ env: Float32Array.from(env), rate: RATE, duration: env.length / RATE });
      });
    });
  }

  /**
   * Enveloppe d'un fichier média, avec cache (chemin + taille + date) : relancer l'analyse après un
   * changement de réglage est instantané.
   */
  var cache = {};
  function envelopeOf(file, opts) {
    opts = opts || {};
    var st;
    try { st = fs.statSync(file); } catch (e) { return Promise.reject(new Error('fichier introuvable : ' + file)); }
    var key = file + '|' + st.size + '|' + st.mtimeMs;
    if (cache[key]) return Promise.resolve(cache[key]);
    var ff = findFfmpeg(opts.ffmpeg);
    var attempts = [];
    if (/\.(wav|wave|bwf)$/i.test(file)) attempts.push(function () { return envelopeFromWav(file, opts.onProgress); });
    if (!opts.preferFfmpeg || !ff) attempts.push(function () { return envelopeFromWebAudio(file); });
    if (ff) attempts.push(function () { return envelopeFromFfmpeg(ff, file); });
    var errors = [];
    var next = function (i) {
      if (i >= attempts.length) return Promise.reject(new Error(errors.join(' ; ') || 'aucun décodeur'));
      return attempts[i]().catch(function (e) { errors.push(e.message || String(e)); return next(i + 1); });
    };
    return next(0).then(function (r) { cache[key] = r; return r; });
  }
  function clearCache() { cache = {}; }

  // ==================== Détection ====================
  function percentile(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : FLOOR; }

  /** Seuil automatique : entre le bruit de fond (15e centile) et le niveau de la voix (90e centile) */
  function autoThreshold(env, from, to) {
    var vals = [];
    for (var i = from; i < to; i++) if (env[i] > FLOOR + 1) vals.push(env[i]);
    if (vals.length < 20) return -45;
    vals.sort(function (a, b) { return a - b; });
    var noise = percentile(vals, 0.15), voice = percentile(vals, 0.9);
    if (voice - noise < 6) return Math.round(Math.max(-70, Math.min(-15, noise - 6)));
    return Math.round(Math.max(-70, Math.min(-15, noise + (voice - noise) * 0.35)));
  }

  /**
   * Silences à couper, en secondes : [[début, fin], …]
   * p = { threshold, minSilence, minKeep, padBefore, padAfter, from, to } (secondes et dBFS)
   */
  function detect(env, rate, p) {
    var from = Math.max(0, Math.floor(p.from * rate)), to = Math.min(env.length, Math.ceil(p.to * rate));
    var runs = [], i = from, thr = p.threshold;
    while (i < to) {
      if (env[i] >= thr) { i++; continue; }
      var j = i;
      while (j < to && env[j] < thr) j++;
      runs.push([i, j]);
      i = j;
    }
    var minSil = p.minSilence * rate, minKeep = p.minKeep * rate;
    // îlots sonores trop courts entre deux vrais silences : absorbés (clic, souffle, bruit de bouche)
    var merged = [];
    runs.forEach(function (r) {
      if (r[1] - r[0] < minSil) return;
      var last = merged[merged.length - 1];
      if (last && r[0] - last[1] < minKeep) last[1] = r[1]; else merged.push([r[0], r[1]]);
    });
    var out = [];
    merged.forEach(function (r) {
      var a = r[0] / rate, b = r[1] / rate;
      // marges : un peu d'air après la fin de la phrase et avant la reprise (sauf aux bords de la zone)
      if (r[0] > from) a += p.padAfter;
      if (r[1] < to) b -= p.padBefore;
      if (b - a >= 0.04) out.push([a, b]);
    });
    return out;
  }

  window.KiruDetect = {
    RATE: RATE, FLOOR: FLOOR,
    envelopeOf: envelopeOf, envelopeFromWav: envelopeFromWav, envelopeFromFfmpeg: envelopeFromFfmpeg, clearCache: clearCache,
    findFfmpeg: findFfmpeg, autoThreshold: autoThreshold, detect: detect
  };
})();
