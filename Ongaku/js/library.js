/**
 * Ongaku — accès disque (Node.js CEP) : scan des dossiers, lecture des tags ID3, cache d'analyse.
 */
(function () {
  'use strict';

  var nodeRequire = (window.cep_node && window.cep_node.require) || window.__ongakuRequire || null;
  var fs = nodeRequire ? nodeRequire('fs') : null;
  var pathMod = nodeRequire ? nodeRequire('path') : null;
  var os = nodeRequire ? nodeRequire('os') : null;
  var childProcess = nodeRequire ? nodeRequire('child_process') : null;
  var NodeBuffer = (window.cep_node && window.cep_node.Buffer) || (nodeRequire ? nodeRequire('buffer').Buffer : null);
  var nodeProcess = (window.cep_node && window.cep_node.process) || null;
  var platform = nodeProcess ? nodeProcess.platform : (navigator.platform.indexOf('Mac') === 0 ? 'darwin' : 'win32');

  var AUDIO_EXT = { '.mp3': 1, '.wav': 1, '.aif': 1, '.aiff': 1, '.m4a': 1, '.aac': 1, '.flac': 1, '.ogg': 1 };

  function hasNode() { return !!fs; }

  function dataDir() {
    if (!os) return null;
    var home = os.homedir();
    var dir = platform === 'win32'
      ? pathMod.join((nodeProcess && nodeProcess.env.APPDATA) || pathMod.join(home, 'AppData', 'Roaming'), 'Ongaku')
      : pathMod.join(home, 'Library', 'Application Support', 'Ongaku');
    ensureDir(dir);
    return dir;
  }

  function defaultRenderDir() {
    if (!os) return '';
    return pathMod.join(os.homedir(), 'Documents', 'Ongaku', 'Rendus');
  }

  function ensureDir(dir) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }

  /** file:/// URL lisible par <audio> (chaque segment encodé : #, ?, espaces, accents) */
  function fileUrl(p) {
    var parts = String(p).replace(/\\/g, '/').split('/');
    var enc = parts.map(function (s, i) { return i === 0 && /^[a-zA-Z]:$/.test(s) ? s : encodeURIComponent(s); }).join('/');
    return 'file:///' + enc.replace(/^\/+/, '');
  }

  function basename(p) { return pathMod ? pathMod.basename(p) : String(p).split(/[\\/]/).pop(); }
  function extname(p) { var m = /\.[^.\\/]+$/.exec(p); return m ? m[0].toLowerCase() : ''; }
  function stripExt(name) { return name.replace(/\.[^.]+$/, ''); }

  /** Scan récursif asynchrone d'un dossier, en évitant de bloquer l'UI */
  function scanFolder(root, onFound) {
    return new Promise(function (resolve) {
      var pending = 0, found = [];
      function walk(dir, depth) {
        if (depth > 12) return;
        pending++;
        fs.readdir(dir, { withFileTypes: true }, function (err, entries) {
          if (!err) {
            entries.forEach(function (ent) {
              if (ent.name.charAt(0) === '.') return;
              var full = pathMod.join(dir, ent.name);
              if (ent.isDirectory()) walk(full, depth + 1);
              else if (AUDIO_EXT[extname(ent.name)]) {
                pending++;
                fs.stat(full, function (e2, st) {
                  if (!e2) {
                    var f = { path: full, folder: root, name: ent.name, size: st.size, mtime: st.mtimeMs, added: st.birthtimeMs || st.mtimeMs };
                    found.push(f);
                    if (onFound) onFound(f);
                  }
                  if (--pending === 0) resolve(found);
                });
              }
            });
          }
          if (--pending === 0) resolve(found);
        });
      }
      walk(root, 0);
    });
  }

  function readFileAsArrayBuffer(p) {
    return new Promise(function (resolve, reject) {
      fs.readFile(p, function (err, buf) {
        if (err) return reject(err);
        // Copie dans un ArrayBuffer du contexte de la page (Node tourne dans un contexte séparé)
        var u8 = new Uint8Array(buf.length);
        u8.set(buf);
        resolve(u8.buffer);
      });
    });
  }

  function readHead(p, bytes) {
    return new Promise(function (resolve) {
      fs.open(p, 'r', function (err, fd) {
        if (err) return resolve(null);
        var b = NodeBuffer.alloc(bytes);
        fs.read(fd, b, 0, bytes, 0, function (e2, n) {
          fs.close(fd, function () {});
          if (e2) return resolve(null);
          var u8 = new Uint8Array(n);
          u8.set(b.subarray(0, n));
          resolve(u8);
        });
      });
    });
  }

  function writeFile(p, u8) {
    return new Promise(function (resolve, reject) {
      ensureDir(pathMod.dirname(p));
      fs.writeFile(p, NodeBuffer.from(u8.buffer, u8.byteOffset, u8.byteLength), function (err) {
        if (err) reject(err); else resolve(p);
      });
    });
  }

  function dirname(p) { return pathMod ? pathMod.dirname(p) : String(p).replace(/[\\/][^\\/]*$/, ''); }

  /** Sous-dossiers directs d'un dossier (noms) */
  function listDirs(root) {
    try {
      return fs.readdirSync(root, { withFileTypes: true }).filter(function (e) { return e.isDirectory(); }).map(function (e) { return e.name; });
    } catch (e) { return []; }
  }

  function removeFile(p) { try { fs.unlinkSync(p); } catch (e) {} }
  function fileSize(p) { try { return fs.statSync(p).size; } catch (e) { return -1; } }
  function copyFileSync(src, dst) { ensureDir(pathMod.dirname(dst)); fs.copyFileSync(src, dst); return dst; }

  /**
   * Format réel d'un fichier audio : fréquence, résolution, canaux.
   * WAV (fmt), AIFF (COMM) et MP3 (1re trame après le tag ID3). null si inconnu.
   */
  var MP3_SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  function audioInfo(p) {
    return readHead(p, 10).then(function (h) {
      if (!h) return null;
      var skip = 0;
      if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) skip = synchsafe(h, 6) + 10 + (h[5] & 0x10 ? 10 : 0);
      return readHead(p, skip + 65536).then(function (b) {
        if (!b) return null;
        var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        var tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
        var i;
        if (tag === 'RIFF') {
          for (i = 12; i + 8 < b.length;) {
            var id = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]), len = dv.getUint32(i + 4, true);
            if (id === 'fmt ') return { format: 'wav', channels: dv.getUint16(i + 10, true), sampleRate: dv.getUint32(i + 12, true), bits: dv.getUint16(i + 22, true) };
            i += 8 + len + (len & 1);
          }
          return null;
        }
        if (tag === 'FORM') {
          for (i = 12; i + 8 < b.length;) {
            var cid = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]), clen = dv.getUint32(i + 4);
            if (cid === 'COMM') {
              var exp = dv.getUint16(i + 16) & 0x7fff, hi = dv.getUint32(i + 18), lo = dv.getUint32(i + 22);
              return { format: 'aiff', channels: dv.getUint16(i + 8), bits: dv.getUint16(i + 14), sampleRate: Math.round((hi * 4294967296 + lo) * Math.pow(2, exp - 16383 - 63)) };
            }
            i += 8 + clen + (clen & 1);
          }
          return null;
        }
        // MP3 : recherche d'une trame valide (synchro 11 bits)
        for (i = skip; i + 4 < b.length; i++) {
          if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
          var ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3;
          if (ver === 1 || layer === 0 || bri === 0 || bri === 15 || sri === 3) continue;
          return { format: 'mp3', sampleRate: MP3_SR[ver][sri], bits: 16, channels: (b[i + 3] >> 6) === 3 ? 1 : 2 };
        }
        return null;
      });
    }).catch(function () { return null; });
  }

  function exists(p) { try { return fs.existsSync(p); } catch (e) { return false; } }

  function reveal(p) {
    if (!childProcess) return;
    if (platform === 'win32') childProcess.exec('explorer.exe /select,"' + p + '"');
    else childProcess.exec('open -R "' + p.replace(/"/g, '\\"') + '"');
  }

  // ---------- Tags ID3v2 (titre, artiste, pochette) ----------

  function decodeText(bytes, enc) {
    try {
      var label = enc === 0 ? 'latin1' : enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : 'utf-8';
      return new TextDecoder(label).decode(bytes).replace(/\u0000+$/g, '').replace(/\u0000/g, ' / ').trim();
    } catch (e) { return ''; }
  }

  function synchsafe(b, o) { return (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3]; }

  function parseId3(p) {
    return readHead(p, 10).then(function (h) {
      if (!h || h.length < 10 || h[0] !== 0x49 || h[1] !== 0x44 || h[2] !== 0x33) return null;
      var ver = h[3];
      var size = synchsafe(h, 6) + 10;
      if (size > 8 * 1024 * 1024) size = 8 * 1024 * 1024;
      return readHead(p, size).then(function (b) {
        if (!b) return null;
        var out = {};
        var o = 10;
        if (h[5] & 0x40) o += ver === 4 ? synchsafe(b, 10) : ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4;
        var idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
        while (o + hdr < b.length) {
          var id = String.fromCharCode.apply(null, b.subarray(o, o + idLen));
          if (!/^[A-Z0-9]+$/.test(id)) break;
          var fsz = ver === 2 ? (b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5]
            : ver === 4 ? synchsafe(b, o + 4) : ((b[o + 4] << 24) | (b[o + 5] << 16) | (b[o + 6] << 8) | b[o + 7]) >>> 0;
          var d = b.subarray(o + hdr, o + hdr + fsz);
          if (id === 'TIT2' || id === 'TT2') out.title = decodeText(d.subarray(1), d[0]);
          else if (id === 'TPE1' || id === 'TP1') out.artist = decodeText(d.subarray(1), d[0]);
          else if (id === 'TBPM' || id === 'TBP') out.tagBpm = parseFloat(decodeText(d.subarray(1), d[0])) || null;
          else if (id === 'TCON' || id === 'TCO') out.genre = decodeText(d.subarray(1), d[0]).replace(/^\(\d+\)/, '');
          else if ((id === 'APIC' || id === 'PIC') && !out.cover) {
            var enc = d[0], i = 1, mime;
            if (id === 'PIC') { mime = 'image/' + String.fromCharCode(d[1], d[2], d[3]).toLowerCase(); i = 4; }
            else { var mEnd = d.indexOf(0, 1); mime = String.fromCharCode.apply(null, d.subarray(1, mEnd)); i = mEnd + 1; }
            i++; // type d'image
            // description terminée par 0 (ou 00 00 en UTF-16)
            if (enc === 1 || enc === 2) { while (i + 1 < d.length && !(d[i] === 0 && d[i + 1] === 0)) i += 2; i += 2; }
            else { while (i < d.length && d[i] !== 0) i++; i++; }
            if (!mime || mime.indexOf('/') < 0) mime = 'image/jpeg';
            out.coverBlob = new Blob([d.slice(i)], { type: mime });
          }
          o += hdr + fsz;
        }
        return out;
      });
    }).catch(function () { return null; });
  }

  /** Pochette réduite en vignette (data URL) pour le cache */
  function blobToThumb(blob, size) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = c.height = size;
        var ctx = c.getContext('2d');
        var s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        try { resolve(c.toDataURL('image/jpeg', 0.82)); } catch (e) { resolve(null); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  /** « Artiste - Titre.mp3 » → { artist, title } */
  function guessFromName(name) {
    var base = stripExt(name).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    var m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
    if (m) return { artist: m[1].trim(), title: m[2].trim() };
    return { artist: '', title: base };
  }

  // ---------- Cache persistant (tags + analyse) ----------

  var cache = {};
  var cacheFile = null;
  var saveTimer = null;

  function loadCache() {
    if (!hasNode()) return;
    var dir = dataDir();
    cacheFile = pathMod.join(dir, 'cache.json');
    try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) || {}; } catch (e) { cache = {}; }
  }

  function cacheGet(file) {
    var c = cache[file.path];
    if (c && c.size === file.size && Math.abs((c.mtime || 0) - file.mtime) < 2) return c;
    return null;
  }

  /** Crêtes (0-255) stockées en base64 : cache ~3× plus léger qu'un tableau JSON */
  function packPeaks(arr) {
    var s = '';
    for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i] & 255);
    return 'b64:' + btoa(s);
  }
  function unpackPeaks(v) {
    if (typeof v !== 'string') return v;
    var s = atob(v.replace(/^b64:/, '')), out = new Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  var dirty = false;
  function cachePut(file, data) {
    var c = cacheGet(file) || { size: file.size, mtime: file.mtime };
    for (var k in data) if (data.hasOwnProperty(k)) c[k] = k === 'peaks' && Array.isArray(data[k]) ? packPeaks(data[k]) : data[k];
    cache[file.path] = c;
    scheduleSave();
    return c;
  }

  function scheduleSave() {
    if (!cacheFile) return;
    dirty = true;
    clearTimeout(saveTimer);
    // écriture groupée : pas de gros JSON.stringify à chaque morceau analysé
    saveTimer = setTimeout(function () {
      dirty = false;
      fs.writeFile(cacheFile, JSON.stringify(cache), function () {});
    }, 5000);
  }

  /** Écriture immédiate (fermeture / masquage du panneau) */
  function flushCache() {
    clearTimeout(saveTimer);
    if (!cacheFile || !dirty) return;
    dirty = false;
    try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch (e) {}
  }

  function clearCache() {
    cache = {};
    scheduleSave();
  }

  window.OngakuLib = {
    hasNode: hasNode,
    platform: platform,
    scanFolder: scanFolder,
    readFileAsArrayBuffer: readFileAsArrayBuffer,
    writeFile: writeFile,
    exists: exists,
    reveal: reveal,
    ensureDir: ensureDir,
    dirname: dirname,
    listDirs: listDirs,
    fileSize: fileSize,
    removeFile: removeFile,
    copyFileSync: copyFileSync,
    audioInfo: audioInfo,
    openFolder: function (p) {
      if (!childProcess) return;
      childProcess.exec(platform === 'win32' ? 'explorer.exe "' + p + '"' : 'open "' + p.replace(/"/g, '\\"') + '"');
    },
    parseId3: parseId3,
    blobToThumb: blobToThumb,
    guessFromName: guessFromName,
    fileUrl: fileUrl,
    basename: basename,
    stripExt: stripExt,
    extname: extname,
    joinPath: function () { return pathMod.join.apply(pathMod, arguments); },
    defaultRenderDir: defaultRenderDir,
    loadCache: loadCache,
    cacheGet: cacheGet,
    cachePut: cachePut,
    clearCache: clearCache,
    flushCache: flushCache,
    unpackPeaks: unpackPeaks
  };
})();
