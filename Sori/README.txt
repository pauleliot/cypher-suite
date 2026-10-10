SORI — éditeur de courbes d'animation pour Premiere Pro (même DA que Mori et Ongaku)
=====================================================================================

Ouvrir : Premiere Pro > Fenêtre > Extensions > Sori — Courbes
(sori, 反り : la courbure d'une lame ; le mode débogage CEP « PlayerDebugMode = 1 » est déjà activé sur ce poste.)

PRINCIPE
  Premiere n'expose pas les poignées de Bézier de ses images clés en script. Sori « cuit » donc la courbe :
  entre vos images clés d'origine (départ / arrivée), il pose des images clés linéaires qui suivent la courbe.
  Les valeurs des clés d'origine ne changent jamais ; seul le rythme entre elles change.

ONGLET COURBE
  - Vue Valeur (amplitude, 0 → 100 %) ou Vitesse (× la vitesse moyenne ; 1× = mouvement linéaire). Touche V.
  - Glisser les poignées ; Maj = poignée à plat (vitesse nulle) ; Alt = casser la tangente d'une sous-clé.
  - Double-clic sur la courbe = sous-clé (subdivision de De Casteljau : la courbe reste identique au pixel près).
    Double-clic sur une sous-clé ou Suppr = la retirer. Chaque valeur de la barre d'info se modifie au clic
    (temps, valeur, influence et vitesse d'entrée / sortie).
  - Si des clips animés sont sélectionnés, la grille passe en images (durée entre leurs 2 premières clés) :
    pratique pour caler une sous-clé sur un cut ou un SFX. Les sous-clés s'aimantent aux images (Maj = libre).
  - Ctrl+Z / Ctrl+Maj+Z : annuler / rétablir. Signet = enregistrer comme preset. Clic sur le cubic-bezier = copier.

APPLIQUER (Ctrl+Entrée)
  - Propriétés : toutes celles qui sont animées (au moins 2 images clés) sur les clips sélectionnés :
    Position, Échelle (+ largeur si non uniforme), Rotation, Opacité. Premiere ne permet pas à un script de
    savoir quelles propriétés sont sélectionnées dans les Options d'effet.
  - La courbe s'applique entre chaque paire de clés consécutives.
  - Flou de mouvement (activé par défaut) : on pose ses clés sur la Trajectoire comme d'habitude ;
    au clic sur « Appliquer », Sori ajoute l'effet Transformation, y recopie les clés avec leurs valeurs
    absolues (et les valeurs fixes, ex. clip 4K réduit à 50 %), règle l'angle d'obturation (Faible 90°,
    Moyen 180°, Élevé 360°) et remet la Trajectoire à zéro (centrée, 100 %, 0°).
    « Appliquer » travaille ensuite directement sur les clés de Transformation.
  - Densité des clés (Réglages > Injection) : Légère (défaut, écart ≤ 1,2 % : ~8 clés pour 1 s),
    Précise (≤ 0,3 %), Chaque image. Premiere ne permet pas de régler influence / vitesse des poignées en
    script (seulement le type de clé) : 2 clés Bézier réglées par Sori sont impossibles.
  - Changer la courbe d'un clip déjà traité : sélectionnez-le, sa courbe revient dans l'éditeur ; modifiez-la
    puis « Appliquer » : les images clés sont recalculées à partir des clés d'origine.
  - Annuler (bouton à côté d'Appliquer, ou Ctrl+Z quand le panneau Sori est actif) : remet les clips exactement
    comme avant la dernière application (10 niveaux), même si la sélection a changé. À préférer au Ctrl+Z de
    Premiere, qui peut faire planter Premiere après une modification par script. Un effet Transformation ajouté
    par Sori est remis au neutre (aucun changement à l'image) et réutilisé ensuite ; on peut le supprimer à la main.
  - La sélection n'est relue que lorsque la souris est sur le panneau : pendant le travail dans la timeline
    (Ctrl+Z…), Sori n'interroge pas Premiere.
  - Boucle jusqu'à la fin : Cycle ou Ping-pong jusqu'au dernier plan du clip.
  - Réappliquer une autre courbe sur un clip déjà traité fonctionne : Sori mémorise les clés d'origine
    tant que la première et la dernière clé cuites n'ont pas bougé.
    Réglages > Injection > « Oublier les clés mémorisées » pour repartir de ce qui est dans Premiere.

ONGLET BIBLIOTHÈQUE
  - Presets : Linéaire, Ease, Ease In / Out / In-Out, Smooth, Cubic, Quint, Expo, Back (overshoot),
    Elastic In / Out, Bounce In / Out. Clic = charger ; ⚡ = charger et appliquer ; copier = cubic-bezier / JSON.
  - Mes presets : enregistrés depuis l'éditeur (signet), exportables en JSON (presse-papiers + fichier).
  - Import : cubic-bezier(…) CSS, « x1, y1, x2, y2 », [x1, y1, x2, y2], JSON Sori, liste de presets,
    ou objet { name, bezier: […] } / { x1, y1, x2, y2 } (échange avec After Effects / Flow via cubic-bezier).

APPARENCE PARTAGÉE (Mori, Ongaku, Sori)
  Thème, nom affiché, couleur du nom et presets de thème sont écrits dans
    Windows : %APPDATA%\MoriSuite\appearance.json
    macOS   : ~/Library/Application Support/MoriSuite/appearance.json
  (js/suite-theme.js, copié à l'identique dans Ongaku/js et com.cutflow.studio.panel/vendor).
  Un changement dans un panneau est repris en direct par les autres. Les onglets affichés restent propres à
  chaque panneau. Premier lancement : le premier panneau mis à jour (Mori ou Ongaku) crée le fichier avec
  ses réglages ; Sori ne le crée que si on modifie l'apparence depuis Sori.

PAQUETS D'INSTALLATION (Windows / macOS)
  python build.py   → dist/Sori-<version>-Windows.zip et dist/Sori-<version>-macOS.zip
  Version : CSXS/manifest.xml ET APP_VERSION dans js/app.js (le build refuse si elles diffèrent).
  Tests : .claude/test/harness.html (faux Premiere exécutant le vrai JSX), servi par
  « python -m http.server » à la racine du dossier.

FICHIERS
  CSXS/manifest.xml       déclaration du panneau (Node.js activé)
  index.html, css/        interface
  js/curve.js             modèle de courbe : Bézier multi-segments, De Casteljau, presets, import / export
  js/app.js               éditeur canvas, bibliothèque, calcul des clés, réglages
  js/suite-theme.js       apparence partagée Mori / Ongaku / Sori
  jsx/Sori_Premiere.jsx   lecture des clés, injection, effet Transformation (ExtendScript, 100 % ASCII)

Débogage : http://localhost:8090 dans Chrome quand le panneau est ouvert.
