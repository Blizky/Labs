const input = document.getElementById("input");
const wordCount = document.getElementById("wordCount");
const readingTime = document.getElementById("readingTime");
const changeCount = document.getElementById("changeCount");
const statusLabel = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const runCorrectBtn = document.getElementById("runCorrect");
const langEnBtn = document.getElementById("langEn");
const langEsBtn = document.getElementById("langEs");
const clearBtn = document.getElementById("clear");
const copyOutputBtn = document.getElementById("copyOutput");
const toggleReadingBtn = document.getElementById("toggleReading");
const saveMarkdownBtn = document.getElementById("saveMarkdown");
const savePdfBtn = document.getElementById("savePdf");
const readingView = document.getElementById("readingView");
const openOptionsBtn = document.getElementById("openOptions");
const ignoredModal = document.getElementById("ignoredModal");
const ignoredList = document.getElementById("ignoredList");
const readingSpeedInput = document.getElementById("readingSpeed");
const saveIgnored = document.getElementById("saveIgnored");
const closeIgnored = document.getElementById("closeIgnored");
const languageLabel = document.getElementById("languageLabel");

const STORAGE_KEY = "blizlab_corrector_ignored";
const READING_SPEED_KEY = "blizlab_corrector_reading_speed";
const DEFAULT_READING_SPEED = 165;
const alwaysCorrectByLanguage = {
  es: new Set(["mas"]),
  en: new Set(),
};

const simpleCorrectionsByLanguage = {
  es: new Map([
    ["qeu", "que"],
    ["aun", "aún"],
    ["mas", "más"],
    ["solo", "sólo"],
    ["tmb", "también"],
    ["tambien", "también"],
    ["donde", "dónde"],
    ["como", "cómo"],
    ["por que", "porque"],
    ["porqué", "por qué"],
    ["haber", "a ver"],
    ["k", "que"],
    ["xq", "porque"],
    ["xq?", "¿por qué?"],
  ]),
  en: new Map([
    ["teh", "the"],
    ["dont", "don't"],
    ["cant", "can't"],
    ["wont", "won't"],
    ["im", "I'm"],
    ["ive", "I've"],
    ["id", "I'd"],
    ["i'm", "I'm"],
  ]),
};

const languageLabels = {
  es: "Español",
  en: "English",
};

const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu;

let currentLanguage = null;
let readingSpeed = loadReadingSpeed();
let selectedLanguage = "en";
let languageSetManually = false;
let readingMode = false;

function setPlaceholderByOS() {
  const platform = navigator.platform || "";
  const ua = navigator.userAgent || "";
  const isMac = /mac/i.test(platform) || /macintosh/i.test(ua);
  const hint = isMac
    ? "Shift + Cmd + V to paste text without format."
    : "Shift + Ctrl + V to paste text without format.";
  input.setAttribute(
    "data-placeholder",
    `Paste your text here...\nPaste from Word to convert to Markdown\n${hint}`
  );
}

let ignoredWords = loadIgnoredWords();

function setStatus(text, active = false) {
  statusLabel.textContent = text;
  statusDot.classList.toggle("active", active);
}

function normalizeWord(word) {
  return word.trim().toLowerCase();
}

function loadIgnoredWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map(item => normalizeWord(item)).filter(Boolean));
  } catch (error) {
    return new Set();
  }
}

function loadReadingSpeed() {
  try {
    const raw = localStorage.getItem(READING_SPEED_KEY);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_READING_SPEED;
    return Math.min(250, Math.max(100, Math.round(parsed)));
  } catch (error) {
    return DEFAULT_READING_SPEED;
  }
}

function saveReadingSpeed(value) {
  const safe = Math.min(250, Math.max(100, Math.round(value)));
  localStorage.setItem(READING_SPEED_KEY, String(safe));
  readingSpeed = safe;
}

