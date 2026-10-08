========================================================================
CYPHER — STUDIO : PANNEAU PREMIERE PRO (2024 - 2026+)
========================================================================

Outils inclus :
  1. Audio      : convertit les MP3/M4A/AAC du projet en WAV (48 kHz / 24 bits
                  par défaut) à côté de l'original, puis relie les clips.
  2. Vidéo      : glissez un MKV, TS, WebM, M3U8, AV1, VP9… : remux MP4 sans
                  perte ou réencodage H.264/AAC à cadence constante, puis
                  import dans le chutier actif. Scan du projet pour
                  réencoder les vidéos à cadence variable.
  3. Chutier    : range rushes, séquences, musiques, SFX, assets et exports
                  dans une arborescence standard. Règles modifiables :
                  extensions, mots-clés du nom de fichier, sous-chutiers,
                  seuil de durée musique / SFX. Presets partageables en
                  équipe (Réglages > Chutiers > Exporter / Importer).
  4. Retours    : collez les retours client (mail, WhatsApp, CSV Vimeo…),
                  posez-les en marqueurs sur la timeline, cochez-les une fois
                  traités. Clic sur un retour : la tête de lecture y va. La
                  liste suit la timeline (marqueur déplacé, modifié ou
                  supprimé dans Premiere). « Poser sur : le clip » attache le
                  marqueur au plan pour qu'il le suive au montage. En bas :
                  décaler tous les marqueurs après la tête de lecture d'une
                  durée (négative après un supprimer et raccorder).
  5. Web        : collez un lien YouTube ou tapez une recherche (5 à 50
                  résultats), aperçu ▶ de la vidéo, MP4 (résolution) ou WAV
                  (bits et fréquence) : téléchargement puis import dans le
                  chutier actif. ✂ Trim : aperçu + forme d'onde, points IN /
                  OUT (touches I / O) pour ne télécharger qu'un passage.
                  Ne téléchargez que des vidéos dont vous avez les droits.
  6. Checker    : avant l'export, vérifie la séquence active (médias hors
                  ligne, trous, pistes muettes, disque système, cadences,
                  résolutions, pixels, 44,1/48 kHz, effets et polices
                  manquants, loudness du mixage). Contrôle aussi un fichier
                  PAD selon la norme d'un diffuseur (France TV, TF1, Canal+,
                  EBU R128, Web…), en lot pour un dossier entier (rapport PDF
                  à côté de chaque fichier + récap CSV), et consolide le projet.
                  Existe aussi en application autonome : Cypher Checker.

Cypher Console (façon FX Console) : Ctrl+Espace (Windows) ou ⌥Espace (Mac) quand
Premiere est au premier plan ouvre une petite fenêtre : tapez le nom d'un effet
(vidéo ou audio, plugins compris), Entrée l'applique aux clips sélectionnés.
Maj+Entrée : sans fermer · Tab : vidéo/audio · Ctrl+D : favori · Échap : fermer.
Mac : autorisez Premiere (ou osascript) dans Réglages Système > Confidentialité et
sécurité > Accessibilité (Cypher l'explique et ouvre les réglages si besoin ; le
raccourci marche dès la case cochée). Journal : ~/Library/Logs/Cypher-raccourci.log.
Sinon, donnez un raccourci à « Cypher Console » dans Premiere Pro > Raccourcis
clavier. Aussi dans Fenêtre > Extensions > Cypher Console.

Réglages > Configuration : les profils regroupent tous les réglages
(chutiers, marqueurs, normes, apparence…) et s'exportent en un seul code
pour configurer un poste de l'équipe.
Réglages > Apparence : le nom affiché à côté de « Cypher » renomme aussi la
fenêtre du panneau dans Premiere (au prochain démarrage de Premiere).
Le thème, le nom affiché et les presets de thème sont partagés avec Ongaku
et Sori (%APPDATA%\CypherSuite\appearance.json) : un changement dans l'un
des panneaux s'applique aux autres.

------------------------------------------------------------------------
INSTALLATION (quelques minutes, connexion internet nécessaire)
------------------------------------------------------------------------
Fermez Premiere Pro, décompressez le dossier, puis :

WINDOWS
  Double-cliquez sur « Installer Cypher.bat ».

MAC
  Double-cliquez sur « Installer Cypher.command ».
  La première fois, macOS peut refuser d'ouvrir un script non signé :
  faites alors clic droit > Ouvrir, puis confirmez « Ouvrir ».

Puis ouvrez Premiere Pro : Fenêtre > Extensions > Cypher — Studio

L'installeur fait tout, sans droits administrateur :
  - autorise le panneau dans Premiere Pro (extensions non signées) ;
  - copie le panneau (une version déjà installée est mise à jour, rien
    d'autre n'est supprimé) ;
  - télécharge depuis leurs sources officielles ce qui manque :
      FFmpeg et ffprobe (outils Vidéo et Web),
      yt-dlp (outil Web, mis à jour à chaque installation),
      Deno (demandé par yt-dlp pour YouTube) ;
    ce qui est déjà installé sur l'ordinateur est réutilisé ;
  - vérifie à la fin que chaque programme répond.

Pour mettre à jour Cypher ou yt-dlp : relancez simplement l'installeur.

------------------------------------------------------------------------
BON À SAVOIR
------------------------------------------------------------------------
- Le panneau fonctionne sans connexion internet (seul l'outil Web en a
  besoin, pour télécharger).
- La lecture des captures d'écran (onglet Retours) nécessite le serveur IA
  du projet source : dans le panneau installé, collez plutôt le texte.
- Désinstallation : supprimez le dossier com.cypher.studio.panel dans
  %APPDATA%\Adobe\CEP\extensions (Windows) ou
  ~/Library/Application Support/Adobe/CEP/extensions (Mac).
