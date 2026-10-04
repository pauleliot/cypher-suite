/**
 * Sori - ExtendScript Premiere Pro (2022 -> 2026+)
 * Lecture des images cles des clips selectionnes et injection des courbes calculees par le panneau.
 *
 * Premiere n'expose pas les poignees de Bezier des images cles en script : la courbe est donc
 * "cuite" en images cles lineaires (une par image, une sur deux, ou adaptatives) entre les cles d'origine.
 *
 * IMPORTANT : ce fichier doit rester 100 % ASCII (ExtendScript le lit sans BOM) :
 * les accents des messages sont ecrits en \uXXXX.
 */
#target premierepro

if (typeof JSON !== 'object') { JSON = {}; }
if (typeof JSON.stringify !== 'function') {
    JSON.stringify = function (v) {
        var t = typeof v;
        if (v === null || v === undefined || t === 'function') return 'null';
        if (t === 'number') return isFinite(v) ? String(v) : 'null';
        if (t === 'boolean') return String(v);
        if (t === 'string') {
            return '"' + v.replace(/[\\"\x00-\x1f]/g, function (c) {
                var m = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
                return m[c] || ('\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
            }) + '"';
        }
        var out = [], i, k;
        if (v instanceof Array) {
            for (i = 0; i < v.length; i++) out.push(JSON.stringify(v[i]));
            return '[' + out.join(',') + ']';
        }
        for (k in v) {
            if (v.hasOwnProperty(k) && typeof v[k] !== 'function' && v[k] !== undefined) out.push(JSON.stringify(String(k)) + ':' + JSON.stringify(v[k]));
        }
        return '{' + out.join(',') + '}';
    };
}

$.Sori = (function () {
    var TICKS = 254016000000;
    var LINEAR = 0; // KF_Interp_Mode_Linear
    var T = {
        noProject: 'Aucun projet ouvert',
        noSeq: 'Aucune s\u00e9quence active',
        noSel: 'S\u00e9lectionnez un ou plusieurs clips vid\u00e9o dans la timeline',
        noTransform: 'Effet Transformation introuvable dans Premiere',
        clipGone: 'Clip introuvable (s\u00e9lection modifi\u00e9e ?)'
    };

    function ok(o) { o = o || {}; o.success = true; return JSON.stringify(o); }
    function fail(msg) { return JSON.stringify({ success: false, error: String(msg) }); }
    function errText(e) { return (e && e.message ? e.message : String(e)) + (e && e.line ? ' (ligne ' + e.line + ')' : ''); }

    function seqOrNull() {
        if (!app.project) return null;
        return app.project.activeSequence || null;
    }

    function mkTime(ticks) { var t = new Time(); t.ticks = String(Math.round(Number(ticks))); return t; }
    function ticksOf(t) {
        if (t === null || t === undefined) return 0;
        if (typeof t === 'number') return Math.round(t * TICKS);
        return Number(t.ticks);
    }

    // ---------- Composants & parametres ----------
    function findComp(item, matchName, re) {
        var comps = item.components, i, c;
        for (i = 0; i < comps.numItems; i++) { c = comps[i]; if (c && c.matchName === matchName) return c; }
        if (re) for (i = 0; i < comps.numItems; i++) { c = comps[i]; if (c && re.test(String(c.displayName))) return c; }
        return null;
    }
    function motionComp(item) { return findComp(item, 'AE.ADBE Motion', /^(motion|trajectoire|mouvement)$/i); }
    function opacityComp(item) { return findComp(item, 'AE.ADBE Opacity', /^(opacity|opacit\u00e9)$/i); }

    /** Effet Transformation : nom interne, nom affiche (toutes langues courantes) ou parametre "angle d'obturation" */
    function isTransformComp(c) {
        if (!c) return false;
        var mn = String(c.matchName || ''), dn = String(c.displayName || '');
        if (/geometry/i.test(mn)) return true;
        if (/^(transform|transformer|transformation|transformieren|trasforma|transformar|transformacion|trasformazione)$/.test(norm(dn))) return true;
        if (mn === 'AE.ADBE Motion' || mn === 'AE.ADBE Opacity') return false;
        try {
            var props = c.properties;
            if (props.numItems < 9) return false;
            for (var i = 0; i < props.numItems; i++) {
                var n = String(props[i].displayName);
                if (/shutter|obturat|verschluss|otturatore|obturaci/i.test(n) && !/composition|komposition|composizione|composici/i.test(n)) return true;
            }
        } catch (e) {}
        return false;
    }
    function transformComp(item) {
        var comps = item.components, found = null;
        for (var i = 0; i < comps.numItems; i++) if (isTransformComp(comps[i])) found = comps[i];
        return found;
    }
    /** Liste des effets du clip, pour un message d'erreur exploitable */
    function compList(item) {
        var out = [];
        try { for (var i = 0; i < item.components.numItems; i++) { var c = item.components[i]; out.push(String(c.displayName) + ' [' + String(c.matchName) + ']'); } } catch (e) {}
        return out.join(', ');
    }
    /** Relit le clip dans la sequence (objet frais : la liste des effets est a jour apres un ajout QE) */
    function freshItem(seq, entry) {
        try {
            var clips = seq.videoTracks[entry.track].clips;
            for (var i = 0; i < clips.numItems; i++) if (String(clips[i].nodeId) === entry.id) return clips[i];
        } catch (e) {}
        return entry.item;
    }

    function paramByName(comp, re, fallbackIndex) {
        if (!comp) return null;
        var props = comp.properties, i;
        for (i = 0; i < props.numItems; i++) if (props[i] && re.test(String(props[i].displayName))) return props[i];
        if (fallbackIndex !== undefined && fallbackIndex < props.numItems) return props[fallbackIndex];
        return null;
    }

    // Trajectoire : 0 Position, 1 Echelle, 2 Largeur d'echelle, 3 Echelle uniforme, 4 Rotation, 5 Point d'ancrage
    var MOTION_IDX = { position: 0, scale: 1, scaleWidth: 2, uniform: 3, rotation: 4 };
    function motionParam(item, key) {
        var c = motionComp(item);
        return c && MOTION_IDX[key] < c.properties.numItems ? c.properties[MOTION_IDX[key]] : null;
    }
    function opacityParam(item) { var c = opacityComp(item); return c ? c.properties[0] : null; }

    /**
     * Nom de parametre simplifie : minuscules, sans accents (y compris les accents "combinants" que Premiere
     * peut renvoyer), ponctuation remplacee par des espaces. "Hauteur d'echelle" -> "hauteur d echelle".
     */
    function norm(s) {
        s = String(s || '').toLowerCase().replace(/[\u0300-\u036f]/g, '');
        var map = { a: /[\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5]/g, e: /[\u00e8\u00e9\u00ea\u00eb]/g, i: /[\u00ec\u00ed\u00ee\u00ef]/g,
            o: /[\u00f2\u00f3\u00f4\u00f5\u00f6]/g, u: /[\u00f9\u00fa\u00fb\u00fc]/g, c: /\u00e7/g, n: /\u00f1/g, ss: /\u00df/g };
        for (var k in map) if (map.hasOwnProperty(k)) s = s.replace(map[k], k);
        return s.replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    /** Parametres de Transformation, reconnus sur le nom simplifie (toutes langues courantes) */
    var TR_MATCH = {
        position: function (n) { return n === 'position' || n === 'posicion' || n === 'posizione'; },
        uniform: function (n) { return /uniform/.test(n); },
        scale: function (n) { return /^(scale|scale height|echelle|hauteur d echelle|echelle hauteur|echelle en hauteur|skalierung|hohe skalieren|skalierungshohe|scala|altezza scala|escala|altura de escala)$/.test(n); },
        scaleWidth: function (n) { return /^(scale width|largeur d echelle|echelle largeur|echelle en largeur|breite skalieren|skalierungsbreite|larghezza scala|anchura de escala|ancho de escala)$/.test(n); },
        rotation: function (n) { return /^(rotation|drehung|rotazione|rotacion)$/.test(n); },
        useComp: function (n) { return /composition|komposition|composizione|composicion|utiliser|verwenden|usa |usar /.test(n) && /obtur|shutter|verschluss|otturat/.test(n); },
        shutter: function (n) { return /obtur|shutter|verschluss|otturat/.test(n) && !TR_MATCH.useComp(n); }
    };
    // ordre usuel de l'effet Transformation, en secours si un nom est introuvable
    var TR_INDEX = { position: 1, uniform: 2, scale: 3, scaleWidth: 4, rotation: 7, useComp: 9, shutter: 10 };

    /** Numero du parametre dans l'effet (-1 si introuvable). Toujours par numero : Premiere renvoie un nouvel objet a chaque lecture. */
    function trIndex(comp, key) {
        if (!comp) return -1;
        var props = comp.properties, n = props.numItems, i;
        for (i = 0; i < n; i++) { try { if (TR_MATCH[key](norm(props[i].displayName))) return i; } catch (e) {} }
        if (key === 'scale' || key === 'scaleWidth') {
            // Echelle juste apres la case "Echelle uniforme", largeur juste apres
            var u = trIndex(comp, 'uniform');
            if (u >= 0 && u + (key === 'scale' ? 1 : 2) < n) return u + (key === 'scale' ? 1 : 2);
        }
        return TR_INDEX[key] < n ? TR_INDEX[key] : -1;
    }
    function trParam(comp, key) {
        var i = trIndex(comp, key);
        return i >= 0 ? comp.properties[i] : null;
    }

    function paramFor(item, target, key) {
        if (target === 'opacity') return opacityParam(item);
        if (target === 'transform') return trParam(transformComp(item), key);
        return motionParam(item, key);
    }

    function plainValue(v) {
        if (v && typeof v === 'object' && v.length >= 2) return [Number(v[0]), Number(v[1])];
        if (typeof v === 'boolean') return v;
        return Number(v);
    }

    function keysOf(param) {
        var out = [];
        if (!param) return out;
        try { if (!param.isTimeVarying()) return out; } catch (e) { return out; }
        var ks = param.getKeys();
        if (!ks) return out;
        for (var i = 0; i < ks.length; i++) {
            var t = typeof ks[i] === 'number' ? mkTime(ks[i] * TICKS) : ks[i];
            out.push({ t: ticksOf(t), v: plainValue(param.getValueAtKey(t)) });
        }
        return out;
    }
    function staticValue(param) {
        if (!param) return null;
        try { return plainValue(param.getValue()); } catch (e) { return null; }
    }
    function propInfo(param) {
        if (!param) return null;
        return { keys: keysOf(param), value: staticValue(param) };
    }

    // ---------- Selection ----------
    /** Clips video selectionnes, avec leur piste */
    function selectedVideo(seq) {
        var sel = seq.getSelection(), out = [], i, t, c, tracks = seq.videoTracks;
        var byId = {};
        for (t = 0; t < tracks.numTracks; t++) {
            var clips = tracks[t].clips;
            for (c = 0; c < clips.numItems; c++) {
                try { byId[clips[c].nodeId] = t; } catch (e) {}
            }
        }
        for (i = 0; i < sel.length; i++) {
            var it = sel[i];
            if (!it) continue;
            var id = '';
            try { id = String(it.nodeId); } catch (e2) {}
            if (!(id in byId)) continue; // audio ou autre
            out.push({ item: it, id: id, track: byId[id] });
        }
        return out;
    }

    /** Tous les clips video de la sequence, par nodeId */
    function allVideo(seq) {
        var out = {}, tracks = seq.videoTracks;
        for (var t = 0; t < tracks.numTracks; t++) {
            var clips = tracks[t].clips;
            for (var c = 0; c < clips.numItems; c++) {
                try { out[String(clips[c].nodeId)] = { item: clips[c], id: String(clips[c].nodeId), track: t }; } catch (e) {}
            }
        }
        return out;
    }

    /** Taille de l'image source (pour convertir la position vers l'effet Transformation) */
    function clipFrameSize(item, seq) {
        try {
            var md = String(item.projectItem.getProjectMetadata());
            var m = md.match(/VideoInfo>\s*(\d+)\s*x\s*(\d+)/);
            if (m) return [Number(m[1]), Number(m[2])];
        } catch (e) {}
        return [Number(seq.frameSizeHorizontal), Number(seq.frameSizeVertical)];
    }

    function describe(entry, seq, full) {
        var it = entry.item;
        var o = {
            id: entry.id, name: String(it.name), track: entry.track,
            start: ticksOf(it.start), end: ticksOf(it.end), inPoint: ticksOf(it.inPoint), outPoint: ticksOf(it.outPoint),
            props: {
                position: propInfo(motionParam(it, 'position')),
                scale: propInfo(motionParam(it, 'scale')),
                scaleWidth: propInfo(motionParam(it, 'scaleWidth')),
                rotation: propInfo(motionParam(it, 'rotation')),
                opacity: propInfo(opacityParam(it))
            }
        };
        try { o.uniform = !!motionParam(it, 'uniform').getValue(); } catch (e) { o.uniform = true; }
        if (full) {
            var tr = transformComp(it);
            o.frame = clipFrameSize(it, seq);
            if (tr) {
                // position de Transformation toujours renvoyee en coordonnees normalisees de l'image source
                var pp = trParam(tr, 'position'), pos = propInfo(pp);
                if (pos && posIsPx(pp)) {
                    var f = o.frame, toN = function (v) { return v && typeof v === 'object' ? [v[0] / f[0], v[1] / f[1]] : v; };
                    for (var k = 0; k < pos.keys.length; k++) pos.keys[k].v = toN(pos.keys[k].v);
                    pos.value = toN(pos.value);
                }
                o.transform = { position: pos, scale: propInfo(trParam(tr, 'scale')), rotation: propInfo(trParam(tr, 'rotation')) };
            }
        }
        return o;
    }

    /** Position de Transformation en pixels (sinon normalisee 0..1) : lu sur la valeur ou les cles */
    function posIsPx(param) {
        var big = function (v) { return v && typeof v === 'object' && (Math.abs(v[0]) > 2 || Math.abs(v[1]) > 2); };
        if (big(staticValue(param))) return true;
        var ks = keysOf(param);
        for (var i = 0; i < ks.length; i++) if (big(ks[i].v)) return true;
        return false;
    }

    function sequenceInfo(seq) {
        return {
            name: String(seq.name), ticksPerFrame: Number(seq.timebase),
            width: Number(seq.frameSizeHorizontal), height: Number(seq.frameSizeVertical),
            playhead: ticksOf(seq.getPlayerPosition())
        };
    }

    /** Lecture complete : cles de Position / Echelle / Rotation / Opacite (+ effet Transformation) */
    function readSelection() {
        try {
            var seq = seqOrNull();
            if (!app.project) return fail(T.noProject);
            if (!seq) return fail(T.noSeq);
            var list = selectedVideo(seq), clips = [];
            for (var i = 0; i < list.length; i++) clips.push(describe(list[i], seq, true));
            return ok({ seq: sequenceInfo(seq), clips: clips });
        } catch (e) { return fail(errText(e)); }
    }

    /** Lecture complete d'un seul clip (bande des images cles du panneau) */
    function readClip(id) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var entry = allVideo(seq)[String(id)];
            if (!entry) return fail('Clip introuvable');
            return ok({ seq: sequenceInfo(seq), clip: describe(entry, seq, true) });
        } catch (e) { return fail(errText(e)); }
    }

    /** Resume leger pour la barre de selection (appele regulierement) */
    function summary() {
        try {
            var seq = seqOrNull();
            if (!seq) return ok({ seq: null, clips: [] });
            var list = selectedVideo(seq), clips = [];
            for (var i = 0; i < list.length && i < 50; i++) {
                var it = list[i].item, counts = {}, spans = {}, trCounts = {}, mCounts = {};
                var tr = transformComp(it);
                var keys = { position: motionParam(it, 'position'), scale: motionParam(it, 'scale'), rotation: motionParam(it, 'rotation'), opacity: opacityParam(it) };
                for (var k in keys) {
                    if (!keys.hasOwnProperty(k)) continue;
                    var n = 0, ks = null, param = keys[k];
                    // propriete animee sur Transformation plutot que sur la Trajectoire
                    if (k !== 'opacity' && tr) {
                        var tp = trParam(tr, k), tn = 0;
                        try { if (tp && tp.isTimeVarying()) tn = tp.getKeys().length; } catch (e3) {}
                        trCounts[k] = tn;
                    }
                    try { if (param && param.isTimeVarying()) { ks = param.getKeys(); n = ks.length; } } catch (e) {}
                    mCounts[k] = n;
                    if (n < 2 && trCounts[k] >= 2) {
                        try { param = trParam(tr, k); ks = param.getKeys(); n = ks.length; } catch (e4) {}
                    }
                    counts[k] = n;
                    // duree entre la premiere et la derniere cle : sert d'echelle de temps a l'editeur
                    if (n >= 2) spans[k] = ticksOf(typeof ks[n - 1] === 'number' ? mkTime(ks[n - 1] * TICKS) : ks[n - 1]) - ticksOf(typeof ks[0] === 'number' ? mkTime(ks[0] * TICKS) : ks[0]);
                }
                clips.push({ id: list[i].id, name: String(it.name), counts: counts, mCounts: mCounts, trCounts: trCounts, spans: spans, start: ticksOf(it.start) });
            }
            return ok({ seq: { name: String(seq.name), ticksPerFrame: Number(seq.timebase) }, clips: clips, total: list.length });
        } catch (e2) { return fail(errText(e2)); }
    }

    // ---------- Effet Transformation (flou de mouvement) ----------
    function qeItemFor(seq, entry) {
        app.enableQE();
        var qs = qe.project.getActiveSequence();
        if (!qs) return null;
        var qt = qs.getVideoTrackAt(entry.track);
        var start = ticksOf(entry.item.start), name = String(entry.item.name), byName = null;
        for (var i = 0; i < qt.numItems; i++) {
            var qi = qt.getItemAt(i);
            if (!qi || qi.type === 'Empty') continue;
            var qs0 = null;
            try { qs0 = Number(qi.start.ticks); } catch (e) {}
            if (qs0 === start) return qi;
            if (!byName && String(qi.name) === name) byName = qi;
        }
        return byName;
    }
    var TR_NAMES = /^(transform|transformer|transformation|transformieren|trasforma|transformar|transformacja|transformeren)$/i;

    /**
     * Noms a essayer pour l'effet Transformation, dans la langue de Premiere : d'abord ceux de la liste
     * d'effets de Premiere (noms reels, traduits), puis les noms usuels. seen = noms "transform..." trouves.
     */
    function transformNames(seen) {
        app.enableQE();
        var out = [], add = function (n) { for (var k = 0; k < out.length; k++) if (out[k] === n) return; out.push(n); };
        try {
            var list = qe.project.getVideoEffectList(), j, n;
            if (typeof list === 'string') list = list.split(/[,\n;]/);
            for (j = 0; j < list.length; j++) {
                n = String(list[j]).replace(/^\s+|\s+$/g, '');
                if (/transform/i.test(n)) seen.push(n);
                if (TR_NAMES.test(n)) add(n);
            }
        } catch (e) {}
        var usual = ['Transform', 'Transformer', 'Transformation', 'Transformieren', 'Trasforma', 'Transformar'];
        for (var i = 0; i < usual.length; i++) add(usual[i]);
        return out;
    }
    function setChecked(param, on) {
        if (!param) return;
        try { param.setValue(on, true); } catch (e) { try { param.setValue(on ? 1 : 0, true); } catch (e2) {} }
    }
    function ensureTransform(seq, entry, shutter) {
        var tr = transformComp(entry.item);
        if (!tr) {
            var qi = qeItemFor(seq, entry);
            if (!qi) throw new Error(T.clipGone);
            var seen = [], names = transformNames(seen), tries = [];
            // chaque nom est essaye, et l'ajout verifie sur le clip : un nom inconnu ne fait rien sans erreur
            for (var i = 0; i < names.length && !tr; i++) {
                var fx = null, before = freshItem(seq, entry).components.numItems;
                try { fx = qe.project.getVideoEffectByName(names[i]); } catch (e1) {}
                if (!fx) { tries.push(names[i] + ' : inconnu'); continue; }
                try { qi.addVideoEffect(fx); } catch (e2) { tries.push(names[i] + ' : ' + errText(e2)); continue; }
                try { $.sleep(40); } catch (e3) {}
                entry.item = freshItem(seq, entry);
                tr = transformComp(entry.item);
                // effet ajoute mais non reconnu par son nom : le dernier composant apparu est le bon
                if (!tr && entry.item.components.numItems > before) tr = entry.item.components[entry.item.components.numItems - 1];
                if (!tr) tries.push(names[i] + ' : rien ajout\u00e9');
            }
            if (!tr) {
                throw new Error(T.noTransform + '. Essais : ' + tries.join(', ') +
                    '. Effets "transform" de Premiere : ' + (seen.length ? seen.join(', ') : 'aucun') +
                    '. Clip QE : ' + String(qi.name) + '. Effets du clip : ' + compList(entry.item));
            }
        }
        setChecked(trParam(tr, 'uniform'), true);
        setChecked(trParam(tr, 'useComp'), false);
        var sh = trParam(tr, 'shutter');
        if (sh) { try { sh.setTimeVarying(false); } catch (e3) {} try { sh.setValue(Number(shutter), true); } catch (e4) {} }
        return tr;
    }

    /** Convertisseur : position normalisee de l'image source -> unite du parametre Position de Transformation */
    function trPosConv(param, frame) {
        var px = posIsPx(param);
        return function (v) { return px ? [v[0] * frame[0], v[1] * frame[1]] : [v[0], v[1]]; };
    }

    // ---------- Ecriture ----------
    function clearKeys(param) {
        if (!param) return;
        try { if (param.isTimeVarying()) param.setTimeVarying(false); } catch (e) {}
    }

    function writeKeys(param, keys, conv) {
        if (!param.isTimeVarying()) param.setTimeVarying(true);
        // anciennes cles (celles d'origine, une ancienne cuisson, ou celle que setTimeVarying pose a la tete de lecture)
        var existing = param.getKeys() || [], wanted = {}, i, r;
        for (i = 0; i < keys.length; i++) {
            var t = mkTime(keys[i][0]), v = conv ? conv(keys[i][1]) : keys[i][1];
            wanted[t.ticks] = true;
            param.addKey(t);
            // updateUI = true a chaque ecriture : sinon l'interface et l'historique d'annulation de Premiere
            // se desynchronisent, et un Ctrl+Z peut faire planter Premiere
            param.setValueAtKey(t, v, true);
            try { param.setInterpolationTypeAtKey(t, LINEAR, true); } catch (e) {}
        }
        // retirees apres coup : le parametre ne perd jamais son animation en cours d'ecriture
        for (r = existing.length - 1; r >= 0; r--) {
            var old = typeof existing[r] === 'number' ? mkTime(existing[r] * TICKS) : existing[r];
            if (!wanted[String(ticksOf(old))]) { try { param.removeKey(old); } catch (e0) {} }
        }
        if (keys.length) { try { var lt = mkTime(keys[keys.length - 1][0]); param.setValueAtKey(lt, conv ? conv(keys[keys.length - 1][1]) : keys[keys.length - 1][1], true); } catch (e1) {} }
    }

    /**
     * plan = { shutter: 180, clips: [{ id, ops: [{ target: 'motion'|'opacity'|'transform', prop, keys: [[ticks, v]], staticValue?, reset? }] }] }
     * target 'transform' + prop 'position' : valeurs normalisees dans l'image source (0.5, 0.5 = centre).
     */
    function applyPlan(planJson) {
        try {
            var plan = eval('(' + planJson + ')');
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            // clips retrouves dans toute la sequence (une annulation doit marcher meme si la selection a change)
            var byId = allVideo(seq), i, j;
            var done = 0, keysWritten = 0, errors = [], trDiag = null;
            for (i = 0; i < plan.clips.length; i++) {
                var pc = plan.clips[i], entry = byId[pc.id];
                if (!entry) { errors.push(T.clipGone); continue; }
                try {
                    var needTr = false;
                    // restauration (plan.noSetup) : on n'ajoute jamais d'effet et on ne touche pas a ses reglages
                    if (!plan.noSetup) for (j = 0; j < pc.ops.length; j++) if (pc.ops[j].target === 'transform' && !pc.ops[j].reset) needTr = true;
                    var tr = needTr ? ensureTransform(seq, entry, plan.shutter || 180) : transformComp(entry.item);
                    var frame = clipFrameSize(entry.item, seq);
                    for (j = 0; j < pc.ops.length; j++) {
                        var op = pc.ops[j];
                        var param = op.target === 'transform' ? trParam(tr, op.prop) : paramFor(entry.item, op.target, op.prop);
                        if (!param) { if (!op.reset && !op.optional) errors.push(String(entry.item.name) + ' : ' + op.prop + ' introuvable'); continue; }
                        // Transformation : seule "Hauteur d'echelle" (affichee "Echelle" en echelle uniforme) est ecrite.
                        // La largeur est grisee en echelle uniforme : d'anciennes cles posees dessus sont retirees.
                        if (op.target === 'transform' && op.prop === 'scale') {
                            var sw = trIndex(tr, 'scaleWidth');
                            if (sw >= 0 && sw !== trIndex(tr, 'scale')) {
                                var wp = tr.properties[sw];
                                try { if (wp.isTimeVarying()) { wp.setTimeVarying(false); wp.setValue(100, true); } } catch (ew) {}
                            }
                        }
                        // l'unite (pixels / normalise) est lue avant toute ecriture
                        var conv = op.target === 'transform' && op.prop === 'position' ? trPosConv(param, frame) : null;
                        if (op.reset) {
                            clearKeys(param);
                            var neutral = op.prop === 'position' ? conv([0.5, 0.5]) : op.prop === 'scale' || op.prop === 'scaleWidth' ? 100 : 0;
                            try { param.setValue(neutral, true); } catch (e5) {}
                            continue;
                        }
                        if (op.keys && op.keys.length) {
                            writeKeys(param, op.keys, conv);
                            keysWritten += op.keys.length;
                        } else if (op.staticValue !== undefined && op.staticValue !== null) {
                            clearKeys(param);
                            try { param.setValue(conv ? conv(op.staticValue) : op.staticValue, true); } catch (e6) {}
                        }
                    }
                    // diagnostic : noms des parametres de Transformation tels que le script les voit
                    if (!trDiag && tr) {
                        var tn = [];
                        for (var q = 0; q < tr.properties.numItems; q++) tn.push(String(tr.properties[q].displayName));
                        trDiag = { comp: String(tr.displayName) + ' [' + String(tr.matchName) + ']', names: tn, scale: trIndex(tr, 'scale'), width: trIndex(tr, 'scaleWidth'),
                            position: trIndex(tr, 'position'), rotation: trIndex(tr, 'rotation'), shutter: trIndex(tr, 'shutter') };
                    }
                    done++;
                } catch (ec) { errors.push(String(entry.item.name) + ' : ' + errText(ec)); }
            }
            return ok({ clips: done, keys: keysWritten, errors: errors, trDiag: trDiag });
        } catch (e) { return fail(errText(e)); }
    }

    // rev : a augmenter a chaque modification, le panneau recharge alors ce fichier sans redemarrer Premiere
    return { rev: 12, readSelection: readSelection, readClip: readClip, summary: summary, applyPlan: applyPlan };
})();