function saveIgnoredWords() {
  const list = Array.from(ignoredWords.values()).filter(Boolean).sort();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function isIgnoredWord(word, language = currentLanguage) {
  const key = normalizeWord(word);
  if (!key) return false;
  const alwaysCorrect = alwaysCorrectByLanguage[language] || alwaysCorrectByLanguage.es;
  if (alwaysCorrect.has(key)) return false;
  return ignoredWords.has(key);
}

function addIgnoredWord(word, language = currentLanguage) {
  const key = normalizeWord(word);
  const alwaysCorrect = alwaysCorrectByLanguage[language] || alwaysCorrectByLanguage.es;
  if (!key || alwaysCorrect.has(key)) return;
  ignoredWords.add(key);
  saveIgnoredWords();
}

function removeIgnoredWord(word) {
  const key = normalizeWord(word);
  if (!key) return;
  ignoredWords.delete(key);
  saveIgnoredWords();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function preserveMarkdownMarkers(original, replacement) {
  if (!original || !replacement) return replacement;
  const leadingMatch = original.match(/^([*_~`]+)(?=\S)/);
  const trailingMatch = original.match(/([*_~`]+)$/);
  let next = replacement;

  if (leadingMatch) {
    const leading = leadingMatch[1];
    if (!next.startsWith(leading)) {
      next = `${leading}${next}`;
    }
  }

  if (trailingMatch) {
    const trailing = trailingMatch[1];
    if (!next.endsWith(trailing)) {
      next = `${next}${trailing}`;
    }
  }

  return next;
}

function stripEmojis(text) {
  return (text || "")
    .replace(EMOJI_REGEX, "")
    .replace(/\u200D/g, "");
}

function applySimpleCorrections(text, language = currentLanguage) {
  const simpleCorrections = simpleCorrectionsByLanguage[language] || simpleCorrectionsByLanguage.es;
  const alwaysCorrect = alwaysCorrectByLanguage[language] || alwaysCorrectByLanguage.es;
  const edits = [];
  simpleCorrections.forEach((value, key) => {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      const original = match[0];
      const originalKey = normalizeWord(original);
      const nextValue = original === original.toUpperCase() ? value.toUpperCase() : value;
      const replacement = preserveMarkdownMarkers(original, nextValue);
      if (original !== replacement && (!isIgnoredWord(original, language) || alwaysCorrect.has(originalKey))) {
        edits.push({ offset: match.index, length: original.length, replacement, original });
      }
    }
  });

  let corrected = text;
  edits
    .sort((a, b) => b.offset - a.offset)
    .forEach(edit => {
      corrected =
        corrected.slice(0, edit.offset) +
        edit.replacement +
        corrected.slice(edit.offset + edit.length);
    });

  return { corrected, edits };
}

function buildOutputHtml(original, edits, ignoredRanges = []) {
  const ranges = [...ignoredRanges].sort((a, b) => a.start - b.start);
  const orderedEdits = [...edits].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  let html = "";

  orderedEdits.forEach(edit => {
    const before = original.slice(cursor, edit.offset);
    html += wrapSegment(before, cursor, ranges);
    const originalEncoded = encodeURIComponent(edit.original || "");
    const correctedEncoded = encodeURIComponent(edit.replacement || "");
    html += `<span class="change" data-original="${originalEncoded}" data-corrected="${correctedEncoded}">${escapeHtml(edit.replacement)}</span>`;
    cursor = edit.offset + edit.length;
  });

  html += wrapSegment(original.slice(cursor), cursor, ranges);
  return html || "";
}

function wrapSegment(segmentText, segmentStart, ranges) {
  if (!segmentText) return "";
  let html = "";
  let index = 0;
  const segmentEnd = segmentStart + segmentText.length;

  ranges.forEach(range => {
    const start = Math.max(range.start, segmentStart);
    const end = Math.min(range.end, segmentEnd);
    if (end <= start) return;
    const relStart = start - segmentStart;
    const relEnd = end - segmentStart;
    html += escapeHtml(segmentText.slice(index, relStart));
    html += `<span class="flag">${escapeHtml(segmentText.slice(relStart, relEnd))}</span>`;
    index = relEnd;
  });

  html += escapeHtml(segmentText.slice(index));
  return html;
}

function editsOverlap(a, b) {
  const aStart = a.offset;
  const aEnd = a.offset + a.length;
  const bStart = b.offset;
  const bEnd = b.offset + b.length;

  if (a.length === 0 && b.length === 0) return aStart === bStart;
  if (a.length === 0) return aStart >= bStart && aStart < bEnd;
  if (b.length === 0) return bStart >= aStart && bStart < aEnd;
  return aStart < bEnd && bStart < aEnd;
}

function mergeEdits(primary, additional) {
  const combined = [...primary];
  additional.forEach(edit => {
    const hasOverlap = combined.some(existing => editsOverlap(existing, edit));
    if (!hasOverlap) combined.push(edit);
  });
  return combined;
}

function applyEdits(text, edits) {
  let corrected = text;
  [...edits]
    .sort((a, b) => b.offset - a.offset)
    .forEach(edit => {
      corrected =
        corrected.slice(0, edit.offset) +
        edit.replacement +
        corrected.slice(edit.offset + edit.length);
    });
  return corrected;
}

function setCurrentLanguage(language) {
  currentLanguage = language;
  if (languageLabel) {
    if (!language) {
      languageLabel.textContent = "Language: Manual";
    } else {
      const label = languageLabels[language] || languageLabels.es;
      languageLabel.textContent = `Language: ${label}`;
    }
  }
  if (language === "en") {
    document.documentElement.lang = "en";
  } else if (language === "es") {
    document.documentElement.lang = "es";
  }
}

function applyLanguageSelection(language, options = {}) {
  const safeLanguage = language === "es" ? "es" : "en";
  selectedLanguage = safeLanguage;
  if (options.manual) languageSetManually = true;

  if (langEnBtn) {
    const enActive = safeLanguage === "en";
    langEnBtn.classList.toggle("active", enActive);
    langEnBtn.setAttribute("aria-pressed", String(enActive));
  }
  if (langEsBtn) {
    const esActive = safeLanguage === "es";
    langEsBtn.classList.toggle("active", esActive);
    langEsBtn.setAttribute("aria-pressed", String(esActive));
  }

  setCurrentLanguage(safeLanguage);

  if (options.auto) {
    triggerAutoLanguageEffect(safeLanguage);
  }
}

function triggerAutoLanguageEffect(language) {
  const target = language === "es" ? langEsBtn : langEnBtn;
  if (!target) return;
  target.classList.remove("auto-picked");
  void target.offsetWidth;
  target.classList.add("auto-picked");
  window.setTimeout(() => {
    target.classList.remove("auto-picked");
  }, 760);
}

function detectSuggestedLanguage(text) {
  const sample = String(text || "").toLowerCase();
  if (!sample.trim()) {
    return { language: null, confidence: 0 };
  }

  const accentHits = (sample.match(/[áéíóúñü¿¡]/g) || []).length;
  const tokens = sample.match(/[a-záéíóúñü']+/g) || [];
  let esScore = accentHits * 3;
  let enScore = 0;

  const commonEs = new Set(["de", "la", "que", "el", "en", "por", "para", "con", "una", "del", "los", "las", "un", "se", "al"]);
  const commonEn = new Set(["the", "and", "is", "of", "to", "for", "with", "that", "this", "from", "as", "by", "in", "on", "at"]);

  for (const token of tokens) {
    if (commonEs.has(token)) esScore += 1;
    if (commonEn.has(token)) enScore += 1;
  }

  const total = esScore + enScore;
  if (!total) return { language: null, confidence: 0 };

  const language = esScore >= enScore ? "es" : "en";
  const confidence = Math.abs(esScore - enScore) / total;
  return { language, confidence };
}

function maybeApplySuggestedLanguage(text) {
  const suggested = detectSuggestedLanguage(text);
  if (!languageSetManually && suggested.language && suggested.confidence >= 0.18) {
    if (suggested.language !== selectedLanguage) {
      applyLanguageSelection(suggested.language, { auto: true });
    }
  }
}

function updateRunButtonsState() {
  const hasText = Boolean((input.textContent || "").trim());
  runCorrectBtn.disabled = !hasText;
}

async function runCorrection(language) {
  const raw = input.textContent || "";
  const original = stripEmojis(raw);
  if (!original.trim()) {
    input.textContent = "";
    changeCount.textContent = "0 changes";
    updateRunButtonsState();
    return;
  }
  if (raw !== original) {
    input.textContent = original;
  }
  setCurrentLanguage(language);

  setStatus("Correcting…", true);
  runCorrectBtn.disabled = true;

  let ignoredRanges = [];
  let edits = [];
  const activeLanguage = language === "en" ? "en" : "es";
  const apiLanguage = activeLanguage === "en" ? "en-US" : "es";

  try {
    const response = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        text: original,
        language: apiLanguage,
        enabledOnly: "false",
      }),
    });
    if (!response.ok) throw new Error("HTTP error");
    const data = await response.json();
    const result = applyLanguageToolFixes(original, data.matches || []);
    ignoredRanges = result.ignoredRanges;
    edits = result.edits;
  } catch (error) {
    const result = applySimpleCorrections(original, activeLanguage);
    edits = result.edits;
    ignoredRanges = [];
  }

  const forcedEdits = findForcedEdits(original, activeLanguage);
  const combinedEdits = mergeEdits(edits, forcedEdits);

  input.innerHTML = buildOutputHtml(original, combinedEdits, ignoredRanges);
  changeCount.textContent = `${combinedEdits.length} changes`;
  setStatus("Ready", false);
  updateRunButtonsState();
}

