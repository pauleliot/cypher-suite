# Suite Mori

Quatre panneaux gratuits pour **Adobe Premiere Pro** (Windows et macOS), en français, avec le même thème partagé.

| Panneau | Dossier | |
|---|---|---|
| **Mori** | `Mori/` | Médias (WAV, remux MP4), chutiers, retours client en marqueurs, Checker avant export |
| **Ongaku** 楽 | `Ongaku/` | Bibliothèque musique / SFX, BPM et beats en marqueurs, fins calées sur la mesure |
| **Sori** 反 | `Sori/` | Éditeur de courbes d'animation (position, échelle, rotation, opacité), flou de mouvement |
| **Kiru** 切 | `Kiru/` | Autocut par le texte (silences, hésitations, reprises), transcription locale, sous-titres stylés et d'interview |

**Présentation et téléchargements :** [pauleliot.github.io/plugins.html](https://pauleliot.github.io/plugins.html)
· toutes les versions : onglet [**Releases**](../../releases).

## Installer

Fermez Premiere Pro, puis :

- **Windows** : lancez `Installer-<Nom>-<version>.exe`. Si Windows affiche « Windows a protégé votre ordinateur » :
  *Informations complémentaires › Exécuter quand même*. Désinstallation : Paramètres › Applications.
- **macOS** : dézippez `Installer-<Nom>-<version>-macOS.zip`, double-cliquez **Installer <Nom>**. La première fois :
  *Réglages Système › Confidentialité et sécurité › Ouvrir quand même*.

Puis dans Premiere Pro : Fenêtre › Extensions › le panneau. Premiere Pro 2022 ou plus récent (Mori : 2024 ou plus
récent). Aucun droit administrateur nécessaire.

## Développement

Ce dépôt est le dossier des extensions CEP lui-même (`%APPDATA%\Adobe\CEP\extensions` sous Windows) : les panneaux
s'y modifient et s'y testent en place. Le `.gitignore` ne suit que les 4 panneaux et `release.py`.

- Panneaux : HTML / CSS / JavaScript sans étape de compilation (CEP), scripts hôtes ExtendScript dans `jsx/`.
- `python release.py` : fabrique dans `.release/` l'installeur Windows (`.exe`, Inno Setup) et l'application
  d'installation macOS (`.app` zippée) de chaque panneau ; ils lancent le script `installer/install.ps1` ou
  `Installer <Nom>.command` du panneau en mode automatique (`SUITE_AUTO=1`).
- `python release.py --publish` : publie en plus les Releases manquantes (`kiru-v1.2.0`…) avec GitHub CLI.
- Kiru : le modèle de sous-titres `assets/captions/Kiru Pop 3.mogrt` se fabrique dans After Effects avec
  `Kiru/tools/build-mogrt.jsx`.
