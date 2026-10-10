"""
Suite Mori : fabrique les installeurs des 4 panneaux et les publie en Releases GitHub.

    python release.py             fabrique les installeurs (dossier .release/)
    python release.py --publish   + crée sur GitHub les Releases qui n'existent pas encore (une par panneau et par version)

Pour chaque panneau :
  - Windows : « Installer-<Nom>-<version>.exe » (Inno Setup) : assistant d'installation classique, sans droits
    administrateur ni fenêtre de console ; désinstallable depuis les Paramètres de Windows ;
  - macOS : « Installer-<Nom>-<version>-macOS.zip » contenant « Installer <Nom>.app » : double-clic, fenêtres macOS,
    sans Terminal ni chmod.
Les deux copient le panneau puis lancent son script d'installation habituel (installer/install.ps1, « Installer
<Nom>.command ») en mode automatique (SUITE_AUTO=1) : autorisation des extensions, outils (FFmpeg… pour Mori),
police (Kiru). Sans signature payante, Windows et macOS affichent un avertissement à la première ouverture.

Les versions sont lues dans le CSXS/manifest.xml de chaque panneau. Une Release s'appelle « <panneau>-v<version> »
(ex. kiru-v1.2.0) ; les liens directs affichés à la fin vont sur les pages plugins du site.
Publier demande GitHub CLI connecté (gh auth login) et le code déjà envoyé (git push).
"""
import os
import re
import shutil
import stat
import subprocess
import sys
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / ".release"  # hors du dépôt (.gitignore)
APPS = [
    {"id": "mori", "name": "Mori", "dir": "com.cutflow.studio.panel", "tagline": "Le couteau suisse du monteur"},
    {"id": "ongaku", "name": "Ongaku", "dir": "Ongaku", "tagline": "Bibliothèque musicale et beats"},
    {"id": "sori", "name": "Sori", "dir": "Sori", "tagline": "Courbes d'animation"},
    {"id": "kiru", "name": "Kiru", "dir": "Kiru", "tagline": "Autocut et sous-titres"},
]
PUBLISHER = "Paul-Eliot Kostre"
SITE = "https://pauleliot.github.io/plugins.html"
# Mori n'a pas de build.py : son paquet est le dossier lui-même, sans ces fichiers
MORI_SKIP = {".debug", "dist", "app.source.tsx", ".claude"}


def manifest(app, attr):
    m = (ROOT / app["dir"] / "CSXS/manifest.xml").read_text(encoding="utf-8")
    return re.search(attr, m).group(1)


def version(app):
    return manifest(app, r'ExtensionBundleVersion="([^"]+)"')


def menu(app):
    return manifest(app, r"<Menu>([^<]+)</Menu>").strip()


def gh():
    return shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"


