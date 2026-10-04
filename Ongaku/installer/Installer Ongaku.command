#!/bin/bash
# Ongaku : installeur macOS. Double-cliquez sur ce fichier dans le Finder
# (la première fois : clic droit > Ouvrir, car le script n'est pas signé par Apple).
# Sans mot de passe administrateur :
#   1. autorise les extensions non signées dans Premiere Pro (CEP 9 à 16)
#   2. copie le panneau dans ~/Library/Application Support/Adobe/CEP/extensions/com.ongaku.panel
# Les réglages (bibliothèque, thème, favoris) et le cache d'analyse ne sont pas touchés.

cd "$(dirname "$0")" || exit 1
SOURCE="$(pwd -P)"
EXTENSIONS="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET="$EXTENSIONS/com.ongaku.panel"

step() { printf '\n\033[36m  [%s/3] %s\033[0m\n' "$1" "$2"; }
ok()   { printf '\033[32m        OK  %s\033[0m\n' "$1"; }
info() { printf '        %s\n' "$1"; }
fail() { printf '\033[31m        ÉCHEC  %s\033[0m\n' "$1"; }
finish() { echo; [ -n "$SUITE_AUTO" ] || read -r -p "  Appuyez sur Entrée pour fermer " _; exit "$1"; }

[ -n "$SUITE_AUTO" ] || clear
printf '\n  Ongaku : installation du panneau Premiere Pro\n'
printf '  =============================================\n'

# Premiere Pro verrouille les fichiers du panneau : il doit être fermé
if [ -z "$SUITE_TEST" ] && pgrep -qf "Adobe Premiere Pro"; then
  printf "\n\033[33m  Premiere Pro est ouvert : fermez-le, puis relancez l'installation.\033[0m\n"
  finish 1
fi

step 1 'Autorisation du panneau dans Premiere Pro'
for v in 9 10 11 12 13 14 15 16; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
ok 'extensions non signées autorisées'

step 2 'Copie du panneau'
if [ -d "$TARGET" ] && [ "$SOURCE" = "$(cd "$TARGET" && pwd -P)" ]; then
  ok 'panneau déjà en place'
else
  mkdir -p "$TARGET"
  # --delete : copie exacte (les fichiers d'une ancienne version qui n'existent plus sont retirés)
  rsync -a --delete --exclude 'installer' --exclude 'Installer Ongaku.bat' --exclude 'Installer Ongaku.command' \
    --exclude 'LISEZMOI.txt' ./ "$TARGET/" || { fail "copie impossible vers $TARGET"; finish 1; }
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
  ok "copié dans $TARGET"
fi

step 3 'Vérification'
if [ ! -f "$TARGET/CSXS/manifest.xml" ]; then fail 'manifest.xml introuvable après la copie'; finish 1; fi
VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$TARGET/CSXS/manifest.xml" | head -n 1)"
ok "Ongaku $VERSION installé"
# une autre copie du même panneau (dossier de développement…) ferait un doublon dans Premiere
for d in "$EXTENSIONS"/*/; do
  d="${d%/}"
  [ "$d" = "$TARGET" ] && continue
  if grep -q 'ExtensionBundleId="com.ongaku.panel"' "$d/CSXS/manifest.xml" 2>/dev/null; then
    info "Attention : une autre copie d'Ongaku existe dans « $(basename "$d") » ; supprimez-la pour éviter un doublon."
  fi
done

printf '\n\033[32m  Installation terminée.\033[0m\n'
printf '  Ouvrez Premiere Pro (2022 ou plus récent) puis : Fenêtre > Extensions > Ongaku — Musique\n'
finish 0
