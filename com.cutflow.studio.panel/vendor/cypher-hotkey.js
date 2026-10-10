/**
 * Cypher Console : Ctrl+Espace dans Premiere ouvre la console d'effets (fenêtre flottante com.cypher.studio.console).
 *
 * Windows : lance tools/cypher-hotkey.ps1 (caché), qui réserve Ctrl+Espace seulement quand Premiere est au premier
 * plan et écrit « HOTKEY » à chaque appui. Une seule instance tourne (mutex) : la fenêtre cachée de Cypher
 * (hotkey.html, démarrée avec Premiere) et le panneau Cypher appellent start() ; si l'instance qui tenait le
 * raccourci s'arrête (panneau fermé), les autres relancent la leur quelques secondes plus tard.
 * macOS : tools/cypher-hotkey-mac.js (JavaScript for Automation, livré avec macOS) surveille ⌥Espace quand Premiere
 * est au premier plan ; macOS demande une fois l'autorisation « Accessibilité ». Sans elle, la console reste
 * accessible par Fenêtre › Extensions › Cypher Console, à qui on peut aussi donner ⌥Espace dans Premiere.
 */
(function () {
  'use strict';
  if (window.CypherHotkey) return;
  var CONSOLE_ID = 'com.cypher.studio.console';
  var child = null;
  var stopped = false;
  var retry = null;

  function openConsole() {
    // pont natif de CEP : le CSInterface.js livré avec Cypher est réduit et n'a pas requestOpenExtension
    try {
      if (window.__adobe_cep__ && window.__adobe_cep__.requestOpenExtension) window.__adobe_cep__.requestOpenExtension(CONSOLE_ID, '');
    } catch (e) {}
  }

  function extensionDir() {
    var p = decodeURIComponent(location.pathname).replace(/\/[^\/]*$/, '');
    return p.replace(/^\/([A-Za-z]:)/, '$1');
  }

  function start() {
    var node = window.cep_node;
    stopped = false;
    if (child || !node || typeof node.require !== 'function') return false;
    var proc = node.process;
    if (!proc || (proc.platform !== 'win32' && proc.platform !== 'darwin')) return false;
    var path = node.require('path');
    var cp = node.require('child_process');
    try {
      if (proc.platform === 'win32') {
        // une seule instance tient le raccourci : les suivantes attendent (mutex dans le script)
        var ps1 = path.join(extensionDir(), 'tools', 'cypher-hotkey.ps1');
        child = cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1], {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } else {
        // une seule instance : si une autre fenêtre Cypher l'a déjà lancée, on repasse plus tard
        var running = '';
        try { running = cp.execSync("pgrep -f 'cypher-hotkey-mac\.js' || true", { encoding: 'utf8' }); } catch (e) {}
        if (running.trim()) {
          clearTimeout(retry);
          retry = setTimeout(start, 15000);
          return false;
        }
        var jxa = path.join(extensionDir(), 'tools', 'cypher-hotkey-mac.js');
        child = cp.spawn('/usr/bin/osascript', ['-l', 'JavaScript', jxa], { stdio: ['pipe', 'pipe', 'ignore'] });
      }
    } catch (e) {
      child = null;
      return false;
    }
    var buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', function (d) {
      buffer += d;
      var lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      // « READY » au démarrage, « NOPERM » (macOS) si l'autorisation Accessibilité manque : macOS l'a déjà demandée
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== 'HOTKEY') continue;
        openedAt = Date.now();
        openConsole();
      }
    });
    var again = function () {
      child = null;
      if (stopped) return;
      // une autre instance tient peut-être déjà le raccourci (mutex) : on réessaie, au cas où elle s'arrêterait
      clearTimeout(retry);
      retry = setTimeout(start, 15000);
    };
    child.on('exit', again);
    child.on('error', again);
    return true;
  }

  function stop() {
    stopped = true;
    clearTimeout(retry);
    if (child) {
      try { child.kill(); } catch (e) {}
      child = null;
    }
  }

  // La console tourne sans Node (ouverture plus rapide) : elle demande le thème partagé au démarrage, la fenêtre
  // cachée (ou le panneau Cypher) le lit (suite-theme.js) et le lui renvoie par un événement CEP
  // événement CEP vers les autres fenêtres de Premiere : sans l'identifiant de l'application (« PPRO ») et celui de
  // la fenêtre, Premiere ne le transmet pas
  function sendCepEvent(type, data) {
    var c = window.__adobe_cep__;
    if (!c || !c.dispatchEvent) return;
    var appId = 'PPRO', ext = '';
    try { appId = JSON.parse(c.getHostEnvironment()).appId || appId; } catch (e) {}
    try { ext = c.getExtensionId(); } catch (e) {}
    c.dispatchEvent({ type: type, scope: 'APPLICATION', appId: appId, extensionId: ext, data: data });
  }
  function sendTheme() {
    logOpenTime();
    try {
      var shared = window.SuiteTheme && window.SuiteTheme.read();
      if (!shared || !shared.theme) return;
      // la police choisie voyage avec le thème (la console ne charge que les polices livrées)
      var t = { background: shared.theme.background, accent: shared.theme.accent, primary: shared.theme.primary };
      try { t.font = window.SuiteTheme.font().id; } catch (e) {}
      sendCepEvent('com.cypher.console.theme', JSON.stringify(t));
    } catch (e) {}
  }

  // macOS : délai entre le raccourci et la console prête, noté dans ~/Library/Logs/Cypher-raccourci.log
  // (pour savoir où part le temps quand l'ouverture paraît lente)
  var openedAt = 0;
  function logOpenTime() {
    if (!openedAt) return;
    var ms = Date.now() - openedAt;
    openedAt = 0;
    try {
      var node = window.cep_node;
      if (!node || node.process.platform !== 'darwin') return;
      var file = node.require('path').join(node.process.env.HOME || '', 'Library', 'Logs', 'Cypher-raccourci.log');
      node.require('fs').appendFile(file, new Date().toISOString() + '  console prête ' + ms + ' ms après le raccourci\n', function () {});
    } catch (e) {}
  }
  // ==================== Presets d'effets de l'utilisateur ====================
  // Premiere ne donne pas ses presets aux scripts : ils sont lus dans son fichier « Effect Presets and Custom
  // Items.prfpset » (Documents/Adobe/Premiere Pro/<version>/Profile-…), ici car la console n'a pas Node. La console
  // reçoit leurs noms ; quand elle en demande un, cette fenêtre ajoute chaque effet du preset aux clips sélectionnés
  // puis règle ses paramètres (valeurs, images clés et leur type de courbe). Ne passent pas : les poignées exactes des
  // courbes de Bézier et les données internes d'un effet (LUT, masque, texte).
  var TICKS = 254016000000; // ticks de Premiere par seconde
  var presetCache = { file: '', mtime: 0, list: [] };

  function evalScript(script) {
    return new Promise(function (resolve) {
      try {
        window.__adobe_cep__.evalScript(script, function (r) { resolve(String(r || '')); });
      } catch (e) { resolve(''); }
    });
  }
  function myId() {
    try { return window.__adobe_cep__.getExtensionId(); } catch (e) { return ''; }
  }

  /** Fichier de presets de la version de Premiere ouverte (le plus récent de ses profils) */
  function findPresetFile(documents) {
    var node = window.cep_node, fs = node.require('fs'), path = node.require('path');
    var base = path.join(documents, 'Adobe', 'Premiere Pro');
    var major = '';
    try { major = String(JSON.parse(window.__adobe_cep__.getHostEnvironment()).appVersion || '').split('.')[0]; } catch (e) {}
    var best = null;
    var versions = [];
    try { versions = fs.readdirSync(base); } catch (e) { return ''; }
    // dossier de la version ouverte d'abord (« 26.0 ») ; sinon tous
    var wanted = versions.filter(function (v) { return major && v.split('.')[0] === major; });
    (wanted.length ? wanted : versions).forEach(function (v) {
      var profiles = [];
      try { profiles = fs.readdirSync(path.join(base, v)); } catch (e) { return; }
      profiles.forEach(function (p) {
        if (!/^Profile-/i.test(p)) return;
        var f = path.join(base, v, p, 'Effect Presets and Custom Items.prfpset');
        try {
          var m = fs.statSync(f).mtimeMs;
          if (!best || m > best.mtime) best = { file: f, mtime: m };
        } catch (e) {}
      });
    });
    return best ? best.file : '';
  }

  function xmlText(s) {
    return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function tag(body, name) {
    var m = body.match(new RegExp('<' + name + '(?: [^>]*)?>([\\s\\S]*?)</' + name + '>'));
    return m ? xmlText(m[1]) : '';
  }

  /** Valeur d'un paramètre selon son type de contrôle ; undefined = type non réglable par script */
  function paramValue(type, raw) {
    raw = String(raw).trim();
    if (type === 4) return raw === 'true';
    if (type === 6) {
      var xy = raw.split(':').map(parseFloat);
      return xy.length === 2 && isFinite(xy[0]) && isFinite(xy[1]) ? xy : undefined;
    }
    if (type === 5) {
      // couleur : entier 64 bits, 16 bits par canal (alpha, rouge, vert, bleu)
      try {
        var c = BigInt(raw.split('.')[0]);
        var ch = function (shift) { return Number((c >> BigInt(shift)) & BigInt(0xffff)) >> 8; };
        return [ch(48), ch(32), ch(16), ch(0)];
      } catch (e) { return undefined; }
    }
    if (type === 2 || type === 3 || type === 7 || type === 1) {
      var n = parseFloat(raw);
      return isFinite(n) ? n : undefined;
    }
    return undefined;
  }

  /** Fichier .prfpset -> [{ key, name, bin, kind, filters: [{ name, match, intrinsic, audio, type, span, params }] }] */
  function parsePresets(xml) {
    var objs = {};
    var re = /\n\t<([A-Za-z]+) ObjectID="(\d+)"[^>]*>([\s\S]*?)\r?\n\t<\/\1>/g, m;
    while ((m = re.exec(xml))) objs[m[2]] = { tag: m[1], body: m[3] };
    var refs = function (body, name) {
      var out = [], r = new RegExp('<' + name + '(?: Index="\\d+")? ObjectRef="(\\d+)"', 'g'), x;
      while ((x = r.exec(body))) out.push(x[1]);
      return out;
    };
    var list = [];
    var filterOf = function (id) {
      var fp = objs[id];
      if (!fp) return null;
      var comp = objs[refs(fp.body, 'Component')[0]];
      if (!comp) return null;
      var anchorIn = 0, span = 0;
      try {
        anchorIn = BigInt(tag(fp.body, 'AnchorInPoint') || '0');
        span = Number(BigInt(tag(fp.body, 'AnchorOutPoint') || '0') - anchorIn) / TICKS;
      } catch (e) { anchorIn = BigInt(0); }
      var params = [];
      var paramRefs = refs(comp.body, 'Param');
      paramRefs.forEach(function (pid, index) {
        var p = objs[pid];
        if (!p) return;
        var type = parseInt(tag(p.body, 'ParameterControlType'), 10);
        var start = tag(p.body, 'StartKeyframe').split(',');
        var value = paramValue(type, start[1]);
        if (value === undefined) return;
        var out = { i: index, n: tag(p.body, 'Name'), t: type, v: value };
        if (tag(p.body, 'IsTimeVarying') === 'true') {
          var keys = [];
          tag(p.body, 'Keyframes').split(';').forEach(function (k) {
            var parts = k.split(',');
            if (parts.length < 2) return;
            var kv = paramValue(type, parts[1]);
            if (kv === undefined) return;
            // 3e champ : interpolation de l'image clé (0 linéaire, 4 maintien, 5 Bézier)
            try { keys.push([Number(BigInt(parts[0].trim()) - anchorIn) / TICKS, kv, parseInt(parts[2], 10) || 0]); } catch (e) {}
          });
          if (keys.length) out.k = keys;
        }
        params.push(out);
      });
      return {
        name: tag(comp.body, 'DisplayName'), match: tag(comp.body, 'MatchName') || tag(fp.body, 'FilterMatchName'),
        intrinsic: tag(comp.body, 'Intrinsic') === 'true', audio: /^Audio/i.test(comp.tag),
        type: parseInt(tag(fp.body, 'Type'), 10) || 0, span: span > 0 ? span : 0, count: paramRefs.length, params: params
      };
    };
    // parcours des chutiers de presets pour garder le chemin (« Mes presets / Zooms »)
    var walk = function (id, trail, depth) {
      var o = objs[id];
      if (!o || depth > 12) return;
      var name = tag(o.body, 'Name');
      if (o.tag === 'BinTreeItem') {
        var next = depth === 0 ? [] : trail.concat(depth === 1 ? [] : [name]);
        // seul le chutier « Préconfigurations » contient des presets (les autres : effets, transitions)
        if (depth === 1 && !/PresetsBin/.test(o.body)) return;
        refs(o.body, 'Item').forEach(function (child) { walk(child, next, depth + 1); });
        return;
      }
      if (o.tag !== 'TreeItem') return;
      var item = objs[refs(o.body, 'Data')[0]];
      if (!item || item.tag !== 'FilterPresetItem') return;
      var filters = refs(item.body, 'FilterPreset').map(filterOf).filter(Boolean);
      if (!name || !filters.length) return;
      var bin = trail.join(' / ');
      list.push({ key: (bin ? bin + ' / ' : '') + name, name: name, bin: bin, kind: filters.every(function (f) { return f.audio; }) ? 'audio' : 'video', filters: filters });
    };
    var root = xml.match(/<RootBin ObjectRef="(\d+)"/);
    if (root) walk(root[1], [], 0);
    return list;
  }

  /** Presets du fichier (relu seulement s'il a changé) */
  function loadPresets() {
    var node = window.cep_node;
    if (!node || typeof node.require !== 'function' || typeof BigInt !== 'function') return Promise.resolve([]);
    return evalScript('Folder.myDocuments.fsName').then(function (documents) {
      if (!documents || /^EvalScript error/i.test(documents)) return [];
      var fs = node.require('fs');
      var file = findPresetFile(documents);
      if (!file) return [];
      var mtime = 0;
      try { mtime = fs.statSync(file).mtimeMs; } catch (e) { return []; }
      if (file === presetCache.file && mtime === presetCache.mtime) return presetCache.list;
      return new Promise(function (resolve) {
        fs.readFile(file, 'utf8', function (err, xml) {
          if (err) return resolve([]);
          try { presetCache = { file: file, mtime: mtime, list: parsePresets(xml) }; } catch (e) { return resolve([]); }
          resolve(presetCache.list);
        });
      });
    });
  }

  function sendPresets() {
    loadPresets().then(function (list) {
      sendCepEvent('com.cypher.console.presets', JSON.stringify({
        from: myId(),
        list: list.map(function (p) { return { key: p.key, name: p.name, bin: p.bin, kind: p.kind }; })
      }));
    });
  }

  /** Script Premiere : ajoute les effets du preset aux clips sélectionnés et règle leurs paramètres */
  function presetScript(preset) {
    return (
      '(function(){try{' +
      'var seq=app.project?app.project.activeSequence:null;if(!seq)return "ERR|Ouvrez une séquence dans la timeline";' +
      'app.enableQE();var qseq=qe.project.getActiveSequence();var F=' + JSON.stringify(preset.filters) + ';' +
      'var applied=0,missing=[],partial=0;' +
      // heure d'une image clé dans le clip : ancrée au début (1), à la fin (2), ou étirée sur la durée du clip (0)
      'function keyTime(clip,f,t){var a=clip.inPoint.seconds,b=clip.outPoint.seconds;' +
      'if(f.type===2)return b-(f.span-t);if(f.type===0&&f.span>0)return a+(t/f.span)*(b-a);return a+t;}' +
      'function setOne(prop,p,v,last){if(p.t===5)prop.setColorValue(v[0],v[1],v[2],v[3],last);else prop.setValue(v,last);}' +
      'function setParams(clip,comp,f){var props=comp.properties,n=props.numItems,cursor=0;' +
      'for(var i=0;i<f.params.length;i++){var p=f.params[i],prop=null;' +
      // même nombre de paramètres que dans le preset : même rang (les noms diffèrent parfois côté script,
      // « Echelle » devient « Hauteur d'échelle ») ; sinon même rang si le nom concorde, puis recherche par nom
      'if(n===f.count&&n>p.i)prop=props[p.i];' +
      'else if(n>p.i&&(props[p.i].displayName===p.n||!p.n.replace(/\\s/g,"")))prop=props[p.i];' +
      'else{for(var j=cursor;j<n;j++){if(props[j].displayName===p.n){prop=props[j];cursor=j+1;break;}}}' +
      'if(!prop){partial++;continue;}var last=true;' +
      'try{if(p.k&&p.k.length){if(!prop.isTimeVarying())prop.setTimeVarying(true);' +
      'for(var k=0;k<p.k.length;k++){var t=keyTime(clip,f,p.k[k][0]);prop.addKey(t);' +
      'if(p.t===5)prop.setColorValueAtKey?prop.setColorValueAtKey(t,p.k[k][1][0],p.k[k][1][1],p.k[k][1][2],p.k[k][1][3],last):0;else prop.setValueAtKey(t,p.k[k][1],last);' +
      // courbe : Bézier ou maintien (les poignées exactes du preset ne sont pas accessibles aux scripts)
      'if(p.k[k][2]){try{prop.setInterpolationTypeAtKey(t,p.k[k][2],last);}catch(e2){}}}}' +
      'else{if(prop.isTimeVarying&&prop.isTimeVarying())prop.setTimeVarying(false);setOne(prop,p,p.v,last);}}catch(e){partial++;}}}' +
      'function findComp(clip,match,from){for(var i=clip.components.numItems-1;i>=from;i--){if(clip.components[i].matchName===match)return clip.components[i];}return null;}' +
      'function applyTo(clip,qitem,isAudio){var done=false;for(var x=0;x<F.length;x++){var f=F[x];if(!!f.audio!==isAudio)continue;var comp=null;' +
      'if(f.intrinsic)comp=findComp(clip,f.match,0);' +
      'else{var before=clip.components.numItems;var fx=isAudio?qe.project.getAudioEffectByName(f.name):qe.project.getVideoEffectByName(f.name);' +
      'if(!fx){missing.push(f.name);continue;}if(isAudio)qitem.addAudioEffect(fx);else qitem.addVideoEffect(fx);' +
      'comp=findComp(clip,f.match,before)||(clip.components.numItems>before?clip.components[clip.components.numItems-1]:null);}' +
      'if(!comp){partial++;continue;}setParams(clip,comp,f);done=true;}return done;}' +
      'function scan(tracks,isAudio){for(var t=0;t<tracks.numTracks;t++){var track=tracks[t],qitems=null,used={};' +
      'for(var c=0;c<track.clips.numItems;c++){var clip=track.clips[c];if(!clip.isSelected())continue;' +
      'if(!qitems){var qt=isAudio?qseq.getAudioTrackAt(t):qseq.getVideoTrackAt(t);qitems=[];' +
      'for(var k=0;k<qt.numItems;k++){var it=qt.getItemAt(k);if(it&&it.type!=="Empty")qitems.push(it);}}' +
      'var it2=qitems[c];if(!it2||(it2.name&&clip.name&&it2.name!==clip.name)){it2=null;' +
      'for(var j=0;j<qitems.length;j++){if(!used[j]&&qitems[j].name===clip.name){it2=qitems[j];used[j]=true;break;}}}else used[c]=true;' +
      'if(!it2)continue;if(applyTo(clip,it2,isAudio))applied++;}}}' +
      'var hasV=false,hasA=false;for(var y=0;y<F.length;y++){if(F[y].audio)hasA=true;else hasV=true;}' +
      'if(hasV)scan(seq.videoTracks,false);if(hasA)scan(seq.audioTracks,true);' +
      'if(applied===0)return "ERR|"+(missing.length?"Effet introuvable : "+missing[0]:"Sélectionnez des clips "+(hasV?"vidéo":"audio")+" dans la timeline");' +
      'return "OK|"+applied+"|"+partial+"|"+missing.join(", ");' +
      '}catch(e){return "ERR|"+e;}})()'
    );
  }

  function applyPreset(ev) {
    var req = null;
    try {
      var data = ev && ev.data !== undefined ? ev.data : ev;
      req = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {}
    // la fenêtre cachée et le panneau Cypher écoutent tous les deux : seule celle qui a fourni la liste répond
    if (!req || req.to !== myId()) return;
    loadPresets().then(function (list) {
      var preset = null;
      for (var i = 0; i < list.length; i++) if (list[i].key === req.key) preset = list[i];
      if (!preset) return 'ERR|Preset introuvable (fichier de presets modifié ?)';
      return evalScript(presetScript(preset));
    }).then(function (result) {
      sendCepEvent('com.cypher.console.presetResult', JSON.stringify({ id: req.id, result: result || 'ERR|Premiere ne répond pas' }));
    });
  }

  try {
    var bridge = window.__adobe_cep__;
    if (bridge && bridge.addEventListener) {
      bridge.addEventListener('com.cypher.console.ready', function () {
        sendTheme();
        sendPresets();
      });
      bridge.addEventListener('com.cypher.console.applyPreset', applyPreset);
    }
  } catch (e) {}

  window.addEventListener('unload', stop);
  window.CypherHotkey = { start: start, stop: stop, openConsole: openConsole, sendTheme: sendTheme, parsePresets: parsePresets, presetScript: presetScript };
})();
