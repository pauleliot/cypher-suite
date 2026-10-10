/**
 * CutFlow Studio ExtendScript Host Script for Premiere Pro 2024-2026+
 */
#target premierepro

// ExtendScript (ES3) : JSON et String.prototype.trim ne sont pas garantis
if (!String.prototype.trim) {
    String.prototype.trim = function () { return this.replace(/^\s+|\s+$/g, ''); };
}
if (typeof JSON !== 'object') { JSON = {}; }
if (typeof JSON.stringify !== 'function') {
    JSON.stringify = function (v) {
        var t = typeof v;
        if (v === null || v === undefined || t === 'function') return 'null';
        if (t === 'number') return isFinite(v) ? String(v) : 'null';
        if (t === 'boolean') return String(v);
        if (t === 'string') {
            return '"' + v.replace(/[\\"\u0000-\u001f\u2028\u2029]/g, function (c) {
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

$.CutFlow = {
    checkProject: function() {
        return app.project ? true : false;
    },
    autoRelinkCompressedAudio: function() {
        if (!app.project) return JSON.stringify({ success: false, error: "Aucun projet ouvert" });
        var count = 0;
        function scan(item) {
            if (!item) return;
            if (item.type === ProjectItemType.BIN || item.type === ProjectItemType.ROOT) {
                for (var i = 0; i < item.children.numItems; i++) scan(item.children[i]);
            } else if (item.type === ProjectItemType.CLIP || item.type === ProjectItemType.FILE) {
                var p = item.getMediaPath();
                if (p && (p.toLowerCase().indexOf('.mp3') !== -1 || p.toLowerCase().indexOf('.m4a') !== -1)) {
                    var wav = p.replace(/\.[^.]+$/, '_48k24b.wav');
                    var f = new File(wav);
                    if (f.exists) {
                        item.changeMediaPath(f.fsName, true);
                        count++;
                    }
                }
            }
        }
        scan(app.project.rootItem);
        return JSON.stringify({ success: true, replacedCount: count });
    }
};