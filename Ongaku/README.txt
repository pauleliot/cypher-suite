ONGAKU — bibliothèque musicale pour Premiere Pro (même DA que Mori)
=====================================================================

Ouvrir : Premiere Pro > Fenêtre > Extensions > Ongaku — Musique
(le mode débogage CEP « PlayerDebugMode = 1 » est déjà activé sur ce poste, comme pour Mori).

ONGLET BIBLIOTHÈQUE (sections Musique et SFX)
  - Choisir la section Musique ou SFX, puis « Ajouter un dossier » directement sous le sélecteur
    (ou coller un chemin). Chaque section a ses propres dossiers ; cliquer un dossier filtre la liste, × le retire.
  - Scan récursif (mp3, wav, aif/aiff, m4a, aac, flac, ogg). En SFX : pas de BPM, durée à la décimale.
  - Titre / artiste / pochette lus dans les tags ID3, sinon déduits du nom « Artiste - Titre ».
  - Forme d'onde + BPM calculés une seule fois puis mis en cache
    (%APPDATA%\Ongaku\cache.json).
  - Clic = charger, clic sur la pochette = lecture, Espace = lecture/pause, ← → = ±5 s.
  - ★ favori · + placer à la tête de lecture (piste audio ciblée, sinon la première libre)
    · ↓ importer dans le chutier « Ongaku ». Glisser une ligne vers la timeline fonctionne aussi.

ONGLET BEATS
  - BPM, temps et temps forts (1er temps de chaque mesure) affichés sur l'onde. ÷2 / ×2 si le tempo est ambigu.
  - Marqueurs : chaque temps, 1 temps sur 2, chaque mesure ou transitoires.
  - Marqueurs de CLIP (pas de séquence) : posés sur l'élément du chutier Ongaku, ils apparaissent sur
    toutes les occurrences du clip dans la timeline. Reposer remplace les anciens marqueurs Ongaku du clip.
  - In / Out = limiter à une région. « Effacer » supprime uniquement les marqueurs Ongaku du clip.

IN / OUT (lecteur)
  - Boutons In / Out sous l'onde, ou touches I / O (X pour effacer) : posés à la position de lecture.
  - Les drapeaux IN / OUT se déplacent à la souris ; un clic ailleurs sur l'onde déplace la lecture.

ONGLET FINS
  - Out (touche O) = point de fin, In = début optionnel ; calés sur le temps / la mesure, ou libres.
  - Pas de grille de beats sur l'onde dans cet onglet.
  - Reverb tail, Vinyl stop ou Fondu, rendus hors ligne (OfflineAudioContext) en WAV 48 kHz 24 bits
    dans Documents\Ongaku\Rendus, puis importés et placés à la tête de lecture.
  - « Pré-écouter » joue les 4 dernières secondes avant la coupe + l'effet, sans rien écrire.

DOSSIERS DU PROJET (Musique / SFX)
  - À la racine du projet (dossier du .prproj), Ongaku utilise le sous-dossier dont le nom contient
    « musique »/« music » ou « sfx » (ex. 01_Musique, 02_SFX), et le crée (« Musique » / « SFX ») s'il n'existe pas.
    Le chutier Premiere à la racine suit la même règle (même nom que le dossier).
  - Rendus d'effets et extraits In / Out : toujours écrits dans ce dossier (dossier de secours si le projet
    n'est pas enregistré).
  - Réglages > Bibliothèque > « Fichiers ajoutés au projet » :
      Copier (défaut) : placer / importer / glisser copie le fichier dans le dossier du projet ;
      Sur place : le fichier est importé depuis son emplacement d'origine.
  - Format : un MP3 est toujours exporté en WAV à sa fréquence (16 bits) ; WAV / AIFF gardent leur
    fréquence et leur résolution.

APPARENCE PARTAGÉE (Mori, Ongaku, Sori)
  Thème, nom affiché, couleur du nom et presets de thème sont communs aux trois panneaux :
  %APPDATA%\MoriSuite\appearance.json (macOS : ~/Library/Application Support/MoriSuite/).
  js/suite-theme.js (identique dans les trois panneaux) ; les onglets affichés restent propres à Ongaku.

PAQUETS D'INSTALLATION (Windows / macOS)
  python build.py   → dist/Ongaku-<version>-Windows.zip et dist/Ongaku-<version>-macOS.zip
  Version : CSXS/manifest.xml ET APP_VERSION dans js/app.js (le build refuse si elles diffèrent).
  Installeurs : installer/ (install.ps1 + « Installer Ongaku.bat », « Installer Ongaku.command »).
  Compatibilité : Premiere Pro 2022+ (CEP 11) : le CSS utilise flex « gap » et « inset ».
  Tests : .claude/test/harness.html (faux disque + faux Premiere exécutant le vrai JSX), servi par
  « python -m http.server » à la racine du dossier.

FICHIERS
  CSXS/manifest.xml       déclaration du panneau (Node.js activé)
  index.html, css/        interface
  js/library.js           scan disque, tags ID3, cache
  js/analysis.js          forme d'onde, BPM, beats (programmation dynamique), transitoires
  js/effects.js           reverb tail / vinyl stop / fondu + encodeur WAV 24 bits
  js/app.js               interface et logique du panneau
  jsx/Ongaku_Premiere.jsx import, placement timeline, marqueurs (ExtendScript)

Débogage : http://localhost:8089 dans Chrome quand le panneau est ouvert.
