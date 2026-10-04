/**
 * Kiru — IA locale (llama.cpp + petit modèle) pour l'Analyse IA et les chapitres, sans compte ni clé.
 *
 *  - llama.cpp : version Vulkan (carte graphique NVIDIA / AMD / Intel, 32 Mo) ou processeur, téléchargée depuis
 *    GitHub dans le dossier de Kiru ; macOS : « brew install llama.cpp » (puce Apple).
 *  - modèle : Qwen3 4B Instruct (2,3 Go, bon en français, tient dans 4 Go de mémoire graphique).
 *  - llama-server est lancé à la demande sur 127.0.0.1, gardé 3 min pour enchaîner les demandes, puis arrêté.
 *    Réponse au format imposé (response_format json_schema) : toujours du JSON valide.
 */
(function () {
  'use strict';

  function req(name) {
    var n = window.cep_node, r = (n && typeof n.require === 'function' && n.require) || window.__kiruRequire;
    try { return r ? r(name) : null; } catch (e) { return null; }
  }
  var fs = req('fs'), pathMod = req('path'), cp = req('child_process'), http = req('http'), net = req('net');
  var proc = (window.cep_node && window.cep_node.process) || (typeof process !== 'undefined' ? process : null);
  var Buf = (window.cep_node && window.cep_node.Buffer) || (typeof Buffer !== 'undefined' ? Buffer : null);
  var win = proc && proc.platform === 'win32';
  var X = function () { return window.KiruText; }; // téléchargement, dossiers : partagés avec la transcription

  var MODELS = [
    { id: 'qwen3-4b', name: 'Qwen3 4B Instruct', repo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF', file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf', size: '2,3 Go', hint: 'Recommandé : bon en français, tient dans 4 Go de mémoire graphique' },
    { id: 'qwen2.5-3b', name: 'Qwen2.5 3B Instruct', repo: 'Qwen/Qwen2.5-3B-Instruct-GGUF', file: 'qwen2.5-3b-instruct-q4_k_m.gguf', size: '2,0 Go', hint: 'Plus léger, un peu moins fin' }
  ];
  function model(id) { return MODELS.filter(function (m) { return m.id === id; })[0] || MODELS[0]; }
  function dir(sub) { return pathMod.join(X().dataDir(), sub); }
  function isFile(p) { try { return !!p && fs.statSync(p).isFile(); } catch (e) { return false; } }
  function modelPath(id) { return pathMod.join(dir('llm'), model(id).file); }
  function installedModels() { if (!fs) return []; return MODELS.filter(function (m) { return isFile(modelPath(m.id)); }).map(function (m) { return m.id; }); }

  function findIn(d, name, depth) {
    try {
      var list = fs.readdirSync(d);
      if (list.indexOf(name) >= 0 && isFile(pathMod.join(d, name))) return pathMod.join(d, name);
      if (depth > 0) for (var i = 0; i < list.length; i++) {
        var sub = pathMod.join(d, list[i]);
        try { if (fs.statSync(sub).isDirectory()) { var f = findIn(sub, name, depth - 1); if (f) return f; } } catch (e) {}
      }
    } catch (e2) {}
    return '';
  }
  /** llama-server : dossier de Kiru, PATH, Homebrew */
  function findServer() {
    if (!fs || !pathMod) return '';
    var exe = win ? 'llama-server.exe' : 'llama-server';
    var own = findIn(dir('llama'), exe, 3);
    if (own) return own;
    var env = (proc && proc.env) || {};
    var dirs = String(env.PATH || env.Path || '').split(win ? ';' : ':').concat(['/opt/homebrew/bin', '/usr/local/bin']);
    for (var i = 0; i < dirs.length; i++) { var p = dirs[i] && pathMod.join(dirs[i].replace(/^"|"$/g, ''), exe); if (isFile(p)) return p; }
    return '';
  }
  /** Vulkan est fourni par les pilotes de toutes les cartes graphiques récentes */
  function hasVulkan() { return win && isFile(((proc.env && proc.env.SystemRoot) || 'C:\\Windows') + '\\System32\\vulkan-1.dll'); }
  function isGpu(p) { return /vulkan|cuda/i.test(String(p || '')) || (!win && !!p); }

  function install(onProgress) {
    if (!win) return Promise.reject(new Error('macOS : installez llama.cpp avec « brew install llama.cpp »'));
    var kind = hasVulkan() ? 'vulkan' : 'cpu', d = dir('llama'), zip = pathMod.join(d, 'llama-' + kind + '.zip');
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return X().getJSON('https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=5').then(function (list) {
      var re = new RegExp('^llama-b\\d+-bin-win-' + kind + '-x64\\.zip$');
      for (var i = 0; i < list.length; i++) {
        var a = (list[i].assets || []).filter(function (x) { return re.test(x.name); })[0];
        if (a) return a.browser_download_url;
      }
      throw new Error('aucune version Windows de llama.cpp trouvée sur GitHub');
    }).then(function (url) {
      return X().download(url, zip, onProgress);
    }).then(function () {
      var target = pathMod.join(d, kind);
      return X().unzip(zip, target).then(function () {
        try { fs.unlinkSync(zip); } catch (e) {}
        var exe = findIn(target, 'llama-server.exe', 3);
        if (!exe) throw new Error('archive de llama.cpp illisible');
        return exe;
      });
    });
  }
  function downloadModel(id, onProgress) {
    var m = model(id);
    return X().download('https://huggingface.co/' + m.repo + '/resolve/main/' + m.file, modelPath(id), onProgress);
  }

  // ==================== Serveur local ====================
  var server = null; // { child, port, model, ctx, idle }
  function freePort() {
    return new Promise(function (resolve, reject) {
      var s = net.createServer();
      s.unref(); s.on('error', reject);
      s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { resolve(p); }); });
    });
  }
  function httpJSON(port, path, body, timeout) {
    return new Promise(function (resolve, reject) {
      var data = body ? JSON.stringify(body) : null;
      var rq = http.request({ host: '127.0.0.1', port: port, path: path, method: data ? 'POST' : 'GET', timeout: timeout || 5000,
        headers: data ? { 'content-type': 'application/json', 'content-length': Buf.byteLength(data) } : {} }, function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          var t = Buf.concat(chunks).toString('utf8'), j = null;
          try { j = JSON.parse(t); } catch (e) {}
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(j); else { var e2 = new Error((j && j.error && (j.error.message || j.error)) || ('HTTP ' + res.statusCode)); e2.status = res.statusCode; reject(e2); }
        });
      });
      rq.on('timeout', function () { rq.destroy(new Error('délai dépassé')); });
      rq.on('error', reject);
      if (data) rq.write(data);
      rq.end();
    });
  }
  var lastLog = '';
  function stop() {
    if (!server) return;
    lastLog = server.log || '';
    clearTimeout(server.idle);
    try { server.child.kill(); } catch (e) {}
    server = null;
  }
  function keepAlive() { clearTimeout(server.idle); server.idle = setTimeout(stop, 180000); }

  /** Démarre llama-server (modèle chargé une fois, gardé 3 min) ; ctx = taille de contexte en jetons */
  function start(id, ctx, onStatus) {
    var mp = modelPath(id);
    // même modèle, contexte suffisant et pas trop grand (sinon on relance au plus juste)
    if (server && server.model === mp && server.ctx >= ctx && server.ctx <= ctx * 2) { keepAlive(); return Promise.resolve(server); }
    stop();
    var exe = findServer();
    if (!exe) return Promise.reject(new Error('IA locale non installée : Réglages > IA > « Installer l\'IA locale »'));
    if (!isFile(mp)) return Promise.reject(new Error('modèle « ' + model(id).name + ' » absent : Réglages > IA > Télécharger'));
    return freePort().then(function (port) {
      var log = '', args = ['-m', mp, '--host', '127.0.0.1', '--port', String(port), '-c', String(ctx), '-np', '1'];
      // pas de -ngl : llama.cpp (--fit) répartit lui-même le modèle entre carte graphique et mémoire selon la place libre
      var child = cp.spawn(exe, args, { cwd: pathMod.dirname(exe), windowsHide: true });
      child.stderr.on('data', function (b) { log = (log + b).slice(-8000); if (server && server.child === child) server.log = log; });
      child.stdout.on('data', function (b) { log = (log + b).slice(-8000); if (server && server.child === child) server.log = log; });
      var dead = null;
      child.on('exit', function (code) { dead = code; lastLog = log; if (server && server.child === child) server = null; });
      server = { child: child, port: port, model: mp, ctx: ctx, idle: null };
      if (onStatus) onStatus('Chargement du modèle…');
      var t0 = Date.now();
      var wait = function () {
        if (dead !== null) {
          var last = log.trim().split('\n').filter(function (l) { return /error|failed|unable|unknown/i.test(l); }).pop();
          throw new Error('llama.cpp s\'est arrêté' + (last ? ' : ' + last.slice(0, 200) : ' (code ' + dead + ')'));
        }
        if (Date.now() - t0 > 180000) { stop(); throw new Error('le modèle met trop longtemps à se charger'); }
        return httpJSON(port, '/health', null, 2000).then(function () { keepAlive(); return server; }, function () {
          return new Promise(function (r) { setTimeout(r, 400); }).then(wait);
        });
      };
      return wait();
    });
  }

  /** Une demande, réponse JSON conforme au schéma */
  function ask(cfg, system, user, schema, onStatus) {
    if (!http) return Promise.reject(new Error('Node.js indisponible'));
    // contexte : texte (≈ 3,5 caractères par jeton en français) + réponse, arrondi au multiple de 4096
    // au plus juste : un petit contexte laisse tout le modèle tenir dans la carte graphique (bien plus rapide)
    var need = Math.ceil((system.length + user.length) / 3.2) + 1500;
    var ctx = Math.min(32768, Math.max(4096, Math.ceil(need / 2048) * 2048));
    return start(cfg.model || MODELS[0].id, ctx, onStatus).then(function (s) {
      if (onStatus) onStatus('Analyse en cours (IA locale)…');
      return httpJSON(s.port, '/v1/chat/completions', {
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.2, max_tokens: 4096,
        response_format: { type: 'json_schema', json_schema: { name: 'kiru', schema: schema } }
      }, 600000);
    }).then(function (r) {
      keepAlive();
      var c = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
      try { return JSON.parse(String(c || '').replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { throw new Error('réponse de l\'IA locale illisible'); }
    });
  }

  window.addEventListener('unload', stop);
  window.KiruLLM = {
    MODELS: MODELS, findServer: findServer, install: install, downloadModel: downloadModel, installedModels: installedModels,
    hasVulkan: hasVulkan, isGpu: isGpu, ask: ask, stop: stop, modelPath: modelPath,
    _log: function () { return server && server.log || lastLog; }
  };
})();
