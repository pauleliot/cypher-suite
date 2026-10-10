#!/bin/bash
# Mori — Studio : installeur macOS. Double-cliquez sur ce fichier dans le Finder
# (la première fois : clic droit > Ouvrir, car le script n'est pas signé par Apple).
# Installe le panneau et tout ce qu'il utilise, sans Homebrew ni mot de passe administrateur :
#   - autorisation des extensions non signées dans Premiere Pro (CEP 9 à 14)
#   - copie du panneau (par-dessus une version existante, sans rien supprimer)
#   - FFmpeg + ffprobe, yt-dlp et Deno téléchargés depuis leurs sources officielles dans bin/mac s'ils manquent

cd "$(dirname "$0")" || exit 1
SOURCE="$(pwd -P)"
TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/com.mori.studio.panel"
BIN="$TARGET/bin/mac"
TMP="$(mktemp -d)"
ERRORS=0

step() { printf '\n\033[36m  [%s/5] %s\033[0m\n' "$1" "$2"; }
ok()   { printf '\033[32m        OK  %s\033[0m\n' "$1"; }
info() { printf '        %s\n' "$1"; }
fail() { printf '\033[31m        ÉCHEC  %s\033[0m\n' "$1"; ERRORS=$((ERRORS + 1)); }
finish() {
  rm -rf "$TMP"
  echo
  [ -n "$SUITE_AUTO" ] || read -r -p "  Appuyez sur Entrée pour fermer " _
  exit "$1"
}
download() { # url fichier libellé
  info "Téléchargement de $3…"
  curl -fL --retry 3 --progress-bar "$1" -o "$2" || { fail "téléchargement impossible : $3"; return 1; }
}
find_system() { # premier exécutable trouvé parmi le PATH et les emplacements Homebrew
  command -v "$1" 2>/dev/null && return
  for p in "/opt/homebrew/bin/$1" "/usr/local/bin/$1"; do [ -x "$p" ] && { echo "$p"; return; }; done
}
check() { # libellé chemin arguments…
  local label="$1" path="$2"; shift 2
  local out
  if [ -n "$path" ] && out="$("$path" "$@" 2>/dev/null | head -n 1)" && [ -n "$out" ]; then ok "$label : $out"; else fail "$label ne répond pas"; fi
}

[ -n "$SUITE_AUTO" ] || clear
printf '\n  Mori — Studio : installation du panneau Premiere Pro\n'
printf '  ======================================================\n'

# 0. Premiere Pro doit être fermé : il verrouille les fichiers du panneau
if [ -z "$SUITE_TEST" ] && pgrep -qf "Adobe Premiere Pro"; then
  printf "\n\033[33m  Premiere Pro est ouvert : fermez-le, puis relancez l'installation.\033[0m\n"
  finish 1
fi

# 1. Extensions non signées
step 1 'Autorisation du panneau dans Premiere Pro'
for v in 9 10 11 12 13 14; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
ok 'extensions non signées autorisées (Premiere 2019 à 2026+)'

# 2. Copie du panneau
step 2 'Copie du panneau'
if [ -d "$TARGET" ] && [ "$SOURCE" = "$(cd "$TARGET" && pwd -P)" ]; then
  ok 'panneau déjà en place'
else
  mkdir -p "$TARGET"
  rsync -a --exclude 'installer' --exclude 'Installer Mori.bat' --exclude 'Installer Mori.command' \
    --exclude 'README.txt' --exclude '.debug' ./ "$TARGET/" || { fail "copie impossible vers $TARGET"; finish 1; }
  ok "copié dans $TARGET"
fi