def iscc():
    for p in [Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/Inno Setup 6/ISCC.exe",
              Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"), Path(r"C:\Program Files\Inno Setup 6\ISCC.exe")]:
        if p.exists():
            return str(p)
    sys.exit("Inno Setup introuvable : winget install JRSoftware.InnoSetup")


# ==================== Paquets de chaque panneau ====================
def package(app):
    """Paquets d'un panneau (.zip) → { 'windows': chemin, 'macos': chemin } (Mori : le même pour les deux)"""
    d, v = ROOT / app["dir"], version(app)
    if (d / "build.py").exists():
        subprocess.run([sys.executable, "build.py"], cwd=d, check=True)
        return {"windows": d / "dist" / f"{app['name']}-{v}-Windows.zip", "macos": d / "dist" / f"{app['name']}-{v}-macOS.zip"}
    out = d / "dist" / f"{app['name']}-{v}.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(d.rglob("*")):
            rel = f.relative_to(d)
            if f.is_file() and not (set(rel.parts) & MORI_SKIP):
                z.write(f, f"{app['name']}-{v}/{rel.as_posix()}")
    return {"windows": out, "macos": out}


def unpack(zip_path, dest):
    """Contenu du dossier de premier niveau d'un paquet → dest"""
    if dest.exists():
        shutil.rmtree(dest)
    tmp = dest.with_name(dest.name + "-tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(tmp)
    top = next(tmp.iterdir())
    shutil.move(str(top), str(dest))
    shutil.rmtree(tmp)
    return dest


# ==================== Icône (logo sur le carré crème des panneaux) ====================
def icon(app, size=512):
    from PIL import Image, ImageDraw
    logo = Image.open(ROOT / app["dir"] / "assets/logo.png").convert("RGBA")
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 5, fill=(251, 230, 166, 255))
    s = int(size * 0.72)
    logo = logo.resize((s, s), Image.LANCZOS)
    img.alpha_composite(logo, ((size - s) // 2, (size - s) // 2))
    return img


# ==================== Windows : Inno Setup ====================
ISS = r"""; Fabriqué par release.py : ne pas modifier à la main
#define AppName "{name}"
[Setup]
AppId={{{{{guid}}}
AppName={name}
AppVersion={version}
AppVerName={name} {version}
AppPublisher={publisher}
AppPublisherURL={site}
DefaultDirName={{userappdata}}\Adobe\CEP\extensions\{bundle}
UsePreviousAppDir=no
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir={outdir}
OutputBaseFilename=Installer-{name}-{version}
SetupIconFile={ico}
UninstallDisplayIcon={{app}}\installer\icon.ico
UninstallDisplayName={name} pour Premiere Pro
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
ShowLanguageDialog=no

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"

[Messages]
WelcomeLabel2=Ce programme va installer [name/ver] dans Adobe Premiere Pro.%n%nFermez Premiere Pro avant de continuer.
FinishedHeadingLabel={name} est installé
FinishedLabelNoIcons=Ouvrez Premiere Pro, puis : Fenêtre > Extensions > {menu}.
FinishedLabel=Ouvrez Premiere Pro, puis : Fenêtre > Extensions > {menu}.

[Files]
Source: "{stage}\*"; DestDir: "{{app}}"; Excludes: "Installer *.bat,Installer *.command,LISEZMOI.txt"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{ico}"; DestDir: "{{app}}\installer"; DestName: "icon.ico"; Flags: ignoreversion

[UninstallDelete]
Type: filesandordirs; Name: "{{app}}"

[Code]
function PremiereOuvert(): Boolean;
var R: Integer;
begin
  Result := Exec(ExpandConstant('{{cmd}}'), '/C tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" | find /I "Adobe Premiere Pro.exe" >NUL',
    '', SW_HIDE, ewWaitUntilTerminated, R) and (R = 0);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if ExpandConstant('{{param:SUITETEST|0}}') = '1' then exit; // essais de fabrication : Premiere peut rester ouvert
  while PremiereOuvert() do
    // installation silencieuse (/VERYSILENT) : pas de fenêtre à attendre, on abandonne
    if WizardSilent() or (MsgBox('Premiere Pro est ouvert : fermez-le, puis cliquez sur OK.', mbInformation, MB_OKCANCEL) = IDCANCEL) then
    begin
      Result := False;
      exit;
    end;
end;

// Après la copie : script d'installation habituel du panneau (autorisation des extensions, outils, police), sans fenêtre
procedure CurStepChanged(CurStep: TSetupStep);
var R: Integer; Log, Ps: String;
begin
  if CurStep <> ssPostInstall then exit;
  WizardForm.StatusLabel.Caption := '{status}';
  Log := ExpandConstant('{{localappdata}}\{name}-installation.log');
  Ps := ExpandConstant('{{app}}\installer\install.ps1');
  if not Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$env:SUITE_AUTO=''1''; $env:SUITE_TEST=''' + ExpandConstant('{{param:SUITETEST|}}') + '''; & ''' + Ps + ''' *> ''' + Log + '''; exit $LASTEXITCODE"',
    '', SW_HIDE, ewWaitUntilTerminated, R) or (R <> 0) then
    MsgBox('Une étape de l''installation n''a pas abouti.' + #13#10 + 'Détails : ' + Log, mbError, MB_OK);
end;
"""


def windows_installer(app, pkg):
    name, v = app["name"], version(app)
    stage = unpack(pkg, OUT / "stage" / f"{app['id']}-win")
    ico = OUT / "stage" / f"{app['id']}.ico"
    icon(app, 256).save(ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    bundle = re.search(r"\$Target = Join-Path .*?'(?:Adobe\\CEP\\extensions\\)?(com\.[\w.]+)'",
                       (stage / "installer/install.ps1").read_text(encoding="utf-8-sig")).group(1)
    status = "Téléchargement des outils (FFmpeg, yt-dlp)… quelques minutes" if app["id"] == "mori" else "Finalisation de l'installation…"
    status = status.replace("'", "''")  # chaîne Pascal (Inno Setup)
    # Identifiant Windows de l'installeur : calculé sur les noms d'origine (suite et panneau) pour rester le même
    # d'une version à l'autre — Mori remplace ainsi l'entrée de son ancien nom dans « Applications installées »
    # au lieu d'en ajouter une seconde (UsePreviousAppDir=no : il s'installe bien dans son nouveau dossier)
    seed = {"mori": "cypher"}.get(app["id"], app["id"])
    iss = ISS.format(name=name, version=v, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, f"cypher-suite/{seed}")).upper(),
                     publisher=PUBLISHER, site=SITE, bundle=bundle, outdir=OUT, ico=ico, stage=stage, menu=menu(app), status=status)
    iss_path = OUT / "stage" / f"{app['id']}.iss"
    iss_path.write_text(iss, encoding="utf-8-sig")
    subprocess.run([iscc(), "/Q", str(iss_path)], check=True)
    out = OUT / f"Installer-{name}-{v}.exe"
    print(f"{out.name}  ({out.stat().st_size // 1024} Ko)")
    return out


# ==================== macOS : application « Installer <Nom>.app » ====================
LAUNCHER = r"""#!/bin/bash
# Installer {name} : installe le panneau dans Premiere Pro avec des fenêtres macOS (sans Terminal)
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
NAME="{name}"
LOG="$HOME/Library/Logs/$NAME-installation.log"
mkdir -p "$HOME/Library/Logs"

# fenêtre d'installation (progression, étape en cours, résultat) : installer-ui.js
UI_OUT="$(/usr/bin/osascript -l JavaScript "$RES/installer-ui.js" "$NAME" "{version}" "{menu}" "$RES/panel/Installer $NAME.command" "$LOG" 2>"$LOG.ui")"
case "$UI_OUT" in *STARTED*|*CANCELLED*) exit 0 ;; esac

# repli si la fenêtre n'a pas pu s'afficher : boîtes de dialogue simples
ask() {{ osascript -e "display dialog \"$1\" buttons {{\"Annuler\", \"$2\"}} default button \"$2\" with title \"$NAME\" with icon note" >/dev/null 2>&1; }}
msg() {{ osascript -e "display dialog \"$1\" buttons {{\"OK\"}} default button \"OK\" with title \"$NAME\" with icon $2" >/dev/null 2>&1; }}

ask "Installer $NAME {version} dans Premiere Pro ?" "Installer" || exit 0
while pgrep -qf "Adobe Premiere Pro"; do
  ask "Premiere Pro est ouvert : fermez-le, puis cliquez sur Continuer." "Continuer" || exit 0
done
osascript -e "display notification \"{busy}\" with title \"$NAME\"" >/dev/null 2>&1
SUITE_AUTO=1 /bin/bash "$RES/panel/Installer $NAME.command" </dev/null >"$LOG" 2>&1
if [ $? -eq 0 ]; then
  msg "$NAME est installé.\n\nOuvrez Premiere Pro, puis : Fenêtre > Extensions > {menu}." note
else
  msg "L'installation n'a pas abouti.\n\nDétails : $LOG" caution
fi
"""
# Fenêtre de l'installeur macOS (JavaScript for Automation + Cocoa, livrés avec macOS) : reste affichée pendant toute
# l'installation (barre de progression, étape lue dans le journal du script), puis affiche le résultat avec « Fermer ».
# Écrit « STARTED » (ou « CANCELLED ») sur la sortie : sinon, le lanceur repasse aux boîtes de dialogue simples.
# Arguments : nom, version, menu Premiere, script « Installer <Nom>.command », journal.
INSTALLER_UI = r"""ObjC.import('Cocoa');

function out(text) {
  $.NSFileHandle.fileHandleWithStandardOutput.writeData($(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
}

function run(argv) {
  var name = argv[0], version = argv[1], menu = argv[2], script = argv[3], logPath = argv[4];
  var sa = Application.currentApplication();
  sa.includeStandardAdditions = true;
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyRegular);
  app.finishLaunching;
  app.activateIgnoringOtherApps(true);

  function ask(text, ok) {
    try {
      sa.activate();
      sa.displayDialog(text, { withTitle: name, buttons: ['Annuler', ok], defaultButton: ok, cancelButton: 'Annuler', withIcon: 'note' });
      return true;
    } catch (e) {
      return false;
    }
  }
  if (!ask('Installer ' + name + ' ' + version + ' dans Premiere Pro ?', 'Installer')) return out('CANCELLED');
  while (sa.doShellScript('pgrep -qf "Adobe Premiere Pro" && echo 1 || echo 0') === '1') {
    if (!ask('Premiere Pro est ouvert : fermez-le, puis cliquez sur Continuer.', 'Continuer')) return out('CANCELLED');
  }

  // si la fenêtre échoue en route : l'installation lancée va à son terme, résultat en boîte de dialogue ;
  // avant son lancement : rien n'est écrit, le lanceur repasse aux boîtes de dialogue simples
  var task = null, win = null;
  try {
    // ---- fenêtre ----
    var W = 480, H = 200;
    win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0, 0, W, H), $.NSWindowStyleMaskTitled, $.NSBackingStoreBuffered, false);
    win.title = 'Installer ' + name + ' ' + version;
    win.releasedWhenClosed = false;
    var view = win.contentView;
    var icon = $.NSImageView.alloc.initWithFrame($.NSMakeRect(20, H - 84, 64, 64));
    // icône de l'installeur (Resources/AppIcon.icns, à côté du dossier panel/), aussi dans le Dock
    var img = $.NSImage.alloc.initWithContentsOfFile(script.replace(/\/panel\/[^\/]*$/, '/AppIcon.icns'));
    if (!img.isNil()) app.applicationIconImage = img;
    icon.image = app.applicationIconImage;
    view.addSubview(icon);
    function label(y, h, size, bold) {
      var l = $.NSTextField.labelWithString('');
      l.frame = $.NSMakeRect(100, y, W - 120, h);
      l.font = bold ? $.NSFont.boldSystemFontOfSize(size) : $.NSFont.systemFontOfSize(size);
      l.lineBreakMode = $.NSLineBreakByTruncatingTail;
      view.addSubview(l);
      return l;
    }
    var title = label(H - 46, 22, 15, true);
    var detail = label(H - 70, 18, 11, false);
    detail.textColor = $.NSColor.secondaryLabelColor;
    title.stringValue = 'Installation de ' + name + ' en cours…';
    detail.stringValue = 'Préparation…';
    var bar = $.NSProgressIndicator.alloc.initWithFrame($.NSMakeRect(100, H - 104, W - 120, 20));
    bar.indeterminate = true;
    bar.usesThreadedAnimation = true;
    view.addSubview(bar);
    bar.startAnimation($());
    var hint = $.NSTextField.wrappingLabelWithString('');
    hint.frame = $.NSMakeRect(100, 20, W - 120, 48);
    hint.font = $.NSFont.systemFontOfSize(11);
    view.addSubview(hint);
    hint.textColor = $.NSColor.secondaryLabelColor;
    hint.stringValue = 'Gardez cette fenêtre ouverte : elle se met à jour toute seule (téléchargement des outils : quelques minutes).';
    win.center;
    win.makeKeyAndOrderFront($());
    app.activateIgnoringOtherApps(true);

    var anyEvent = $.NSEventMaskAny || $.NSAnyEventMask || 0xffffffff;
    function pump(seconds) {
      var until = $.NSDate.dateWithTimeIntervalSinceNow(seconds);
      for (;;) {
        var ev = app.nextEventMatchingMaskUntilDateInModeDequeue(anyEvent, until, $.NSDefaultRunLoopMode, true);
        if (ev.isNil()) break;
        app.sendEvent(ev);
      }
      app.updateWindows;
    }

    // ---- installation (script habituel du panneau, en mode automatique) ----
    task = $.NSTask.alloc.init;
    task.launchPath = '/bin/bash';
    task.arguments = $(['-c', 'SUITE_AUTO=1 /bin/bash "$0" </dev/null >"$1" 2>&1', script, logPath]);
    task.launch;
    out('STARTED');

    var step = 0;
    while (task.isRunning) {
      pump(0.25);
      var text = '';
      try {
        text = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(logPath, $.NSUTF8StringEncoding, $())) || '';
      } catch (e) {}
      var lines = text.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      for (var i = lines.length - 1; i >= 0; i--) {
        var m = lines[i].match(/^\[(\d+)\/(\d+)\]\s*(.+)$/);
        if (!m) continue;
        if (+m[1] !== step) {
          step = +m[1];
          if (bar.indeterminate) {
            bar.stopAnimation($());
            bar.indeterminate = false;
            bar.minValue = 0;
            bar.maxValue = +m[2];
          }
          bar.doubleValue = step - 0.5;
          title.stringValue = 'Étape ' + m[1] + ' sur ' + m[2] + ' : ' + m[3];
        }
        break;
      }
      if (lines.length) detail.stringValue = lines[lines.length - 1];
    }

    // ---- résultat : la fenêtre reste jusqu'à « Fermer » ----
    var ok = task.terminationStatus === 0;
    bar.stopAnimation($());
    bar.hidden = true;
    title.stringValue = ok ? name + ' est installé' : "L'installation n'a pas abouti";
    detail.stringValue = ok ? 'Tout est prêt.' : 'Relancez l\'installeur pour réessayer.';
    hint.stringValue = ok
      ? 'Ouvrez Premiere Pro, puis : Fenêtre > Extensions > ' + menu + '.'
      : 'Détails dans le journal : ' + logPath;
    // boutons à bascule (type 1 = NSButtonTypePushOnPushOff, style 1 = arrondi) : un clic se lit dans leur état
    function button(titleText, x, isDefault) {
      var b = $.NSButton.alloc.initWithFrame($.NSMakeRect(x, 16, 130, 32));
      b.title = titleText;
      b.bezelStyle = 1;
      b.setButtonType(1);
      if (isDefault) b.keyEquivalent = '\r';
      view.addSubview(b);
      return b;
    }
    // le texte du résultat prend la place de la barre, bien au-dessus des boutons
    hint.frame = $.NSMakeRect(100, 64, W - 120, 40);
    var close = button('Fermer', W - 150, true);
    var showLog = ok ? null : button('Voir le journal', W - 290, false);
    out(ok ? 'DONE' : 'FAILED');
    // « Fermer » quitte aussi directement (action Cocoa), et la fenêtre a maintenant sa pastille rouge
    try {
      close.target = app;
      close.action = 'terminate:';
    } catch (e) {}
    try { win.styleMask = 1 | 2; } catch (e) {}
    app.activateIgnoringOtherApps(true);
    win.makeKeyAndOrderFront($());
    var pressed = function (b) { return !!b && Number(b.state) > 0; };
    for (;;) {
      pump(0.2);
      if (pressed(close) || !win.isVisible) break;
      if (pressed(showLog)) {
        showLog.state = 0;
        sa.doShellScript('open -e "' + logPath.replace(/"/g, '\\"') + '"');
      }
    }
    win.orderOut($());
  } catch (e) {
    try { if (win) win.orderOut($()); } catch (e2) {}
    if (!task) return;
    if (!task.isRunning) return; // résultat déjà affiché et écrit
    task.waitUntilExit;
    var done = task.terminationStatus === 0;
    try {
      sa.activate();
      sa.displayDialog(done ? name + ' est installé.\n\nOuvrez Premiere Pro, puis : Fenêtre > Extensions > ' + menu + '.'
        : "L'installation n'a pas abouti.\n\nDétails : " + logPath, { withTitle: name, buttons: ['OK'], defaultButton: 'OK', withIcon: done ? 'note' : 'caution' });
    } catch (e3) {}
    out(done ? 'DONE' : 'FAILED');
  }
}
"""

PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>installer</string>
  <key>CFBundleIdentifier</key><string>io.github.pauleliot.install-{id}</string>
  <key>CFBundleName</key><string>Installer {name}</string>
  <key>CFBundleDisplayName</key><string>Installer {name}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>{version}</string>
  <key>CFBundleVersion</key><string>{version}</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
"""


def mac_installer(app, pkg):
    """Zip contenant « Installer <Nom>.app » ; droits Unix écrits dans le zip (exécutable sans chmod)"""
    name, v = app["name"], version(app)
    stage = unpack(pkg, OUT / "stage" / f"{app['id']}-mac")
    if not (stage / f"Installer {name}.command").exists():
        sys.exit(f"{name} : « Installer {name}.command » absent du paquet macOS")
    icns = OUT / "stage" / f"{app['id']}.icns"
    icon(app, 1024).save(icns)
    out = OUT / f"Installer-{name}-{v}-macOS.zip"
    top = f"Installer {name}.app/Contents"

    def add(z, arc, data, mode):
        info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3  # Unix : droits respectés par l'Archiveur macOS
        info.external_attr = (stat.S_IFREG | mode) << 16
        z.writestr(info, data)

    with zipfile.ZipFile(out, "w") as z:
        add(z, f"{top}/Info.plist", PLIST.format(id=app["id"], name=name, version=v).encode("utf-8"), 0o644)
        busy = "Installation en cours (téléchargement des outils : quelques minutes)…" if app["id"] == "mori" else "Installation en cours…"
        add(z, f"{top}/MacOS/installer", LAUNCHER.format(name=name, version=v, menu=menu(app), busy=busy).replace("\r\n", "\n").encode("utf-8"), 0o755)
        add(z, f"{top}/Resources/AppIcon.icns", icns.read_bytes(), 0o644)
        add(z, f"{top}/Resources/installer-ui.js", INSTALLER_UI.encode("utf-8"), 0o644)
        for f in sorted(stage.rglob("*")):
            if f.is_file():
                rel = f.relative_to(stage).as_posix()
                exe = f.suffix in (".command", ".sh") or rel.startswith("bin/mac/")
                add(z, f"{top}/Resources/panel/{rel}", f.read_bytes(), 0o755 if exe else 0o644)
    print(f"{out.name}  ({out.stat().st_size // 1024} Ko)")
    return out


# ==================== Mises à jour automatiques (js/suite-update.js des panneaux) ====================
SITE_DIR = Path(r"D:\SITE PE")  # dépôt pauleliot.github.io : y publie updates.json


def update_package(app, pkg):
    """Paquet lu par le module de mise à jour des panneaux : le panneau seul, dans « <Nom>-<version>/ »"""
    import hashlib
    name, v = app["name"], version(app)
    stage = unpack(pkg, OUT / "stage" / f"{app['id']}-upd")
    out = OUT / f"{name}-{v}-update.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(stage.rglob("*")):
            rel = f.relative_to(stage)
            if f.is_file() and not (rel.name.startswith("Installer ") or rel.name == "LISEZMOI.txt"):
                z.write(f, f"{name}-{v}/{rel.as_posix()}")
    return out, hashlib.sha256(out.read_bytes()).hexdigest()


def notes_for(app):
    """Nouveautés de la version, lues dans <panneau>/NOUVEAUTES.txt : un bloc par version, sa 1re ligne = le numéro"""
    f = ROOT / app["dir"] / "NOUVEAUTES.txt"
    if not f.exists():
        return ""
    for block in re.split(r"\n\s*\n", f.read_text(encoding="utf-8").strip()):
        lines = block.strip().splitlines()
        if lines and lines[0].strip() == version(app):
            return "\n".join(lines[1:]).strip()
    return ""


def write_feed(entries):
    """updates.json du site : dernière version de chaque panneau (les panneaux absents de cette publication sont gardés)"""
    import json
    feed_path = SITE_DIR / "updates.json"
    feed = {"apps": {}}
    if feed_path.exists():
        feed = json.loads(feed_path.read_text(encoding="utf-8"))
    feed["apps"].update(entries)
    feed_path.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return feed_path


def push_site(message):
    git = shutil.which("git") or r"C:\Program Files\Git\cmd\git.exe"
    subprocess.run([git, "-C", str(SITE_DIR), "add", "updates.json"], check=True)
    if subprocess.run([git, "-C", str(SITE_DIR), "diff", "--cached", "--quiet"]).returncode == 0:
        return print("updates.json : inchangé")
    subprocess.run([git, "-C", str(SITE_DIR), "commit", "-q", "-m", message], check=True)
    subprocess.run([git, "-C", str(SITE_DIR), "push", "-q"], check=True)
    print("updates.json publié sur le site : les panneaux installés proposeront la mise à jour")


# ==================== Publication ====================
def repo_name():
    try:
        r = subprocess.run([gh(), "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
                           cwd=ROOT, capture_output=True, text=True, check=True)
        return r.stdout.strip()
    except Exception:
        return ""


def publish(app, files):
    """Crée la Release ; si elle existe déjà, n'y ajoute que le paquet de mise à jour s'il manque.
    Résout True si le paquet de mise à jour publié est celui de cette fabrication (son empreinte vaut pour updates.json)."""
    import json
    tag = f"{app['id']}-v{version(app)}"
    view = subprocess.run([gh(), "release", "view", tag, "--json", "assets"], cwd=ROOT, capture_output=True, text=True)
    if view.returncode == 0:
        upd = files[-1]
        names = [a["name"] for a in json.loads(view.stdout).get("assets", [])]
        if upd.name in names:
            print(f"{tag} : déjà publiée")
            return False
        subprocess.run([gh(), "release", "upload", tag, str(upd)], cwd=ROOT, check=True)
        print(f"{tag} : paquet de mise à jour ajouté")
        return True
    news = notes_for(app)
    notes = (f"{app['name']} {version(app)} — {app['tagline']}.\n\n" + (f"**Nouveautés**\n{news}\n\n" if news else "") +
             "Déjà installé ? Le panneau propose la mise à jour tout seul (bandeau « Mettre à jour »).\n\n"
             f"**Windows** : lancez `Installer-{app['name']}-{version(app)}.exe` (Premiere Pro fermé). "
             "Si Windows affiche « Windows a protégé votre ordinateur » : Informations complémentaires > Exécuter quand même.\n\n"
             f"**macOS** : dézippez, puis double-cliquez « Installer {app['name']} ». La première fois, macOS bloque une application "
             "non signée : Réglages Système > Confidentialité et sécurité > Ouvrir quand même.")
    subprocess.run([gh(), "release", "create", tag, *map(str, files), "--title", f"{app['name']} {version(app)}", "--notes", notes],
                   cwd=ROOT, check=True)
    print(f"{tag} : publiée")
    return True


def main():
    do_publish = "--publish" in sys.argv
    OUT.mkdir(exist_ok=True)
    repo, links, feed = repo_name(), [], {}
    for app in APPS:
        pk = package(app)
        upd, digest = update_package(app, pk["windows"])
        files = [windows_installer(app, pk["windows"]), mac_installer(app, pk["macos"]), upd]
        fresh = publish(app, files) if do_publish else False
        tag = f"{app['id']}-v{version(app)}"
        links += [f"https://github.com/{repo}/releases/download/{tag}/{f.name}" for f in files[:2]]
        # updates.json : seulement si le paquet publié est celui-ci (sinon son empreinte ne correspondrait pas)
        if fresh:
            feed[app["id"]] = {"name": app["name"], "version": version(app), "notes": notes_for(app),
                               "url": f"https://github.com/{repo}/releases/download/{tag}/{upd.name}", "sha256": digest}
    shutil.rmtree(OUT / "stage", ignore_errors=True)
    if do_publish and repo and feed:
        write_feed(feed)
        push_site("Mises à jour : " + ", ".join(f"{v['name']} {v['version']}" for v in feed.values()))
    # liens directs à reporter sur les pages plugins du site
    if repo:
        print("\nLiens de téléchargement :\n" + "\n".join(links))


if __name__ == "__main__":
    main()
