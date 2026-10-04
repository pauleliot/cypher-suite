/**
 * Kiru — exporte seulement le modèle « Kiru Pop » (.mogrt) depuis le projet déjà fabriqué par build-mogrt.jsx.
 * Utile si l'export a échoué : aucun rendu en cours (images de contrôle), avertissements masqués.
 * After Effects : Fichier > Scripts > Exécuter le fichier de script… > tools/export-mogrt.jsx
 */
(function () {
    var here = new File($.fileName).parent;
    var cfgFile = new File(here.fsName + "/build-mogrt.json");
    cfgFile.encoding = "UTF-8"; cfgFile.open("r"); var cfg = eval("(" + cfgFile.read() + ")"); cfgFile.close();
    function abs(p) { return /^([A-Za-z]:|\/|\\\\)/.test(p) ? p : here.fsName.replace(/\\/g, "/") + "/" + p; }
    cfg.out = abs(cfg.out); cfg.aep = cfg.aep && abs(cfg.aep);
    var log = new File(here.fsName + "/export.log"); log.encoding = "UTF-8"; log.open("w"); log.close();
    function L(s) { log.open("a"); log.writeln(String(s)); log.close(); }
    var ok = false;
    try {
        app.beginSuppressDialogs();
        L("ae : " + app.version);
        var aep = new File(cfg.aep);
        if (!aep.exists) throw new Error("projet introuvable : " + cfg.aep + " (lancez d'abord build-mogrt.jsx)");
        app.open(aep);
        L("projet ouvert : " + aep.fsName);
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === cfg.name) { comp = it; break; }
        }
        if (!comp) throw new Error("composition « " + cfg.name + " » introuvable");
        L("composition : " + comp.name + " · paramètres exposés : " + comp.motionGraphicsTemplateControllerCount);
        var outF = new File(cfg.out);
        if (outF.exists) outF.remove();
        L("export…");
        // After Effects attend un dossier et y écrit « <nom de la composition>.mogrt »
        L("export : " + comp.exportAsMotionGraphicsTemplate(true, outF.parent.fsName));
        ok = outF.exists;
        L("mogrt : " + ok + " " + (ok ? outF.length : 0));
    } catch (e) { try { L("ERREUR : " + e.toString() + (e.line ? " (ligne " + e.line + ")" : "")); } catch (e2) {} }
    try { app.endSuppressDialogs(false); } catch (e3) {}
    alert(ok ? "Kiru : modèle « " + cfg.name + " » exporté.\nVous pouvez fermer After Effects." : "Kiru : échec de l'export.\nDétails : " + log.fsName);
})();
