/**
 * Kiru - ExtendScript Premiere Pro (2022 -> 2026+)
 * Autocut : lecture des pistes de la sequence, export audio de secours, puis coupe des silences
 * (lame QE sur toutes les pistes deverrouillees, suppression des morceaux silencieux, recollage).
 *
 * Toutes les operations de coupe sont idempotentes : le panneau peut les envoyer par lots
 * (progression affichee) sans risque si un lot est rejoue.
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

$.Kiru = (function () {
    var TICKS = 254016000000;
    var T = {
        noProject: 'Aucun projet ouvert',
        noSeq: 'Aucune s\u00e9quence active',
        noPreset: 'Preset d\'export WAV introuvable dans Premiere',
        cloneFail: 'Impossible de dupliquer la s\u00e9quence',
        exportFail: 'Export audio impossible'
    };

    function ok(o) { o = o || {}; o.success = true; return JSON.stringify(o); }
    function fail(msg) { return JSON.stringify({ success: false, error: String(msg) }); }
    function errText(e) { return (e && e.message ? e.message : String(e)) + (e && e.line ? ' (ligne ' + e.line + ')' : ''); }
    function parse(json) { return eval('(' + json + ')'); }

    function seqOrNull() {
        if (!app.project) return null;
        return app.project.activeSequence || null;
    }
    function mkTime(ticks) { var t = new Time(); t.ticks = String(Math.round(Number(ticks))); return t; }
    function ticksOf(t) {
        if (t === null || t === undefined) return 0;
        if (typeof t === 'number') return Math.round(t * TICKS);
        if (typeof t === 'string') return Number(t);
        return Number(t.ticks);
    }
    function locked(track) { try { return !!track.isLocked(); } catch (e) { return false; } }
    function muted(track) { try { return !!track.isMuted(); } catch (e) { return false; } }

    function sequenceInfo(seq) {
        var inT = 0, outT = 0;
        try { inT = ticksOf(seq.getInPointAsTime()); outT = ticksOf(seq.getOutPointAsTime()); } catch (e) {}
        var end = ticksOf(seq.end), w = 1920, h = 1080, proj = '';
        try { w = Number(seq.frameSizeHorizontal) || w; h = Number(seq.frameSizeVertical) || h; } catch (e2) {}
        try { proj = String(app.project.path || ''); } catch (e3) {}
        return {
            id: String(seq.sequenceID), name: String(seq.name),
            ticksPerFrame: Number(seq.timebase), end: end,
            inPoint: inT, outPoint: outT > inT && outT < end ? outT : 0,
            width: w, height: h, project: proj
        };
    }

    function trackList(tracks) {
        var out = [];
        for (var i = 0; i < tracks.numTracks; i++) {
            var t = tracks[i], n = 0;
            try { n = t.clips.numItems; } catch (e) {}
            out.push({ index: i, name: String(t.name), clips: n, locked: locked(t), muted: muted(t) });
        }
        return out;
    }

    /** Resume leger : sequence active, pistes audio / video (appele regulierement) */
    function summary() {
        try {
            if (!app.project) return fail(T.noProject);
            var seq = seqOrNull();
            if (!seq) return ok({ seq: null });
            return ok({ seq: sequenceInfo(seq), audio: trackList(seq.audioTracks), video: trackList(seq.videoTracks) });
        } catch (e) { return fail(errText(e)); }
    }

    /** Clips des pistes audio analysees : position dans la sequence, point d'entree source, vitesse, fichier */
    function readTracks(listJson) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var list = parse(listJson), clips = [];
            for (var k = 0; k < list.length; k++) {
                var idx = list[k];
                if (idx >= seq.audioTracks.numTracks) continue;
                var tr = seq.audioTracks[idx];
                for (var i = 0; i < tr.clips.numItems; i++) {
                    var it = tr.clips[i], path = '', speed = 1, nested = false, disabled = false;
                    try { path = String(it.projectItem.getMediaPath() || ''); } catch (e1) {}
                    try { nested = !!it.projectItem.isSequence(); } catch (e2) {}
                    try { speed = Number(it.getSpeed()) || 1; } catch (e3) {}
                    try { disabled = !!it.disabled; } catch (e4) {}
                    clips.push({
                        track: idx, name: String(it.name), path: path, nested: nested, disabled: disabled,
                        start: ticksOf(it.start), end: ticksOf(it.end), inPoint: ticksOf(it.inPoint), speed: speed
                    });
                }
            }
            return ok({ seq: sequenceInfo(seq), clips: clips });
        } catch (e) { return fail(errText(e)); }
    }

    // ---------- Export audio (secours quand un media ne peut pas etre lu par le panneau) ----------
    function findPresets(folder, depth, out) {
        if (!folder || !folder.exists || depth < 0) return;
        var items = folder.getFiles();
        for (var i = 0; i < items.length; i++) {
            var f = items[i];
            if (f instanceof Folder) findPresets(f, depth - 1, out);
            else if (/\.epr$/i.test(f.name) && /57415645|wav/i.test(decodeURI(f.fsName))) out.push(f.fsName);
        }
    }
    /** Presets "Waveform Audio" fournis avec Premiere (dossier MediaIO/systempresets, format WAVE = 57415645) */
    function wavPreset() {
        try {
            var roots = [], out = [];
            try { roots.push(new Folder(app.path + '/MediaIO/systempresets')); } catch (e) {}
            try { roots.push(new Folder(Folder.appPackage.fsName + '/MediaIO/systempresets')); } catch (e2) {}
            try { roots.push(new Folder(app.path + '/Contents/MediaIO/systempresets')); } catch (e3) {}
            for (var i = 0; i < roots.length && !out.length; i++) findPresets(roots[i], 3, out);
            // 48 kHz 16 bits de preference (le plus courant), sinon le premier
            var best = out.length ? out[0] : '';
            for (var j = 0; j < out.length; j++) if (/48/.test(out[j]) && /16/.test(out[j])) { best = out[j]; break; }
            return ok({ preset: best, all: out });
        } catch (e4) { return fail(errText(e4)); }
    }

    /**
     * Mixage des seules pistes analysees, exporte en WAV : les autres pistes audio sont coupees (mute)
     * le temps de l'export, puis remises comme avant.
     */
    function exportAudio(outPath, presetPath, keepJson) {
        var seq = seqOrNull(), restore = [];
        try {
            if (!seq) return fail(T.noSeq);
            if (!presetPath || !new File(presetPath).exists) return fail(T.noPreset);
            var keep = parse(keepJson), keepMap = {};
            for (var k = 0; k < keep.length; k++) keepMap[keep[k]] = true;
            for (var i = 0; i < seq.audioTracks.numTracks; i++) {
                var tr = seq.audioTracks[i], m = muted(tr), want = !keepMap[i];
                if (m !== want) { try { tr.setMute(want ? 1 : 0); restore.push([i, m]); } catch (e) {} }
            }
            var f = new File(outPath);
            if (f.exists) f.remove();
            seq.exportAsMediaDirect(outPath, presetPath, 0);
            if (!new File(outPath).exists) return fail(T.exportFail);
            return ok({ path: outPath });
        } catch (e2) {
            return fail(T.exportFail + ' : ' + errText(e2));
        } finally {
            for (var r = 0; r < restore.length; r++) { try { seq.audioTracks[restore[r][0]].setMute(restore[r][1] ? 1 : 0); } catch (e3) {} }
        }
    }

    // ---------- Copie de securite de la sequence ----------
    function cloneSequence(suffix) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var before = {}, i, all = app.project.sequences;
            for (i = 0; i < all.numSequences; i++) before[String(all[i].sequenceID)] = true;
            var name = String(seq.name);
            seq.clone();
            all = app.project.sequences;
            var copy = null;
            for (i = 0; i < all.numSequences; i++) if (!before[String(all[i].sequenceID)]) copy = all[i];
            if (!copy) return fail(T.cloneFail);
            try { copy.name = name + ' ' + suffix; } catch (e) {}
            app.project.openSequence(copy.sequenceID);
            var act = seqOrNull();
            if (!act || String(act.sequenceID) !== String(copy.sequenceID)) return fail(T.cloneFail + ' (ouverture)');
            return ok({ seq: sequenceInfo(act) });
        } catch (e2) { return fail(errText(e2)); }
    }

    // ---------- Coupe ----------
    /** Pistes modifiables (deverrouillees) : [{ dom, qe, kind, index }] */
    function editableTracks(seq) {
        app.enableQE();
        var qs = qe.project.getActiveSequence(), out = [], i;
        for (i = 0; i < seq.videoTracks.numTracks; i++) {
            if (!locked(seq.videoTracks[i])) out.push({ dom: seq.videoTracks[i], qe: qs ? qs.getVideoTrackAt(i) : null, kind: 'v', index: i });
        }
        for (i = 0; i < seq.audioTracks.numTracks; i++) {
            if (!locked(seq.audioTracks[i])) out.push({ dom: seq.audioTracks[i], qe: qs ? qs.getAudioTrackAt(i) : null, kind: 'a', index: i });
        }
        return out;
    }
    function spansOf(track) {
        var out = [], clips = track.clips;
        for (var i = 0; i < clips.numItems; i++) out.push([ticksOf(clips[i].start), ticksOf(clips[i].end)]);
        return out;
    }

    /** Coups de lame aux temps donnes (ticks), sur chaque piste deverrouillee ou un clip couvre ce temps */
    function razor(timesJson) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var times = parse(timesJson), tpf = Number(seq.timebase), half = tpf / 2;
            var st = seq.getSettings(), tracks = editableTracks(seq), cuts = 0, errors = [];
            for (var k = 0; k < tracks.length; k++) {
                var tr = tracks[k];
                if (!tr.qe) continue;
                var spans = spansOf(tr.dom);
                for (var j = 0; j < times.length; j++) {
                    var t = times[j], inside = false;
                    for (var s = 0; s < spans.length; s++) if (spans[s][0] + half < t && t < spans[s][1] - half) { inside = true; break; }
                    if (!inside) continue;
                    try {
                        tr.qe.razor(mkTime(t).getFormatted(st.videoFrameRate, st.videoDisplayFormat));
                        cuts++;
                    } catch (e) { if (errors.length < 5) errors.push(tr.kind.toUpperCase() + (tr.index + 1) + ' : ' + errText(e)); }
                }
            }
            return ok({ cuts: cuts, errors: errors });
        } catch (e2) { return fail(errText(e2)); }
    }

    /**
     * Coups de lame calcules par le panneau : [{ k: 'v'|'a', t: piste, times: [ticks] }]. Aucune lecture des
     * clips ici (chaque lecture de propriete coute cher dans Premiere) : le panneau a deja ecarte les temps
     * hors clip ou deja sur un raccord.
     */
    function razorPlan(planJson) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var t0 = new Date().getTime(), plan = parse(planJson), st = seq.getSettings(), cuts = 0, errors = [];
            app.enableQE();
            var qs = qe.project.getActiveSequence();
            if (!qs) return fail(T.noSeq);
            for (var k = 0; k < plan.length; k++) {
                var p = plan[k], qt = p.k === 'v' ? qs.getVideoTrackAt(p.t) : qs.getAudioTrackAt(p.t);
                for (var j = 0; j < p.times.length; j++) {
                    try { qt.razor(mkTime(p.times[j]).getFormatted(st.videoFrameRate, st.videoDisplayFormat)); cuts++; }
                    catch (e) { if (errors.length < 5) errors.push(p.k.toUpperCase() + (p.t + 1) + ' : ' + errText(e)); }
                }
            }
            return ok({ cuts: cuts, errors: errors, ms: new Date().getTime() - t0 });
        } catch (e2) { return fail(errText(e2)); }
    }

    /** Supprime (sans recoller) les morceaux entierement compris dans les plages [debut, fin] (triees) */
    function removeRanges(rangesJson) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var t0 = new Date().getTime();
            var ranges = parse(rangesJson), tol = Number(seq.timebase) / 2, removed = 0, errors = [];
            ranges.sort(function (a, b) { return a[0] - b[0]; });
            var tracks = editableTracks(seq);
            for (var k = 0; k < tracks.length; k++) {
                var clips = tracks[k].dom.clips;
                for (var i = clips.numItems - 1; i >= 0; i--) {
                    var it = clips[i], s = ticksOf(it.start);
                    // plage qui commence juste avant ce clip : recherche dichotomique
                    var lo = 0, hi = ranges.length - 1, r = -1;
                    while (lo <= hi) { var m = (lo + hi) >> 1; if (ranges[m][0] - tol <= s) { r = m; lo = m + 1; } else hi = m - 1; }
                    if (r < 0 || s > ranges[r][1]) continue;
                    if (ticksOf(it.end) <= ranges[r][1] + tol) {
                        try { it.remove(false, false); removed++; } catch (e1) { if (errors.length < 5) errors.push(errText(e1)); }
                    }
                }
            }
            return ok({ removed: removed, errors: errors, ms: new Date().getTime() - t0 });
        } catch (e2) { return fail(errText(e2)); }
    }

    /** Tous les clips des pistes deverrouillees : identifiant et position (avant recollage) */
    function snapshot() {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var tracks = editableTracks(seq), items = [];
            for (var k = 0; k < tracks.length; k++) {
                var clips = tracks[k].dom.clips;
                for (var i = 0; i < clips.numItems; i++) {
                    items.push({ id: String(clips[i].nodeId), s: ticksOf(clips[i].start), e: ticksOf(clips[i].end), k: tracks[k].kind, t: tracks[k].index });
                }
            }
            return ok({ items: items, ticksPerFrame: Number(seq.timebase) });
        } catch (e) { return fail(errText(e)); }
    }

    var moveMode = ''; // 'rel' ou 'abs' : TrackItem.move() decale le clip (rel) ; detecte au premier deplacement
    /**
     * Place chaque clip a son debut cible (ticks). Relit la position avant chaque deplacement : un clip lie deja
     * entraine par son partenaire n'est pas deplace deux fois. Ordre croissant : aucun chevauchement.
     */
    function moveItems(listJson) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var list = parse(listJson), tol = Number(seq.timebase) / 2, map = {}, moved = 0, errors = [];
            var tracks = editableTracks(seq);
            for (var k = 0; k < tracks.length; k++) {
                var clips = tracks[k].dom.clips;
                for (var i = 0; i < clips.numItems; i++) map[String(clips[i].nodeId)] = clips[i];
            }
            for (var j = 0; j < list.length; j++) {
                var it = map[list[j].id];
                if (!it) continue;
                var target = list[j].target, cur = ticksOf(it.start);
                if (Math.abs(cur - target) <= tol) continue;
                try {
                    if (moveMode === 'abs') it.move(mkTime(target));
                    else {
                        it.move(mkTime(target - cur));
                        if (!moveMode) {
                            var now = ticksOf(it.start);
                            if (Math.abs(now - target) <= tol) moveMode = 'rel';
                            else if (Math.abs(now - (target - cur)) <= tol) { moveMode = 'abs'; it.move(mkTime(target)); }
                        }
                    }
                    moved++;
                } catch (e1) { if (errors.length < 5) errors.push(String(it.name) + ' : ' + errText(e1)); }
            }
            return ok({ moved: moved, errors: errors, mode: moveMode });
        } catch (e2) { return fail(errText(e2)); }
    }

    /**
     * Marqueurs de sequence : [[debut, fin, nom?]] en ticks (fin = debut : marqueur ponctuel).
     * kind 'chapter' : marqueurs de chapitre (repris a l'export YouTube).
     */
    function addMarkers(rangesJson, label, color, kind) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var ranges = parse(rangesJson), n = 0;
            for (var i = 0; i < ranges.length; i++) {
                var m = seq.markers.createMarker(ranges[i][0] / TICKS);
                if (!m) continue;
                if (ranges[i][1] > ranges[i][0]) { try { m.end = ranges[i][1] / TICKS; } catch (e) {} }
                try { m.name = ranges[i][2] || label; } catch (e2) {}
                try { m.setColorByIndex(color); } catch (e3) {}
                if (kind === 'chapter') { try { m.setTypeAsChapter(); } catch (e5) {} }
                n++;
            }
            return ok({ markers: n });
        } catch (e4) { return fail(errText(e4)); }
    }

    // ---------- Sous-titres ----------
    function findBin(name) {
        var root = app.project.rootItem;
        for (var i = 0; i < root.children.numItems; i++) {
            var c = root.children[i];
            if (c && String(c.name) === name && c.type === 2) return c;
        }
        return null;
    }
    function normPath(p) { return String(p || '').replace(/\\/g, '/').toLowerCase(); }

    /** Piste video libre pour les sous-titres : la plus haute sans clip sur [debut, fin], sinon une nouvelle piste */
    function captionTrack(startTicks, endTicks, want) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var vt = seq.videoTracks;
            if (want >= 0 && want < vt.numTracks) return ok({ track: want, created: false });
            var top = vt.numTracks - 1;
            if (top >= 1 && !locked(vt[top])) {
                var clips = vt[top].clips, busy = false;
                for (var i = 0; i < clips.numItems; i++) {
                    if (ticksOf(clips[i].start) < endTicks && ticksOf(clips[i].end) > startTicks) { busy = true; break; }
                }
                if (!busy) return ok({ track: top, created: false });
            }
            app.enableQE();
            var before = vt.numTracks;
            try { qe.project.getActiveSequence().addTracks(1, before, 0); } catch (e) {}
            seq = seqOrNull();
            if (seq.videoTracks.numTracks > before) return ok({ track: seq.videoTracks.numTracks - 1, created: true });
            return fail('Impossible d\'ajouter une piste vid\u00e9o : ajoutez une piste vide puis choisissez-la');
        } catch (e2) { return fail(errText(e2)); }
    }

    /** Importe des fichiers dans un nouveau chutier (cree s'il n'existe pas) */
    function importFiles(listJson, binName) {
        try {
            if (!app.project) return fail(T.noProject);
            var files = parse(listJson), bin = findBin(binName);
            if (!bin) { app.project.rootItem.createBin(binName); bin = findBin(binName); }
            if (!bin) return fail('Chutier impossible \u00e0 cr\u00e9er');
            app.project.importFiles(files, true, bin, false);
            return ok({ count: bin.children.numItems });
        } catch (e) { return fail(errText(e)); }
    }

    /**
     * Pose les images fixes du chutier sur la piste : [{ f: fichier, s, e }] (ticks). Duree reglee par le
     * point de sortie du media, puis verifiee sur le clip pose (fin corrigee si besoin).
     */
    function placeStills(binName, trackIdx, itemsJson) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var items = parse(itemsJson), bin = findBin(binName), tr = seq.videoTracks[trackIdx];
            if (!bin) return fail('Chutier introuvable : ' + binName);
            if (!tr) return fail('Piste introuvable');
            var map = {}, i, placed = 0, errors = [], tol = Number(seq.timebase) / 2;
            for (i = 0; i < bin.children.numItems; i++) {
                var c = bin.children[i];
                try { map[normPath(c.getMediaPath())] = c; } catch (e) {}
            }
            for (i = 0; i < items.length; i++) {
                var it = items[i], pi = map[normPath(it.f)];
                if (!pi) { if (errors.length < 5) errors.push('image absente : ' + it.f); continue; }
                var dur = it.e - it.s;
                try { pi.setInPoint(mkTime(0), 4); } catch (e1) {}
                try { pi.setOutPoint(mkTime(dur), 4); } catch (e2) { try { pi.setOutPoint(dur / TICKS, 4); } catch (e3) {} }
                try { tr.overwriteClip(pi, mkTime(it.s)); } catch (e4) {
                    try { tr.overwriteClip(pi, String(it.s / TICKS)); } catch (e5) { if (errors.length < 5) errors.push(errText(e5)); continue; }
                }
                // clip pose : en general le dernier de la piste (pose dans l'ordre)
                var clips = tr.clips, got = null;
                for (var k = clips.numItems - 1; k >= 0 && k >= clips.numItems - 4; k--) {
                    if (Math.abs(ticksOf(clips[k].start) - it.s) <= tol) { got = clips[k]; break; }
                }
                if (got && Math.abs(ticksOf(got.end) - it.e) > tol) { try { got.end = mkTime(it.e); } catch (e6) {} }
                placed++;
            }
            return ok({ placed: placed, errors: errors });
        } catch (e7) { return fail(errText(e7)); }
    }

    /** Valeur d'un parametre de modele (.mogrt) : texte, couleur [r,g,b] 0-255, nombre ou case a cocher */
    function setMgtParam(comp, name, v) {
        var p = null;
        try { p = comp.properties.getParamForDisplayName(name); } catch (e) {}
        if (!p) return false;
        if (v && typeof v === 'object' && !(v instanceof Array)) {
            // texte + police (nom PostScript) : la police est acceptee meme si le modele ne l'expose pas
            var c0 = null, o0 = null;
            try { c0 = p.getValue(); } catch (e4) {}
            try { o0 = eval('(' + c0 + ')'); } catch (e5) { o0 = null; }
            if (!o0 || typeof o0 !== 'object') { p.setValue(String(v.text), true); return true; }
            o0.textEditValue = String(v.text);
            if (v.font) { o0.fontEditValue = [String(v.font)]; o0.capPropFontEdit = true; }
            p.setValue(JSON.stringify(o0), true);
            return true;
        }
        if (typeof v === 'string') {
            // texte d'un modele After Effects : JSON { textEditValue, ... } (police et taille gardees)
            var cur = null, o = null;
            try { cur = p.getValue(); } catch (e1) {}
            try { o = eval('(' + cur + ')'); } catch (e2) { o = null; }
            if (o && typeof o === 'object') { o.textEditValue = v; p.setValue(JSON.stringify(o), true); }
            else p.setValue(v, true);
        } else if (v instanceof Array) {
            p.setColorValue(255, Math.round(v[0]), Math.round(v[1]), Math.round(v[2]), true);
        } else {
            p.setValue(v, true);
            // Premiere borne les curseurs venus d'After Effects : une valeur refusee est signalee
            if (typeof v === 'number') { try { if (Math.abs(Number(p.getValue()) - v) > 0.5) return 'clamped'; } catch (e3) {} }
        }
        return true;
    }

    /**
     * Sous-titres modifiables : un clip du modele par bloc. items = [{ s, e (ticks), p: { nom: valeur } }].
     * scale : echelle du clip (composition 1920 x 1920 ramenee a la taille de la sequence).
     */
    function placeMogrts(mogrtPath, trackIdx, scale, itemsJson) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            if (!new File(mogrtPath).exists) return fail('Mod\u00e8le introuvable : ' + mogrtPath);
            var items = parse(itemsJson), placed = 0, missing = {}, clamped = {}, errors = [];
            for (var i = 0; i < items.length; i++) {
                var it = items[i], ti = null;
                try { ti = seq.importMGT(mogrtPath, String(Math.round(it.s)), trackIdx, 0); } catch (e1) { if (errors.length < 5) errors.push(errText(e1)); continue; }
                if (!ti) { if (errors.length < 5) errors.push('importMGT : rien de pos\u00e9'); continue; }
                try { ti.end = mkTime(it.e); } catch (e2) {}
                var comp = null;
                try { comp = ti.getMGTComponent(); } catch (e3) {}
                if (comp) {
                    for (var k in it.p) if (it.p.hasOwnProperty(k)) {
                        var r = setMgtParam(comp, k, it.p[k]);
                        if (!r) missing[k] = true; else if (r === 'clamped') clamped[k] = true;
                    }
                }
                if (scale && Math.abs(scale - 100) > 0.01) {
                    try { var mo = ti.components; for (var c = 0; c < mo.numItems; c++) if (mo[c].matchName === 'AE.ADBE Motion') { mo[c].properties[1].setValue(scale, true); break; } } catch (e4) {}
                }
                placed++;
            }
            var miss = [];
            for (var m in missing) if (missing.hasOwnProperty(m)) miss.push(m);
            var cl = [];
            for (var q in clamped) if (clamped.hasOwnProperty(q)) cl.push(q);
            return ok({ placed: placed, missing: miss, clamped: cl, errors: errors });
        } catch (e5) { return fail(errText(e5)); }
    }

    /** Noms des parametres du modele (verification) */
    function mogrtParams(mogrtPath, trackIdx) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var ti = seq.importMGT(mogrtPath, '0', trackIdx, 0), out = [];
            var comp = ti.getMGTComponent();
            for (var i = 0; i < comp.properties.numItems; i++) { var p = comp.properties[i]; var v = ''; try { v = String(p.getValue()); } catch (e) {} out.push([String(p.displayName), v.slice(0, 200)]); }
            ti.remove(false, false);
            return ok({ params: out });
        } catch (e2) { return fail(errText(e2)); }
    }

    /** Sous-titres Premiere (piste de sous-titres modifiable) a partir d'un fichier SRT */
    function srtCaptions(srtPath, binName) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            var r = parse(importFiles(JSON.stringify([srtPath]), binName));
            if (!r.success) return JSON.stringify(r);
            var bin = findBin(binName), item = null;
            for (var i = 0; i < bin.children.numItems; i++) {
                try { if (normPath(bin.children[i].getMediaPath()) === normPath(srtPath)) item = bin.children[i]; } catch (e) {}
            }
            if (!item) return fail('Fichier SRT non import\u00e9');
            var fmt = 0;
            try { fmt = Sequence.CAPTION_FORMAT_SUBTITLE; } catch (e2) {}
            seq.createCaptionTrack(item, 0, fmt);
            return ok({});
        } catch (e3) { return fail('Piste de sous-titres impossible : ' + errText(e3)); }
    }

    function setPlayer(ticks) {
        try {
            var seq = seqOrNull();
            if (!seq) return fail(T.noSeq);
            seq.setPlayerPosition(String(Math.round(Number(ticks))));
            return ok({});
        } catch (e) { return fail(errText(e)); }
    }
    function getPlayer() {
        try {
            var seq = seqOrNull();
            if (!seq) return ok({ ticks: -1 });
            return ok({ ticks: ticksOf(seq.getPlayerPosition()) });
        } catch (e) { return fail(errText(e)); }
    }

    return {
        rev: 6, summary: summary, readTracks: readTracks, wavPreset: wavPreset, exportAudio: exportAudio,
        cloneSequence: cloneSequence, razor: razor, razorPlan: razorPlan, removeRanges: removeRanges, snapshot: snapshot,
        moveItems: moveItems, addMarkers: addMarkers, setPlayer: setPlayer, getPlayer: getPlayer,
        captionTrack: captionTrack, importFiles: importFiles, placeStills: placeStills, srtCaptions: srtCaptions,
        placeMogrts: placeMogrts, mogrtParams: mogrtParams
    };
})();
