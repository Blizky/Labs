const input = document.getElementById("input");
const wordCount = document.getElementById("wordCount");
const readingTime = document.getElementById("readingTime");
const changeCount = document.getElementById("changeCount");
const statusLabel = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const runEnBtn = document.getElementById("runEn");
const runEsBtn = document.getElementById("runEs");
const clearBtn = document.getElementById("clear");
const copyOutputBtn = document.getElementById("copyOutput");
const saveMarkdownBtn = document.getElementById("saveMarkdown");
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
let readingSpeed = DEFAULT_READING_SPEED;

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
      languageLabel.textContent = `Language: ${label} (manual)`;
    }
  }
  if (language === "en") {
    document.documentElement.lang = "en";
  } else if (language === "es") {
    document.documentElement.lang = "es";
  }
}

function updateRunButtonsState() {
  const hasText = Boolean((input.textContent || "").trim());
  runEnBtn.disabled = !hasText;
  runEsBtn.disabled = !hasText;
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
  runEnBtn.disabled = true;
  runEsBtn.disabled = true;

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
  ignoredModal.classList.add("open");
  ignoredModal.setAttribute("aria-hidden", "false");
}

function closeIgnoredModal() {
  ignoredModal.classList.remove("open");
  ignoredModal.setAttribute("aria-hidden", "true");
}

input.addEventListener("input", () => {
  updateWordCount();
  changeCount.textContent = `${input.querySelectorAll(".change").length} changes`;
  updateRunButtonsState();
});

input.addEventListener("paste", (event) => {
  const plain = event.clipboardData?.getData("text/plain");
  const html = event.clipboardData?.getData("text/html");
  if (plain && looksLikeMarkdown(plain)) {
    event.preventDefault();
    insertTextAtCursor(plain);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (html) {
    event.preventDefault();
    const markdown = htmlToMarkdown(html);
    insertTextAtCursor(markdown);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (plain) {
    event.preventDefault();
    insertTextAtCursor(plain);
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

runEnBtn.addEventListener("click", () => runCorrection("en"));
runEsBtn.addEventListener("click", () => runCorrection("es"));

clearBtn.addEventListener("click", () => {
  input.textContent = "";
  changeCount.textContent = "0 changes";
  updateWordCount();
  setCurrentLanguage(null);
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
setCurrentLanguage(null);
setPlaceholderByOS();
updateRunButtonsState();

readingSpeed = loadReadingSpeed();
if (readingSpeedInput) {
  readingSpeedInput.value = readingSpeed;
  readingSpeedInput.addEventListener("change", () => {
    saveReadingSpeed(readingSpeedInput.value || DEFAULT_READING_SPEED);
    updateWordCount();
  });
}
