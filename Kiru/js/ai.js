/**
 * Kiru — analyse du texte par Claude (prises ratées, chapitres). Seul le texte est envoyé, jamais l'audio.
 *
 * Deux moteurs :
 *  - Claude Code (par défaut) : l'outil en ligne de commande livré avec l'application Claude, connecté une fois
 *    au compte Claude (/login) ; utilise l'abonnement, sans clé API ;
 *  - API Claude (clé) : le panneau est du JavaScript sans build ni npm (distribué tel quel dans CEP), l'appel
 *    passe donc par l'API HTTP (POST /v1/messages) avec le module https de Node, ce qui évite aussi les
 *    restrictions CORS. Réponse au format JSON imposé (output_config.format), repli serveur en cas de refus.
 */
(function () {
  'use strict';

  function req(name) {
    var n = window.cep_node, r = (n && typeof n.require === 'function' && n.require) || window.__kiruRequire;
    try { return r ? r(name) : null; } catch (e) { return null; }
  }
  var https = req('https');
  var Buf = (window.cep_node && window.cep_node.Buffer) || (typeof Buffer !== 'undefined' ? Buffer : null);
  var MODEL = 'claude-opus-5-5';

  function post(body, key, betas) {
    return new Promise(function (resolve, reject) {
      if (!https) return reject(new Error('Node.js indisponible'));
      var data = JSON.stringify(body);
      var headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-length': Buf.byteLength(data) };
      if (betas && betas.length) headers['anthropic-beta'] = betas.join(',');
      var rq = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: headers, timeout: 600000 }, function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          var text = Buf.concat(chunks).toString('utf8'), json = null;
          try { json = JSON.parse(text); } catch (e) {}
          if (res.statusCode >= 200 && res.statusCode < 300 && json) return resolve(json);
          var msg = json && json.error ? json.error.message : text.slice(0, 200);
          var err = new Error(res.statusCode === 401 ? 'clé API Claude refusée (Réglages > IA)' : 'Claude (HTTP ' + res.statusCode + ') : ' + msg);
          err.status = res.statusCode; err.raw = msg;
          reject(err);
        });
      });
      rq.on('timeout', function () { rq.destroy(new Error('Claude ne répond pas (délai dépassé)')); });
      rq.on('error', function (e) { reject(/ENOTFOUND|ECONN/.test(e.code || '') ? new Error('pas de connexion à api.anthropic.com') : e); });
      rq.write(data); rq.end();
    });
  }

  // ==================== Claude Code (abonnement Claude, sans clé API) ====================
  var cp = req('child_process'), fs = req('fs'), pathMod = req('path'), os = req('os');
  var proc = (window.cep_node && window.cep_node.process) || (typeof process !== 'undefined' ? process : null);
  function isFile(p) { try { return !!p && fs.statSync(p).isFile(); } catch (e) { return false; } }
  function verCmp(a, b) {
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
    return 0;
  }
  /**
   * claude(.exe) : la version embarquée par l'application Claude (dossier claude-code\<version>), sinon le PATH
   * ou les emplacements d'installation habituels de Claude Code.
   */
  function findClaudeCode() {
    if (!fs || !pathMod || !proc) return '';
    var env = proc.env || {}, win = proc.platform === 'win32', exe = win ? 'claude.exe' : 'claude';
    var appDirs = win ? [pathMod.join(env.APPDATA || '', 'Claude', 'claude-code')]
      : [pathMod.join(env.HOME || '', 'Library', 'Application Support', 'Claude', 'claude-code')];
    // application Claude du Microsoft Store : son dossier AppData est virtualisé, invisible des autres programmes
    if (win) {
      try {
        var pk = pathMod.join(env.LOCALAPPDATA || '', 'Packages');
        fs.readdirSync(pk).filter(function (d) { return /^Claude_/i.test(d); }).forEach(function (d) {
          appDirs.push(pathMod.join(pk, d, 'LocalCache', 'Roaming', 'Claude', 'claude-code'));
        });
      } catch (e) {}
    }
    // claude-code\<version>\claude.exe, ou (versions récentes) claude-code\<version>\<empreinte>\claude.exe
    var inVersion = function (dir) {
      if (isFile(pathMod.join(dir, exe))) return pathMod.join(dir, exe);
      try {
        var subs = fs.readdirSync(dir).filter(function (s) { return isFile(pathMod.join(dir, s, exe)); });
        if (subs.length) return pathMod.join(dir, subs[0], exe);
      } catch (e) {}
      return '';
    };
    for (var i = 0; i < appDirs.length; i++) {
      try {
        var vers = fs.readdirSync(appDirs[i]).filter(function (v) { return /^\d+(\.\d+)*$/.test(v); }).sort(verCmp);
        for (var k = vers.length - 1; k >= 0; k--) { var found = inVersion(pathMod.join(appDirs[i], vers[k])); if (found) return found; }
      } catch (e) {}
    }
    var dirs = String(env.PATH || env.Path || '').split(win ? ';' : ':').concat([
      pathMod.join(env.USERPROFILE || env.HOME || '', '.local', 'bin'), pathMod.join(env.HOME || '', '.claude', 'local'),
      pathMod.join(env.APPDATA || '', 'npm'), '/opt/homebrew/bin', '/usr/local/bin']);
    for (var j = 0; j < dirs.length; j++) {
      var p = dirs[j] && pathMod.join(dirs[j].replace(/^"|"$/g, ''), exe);
      if (isFile(p)) return p;
    }
    return '';
  }
  /**
   * Requête par Claude Code en mode non interactif : aucun outil (--tools ""), aucune session gardée,
   * réponse au format imposé (--json-schema). Le texte passe par l'entrée standard (pas de limite de longueur
   * de ligne de commande). Lancé depuis le dossier temporaire : aucun CLAUDE.md de projet n'est chargé.
   */
  function askClaudeCode(system, user, schema) {
    return new Promise(function (resolve, reject) {
      var exe = findClaudeCode();
      if (!exe) return reject(new Error('Claude Code introuvable : installez l\'application Claude (claude.ai/download) ou ajoutez une clé API (Réglages > IA)'));
      var args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--system-prompt', system,
        '--tools', '', '--no-session-persistence', '--strict-mcp-config'];
      // Lancé depuis Premiere, Claude Code ne reçoit pas un texte écrit dans son entrée standard (il attend sans fin) :
      // le texte passe par un fichier temporaire ouvert en entrée. Et il ne se ferme pas toujours après sa réponse :
      // la réponse est prise dès qu'elle est complète.
      var inFile = pathMod.join(os.tmpdir(), 'kiru-claude-' + Date.now() + '.txt'), fd = null;
      try { fs.writeFileSync(inFile, user, 'utf8'); fd = fs.openSync(inFile, 'r'); } catch (e) { return reject(e); }
      var out = [], err = '', ch, done = false;
      var cleanup = function () { try { fs.closeSync(fd); } catch (e) {} try { fs.unlinkSync(inFile); } catch (e2) {} };
      try { ch = cp.spawn(exe, args, { cwd: os.tmpdir(), windowsHide: true, stdio: [fd, 'pipe', 'pipe'] }); } catch (e) { cleanup(); return reject(e); }
      var timer = setTimeout(function () { finish(true); }, 600000);
      ch.stdout.on('data', function (b) {
        out.push(b);
        // réponse complète (un objet JSON) : inutile d'attendre la fermeture du programme
        try { JSON.parse(Buf.concat(out).toString('utf8').trim()); finish(false); } catch (e) {}
      });
      ch.stderr.on('data', function (b) { if (err.length < 2000) err += b; });
      ch.on('error', function (e) { if (done) return; done = true; clearTimeout(timer); cleanup(); reject(e); });
      ch.on('close', function () { finish(false); });
      function finish(timedOut) {
        if (done) return;
        done = true; clearTimeout(timer); cleanup();
        try { ch.kill(); } catch (e) {}
        if (timedOut) return reject(new Error('Claude Code ne répond pas (délai dépassé)'));
        var text = Buf.concat(out).toString('utf8').trim(), res = null;
        try { res = JSON.parse(text); } catch (e) {}
        var fail = function (why) {
          why = String(why || 'réponse vide');
          var e = new Error(/not logged in|\/login|log in|unauthori|auth/i.test(why)
            ? 'Claude Code n\'est pas connecté : Réglages > IA > « Se connecter », tapez /login, puis réessayez.'
            : 'Claude Code : ' + why.slice(0, 200));
          e.login = /not logged in|\/login|log in|unauthori|auth/i.test(why);
          reject(e);
        };
        if (!res) return fail((err || text).trim().split('\n').pop());
        if (res.is_error) return fail(res.result || res.subtype || 'erreur');
        if (res.structured_output && typeof res.structured_output === 'object') return resolve(res.structured_output);
        var r = String(res.result || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
        try { resolve(JSON.parse(r)); } catch (e) { reject(new Error('réponse de Claude Code illisible')); }
      }
    });
  }

  /** Ouvre Claude Code dans une fenêtre de terminal : on y tape /login une seule fois (compte Claude) */
  function openLogin() {
    var exe = findClaudeCode();
    if (!exe) return false;
    try {
      if (proc.platform === 'win32') cp.spawn('cmd.exe', ['/c', 'start', 'Claude Code', '/d', os.homedir(), exe], { detached: true, windowsHide: false }).unref();
      else cp.spawn('open', ['-a', 'Terminal', exe], { detached: true }).unref();
      return true;
    } catch (e) { return false; }
  }
  /** Petite requête de vérification (connexion, format JSON) */
  function test(cfg) {
    return ask(cfg, 'Answer with the JSON object only.', 'Return {"ok": true}.', {
      type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } }
    }).then(function (r) { if (!r || r.ok !== true) throw new Error('réponse inattendue'); return true; });
  }

  /**
   * Une requête, réponse JSON conforme au schéma.
   * cfg = { engine: 'claude-code' | 'api', key } : Claude Code utilise l'abonnement Claude, l'API une clé.
   */
  function ask(cfg, system, user, schema) {
    if (typeof cfg === 'string') cfg = { engine: 'api', key: cfg };
    if (cfg.engine === 'local') return window.KiruLLM.ask(cfg, system, user, schema, cfg.onStatus);
    if (cfg.engine !== 'api') return askClaudeCode(system, user, schema);
    var key = cfg.key;
    if (!key) return Promise.reject(new Error('ajoutez votre clé API Claude dans Réglages > IA'));
    var body = {
      model: MODEL, max_tokens: 16000, system: system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema } },
      fallbacks: 'default'
    };
    return post(body, key, ['server-side-fallback-2026-07-01']).catch(function (e) {
      if (e.status !== 400 || !/fallback/i.test(e.raw || '')) throw e;
      delete body.fallbacks;
      return post(body, key, []);
    }).then(function (res) {
      if (res.stop_reason === 'refusal') throw new Error('Claude a refusé cette demande');
      if (res.stop_reason === 'max_tokens') throw new Error('réponse de Claude tronquée (transcription trop longue ?)');
      var text = (res.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
      try { return JSON.parse(text); } catch (e) { throw new Error('réponse de Claude illisible'); }
    });
  }

  function fmt(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }
  function listing(sentences) {
    return sentences.map(function (s) { return '[' + s.id + '] (' + fmt(s.start) + ') ' + s.text; }).join('\n');
  }

  /** Phrases abandonnées ou reprises : [{ id, reason }] — garde la dernière bonne prise */
  /** Ce qu'il faut retirer d'un rush : consignes communes aux trois moteurs */
  var TAKE_RULES =
    'You help a video editor turn raw footage into a clean edit. You receive the transcript as numbered sentences with start times. ' +
    'Categories:\n' +
    '- keep: content meant for the final video: said once, or the LAST complete take of a line.\n' +
    '- retake: an earlier take of a line that is said again later with the same or very similar words. Only the last complete take is kept.\n' +
    '- false_start: a sentence that is interrupted or abandoned (often ends with "..." or stops mid-way), or a stumble.\n' +
    '- off_camera: talk not meant for the video: talking to the crew, camera or sound settings, "are you filming?", "is it ok?", ' +
    '"do it again", directions, jokes, swearing, comments about the take.\n' +
    'In normal footage without takes, almost every sentence is keep. Reasons are a few words in French.';

  function badTakes(key, sentences) {
    var cfg = key && typeof key === 'object' ? key : null;
    // petit modèle local : une étiquette par phrase (tâche plus simple et plus fiable qu'une liste à extraire)
    if (cfg && cfg.engine === 'local') return labelTakes(cfg, sentences);
    var system = TAKE_RULES + '\nReturn only the sentences that are not keep. When unsure, keep the sentence.';
    var schema = {
      type: 'object', additionalProperties: false, required: ['remove'],
      properties: { remove: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'],
        properties: { id: { type: 'integer' }, reason: { type: 'string' } } } } }
    };
    return ask(key, system, listing(sentences), schema).then(function (r) { return r.remove || []; });
  }

  var LABELS = { retake: 'prise refaite plus loin', false_start: 'faux départ', off_camera: 'hors tournage' };
  /**
   * IA locale : chaque phrase reçoit une étiquette. Par tranches de 60 phrases avec 15 de recouvrement (une prise
   * et sa reprise restent dans la même tranche) ; dans le recouvrement, la tranche suivante (qui voit la suite) l'emporte.
   */
  function labelTakes(cfg, sentences) {
    // réponse courte : numéro + étiquette + 2 à 4 mots de raison (la raison fait « réfléchir » le petit modèle,
    // le numéro l'empêche de se décaler ; une explication longue rendrait l'analyse 8 fois plus lente)
    var system = TAKE_RULES + '\nLabel EVERY sentence, in order. For each: its number, its category, and a reason of 2 to 4 words.';
    var parts = [], out = {}, p = Promise.resolve();
    for (var i = 0; i < sentences.length; i += 45) { parts.push(sentences.slice(i, i + 60)); if (i + 60 >= sentences.length) break; }
    parts.forEach(function (part, k) {
      p = p.then(function () {
        if (cfg.onStatus) cfg.onStatus('Analyse en cours (IA locale)' + (parts.length > 1 ? ' · partie ' + (k + 1) + '/' + parts.length : '') + '…');
        var schema = {
          type: 'object', additionalProperties: false, required: ['labels'],
          properties: { labels: { type: 'array', minItems: part.length, maxItems: part.length, items: {
            type: 'object', additionalProperties: false, required: ['id', 'label', 'why'],
            properties: { id: { type: 'integer' }, label: { type: 'string', enum: ['keep', 'retake', 'false_start', 'off_camera'] },
              why: { type: 'string', maxLength: 40 } } } } }
        };
        return ask(cfg, system, listing(part), schema).then(function (r) {
          (r.labels || []).forEach(function (x) {
            if (!part.some(function (s) { return s.id === x.id; })) return;
            if (x.label === 'keep') delete out[x.id];
            else out[x.id] = { id: x.id, reason: LABELS[x.label] || x.label };
          });
        });
      });
    });
    return p.then(function () { return Object.keys(out).map(function (id) { return out[id]; }); });
  }

  /** Chapitres YouTube : [{ id (phrase de début), title }] */
  function chapters(key, sentences, lang) {
    var system = 'You split a video transcript into chapters for YouTube. You receive numbered sentences with start times. ' +
      'Return 3 to 12 chapters in chronological order; the first chapter must start at sentence ' + sentences[0].id + '. ' +
      'Each chapter covers at least 30 seconds when possible. Titles are short (2 to 6 words), concrete, in the language of the ' +
      'transcript' + (lang ? ' (' + lang + ')' : '') + ', without numbering or emojis.';
    var schema = {
      type: 'object', additionalProperties: false, required: ['chapters'],
      properties: { chapters: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title'],
        properties: { id: { type: 'integer' }, title: { type: 'string' } } } } }
    };
    // petit modèle local : il se trompe de numéro de phrase mais lit bien les temps ; on lui demande donc le temps
    // de début (m:ss, tel qu'affiché), ramené ensuite à la phrase la plus proche. Nombre de chapitres imposé.
    if (key && key.engine === 'local') {
      var tSchema = { type: 'object', additionalProperties: false, required: ['chapters'],
        properties: { chapters: { type: 'array', minItems: Math.min(3, sentences.length), maxItems: 10, items: {
          type: 'object', additionalProperties: false, required: ['time', 'title'],
          properties: { time: { type: 'string', pattern: '^[0-9]{1,3}:[0-5][0-9]$' }, title: { type: 'string' } } } } } };
      var tSystem = system.replace(/the first chapter must start at sentence \d+\./, 'the first chapter starts at ' + fmt(sentences[0].start) + '.') +
        ' For each chapter give the start time (m:ss) of the sentence where it begins, copied from the list.';
      return ask(key, tSystem, listing(sentences), tSchema).then(function (r) {
        var seen = {};
        return (r.chapters || []).map(function (c) {
          var m = String(c.time).split(':'), t = Number(m[0]) * 60 + Number(m[1]), best = sentences[0];
          sentences.forEach(function (s) { if (Math.abs(s.start - t) < Math.abs(best.start - t)) best = s; });
          return { id: best.id, title: c.title };
        }).filter(function (c) { if (seen[c.id]) return false; seen[c.id] = true; return true; }).sort(function (a, b) { return a.id - b.id; });
      });
    }
    return ask(key, system, listing(sentences), schema).then(function (r) { return r.chapters || []; });
  }

  window.KiruAI = { MODEL: MODEL, ask: ask, badTakes: badTakes, chapters: chapters, findClaudeCode: findClaudeCode, openLogin: openLogin, test: test };
})();