function shouldIgnoreCorrection(text, match) {
  const original = text.slice(match.offset, match.offset + match.length);
  const replacement = match.replacements?.[0]?.value || "";
  const prevChar = match.offset > 0 ? text[match.offset - 1] : "";
  const atSentenceStart = match.offset === 0 || /[.!?\n\r]/.test(prevChar);
  const startsWithUpper = /^[A-ZÁÉÍÓÚÑ]/.test(original);
  const originalAllCaps = /^[A-ZÁÉÍÓÚÑ]+$/.test(original);
  const replacementAllCaps = /^[A-ZÁÉÍÓÚÑ]+$/.test(replacement);
  const originalAsciiWord = /^[A-Za-z]+$/.test(original);
  const replacementHasNonAscii = /[^\x00-\x7F]/.test(replacement);

  if (startsWithUpper && !atSentenceStart) return true;
  if (replacementAllCaps && !originalAllCaps) return true;
  if (originalAsciiWord && replacementHasNonAscii) return true;
  if (isIgnoredWord(original)) return true;
  return false;
}

function applyLanguageToolFixes(text, matches) {
  const ignoredRanges = [];
  const edits = matches
    .filter(match => match.replacements && match.replacements.length)
    .filter(match => {
      if (shouldIgnoreCorrection(text, match)) {
        ignoredRanges.push({ start: match.offset, end: match.offset + match.length });
        return false;
      }
      return true;
    })
    .map(match => ({
      offset: match.offset,
      length: match.length,
      replacement: preserveMarkdownMarkers(
        text.slice(match.offset, match.offset + match.length),
        match.replacements[0].value
      ),
      original: text.slice(match.offset, match.offset + match.length),
    }))
    .sort((a, b) => b.offset - a.offset);

  return { ignoredRanges, edits };
}

