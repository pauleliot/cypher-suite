"""
Kiru : fabrique les paquets d'installation autonomes Windows et macOS.

    python build.py

Résultat dans dist/ :
    Kiru-<version>-Windows.zip  → dézipper, double-cliquer « Installer Kiru.bat »
    Kiru-<version>-macOS.zip    → dézipper, double-cliquer « Installer Kiru.command »

La version est lue dans CSXS/manifest.xml (à garder identique à APP_VERSION dans js/app.js).
"""
import re
import stat
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"

# Contenu du panneau (tout le reste — .claude, .debug, dist, build.py… — n'est pas distribué)
PANEL = ["CSXS/manifest.xml", "CSInterface.js", "index.html", "css", "js", "jsx", "assets", "vendor"]


def version():
    manifest = (ROOT / "CSXS/manifest.xml").read_text(encoding="utf-8")
    v = re.search(r'ExtensionBundleVersion="([^"]+)"', manifest).group(1)
    app = (ROOT / "js/app.js").read_text(encoding="utf-8")
    app_v = re.search(r"var APP_VERSION = '([^']+)'", app).group(1)
    if app_v != v:
        sys.exit(f"Versions différentes : manifest {v} / app.js {app_v}")
    return v


def panel_files():
    for entry in PANEL:
        p = ROOT / entry
        if p.is_file():
            yield p
        else:
            yield from sorted(f for f in p.rglob("*") if f.is_file())


def check_jsx_ascii():
    data = (ROOT / "jsx/Kiru_Premiere.jsx").read_bytes()
    bad = [i for i, b in enumerate(data) if b > 127]
    if bad:
        sys.exit(f"jsx/Kiru_Premiere.jsx doit rester ASCII (octet non ASCII à la position {bad[0]})")


def check_mogrt():
    # modèle de sous-titres modifiables, fabriqué dans After Effects par tools/build-mogrt.jsx
    mogrt = ROOT / "assets/captions/Kiru Pop 3.mogrt"
    if not mogrt.is_file():
        sys.exit("assets/captions/Kiru Pop 3.mogrt manquant : lancer tools/build-mogrt.jsx dans After Effects")
    # les anciennes versions du modèle ne sont plus utilisées : elles ne partent pas dans le paquet
    old = [p.name for p in (ROOT / "assets/captions").glob("*.mogrt") if p != mogrt]
    if old:
        sys.exit("anciens modèles à retirer de assets/captions : " + ", ".join(old))


def add_text(z, arcname, text, *, newline="\n", bom=False, executable=False):
    data = text.replace("\r\n", "\n").replace("\n", newline).encode("utf-8-sig" if bom else "utf-8")
    info = zipfile.ZipInfo(arcname, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3  # Unix : les droits ci-dessous sont respectés par l'Archiveur macOS
    mode = 0o755 if executable else 0o644
    info.external_attr = (stat.S_IFREG | mode) << 16
    z.writestr(info, data)


def add_file(z, arcname, path):
    info = zipfile.ZipInfo.from_file(path, arcname)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    z.writestr(info, path.read_bytes())


def build(kind, v):
    top = f"Kiru-{v}"
    out = DIST / f"Kiru-{v}-{kind}.zip"
    readme = (ROOT / "installer/LISEZMOI.txt").read_text(encoding="utf-8").replace("{VERSION}", v)
    with zipfile.ZipFile(out, "w") as z:
        for f in panel_files():
            add_file(z, f"{top}/{f.relative_to(ROOT).as_posix()}", f)
        if kind == "Windows":
            add_text(z, f"{top}/Installer Kiru.bat", (ROOT / "installer/Installer Kiru.bat").read_text(encoding="utf-8"), newline="\r\n")
            # PowerShell 5.1 lit l'UTF-8 sans BOM comme de l'ANSI : BOM obligatoire pour les accents
            add_text(z, f"{top}/installer/install.ps1", (ROOT / "installer/install.ps1").read_text(encoding="utf-8"), newline="\r\n", bom=True)
            add_text(z, f"{top}/LISEZMOI.txt", readme, newline="\r\n", bom=True)
        else:
            add_text(z, f"{top}/Installer Kiru.command", (ROOT / "installer/Installer Kiru.command").read_text(encoding="utf-8"), executable=True)
            add_text(z, f"{top}/LISEZMOI.txt", readme)
    return out


def main():
    check_jsx_ascii()
    check_mogrt()
    v = version()
    DIST.mkdir(exist_ok=True)
    for kind in ("Windows", "macOS"):
        out = build(kind, v)
        with zipfile.ZipFile(out) as z:
            n = len(z.namelist())
        print(f"{out.name}  ({out.stat().st_size // 1024} Ko, {n} fichiers)")


if __name__ == "__main__":
    main()