# Anciens identifiants du panneau (le plus récent d'abord : com.cypher.studio.* jusqu'à la v2.11, com.cutflow.studio.panel
# jusqu'à la v2.6.0) : réglages (chutiers, presets, thème, favoris de la console…) et outils déjà téléchargés
# repris, ancien panneau retiré
CEP_CACHE="$HOME/Library/Caches/CSXS/cep_cache"
for old_id in com.cypher.studio com.cutflow.studio; do
  for old_cache in "$CEP_CACHE"/*_"$old_id".*; do
    [ -d "$old_cache/Local Storage" ] || continue
    new_cache="${old_cache/$old_id/com.mori.studio}"
    if [ ! -d "$new_cache/Local Storage" ]; then
      mkdir -p "$new_cache" && cp -R "$old_cache/Local Storage" "$new_cache/" && ok "réglages de l'ancienne version repris"
    fi
  done
  OLD_TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/$old_id.panel"
  if [ -d "$OLD_TARGET" ] && [ "${SOURCE#"$(cd "$OLD_TARGET" && pwd -P)"}" = "$SOURCE" ]; then
    if [ -f "$OLD_TARGET/app.source.tsx" ]; then
      info "ancien dossier de développement conservé ($old_id.panel) : supprimez-le pour éviter un doublon"
    else
      mkdir -p "$BIN"
      for f in "$OLD_TARGET/bin/mac"/*; do
        [ -f "$f" ] && [ ! -e "$BIN/$(basename "$f")" ] && mv "$f" "$BIN/"
      done
      rm -rf "$OLD_TARGET"
      ok 'ancienne version du panneau retirée (outils conservés)'
    fi
  fi
done
mkdir -p "$BIN"

ARCH="$(uname -m)" # arm64 (Apple Silicon) ou x86_64 (Intel)
if [ "$ARCH" = "arm64" ]; then FF_ARCH=arm64; DENO_ARCH=aarch64; else FF_ARCH=amd64; DENO_ARCH=x86_64; fi

# 3. FFmpeg + ffprobe
step 3 'FFmpeg (conversion vidéo et audio)'
FFMPEG="$BIN/ffmpeg"; FFPROBE="$BIN/ffprobe"
if [ ! -x "$FFMPEG" ]; then
  if [ -n "$(find_system ffmpeg)" ] && [ -n "$(find_system ffprobe)" ]; then
    FFMPEG="$(find_system ffmpeg)"; FFPROBE="$(find_system ffprobe)"
    info 'déjà installé sur ce Mac'
  else
    for tool in ffmpeg ffprobe; do
      download "https://ffmpeg.martin-riedl.de/redirect/latest/macos/$FF_ARCH/release/$tool.zip" "$TMP/$tool.zip" "$tool (~35 Mo)" \
        && unzip -o -q "$TMP/$tool.zip" -d "$BIN"
    done
  fi
fi

# 4. yt-dlp (+ mise à jour : YouTube change souvent)
step 4 'yt-dlp (téléchargement de vidéos en ligne)'
YTDLP="$BIN/yt-dlp"
if [ -x "$YTDLP" ]; then
  info 'mise à jour…'
  "$YTDLP" -U >/dev/null 2>&1 || info 'mise à jour impossible, version actuelle conservée'
elif [ -n "$(find_system yt-dlp)" ]; then
  YTDLP="$(find_system yt-dlp)"
  info 'déjà installé sur ce Mac'
else
  download 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos' "$YTDLP" 'yt-dlp (~35 Mo)'
fi

# 5. Deno (moteur JavaScript demandé par yt-dlp pour YouTube)
step 5 'Deno (requis par yt-dlp pour YouTube)'
DENO="$BIN/deno"
if [ ! -x "$DENO" ]; then
  if [ -n "$(find_system deno)" ]; then
    DENO="$(find_system deno)"
    info 'déjà installé sur ce Mac'
  else
    download "https://github.com/denoland/deno/releases/latest/download/deno-$DENO_ARCH-apple-darwin.zip" "$TMP/deno.zip" 'Deno (~40 Mo)' \
      && unzip -o -q "$TMP/deno.zip" -d "$BIN"
  fi
fi

# binaires téléchargés : exécutables et hors quarantaine Gatekeeper
chmod +x "$BIN"/* 2>/dev/null
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null

printf '\n  Vérification\n'
check 'FFmpeg' "$FFMPEG" -hide_banner -version
check 'ffprobe' "$FFPROBE" -hide_banner -version
check 'yt-dlp' "$YTDLP" --version
check 'Deno' "$DENO" --version

echo
if [ "$ERRORS" -gt 0 ]; then
  printf "\033[33m  Installation terminée avec des erreurs (voir ci-dessus) : relancez l'installeur pour réessayer.\033[0m\n"
else
  printf '\033[32m  Installation terminée : tout est prêt.\033[0m\n'
fi
printf '  Ouvrez Premiere Pro puis : Fenêtre > Extensions > Mori — Studio\n'
finish 0
