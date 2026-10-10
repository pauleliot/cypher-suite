import React, { useState, useEffect, useRef } from 'react';
import { Scissors, MessageSquare, FileAudio, FolderTree, Settings, Package, Activity, Power, CheckCircle2, AlertCircle, ArrowRightLeft, Volume2, FolderSync, Play, Sparkles, X, Plus, Trash2, Film, FolderOpen, Pencil, Check, RotateCcw, FileSpreadsheet, Image as ImageIcon, CheckCircle, Download, Copy, Clock, Tag, Filter, Send, Layers, ChevronRight, Maximize2, Minimize2, Sliders, Settings2, HelpCircle, AlertTriangle, Info, ShieldCheck, ListChecks, Archive, Menu, Search, Palette } from 'lucide-react';

// ==================== types/index.ts ====================

export type MarkerColor =
  | 'Lavender'
  | 'Cobalt'
  | 'Cyan'
  | 'Chantilly'
  | 'Rose'
  | 'Orange'
  | 'Yellow'
  | 'Green'
  | 'Red'
  | 'Magenta'
  | 'White'
  | 'Blue';

export type PremiereColor = MarkerColor;

export interface ReviewMarker {
  id: string;
  timecode: string; // e.g. "00:01:24:12"
  seconds: number;
  durationSeconds?: number;
  author: string;
  comment: string;
  tag: string; // nom de la catégorie (voir MarkerCategory)
  color: PremiereColor;
  track: 'V1' | 'V2' | 'V3' | 'A1' | 'A2' | 'A3';
  isResolved: boolean;
  createdAt?: string;
  source: 'text' | 'vimeo' | 'screenshot' | 'manual';
  // réponses au retour (fil de discussion Vimeo, lignes « ↳ » collées)
  replies?: ReviewReply[];
  // version du montage visée (« V2 »), lue dans le nom du CSV
  version?: string;
  // lien avec le marqueur posé dans Premiere (liste accordée à la timeline)
  pproGuid?: string;
  pproSeqId?: string;
  pproOwner?: string; // 'seq' ou nodeId du clip qui porte le marqueur
}

export interface ReviewReply {
  author: string;
  text: string;
}

/** Commentaire complet d'un retour : le texte, puis une ligne « ↳ Auteur : réponse » par réponse */
export function commentWithReplies(m: { comment: string; replies?: ReviewReply[] }, includeReplies = true): string {
  if (!includeReplies || !m.replies || m.replies.length === 0) return m.comment;
  return [m.comment, ...m.replies.map((r) => `↳ ${r.author ? `${r.author} : ` : ''}${r.text}`)].join('\n');
}

/** « Monteur : c'est fait » -> { author: 'Monteur', text: "c'est fait" } */
function parseReplyText(text: string, fallbackAuthor = ''): ReviewReply {
  const t = text.replace(/^\s*(↳|>|re\s*:)\s*/i, '').trim();
  const m = t.match(/^([^:]{1,40}?)\s*:\s+(.+)$/);
  return m ? { author: m[1].trim(), text: m[2].trim() } : { author: fallbackAuthor, text: t };
}

/**
 * Version du montage dans un nom : « Projet_V2.csv », « montage v12 final », « Version 3 » -> « V2 », « V12 », « V3 ».
 * Le « v » doit être isolé (pas « mv2 ») ; null si aucune version.
 */
export function detectVersion(name: string): string | null {
  const m = String(name || '').match(/(?:^|[^a-z0-9])(?:v|version)\s*[_.-]?\s*(\d{1,3})(?![0-9])/i);
  return m ? `V${parseInt(m[1], 10)}` : null;
}

/** Tri des versions : V2 après V1, V10 après V9 */
export function versionRank(v?: string): number {
  const n = v ? parseInt(v.replace(/\D/g, ''), 10) : NaN;
  return isFinite(n) ? n : -1;
}

/**
 * CSV d'une version (V2…) : ses retours remplacent ceux de la même version (un retour déjà connu garde son
 * statut, son lien avec la timeline et sa position), les retours des autres versions restent dans la liste.
 * Sans version : la liste est remplacée. Renvoie la liste complète et les retours de la version importée.
 */
export function mergeImportedReviews(previous: ReviewMarker[], parsed: ReviewMarker[], version: string | null) {
  const tagged = parsed.map((m) => (version ? { ...m, version } : m));
  const sameVersion = previous.filter((o) => !version || !o.version || o.version === version);
  const kept = version ? previous.filter((o) => o.version && o.version !== version) : [];
  const used = new Set<string>();
  const current = tagged
    .map((m) => {
      const text = reviewMarkerText(m.comment);
      let old: ReviewMarker | undefined;
      for (const o of sameVersion) {
        if (used.has(o.id) || o.author !== m.author || reviewMarkerText(o.comment) !== text) continue;
        if (!old || Math.abs(o.seconds - m.seconds) < Math.abs(old.seconds - m.seconds)) old = o;
      }
      if (!old) return m;
      used.add(old.id);
      return { ...m, id: old.id, isResolved: old.isResolved, seconds: old.seconds, timecode: old.timecode, pproGuid: old.pproGuid, pproSeqId: old.pproSeqId, pproOwner: old.pproOwner };
    })
    .sort((a, b) => a.seconds - b.seconds);
  const all = [...kept, ...current].sort((a, b) => versionRank(a.version) - versionRank(b.version) || a.seconds - b.seconds);
  return { all, current };
}

export type ResolvedAction = 'green' | 'delete' | 'prefix';

export type AudioSampleRate = 44100 | 48000 | 96000;
export type AudioBitDepth = 16 | 24 | 32;

export interface AudioSettings {
  sampleRate: AudioSampleRate;
  bitDepth: AudioBitDepth;
  autoConvertOnImport: boolean;
  timelineReplacementMode: 'replaceMedia' | 'deleteAndReinsert';
}

export interface ConvertedAudioItem {
  id: string;
  originalName: string;
  originalSize: number;
  originalFormat: string;
  wavBlob?: Blob;
  wavUrl?: string;
  wavSize?: number;
  duration: number;
  channels: number;
  sampleRate: number; // 44100, 48000, 96000
  bitDepth: number; // 16, 24, 32
  status: 'pending' | 'converting' | 'completed' | 'error';
  errorMessage?: string;
  audioBuffer?: AudioBuffer;
}

export type BinRole = 'seq' | 'rushes' | 'music' | 'sfx' | 'assets' | 'exports';

interface SubBin {
  id: string;
  name: string;
  keywords: string[];
}

interface BinRule {
  id: string;
  /** Rôle dans la logique de tri ; absent = chutier personnalisé (tri par extension) */
  role?: BinRole;
  binName: string;
  color: string;
  description: string;
  extensions: string[];
  /** Mots-clés du nom de fichier : prioritaires sur le tri par extension (ex. mp4 + "illu" -> ILLU plutôt que RUSHES) */
  keywords?: string[];
  /** Sous-chutiers : un fichier du chutier dont le nom contient un mot-clé y est rangé */
  subBins?: SubBin[];
  criteria: {
    hasVideo?: boolean;
    audioChannelsMin?: number;
    audioChannelsMax?: number;
    isVectorOrGraphic?: boolean;
    minResolution?: string;
  };
}

export interface ClassifiedFile {
  id: string;
  name: string;
  extension: string;
  size: number;
  type: 'video' | 'audio' | 'image' | 'graphic' | 'other';
  resolution?: string;
  framerate?: number;
  audioChannels?: number;
  assignedBin: string;
  status: 'matched' | 'manual';
}


// ==================== utils/timecode.ts ====================


export const SUPPORTED_FRAMERATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60] as const;
export type FrameRate = (typeof SUPPORTED_FRAMERATES)[number];

/**
 * Format raw seconds to SMPTE timecode string (HH:MM:SS:FF or MM:SS)
 */
export function secondsToTimecode(totalSeconds: number, fps: FrameRate = 25, fullSMPTE = true): string {
  // marge d'arrondi : 12,2 s × 25 = 304,999… doit donner l'image 5, pas 4
  const safeSeconds = Math.max(0, totalSeconds) + 1e-6;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const frames = Math.floor((safeSeconds - Math.floor(safeSeconds)) * fps);

  const pad = (n: number) => String(n).padStart(2, '0');

  if (fullSMPTE || hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Parses any flexible timecode string into total seconds.
 * Supports:
 * - "01:24" -> 84s
 * - "00:01:24:12" -> 84s + 12/fps
 * - "01:24:12" (either HH:MM:SS or MM:SS:FF)
 * - "1m24s", "1'24\"", "1m24"
 * - "84s"
 */
export function timecodeToSeconds(tcString: string, fps: FrameRate = 25): number {
  const clean = tcString.trim().toLowerCase();

  // Pattern like 1m24s or 1'24" or 1m24
  const frenchPattern = /(?:(\d+)h)?(?:(\d+)m|'|min)?(?:(\d+)(?:s|"|sec)?)?(?:(\d+)f)?/;
  if (clean.includes('m') || clean.includes('h') || clean.includes("'") || clean.includes('"')) {
    const match = clean.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:m|'|min))?\s*(?:(\d+)\s*(?:s|"|sec))?\s*(?:(\d+)\s*f)?/);
    if (match) {
      const h = parseInt(match[1] || '0', 10);
      const m = parseInt(match[2] || '0', 10);
      const s = parseInt(match[3] || '0', 10);
      const f = parseInt(match[4] || '0', 10);
      return h * 3600 + m * 60 + s + f / fps;
    }
  }

  // Pure colon separated pattern
  const parts = clean.split(':').map((p) => parseFloat(p) || 0);
  if (parts.length === 4) {
    // HH:MM:SS:FF
    const [h, m, s, f] = parts;
    return h * 3600 + m * 60 + s + f / fps;
  }
  if (parts.length === 3) {
    // Could be HH:MM:SS or MM:SS:FF. If first number is large, likely MM:SS:FF
    const [p0, p1, p2] = parts;
    if (p0 === 0 && p1 <= 59) {
      // 00:01:24 => MM:SS or HH:MM:SS
      return p0 * 3600 + p1 * 60 + p2;
    }
    // Default to HH:MM:SS
    return p0 * 3600 + p1 * 60 + p2;
  }
  if (parts.length === 2) {
    // MM:SS
    const [m, s] = parts;
    return m * 60 + s;
  }
  if (parts.length === 1 && !isNaN(Number(clean))) {
    return Number(clean);
  }

  return 0;
}

// ==================== utils/markerCategories.ts ====================

/** Couleurs de marqueurs Premiere (index de setColorByIndex) avec leur rendu dans le panneau */
export const MARKER_COLORS: Array<{ value: PremiereColor; label: string; hex: string }> = [
  { value: 'Green', label: 'Vert', hex: '#4ade80' },
  { value: 'Red', label: 'Rouge', hex: '#f87171' },
  { value: 'Magenta', label: 'Magenta', hex: '#e879f9' },
  { value: 'Orange', label: 'Orange', hex: '#fb923c' },
  { value: 'Yellow', label: 'Jaune', hex: '#facc15' },
  { value: 'White', label: 'Blanc', hex: '#f5f5f4' },
  { value: 'Blue', label: 'Bleu', hex: '#60a5fa' },
  { value: 'Cyan', label: 'Cyan', hex: '#22d3ee' },
];

export function markerColorHex(color: string): string {
  return (MARKER_COLORS.find((c) => c.value === color) || MARKER_COLORS[0]).hex;
}

export interface MarkerCategory {
  id: string;
  name: string;
  color: PremiereColor;
  /** Mots-clés cherchés en début de mot dans le commentaire ; vide = catégorie par défaut */
  keywords: string[];
  track?: ReviewMarker['track'];
}

export const DEFAULT_MARKER_CATEGORIES: MarkerCategory[] = [
  { id: 'audio', name: 'Audio / Son', color: 'Cyan', track: 'A1', keywords: ['son', 'audio', 'musique', 'music', 'voix', 'vo', 'micro', 'mix', 'mixage', 'lufs', 'bruit', 'volume', 'db', 'souffle', 'echo', 'reverb', 'sfx'] },
  { id: 'titre', name: 'Titre / Typo', color: 'Yellow', keywords: ['titre', 'typo', 'synthé', 'synthe', 'texte', 'faute', 'orthographe', 'coquille', 'nom', 'chapeau', 'bandeau', 'font', 'police', 'sous-titre', 'sub'] },
  { id: 'coupe', name: 'Coupe / Rythme', color: 'Red', keywords: ['coupe', 'couper', 'cut', 'raccord', 'trim', 'hésitation', 'hesitation', 'raccourcir', 'supprimer', 'virer', 'retirer', 'long', 'lent', 'rythme', 'jump', 'blanc'] },
  { id: 'etalo', name: 'Étalonnage / FX', color: 'Magenta', keywords: ['étalo', 'etalo', 'couleur', 'color', 'lumière', 'lumiere', 'sombre', 'clair', 'expo', 'teinte', 'saturation', 'lut', 'contraste', 'balance', 'wb'] },
  { id: 'video', name: 'Vidéo / Image', color: 'Orange', keywords: ['plan', 'cadre', 'cadrage', 'b-roll', 'broll', 'insert', 'flou', 'net', 'zoom', 'pan', 'logo', 'cache', 'bande', 'vfx', 'masque'] },
  { id: 'general', name: 'Général', color: 'Green', keywords: [] },
];

export function defaultMarkerCategories(): MarkerCategory[] {
  return DEFAULT_MARKER_CATEGORIES.map((c) => ({ ...c, keywords: [...c.keywords] }));
}

const MARKER_CATEGORIES_STORAGE_KEY = 'cutflow.markerCategories';

export function loadMarkerCategories(): MarkerCategory[] {
  try {
    const raw = localStorage.getItem(MARKER_CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return defaultMarkerCategories();
}

export function saveMarkerCategories(categories: MarkerCategory[]) {
  try {
    localStorage.setItem(MARKER_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  } catch {}
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Catégorie d'un commentaire : première catégorie dont un mot-clé apparaît en début de mot
 * (« vo » trouve « VO » mais pas « avoir »). Sans correspondance : catégorie sans mots-clés, sinon la dernière.
 */
export function inferTagAndColor(
  text: string,
  categories: MarkerCategory[] = DEFAULT_MARKER_CATEGORIES
): { tag: string; color: PremiereColor; track: ReviewMarker['track'] } {
  const lower = text.toLowerCase();
  const toResult = (c: MarkerCategory) => ({ tag: c.name, color: c.color, track: c.track || 'V1' });
  for (const cat of categories) {
    for (const kw of cat.keywords) {
      const k = kw.trim().toLowerCase();
      if (k && new RegExp('(^|[^a-z0-9à-ÿ])' + escapeRegExp(k)).test(lower)) return toResult(cat);
    }
  }
  const fallback = categories.find((c) => c.keywords.length === 0) || categories[categories.length - 1];
  return fallback ? toResult(fallback) : { tag: 'Général', color: 'Green', track: 'V1' };
}

/**
 * Smart Regex Parser for unstructured client text (emails, Slack, WhatsApp)
 */
export function parseRawReviewText(
  rawText: string,
  fps: FrameRate = 25,
  categories: MarkerCategory[] = DEFAULT_MARKER_CATEGORIES
): ReviewMarker[] {
  const lines = rawText.split('\n');
  const results: ReviewMarker[] = [];

  // Regex matches timecode in various formats:
  // e.g. "01:24", "00:01:24:12", "1m24s", "1'24"", "01:24 - 01:30"
  const tcRegex = /(?:(\d{1,2}:\d{2}(?::\d{2}(?::\d{2})?)?)|(?:(\d+)\s*(?:m|'|min)\s*(\d+)?\s*(?:s|"|sec)?))(?:\s*[-–àa]\s*(?:(\d{1,2}:\d{2}(?::\d{2}(?::\d{2})?)?)|(?:(\d+)\s*(?:m|'|min)\s*(\d+)?\s*(?:s|"|sec)?)))?/i;

  let currentAuthor = 'Client';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // « ↳ Monteur : c'est fait » ou « > … » sous un retour : réponse à ce retour
    if (/^(↳|>)/.test(line) && results.length > 0) {
      const parent = results[results.length - 1];
      parent.replies = [...(parent.replies || []), parseReplyText(line)];
      continue;
    }

    // Check if line is author header, e.g. "Jean Dupont:" or "[Marie Curie]"
    const authorMatch = line.match(/^\[?([A-ZÀ-ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-ÿ][a-zà-ÿ]+)?)\]?\s*:/);
    if (authorMatch && !tcRegex.test(line)) {
      currentAuthor = authorMatch[1];
      continue;
    }

    const match = line.match(tcRegex);
    if (match) {
      const startTC = match[1] || `${match[2] || 0}m${match[3] || 0}s`;
      const endTC = match[4] || (match[5] ? `${match[5] || 0}m${match[6] || 0}s` : undefined);

      const startSeconds = timecodeToSeconds(startTC, fps);
      let durationSeconds = 0;
      if (endTC) {
        const endSeconds = timecodeToSeconds(endTC, fps);
        if (endSeconds > startSeconds) {
          durationSeconds = endSeconds - startSeconds;
        }
      }

      // Extract remaining text as comment
      let comment = line.replace(match[0], '').trim();
      // Remove leading colons, hyphens, brackets
      comment = comment.replace(/^[:\-–—\s\]>]+/, '').trim();
      if (!comment && i + 1 < lines.length && !tcRegex.test(lines[i + 1])) {
        // Comment might be on the next line
        comment = lines[i + 1].trim();
      }

      const { tag, color, track } = inferTagAndColor(comment || line, categories);

      results.push({
        id: `marker-${Date.now()}-${results.length}-${Math.random().toString(36).substr(2, 4)}`,
        timecode: secondsToTimecode(startSeconds, fps, true),
        seconds: startSeconds,
        durationSeconds,
        author: currentAuthor,
        comment: comment || 'Correction demandée',
        tag,
        color,
        track,
        isResolved: false,
        source: 'text',
      });
    }
  }

  // Sort by timecode
  return results.sort((a, b) => a.seconds - b.seconds);
}

/**
 * Export CSV de retours (Vimeo Review, Frame.io, tableur…) -> marqueurs.
 * Tolère : lignes entières entre guillemets, séparateur , ; ou tabulation, timecodes avec millisecondes
 * après une virgule (00:01:14,000), colonnes en français ou en anglais, commentaires contenant des virgules.
 */
export function parseVimeoCSV(
  csvContent: string,
  fps: FrameRate = 25,
  categories: MarkerCategory[] = DEFAULT_MARKER_CATEGORIES
): ReviewMarker[] {
  // lignes du CSV : un retour \u00E0 la ligne entre guillemets (commentaire sur plusieurs lignes) ne coupe pas la ligne
  const lines: string[] = [];
  {
    const text = csvContent.replace(/^\uFEFF/, '');
    let cur = '';
    let quotes = 0;
    for (let k = 0; k < text.length; k++) {
      const ch = text[k];
      if (ch === '"') quotes++;
      if ((ch === '\n' || ch === '\r') && quotes % 2 === 0) {
        if (ch === '\r' && text[k + 1] === '\n') k++;
        if (cur.trim()) lines.push(cur);
        cur = '';
        continue;
      }
      cur += ch === '\r' || ch === '\n' ? ' ' : ch;
    }
    if (cur.trim()) lines.push(cur);
  }
  if (lines.length === 0) return [];

  // séparateur le plus présent dans l'en-tête (hors guillemets d'enveloppe)
  const head = lines[0].replace(/^"|"$/g, '');
  const delim = [',', ';', '\t'].sort((a, b) => head.split(b).length - head.split(a).length)[0];
  const isTc = (s: string) => /^\d{1,2}(:\d{2}){1,3}([.,]\d+)?$/.test(s.trim());
  // Vimeo : entités HTML (« d&#039;avance »), texte encadré de guillemets littéraux (« "avec lui, …" »)
  const cleanCell = (c: string) => {
    let t = c
      .replace(/&#0*39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim();
    if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"' && !t.slice(1, -1).includes('"')) t = t.slice(1, -1).trim();
    return t;
  };
  // cellule de réponse vide : Vimeo écrit « "--" » quand un commentaire n'a pas de réponse
  const isEmptyReply = (t: string) => /^[\s"'\-–—_.]*$/.test(t) || /^(n\/?a|none|aucune?)$/i.test(t.trim());

  const splitRow = (line: string): string[] => {
    const cells = parseCSVRow(line, delim);
    // ligne entière encadrée de guillemets (Vimeo) : une seule cellule qui contient les vraies colonnes
    let text = cells.length === 1 && cells[0].includes(delim) ? cells[0] : line;
    // « 00:01:14,000 » hors guillemets : la virgule des millisecondes (3 chiffres) n'est pas un séparateur
    if (delim === ',') text = text.replace(/(^|,)(\d{1,2}:\d{2}(?::\d{2})?),(\d{3})(?=,|$)/g, '$1$2.$3');
    return parseCSVRow(text, delim).map(cleanCell);
  };

  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  // une première ligne qui contient déjà un timecode est une donnée, pas un en-tête
  const firstIsData = splitRow(lines[0]).some(isTc);
  const headers = firstIsData ? [] : splitRow(lines[0]).map(norm);
  const find = (re: RegExp, exclude?: RegExp) => headers.findIndex((h) => re.test(h) && !(exclude && exclude.test(h)));
  const END_RE = /(fin|end|out\b|sortie)/;
  let tcIdx = find(/(debut|start|\bin\b|entree)/);
  if (tcIdx < 0) tcIdx = find(/(timecode|\btc\b|time|temps|position)/, END_RE);
  const endIdx = find(END_RE);
  const commentIdx = find(/(comment|note|texte|text|message|remarque|retour|feedback)/);
  const userIdx = find(/(auteur|author|user|utilisateur|name|nom|reviewer|commenter)/);
  // Vimeo : « Timecode (Raw) » en secondes (plus précis) et « Resolved »
  const rawSecIdx = find(/(raw|secondes?|seconds?)/);
  const resolvedIdx = find(/(resolu|resolved|statut|status|done|termine)/);
  // réponses : colonne qui désigne le commentaire parent (« Parent », « In reply to »…), colonne qui contient
  // directement le texte des réponses (« Replies », « Réponses »), identifiant de chaque commentaire (« # », « ID »)
  const parentIdx = find(/(parent|reply to|in reply|en reponse|reponse a)/);
  const repliesIdx = find(/^(replies|reply|reponses?|answers?|reply (text|comment|note)|texte de la reponse)$/);
  // auteur de la réponse quand elle est dans sa propre colonne (« Reply User », « Auteur de la réponse »)
  const replyAuthorIdx = find(/(reply|reponse).*(user|name|nom|auteur|author)|(user|name|nom|auteur|author).*(reply|reponse)/);
  const idIdx = find(/^(#|id|n°|no|numero|number|comment id|note id)$/);
  const versionIdx = find(/^((video|file|fichier) )?(version|vers)$/);
  const hasHeader = !firstIsData && (tcIdx >= 0 || commentIdx >= 0);

  const results: ReviewMarker[] = [];
  const byId = new Map<string, ReviewMarker>();
  const stamp = Date.now();
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    let row = splitRow(lines[i]);
    if (row.length === 0) continue;
    // virgules du commentaire non protégées : les cellules en trop sont regroupées dans le commentaire,
    // quelle que soit sa place (les colonnes suivantes, « Résolu » par exemple, restent alignées)
    if (hasHeader && commentIdx >= 0 && row.length > headers.length) {
      const extra = row.length - headers.length;
      row = [...row.slice(0, commentIdx), row.slice(commentIdx, commentIdx + extra + 1).join(`${delim} `), ...row.slice(commentIdx + extra + 1)];
    }
    // sans en-tête reconnu : 1er timecode = début, 2e = fin, texte le plus long = commentaire
    const tcCells = row.map((c, j) => (isTc(c) ? j : -1)).filter((j) => j >= 0);
    const startCol = tcIdx >= 0 ? tcIdx : tcCells[0] ?? -1;
    const endCol = endIdx >= 0 ? endIdx : tcIdx < 0 ? tcCells[1] ?? -1 : -1;
    let comment = '';
    if (commentIdx >= 0) {
      comment = row[commentIdx] ?? '';
    } else {
      comment = row.filter((c, j) => j !== startCol && j !== endCol && !isTc(c)).sort((a, b) => b.length - a.length)[0] ?? '';
    }
    const author = (userIdx >= 0 ? row[userIdx] : '') ?? '';
    const rawTC = (startCol >= 0 ? row[startCol] : '') ?? '';

    // réponse : parent désigné, ligne sans timecode sous un commentaire, ou texte commençant par « ↳ »
    const parentRef = parentIdx >= 0 ? String(row[parentIdx] ?? '').trim() : '';
    // position : timecode écrit, ou seulement les secondes (« Timecode (Raw) », « Secondes »)
    const rawSecCell = rawSecIdx >= 0 ? String(row[rawSecIdx] ?? '').trim().replace(',', '.') : '';
    const hasTime = isTc(rawTC) || /^\d+(\.\d+)?$/.test(rawSecCell);
    // (sans colonne « parent », une ligne sans timecode est prise pour une réponse au commentaire précédent)
    const isReply =
      (parentRef && !/^(no|non|false|0|-)$/i.test(parentRef)) || (parentIdx < 0 && !hasTime && comment.trim() !== '') || /^\s*↳/.test(comment);
    if (isReply) {
      // parent désigné par son numéro, ou par son texte (« Parent comment »), sinon le commentaire précédent
      const parent =
        byId.get(parentRef) ||
        (parentRef ? results.find((o) => reviewMarkerText(o.comment) === reviewMarkerText(parentRef)) : undefined) ||
        results[results.length - 1];
      if (parent && comment.trim()) {
        const reply = parseReplyText(comment, author.trim());
        if (author.trim()) reply.author = author.trim();
        parent.replies = [...(parent.replies || []), reply];
      }
      continue;
    }
    if (!hasTime) continue;

    const rawSec = rawSecCell ? parseFloat(rawSecCell) : NaN;
    const seconds = isFinite(rawSec) && rawSec >= 0 ? rawSec : timecodeToSeconds(rawTC.replace(',', '.'), fps);
    const rawEnd = endCol >= 0 ? row[endCol] ?? '' : '';
    const endSec = isTc(rawEnd) ? timecodeToSeconds(rawEnd.replace(',', '.'), fps) : 0;
    const text = comment.trim() || 'Retour Vimeo';
    const { tag, color, track } = inferTagAndColor(text, categories);
    results.push({
      id: `vimeo-${stamp}-${i}`,
      timecode: secondsToTimecode(seconds, fps, true),
      seconds,
      durationSeconds: endSec > seconds ? endSec - seconds : 0,
      author: author.trim() || 'Client Vimeo',
      comment: text,
      tag,
      color,
      track,
      isResolved: resolvedIdx >= 0 && /^(yes|oui|true|1|x|resolved|resolu|résolu|done|termin)/i.test(String(row[resolvedIdx] ?? '').trim()),
      source: 'vimeo',
      ...(versionIdx >= 0 && detectVersion(String(row[versionIdx] ?? '')) ? { version: detectVersion(String(row[versionIdx]))! } : {}),
    });
    let added = results[results.length - 1];
    // Vimeo répète le commentaire sur la ligne de chaque réponse : même position + même texte = le même retour,
    // la ligne n'apporte que sa réponse (sinon le retour serait posé autant de fois qu'il a de réponses)
    const twin = results.slice(0, -1).find(
      (o) => Math.abs(o.seconds - added.seconds) < 0.05 && reviewMarkerText(o.comment) === reviewMarkerText(added.comment)
    );
    if (twin) {
      results.pop();
      added = twin;
    }
    // réponses écrites dans la même ligne (« Monteur : fait | Client : merci »)
    const inlineReplies = repliesIdx >= 0 ? String(row[repliesIdx] ?? '').trim() : '';
    if (inlineReplies && !isEmptyReply(inlineReplies)) {
      // Vimeo : la ligne qui répète le commentaire porte, dans « Name », l'auteur de la réponse
      const replyAuthor =
        (replyAuthorIdx >= 0 ? String(row[replyAuthorIdx] ?? '').trim() : '') || (twin && author.trim() ? author.trim() : '');
      const parsedReplies = inlineReplies
        .split(/\s*\|\s*|\s*↳\s*/)
        .filter((t) => t && !isEmptyReply(t))
        .map((t) => {
          const r = parseReplyText(t);
          return replyAuthor && !r.author ? { ...r, author: replyAuthor } : r;
        });
      const existing = added.replies || [];
      added.replies = [...existing, ...parsedReplies.filter((r) => !existing.some((e) => e.text === r.text && e.author === r.author))];
    }
    if (idIdx >= 0 && String(row[idIdx] ?? '').trim()) byId.set(String(row[idIdx]).trim(), added);
  }

  return results.sort((a, b) => a.seconds - b.seconds);
}

function parseCSVRow(rowText: string, delim = ','): string[] {
  const entries: string[] = [];
  let insideQuote = false;
  let current = '';

  for (let i = 0; i < rowText.length; i++) {
    const char = rowText[i];
    if (char === '"') {
      // "" à l'intérieur d'un champ entre guillemets = guillemet littéral
      if (insideQuote && rowText[i + 1] === '"') {
        current += '"';
        i++;
      } else insideQuote = !insideQuote;
    } else if (char === delim && !insideQuote) {
      entries.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  entries.push(current.trim());
  return entries;
}


// ==================== utils/markerExporter.ts ====================


/**
 * Standard CSV export for timeline markers
 */
export function generateMarkersCSV(markers: ReviewMarker[], includeReplies = true): string {
  const withVersion = markers.some((m) => m.version);
  const headers = ['Timecode', 'Secondes', ...(withVersion ? ['Version'] : []), 'Auteur', 'Piste', 'Catégorie', 'Statut', 'Commentaire', ...(includeReplies ? ['Réponses'] : [])];
  const rows = markers.map((m) => {
    const status = m.isResolved ? 'Résolu' : 'En cours';
    return [
      `"${m.timecode}"`,
      m.seconds.toFixed(2),
      ...(withVersion ? [`"${m.version || ''}"`] : []),
      `"${(m.author || 'Client').replace(/"/g, '""')}"`,
      `"${m.track || 'V1'}"`,
      `"${m.tag}"`,
      `"${status}"`,
      `"${m.comment.replace(/"/g, '""')}"`,
      ...(includeReplies ? [`"${(m.replies || []).map((r) => (r.author ? `${r.author} : ` : '') + r.text).join(' | ').replace(/"/g, '""')}"`] : []),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Clean text export for timeline markers
 */
export function generateMarkersText(markers: ReviewMarker[], includeReplies = true): string {
  return markers
    .map((m) => {
      const statusIcon = m.isResolved ? '[✓]' : '[ ]';
      const author = m.author ? ` (${m.author})` : '';
      const replies = includeReplies ? (m.replies || []).map((r) => `\n      ↳ ${r.author ? `${r.author} : ` : ''}${r.text}`).join('') : '';
      return `${statusIcon} ${m.timecode}${m.version ? ` [${m.version}]` : ''} [${m.tag}]${author} : ${m.comment}${replies}`;
    })
    .join('\n');
}

/**
 * Formats a clean client validation / check recap text
 */
export function generateClientRecapText(markers: ReviewMarker[], includeReplies = true): string {
  const replies = (m: ReviewMarker) =>
    includeReplies ? (m.replies || []).map((r) => `      ↳ ${r.author ? `${r.author} : ` : ''}${r.text}\n`).join('') : '';
  const resolved = markers.filter((m) => m.isResolved);
  const pending = markers.filter((m) => !m.isResolved);

  let text = `Bonjour,\n\nVoici le point sur la révision et les modifications :\n\n`;

  if (resolved.length > 0) {
    text += `✅ MODIFICATIONS TERMINÉES (${resolved.length}) :\n`;
    resolved.forEach((m) => {
      text += `  • ${m.timecode} : ${m.comment} (Fait)\n` + replies(m);
    });
    text += `\n`;
  }

  if (pending.length > 0) {
    text += `⏳ EN COURS / À VALIDER (${pending.length}) :\n`;
    pending.forEach((m) => {
      text += `  • ${m.timecode} : ${m.comment}\n` + replies(m);
    });
  } else {
    text += `🎉 Tous les retours ont été traités et intégrés avec succès !\n`;
  }

  return text;
}


// ==================== utils/premiereBridge.ts ====================

/**
 * Passerelle directe, robuste et tolérante aux pannes avec Adobe Premiere Pro
 * Utilise CSInterface et ExtendScript sans bloquer l'Event Loop CEP.
 */

declare global {
  interface Window {
    __adobe_cep__?: any;
    CSInterface?: any;
    csInterfaceInstance?: any;
  }
}

export function getCSInterface(): any | null {
  if (typeof window === 'undefined') return null;
  if (window.csInterfaceInstance) return window.csInterfaceInstance;

  if (window.CSInterface) {
    try {
      window.csInterfaceInstance = new window.CSInterface();
      return window.csInterfaceInstance;
    } catch (e) {
      console.warn('CSInterface init error:', e);
    }
  }

  if (window.__adobe_cep__) {
    return {
      evalScript: (script: string, callback?: (res: string) => void) => {
        window.__adobe_cep__.evalScript(script, (result: string) => {
          if (callback) callback(result);
        });
      },
    };
  }

  return null;
}

export function isRunningInPremiere(): boolean {
  // CSInterface.js est toujours chargé : seul le pont natif __adobe_cep__ prouve qu'on est dans Premiere
  return typeof window !== 'undefined' && !!window.__adobe_cep__;
}

// ExtendScript (ES3) n'a ni JSON ni String.prototype.trim : on les fournit avant chaque script
const EXTENDSCRIPT_POLYFILLS = `
if (!String.prototype.trim) { String.prototype.trim = function () { return this.replace(/^\\s+|\\s+$/g, ''); }; }
if (typeof JSON !== 'object') { JSON = {}; }
if (typeof JSON.stringify !== 'function') {
  JSON.stringify = function (v) {
    var t = typeof v;
    if (v === null || v === undefined || t === 'function') return 'null';
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return String(v);
    if (t === 'string') {
      return '"' + v.replace(/[\\\\"\\u0000-\\u001f\\u2028\\u2029]/g, function (c) {
        var m = { '"': '\\\\"', '\\\\': '\\\\\\\\', '\\n': '\\\\n', '\\r': '\\\\r', '\\t': '\\\\t', '\\b': '\\\\b', '\\f': '\\\\f' };
        return m[c] || ('\\\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
      }) + '"';
    }
    var out = [], i, k;
    if (v instanceof Array) {
      for (i = 0; i < v.length; i++) out.push(JSON.stringify(v[i]));
      return '[' + out.join(',') + ']';
    }
    for (k in v) {
      if (v.hasOwnProperty(k) && typeof v[k] !== 'function' && v[k] !== undefined) out.push(JSON.stringify(String(k)) + ':' + JSON.stringify(v[k]));
    }
    return '{' + out.join(',') + '}';
  };
}
`;

// Enveloppe le script dans un eval protégé : même une erreur de syntaxe remonte avec son message et sa ligne
function wrapExtendScript(script: string): string {
  const quoted = JSON.stringify(EXTENDSCRIPT_POLYFILLS + script)
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');
  return `(function () { try { return eval(${quoted}); } catch (e) { return 'CF_ERR:' + e.name + ': ' + e.message + ' (ligne ' + e.line + ')'; } })()`;
}

/**
 * Exécute un script ExtendScript encapsulé dans un try-catch global
 * avec timeout pour ne jamais bloquer l'UI
 */
// Les appels ExtendScript sont exécutés un par un : avec plusieurs scans auto en parallèle,
// le délai d'attente ne doit courir qu'une fois le script réellement envoyé à Premiere
let extendScriptQueue: Promise<unknown> = Promise.resolve();
export function evalExtendScript<T = any>(script: string, timeoutMs = 6000): Promise<T> {
  const run = () => evalExtendScriptNow<T>(script, timeoutMs);
  const result = extendScriptQueue.then(run, run);
  extendScriptQueue = result.catch(() => {});
  return result;
}

function evalExtendScriptNow<T = any>(script: string, timeoutMs: number): Promise<T> {
  script = wrapExtendScript(script);
  return new Promise((resolve) => {
    const cs = getCSInterface();
    if (!cs) {
      return resolve({
        success: false,
        error: "L'application est hors panneau Premiere Pro.",
      } as any);
    }

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          error: "Délai d'attente ExtendScript dépassé (Timeout)",
        } as any);
      }
    }, timeoutMs);

    try {
      cs.evalScript(script, (rawResult: string) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);

        if (typeof rawResult === 'string' && rawResult.indexOf('CF_ERR:') === 0) {
          console.error('[CutFlow] ExtendScript:', rawResult);
          return resolve({
            success: false,
            error: 'ExtendScript : ' + rawResult.substring(7),
          } as any);
        }
        if (!rawResult || rawResult === 'EvalScript error.' || rawResult === 'undefined') {
          console.error('[CutFlow] ExtendScript résultat brut :', rawResult);
          return resolve({
            success: false,
            error: "Erreur d'exécution ExtendScript dans Premiere Pro (réponse : " + String(rawResult) + ')',
          } as any);
        }

        try {
          const parsed = JSON.parse(rawResult);
          resolve(parsed);
        } catch {
          resolve({ success: true, data: rawResult } as any);
        }
      });
    } catch (err: any) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        error: err?.message || 'Erreur inconnue CSInterface',
      } as any);
    }
  });
}

export interface PremiereProjectScanResult {
  success: boolean;
  hasProject: boolean;
  projectName: string;
  totalItems: number;
  compressedAudioCount: number;
  unclassifiedMediaCount: number;
  compressedAudios: Array<{
    name: string;
    mediaPath: string;
    nodeId: string;
  }>;
  rootItems: Array<{
    name: string;
    mediaPath: string;
    type: string;
  }>;
  error?: string;
}

/**
 * Scanne en direct l'état des éléments dans le projet
 */
export async function scanPremiereProjectMemory(): Promise<PremiereProjectScanResult> {
  const script = `
    (function() {
      try {
        if (!app.project) {
          return JSON.stringify({ success: true, hasProject: false, projectName: "", totalItems: 0, compressedAudioCount: 0, unclassifiedMediaCount: 0, compressedAudios: [], rootItems: [] });
        }

        var result = {
          success: true,
          hasProject: true,
          projectName: app.project.name || "Projet sans titre",
          totalItems: 0,
          compressedAudioCount: 0,
          unclassifiedMediaCount: 0,
          compressedAudios: [],
          rootItems: []
        };

        function scanBin(bin, isRoot) {
          if (!bin || !bin.children) return;
          for (var i = 0; i < bin.children.numItems; i++) {
            var item = bin.children[i];
            result.totalItems++;
            
            if (item.type === ProjectItemType.BIN) {
              scanBin(item, false);
            } else {
              var p = "";
              try { p = item.getMediaPath(); } catch(e){}
              var name = item.name || "";
              var lower = (p || name).toLowerCase();

              var isSeq = false;
              try { isSeq = item.isSequence ? item.isSequence() : false; } catch(e){}

              if (isRoot) {
                result.unclassifiedMediaCount++;
                var itemType = isSeq ? 'sequence' : (lower.indexOf('.mov') !== -1 || lower.indexOf('.mp4') !== -1 ? 'video' : 'media');
                result.rootItems.push({
                  name: name,
                  mediaPath: p || "",
                  type: itemType
                });
              }

              if (!isSeq && (lower.indexOf('.mp3') !== -1 || lower.indexOf('.m4a') !== -1 || lower.indexOf('.aac') !== -1)) {
                result.compressedAudioCount++;
                result.compressedAudios.push({
                  name: name,
                  mediaPath: p || "",
                  nodeId: item.nodeId || ""
                });
              }
            }
          }
        }

        scanBin(app.project.rootItem, true);
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;

  return evalExtendScript<PremiereProjectScanResult>(script);
}

/**
 * Auto-Binning intelligent avec reconnaissance des dossiers existants
 * (rushes/rush, musique/sfx, seq/sequences, assets/cache, etc.)
 */
export async function executeDirectAutoBinningInPremiere(rules: BinRule[]): Promise<any> {
  const rulesJson = JSON.stringify(
    rules.map((r) => ({
      role: roleOfRule(r),
      name: r.binName,
      extensions: r.extensions,
      keywords: (r.keywords || []).map((k) => k.toLowerCase()),
      subs: (r.subBins || [])
        .filter((s) => s.name && s.keywords.length > 0)
        .map((s) => ({ name: s.name, keywords: s.keywords.map((k) => k.toLowerCase()) })),
    }))
  );

  const script = `
    (function() {
      try {
        if (!app.project) {
          return JSON.stringify({ success: false, message: "Aucun projet ouvert dans Premiere Pro" });
        }
        var root = app.project.rootItem;
        if (!root || !root.children) {
          return JSON.stringify({ success: false, message: "Racine du projet inaccessible" });
        }

        var TICKS_PER_SECOND = 254016000000;
        // Règles du panneau : { role, name, extensions }. role vide = chutier personnalisé
        var RULES = ${rulesJson};

        // Mots-clés pour réutiliser un chutier existant d'un autre nom.
        // "exclude" évite qu'un ancien chutier mixte (ex. 03_MUSIQUE_SFX) soit pris pour MUSIQUE ou SFX.
        var ROLE_KEYWORDS = {
          seq:     { keys: ["seq"],                                                   exclude: [] },
          rushes:  { keys: ["rush", "camera", "cam"],                                 exclude: [] },
          music:   { keys: ["musique", "music"],                                      exclude: ["sfx", "bruitage"] },
          sfx:     { keys: ["sfx", "bruitage", "sound design"],                       exclude: ["musique", "music"] },
          assets:  { keys: ["asset", "cache", "graph", "titre", "habillage", "logo"], exclude: [] },
          exports: { keys: ["export", "validation", "master", "rendu"],               exclude: [] }
        };

        var roleRule = {};
        var customRules = [];
        for (var r = 0; r < RULES.length; r++) {
          var rule = RULES[r];
          var exts = {};
          for (var e = 0; e < rule.extensions.length; e++) exts[String(rule.extensions[e]).toLowerCase()] = true;
          rule.extSet = exts;
          if (!rule.keywords) rule.keywords = [];
          if (rule.role && ROLE_KEYWORDS[rule.role]) { if (!roleRule[rule.role]) roleRule[rule.role] = rule; }
          // un chutier personnalisé avec mots-clés ne prend que les fichiers dont le nom correspond
          else if (rule.keywords.length === 0) customRules.push(rule);
        }
        function roleHasExt(role, ext) { return !!(roleRule[role] && roleRule[role].extSet[ext]); }
        // extension acceptée ; sans extension, une règle à mots-clés accepte tout fichier
        function ruleAccepts(rule, ext) { return !!rule.extSet[ext] || (rule.extensions.length === 0 && rule.keywords.length > 0); }
        function matchesAny(keywords, nameLow) {
          for (var k = 0; k < keywords.length; k++) if (keywords[k] && nameLow.indexOf(keywords[k]) !== -1) return true;
          return false;
        }

        function isLegacyBinName(lower) {
          // Chutier "son seul" supprimé et ancien chutier mixte musique+sfx : vidés puis supprimés
          if (lower.indexOf("son seul") !== -1 || lower.indexOf("son_seul") !== -1 || lower.indexOf("tournage") !== -1) return true;
          var hasMusic = lower.indexOf("musique") !== -1 || lower.indexOf("music") !== -1;
          var hasSfx = lower.indexOf("sfx") !== -1 || lower.indexOf("bruitage") !== -1;
          return hasMusic && hasSfx;
        }

        var rootBins = [];
        var legacyBins = [];
        for (var b = 0; b < root.children.numItems; b++) {
          var c = root.children[b];
          if (c.type !== ProjectItemType.BIN) continue;
          var isRuleName = false;
          for (var rr = 0; rr < RULES.length; rr++) if (RULES[rr].name.toLowerCase() === c.name.toLowerCase()) isRuleName = true;
          if (!isRuleName && isLegacyBinName(c.name.toLowerCase())) legacyBins.push(c); else rootBins.push(c);
        }

        var binCache = {};
        // target = { key, name, keys, exclude, role, rule, sub }
        function getBin(target, noCreate) {
          if (binCache[target.key]) return binCache[target.key];
          var i, k, lower, found = null;
          // 1. nom exact de la règle, 2. mot-clé, 3. création
          for (i = 0; i < rootBins.length && !found; i++) {
            if (rootBins[i].name.toLowerCase() === target.name.toLowerCase()) found = rootBins[i];
          }
          for (i = 0; i < rootBins.length && !found; i++) {
            lower = rootBins[i].name.toLowerCase();
            var excluded = false;
            for (k = 0; k < target.exclude.length; k++) if (lower.indexOf(target.exclude[k]) !== -1) excluded = true;
            if (excluded) continue;
            for (k = 0; k < target.keys.length; k++) {
              if (lower.indexOf(target.keys[k]) !== -1) { found = rootBins[i]; break; }
            }
          }
          if (!found) {
            if (noCreate) return null;
            found = root.createBin(target.name);
            rootBins.push(found);
          }
          binCache[target.key] = found;
          return found;
        }
        // Chutier final : le chutier de la règle, ou son sous-chutier (créé dedans au besoin)
        function resolveBin(target) {
          var parent = getBin(target);
          if (!target.sub || !parent) return parent;
          var key = target.key + "/" + target.sub.name;
          if (binCache[key]) return binCache[key];
          var found = null;
          for (var i = 0; i < parent.children.numItems && !found; i++) {
            var c = parent.children[i];
            if (c.type === ProjectItemType.BIN && c.name.toLowerCase() === target.sub.name.toLowerCase()) found = c;
          }
          if (!found) found = parent.createBin(target.sub.name);
          binCache[key] = found;
          return found;
        }
        function roleTarget(role) {
          return { key: "role:" + role, name: roleRule[role].name, keys: ROLE_KEYWORDS[role].keys, exclude: ROLE_KEYWORDS[role].exclude, role: role, rule: roleRule[role] };
        }
        function customTarget(rule) {
          return { key: "custom:" + rule.name, name: rule.name, keys: [], exclude: [], role: "custom", rule: rule };
        }
        function ruleTarget(rule) {
          return rule.role && roleRule[rule.role] === rule ? roleTarget(rule.role) : customTarget(rule);
        }
        // Premier sous-chutier de la règle dont un mot-clé apparaît dans le nom
        function subFor(rule, nameLow) {
          if (!rule || !rule.subs) return null;
          for (var s = 0; s < rule.subs.length; s++) {
            if (matchesAny(rule.subs[s].keywords, nameLow)) return rule.subs[s];
          }
          return null;
        }

        function mediaDurationSeconds(item) {
          try {
            var md = item.getProjectColumnsMetadata();
            var m = md.match(/"ColumnID"\\s*:\\s*"Column\\.Intrinsic\\.MediaDuration"[^}]*?"ColumnValue"\\s*:\\s*"(\\d+)"/);
            if (m) return parseFloat(m[1]) / TICKS_PER_SECOND;
          } catch (e1) {}
          try { return item.getOutPoint(4).seconds - item.getInPoint(4).seconds; } catch (e2) {}
          return -1;
        }

        // Durée à partir de laquelle un fichier audio est une musique (Paramètres > Chutier)
        var MUSIC_MIN_SECONDS = ${loadMusicSfxThreshold()};

        // Musique ou SFX : mots-clés d'abord, puis durée ; forme "Artiste - Morceau" si la durée est inconnue
        function classifyAudio(item, baseName) {
          var n = baseName.toLowerCase();
          if (/(sfx|bruitage|whoosh|swoosh|impact|foley|transition|ding|glitch|riser|braam)/.test(n)) return "sfx";
          if (/(musique|music|soundtrack|instrumental|\\bost\\b|\\bbgm\\b)/.test(n)) return "music";
          var dur = mediaDurationSeconds(item);
          if (dur >= 0) return dur >= MUSIC_MIN_SECONDS ? "music" : "sfx";
          var artistTitle = /^[^\\-–—]+\\s[\\-–—]\\s[^\\-–—]+$/.test(baseName);
          return artistTitle ? "music" : "sfx";
        }

        function extOf(s) {
          var dot = s.lastIndexOf(".");
          var sep = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\\\"));
          return dot > sep ? s.substring(dot + 1).toLowerCase() : "";
        }

        function targetOf(item) {
          var p = "";
          try { p = item.getMediaPath(); } catch (e3) {}
          var nameLow = ((p ? p.split(/[\\\\\\/]/).pop() : "") + " " + item.name).toLowerCase();
          var target = baseTargetOf(item, p, nameLow);
          if (target && !target.sub) {
            target.sub = subFor(target.rule, nameLow);
            if (target.sub) target.keyword = true;
          }
          return target;
        }

        function baseTargetOf(item, p, nameLow) {
          var isSeq = false;
          try { isSeq = item.isSequence ? item.isSequence() : false; } catch (e) {}
          if (isSeq) return roleRule.seq ? roleTarget("seq") : null;

          var ext = extOf(p) || extOf(item.name);
          // élément synthétique : cache couleur, mire, calque d'effets...
          if (!p && !ext) return roleRule.assets ? roleTarget("assets") : null;

          // les mots-clés l'emportent : d'abord ceux des chutiers (ex. "illu" -> ILLU plutôt que RUSHES),
          // puis ceux des sous-chutiers (ex. "riser" -> SFX/RISERS même si le fichier est long)
          var kt;
          for (var kr = 0; kr < RULES.length; kr++) {
            if (!ruleAccepts(RULES[kr], ext) || !matchesAny(RULES[kr].keywords, nameLow)) continue;
            kt = ruleTarget(RULES[kr]); kt.keyword = true; return kt;
          }
          for (var sr = 0; sr < RULES.length; sr++) {
            if (!ruleAccepts(RULES[sr], ext)) continue;
            var sub = subFor(RULES[sr], nameLow);
            if (sub) { kt = ruleTarget(RULES[sr]); kt.sub = sub; kt.keyword = true; return kt; }
          }

          // les chutiers personnalisés passent avant les règles standard
          for (var i = 0; i < customRules.length; i++) {
            if (customRules[i].extSet[ext]) return customTarget(customRules[i]);
          }

          var isRush = roleHasExt("rushes", ext), isExport = roleHasExt("exports", ext);
          if (isRush || isExport) {
            var nm = item.name.toLowerCase();
            var looksExport = /(export|master|validation|rendu)|[_\\s\\-]v\\d+([_\\s.\\-]|$)/.test(nm);
            if (isExport && (looksExport || !isRush)) return roleTarget("exports");
            return roleTarget("rushes");
          }

          var isMusic = roleHasExt("music", ext), isSfx = roleHasExt("sfx", ext);
          if (isMusic || isSfx) {
            if (isMusic && !isSfx) return roleTarget("music");
            if (isSfx && !isMusic) return roleTarget("sfx");
            var fileName = (p ? p.split(/[\\\\\\/]/).pop() : item.name);
            var baseName = fileName.replace(/\\.[^.]+$/, "").replace(/_\\d+(\\.\\d+)?k\\d+b$/i, "").replace(/^\\s+|\\s+$/g, "");
            return roleTarget(classifyAudio(item, baseName));
          }

          if (roleHasExt("assets", ext)) return roleTarget("assets");
          return null;
        }

        var moved = 0;
        var counts = { seq: 0, rushes: 0, music: 0, sfx: 0, assets: 0, exports: 0, custom: 0 };

        // accept(target) facultatif : ne déplace que les éléments dont la cible est acceptée
        function sortChildrenOf(container, accept) {
          // Liste figée d'abord : créer/déplacer des éléments décale les index des enfants
          var items = [];
          for (var j = 0; j < container.children.numItems; j++) items.push(container.children[j]);
          for (var q = 0; q < items.length; q++) {
            var item = items[q];
            if (!item || item.type === ProjectItemType.BIN) continue;
            var target = targetOf(item);
            if (!target || (accept && !accept(target))) continue;
            var bin = resolveBin(target);
            if (bin && bin.nodeId !== container.nodeId) {
              try { item.moveBin(bin); moved++; counts[target.role]++; } catch (e) {}
            }
          }
        }

        // 1. médias à la racine
        sortChildrenOf(root);
        // 2. contenu des anciens chutiers (son seul, musique+sfx), puis suppression s'ils sont vides
        var removedBins = [];
        for (var L = 0; L < legacyBins.length; L++) {
          sortChildrenOf(legacyBins[L]);
          if (legacyBins[L].children.numItems === 0) {
            var legacyName = legacyBins[L].name;
            try { legacyBins[L].deleteBin(); removedBins.push(legacyName); } catch (e4) {}
          }
        }
        // 3. une séquence n'a rien à faire dans un autre chutier
        if (roleRule.seq) {
          for (var R = 0; R < rootBins.length; R++) {
            if (rootBins[R] !== binCache["role:seq"]) sortChildrenOf(rootBins[R], function (t) { return t.role === "seq"; });
          }
        }
        // 4. fichiers déjà rangés : déplacés si un mot-clé de chutier ou de sous-chutier leur correspond
        var sortedBins = {};
        for (var S = 0; S < RULES.length; S++) {
          var ruleBin = getBin(ruleTarget(RULES[S]), true);
          if (!ruleBin || sortedBins[ruleBin.nodeId]) continue;
          sortedBins[ruleBin.nodeId] = true;
          sortChildrenOf(ruleBin, function (t) { return !!t.keyword; });
        }

        return JSON.stringify({ success: true, movedCount: moved, counts: counts, removedBins: removedBins });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() + " (ligne " + err.line + ")" });
      }
    })();
  `;

  return evalExtendScript(script);
}

/** Résumé lisible d'un tri : "3 rangé(s) : 1 musique, 2 SFX — chutier supprimé : 02_SON_SEUL_TOURNAGE" */
export function describeBinningResult(res: any): string {
    const labels = { seq: 'séquence(s)', rushes: 'rush(es)', music: 'musique(s)', sfx: 'SFX', assets: 'asset(s)', exports: 'export(s)' };
    const detail = Object.keys(labels)
        .filter((k) => res.counts && res.counts[k] > 0)
        .map((k) => `${res.counts[k]} ${labels[k]}`)
        .join(', ');
    let msg = res.movedCount > 0
        ? `${res.movedCount} élément(s) rangé(s)${detail ? ' : ' + detail : ''}`
        : 'Tous les éléments du projet sont déjà classés';
    if (res.removedBins && res.removedBins.length > 0)
        msg += ` — chutier(s) supprimé(s) : ${res.removedBins.join(', ')}`;
    return msg + '.';
}
// ==================== utils/binRules.ts ====================
/** Arborescence par défaut. `role` relie une règle à la logique de tri (séquences, rushes/exports, musique/SFX...) */
export const DEFAULT_BIN_RULES: BinRule[] = [
    { id: 'bin-seq', role: 'seq', binName: '00_SEQ', color: '#06b6d4', description: 'Séquences de montage de la timeline', extensions: ['prproj'], criteria: {} },
    { id: 'bin-1', role: 'rushes', binName: '01_RUSHES', color: '#3b82f6', description: 'Plans caméra, interviews, plans de coupe', extensions: ['mov', 'mp4', 'm4v', 'mxf', 'braw', 'r3d', 'ari', 'avi', 'mkv', 'mts', 'm2ts', 'webm'], criteria: { hasVideo: true } },
    { id: 'bin-2', role: 'music', binName: '02_MUSIQUE', color: '#8b5cf6', description: 'Musiques : au-delà du seuil de durée, ou mot-clé music', extensions: ['wav', 'mp3', 'm4a', 'aac', 'aif', 'aiff', 'flac', 'ogg', 'wma'], criteria: { hasVideo: false } },
    { id: 'bin-3', role: 'sfx', binName: '03_SFX', color: '#10b981', description: 'Bruitages & sound design : sous le seuil de durée, ou mot-clé sfx', extensions: ['wav', 'mp3', 'm4a', 'aac', 'aif', 'aiff', 'flac', 'ogg', 'wma'], criteria: { hasVideo: false } },
    { id: 'bin-4', role: 'assets', binName: '04_ASSETS_CACHES', color: '#f59e0b', description: 'Graphismes, logos, caches couleur, mires & synthétiques', extensions: ['png', 'psd', 'ai', 'svg', 'jpg', 'jpeg', 'tif', 'tiff', 'gif', 'webp', 'bmp', 'eps', 'mogrt', 'aep'], criteria: { isVectorOrGraphic: true } },
    { id: 'bin-5', role: 'exports', binName: '05_EXPORTS_VALIDATION', color: '#ec4899', description: 'Vidéos nommées export / master / v1, v2...', extensions: ['mov', 'mp4'], criteria: {} },
];
// Règles créées avant l'ajout de `role` : rôle déduit de l'identifiant
const LEGACY_ROLE_BY_ID: Record<string, BinRole> = { 'bin-seq': 'seq', 'bin-1': 'rushes', 'bin-2': 'music', 'bin-3': 'sfx', 'bin-4': 'assets', 'bin-assets': 'assets', 'bin-5': 'exports' };
export function roleOfRule(rule: BinRule): BinRole | '' {
    return rule.role || LEGACY_ROLE_BY_ID[rule.id] || '';
}
export function defaultBinRules(): BinRule[] {
    return DEFAULT_BIN_RULES.map((r) => ({ ...r, extensions: [...r.extensions], criteria: { ...r.criteria } }));
}
/** Parse "mov, .MP4 ,wav" -> ['mov', 'mp4', 'wav'] */
export function parseExtensionsInput(text: string): string[] {
    const exts = text
        .split(/[,;\s]+/)
        .map((s) => s.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean);
    return exts.filter((e, i) => exts.indexOf(e) === i);
}
const BIN_RULES_STORAGE_KEY = 'cutflow.binRules';
export function loadBinRules(): BinRule[] {
    try {
        const raw = localStorage.getItem(BIN_RULES_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0)
                return parsed;
        }
    }
    catch {}
    return defaultBinRules();
}
export function saveBinRules(rules: BinRule[]) {
    try {
        localStorage.setItem(BIN_RULES_STORAGE_KEY, JSON.stringify(rules));
    }
    catch {}
}
/** Seuil musique / SFX (secondes) : un audio au moins aussi long va dans Musique, sinon dans SFX */
export const DEFAULT_MUSIC_SFX_THRESHOLD = 60;
const MUSIC_SFX_THRESHOLD_KEY = 'cutflow.musicSfxThreshold';
export function loadMusicSfxThreshold(): number {
    try {
        const v = parseFloat(localStorage.getItem(MUSIC_SFX_THRESHOLD_KEY) || '');
        if (isFinite(v) && v > 0) return v;
    }
    catch {}
    return DEFAULT_MUSIC_SFX_THRESHOLD;
}
export function saveMusicSfxThreshold(seconds: number) {
    try {
        localStorage.setItem(MUSIC_SFX_THRESHOLD_KEY, String(seconds));
    }
    catch {}
}
/** "whoosh, Swoosh ;riser" -> ['whoosh', 'swoosh', 'riser'] */
export function parseKeywordsInput(text: string): string[] {
    const keywords = text.split(/[,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
    return keywords.filter((k, i) => keywords.indexOf(k) === i);
}

// Presets de chutiers : arborescence complète (règles, mots-clés, sous-chutiers, seuil musique/SFX), partageable en équipe
export interface BinPreset {
    id: string;
    name: string;
    rules: BinRule[];
    musicThreshold: number;
    builtIn?: boolean;
}
export function defaultBinPreset(): BinPreset {
    return { id: 'bin-preset-default', name: 'Défaut', rules: defaultBinRules(), musicThreshold: DEFAULT_MUSIC_SFX_THRESHOLD, builtIn: true };
}
const BIN_PRESETS_KEY = 'cutflow.binPresets';
export function loadBinPresets(): BinPreset[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(BIN_PRESETS_KEY) || '[]');
        if (Array.isArray(parsed)) return parsed.filter((p) => p && p.name && Array.isArray(p.rules));
    }
    catch {}
    return [];
}
export function saveBinPresets(presets: BinPreset[]) {
    try {
        localStorage.setItem(BIN_PRESETS_KEY, JSON.stringify(presets));
    }
    catch {}
}
/** Forme partagée d'une arborescence : sans identifiants internes, pour comparer et exporter */
function portableBinRules(rules: BinRule[]) {
    return rules.map((r) => ({
        name: r.binName,
        role: roleOfRule(r) || undefined,
        color: r.color,
        extensions: r.extensions,
        keywords: r.keywords && r.keywords.length ? r.keywords : undefined,
        subs: r.subBins && r.subBins.length ? r.subBins.map((s) => ({ name: s.name, keywords: s.keywords })) : undefined,
    }));
}
export function sameBinSetup(a: BinRule[], b: BinRule[]): boolean {
    return JSON.stringify(portableBinRules(a)) === JSON.stringify(portableBinRules(b));
}
/** Code d'export (JSON lisible, à coller dans « Importer » chez un collègue) */
export function exportBinPresetCode(name: string, rules: BinRule[], musicThreshold: number): string {
    return JSON.stringify({ moriBins: 1, name, musicThreshold, rules: portableBinRules(rules) });
}
export function parseBinPresetCode(code: string): BinPreset {
    let data: any;
    try {
        data = JSON.parse(code.trim());
    }
    catch {
        throw new Error('code illisible : collez le texte obtenu avec « Exporter »');
    }
    if (!data || !Array.isArray(data.rules) || data.rules.length === 0) throw new Error('ce code ne contient pas de chutiers');
    const stamp = Date.now();
    const roles: BinRole[] = ['seq', 'rushes', 'music', 'sfx', 'assets', 'exports'];
    const rules: BinRule[] = data.rules.map((r: any, i: number) => {
        const name = String(r.name || '').trim().toUpperCase().slice(0, 60);
        if (!name) throw new Error(`chutier n°${i + 1} sans nom`);
        const role = roles.includes(r.role) ? (r.role as BinRole) : undefined;
        const def = role ? DEFAULT_BIN_RULES.find((d) => d.role === role) : undefined;
        const list = (v: any) => (Array.isArray(v) ? parseKeywordsInput(v.map(String).join(',')) : []);
        return {
            id: `bin-${stamp}-${i}`,
            role,
            binName: name,
            color: normalizeHex(String(r.color || '')) || def?.color || '#3b82f6',
            description: def?.description || 'Dossier personnalisé',
            extensions: parseExtensionsInput(list(r.extensions).join(',')),
            keywords: list(r.keywords),
            subBins: (Array.isArray(r.subs) ? r.subs : [])
                .map((s: any, j: number) => ({ id: `sub-${stamp}-${i}-${j}`, name: String(s?.name || '').trim().toUpperCase().slice(0, 60), keywords: list(s?.keywords) }))
                .filter((s: SubBin) => s.name && s.keywords.length > 0),
            criteria: {},
        };
    });
    const threshold = parseFloat(data.musicThreshold);
    return {
        id: `bin-preset-${stamp}`,
        name: String(data.name || 'Preset importé').slice(0, 40),
        rules,
        musicThreshold: isFinite(threshold) && threshold > 0 ? Math.round(threshold) : DEFAULT_MUSIC_SFX_THRESHOLD,
    };
}
/** Renomme un chutier racine du projet (utilisé quand on renomme une règle) */
export async function renamePremiereBin(
  oldName: string,
  newName: string
): Promise<{ success: boolean; renamed?: boolean; reason?: string; error?: string }> {
    const script = `
    (function() {
      try {
        if (!app.project) return JSON.stringify({ success: false, error: "Aucun projet ouvert" });
        var root = app.project.rootItem, source = null;
        var oldLower = ${JSON.stringify(oldName.toLowerCase())}, newLower = ${JSON.stringify(newName.toLowerCase())};
        for (var i = 0; i < root.children.numItems; i++) {
          var c = root.children[i];
          if (c.type !== ProjectItemType.BIN) continue;
          if (c.name.toLowerCase() === newLower) return JSON.stringify({ success: true, renamed: false, reason: "exists" });
          if (c.name.toLowerCase() === oldLower) source = c;
        }
        if (!source) return JSON.stringify({ success: true, renamed: false, reason: "missing" });
        source.renameBin(${JSON.stringify(newName)});
        return JSON.stringify({ success: true, renamed: true });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;
    return evalExtendScript(script);
}
// ==================== utils/audioTranscoder.ts ====================
// Transcodage MP3/M4A/AAC -> WAV entièrement dans le panneau : lecture disque via cep.fs,
// décodage + rééchantillonnage par Web Audio (hors thread principal), encodage PCM en JS.
// Lecture/écriture par Node.js (fs) quand il est actif ; sinon par cep.fs en base64, où le WAV
// doit tenir dans une chaîne (limite V8 ~512 Mo).
const MAX_WAV_BYTES_BASE64 = 350 * 1024 * 1024;
const MAX_WAV_BYTES_NODE = 2000 * 1024 * 1024;

/** Module fs de Node.js si disponible dans le panneau, sinon null */
function nodeFs(): any {
  try {
    return nodeRequire('fs');
  } catch {
    return null;
  }
}
/** Suffixe du WAV généré, ex. "_48k24b" ou "_44.1k16b" */
export function wavSuffix(settings: { sampleRate: number; bitDepth: number }) {
    return `_${settings.sampleRate / 1000}k${settings.bitDepth}b`;
}
export function wavPathFor(inputPath: string, settings: { sampleRate: number; bitDepth: number }) {
    const dot = inputPath.lastIndexOf('.');
    const base = dot > Math.max(inputPath.lastIndexOf('\\'), inputPath.lastIndexOf('/')) ? inputPath.substring(0, dot) : inputPath;
    return base + wavSuffix(settings) + '.wav';
}
function getCepFs() {
    const cep = (window as any).cep;
    return cep && cep.fs ? cep : null;
}
function fileExists(path: string) {
    const fs = nodeFs();
    if (fs) return fs.existsSync(path);
    const cep = getCepFs();
    return !!cep && cep.fs.stat(path).err === 0;
}
function base64ToArrayBuffer(b64: string) {
    // cep.fs peut renvoyer un base64 coupé en lignes, que l'atob de Node refuse (« Invalid character »)
    const bin = atob(b64.replace(/[^A-Za-z0-9+/=]/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}
function bytesToBase64(bytes: Uint8Array) {
    // Tranches multiples de 3 octets : les morceaux base64 se concatènent sans padding intermédiaire
    const CHUNK = 3 * 0x8000;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
        parts.push(btoa(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any)));
    }
    return parts.join('');
}
/** Encode un AudioBuffer en WAV : PCM entier 16/24 bits, ou float IEEE 32 bits */
function encodeWav(audioBuffer: AudioBuffer, bitDepth: number, maxBytes: number) {
    const numCh = audioBuffer.numberOfChannels;
    const numFrames = audioBuffer.length;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    if (44 + dataSize > maxBytes) {
        throw new Error(`fichier trop long pour la conversion intégrée (${Math.round(audioBuffer.duration / 60)} min)`);
    }
    const out = new Uint8Array(44 + dataSize);
    const view = new DataView(out.buffer);
    const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++)
        out[off + i] = s.charCodeAt(i); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // 3 = IEEE float, 1 = PCM
    view.setUint16(22, numCh, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    const channels: Float32Array[] = [];
    for (let c = 0; c < numCh; c++)
        channels.push(audioBuffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < numFrames; i++) {
        for (let c = 0; c < numCh; c++) {
            const s = Math.max(-1, Math.min(1, channels[c][i]));
            if (bitDepth === 32) {
                view.setFloat32(off, s, true);
            }
            else if (bitDepth === 24) {
                const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
                out[off] = v & 0xff;
                out[off + 1] = (v >> 8) & 0xff;
                out[off + 2] = (v >> 16) & 0xff;
            }
            else {
                view.setInt16(off, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
            }
            off += bytesPerSample;
        }
    }
    return out;
}
/**
 * Convertit un fichier audio compressé en WAV à côté de l'original.
 * Ne refait rien si le WAV cible existe déjà.
 */
export async function transcodeFileToWav(inputPath: string, settings: { sampleRate: number; bitDepth: number }) {
    const fs = nodeFs();
    const cep = getCepFs();
    if (!fs && !cep)
        throw new Error("accès disque indisponible (hors Premiere Pro)");
    const outPath = wavPathFor(inputPath, settings);
    if (fileExists(outPath))
        return { outPath, alreadyExisted: true };

    let source: ArrayBuffer;
    if (fs) {
        let buf: any;
        try {
            buf = fs.readFileSync(inputPath);
        } catch (err: any) {
            throw new Error(`lecture impossible (${err?.code || err?.message || err})`);
        }
        source = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } else {
        const read = cep.fs.readFile(inputPath, cep.encoding.Base64);
        if (read.err !== 0)
            throw new Error(`lecture impossible (code ${read.err})`);
        source = base64ToArrayBuffer(read.data);
    }

    // decodeAudioData rééchantillonne vers la fréquence du contexte
    const ctx = new OfflineAudioContext(1, 1, settings.sampleRate);
    const audioBuffer = await ctx.decodeAudioData(source);
    const wav = encodeWav(audioBuffer, settings.bitDepth, fs ? MAX_WAV_BYTES_NODE : MAX_WAV_BYTES_BASE64);

    if (fs) {
        try {
            fs.writeFileSync(outPath, wav);
        } catch (err: any) {
            throw new Error(`écriture impossible dans le dossier source (${err?.code || err?.message || err})`);
        }
    } else {
        const write = cep.fs.writeFile(outPath, bytesToBase64(wav), cep.encoding.Base64);
        if (write.err !== 0)
            throw new Error(`écriture impossible dans le dossier source (code ${write.err})`);
    }
    return { outPath, alreadyExisted: false };
}
/**
 * Pipeline complet : scan du projet -> conversion des MP3/M4A/AAC manquants -> relink Premiere.
 * `skipPaths` permet à la boucle auto de ne pas retenter indéfiniment un fichier en échec.
 */
export async function transcodeAndRelinkCompressedAudio(
  settings: { sampleRate: number; bitDepth: number },
  onProgress?: (msg: string) => void,
  skipPaths?: Set<string>
): Promise<any> {
    const scan = await scanPremiereProjectMemory();
    if (!scan || !scan.success)
        return { success: false, error: scan?.error || 'Scan du projet impossible' };
    const paths: string[] = [];
    for (const a of scan.compressedAudios || []) {
        if (a.mediaPath && paths.indexOf(a.mediaPath) === -1 && !(skipPaths && skipPaths.has(a.mediaPath)))
            paths.push(a.mediaPath);
    }
    let converted = 0;
    const failures: Array<{ path: string; error: string }> = [];
    for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        const fileName = p.split(/[\\/]/).pop() as string;
        onProgress?.(`Conversion ${i + 1}/${paths.length} : ${fileName}…`);
        try {
            const r = await transcodeFileToWav(p, settings);
            if (!r.alreadyExisted)
                converted++;
        }
        catch (err: any) {
            failures.push({ path: p, error: `${fileName} : ${err?.message || err}` });
        }
    }
    if (paths.length > 0)
        onProgress?.('Relink dans Premiere Pro…');
    const relink = await executeDirectAudioRelinkInPremiere(wavSuffix(settings));
    return {
        success: !!relink?.success,
        error: relink?.error,
        convertedCount: converted,
        relinkedCount: relink?.relinkedCount || 0,
        renamedCount: relink?.renamedCount || 0,
        items: (relink as any)?.items || [],
        failures,
        message: relink?.message,
    };
}

export interface ConvertedProjectItem {
  id: string; // nodeId de l'élément de projet
  name: string; // nom actuel (.wav)
  bin: string; // chutier (« 04_VOIX / Interviews »), vide = racine
  from?: string; // nom d'origine (.mp3)
}

/**
 * Sélectionne des éléments dans le panneau Projet (surbrillance), retrouvés par leur nodeId.
 * Renvoie le nombre d'éléments trouvés et, si Premiere sait la relire, la taille réelle de la sélection.
 */
export async function selectProjectItemsInPremiere(ids: string[]): Promise<{ success: boolean; found?: number; selected?: number; error?: string }> {
  const script = `
    (function() {
      try {
        if (!app.project) return JSON.stringify({ success: false, error: "Aucun projet ouvert" });
        var wanted = ${JSON.stringify(ids)};
        var map = {};
        for (var w = 0; w < wanted.length; w++) map[wanted[w]] = true;
        var items = [];
        function walk(item) {
          if (!item) return;
          if (map[String(item.nodeId)]) items.push(item);
          if (item.type === ProjectItemType.BIN || item.type === ProjectItemType.ROOT) {
            for (var i = 0; i < item.children.numItems; i++) walk(item.children[i]);
          }
        }
        walk(app.project.rootItem);
        var done = 0;
        for (var k = 0; k < items.length; k++) {
          try { items[k].select(); done++; } catch (e) {}
        }
        var selected = -1;
        try { var sel = app.getCurrentProjectViewSelection(); selected = sel ? sel.length : 0; } catch (e) {}
        return JSON.stringify({ success: done > 0, found: items.length, selected: selected, error: done ? undefined : "élément introuvable dans le projet" });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;
  return evalExtendScript(script);
}
/**
 * Lance le remplacement direct dans Premiere Pro des pistes audio compressées par leur version WAV
 * avec recherche multi-chemins et diagnostic précis
 */
export async function executeDirectAudioRelinkInPremiere(preferredSuffix: string = '_48k24b'): Promise<{
  success: boolean;
  relinkedCount: number;
  message?: string;
  error?: string;
}> {
  const script = `
    (function() {
      try {
        if (!app.project) {
          return JSON.stringify({ success: false, error: "Aucun projet ouvert dans Premiere Pro" });
        }

        var relinked = 0;
        var pendingFiles = [];
        var notFoundPaths = [];

        var renamed = 0;
        // éléments convertis / renommés : nom, identifiant et chutier, pour les montrer et les sélectionner
        var touched = [];
        var touchedIds = {};
        function remember(item, binPath, from) {
          var id = String(item.nodeId);
          if (touchedIds[id]) return;
          touchedIds[id] = true;
          touched.push({ id: id, name: item.name, bin: binPath, from: from });
        }

        // L'élément de projet garde son nom d'origine (.mp3) après changeMediaPath :
        // on lui donne le nom du WAV pour qu'il apparaisse comme tel dans Premiere
        function renameToFile(item, filePath) {
          var newName = File.decode(new File(filePath).name);
          if (item.name !== newName) {
            item.name = newName;
            renamed++;
          }
        }

        function checkAndRelink(item, binPath) {
          if (!item) return;
          // La racine du projet est de type ROOT (pas BIN) : on la parcourt aussi
          if (item.type === ProjectItemType.BIN || item.type === ProjectItemType.ROOT) {
            var here = item.type === ProjectItemType.ROOT ? "" : (binPath ? binPath + " / " : "") + item.name;
            for (var i = 0; i < item.children.numItems; i++) {
              checkAndRelink(item.children[i], here);
            }
          } else if (item.type === ProjectItemType.CLIP || item.type === ProjectItemType.FILE) {
            var p = "";
            try { p = item.getMediaPath(); } catch(e){}
            if (p) {
              var lower = p.toLowerCase();
              if (lower.indexOf('.mp3') !== -1 || lower.indexOf('.m4a') !== -1 || lower.indexOf('.aac') !== -1) {
                pendingFiles.push(item.name);
                
                // Recherche dans plusieurs variantes usuelles
                var baseWithoutExt = p.substring(0, p.lastIndexOf('.'));
                var candidate0 = baseWithoutExt + ${JSON.stringify(preferredSuffix)} + '.wav';
                var candidate1 = baseWithoutExt + '.wav';
                var candidate2 = baseWithoutExt + '_48k24b.wav';
                var candidate3 = baseWithoutExt + '_WAV.wav';

                var targetFile = new File(candidate0);
                if (!targetFile.exists) targetFile = new File(candidate2);
                if (!targetFile.exists) targetFile = new File(candidate1);
                if (!targetFile.exists) targetFile = new File(candidate3);

                if (targetFile.exists) {
                  try {
                    // changeMediaPath avec 1 force la mise à jour timeline
                    var ok = item.changeMediaPath(targetFile.fsName, true);
                    if (ok || ok === undefined) {
                      relinked++;
                      var before = item.name;
                      try { renameToFile(item, targetFile.fsName); } catch(e) {}
                      remember(item, binPath, before);
                    }
                  } catch(e) {
                    notFoundPaths.push(item.name + ": " + e.toString());
                  }
                } else {
                  notFoundPaths.push(item.name + " (WAV introuvable à côté : " + candidate1 + ")");
                }
              } else if (/\.wav$/i.test(p) && /\.(mp3|m4a|aac)$/i.test(item.name)) {
                var oldName = item.name;
                try { renameToFile(item, p); remember(item, binPath, oldName); } catch(e) {}
              }
            }
          }
        }

        checkAndRelink(app.project.rootItem, "");

        if (relinked > 0 || renamed > 0) {
          return JSON.stringify({
            success: true,
            relinkedCount: relinked,
            renamedCount: renamed,
            items: touched,
            message: (relinked > 0 ? relinked + " piste(s) reliée(s) au master WAV" : "Pistes déjà reliées au WAV") + (renamed > 0 ? ", " + renamed + " élément(s) renommé(s) en .wav dans le projet" : "") + "."
          });
        } else if (pendingFiles.length === 0) {
          return JSON.stringify({
            success: true,
            relinkedCount: 0,
            message: "Aucun fichier audio compressé (MP3/M4A) détecté dans le projet."
          });
        } else {
          return JSON.stringify({
            success: true,
            relinkedCount: 0,
            message: pendingFiles.length + " fichier(s) MP3/M4A trouvé(s), mais aucun fichier .wav correspondant n'existe dans le même dossier sur votre disque."
          });
        }
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;

  return evalExtendScript(script);
}

/**
 * Fonctions ExtendScript communes pour poser des marqueurs :
 * couleur via setColorByIndex (setColorIndex n'existe pas dans Premiere)
 * et saut des marqueurs déjà présents (même position + même commentaire).
 */
const MARKER_HELPERS = `
        var PPRO_COLOR_INDEX = { Green: 0, Red: 1, Magenta: 2, Purple: 2, Orange: 3, Yellow: 4, White: 5, Blue: 6, Cyan: 7 };

        // Texte comparable d'un commentaire : sans préfixe [RÉSOLU] ni [Auteur], espaces et casse ignorés
        function markerText(comment) {
          var t = String(comment).replace(/[\\r\\n]+\\s*↳[\\s\\S]*$/, '');
          if (t.indexOf('[RÉSOLU] ') === 0) t = t.substring(9);
          t = t.replace(/^\\[[^\\]]*\\]\\s*/, '');
          return t.replace(/\\s+/g, ' ').replace(/^\\s+|\\s+$/g, '').toLowerCase();
        }

        // Occurrences des clips vidéo de la séquence, piste du haut d'abord (le clip visible à l'image)
        var __clipInstances = null;
        function clipInstances(seq) {
          if (__clipInstances) return __clipInstances;
          var out = [];
          for (var v = seq.videoTracks.numTracks - 1; v >= 0; v--) {
            var tr = seq.videoTracks[v];
            for (var c = 0; c < tr.clips.numItems; c++) {
              var clip = tr.clips[c];
              var pi = null;
              try { pi = clip.projectItem; } catch (e) {}
              if (!pi) continue;
              var speed = 1;
              try { speed = Math.abs(clip.getSpeed()) || 1; } catch (e) {}
              out.push({ pi: pi, node: String(pi.nodeId), start: clip.start.seconds, end: clip.end.seconds, inPt: clip.inPoint.seconds, speed: speed });
            }
          }
          __clipInstances = out;
          return out;
        }

        // Clip visible à un instant de la séquence (ou null)
        function clipAt(seq, sec) {
          var inst = clipInstances(seq);
          for (var i = 0; i < inst.length; i++) {
            if (sec >= inst[i].start && sec < inst[i].end) return inst[i];
          }
          return null;
        }

        // Marqueurs visibles depuis la séquence : ceux de la séquence et, si withClips, ceux des clips
        // maîtres placés dessus (temps source ramené au temps séquence de l'occurrence qui le montre)
        function collectExistingMarkers(seq, withClips) {
          var list = [];
          function add(coll, owner, toSeq) {
            var k = coll.getFirstMarker();
            var guard = 0;
            while (k && guard < 100000) {
              var s = toSeq ? toSeq(k.start.seconds) : k.start.seconds;
              if (s !== null) {
                list.push({ marker: k, coll: coll, owner: owner, guid: String(k.guid), sec: s, dur: k.end.seconds - k.start.seconds,
                  comments: String(k.comments), text: markerText(k.comments), nameText: markerText(k.name) });
              }
              k = coll.getNextMarker(k);
              guard++;
            }
          }
          add(seq.markers, 'seq', null);
          if (!withClips) return list;
          var inst = clipInstances(seq);
          var done = {};
          for (var i = 0; i < inst.length; i++) {
            var node = inst[i].node;
            if (done[node]) continue;
            done[node] = true;
            var mc = null;
            try { mc = inst[i].pi.getMarkers(); } catch (e) {}
            if (!mc || !mc.numMarkers) continue;
            var occ = [];
            for (var j = 0; j < inst.length; j++) if (inst[j].node === node) occ.push(inst[j]);
            add(mc, node, (function (occ) {
              return function (t) {
                for (var o = 0; o < occ.length; o++) {
                  var s = occ[o].start + (t - occ[o].inPt) / occ[o].speed;
                  if (s >= occ[o].start - 0.001 && s < occ[o].end) return s;
                }
                return null;
              };
            })(occ));
          }
          return list;
        }

        // Même retour déjà posé : même texte à moins de 2 s (un réimport ou un CSV réexporté décale
        // parfois de quelques images : 02:05 contre 125,5 s)
        function findPlaced(existing, sec, comment) {
          var text = markerText(comment);
          for (var i = 0; i < existing.length; i++) {
            if (existing[i].text === text && Math.abs(existing[i].sec - sec) < 2) return existing[i];
          }
          return null;
        }
        function isAlreadyPlaced(existing, sec, comment) {
          return !!findPlaced(existing, sec, comment);
        }

        // Retourne 'added', 'skipped' ou un message d'erreur. onClip : sur le clip visible à cet instant
        // (le marqueur suit alors le plan quand il bouge), sur la séquence s'il n'y a pas de clip
        function placeMarker(seq, existing, sec, durationSec, name, comment, color, onClip) {
          var placed = findPlaced(existing, sec, comment);
          if (placed) {
            // déjà posé : seules les réponses (lignes « ↳ ») sont mises à jour, le texte du retour n'est pas touché
            if (placed.marker && placed.comments !== undefined) {
              var pre = placed.comments.indexOf('[RÉSOLU] ') === 0 ? '[RÉSOLU] ' : '';
              var oldBody = placed.comments.substring(pre.length);
              var head = function (c) { return c.replace(/[\\r\\n]+\\s*↳[\\s\\S]*$/, ''); };
              if (oldBody !== comment && head(oldBody) === head(comment)) {
                try { placed.marker.comments = pre + comment; placed.comments = pre + comment; } catch (e) {}
              }
            }
            return 'skipped';
          }
          var coll = seq.markers;
          var t = sec;
          var owner = 'seq';
          if (onClip) {
            var hit = clipAt(seq, sec);
            var mc = null;
            if (hit) { try { mc = hit.pi.getMarkers(); } catch (e) {} }
            if (mc) {
              coll = mc;
              t = hit.inPt + (sec - hit.start) * hit.speed;
              owner = hit.node;
            }
          }
          var marker = coll.createMarker(t);
          if (!marker) return 'createMarker a renvoyé null';
          existing.push({ sec: sec, text: markerText(comment), owner: owner });
          marker.name = name;
          marker.comments = comment;
          if (durationSec > 0) {
            try { marker.end = t + durationSec; } catch (e) {}
          }
          var idx = PPRO_COLOR_INDEX[color];
          if (idx === undefined) idx = 0;
          try { marker.setColorByIndex(idx); } catch (e) {}
          return 'added';
        }
`;
/**
 * Crée directement les marqueurs sur la séquence active ou première séquence
 */
export async function applyMarkersDirectlyToPremiereTimeline(
  markers: Array<{
    timecode: string;
    comment: string;
    author?: string;
    color?: string;
  }>,
  fps: number
): Promise<{
  success: boolean;
  addedCount: number;
  message?: string;
  error?: string;
}> {
  const safeData = JSON.stringify(
    markers.map((m) => ({
      timecode: m.timecode || '00:00:00:00',
      durationSeconds: m.durationSeconds || 0,
      comment: (m.author ? '[' + m.author + '] ' : '') + (m.comment || 'Note'),
      name: m.author || 'Retour Client',
      color: m.color || 'Green',
    }))
  );

  const script = `
    (function() {
      try {
        if (!app.project) {
          return JSON.stringify({ success: false, error: "Aucun projet ouvert dans Premiere Pro." });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
          // Essayer de trouver la première séquence du projet
          for (var i = 0; i < app.project.sequences.numSequences; i++) {
            seq = app.project.sequences[i];
            if (seq) break;
          }
        }

        if (!seq) {
          return JSON.stringify({
            success: false,
            error: "Aucune séquence de montage ouverte. Veuillez double-cliquer sur une séquence dans Premiere Pro pour l'ouvrir dans la Timeline."
          });
        }

        var markersData = ${safeData};
        var fpsVal = ${fps || 25};
        var added = 0;

        function tcToSeconds(tc, frameRate) {
          if (!tc) return 0;
          var clean = tc.replace(/;/g, ':').replace(/^\\s+|\\s+$/g, '');
          var parts = clean.split(':');
          if (parts.length < 3) return 0;

          var h = parseFloat(parts[0]) || 0;
          var m = parseFloat(parts[1]) || 0;
          var s = parseFloat(parts[2]) || 0;
          var f = parts.length > 3 ? (parseFloat(parts[3]) || 0) : 0;

          return (h * 3600) + (m * 60) + s + (f / frameRate);
        }

${MARKER_HELPERS}
        var existing = collectExistingMarkers(seq);
        var skipped = 0;
        var errors = [];

        for (var j = 0; j < markersData.length; j++) {
          var item = markersData[j];
          var timeSec = tcToSeconds(item.timecode, fpsVal);
          try {
            var r = placeMarker(seq, existing, timeSec, item.durationSeconds, item.name, item.comment, item.color);
            if (r === 'added') added++;
            else if (r === 'skipped') skipped++;
            else errors.push(r);
          } catch(e) { errors.push(e.toString()); }
        }

        if (added === 0 && errors.length > 0) {
          return JSON.stringify({ success: false, error: "Impossible de poser les marqueurs : " + errors[0] });
        }
        return JSON.stringify({
          success: true,
          addedCount: added,
          skippedCount: skipped,
          message: added + " marqueur(s) posé(s) sur la séquence '" + (seq.name || "Active") + "'" + (skipped ? " (" + skipped + " déjà présent(s), ignoré(s))" : "") + "."
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;

  return evalExtendScript(script);
}

/**
 * Retire de la séquence active les marqueurs des retours donnés : même texte (commentaire, ou nom pour
 * les marqueurs posés par l'ancien import CSV aux colonnes décalées) à moins de 2 s. Les autres marqueurs restent.
 */
export async function removeReviewMarkersFromActiveSequence(
  markers: Array<{ seconds: number; comment: string }>,
  withClips = false
): Promise<{ success: boolean; removedCount?: number; error?: string }> {
  const data = JSON.stringify(markers.map((m) => ({ seconds: m.seconds || 0, comment: m.comment || '' })));
  const script = `
    (function() {
      try {
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return JSON.stringify({ success: false, error: "Aucune séquence active dans Premiere Pro." });
        var items = ${data};
${MARKER_HELPERS}
        for (var i = 0; i < items.length; i++) items[i].text = markerText(items[i].comment);
        var existing = collectExistingMarkers(seq, ${withClips ? 'true' : 'false'});
        var doomed = [];
        for (var e = 0; e < existing.length; e++) {
          var x = existing[e];
          for (var j = 0; j < items.length; j++) {
            if (Math.abs(x.sec - items[j].seconds) < 2 && (x.text === items[j].text || x.nameText === items[j].text)) {
              doomed.push(x);
              break;
            }
          }
        }
        for (var d = 0; d < doomed.length; d++) doomed[d].coll.deleteMarker(doomed[d].marker);
        return JSON.stringify({ success: true, removedCount: doomed.length });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;
  return evalExtendScript(script);
}

const RESOLVED_PREFIX = '[RÉSOLU] ';

/**
 * Répercute le statut « résolu » d'un retour sur son marqueur de la séquence active, retrouvé par
 * position + commentaire : suppression (ou recréation si on décoche), passage en vert, ou préfixe [RÉSOLU].
 */
export async function syncResolvedMarkerInPremiere(
  marker: { seconds: number; durationSeconds?: number; comment: string; author?: string; color: string },
  resolved: boolean,
  action: ResolvedAction,
  placement: { withClips?: boolean; onClip?: boolean } = {}
): Promise<{ success: boolean; affected?: number; error?: string }> {
  const data = JSON.stringify({
    seconds: marker.seconds || 0,
    durationSeconds: marker.durationSeconds || 0,
    comment: (marker.author ? '[' + marker.author + '] ' : '') + (marker.comment || 'Note'),
    name: marker.author || 'Retour Client',
    color: marker.color || 'Green',
    resolved,
    action,
    prefix: RESOLVED_PREFIX,
    withClips: !!(placement.withClips || placement.onClip),
    onClip: !!placement.onClip,
  });
  const script = `
    (function() {
      try {
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return JSON.stringify({ success: false, error: "Aucune séquence active dans Premiere Pro." });
        var d = ${data};
${MARKER_HELPERS}
        var existing = collectExistingMarkers(seq, d.withClips);
        var wanted = markerText(d.comment);
        var matches = [];
        for (var n = 0; n < existing.length; n++) {
          if (Math.abs(existing[n].sec - d.seconds) < 2 && existing[n].text === wanted) matches.push(existing[n]);
        }

        var affected = 0;
        if (d.action === 'delete') {
          if (d.resolved) {
            for (var i = 0; i < matches.length; i++) { matches[i].coll.deleteMarker(matches[i].marker); affected++; }
          } else if (matches.length === 0) {
            if (placeMarker(seq, existing, d.seconds, d.durationSeconds, d.name, d.comment, d.color, d.onClip) === 'added') affected++;
          }
        } else {
          for (var j = 0; j < matches.length; j++) {
            if (d.action === 'green') {
              var idx = d.resolved ? 0 : PPRO_COLOR_INDEX[d.color];
              try { matches[j].marker.setColorByIndex(idx === undefined ? 0 : idx); } catch (e) {}
            } else {
              matches[j].marker.comments = (d.resolved ? d.prefix : "") + d.comment;
            }
            affected++;
          }
        }
        return JSON.stringify({ success: true, affected: affected });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;
  return evalExtendScript(script);
}

/**
 * Décale de delta secondes tous les marqueurs de la séquence active placés à partir de la tête de lecture
 * (après un « supprimer et raccorder » : delta négatif ; après un ajout de matière : positif).
 * Les marqueurs de clips ne sont pas concernés : ils suivent déjà leurs plans.
 */
export async function shiftSequenceMarkersAfterPlayhead(delta: number): Promise<{ success: boolean; moved?: number; playhead?: number; error?: string }> {
  const script = `
    (function() {
      try {
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return JSON.stringify({ success: false, error: "Aucune séquence active dans Premiere Pro." });
        var from = seq.getPlayerPosition().seconds;
        var delta = ${Number(delta) || 0};
        var list = [];
        var k = seq.markers.getFirstMarker();
        var guard = 0;
        while (k && guard < 100000) {
          if (k.start.seconds >= from - 0.0005) list.push(k);
          k = seq.markers.getNextMarker(k);
          guard++;
        }
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          var s = m.start.seconds, e = m.end.seconds;
          var ns = Math.max(0, s + delta);
          var ne = Math.max(ns, e + (ns - s));
          // Premiere garde la durée quand on change le début (la fin suit) : début d'abord, puis fin pour confirmer
          m.start = ns;
          m.end = ne;
        }
        return JSON.stringify({ success: true, moved: list.length, playhead: from });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;
  return evalExtendScript(script);
}

/**
 * Durée signée saisie par l'utilisateur, en secondes : « -00:00:02:10 » (HH:MM:SS:II), « -02:10 » (SS:II),
 * « 1:02:10 » (MM:SS:II), « +5s », « -2,5 », « -12i » / « 12 images ». null si illisible.
 */
export function parseShiftDuration(text: string, fps: number): number | null {
  const t = String(text || '').trim().replace(/\s+/g, '').replace(',', '.').toLowerCase();
  if (!t) return null;
  const sign = t.startsWith('-') ? -1 : 1;
  const body = t.replace(/^[+-]/, '');
  let m: RegExpMatchArray | null;
  if ((m = body.match(/^(\d+(?:\.\d+)?)(i|im|img|images?|f|frames?)$/))) return (sign * parseFloat(m[1])) / fps;
  if ((m = body.match(/^(\d+(?:\.\d+)?)(s|sec|secondes?)?$/))) return sign * parseFloat(m[1]);
  if (/^\d+(:\d+){1,3}$/.test(body)) {
    const parts = body.split(':').map((n) => parseInt(n, 10));
    const frames = parts.pop()!;
    if (frames >= Math.ceil(fps)) return null;
    let secs = 0;
    for (const p of parts) secs = secs * 60 + p;
    return sign * (secs + frames / fps);
  }
  return null;
}

export interface TimelineMarkerInfo {
  guid: string;
  owner: string; // 'seq' ou nodeId du clip maître qui porte le marqueur
  seconds: number; // temps séquence
  durationSeconds: number;
  comments: string;
  text: string; // texte comparable (sans [RÉSOLU] ni [Auteur])
  nameText: string;
}

/** Marqueurs de la séquence active (et, si withClips, ceux des clips posés dessus), pour lier la liste des retours */
export async function readTimelineMarkers(withClips: boolean): Promise<{ success: boolean; seqId?: string; markers?: TimelineMarkerInfo[] }> {
  const script = `
    (function() {
      try {
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return JSON.stringify({ success: false });
${MARKER_HELPERS}
        var existing = collectExistingMarkers(seq, ${withClips ? 'true' : 'false'});
        var out = [];
        for (var i = 0; i < existing.length; i++) {
          var x = existing[i];
          out.push({ guid: x.guid, owner: x.owner, seconds: x.sec, durationSeconds: x.dur, comments: x.comments, text: x.text, nameText: x.nameText });
        }
        return JSON.stringify({ success: true, seqId: String(seq.sequenceID), markers: out });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;
  return evalExtendScript(script, 4000);
}

/** Texte comparable d'un commentaire, identique au markerText d'ExtendScript */
export function reviewMarkerText(comment: string): string {
  let t = String(comment || '').replace(/[\r\n]+\s*↳[\s\S]*$/, '');
  if (t.indexOf(RESOLVED_PREFIX) === 0) t = t.substring(RESOLVED_PREFIX.length);
  t = t.replace(/^\[[^\]]*\]\s*/, '');
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface TimelineReconcileResult {
  list: ReviewMarker[];
  changed: boolean;
  removed: ReviewMarker[];
  moved: number;
  edited: number;
}

/**
 * Accorde la liste des retours avec les marqueurs lus sur la séquence active :
 * - chaque retour est lié à son marqueur (guid) ; un retour pas encore lié le devient s'il existe un
 *   marqueur de même texte à moins de 2 s ;
 * - marqueur déplacé dans Premiere → nouveau timecode ; commentaire modifié → nouveau texte ;
 * - marqueur supprimé dans Premiere → retour retiré de la liste (sauf s'il a été retiré exprès parce que
 *   résolu avec l'option « retirer de la timeline ») ;
 * - les retours liés à une autre séquence ne sont pas touchés.
 */
export function reconcileWithTimeline(
  list: ReviewMarker[],
  seqId: string,
  timeline: TimelineMarkerInfo[],
  resolvedAction: ResolvedAction,
  fps: FrameRate
): TimelineReconcileResult {
  const claimed = new Set<string>();
  const byGuid = new Map(timeline.map((t) => [t.guid, t]));
  let changed = false;
  let moved = 0;
  let edited = 0;
  const removed: ReviewMarker[] = [];
  const next: ReviewMarker[] = [];

  // d'abord les liens exacts (guid), pour qu'un relink par texte ne vole pas le marqueur d'un autre retour
  const exact = new Map<string, TimelineMarkerInfo>();
  for (const m of list) {
    if (m.pproGuid && m.pproSeqId === seqId && byGuid.has(m.pproGuid)) {
      exact.set(m.id, byGuid.get(m.pproGuid)!);
      claimed.add(m.pproGuid);
    }
  }

  for (const m of list) {
    if (m.pproSeqId && m.pproSeqId !== seqId) {
      next.push(m);
      continue;
    }
    let hit = exact.get(m.id);
    const byGuidHit = !!hit;
    if (!hit) {
      const text = reviewMarkerText(m.comment);
      let best: TimelineMarkerInfo | undefined;
      for (const t of timeline) {
        if (claimed.has(t.guid) || (t.text !== text && t.nameText !== text)) continue;
        const d = Math.abs(t.seconds - m.seconds);
        // jamais lié : même endroit (< 2 s) ; déjà lié mais guid perdu (projet rouvert, marqueur recréé) : le plus proche
        if (!m.pproGuid && d >= 2) continue;
        if (!best || d < Math.abs(best.seconds - m.seconds)) best = t;
      }
      hit = best;
    }

    if (!hit) {
      if (m.pproGuid && m.pproSeqId === seqId) {
        if (m.isResolved && resolvedAction === 'delete') {
          // retiré de la timeline par Mori lui-même : le retour reste, le lien est oublié
          const { pproGuid, pproSeqId, pproOwner, ...rest } = m;
          next.push(rest as ReviewMarker);
          changed = true;
        } else {
          removed.push(m);
          changed = true;
        }
      } else {
        next.push(m);
      }
      continue;
    }

    claimed.add(hit.guid);
    let updated: ReviewMarker = m;
    if (m.pproGuid !== hit.guid || m.pproSeqId !== seqId || m.pproOwner !== hit.owner) {
      updated = { ...updated, pproGuid: hit.guid, pproSeqId: seqId, pproOwner: hit.owner };
    }
    const frame = 1 / (fps || 25);
    if (Math.abs(hit.seconds - m.seconds) > frame / 2) {
      updated = { ...updated, seconds: hit.seconds, timecode: secondsToTimecode(hit.seconds, fps, true) };
      moved++;
    }
    if (hit.durationSeconds > 0 && Math.abs(hit.durationSeconds - (m.durationSeconds || 0)) > frame / 2) {
      updated = { ...updated, durationSeconds: hit.durationSeconds };
    }
    // commentaire réécrit dans Premiere (seulement pour un lien exact : un relink se fait déjà sur le texte)
    if (byGuidHit && hit.text && hit.text !== reviewMarkerText(m.comment)) {
      let raw = hit.comments.replace(/[\r\n]+\s*↳[\s\S]*$/, '');
      if (raw.indexOf(RESOLVED_PREFIX) === 0) raw = raw.substring(RESOLVED_PREFIX.length);
      raw = raw.replace(/^\[[^\]]*\]\s*/, '').trim();
      if (raw) {
        updated = { ...updated, comment: raw };
        edited++;
      }
    }
    // option « préfixer [RÉSOLU] » : le préfixe ajouté ou retiré à la main vaut coche
    if (byGuidHit && resolvedAction === 'prefix') {
      const prefixed = hit.comments.indexOf(RESOLVED_PREFIX) === 0;
      if (prefixed !== m.isResolved) updated = { ...updated, isResolved: prefixed };
    }
    if (updated !== m) changed = true;
    next.push(updated);
  }

  if (moved) next.sort((a, b) => a.seconds - b.seconds);
  return { list: changed ? next : list, changed, removed, moved, edited };
}

/** Cadence de la séquence active (images/s), ramenée à la cadence standard la plus proche */
export async function getActiveSequenceFrameRate(): Promise<FrameRate | null> {
  const res: any = await evalExtendScript(`
    (function() {
      try {
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return JSON.stringify({ success: false });
        var fps = 0;
        try { fps = 1 / seq.getSettings().videoFrameRate.seconds; } catch (e) {}
        if (!fps) fps = 254016000000 / parseFloat(seq.timebase);
        return JSON.stringify({ success: true, fps: fps });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `);
  if (!res?.success || !res.fps) return null;
  return SUPPORTED_FRAMERATES.reduce((best, f) => (Math.abs(f - res.fps) < Math.abs(best - res.fps) ? f : best), SUPPORTED_FRAMERATES[0]);
}

// Alias de compatibilité pour ReviewMarkersHub
export async function addMarkersToActiveSequenceInPremiere(
  markers: Array<{
    seconds: number;
    durationSeconds?: number;
    comment: string;
    author?: string;
    color?: string;
  }>,
  onClip = false
): Promise<{ success: boolean; addedCount: number; message?: string; error?: string }> {
  const safeData = JSON.stringify(
    markers.map((m) => ({
      seconds: m.seconds || 0,
      durationSeconds: m.durationSeconds || 0,
      comment: (m.author ? '[' + m.author + '] ' : '') + (m.comment || 'Note'),
      name: m.author || 'Retour Client',
      color: m.color || 'Green',
    }))
  );

  const script = `
    (function() {
      try {
        if (!app.project) {
          return JSON.stringify({ success: false, error: "Aucun projet ouvert dans Premiere Pro." });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
          // Essayer de trouver la première séquence du projet
          for (var i = 0; i < app.project.sequences.numSequences; i++) {
            seq = app.project.sequences[i];
            if (seq) break;
          }
        }

        if (!seq) {
          return JSON.stringify({
            success: false,
            error: "Aucune séquence de montage active trouvée. Ouvrez une séquence dans la Timeline."
          });
        }

        var markersData = ${safeData};
        var added = 0;

${MARKER_HELPERS}
        var onClip = ${onClip ? 'true' : 'false'};
        var existing = collectExistingMarkers(seq, onClip);
        var skipped = 0;
        var errors = [];

        for (var j = 0; j < markersData.length; j++) {
          var item = markersData[j];
          try {
            var r = placeMarker(seq, existing, item.seconds || 0, item.durationSeconds, item.name, item.comment, item.color, onClip);
            if (r === 'added') added++;
            else if (r === 'skipped') skipped++;
            else errors.push(r);
          } catch(e) { errors.push(e.toString()); }
        }

        if (added === 0 && errors.length > 0) {
          return JSON.stringify({ success: false, error: "Impossible de poser les marqueurs : " + errors[0] });
        }
        return JSON.stringify({
          success: true,
          addedCount: added,
          skippedCount: skipped,
          message: added + " marqueur(s) posé(s) sur la séquence '" + (seq.name || "Active") + "'" + (skipped ? " (" + skipped + " déjà présent(s), ignoré(s))" : "") + "."
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;

  return evalExtendScript(script);
}



// ==================== utils/videoTranscoder.ts ====================
// Remux / réencodage vidéo via FFmpeg, lancé par Node.js (manifest : --enable-nodejs, contexte séparé -> window.cep_node).

export type VideoConversionMode = 'auto' | 'remux' | 'reencode';

export interface FfmpegTools {
  ffmpeg: string;
  ffprobe: string | null;
  source: 'embarqué' | 'personnalisé' | 'système';
}

export interface MediaProbe {
  durationSec: number;
  formatName: string;
  video: { codec: string; width: number; height: number; fps: number; isVFR: boolean; pixFmt: string } | null;
  audios: Array<{ codec: string; channels: number; sampleRate: number }>;
}

export interface ConversionPlan {
  kind: 'remux' | 'reencode' | 'none';
  reasons: string[];
  targetFps: number;
  copyAudio: boolean;
}

/** Codecs vidéo que Premiere lit bien dans un MP4 : ceux-là sont simplement réencapsulés */
const REMUXABLE_VIDEO = ['h264', 'hevc'];
/** Codecs audio conservés tels quels dans le MP4 (sinon conversion AAC, sans toucher à la vidéo) */
const COPYABLE_AUDIO = ['aac', 'mp3'];
export const VIDEO_INPUT_EXTENSIONS = ['mkv', 'ts', 'm2ts', 'mts', 'webm', 'm3u8', 'flv', 'avi', 'mp4', 'mov', 'm4v', 'ogv', 'wmv'];
const STANDARD_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 100, 119.88, 120];
const FFMPEG_PATH_STORAGE_KEY = 'cutflow.ffmpegPath';

function nodeRequire(name: string): any {
  const w = window as any;
  const n = w.cep_node;
  // Après un rechargement de la page, CEP ne fournit plus cep_node.require :
  // on retombe sur la copie faite au démarrage (index.html) ou sur process.mainModule.require
  const mainModule = n?.process?.mainModule;
  const req =
    (n && typeof n.require === 'function' && n.require) ||
    (typeof w.__moriRequire === 'function' && w.__moriRequire) ||
    (mainModule && typeof mainModule.require === 'function' && mainModule.require.bind(mainModule)) ||
    (typeof w.require === 'function' && w.require);
  return req ? req(name) : null;
}

export function isNodeAvailable(): boolean {
  try {
    return !!nodeRequire('child_process');
  } catch {
    return false;
  }
}

export function isWindowsPlatform(): boolean {
  const proc = (window as any).cep_node?.process;
  return proc ? proc.platform === 'win32' : navigator.platform.toLowerCase().startsWith('win');
}

/** Dossier de l'extension, déduit de l'URL de index.html */
function extensionRoot(): string {
  // Mori Checker (servi par mori://) : dossier réel fourni par la page
  const declared = (window as any).__moriRoot;
  if (typeof declared === 'string' && declared) return declared;
  let p = decodeURIComponent(new URL('.', location.href).pathname);
  if (isWindowsPlatform()) p = p.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
  return p;
}

/** Nom de la fenêtre du panneau dans Premiere (onglet, Fenêtre > Extensions) pour un nom affiché donné */
export function panelWindowName(label: string): string {
  const l = String(label || '').trim();
  return l ? `Mori — ${l}` : 'Mori';
}

/**
 * Écrit le nom de la fenêtre dans CSXS/manifest.xml (<Menu>) : Premiere ne lit ce fichier qu'au démarrage,
 * le nouveau nom s'affiche donc au prochain lancement. 'same' si rien à changer.
 */
export function writePanelWindowName(label: string): 'changed' | 'same' | 'unavailable' | 'error' {
  const fs = nodeRequire('fs');
  const pathMod = nodeRequire('path');
  if (!fs || !pathMod || !isRunningInPremiere() || (window as any).__moriRoot) return 'unavailable';
  try {
    const file = pathMod.join(extensionRoot(), 'CSXS', 'manifest.xml');
    const xml = String(fs.readFileSync(file, 'utf8'));
    const safe = panelWindowName(label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (!/<Menu([^>]*)>[\s\S]*?<\/Menu>/.test(xml)) return 'error';
    const next = xml.replace(/<Menu([^>]*)>[\s\S]*?<\/Menu>/, (_m: string, attrs: string) => `<Menu${attrs}>${safe}</Menu>`);
    if (next === xml) return 'same';
    fs.writeFileSync(file, next, 'utf8');
    return 'changed';
  } catch {
    return 'error';
  }
}

export function getCustomFfmpegPath(): string {
  try {
    return localStorage.getItem(FFMPEG_PATH_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setCustomFfmpegPath(path: string) {
  ffmpegToolsCache = null;
  try {
    if (path) localStorage.setItem(FFMPEG_PATH_STORAGE_KEY, path);
    else localStorage.removeItem(FFMPEG_PATH_STORAGE_KEY);
  } catch {}
}

/** Exécutables du PATH portant ce nom, lus directement sur le disque (sans lancer where/which, qui bloquaient l'interface) */
function whichAll(name: string): string[] {
  const fs = nodeRequire('fs');
  const pathMod = nodeRequire('path');
  if (!fs || !pathMod) return [];
  const env = (window as any).cep_node?.process?.env || {};
  const win = isWindowsPlatform();
  const dirs = String(env.PATH || env.Path || '').split(win ? ';' : ':').filter(Boolean);
  const out: string[] = [];
  for (const dir of dirs) {
    const full = pathMod.join(dir.replace(/^"|"$/g, ''), name + (win ? '.exe' : ''));
    try {
      if (fs.existsSync(full)) out.push(full);
    } catch {}
  }
  return out;
}

// Résultats mis en cache : plusieurs outils les demandent au démarrage
let ffmpegToolsCache: FfmpegTools | null = null;
let ytdlpCache: string | null = null;

/** Recherche FFmpeg : copie embarquée (bin/) > chemin choisi > installation système (PATH, winget) */
export function findFfmpegTools(): FfmpegTools | null {
  if (ffmpegToolsCache) return ffmpegToolsCache;
  ffmpegToolsCache = searchFfmpegTools();
  return ffmpegToolsCache;
}

function searchFfmpegTools(): FfmpegTools | null {
  const fs = nodeRequire('fs');
  const pathMod = nodeRequire('path');
  const cp = nodeRequire('child_process');
  if (!fs || !pathMod || !cp) return null;
  const win = isWindowsPlatform();
  const exe = win ? '.exe' : '';
  const siblingProbe = (ffmpegPath: string) => {
    const probe = pathMod.join(pathMod.dirname(ffmpegPath), 'ffprobe' + exe);
    return fs.existsSync(probe) ? probe : null;
  };

  const embedded = pathMod.join(extensionRoot(), 'bin', win ? 'win' : 'mac', 'ffmpeg' + exe);
  if (fs.existsSync(embedded)) return { ffmpeg: embedded, ffprobe: siblingProbe(embedded), source: 'embarqué' };

  const custom = getCustomFfmpegPath();
  if (custom && fs.existsSync(custom)) return { ffmpeg: custom, ffprobe: siblingProbe(custom), source: 'personnalisé' };

  const candidates: string[] = whichAll('ffmpeg');
  const env = (window as any).cep_node?.process?.env || {};
  if (win && env.LOCALAPPDATA) candidates.push(pathMod.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'));
  if (!win) candidates.push('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg');
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const probe = siblingProbe(c);
      return { ffmpeg: c, ffprobe: probe, source: 'système' };
    }
  }
  return null;
}

/** Environnement des outils lancés : sortie UTF-8 forcée (sinon Windows perd les caractères non latins) */
function toolEnv(): any {
  const env = (window as any).cep_node?.process?.env || {};
  return { ...env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
}

function runProcess(bin: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const cp = nodeRequire('child_process');
  return new Promise((resolve, reject) => {
    const child = cp.spawn(bin, args, { windowsHide: true, env: toolEnv() });
    // décodage UTF-8 qui gère les caractères coupés entre deux blocs
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: any) => (stdout += d.toString()));
    child.stderr.on('data', (d: any) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code: number) => resolve({ code, stdout, stderr }));
  });
}

function parseRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [n, d] = rate.split('/').map(Number);
  return d ? n / d : n || 0;
}

function inputArgs(input: string): string[] {
  // Playlist HLS locale : autoriser la lecture de ses segments (fichiers ou URL)
  return /\.m3u8$/i.test(input) ? ['-protocol_whitelist', 'file,http,https,tcp,tls,crypto', '-i', input] : ['-i', input];
}

/**
 * Cadence réelle mesurée sur les écarts entre images des 2 premières minutes. Les conteneurs (MKV d'OBS…)
 * annoncent souvent une cadence fixe même quand elle varie : variable si plus de 5 % des écarts
 * s'éloignent de plus de 20 % de l'écart médian. La cadence retenue est celle de l'écart médian.
 */
async function measureFrameCadence(ffprobe: string, pre: string[], input: string): Promise<{ fps: number; isVariable: boolean } | null> {
  const res = await runProcess(ffprobe, [
    ...pre, '-v', 'error', '-select_streams', 'v:0', '-read_intervals', '%+120', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', input,
  ]);
  if (res.code !== 0) return null;
  const pts = res.stdout
    .split(/\r?\n/)
    .map((l) => parseFloat(l))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
  if (pts.length < 10) return null;
  const deltas: number[] = [];
  for (let i = 1; i < pts.length; i++) if (pts[i] > pts[i - 1]) deltas.push(pts[i] - pts[i - 1]);
  if (deltas.length < 5) return null;
  const median = [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)];
  const off = deltas.filter((d) => Math.abs(d - median) / median > 0.2).length;
  return { fps: 1 / median, isVariable: off / deltas.length > 0.05 };
}

/** Analyse des flux : ffprobe (JSON) si présent, sinon lecture de la sortie de `ffmpeg -i` */
export async function probeMedia(tools: FfmpegTools, input: string): Promise<MediaProbe> {
  if (tools.ffprobe) {
    const pre = /\.m3u8$/i.test(input) ? ['-protocol_whitelist', 'file,http,https,tcp,tls,crypto'] : [];
    const res = await runProcess(tools.ffprobe, [...pre, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', input]);
    if (res.code !== 0) throw new Error(res.stderr.trim().split(/\r?\n/).pop() || 'analyse impossible');
    const data = JSON.parse(res.stdout);
    const v = (data.streams || []).find((s: any) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
    const rFps = parseRate(v?.r_frame_rate);
    const avgFps = parseRate(v?.avg_frame_rate);
    let fps = avgFps || rFps;
    // cadence réelle ≠ cadence moyenne (ou base de temps de conteneur) : fréquence variable
    let isVFR = !!(rFps && avgFps && (Math.abs(rFps - avgFps) / avgFps > 0.01 || rFps > 240));
    if (v) {
      const cadence = await measureFrameCadence(tools.ffprobe, pre, input);
      if (cadence) {
        isVFR = isVFR || cadence.isVariable;
        if (cadence.isVariable || !fps) fps = cadence.fps;
      }
    }
    return {
      durationSec: parseFloat(data.format?.duration) || parseFloat(v?.duration) || 0,
      formatName: data.format?.format_name || '',
      video: v
        ? {
            codec: v.codec_name,
            width: v.width,
            height: v.height,
            fps,
            isVFR,
            pixFmt: v.pix_fmt || '',
          }
        : null,
      audios: (data.streams || [])
        .filter((s: any) => s.codec_type === 'audio')
        .map((s: any) => ({ codec: s.codec_name, channels: s.channels, sampleRate: parseInt(s.sample_rate, 10) || 0 })),
    };
  }

  const res = await runProcess(tools.ffmpeg, ['-hide_banner', ...inputArgs(input)]);
  const text = res.stderr;
  const dur = text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const vLine = text.match(/Stream #\S+.*?: Video: (\w+)[^\n]*/);
  const fps = vLine ? parseFloat((vLine[0].match(/([\d.]+) fps/) || [])[1] || '0') : 0;
  const tbr = vLine ? parseFloat((vLine[0].match(/([\d.]+) tbr/) || [])[1] || '0') : 0;
  const size = vLine ? vLine[0].match(/(\d{2,5})x(\d{2,5})/) : null;
  return {
    durationSec: dur ? +dur[1] * 3600 + +dur[2] * 60 + parseFloat(dur[3]) : 0,
    formatName: (text.match(/Input #0, ([^,]+)/) || [])[1] || '',
    video: vLine
      ? { codec: vLine[1], width: size ? +size[1] : 0, height: size ? +size[2] : 0, fps: fps || tbr, isVFR: !!(fps && tbr && Math.abs(fps - tbr) / fps > 0.01), pixFmt: '' }
      : null,
    audios: Array.from(text.matchAll(/Stream #\S+.*?: Audio: (\w+)[^\n]*/g)).map((m: any) => ({
      codec: m[1],
      channels: /stereo/.test(m[0]) ? 2 : /mono/.test(m[0]) ? 1 : 6,
      sampleRate: parseInt((m[0].match(/(\d+) Hz/) || [])[1] || '0', 10),
    })),
  };
}

function nearestStandardFps(fps: number): number {
  if (!fps) return 25;
  return STANDARD_FPS.reduce((best, f) => (Math.abs(f - fps) < Math.abs(best - fps) ? f : best), STANDARD_FPS[0]);
}

/** Remux sans perte si la vidéo est déjà H.264/HEVC à cadence constante, sinon réencodage H.264/AAC en CFR */
export function planConversion(probe: MediaProbe, input: string, mode: VideoConversionMode): ConversionPlan {
  if (!probe.video) throw new Error('aucune piste vidéo');
  const ext = (input.split('.').pop() || '').toLowerCase();
  const v = probe.video;
  const reasons: string[] = [];
  const videoOk = REMUXABLE_VIDEO.includes(v.codec);
  if (!videoOk) reasons.push(`vidéo ${v.codec.toUpperCase()} non gérée par Premiere`);
  if (v.isVFR) reasons.push('fréquence d\'images variable');
  const copyAudio = probe.audios.every((a) => COPYABLE_AUDIO.includes(a.codec));
  const targetFps = nearestStandardFps(v.fps);

  let kind: ConversionPlan['kind'];
  if (mode === 'reencode') kind = 'reencode';
  else if (mode === 'remux') kind = 'remux';
  else kind = videoOk && !v.isVFR ? 'remux' : 'reencode';

  // Déjà un MP4/MOV lisible tel quel : rien à convertir, import direct
  if (mode === 'auto' && kind === 'remux' && copyAudio && ['mp4', 'mov', 'm4v'].includes(ext)) kind = 'none';
  return { kind, reasons, targetFps, copyAudio };
}

export function outputPathFor(input: string, suffix = ''): string {
  const fs = nodeRequire('fs');
  const pathMod = nodeRequire('path');
  const dir = pathMod.dirname(input);
  const base = pathMod.basename(input, pathMod.extname(input)) + suffix;
  let candidate = pathMod.join(dir, `${base}.mp4`);
  let n = 1;
  while (fs.existsSync(candidate) || candidate.toLowerCase() === input.toLowerCase()) {
    candidate = pathMod.join(dir, `${base}_premiere${n > 1 ? '-' + n : ''}.mp4`);
    n++;
  }
  return candidate;
}

export interface ProjectVideoItem {
  nodeId: string;
  name: string;
  path: string;
}

/** Clips vidéo du projet (hors séquences), tous chutiers confondus */
export async function listProjectVideoItems(): Promise<ProjectVideoItem[]> {
  const res: any = await evalExtendScript(`
    (function() {
      try {
        if (!app.project) return JSON.stringify({ success: false, error: "Aucun projet ouvert" });
        var exts = ${JSON.stringify(VIDEO_INPUT_EXTENSIONS)};
        var items = [];
        function walk(bin) {
          for (var i = 0; i < bin.children.numItems; i++) {
            var c = bin.children[i];
            if (c.type === ProjectItemType.BIN) { walk(c); continue; }
            if (c.type !== ProjectItemType.CLIP && c.type !== ProjectItemType.FILE) continue;
            var isSeq = false;
            try { isSeq = c.isSequence(); } catch (e) {}
            if (isSeq) continue;
            var p = "";
            try { p = c.getMediaPath(); } catch (e2) {}
            if (!p) continue;
            var dot = p.lastIndexOf(".");
            var ext = dot === -1 ? "" : p.substring(dot + 1).toLowerCase();
            for (var k = 0; k < exts.length; k++) {
              if (exts[k] === ext) { items.push({ nodeId: c.nodeId, name: c.name, path: p }); break; }
            }
          }
        }
        walk(app.project.rootItem);
        return JSON.stringify({ success: true, items: items });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `);
  if (!res?.success) throw new Error(res?.error || 'Lecture du projet impossible');
  return res.items;
}

/** Relie un clip du projet (retrouvé par nodeId) à un nouveau fichier et lui donne son nom */
export async function relinkProjectItemToFile(nodeId: string, newPath: string): Promise<{ success: boolean; name?: string; error?: string }> {
  return evalExtendScript(`
    (function() {
      try {
        var target = null;
        function walk(bin) {
          for (var i = 0; i < bin.children.numItems && !target; i++) {
            var c = bin.children[i];
            if (c.nodeId === ${JSON.stringify(nodeId)}) target = c;
            else if (c.type === ProjectItemType.BIN) walk(c);
          }
        }
        walk(app.project.rootItem);
        if (!target) return JSON.stringify({ success: false, error: "Clip introuvable dans le projet" });
        if (!target.canChangeMediaPath()) return JSON.stringify({ success: false, error: "Premiere refuse de relier ce clip" });
        target.changeMediaPath(${JSON.stringify(newPath)}, true);
        target.name = File.decode(new File(${JSON.stringify(newPath)}).name);
        return JSON.stringify({ success: true, name: target.name });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `);
}

export function buildFfmpegArgs(input: string, output: string, plan: ConversionPlan, probe: MediaProbe): string[] {
  const args = ['-hide_banner', '-y', ...inputArgs(input), '-map', '0:v:0', '-map', '0:a?', '-dn', '-sn'];
  if (plan.kind === 'remux') {
    args.push('-c:v', 'copy');
    if (probe.video?.codec === 'hevc') args.push('-tag:v', 'hvc1');
  } else {
    // H.264 8 bits 4:2:0, qualité visuellement sans perte, cadence constante forcée
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-vf', `fps=${plan.targetFps}`, '-fps_mode', 'cfr');
  }
  if (plan.kind === 'remux' && plan.copyAudio) {
    args.push('-c:a', 'copy');
    if (/mpegts|hls/.test(probe.formatName) && probe.audios.some((a) => a.codec === 'aac')) args.push('-bsf:a', 'aac_adtstoasc');
  } else {
    args.push('-c:a', 'aac', '-b:a', '320k', '-ar', '48000');
  }
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output);
  return args;
}

export interface RunningConversion {
  promise: Promise<void>;
  cancel: () => void;
}

/** Lance FFmpeg et remonte la progression (0..1) à partir de `-progress pipe:1` */
export function runFfmpegConversion(
  tools: FfmpegTools,
  args: string[],
  durationSec: number,
  onProgress: (ratio: number) => void
): RunningConversion {
  const cp = nodeRequire('child_process');
  const child = cp.spawn(tools.ffmpeg, args, { windowsHide: true });
  let canceled = false;
  let stderrTail = '';
  const promise = new Promise<void>((resolve, reject) => {
    let buffer = '';
    child.stdout.on('data', (d: any) => {
      buffer += d.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const m = line.match(/^out_time_(?:us|ms)=(\d+)/);
        if (m && durationSec > 0) onProgress(Math.min(1, parseInt(m[1], 10) / 1e6 / durationSec));
      }
    });
    child.stderr.on('data', (d: any) => {
      stderrTail = (stderrTail + d.toString()).slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code: number) => {
      if (canceled) reject(new Error('annulé'));
      else if (code === 0) resolve();
      else {
        const lastLines = stderrTail.trim().split(/\r?\n/).slice(-2).join(' ');
        reject(new Error(lastLines || `FFmpeg a échoué (code ${code})`));
      }
    });
  });
  return {
    promise,
    cancel: () => {
      canceled = true;
      try {
        child.kill();
      } catch {}
    },
  };
}

export function deleteFileQuietly(path: string) {
  try {
    const fs = nodeRequire('fs');
    if (fs.existsSync(path)) fs.unlinkSync(path);
  } catch {}
}

/** Importe un fichier dans le chutier actif du projet (celui sélectionné dans le panneau Projet) */
export async function importIntoActiveBin(filePath: string): Promise<{ success: boolean; binName?: string; error?: string }> {
  const script = `
    (function() {
      try {
        if (!app.project) return JSON.stringify({ success: false, error: "Aucun projet ouvert dans Premiere Pro" });
        var root = app.project.rootItem;
        var bin = null;
        try { bin = app.project.getInsertionBin(); } catch (e) {}
        if (!bin) bin = root;
        var isRoot = bin.nodeId === root.nodeId;
        var ok = app.project.importFiles([${JSON.stringify(filePath)}], true, bin, false);
        if (ok === false) return JSON.stringify({ success: false, error: "Import refusé par Premiere Pro" });
        // Premiere sélectionne le clip importé, ce qui change le chutier d'insertion :
        // on resélectionne le chutier pour que les imports suivants y aillent aussi
        if (!isRoot) { try { bin.select(); } catch (e2) {} }
        return JSON.stringify({ success: true, binName: isRoot ? "Racine du projet" : bin.name });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
      }
    })();
  `;
  return evalExtendScript(script);
}

/** Chemins locaux des fichiers glissés dans le panneau (File.path, sinon liste d'URI file://) */
export function pathsFromDrop(dt: DataTransfer): string[] {
  const out: string[] = [];
  const pathOf = (window as any).__moriPathForFile;
  for (const f of Array.from(dt.files || [])) {
    const p = (f as any).path || (typeof pathOf === 'function' ? pathOf(f) : '');
    if (p) out.push(p);
  }
  if (out.length === 0) {
    const uris = (dt.getData('text/uri-list') || '').split(/\r?\n/).filter((l) => l.startsWith('file:'));
    for (const u of uris) {
      let p = decodeURIComponent(u.replace(/^file:\/\//, ''));
      if (isWindowsPlatform()) p = p.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
      out.push(p);
    }
  }
  return out;
}

export function pickVideoFiles(): string[] {
  const cep = (window as any).cep;
  if (!cep?.fs?.showOpenDialogEx) return [];
  const res = cep.fs.showOpenDialogEx(true, false, 'Choisir des vidéos à convertir', '', VIDEO_INPUT_EXTENSIONS);
  return res.err === 0 && Array.isArray(res.data) ? res.data : [];
}


// ==================== utils/webDownloader.ts ====================
// Téléchargement de vidéos en ligne (YouTube…) avec yt-dlp, lancé par Node.js comme FFmpeg.

export type DownloadFormat = 'video' | 'wav';

export interface WavSpec {
  sampleRate: number;
  bitDepth: number;
}

/** Toutes les combinaisons proposées pour le WAV (32 bits = flottant) */
export const WAV_SPECS: WavSpec[] = [16, 24, 32].flatMap((bitDepth) =>
  [44100, 48000, 96000].map((sampleRate) => ({ sampleRate, bitDepth }))
);

export function wavSpecLabel(spec: WavSpec): string {
  const khz = (spec.sampleRate / 1000).toLocaleString('fr-FR');
  return `${spec.bitDepth} bits${spec.bitDepth === 32 ? ' float' : ''} · ${khz} kHz`;
}

function wavCodec(bitDepth: number): string {
  return bitDepth === 32 ? 'pcm_f32le' : bitDepth === 24 ? 'pcm_s24le' : 'pcm_s16le';
}

export interface OnlineMediaInfo {
  url: string;
  title: string;
  uploader: string;
  durationSec: number;
  thumbnail: string;
  heights: number[];
}

const YTDLP_PATH_STORAGE_KEY = 'cutflow.ytdlpPath';
const DOWNLOAD_DIR_STORAGE_KEY = 'cutflow.downloadDir';

export function getCustomYtdlpPath(): string {
  try {
    return localStorage.getItem(YTDLP_PATH_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setCustomYtdlpPath(path: string) {
  ytdlpCache = null;
  try {
    if (path) localStorage.setItem(YTDLP_PATH_STORAGE_KEY, path);
    else localStorage.removeItem(YTDLP_PATH_STORAGE_KEY);
  } catch {}
}

export function getCustomDownloadDir(): string {
  try {
    return localStorage.getItem(DOWNLOAD_DIR_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setCustomDownloadDir(dir: string) {
  try {
    if (dir) localStorage.setItem(DOWNLOAD_DIR_STORAGE_KEY, dir);
    else localStorage.removeItem(DOWNLOAD_DIR_STORAGE_KEY);
  } catch {}
}

/** Recherche yt-dlp : copie embarquée (bin/) > chemin choisi > installation système (PATH, winget, Homebrew) */
export function findYtdlp(): string | null {
  if (ytdlpCache) return ytdlpCache;
  ytdlpCache = searchYtdlp();
  return ytdlpCache;
}

function searchYtdlp(): string | null {
  const fs = nodeRequire('fs');
  const pathMod = nodeRequire('path');
  const cp = nodeRequire('child_process');
  if (!fs || !pathMod || !cp) return null;
  const win = isWindowsPlatform();
  const exe = win ? '.exe' : '';

  const embedded = pathMod.join(extensionRoot(), 'bin', win ? 'win' : 'mac', 'yt-dlp' + exe);
  if (fs.existsSync(embedded)) return embedded;
  const custom = getCustomYtdlpPath();
  if (custom && fs.existsSync(custom)) return custom;

  const candidates: string[] = whichAll('yt-dlp');
  const env = (window as any).cep_node?.process?.env || {};
  if (win && env.LOCALAPPDATA) candidates.push(pathMod.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'));
  if (!win) candidates.push('/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp');
  return candidates.find((c) => fs.existsSync(c)) || null;
}

/**
 * Deno installé par l'installeur dans bin/ : yt-dlp en a besoin pour résoudre les protections de YouTube.
 * Un Deno installé sur le système est trouvé tout seul par yt-dlp (PATH) : rien à passer dans ce cas.
 */
function bundledDenoArgs(): string[] {
  try {
    const fs = nodeRequire('fs');
    const pathMod = nodeRequire('path');
    const win = isWindowsPlatform();
    const deno = pathMod.join(extensionRoot(), 'bin', win ? 'win' : 'mac', win ? 'deno.exe' : 'deno');
    return fs.existsSync(deno) ? ['--js-runtimes', `deno:${deno}`] : [];
  } catch {
    return [];
  }
}

/** Métadonnées d'un lien (titre, durée, résolutions disponibles), sans rien télécharger */
export async function fetchOnlineMediaInfo(ytdlp: string, url: string): Promise<OnlineMediaInfo> {
  const res = await runProcess(ytdlp, ['-J', '--no-playlist', '--no-warnings', '--encoding', 'utf-8', ...bundledDenoArgs(), url]);
  if (res.code !== 0) {
    const last = res.stderr.trim().split(/\r?\n/).pop() || '';
    throw new Error(last.replace(/^ERROR:\s*/, '') || 'lien illisible');
  }
  const data = JSON.parse(res.stdout);
  const heights = Array.from(
    new Set<number>(
      (data.formats || [])
        .filter((f: any) => f.vcodec && f.vcodec !== 'none' && f.height)
        .map((f: any) => f.height as number)
    )
  ).sort((a, b) => b - a);
  return {
    url: data.webpage_url || url,
    title: data.title || url,
    uploader: data.uploader || data.channel || '',
    durationSec: data.duration || 0,
    thumbnail: data.thumbnail || '',
    heights,
  };
}

export interface YoutubeSearchResult {
  id: string;
  url: string;
  title: string;
  channel: string;
  durationSec: number; // 0 : direct ou durée inconnue
  views: number;
  thumbnail: string;
  live: boolean;
}

/** Recherche YouTube (yt-dlp « ytsearchN: »), sans télécharger : titres, chaînes, durées, miniatures */
export async function searchYoutube(ytdlp: string, query: string, count: number): Promise<YoutubeSearchResult[]> {
  const n = Math.max(1, Math.min(50, Math.round(count) || 10));
  const res = await runProcess(ytdlp, ['-J', '--flat-playlist', '--no-warnings', '--encoding', 'utf-8', ...bundledDenoArgs(), `ytsearch${n}:${query}`]);
  if (res.code !== 0) {
    const last = res.stderr.trim().split(/\r?\n/).pop() || '';
    throw new Error(last.replace(/^ERROR:\s*/, '') || 'recherche impossible');
  }
  const data = JSON.parse(res.stdout);
  return (data.entries || [])
    .filter((e: any) => e && e.id)
    .map((e: any) => ({
      id: String(e.id),
      url: e.url && /^https?:/.test(e.url) ? e.url : `https://www.youtube.com/watch?v=${e.id}`,
      title: e.title || e.id,
      channel: e.channel || e.uploader || '',
      durationSec: e.duration || 0,
      views: e.view_count || 0,
      thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
      live: e.live_status === 'is_live' || (!e.duration && /live|direct|radio/i.test(e.title || '')),
    }));
}

/**
 * Flux d'aperçu (360p max) lus directement par le panneau : le lecteur YouTube intégré refuse les pages sans
 * adresse web (erreur 153). YouTube sépare presque toujours image et son : deux adresses, parfois une seule.
 */
export async function fetchPreviewStreams(ytdlp: string, url: string): Promise<{ video: string; audio?: string }> {
  const res = await runProcess(ytdlp, [
    '-g', '--no-playlist', '--no-warnings', ...bundledDenoArgs(),
    '-f', 'bv*[height<=360][ext=mp4]+ba[ext=m4a]/bv*[height<=360]+ba/b[height<=480]/b',
    url,
  ]);
  const lines = res.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https?:/.test(l));
  if (res.code !== 0 || lines.length === 0) {
    const last = res.stderr.trim().split(/\r?\n/).pop() || '';
    throw new Error(last.replace(/^ERROR:\s*/, '') || 'aperçu indisponible');
  }
  return { video: lines[0], audio: lines[1] };
}

/**
 * Le navigateur intégré de Premiere oublie parfois de rafraîchir à l'écran une partie des zones qui changent
 * seules (vidéo, canvas) : moitié de forme d'onde, image figée, repères absents jusqu'au prochain défilement.
 * Tant qu'un aperçu ou l'éditeur de trim est affiché, une couche transparente plein écran change de teinte
 * (imperceptiblement) 4 fois par seconde : tout le panneau est alors redessiné.
 */
let repaintUsers = 0;
let repaintTimer: any = null;
let repaintLayer: HTMLDivElement | null = null;
function useRepaintGuard() {
  useEffect(() => {
    if (!isRunningInPremiere()) return;
    repaintUsers++;
    if (!repaintLayer) {
      repaintLayer = document.createElement('div');
      repaintLayer.setAttribute('aria-hidden', 'true');
      repaintLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;background:rgba(0,0,0,0.002)';
      document.body.appendChild(repaintLayer);
    }
    if (!repaintTimer) {
      let flip = false;
      repaintTimer = setInterval(() => {
        flip = !flip;
        if (repaintLayer) repaintLayer.style.background = flip ? 'rgba(0,0,0,0.003)' : 'rgba(0,0,0,0.002)';
      }, 250);
    }
    return () => {
      repaintUsers--;
      if (repaintUsers <= 0) {
        repaintUsers = 0;
        clearInterval(repaintTimer);
        repaintTimer = null;
        repaintLayer?.remove();
        repaintLayer = null;
      }
    };
  }, []);
}

/** Aperçu d'une vidéo YouTube : image + son séparés, le son suit la vidéo (lecture, pause, déplacement, volume) */
const YoutubePreview: React.FC<{
  ytdlp: string;
  url: string;
  onClose: () => void;
  onTime?: (seconds: number) => void;
  autoPlay?: boolean;
  /** élément vidéo exposé (éditeur de trim : déplacement, lecture de la sélection) */
  handle?: React.MutableRefObject<HTMLVideoElement | null>;
}> = ({ ytdlp, url, onClose, onTime, autoPlay = true, handle }) => {
  const [streams, setStreams] = useState<{ video: string; audio?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useRepaintGuard();
  useEffect(() => {
    if (!handle) return;
    handle.current = streams && !error ? videoRef.current : null;
    return () => {
      handle.current = null;
    };
  }, [streams, error, handle]);

  useEffect(() => {
    let alive = true;
    fetchPreviewStreams(ytdlp, url)
      .then((s) => alive && setStreams(s))
      .catch((err) => alive && setError(err?.message || String(err)));
    return () => {
      alive = false;
    };
  }, [ytdlp, url]);

  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !streams) return;
    if (autoPlay) v.play().catch(() => {});
    if (!a) return;
    const sync = (force = false) => {
      if (force || Math.abs(a.currentTime - v.currentTime) > 0.25) a.currentTime = v.currentTime;
    };
    const onPlay = () => {
      sync(true);
      a.play().catch(() => {});
    };
    const onPause = () => a.pause();
    const onSeek = () => sync(true);
    const onVolume = () => {
      a.volume = v.volume;
      a.muted = v.muted;
    };
    const onRate = () => (a.playbackRate = v.playbackRate);
    const onWaiting = () => a.pause();
    const events: [string, () => void][] = [
      ['play', onPlay], ['playing', onPlay], ['pause', onPause], ['seeked', onSeek], ['seeking', onSeek],
      ['volumechange', onVolume], ['ratechange', onRate], ['waiting', onWaiting],
    ];
    events.forEach(([e, f]) => v.addEventListener(e, f));
    const timer = setInterval(() => !v.paused && sync(), 500);
    return () => {
      events.forEach(([e, f]) => v.removeEventListener(e, f));
      clearInterval(timer);
      a.pause();
    };
  }, [streams]);

  const openInBrowser = () => {
    const cep = (window as any).cep;
    if (cep?.util?.openURLInDefaultBrowser) cep.util.openURLInDefaultBrowser(url);
    else window.open(url, '_blank');
  };

  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black aspect-video">
      {streams && !error ? (
        <>
          <video
            ref={videoRef}
            src={streams.video}
            controls
            playsInline
            className="w-full h-full"
            onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime)}
            onSeeked={(e) => onTime?.(e.currentTarget.currentTime)}
            onError={() => setError('lecture impossible dans le panneau')}
          />
          {streams.audio && <audio ref={audioRef} src={streams.audio} preload="auto" />}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          {error ? (
            <>
              <span className="text-[11px] text-red-300">Aperçu indisponible : {error}</span>
              <button onClick={openInBrowser} className="text-[11px] text-emerald-300 underline cursor-pointer">
                Ouvrir sur YouTube
              </button>
            </>
          ) : (
            <StatusMessage busy message="Chargement de l'aperçu…" />
          )}
        </div>
      )}
      <button
        onClick={onClose}
        className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 text-zinc-200 hover:text-white cursor-pointer"
        title="Fermer l'aperçu"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ---------- Forme d'onde pour le trim ----------

const WAVE_PEAKS_PER_SEC = 20; // une crête toutes les 50 ms (précision suffisante même zoomé)
const WAVE_SAMPLE_RATE = 4000;
const waveformCache = new Map<string, Float32Array>();

/**
 * Forme d'onde d'une vidéo en ligne : l'audio le plus léger est téléchargé par yt-dlp (requêtes découpées,
 * bien plus rapide qu'une lecture directe du flux que YouTube bride), puis décodé par FFmpeg en crêtes,
 * transmises au fur et à mesure. Le fichier audio temporaire est supprimé ensuite.
 */
export function loadWaveform(
  ytdlp: string,
  ffmpeg: string,
  url: string,
  duration: number,
  onUpdate: (peaks: Float32Array, stage: 'download' | 'decode' | 'done', ratio: number) => void,
  onError: (message: string) => void
): { cancel: () => void } {
  const cached = waveformCache.get(url);
  if (cached) {
    onUpdate(cached, 'done', 1);
    return { cancel: () => {} };
  }
  const fs = nodeRequire('fs');
  const os = nodeRequire('os');
  const pathMod = nodeRequire('path');
  const cp = nodeRequire('child_process');
  const dir = pathMod.join(os.tmpdir(), 'mori-waveform');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  let canceled = false;
  let file = '';
  let decoder: any = null;
  const run = runYtdlp(
    ytdlp,
    [
      '-f', 'wa[acodec!=none]/ba', '-N', '8', '--no-playlist', '--no-warnings', '--quiet', '--progress', '--newline', '--encoding', 'utf-8',
      '-P', dir, '-o', `%(id)s-wave-${Date.now()}.%(ext)s`, '--print', 'after_move:MORI_FILE:%(filepath)s',
      ...bundledDenoArgs(), '--ffmpeg-location', pathMod.dirname(ffmpeg), url,
    ],
    (ratio) => !canceled && onUpdate(new Float32Array(0), 'download', ratio)
  );
  run.promise
    .then((path) => {
      file = path;
      if (canceled) return deleteFileQuietly(file);
      const perPeak = WAVE_SAMPLE_RATE / WAVE_PEAKS_PER_SEC;
      let peaks = new Float32Array(Math.ceil((duration || 60) * WAVE_PEAKS_PER_SEC) + WAVE_PEAKS_PER_SEC);
      let count = 0;
      let inPeak = 0;
      let cur = 0;
      let carry: any = null;
      let lastEmit = 0;
      decoder = cp.spawn(ffmpeg, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-af', `aresample=${WAVE_SAMPLE_RATE}`, '-f', 's16le', 'pipe:1'], {
        windowsHide: true,
        env: toolEnv(),
      });
      const B = (window as any).cep_node?.Buffer;
      decoder.stdout.on('data', (chunk: any) => {
        if (carry) {
          chunk = B.concat([carry, chunk]);
          carry = null;
        }
        const n = chunk.length >> 1;
        if (chunk.length & 1) carry = chunk.subarray(chunk.length - 1);
        for (let i = 0; i < n; i++) {
          const v = chunk.readInt16LE(i * 2);
          const a = v < 0 ? -v : v;
          if (a > cur) cur = a;
          if (++inPeak === perPeak) {
            if (count >= peaks.length) {
              const bigger = new Float32Array(peaks.length * 2);
              bigger.set(peaks);
              peaks = bigger;
            }
            peaks[count++] = cur / 32768;
            cur = 0;
            inPeak = 0;
          }
        }
        const now = Date.now();
        if (now - lastEmit > 250) {
          lastEmit = now;
          onUpdate(peaks.subarray(0, count), 'decode', duration ? Math.min(1, count / WAVE_PEAKS_PER_SEC / duration) : 0);
        }
      });
      decoder.on('close', (code: number) => {
        deleteFileQuietly(file);
        if (canceled) return;
        if (code !== 0 && count === 0) return onError('décodage audio impossible');
        const final = peaks.slice(0, count);
        waveformCache.set(url, final);
        onUpdate(final, 'done', 1);
      });
      decoder.on('error', () => !canceled && onError('FFmpeg introuvable'));
    })
    .catch((err: any) => {
      if (!canceled) onError(err?.message || String(err));
    });
  return {
    cancel: () => {
      canceled = true;
      run.cancel();
      try {
        decoder?.kill();
      } catch {}
      if (file) deleteFileQuietly(file);
    },
  };
}

/** Couleur d'une variable du thème (« 169 191 255 ») avec opacité, pour le canvas */
function themeColor(name: string, alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '255 255 255';
  return alpha >= 1 ? `rgb(${v})` : `rgb(${v} / ${alpha})`;
}

/**
 * Éditeur de trim façon montage : aperçu, forme d'onde de toute la vidéo, points d'entrée / sortie à glisser,
 * tête de lecture. Clic = se placer, molette = zoom, Maj+molette = défiler, I / O = points, Espace = lecture.
 */
const TrimEditor: React.FC<{
  ytdlp: string;
  ffmpeg: string | null;
  url: string;
  duration: number;
  start: number | null;
  end: number | null;
  onChange: (start: number, end: number) => void;
  onClose: () => void;
}> = ({ ytdlp, ffmpeg, url, duration, start, end, onChange, onClose }) => {
  const inT = Math.max(0, Math.min(start ?? 0, duration));
  const outT = Math.max(inT, Math.min(end ?? duration, duration));
  const videoHandle = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [wave, setWave] = useState<{ stage: 'download' | 'decode' | 'done'; ratio: number } | null>(null);
  const [waveError, setWaveError] = useState<string | null>(null);
  const [view, setView] = useState<{ v0: number; v1: number }>({ v0: 0, v1: duration });
  const [playhead, setPlayhead] = useState(0);
  const [width, setWidth] = useState(0);
  const selectionPlayRef = useRef(false);
  const dragRef = useRef<'in' | 'out' | 'seek' | null>(null);
  const latest = useRef({ inT, outT, view, playhead, duration, onChange });
  latest.current = { inT, outT, view, playhead, duration, onChange };
  useRepaintGuard();

  // forme d'onde
  useEffect(() => {
    setPeaks(null);
    setWave(null);
    setWaveError(null);
    if (!ffmpeg) {
      setWaveError('FFmpeg introuvable : forme d’onde indisponible');
      return;
    }
    const job = loadWaveform(
      ytdlp,
      ffmpeg,
      url,
      duration,
      (p, stage, ratio) => {
        if (p.length) setPeaks(p);
        setWave({ stage, ratio });
      },
      (msg) => setWaveError(msg)
    );
    return () => job.cancel();
  }, [ytdlp, ffmpeg, url, duration]);

  // tête de lecture (et arrêt en fin de sélection quand on lit la sélection)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoHandle.current;
      if (v) {
        const t = v.currentTime;
        if (selectionPlayRef.current && !v.paused && t >= latest.current.outT) {
          v.pause();
          selectionPlayRef.current = false;
        }
        if (Math.abs(t - latest.current.playhead) > 0.02) setPlayhead(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // largeur du canvas
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // dessin de la forme d'onde
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    const H = 64;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, H);
    const span = Math.max(0.001, view.v1 - view.v0);
    const xOf = (t: number) => ((t - view.v0) / span) * width;
    const inX = xOf(inT), outX = xOf(outT);
    ctx.fillStyle = themeColor('--accent-400', 0.1);
    ctx.fillRect(Math.max(0, inX), 0, Math.min(width, outX) - Math.max(0, inX), H);
    ctx.fillStyle = themeColor('--zinc-800');
    ctx.fillRect(0, H / 2 - 0.5, width, 1);
    if (peaks && peaks.length) {
      let max = 0.05;
      for (let i = 0; i < peaks.length; i++) if (peaks[i] > max) max = peaks[i];
      const inside = themeColor('--accent-300');
      const outside = themeColor('--zinc-600');
      const pps = WAVE_PEAKS_PER_SEC;
      for (let x = 0; x < width; x++) {
        const t0 = view.v0 + (x / width) * span;
        const t1 = view.v0 + ((x + 1) / width) * span;
        const i0 = Math.floor(t0 * pps);
        if (i0 >= peaks.length) break;
        const i1 = Math.min(peaks.length, Math.max(i0 + 1, Math.ceil(t1 * pps)));
        let m = 0;
        for (let i = i0; i < i1; i++) if (peaks[i] > m) m = peaks[i];
        const h = Math.max(0.5, (m / max) * (H / 2 - 3));
        ctx.fillStyle = x >= inX && x <= outX ? inside : outside;
        ctx.fillRect(x, H / 2 - h, 1, h * 2);
      }
    }
  }, [peaks, view, inT, outT, width]);

  const clampView = (v0: number, v1: number) => {
    const d = latest.current.duration;
    const span = Math.min(d, Math.max(Math.min(2, d), v1 - v0));
    let a = v0;
    if (a < 0) a = 0;
    if (a + span > d) a = d - span;
    return { v0: a, v1: a + span };
  };

  const seek = (t: number) => {
    const v = videoHandle.current;
    const d = latest.current.duration;
    const clamped = Math.max(0, Math.min(d, t));
    setPlayhead(clamped);
    if (v) v.currentTime = clamped;
  };
  const setIn = (t: number) => latest.current.onChange(Math.max(0, Math.min(t, latest.current.outT - 0.1)), latest.current.outT);
  const setOut = (t: number) => latest.current.onChange(latest.current.inT, Math.min(latest.current.duration, Math.max(t, latest.current.inT + 0.1)));
  const playSelection = () => {
    const v = videoHandle.current;
    if (!v) return;
    v.currentTime = latest.current.inT;
    selectionPlayRef.current = true;
    v.play().catch(() => {});
  };
  const togglePlay = () => {
    const v = videoHandle.current;
    if (!v) return;
    selectionPlayRef.current = false;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  // molette : zoom autour de la souris, Maj (ou défilement horizontal) : se déplacer
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: vw } = latest.current;
      const span = vw.v1 - vw.v0;
      const rect = el.getBoundingClientRect();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const delta = ((e.shiftKey ? e.deltaY : e.deltaX) / rect.width) * span;
        setView(clampView(vw.v0 + delta, vw.v1 + delta));
        return;
      }
      const t = vw.v0 + ((e.clientX - rect.left) / rect.width) * span;
      const next = span * (e.deltaY > 0 ? 1.25 : 0.8);
      setView(clampView(t - ((t - vw.v0) * next) / span, t + ((vw.v1 - t) * next) / span));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // clavier : I / O / Espace / flèches (hors champs de saisie)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'i') setIn(latest.current.playhead);
      else if (k === 'o') setOut(latest.current.playhead);
      else if (k === ' ') togglePlay();
      else if (k === 'arrowleft') seek(latest.current.playhead - (e.shiftKey ? 0.1 : 1));
      else if (k === 'arrowright') seek(latest.current.playhead + (e.shiftKey ? 0.1 : 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const timeAt = (clientX: number) => {
    const rect = areaRef.current!.getBoundingClientRect();
    const { view: vw } = latest.current;
    return vw.v0 + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (vw.v1 - vw.v0);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    const rect = areaRef.current!.getBoundingClientRect();
    const span = view.v1 - view.v0;
    const px = (t: number) => ((t - view.v0) / span) * rect.width + rect.left;
    if (Math.abs(e.clientX - px(inT)) <= 7) dragRef.current = 'in';
    else if (Math.abs(e.clientX - px(outT)) <= 7) dragRef.current = 'out';
    else {
      dragRef.current = 'seek';
      seek(timeAt(e.clientX));
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const mode = dragRef.current;
    if (!mode) {
      const rect = areaRef.current!.getBoundingClientRect();
      const span = view.v1 - view.v0;
      const near = [inT, outT].some((t) => Math.abs(e.clientX - (((t - view.v0) / span) * rect.width + rect.left)) <= 7);
      (e.currentTarget as HTMLElement).style.cursor = near ? 'ew-resize' : 'pointer';
      return;
    }
    const t = timeAt(e.clientX);
    if (mode === 'in') setIn(t);
    else if (mode === 'out') setOut(t);
    else seek(t);
  };
  const onPointerUp = () => (dragRef.current = null);

  const span = view.v1 - view.v0;
  const pct = (t: number) => `${((t - view.v0) / span) * 100}%`;
  const visible = (t: number) => t >= view.v0 && t <= view.v1;
  const zoomed = span < duration - 0.01;
  const iconBtn =
    'flex items-center gap-1 px-2 py-1 rounded-full border border-white/15 text-[10px] font-semibold text-zinc-200 hover:text-cream-300 hover:border-cream-300/60 transition cursor-pointer';

  return (
    <div className="space-y-2">
      <YoutubePreview ytdlp={ytdlp} url={url} onClose={onClose} autoPlay={false} handle={videoHandle} />

      {/* vue d'ensemble quand on est zoomé : fenêtre visible et sélection */}
      {zoomed && (
        <div className="relative h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div className="absolute inset-y-0 bg-emerald-400/40" style={{ left: `${(inT / duration) * 100}%`, width: `${((outT - inT) / duration) * 100}%` }} />
          <div
            className="absolute inset-y-0 border border-cream-300/80 rounded-full"
            style={{ left: `${(view.v0 / duration) * 100}%`, width: `${Math.max(1, (span / duration) * 100)}%` }}
          />
        </div>
      )}

      <div
        ref={areaRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-16 rounded-lg bg-zinc-950 border border-white/10 overflow-hidden select-none touch-none"
        title="Clic : se placer · glisser IN / OUT · molette : zoom · Maj+molette : défiler"
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {!peaks && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500 pointer-events-none">
            {waveError
              ? waveError
              : wave?.stage === 'download'
              ? `Forme d'onde : audio ${Math.round((wave.ratio || 0) * 100)} %`
              : 'Chargement de la forme d’onde…'}
          </div>
        )}
        {peaks && wave && wave.stage !== 'done' && (
          <div className="absolute top-0.5 right-1.5 text-[9px] text-zinc-500 pointer-events-none">{Math.round(wave.ratio * 100)} %</div>
        )}
        {visible(inT) && (
          <div className="absolute inset-y-0 w-0.5 -ml-px bg-emerald-300 pointer-events-none" style={{ left: pct(inT) }}>
            <span className="absolute top-0 left-0.5 px-1 rounded-sm bg-emerald-300 text-ink text-[8px] font-extrabold leading-3">IN</span>
          </div>
        )}
        {visible(outT) && (
          <div className="absolute inset-y-0 w-0.5 -ml-px bg-emerald-300 pointer-events-none" style={{ left: pct(outT) }}>
            <span className="absolute bottom-0 right-0.5 px-1 rounded-sm bg-emerald-300 text-ink text-[8px] font-extrabold leading-3">OUT</span>
          </div>
        )}
        {visible(playhead) && <div className="absolute inset-y-0 w-px bg-cream-300 pointer-events-none" style={{ left: pct(playhead) }} />}
      </div>

      <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 -mt-1">
        <span>{formatClock(view.v0)}</span>
        <span className="text-cream-300">{formatClock(playhead)}</span>
        <span>{formatClock(view.v1)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setIn(playhead)} className={iconBtn} title="Point d'entrée à la tête de lecture (I)">
          [ IN
        </button>
        <button onClick={() => setOut(playhead)} className={iconBtn} title="Point de sortie à la tête de lecture (O)">
          OUT ]
        </button>
        <button onClick={playSelection} className={iconBtn} title="Lire de IN à OUT">
          <Play className="w-3 h-3" />
          Sélection
        </button>
        <button
          onClick={() => {
            const pad = Math.max(1, (outT - inT) * 0.08);
            setView(clampView(inT - pad, outT + pad));
          }}
          className={iconBtn}
          title="Zoomer sur la sélection"
        >
          <Maximize2 className="w-3 h-3" />
          Zoom
        </button>
        {zoomed && (
          <button onClick={() => setView({ v0: 0, v1: duration })} className={iconBtn} title="Voir toute la vidéo">
            <Minimize2 className="w-3 h-3" />
            Tout
          </button>
        )}
        <span className="ml-auto text-[9px] text-zinc-500">I / O · Espace · ← →</span>
      </div>
    </div>
  );
};

/** 57648743 -> « 57,6 M de vues » */
export function formatViews(n: number): string {
  if (!n) return '';
  const f = (v: number) => v.toFixed(v < 10 ? 1 : 0).replace('.', ',').replace(/,0$/, '');
  if (n >= 1e9) return `${f(n / 1e9)} Md de vues`;
  if (n >= 1e6) return `${f(n / 1e6)} M de vues`;
  if (n >= 1e3) return `${f(n / 1e3)} k vues`;
  return `${n} vues`;
}

/** Dossier de téléchargement : choisi par l'utilisateur, sinon « YouTube » à côté du projet, sinon Téléchargements */
export async function resolveDownloadDir(): Promise<string> {
  const custom = getCustomDownloadDir();
  if (custom) return custom;
  const pathMod = nodeRequire('path');
  let projectPath = '';
  if (isRunningInPremiere()) {
    const res: any = await evalExtendScript('JSON.stringify({ success: true, path: app.project ? app.project.path : "" })');
    projectPath = String(res?.path || '');
  }
  if (projectPath && /\.prproj$/i.test(projectPath)) return pathMod.join(pathMod.dirname(projectPath), 'YouTube');
  const env = (window as any).cep_node?.process?.env || {};
  return pathMod.join(env.USERPROFILE || env.HOME || '.', 'Downloads');
}

/** 83.5 -> « 01m23s » (h si besoin), pour un nom de fichier */
function clockForFilename(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${h ? `${h}h` : ''}${two(m)}m${two(r)}s`;
}

/** « 1:02:03 », « 02:03 », « 83 », « 1:23,5 » -> secondes ; null si illisible */
export function parseClock(text: string): number | null {
  const t = String(text || '').trim().replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d+)?$|^\d+:\d{1,2}(\.\d+)?$|^\d+:\d{1,2}:\d{1,2}(\.\d+)?$/.test(t)) return null;
  const parts = t.split(':').map(parseFloat);
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec;
}

/** 83.5 -> « 1:23.5 » (ou « 1:01:23 ») pour les champs de début/fin */
export function formatClock(sec: number): string {
  const tenths = Math.round(Math.max(0, sec) * 10);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  const h = Math.floor(whole / 3600), m = Math.floor((whole % 3600) / 60), s = whole % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  const base = h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  return frac ? `${base}.${frac}` : base;
}

export function buildYtdlpArgs(
  url: string,
  format: DownloadFormat,
  maxHeight: number,
  outputDir: string,
  ffmpegPath: string | null,
  wav: WavSpec = { sampleRate: 48000, bitDepth: 24 },
  section?: { start: number; end: number }
): string[] {
  const pathMod = nodeRequire('path');
  // extrait : le passage choisi figure dans le nom (« 01m00s-01m10s »), pour ne pas écraser la vidéo entière
  const sectionLabel = section ? ` ${clockForFilename(section.start)}-${clockForFilename(section.end)}` : '';
  const args = [
    '--no-playlist', '--no-warnings', '--quiet', '--progress', '--newline', '--windows-filenames', '--encoding', 'utf-8',
    '-P', outputDir,
    '-o', `%(title).120B [%(id)s]${sectionLabel}.%(ext)s`,
    '--print', 'after_move:MORI_FILE:%(filepath)s',
    ...bundledDenoArgs(),
  ];
  if (ffmpegPath) args.push('--ffmpeg-location', pathMod.dirname(ffmpegPath));
  // seulement le passage choisi, coupé à l'image près (réencodé autour des points de coupe)
  if (section) args.push('--download-sections', `*${section.start.toFixed(3)}-${section.end.toFixed(3)}`, '--force-keyframes-at-cuts');
  if (format === 'video') {
    const h = maxHeight > 0 ? `[height<=${maxHeight}]` : '';
    // H.264 + AAC en priorité (lisibles directement par Premiere), sinon meilleure qualité disponible
    args.push('-f', `bv*${h}[vcodec^=avc1]+ba[acodec^=mp4a]/bv*${h}+ba/b${h}/b`, '--merge-output-format', 'mp4');
  } else if (format === 'wav') {
    args.push('-f', 'ba/b', '-x', '--audio-format', 'wav', '--postprocessor-args', `ExtractAudio:-ar ${wav.sampleRate} -c:a ${wavCodec(wav.bitDepth)}`);
  }
  args.push(url);
  return args;
}

export interface RunningDownload {
  promise: Promise<string>;
  cancel: () => void;
}

/** Lance yt-dlp ; progression 0..1 par étape (vidéo puis audio), résout avec le chemin du fichier final */
export function runYtdlp(ytdlp: string, args: string[], onProgress: (ratio: number, step: number) => void): RunningDownload {
  const cp = nodeRequire('child_process');
  const child = cp.spawn(ytdlp, args, { windowsHide: true, env: toolEnv() });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let canceled = false;
  let finalPath = '';
  let stderrTail = '';
  let step = 1;
  let lastRatio = 0;
  const handleLine = (line: string) => {
    if (line.startsWith('MORI_FILE:')) {
      finalPath = line.slice('MORI_FILE:'.length).trim();
      return;
    }
    const m = line.match(/\[download\]\s+([\d.]+)%/);
    if (m) {
      const ratio = parseFloat(m[1]) / 100;
      if (ratio < lastRatio - 0.5) step++; // nouveau flux (l'audio après la vidéo)
      lastRatio = ratio;
      onProgress(ratio, step);
    }
  };
  // la progression peut sortir sur stdout ou stderr selon le mode silencieux : on lit les deux
  const lineReader = (onChunkText?: (text: string) => void) => {
    let buffer = '';
    return (d: any) => {
      const text = d.toString();
      onChunkText?.(text);
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      lines.forEach(handleLine);
    };
  };
  const promise = new Promise<string>((resolve, reject) => {
    child.stdout.on('data', lineReader());
    child.stderr.on('data', lineReader((text) => {
      stderrTail = (stderrTail + text).slice(-4000);
    }));
    child.on('error', reject);
    child.on('close', (code: number) => {
      if (canceled) reject(new Error('annulé'));
      else if (code === 0 && finalPath) resolve(finalPath);
      else {
        const lines = stderrTail.trim().split(/\r?\n/).filter((l) => !/\[download\]/.test(l));
        const last = lines.filter((l) => /^ERROR/.test(l)).pop() || lines.pop() || '';
        reject(new Error(last.replace(/^ERROR:\s*/, '') || `yt-dlp a échoué (code ${code})`));
      }
    });
  });
  return {
    promise,
    cancel: () => {
      canceled = true;
      try {
        child.kill();
      } catch {}
    },
  };
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}


// ==================== utils/appearance.ts ====================

export interface ThemeColors {
  /** Fond du panneau : les neutres (cartes, bordures, textes secondaires) en sont dérivés */
  background: string;
  /** Accent : états actifs, liens, barres de progression */
  accent: string;
  /** Principal : boutons principaux, titres, onglet actif */
  primary: string;
}

export interface ThemePreset extends ThemeColors {
  id: string;
  name: string;
  brandColor: string;
  builtIn?: boolean;
}

export interface AppearanceSettings {
  theme: ThemeColors;
  brandLabel: string;
  brandColor: string;
  visibleTabs: ActiveTab[];
  /** Onglets existants lors du dernier enregistrement : ceux ajoutés depuis sont affichés par défaut */
  knownTabs?: ActiveTab[];
  userPresets: ThemePreset[];
}

export const ALL_TABS: ActiveTab[] = ['audio', 'video', 'binning', 'markers', 'download', 'checker'];

export const BUILTIN_THEME_PRESETS: ThemePreset[] = [
  { id: 'defaut', name: 'Défaut', background: '#0c1322', accent: '#8ea8f7', primary: '#fbe6a6', brandColor: '#a9bfff', builtIn: true },
];

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: { background: '#0c1322', accent: '#8ea8f7', primary: '#fbe6a6' },
  brandLabel: 'Studio',
  brandColor: '#a9bfff',
  visibleTabs: [...ALL_TABS],
  userPresets: [],
};

const APPEARANCE_STORAGE_KEY = 'cutflow.appearance';

/** '#abc', 'abc', '#AABBCC' -> '#aabbcc' ; null si invalide */
export function normalizeHex(value: string): string | null {
  let v = value.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) v = v.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(v) ? `#${v}` : null;
}

/**
 * Code couleur trouvé dans un texte tapé ou collé : « #E50914 », « E50914 », « rgb(229, 9, 20) », « 229, 9, 20 »,
 * ou un code au milieu d'une phrase (« Fond : #141414 ») -> '#e50914' ; null si aucun
 */
export function colorFromText(value: string): string | null {
  const direct = normalizeHex(value);
  if (direct) return direct;
  const rgb = value.match(/(\d{1,3})\s*[,;\s]\s*(\d{1,3})\s*[,;\s]\s*(\d{1,3})/);
  if (rgb && rgb.slice(1).every((n) => +n <= 255)) {
    return `#${rgb.slice(1).map((n) => (+n).toString(16).padStart(2, '0')).join('')}`;
  }
  const hex = value.match(/#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i) || value.match(/(?:^|[^0-9a-z])([0-9a-f]{6})(?![0-9a-z])/i);
  return hex ? normalizeHex(hex[1]) : null;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = (normalizeHex(hex) || '#000000').slice(1);
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Calcule les nuances (zinc / accent / cream / ink) et les pose en variables CSS lues par Tailwind */
export function applyTheme(theme: ThemeColors) {
  const root = document.documentElement.style;
  const set = (name: string, rgb: [number, number, number]) => root.setProperty(`--${name}`, rgb.join(' '));
  const bg = hexToRgb(theme.background);
  const isLight = luminance(bg) > 0.55;
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  // neutres : du fond vers un blanc cassé (thème sombre) ou vers le noir (thème clair)
  const towards: [number, number, number] = isLight ? [16, 16, 20] : [247, 245, 239];
  const neutralSteps: Record<number, number> = { 950: 0.03, 900: 0.07, 800: 0.13, 700: 0.22, 600: 0.33, 500: 0.45, 400: 0.58, 300: 0.72, 200: 0.85, 100: 0.92, 50: 0.96 };
  set('ink', bg);
  for (const [shade, t] of Object.entries(neutralSteps)) set(`zinc-${shade}`, mix(bg, towards, t));

  const accent = hexToRgb(theme.accent);
  const accentSteps: Record<number, [[number, number, number], number]> = {
    50: [white, 0.88], 100: [white, 0.76], 200: [white, 0.55], 300: [white, 0.3], 400: [accent, 0],
    500: [bg, 0.15], 600: [bg, 0.3], 700: [bg, 0.45], 800: [bg, 0.6], 900: [bg, 0.72], 950: [bg, 0.84],
  };
  for (const [shade, [target, t]] of Object.entries(accentSteps)) set(`accent-${shade}`, mix(accent, target, t));

  const primary = hexToRgb(theme.primary);
  const primarySteps: Record<number, [[number, number, number], number]> = {
    100: [white, 0.6], 200: [white, 0.3], 300: [primary, 0], 400: [black, 0.08], 500: [black, 0.18],
  };
  for (const [shade, [target, t]] of Object.entries(primarySteps)) set(`cream-${shade}`, mix(primary, target, t));
}

/**
 * Apparence partagée avec Ongaku et Sori (vendor/suite-theme.js) : thème, nom affiché, couleur du nom et
 * presets sont lus / écrits dans %APPDATA%\MoriSuite\appearance.json. Les onglets restent propres à Mori.
 */
type SharedAppearance = Pick<AppearanceSettings, 'theme' | 'brandLabel' | 'brandColor' | 'userPresets'>;
interface SuiteThemeApi {
  read: () => SharedAppearance | null;
  write: (a: AppearanceSettings, source: string) => boolean;
  watch: (fn: (s: SharedAppearance) => void) => () => void;
}
export function suiteTheme(): SuiteThemeApi | null {
  return ((window as any).SuiteTheme as SuiteThemeApi) || null;
}

function withSharedAppearance(a: AppearanceSettings): AppearanceSettings {
  try {
    const shared = suiteTheme()?.read();
    if (shared) return { ...a, ...shared };
  } catch {}
  return a;
}

export function loadAppearance(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const known: string[] = Array.isArray(saved.knownTabs) ? saved.knownTabs : ['audio', 'video', 'binning', 'markers'];
      const visible = Array.isArray(saved.visibleTabs)
        ? ALL_TABS.filter((t) => saved.visibleTabs.includes(t) || !known.includes(t))
        : [];
      return withSharedAppearance({
        ...DEFAULT_APPEARANCE,
        ...saved,
        theme: { ...DEFAULT_APPEARANCE.theme, ...(saved.theme || {}) },
        visibleTabs: visible.length > 0 ? visible : [...ALL_TABS],
        userPresets: Array.isArray(saved.userPresets) ? saved.userPresets : [],
      });
    }
  } catch {}
  return withSharedAppearance({ ...DEFAULT_APPEARANCE, visibleTabs: [...ALL_TABS], userPresets: [] });
}

export function saveAppearance(settings: AppearanceSettings) {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ ...settings, knownTabs: ALL_TABS }));
  } catch {}
  // n'écrit que si les valeurs partagées ont changé (crée le fichier au premier lancement)
  try { suiteTheme()?.write(settings, 'Mori'); } catch {}
}

/** Code d'export d'un preset (JSON lisible, à coller dans « Importer ») */
export function exportPresetCode(preset: Omit<ThemePreset, 'id' | 'builtIn'>): string {
  const { name, background, accent, primary, brandColor } = preset;
  return JSON.stringify({ moriTheme: 1, name, background, accent, primary, brandColor });
}

export function parsePresetCode(code: string): ThemePreset {
  let data: any;
  try {
    data = JSON.parse(code.trim());
  } catch {
    throw new Error('code illisible : collez le texte obtenu avec « Exporter »');
  }
  const background = normalizeHex(String(data.background || ''));
  const accent = normalizeHex(String(data.accent || ''));
  const primary = normalizeHex(String(data.primary || ''));
  const brandColor = normalizeHex(String(data.brandColor || data.accent || ''));
  if (!background || !accent || !primary || !brandColor) throw new Error('couleurs manquantes ou invalides dans le code');
  return { id: `preset-${Date.now()}`, name: String(data.name || 'Preset importé').slice(0, 40), background, accent, primary, brandColor };
}


// ==================== components/Header.tsx ====================



export type ActiveTab = 'audio' | 'video' | 'binning' | 'markers' | 'download' | 'checker';

/** Libellé et icône de chaque onglet, dans l'ordre d'affichage */
export const TAB_META: Record<ActiveTab, { label: string; icon: React.ReactNode }> = {
  audio: { label: 'Audio', icon: <FileAudio className="w-3.5 h-3.5" /> },
  video: { label: 'Vidéo', icon: <Film className="w-3.5 h-3.5" /> },
  binning: { label: 'Chutier', icon: <FolderTree className="w-3.5 h-3.5" /> },
  markers: { label: 'Retours', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  download: { label: 'Web', icon: <Download className="w-3.5 h-3.5" /> },
  checker: { label: 'Checker', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
};

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  brandLabel: string;
  brandColor: string;
  visibleTabs: ActiveTab[];
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onOpenSettings,
  brandLabel,
  brandColor,
  visibleTabs,
}) => {
  const tabs = ALL_TABS.filter((id) => visibleTabs.includes(id));
  // Panneau étroit : si les onglets ne tiennent pas avec leurs noms, seuls l'onglet ouvert garde le sien
  // (les autres restent visibles par leur icône, nom en infobulle) — aucun onglet n'est coupé ou caché
  const navRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const fullWidth = useRef(0);
  const [compactTabs, setCompactTabs] = useState(false);
  const tabsKey = tabs.join(',');
  React.useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    // largeur avec tous les noms : mesurée onglets dépliés, gardée tant que la liste d'onglets ne change pas
    fullWidth.current = 0;
    setCompactTabs(false);
    const measure = () => {
      if (!fullWidth.current && rowRef.current) fullWidth.current = rowRef.current.scrollWidth;
      setCompactTabs(fullWidth.current > nav.clientWidth + 1);
    };
    const raf = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(nav);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [tabsKey]);

  return (
    <header className="bg-ink/95 backdrop-blur border-b border-white/10 sticky top-0 z-40 text-zinc-100">
      <div className="w-full px-3 pt-3 pb-2.5">
        {/* Marque + réglages */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-cream-300 flex items-center justify-center flex-shrink-0 shadow">
              <img src="./assets/logo.png" alt="Mori" draggable={false} className="w-6 h-6" />
            </div>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-extrabold text-lg tracking-tight text-cream-300 leading-none">Mori</span>
              {brandLabel && (
                <span className="font-semibold text-sm leading-none truncate" style={{ color: brandColor }}>
                  {brandLabel}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-full border border-white/15 text-zinc-200 hover:text-cream-300 hover:border-cream-300/60 transition cursor-pointer"
              title="Réglages"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Onglets centrés (masqués si un seul onglet est affiché) */}
        {tabs.length > 1 && (
          // w-max + mx-auto : centré quand tout tient, défilement depuis le premier onglet sinon
          <nav ref={navRef} className="mt-3 overflow-x-auto scrollbar-none">
            <div ref={rowRef} className="flex gap-0.5 w-max mx-auto">
            {tabs.map((id) => (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                title={TAB_META[id].label}
                aria-label={TAB_META[id].label}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-full transition whitespace-nowrap cursor-pointer ${
                  activeTab === id ? 'bg-cream-300 text-ink shadow' : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {TAB_META[id].icon}
                {(!compactTabs || activeTab === id) && <span>{TAB_META[id].label}</span>}
              </button>
            ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};


// ==================== components/ui.tsx ====================

/** Gros bouton rond ON/OFF centré + pastille d'état (mode automatique) */
export const AutoPowerToggle: React.FC<{ active: boolean; onToggle: () => void; busy?: boolean; title: string }> = ({
  active,
  onToggle,
  busy,
  title,
}) => (
  <div className="flex flex-col items-center gap-2.5 pt-1">
    <button
      onClick={onToggle}
      aria-pressed={active}
      title={active ? `Désactiver : ${title}` : `Activer : ${title}`}
      className={`w-24 h-24 rounded-full flex items-center justify-center border-2 transition cursor-pointer ${
        active
          ? 'border-emerald-300 bg-emerald-400/15 text-emerald-200 shadow-[0_0_32px_rgb(var(--accent-400)/0.45)]'
          : 'border-white/15 bg-white/[0.03] text-zinc-400 hover:text-zinc-100 hover:border-white/30'
      }`}
    >
      <Power className={`w-9 h-9 ${busy ? 'animate-pulse' : ''}`} />
    </button>
    <span
      className={`px-3 py-0.5 rounded-full text-[10px] font-bold tracking-[0.18em] ${
        active ? 'bg-emerald-300 text-ink' : 'bg-white/10 text-zinc-300'
      }`}
    >
      {active ? 'AUTO · ON' : 'AUTO · OFF'}
    </span>
    <p className="text-[11px] leading-snug text-center text-zinc-400 max-w-[260px]">
      {active ? `Activé : ${title}, sans rien demander.` : `Mode automatique : ${title}. Appuyez pour l'activer.`}
    </p>
  </div>
);

export const StatTile: React.FC<{ label: string; value: React.ReactNode; onClick?: () => void }> = ({ label, value, onClick }) => (
  <div
    onClick={onClick}
    className={`rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2 ${onClick ? 'cursor-pointer hover:border-white/25 transition' : ''}`}
  >
    <div className="text-[10px] text-zinc-400">{label}</div>
    <div className="font-bold text-sm text-zinc-50 mt-0.5 truncate">{value}</div>
  </div>
);

export const StatusMessage: React.FC<{ message: string; isError?: boolean; busy?: boolean }> = ({ message, isError, busy }) => (
  <div
    className={`px-3 py-2 rounded-lg border text-xs flex items-start gap-2 ${
      isError
        ? 'bg-red-950/40 border-red-500/40 text-red-200'
        : busy
        ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-100'
        : 'bg-white/[0.04] border-white/10 text-zinc-200'
    }`}
  >
    {isError ? (
      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
    ) : busy ? (
      <Activity className="w-4 h-4 text-emerald-300 animate-pulse flex-shrink-0" />
    ) : (
      <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0" />
    )}
    <span className="leading-snug">{message}</span>
  </div>
);

/** Bouton principal de la DA : pilule crème, texte bleu nuit */
export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', children, ...props }) => (
  <button
    {...props}
    className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-cream-300 hover:bg-cream-200 text-ink font-semibold text-xs transition cursor-pointer shadow disabled:opacity-50 disabled:cursor-default ${className}`}
  >
    {children}
  </button>
);


// ==================== components/AudioConverter.tsx ====================



interface AudioConverterProps {
  audioSettings: AudioSettings;
  onOpenSettings: () => void;
}

export const AudioConverter: React.FC<AudioConverterProps> = ({
  audioSettings,
  onOpenSettings,
}) => {
  // Statut initial inactif (OFF) par défaut selon la demande
  const [autoScanActive, setAutoScanActive] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<PremiereProjectScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isRelinking, setIsRelinking] = useState(false);
  const [relinkStatusMessage, setRelinkStatusMessage] = useState<{ isError?: boolean; message: string } | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  // derniers fichiers convertis : listés sous le message et mis en surbrillance dans le chutier
  const [convertedItems, setConvertedItems] = useState<ConvertedProjectItem[]>([]);
  const [selectInfo, setSelectInfo] = useState<string | null>(null);

  const insidePremiere = isRunningInPremiere();
  const isLoopRunningRef = useRef(false);

  const highlightInBin = async (items: ConvertedProjectItem[]) => {
    if (items.length === 0 || !insidePremiere) return;
    const res = await selectProjectItemsInPremiere(items.map((i) => i.id)).catch(() => null);
    if (!res || !res.success) setSelectInfo(`Sélection dans le chutier impossible${res?.error ? ` : ${res.error}` : ''}.`);
    else if (items.length > 1 && res.selected !== undefined && res.selected >= 0 && res.selected < items.length)
      setSelectInfo(`Premiere ne garde que le dernier élément sélectionné : cliquez sur un fichier pour le retrouver.`);
    else setSelectInfo(null);
  };
  /** Après une conversion : liste des fichiers (remplace la précédente) et surbrillance dans le chutier */
  const showConverted = (res: any) => {
    const items: ConvertedProjectItem[] = Array.isArray(res?.items) ? res.items : [];
    if (items.length === 0) return;
    setConvertedItems(items);
    highlightInBin(items);
  };
  // Fichiers dont la conversion a échoué : la boucle auto ne les retente pas en boucle
  const failedPathsRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef(audioSettings);
  settingsRef.current = audioSettings;

  const describeTranscodeResult = (res: any): string => {
    const parts: string[] = [];
    if (res.convertedCount > 0)
      parts.push(`${res.convertedCount} fichier(s) converti(s) en WAV ${audioSettings.sampleRate / 1000}kHz/${audioSettings.bitDepth}b`);
    if (res.relinkedCount > 0) parts.push(`${res.relinkedCount} piste(s) reliée(s) au WAV dans Premiere`);
    if (res.renamedCount > 0) parts.push(`${res.renamedCount} élément(s) renommé(s) en .wav dans le projet`);
    if (res.failures.length > 0) parts.push(`échec : ${res.failures.map((f: any) => f.error).join(' ; ')}`);
    return parts.length > 0 ? parts.join(' — ') + '.' : res.message || 'Aucun fichier audio compressé (MP3/M4A/AAC) à traiter.';
  };

  // Surveillance en continu via boucle récursive séquentielle
  useEffect(() => {
    let isCancelled = false;
    let timerId: any = null;

    const runAudioLoop = async () => {
      if (isCancelled || !autoScanActive || !insidePremiere || isLoopRunningRef.current) return;
      isLoopRunningRef.current = true;

      try {
        setIsScanning(true);
        const res = await scanPremiereProjectMemory();
        if (isCancelled) return;

        if (res && res.success) {
          setScanResult(res);

          // Audios compressés détectés (hors échecs déjà connus) : conversion WAV puis relink
          const pending = (res.compressedAudios || []).filter(
            (a: any) => a.mediaPath && !failedPathsRef.current.has(a.mediaPath)
          );
          if (res.hasProject && pending.length > 0) {
            setIsRelinking(true);
            const tr = await transcodeAndRelinkCompressedAudio(settingsRef.current, setProgressMessage, failedPathsRef.current);
            tr.failures?.forEach((f: any) => failedPathsRef.current.add(f.path));
            setProgressMessage(null);
            if (tr.convertedCount > 0 || tr.relinkedCount > 0 || tr.renamedCount > 0 || tr.failures?.length > 0) {
              setRelinkStatusMessage({ isError: tr.failures?.length > 0 && tr.relinkedCount === 0, message: describeTranscodeResult(tr) });
              showConverted(tr);
              const updated = await scanPremiereProjectMemory();
              if (!isCancelled && updated?.success) setScanResult(updated);
            }
            setIsRelinking(false);
          }
        }
      } catch (err: any) {
        console.error('Erreur scan audio:', err);
      } finally {
        setIsScanning(false);
        isLoopRunningRef.current = false;
        if (!isCancelled && autoScanActive) {
          timerId = setTimeout(runAudioLoop, 3500);
        }
      }
    };

    if (autoScanActive && insidePremiere) {
      runAudioLoop();
    }

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [autoScanActive, insidePremiere]);

  // Déclenchement manuel direct
  const handleManualRelink = async () => {
    setIsRelinking(true);
    setRelinkStatusMessage(null);
    // Un clic manuel retente aussi les fichiers précédemment en échec
    failedPathsRef.current.clear();

    try {
      const res = await transcodeAndRelinkCompressedAudio(audioSettings, setProgressMessage);
      if (res && res.success) {
        setRelinkStatusMessage({
          isError: res.failures.length > 0 && res.relinkedCount === 0,
          message: describeTranscodeResult(res),
        });
        showConverted(res);
        const updated = await scanPremiereProjectMemory();
        if (updated?.success) setScanResult(updated);
      } else {
        setRelinkStatusMessage({
          isError: true,
          message: res?.error || res?.message || 'Erreur lors du relink audio.',
        });
      }
    } catch (err: any) {
      setRelinkStatusMessage({
        isError: true,
        message: err?.message || 'Erreur lors du relink direct dans Premiere.',
      });
    } finally {
      setIsRelinking(false);
      setProgressMessage(null);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 space-y-4">
      <AutoPowerToggle
        active={autoScanActive}
        onToggle={() => setAutoScanActive(!autoScanActive)}
        busy={isScanning || isRelinking}
        title="conversion WAV & relink automatiques"
      />

      <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Audios compressés" value={`${scanResult?.compressedAudioCount ?? 0} fichier(s)`} />
          <StatTile
            label="Format cible"
            value={`WAV ${audioSettings.sampleRate / 1000} kHz · ${audioSettings.bitDepth} bits`}
            onClick={onOpenSettings}
          />
        </div>

        {progressMessage && <StatusMessage busy message={progressMessage} />}
        {relinkStatusMessage && (
          <StatusMessage isError={relinkStatusMessage.isError} message={relinkStatusMessage.message} />
        )}

        {convertedItems.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-zinc-900/60 overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-white/10 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-zinc-400">Fichier(s) converti(s)</span>
              <span className="flex items-center gap-2">
                {convertedItems.length > 1 && (
                  <button onClick={() => highlightInBin(convertedItems)} className="text-emerald-300 hover:text-emerald-200 underline cursor-pointer">
                    Tout sélectionner
                  </button>
                )}
                <button onClick={() => { setConvertedItems([]); setSelectInfo(null); }} className="text-zinc-500 hover:text-zinc-200 cursor-pointer" title="Effacer la liste">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {convertedItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => highlightInBin([it])}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/[0.04] transition cursor-pointer"
                  title="Sélectionner dans le chutier de Premiere"
                >
                  <FileAudio className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-zinc-100 truncate">{it.name}</span>
                    <span className="block text-[10px] text-zinc-500 truncate">
                      {it.bin || 'Racine du projet'}
                      {it.from && it.from !== it.name ? ` · avant : ${it.from}` : ''}
                    </span>
                  </span>
                  <FolderOpen className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                </button>
              ))}
            </div>
            {selectInfo && <div className="px-2.5 py-1.5 border-t border-white/10 text-[10px] text-zinc-500">{selectInfo}</div>}
          </div>
        )}

        <PrimaryButton onClick={handleManualRelink} disabled={isRelinking} className="w-full">
          <ArrowRightLeft className="w-3.5 h-3.5" />
          {isRelinking ? 'Conversion en cours…' : 'Convertir en WAV & relier'}
        </PrimaryButton>
      </div>
    </section>
  );
};


// ==================== components/AutoBinning.tsx ====================



interface AutoBinningProps {
  rules: BinRule[];
  onOpenSettings: () => void;
}

export const AutoBinning: React.FC<AutoBinningProps> = ({ rules, onOpenSettings }) => {
  // Statut initial inactif (OFF) par défaut selon la demande
  const [autoScanActive, setAutoScanActive] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<PremiereProjectScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastActionResult, setLastActionResult] = useState<{ isError?: boolean; message: string } | null>(null);

  const insidePremiere = isRunningInPremiere();
  const isLoopRunningRef = useRef(false);

  // Boucle de surveillance active séquentielle et résiliente
  useEffect(() => {
    let isCancelled = false;
    let timerId: any = null;

    const runLoop = async () => {
      if (isCancelled || !autoScanActive || !insidePremiere || isLoopRunningRef.current) return;
      isLoopRunningRef.current = true;

      try {
        setIsScanning(true);
        const res = await scanPremiereProjectMemory();
        if (isCancelled) return;

        if (res && res.success) {
          setScanResult(res);

          // Si des médias non classés sont présents à la racine, les classer automatiquement
          if (res.hasProject && res.unclassifiedMediaCount > 0) {
            setIsExecuting(true);
            const binRes = await executeDirectAutoBinningInPremiere(rules);
            if (binRes && binRes.success && (binRes.movedCount > 0 || binRes.removedBins?.length > 0)) {
              setLastActionResult({
                isError: false,
                message: describeBinningResult(binRes),
              });
              // Rafraîchir les stats
              const updated = await scanPremiereProjectMemory();
              if (!isCancelled && updated?.success) setScanResult(updated);
            }
            setIsExecuting(false);
          }
        }
      } catch (err: any) {
        console.error('Erreur scan chutier:', err);
      } finally {
        setIsScanning(false);
        isLoopRunningRef.current = false;
        if (!isCancelled && autoScanActive) {
          timerId = setTimeout(runLoop, 3500);
        }
      }
    };

    if (autoScanActive && insidePremiere) {
      runLoop();
    }

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [autoScanActive, insidePremiere, rules]);

  // Déclenchement manuel
  const handleManualBinning = async () => {
    setIsExecuting(true);
    setLastActionResult(null);

    try {
      const res = await executeDirectAutoBinningInPremiere(rules);

      if (res && res.success) {
        setLastActionResult({
          isError: false,
          message: describeBinningResult(res),
        });
        const updated = await scanPremiereProjectMemory();
        if (updated?.success) setScanResult(updated);
      } else {
        setLastActionResult({
          isError: true,
          message: res?.error || res?.message || 'Erreur lors du tri dans Premiere Pro.',
        });
      }
    } catch (err: any) {
      setLastActionResult({
        isError: true,
        message: err?.message || 'Erreur de communication avec Premiere Pro.',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 space-y-4">
      <AutoPowerToggle
        active={autoScanActive}
        onToggle={() => setAutoScanActive(!autoScanActive)}
        busy={isScanning || isExecuting}
        title="tri automatique du chutier"
      />

      <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Médias à la racine" value={`${scanResult?.unclassifiedMediaCount ?? 0} à trier`} />
          <StatTile label="Éléments du projet" value={scanResult?.totalItems ?? 0} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {rules.map((rule) => (
            <span
              key={rule.id}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-zinc-200 font-mono text-[10px]"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rule.color }} />
              {rule.binName}
            </span>
          ))}
          <button
            onClick={onOpenSettings}
            className="text-emerald-300 hover:text-emerald-200 font-semibold underline cursor-pointer text-[11px] ml-1"
          >
            Modifier
          </button>
        </div>

        {lastActionResult && <StatusMessage isError={lastActionResult.isError} message={lastActionResult.message} />}

        <PrimaryButton onClick={handleManualBinning} disabled={isExecuting} className="w-full">
          <Play className="w-3.5 h-3.5 fill-current" />
          {isExecuting ? 'Classement en cours…' : 'Trier maintenant'}
        </PrimaryButton>
      </div>
    </section>
  );
};


// ==================== components/VideoTranscoder.tsx ====================

interface VideoJob {
  id: string;
  input: string;
  name: string;
  status: 'queued' | 'probing' | 'converting' | 'importing' | 'done' | 'error' | 'canceled';
  kind?: ConversionPlan['kind'];
  progress: number;
  message?: string;
  output?: string;
  /** Clip du projet à relier au fichier converti (scan VFR) au lieu d'importer un nouveau clip */
  relinkNodeId?: string;
  forceReencode?: boolean;
}

const VIDEO_SETTINGS_KEYS = { mode: 'cutflow.videoMode', autoImport: 'cutflow.videoAutoImport' };
const VFR_SCAN_INTERVAL_MS = 15000;
const ACTIVE_JOB_STATUSES: VideoJob['status'][] = ['queued', 'probing', 'converting', 'importing'];

function readSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const VideoTranscoder: React.FC = () => {
  const [nodeOk] = useState<boolean>(isNodeAvailable);
  const [tools, setTools] = useState<FfmpegTools | null>(null);
  const [mode, setMode] = useState<VideoConversionMode>(() => readSetting(VIDEO_SETTINGS_KEYS.mode, 'auto'));
  const [autoImport, setAutoImport] = useState<boolean>(() => readSetting(VIDEO_SETTINGS_KEYS.autoImport, true));
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [vfrAutoScan, setVfrAutoScan] = useState(false);
  const [isScanningProject, setIsScanningProject] = useState(false);
  const [scanSummary, setScanSummary] = useState<{ message: string; isError?: boolean } | null>(null);
  // cadence déjà analysée par fichier (true = variable) : le scan auto ne réanalyse que les nouveaux clips
  const vfrCacheRef = useRef<Map<string, boolean>>(new Map());
  const scanningRef = useRef(false);
  const jobsRef = useRef<VideoJob[]>([]);
  jobsRef.current = jobs;

  const busyRef = useRef(false);
  const runningRef = useRef<{ id: string; run: RunningConversion } | null>(null);
  const settingsRef = useRef({ mode, autoImport });
  settingsRef.current = { mode, autoImport };

  useEffect(() => {
    if (nodeOk) setTools(findFfmpegTools());
  }, [nodeOk]);
  useEffect(() => writeSetting(VIDEO_SETTINGS_KEYS.mode, mode), [mode]);
  useEffect(() => writeSetting(VIDEO_SETTINGS_KEYS.autoImport, autoImport), [autoImport]);

  // Un fichier lâché hors de la zone ne doit pas remplacer le panneau par la vidéo
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  const updateJob = (id: string, patch: Partial<VideoJob>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const addFiles = (paths: string[]) => {
    setJobs((prev) => {
      const fresh = paths.filter((p) => !prev.some((j) => j.input === p && ACTIVE_JOB_STATUSES.includes(j.status)));
      return [
        ...prev,
        ...fresh.map((p, i) => ({
          id: `video-${Date.now()}-${i}`,
          input: p,
          name: p.split(/[\\/]/).pop() || p,
          status: 'queued' as const,
          progress: 0,
        })),
      ];
    });
  };

  const processJob = async (job: VideoJob) => {
    if (!tools) return;
    let output = '';
    try {
      updateJob(job.id, { status: 'probing', message: 'Analyse des flux…' });
      const probe = await probeMedia(tools, job.input);
      const plan = planConversion(probe, job.input, job.forceReencode ? 'reencode' : settingsRef.current.mode);

      if (plan.kind === 'none') {
        output = job.input;
        updateJob(job.id, { kind: 'none', progress: 1, message: 'Déjà compatible avec Premiere' });
      } else {
        output = outputPathFor(job.input, job.forceReencode ? '_cfr' : '');
        const v = probe.video!;
        const detail =
          plan.kind === 'remux'
            ? `Remux sans perte (${v.codec.toUpperCase()}${plan.copyAudio ? '' : ', audio → AAC'})`
            : `Réencodage H.264/AAC à ${plan.targetFps} i/s constant` + (plan.reasons.length ? ` — ${plan.reasons.join(', ')}` : '');
        updateJob(job.id, { status: 'converting', kind: plan.kind, message: detail, output });
        const run = runFfmpegConversion(tools, buildFfmpegArgs(job.input, output, plan, probe), probe.durationSec, (ratio) =>
          updateJob(job.id, { progress: ratio })
        );
        runningRef.current = { id: job.id, run };
        await run.promise;
        runningRef.current = null;
        updateJob(job.id, { progress: 1 });
      }

      if (job.relinkNodeId && isRunningInPremiere()) {
        updateJob(job.id, { status: 'importing', message: 'Remplacement dans le projet…' });
        const res = await relinkProjectItemToFile(job.relinkNodeId, output);
        if (!res?.success) throw new Error(res?.error || 'Remplacement dans Premiere impossible');
        vfrCacheRef.current.set(output, false);
        updateJob(job.id, { status: 'done', output, message: `Clip remplacé par « ${res.name} » (cadence constante)` });
      } else if (settingsRef.current.autoImport && isRunningInPremiere()) {
        updateJob(job.id, { status: 'importing', message: 'Import dans Premiere…' });
        const res = await importIntoActiveBin(output);
        if (!res?.success) throw new Error(res?.error || "Import dans Premiere impossible");
        updateJob(job.id, { status: 'done', output, message: `Importé dans « ${res.binName} »` });
      } else {
        updateJob(job.id, { status: 'done', output, message: `Enregistré : ${output.split(/[\\/]/).pop()}` });
      }
    } catch (err: any) {
      runningRef.current = null;
      // fichier de sortie incomplet : on ne le laisse pas traîner à côté de la source
      if (output && output !== job.input) deleteFileQuietly(output);
      const canceled = err?.message === 'annulé';
      updateJob(job.id, {
        status: canceled ? 'canceled' : 'error',
        message: canceled ? 'Conversion annulée' : `Échec : ${err?.message || err}`,
      });
    }
  };

  /** Analyse les clips vidéo du projet et met en file les VFR (réencodage CFR + remplacement du clip) */
  const scanProjectForVFR = async (manual: boolean) => {
    if (!tools || scanningRef.current) return;
    scanningRef.current = true;
    setIsScanningProject(true);
    if (manual) vfrCacheRef.current.clear();
    try {
      const items = await listProjectVideoItems();
      let vfrCount = 0;
      const toQueue: ProjectVideoItem[] = [];
      for (const item of items) {
        let isVFR = vfrCacheRef.current.get(item.path);
        if (isVFR === undefined) {
          try {
            const probe = await probeMedia(tools, item.path);
            isVFR = !!probe.video?.isVFR;
          } catch {
            isVFR = false; // fichier hors ligne ou illisible : ignoré
          }
          vfrCacheRef.current.set(item.path, isVFR);
        }
        if (!isVFR) continue;
        vfrCount++;
        const alreadyQueued = jobsRef.current.some(
          (j) => j.relinkNodeId === item.nodeId && (ACTIVE_JOB_STATUSES.includes(j.status) || j.status === 'error')
        );
        if (!alreadyQueued) toQueue.push(item);
      }
      if (toQueue.length > 0) {
        setJobs((prev) => [
          ...prev,
          ...toQueue.map((item, i) => ({
            id: `vfr-${Date.now()}-${i}`,
            input: item.path,
            name: item.name,
            status: 'queued' as const,
            progress: 0,
            relinkNodeId: item.nodeId,
            forceReencode: true,
          })),
        ]);
      }
      if (manual || toQueue.length > 0) {
        setScanSummary({
          message:
            vfrCount === 0
              ? `${items.length} vidéo(s) analysée(s) : aucune à cadence variable.`
              : `${items.length} vidéo(s) analysée(s) : ${vfrCount} à cadence variable, ${toQueue.length} mise(s) en file pour réencodage CFR.`,
        });
      }
    } catch (err: any) {
      setScanSummary({ isError: true, message: `Scan impossible : ${err?.message || err}` });
    } finally {
      scanningRef.current = false;
      setIsScanningProject(false);
    }
  };

  // Scan auto : nouveaux clips vérifiés toutes les 15 s
  useEffect(() => {
    if (!vfrAutoScan || !tools || !isRunningInPremiere()) return;
    let cancelled = false;
    let timer: any = null;
    const loop = async () => {
      await scanProjectForVFR(false);
      if (!cancelled) timer = setTimeout(loop, VFR_SCAN_INTERVAL_MS);
    };
    loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [vfrAutoScan, tools]);

  // File d'attente : une conversion à la fois, en arrière-plan
  useEffect(() => {
    if (busyRef.current || !tools) return;
    const next = jobs.find((j) => j.status === 'queued');
    if (!next) return;
    busyRef.current = true;
    processJob(next).finally(() => {
      busyRef.current = false;
      setJobs((prev) => [...prev]);
    });
  }, [jobs, tools]);

  const cancelJob = (job: VideoJob) => {
    if (runningRef.current?.id === job.id) runningRef.current.run.cancel();
    else if (job.status === 'queued') updateJob(job.id, { status: 'canceled', message: 'Retiré de la file' });
  };

  const handleChooseFfmpeg = () => {
    const cep = (window as any).cep;
    const res = cep?.fs?.showOpenDialogEx?.(false, false, 'Choisir ffmpeg', '', isWindowsPlatform() ? ['exe'] : []);
    if (res && res.err === 0 && res.data?.[0]) {
      setCustomFfmpegPath(res.data[0]);
      setTools(findFfmpegTools());
    }
  };

  const ready = nodeOk && !!tools;
  const hasFinished = jobs.some((j) => !ACTIVE_JOB_STATUSES.includes(j.status));
  const modes: Array<{ id: VideoConversionMode; label: string; title: string }> = [
    { id: 'auto', label: 'Auto', title: 'Remux sans perte si possible, sinon réencodage H.264 CFR' },
    { id: 'remux', label: 'Remux', title: 'Toujours réencapsuler les flux (sans perte)' },
    { id: 'reencode', label: 'Réencoder', title: 'Toujours réencoder en H.264/AAC à fréquence constante' },
  ];

  const kindLabel = (job: VideoJob) =>
    job.relinkNodeId
      ? 'VFR → CFR'
      : job.kind === 'remux'
      ? 'Remux'
      : job.kind === 'reencode'
      ? 'Réencodage CFR'
      : job.kind === 'none'
      ? 'Compatible'
      : null;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 space-y-3">
        {!nodeOk ? (
          <StatusMessage
            isError
            message="Redémarrez Premiere Pro pour terminer l'installation de Mori : cet outil sera disponible ensuite."
          />
        ) : !tools ? (
          <div className="space-y-2">
            <StatusMessage isError message="FFmpeg est introuvable sur cet ordinateur." />
            <button
              onClick={handleChooseFfmpeg}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 text-zinc-200 hover:text-cream-300 hover:border-cream-300/60 text-xs font-semibold transition cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Choisir ffmpeg.exe…
            </button>
          </div>
        ) : null}

        <AutoPowerToggle
          active={vfrAutoScan}
          onToggle={() => setVfrAutoScan(!vfrAutoScan)}
          busy={isScanningProject}
          title="détection et réencodage automatiques des vidéos à cadence variable"
        />

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => scanProjectForVFR(true)}
            disabled={!ready || isScanningProject}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/15 text-zinc-200 hover:text-cream-300 hover:border-cream-300/60 text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <FolderSync className={`w-3.5 h-3.5 ${isScanningProject ? 'animate-spin' : ''}`} />
            {isScanningProject ? 'Analyse du projet…' : 'Scanner le projet (cadence variable)'}
          </button>
          {scanSummary && <StatusMessage isError={scanSummary.isError} message={scanSummary.message} />}
        </div>

        {/* Zone de dépôt */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (ready) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (ready) addFiles(pathsFromDrop(e.dataTransfer));
          }}
          onClick={() => ready && addFiles(pickVideoFiles())}
          className={`rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${
            !ready
              ? 'border-white/10 opacity-50'
              : isDragging
              ? 'border-emerald-300 bg-emerald-400/10 cursor-copy'
              : 'border-white/15 hover:border-white/30 bg-white/[0.02] cursor-pointer'
          }`}
        >
          <Film className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-emerald-200' : 'text-zinc-400'}`} />
          <div className="text-sm font-semibold text-zinc-100">Déposez vos vidéos ici</div>
          <div className="text-[11px] text-zinc-400 mt-0.5">MKV, TS, WebM, M3U8, AV1, VP9… → MP4 prêt pour Premiere</div>
          <div className="text-[11px] text-emerald-300 mt-2 underline">ou parcourir…</div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-zinc-950/70 border border-white/10 rounded-full p-0.5">
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                title={m.title}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                  mode === m.id ? 'bg-cream-300 text-ink' : 'text-zinc-300 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoImport}
              onChange={(e) => setAutoImport(e.target.checked)}
              className="accent-emerald-400 w-3.5 h-3.5 cursor-pointer"
            />
            Importer dans le chutier actif
          </label>
        </div>

        {tools && (
          <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
            <span className="truncate" title={tools.ffmpeg}>
              FFmpeg {tools.source}
              {tools.ffprobe ? ' + ffprobe' : ''} · {tools.ffmpeg}
            </span>
            <button onClick={handleChooseFfmpeg} className="underline hover:text-zinc-300 cursor-pointer flex-shrink-0">
              Changer
            </button>
          </div>
        )}
      </section>

      {jobs.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200">File de conversion</span>
            {hasFinished && (
              <button
                onClick={() => setJobs((prev) => prev.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status)))}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
              >
                Vider les terminées
              </button>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {jobs.map((job) => {
              const active = ACTIVE_JOB_STATUSES.includes(job.status);
              const label = kindLabel(job);
              return (
                <div key={job.id} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {job.status === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                    ) : job.status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    ) : (
                      <Film className={`w-4 h-4 flex-shrink-0 ${active ? 'text-emerald-300 animate-pulse' : 'text-zinc-500'}`} />
                    )}
                    <span className="text-xs font-medium text-zinc-100 truncate flex-1" title={job.input}>
                      {job.name}
                    </span>
                    {label && (
                      <span className="px-1.5 rounded-full border border-white/15 text-[10px] text-zinc-300 whitespace-nowrap">{label}</span>
                    )}
                    {job.status === 'converting' && (
                      <span className="text-[11px] font-mono text-emerald-200 w-9 text-right">{Math.round(job.progress * 100)}%</span>
                    )}
                    {active ? (
                      <button
                        onClick={() => cancelJob(job)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 transition cursor-pointer"
                        title="Annuler"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition cursor-pointer"
                        title="Retirer de la liste"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {(job.status === 'converting' || job.status === 'probing' || job.status === 'importing') && (
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full bg-emerald-300 transition-all duration-300 ${job.status !== 'converting' ? 'animate-pulse w-full opacity-40' : ''}`}
                        style={job.status === 'converting' ? { width: `${Math.max(2, job.progress * 100)}%` } : undefined}
                      />
                    </div>
                  )}
                  {job.message && (
                    <div className={`text-[10px] leading-snug ${job.status === 'error' ? 'text-red-300' : 'text-zinc-400'}`}>{job.message}</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};


// ==================== components/WebDownloader.tsx ====================

interface DownloadJob {
  id: string;
  url: string;
  title: string;
  format: DownloadFormat;
  maxHeight: number;
  wav: WavSpec;
  section?: { start: number; end: number }; // extrait seulement (trim)
  status: 'queued' | 'downloading' | 'converting' | 'importing' | 'done' | 'error' | 'canceled';
  progress: number;
  message?: string;
  output?: string;
}

const WEB_SETTINGS_KEYS = { format: 'cutflow.webFormat', maxHeight: 'cutflow.webMaxHeight', wav: 'cutflow.webWav', autoImport: 'cutflow.webAutoImport' };
const ACTIVE_DOWNLOAD_STATUSES: DownloadJob['status'][] = ['queued', 'downloading', 'converting', 'importing'];
const QUALITY_CHOICES = [2160, 1440, 1080, 720, 480];

export const WebDownloader: React.FC = () => {
  const [nodeOk] = useState<boolean>(isNodeAvailable);
  const [ytdlp, setYtdlp] = useState<string | null>(null);
  const [ffmpegTools, setFfmpegTools] = useState<FfmpegTools | null>(null);
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<OnlineMediaInfo | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  // ancien réglage « mp3 » : ramené au WAV
  const [format, setFormat] = useState<DownloadFormat>(() => (readSetting(WEB_SETTINGS_KEYS.format, 'video') === 'video' ? 'video' : 'wav'));
  const [wavKey, setWavKey] = useState<string>(() => readSetting(WEB_SETTINGS_KEYS.wav, '48000-24'));
  const [maxHeight, setMaxHeight] = useState<number>(() => readSetting(WEB_SETTINGS_KEYS.maxHeight, 1080));
  const [autoImport, setAutoImport] = useState<boolean>(() => readSetting(WEB_SETTINGS_KEYS.autoImport, true));
  const [downloadDir, setDownloadDir] = useState<string>('');
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  // Recherche YouTube : le champ accepte un lien (analysé) ou des mots (recherche des N premiers résultats)
  const [searchCount, setSearchCount] = useState<number>(() => readSetting('cutflow.webSearchCount', 10));
  const [results, setResults] = useState<YoutubeSearchResult[] | null>(null);
  const [searchedFor, setSearchedFor] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  // aperçu en cours : adresse de la vidéo (un seul à la fois)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => writeSetting('cutflow.webSearchCount', searchCount), [searchCount]);
  // Trim : ne télécharger qu'un passage (début / fin), repérable avec l'aperçu
  const [trimOn, setTrimOn] = useState(false);
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');
  const previewTimeRef = useRef<{ url: string; time: number } | null>(null);
  useEffect(() => {
    setTrimOn(false);
    setTrimStart('');
    setTrimEnd('');
  }, [info?.url]);

  const busyRef = useRef(false);
  const runningRef = useRef<{ id: string; cancel: () => void } | null>(null);
  const settingsRef = useRef({ autoImport });
  settingsRef.current = { autoImport };

  useEffect(() => {
    if (!nodeOk) return;
    setYtdlp(findYtdlp());
    setFfmpegTools(findFfmpegTools());
    resolveDownloadDir().then(setDownloadDir).catch(() => {});
  }, [nodeOk]);
  useEffect(() => writeSetting(WEB_SETTINGS_KEYS.format, format), [format]);
  useEffect(() => writeSetting(WEB_SETTINGS_KEYS.maxHeight, maxHeight), [maxHeight]);
  useEffect(() => writeSetting(WEB_SETTINGS_KEYS.wav, wavKey), [wavKey]);
  useEffect(() => writeSetting(WEB_SETTINGS_KEYS.autoImport, autoImport), [autoImport]);

  const updateJob = (id: string, patch: Partial<DownloadJob>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const handleAnalyze = async (target = url) => {
    const link = target.trim();
    if (!ytdlp || !link) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setInfo(null);
    try {
      setInfo(await fetchOnlineMediaInfo(ytdlp, link));
    } catch (err: any) {
      setAnalyzeError(err?.message || String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isLink = (text: string) => /^(https?:\/\/|www\.|youtu\.?be)/i.test(text.trim());

  const handleSearch = async (query = url) => {
    const q = query.trim();
    if (!ytdlp || !q) return;
    setIsSearching(true);
    setSearchError(null);
    setPreviewUrl(null);
    setInfo(null);
    setAnalyzeError(null);
    setSelectedResult(null);
    try {
      const found = await searchYoutube(ytdlp, q, searchCount);
      setResults(found);
      setSearchedFor(q);
    } catch (err: any) {
      setSearchError(err?.message || String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = () => (isLink(url) ? handleAnalyze() : handleSearch());

  /** Résultat choisi : analysé comme un lien collé (formats, résolutions), la liste reste affichée */
  const pickResult = (r: YoutubeSearchResult) => {
    if (selectedResult === r.id) {
      setSelectedResult(null);
      setInfo(null);
      return;
    }
    setSelectedResult(r.id);
    handleAnalyze(r.url);
  };

  const handleDownload = () => {
    if (!info) return;
    if (trimOn && !trim.valid) return;
    const section = trimOn && trim.valid ? { start: trim.start!, end: trim.end! } : undefined;
    const title = section ? `${info.title} [${formatClock(section.start)} → ${formatClock(section.end)}]` : info.title;
    setJobs((prev) => [
      ...prev,
      { id: `dl-${Date.now()}`, url: info.url, title, format, maxHeight, wav: currentWav, section, status: 'queued', progress: 0 },
    ]);
    // lien collé : le champ est vidé ; recherche : on garde les mots et les résultats pour en prendre d'autres
    if (!selectedResult) {
      setUrl('');
      setPreviewUrl(null);
    }
    setSelectedResult(null);
    setInfo(null);
  };

  const processJob = async (job: DownloadJob) => {
    if (!ytdlp) return;
    let output = '';
    try {
      const dir = downloadDir || (await resolveDownloadDir());
      // YouTube refuse parfois ses propres liens (HTTP 403) : on relance l'extraction pour en obtenir de nouveaux
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; ; attempt++) {
        const retryNote = attempt > 1 ? ` (essai ${attempt}/${MAX_ATTEMPTS})` : '';
        // extrait : yt-dlp le récupère d'un bloc (pas de pourcentage avant la fin)
        const what = job.section ? 'Téléchargement de l’extrait…' : 'Téléchargement…';
        updateJob(job.id, { status: 'downloading', progress: 0, message: `${what}${retryNote}` });
        const run = runYtdlp(ytdlp, buildYtdlpArgs(job.url, job.format, job.maxHeight, dir, ffmpegTools?.ffmpeg || null, job.wav, job.section), (ratio, step) =>
          updateJob(job.id, {
            progress: ratio,
            message: (job.format === 'video' && step > 1 && !job.section ? 'Téléchargement de l’audio…' : what) + retryNote,
          })
        );
        runningRef.current = { id: job.id, cancel: run.cancel };
        try {
          output = await run.promise;
          break;
        } catch (err: any) {
          if (err?.message === 'annulé' || !/403|Forbidden/i.test(err?.message || '') || attempt >= MAX_ATTEMPTS) throw err;
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      runningRef.current = null;

      // Vidéo hors H.264/HEVC (VP9/AV1 en 4K) ou à cadence variable : réencodage pour Premiere
      if (job.format === 'video' && ffmpegTools) {
        const probe = await probeMedia(ffmpegTools, output);
        const plan = planConversion(probe, output, 'auto');
        if (plan.kind === 'reencode') {
          const converted = outputPathFor(output);
          updateJob(job.id, { status: 'converting', progress: 0, message: `Conversion H.264 à ${plan.targetFps} i/s pour Premiere…` });
          const conv = runFfmpegConversion(ffmpegTools, buildFfmpegArgs(output, converted, plan, probe), probe.durationSec, (ratio) =>
            updateJob(job.id, { progress: ratio })
          );
          runningRef.current = { id: job.id, cancel: conv.cancel };
          try {
            await conv.promise;
          } catch (err) {
            deleteFileQuietly(converted);
            throw err;
          }
          runningRef.current = null;
          deleteFileQuietly(output);
          output = converted;
        }
      }

      if (settingsRef.current.autoImport && isRunningInPremiere()) {
        updateJob(job.id, { status: 'importing', message: 'Import dans Premiere…' });
        const res = await importIntoActiveBin(output);
        if (!res?.success) throw new Error(res?.error || 'Import dans Premiere impossible');
        updateJob(job.id, { status: 'done', progress: 1, output, message: `Importé dans « ${res.binName} »` });
      } else {
        updateJob(job.id, { status: 'done', progress: 1, output, message: `Enregistré : ${output}` });
      }
    } catch (err: any) {
      runningRef.current = null;
      const canceled = err?.message === 'annulé';
      updateJob(job.id, {
        status: canceled ? 'canceled' : 'error',
        message: canceled ? 'Téléchargement annulé' : `Échec : ${err?.message || err}`,
      });
    }
  };

  // File d'attente : un téléchargement à la fois, en arrière-plan
  useEffect(() => {
    if (busyRef.current || !ytdlp) return;
    const next = jobs.find((j) => j.status === 'queued');
    if (!next) return;
    busyRef.current = true;
    processJob(next).finally(() => {
      busyRef.current = false;
      setJobs((prev) => [...prev]);
    });
  }, [jobs, ytdlp]);

  const cancelJob = (job: DownloadJob) => {
    if (runningRef.current?.id === job.id) runningRef.current.cancel();
    else if (job.status === 'queued') updateJob(job.id, { status: 'canceled', message: 'Retiré de la file' });
  };

  const handleChooseYtdlp = () => {
    const res = (window as any).cep?.fs?.showOpenDialogEx?.(false, false, 'Choisir yt-dlp', '', isWindowsPlatform() ? ['exe'] : []);
    if (res && res.err === 0 && res.data?.[0]) {
      setCustomYtdlpPath(res.data[0]);
      setYtdlp(findYtdlp());
    }
  };

  const handleChooseDir = () => {
    const res = (window as any).cep?.fs?.showOpenDialogEx?.(false, true, 'Dossier de téléchargement', downloadDir, []);
    if (res && res.err === 0 && res.data?.[0]) {
      setCustomDownloadDir(res.data[0]);
      setDownloadDir(res.data[0]);
    }
  };

  const handleResetDir = async () => {
    setCustomDownloadDir('');
    setDownloadDir(await resolveDownloadDir());
  };

  const ready = nodeOk && !!ytdlp;
  const availableHeights = info ? QUALITY_CHOICES.filter((h) => info.heights.some((x) => x >= h * 0.9)) : QUALITY_CHOICES;
  const hasFinished = jobs.some((j) => !ACTIVE_DOWNLOAD_STATUSES.includes(j.status));
  const ghostButton =
    'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 text-zinc-200 hover:text-cream-300 hover:border-cream-300/60 text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default';
  const specKey = (s: WavSpec) => `${s.sampleRate}-${s.bitDepth}`;
  const currentWav = WAV_SPECS.find((s) => specKey(s) === wavKey) || { sampleRate: 48000, bitDepth: 24 };
  const selectClass =
    'bg-zinc-950 border border-white/10 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 focus:outline-none focus:border-emerald-400 cursor-pointer';

  // passage à télécharger : début vide = 0, fin vide = fin de la vidéo
  const trim = (() => {
    const dur = info?.durationSec || 0;
    const start = trimStart.trim() ? parseClock(trimStart) : 0;
    const end = trimEnd.trim() ? parseClock(trimEnd) : dur || null;
    let error = '';
    if (start === null) error = 'Début illisible (ex. 1:05 ou 65)';
    else if (end === null) error = trimEnd.trim() ? 'Fin illisible (ex. 1:20 ou 80)' : 'Indiquez la fin';
    else if (end <= start) error = 'La fin doit être après le début';
    else if (dur && end > dur + 0.5) error = `La vidéo dure ${formatClock(dur)}`;
    return { start, end, valid: !error, error };
  })();
  const previewTimeFor = (url: string) => (previewTimeRef.current && previewTimeRef.current.url === url ? previewTimeRef.current.time : null);

  const downloadControls = (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as DownloadFormat)}
          className={selectClass}
          title="Type de fichier"
        >
          <option value="video">MP4</option>
          <option value="wav">WAV</option>
        </select>
        {format === 'video' ? (
          <select value={maxHeight} onChange={(e) => setMaxHeight(parseInt(e.target.value, 10))} className={selectClass} title="Résolution maximale">
            {availableHeights.map((h) => (
              <option key={h} value={h}>
                {h === 2160 ? '4K (2160p)' : `${h}p`}
              </option>
            ))}
            <option value={0}>Meilleure</option>
          </select>
        ) : (
          <select value={specKey(currentWav)} onChange={(e) => setWavKey(e.target.value)} className={selectClass} title="Bits et fréquence du WAV">
            {WAV_SPECS.map((s) => (
              <option key={specKey(s)} value={specKey(s)}>
                {wavSpecLabel(s)}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setTrimOn(!trimOn)}
          className={`p-2 rounded-full border transition cursor-pointer flex-shrink-0 ${
            trimOn ? 'border-cream-300/70 bg-cream-300/15 text-cream-300' : 'border-white/15 text-zinc-300 hover:text-cream-300 hover:border-cream-300/60'
          }`}
          title="Trim : télécharger seulement un passage"
        >
          <Scissors className="w-3.5 h-3.5" />
        </button>
        <PrimaryButton onClick={handleDownload} disabled={trimOn && !trim.valid} className="flex-1 !px-3">
          <Download className="w-3.5 h-3.5" />
          {trimOn ? 'Télécharger l’extrait' : 'Télécharger'}
        </PrimaryButton>
      </div>
      {trimOn && info && (
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-2 space-y-1.5">
          {ytdlp && info.durationSec > 0 && (
            <TrimEditor
              ytdlp={ytdlp}
              ffmpeg={ffmpegTools?.ffmpeg || null}
              url={info.url}
              duration={info.durationSec}
              start={trim.start}
              end={trim.end}
              onChange={(a, b) => {
                setTrimStart(formatClock(a));
                setTrimEnd(formatClock(b));
              }}
              onClose={() => setTrimOn(false)}
            />
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: 'Début', value: trimStart, set: setTrimStart, placeholder: '0:00' },
              { label: 'Fin', value: trimEnd, set: setTrimEnd, placeholder: info.durationSec ? formatClock(info.durationSec) : '1:00' },
            ].map((f) => (
              <div key={f.label} className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <span>{f.label}</span>
                </div>
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full bg-zinc-950 border border-white/10 rounded-full px-2.5 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-400"
                />
              </div>
            ))}
          </div>
          <div className={`text-[10px] ${trim.valid ? 'text-zinc-500' : 'text-red-300'}`}>
            {trim.valid
              ? `Extrait de ${trim.end! - trim.start! < 60 ? `${(Math.round((trim.end! - trim.start!) * 10) / 10).toString().replace('.', ',')} s` : formatClock(trim.end! - trim.start!)} (${formatClock(trim.start!)} → ${formatClock(trim.end!)}), coupé à l'image près.`
              : trim.error}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 space-y-3">
        {!nodeOk ? (
          <StatusMessage isError message="Redémarrez Premiere Pro pour terminer l'installation de Mori : cet outil sera disponible ensuite." />
        ) : !ytdlp ? (
          <div className="space-y-2">
            <StatusMessage
              isError
              message="yt-dlp est introuvable. Relancez l'installeur de Mori (il l'installe), ou indiquez son emplacement."
            />
            <button onClick={handleChooseYtdlp} className={`w-full ${ghostButton}`}>
              <FolderOpen className="w-3.5 h-3.5" />
              Choisir yt-dlp…
            </button>
          </div>
        ) : null}

        {/* Lien */}
        <div className="flex gap-1.5">
          <input
            type="text"
            value={url}
            disabled={!ready}
            onChange={(e) => {
              setUrl(e.target.value);
              setInfo(null);
              setSelectedResult(null);
              setAnalyzeError(null);
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text').trim();
              if (/^https?:\/\//i.test(pasted)) {
                e.preventDefault();
                setUrl(pasted);
                setSelectedResult(null);
                handleAnalyze(pasted);
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Collez un lien YouTube ou tapez une recherche…"
            className="flex-1 min-w-0 bg-zinc-950/70 border border-white/10 rounded-full px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-400 disabled:opacity-50"
          />
          {url.trim() && !isLink(url) ? (
            <button onClick={() => handleSearch()} disabled={!ready || isSearching} className={ghostButton}>
              <Search className={`w-3.5 h-3.5 ${isSearching ? 'animate-pulse' : ''}`} />
              {isSearching ? 'Recherche…' : 'Rechercher'}
            </button>
          ) : (
            <button onClick={() => handleAnalyze()} disabled={!ready || !url.trim() || isAnalyzing} className={ghostButton}>
              <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing && !selectedResult ? 'animate-pulse' : ''}`} />
              {isAnalyzing && !selectedResult ? 'Analyse…' : 'Analyser'}
            </button>
          )}
        </div>

        {url.trim() && !isLink(url) && (
          <div className="flex items-center justify-end gap-1.5 text-[11px] text-zinc-400 -mt-1">
            Afficher les
            <select value={searchCount} onChange={(e) => setSearchCount(parseInt(e.target.value, 10))} className={`${selectClass} !py-0.5`} title="Nombre de résultats">
              {[5, 10, 20, 30, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            premiers résultats
          </div>
        )}

        {searchError && <StatusMessage isError message={`Recherche impossible : ${searchError}`} />}
        {analyzeError && <StatusMessage isError message={`Lien illisible : ${analyzeError}`} />}

        {info && !selectedResult && (
          <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-3 space-y-3">
            <div className="flex gap-3">
              {info.thumbnail && (
                <button
                  onClick={() => setPreviewUrl(previewUrl === info.url ? null : info.url)}
                  title="Aperçu"
                  className="relative w-28 flex-shrink-0 group/thumb cursor-pointer"
                >
                  <img src={info.thumbnail} alt="" className="w-28 aspect-video object-cover rounded-lg border border-white/10" />
                  <span className="absolute inset-0 flex items-center justify-center rounded-lg hover:bg-black/40 transition">
                    <span className="w-8 h-8 rounded-full bg-black/70 group-hover/thumb:bg-red-600 flex items-center justify-center transition">
                      <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                    </span>
                  </span>
                </button>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-100 line-clamp-2" title={info.title}>
                  {info.title}
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                  {info.uploader}
                  {info.durationSec ? ` · ${formatDuration(info.durationSec)}` : ''}
                  {info.heights[0] ? ` · jusqu'à ${info.heights[0]}p` : ''}
                </div>
              </div>
            </div>

            {previewUrl === info.url && ytdlp && !trimOn && <YoutubePreview ytdlp={ytdlp} url={info.url} onClose={() => setPreviewUrl(null)} onTime={(t) => (previewTimeRef.current = { url: info.url, time: t })} />}
            {downloadControls}
          </div>
        )}

        {results && (
          <div className="rounded-xl border border-white/10 bg-zinc-950/60 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-white/10 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-zinc-400 truncate">
                {results.length} résultat(s) pour « <span className="text-zinc-200">{searchedFor}</span> »
              </span>
              <button
                onClick={() => {
                  setResults(null);
                  setSelectedResult(null);
                  setInfo(null);
                  setPreviewUrl(null);
                }}
                className="text-zinc-500 hover:text-zinc-200 cursor-pointer flex-shrink-0"
                title="Fermer les résultats"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {results.length === 0 && <div className="p-4 text-center text-[11px] text-zinc-500">Aucun résultat.</div>}
            <div className="divide-y divide-white/5">
              {results.map((r) => {
                const open = selectedResult === r.id;
                return (
                  <div key={r.id} className={open ? 'bg-white/[0.04]' : ''}>
                    <button
                      onClick={() => pickResult(r)}
                      className="w-full flex gap-2.5 p-2 text-left hover:bg-white/[0.03] transition cursor-pointer"
                      title={r.live ? 'Direct : ne peut pas être téléchargé' : 'Choisir le format et télécharger'}
                    >
                      <div className="relative w-24 flex-shrink-0 group/thumb">
                        <img src={r.thumbnail} alt="" loading="lazy" className="w-24 aspect-video object-cover rounded-md border border-white/10 bg-zinc-900" />
                        {!r.live && (
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(previewUrl === r.url ? null : r.url);
                            }}
                            title="Aperçu"
                            className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 hover:bg-black/40 transition"
                          >
                            <span className="w-7 h-7 rounded-full bg-black/70 group-hover/thumb:bg-red-600 flex items-center justify-center transition">
                              <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                            </span>
                          </span>
                        )}
                        <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/80 text-[9px] font-mono font-bold text-white pointer-events-none">
                          {r.durationSec ? formatDuration(r.durationSec) : r.live ? 'DIRECT' : '—'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-zinc-100 line-clamp-2 leading-snug">{r.title}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
                          {r.channel}
                          {r.views ? ` · ${formatViews(r.views)}` : ''}
                        </div>
                      </div>
                    </button>
                    {previewUrl === r.url && ytdlp && !(trimOn && selectedResult === r.id) && (
                      <div className="px-2 pb-2">
                        <YoutubePreview ytdlp={ytdlp} url={r.url} onClose={() => setPreviewUrl(null)} onTime={(t) => (previewTimeRef.current = { url: r.url, time: t })} />
                      </div>
                    )}
                    {open && (
                      <div className="px-2 pb-2 space-y-1.5">
                        {isAnalyzing && <StatusMessage busy message="Lecture des formats disponibles…" />}
                        {info && (
                          <>
                            {info.heights[0] ? <div className="text-[10px] text-zinc-500">Jusqu'à {info.heights[0]}p</div> : null}
                            {downloadControls}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoImport}
              onChange={(e) => setAutoImport(e.target.checked)}
              className="accent-emerald-400 w-3.5 h-3.5 cursor-pointer"
            />
            Importer dans le chutier actif
          </label>
        </div>

        {ready && (
          <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
            <span className="truncate" title={downloadDir}>
              Dossier : {downloadDir || '…'}
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              {getCustomDownloadDir() && (
                <button onClick={handleResetDir} className="underline hover:text-zinc-300 cursor-pointer">
                  Par défaut
                </button>
              )}
              <button onClick={handleChooseDir} className="underline hover:text-zinc-300 cursor-pointer">
                Changer
              </button>
            </span>
          </div>
        )}
        <p className="text-[10px] text-zinc-500">Ne téléchargez que des vidéos dont vous avez les droits d'utilisation.</p>
      </section>

      {jobs.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200">Téléchargements</span>
            {hasFinished && (
              <button
                onClick={() => setJobs((prev) => prev.filter((j) => ACTIVE_DOWNLOAD_STATUSES.includes(j.status)))}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
              >
                Vider les terminés
              </button>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {jobs.map((job) => {
              const active = ACTIVE_DOWNLOAD_STATUSES.includes(job.status);
              const showBar = job.status === 'downloading' || job.status === 'converting';
              return (
                <div key={job.id} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {job.status === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                    ) : job.status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    ) : (
                      <Download className={`w-4 h-4 flex-shrink-0 ${active ? 'text-emerald-300 animate-pulse' : 'text-zinc-500'}`} />
                    )}
                    <span className="text-xs font-medium text-zinc-100 truncate flex-1" title={job.url}>
                      {job.title}
                    </span>
                    <span className="px-1.5 rounded-full border border-white/15 text-[10px] text-zinc-300 whitespace-nowrap">
                      {job.format === 'video'
                        ? `MP4${job.maxHeight ? ` ${job.maxHeight}p` : ''}`
                        : `WAV ${job.wav.bitDepth}b ${(job.wav.sampleRate / 1000).toLocaleString('fr-FR')}k`}
                    </span>
                    {showBar && (
                      <span className="text-[11px] font-mono text-emerald-200 w-9 text-right">{Math.round(job.progress * 100)}%</span>
                    )}
                    {active ? (
                      <button onClick={() => cancelJob(job)} className="p-1 rounded text-zinc-500 hover:text-red-400 transition cursor-pointer" title="Annuler">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition cursor-pointer"
                        title="Retirer de la liste"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {(showBar || job.status === 'importing' || job.status === 'queued') && (
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full bg-emerald-300 transition-all duration-300 ${!showBar ? 'animate-pulse w-full opacity-40' : ''}`}
                        style={showBar ? { width: `${Math.max(2, job.progress * 100)}%` } : undefined}
                      />
                    </div>
                  )}
                  {job.message && (
                    <div className={`text-[10px] leading-snug break-all ${job.status === 'error' ? 'text-red-300' : 'text-zinc-400'}`}>
                      {job.message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};


// ==================== utils/checker.ts ====================
// Checker avant export : timeline (ExtendScript + mixage audio mesuré par FFmpeg), fichier PAD (ffprobe/FFmpeg), consolidation.

export type CheckStatus = 'ok' | 'warn' | 'error' | 'info';

export interface CheckDetail {
  text: string;
  /** position dans la séquence (secondes) : un clic y déplace la tête de lecture */
  seconds?: number;
}

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  summary: string;
  details?: CheckDetail[];
}

/** Norme de livraison : un champ vide (null) n'est pas vérifié */
export interface DeliveryPreset {
  id: string;
  name: string;
  builtIn?: boolean;
  // loudness
  lufs: number | null;
  /** 'target' : cible ± tolérance ; 'max' : plafond (programmes courts France TV : ≤ -23 LUFS) */
  lufsMode: 'target' | 'max';
  lufsTol: number;
  truePeakMax: number | null;
  lraMax: number | null;
  // audio
  sampleRate: number | null;
  bitDepth: number | null;
  audioPcm: boolean;
  minChannels: number | null;
  /** pistes qui doivent être en silence codé, ex. « 3-8 » ; les pistes 1-2 non listées doivent porter le programme */
  silentChannels: string | null;
  // vidéo
  container: string | null;
  videoCodec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  scan: 'progressive' | 'tff' | 'bff' | null;
  chroma: '420' | '422' | '444' | null;
  bitrateMbps: number | null;
  /** GOP : longueur (N), écart entre images d'ancrage I/P (M), GOP fermé (MPEG-2) */
  gopN: number | null;
  gopM: number | null;
  gopClosed: boolean;
  legalLevels: boolean;
  // chronométrie
  startTc: string | null;
  somTc: string | null;
  tone: boolean;
  blackBeforeSom: number | null;
  /** refus des noirs muets (image noire + silence) plus longs que N s */
  maxBlackMuted: number | null;
  /** refus des silences complets plus longs que N s */
  maxSilence: number | null;
  pse: boolean;
}

const EMPTY_PRESET: Omit<DeliveryPreset, 'id' | 'name'> = {
  lufs: null, lufsMode: 'target', lufsTol: 1, truePeakMax: null, lraMax: null,
  sampleRate: null, bitDepth: null, audioPcm: false, minChannels: null, silentChannels: null,
  container: null, videoCodec: null, width: null, height: null, fps: null, scan: null, chroma: null, bitrateMbps: null, gopN: null, gopM: null, gopClosed: false, legalLevels: false,
  startTc: null, somTc: null, tone: false, blackBeforeSom: null, maxBlackMuted: null, maxSilence: null, pse: false,
};

/** PAD HD selon la recommandation CST RT-040 : MXF XDCAM HD422 (MPEG-2 422P@HL 50 Mb/s), 1080i25 trame haute, PCM 24 bits 48 kHz */
const RT040_VIDEO = {
  container: 'mxf', videoCodec: 'mpeg2video', width: 1920, height: 1080, fps: 25, scan: 'tff' as const, chroma: '422' as const, bitrateMbps: 50,
  gopN: 12, gopM: 3, gopClosed: true,
  sampleRate: 48000, bitDepth: 24, audioPcm: true, legalLevels: true, pse: true,
};

export const DEFAULT_DELIVERY_PRESETS: DeliveryPreset[] = [
  { ...EMPTY_PRESET, id: 'norm-web', name: 'Web / YouTube', builtIn: true, lufs: -14, lufsTol: 1, truePeakMax: -1, sampleRate: 48000 },
  {
    ...EMPTY_PRESET, id: 'norm-ebu', name: 'Broadcast EBU R128', builtIn: true,
    lufs: -23, lufsTol: 1, truePeakMax: -1, sampleRate: 48000, bitDepth: 24, audioPcm: true, legalLevels: true, pse: true,
  },
  {
    ...EMPTY_PRESET, id: 'norm-canal', name: 'Canal+ · MXF XDCAM HD422 50i', builtIn: true,
    lufs: -23, lufsTol: 1, truePeakMax: -1, lraMax: 18,
    sampleRate: 48000, bitDepth: 24, audioPcm: true, minChannels: 4,
    container: 'mxf', videoCodec: 'mpeg2video', width: 1920, height: 1080, fps: 25, scan: 'tff', chroma: '422', bitrateMbps: 50, legalLevels: true,
    startTc: '09:59:00:00', somTc: '10:00:00:00', tone: true, blackBeforeSom: 2, pse: true,
  },
  {
    // Annexe technique CDE France Télévisions (21/03/2019) : départ 00:00:00:00 sans amorce, pistes 1-2 VF stéréo, 4/8/16 pistes
    ...EMPTY_PRESET, ...RT040_VIDEO, id: 'norm-ftv-long', name: 'France TV · programme long (≥ 2 min)', builtIn: true,
    lufs: -23, lufsTol: 1, truePeakMax: -3, lraMax: 20, minChannels: 4, silentChannels: '3-4',
    startTc: '00:00:00:00', somTc: '00:00:00:00',
  },
  {
    ...EMPTY_PRESET, ...RT040_VIDEO, id: 'norm-ftv-court', name: 'France TV · programme court (< 2 min)', builtIn: true,
    lufs: -23, lufsMode: 'max', truePeakMax: -3, minChannels: 4, silentChannels: '3-4',
    startTc: '00:00:00:00', somTc: '00:00:00:00',
  },
  {
    // Groupe TF1 (Histoire, Ushuaïa TV) v7.2 2021 : AS10 High_HD_2014, TCin 00:00:00:00, 4 paires AES PCM 24 bits,
    // noirs muets > 3 s et silences > 10 s refusés ; loudness selon RT-040
    ...EMPTY_PRESET, ...RT040_VIDEO, id: 'norm-tf1', name: 'TF1 · Histoire / Ushuaïa TV (AS10 HD)', builtIn: true,
    lufs: -23, lufsTol: 1, truePeakMax: -3, lraMax: 20, minChannels: 8, silentChannels: '3-8',
    startTc: '00:00:00:00', somTc: '00:00:00:00', maxBlackMuted: 3, maxSilence: 10,
  },
];

/** Normes fournies déjà proposées : une norme ajoutée dans une nouvelle version apparaît une fois, même avec une liste enregistrée */
const DELIVERY_BUILTINS_KNOWN_KEY = 'cutflow.deliveryPresetsKnown';

const DELIVERY_PRESETS_KEY = 'cutflow.deliveryPresets';
export function loadDeliveryPresets(): DeliveryPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELIVERY_PRESETS_KEY) || 'null');
    if (Array.isArray(parsed) && parsed.length > 0) {
      const known: string[] = JSON.parse(localStorage.getItem(DELIVERY_BUILTINS_KNOWN_KEY) || '["norm-web","norm-ebu","norm-canal"]');
      const added = DEFAULT_DELIVERY_PRESETS.filter((d) => !known.includes(d.id) && !parsed.some((p: any) => p.id === d.id));
      const withDefaults = (p: any) => ({ ...EMPTY_PRESET, ...(DEFAULT_DELIVERY_PRESETS.find((d) => d.id === p.id) || {}), ...p });
      return [...parsed.map(withDefaults), ...added.map((d) => ({ ...d }))];
    }
  } catch {}
  return DEFAULT_DELIVERY_PRESETS.map((p) => ({ ...p }));
}
export function saveDeliveryPresets(presets: DeliveryPreset[]) {
  try {
    localStorage.setItem(DELIVERY_PRESETS_KEY, JSON.stringify(presets));
    localStorage.setItem(DELIVERY_BUILTINS_KNOWN_KEY, JSON.stringify(DEFAULT_DELIVERY_PRESETS.map((d) => d.id)));
  } catch {}
}
export function exportDeliveryPresetCode(preset: DeliveryPreset): string {
  const { id, builtIn, ...rest } = preset;
  return JSON.stringify({ moriNorm: 1, ...rest });
}
export function parseDeliveryPresetCode(code: string): DeliveryPreset {
  let data: any;
  try {
    data = JSON.parse(code.trim());
  } catch {
    throw new Error('code illisible : collez le texte obtenu avec « Exporter »');
  }
  if (!data || data.moriNorm !== 1) throw new Error('ce code ne contient pas de norme Mori');
  const preset: any = { ...EMPTY_PRESET, id: `norm-${Date.now()}`, name: String(data.name || 'Norme importée').slice(0, 60) };
  for (const key of Object.keys(EMPTY_PRESET)) {
    const def = (EMPTY_PRESET as any)[key];
    const v = data[key];
    if (v === undefined) continue;
    if (typeof def === 'boolean') preset[key] = !!v;
    else if (v === null) preset[key] = null;
    else if (key === 'lufsMode') preset[key] = v === 'max' ? 'max' : 'target';
    else if (key === 'startTc' || key === 'somTc' || key === 'silentChannels' || key === 'container' || key === 'videoCodec' || key === 'scan' || key === 'chroma') preset[key] = String(v);
    else if (isFinite(parseFloat(v))) preset[key] = parseFloat(v);
  }
  return preset;
}

/** Résumé court d'une norme : « -23 LUFS ±1 · TP -1 dBFS · MXF 1920×1080 25i 4:2:2 » */
export function describeDeliveryPreset(p: DeliveryPreset): string {
  const parts: string[] = [];
  if (p.lufs !== null) parts.push(p.lufsMode === 'max' ? `≤ ${p.lufs} LUFS` : `${p.lufs} LUFS ±${p.lufsTol}`);
  if (p.truePeakMax !== null) parts.push(`TP ${p.truePeakMax} dBFS`);
  const video = [p.container?.toUpperCase(), p.width && p.height ? `${p.width}×${p.height}` : '', p.fps ? `${p.fps}${p.scan === 'tff' || p.scan === 'bff' ? 'i' : p.scan === 'progressive' ? 'p' : ''}` : '', p.chroma ? `${p.chroma[0]}:${p.chroma[1]}:${p.chroma[2]}` : '']
    .filter(Boolean)
    .join(' ');
  if (video) parts.push(video);
  return parts.join(' · ') || 'aucun critère';
}

/** HH:MM:SS:FF (non drop-frame) */
export function formatTc(seconds: number, fps: number): string {
  const f = Math.max(1, Math.round(fps || 25));
  let frames = Math.max(0, Math.round(seconds * f));
  const ff = frames % f;
  frames = Math.floor(frames / f);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(frames / 3600))}:${pad(Math.floor(frames / 60) % 60)}:${pad(frames % 60)}:${pad(ff)}`;
}
export function parseTc(tc: string | null | undefined, fps: number): number | null {
  const m = String(tc || '').trim().match(/^(\d{1,2})[:;.](\d{2})[:;.](\d{2})[:;.](\d{2})$/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / Math.max(1, Math.round(fps || 25));
}

function fmtNum(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

// ---------- Polices installées (tables « name » des fichiers TTF/OTF/TTC) ----------

let installedFontsCache: Set<string> | null = null;
function normFontName(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, '');
}
function readFontNames(fs: any, file: string, out: Set<string>) {
  let fd: any = null;
  try {
    fd = fs.openSync(file, 'r');
    const read = (pos: number, len: number) => {
      const buf = Buffer.alloc(len);
      const n = fs.readSync(fd, buf, 0, len, pos);
      return buf.subarray(0, n);
    };
    const Buffer = (window as any).cep_node?.Buffer || nodeRequire('buffer').Buffer;
    const head = read(0, 12);
    if (head.length < 12) return;
    const offsets: number[] = head.toString('latin1', 0, 4) === 'ttcf'
      ? (() => {
          const count = Math.min(head.readUInt32BE(8), 64);
          const tbl = read(12, count * 4);
          return Array.from({ length: count }, (_, i) => tbl.readUInt32BE(i * 4));
        })()
      : [0];
    for (const base of offsets) {
      const hdr = read(base, 12);
      if (hdr.length < 12) continue;
      const numTables = hdr.readUInt16BE(4);
      const dir = read(base + 12, numTables * 16);
      for (let t = 0; t < numTables; t++) {
        if (dir.toString('latin1', t * 16, t * 16 + 4) !== 'name') continue;
        const offset = dir.readUInt32BE(t * 16 + 8);
        const length = Math.min(dir.readUInt32BE(t * 16 + 12), 65536);
        const name = read(offset, length);
        const count = name.readUInt16BE(2);
        const strings = name.readUInt16BE(4);
        for (let r = 0; r < count; r++) {
          const rec = 6 + r * 12;
          if (rec + 12 > name.length) break;
          const platform = name.readUInt16BE(rec);
          const nameId = name.readUInt16BE(rec + 6);
          if (![1, 4, 6, 16].includes(nameId)) continue;
          const len = name.readUInt16BE(rec + 8);
          const off = strings + name.readUInt16BE(rec + 10);
          if (off + len > name.length) continue;
          const raw = name.subarray(off, off + len);
          let text = '';
          if (platform === 3 || platform === 0) {
            for (let i = 0; i + 1 < raw.length; i += 2) text += String.fromCharCode(raw.readUInt16BE(i));
          } else text = raw.toString('latin1');
          if (text) out.add(normFontName(text));
        }
      }
    }
  } catch {
  } finally {
    try {
      if (fd !== null) fs.closeSync(fd);
    } catch {}
  }
}
/** Noms (famille, nom complet, PostScript) de toutes les polices installées, Adobe Fonts compris */
export function listInstalledFonts(): Set<string> {
  if (installedFontsCache) return installedFontsCache;
  const fs = nodeRequire('fs');
  const pathMod = nodeRequire('path');
  const env = (window as any).cep_node?.process?.env || {};
  const out = new Set<string>();
  if (!fs || !pathMod) return out;
  const dirs = isWindowsPlatform()
    ? [
        pathMod.join(env.WINDIR || 'C:\\Windows', 'Fonts'),
        env.LOCALAPPDATA ? pathMod.join(env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts') : '',
        env.APPDATA ? pathMod.join(env.APPDATA, 'Adobe', 'CoreSync', 'plugins', 'livetype', 'r') : '',
        env.CommonProgramFiles ? pathMod.join(env.CommonProgramFiles, 'Adobe', 'Fonts') : '',
      ]
    : [
        '/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts',
        env.HOME ? pathMod.join(env.HOME, 'Library', 'Fonts') : '',
        env.HOME ? pathMod.join(env.HOME, 'Library', 'Application Support', 'Adobe', 'CoreSync', 'plugins', 'livetype', '.r') : '',
        '/Library/Application Support/Adobe/Fonts',
      ];
  for (const dir of dirs.filter(Boolean)) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (/\.(fon|ini|xml|dat|txt)$/i.test(f)) continue;
      readFontNames(fs, pathMod.join(dir, f), out);
    }
  }
  installedFontsCache = out;
  return out;
}

// ---------- Timeline ----------

interface TimelineClipData {
  k: 'v' | 'a';
  t: number;
  name: string;
  s: number;
  e: number;
  dis: boolean;
  path: string;
  off: boolean;
  fps: number;
  par: number;
  vinfo: string;
  ainfo: string;
  scale: number | null;
  comps: [string, string][];
  fonts: string[];
}
interface TimelineData {
  success: boolean;
  error?: string;
  name: string;
  fps: number;
  w: number;
  h: number;
  par: number;
  audioRate: number;
  end: number;
  zero: number;
  vTracks: { name: string; muted: boolean; clips: number }[];
  aTracks: { name: string; muted: boolean; clips: number }[];
  clips: TimelineClipData[];
  vfx: string[];
  afx: string[];
}

async function readTimelineData(): Promise<TimelineData> {
  const script = `
    (function() {
      if (!app.project || !app.project.activeSequence) return JSON.stringify({ success: false, error: "Aucune séquence active dans Premiere Pro" });
      var TPS = 254016000000;
      var seq = app.project.activeSequence;
      var st = seq.getSettings();
      var parStr = String(st.videoPixelAspectRatio || "1");
      var parts = parStr.split(":");
      var seqPar = parts.length === 2 ? parseFloat(parts[0]) / parseFloat(parts[1]) : parseFloat(parStr) || 1;
      var out = {
        success: true, name: seq.name, fps: TPS / Number(seq.timebase),
        w: st.videoFrameWidth, h: st.videoFrameHeight, par: seqPar,
        audioRate: st.audioSampleRate && st.audioSampleRate.seconds > 0 ? Math.round(1 / st.audioSampleRate.seconds) : 0,
        end: Number(seq.end) / TPS, zero: Number(seq.zeroPoint) / TPS,
        vTracks: [], aTracks: [], clips: [], vfx: [], afx: []
      };
      try { app.enableQE(); out.vfx = qe.project.getVideoEffectList(); out.afx = qe.project.getAudioEffectList(); } catch (eq) {}
      function col(md, id) {
        var m = md.match(new RegExp('"ColumnID"\\\\s*:\\\\s*"' + id + '"[^}]*?"ColumnValue"\\\\s*:\\\\s*"([^"]*)"'));
        return m ? m[1] : "";
      }
      var itemCache = {};
      function itemInfo(pi) {
        if (!pi) return { path: "", off: false, fps: 0, par: 1, vinfo: "", ainfo: "" };
        var key = pi.nodeId;
        if (itemCache[key]) return itemCache[key];
        var info = { path: "", off: false, fps: 0, par: 1, vinfo: "", ainfo: "" };
        try { info.path = pi.getMediaPath() || ""; } catch (e1) {}
        try { info.off = pi.isOffline(); } catch (e2) {}
        try { var fi = pi.getFootageInterpretation(); info.fps = fi.frameRate; info.par = fi.pixelAspectRatio; } catch (e3) {}
        try { var md = pi.getProjectColumnsMetadata(); info.vinfo = col(md, "Column.Intrinsic.VideoInfo"); info.ainfo = col(md, "Column.Intrinsic.AudioInfo"); } catch (e4) {}
        itemCache[key] = info;
        return info;
      }
      function fontsOf(comp) {
        var fonts = [];
        for (var p = 0; p < comp.properties.numItems; p++) {
          var v = "";
          try { v = String(comp.properties[p].getValue()); } catch (e5) { continue; }
          if (v.length > 200000 || !/font/i.test(v)) continue;
          var re = /"(?:mFontName|fontName|mPostScriptName|postScriptName|fontEditValue|mFontFamily|fontFamily)"\\s*:\\s*(?:\\{\\s*"mValue"\\s*:\\s*|\\[\\s*)?"([^"]+)"/g, m;
          while ((m = re.exec(v)) !== null) fonts.push(m[1]);
        }
        return fonts;
      }
      function scan(tracks, kind, list) {
        for (var t = 0; t < tracks.numTracks; t++) {
          var tr = tracks[t];
          var muted = false;
          try { muted = tr.isMuted(); } catch (em) {}
          list.push({ name: tr.name, muted: muted, clips: tr.clips.numItems });
          for (var c = 0; c < tr.clips.numItems; c++) {
            var cl = tr.clips[c];
            var info = itemInfo(cl.projectItem);
            var clip = { k: kind, t: t, name: cl.name, s: cl.start.seconds, e: cl.end.seconds, dis: !!cl.disabled,
              path: info.path, off: info.off, fps: info.fps, par: info.par, vinfo: info.vinfo, ainfo: info.ainfo,
              scale: null, comps: [], fonts: [] };
            for (var k = 0; k < cl.components.numItems; k++) {
              var comp = cl.components[k];
              clip.comps.push([comp.displayName, comp.matchName]);
              if (comp.matchName === "AE.ADBE Motion") {
                for (var p = 0; p < comp.properties.numItems; p++) {
                  if (/scale|chelle/i.test(comp.properties[p].displayName)) { try { clip.scale = comp.properties[p].getValue(); } catch (es) {} break; }
                }
              }
              if (/Text|Graphic|Texte/i.test(comp.matchName + " " + comp.displayName)) {
                var f = fontsOf(comp);
                for (var fi2 = 0; fi2 < f.length; fi2++) clip.fonts.push(f[fi2]);
              }
            }
            out.clips.push(clip);
          }
        }
      }
      scan(seq.videoTracks, "v", out.vTracks);
      scan(seq.audioTracks, "a", out.aTracks);
      return JSON.stringify(out);
    })();
  `;
  const res = await evalExtendScript<TimelineData>(script, 120000);
  if (!res || !res.success) throw new Error((res as any)?.error || 'lecture de la séquence impossible');
  return res;
}

const STILL_IMAGE_EXT = /\.(png|jpe?g|psd|tiff?|gif|bmp|webp|ai|eps|svg|heic|exr|dpx|tga)$/i;
/** Composants propres à Premiere (trajectoire, opacité, volume…) : jamais « manquants » */
const INTRINSIC_MATCH = /^(AE\.ADBE |ADBE |Internal |PR\.ADBE)/;

function systemDrivePrefix(): string {
  if (isWindowsPlatform()) {
    const env = (window as any).cep_node?.process?.env || {};
    return String(env.SystemDrive || 'C:').toUpperCase();
  }
  return '/';
}
function isOnSystemDrive(path: string): boolean {
  if (!path) return false;
  if (isWindowsPlatform()) return path.toUpperCase().startsWith(systemDrivePrefix() + '\\') || path.toUpperCase().startsWith(systemDrivePrefix() + '/');
  return path.startsWith('/') && !path.startsWith('/Volumes/');
}

/** Regroupe des occurrences par média : « nom (3×) 00:01:02:03, … » */
function groupByName(items: { name: string; seconds: number }[], fps: number, zero: number, extra?: (name: string) => string): CheckDetail[] {
  const map = new Map<string, number[]>();
  for (const it of items) {
    const list = map.get(it.name) || [];
    list.push(it.seconds);
    map.set(it.name, list);
  }
  return Array.from(map.entries()).map(([name, secs]) => {
    secs.sort((a, b) => a - b);
    const tcs = secs.slice(0, 3).map((s) => formatTc(s + zero, fps)).join(', ') + (secs.length > 3 ? '…' : '');
    return { text: `${name}${extra ? extra(name) : ''}${secs.length > 1 ? ` (${secs.length}×)` : ''} · ${tcs}`, seconds: secs[0] };
  });
}

export interface TimelineCheckOptions {
  preset: DeliveryPreset;
  measureLoudness: boolean;
}

/** Analyse de la séquence active ; la mesure loudness exporte le mixage (onStep informe l'interface) */
export async function checkTimeline(opts: TimelineCheckOptions, onStep: (text: string) => void): Promise<{ seqName: string; results: CheckResult[] }> {
  onStep('Lecture de la séquence…');
  const d = await readTimelineData();
  const fps = d.fps || 25;
  const results: CheckResult[] = [];
  const videoClips = d.clips.filter((c) => c.k === 'v');
  const mediaClips = d.clips.filter((c) => c.path);

  // 1. médias hors ligne
  const offline = d.clips.filter((c) => c.off);
  results.push(
    offline.length
      ? { id: 'offline', label: 'Médias hors ligne', status: 'error', summary: `${offline.length} plan(s) hors ligne`, details: groupByName(offline.map((c) => ({ name: c.name, seconds: c.s })), fps, d.zero) }
      : { id: 'offline', label: 'Médias hors ligne', status: 'ok', summary: 'aucun' }
  );

  // 2. trous dans l'image (pistes vidéo visibles, plans activés)
  const hiddenTracks = new Set(d.vTracks.map((t, i) => (t.muted ? i : -1)).filter((i) => i >= 0));
  const intervals = videoClips.filter((c) => !c.dis && !hiddenTracks.has(c.t)).map((c) => [c.s, c.e]).sort((a, b) => a[0] - b[0]);
  if (intervals.length === 0) {
    results.push({ id: 'gaps', label: 'Trous dans la timeline', status: 'info', summary: 'aucun plan vidéo visible' });
  } else {
    const gaps: CheckDetail[] = [];
    const frame = 1 / fps;
    let cursor = 0;
    for (const [s, e] of intervals) {
      if (s - cursor >= frame * 0.99) {
        const frames = Math.round((s - cursor) * fps);
        gaps.push({ text: `${formatTc(cursor + d.zero, fps)} → ${formatTc(s + d.zero, fps)} · ${frames} image(s) de noir`, seconds: cursor });
      }
      cursor = Math.max(cursor, e);
    }
    results.push(
      gaps.length
        ? { id: 'gaps', label: 'Trous dans la timeline', status: 'error', summary: `${gaps.length} trou(s) dans l'image`, details: gaps }
        : { id: 'gaps', label: 'Trous dans la timeline', status: 'ok', summary: 'image continue du début à la fin' }
    );
  }

  // 3. plans désactivés
  const disabled = d.clips.filter((c) => c.dis);
  if (disabled.length)
    results.push({ id: 'disabled', label: 'Plans désactivés', status: 'warn', summary: `${disabled.length} plan(s) désactivé(s) : ni image ni son à l'export`, details: groupByName(disabled.map((c) => ({ name: c.name, seconds: c.s })), fps, d.zero) });

  // 4. pistes muettes, masquées, solo
  const mutedA = d.aTracks.filter((t) => t.muted && t.clips > 0);
  const hiddenV = d.vTracks.filter((t) => t.muted && t.clips > 0);
  const trackDetails = [...mutedA.map((t) => ({ text: `${t.name} : muette` })), ...hiddenV.map((t) => ({ text: `${t.name} : masquée (œil fermé)` }))];
  results.push(
    trackDetails.length
      ? { id: 'tracks', label: 'Pistes muettes / masquées', status: 'warn', summary: `${trackDetails.length} piste(s) exclue(s) de l'export`, details: [...trackDetails, { text: 'Solo : non lisible par Premiere, vérifiez à l\u2019œil les boutons S' }] }
      : { id: 'tracks', label: 'Pistes muettes / masquées', status: 'ok', summary: 'toutes les pistes sont actives (solo : vérifiez à l\u2019œil, non lisible par Premiere)' }
  );

  // 5. médias sur le disque système
  const onSystem = mediaClips.filter((c) => isOnSystemDrive(c.path));
  const systemFiles = Array.from(new Set(onSystem.map((c) => c.path)));
  results.push(
    systemFiles.length
      ? { id: 'systemdrive', label: 'Médias sur le disque système', status: 'warn', summary: `${systemFiles.length} fichier(s) sur ${isWindowsPlatform() ? systemDrivePrefix() : 'le disque de démarrage'}`, details: systemFiles.slice(0, 30).map((p) => ({ text: p, seconds: onSystem.find((c) => c.path === p)?.s })) }
      : { id: 'systemdrive', label: 'Médias sur le disque système', status: 'ok', summary: 'aucun' }
  );

  // 6. cadences mixtes
  const fpsMismatch = videoClips.filter((c) => c.path && c.vinfo && !STILL_IMAGE_EXT.test(c.path) && c.fps > 1 && Math.abs(c.fps - fps) > 0.01);
  results.push(
    fpsMismatch.length
      ? { id: 'fps', label: 'Fréquences d\u2019images mixtes', status: 'warn', summary: `${new Set(fpsMismatch.map((c) => c.path)).size} média(s) ≠ ${fmtNum(fps, fps % 1 ? 3 : 0)} i/s`, details: groupByName(fpsMismatch.map((c) => ({ name: c.name, seconds: c.s })), fps, d.zero, (n) => { const c = fpsMismatch.find((x) => x.name === n); return c ? ` (${fmtNum(c.fps, c.fps % 1 ? 3 : 0)} i/s)` : ''; }) }
      : { id: 'fps', label: 'Fréquences d\u2019images mixtes', status: 'ok', summary: `tout est à ${fmtNum(fps, fps % 1 ? 3 : 0)} i/s` }
  );

  // 7. résolution inférieure à la séquence
  const lowRes: { name: string; seconds: number; label: string }[] = [];
  for (const c of videoClips) {
    const m = c.vinfo.match(/(\d{2,5})\s*x\s*(\d{2,5})/);
    if (!m || !c.path) continue;
    const w = +m[1], h = +m[2];
    if (w < d.w * 0.999 && h < d.h * 0.999) {
      const scale = typeof c.scale === 'number' ? c.scale : null;
      lowRes.push({ name: c.name, seconds: c.s, label: ` (${w}×${h}${scale !== null && scale > 100 ? `, agrandi à ${Math.round(scale)} %` : ''})` });
    }
  }
  results.push(
    lowRes.length
      ? { id: 'resolution', label: 'Résolution inférieure à la séquence', status: lowRes.some((l) => l.label.includes('agrandi')) ? 'error' : 'warn', summary: `${new Set(lowRes.map((l) => l.name)).size} média(s) sous ${d.w}×${d.h}`, details: groupByName(lowRes, fps, d.zero, (n) => lowRes.find((l) => l.name === n)?.label || '') }
      : { id: 'resolution', label: 'Résolution inférieure à la séquence', status: 'ok', summary: `tout est au moins en ${d.w}×${d.h}` }
  );

  // 8. rapport de pixels
  const parMismatch = videoClips.filter((c) => c.path && c.vinfo && Math.abs((c.par || 1) - (d.par || 1)) > 0.01);
  results.push(
    parMismatch.length
      ? { id: 'par', label: 'Rapport de pixels', status: 'error', summary: `${new Set(parMismatch.map((c) => c.path)).size} média(s) anamorphique(s) sur une séquence en ${fmtNum(d.par, 2)}`, details: groupByName(parMismatch.map((c) => ({ name: c.name, seconds: c.s })), fps, d.zero, (n) => { const c = parMismatch.find((x) => x.name === n); return c ? ` (pixels ${fmtNum(c.par, 2)})` : ''; }) }
      : { id: 'par', label: 'Rapport de pixels', status: 'ok', summary: `tout est en pixels ${d.par === 1 ? 'carrés' : fmtNum(d.par, 2)}` }
  );

  // 9. fréquence d'échantillonnage
  const seqRate = d.audioRate || 48000;
  const rateMismatch: { name: string; seconds: number; rate: number }[] = [];
  for (const c of d.clips.filter((x) => x.k === 'a')) {
    const m = c.ainfo.match(/(\d{4,6})\s*Hz/);
    if (m && +m[1] !== seqRate) rateMismatch.push({ name: c.name, seconds: c.s, rate: +m[1] });
  }
  results.push(
    rateMismatch.length
      ? { id: 'samplerate', label: 'Fréquence d\u2019échantillonnage', status: 'warn', summary: `${new Set(rateMismatch.map((r) => r.name)).size} son(s) ≠ ${fmtNum(seqRate / 1000, seqRate % 1000 ? 1 : 0)} kHz`, details: groupByName(rateMismatch, fps, d.zero, (n) => { const r = rateMismatch.find((x) => x.name === n); return r ? ` (${fmtNum(r.rate / 1000, r.rate % 1000 ? 1 : 0)} kHz)` : ''; }) }
      : { id: 'samplerate', label: 'Fréquence d\u2019échantillonnage', status: 'ok', summary: `tout est en ${fmtNum(seqRate / 1000, seqRate % 1000 ? 1 : 0)} kHz` }
  );

  // 10. effets manquants (plugins tiers absents de ce poste)
  const known = new Set([...d.vfx, ...d.afx].map((n) => n.toLowerCase()));
  const missingFx: { name: string; seconds: number; fx: string }[] = [];
  if (known.size > 0) {
    for (const c of d.clips) {
      for (const [display, match] of c.comps) {
        if (INTRINSIC_MATCH.test(match) || known.has(String(display).toLowerCase())) continue;
        missingFx.push({ name: c.name, seconds: c.s, fx: display || match });
      }
    }
  }
  results.push(
    known.size === 0
      ? { id: 'effects', label: 'Effets manquants', status: 'info', summary: 'liste des effets installés indisponible' }
      : missingFx.length
      ? { id: 'effects', label: 'Effets manquants', status: 'error', summary: `${new Set(missingFx.map((m) => m.fx)).size} effet(s) introuvable(s) sur ce poste`, details: missingFx.slice(0, 40).map((m) => ({ text: `${m.fx} · ${m.name} · ${formatTc(m.seconds + d.zero, fps)}`, seconds: m.seconds })) }
      : { id: 'effects', label: 'Effets manquants', status: 'ok', summary: 'tous les effets sont installés' }
  );

  // 11. polices des titres Essential Graphics
  const fontUses = d.clips.flatMap((c) => c.fonts.map((f) => ({ font: f, name: c.name, seconds: c.s })));
  if (fontUses.length === 0) {
    const graphics = d.clips.filter((c) => c.comps.some(([n, m]) => /Text|Texte|Graphic/i.test(m + ' ' + n)));
    results.push({ id: 'fonts', label: 'Polices des titres', status: 'info', summary: graphics.length ? 'polices non lisibles pour ces titres : vérifiez-les à l\u2019ouverture du projet' : 'aucun titre Essential Graphics' });
  } else {
    const installed = listInstalledFonts();
    const missing = fontUses.filter((u) => installed.size > 0 && !installed.has(normFontName(u.font)));
    results.push(
      missing.length
        ? { id: 'fonts', label: 'Polices des titres', status: 'error', summary: `${new Set(missing.map((m) => m.font)).size} police(s) non installée(s) : remplacée(s) à l\u2019affichage`, details: missing.slice(0, 30).map((m) => ({ text: `${m.font} · ${m.name} · ${formatTc(m.seconds + d.zero, fps)}`, seconds: m.seconds })) }
        : { id: 'fonts', label: 'Polices des titres', status: 'ok', summary: `${new Set(fontUses.map((u) => u.font)).size} police(s), toutes installées` }
    );
  }

  // 12. loudness du mixage
  if (opts.measureLoudness) {
    onStep('Export du mixage audio (Premiere peut se figer quelques instants)…');
    results.push(...(await measureSequenceLoudness(opts.preset, onStep)));
  }

  return { seqName: d.name, results };
}

/** Exporte le mixage de la séquence active en WAV (préréglage système de Premiere) puis le mesure */
async function measureSequenceLoudness(preset: DeliveryPreset, onStep: (text: string) => void): Promise<CheckResult[]> {
  const tools = findFfmpegTools();
  if (!tools) return [{ id: 'loudness', label: 'Loudness', status: 'info', summary: 'FFmpeg introuvable : mesure impossible' }];
  const os = nodeRequire('os');
  const pathMod = nodeRequire('path');
  const wav = pathMod.join(os.tmpdir(), `mori-mix-${Date.now()}.wav`);
  const script = `
    (function() {
      var seq = app.project.activeSequence;
      if (!seq) return JSON.stringify({ success: false, error: "Aucune séquence active" });
      function findPreset(folder, depth) {
        if (!folder.exists || depth > 3) return null;
        var files = folder.getFiles("*.epr");
        for (var i = 0; i < files.length; i++) if (/Waveform Audio 48kHz 16-bit\\.epr$/i.test(decodeURI(files[i].name))) return files[i];
        var dirs = folder.getFiles(function (f) { return f instanceof Folder; });
        for (var j = 0; j < dirs.length; j++) { var r = findPreset(dirs[j], depth + 1); if (r) return r; }
        return null;
      }
      var base = new Folder(app.path);
      var preset = findPreset(new Folder(base.fsName + "/MediaIO/systempresets"), 0) || findPreset(new Folder(base.fsName + "/Contents/MediaIO/systempresets"), 0);
      if (!preset) return JSON.stringify({ success: false, error: "préréglage WAV de Premiere introuvable" });
      var mode = (app.encoder && app.encoder.ENCODE_ENTIRE !== undefined) ? app.encoder.ENCODE_ENTIRE : 0;
      var res = seq.exportAsMediaDirect(${JSON.stringify(wav)}, preset.fsName, mode);
      return JSON.stringify({ success: true, result: String(res) });
    })();
  `;
  const res = await evalExtendScript<any>(script, 30 * 60 * 1000);
  const fs = nodeRequire('fs');
  if (!res?.success || !fs.existsSync(wav)) {
    return [{ id: 'loudness', label: 'Loudness', status: 'info', summary: `export du mixage impossible${res?.error ? ` : ${res.error}` : res?.result ? ` : ${res.result}` : ''}` }];
  }
  try {
    onStep('Mesure du loudness…');
    const m = await measureLoudness(tools, ['-i', wav], '[0:a:0]', 0, () => {});
    return loudnessResults(m, preset, true);
  } finally {
    deleteFileQuietly(wav);
  }
}

// ---------- Mesures FFmpeg ----------

/** FFmpeg d'analyse : sortie d'erreur conservée (résumés des filtres), progression via -progress */
function runFfmpegAnalysis(
  tools: FfmpegTools,
  args: string[],
  durationSec: number,
  onProgress: (ratio: number) => void,
  onStdoutLine?: (line: string) => void
): Promise<string> {
  const cp = nodeRequire('child_process');
  return new Promise((resolve, reject) => {
    const child = cp.spawn(tools.ffmpeg, ['-hide_banner', '-nostats', '-progress', 'pipe:2', ...args], { windowsHide: true });
    let stderr = '';
    let outBuf = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      if (!onStdoutLine) return;
      outBuf += d;
      const lines = outBuf.split(/\r?\n/);
      outBuf = lines.pop() || '';
      for (const l of lines) onStdoutLine(l);
    });
    child.stderr.on('data', (d: string) => {
      const m = d.match(/out_time_(?:us|ms)=(\d+)/g);
      if (m && durationSec > 0) onProgress(Math.min(1, parseInt(m[m.length - 1].split('=')[1], 10) / 1e6 / durationSec));
      stderr = (stderr + d.replace(/^(?:\w+=.*\r?\n)+/gm, '')).slice(-200000);
    });
    child.on('error', reject);
    child.on('close', (code: number) => {
      if (onStdoutLine && outBuf) onStdoutLine(outBuf);
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.trim().split(/\r?\n/).slice(-2).join(' ') || `FFmpeg a échoué (code ${code})`));
    });
  });
}

interface LoudnessMeasure {
  integrated: number | null;
  lra: number | null;
  truePeak: number | null;
  maxVolume: number | null;
  clippedSamples: number;
}

async function measureLoudness(tools: FfmpegTools, input: string[], source: string, durationSec: number, onProgress: (r: number) => void): Promise<LoudnessMeasure> {
  const log = await runFfmpegAnalysis(
    tools,
    [...input, '-filter_complex', `${source}ebur128=peak=true:framelog=verbose,volumedetect[out]`, '-map', '[out]', '-f', 'null', '-'],
    durationSec,
    onProgress
  );
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const num = (re: RegExp, text: string) => {
    const m = text.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  return {
    integrated: num(/I:\s*(-?[\d.]+|-inf)\s*LUFS/, summary),
    lra: num(/LRA:\s*(-?[\d.]+)\s*LU/, summary),
    truePeak: num(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/, summary),
    maxVolume: num(/max_volume:\s*(-?[\d.]+) dB/, log),
    clippedSamples: parseInt((log.match(/histogram_0db:\s*(\d+)/) || [])[1] || '0', 10),
  };
}

function loudnessResults(m: LoudnessMeasure, p: DeliveryPreset, fromMix: boolean): CheckResult[] {
  const out: CheckResult[] = [];
  const I = m.integrated;
  if (I === null || !isFinite(I)) out.push({ id: 'lufs', label: 'Loudness intégré', status: 'warn', summary: 'aucun son mesurable' });
  else if (p.lufs === null) out.push({ id: 'lufs', label: 'Loudness intégré', status: 'info', summary: `${fmtNum(I)} LUFS (pas de cible)` });
  else {
    const diff = I - p.lufs;
    if (p.lufsMode === 'max') {
      out.push({ id: 'lufs', label: 'Loudness intégré', status: diff <= 0.05 ? 'ok' : 'error', summary: `${fmtNum(I)} LUFS pour ${p.lufs} maximum${diff > 0.05 ? ` (+${fmtNum(diff)} LU)` : ''}` });
    } else
    out.push({
      id: 'lufs', label: 'Loudness intégré',
      status: Math.abs(diff) <= p.lufsTol + 0.05 ? 'ok' : 'error',
      summary: `${fmtNum(I)} LUFS pour ${p.lufs} ±${fmtNum(p.lufsTol)}${Math.abs(diff) > p.lufsTol + 0.05 ? ` (${diff > 0 ? '+' : ''}${fmtNum(diff)} LU)` : ''}`,
    });
  }
  if (m.truePeak !== null && isFinite(m.truePeak)) {
    const over = p.truePeakMax !== null && m.truePeak > p.truePeakMax + 0.05;
    out.push({ id: 'truepeak', label: 'True Peak', status: p.truePeakMax === null ? 'info' : over ? 'error' : 'ok', summary: `${fmtNum(m.truePeak)} dBTP${p.truePeakMax !== null ? ` (max ${p.truePeakMax})` : ''}` });
  }
  if (m.lra !== null && (p.lraMax !== null || !fromMix)) {
    out.push({ id: 'lra', label: 'Loudness Range', status: p.lraMax === null ? 'info' : m.lra > p.lraMax + 0.05 ? 'error' : 'ok', summary: `${fmtNum(m.lra)} LU${p.lraMax !== null ? ` (max ${p.lraMax})` : ''}` });
  }
  out.push(
    m.clippedSamples > 0 || (m.maxVolume !== null && m.maxVolume >= 0)
      ? { id: 'clipping', label: 'Saturation (0 dBFS)', status: 'error', summary: `${m.clippedSamples || 'des'} échantillon(s) à 0 dBFS : son saturé` }
      : { id: 'clipping', label: 'Saturation (0 dBFS)', status: 'ok', summary: `crête max ${m.maxVolume !== null ? fmtNum(m.maxVolume) + ' dBFS' : 'sous 0 dBFS'}` }
  );
  return out;
}

// ---------- Fichier PAD ----------

/** Sortie binaire d'un programme (flux élémentaire vidéo) */
function runBinary(bin: string, args: string[], maxBytes: number): Promise<any> {
  const cp = nodeRequire('child_process');
  const BufferCls = (window as any).cep_node?.Buffer || nodeRequire('buffer').Buffer;
  return new Promise((resolve, reject) => {
    const child = cp.spawn(bin, args, { windowsHide: true });
    const chunks: any[] = [];
    let size = 0;
    child.stdout.on('data', (d: any) => {
      if (size < maxBytes) {
        chunks.push(d);
        size += d.length;
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', () => resolve(BufferCls.concat(chunks)));
  });
}

function mostFrequent(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  counts.forEach((c, v) => {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  });
  return best;
}

/** Structure GOP sur les 20 premières secondes : N = écart entre images I, M = écart entre images I/P, GOP fermé lu dans les en-têtes MPEG-2 */
async function analyzeGop(tools: FfmpegTools, file: string, codec: string): Promise<{ n: number | null; m: number | null; closed: boolean | null; pattern: string }> {
  const res = await runProcess(tools.ffprobe!, ['-v', 'error', '-select_streams', 'v:0', '-read_intervals', '%+20', '-show_entries', 'frame=pict_type', '-of', 'csv=p=0', file]);
  const types = res.stdout.split(/\r?\n/).map((l) => l.replace(/[^IPB]/g, '')).filter(Boolean);
  const gaps = (pos: number[]) => pos.slice(1).map((x, i) => x - pos[i]);
  const iPos = types.map((ty, i) => (ty === 'I' ? i : -1)).filter((i) => i >= 0);
  const aPos = types.map((ty, i) => (ty === 'I' || ty === 'P' ? i : -1)).filter((i) => i >= 0);
  let closed: boolean | null = null;
  if (codec === 'mpeg2video') {
    // en-tête de GOP MPEG-2 : 00 00 01 B8, puis closed_gop = bit 6 du 4e octet
    const es = await runBinary(tools.ffmpeg, ['-v', 'error', '-i', file, '-map', '0:v:0', '-c', 'copy', '-frames:v', '120', '-f', 'mpeg2video', 'pipe:1'], 64 * 1024 * 1024);
    const flags: number[] = [];
    for (let i = 0; i + 7 < es.length; i++) {
      if (es[i] === 0 && es[i + 1] === 0 && es[i + 2] === 1 && es[i + 3] === 0xb8) flags.push((es[i + 7] >> 6) & 1);
    }
    if (flags.length) closed = flags.every((f) => f === 1);
  }
  return { n: mostFrequent(gaps(iPos)), m: mostFrequent(gaps(aPos)), closed, pattern: types.slice(0, 13).join('') };
}

/** « 3-4, 7 » -> [3, 4, 7] */
function parseChannelList(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(/[,;\s]+/)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let c = Math.min(a, b); c <= Math.max(a, b) && c <= 64; c++) if (!out.includes(c)) out.push(c);
  }
  return out;
}

export interface PadCheckGroups {
  technical: boolean;
  loudness: boolean;
  timing: boolean;
  levels: boolean;
  pse: boolean;
}

export async function checkDeliveryFile(
  tools: FfmpegTools,
  file: string,
  p: DeliveryPreset,
  groups: PadCheckGroups,
  onStep: (text: string, ratio?: number) => void
): Promise<CheckResult[]> {
  if (!tools.ffprobe) throw new Error('ffprobe introuvable (à côté de FFmpeg)');
  onStep('Analyse du fichier…');
  const res = await runProcess(tools.ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  if (res.code !== 0) throw new Error(res.stderr.trim().split(/\r?\n/).pop() || 'fichier illisible');
  const data = JSON.parse(res.stdout);
  const streams: any[] = data.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const audios = streams.filter((s) => s.codec_type === 'audio');
  const duration = parseFloat(data.format?.duration) || 0;
  const fps = v ? parseRate(v.r_frame_rate) || parseRate(v.avg_frame_rate) : p.fps || 25;
  const results: CheckResult[] = [];
  const check = (id: string, label: string, ok: boolean, actual: string, expected: string) =>
    results.push({ id, label, status: ok ? 'ok' : 'error', summary: ok ? actual : `${actual} (attendu : ${expected})` });

  // timecode de départ (conteneur, piste vidéo ou piste tmcd)
  const tc = data.format?.tags?.timecode || v?.tags?.timecode || streams.find((s) => s.tags?.timecode)?.tags?.timecode || null;
  const startSec = parseTc(tc, fps);

  if (groups.technical) {
    const ext = (file.split('.').pop() || '').toLowerCase();
    if (p.container) check('container', 'Conteneur', ext === p.container || String(data.format?.format_name || '').split(',').includes(p.container), `${ext.toUpperCase()} (${data.format?.format_name})`, p.container.toUpperCase());
    if (!v) results.push({ id: 'video', label: 'Vidéo', status: 'error', summary: 'aucune piste vidéo' });
    else {
      if (p.videoCodec) check('vcodec', 'Codec vidéo', v.codec_name === p.videoCodec, `${v.codec_name}${v.profile ? ` (${v.profile})` : ''}`, p.videoCodec);
      if (p.width && p.height) check('size', 'Résolution', v.width === p.width && v.height === p.height, `${v.width}×${v.height}`, `${p.width}×${p.height}`);
      if (p.fps) check('fps', 'Cadence', Math.abs(fps - p.fps) < 0.01, `${fmtNum(fps, fps % 1 ? 3 : 0)} i/s`, `${p.fps} i/s`);
      if (p.scan) {
        const fo = String(v.field_order || 'unknown');
        const scan = fo === 'progressive' ? 'progressive' : fo === 'tt' || fo === 'tb' ? 'tff' : fo === 'bb' || fo === 'bt' ? 'bff' : 'inconnu';
        const label = (s: string) => (s === 'progressive' ? 'progressif' : s === 'tff' ? 'entrelacé trame haute (TFF)' : s === 'bff' ? 'entrelacé trame basse (BFF)' : 'balayage non déclaré');
        check('scan', 'Balayage', scan === p.scan, label(scan), label(p.scan));
      }
      if (p.chroma) {
        const pf = String(v.pix_fmt || '');
        const chroma = /422/.test(pf) ? '422' : /444/.test(pf) ? '444' : /420|nv12|yuvj420/.test(pf) ? '420' : '?';
        check('chroma', 'Sous-échantillonnage', chroma === p.chroma, `${chroma === '?' ? pf : `${chroma[0]}:${chroma[1]}:${chroma[2]}`}`, `${p.chroma[0]}:${p.chroma[1]}:${p.chroma[2]}`);
      }
      if (p.bitrateMbps) {
        const br = (parseFloat(v.bit_rate) || parseFloat(data.format?.bit_rate) || 0) / 1e6;
        check('bitrate', 'Débit vidéo', br > 0 && Math.abs(br - p.bitrateMbps) / p.bitrateMbps <= 0.1, br ? `${fmtNum(br)} Mb/s` : 'non déclaré', `${p.bitrateMbps} Mb/s ±10 %`);
      }
      if (p.gopN || p.gopM || p.gopClosed) {
        onStep('Analyse de la structure GOP…');
        const g = await analyzeGop(tools, file, v.codec_name);
        const problems: string[] = [];
        if (p.gopN && g.n !== p.gopN) problems.push(`N=${g.n ?? '?'} au lieu de ${p.gopN}`);
        if (p.gopM && g.m !== p.gopM) problems.push(`M=${g.m ?? '?'} au lieu de ${p.gopM}`);
        if (p.gopClosed && g.closed === false) problems.push('GOP ouvert');
        const found = `N=${g.n ?? '?'}, M=${g.m ?? '?'}${g.closed === null ? '' : g.closed ? ', fermé' : ', ouvert'}`;
        results.push({
          id: 'gop', label: 'Structure GOP',
          status: problems.length ? 'error' : p.gopClosed && g.closed === null ? 'warn' : 'ok',
          summary: problems.length ? `${problems.join(' · ')} (${found})` : p.gopClosed && g.closed === null ? `${found} · GOP fermé non vérifiable pour ce codec` : found,
          details: g.pattern ? [{ text: `Début de séquence : ${g.pattern.split('').join(' ')}` }] : undefined,
        });
      }
      if (p.legalLevels && v.color_range === 'pc') results.push({ id: 'range', label: 'Plage vidéo', status: 'error', summary: 'plage étendue (full range) déclarée : interdite en broadcast' });
    }
    if (audios.length === 0) results.push({ id: 'audio', label: 'Audio', status: 'error', summary: 'aucune piste audio' });
    else {
      const a = audios[0];
      const bits = parseInt(a.bits_per_raw_sample, 10) || parseInt(a.bits_per_sample, 10) || parseInt((String(a.codec_name).match(/(\d+)/) || [])[1] || '0', 10);
      if (p.audioPcm) check('acodec', 'Codec audio', String(a.codec_name).startsWith('pcm_'), a.codec_name, 'PCM non compressé');
      if (p.sampleRate) check('arate', 'Échantillonnage', +a.sample_rate === p.sampleRate, `${fmtNum(+a.sample_rate / 1000, +a.sample_rate % 1000 ? 1 : 0)} kHz`, `${fmtNum(p.sampleRate / 1000, p.sampleRate % 1000 ? 1 : 0)} kHz`);
      if (p.bitDepth) check('abits', 'Quantification', bits === p.bitDepth, bits ? `${bits} bits` : 'non déclarée', `${p.bitDepth} bits`);
      const channels = audios.reduce((n, s) => n + (s.channels || 0), 0);
      if (p.minChannels) check('channels', 'Pistes audio', channels >= p.minChannels, `${channels} canal(aux) sur ${audios.length} piste(s)`, `au moins ${p.minChannels} (1-2 mix, 3-4 M&E…)`);
    }
  }

  // Programme : de la SOM (si connue) à la fin ; mix = 2 premiers canaux
  const somSec = parseTc(p.somTc, fps);
  const somOffset = startSec !== null && somSec !== null && somSec >= startSec ? somSec - startSec : null;
  const mixSource = audios.length === 0 ? '' : (audios[0].channels || 1) >= 2 ? '[0:a:0]pan=stereo|c0=c0|c1=c1,' : audios.length >= 2 ? '[0:a:0][0:a:1]amerge=inputs=2,' : '[0:a:0]';

  if (groups.timing) {
    if (p.startTc) {
      const ok = tc !== null && startSec !== null && Math.abs(startSec - (parseTc(p.startTc, fps) || 0)) < 0.5 / fps;
      check('starttc', 'TC de départ', ok, tc || 'aucun timecode', p.startTc);
    }
    if (p.somTc && somOffset === null) results.push({ id: 'som', label: 'SOM (début programme)', status: 'warn', summary: `position de ${p.somTc} introuvable : TC de départ absent ou postérieur` });
    if (p.tone && startSec !== null && audios.length) {
      onStep('Recherche du 1 kHz sur la mire…');
      const toneLen = somOffset !== null ? Math.min(40, somOffset - 10) : 40;
      if (toneLen > 3) {
        const base = ['-ss', '5', '-t', String(toneLen), '-i', file];
        const full = await runFfmpegAnalysis(tools, [...base, '-filter_complex', `${mixSource}astats=measure_perchannel=none[out]`, '-map', '[out]', '-f', 'null', '-'], 0, () => {});
        const band = await runFfmpegAnalysis(tools, [...base, '-filter_complex', `${mixSource}bandpass=f=1000:width_type=q:w=8,astats=measure_perchannel=none[out]`, '-map', '[out]', '-f', 'null', '-'], 0, () => {});
        const peak = (log: string) => parseFloat((log.match(/Peak level dB:\s*(-?[\d.]+|-inf)/) || [])[1] || '-inf');
        const pk = peak(full), pb = peak(band);
        const present = isFinite(pk) && Math.abs(pk - -18) <= 1 && isFinite(pb) && pb >= pk - 1.5;
        results.push({ id: 'tone', label: 'Mire et 1 kHz', status: present ? 'ok' : 'error', summary: present ? `1 kHz détecté à ${fmtNum(pk)} dBFS` : isFinite(pk) ? `pas de 1 kHz à -18 dBFS (crête ${fmtNum(pk)} dBFS)` : 'silence : aucun signal de référence' });
      }
    }
    if (p.blackBeforeSom && somOffset !== null && somOffset >= p.blackBeforeSom) {
      onStep('Contrôle du noir et du silence avant la SOM…');
      const win = p.blackBeforeSom;
      const graph = [v ? '[0:v:0]blackdetect=d=0:pix_th=0.10[vout]' : '', audios.length ? `${mixSource}astats=measure_perchannel=none[aout]` : ''].filter(Boolean).join(';');
      const log = await runFfmpegAnalysis(
        tools,
        ['-ss', String(somOffset - win), '-t', String(win), '-i', file, '-filter_complex', graph, ...(v ? ['-map', '[vout]'] : []), ...(audios.length ? ['-map', '[aout]'] : []), '-f', 'null', '-'],
        0,
        () => {}
      );
      const black = Array.from(log.matchAll(/black_duration:\s*([\d.]+)/g)).reduce((s, m) => s + parseFloat(m[1]), 0);
      const pk = parseFloat((log.match(/Peak level dB:\s*(-?[\d.]+|-inf)/) || [])[1] || '-inf');
      const blackOk = !v || black >= win * 0.95;
      const silentOk = !audios.length || !isFinite(pk) || pk < -60;
      results.push({
        id: 'blackbefore', label: `Noir et silence (${win} s avant SOM)`,
        status: blackOk && silentOk ? 'ok' : 'error',
        summary: blackOk && silentOk ? 'noir et silence stricts' : [!blackOk ? `noir sur ${fmtNum(black)} s seulement` : '', !silentOk ? `son présent (crête ${fmtNum(pk)} dBFS)` : ''].filter(Boolean).join(' · '),
      });
    }
  }

  if (groups.technical && p.silentChannels && audios.length) {
    const expectedSilent = parseChannelList(p.silentChannels);
    onStep('Contrôle des pistes silencieuses…', 0);
    const start = somOffset || 0;
    const merged = audios.length > 1 ? `${audios.map((_, i) => `[0:a:${i}]`).join('')}amerge=inputs=${audios.length},` : '[0:a:0]';
    const log = await runFfmpegAnalysis(
      tools,
      [...(start ? ['-ss', String(start)] : []), '-i', file, '-vn', '-filter_complex', `${merged}astats=measure_perchannel=Peak_level:measure_overall=none[out]`, '-map', '[out]', '-f', 'null', '-'],
      Math.max(1, duration - start),
      (r) => onStep('Contrôle des pistes silencieuses…', r)
    );
    const peaks = new Map<number, number>();
    for (const m of log.matchAll(/Channel:\s*(\d+)[\s\S]*?Peak level dB:\s*(-?[\d.]+|-inf)/g)) peaks.set(+m[1], m[2] === '-inf' ? -Infinity : parseFloat(m[2]));
    const silentAt = (db: number) => !isFinite(db) || db < -80;
    const lines: CheckDetail[] = [];
    const errors: string[] = [];
    Array.from(peaks.keys()).sort((a, b) => a - b).forEach((ch) => {
      const db = peaks.get(ch)!;
      const level = isFinite(db) ? `${fmtNum(db)} dBFS` : 'silence numérique';
      if (expectedSilent.includes(ch)) {
        if (!silentAt(db)) errors.push(`piste ${ch} non silencieuse`);
        lines.push({ text: `Piste ${ch} : ${level}${silentAt(db) ? ' ✓ silence attendu' : ' ✗ silence attendu'}` });
      } else {
        if (ch <= 2 && silentAt(db)) errors.push(`piste ${ch} vide`);
        lines.push({ text: `Piste ${ch} : ${level}${ch <= 2 ? (silentAt(db) ? ' ✗ programme attendu' : ' ✓ programme') : ''}` });
      }
    });
    const missing = expectedSilent.filter((c) => !peaks.has(c));
    if (missing.length) errors.push(`piste(s) ${missing.join(', ')} absente(s)`);
    results.push({
      id: 'tracks', label: `Pistes audio (silence : ${p.silentChannels})`,
      status: errors.length ? 'error' : peaks.size ? 'ok' : 'warn',
      summary: errors.length ? errors.join(' · ') : peaks.size ? `programme sur 1-2, pistes ${p.silentChannels} en silence` : 'niveaux par piste illisibles',
      details: lines,
    });
  }

  if (groups.timing && (p.maxBlackMuted || p.maxSilence)) {
    onStep('Recherche des noirs muets et des silences…', 0);
    const start = somOffset || 0;
    const minDur = Math.min(p.maxBlackMuted || Infinity, p.maxSilence || Infinity);
    const graph = [
      v && p.maxBlackMuted ? `[0:v:0]blackdetect=d=${p.maxBlackMuted}:pix_th=0.10[vout]` : '',
      audios.length ? `${mixSource}silencedetect=n=-60dB:d=${minDur}[aout]` : '',
    ].filter(Boolean).join(';');
    const log = await runFfmpegAnalysis(
      tools,
      [...(start ? ['-ss', String(start)] : []), '-i', file, '-filter_complex', graph, ...(graph.includes('[vout]') ? ['-map', '[vout]'] : []), ...(graph.includes('[aout]') ? ['-map', '[aout]'] : []), '-f', 'null', '-'],
      Math.max(1, duration - start),
      (r) => onStep('Recherche des noirs muets et des silences…', r)
    );
    const end = Math.max(0, duration - start);
    const blacks = Array.from(log.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)).map((m) => [parseFloat(m[1]), parseFloat(m[2])]);
    const silences: number[][] = [];
    let open: number | null = null;
    for (const m of log.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
      if (m[1] === 'start') open = Math.max(0, parseFloat(m[2]));
      else if (open !== null) {
        silences.push([open, parseFloat(m[2])]);
        open = null;
      }
    }
    if (open !== null) silences.push([open, end]);
    const tcAt = (s: number) => formatTc((startSec ?? 0) + start + s, fps);
    if (p.maxBlackMuted) {
      const muted: number[][] = [];
      for (const [bs, be] of blacks)
        for (const [ss, se] of audios.length ? silences : [[0, end]]) {
          const a = Math.max(bs, ss), b = Math.min(be, se);
          if (b - a > p.maxBlackMuted) muted.push([a, b]);
        }
      results.push(
        !v
          ? { id: 'blackmuted', label: `Noirs muets (max ${p.maxBlackMuted} s)`, status: 'info', summary: 'aucune piste vidéo' }
          : muted.length
          ? { id: 'blackmuted', label: `Noirs muets (max ${p.maxBlackMuted} s)`, status: 'error', summary: `${muted.length} noir(s) muet(s) trop long(s)`, details: muted.slice(0, 10).map(([a, b]) => ({ text: `${tcAt(a)} → ${tcAt(b)} · ${fmtNum(b - a)} s` })) }
          : { id: 'blackmuted', label: `Noirs muets (max ${p.maxBlackMuted} s)`, status: 'ok', summary: 'aucun' }
      );
    }
    if (p.maxSilence && audios.length) {
      const long = silences.filter(([a, b]) => b - a > p.maxSilence!);
      results.push(
        long.length
          ? { id: 'silence', label: `Silences (max ${p.maxSilence} s)`, status: 'error', summary: `${long.length} silence(s) complet(s) trop long(s)`, details: long.slice(0, 10).map(([a, b]) => ({ text: `${tcAt(a)} → ${tcAt(b)} · ${fmtNum(b - a)} s` })) }
          : { id: 'silence', label: `Silences (max ${p.maxSilence} s)`, status: 'ok', summary: 'aucun' }
      );
    }
  }

  if (groups.loudness && audios.length) {
    onStep('Mesure du loudness…', 0);
    const input = somOffset !== null ? ['-ss', String(somOffset), '-i', file] : ['-i', file];
    const m = await measureLoudness(tools, input, mixSource, Math.max(1, duration - (somOffset || 0)), (r) => onStep('Mesure du loudness…', r));
    results.push(...loudnessResults(m, p, false));
  }

  if ((groups.levels && p.legalLevels) || (groups.pse && p.pse)) {
    if (!v) results.push({ id: 'levels', label: 'Niveaux vidéo', status: 'info', summary: 'aucune piste vidéo' });
    else {
      onStep('Analyse image par image (niveaux, flashs)…', 0);
      const ten = /10|12/.test(String(v.pix_fmt || ''));
      const lo = ten ? 64 : 16, hi = ten ? 940 : 235, full = ten ? 1023 : 255;
      const frames: { t: number; min: number; max: number; avg: number }[] = [];
      let cur: any = null;
      const start = somOffset || 0;
      await runFfmpegAnalysis(
        tools,
        [
          ...(start ? ['-ss', String(start)] : []), '-i', file, '-map', '0:v:0',
          // un seul filtre d'affichage : plusieurs écrivant sur la sortie standard mélangent leurs images
          '-vf', 'scale=480:-2:flags=neighbor,signalstats,metadata=mode=print:file=-',
          '-f', 'null', '-',
        ],
        Math.max(1, duration - start),
        (r) => onStep('Analyse image par image (niveaux, flashs)…', r),
        (line) => {
          const f = line.match(/pts_time:([\d.]+)/);
          if (f) {
            const t = parseFloat(f[1]);
            if (!cur || cur.t !== t) {
              cur = { t, min: NaN, max: NaN, avg: NaN };
              frames.push(cur);
            }
            return;
          }
          const m = line.match(/lavfi\.signalstats\.(YMIN|YMAX|YAVG)=([\d.]+)/);
          if (m && cur) cur[m[1] === 'YMIN' ? 'min' : m[1] === 'YMAX' ? 'max' : 'avg'] = parseFloat(m[2]);
        }
      );
      const tcAt = (t: number) => (startSec !== null ? formatTc(startSec + start + t, fps) : formatTc(start + t, fps));
      if (groups.levels && p.legalLevels) {
        const bad = frames.filter((f) => f.min < lo || f.max > hi);
        const worstMin = Math.min(...frames.map((f) => f.min));
        const worstMax = Math.max(...frames.map((f) => f.max));
        results.push(
          bad.length
            ? { id: 'levels', label: `Niveaux légaux (${lo}-${hi})`, status: 'error', summary: `${bad.length} image(s) hors plage (${fmtNum((bad.length / Math.max(1, frames.length)) * 100)} %) · min ${worstMin} / max ${worstMax}`, details: bad.slice(0, 8).map((f) => ({ text: `${tcAt(f.t)} · Y ${f.min}-${f.max}` })) }
            : { id: 'levels', label: `Niveaux légaux (${lo}-${hi})`, status: 'ok', summary: frames.length ? `min ${worstMin} / max ${worstMax}` : 'aucune image analysée' }
        );
      }
      if (groups.pse && p.pse) {
        // Flash : deux variations opposées d'au moins 10 % de luminance moyenne, la plus sombre sous 80 % ; > 3 flashs sur une seconde
        const lum = frames.map((f) => f.avg / full);
        const transitions: number[] = [];
        let minSince = lum[0] ?? 0;
        let maxSince = lum[0] ?? 0;
        let dir = 0;
        for (let i = 1; i < lum.length; i++) {
          const x = lum[i];
          minSince = Math.min(minSince, x);
          maxSince = Math.max(maxSince, x);
          if (dir !== 1 && x - minSince >= 0.1 && minSince < 0.8) {
            transitions.push(i);
            dir = 1;
            maxSince = x;
          } else if (dir !== -1 && maxSince - x >= 0.1 && x < 0.8) {
            transitions.push(i);
            dir = -1;
            minSince = x;
          }
        }
        const win = Math.max(1, Math.round(fps));
        // fenêtres glissantes d'une seconde à plus de 6 transitions ; les fenêtres qui se suivent forment un seul passage
        const passages: number[][] = [];
        for (let a = 0, b = 0; b < transitions.length; b++) {
          while (transitions[b] - transitions[a] >= win) a++;
          if (b - a + 1 <= 6) continue;
          const last = passages[passages.length - 1];
          if (last && transitions[a] <= last[1] + win) last[1] = transitions[b];
          else passages.push([transitions[a], transitions[b]]);
        }
        results.push(
          passages.length
            ? { id: 'pse', label: 'Flashs (PSE, indicatif)', status: 'error', summary: `${passages.length} passage(s) à plus de 3 flashs par seconde`, details: passages.slice(0, 8).map(([s, e]) => ({ text: `${tcAt(frames[s].t)} → ${tcAt(frames[e].t)}` })) }
            : { id: 'pse', label: 'Flashs (PSE, indicatif)', status: 'ok', summary: 'aucune séquence à plus de 3 flashs/s (ne remplace pas un test Harding certifié)' }
        );
      }
    }
  }

  if (results.length === 0) results.push({ id: 'none', label: 'Aucun contrôle', status: 'info', summary: 'la norme choisie ne définit aucun critère pour les contrôles cochés' });
  return results;
}

/** Rapport texte (à copier ou enregistrer) */
export function checkReportText(title: string, results: CheckResult[]): string {
  const icon: Record<CheckStatus, string> = { ok: '[OK]  ', warn: '[ATTENTION]', error: '[ERREUR]', info: '[INFO]' };
  const lines = [title, '='.repeat(Math.min(60, title.length)), ''];
  for (const r of results) {
    lines.push(`${icon[r.status]} ${r.label} : ${r.summary}`);
    for (const d of r.details || []) lines.push(`      - ${d.text}`);
  }
  const errors = results.filter((r) => r.status === 'error').length;
  const warns = results.filter((r) => r.status === 'warn').length;
  lines.push('', errors || warns ? `${errors} erreur(s), ${warns} avertissement(s)` : 'Tout est conforme.');
  return lines.join('\n');
}

// ---------- Rapport PDF (générateur minimal, sans dépendance : Helvetica, encodage Windows-1252) ----------

const CP1252_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  'Œ': 0x8c, 'œ': 0x9c, 'Š': 0x8a, 'š': 0x9a, 'Ÿ': 0x9f, '™': 0x99,
};

/** Texte -> caractères 0..255 de Windows-1252 (ce que Helvetica/WinAnsiEncoding sait afficher) */
function toWinAnsi(text: string): string {
  let out = '';
  for (const ch of String(text).replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[   ]/g, ' ').replace(/[✓✔]/g, 'OK').replace(/[✗✘]/g, 'X').replace(/→/g, '->')) {
    const code = ch.charCodeAt(0);
    if (ch.length === 1 && (code < 0x80 || (code >= 0xa0 && code <= 0xff))) out += ch;
    else if (CP1252_EXTRA[ch] !== undefined) out += String.fromCharCode(CP1252_EXTRA[ch]);
    else out += '?';
  }
  return out;
}

/** Largeur approchée d'un texte en Helvetica (millièmes de corps), pour le retour à la ligne */
function helveticaWidth(text: string, bold: boolean): number {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += 278;
    else if ('ijlI.,:;!|\'’'.includes(ch)) w += 250;
    else if ('frt()[]-'.includes(ch)) w += 333;
    else if ('mwMW'.includes(ch)) w += 850;
    else if (ch >= 'A' && ch <= 'Z') w += 680;
    else w += 556;
  }
  return bold ? w * 1.06 : w;
}

function wrapPdfText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && (helveticaWidth(candidate, bold) * size) / 1000 > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
      // mot plus long que la ligne (chemin de fichier) : coupé net
      while ((helveticaWidth(line, bold) * size) / 1000 > maxWidth && line.length > 8) {
        let cut = line.length - 1;
        while (cut > 1 && (helveticaWidth(line.slice(0, cut), bold) * size) / 1000 > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface PdfReportMeta {
  product: string; // « Mori Checker 1.0.0 »
  file?: string; // chemin complet du fichier vérifié
  preset?: string;
  date?: Date;
}

/** Rapport de conformité au format PDF (A4), à joindre à une livraison */
export function buildPdfReport(title: string, results: CheckResult[], meta: PdfReportMeta): Uint8Array {
  const W = 595, H = 842, M = 48, maxW = W - 2 * M;
  const pages: string[] = [];
  let ops: string[] = [];
  let y = H - M;
  const newPage = () => {
    if (ops.length) pages.push(ops.join('\n'));
    ops = [];
    y = H - M;
  };
  const rgb = (c: [number, number, number]) => `${(c[0] / 255).toFixed(3)} ${(c[1] / 255).toFixed(3)} ${(c[2] / 255).toFixed(3)} rg`;
  const esc = (s: string) => toWinAnsi(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const text = (s: string, x: number, size: number, bold = false, color: [number, number, number] = [20, 24, 33]) => {
    ops.push(`BT ${rgb(color)} /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`);
  };
  const ensure = (h: number) => {
    if (y - h < M + 24) newPage();
  };
  const para = (s: string, x: number, size: number, bold = false, color?: [number, number, number], gap = 3) => {
    for (const line of wrapPdfText(s, size, maxW - (x - M), bold)) {
      ensure(size + gap);
      y -= size;
      text(line, x, size, bold, color);
      y -= gap;
    }
  };

  const errors = results.filter((r) => r.status === 'error').length;
  const warns = results.filter((r) => r.status === 'warn').length;
  const date = meta.date || new Date();
  para('Rapport de conformité', M, 18, true);
  y -= 2;
  para(title, M, 11, true, [60, 66, 80]);
  if (meta.file) para(meta.file, M, 8, false, [110, 116, 130]);
  para(
    `${meta.preset ? `Norme : ${meta.preset}  ·  ` : ''}${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    M,
    9,
    false,
    [110, 116, 130]
  );
  y -= 8;
  // bandeau de verdict
  const ready = errors === 0 && warns === 0;
  const band: [number, number, number] = errors ? [220, 60, 60] : warns ? [230, 160, 30] : [40, 160, 100];
  ensure(30);
  ops.push(`${rgb(band)} ${M} ${(y - 26).toFixed(1)} ${maxW} 26 re f`);
  y -= 17;
  text(ready ? 'PRÊT À LIVRER' : `${errors} erreur(s)  ·  ${warns} alerte(s)`, M + 10, 12, true, [255, 255, 255]);
  y -= 21;

  const order: CheckStatus[] = ['error', 'warn', 'ok', 'info'];
  const tag: Record<CheckStatus, { label: string; color: [number, number, number] }> = {
    error: { label: 'ERREUR', color: [200, 40, 40] },
    warn: { label: 'ALERTE', color: [200, 120, 0] },
    ok: { label: 'OK', color: [30, 140, 80] },
    info: { label: 'INFO', color: [110, 116, 130] },
  };
  for (const r of [...results].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))) {
    ensure(30);
    y -= 6;
    ops.push(`0.85 0.87 0.9 RG 0.5 w ${M} ${y.toFixed(1)} m ${W - M} ${y.toFixed(1)} l S`);
    y -= 13;
    text(tag[r.status].label, M, 8.5, true, tag[r.status].color);
    text(r.label, M + 52, 10, true);
    y -= 3;
    para(r.summary, M + 52, 9, false, [60, 66, 80]);
    for (const d of r.details || []) para(`•  ${d.text}`, M + 60, 8, false, [90, 96, 110], 2);
  }
  newPage();

  // assemblage : catalogue, pages, polices, flux de contenu (+ pied de page)
  const objs: string[] = [];
  const add = (body: string) => objs.push(body);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // pages, rempli plus bas
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  pages.forEach((content, i) => {
    const footer = `BT 0.55 0.58 0.63 rg /F1 7.5 Tf ${M} 28 Td (${esc(`${meta.product}  ·  page ${i + 1}/${pages.length}`)}) Tj ET`;
    const stream = `${content}\n${footer}`;
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const contentId = objs.length;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(objs.length);
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** Écrit un fichier binaire (Node dans Premiere / Mori Checker) */
function writeBinaryFile(path: string, bytes: Uint8Array) {
  const fs = nodeRequire('fs');
  const B = (window as any).cep_node?.Buffer;
  if (!fs) throw new Error('écriture de fichiers indisponible');
  fs.writeFileSync(path, B ? B.from(bytes) : bytes);
}

/** Enregistre un PDF : boîte de dialogue native dans Premiere, sinon téléchargement */
function savePdfFile(bytes: Uint8Array, defaultName: string): string | null {
  const cep = (window as any).cep;
  if (cep && cep.fs && cep.fs.showSaveDialogEx && nodeRequire('fs')) {
    const res = cep.fs.showSaveDialogEx('Enregistrer le rapport PDF', '', ['pdf'], defaultName);
    if (res.err !== 0 || !res.data) return null;
    const path = /\.pdf$/i.test(res.data) ? res.data : `${res.data}.pdf`;
    writeBinaryFile(path, bytes);
    return path;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return defaultName;
}

export async function movePlayheadTo(seconds: number) {
  await evalExtendScript(`
    (function() {
      var seq = app.project.activeSequence;
      if (seq) seq.setPlayerPosition(String(Math.round(${seconds} * 254016000000)));
      return JSON.stringify({ success: true });
    })();
  `);
}

// ---------- Consolidation (Gestionnaire de projets de Premiere) ----------

export interface ConsolidateOptions {
  scope: 'all' | 'used';
  trim: boolean;
  handleFrames: number;
}

export async function consolidateProject(opts: ConsolidateOptions): Promise<{ success: boolean; destination?: string; error?: string }> {
  const script = `
    (function() {
      if (!app.project || !app.project.path) return JSON.stringify({ success: false, error: "Enregistrez d'abord le projet" });
      if (!app.projectManager) return JSON.stringify({ success: false, error: "Gestionnaire de projets indisponible dans cette version" });
      var projFile = new File(app.project.path);
      var dest = projFile.parent.fsName;
      var pm = app.projectManager;
      var o = pm.options;
      o.destinationPath = dest;
      o.includeAllSequences = ${opts.scope === 'all'};
      if (${opts.scope === 'used'} && app.project.activeSequence) { try { o.affectedSequences = [app.project.activeSequence]; } catch (e1) {} }
      o.excludeUnused = ${opts.scope === 'used'};
      o.includePreviews = false;
      o.includeConformedAudio = false;
      o.renameMedia = false;
      o.convertImageSequencesToClips = false;
      o.convertSyntheticsToClips = false;
      o.convertAECompsToClips = false;
      o.copyToPreventAlphaLoss = false;
      o.handleFrameCount = ${Math.max(0, Math.round(opts.handleFrames))};
      if (${opts.trim}) {
        function findPreset(folder, depth) {
          if (!folder.exists || depth > 3) return null;
          var files = folder.getFiles("*.epr");
          for (var i = 0; i < files.length; i++) if (/^Apple ProRes 422 HQ\\.epr$/i.test(decodeURI(files[i].name))) return files[i];
          var dirs = folder.getFiles(function (f) { return f instanceof Folder; });
          for (var j = 0; j < dirs.length; j++) { var r = findPreset(dirs[j], depth + 1); if (r) return r; }
          return null;
        }
        var base = new Folder(app.path);
        var preset = findPreset(new Folder(base.fsName + "/MediaIO/systempresets"), 0) || findPreset(new Folder(base.fsName + "/Contents/MediaIO/systempresets"), 0);
        if (!preset) return JSON.stringify({ success: false, error: "préréglage ProRes 422 HQ introuvable" });
        o.clipTransferOption = o.CLIP_TRANSFER_TRANSCODE;
        o.clipTranscoderOption = o.CLIP_TRANSCODE_MATCH_CLIPS;
        o.encoderPresetFilePath = preset.fsName;
      } else {
        o.clipTransferOption = o.CLIP_TRANSFER_COPY;
      }
      var res = pm.process(app.project);
      return JSON.stringify({ success: true, destination: dest, result: String(res) });
    })();
  `;
  const res = await evalExtendScript<any>(script, 6 * 60 * 60 * 1000);
  if (!res?.success) return { success: false, error: res?.error || 'consolidation impossible' };
  if (/error|erreur|fail|échec/i.test(String(res.result || ''))) return { success: false, error: `Premiere : ${res.result}` };
  return { success: true, destination: res.destination };
}


// ==================== components/DeliveryChecker.tsx ====================

const STATUS_STYLE: Record<CheckStatus, { icon: React.ReactNode; text: string }> = {
  error: { icon: <AlertCircle className="w-4 h-4 text-red-400" />, text: 'text-red-300' },
  warn: { icon: <AlertTriangle className="w-4 h-4 text-amber-300" />, text: 'text-amber-200' },
  ok: { icon: <CheckCircle2 className="w-4 h-4 text-emerald-300" />, text: 'text-zinc-300' },
  info: { icon: <Info className="w-4 h-4 text-zinc-400" />, text: 'text-zinc-400' },
};

/** Rapport : compteurs, lignes dépliables, copie et enregistrement */
const CheckReport: React.FC<{ title: string; results: CheckResult[]; onJump?: (seconds: number) => void; pdfMeta?: PdfReportMeta }> = ({
  title,
  results,
  onJump,
  pdfMeta,
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const errors = results.filter((r) => r.status === 'error').length;
  const warns = results.filter((r) => r.status === 'warn').length;
  const oks = results.filter((r) => r.status === 'ok').length;
  const order: CheckStatus[] = ['error', 'warn', 'ok', 'info'];
  const sorted = [...results].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const text = () => checkReportText(title, results);

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/50 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-zinc-100 truncate" title={title}>{title}</div>
          <div className="flex items-center gap-2 mt-1 text-[11px] font-semibold">
            {errors > 0 && <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">{errors} erreur{errors > 1 ? 's' : ''}</span>}
            {warns > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-200">{warns} alerte{warns > 1 ? 's' : ''}</span>}
            {errors === 0 && warns === 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200">Prêt à livrer</span>}
            <span className="text-zinc-500">{oks} OK</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text());
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {}
            }}
            title="Copier le rapport"
            className="p-1.5 rounded-full text-zinc-400 hover:text-cream-300 hover:bg-white/5 transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => {
              try {
                saveTextFile(text(), `Rapport ${title.replace(/[\\/:*?"<>|]/g, '_')}.txt`, 'txt', 'Enregistrer le rapport');
              } catch {}
            }}
            title="Enregistrer le rapport (.txt)"
            className="p-1.5 rounded-full text-zinc-400 hover:text-cream-300 hover:bg-white/5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          {pdfMeta && (
            <button
              onClick={() => {
                try {
                  savePdfFile(buildPdfReport(title, results, pdfMeta), `Rapport ${title.replace(/[\\/:*?"<>|]/g, '_')}.pdf`);
                } catch {}
              }}
              title="Enregistrer le rapport (.pdf), à joindre à la livraison"
              className="px-2 py-1 rounded-full text-[10px] font-bold text-zinc-400 hover:text-cream-300 hover:bg-white/5 transition cursor-pointer"
            >
              PDF
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {sorted.map((r) => {
          const hasDetails = !!r.details && r.details.length > 0;
          const isOpen = open[r.id] ?? r.status === 'error';
          return (
            <div key={r.id} className="px-3 py-2">
              <button
                onClick={() => hasDetails && setOpen({ ...open, [r.id]: !isOpen })}
                className={`w-full flex items-start gap-2 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="mt-0.5 flex-shrink-0">{STATUS_STYLE[r.status].icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-zinc-100">{r.label}</span>
                  <span className={`block text-[11px] leading-snug ${STATUS_STYLE[r.status].text}`}>{r.summary}</span>
                </span>
                {hasDetails && <ChevronRight className={`w-3.5 h-3.5 mt-0.5 text-zinc-500 transition ${isOpen ? 'rotate-90' : ''}`} />}
              </button>
              {hasDetails && isOpen && (
                <ul className="mt-1.5 ml-6 space-y-0.5">
                  {r.details!.map((d, i) => (
                    <li key={i}>
                      {onJump && d.seconds !== undefined ? (
                        <button
                          onClick={() => onJump(d.seconds!)}
                          title="Placer la tête de lecture ici"
                          className="text-left text-[11px] text-zinc-300 hover:text-cream-300 underline-offset-2 hover:underline cursor-pointer break-all"
                        >
                          {d.text}
                        </button>
                      ) : (
                        <span className="text-[11px] text-zinc-300 break-all">{d.text}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

type CheckerMode = 'timeline' | 'pad' | 'consolidate';

const PAD_EXTENSIONS = ['mxf', 'mov', 'mp4', 'mkv', 'wav', 'm4v', 'avi', 'mts', 'mpg', 'ts'];
const PAD_FILE_RE = new RegExp(`\\.(${PAD_EXTENSIONS.join('|')})$`, 'i');

interface BatchItem {
  path: string;
  name: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  results?: CheckResult[];
  error?: string;
  pdf?: string;
  pdfError?: string;
}

function countIssues(results: CheckResult[]) {
  return { errors: results.filter((r) => r.status === 'error').length, warns: results.filter((r) => r.status === 'warn').length };
}

/** Récapitulatif d'un lot (séparateur « ; » pour Excel en français) */
function batchRecapCsv(items: BatchItem[], presetName: string): string {
  const cell = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [['Fichier', 'Norme', 'Verdict', 'Erreurs', 'Alertes', 'Problèmes', 'Rapport PDF'].join(';')];
  for (const it of items) {
    if (it.state === 'failed') {
      rows.push([it.name, presetName, 'Illisible', '', '', it.error || '', ''].map(cell).join(';'));
      continue;
    }
    if (it.state !== 'done' || !it.results) continue;
    const { errors, warns } = countIssues(it.results);
    const problems = it.results.filter((r) => r.status === 'error' || r.status === 'warn').map((r) => `${r.label} : ${r.summary}`).join(' | ');
    rows.push(
      [it.name, presetName, errors ? 'Non conforme' : warns ? 'À vérifier' : 'Prêt à livrer', String(errors), String(warns), problems, it.pdf ? it.pdf.split(/[\\/]/).pop()! : '']
        .map(cell)
        .join(';')
    );
  }
  return rows.join('\r\n') + '\r\n';
}
const PAD_GROUPS: { id: keyof PadCheckGroups; label: string; title: string }[] = [
  { id: 'technical', label: 'Technique', title: 'Conteneur, codec, résolution, cadence, balayage, 4:2:2, débit, GOP, audio et pistes silencieuses' },
  { id: 'loudness', label: 'Loudness', title: 'Loudness intégré, LRA, True Peak, saturation' },
  { id: 'timing', label: 'Chronométrie', title: 'TC de départ, mire et 1 kHz, noir et silence avant la SOM, noirs muets et silences trop longs' },
  { id: 'levels', label: 'Niveaux légaux', title: 'Luminance dans la plage légale 16-235 (64-940 en 10 bits)' },
  { id: 'pse', label: 'Flashs (PSE)', title: 'Plus de 3 flashs par seconde (indicatif)' },
];

export const DeliveryChecker: React.FC<{
  presets: DeliveryPreset[];
  onOpenSettings: () => void;
  /** Mori Checker hors Premiere : seul le contrôle de fichier PAD est proposé */
  standalone?: boolean;
  /** fichier à analyser dès que FFmpeg est trouvé (fichier déposé sur l'icône de l'application) */
  initialFile?: string;
}> = ({ presets, onOpenSettings, standalone, initialFile }) => {
  const [nodeOk] = useState<boolean>(isNodeAvailable);
  const [tools, setTools] = useState<FfmpegTools | null>(null);
  const [mode, setMode] = useState<CheckerMode>(() => (standalone ? 'pad' : readSetting('cutflow.checkerMode', 'timeline')));
  const [presetId, setPresetId] = useState<string>(() => readSetting('cutflow.checkerPreset', ''));
  const [measureLoud, setMeasureLoud] = useState<boolean>(() => readSetting('cutflow.checkerLoudness', true));
  const [groups, setGroups] = useState<PadCheckGroups>(() =>
    readSetting('cutflow.checkerGroups', { technical: true, loudness: true, timing: true, levels: true, pse: true })
  );
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<{ text: string; ratio?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ mode: CheckerMode; title: string; results: CheckResult[] } | null>(null);
  const [padFile, setPadFile] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scope, setScope] = useState<'all' | 'used'>(() => readSetting('cutflow.consolidateScope', 'used'));
  const [trim, setTrim] = useState<boolean>(() => readSetting('cutflow.consolidateTrim', false));
  const [handles, setHandles] = useState<number>(() => readSetting('cutflow.consolidateHandles', 25));
  const [consolidateMsg, setConsolidateMsg] = useState<{ message: string; isError?: boolean } | null>(null);
  // Vérification en lot : plusieurs fichiers ou un dossier, rapport PDF à côté de chaque fichier + récap CSV
  const [batchMode, setBatchMode] = useState<boolean>(() => readSetting('cutflow.checkerBatch', false));
  const [batchPdf, setBatchPdf] = useState<boolean>(() => readSetting('cutflow.checkerBatchPdf', true));
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchSelected, setBatchSelected] = useState<number | null>(null);
  const [batchInfo, setBatchInfo] = useState<{ message: string; isError?: boolean } | null>(null);
  const batchCancelRef = useRef(false);
  useEffect(() => writeSetting('cutflow.checkerBatch', batchMode), [batchMode]);
  useEffect(() => writeSetting('cutflow.checkerBatchPdf', batchPdf), [batchPdf]);

  const preset = presets.find((p) => p.id === presetId) || presets[0];
  const insidePremiere = isRunningInPremiere();
  const productLabel = standalone ? `Mori Checker ${CHECKER_VERSION}` : `Mori Studio ${APP_VERSION}`;

  useEffect(() => {
    if (nodeOk) setTools(findFfmpegTools());
  }, [nodeOk]);
  useEffect(() => {
    if (!standalone) writeSetting('cutflow.checkerMode', mode);
  }, [mode]);
  useEffect(() => writeSetting('cutflow.checkerPreset', presetId), [presetId]);
  useEffect(() => writeSetting('cutflow.checkerLoudness', measureLoud), [measureLoud]);
  useEffect(() => writeSetting('cutflow.checkerGroups', groups), [groups]);
  useEffect(() => writeSetting('cutflow.consolidateScope', scope), [scope]);
  useEffect(() => writeSetting('cutflow.consolidateTrim', trim), [trim]);
  useEffect(() => writeSetting('cutflow.consolidateHandles', handles), [handles]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  const handleTimelineCheck = () =>
    run(async () => {
      if (!preset) throw new Error('aucune norme : créez-en une dans Réglages > Normes');
      const res = await checkTimeline({ preset, measureLoudness: measureLoud }, (text) => setStep({ text }));
      setReport({ mode: 'timeline', title: `${res.seqName} · ${preset.name}`, results: res.results });
    });

  const handlePadCheck = (file: string) =>
    run(async () => {
      if (!tools) throw new Error('FFmpeg introuvable : installez-le avec l’installeur Mori');
      if (!preset) throw new Error('aucune norme : créez-en une dans Réglages > Normes');
      setReport(null);
      const results = await checkDeliveryFile(tools, file, preset, groups, (text, ratio) => setStep({ text, ratio }));
      setReport({ mode: 'pad', title: `${file.split(/[\\/]/).pop()} · ${preset.name}`, results });
    });

  const handleConsolidate = () =>
    run(async () => {
      setConsolidateMsg({ message: 'Consolidation en cours : Premiere copie les médias, patientez…' });
      const res = await consolidateProject({ scope, trim: scope === 'used' && trim, handleFrames: handles });
      setConsolidateMsg(
        res.success
          ? { message: `Projet consolidé dans ${res.destination} (dossier « Copied_… » créé par Premiere).` }
          : { message: res.error || 'consolidation impossible', isError: true }
      );
    });

  const handleBatch = (files: string[]) =>
    run(async () => {
      if (!tools) throw new Error('FFmpeg introuvable : installez-le avec l’installeur Mori');
      if (!preset) throw new Error('aucune norme : créez-en une dans Réglages > Normes');
      const items: BatchItem[] = files.map((path) => ({ path, name: path.split(/[\\/]/).pop() || path, state: 'pending' }));
      setBatch(items);
      setBatchSelected(null);
      setBatchInfo(null);
      setReport(null);
      batchCancelRef.current = false;
      const update = (i: number, patch: Partial<BatchItem>) => {
        items[i] = { ...items[i], ...patch };
        setBatch([...items]);
      };
      for (let i = 0; i < items.length; i++) {
        if (batchCancelRef.current) break;
        update(i, { state: 'running' });
        try {
          const results = await checkDeliveryFile(tools, items[i].path, preset, groups, (text, ratio) =>
            setStep({ text: `Fichier ${i + 1}/${items.length} · ${items[i].name} : ${text}`, ratio: ratio === undefined ? undefined : (i + ratio) / items.length })
          );
          let pdf: string | undefined;
          let pdfError: string | undefined;
          if (batchPdf) {
            try {
              pdf = items[i].path.replace(/\.[^.\\/]+$/, '') + ' - Rapport Mori.pdf';
              writeBinaryFile(pdf, buildPdfReport(`${items[i].name} · ${preset.name}`, results, { product: productLabel, file: items[i].path, preset: preset.name }));
            } catch (err: any) {
              pdf = undefined;
              pdfError = err?.message || String(err);
            }
          }
          update(i, { state: 'done', results, pdf, pdfError });
        } catch (err: any) {
          update(i, { state: 'failed', error: err?.message || String(err) });
        }
      }
      const done = items.filter((x) => x.state === 'done');
      const ready = done.filter((x) => countIssues(x.results!).errors === 0 && countIssues(x.results!).warns === 0).length;
      let recap = '';
      if (batchPdf && done.length) {
        try {
          const folder = items[0].path.replace(/[\\/][^\\/]*$/, '');
          const sep = items[0].path.includes('\\') ? '\\' : '/';
          const now = new Date();
          const two = (n: number) => String(n).padStart(2, '0');
          const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}h${two(now.getMinutes())}`;
          recap = `${folder}${sep}Récap Mori ${stamp}.csv`;
          nodeRequire('fs').writeFileSync(recap, '\uFEFF' + batchRecapCsv(items, preset.name), 'utf8');
        } catch {
          recap = '';
        }
      }
      setBatchInfo({
        message:
          `${batchCancelRef.current ? 'Lot interrompu · ' : ''}${done.length}/${items.length} fichier(s) vérifié(s), ${ready} prêt(s) à livrer` +
          (batchPdf ? (recap ? ` · rapports PDF et récap enregistrés à côté des fichiers.` : ' · rapports PDF à côté des fichiers.') : '.'),
      });
    });

  /** Fichiers vidéo/audio d'une liste de chemins (un dossier déposé est parcouru, sans ses sous-dossiers) */
  const expandPaths = (paths: string[]): string[] => {
    const fs = nodeRequire('fs');
    const pathMod = nodeRequire('path');
    const out: string[] = [];
    for (const p of paths) {
      try {
        if (fs && pathMod && fs.statSync(p).isDirectory()) {
          for (const f of fs.readdirSync(p).sort((a: string, b: string) => a.localeCompare(b))) {
            if (PAD_FILE_RE.test(f) && !/ - Rapport Mori\.pdf$/i.test(f)) out.push(pathMod.join(p, f));
          }
          continue;
        }
      } catch {}
      if (PAD_FILE_RE.test(p)) out.push(p);
    }
    return out;
  };

  const onDropFile = (paths: string[]) => {
    if (busy || paths.length === 0) return;
    if (batchMode) {
      const files = expandPaths(paths);
      if (files.length === 0) {
        setBatchInfo({ isError: true, message: 'Aucun fichier vidéo ou audio (MXF, MOV, MP4, MKV, WAV…) dans la sélection.' });
        return;
      }
      handleBatch(files);
      return;
    }
    const f = paths[0];
    setPadFile(f);
    handlePadCheck(f);
  };

  const pickPadFile = (folder = false) => {
    const cep = (window as any).cep;
    if (cep?.fs?.showOpenDialogEx) {
      const res = folder
        ? cep.fs.showOpenDialogEx(false, true, 'Choisir le dossier des masters à vérifier', '', [])
        : cep.fs.showOpenDialogEx(batchMode, false, batchMode ? 'Choisir les fichiers à vérifier' : 'Choisir le fichier à vérifier', '', PAD_EXTENSIONS);
      if (res.err === 0 && Array.isArray(res.data) && res.data[0]) onDropFile(res.data);
      return;
    }
    // hors Premiere (Mori Checker) : sélecteur de fichiers (ou de dossier) du système
    const input = document.createElement('input');
    input.type = 'file';
    if (folder) (input as any).webkitdirectory = true;
    else input.accept = PAD_EXTENSIONS.map((e) => '.' + e).join(',');
    input.multiple = batchMode || folder;
    input.onchange = () => {
      const pathOf = (window as any).__moriPathForFile;
      const paths = Array.from(input.files || [])
        .map((f) => (f as any).path || (typeof pathOf === 'function' ? pathOf(f) : ''))
        .filter(Boolean);
      if (paths.length) onDropFile(paths);
    };
    input.click();
  };

  // fichier transmis au lancement : analysé une fois FFmpeg localisé
  const initialDoneRef = useRef(false);
  useEffect(() => {
    if (!initialFile || !tools || initialDoneRef.current) return;
    initialDoneRef.current = true;
    onDropFile([initialFile]);
  }, [initialFile, tools]);

  const selectClass =
    'flex-1 min-w-0 bg-zinc-950 border border-white/10 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 focus:outline-none focus:border-emerald-400 cursor-pointer';
  const modes: { id: CheckerMode; label: string }[] = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'pad', label: 'Fichier PAD' },
    { id: 'consolidate', label: 'Consolider' },
  ];

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-3 space-y-3">
        {!standalone && (
        <div className="flex justify-center">
          <div className="flex items-center gap-1 bg-zinc-950/70 border border-white/10 rounded-full p-0.5">
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                disabled={busy}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer disabled:cursor-default ${
                  mode === m.id ? 'bg-cream-300 text-ink' : 'text-zinc-300 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        )}

        {mode !== 'consolidate' && (
          <div className="flex items-center gap-2">
            <select value={preset?.id || ''} onChange={(e) => setPresetId(e.target.value)} disabled={busy} className={selectClass} title="Norme de livraison">
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={onOpenSettings}
              title="Créer ou modifier les normes (Réglages > Normes)"
              className="p-2 rounded-full border border-white/15 text-zinc-300 hover:text-cream-300 hover:border-cream-300/60 transition cursor-pointer flex-shrink-0"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {mode !== 'consolidate' && preset && <div className="text-[10px] text-zinc-500 text-center -mt-1">{describeDeliveryPreset(preset)}</div>}

        {mode === 'timeline' && (
          <div className="space-y-2.5">
            {!insidePremiere && <StatusMessage isError message="Ouvrez le panneau dans Premiere Pro pour vérifier une séquence." />}
            <label className="flex items-center justify-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none" title="Exporte le mixage de la séquence en WAV temporaire puis mesure LUFS, True Peak et saturation">
              <input type="checkbox" checked={measureLoud} onChange={(e) => setMeasureLoud(e.target.checked)} className="accent-emerald-400 w-3.5 h-3.5 cursor-pointer" />
              Mesurer le loudness du mixage (export audio de la séquence)
            </label>
            <PrimaryButton onClick={handleTimelineCheck} disabled={busy || !insidePremiere} className="w-full">
              <ListChecks className="w-4 h-4" />
              {busy ? 'Vérification…' : 'Vérifier la séquence active'}
            </PrimaryButton>
            <p className="text-[10px] text-zinc-500 text-center leading-snug">
              Hors ligne, trous, pistes muettes, disque système, cadences, résolutions, pixels, 44,1/48 kHz, effets et polices manquants
              {measureLoud ? ', loudness, True Peak, saturation' : ''}.
            </p>
          </div>
        )}

        {mode === 'pad' && (
          <div className="space-y-2.5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (tools && !busy) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (tools) onDropFile(pathsFromDrop(e.dataTransfer));
              }}
              onClick={() => tools && !busy && pickPadFile()}
              className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                !tools || busy
                  ? 'border-white/10 opacity-60'
                  : isDragging
                  ? 'border-emerald-300 bg-emerald-400/10 cursor-copy'
                  : 'border-white/15 hover:border-white/30 bg-white/[0.02] cursor-pointer'
              }`}
            >
              <ShieldCheck className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-emerald-200' : 'text-zinc-400'}`} />
              {batchMode ? (
                <>
                  <div className="text-sm font-semibold text-zinc-100">Déposez les masters ou un dossier</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">Chaque fichier est vérifié selon la norme choisie, l'un après l'autre</div>
                  <div className="text-[11px] mt-2 flex items-center justify-center gap-3">
                    <span className="text-emerald-300 underline">fichiers…</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tools && !busy) pickPadFile(true);
                      }}
                      className="text-emerald-300 underline"
                    >
                      dossier…
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-zinc-100 truncate">{padFile ? padFile.split(/[\\/]/).pop() : 'Déposez le master à vérifier'}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">MXF, MOV, MP4… vérifié selon la norme choisie</div>
                  <div className="text-[11px] text-emerald-300 mt-2 underline">{padFile ? 'autre fichier…' : 'ou parcourir…'}</div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-300">
              <label className="flex items-center gap-2 cursor-pointer select-none" title="Plusieurs fichiers ou un dossier entier, avec un récapitulatif">
                <ToggleSwitch on={batchMode} onChange={(on) => !busy && setBatchMode(on)} />
                Vérifier en lot
              </label>
              {batchMode && (
                <label
                  className="flex items-center gap-2 cursor-pointer select-none"
                  title="« <nom> - Rapport Mori.pdf » à côté de chaque fichier, et un récap CSV dans le dossier"
                >
                  <input type="checkbox" checked={batchPdf} onChange={(e) => setBatchPdf(e.target.checked)} disabled={busy} className="accent-emerald-400 w-3.5 h-3.5 cursor-pointer" />
                  Rapports PDF à côté des fichiers
                </label>
              )}
            </div>
            {!tools && nodeOk && <StatusMessage isError message="FFmpeg introuvable : relancez l'installeur Mori." />}
            <div className="flex flex-wrap justify-center gap-1.5">
              {PAD_GROUPS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGroups({ ...groups, [g.id]: !groups[g.id] })}
                  disabled={busy}
                  title={g.title}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition cursor-pointer disabled:cursor-default ${
                    groups[g.id] ? 'border-emerald-300/70 bg-emerald-400/10 text-emerald-100' : 'border-white/10 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {!batchMode && padFile && !busy && (
              <button onClick={() => handlePadCheck(padFile)} className="w-full text-[11px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer">
                Relancer l'analyse
              </button>
            )}
            {batchMode && busy && batch.length > 0 && (
              <button
                onClick={() => (batchCancelRef.current = true)}
                className="w-full text-[11px] text-zinc-400 hover:text-red-300 underline cursor-pointer"
                title="S'arrête après le fichier en cours"
              >
                Arrêter le lot
              </button>
            )}
            {batchMode && batchInfo && !busy && <StatusMessage isError={batchInfo.isError} message={batchInfo.message} />}
          </div>
        )}

        {mode === 'consolidate' && (
          <div className="space-y-2.5">
            {!insidePremiere && <StatusMessage isError message="Ouvrez le panneau dans Premiere Pro pour consolider le projet." />}
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'used' as const, label: 'Médias utilisés', title: 'Seulement ce qui sert dans la séquence active' },
                { id: 'all' as const, label: 'Projet entier', title: 'Tous les médias et toutes les séquences du projet' },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => setScope(o.id)}
                  disabled={busy}
                  className={`rounded-lg border px-2.5 py-2 text-left transition cursor-pointer disabled:cursor-default ${
                    scope === o.id ? 'border-cream-300/70 bg-cream-300/10' : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className={`text-xs font-semibold ${scope === o.id ? 'text-cream-300' : 'text-zinc-200'}`}>{o.label}</div>
                  <div className="text-[10px] text-zinc-400 leading-snug">{o.title}</div>
                </button>
              ))}
            </div>
            {scope === 'used' && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
                <label className="flex items-center gap-2 cursor-pointer select-none" title="Ne garde que les passages utilisés (réencodés en ProRes 422 HQ)">
                  <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} className="accent-emerald-400 w-3.5 h-3.5 cursor-pointer" />
                  Rogner aux plans utilisés
                </label>
                {trim && (
                  <label className="flex items-center gap-1.5">
                    Poignées
                    <input
                      type="number"
                      min={0}
                      value={handles}
                      onChange={(e) => setHandles(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-14 bg-zinc-950 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white font-mono text-right focus:outline-none focus:border-emerald-400"
                    />
                    images
                  </label>
                )}
              </div>
            )}
            <PrimaryButton onClick={handleConsolidate} disabled={busy || !insidePremiere} className="w-full">
              <Archive className="w-4 h-4" />
              {busy ? 'Consolidation…' : 'Consolider dans le dossier du projet'}
            </PrimaryButton>
            <p className="text-[10px] text-zinc-500 text-center leading-snug">
              Premiere copie le projet et {scope === 'used' ? 'les médias utilisés' : 'tous les médias'} dans un dossier « Copied_… » à côté du
              .prproj{scope === 'used' && trim ? ', rognés avec poignées et réencodés en ProRes 422 HQ' : ', fichiers entiers'}. Le projet d'origine
              n'est pas modifié.
            </p>
            {consolidateMsg && <StatusMessage isError={consolidateMsg.isError} busy={busy} message={consolidateMsg.message} />}
          </div>
        )}

        {busy && step && (
          <div className="space-y-1">
            <StatusMessage busy message={step.text} />
            {step.ratio !== undefined && (
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-emerald-300 transition-all duration-300" style={{ width: `${Math.round(step.ratio * 100)}%` }} />
              </div>
            )}
          </div>
        )}
        {error && <StatusMessage isError message={error} />}
      </section>

      {mode === 'pad' && batchMode && batch.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-100">Lot · {batch.length} fichier(s)</span>
            {!busy && batch.some((b) => b.state === 'done' || b.state === 'failed') && (
              <button
                onClick={() => {
                  try {
                    saveTextFile('\uFEFF' + batchRecapCsv(batch, preset?.name || ''), 'Récap Mori.csv', 'csv', 'Enregistrer le récap du lot');
                  } catch {}
                }}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-cream-300 cursor-pointer"
                title="Tableau : fichier, verdict, erreurs, alertes, problèmes"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Récap .csv
              </button>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {batch.map((b, i) => {
              const issues = b.results ? countIssues(b.results) : null;
              return (
                <button
                  key={b.path}
                  onClick={() => b.results && setBatchSelected(batchSelected === i ? null : i)}
                  className={`w-full px-3 py-2 flex items-center gap-2 text-left transition ${b.results ? 'cursor-pointer hover:bg-white/[0.03]' : 'cursor-default'} ${
                    batchSelected === i ? 'bg-white/[0.05]' : ''
                  }`}
                  title={b.error || b.pdfError || b.path}
                >
                  <span className="flex-shrink-0">
                    {b.state === 'pending' && <Clock className="w-4 h-4 text-zinc-500" />}
                    {b.state === 'running' && <Activity className="w-4 h-4 text-emerald-300 animate-pulse" />}
                    {b.state === 'failed' && <AlertCircle className="w-4 h-4 text-red-400" />}
                    {b.state === 'done' && issues && STATUS_STYLE[issues.errors ? 'error' : issues.warns ? 'warn' : 'ok'].icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-zinc-100 truncate">{b.name}</span>
                    <span className="block text-[10px] text-zinc-400 truncate">
                      {b.state === 'pending' && 'en attente'}
                      {b.state === 'running' && 'analyse en cours…'}
                      {b.state === 'failed' && `illisible : ${b.error}`}
                      {b.state === 'done' && issues &&
                        (issues.errors || issues.warns ? `${issues.errors} erreur(s), ${issues.warns} alerte(s)` : 'Prêt à livrer') +
                          (b.pdf ? ' · PDF enregistré' : b.pdfError ? ' · PDF non enregistré' : '')}
                    </span>
                  </span>
                  {b.results && <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 transition ${batchSelected === i ? 'rotate-90' : ''}`} />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {mode === 'pad' && batchMode && batchSelected !== null && batch[batchSelected]?.results && (
        <CheckReport
          title={`${batch[batchSelected].name} · ${preset?.name || ''}`}
          results={batch[batchSelected].results!}
          pdfMeta={{ product: productLabel, file: batch[batchSelected].path, preset: preset?.name }}
        />
      )}

      {report && report.mode === mode && !(mode === 'pad' && batchMode) && (
        <CheckReport
          title={report.title}
          results={report.results}
          onJump={report.mode === 'timeline' ? (s) => movePlayheadTo(s).catch(() => {}) : undefined}
          pdfMeta={{ product: productLabel, file: report.mode === 'pad' ? padFile || undefined : undefined, preset: preset?.name }}
        />
      )}
    </div>
  );
};

/** Réglages > Normes : normes de livraison modifiables, partageables par code */
const NormsSettings: React.FC<{ presets: DeliveryPreset[]; onChange: (presets: DeliveryPreset[]) => void }> = ({ presets, onChange }) => {
  const [selectedId, setSelectedId] = useState<string>(presets[0]?.id || '');
  const [exportCode, setExportCode] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const p = presets.find((x) => x.id === selectedId) || presets[0];

  const update = (patch: Partial<DeliveryPreset>) => onChange(presets.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
  const numField = (key: keyof DeliveryPreset, label: string, unit = '', step = 1) => (
    <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          value={(p as any)[key] ?? ''}
          placeholder="—"
          onChange={(e) => update({ [key]: e.target.value === '' ? null : parseFloat(e.target.value) } as any)}
          className="w-20 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white font-mono text-right focus:outline-none focus:border-emerald-500"
        />
        <span className="w-9 text-zinc-500">{unit}</span>
      </span>
    </label>
  );
  const textField = (key: keyof DeliveryPreset, label: string, placeholder: string) => (
    <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
      <span>{label}</span>
      <input
        type="text"
        value={(p as any)[key] ?? ''}
        placeholder={placeholder}
        onChange={(e) => update({ [key]: e.target.value.trim() === '' ? null : e.target.value.trim() } as any)}
        className="w-[7.6rem] bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
      />
    </label>
  );
  const selectField = (key: keyof DeliveryPreset, label: string, options: [string, string][]) => (
    <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
      <span>{label}</span>
      <select
        value={(p as any)[key] ?? ''}
        onChange={(e) => update({ [key]: e.target.value === '' ? null : e.target.value } as any)}
        className="w-[7.6rem] bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
      >
        <option value="">— non vérifié</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const boolField = (key: keyof DeliveryPreset, label: string) => (
    <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
      <input type="checkbox" checked={!!(p as any)[key]} onChange={(e) => update({ [key]: e.target.checked } as any)} className="accent-emerald-400 w-3.5 h-3.5 cursor-pointer" />
      {label}
    </label>
  );
  const pill = 'flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default';
  const group = (title: string, children: React.ReactNode) => (
    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 space-y-1.5">
      <div className="font-bold text-white text-[11px]">{title}</div>
      {children}
    </div>
  );

  const addPreset = (base?: DeliveryPreset) => {
    const fresh: DeliveryPreset = { ...(base || DEFAULT_DELIVERY_PRESETS[0]), id: `norm-${Date.now()}`, name: base ? `${base.name} (copie)` : 'Nouvelle norme', builtIn: false };
    onChange([...presets, fresh]);
    setSelectedId(fresh.id);
  };

  if (!p)
    return (
      <div className="space-y-2">
        <p className="text-zinc-300 text-[11px]">Aucune norme.</p>
        <button type="button" onClick={() => onChange(DEFAULT_DELIVERY_PRESETS.map((x) => ({ ...x })))} className={pill}>
          <RotateCcw className="w-3 h-3" />
          Normes par défaut
        </button>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-zinc-300 text-[11px] leading-snug">
        Normes utilisées par le Checker (timeline et fichier PAD). Un champ vide n'est pas vérifié. Les exemples fournis sont à ajuster au cahier
        des charges de chaque diffuseur.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((x) => (
          <span key={x.id} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => setSelectedId(x.id)}
              className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition cursor-pointer ${
                x.id === p.id ? 'border-cream-300 text-cream-300' : 'border-white/15 text-zinc-200 hover:border-white/30'
              }`}
            >
              {x.name}
            </button>
            {presets.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  onChange(presets.filter((y) => y.id !== x.id));
                  if (x.id === p.id) setSelectedId(presets.find((y) => y.id !== x.id)?.id || '');
                }}
                className="ml-0.5 p-0.5 text-zinc-500 hover:text-red-400 cursor-pointer"
                title="Supprimer cette norme"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => addPreset()} className={pill}>
          <Plus className="w-3 h-3" />
          Nouvelle
        </button>
        <button type="button" onClick={() => addPreset(p)} className={pill}>
          <Copy className="w-3 h-3" />
          Dupliquer
        </button>
        <button
          type="button"
          onClick={async () => {
            const code = exportDeliveryPresetCode(p);
            setExportCode(code);
            try {
              await navigator.clipboard.writeText(code);
            } catch {}
          }}
          className={pill}
        >
          <Send className="w-3 h-3" />
          Exporter
        </button>
        <button type="button" onClick={() => setShowImport(!showImport)} className={pill}>
          <Download className="w-3 h-3" />
          Importer
        </button>
        <button type="button" onClick={() => onChange(DEFAULT_DELIVERY_PRESETS.map((x) => ({ ...x })))} className={pill} title="Remet les normes fournies (supprime les autres)">
          <RotateCcw className="w-3 h-3" />
          Réinitialiser
        </button>
      </div>
      {exportCode && (
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-400">Code copié dans le presse-papiers, à envoyer tel quel à l'équipe :</p>
          <textarea readOnly value={exportCode} rows={3} onFocus={(e) => e.target.select()} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-300 resize-none focus:outline-none" />
        </div>
      )}
      {showImport && (
        <div className="space-y-1.5">
          <textarea
            value={importCode}
            onChange={(e) => setImportCode(e.target.value)}
            rows={3}
            placeholder='Collez un code de norme : {"moriNorm":1,"name":…}'
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-200 resize-none focus:outline-none focus:border-emerald-500"
          />
          {importError && <p className="text-[11px] text-red-400">{importError}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!importCode.trim()}
              onClick={() => {
                try {
                  const imported = parseDeliveryPresetCode(importCode);
                  onChange([...presets.filter((x) => x.name !== imported.name), imported]);
                  setSelectedId(imported.id);
                  setImportCode('');
                  setImportError(null);
                  setShowImport(false);
                } catch (err: any) {
                  setImportError(err?.message || String(err));
                }
              }}
              className={pill}
            >
              <Check className="w-3 h-3" />
              Ajouter
            </button>
          </div>
        </div>
      )}

      <input
        type="text"
        value={p.name}
        onChange={(e) => update({ name: e.target.value.slice(0, 60) })}
        className="w-full bg-zinc-950 border border-zinc-700 rounded-full px-3 py-1 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500"
        placeholder="Nom de la norme"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {group('Loudness', (
          <>
            {numField('lufs', 'Loudness intégré', 'LUFS', 0.5)}
            <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
              <span>Type de valeur</span>
              <select
                value={p.lufsMode || 'target'}
                onChange={(e) => update({ lufsMode: e.target.value === 'max' ? 'max' : 'target' })}
                className="w-[7.6rem] bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="target">Cible ± tolérance</option>
                <option value="max">Maximum</option>
              </select>
            </label>
            {p.lufsMode !== 'max' && numField('lufsTol', 'Tolérance ±', 'LU', 0.5)}
            {numField('truePeakMax', 'True Peak max', 'dBTP', 0.5)}
            {numField('lraMax', 'LRA max', 'LU', 1)}
          </>
        ))}
        {group('Audio', (
          <>
            {numField('sampleRate', 'Échantillonnage', 'Hz', 100)}
            {numField('bitDepth', 'Quantification', 'bits', 8)}
            {numField('minChannels', 'Canaux min.', '', 1)}
            {textField('silentChannels', 'Pistes en silence', '3-8')}
            {boolField('audioPcm', 'PCM non compressé')}
          </>
        ))}
        {group('Vidéo (fichier PAD)', (
          <>
            {selectField('container', 'Conteneur', [['mxf', 'MXF'], ['mov', 'MOV'], ['mp4', 'MP4']])}
            {selectField('videoCodec', 'Codec', [['mpeg2video', 'MPEG-2 (XDCAM)'], ['prores', 'ProRes'], ['dnxhd', 'DNxHD / DNxHR'], ['h264', 'H.264'], ['hevc', 'H.265'], ['jpeg2000', 'JPEG 2000']])}
            {numField('width', 'Largeur', 'px')}
            {numField('height', 'Hauteur', 'px')}
            {numField('fps', 'Cadence', 'i/s', 0.001)}
            {selectField('scan', 'Balayage', [['tff', 'Entrelacé TFF'], ['bff', 'Entrelacé BFF'], ['progressive', 'Progressif']])}
            {selectField('chroma', 'Chroma', [['422', '4:2:2'], ['420', '4:2:0'], ['444', '4:4:4']])}
            {numField('bitrateMbps', 'Débit (±10 %)', 'Mb/s')}
            {numField('gopN', 'GOP N (longueur)', 'img', 1)}
            {numField('gopM', 'GOP M (écart I/P)', 'img', 1)}
            {boolField('gopClosed', 'GOP fermé')}
            {boolField('legalLevels', 'Niveaux légaux (16-235)')}
            {boolField('pse', 'Flashs PSE (3/s max)')}
          </>
        ))}
        {group('Chronométrie (fichier PAD)', (
          <>
            {textField('startTc', 'TC de départ', '09:59:00:00')}
            {textField('somTc', 'SOM (début programme)', '10:00:00:00')}
            {numField('blackBeforeSom', 'Noir + silence avant SOM', 's', 1)}
            {numField('maxBlackMuted', 'Noir muet max', 's', 1)}
            {numField('maxSilence', 'Silence complet max', 's', 1)}
            {boolField('tone', 'Mire avec 1 kHz à -18 dBFS')}
          </>
        ))}
      </div>
    </div>
  );
};


// ==================== utils/profiles.ts ====================
// Profil = tous les réglages d'un coup, chaque catégorie avec ses presets ; exportable en un seul code pour l'équipe.

export type ProfileCategory = 'audio' | 'bins' | 'markers' | 'norms' | 'appearance';

export interface ProfileData {
  audio: AudioSettings;
  binRules: BinRule[];
  musicThreshold: number;
  binPresets: BinPreset[];
  markerCategories: MarkerCategory[];
  deliveryPresets: DeliveryPreset[];
  appearance: { theme: ThemeColors; brandLabel: string; brandColor: string; visibleTabs: ActiveTab[]; userPresets: ThemePreset[] };
}

export interface Profile {
  id: string;
  name: string;
  data: ProfileData;
}

export const PROFILE_CATEGORIES: { id: ProfileCategory; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'bins', label: 'Chutiers' },
  { id: 'markers', label: 'Marqueurs' },
  { id: 'norms', label: 'Normes' },
  { id: 'appearance', label: 'Apparence' },
];

const PROFILES_KEY = 'cutflow.profiles';
export function loadProfiles(): Profile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
    if (Array.isArray(parsed)) return parsed.filter((p) => p && p.name && p.data);
  } catch {}
  return [];
}
export function saveProfiles(profiles: Profile[]) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {}
}

const AUDIO_SETTINGS_KEY = 'cutflow.audioSettings';
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { sampleRate: 48000, bitDepth: 24, autoConvertOnImport: true, timelineReplacementMode: 'replaceMedia' };
export function loadAudioSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) || 'null');
    if (saved && typeof saved === 'object') return sanitizeAudioSettings(saved);
  } catch {}
  return { ...DEFAULT_AUDIO_SETTINGS };
}
export function saveAudioSettings(settings: AudioSettings) {
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
function sanitizeAudioSettings(a: any): AudioSettings {
  return {
    sampleRate: [44100, 48000, 96000].includes(+a?.sampleRate) ? +a.sampleRate : DEFAULT_AUDIO_SETTINGS.sampleRate,
    bitDepth: [16, 24, 32].includes(+a?.bitDepth) ? +a.bitDepth : DEFAULT_AUDIO_SETTINGS.bitDepth,
    autoConvertOnImport: a?.autoConvertOnImport !== undefined ? !!a.autoConvertOnImport : DEFAULT_AUDIO_SETTINGS.autoConvertOnImport,
    timelineReplacementMode: a?.timelineReplacementMode === 'deleteAndReinsert' ? 'deleteAndReinsert' : 'replaceMedia',
  } as AudioSettings;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Résumé d'une catégorie du profil : « 6 chutiers · seuil 1 min · 2 presets » */
export function describeProfileCategory(cat: ProfileCategory, d: ProfileData): string {
  switch (cat) {
    case 'audio':
      return `WAV ${fmtNum(d.audio.sampleRate / 1000, d.audio.sampleRate % 1000 ? 1 : 0)} kHz · ${d.audio.bitDepth} bits`;
    case 'bins': {
      const subs = d.binRules.reduce((n, r) => n + (r.subBins?.length || 0), 0);
      const t = d.musicThreshold;
      return [
        `${d.binRules.length} chutier(s)`,
        subs ? `${subs} sous-chutier(s)` : '',
        `seuil ${t >= 60 ? `${Math.floor(t / 60)} min` : ''}${t % 60 ? ` ${t % 60} s` : ''}`.replace('seuil  ', 'seuil '),
        d.binPresets.length ? `${d.binPresets.length} preset(s)` : '',
      ].filter(Boolean).join(' · ');
    }
    case 'markers':
      return `${d.markerCategories.length} catégorie(s) : ${d.markerCategories.slice(0, 3).map((c) => c.name).join(', ')}${d.markerCategories.length > 3 ? '…' : ''}`;
    case 'norms':
      return `${d.deliveryPresets.length} norme(s) : ${d.deliveryPresets.slice(0, 2).map((p) => p.name).join(', ')}${d.deliveryPresets.length > 2 ? '…' : ''}`;
    case 'appearance':
      return [
        `« ${d.appearance.brandLabel || 'Studio'} »`,
        `${d.appearance.visibleTabs.length} onglet(s)`,
        d.appearance.userPresets.length ? `${d.appearance.userPresets.length} thème(s)` : '',
      ].filter(Boolean).join(' · ');
  }
}

export function sameProfileCategory(cat: ProfileCategory, a: ProfileData, b: ProfileData): boolean {
  const pick = (d: ProfileData) =>
    cat === 'audio' ? d.audio
    : cat === 'bins' ? [portableBinRules(d.binRules), d.musicThreshold, d.binPresets.map((p) => [p.name, portableBinRules(p.rules), p.musicThreshold])]
    : cat === 'markers' ? d.markerCategories.map(({ name, color, keywords, track }) => [name, color, keywords, track || ''])
    : cat === 'norms' ? d.deliveryPresets.map(({ id, builtIn, ...rest }) => rest)
    : [d.appearance.theme, d.appearance.brandLabel, d.appearance.brandColor, d.appearance.visibleTabs, d.appearance.userPresets.map(({ id, ...rest }) => rest)];
  return JSON.stringify(pick(a)) === JSON.stringify(pick(b));
}

export function exportProfileCode(name: string, data: ProfileData): string {
  return JSON.stringify({ moriProfile: 1, name, data });
}

/** Lecture d'un code de profil ; chaque catégorie est vérifiée, une catégorie illisible est remplacée par ses valeurs par défaut */
export function parseProfileCode(code: string): Profile {
  let raw: any;
  try {
    raw = JSON.parse(code.trim());
  } catch {
    throw new Error('code illisible : collez le texte obtenu avec « Exporter »');
  }
  if (!raw || raw.moriProfile !== 1 || !raw.data) throw new Error('ce code ne contient pas de profil Mori');
  const d = raw.data;
  const stamp = Date.now();
  // les chutiers passent par le lecteur des presets de chutiers (noms, rôles, extensions, mots-clés, sous-chutiers)
  const binsFrom = (rules: any, threshold: any) => {
    try {
      return Array.isArray(rules) && rules.length
        ? parseBinPresetCode(JSON.stringify({ moriBins: 1, name: 'x', musicThreshold: threshold, rules: portableBinRules(rules.filter((r: any) => r && r.binName)) }))
        : null;
    } catch {
      return null;
    }
  };
  const bins = binsFrom(d.binRules, d.musicThreshold);
  const theme = d.appearance?.theme || {};
  const hex = (v: any, fallback: string) => normalizeHex(String(v || '')) || fallback;
  const data: ProfileData = {
    audio: sanitizeAudioSettings(d.audio),
    binRules: bins ? bins.rules : defaultBinRules(),
    musicThreshold: bins ? bins.musicThreshold : DEFAULT_MUSIC_SFX_THRESHOLD,
    binPresets: (Array.isArray(d.binPresets) ? d.binPresets : [])
      .map((p: any, i: number) => {
        const parsed = binsFrom(p?.rules, p?.musicThreshold);
        return parsed ? { ...parsed, id: `bin-preset-${stamp}-${i}`, name: String(p.name || 'Preset').slice(0, 40) } : null;
      })
      .filter(Boolean) as BinPreset[],
    markerCategories: Array.isArray(d.markerCategories) && d.markerCategories.length
      ? d.markerCategories
          .filter((c: any) => c && c.name)
          .map((c: any, i: number) => ({
            id: String(c.id || `cat-${stamp}-${i}`),
            name: String(c.name).slice(0, 40),
            color: MARKER_COLORS.some((m) => m.value === c.color) ? c.color : 'Green',
            keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
            ...(c.track ? { track: c.track } : {}),
          }))
      : defaultMarkerCategories(),
    deliveryPresets: Array.isArray(d.deliveryPresets) && d.deliveryPresets.length
      ? d.deliveryPresets.map((p: any, i: number) => ({ ...parseDeliveryPresetCode(JSON.stringify({ ...p, moriNorm: 1 })), id: `norm-${stamp}-${i}`, builtIn: false }))
      : DEFAULT_DELIVERY_PRESETS.map((p) => ({ ...p })),
    appearance: {
      theme: {
        background: hex(theme.background, DEFAULT_APPEARANCE.theme.background),
        accent: hex(theme.accent, DEFAULT_APPEARANCE.theme.accent),
        primary: hex(theme.primary, DEFAULT_APPEARANCE.theme.primary),
      },
      brandLabel: typeof d.appearance?.brandLabel === 'string' ? d.appearance.brandLabel.slice(0, 32) : DEFAULT_APPEARANCE.brandLabel,
      brandColor: hex(d.appearance?.brandColor, DEFAULT_APPEARANCE.brandColor),
      visibleTabs: (() => {
        const tabs = Array.isArray(d.appearance?.visibleTabs) ? ALL_TABS.filter((t) => d.appearance.visibleTabs.includes(t)) : [];
        return tabs.length ? tabs : [...ALL_TABS];
      })(),
      userPresets: (Array.isArray(d.appearance?.userPresets) ? d.appearance.userPresets : [])
        .map((p: any, i: number) => {
          try {
            return { ...parsePresetCode(JSON.stringify(p)), id: `preset-${stamp}-${i}` };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as ThemePreset[],
    },
  };
  return { id: `profile-${stamp}`, name: String(raw.name || 'Profil importé').slice(0, 40), data };
}


// ==================== components/ProfilesSection.tsx ====================

/** Réglages > Configuration : profils (ensemble des presets de chaque catégorie) */
const ProfilesSection: React.FC<{ current: ProfileData; onApply: (data: ProfileData, categories: ProfileCategory[]) => void }> = ({ current, onApply }) => {
  const [profiles, setProfiles] = useState<Profile[]>(loadProfiles);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<ProfileCategory, boolean>>({ audio: true, bins: true, markers: true, norms: true, appearance: true });
  const [name, setName] = useState('');
  const [exportCode, setExportCode] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const update = (next: Profile[]) => {
    setProfiles(next);
    saveProfiles(next);
  };
  const selected = profiles.find((p) => p.id === selectedId) || null;
  const isActive = (p: Profile) => PROFILE_CATEGORIES.every((c) => sameProfileCategory(c.id, p.data, current));
  const pill = 'flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default';

  const handleSave = () => {
    const n = name.trim();
    if (!n) return;
    const existing = profiles.find((p) => p.name === n);
    const profile: Profile = { id: existing?.id || `profile-${Date.now()}`, name: n, data: clone(current) };
    update(existing ? profiles.map((p) => (p.id === existing.id ? profile : p)) : [...profiles, profile]);
    setSelectedId(profile.id);
    setName('');
  };

  const handleExport = async () => {
    const active = profiles.find(isActive);
    const code = exportProfileCode(name.trim() || selected?.name || active?.name || 'Mon profil', selected ? selected.data : current);
    setExportCode(code);
    try {
      await navigator.clipboard.writeText(code);
    } catch {}
  };

  const handleImport = () => {
    try {
      const profile = parseProfileCode(importCode);
      update([...profiles.filter((p) => p.name !== profile.name), profile]);
      setSelectedId(profile.id);
      setImportCode('');
      setImportError(null);
      setShowImport(false);
    } catch (err: any) {
      setImportError(err?.message || String(err));
    }
  };

  const handleApply = () => {
    if (!selected) return;
    const cats = PROFILE_CATEGORIES.map((c) => c.id).filter((c) => checked[c]);
    onApply(clone(selected.data), cats);
    setApplied(selected.name);
    setTimeout(() => setApplied(null), 2000);
  };

  return (
    <div className="space-y-2">
      <div>
        <h3 className="font-bold text-white text-xs">Profils</h3>
        <p className="text-zinc-300 text-[11px] leading-snug">
          Un profil regroupe tous les réglages : audio, chutiers, marqueurs, normes et apparence, chacun avec ses presets. Exportez-le en un seul
          code pour configurer un poste de l'équipe.
        </p>
      </div>

      {profiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profiles.map((p) => (
            <span key={p.id} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition cursor-pointer ${
                  selectedId === p.id ? 'border-cream-300 bg-cream-300/10 text-cream-300' : isActive(p) ? 'border-emerald-300/60 text-emerald-200' : 'border-white/15 text-zinc-200 hover:border-white/30'
                }`}
                title={isActive(p) ? 'Profil en cours d’utilisation' : 'Voir le contenu du profil'}
              >
                {isActive(p) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />}
                {p.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  update(profiles.filter((x) => x.id !== p.id));
                  if (selectedId === p.id) setSelectedId(null);
                }}
                className="ml-0.5 p-0.5 text-zinc-500 hover:text-red-400 cursor-pointer"
                title="Supprimer ce profil"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-lg bg-zinc-950 border border-cream-300/30 p-2.5 space-y-1.5">
          <div className="text-[11px] font-bold text-cream-300">Contenu de « {selected.name} »</div>
          {PROFILE_CATEGORIES.map((c) => {
            const same = sameProfileCategory(c.id, selected.data, current);
            return (
              <label key={c.id} className="flex items-start gap-2 text-[11px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked[c.id]}
                  onChange={(e) => setChecked({ ...checked, [c.id]: e.target.checked })}
                  className="accent-emerald-400 w-3.5 h-3.5 mt-0.5 cursor-pointer flex-shrink-0"
                />
                <span className="min-w-0">
                  <span className="font-semibold text-zinc-100">{c.label}</span>
                  <span className="text-zinc-400"> · {describeProfileCategory(c.id, selected.data)}</span>
                  {same && <span className="text-emerald-300/80"> · identique</span>}
                </span>
              </label>
            );
          })}
          <div className="flex items-center justify-end gap-2 pt-1">
            {applied && <span className="text-[11px] text-emerald-300">Profil appliqué</span>}
            <button
              type="button"
              onClick={handleApply}
              disabled={!PROFILE_CATEGORIES.some((c) => checked[c.id])}
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-cream-300 hover:bg-cream-200 text-ink text-[11px] font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              <Check className="w-3 h-3" />
              Appliquer {PROFILE_CATEGORIES.every((c) => checked[c.id]) ? 'le profil' : 'la sélection'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Nom du profil"
          className="flex-1 min-w-[8rem] bg-zinc-950 border border-zinc-800 rounded-full px-3 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500"
        />
        <button type="button" onClick={handleSave} disabled={!name.trim()} className={pill} title="Enregistre tous les réglages actuels sous ce nom">
          <Plus className="w-3 h-3" />
          Enregistrer
        </button>
        <button type="button" onClick={handleExport} className={pill} title={selected ? `Exporte le profil « ${selected.name} »` : 'Exporte les réglages actuels'}>
          <Copy className="w-3 h-3" />
          Exporter
        </button>
        <button type="button" onClick={() => setShowImport(!showImport)} className={pill}>
          <Download className="w-3 h-3" />
          Importer
        </button>
      </div>

      {exportCode && (
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-400">Code copié dans le presse-papiers, à envoyer tel quel à l'équipe :</p>
          <textarea readOnly value={exportCode} rows={3} onFocus={(e) => e.target.select()} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-300 resize-none focus:outline-none" />
        </div>
      )}
      {showImport && (
        <div className="space-y-1.5">
          <textarea
            value={importCode}
            onChange={(e) => setImportCode(e.target.value)}
            rows={3}
            placeholder='Collez un code de profil : {"moriProfile":1,"name":…}'
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-200 resize-none focus:outline-none focus:border-emerald-500"
          />
          {importError && <p className="text-[11px] text-red-400">{importError}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={handleImport} disabled={!importCode.trim()} className={pill}>
              <Check className="w-3 h-3" />
              Ajouter le profil
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


// ==================== components/SettingsModal.tsx ====================



interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioSettings: AudioSettings;
  onUpdateAudioSettings: (newSettings: AudioSettings) => void;
  binRules: BinRule[];
  onUpdateBinRules: (newRules: BinRule[]) => void;
  markerCategories: MarkerCategory[];
  onUpdateMarkerCategories: (categories: MarkerCategory[]) => void;
  appearance: AppearanceSettings;
  onUpdateAppearance: (appearance: AppearanceSettings) => void;
  deliveryPresets: DeliveryPreset[];
  onUpdateDeliveryPresets: (presets: DeliveryPreset[]) => void;
  /** Onglet affiché à l'ouverture (ex. Normes depuis le Checker) */
  initialTab?: SettingsTab;
}

type SettingsTab = 'audio' | 'binning' | 'markers' | 'norms' | 'appearance' | 'profiles';
// 'appearance' = thème, police, nom affiché, onglets ; 'profiles' = onglet « Configuration » (profils)

/** Pastille de couleur + saisie hexadécimale synchronisées */
const HexColorField: React.FC<{ label: string; value: string; onChange: (hex: string) => void }> = ({ label, value, onChange }) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded-md border border-white/20 bg-transparent cursor-pointer p-0 flex-shrink-0"
        title={`Choisir : ${label}`}
      />
      <span className="flex-1 text-xs text-zinc-200">{label}</span>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const hex = colorFromText(e.target.value);
          if (hex) onChange(hex);
        }}
        // clic : tout le code est sélectionné, un collage ou une frappe le remplace
        onFocus={(e) => e.target.select()}
        // collage : le code collé remplace toujours l'ancien, où que soit le curseur
        onPaste={(e) => {
          const hex = colorFromText(e.clipboardData.getData('text'));
          if (!hex) return;
          e.preventDefault();
          setText(hex);
          onChange(hex);
        }}
        onBlur={() => setText(value)}
        spellCheck={false}
        placeholder="#RRGGBB"
        title="Tapez ou collez un code couleur : #E50914, E50914 ou rgb(229, 9, 20)"
        className="w-24 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
      />
    </div>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  audioSettings,
  onUpdateAudioSettings,
  binRules,
  onUpdateBinRules,
  markerCategories,
  onUpdateMarkerCategories,
  appearance,
  onUpdateAppearance,
  deliveryPresets,
  onUpdateDeliveryPresets,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => initialTab || 'audio');
  // onglet demandé appliqué avant l'affichage (sinon l'onglet Audio apparaît un instant)
  React.useLayoutEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);
  const [newPresetName, setNewPresetName] = useState('');
  const [exportCode, setExportCode] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const [newBinName, setNewBinName] = useState('');
  const [newBinExtensions, setNewBinExtensions] = useState('');
  const [newBinColor, setNewBinColor] = useState('#3b82f6');
  const [newBinDescription, setNewBinDescription] = useState('');
  const [editingBinId, setEditingBinId] = useState<string | null>(null);
  const [editBinName, setEditBinName] = useState('');
  const [editBinExtensions, setEditBinExtensions] = useState('');
  const [editBinError, setEditBinError] = useState<string | null>(null);
  const [editBinKeywords, setEditBinKeywords] = useState('');
  const [newBinKeywords, setNewBinKeywords] = useState('');
  const [musicThreshold, setMusicThreshold] = useState<number>(loadMusicSfxThreshold);
  const [binPresets, setBinPresets] = useState<BinPreset[]>(loadBinPresets);
  const [binPresetName, setBinPresetName] = useState('');
  const [binExportCode, setBinExportCode] = useState<string | null>(null);
  const [showBinImport, setShowBinImport] = useState(false);
  const [binImportCode, setBinImportCode] = useState('');
  const [binImportError, setBinImportError] = useState<string | null>(null);
  // Sous-chutier en cours de création (subId null) ou de modification
  // Réordonnancement des chutiers par glisser-déposer (poignée à gauche)
  const [dragBinId, setDragBinId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const [subForm, setSubForm] = useState<{ ruleId: string; subId: string | null; name: string; keywords: string; error: string | null } | null>(null);

  if (!isOpen) return null;

  const openSubForm = (rule: BinRule, sub?: SubBin) => {
    setEditingBinId(null);
    setSubForm({ ruleId: rule.id, subId: sub ? sub.id : null, name: sub ? sub.name : '', keywords: sub ? sub.keywords.join(', ') : '', error: null });
  };

  const handleSaveSubBin = () => {
    if (!subForm) return;
    const rule = binRules.find((r) => r.id === subForm.ruleId);
    if (!rule) return setSubForm(null);
    const name = subForm.name.trim().toUpperCase();
    const keywords = parseKeywordsInput(subForm.keywords);
    if (!name) return setSubForm({ ...subForm, error: 'Le nom du sous-chutier ne peut pas être vide.' });
    if (keywords.length === 0) return setSubForm({ ...subForm, error: 'Indiquez au moins un mot-clé (ex : whoosh, riser).' });
    const subs = rule.subBins || [];
    if (subs.some((s) => s.id !== subForm.subId && s.name.toUpperCase() === name))
      return setSubForm({ ...subForm, error: `${rule.binName} contient déjà un sous-chutier ${name}.` });
    const next = subForm.subId
      ? subs.map((s) => (s.id === subForm.subId ? { ...s, name, keywords } : s))
      : [...subs, { id: `sub-${Date.now()}`, name, keywords }];
    onUpdateBinRules(binRules.map((r) => (r.id === rule.id ? { ...r, subBins: next } : r)));
    setSubForm(null);
  };

  const handleDeleteSubBin = (ruleId: string, subId: string) => {
    onUpdateBinRules(binRules.map((r) => (r.id === ruleId ? { ...r, subBins: (r.subBins || []).filter((s) => s.id !== subId) } : r)));
    if (subForm?.subId === subId) setSubForm(null);
  };

  const handleSubKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveSubBin();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSubForm(null);
    }
  };

  const updateMusicThreshold = (minutes: number, seconds: number) => {
    const total = Math.max(1, Math.round((minutes || 0) * 60 + (seconds || 0)));
    setMusicThreshold(total);
    saveMusicSfxThreshold(total);
  };

  const profileSnapshot: ProfileData = {
    audio: audioSettings,
    binRules,
    musicThreshold,
    binPresets,
    markerCategories,
    deliveryPresets,
    appearance: {
      theme: appearance.theme,
      brandLabel: appearance.brandLabel,
      brandColor: appearance.brandColor,
      visibleTabs: appearance.visibleTabs,
      userPresets: appearance.userPresets,
    },
  };
  const applyProfile = (d: ProfileData, cats: ProfileCategory[]) => {
    setSubForm(null);
    setEditingBinId(null);
    if (cats.includes('audio')) onUpdateAudioSettings(d.audio);
    if (cats.includes('bins')) {
      onUpdateBinRules(d.binRules);
      updateMusicThreshold(0, d.musicThreshold);
      updateBinPresets(d.binPresets);
    }
    if (cats.includes('markers')) onUpdateMarkerCategories(d.markerCategories);
    if (cats.includes('norms')) onUpdateDeliveryPresets(d.deliveryPresets);
    if (cats.includes('appearance')) onUpdateAppearance({ ...appearance, ...d.appearance });
  };

  const updateBinPresets = (presets: BinPreset[]) => {
    setBinPresets(presets);
    saveBinPresets(presets);
  };
  const isCurrentBinPreset = (p: BinPreset) => p.musicThreshold === musicThreshold && sameBinSetup(p.rules, binRules);
  const applyBinPreset = (p: BinPreset) => {
    setSubForm(null);
    setEditingBinId(null);
    // copie : modifier l'arborescence ensuite ne change pas le preset enregistré
    onUpdateBinRules(JSON.parse(JSON.stringify(p.rules)));
    updateMusicThreshold(0, p.musicThreshold);
  };
  const handleSaveBinPreset = () => {
    const name = binPresetName.trim();
    if (!name) return;
    const preset: BinPreset = { id: `bin-preset-${Date.now()}`, name, rules: JSON.parse(JSON.stringify(binRules)), musicThreshold };
    updateBinPresets([...binPresets.filter((p) => p.name !== name), preset]);
    setBinPresetName('');
  };
  const handleExportBinPreset = async () => {
    const current = [defaultBinPreset(), ...binPresets].find(isCurrentBinPreset);
    const code = exportBinPresetCode(binPresetName.trim() || current?.name || 'Arborescence', binRules, musicThreshold);
    setBinExportCode(code);
    try {
      await navigator.clipboard.writeText(code);
    } catch {}
  };
  const handleImportBinPreset = () => {
    try {
      const preset = parseBinPresetCode(binImportCode);
      updateBinPresets([...binPresets.filter((p) => p.name !== preset.name), preset]);
      applyBinPreset(preset);
      setBinImportCode('');
      setBinImportError(null);
      setShowBinImport(false);
    } catch (err: any) {
      setBinImportError(err?.message || String(err));
    }
  };

  const handleAddBinRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBinName.trim()) return;

    const exts = parseExtensionsInput(newBinExtensions);
    const keywords = parseKeywordsInput(newBinKeywords);

    const newRule: BinRule = {
      id: `bin-${Date.now()}`,
      binName: newBinName.trim().toUpperCase(),
      color: newBinColor,
      description: newBinDescription.trim() || 'Dossier personnalisé',
      // sans extension, un chutier à mots-clés accepte tous les fichiers dont le nom correspond
      extensions: exts.length > 0 || keywords.length > 0 ? exts : ['*'],
      keywords,
      criteria: {},
    };

    onUpdateBinRules([...binRules, newRule]);
    setNewBinName('');
    setNewBinExtensions('');
    setNewBinKeywords('');
    setNewBinDescription('');
  };

  const handleStartEditBin = (bin: BinRule) => {
    setSubForm(null);
    setEditingBinId(bin.id);
    setEditBinName(bin.binName);
    setEditBinExtensions(bin.extensions.join(', '));
    setEditBinKeywords((bin.keywords || []).join(', '));
    setEditBinError(null);
  };

  const handleCancelEditBin = () => {
    setEditingBinId(null);
    setEditBinError(null);
  };

  const handleSaveEditBin = async () => {
    const rule = binRules.find((r) => r.id === editingBinId);
    if (!rule) return handleCancelEditBin();
    const name = editBinName.trim().toUpperCase();
    if (!name) return setEditBinError('Le nom du chutier ne peut pas être vide.');
    if (binRules.some((r) => r.id !== rule.id && r.binName.toUpperCase() === name))
      return setEditBinError(`Un autre chutier s'appelle déjà ${name}.`);
    const exts = parseExtensionsInput(editBinExtensions);
    const keywords = parseKeywordsInput(editBinKeywords);
    if (exts.length === 0 && keywords.length === 0 && roleOfRule(rule) !== 'seq')
      return setEditBinError('Indiquez au moins une extension (ex : mov, mp4) ou un mot-clé.');

    onUpdateBinRules(binRules.map((r) => (r.id === rule.id ? { ...r, binName: name, extensions: exts, keywords } : r)));
    setEditingBinId(null);
    setEditBinError(null);

    // Le chutier existant dans Premiere suit le nouveau nom
    if (name !== rule.binName && isRunningInPremiere()) {
      try {
        await renamePremiereBin(rule.binName, name);
      } catch {}
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEditBin();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEditBin();
    }
  };

  const handleDeleteBinRule = (id: string) => {
    onUpdateBinRules(binRules.filter((r) => r.id !== id));
  };

  const endBinDrag = () => {
    setDragBinId(null);
    setDropTarget(null);
  };
  const handleBinDrop = () => {
    if (dragBinId && dropTarget && dragBinId !== dropTarget.id) {
      const moving = binRules.find((r) => r.id === dragBinId);
      const rest = binRules.filter((r) => r.id !== dragBinId);
      const at = rest.findIndex((r) => r.id === dropTarget.id);
      if (moving && at >= 0) onUpdateBinRules([...rest.slice(0, at + (dropTarget.after ? 1 : 0)), moving, ...rest.slice(at + (dropTarget.after ? 1 : 0))]);
    }
    endBinDrag();
  };

  const handleResetDefaultBins = () => {
    onUpdateBinRules(defaultBinRules());
    updateMusicThreshold(0, DEFAULT_MUSIC_SFX_THRESHOLD);
  };

  const updateCategory = (id: string, patch: Partial<MarkerCategory>) => {
    onUpdateMarkerCategories(markerCategories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const commitKeywords = (id: string, text: string) => {
    const keywords = text
      .split(/[,;]+/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    updateCategory(id, { keywords: keywords.filter((k, i) => keywords.indexOf(k) === i) });
  };

  const updateAppearance = (patch: Partial<AppearanceSettings>) => onUpdateAppearance({ ...appearance, ...patch });
  const updateTheme = (patch: Partial<ThemeColors>) => updateAppearance({ theme: { ...appearance.theme, ...patch } });
  const isCurrentPreset = (p: ThemePreset) =>
    p.background === appearance.theme.background && p.accent === appearance.theme.accent && p.primary === appearance.theme.primary;
  const applyPreset = (p: ThemePreset) =>
    updateAppearance({ theme: { background: p.background, accent: p.accent, primary: p.primary }, brandColor: p.brandColor });

  const handleSavePreset = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const preset: ThemePreset = { id: `preset-${Date.now()}`, name, ...appearance.theme, brandColor: appearance.brandColor };
    updateAppearance({ userPresets: [...appearance.userPresets.filter((p) => p.name !== name), preset] });
    setNewPresetName('');
  };

  const handleExportPreset = async () => {
    const code = exportPresetCode({ name: newPresetName.trim() || 'Mon thème', ...appearance.theme, brandColor: appearance.brandColor });
    setExportCode(code);
    try {
      await navigator.clipboard.writeText(code);
    } catch {}
  };

  const handleImportPreset = () => {
    try {
      const preset = parsePresetCode(importCode);
      updateAppearance({
        userPresets: [...appearance.userPresets.filter((p) => p.name !== preset.name), preset],
        theme: { background: preset.background, accent: preset.accent, primary: preset.primary },
        brandColor: preset.brandColor,
      });
      setImportCode('');
      setImportError(null);
      setShowImport(false);
    } catch (err: any) {
      setImportError(err?.message || String(err));
    }
  };

  const toggleTabVisibility = (id: ActiveTab) => {
    const visible = appearance.visibleTabs.includes(id)
      ? appearance.visibleTabs.filter((t) => t !== id)
      : ALL_TABS.filter((t) => t === id || appearance.visibleTabs.includes(t));
    if (visible.length > 0) updateAppearance({ visibleTabs: visible });
  };

  const handleAddCategory = () => {
    onUpdateMarkerCategories([
      ...markerCategories,
      { id: `cat-${Date.now()}`, name: 'Nouvelle catégorie', color: 'Blue', keywords: [] },
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-zinc-100">
        {/* Top Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-cream-300" />
            <h2 className="font-bold text-cream-300 text-base">Réglages</h2>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-shrink-0 border-b border-zinc-800 bg-zinc-900 px-3 gap-2 text-xs font-semibold overflow-x-auto scrollbar-none whitespace-nowrap">
          <button
            onClick={() => setActiveTab('audio')}
            className={`py-2.5 flex flex-shrink-0 items-center gap-1 border-b-2 transition cursor-pointer ${
              activeTab === 'audio'
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Audio</span>
          </button>

          <button
            onClick={() => setActiveTab('binning')}
            className={`py-2.5 flex flex-shrink-0 items-center gap-1 border-b-2 transition cursor-pointer ${
              activeTab === 'binning'
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Chutiers</span>
          </button>

          <button
            onClick={() => setActiveTab('markers')}
            className={`py-2.5 flex flex-shrink-0 items-center gap-1 border-b-2 transition cursor-pointer ${
              activeTab === 'markers'
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Marqueurs</span>
          </button>

          <button
            onClick={() => setActiveTab('norms')}
            className={`py-2.5 flex flex-shrink-0 items-center gap-1 border-b-2 transition cursor-pointer ${
              activeTab === 'norms'
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Normes</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`py-2.5 flex flex-shrink-0 items-center gap-1 border-b-2 transition cursor-pointer ${
              activeTab === 'appearance'
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Apparence</span>
          </button>

          <button
            onClick={() => setActiveTab('profiles')}
            className={`py-2.5 flex flex-shrink-0 items-center gap-1 border-b-2 transition cursor-pointer ${
              activeTab === 'profiles'
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configuration</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          {activeTab === 'audio' && (
            <div className="space-y-4">
              {/* Sample Rate */}
              <div className="space-y-1.5">
                <label className="font-bold text-white text-xs flex items-center gap-2">
                  <span>Fréquence d'échantillonnage</span>
                  <span className="text-[10px] font-normal text-emerald-400">
                    (Standard Broadcast = 48 000 Hz)
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 44100, label: '44.1 kHz', desc: 'Standard CD / Web' },
                    { value: 48000, label: '48.0 kHz', desc: 'Standard Vidéo Broadcast' },
                    { value: 96000, label: '96.0 kHz', desc: 'Haute Résolution Studio' },
                  ].map((rate) => (
                    <button
                      key={rate.value}
                      type="button"
                      onClick={() =>
                        onUpdateAudioSettings({
                          ...audioSettings,
                          sampleRate: rate.value as AudioSampleRate,
                        })
                      }
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                        audioSettings.sampleRate === rate.value
                          ? 'bg-emerald-950/60 border-emerald-500 text-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-xs">
                        <span>{rate.label}</span>
                        {audioSettings.sampleRate === rate.value && (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{rate.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bit Depth */}
              <div className="space-y-1.5">
                <label className="font-bold text-white text-xs flex items-center gap-2">
                  <span>Résolution Binaire</span>
                  <span className="text-[10px] font-normal text-emerald-400">
                    (Standard Broadcast = 24-bit PCM)
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 16, label: '16-bit PCM', desc: 'Format compact' },
                    { value: 24, label: '24-bit PCM', desc: 'Standard recommandé' },
                    { value: 32, label: '32-bit Float', desc: 'Anti-saturation' },
                  ].map((bit) => (
                    <button
                      key={bit.value}
                      type="button"
                      onClick={() =>
                        onUpdateAudioSettings({
                          ...audioSettings,
                          bitDepth: bit.value as AudioBitDepth,
                        })
                      }
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                        audioSettings.bitDepth === bit.value
                          ? 'bg-emerald-950/60 border-emerald-500 text-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-xs">
                        <span>{bit.label}</span>
                        {audioSettings.bitDepth === bit.value && (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{bit.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'binning' && (
            <div className="space-y-4">
              {/* Presets d'arborescence, partageables en équipe */}
              <div className="space-y-2">
                <div>
                  <h3 className="font-bold text-white text-xs">Arborescence Projet</h3>
                  <p className="text-zinc-300 text-[11px]">
                    Ces dossiers seront créés et peuplés directement dans le projet Premiere Pro. Enregistrez-les en preset
                    et partagez le code avec votre équipe.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[defaultBinPreset(), ...binPresets].map((preset) => (
                    <span key={preset.id} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => applyBinPreset(preset)}
                        title={`${preset.rules.length} chutier(s)`}
                        className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border text-[11px] font-semibold transition cursor-pointer ${
                          isCurrentBinPreset(preset) ? 'border-cream-300 text-cream-300' : 'border-white/15 text-zinc-200 hover:border-white/30'
                        }`}
                      >
                        <span className="flex -space-x-1">
                          {preset.rules.slice(0, 4).map((r, i) => (
                            <span key={i} className="w-3 h-3 rounded-full border border-white/25" style={{ backgroundColor: r.color }} />
                          ))}
                        </span>
                        {preset.name}
                      </button>
                      {!preset.builtIn && (
                        <button
                          type="button"
                          onClick={() => updateBinPresets(binPresets.filter((p) => p.id !== preset.id))}
                          className="ml-0.5 p-0.5 text-zinc-500 hover:text-red-400 cursor-pointer"
                          title="Supprimer ce preset"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    value={binPresetName}
                    onChange={(e) => setBinPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveBinPreset()}
                    placeholder="Nom du preset"
                    className="flex-1 min-w-[8rem] bg-zinc-950 border border-zinc-800 rounded-full px-3 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                  <button type="button" onClick={handleSaveBinPreset} disabled={!binPresetName.trim()} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    <Plus className="w-3 h-3" />
                    Enregistrer
                  </button>
                  <button type="button" onClick={handleExportBinPreset} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    <Copy className="w-3 h-3" />
                    Exporter
                  </button>
                  <button type="button" onClick={() => setShowBinImport(!showBinImport)} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    <Download className="w-3 h-3" />
                    Importer
                  </button>
                </div>
                {binExportCode && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-400">Code copié dans le presse-papiers, à envoyer tel quel à l'équipe :</p>
                    <textarea
                      readOnly
                      value={binExportCode}
                      rows={3}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-300 resize-none focus:outline-none"
                    />
                  </div>
                )}
                {showBinImport && (
                  <div className="space-y-1.5">
                    <textarea
                      value={binImportCode}
                      onChange={(e) => setBinImportCode(e.target.value)}
                      rows={3}
                      placeholder='Collez un code de preset : {"moriBins":1,"name":…}'
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-200 resize-none focus:outline-none focus:border-emerald-500"
                    />
                    {binImportError && <p className="text-[11px] text-red-400">{binImportError}</p>}
                    <div className="flex justify-end">
                      <button type="button" onClick={handleImportBinPreset} disabled={!binImportCode.trim()} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default">
                        <Check className="w-3 h-3" />
                        Appliquer
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bins List : pleine hauteur, c'est la fenêtre Réglages qui défile */}
              <div className="space-y-1.5">
                {binRules.map((bin) =>
                  editingBinId === bin.id ? (
                    <div key={bin.id} className="p-2.5 rounded-lg bg-zinc-950 border border-emerald-600/60 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-zinc-300 block mb-0.5">Nom du chutier</label>
                          <input
                            type="text"
                            autoFocus
                            value={editBinName}
                            onChange={(e) => setEditBinName(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-300 block mb-0.5">
                            Extensions (séparées par des virgules)
                          </label>
                          <input
                            type="text"
                            value={editBinExtensions}
                            onChange={(e) => setEditBinExtensions(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            placeholder="mov, mp4, mxf"
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-zinc-300 block mb-0.5">
                            Mots-clés dans le nom du fichier (facultatif, prioritaires sur les extensions)
                          </label>
                          <input
                            type="text"
                            value={editBinKeywords}
                            onChange={(e) => setEditBinKeywords(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            placeholder="illu, stock, broll"
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                      {editBinError && <p className="text-[11px] text-red-400">{editBinError}</p>}
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={handleCancelEditBin}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveEditBin}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  ) : (
                  <div
                    key={bin.id}
                    id={`bin-row-${bin.id}`}
                    onDragOver={(e) => {
                      if (!dragBinId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      const rect = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY > rect.top + rect.height / 2;
                      if (dropTarget?.id !== bin.id || dropTarget.after !== after) setDropTarget({ id: bin.id, after });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleBinDrop();
                    }}
                    className={`relative p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2 transition-opacity ${dragBinId === bin.id ? 'opacity-40' : ''}`}
                  >
                  {dragBinId && dropTarget?.id === bin.id && dragBinId !== bin.id && (
                    <div className={`absolute left-1 right-1 h-0.5 rounded-full bg-cream-300 pointer-events-none ${dropTarget.after ? '-bottom-1' : '-top-1'}`} />
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        draggable
                        onDragStart={(e) => {
                          setSubForm(null);
                          setDragBinId(bin.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', bin.id);
                          const row = document.getElementById(`bin-row-${bin.id}`);
                          if (row) e.dataTransfer.setDragImage(row, 16, 16);
                        }}
                        onDragEnd={endBinDrag}
                        title="Glisser pour réordonner"
                        className="-ml-1 p-0.5 text-zinc-500 hover:text-zinc-200 cursor-grab active:cursor-grabbing flex-shrink-0"
                      >
                        <Menu className="w-3.5 h-3.5" />
                      </span>
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: bin.color }}
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-white font-mono text-xs">
                          {bin.binName}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {bin.extensions.map((ext) => (
                            <span
                              key={ext}
                              className="px-1 py-0.2 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300"
                            >
                              .{ext}
                            </span>
                          ))}
                          {(bin.keywords || []).map((k) => (
                            <span key={`kw-${k}`} className="px-1 rounded bg-cream-300/15 text-[10px] text-cream-300">
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEditBin(bin)}
                        title="Modifier le nom et les extensions"
                        className="text-zinc-400 hover:text-emerald-400 p-1.5 rounded transition cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openSubForm(bin)}
                        title="Ajouter un sous-chutier rangé par mots-clés"
                        className="text-zinc-400 hover:text-emerald-400 p-1.5 rounded transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBinRule(bin.id)}
                        title="Supprimer la règle"
                        className="text-zinc-400 hover:text-red-400 p-1.5 rounded transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Sous-chutiers */}
                  {(bin.subBins || []).map((sub) =>
                    subForm?.subId === sub.id ? null : (
                      <div key={sub.id} className="ml-5 pl-2.5 border-l border-zinc-700 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-zinc-100 font-mono text-[11px]">{sub.name}</span>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {sub.keywords.map((k) => (
                              <span key={k} className="px-1 rounded bg-zinc-800 text-[10px] text-zinc-300">
                                {k}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => openSubForm(bin, sub)}
                            title="Modifier le sous-chutier"
                            className="text-zinc-400 hover:text-emerald-400 p-1 rounded transition cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubBin(bin.id, sub.id)}
                            title="Supprimer le sous-chutier"
                            className="text-zinc-400 hover:text-red-400 p-1 rounded transition cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  {subForm?.ruleId === bin.id && (
                    <div className="ml-5 p-2 rounded-lg bg-zinc-900 border border-emerald-600/60 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-zinc-300 block mb-0.5">Sous-chutier</label>
                          <input
                            type="text"
                            autoFocus
                            value={subForm.name}
                            onChange={(e) => setSubForm({ ...subForm, name: e.target.value, error: null })}
                            onKeyDown={handleSubKeyDown}
                            placeholder="WHOOSH"
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-300 block mb-0.5">Mots-clés dans le nom du fichier</label>
                          <input
                            type="text"
                            value={subForm.keywords}
                            onChange={(e) => setSubForm({ ...subForm, keywords: e.target.value, error: null })}
                            onKeyDown={handleSubKeyDown}
                            placeholder="whoosh, swoosh, swish"
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                      {subForm.error && <p className="text-[11px] text-red-400">{subForm.error}</p>}
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSubForm(null)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveSubBin}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          {subForm.subId ? 'Enregistrer' : 'Ajouter'}
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                  )
                )}
              </div>

              {/* Add form */}
              <form
                onSubmit={handleAddBinRule}
                className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 space-y-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-300 block mb-0.5">
                      Nom du dossier (ex: 06_ARCHIVES)
                    </label>
                    <input
                      type="text"
                      value={newBinName}
                      onChange={(e) => setNewBinName(e.target.value)}
                      placeholder="06_ARCHIVES"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-300 block mb-0.5">
                      Extensions (ex: zip, rar, pdf)
                    </label>
                    <input
                      type="text"
                      value={newBinExtensions}
                      onChange={(e) => setNewBinExtensions(e.target.value)}
                      placeholder="zip, rar, pdf"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-zinc-300 block mb-0.5">
                      Mots-clés dans le nom (facultatif : ex. mp4 + « illu » va ici plutôt que dans les rushes)
                    </label>
                    <input
                      type="text"
                      value={newBinKeywords}
                      onChange={(e) => setNewBinKeywords(e.target.value)}
                      placeholder="illu, stock, broll"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-white text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter le dossier au projet
                </button>
                {!newBinExtensions.trim() && !newBinKeywords.trim() && newBinName.trim() && (
                  <p className="text-[11px] text-zinc-400">Indiquez des extensions, des mots-clés, ou les deux.</p>
                )}
              </form>

              {/* Seuil musique / SFX */}
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-white text-xs">Musique ou SFX</span>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-300">
                    <input
                      type="number"
                      min={0}
                      value={Math.floor(musicThreshold / 60)}
                      onChange={(e) => updateMusicThreshold(parseInt(e.target.value, 10), musicThreshold % 60)}
                      className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white font-mono text-right focus:outline-none focus:border-emerald-500"
                    />
                    min
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={musicThreshold % 60}
                      onChange={(e) => updateMusicThreshold(Math.floor(musicThreshold / 60), parseInt(e.target.value, 10))}
                      className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white font-mono text-right focus:outline-none focus:border-emerald-500"
                    />
                    s
                  </div>
                </div>
                <p className="text-zinc-300 text-[11px]">
                  Un fichier audio de{' '}
                  {[musicThreshold >= 60 ? `${Math.floor(musicThreshold / 60)} min` : '', musicThreshold % 60 ? `${musicThreshold % 60} s` : '']
                    .filter(Boolean)
                    .join(' ')}{' '}
                  ou plus va dans Musique, sinon dans SFX.
                  Un mot-clé dans le nom (sfx, music, ou ceux d’un sous-chutier) reste prioritaire.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'markers' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-zinc-300 text-[11px] leading-snug">
                  Catégorie d'un retour : première catégorie dont un mot-clé apparaît dans le commentaire. La catégorie sans
                  mots-clés sert par défaut. La couleur est celle du marqueur posé dans Premiere.
                </p>
                <button
                  type="button"
                  onClick={() => onUpdateMarkerCategories(defaultMarkerCategories())}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer flex-shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  Réinitialiser
                </button>
              </div>

              {/* Catégories : pleine hauteur, c'est la fenêtre Réglages qui défile */}
              <div className="space-y-1.5">
                {markerCategories.map((cat) => (
                  <div key={cat.id} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/20"
                        style={{ backgroundColor: markerColorHex(cat.color) }}
                      />
                      <input
                        type="text"
                        value={cat.name}
                        onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                        className="flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-emerald-500 px-1 py-0.5 text-xs font-bold text-white focus:outline-none"
                        title="Nom de la catégorie"
                      />
                      <select
                        value={cat.color}
                        onChange={(e) => updateCategory(cat.id, { color: e.target.value as PremiereColor })}
                        className="bg-zinc-900 border border-zinc-700 rounded-full px-2 py-0.5 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                        title="Couleur du marqueur dans Premiere"
                      >
                        {MARKER_COLORS.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => onUpdateMarkerCategories(markerCategories.filter((c) => c.id !== cat.id))}
                        disabled={markerCategories.length <= 1}
                        title="Supprimer la catégorie"
                        className="text-zinc-400 hover:text-red-400 p-1 rounded transition cursor-pointer disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      key={cat.keywords.join(',')}
                      type="text"
                      defaultValue={cat.keywords.join(', ')}
                      onBlur={(e) => commitKeywords(cat.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      placeholder="Aucun mot-clé : catégorie par défaut"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-300 font-mono focus:outline-none focus:border-emerald-500"
                      title="Mots-clés séparés par des virgules"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddCategory}
                className="w-full py-1.5 rounded-full border border-dashed border-zinc-600 hover:border-emerald-400 text-zinc-300 hover:text-emerald-200 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter une catégorie
              </button>
            </div>
          )}

          {activeTab === 'norms' && <NormsSettings presets={deliveryPresets} onChange={onUpdateDeliveryPresets} />}

          {activeTab === 'profiles' && <ProfilesSection current={profileSnapshot} onApply={applyProfile} />}

          {activeTab === 'appearance' && (
            <div className="space-y-5">

              {/* Thème */}
              <div className="space-y-2">
                <h3 className="font-bold text-white text-xs">Thème de couleurs</h3>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Partagé avec Ongaku, Sori et Kiru : thème, police, nom affiché et presets se mettent à jour dans tous les panneaux.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...BUILTIN_THEME_PRESETS, ...appearance.userPresets].map((preset) => (
                    <span key={preset.id} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border text-[11px] font-semibold transition cursor-pointer ${
                          isCurrentPreset(preset) ? 'border-cream-300 text-cream-300' : 'border-white/15 text-zinc-200 hover:border-white/30'
                        }`}
                      >
                        <span className="flex -space-x-1">
                          {[preset.background, preset.accent, preset.primary].map((c, i) => (
                            <span key={i} className="w-3 h-3 rounded-full border border-white/25" style={{ backgroundColor: c }} />
                          ))}
                        </span>
                        {preset.name}
                      </button>
                      {!preset.builtIn && (
                        <button
                          type="button"
                          onClick={() => updateAppearance({ userPresets: appearance.userPresets.filter((p) => p.id !== preset.id) })}
                          className="ml-0.5 p-0.5 text-zinc-500 hover:text-red-400 cursor-pointer"
                          title="Supprimer ce preset"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 space-y-2">
                  <HexColorField label="Fond" value={appearance.theme.background} onChange={(hex) => updateTheme({ background: hex })} />
                  <HexColorField label="Accent" value={appearance.theme.accent} onChange={(hex) => updateTheme({ accent: hex })} />
                  <HexColorField label="Boutons & titres" value={appearance.theme.primary} onChange={(hex) => updateTheme({ primary: hex })} />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                    placeholder="Nom du preset"
                    className="flex-1 min-w-[8rem] bg-zinc-950 border border-zinc-800 rounded-full px-3 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                  <button type="button" onClick={handleSavePreset} disabled={!newPresetName.trim()} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    <Plus className="w-3 h-3" />
                    Enregistrer
                  </button>
                  <button type="button" onClick={handleExportPreset} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    <Copy className="w-3 h-3" />
                    Exporter
                  </button>
                  <button type="button" onClick={() => setShowImport(!showImport)} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    <Download className="w-3 h-3" />
                    Importer
                  </button>
                </div>

                {exportCode && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-400">Code copié dans le presse-papiers, à partager tel quel :</p>
                    <textarea
                      readOnly
                      value={exportCode}
                      rows={2}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-300 resize-none focus:outline-none"
                    />
                  </div>
                )}
                {showImport && (
                  <div className="space-y-1.5">
                    <textarea
                      value={importCode}
                      onChange={(e) => setImportCode(e.target.value)}
                      rows={2}
                      placeholder='Collez un code de preset : {"moriTheme":1,"name":…}'
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-200 resize-none focus:outline-none focus:border-emerald-500"
                    />
                    {importError && <p className="text-[11px] text-red-400">{importError}</p>}
                    <div className="flex justify-end">
                      <button type="button" onClick={handleImportPreset} disabled={!importCode.trim()} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default">
                        <Check className="w-3 h-3" />
                        Appliquer
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Police (sélecteur commun aux panneaux de la suite : vendor/suite-theme.js) */}
              <div className="space-y-2">
                <h3 className="font-bold text-white text-xs">Police</h3>
                <div
                  className="rounded-lg bg-zinc-950 border border-zinc-800 p-2.5"
                  ref={(el) => {
                    if (el && !el.firstChild) (window as any).SuiteTheme?.mountFontPicker?.(el);
                  }}
                />
              </div>

              {/* Nom affiché */}
              <div className="space-y-2">
                <h3 className="font-bold text-white text-xs">Nom affiché à côté de Mori</h3>
                <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 space-y-2">
                  <input
                    type="text"
                    value={appearance.brandLabel}
                    onChange={(e) => updateAppearance({ brandLabel: e.target.value.slice(0, 32) })}
                    placeholder="Laisser vide pour ne rien afficher"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-zinc-500 leading-snug">
                    Renomme aussi la fenêtre dans Premiere : « {panelWindowName(appearance.brandLabel)} » (onglet du panneau et Fenêtre &gt;
                    Extensions), au prochain démarrage de Premiere.
                  </p>
                  <HexColorField label="Couleur du nom" value={appearance.brandColor} onChange={(hex) => updateAppearance({ brandColor: hex })} />
                </div>
              </div>

              {/* Onglets */}
              <div className="space-y-2">
                <h3 className="font-bold text-white text-xs">Onglets affichés</h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_TABS.map((id) => {
                    const checked = appearance.visibleTabs.includes(id);
                    const isLast = checked && appearance.visibleTabs.length === 1;
                    return (
                      <label
                        key={id}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition ${
                          checked ? 'border-emerald-600/60 bg-emerald-950/40 text-zinc-100' : 'border-zinc-800 text-zinc-400'
                        } ${isLast ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={isLast ? 'Au moins un onglet doit rester affiché' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isLast}
                          onChange={() => toggleTabVisibility(id)}
                          className="accent-emerald-400 w-3.5 h-3.5"
                        />
                        {TAB_META[id].icon}
                        {TAB_META[id].label}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-zinc-500">Un onglet masqué continue son mode automatique s'il était activé.</p>
              </div>

              <button
                type="button"
                onClick={() => onUpdateAppearance({ ...DEFAULT_APPEARANCE, visibleTabs: [...ALL_TABS], userPresets: appearance.userPresets })}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default"
              >
                <RotateCcw className="w-3 h-3" />
                Réinitialiser l'apparence
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-zinc-800 flex items-center justify-end bg-zinc-900">
          <PrimaryButton onClick={onClose}>Fermer</PrimaryButton>
        </div>
      </div>
    </div>
  );
};


// ==================== components/ReviewMarkersHub.tsx ====================


import confetti from 'canvas-confetti';

interface ReviewMarkersHubProps {
  currentFrameRate: FrameRate;
  categories: MarkerCategory[];
  onJumpToTimecode?: (seconds: number) => void;
}

/**
 * Texte sur une ligne, coupé s'il est trop long : un petit « + » apparaît alors pour l'afficher en entier
 * (« − » pour le replier). Le clic sur le bouton ne déclenche pas le clic de la ligne (tête de lecture).
 */
const ExpandableText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  return (
    <div className="flex items-start gap-1 min-w-0">
      <div ref={ref} className={`min-w-0 flex-1 ${open ? 'whitespace-pre-wrap break-words' : 'truncate'} ${className}`} title={open ? undefined : text}>
        {text}
      </div>
      {(overflows || open) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="flex-shrink-0 w-4 h-4 mt-px rounded-full border border-white/20 text-zinc-400 hover:text-cream-300 hover:border-cream-300/60 flex items-center justify-center text-[11px] leading-none cursor-pointer transition"
          title={open ? 'Replier' : 'Voir le retour en entier'}
        >
          {open ? '−' : '+'}
        </button>
      )}
    </div>
  );
};

/**
 * Poignée large sous une zone de texte : glisser vers le bas / le haut pour l'agrandir ou la réduire,
 * double-clic pour basculer entre taille compacte et grande.
 */
const ResizeGrip: React.FC<{ height: number; onChange: (h: number) => void; min: number; max: number; compact: number; tall: number }> = ({
  height,
  onChange,
  min,
  max,
  compact,
  tall,
}) => {
  const clamp = (h: number) => Math.round(Math.max(min, Math.min(max, h)));
  const latest = useRef({ onChange, clamp });
  latest.current = { onChange, clamp };
  // Glisser : la souris est suivie sur toute la fenêtre (pas seulement sur la poignée, qui bouge avec la zone),
  // jusqu'au relâchement du bouton — y compris s'il est relâché hors du panneau
  const startDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const from = { y: e.clientY, h: height };
    const move = (ev: MouseEvent) => {
      if (ev.buttons === 0) return stop();
      ev.preventDefault();
      latest.current.onChange(latest.current.clamp(from.h + ev.clientY - from.y));
    };
    const stop = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', stop, true);
      window.removeEventListener('blur', stop);
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', stop, true);
    window.addEventListener('blur', stop);
    document.body.style.cursor = 'ns-resize';
  };
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      title="Maintenir et glisser pour agrandir ou réduire · double-clic : grande / petite taille"
      onMouseDown={startDrag}
      onDoubleClick={() => onChange(height < (compact + tall) / 2 ? tall : compact)}
      className="group flex justify-center py-1 cursor-ns-resize select-none touch-none"
    >
      <span className="flex items-center justify-center px-4 py-0.5 rounded-full text-zinc-400 group-hover:text-cream-300 group-hover:bg-white/5 transition">
        {/* chevron haut, trait, chevron bas : même largeur, même épaisseur, espacements égaux (grille 16 × 16) */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.5 5L8 2l3.5 3" />
          <path d="M4 8h8" />
          <path d="M4.5 11L8 14l3.5-3" />
        </svg>
      </span>
    </div>
  );
};

/** Interrupteur compact ON/OFF */
const ToggleSwitch: React.FC<{ on: boolean; onChange: (on: boolean) => void; title?: string }> = ({ on, onChange, title }) => (
  <button
    onClick={() => onChange(!on)}
    aria-pressed={on}
    title={title}
    className={`relative w-10 h-5 rounded-full transition flex-shrink-0 cursor-pointer ${on ? 'bg-emerald-400' : 'bg-white/15'}`}
  >
    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

/** Un contenu collé ressemble-t-il à un export CSV (Vimeo Review, Frame.io…) ? */
function looksLikeReviewCSV(text: string): boolean {
  const firstLine = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/)[0] || '';
  return /[,;\t]/.test(firstLine) && /(timecode|time|temps|comment|note|retour)/i.test(firstLine);
}

/** Enregistre un fichier texte : boîte de dialogue native dans Premiere, téléchargement dans un navigateur */
function saveTextFile(content: string, defaultName: string, extension: string, title = 'Exporter les marqueurs'): string | null {
  const cep = (window as any).cep;
  if (cep && cep.fs && cep.fs.showSaveDialogEx) {
    const res = cep.fs.showSaveDialogEx(title, '', [extension], defaultName);
    if (res.err !== 0 || !res.data) return null;
    const path = /\.[a-z0-9]+$/i.test(res.data) ? res.data : `${res.data}.${extension}`;
    const write = cep.fs.writeFile(path, content, cep.encoding.UTF8);
    if (write.err !== 0) throw new Error(`écriture impossible (code ${write.err})`);
    return path;
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return defaultName;
}

function pickFile(accept: string, onFile: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };
  input.click();
}

// Liste des retours, brouillon et option « résolu » conservés d'une ouverture du panneau à l'autre
const REVIEW_STORAGE_KEYS = {
  markers: 'cutflow.reviewMarkers',
  draft: 'cutflow.reviewDraft',
  resolvedAction: 'cutflow.resolvedAction',
  placeOn: 'cutflow.reviewPlaceOn',
};

/** Où poser les retours : sur la séquence, ou sur le clip visible à cet instant (le marqueur suit le plan) */
export type ReviewPlaceOn = 'sequence' | 'clip';

/** Intervalle de lecture des marqueurs de la timeline (les clips ne sont relus qu'un tour sur trois) */
const TIMELINE_LINK_INTERVAL_MS = 2000;

// Synchro Vimeo : dossier surveillé où arrivent les CSV de retours exportés
export const REVIEW_SYNC_KEY = 'cutflow.reviewSync';
const REVIEW_SYNC_SEEN_KEY = 'cutflow.reviewSyncSeen';
/** Score minimal de ressemblance entre le nom du CSV et celui du projet (ou de la séquence active) */
const REVIEW_SYNC_MIN_SCORE = 0.6;

export interface ReviewSyncSettings {
  enabled: boolean;
  folder: string;
  /** version à importer : 'latest' (la plus récente trouvée pour le projet) ou une version précise (« V2 ») */
  version?: string;
}

function defaultDownloadsFolder(): string {
  const env = (window as any).cep_node?.process?.env || {};
  const home = env.USERPROFILE || env.HOME || '';
  if (!home) return '';
  return home + (isWindowsPlatform() ? '\\Downloads' : '/Downloads');
}

/** Nom comparable : sans extension, accents, mots d'export (vimeo, notes, review…) ni dates */
function normalizeForMatch(name: string): string {
  return name
    .replace(/\.(csv|prproj|txt)$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b\d{4}[-_.]?\d{2}[-_.]?\d{2}\b|\b\d{2}[-_.]\d{2}[-_.]\d{2,4}\b|\b\d{1,2}h\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(vimeo|review|notes?|comments?|commentaires?|export(e|s)?|retours?|feedbacks?|csv|copie|copy|final)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ressemblance 0..1 entre deux noms : inclusion de l'un dans l'autre, sinon bigrammes et mots communs */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeForMatch(a), nb = normalizeForMatch(b);
  if (!na || !nb) return 0;
  const ca = na.replace(/ /g, ''), cb = nb.replace(/ /g, '');
  if (ca === cb) return 1;
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  if (short.length >= 4 && long.includes(short)) return 0.9;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) || 0) + 1);
    return out;
  };
  const ba = bigrams(ca), bb = bigrams(cb);
  let common = 0;
  ba.forEach((n, k) => (common += Math.min(n, bb.get(k) || 0)));
  const dice = (2 * common) / Math.max(1, ca.length - 1 + cb.length - 1);
  const ta = new Set(na.split(' ')), tb = new Set(nb.split(' '));
  let shared = 0;
  ta.forEach((w) => tb.has(w) && shared++);
  const jaccard = shared / (ta.size + tb.size - shared);
  return Math.max(dice, jaccard);
}

async function readProjectAndSequenceNames(): Promise<{ project: string; sequence: string }> {
  const res = await evalExtendScript<any>(
    'JSON.stringify({ success: true, project: app.project ? app.project.name : "", sequence: app.project && app.project.activeSequence ? app.project.activeSequence.name : "" })'
  );
  return { project: String(res?.project || ''), sequence: String(res?.sequence || '') };
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const ReviewMarkersHub: React.FC<ReviewMarkersHubProps> = ({ currentFrameRate, categories, onJumpToTimecode }) => {
  const [rawText, setRawText] = useState<string>(() => readStored(REVIEW_STORAGE_KEYS.draft, ''));
  // hauteur de la zone de saisie, réglée avec la poignée (mémorisée)
  const [draftHeight, setDraftHeight] = useState<number>(() => readStored<number>('cutflow.reviewDraftHeight', 120));
  useEffect(() => writeStored('cutflow.reviewDraftHeight', draftHeight), [draftHeight]);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [markers, setMarkers] = useState<ReviewMarker[]>(() => readStored<ReviewMarker[]>(REVIEW_STORAGE_KEYS.markers, []));
  const [resolvedAction, setResolvedAction] = useState<ResolvedAction>(() =>
    readStored<ResolvedAction>(REVIEW_STORAGE_KEYS.resolvedAction, 'delete')
  );
  const [isChangingResolvedAction, setIsChangingResolvedAction] = useState(false);
  const [placeOn, setPlaceOn] = useState<ReviewPlaceOn>(() => readStored<ReviewPlaceOn>(REVIEW_STORAGE_KEYS.placeOn, 'sequence'));
  // réponses ajoutées au commentaire des marqueurs et aux exports
  const [includeReplies, setIncludeReplies] = useState<boolean>(() => readStored<boolean>('cutflow.reviewIncludeReplies', true));
  useEffect(() => writeStored('cutflow.reviewIncludeReplies', includeReplies), [includeReplies]);
  useEffect(() => writeStored(REVIEW_STORAGE_KEYS.placeOn, placeOn), [placeOn]);

  useEffect(() => writeStored(REVIEW_STORAGE_KEYS.markers, markers), [markers]);
  useEffect(() => writeStored(REVIEW_STORAGE_KEYS.draft, rawText), [rawText]);
  useEffect(() => writeStored(REVIEW_STORAGE_KEYS.resolvedAction, resolvedAction), [resolvedAction]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'resolved'>('all');
  // filtre de version du montage (« V2 ») ; 'all' : toutes
  const [versionFilter, setVersionFilter] = useState<string>(() => readStored<string>('cutflow.reviewVersionFilter', 'all'));
  useEffect(() => writeStored('cutflow.reviewVersionFilter', versionFilter), [versionFilter]);

  const [playheadSeconds, setPlayheadSeconds] = useState<number>(0);
  const [sequenceDuration, setSequenceDuration] = useState<number>(() =>
    markers.length > 0 ? Math.max(300, Math.ceil(markers[markers.length - 1].seconds + 60)) : 360
  );

  const [isApplyingToPremiere, setIsApplyingToPremiere] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ message: string; isError?: boolean } | null>(null);

  const [sync, setSync] = useState<ReviewSyncSettings>(() => ({ enabled: false, folder: defaultDownloadsFolder(), ...readStored<Partial<ReviewSyncSettings>>(REVIEW_SYNC_KEY, {}) }));
  const syncRef = useRef(sync);
  syncRef.current = sync;
  // versions trouvées dans les noms des CSV du dossier (menu « Version » de la synchro)
  const [folderVersions, setFolderVersions] = useState<string[]>([]);
  const [syncInfo, setSyncInfo] = useState<{ message: string; isError?: boolean } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  useEffect(() => writeStored(REVIEW_SYNC_KEY, sync), [sync]);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Couleur courante d'un marqueur : celle de sa catégorie (modifiable dans les réglages), vert si résolu
  const colorOf = (m: ReviewMarker): PremiereColor => {
    if (m.isResolved && resolvedAction === 'green') return 'Green';
    const cat = categories.find((c) => c.name === m.tag);
    return cat ? cat.color : m.color;
  };

  // valeurs courantes pour la boucle de synchro (elle ne se recrée pas à chaque rendu)
  const latestRef = useRef({ markers, categories, resolvedAction, currentFrameRate, placeOn, includeReplies });
  latestRef.current = { markers, categories, resolvedAction, currentFrameRate, placeOn, includeReplies };

  // Écritures dans Premiere en cours : la lecture de la timeline attend qu'elles soient finies et jette
  // une lecture commencée avant (sinon un marqueur retiré/recréé exprès passerait pour supprimé à la main)
  const writesRef = useRef({ active: 0, gen: 0 });
  const premiereWrite = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const w = writesRef.current;
    w.active++;
    w.gen++;
    try {
      return await fn();
    } finally {
      w.active--;
      w.gen++;
    }
  };
  /** Les marqueurs de clips doivent-ils être lus ? (option « sur le clip », ou retours déjà posés sur des clips) */
  const needsClips = (list: ReviewMarker[], po: ReviewPlaceOn) => po === 'clip' || list.some((m) => m.pproOwner && m.pproOwner !== 'seq');

  // Liste liée à la timeline : un marqueur déplacé, modifié ou supprimé dans Premiere met la liste à jour
  useEffect(() => {
    if (!isRunningInPremiere()) return;
    let stopped = false;
    let busy = false;
    let tick = 0;
    const run = async () => {
      const w = writesRef.current;
      const base = latestRef.current;
      // panneau masqué (autre onglet du groupe, fenêtre réduite) : Premiere n'est pas interrogé pour rien
      if (busy || document.hidden || base.markers.length === 0 || w.active > 0) return;
      const withClips = needsClips(base.markers, base.placeOn);
      tick++;
      if (withClips && tick % 3 !== 0) return;
      busy = true;
      try {
        const gen = w.gen;
        const res = await readTimelineMarkers(withClips).catch(() => null);
        if (stopped || !res || !res.success || !res.seqId || w.gen !== gen || w.active > 0) return;
        const { markers: list, resolvedAction: action, currentFrameRate: fps } = latestRef.current;
        const r = reconcileWithTimeline(list, res.seqId, res.markers || [], action, fps);
        if (!r.changed) return;
        setMarkers((prev) => (prev === list ? r.list : reconcileWithTimeline(prev, res.seqId!, res.markers || [], action, fps).list));
        latestRef.current = { ...latestRef.current, markers: r.list };
        const parts: string[] = [];
        if (r.removed.length) parts.push(`${r.removed.length} retour(s) supprimé(s) dans Premiere, retiré(s) de la liste`);
        if (r.moved) parts.push(`${r.moved} déplacé(s) : timecode mis à jour`);
        if (r.edited) parts.push(`${r.edited} commentaire(s) modifié(s)`);
        if (parts.length) setStatusMessage({ message: `Timeline : ${parts.join(' · ')}.` });
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(run, TIMELINE_LINK_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const mergeImported = mergeImportedReviews;

  const loadMarkers = (parsed: ReviewMarker[], sourceLabel: string) => {
    setMarkers(parsed);
    if (parsed.length > 0) {
      setSequenceDuration(Math.max(300, Math.ceil(Math.max(...parsed.map((m) => m.seconds)) + 60)));
      setStatusMessage({ message: `${parsed.length} marqueur(s) ${sourceLabel}. Vérifiez la liste puis posez-les sur la timeline.` });
    } else {
      setStatusMessage({ isError: true, message: 'Aucun timecode reconnu. Formats acceptés : 01:23, 00:01:23:15, 1m23s, 01:23 - 01:45.' });
    }
  };

  const handleGenerate = () => {
    if (!rawText.trim()) return;
    if (looksLikeReviewCSV(rawText)) {
      loadMarkers(parseVimeoCSV(rawText, currentFrameRate, categories), 'importé(s) depuis le CSV');
    } else {
      loadMarkers(parseRawReviewText(rawText, currentFrameRate, categories), 'généré(s)');
    }
  };

  const handleImportCSV = () => {
    pickFile('.csv,text/csv,text/plain', (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = String(event.target?.result || '');
        setRawText(text);
        const parsed = parseVimeoCSV(text, currentFrameRate, categories);
        const version = detectVersion(file.name);
        if (version && parsed.length > 0) {
          const { all, current } = mergeImported(markers, parsed, version);
          loadMarkers(all, `importé(s) depuis ${file.name}`);
          setVersionFilter(version);
          setStatusMessage({ message: `${current.length} retour(s) de la ${version} importé(s) depuis ${file.name}.` });
        } else loadMarkers(parsed, `importé(s) depuis ${file.name}`);
      };
      reader.readAsText(file);
    });
  };

  const handleImportCapture = () => {
    pickFile('image/*', (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setScreenshotDataUrl(url);
        analyzeScreenshotWithAI(url);
      };
      reader.readAsDataURL(file);
    });
  };

  // Ctrl+V d'une capture d'écran n'importe où dans l'onglet
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const url = event.target?.result as string;
              setScreenshotDataUrl(url);
              analyzeScreenshotWithAI(url);
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [currentFrameRate, categories]);

  // Fermer le menu d'export au clic extérieur
  useEffect(() => {
    if (!isExportMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setIsExportMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [isExportMenuOpen]);

  // Analyse d'une capture par le serveur IA (Gemini) : disponible uniquement en mode développement web
  const analyzeScreenshotWithAI = async (base64Url: string) => {
    setIsAiProcessing(true);
    setAiError(null);
    try {
      const res = await fetch('/api/parse-review-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Url,
          mimeType: base64Url.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Erreur de traitement de l'image");
      if (!Array.isArray(data.markers) || data.markers.length === 0) {
        throw new Error('Aucun retour avec timecode identifié sur cette capture');
      }
      const converted: ReviewMarker[] = data.markers.map((item: any, idx: number) => {
        const sec = timecodeToSeconds(item.timecode || '00:00:00:00', currentFrameRate);
        const { tag, color, track } = inferTagAndColor(item.comment || '', categories);
        return {
          id: `ai-marker-${Date.now()}-${idx}`,
          timecode: secondsToTimecode(sec, currentFrameRate, true),
          seconds: sec,
          durationSeconds: item.durationSeconds || 0,
          author: item.author || 'Client',
          comment: item.comment,
          tag,
          color,
          track,
          isResolved: false,
          source: 'screenshot',
        };
      });
      loadMarkers(converted.sort((a, b) => a.seconds - b.seconds), 'extrait(s) de la capture');
    } catch (err: any) {
      console.warn('Analyse IA indisponible dans le panneau installé :', err);
      setAiError(
        "La lecture des captures d'écran nécessite le serveur IA du projet source (clé Gemini) : elle n'est pas disponible dans le panneau installé. Copiez plutôt le texte des retours dans la zone ci-dessus."
      );
    } finally {
      setIsAiProcessing(false);
    }
  };

  // Le retour reste dans la liste ; son marqueur dans Premiere suit l'option choisie
  // (retiré de la timeline, passé en vert ou préfixé [RÉSOLU]) et revient à l'état initial si on décoche
  const toggleResolved = async (id: string) => {
    const target = markers.find((m) => m.id === id);
    if (!target) return;
    const nextState = !target.isResolved;
    setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, isResolved: nextState } : m)));
    const remaining = markers.filter((m) => m.id !== id && !m.isResolved);
    if (nextState && remaining.length === 0) {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }

    if (!isRunningInPremiere()) return;
    const cat = categories.find((c) => c.name === target.tag);
    try {
      const res = await premiereWrite(() =>
        syncResolvedMarkerInPremiere({ ...target, comment: commentWithReplies(target, includeReplies), color: cat ? cat.color : target.color }, nextState, resolvedAction, {
          withClips: needsClips(markers, placeOn),
          onClip: target.pproOwner ? target.pproOwner !== 'seq' : placeOn === 'clip',
        })
      );
      if (!res?.success) {
        setStatusMessage({ isError: true, message: res?.error || 'Impossible de mettre à jour le marqueur dans Premiere.' });
      } else if (!res.affected && nextState) {
        setStatusMessage({ message: `${target.timecode} : aucun marqueur correspondant sur la timeline active (pas encore posé ?).` });
      } else if (resolvedAction === 'delete') {
        setStatusMessage({
          message: nextState
            ? `${target.timecode} : marqueur retiré de la timeline (le retour reste dans la liste).`
            : `${target.timecode} : marqueur remis sur la timeline.`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ isError: true, message: err?.message || 'Communication impossible avec Premiere.' });
    }
  };

  // Changer d'option s'applique aussi aux retours déjà résolus : on annule l'ancien traitement
  // de leur marqueur (remis / recoloré / préfixe retiré) puis on applique le nouveau
  const handleResolvedActionChange = async (next: ResolvedAction) => {
    const previous = resolvedAction;
    setResolvedAction(next);
    const resolved = markers.filter((m) => m.isResolved);
    if (next === previous || resolved.length === 0 || !isRunningInPremiere()) return;

    setIsChangingResolvedAction(true);
    let affected = 0;
    try {
      await premiereWrite(async () => {
        for (const m of resolved) {
          const cat = categories.find((c) => c.name === m.tag);
          const marker = { ...m, comment: commentWithReplies(m, includeReplies), color: cat ? cat.color : m.color };
          const placement = { withClips: needsClips(markers, placeOn), onClip: m.pproOwner ? m.pproOwner !== 'seq' : placeOn === 'clip' };
          await syncResolvedMarkerInPremiere(marker, false, previous, placement);
          const res = await syncResolvedMarkerInPremiere(marker, true, next, placement);
          if (res?.success && res.affected) affected++;
        }
      });
      const verb = next === 'delete' ? 'retiré(s) de la timeline' : next === 'green' ? 'passé(s) en vert' : 'préfixé(s) [RÉSOLU]';
      setStatusMessage({ message: `${affected} marqueur(s) résolu(s) ${verb}.` });
    } catch (err: any) {
      setStatusMessage({ isError: true, message: err?.message || 'Communication impossible avec Premiere.' });
    } finally {
      setIsChangingResolvedAction(false);
    }
  };

  const jumpToMarker = (seconds: number) => {
    setPlayheadSeconds(seconds);
    onJumpToTimecode?.(seconds);
  };

  /** Pose une liste de retours sur la séquence active (les marqueurs déjà présents sont ignorés) */
  const applyMarkerList = (list: ReviewMarker[]): Promise<any> =>
    premiereWrite(async () => {
      const { categories: cats, resolvedAction: action, placeOn: po, includeReplies: withReplies } = latestRef.current;
      const onClip = po === 'clip';
      const color = (m: ReviewMarker): PremiereColor => {
        if (m.isResolved && action === 'green') return 'Green';
        const cat = cats.find((c) => c.name === m.tag);
        return cat ? cat.color : m.color;
      };
      const res: any = await addMarkersToActiveSequenceInPremiere(
        list
          .filter((m) => !(m.isResolved && action === 'delete'))
          .map((m) => ({ seconds: m.seconds, durationSeconds: m.durationSeconds, comment: commentWithReplies(m, withReplies), author: m.author, color: color(m) })),
        onClip
      );
      if (res && res.success && action === 'prefix') {
        // même format de préfixe que la synchronisation au clic sur « résolu »
        for (const m of list.filter((x) => x.isResolved)) {
          await syncResolvedMarkerInPremiere({ ...m, comment: commentWithReplies(m, withReplies), color: color(m) }, true, 'prefix', { withClips: onClip });
        }
      }
      return res;
    });

  // ---------- Synchro Vimeo : CSV déposés dans le dossier surveillé ----------
  const listCsv = (folder: string): { path: string; name: string; mtime: number }[] => {
    const fs = nodeRequire('fs');
    const pathMod = nodeRequire('path');
    if (!fs || !pathMod || !folder) return [];
    try {
      return fs
        .readdirSync(folder)
        .filter((f: string) => /\.csv$/i.test(f))
        .map((f: string) => {
          const full = pathMod.join(folder, f);
          try {
            return { path: full, name: f, mtime: fs.statSync(full).mtimeMs };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  /** Les CSV déjà présents ne sont pas importés : seuls ceux qui arrivent ensuite le seront */
  const markExistingAsSeen = (folder: string) => {
    const seen: Record<string, number> = {};
    for (const f of listCsv(folder)) seen[f.path] = f.mtime;
    writeStored(REVIEW_SYNC_SEEN_KEY, seen);
  };

  useEffect(() => {
    setFolderVersions(Array.from(new Set(listCsv(sync.folder).map((f) => detectVersion(f.name)).filter(Boolean) as string[])).sort((a, b) => versionRank(a) - versionRank(b)));
  }, [sync.folder]);

  const syncBusyRef = useRef(false);
  /** Importe les nouveaux CSV (ou, si force, le plus récent qui correspond au projet) et les pose sur la timeline */
  const runSync = async (folder: string, force: boolean) => {
    if (syncBusyRef.current || !isRunningInPremiere()) return;
    const files = listCsv(folder).sort((a, b) => a.mtime - b.mtime);
    setFolderVersions(Array.from(new Set(files.map((f) => detectVersion(f.name)).filter(Boolean) as string[])).sort((a, b) => versionRank(a) - versionRank(b)));
    const wanted = syncRef.current.version && syncRef.current.version !== 'latest' ? syncRef.current.version : null;
    const seen = readStored<Record<string, number>>(REVIEW_SYNC_SEEN_KEY, {});
    // « maintenant » : version choisie, sinon la plus récente (V3 avant V2), puis le fichier le plus récent
    const candidates = force
      ? [...files]
          .filter((f) => !wanted || detectVersion(f.name) === wanted)
          .sort((a, b) => versionRank(detectVersion(b.name) || undefined) - versionRank(detectVersion(a.name) || undefined) || b.mtime - a.mtime)
      : files.filter((f) => seen[f.path] !== f.mtime);
    if (candidates.length === 0) {
      if (force) setSyncInfo({ isError: true, message: wanted ? `Aucun CSV de la ${wanted} dans ${folder}.` : `Aucun CSV dans ${folder}.` });
      return;
    }
    syncBusyRef.current = true;
    setIsSyncing(true);
    try {
      const names = await readProjectAndSequenceNames();
      for (const f of candidates) {
        seen[f.path] = f.mtime;
        writeStored(REVIEW_SYNC_SEEN_KEY, seen);
        let text = '';
        try {
          text = String(nodeRequire('fs').readFileSync(f.path, 'utf8')).replace(/^\uFEFF/, '');
        } catch {
          continue;
        }
        if (!looksLikeReviewCSV(text)) continue;
        // version : celle choisie dans le menu ; sinon jamais un CSV « V1 » sur une séquence « V2 », et pas une
        // version plus ancienne que la plus récente déposée pour ce projet
        const csvVersion = detectVersion(f.name);
        const targetVersion = wanted || detectVersion(names.sequence) || detectVersion(names.project);
        if (wanted && csvVersion !== wanted) continue;
        if (!wanted && !targetVersion && csvVersion) {
          const newest = files
            .filter((o) => Math.max(nameSimilarity(o.name, names.project), nameSimilarity(o.name, names.sequence)) >= REVIEW_SYNC_MIN_SCORE)
            .reduce((m, o) => Math.max(m, versionRank(detectVersion(o.name) || undefined)), -1);
          if (versionRank(csvVersion) < newest) {
            if (!force) setSyncInfo({ message: `${f.name} ignoré : une version plus récente (V${newest}) est dans le dossier.` });
            continue;
          }
        }
        if (csvVersion && targetVersion && csvVersion !== targetVersion) {
          if (!force || f === candidates[candidates.length - 1])
            setSyncInfo({ isError: true, message: `${f.name} ignoré : retours de la ${csvVersion}, la séquence active est en ${targetVersion}.` });
          continue;
        }
        const score = Math.max(nameSimilarity(f.name, names.project), nameSimilarity(f.name, names.sequence));
        if (score < REVIEW_SYNC_MIN_SCORE) {
          if (!force || f === candidates[candidates.length - 1])
            setSyncInfo({ isError: true, message: `${f.name} ignoré : son nom ne correspond pas au projet « ${names.project || '?'} » (${Math.round(score * 100)} %).` });
          continue;
        }
        const { categories: cats, currentFrameRate: fallbackFps } = latestRef.current;
        const fps = (await getActiveSequenceFrameRate().catch(() => null)) || fallbackFps;
        let parsed: ReviewMarker[] = [];
        try {
          parsed = parseVimeoCSV(text, fps, cats);
        } catch (err: any) {
          setSyncInfo({ isError: true, message: `${f.name} illisible : ${err?.message || err}` });
          continue;
        }
        if (parsed.length === 0) {
          setSyncInfo({ isError: true, message: `${f.name} : aucun timecode reconnu dans le fichier.` });
          continue;
        }
        // réexport : les retours déjà connus gardent statut, lien et position ; les autres versions restent
        const { all, current: merged } = mergeImported(latestRef.current.markers, parsed, csvVersion || targetVersion);
        setMarkers(all);
        latestRef.current = { ...latestRef.current, markers: all };
        if (csvVersion || targetVersion) setVersionFilter((csvVersion || targetVersion)!);
        if (merged.length > 0) setSequenceDuration(Math.max(300, Math.ceil(Math.max(...merged.map((m) => m.seconds)) + 60)));
        setRawText(text);
        const res = await applyMarkerList(merged);
        const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        setSyncInfo(
          res?.success
            ? { message: `${time} · ${f.name} : ${merged.length} retour(s)${csvVersion || targetVersion ? ` (${csvVersion || targetVersion})` : ''}, ${res.addedCount} nouveau(x) marqueur(s) posé(s) sur la timeline.` }
            : { isError: true, message: `${f.name} : ${res?.error || res?.message || 'ouvrez une séquence dans Premiere Pro'}.` }
        );
        if (force) break;
      }
    } catch (err: any) {
      setSyncInfo({ isError: true, message: err?.message || 'Synchro impossible.' });
    } finally {
      syncBusyRef.current = false;
      setIsSyncing(false);
    }
  };

  // Surveillance du dossier toutes les 3 s tant que la synchro est active
  useEffect(() => {
    if (!sync.enabled || !sync.folder || !isRunningInPremiere()) return;
    let cancelled = false;
    let timer: any = null;
    const tick = async () => {
      if (cancelled) return;
      await runSync(sync.folder, false);
      if (!cancelled) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sync.enabled, sync.folder]);

  const toggleSync = (on: boolean) => {
    if (on) {
      if (!isNodeAvailable()) return setSyncInfo({ isError: true, message: "Redémarrez Premiere Pro pour terminer l'installation de Mori." });
      if (!sync.folder) return setSyncInfo({ isError: true, message: 'Choisissez d\'abord le dossier où arrivent les CSV.' });
      markExistingAsSeen(sync.folder);
      setSyncInfo({ message: `Synchro active : les CSV déposés dans ce dossier seront posés sur la timeline.` });
    } else setSyncInfo(null);
    setSync({ ...sync, enabled: on });
  };

  const chooseSyncFolder = () => {
    const cep = (window as any).cep;
    if (!cep?.fs?.showOpenDialogEx) return;
    const res = cep.fs.showOpenDialogEx(false, true, 'Dossier où arrivent les CSV de retours (Vimeo)', sync.folder || '', []);
    if (res.err !== 0 || !Array.isArray(res.data) || !res.data[0]) return;
    const folder = res.data[0];
    markExistingAsSeen(folder);
    setSync({ ...sync, folder });
  };

  const handleApplyToPremiere = async () => {
    if (markers.length === 0) return;
    setIsApplyingToPremiere(true);
    setStatusMessage(null);
    try {
      // plusieurs versions dans la liste : seulement celle du filtre, sinon celle de la séquence active, sinon la plus récente
      let target: string | null = null;
      if (versions.length > 0) {
        if (activeVersion !== 'all') target = activeVersion;
        else {
          const names = await readProjectAndSequenceNames().catch(() => ({ project: '', sequence: '' }));
          target = detectVersion(names.sequence) || detectVersion(names.project) || versions[versions.length - 1];
        }
      }
      const list = target ? markers.filter((m) => !m.version || m.version === target) : markers;
      const res: any = await applyMarkerList(list);
      if (res && res.success) {
        setStatusMessage({
          message:
            `${res.addedCount} marqueur(s)${target ? ` de la ${target}` : ''} posé(s) sur la timeline active` +
            (res.skippedCount ? ` (${res.skippedCount} déjà présent(s), ignoré(s))` : '') +
            '.',
        });
      } else {
        setStatusMessage({ isError: true, message: res?.error || res?.message || 'Ouvrez une séquence dans Premiere Pro.' });
      }
    } catch (err: any) {
      setStatusMessage({ isError: true, message: err?.message || 'Communication impossible avec Premiere.' });
    } finally {
      setIsApplyingToPremiere(false);
    }
  };

  const stamp = () => new Date().toISOString().slice(0, 10);
  const handleExport = async (kind: 'csv' | 'txt' | 'recap') => {
    setIsExportMenuOpen(false);
    try {
      if (kind === 'recap') {
        await navigator.clipboard.writeText(generateClientRecapText(markers, includeReplies));
        setStatusMessage({ message: 'Récapitulatif client copié dans le presse-papiers : collez-le dans votre mail ou Slack.' });
        return;
      }
      const content = kind === 'csv' ? generateMarkersCSV(markers, includeReplies) : generateMarkersText(markers, includeReplies);
      const saved = saveTextFile(content, `Marqueurs_${stamp()}.${kind}`, kind);
      if (saved) setStatusMessage({ message: `Export enregistré : ${saved}` });
    } catch (err: any) {
      setStatusMessage({ isError: true, message: `Export impossible : ${err?.message || err}` });
    }
  };

  const versions = Array.from(new Set(markers.map((m) => m.version).filter(Boolean) as string[])).sort((a, b) => versionRank(a) - versionRank(b));
  // filtre mémorisé sur une version absente de la liste : toutes
  const activeVersion = versions.includes(versionFilter) ? versionFilter : 'all';
  const filteredMarkers = markers.filter((m) => {
    if (filterStatus === 'pending' && m.isResolved) return false;
    if (filterStatus === 'resolved' && !m.isResolved) return false;
    if (filterTag !== 'all' && m.tag !== filterTag) return false;
    if (activeVersion !== 'all' && m.version !== activeVersion) return false;
    const q = searchQuery.toLowerCase();
    const inReplies = (m.replies || []).some((r) => r.text.toLowerCase().includes(q) || r.author.toLowerCase().includes(q));
    if (q && !m.comment.toLowerCase().includes(q) && !m.author.toLowerCase().includes(q) && !m.timecode.includes(searchQuery) && !inReplies) {
      return false;
    }
    return true;
  });
  const resolvedCount = markers.filter((m) => m.isResolved).length;

  // « Tout supprimer » : un premier clic arme le bouton, un second (dans les 3 s) vide la liste
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);
  // Décalage des marqueurs après la tête de lecture (valeur signée : -00:00:02:10, +5s, -12i…)
  const [shiftText, setShiftText] = useState<string>(() => readStored<string>('cutflow.reviewShift', ''));
  const [isShifting, setIsShifting] = useState(false);
  const [shiftInfo, setShiftInfo] = useState<{ message: string; isError?: boolean } | null>(null);
  useEffect(() => writeStored('cutflow.reviewShift', shiftText), [shiftText]);
  const shiftSeconds = parseShiftDuration(shiftText, currentFrameRate || 25);

  const handleShift = async () => {
    if (!isRunningInPremiere()) {
      setShiftInfo({ isError: true, message: 'Ouvrez le panneau dans Premiere Pro pour décaler les marqueurs.' });
      return;
    }
    const fps = (await getActiveSequenceFrameRate().catch(() => null)) || currentFrameRate || 25;
    const delta = parseShiftDuration(shiftText, fps);
    if (delta === null || delta === 0) {
      setShiftInfo({ isError: true, message: 'Durée illisible. Exemples : -00:00:02:10, +5s, -12i.' });
      return;
    }
    setIsShifting(true);
    try {
      const res = await premiereWrite(() => shiftSequenceMarkersAfterPlayhead(delta));
      if (!res?.success) {
        setShiftInfo({ isError: true, message: res?.error || 'Décalage impossible.' });
        return;
      }
      const from = res.playhead || 0;
      // la liste suit : retours de séquence (ou pas encore posés) situés après la tête
      setMarkers((prev) =>
        prev
          .map((m) => {
            if (m.pproOwner && m.pproOwner !== 'seq') return m;
            if (m.seconds < from - 0.0005) return m;
            const s = Math.max(0, m.seconds + delta);
            return { ...m, seconds: s, timecode: secondsToTimecode(s, fps, true) };
          })
          .sort((a, b) => a.seconds - b.seconds)
      );
      const sign = delta > 0 ? '+' : '−';
      setShiftInfo({
        message: `${res.moved} marqueur(s) après ${secondsToTimecode(from, fps, true)} décalé(s) de ${sign}${secondsToTimecode(Math.abs(delta), fps, true)}.`,
      });
    } catch (err: any) {
      setShiftInfo({ isError: true, message: err?.message || 'Communication impossible avec Premiere.' });
    } finally {
      setIsShifting(false);
    }
  };

  const handleDeleteOne = async (m: ReviewMarker) => {
    setMarkers((prev) => prev.filter((item) => item.id !== m.id));
    if (!isRunningInPremiere()) return;
    const res: any = await premiereWrite(() => removeReviewMarkersFromActiveSequence([m], needsClips([m], placeOn))).catch(() => null);
    if (res && !res.success) setStatusMessage({ isError: true, message: `Retour retiré de la liste, mais pas de la timeline : ${res.error}` });
  };

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    const list = markers;
    setMarkers([]);
    if (!isRunningInPremiere()) {
      setStatusMessage({ message: 'Liste des retours vidée.' });
      return;
    }
    const res: any = await premiereWrite(() => removeReviewMarkersFromActiveSequence(list, needsClips(list, placeOn))).catch((err) => ({
      success: false,
      error: String(err),
    }));
    setStatusMessage(
      res && res.success
        ? { message: `Liste vidée · ${res.removedCount} marqueur(s) retiré(s) de la timeline.` }
        : { isError: true, message: `Liste vidée, mais les marqueurs n'ont pas pu être retirés : ${res?.error || 'ouvrez la séquence dans Premiere Pro'}.` }
    );
  };

  const ghostButton =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 text-zinc-200 hover:text-cream-300 hover:border-cream-300/60 text-xs font-semibold transition cursor-pointer';
  const smallControl = 'bg-zinc-950 border border-white/10 rounded-full px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400';

  return (
    <div className="space-y-3">
      {/* Saisie unique : texte collé, import CSV ou capture */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 space-y-3">
        <div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            style={{ height: draftHeight }}
            className="w-full bg-zinc-950/70 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-400 transition-colors resize-none block"
            placeholder={"Collez les retours du client (mail, WhatsApp, Slack…) :\n01:14 couper l'hésitation avant la phrase\n02:25 - 02:35 baisser la musique de 3 dB\n1m24s corriger la faute dans le titre"}
          />
          <ResizeGrip height={draftHeight} onChange={setDraftHeight} min={70} max={700} compact={120} tall={360} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button onClick={handleImportCSV} className={ghostButton} title="Export CSV de Vimeo Review, Frame.io…">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Importer CSV
            </button>
            <button onClick={handleImportCapture} className={ghostButton} title="Capture d'écran des retours (ou Ctrl+V)">
              <ImageIcon className="w-3.5 h-3.5" />
              Capture
            </button>
          </div>
          <PrimaryButton onClick={handleGenerate} disabled={!rawText.trim()}>
            <Sparkles className="w-3.5 h-3.5" />
            Générer les marqueurs
          </PrimaryButton>
        </div>

        {screenshotDataUrl && (
          <img src={screenshotDataUrl} alt="Capture des retours" className="max-h-40 mx-auto rounded-lg border border-white/10 object-contain" />
        )}
        {isAiProcessing && <StatusMessage busy message="Lecture de la capture en cours…" />}
        {aiError && <StatusMessage isError message={aiError} />}
      </section>

      {/* Synchro Vimeo : dossier de dépôt des CSV */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
              <FolderSync className={`w-3.5 h-3.5 ${sync.enabled ? 'text-emerald-300' : 'text-zinc-400'} ${isSyncing ? 'animate-spin' : ''}`} />
              Synchro Vimeo
            </div>
            <div className="text-[11px] text-zinc-400 leading-snug">
              Un CSV de retours exporté dans ce dossier est posé automatiquement sur la timeline si son nom ressemble à celui du projet ou de
              la séquence active.
            </div>
          </div>
          <ToggleSwitch on={sync.enabled} onChange={toggleSync} title={sync.enabled ? 'Désactiver la synchro' : 'Activer la synchro'} />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate text-[11px] font-mono text-zinc-300 bg-zinc-950/70 border border-white/10 rounded-full px-2.5 py-1" title={sync.folder}>
            {sync.folder || 'aucun dossier choisi'}
          </span>
          <button onClick={chooseSyncFolder} className={ghostButton} title="Choisir le dossier de dépôt des CSV">
            <FolderOpen className="w-3.5 h-3.5" />
            Choisir…
          </button>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          Version importée
          <select
            value={sync.version && sync.version !== 'latest' ? sync.version : 'latest'}
            onChange={(e) => setSync({ ...sync, version: e.target.value })}
            className="bg-zinc-950 border border-white/10 rounded-full px-2.5 py-1 text-[11px] font-semibold text-zinc-200 focus:outline-none focus:border-emerald-400 cursor-pointer"
            title="La plus récente : V3 plutôt que V2 quand les deux CSV sont dans le dossier"
          >
            <option value="latest">La plus récente</option>
            {Array.from(new Set([...folderVersions, ...(sync.version && sync.version !== 'latest' ? [sync.version] : [])]))
              .sort((a, b) => versionRank(a) - versionRank(b))
              .map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
          </select>
        </div>
        {sync.enabled && (
          <button
            onClick={() => runSync(sync.folder, true)}
            disabled={isSyncing}
            className="text-[11px] text-emerald-300 hover:text-emerald-200 underline cursor-pointer disabled:opacity-50"
            title="Importe le CSV du projet dans la version choisie (par défaut la plus récente)"
          >
            Synchroniser maintenant
          </button>
        )}
        {syncInfo && <StatusMessage isError={syncInfo.isError} busy={isSyncing} message={syncInfo.message} />}
      </section>

      {statusMessage && <StatusMessage isError={statusMessage.isError} message={statusMessage.message} />}

      {markers.length > 0 && (
        <>
          {/* Liste des retours */}
          <section className="rounded-2xl border border-white/10 bg-zinc-900/50 overflow-hidden">
            <div className="p-3 border-b border-white/10 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PrimaryButton onClick={handleApplyToPremiere} disabled={isApplyingToPremiere}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {isApplyingToPremiere ? 'Pose en cours…' : 'Poser sur la timeline'}
                </PrimaryButton>

                <div className="flex items-center gap-1.5">
                <button
                  onClick={handleClearAll}
                  className={
                    confirmClear
                      ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-red-400 bg-red-500/15 text-red-300 text-xs font-semibold transition cursor-pointer'
                      : 'flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 text-zinc-200 hover:text-red-300 hover:border-red-400/60 text-xs font-semibold transition cursor-pointer'
                  }
                  title="Vider la liste et retirer ses marqueurs de la timeline"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmClear ? 'Confirmer ?' : 'Tout supprimer'}
                </button>
                {/* Export unique avec 3 options */}
                <div className="relative" ref={exportMenuRef}>
                  <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className={ghostButton}>
                    <Download className="w-3.5 h-3.5" />
                    Exporter
                    <ChevronRight className={`w-3 h-3 transition ${isExportMenuOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {isExportMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-60 rounded-xl border border-white/10 bg-zinc-900 shadow-2xl z-30 overflow-hidden">
                      {[
                        { kind: 'csv' as const, icon: <FileSpreadsheet className="w-4 h-4" />, label: 'Tableur (.csv)', desc: 'Timecode, auteur, piste, catégorie, statut' },
                        { kind: 'txt' as const, icon: <Layers className="w-4 h-4" />, label: 'Liste horodatée (.txt)', desc: 'Une ligne par retour avec [✓] / [ ]' },
                        { kind: 'recap' as const, icon: <Copy className="w-4 h-4" />, label: 'Récap client (copier)', desc: 'Texte prêt pour un mail ou Slack' },
                      ].map((opt) => (
                        <button
                          key={opt.kind}
                          onClick={() => handleExport(opt.kind)}
                          className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 transition cursor-pointer"
                        >
                          <span className="text-emerald-300 mt-0.5">{opt.icon}</span>
                          <span>
                            <span className="block text-xs font-semibold text-zinc-100">{opt.label}</span>
                            <span className="block text-[10px] text-zinc-400">{opt.desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Rechercher…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`${smallControl} w-28 focus:w-40 transition-all`}
                />
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className={smallControl}>
                  <option value="all">Tous ({markers.length})</option>
                  <option value="pending">En attente ({markers.length - resolvedCount})</option>
                  <option value="resolved">Résolus ({resolvedCount})</option>
                </select>
                {versions.length > 0 && (
                  <select value={activeVersion} onChange={(e) => setVersionFilter(e.target.value)} className={smallControl} title="Version du montage">
                    <option value="all">Toutes versions</option>
                    {versions.map((v) => (
                      <option key={v} value={v}>
                        {v} ({markers.filter((m) => m.version === v).length})
                      </option>
                    ))}
                  </select>
                )}
                <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className={smallControl}>
                  <option value="all">Toutes catégories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={resolvedAction}
                  onChange={(e) => handleResolvedActionChange(e.target.value as ResolvedAction)}
                  disabled={isChangingResolvedAction}
                  className={smallControl}
                  title="Ce que devient un retour coché « résolu »"
                >
                  <option value="green">Résolu : passer en vert</option>
                  <option value="delete">Résolu : retirer de la timeline</option>
                  <option value="prefix">Résolu : préfixer [RÉSOLU]</option>
                </select>
                <select
                  value={placeOn}
                  onChange={(e) => setPlaceOn(e.target.value as ReviewPlaceOn)}
                  className={smallControl}
                  title="Sur le clip : le marqueur est posé sur le plan visible à ce timecode et le suit quand vous le déplacez (il apparaît aussi dans le moniteur source)"
                >
                  <option value="sequence">Poser sur : la séquence</option>
                  <option value="clip">Poser sur : le clip (suit le plan)</option>
                </select>
                <label
                  className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer select-none"
                  title="Ajoute les réponses (lignes « ↳ ») au commentaire des marqueurs posés et aux exports"
                >
                  <input type="checkbox" checked={includeReplies} onChange={(e) => setIncludeReplies(e.target.checked)} className="w-3.5 h-3.5" />
                  Inclure les réponses
                </label>
              </div>
            </div>

            {filteredMarkers.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">Aucun retour ne correspond aux filtres.</div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredMarkers.map((m) => {
                  const hex = markerColorHex(colorOf(m));
                  const isCurrent = Math.abs(playheadSeconds - m.seconds) < 1;
                  return (
                    <div
                      key={m.id}
                      onClick={() => jumpToMarker(m.seconds)}
                      title="Placer la tête de lecture sur ce retour"
                      className={`px-3 py-2.5 flex items-center gap-2.5 transition cursor-pointer ${
                        isCurrent ? 'bg-emerald-950/40' : m.isResolved ? 'opacity-60 hover:bg-white/[0.03]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleResolved(m.id);
                        }}
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition cursor-pointer ${
                          m.isResolved ? 'bg-emerald-400 text-ink' : 'border border-white/25 hover:border-emerald-300'
                        }`}
                        title={m.isResolved ? 'Marquer comme non résolu' : 'Marquer comme résolu'}
                      >
                        {m.isResolved && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>

                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-emerald-200 shrink-0">
                        {m.timecode}
                      </span>

                      <div className="min-w-0 flex-1">
                        <ExpandableText
                          text={m.comment}
                          className={`text-xs ${m.isResolved ? 'line-through text-zinc-500' : 'text-zinc-100 font-medium'}`}
                        />
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-0.5">
                          {m.version && (
                            <span className="px-1.5 rounded-full bg-cream-300/15 text-cream-300 font-bold whitespace-nowrap" title="Version du montage">
                              {m.version}
                            </span>
                          )}
                          <span className="truncate">{m.author}</span>
                          <span
                            className="px-1.5 rounded-full border font-semibold whitespace-nowrap"
                            style={{ color: hex, borderColor: `${hex}55`, backgroundColor: `${hex}1f` }}
                          >
                            {m.tag}
                          </span>
                          {m.durationSeconds && m.durationSeconds > 0 ? <span>{m.durationSeconds.toFixed(1)}s</span> : null}
                        </div>
                        {m.replies && m.replies.length > 0 && (
                          <div className="mt-1 space-y-0.5 border-l border-white/10 pl-2">
                            {m.replies.map((r, k) => (
                              <div key={k} className={`text-[11px] leading-snug ${m.isResolved ? 'text-zinc-500' : 'text-zinc-300'}`} title={r.text}>
                                <span className="text-zinc-500">↳ </span>
                                {r.author && <span className="font-semibold text-zinc-400">{r.author} : </span>}
                                <span className="break-words">{r.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOne(m);
                        }}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 transition cursor-pointer shrink-0"
                        title="Supprimer ce retour (et son marqueur sur la timeline)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Timeline visuelle */}
          <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-white/5 text-emerald-200 font-bold">
                TC {secondsToTimecode(playheadSeconds, currentFrameRate, true)}
              </span>
            </div>

            <div>
              <div className="h-5 w-full flex justify-between text-[10px] font-mono text-zinc-500 px-1 select-none">
                <span>00:00</span>
                <span>{secondsToTimecode(sequenceDuration * 0.5, currentFrameRate, false)}</span>
                <span>{secondsToTimecode(sequenceDuration, currentFrameRate, false)}</span>
              </div>
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setPlayheadSeconds(Math.max(0, ((e.clientX - rect.left) / rect.width) * sequenceDuration));
                }}
                className="h-9 w-full bg-zinc-950 border border-white/10 rounded-lg relative cursor-pointer overflow-hidden"
              >
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
                {markers.map((m) => {
                  const leftPct = (m.seconds / sequenceDuration) * 100;
                  if (leftPct < 0 || leftPct > 100) return null;
                  const hex = markerColorHex(colorOf(m));
                  return (
                    <div
                      key={m.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToMarker(m.seconds);
                      }}
                      style={{ left: `${leftPct}%` }}
                      className="absolute top-0 bottom-0 w-3 -ml-1.5 flex flex-col items-center justify-between cursor-pointer group/pin hover:z-20"
                      title={`${m.timecode} - ${m.author} : ${m.comment}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-sm shadow group-hover/pin:scale-125 transition-transform" style={{ backgroundColor: hex }} />
                      <div className="w-0.5 flex-1 opacity-70" style={{ backgroundColor: hex }} />
                    </div>
                  );
                })}
                <div
                  style={{ left: `${Math.min(100, (playheadSeconds / sequenceDuration) * 100)}%` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-cream-300 z-10 pointer-events-none -ml-px"
                />
              </div>
            </div>
          </section>
        </>
      )}

      {/* Décaler les marqueurs après la tête de lecture (supprimer et raccorder, ajout de matière) */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-3 space-y-2">
        <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
          <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-400" />
          Décaler tous les marqueurs après la tête de lecture
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400 flex-shrink-0">de</span>
          <input
            type="text"
            value={shiftText}
            onChange={(e) => setShiftText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isShifting && handleShift()}
            placeholder="-00:00:02:10"
            className={`flex-1 min-w-0 bg-zinc-950 border rounded-full px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition ${
              shiftText.trim() && shiftSeconds === null ? 'border-red-400/70' : 'border-white/10 focus:border-emerald-400'
            }`}
            title="Négatif après un « supprimer et raccorder », positif après un ajout de matière. HH:MM:SS:II, SS:II, 5s ou 12i"
          />
          <button
            onClick={handleShift}
            disabled={isShifting || shiftSeconds === null || shiftSeconds === 0}
            className={`${ghostButton} flex-shrink-0 disabled:opacity-40 disabled:cursor-default`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            {isShifting ? 'Décalage…' : 'Décaler'}
          </button>
        </div>
        <div className="text-[10px] text-zinc-500 leading-snug">
          {shiftSeconds !== null && shiftSeconds !== 0
            ? `${shiftSeconds < 0 ? 'Vers la gauche' : 'Vers la droite'} de ${Math.abs(shiftSeconds).toFixed(2).replace('.', ',')} s · marqueurs de séquence situés à partir de la tête de lecture (ceux posés sur des clips suivent déjà leurs plans).`
            : 'Négatif après un « supprimer et raccorder » (-00:00:02:10, -2s, -12i), positif après un ajout de matière (+5s).'}
        </div>
        {shiftInfo && <StatusMessage isError={shiftInfo.isError} message={shiftInfo.message} />}
      </section>
    </div>
  );
};


// ==================== App.tsx ====================


export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('audio');
  // Un outil n'est monté qu'à sa première ouverture, puis reste monté (masqué) pour que ses scans auto continuent
  const [visitedTabs, setVisitedTabs] = useState<ActiveTab[]>(() => {
    // synchro Vimeo active : l'onglet Retours doit tourner en arrière-plan dès l'ouverture du panneau
    let syncOn = false;
    try {
      syncOn = !!JSON.parse(localStorage.getItem(REVIEW_SYNC_KEY) || '{}').enabled;
    } catch {}
    return syncOn ? ['audio', 'markers'] : ['audio'];
  });
  useEffect(() => {
    setVisitedTabs((prev) => (prev.includes(activeTab) ? prev : [...prev, activeTab]));
  }, [activeTab]);
  const mounted = (tab: ActiveTab) => tab === activeTab || visitedTabs.includes(tab);
  const [frameRate, setFrameRate] = useState<FrameRate>(25);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>(undefined);
  const openSettings = (tab?: SettingsTab) => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  // Ctrl+Espace → console d'effets : la fenêtre cachée démarrée avec Premiere tient déjà le raccourci ; le panneau
  // le lance aussi, au cas où Premiere n'aurait pas démarré cette fenêtre (une seule instance active, voir le script)
  useEffect(() => {
    if (!isRunningInPremiere()) return;
    const start = () => (window as any).MoriHotkey?.start();
    if ((window as any).MoriHotkey) return void start();
    const tag = document.createElement('script');
    tag.src = './vendor/mori-hotkey.js';
    tag.onload = start;
    document.head.appendChild(tag);
  }, []);
  const [deliveryPresets, setDeliveryPresets] = useState<DeliveryPreset[]>(loadDeliveryPresets);
  useEffect(() => saveDeliveryPresets(deliveryPresets), [deliveryPresets]);
  const [currentProjectName, setCurrentProjectName] = useState<string>('');

  // Global Audio Settings
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(loadAudioSettings);
  useEffect(() => saveAudioSettings(audioSettings), [audioSettings]);

  // Global Bin Rules avec SEQ et ASSETS demandés par l'utilisateur
  const [binRules, setBinRules] = useState<BinRule[]>(loadBinRules);
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadAppearance);

  // Thème appliqué et réglages d'apparence conservés
  useEffect(() => {
    applyTheme(appearance.theme);
    saveAppearance(appearance);
  }, [appearance]);

  // Apparence changée dans Ongaku ou Sori : reprise en direct
  useEffect(() => {
    const suite = suiteTheme();
    if (!suite) return;
    return suite.watch((shared) => setAppearance((a) => ({ ...a, ...shared })));
  }, []);

  // Nom de la fenêtre : « Mori — <nom affiché> » (« Mori » si vide). Premiere ne renomme pas un panneau
  // ouvert : le nom est écrit dans le manifeste et s'affiche au prochain démarrage. Réécrit aussi à chaque
  // ouverture, pour survivre à une mise à jour de Mori (l'installeur remet le manifeste d'origine).
  useEffect(() => {
    const title = panelWindowName(appearance.brandLabel);
    document.title = title;
    try {
      (window as any).__adobe_cep__?.invokeSync?.('setWindowTitle', title);
    } catch {}
    const timer = setTimeout(() => writePanelWindowName(appearance.brandLabel), 800);
    return () => clearTimeout(timer);
  }, [appearance.brandLabel]);

  // L'onglet actif doit rester un onglet affiché
  useEffect(() => {
    if (!appearance.visibleTabs.includes(activeTab)) setActiveTab(appearance.visibleTabs[0]);
  }, [appearance.visibleTabs, activeTab]);

  // Cadence des timecodes : celle de la séquence active, relue à chaque passage sur l'onglet Retours
  useEffect(() => {
    if (activeTab !== 'markers' || !isRunningInPremiere()) return;
    getActiveSequenceFrameRate()
      .then((fps) => {
        if (fps) setFrameRate(fps);
      })
      .catch(() => {});
  }, [activeTab]);
  const [markerCategories, setMarkerCategories] = useState<MarkerCategory[]>(loadMarkerCategories);

  useEffect(() => {
    saveMarkerCategories(markerCategories);
  }, [markerCategories]);

  // Règles de chutiers conservées d'une ouverture du panneau à l'autre
  useEffect(() => {
    saveBinRules(binRules);
  }, [binRules]);

  // Nom du projet ouvert, relu régulièrement pour suivre un changement de projet
  useEffect(() => {
    if (!isRunningInPremiere()) return;
    const refresh = () =>
      evalExtendScript<any>('JSON.stringify({ success: true, name: app.project ? app.project.name : "" })')
        .then((res) => setCurrentProjectName(String(res?.name || '')))
        .catch(() => {});
    refresh();
    // panneau masqué : pas de question à Premiere ; relu dès qu'il réapparaît
    const timer = setInterval(() => !document.hidden && refresh(), 5000);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <div className="w-full min-h-screen bg-ink text-zinc-100 flex flex-col font-sans antialiased selection:bg-emerald-600 selection:text-white overflow-x-hidden">
      {/* Main Top Header with Settings Cog */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSettings={() => openSettings()}
        brandLabel={appearance.brandLabel}
        brandColor={appearance.brandColor}
        visibleTabs={appearance.visibleTabs}
      />

      {/* Main Content Area: Padding compact pour panneaux Premiere étroits */}
      <main className="flex-1 w-full px-3 py-3 overflow-x-hidden">
        {/* Onglets montés à la première ouverture puis gardés (masqués si inactifs) : les scans auto audio
            et chutier continuent de tourner en parallèle quand on change d'onglet */}
        <div className={activeTab === 'audio' ? '' : 'hidden'}>
          {mounted('audio') && (
            <AudioConverter
              audioSettings={audioSettings}
              onOpenSettings={() => openSettings('audio')}
            />
          )}
        </div>

        <div className={activeTab === 'video' ? '' : 'hidden'}>
          {mounted('video') && <VideoTranscoder />}
        </div>

        <div className={activeTab === 'binning' ? '' : 'hidden'}>
          {mounted('binning') && (
            <AutoBinning
              rules={binRules}
              onOpenSettings={() => openSettings('binning')}
            />
          )}
        </div>

        <div className={activeTab === 'download' ? '' : 'hidden'}>
          {mounted('download') && <WebDownloader />}
        </div>

        <div className={activeTab === 'checker' ? '' : 'hidden'}>
          {mounted('checker') && <DeliveryChecker presets={deliveryPresets} onOpenSettings={() => openSettings('norms')} />}
        </div>

        <div className={activeTab === 'markers' ? '' : 'hidden'}>
          {mounted('markers') && (
            <ReviewMarkersHub
              currentFrameRate={frameRate}
              categories={markerCategories}
              onJumpToTimecode={(s) => movePlayheadTo(s).catch(() => {})}
            />
          )}
        </div>

      </main>

      {/* Global Settings Modal (Cog / Molette) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        audioSettings={audioSettings}
        onUpdateAudioSettings={setAudioSettings}
        binRules={binRules}
        onUpdateBinRules={setBinRules}
        markerCategories={markerCategories}
        onUpdateMarkerCategories={setMarkerCategories}
        appearance={appearance}
        onUpdateAppearance={setAppearance}
        deliveryPresets={deliveryPresets}
        onUpdateDeliveryPresets={setDeliveryPresets}
        initialTab={settingsTab}
      />

      {/* Barre d'état */}
      <footer className="border-t border-white/10 py-2 px-3 text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${isRunningInPremiere() ? 'bg-green-400' : 'bg-zinc-500'}`}
          title={isRunningInPremiere() ? 'Connecté à Premiere Pro' : 'Hors de Premiere Pro'}
        />
        <AboutMori />
        {appearance.brandLabel &&<span style={{ color: appearance.brandColor }}>{appearance.brandLabel}</span>}
        {isRunningInPremiere() && currentProjectName && (
          <>
            <span>·</span>
            <span className="text-zinc-200 truncate max-w-[10rem]" title={currentProjectName}>
              {currentProjectName}
            </span>
          </>
        )}
        <span>·</span>
        <span>{isRunningInPremiere() ? 'Connecté à Premiere Pro' : 'Hors de Premiere Pro'}</span>
      </footer>
    </div>
  );
}


// ==================== components/AboutMori.tsx ====================

/** Version affichée dans « À propos » : à garder alignée sur CSXS/manifest.xml */
const APP_VERSION = '2.12.0';
/** Version de Mori Checker (application autonome) : à garder alignée sur checker/package.json */
const CHECKER_VERSION = '1.2.0';

/** « Mori » de la barre d'état : souligné au survol, ouvre la fiche « À propos » au clic */
function AboutMori({ product = '', version = APP_VERSION }: { product?: string; version?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`font-semibold text-cream-300 underline-offset-2 decoration-cream-300/70 hover:underline cursor-pointer ${open ? 'underline' : ''}`}
      >
        Mori
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-56 rounded-xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50 px-4 py-4 text-center z-50">
          <div className="mx-auto mb-2.5 w-12 h-12 rounded-xl bg-cream-300 flex items-center justify-center shadow">
            <img src="./assets/logo.png" alt="Mori" draggable={false} className="w-9 h-9" />
          </div>
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="font-extrabold text-base text-cream-300">Mori{product ? ` ${product}` : ''}</span>
            <span className="text-[10px] text-zinc-400">{version}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-200">
            Par <span className="font-bold text-white">Paul-Eliot</span>
          </p>
          <p className="text-xs text-zinc-200">Libre et Open Source</p>
          <p className="text-xs font-semibold text-emerald-300">Claude Code</p>
          <p className="mt-2.5 text-[10px] text-zinc-500">© 2026 Paul-Eliot</p>
        </div>
      )}
    </span>
  );
}


// ==================== CheckerApp.tsx (Mori Checker, hors Premiere) ====================

function CheckerApp() {
  const [presets, setPresets] = useState<DeliveryPreset[]>(loadDeliveryPresets);
  const [normsOpen, setNormsOpen] = useState(false);
  useEffect(() => saveDeliveryPresets(presets), [presets]);
  const initialFile = (() => {
    try {
      return new URLSearchParams(location.search).get('file') || undefined;
    } catch {
      return undefined;
    }
  })();

  useEffect(() => {
    document.title = 'Mori Checker';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNormsOpen(false);
    document.addEventListener('keydown', onKey);
    // un fichier lâché hors de la zone de dépôt ne doit pas remplacer la page
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  return (
    <div className="w-full min-h-screen bg-ink text-zinc-100 flex flex-col font-sans antialiased">
      <header className="bg-ink/95 backdrop-blur border-b border-white/10 sticky top-0 z-40 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-cream-300 flex items-center justify-center flex-shrink-0 shadow">
            <img src="./assets/logo.png" alt="Mori" draggable={false} className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-cream-300 leading-none">Mori</span>
          <span className="font-semibold text-sm leading-none text-emerald-300">Checker</span>
        </div>
        <button
          onClick={() => setNormsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 text-zinc-200 hover:text-cream-300 hover:border-cream-300/60 text-xs font-semibold transition cursor-pointer"
          title="Normes de livraison"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Normes
        </button>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-4">
        <DeliveryChecker presets={presets} onOpenSettings={() => setNormsOpen(true)} standalone initialFile={initialFile} />
      </main>

      {normsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75" onMouseDown={(e) => e.target === e.currentTarget && setNormsOpen(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-zinc-100">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cream-300" />
                <h2 className="font-bold text-cream-300 text-base">Normes de livraison</h2>
              </div>
              <button onClick={() => setNormsOpen(false)} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 text-xs">
              <NormsSettings presets={presets} onChange={setPresets} />
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-white/10 py-2 px-3 text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
        <AboutMori product="Checker" version={CHECKER_VERSION} />
        <span>·</span>
        <span>contrôle des fichiers de livraison</span>
      </footer>
    </div>
  );
}



// ==================== mount ====================

import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
const root = createRoot(container);
// checker.html (Mori Checker, application autonome) déclare window.__moriMode = 'checker'
const RootComponent = (window as any).__moriMode === 'checker' ? CheckerApp : App;
root.render(
  React.createElement(React.StrictMode, null, React.createElement(RootComponent, null))
);
