# Ongaku : installeur Windows (lancé par « Installer Ongaku.bat »)
# Sans droits administrateur :
#   1. autorise les extensions non signées dans Premiere Pro (CEP 9 à 16)
#   2. copie le panneau dans %APPDATA%\Adobe\CEP\extensions\com.ongaku.panel (remplace une version précédente)
# Les réglages (bibliothèque, thème, favoris) et le cache d'analyse ne sont pas touchés.

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Installation d''Ongaku'

$Source = Split-Path -Parent $PSScriptRoot
$Extensions = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$Target = Join-Path $Extensions 'com.ongaku.panel'

function Step($n, $text) { Write-Host ''; Write-Host "  [$n/3] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "        OK  $text" -ForegroundColor Green }
function Info($text) { Write-Host "        $text" -ForegroundColor Gray }
function Fail($text) { Write-Host "        ÉCHEC  $text" -ForegroundColor Red }
function Finish($code) { Write-Host ''; if (-not $env:SUITE_AUTO) { Read-Host '  Appuyez sur Entrée pour fermer' }; exit $code }

if (-not $env:SUITE_AUTO) { Clear-Host }
Write-Host ''
Write-Host '  Ongaku : installation du panneau Premiere Pro' -ForegroundColor White
Write-Host '  =============================================' -ForegroundColor DarkGray

# Premiere Pro verrouille les fichiers du panneau : il doit être fermé
if (-not $env:SUITE_TEST -and (Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host '  Premiere Pro est ouvert : fermez-le, puis relancez l''installation.' -ForegroundColor Yellow
  Finish 1
}

try {
  Step 1 'Autorisation du panneau dans Premiere Pro'
  foreach ($v in 9..16) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -Type String
  }
  Ok 'extensions non signées autorisées'

  Step 2 'Copie du panneau'
  $sameFolder = (Resolve-Path $Source).Path.TrimEnd('\') -ieq $Target.TrimEnd('\')
  if ($sameFolder) {
    Ok 'panneau déjà en place'
  } else {
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    # /MIR : copie exacte (les fichiers d'une ancienne version qui n'existent plus sont retirés)
    robocopy $Source $Target /MIR /NFL /NDL /NJH /NJS /NP /XD installer /XF 'Installer Ongaku.bat' 'Installer Ongaku.command' 'LISEZMOI.txt' | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copie impossible vers $Target (code robocopy $LASTEXITCODE)" }
    Get-ChildItem -Path $Target -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
    Ok "copié dans $Target"
  }

  Step 3 'Vérification'
  $manifest = Join-Path $Target 'CSXS\manifest.xml'
  if (-not (Test-Path $manifest)) { throw 'manifest.xml introuvable après la copie' }
  $version = ([xml](Get-Content -Raw -Encoding UTF8 $manifest)).ExtensionManifest.ExtensionBundleVersion
  Ok "Ongaku $version installé"
  # une autre copie du même panneau (dossier de développement…) ferait un doublon dans Premiere
  Get-ChildItem -Path $Extensions -Directory | Where-Object { $_.FullName -ine $Target } | ForEach-Object {
    $m = Join-Path $_.FullName 'CSXS\manifest.xml'
    if ((Test-Path $m) -and (Select-String -Path $m -Pattern 'ExtensionBundleId="com.ongaku.panel"' -Quiet)) {
      Info "Attention : une autre copie d'Ongaku existe dans « $($_.Name) » ; supprimez-la pour éviter un doublon."
    }
  }
} catch {
  Write-Host ''
  Fail $_.Exception.Message
  Finish 1
}

Write-Host ''
Write-Host '  Installation terminée.' -ForegroundColor Green
Write-Host '  Ouvrez Premiere Pro (2022 ou plus récent) puis : Fenêtre > Extensions > Ongaku — Musique' -ForegroundColor White
Finish 0
