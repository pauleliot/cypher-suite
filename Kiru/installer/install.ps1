# Kiru : installeur Windows (lancé par « Installer Kiru.bat »)
# Sans droits administrateur :
#   1. autorise les extensions non signées dans Premiere Pro (CEP 9 à 16)
#   2. copie le panneau dans %APPDATA%\Adobe\CEP\extensions\com.kiru.panel (remplace une version précédente)
#   3. installe la police Montserrat pour l'utilisateur (modèle de sous-titres modifiables), si elle manque
# Les réglages et les profils de détection ne sont pas touchés.

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Installation de Kiru'

$Source = Split-Path -Parent $PSScriptRoot
$Extensions = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$Target = Join-Path $Extensions 'com.kiru.panel'

function Step($n, $text) { Write-Host ''; Write-Host "  [$n/4] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "        OK  $text" -ForegroundColor Green }
function Info($text) { Write-Host "        $text" -ForegroundColor Gray }
function Fail($text) { Write-Host "        ÉCHEC  $text" -ForegroundColor Red }
function Finish($code) { Write-Host ''; if (-not $env:SUITE_AUTO) { Read-Host '  Appuyez sur Entrée pour fermer' }; exit $code }

if (-not $env:SUITE_AUTO) { Clear-Host }
Write-Host ''
Write-Host '  Kiru : installation du panneau Premiere Pro' -ForegroundColor White
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
    robocopy $Source $Target /MIR /NFL /NDL /NJH /NJS /NP /XD installer /XF 'Installer Kiru.bat' 'Installer Kiru.command' 'LISEZMOI.txt' | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copie impossible vers $Target (code robocopy $LASTEXITCODE)" }
    Get-ChildItem -Path $Target -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
    Ok "copié dans $Target"
  }

  Step 3 'Police des sous-titres'
  # le modèle « Kiru Pop » utilise Montserrat : installée pour cet utilisateur, sans droits administrateur
  $fontFile = 'Montserrat-VariableFont_wght.ttf'
  $fontSrc = Join-Path $Target "assets\fonts\$fontFile"
  $userFonts = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
  $fontKey = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
  $already = (Test-Path (Join-Path $userFonts $fontFile)) -or (Test-Path (Join-Path $env:WINDIR "Fonts\$fontFile")) -or
    ((Get-ItemProperty $fontKey -ErrorAction SilentlyContinue).PSObject.Properties | Where-Object { $_.Name -like 'Montserrat*' })
  if ($already) {
    Ok 'Montserrat déjà installée'
  } elseif (Test-Path $fontSrc) {
    New-Item -ItemType Directory -Force -Path $userFonts | Out-Null
    Copy-Item $fontSrc (Join-Path $userFonts $fontFile) -Force
    if (-not (Test-Path $fontKey)) { New-Item -Path $fontKey -Force | Out-Null }
    Set-ItemProperty -Path $fontKey -Name 'Montserrat (TrueType)' -Value (Join-Path $userFonts $fontFile) -Type String
    Ok 'Montserrat installée (licence SIL Open Font License)'
  } else {
    Info 'police Montserrat absente du paquet : les sous-titres modifiables utiliseront une police de remplacement'
  }

  Step 4 'Vérification'
  $manifest = Join-Path $Target 'CSXS\manifest.xml'
  if (-not (Test-Path $manifest)) { throw 'manifest.xml introuvable après la copie' }
  $version = ([xml](Get-Content -Raw -Encoding UTF8 $manifest)).ExtensionManifest.ExtensionBundleVersion
  Ok "Kiru $version installé"
  # une autre copie du même panneau (dossier de développement…) ferait un doublon dans Premiere
  Get-ChildItem -Path $Extensions -Directory | Where-Object { $_.FullName -ine $Target } | ForEach-Object {
    $m = Join-Path $_.FullName 'CSXS\manifest.xml'
    if ((Test-Path $m) -and (Select-String -Path $m -Pattern 'ExtensionBundleId="com.kiru.panel"' -Quiet)) {
      Info "Attention : une autre copie de Kiru existe dans « $($_.Name) » ; supprimez-la pour éviter un doublon."
    }
  }
} catch {
  Write-Host ''
  Fail $_.Exception.Message
  Finish 1
}

Write-Host ''
Write-Host '  Installation terminée.' -ForegroundColor Green
Write-Host '  Ouvrez Premiere Pro (2022 ou plus récent) puis : Fenêtre > Extensions > Kiru — Autocut' -ForegroundColor White
Finish 0
