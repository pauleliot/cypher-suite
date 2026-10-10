KIRU — autocut par le texte et sous-titres pour Premiere Pro (même DA que Mori, Ongaku et Sori)
==============================================================================================

Ouvrir : Premiere Pro > Fenêtre > Extensions > Kiru — Autocut
(kiru, 切る : couper.) Deux étapes, deux onglets.

1 · NETTOYER (couper l'inutile)
  - Le texte de la séquence s'affiche en haut ; « Couper l'inutile » en dessous : cocher ce qu'il faut repérer,
    puis Analyser (transcrit la séquence si besoin, instantané grâce au cache) :
      Silences   pauses entre les mots au-delà d'une durée, avec une marge gardée avant / après la parole ;
      Hésitations « euh, hum… » (liste dans Réglages > IA) et mots répétés (« le le ») ;
      Reprises et faux départs  phrase recommencée : seule la dernière prise est gardée (js/retakes.js) ;
      Relecture IA  prises ratées, phrases abandonnées, discussions hors tournage (moteur : Réglages > IA).
  - Tout est barré dans le texte (survol = raison) ; un silence repéré est une pastille (clic = le garder).
    Clic sur un mot = tête de lecture ; glisser = sélection ; Suppr = barrer ; double-clic = corriger
    (on peut taper plusieurs mots : « milieu » → « milieux populaires »). Les corrections sont gardées en cache.
  - Action : Supprimer (coupe toutes les pistes déverrouillées et recolle, synchro gardée), Couper seulement
    (coups de lame), Marqueurs. « Garder la séquence d'origine intacte » coupe une copie de la séquence.
  - Exporter : la transcription en sous-titres Premiere, en SRT, ou en texte avec timecodes.
  - Chapitres : l'IA propose des chapitres YouTube (marqueurs ou texte à copier).

2 · SOUS-TITRES
  - Stylés (Shorts, Reels) : presets (Pop, AF, Karaoké, Impact…), aperçu animé au format de la séquence.
    Générer pose un graphique modifiable par sous-titre (modèle assets/captions/Kiru Pop 3.mogrt) : texte, temps
    des mots, police, taille, position, couleurs, boîte, glissement, flou de mouvement modifiables dans
    Fenêtre > Objets graphiques essentiels. Découpage par phrases (jamais « … pour | C'est … »).
  - Classiques (interview) : l'IA (Claude conseillé) nettoie le texte (orthographe, accords, ponctuation,
    hésitations, répétitions, faux départs) ; Kiru recale le texte nettoyé sur les mots prononcés, redécoupe par
    idées (2 lignes, 42 caractères, 30 en vertical, 1 à 6 s, 17 car./s) et cale les temps sur les images
    (écart minimal, enchaînement sous 12 images). Sortie : piste de sous-titres Premiere ou fichier SRT, avec la
    liste des passages supprimés et des mots corrigés à vérifier (js/subtitles.js).

TRANSCRIPTION (js/transcribe.js)
  whisper.cpp sur l'ordinateur (rien n'est envoyé en ligne), version GPU NVIDIA proposée. Temps des mots par
  alignement DTW puis recalés sur la voix (début et fin) ; les passages de voix restés sans mot (prises
  répétées) sont réécoutés, et les mots isolés oubliés retrouvés quand la réécoute confirme leurs voisins.
  Cache : %APPDATA%\Kiru\cache (Réglages > Analyse > Vider le cache des transcriptions).

RÉGLAGES > IA
  whisper.cpp et ses modèles (Large v3 Turbo recommandé, Large v3 pour la précision), langue, hésitations.
  Moteur de l'IA : IA locale (llama.cpp + Qwen3 4B, gratuite), abonnement Claude (Claude Code de l'application
  Claude, connexion une fois avec /login : « Claude connecté » s'affiche) ou clé API Claude.

APPARENCE PARTAGÉE (Mori, Ongaku, Sori, Kiru)
  Windows : %APPDATA%\MoriSuite\appearance.json · macOS : ~/Library/Application Support/MoriSuite/appearance.json

DÉVELOPPEMENT
  python build.py → dist/Kiru-<version>-Windows.zip et -macOS.zip (version : CSXS/manifest.xml = APP_VERSION).
  Modèle de sous-titres : After Effects > Fichier > Scripts > tools/build-mogrt.jsx (configuration :
  tools/build-mogrt.json ; export seul : tools/export-mogrt.jsx).
  Fichiers : js/transcribe.js (whisper), js/captions.js (styles, découpage), js/subtitles.js (interview),
  js/retakes.js, js/llm.js (IA locale), js/ai.js (Claude), js/tab-text.js, js/tab-captions.js, js/app.js,
  jsx/Kiru_Premiere.jsx (scripts Premiere, 100 % ASCII).
  Débogage : http://localhost:8091 dans Chrome quand le panneau est ouvert.
