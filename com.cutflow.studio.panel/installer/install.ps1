# Cypher — Studio : installeur Windows (lancé par « Installer Cypher.bat »)
# Installe le panneau et tout ce qu'il utilise, sans droits administrateur ni winget :
#   - autorisation des extensions non signées dans Premiere Pro (CEP 9 à 14)
#   - copie du panneau (par-dessus une version existante, sans rien supprimer)
#   - FFmpeg + ffprobe (outils Vidéo et Web), yt-dlp (outil Web), Deno (requis par yt-dlp pour YouTube),
#     téléchargés depuis leurs sources officielles dans le dossier bin\win du panneau s'ils manquent

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Host.UI.RawUI.WindowTitle = 'Installation de Cypher — Studio'

$Source = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.cypher.studio.panel'
$Bin = Join-Path $Target 'bin\win'
$Temp = Join-Path $env:TEMP ("cypher-install-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$Results = [ordered]@{}

function Step($n, $text) { Write-Host ''; Write-Host "  [$n/5] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "        OK  $text" -ForegroundColor Green }
function Info($text) { Write-Host "        $text" -ForegroundColor Gray }
function Fail($text) { Write-Host "        ÉCHEC  $text" -ForegroundColor Red }
function Finish($code) {
  if (Test-Path $Temp) { Remove-Item -Recurse -Force $Temp -ErrorAction SilentlyContinue }
  Write-Host ''
  if (-not $env:SUITE_AUTO) { Read-Host '  Appuyez sur Entrée pour fermer' }
  exit $code
}

function Save-Url($url, $dest, $label) {
  Info "Téléchargement de $label…"
  # curl (intégré à Windows 10/11) : pleine vitesse et barre de progression ; sinon Invoke-WebRequest.
  # (BITS est volontairement bridé et peut prendre plus de 10 minutes pour FFmpeg.)
  $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
  $ok = $false
  if (Test-Path $curl) {
    & $curl -fL --retry 3 --progress-bar -o $dest $url
    $ok = ($LASTEXITCODE -eq 0)
  }
  if (-not $ok) {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  }
  if (-not (Test-Path $dest) -or (Get-Item $dest).Length -lt 100KB) { throw "téléchargement incomplet ($label)" }
}

function Find-System($exe) {
  $cmd = Get-Command $exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $link = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\$exe"
  if (Test-Path $link) { return $link }
  return $null
}

function Test-Tool($label, $path, $versionArgs) {
  # un programme qui écrit sur stderr ne doit pas être pris pour une erreur fatale
  $ErrorActionPreference = 'Continue'
  try {
    # sortie lue en entier : couper le pipeline après une ligne peut interrompre le programme
    $lines = @(& $path @versionArgs 2>$null)
    $code = $LASTEXITCODE
    $out = $lines | Select-Object -First 1
    if ($code -eq 0 -and $out) { Ok "$label : $out"; $Results[$label] = $true; return }
  } catch {}
  Fail "$label ne répond pas ($path)"
  $Results[$label] = $false
}

if (-not $env:SUITE_AUTO) { Clear-Host }
Write-Host ''
Write-Host '  Cypher — Studio : installation du panneau Premiere Pro' -ForegroundColor White
Write-Host '  ======================================================' -ForegroundColor DarkGray

# 0. Premiere Pro doit être fermé : il verrouille les fichiers du panneau
if (-not $env:SUITE_TEST -and (Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host '  Premiere Pro est ouvert : fermez-le, puis relancez l''installation.' -ForegroundColor Yellow
  Finish 1
}

try {
  # 1. Extensions non signées
  Step 1 'Autorisation du panneau dans Premiere Pro'
  foreach ($v in 9..14) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -Type String
  }
  Ok 'extensions non signées autorisées (Premiere 2019 à 2026+)'

  # 2. Copie du panneau
  Step 2 'Copie du panneau'
  $sameFolder = (Resolve-Path $Source).Path.TrimEnd('\') -ieq $Target.TrimEnd('\')
  if ($sameFolder) {
    Ok 'panneau déjà en place'
  } else {
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    robocopy $Source $Target /E /NFL /NDL /NJH /NJS /NP /XD installer /XF 'Installer Cypher.bat' 'Installer Cypher.command' README.txt .debug | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copie impossible vers $Target (code robocopy $LASTEXITCODE)" }
    Get-ChildItem -Path $Target -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
    Ok "copié dans $Target"
  }

  # Ancien identifiant du panneau (com.cutflow.studio.panel, jusqu'à la v2.6.0) :
  # réglages (chutiers, presets, thème…) et outils déjà téléchargés repris, ancien panneau retiré
  $OldTarget = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.cutflow.studio.panel'
  $cepCache = Join-Path $env:TEMP 'cep_cache'
  if (Test-Path $cepCache) {
    Get-ChildItem -Path $cepCache -Directory -Filter '*_com.cutflow.studio.panel' | ForEach-Object {
      $newCache = Join-Path $cepCache ($_.Name -replace 'com\.cutflow\.studio\.panel$', 'com.cypher.studio.panel')
      $oldStorage = Join-Path $_.FullName 'Local Storage'
      if ((Test-Path $oldStorage) -and -not (Test-Path (Join-Path $newCache 'Local Storage'))) {
        New-Item -ItemType Directory -Force -Path $newCache | Out-Null
        Copy-Item -Recurse -Force $oldStorage $newCache
        Ok 'réglages de l''ancienne version repris'
      }
    }
  }
  $sourceFull = (Resolve-Path $Source).Path.TrimEnd('\')
  if ((Test-Path $OldTarget) -and -not $sourceFull.StartsWith($OldTarget, [StringComparison]::OrdinalIgnoreCase)) {
    if (Test-Path (Join-Path $OldTarget 'app.source.tsx')) {
      Info 'ancien dossier de développement conservé (com.cutflow.studio.panel) : supprimez-le pour éviter un doublon'
    } else {
      $oldBin = Join-Path $OldTarget 'bin\win'
      if (Test-Path $oldBin) {
        New-Item -ItemType Directory -Force -Path $Bin | Out-Null
        Get-ChildItem -Path $oldBin -File | Where-Object { -not (Test-Path (Join-Path $Bin $_.Name)) } | Move-Item -Destination $Bin
      }
      Remove-Item -Recurse -Force $OldTarget
      Ok 'ancienne version du panneau retirée (outils conservés)'
    }
  }
  New-Item -ItemType Directory -Force -Path $Bin, $Temp | Out-Null

  # 3. FFmpeg + ffprobe
  Step 3 'FFmpeg (conversion vidéo et audio)'
  $ffmpeg = Join-Path $Bin 'ffmpeg.exe'
  $ffprobe = Join-Path $Bin 'ffprobe.exe'
  if (-not (Test-Path $ffmpeg)) {
    $sysFfmpeg = Find-System 'ffmpeg.exe'
    $sysFfprobe = Find-System 'ffprobe.exe'
    if ($sysFfmpeg -and $sysFfprobe) {
      $ffmpeg = $sysFfmpeg; $ffprobe = $sysFfprobe
      Info 'déjà installé sur cet ordinateur'
    } else {
      $zip = Join-Path $Temp 'ffmpeg.zip'
      Save-Url 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' $zip 'FFmpeg (~110 Mo, source gyan.dev)'
      Expand-Archive -Path $zip -DestinationPath (Join-Path $Temp 'ffmpeg') -Force
      Get-ChildItem -Path (Join-Path $Temp 'ffmpeg') -Recurse -Include 'ffmpeg.exe', 'ffprobe.exe' | Copy-Item -Destination $Bin -Force
    }
  }
  Test-Tool 'FFmpeg' $ffmpeg @('-hide_banner', '-version')
  Test-Tool 'ffprobe' $ffprobe @('-hide_banner', '-version')

  # 4. yt-dlp (+ mise à jour : YouTube change souvent)
  Step 4 'yt-dlp (téléchargement de vidéos en ligne)'
  $ytdlp = Join-Path $Bin 'yt-dlp.exe'
  if (Test-Path $ytdlp) {
    Info 'mise à jour…'
    $ErrorActionPreference = 'Continue'
    try { & $ytdlp -U 2>&1 | Out-Null } catch { Info 'mise à jour impossible, version actuelle conservée' }
    $ErrorActionPreference = 'Stop'
  } else {
    $sysYtdlp = Find-System 'yt-dlp.exe'
    if ($sysYtdlp) {
      $ytdlp = $sysYtdlp
      Info 'déjà installé sur cet ordinateur'
    } else {
      Save-Url 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' $ytdlp 'yt-dlp (~17 Mo, source GitHub officielle)'
    }
  }
  Test-Tool 'yt-dlp' $ytdlp @('--version')

  # 5. Deno (moteur JavaScript demandé par yt-dlp pour YouTube)
  Step 5 'Deno (requis par yt-dlp pour YouTube)'
  $deno = Join-Path $Bin 'deno.exe'
  if (-not (Test-Path $deno)) {
    $sysDeno = Find-System 'deno.exe'
    if ($sysDeno) {
      $deno = $sysDeno
      Info 'déjà installé sur cet ordinateur'
    } else {
      $zip = Join-Path $Temp 'deno.zip'
      Save-Url 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip' $zip 'Deno (~41 Mo, source GitHub officielle)'
      Expand-Archive -Path $zip -DestinationPath $Bin -Force
    }
  }
  Test-Tool 'Deno' $deno @('--version')
} catch {
  Write-Host ''
  Fail $_.Exception.Message
  Write-Host '        Vérifiez la connexion internet puis relancez « Installer Cypher.bat ».' -ForegroundColor Yellow
  Finish 1
}

Write-Host ''
if ($Results.Values -contains $false) {
  Write-Host '  Installation terminée avec des erreurs (voir ci-dessus).' -ForegroundColor Yellow
  Write-Host '  Les outils concernés resteront indisponibles dans le panneau ; relancez l''installeur pour réessayer.' -ForegroundColor Yellow
} else {
  Write-Host '  Installation terminée : tout est prêt.' -ForegroundColor Green
}
Write-Host '  Ouvrez Premiere Pro puis : Fenêtre > Extensions > Cypher — Studio' -ForegroundColor White
Finish 0
