/**
 * Kiru — fabrique le modèle de sous-titres modifiables « Kiru Pop » (.mogrt) dans After Effects.
 *
 * Lancement (une fois, par le développeur ; le .mogrt produit est livré dans assets/) :
 *   AfterFX.exe -r tools/build-mogrt.jsx      (préférence AE « Autoriser les scripts à écrire des fichiers » cochée)
 * La configuration est lue dans tools/build-mogrt.json (sortie, police, images de contrôle).
 *
 * Principe : un bloc de sous-titres = un clip. Le texte (lignes séparées par des retours) et les temps des mots
 * (en secondes depuis le début du clip) sont des paramètres modifiables dans Premiere. Des expressions trouvent le
 * mot prononcé, mesurent sa place exacte dans le texte avec des calques de mesure invisibles (sourceRectAtTime) et
 * placent la boîte dessous ; le mot prononcé change de couleur et « pop » à son apparition.
 * Composition carrée 1920 × 1920 : convient aux séquences 16:9 et 9:16 (Kiru règle la position et l'échelle).
 */
(function () {
    var here = new File($.fileName).parent;
    var cfgFile = new File(here.fsName + "/build-mogrt.json");
    cfgFile.encoding = "UTF-8"; cfgFile.open("r"); var cfg = eval("(" + cfgFile.read() + ")"); cfgFile.close();
    // chemins de la configuration : relatifs au dossier tools (ou absolus)
    function abs(p) { return /^([A-Za-z]:|\/|\\\\)/.test(p) ? p : here.fsName.replace(/\\/g, "/") + "/" + p; }
    cfg.out = abs(cfg.out); cfg.aep = cfg.aep && abs(cfg.aep); cfg.log = abs(cfg.log);
    if (cfg.frames) for (var fi = 0; fi < cfg.frames.length; fi++) cfg.frames[fi].file = abs(cfg.frames[fi].file);
    // journal écrit ligne par ligne (lisible même si After Effects s'arrête en cours)
    var log = new File(cfg.log); log.encoding = "UTF-8"; log.open("w"); log.close();
    function L(s) { log.open("a"); log.writeln(String(s)); log.close(); }
    var STEP = "début";
    function step(s) { STEP = s; L("> " + s); }
    // pose d'une expression, journalisée (refus de la pose ou erreur d'expression signalée par After Effects)
    function ex(prop, code, label) {
        try { prop.expression = code; } catch (e) { L("  expression " + label + " : pose impossible : " + e.toString()); return; }
        try { if (prop.expressionError) L("  expression " + label + " : " + prop.expressionError); } catch (e2) {}
    }
    var S = 1920;

    try {
        app.beginSuppressDialogs();
        app.newProject();
        var comp = app.project.items.addComp(cfg.name, S, S, 1, 60, 30);
        comp.bgColor = [0.15, 0.15, 0.18];

        step("police");
        // ---------- police ----------
        var ps = cfg.fontPS;
        try {
            var fonts = app.fonts.getFontsByFamilyNameAndStyleName(cfg.fontFamily, cfg.fontStyle);
            if (fonts && fonts.length) ps = fonts[0].postScriptName;
        } catch (e) { L("app.fonts : " + e); }
        L("police : " + ps);

        step("commandes");
        // ---------- commandes (exposées dans Premiere) ----------
        var ctrl = comp.layers.addNull(); ctrl.name = "CTRL"; ctrl.enabled = false;
        function slider(name, v) { var e = ctrl.property("ADBE Effect Parade").addProperty("ADBE Slider Control"); e.name = name; e.property(1).setValue(v); return e.property(1); }
        function color(name, v) { var e = ctrl.property("ADBE Effect Parade").addProperty("ADBE Color Control"); e.name = name; e.property(1).setValue(v); return e.property(1); }
        function check(name, v) { var e = ctrl.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control"); e.name = name; e.property(1).setValue(v ? 1 : 0); return e.property(1); }
        // Premiere bloque les curseurs venus d'After Effects entre 0 et 100 : Taille = demi-taille de police (px), Position Y = % de la hauteur
        var pSize = slider("Taille", 45), pY = slider("Position Y", 72.9), pRound = slider("Arrondi", 22), pShadow = slider("Ombre", 75);
        var pPadX = slider("Marge boite", 20), pPop = slider("Pop", 12);
        // Glissement : la boîte glisse du mot précédent au mot prononcé (0 = saut) ; Flou : flou de mouvement (0 = aucun)
        var pSlide = slider("Glissement", 60), pBlur = slider("Flou", 50);
        var pText = color("Couleur texte", [1, 1, 1]), pBox = color("Couleur boite", [0.949, 0.416, 0.180]), pActive = color("Couleur mot actif", [1, 1, 1]);
        var pBoxOn = check("Boite", true);

        // ---------- calques de texte ----------
        function textLayer(name, txt) {
            var l = comp.layers.addText(txt); l.name = name;
            var st = l.property("Source Text"), d = st.value;
            d.font = ps; d.fontSize = 90; d.applyFill = true; d.fillColor = [1, 1, 1]; d.applyStroke = false;
            d.justification = ParagraphJustification.CENTER_JUSTIFY;
            try { d.autoLeading = false; d.leading = 106; } catch (e) {}
            st.setValue(d);
            return l;
        }
        step("calques de texte");
        // temps des mots : « 0;0.42;0.8 » (secondes depuis le début du clip)
        var times = textLayer("TEMPS", "0;0.3;0.62;0.95;1.3;1.6"); times.enabled = false;
        // police (nom PostScript) partagée par tous les calques de texte ; modifiable dans Premiere (« Police »)
        var police = textLayer("POLICE", ps); police.enabled = false;
        var txt = textLayer("TXT", "Et si ajouter des\rsous-titres était facile ?");

        // code commun aux expressions : mot prononcé, ligne, mots
        function common(src) { return 'function S(v){return(v&&v.text!==undefined)?String(v.text):String(v);}var C=thisComp.layer("CTRL");' +
            'var T=S(' + src + ').replace(/\\n/g,"\\r");' +
            'var LN=T.split("\\r");var W=[],WL=[],WI=[];' +
            'for(var i=0;i<LN.length;i++){var ws=LN[i].split(" ");var k=0;for(var j=0;j<ws.length;j++){if(ws[j]===""){continue;}W.push(ws[j]);WL.push(i);WI.push(k);k++;}}' +
            'var TM=S(thisComp.layer("TEMPS").text.sourceText.value).split(/[;,\\s]+/);' +
            'var lt=time-thisLayer.inPoint;var A=-1,AS=0;' +
            'for(var i=0;i<W.length;i++){var s=parseFloat(TM[i]);if(isNaN(s)){s=i*0.3;}if(lt>=s){A=i;AS=s;}}' +
            'var AP=A>0?A-1:A;var PF=S(thisComp.layer("POLICE").text.sourceText.value).replace(/^\\s+|\\s+$/g,"");var SZ=(C.effect("Taille")(1)*2);var LD=SZ*1.18;'; }
        var C = common('thisComp.layer("TXT").text.sourceText.value');
        // style commun (taille, interligne) ; renvoie le texte demandé avec le style
        function styleExpr(textExpr) {
            return C + 'var st=text.sourceText.style;if(PF){try{st=st.setFont(PF);}catch(e){}}st=st.setFontSize(SZ).setAutoLeading(false).setLeading(LD);st.setText(' + textExpr + ');';
        }

        step("texte principal");
        // texte principal : centré verticalement sur « Position Y »
        ex(txt.property("Source Text"), common('value') + 'var st=text.sourceText.style;if(PF){try{st=st.setFont(PF);}catch(e){}}st=st.setFontSize(SZ).setAutoLeading(false).setLeading(LD).setFillColor([C.effect("Couleur texte")(1)[0],C.effect("Couleur texte")(1)[1],C.effect("Couleur texte")(1)[2]]);st.setText(T);', "1 Source Text");
        ex(txt.property("ADBE Transform Group").property("ADBE Anchor Point"), 'var r=sourceRectAtTime(time,false);[r.left+r.width/2,r.top+r.height/2];', "2 ADBE Anchor Point");
        ex(txt.property("ADBE Transform Group").property("ADBE Position"), '[thisComp.width/2,thisComp.layer("CTRL").effect("Position Y")(1)*thisComp.height/100];', "3 ADBE Position");
        step("animateur du mot");
        // mot prononcé : couleur + pop
        var anim = txt.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
        anim.name = "Mot actif";
        var ap = anim.property("ADBE Text Animator Properties");
        var fc = ap.addProperty("ADBE Text Fill Color"); ex(fc, 'thisComp.layer("CTRL").effect("Couleur mot actif")(1);', "4 fc");
        var sc = ap.addProperty("ADBE Text Scale 3D");
        ex(sc, C + 'var p=C.effect("Pop")(1)/100;var u=Math.min(1,Math.max(0,(lt-AS)/0.12));var s=100*(1+p*(1-u));[s,s,100];', "5 sc");
        try { anim.property("ADBE Text Animator Properties").property("ADBE Text Anchor Point 3D"); } catch (e) {}
        var sel = anim.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
        try { sel.property("ADBE Text Range Type2").setValue(3); } catch (e) { L("base sur : " + e); } // 3 = mots
        ex(sel.property("ADBE Text Expressible Amount"), C + '(textIndex-1==A)?[100,100,100]:[0,0,0];', "6 ADBE Text Expressible Amount");
        try { txt.property("ADBE Text Properties").property("ADBE Text More Options").property("ADBE Text Anchor Point Option").setValue(2); } catch (e) { L("regroupement : " + e); } // regroupement des points d'ancrage : par mot

        step("ombre");
        // ombre portée sur le texte
        var sh = txt.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
        sh.property("ADBE Drop Shadow-0001").setValue([0, 0, 0, 1]);
        ex(sh.property("ADBE Drop Shadow-0002"), 'thisComp.layer("CTRL").effect("Ombre")(1)*2.55;', "7 ADBE Drop Shadow-0002");
        sh.property("ADBE Drop Shadow-0003").setValue(180);
        ex(sh.property("ADBE Drop Shadow-0004"), '(thisComp.layer("CTRL").effect("Taille")(1)*2)*0.06;', "8 ADBE Drop Shadow-0004");
        ex(sh.property("ADBE Drop Shadow-0005"), '(thisComp.layer("CTRL").effect("Taille")(1)*2)*0.28;', "9 ADBE Drop Shadow-0005");

        step("mesures");
        // ---------- calques de mesure (invisibles) ----------
        var mLine = textLayer("M_LIGNE", "x"), mUpTo = textLayer("M_JUSQUA", "x"), mWord = textLayer("M_MOT", "x"), mRef = textLayer("M_REF", "Hg");
        ex(mLine.property("Source Text"), styleExpr('A<0?"":LN[WL[A]].replace(/^ +| +$/g,"")'), "10 Source Text");
        ex(mUpTo.property("Source Text"), styleExpr('A<0?"":LN[WL[A]].replace(/^ +/,"").split(" ").slice(0,WI[A]+1).join(" ")'), "11 Source Text");
        ex(mWord.property("Source Text"), styleExpr('A<0?"":W[A]'), "12 Source Text");
        ex(mRef.property("Source Text"), styleExpr('"ÉHgjpq"'), "13 Source Text");
        // mesures du mot précédent (point de départ du glissement)
        var pLine = textLayer("P_LIGNE", "x"), pUpTo = textLayer("P_JUSQUA", "x"), pWord = textLayer("P_MOT", "x");
        ex(pLine.property("Source Text"), styleExpr('AP<0?"":LN[WL[AP]].replace(/^ +| +$/g,"")'), "10b Source Text");
        ex(pUpTo.property("Source Text"), styleExpr('AP<0?"":LN[WL[AP]].replace(/^ +/,"").split(" ").slice(0,WI[AP]+1).join(" ")'), "11b Source Text");
        ex(pWord.property("Source Text"), styleExpr('AP<0?"":W[AP]'), "12b Source Text");
        var measures = [mLine, mUpTo, mWord, mRef, pLine, pUpTo, pWord];
        for (var m = 0; m < measures.length; m++) {
            measures[m].property("ADBE Transform Group").property("ADBE Opacity").setValue(0);
            measures[m].property("ADBE Transform Group").property("ADBE Position").setValue([S / 2, S / 2]);
        }

        step("boîte");
        // ---------- boîte sous le mot prononcé ----------
        var box = comp.layers.addShape(); box.name = "BOITE"; L("  calque de forme");
        var grp = box.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var rect = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        grp.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        // références relues : l'ajout du remplissage a invalidé celles du rectangle
        var vg = box.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
        rect = vg.property(1); var fill = vg.property(2); L("  rectangle : " + (rect ? "ok" : "absent") + ", remplissage : " + (fill ? "ok" : "absent"));
        ex(fill.property("ADBE Vector Fill Color"), 'thisComp.layer("CTRL").effect("Couleur boite")(1);', "14 ADBE Vector Fill Color");
        var BX = C + 'var tx=thisComp.layer("TXT"),wr=thisComp.layer("M_MOT").sourceRectAtTime(time,false),lr=thisComp.layer("M_LIGNE").sourceRectAtTime(time,false),' +
            'ur=thisComp.layer("M_JUSQUA").sourceRectAtTime(time,false),rr=thisComp.layer("M_REF").sourceRectAtTime(time,false);' +
            'var xEnd=lr.left+ur.width,xc=xEnd-wr.width/2,yc=(A<0?0:WL[A])*LD+rr.top+rr.height/2;' +
            'var pwr=thisComp.layer("P_MOT").sourceRectAtTime(time,false),plr=thisComp.layer("P_LIGNE").sourceRectAtTime(time,false),pur=thisComp.layer("P_JUSQUA").sourceRectAtTime(time,false);' +
            'var xp=plr.left+pur.width-pwr.width/2,yp=(AP<0?0:WL[AP])*LD+rr.top+rr.height/2;' +
            'var G=C.effect("Glissement")(1)/100*0.3,u=(G<0.005||A<1)?1:Math.min(1,Math.max(0,(lt-AS)/G));u=1-Math.pow(1-u,3);' +
            'var BW=pwr.width+(wr.width-pwr.width)*u,BXc=xp+(xc-xp)*u,BYc=yp+(yc-yp)*u;';
        ex(rect.property("ADBE Vector Rect Size"), BX + 'var px=C.effect("Marge boite")(1)*SZ/100;[BW+2*px,rr.height+SZ*0.08];', "15 ADBE Vector Rect Size");
        ex(rect.property("ADBE Vector Rect Roundness"), 'var C=thisComp.layer("CTRL");C.effect("Arrondi")(1)*(C.effect("Taille")(1)*2)/100;', "16 ADBE Vector Rect Roundness");
        ex(box.property("ADBE Transform Group").property("ADBE Position"), BX + 'tx.toComp([BXc,BYc]);', "17 ADBE Position");
        ex(box.property("ADBE Transform Group").property("ADBE Scale"), C + 'var p=C.effect("Pop")(1)/100;var u=Math.min(1,Math.max(0,(lt-AS)/0.12));var s=100*(1+p*(1-u));[s,s];', "18 ADBE Scale");
        ex(box.property("ADBE Transform Group").property("ADBE Opacity"), C + '(A<0||C.effect("Boite")(1)==0)?0:100;', "19 ADBE Opacity");
        var bsh = box.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
        ex(bsh.property("ADBE Drop Shadow-0002"), 'thisComp.layer("CTRL").effect("Ombre")(1)*1.2;', "20 ADBE Drop Shadow-0002");
        bsh.property("ADBE Drop Shadow-0003").setValue(180);
        ex(bsh.property("ADBE Drop Shadow-0004"), '(thisComp.layer("CTRL").effect("Taille")(1)*2)*0.04;', "21 ADBE Drop Shadow-0004");
        ex(bsh.property("ADBE Drop Shadow-0005"), '(thisComp.layer("CTRL").effect("Taille")(1)*2)*0.2;', "22 ADBE Drop Shadow-0005");
        try { box.moveAfter(txt); } catch (e) { L("  ordre des calques : " + e.toString()); } // la boîte passe sous le texte

        step("flou de mouvement");
        // Flou directionnel d'après la vitesse de la boîte, calculée directement par la formule du glissement
        // (déplacement pendant le temps d'obturation). Ni CC Force Motion Blur (8 rendus par image) ni
        // position.valueAtTime() : l'un et l'autre font planter l'export du modèle (moteur d'expressions).
        // Flou = 100 : obturation d'une image entière (1/30 s) ; 0 : aucun flou. cfg.blur === false : pas de flou.
        if (cfg.blur !== false) try {
            comp.layer("BOITE").property("ADBE Effect Parade").addProperty("ADBE Motion Blur");
            var BV = BX + 'var d=C.effect("Flou")(1)/100/30,u0=(G<0.005||A<1)?1:Math.min(1,Math.max(0,(lt-d-AS)/G));' +
                'u0=1-Math.pow(1-u0,3);var k=u-u0,dx=(xc-xp)*k,dy=(yc-yp)*k;';
            ex(comp.layer("BOITE").property("ADBE Effect Parade").property("ADBE Motion Blur").property(1),
                BV + '(d<=0||(dx==0&&dy==0))?90:Math.atan2(dx,-dy)*180/Math.PI;', "23 direction du flou");
            ex(comp.layer("BOITE").property("ADBE Effect Parade").property("ADBE Motion Blur").property(2),
                BV + 'd<=0?0:Math.sqrt(dx*dx+dy*dy)/2;', "24 longueur du flou");
            L("  flou directionnel : ok");
        } catch (e2) { L("  flou : " + e2.toString()); }
        else L("  flou désactivé (build-mogrt.json)");

        step("objets graphiques essentiels");
        // ---------- Essential Graphics : paramètres modifiables dans Premiere ----------
        comp.openInEssentialGraphics();
        function fx(name) { return comp.layer("CTRL").property("ADBE Effect Parade").property(name).property(1); }
        function src(name) { return comp.layer(name).property("ADBE Text Properties").property("ADBE Text Document"); }
        var expose = [
            [src("TXT"), "Texte"], [src("TEMPS"), "Temps des mots (s)"], [src("POLICE"), "Police"],
            [fx("Taille"), "Taille"], [fx("Position Y"), "Position Y"], [fx("Couleur texte"), "Couleur du texte"], [fx("Boite"), "Boîte"],
            [fx("Couleur boite"), "Couleur de la boîte"], [fx("Couleur mot actif"), "Couleur du mot prononcé"], [fx("Arrondi"), "Arrondi de la boîte"],
            [fx("Marge boite"), "Marge de la boîte"], [fx("Ombre"), "Ombre"], [fx("Pop"), "Pop"],
            [fx("Glissement"), "Glissement"], [fx("Flou"), "Flou de mouvement"]
        ];
        for (var x = 0; x < expose.length; x++) { try { L("EGP " + expose[x][1] + " : " + expose[x][0].addToMotionGraphicsTemplateAs(comp, expose[x][1])); } catch (e) { L("EGP " + expose[x][1] + " : " + e.toString()); } }
        comp.motionGraphicsTemplateName = cfg.name;

        step("images de contrôle");
        // ---------- images de contrôle ----------
        if (cfg.frames) {
            for (var f = 0; f < cfg.frames.length; f++) {
                var png = new File(cfg.frames[f].file);
                if (png.exists) png.remove(); // l'image n'est écrite qu'à la fin du rendu (asynchrone)
                try { comp.saveFrameToPng(cfg.frames[f].t, png); L("image " + cfg.frames[f].t + " s : " + png.exists); } catch (e) { L("image : " + e); }
            }
        }
        step("enregistrement du projet");
        if (cfg.aep) { app.project.save(new File(cfg.aep)); L("projet : " + cfg.aep); }

        // Export différé : les images de contrôle se rendent en arrière-plan, et exporter le modèle pendant
        // ce rendu fait planter After Effects. L'export part quelques secondes plus tard, script terminé.
        $.global.kiruExport = function () {
            var ok = false;
            try {
                step("export");
                // la référence prise pendant la fabrication n'est plus valide une fois le script fini : on relit le projet
                var comp = null;
                for (var i = 1; i <= app.project.numItems; i++) {
                    var it = app.project.item(i);
                    if (it instanceof CompItem && it.name === cfg.name) { comp = it; break; }
                }
                if (!comp) throw new Error("composition « " + cfg.name + " » introuvable");
                var outF = new File(cfg.out);
                if (outF.exists) outF.remove();
                // After Effects attend un dossier et y écrit « <nom de la composition>.mogrt »
                L("export : " + comp.exportAsMotionGraphicsTemplate(true, outF.parent.fsName));
                ok = outF.exists;
                L("mogrt : " + ok + " " + (ok ? outF.length : 0));
                L("ae : " + app.version);
            } catch (e) { try { L("ERREUR à l'étape « export » : " + e.toString()); } catch (e2) {} }
            if (cfg.quit) { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); app.quit(); }
            else alert(ok ? "Kiru : modèle « " + cfg.name + " » créé.\nVous pouvez fermer After Effects." : "Kiru : échec de l'export.\nDétails : " + cfg.log);
        };
        L("export dans 8 s (fin du rendu des images de contrôle)");
        app.scheduleTask("$.global.kiruExport()", 8000, false);
        var scheduled = true;
    } catch (err) { var msg = "?"; try { msg = err.toString() + " (ligne " + err.line + ")"; } catch (e4) {} try { L("ERREUR à l'étape « " + STEP + " » : " + msg); } catch (e5) {} }
    try { app.endSuppressDialogs(false); } catch (e3) {}
    if (!scheduled) alert("Kiru : échec à l'étape « " + STEP + " ».\nDétails : " + cfg.log);
})();
