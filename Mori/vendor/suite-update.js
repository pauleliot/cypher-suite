/**
 * Suite Mori — mises à jour des panneaux (Mori, Ongaku, Sori, Kiru), copié à l'identique dans chacun.
 *
 * Inclusion : <script src="js/suite-update.js" data-app="kiru" data-name="Kiru"></script>
 *
 *  - À l'ouverture (puis au plus toutes les 6 h), lit https://pauleliot.github.io/updates.json, écrit par release.py :
 *      { "apps": { "kiru": { "version": "1.2.1", "notes": "…", "url": "…/Kiru-1.2.1-update.zip", "sha256": "…" } } }
 *  - Version plus récente que celle du CSXS/manifest.xml du panneau : bandeau « Mettre à jour ».
 *  - Mettre à jour : téléchargement du paquet (GitHub Releases), contrôle de l'empreinte SHA-256, décompression,
 *    copie par-dessus le dossier du panneau (les outils téléchargés, bin/, sont gardés), puis rechargement du panneau.
 *  - Copie de développement (fichier .debug dans le dossier) : le bandeau signale la version, sans rien installer.
 * Autonome : ni dépendance ni CSS du panneau ; ne fait rien hors de Premiere (pas de Node).
 */
(function () {
  'use strict';
  var FEED = 'https://pauleliot.github.io/updates.json';
  var EVERY = 6 * 3600 * 1000;
  var KEEP = ['bin', '.debug', '.git']; // jamais remplacés ni supprimés

  var me = document.currentScript || {};
  var APP = (me.dataset && me.dataset.app) || '';
  var NAME = (me.dataset && me.dataset.name) || APP;
  var node = window.cep_node;
  if (!APP || !node || typeof node.require !== 'function') return;
  var fs = node.require('fs'), path = node.require('path'), os = node.require('os'), https = node.require('https'),
    http = node.require('http'), crypto = node.require('crypto'), cp = node.require('child_process');
  var proc = node.process;
  var DIR = decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\/[^\/]*$/, '');
  var KEY = 'suite.update.' + APP;

  function current() {
    try { return /ExtensionBundleVersion="([^"]+)"/.exec(fs.readFileSync(path.join(DIR, 'CSXS', 'manifest.xml'), 'utf8'))[1]; } catch (e) { return '0'; }
  }
  /** a > b ? (versions « 1.2.10 ») */
  function newer(a, b) {
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
    return false;
  }
  function store(v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(KEY) || '{}'); localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { return {}; } }
  function isDev() { try { return fs.existsSync(path.join(DIR, '.debug')); } catch (e) { return false; } }

  // ==================== Réseau ====================
  function get(url, toFile, hops) {
    return new Promise(function (resolve, reject) {
      if ((hops || 0) > 5) return reject(new Error('trop de redirections'));
      // http : seulement pour les essais sur cet ordinateur (paquet servi en local)
      var mod = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) ? http : https;
      var rq = mod.get(url, { headers: { 'User-Agent': 'SuiteMori-updater', 'Cache-Control': 'no-cache' }, timeout: 60000 }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(get(new URL(res.headers.location, url).toString(), toFile, (hops || 0) + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        if (toFile) {
          var out = fs.createWriteStream(toFile);
          res.pipe(out);
          out.on('finish', function () { out.close(function () { resolve(toFile); }); });
          out.on('error', reject);
        } else {
          var chunks = [];
          res.on('data', function (c) { chunks.push(c); });
          res.on('end', function () { resolve(node.Buffer.concat(chunks).toString('utf8')); });
        }
      });
      rq.on('timeout', function () { rq.destroy(new Error('délai dépassé')); });
      rq.on('error', reject);
    });
  }

  // ==================== Installation ====================
  function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
  function unzip(zip, dest) {
    return new Promise(function (resolve, reject) {
      var ch = proc.platform === 'win32'
        ? cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath "' + zip + '" -DestinationPath "' + dest + '" -Force'], { windowsHide: true })
        : cp.spawn('/usr/bin/ditto', ['-x', '-k', zip, dest]);
      ch.on('error', reject);
      ch.on('close', function (code) { if (code === 0) resolve(dest); else reject(new Error('archive illisible')); });
    });
  }
  function copyInto(src, dst) {
    fs.readdirSync(src).forEach(function (n) {
      if (KEEP.indexOf(n) >= 0) return;
      var a = path.join(src, n), b = path.join(dst, n);
      if (fs.statSync(a).isDirectory()) { if (!fs.existsSync(b)) fs.mkdirSync(b); copyInto(a, b); }
      else fs.writeFileSync(b, fs.readFileSync(a));
    });
  }
  function rm(p) {
    try {
      if (fs.statSync(p).isDirectory()) { fs.readdirSync(p).forEach(function (n) { rm(path.join(p, n)); }); fs.rmdirSync(p); }
      else fs.unlinkSync(p);
    } catch (e) {}
  }
  /** Télécharge, vérifie et installe la version info dans target ; résout la version installée */
  function install(info, target, onStep) {
    var tmp = path.join(os.tmpdir(), 'suite-update-' + APP + '-' + Date.now()), zip = tmp + '.zip';
    onStep('Téléchargement…');
    return get(info.url, zip).then(function () {
      if (info.sha256 && sha256(zip) !== String(info.sha256).toLowerCase()) throw new Error('paquet altéré (empreinte différente) : mise à jour annulée');
      onStep('Installation…');
      return unzip(zip, tmp);
    }).then(function () {
      // le paquet contient un dossier « <Nom>-<version> » : son contenu remplace celui du panneau
      var top = fs.readdirSync(tmp).map(function (n) { return path.join(tmp, n); }).filter(function (p) { return fs.statSync(p).isDirectory(); });
      var src = top.length === 1 && !fs.existsSync(path.join(tmp, 'CSXS')) ? top[0] : tmp;
      if (!fs.existsSync(path.join(src, 'CSXS', 'manifest.xml'))) throw new Error('paquet incomplet');
      copyInto(src, target);
      return info.version;
    }).then(function (v) { rm(tmp); rm(zip); return v; }, function (e) { rm(tmp); rm(zip); throw e; });
  }

  // ==================== Bandeau ====================
  var bar = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show(html) {
    if (!bar) {
      var css = document.createElement('style');
      css.textContent =
        '#suite-update{position:fixed;left:10px;right:10px;bottom:10px;z-index:2147483000;background:#111a2e;color:#e9ecf3;' +
        'border:1px solid rgba(251,230,166,.45);border-radius:10px;padding:10px 12px;font:500 12.5px/1.45 Urbanist,"Segoe UI",sans-serif;' +
        'box-shadow:0 8px 28px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:8px}' +
        '#suite-update .su-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
        '#suite-update .su-t{flex:1;min-width:150px}#suite-update b{color:#fbe6a6}' +
        '#suite-update button{font:700 12px Urbanist,"Segoe UI",sans-serif;border-radius:7px;padding:5px 11px;cursor:pointer;border:1px solid rgba(255,255,255,.18);background:transparent;color:#e9ecf3}' +
        '#suite-update button.su-go{background:#fbe6a6;color:#0c1322;border-color:#fbe6a6}' +
        '#suite-update button:disabled{opacity:.5;cursor:default}' +
        '#suite-update .su-notes{white-space:pre-line;color:#b9bfcd;max-height:140px;overflow:auto;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}';
      document.head.appendChild(css);
      bar = document.createElement('div'); bar.id = 'suite-update';
      document.body.appendChild(bar);
    }
    bar.innerHTML = html;
    return bar;
  }
  function hide() { if (bar) { bar.remove(); bar = null; } }

  function offer(info) {
    var dev = isDev();
    show('<div class="su-row"><span class="su-t"><b>' + esc(NAME) + ' ' + esc(info.version) + '</b> est disponible' +
        (dev ? ' (copie de développement : pas d\'installation automatique)' : '') + '</span>' +
        (info.notes ? '<button class="su-n">Nouveautés</button>' : '') +
        '<button class="su-later">Plus tard</button>' + (dev ? '' : '<button class="su-go">Mettre à jour</button>') + '</div>' +
      (info.notes ? '<div class="su-notes" hidden>' + esc(info.notes) + '</div>' : ''));
    var q = function (s) { return bar.querySelector(s); };
    if (q('.su-n')) q('.su-n').onclick = function () { var n = q('.su-notes'); n.hidden = !n.hidden; };
    q('.su-later').onclick = function () { var s = store(); s.snooze = info.version; s.snoozeAt = Date.now(); store(s); hide(); };
    if (q('.su-go')) q('.su-go').onclick = function () {
      q('.su-go').disabled = true; q('.su-later').disabled = true;
      var step = function (m) { q('.su-t').innerHTML = '<b>' + esc(NAME) + ' ' + esc(info.version) + '</b> · ' + esc(m); };
      install(info, DIR, step).then(function (v) {
        step('installé : rechargement du panneau…');
        setTimeout(function () { location.reload(); }, 900);
        void v;
      }, function (e) {
        show('<div class="su-row"><span class="su-t">Mise à jour de <b>' + esc(NAME) + '</b> impossible : ' + esc(e.message || e) +
          '. Téléchargez l\'installeur sur pauleliot.github.io.</span><button class="su-later">OK</button></div>');
        bar.querySelector('.su-later').onclick = hide;
      });
    };
  }

  /** Vérification (force : sans attendre 6 h ni tenir compte de « Plus tard ») */
  function check(force) {
    var s = store();
    if (!force && s.checkedAt && Date.now() - s.checkedAt < EVERY && !s.pending) return Promise.resolve(null);
    return get(FEED + '?t=' + Date.now()).then(function (txt) {
      var feed = JSON.parse(txt), info = feed.apps && feed.apps[APP];
      s = store(); s.checkedAt = Date.now(); s.pending = info && newer(info.version, current()) ? info : null; store(s);
      return s.pending;
    }).catch(function () { return null; }).then(function (info) {
      info = info || store().pending;
      if (!info || !newer(info.version, current())) return null;
      var snoozed = store().snooze === info.version && Date.now() - (store().snoozeAt || 0) < 24 * 3600 * 1000;
      if (force || !snoozed) offer(info);
      return info;
    });
  }

  window.SuiteUpdate = { check: check, install: install, offer: offer, newer: newer, current: current };
  setTimeout(function () { check(false); }, 4000);
})();