function findForcedEdits(text, language = currentLanguage) {
  if (language !== "es") return [];
  const edits = [];
  const regex = /\bmas\b/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const original = match[0];
    const nextValue = original === original.toUpperCase() ? "MÁS" : "más";
    const replacement = preserveMarkdownMarkers(original, nextValue);
    if (original !== replacement) {
      edits.push({ offset: match.index, length: original.length, replacement, original });
    }
  }
  return edits;
}

function updateWordCount() {
  const text = input.textContent || "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  wordCount.textContent = `${words} words`;
  if (readingTime) {
    const minutes = words ? Math.max(1, Math.ceil(words / readingSpeed)) : 0;
    readingTime.textContent = `${minutes} min read`;
  }
}

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const { body } = doc;

  function normalizeInlineText(text) {
    return text
      .replace(EMOJI_REGEX, "")
      .replace(/\u200D/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ");
  }

  function textFrom(node, options = {}) {
    if (node.nodeType === Node.TEXT_NODE) return normalizeInlineText(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") {
      const inner = childrenText(node, options);
      const trimmed = inner.trim();
      if (!trimmed) return inner;
      if (options.stripBold) return inner;
      if (trimmed.startsWith("**") && trimmed.endsWith("**")) return inner;
      return `**${inner}**`;
    }
    if (tag === "em" || tag === "i") {
      const inner = childrenText(node, options);
      if (!inner.trim()) return inner;
      return `*${inner}*`;
    }
    if (tag === "code") return `\`${childrenText(node, options)}\``;
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      const label = childrenText(node, options) || href;
      return href ? `[${label}](${href})` : label;
    }
    if (tag === "h1") return `# ${childrenText(node, { ...options, stripBold: true })}\n\n`;
    if (tag === "h2") return `## ${childrenText(node, { ...options, stripBold: true })}\n\n`;
    if (tag === "h3") return `### ${childrenText(node, { ...options, stripBold: true })}\n\n`;
    if (tag === "h4") return `#### ${childrenText(node, { ...options, stripBold: true })}\n\n`;
    if (tag === "h5") return `##### ${childrenText(node, { ...options, stripBold: true })}\n\n`;
    if (tag === "h6") return `###### ${childrenText(node, { ...options, stripBold: true })}\n\n`;
    if (tag === "p") return `${childrenText(node, options)}\n\n`;
    if (tag === "blockquote") return `> ${childrenText(node, options).replace(/\n/g, "\n> ")}\n\n`;
    if (tag === "ul") return `${listText(node, "- ")}\n`;
    if (tag === "ol") return `${listText(node, "1. ")}\n`;
    return childrenText(node, options);
  }

  function childrenText(node, options = {}) {
    let result = "";
    node.childNodes.forEach(child => {
      result += textFrom(child, options);
    });
    return result;
  }

  function listText(listNode, prefix) {
    let result = "";
    const items = Array.from(listNode.children).filter(el => el.tagName.toLowerCase() === "li");
    items.forEach((item, index) => {
      const actualPrefix = prefix === "1. " ? `${index + 1}. ` : prefix;
      const text = childrenText(item).trim();
      result += `${actualPrefix}${text}\n`;
    });
    return result;
  }

  return childrenText(body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeMarkdown(text) {
  const sample = text || "";
  return [
    /^#{1,6}\s+\S+/m,
    /^\s*[-*+]\s+\S+/m,
    /^\s*\d+\.\s+\S+/m,
    /\*\*[^*]+\*\*/,
    /`{1,3}[^`]+`{1,3}/,
    /\[[^\]]+\]\([^)]+\)/,
  ].some(pattern => pattern.test(sample));
}

function normalizePlainPaste(text) {
  if (!text) return "";
  return stripEmojis(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n\n")
    .map(block => block.replace(/\n+/g, " ").replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function htmlToRenderedParagraphText(html) {
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const blockTags = new Set([
      "p", "div", "article", "section", "main", "aside", "header", "footer",
      "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "blockquote",
      "pre", "table", "tr"
    ]);

    function walk(node) {
      if (!node) return "";
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent || "").replace(/\s+/g, " ");
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") return "\n";

      let chunk = "";
      el.childNodes.forEach(child => {
        chunk += walk(child);
      });

      if (blockTags.has(tag)) {
        const trimmed = chunk.trim();
        return trimmed ? `${trimmed}\n\n` : "";
      }
      return chunk;
    }

    const rendered = walk(doc.body) || doc.body?.innerText || doc.body?.textContent || "";
    return normalizePlainPaste(rendered);
  } catch (error) {
    return "";
  }
}

function insertTextAtCursor(text) {
  const safeText = stripEmojis(text);
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    input.textContent += safeText;
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(safeText);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getCurrentText() {
  return stripEmojis(input.textContent || "");
}

function getTitleFromMarkdown(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const firstLine = lines[0].replace(/^#+\s*/, "");
  const safe = firstLine
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe) return "";
  return safe.slice(0, 30);
}

function openIgnoredModal() {
  ignoredList.value = Array.from(ignoredWords).sort().join("\n");
  if (readingSpeedInput) {
    readingSpeedInput.value = readingSpeed;
  }
  ignoredModal.classList.add("show");
  ignoredModal.setAttribute("aria-hidden", "false");
}

function closeIgnoredModal() {
  ignoredModal.classList.remove("show");
  ignoredModal.setAttribute("aria-hidden", "true");
}

input.addEventListener("input", () => {
  updateWordCount();
  changeCount.textContent = `${input.querySelectorAll(".change").length} changes`;
  maybeApplySuggestedLanguage(input.textContent || "");
  updateRunButtonsState();
});

input.addEventListener("paste", (event) => {
  const plain = event.clipboardData?.getData("text/plain");
  const html = event.clipboardData?.getData("text/html");
  const normalizedPlain = normalizePlainPaste(plain || "");

  if (plain && looksLikeMarkdown(plain)) {
    event.preventDefault();
    insertTextAtCursor(plain);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (html) {
    event.preventDefault();
    const markdown = htmlToMarkdown(html);
    const htmlParagraphText = htmlToRenderedParagraphText(html);
    let preferred = markdown;

    // Some copied web selections collapse paragraphs during HTML conversion.
    // If rendered HTML/plain text clearly has paragraph breaks and markdown lost them, use paragraph text.
    if (normalizedPlain) {
      const plainBlocks = normalizedPlain.split(/\n\n/).length;
      const markdownBlocks = markdown.split(/\n\n/).length;
      if (plainBlocks > 1 && markdownBlocks <= 1) {
        preferred = normalizedPlain;
      }
    }

    if (htmlParagraphText) {
      const htmlBlocks = htmlParagraphText.split(/\n\n/).length;
      const markdownBlocks = markdown.split(/\n\n/).length;
      if (htmlBlocks > 1 && markdownBlocks <= 1) {
        preferred = htmlParagraphText;
      }
    }

    insertTextAtCursor(preferred || htmlParagraphText || normalizedPlain || plain || "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (plain) {
    event.preventDefault();
    insertTextAtCursor(normalizedPlain || plain);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

function toggleAllMatches(original, toState) {
  const normalized = normalizeWord(original);
  const nodes = input.querySelectorAll("[data-original]");
  nodes.forEach(node => {
    const nodeOriginal = decodeURIComponent(node.dataset.original || "");
    if (normalizeWord(nodeOriginal) !== normalized) return;
    const nodeCorrected = decodeURIComponent(node.dataset.corrected || "");
    if (toState === "reverted") {
      node.textContent = nodeOriginal;
      node.classList.remove("change");
      node.classList.add("reverted");
    } else {
      node.textContent = nodeCorrected || node.textContent;
      node.classList.remove("reverted");
      node.classList.add("change");
    }
  });
}

input.addEventListener("click", (event) => {
  const target = event.target.closest(".change, .reverted");
  if (!target) return;
  const original = decodeURIComponent(target.dataset.original || "");
  if (!original) return;

  if (target.classList.contains("change")) {
    toggleAllMatches(original, "reverted");
    addIgnoredWord(original);
  } else {
    toggleAllMatches(original, "change");
    removeIgnoredWord(original);
  }

  changeCount.textContent = `${input.querySelectorAll(".change").length} cambios`;
});

if (langEnBtn) {
  langEnBtn.addEventListener("click", () => applyLanguageSelection("en", { manual: true }));
}
if (langEsBtn) {
  langEsBtn.addEventListener("click", () => applyLanguageSelection("es", { manual: true }));
}
runCorrectBtn.addEventListener("click", () => {
  setReadingMode(false);
  runCorrection(selectedLanguage);
});

clearBtn.addEventListener("click", () => {
  setReadingMode(false);
  input.textContent = "";
  changeCount.textContent = "0 changes";
  updateWordCount();
  languageSetManually = false;
  applyLanguageSelection("en");
  updateRunButtonsState();
  setStatus("Ready", false);
});

copyOutputBtn.addEventListener("click", async () => {
  const text = getCurrentText();
  if (!text.trim()) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied", true);
    setTimeout(() => setStatus("Ready", false), 1200);
  } catch (error) {
    setStatus("Copy failed", false);
  }
});

toggleReadingBtn.addEventListener("click", () => {
  setReadingMode(!readingMode);
});

saveMarkdownBtn.addEventListener("click", () => {
  const text = getCurrentText();
  if (!text.trim()) return;
  const title = getTitleFromMarkdown(text);
  const filename = title ? `${title}.md` : "corrected-text.md";
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

function getPdfInlineRuns(text, baseStyle = "normal") {
  const runs = [];
  const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      runs.push({ text: text.slice(cursor, match.index), style: baseStyle });
    }
    if (match[2]) {
      runs.push({ text: match[2], style: "bold" });
    } else if (match[4]) {
      runs.push({ text: match[4], style: "italic" });
    } else if (match[5]) {
      runs.push({ text: match[5], style: "code" });
    } else if (match[6]) {
      runs.push({ text: match[6], pdfText: `${match[6]} (${match[7]})`, href: match[7], style: "link" });
    }
    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) {
    runs.push({ text: text.slice(cursor), style: baseStyle });
  }
  return runs;
}

function getPlainInlineText(text) {
  return getPdfInlineRuns(text).map(run => run.text).join("");
}

function parseMarkdownTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cell => cell.trim());
}

function isMarkdownTableSeparator(line) {
  const cells = parseMarkdownTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trimEnd();

    if (/^```/.test(line.trim())) {
      const codeLines = [];
      lineIndex += 1;
      while (lineIndex < lines.length && !/^```/.test(lines[lineIndex].trim())) {
        codeLines.push(lines[lineIndex]);
        lineIndex += 1;
      }
      blocks.push({ type: "code", lines: codeLines });
      continue;
    }

    if (!line.trim()) {
      blocks.push({ type: "blank" });
      continue;
    }

    if (line.includes("|") && lineIndex + 1 < lines.length && isMarkdownTableSeparator(lines[lineIndex + 1])) {
      const rows = [parseMarkdownTableRow(line)];
      lineIndex += 2;
      while (lineIndex < lines.length && lines[lineIndex].includes("|") && lines[lineIndex].trim()) {
        rows.push(parseMarkdownTableRow(lines[lineIndex]));
        lineIndex += 1;
      }
      lineIndex -= 1;
      blocks.push({ type: "table", rows });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(line.trim())) {
      blocks.push({ type: "rule" });
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push({ type: "quote", text: quote[1] });
      continue;
    }

    const listItem = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      blocks.push({
        type: "list",
        indent: Math.min(3, Math.floor(listItem[1].length / 2)),
        marker: /^\d/.test(listItem[2]) ? listItem[2] : "•",
        text: listItem[3],
      });
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
  }

  return blocks;
}

function renderInlineHtml(text, baseStyle = "normal") {
  return getPdfInlineRuns(text, baseStyle).map(run => {
    const safeText = escapeHtml(run.text);
    if (run.style === "bold") return `<strong>${safeText}</strong>`;
    if (run.style === "italic") return `<em>${safeText}</em>`;
    if (run.style === "code") return `<code>${safeText}</code>`;
    if (run.style === "link" && /^(https?:|mailto:)/i.test(run.href || "")) {
      const safeHref = escapeHtml(run.href).replace(/"/g, "&quot;");
      return `<a href="${safeHref}" target="_blank" rel="noreferrer noopener">${safeText}</a>`;
    }
    return safeText;
  }).join("");
}

function setReadingMode(enabled) {
  readingMode = enabled;
  if (enabled) {
    readingView.innerHTML = renderMarkdownToReadingHtml(getCurrentText());
  }
  input.hidden = enabled;
  readingView.hidden = !enabled;
  toggleReadingBtn.textContent = enabled ? "Edit" : "Read";
  toggleReadingBtn.setAttribute("aria-pressed", String(enabled));
  toggleReadingBtn.classList.toggle("active", enabled);
}

function renderMarkdownToReadingHtml(markdown) {
  return parseMarkdownBlocks(markdown).map(block => {
    if (block.type === "blank") return "";
    if (block.type === "heading") return `<h${block.level}>${renderInlineHtml(block.text, "bold")}</h${block.level}>`;
    if (block.type === "rule") return "<hr>";
    if (block.type === "quote") return `<blockquote>${renderInlineHtml(block.text, "italic")}</blockquote>`;
    if (block.type === "list") {
      return `<div class="reading-list-item" style="--list-indent:${block.indent}"><span>${escapeHtml(block.marker)}</span><div>${renderInlineHtml(block.text)}</div></div>`;
    }
    if (block.type === "code") return `<pre><code>${escapeHtml(block.lines.join("\n"))}</code></pre>`;
    if (block.type === "table") {
      const [header, ...rows] = block.rows;
      return `<div class="reading-table-wrap"><table><thead><tr>${header.map(cell => `<th>${renderInlineHtml(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${renderInlineHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    return `<p>${renderInlineHtml(block.text)}</p>`;
  }).join("");
}

function renderMarkdownToPdf(pdf, markdown) {
  const margin = 54;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const maxY = pageHeight - margin;
  let y = margin;
  function ensureSpace(height) {
    if (y + height <= maxY) return;
    pdf.addPage();
    y = margin;
  }

  function setRunFont(style, size) {
    if (style === "code") {
      pdf.setFont("courier", "normal");
      pdf.setTextColor(45, 55, 65);
    } else {
      pdf.setFont("helvetica", style === "link" ? "normal" : style);
      pdf.setTextColor(style === "link" ? 0 : 36, style === "link" ? 122 : 41, style === "link" ? 163 : 45);
    }
    pdf.setFontSize(size);
  }

  function writeInline(text, options = {}) {
    const xStart = options.x || margin;
    const maxWidth = options.maxWidth || contentWidth;
    const size = options.size || 11;
    const lineHeight = options.lineHeight || Math.ceil(size * 1.4);
    const baseStyle = options.style || "normal";
    let x = xStart;

    ensureSpace(lineHeight);
    getPdfInlineRuns(text, baseStyle).forEach(run => {
        const parts = (run.pdfText || run.text).split(/(\s+)/).filter(Boolean);
      parts.forEach(part => {
        setRunFont(run.style, size);
        const width = pdf.getTextWidth(part);
        if (!/^\s+$/.test(part) && x > xStart && x + width > xStart + maxWidth) {
          y += lineHeight;
          ensureSpace(lineHeight);
          x = xStart;
        }
        if (x !== xStart || !/^\s+$/.test(part)) {
          pdf.text(part, x, y);
          x += width;
        }
      });
    });
    y += lineHeight;
  }

  function renderTable(rows) {
    const columnCount = Math.max(...rows.map(row => row.length));
    const cellWidth = contentWidth / columnCount;
    const cellPadding = 5;
    const lineHeight = 12;

    rows.forEach((row, rowIndex) => {
      const wrappedCells = Array.from({ length: columnCount }, (_, columnIndex) => {
        const value = getPlainInlineText(row[columnIndex] || "");
        pdf.setFont("helvetica", rowIndex === 0 ? "bold" : "normal");
        pdf.setFontSize(9);
        return pdf.splitTextToSize(value, cellWidth - cellPadding * 2);
      });
      const rowHeight = Math.max(...wrappedCells.map(lines => lines.length), 1) * lineHeight + cellPadding * 2;
      ensureSpace(rowHeight);

      wrappedCells.forEach((lines, columnIndex) => {
        const x = margin + columnIndex * cellWidth;
        if (rowIndex === 0) {
          pdf.setFillColor(226, 232, 235);
          pdf.rect(x, y, cellWidth, rowHeight, "F");
        }
        pdf.setDrawColor(160, 169, 176);
        pdf.setLineWidth(0.6);
        pdf.rect(x, y, cellWidth, rowHeight);
        pdf.setFont("helvetica", rowIndex === 0 ? "bold" : "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(36, 41, 45);
        pdf.text(lines, x + cellPadding, y + cellPadding + 9, { lineHeightFactor: 1.25 });
      });

      y += rowHeight;
    });
    y += 10;
  }

  parseMarkdownBlocks(markdown).forEach(block => {
    if (block.type === "blank") {
      y += 8;
      ensureSpace(1);
      return;
    }

    if (block.type === "code") {
      y += 5;
      block.lines.forEach(line => {
        ensureSpace(15);
        pdf.setFillColor(242, 244, 246);
        pdf.rect(margin - 6, y - 11, contentWidth + 12, 16, "F");
        writeInline(line || " ", { size: 9, lineHeight: 16, style: "code" });
      });
      y += 8;
      return;
    }

    if (block.type === "table") {
      renderTable(block.rows);
      return;
    }

    if (block.type === "heading") {
      const level = block.level;
      const sizes = [22, 18, 15, 13, 12, 11];
      const size = sizes[level - 1];
      y += level <= 2 ? 8 : 4;
      writeInline(block.text, {
        size,
        lineHeight: Math.ceil(size * 1.35),
        style: "bold",
      });
      return;
    }

    if (block.type === "rule") {
      ensureSpace(16);
      pdf.setDrawColor(190, 196, 201);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 16;
      return;
    }

    if (block.type === "quote") {
      ensureSpace(18);
      pdf.setDrawColor(0, 153, 204);
      pdf.setLineWidth(2);
      pdf.line(margin, y - 10, margin, y + 6);
      writeInline(block.text, {
        x: margin + 12,
        maxWidth: contentWidth - 12,
        style: "italic",
      });
      return;
    }

    if (block.type === "list") {
      const indent = block.indent * 12;
      ensureSpace(16);
      setRunFont("bold", 11);
      pdf.text(block.marker, margin + indent, y);
      writeInline(block.text, {
        x: margin + indent + 18,
        maxWidth: contentWidth - indent - 18,
      });
      return;
    }

    writeInline(block.text);
  });
}

savePdfBtn.addEventListener("click", () => {
  const text = getCurrentText();
  if (!text.trim()) return;
  if (!window.jspdf) {
    setStatus("PDF unavailable", false);
    return;
  }

  const title = getTitleFromMarkdown(text);
  const filename = title ? `${title}.pdf` : "corrected-text.pdf";
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  renderMarkdownToPdf(pdf, text);
  pdf.save(filename);
  setStatus("PDF saved", true);
  setTimeout(() => setStatus("Ready", false), 1200);
});

if (openOptionsBtn) {
  openOptionsBtn.addEventListener("click", openIgnoredModal);
}

closeIgnored.addEventListener("click", closeIgnoredModal);

saveIgnored.addEventListener("click", () => {
  const lines = ignoredList.value.split(/\r?\n/);
  ignoredWords = new Set(lines.map(line => normalizeWord(line)).filter(Boolean));
  saveIgnoredWords();
  if (readingSpeedInput) {
    saveReadingSpeed(readingSpeedInput.value || DEFAULT_READING_SPEED);
  }
  closeIgnoredModal();
});

ignoredModal.addEventListener("click", (event) => {
  if (event.target === ignoredModal) closeIgnoredModal();
});

updateWordCount();
applyLanguageSelection("en");
setPlaceholderByOS();
updateRunButtonsState();

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      setStatus("Offline cache unavailable", false);
    });
  });
}

if (readingSpeedInput) {
  readingSpeedInput.value = readingSpeed;
  readingSpeedInput.addEventListener("change", () => {
    saveReadingSpeed(readingSpeedInput.value || DEFAULT_READING_SPEED);
    updateWordCount();
  });
}
