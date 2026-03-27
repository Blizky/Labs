(function () {
  const THEME_STORAGE_KEY = "threadmaker_theme";
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
    en: "English",
    es: "Español",
  };

  const ignoredCorrections = new Set();

  let selectedLanguage = "en";
  let languageSetManually = false;

  function normalizeText(value) {
    return value.replace(/\r\n?/g, "\n").trim();
  }

  function normalizeWord(word) {
    return String(word || "").trim().toLowerCase();
  }

  function getIgnoredCorrectionKey(word, language = selectedLanguage) {
    return `${language === "es" ? "es" : "en"}:${normalizeWord(word)}`;
  }

  function isIgnoredCorrection(word, language = selectedLanguage) {
    return ignoredCorrections.has(getIgnoredCorrectionKey(word, language));
  }

  function addIgnoredCorrection(word, language = selectedLanguage) {
    const key = getIgnoredCorrectionKey(word, language);
    if (!key.endsWith(":")) {
      ignoredCorrections.add(key);
    }
  }

  function removeIgnoredCorrection(word, language = selectedLanguage) {
    ignoredCorrections.delete(getIgnoredCorrectionKey(word, language));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function wrapSegment(segmentText, segmentStart, ranges) {
    if (!segmentText) {
      return "";
    }

    let html = "";
    let index = 0;
    const segmentEnd = segmentStart + segmentText.length;

    ranges.forEach((range) => {
      const start = Math.max(range.start, segmentStart);
      const end = Math.min(range.end, segmentEnd);
      if (end <= start) {
        return;
      }

      const relativeStart = start - segmentStart;
      const relativeEnd = end - segmentStart;
      html += escapeHtml(segmentText.slice(index, relativeStart));
      html += `<span class="flag">${escapeHtml(segmentText.slice(relativeStart, relativeEnd))}</span>`;
      index = relativeEnd;
    });

    html += escapeHtml(segmentText.slice(index));
    return html;
  }

  function buildOutputHtml(original, edits, ignoredRanges = []) {
    const ranges = [...ignoredRanges].sort((a, b) => a.start - b.start);
    const orderedEdits = [...edits].sort((a, b) => a.offset - b.offset);
    let cursor = 0;
    let html = "";

    orderedEdits.forEach((edit) => {
      const before = original.slice(cursor, edit.offset);
      html += wrapSegment(before, cursor, ranges);
      const originalEncoded = encodeURIComponent(edit.original || "");
      const correctedEncoded = encodeURIComponent(edit.replacement || "");
      html += `<span class="change" data-original="${originalEncoded}" data-corrected="${correctedEncoded}">${escapeHtml(edit.replacement)}</span>`;
      cursor = edit.offset + edit.length;
    });

    html += wrapSegment(original.slice(cursor), cursor, ranges);
    return html;
  }

  function formatHashtagWord(word) {
    if (!word) {
      return "";
    }

    if (word.length <= 2 && word === word.toUpperCase()) {
      return word;
    }

    const tail = word === word.toLowerCase() ? word.slice(1).toLowerCase() : word.slice(1);
    return word.charAt(0).toUpperCase() + tail;
  }

  function normalizeHashtagToken(tag) {
    const stripped = String(tag || "").replace(/^#+/, "").trim();
    if (!stripped) {
      return "";
    }

    const words = stripped
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter(Boolean);

    if (!words.length) {
      return "";
    }

    return `#${words.map(formatHashtagWord).join("")}`;
  }

  function normalizeHashtags(input) {
    return input
      .split(/[\s,]+/)
      .map(normalizeHashtagToken)
      .filter(Boolean)
      .join(" ");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function preserveMarkdownMarkers(original, replacement) {
    if (!original || !replacement) {
      return replacement;
    }

    const leadingMatch = original.match(/^([*_~`]+)(?=\S)/);
    const trailingMatch = original.match(/([*_~`]+)$/);
    let next = replacement;

    if (leadingMatch && !next.startsWith(leadingMatch[1])) {
      next = `${leadingMatch[1]}${next}`;
    }

    if (trailingMatch && !next.endsWith(trailingMatch[1])) {
      next = `${next}${trailingMatch[1]}`;
    }

    return next;
  }

  function editsOverlap(a, b) {
    const aStart = a.offset;
    const aEnd = a.offset + a.length;
    const bStart = b.offset;
    const bEnd = b.offset + b.length;

    if (a.length === 0 && b.length === 0) {
      return aStart === bStart;
    }

    if (a.length === 0) {
      return aStart >= bStart && aStart < bEnd;
    }

    if (b.length === 0) {
      return bStart >= aStart && bStart < aEnd;
    }

    return aStart < bEnd && bStart < aEnd;
  }

  function mergeEdits(primary, additional) {
    const combined = [...primary];

    additional.forEach((edit) => {
      const hasOverlap = combined.some((existing) => editsOverlap(existing, edit));
      if (!hasOverlap) {
        combined.push(edit);
      }
    });

    return combined;
  }

  function applyEdits(text, edits) {
    let corrected = text;

    [...edits]
      .sort((a, b) => b.offset - a.offset)
      .forEach((edit) => {
        corrected =
          corrected.slice(0, edit.offset) +
          edit.replacement +
          corrected.slice(edit.offset + edit.length);
      });

    return corrected;
  }

  function applySimpleCorrections(text, language = selectedLanguage) {
    const simpleCorrections =
      simpleCorrectionsByLanguage[language] || simpleCorrectionsByLanguage.en;
    const alwaysCorrect = alwaysCorrectByLanguage[language] || alwaysCorrectByLanguage.en;
    const edits = [];

    simpleCorrections.forEach((value, key) => {
      const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
      let match;

      while ((match = regex.exec(text)) !== null) {
        const original = match[0];
        const originalKey = normalizeWord(original);
        const nextValue = original === original.toUpperCase() ? value.toUpperCase() : value;
        const replacement = preserveMarkdownMarkers(original, nextValue);

        if (original !== replacement && (!isIgnoredCorrection(original, language) || alwaysCorrect.has(originalKey))) {
          edits.push({
            offset: match.index,
            length: original.length,
            replacement,
            original,
          });
        }
      }
    });

    return {
      corrected: applyEdits(text, edits),
      edits,
    };
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

    if (startsWithUpper && !atSentenceStart) {
      return true;
    }

    if (replacementAllCaps && !originalAllCaps) {
      return true;
    }

    if (originalAsciiWord && replacementHasNonAscii) {
      return true;
    }

    if (isIgnoredCorrection(original)) {
      return true;
    }

    return false;
  }

  function applyLanguageToolFixes(text, matches) {
    const ignoredRanges = [];
    const edits = matches
      .filter((match) => match.replacements && match.replacements.length)
      .filter((match) => {
        if (shouldIgnoreCorrection(text, match)) {
          ignoredRanges.push({
            start: match.offset,
            end: match.offset + match.length,
          });
          return false;
        }

        return true;
      })
      .map((match) => ({
        offset: match.offset,
        length: match.length,
        replacement: preserveMarkdownMarkers(
          text.slice(match.offset, match.offset + match.length),
          match.replacements[0].value
        ),
        original: text.slice(match.offset, match.offset + match.length),
      }));

    return { ignoredRanges, edits };
  }

  function findForcedEdits(text, language = selectedLanguage) {
    if (language !== "es") {
      return [];
    }

    const edits = [];
    const regex = /\bmas\b/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const original = match[0];
      const replacement = original === original.toUpperCase() ? "MÁS" : "más";

      edits.push({
        offset: match.index,
        length: original.length,
        replacement,
        original,
      });
    }

    return edits;
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

    const commonEs = new Set([
      "de",
      "la",
      "que",
      "el",
      "en",
      "por",
      "para",
      "con",
      "una",
      "del",
      "los",
      "las",
      "un",
      "se",
      "al",
    ]);
    const commonEn = new Set([
      "the",
      "and",
      "is",
      "of",
      "to",
      "for",
      "with",
      "that",
      "this",
      "from",
      "as",
      "by",
      "in",
      "on",
      "at",
    ]);

    for (const token of tokens) {
      if (commonEs.has(token)) {
        esScore += 1;
      }

      if (commonEn.has(token)) {
        enScore += 1;
      }
    }

    const total = esScore + enScore;
    if (!total) {
      return { language: null, confidence: 0 };
    }

    return {
      language: esScore >= enScore ? "es" : "en",
      confidence: Math.abs(esScore - enScore) / total,
    };
  }

  function normalizePlainPaste(text) {
    if (!text) {
      return "";
    }

    return String(text)
      .replace(/^\uFEFF/, "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n\n")
      .map((block) => block.replace(/\n+/g, " ").replace(/[ \t]{2,}/g, " ").trim())
      .filter(Boolean)
      .join("\n\n");
  }

  function htmlToRenderedParagraphText(html) {
    if (!html) {
      return "";
    }

    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const blockTags = new Set([
        "p",
        "div",
        "article",
        "section",
        "main",
        "aside",
        "header",
        "footer",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "li",
        "ul",
        "ol",
        "blockquote",
        "pre",
        "table",
        "tr",
      ]);

      function walk(node) {
        if (!node) {
          return "";
        }

        if (node.nodeType === Node.TEXT_NODE) {
          return (node.textContent || "").replace(/\s+/g, " ");
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return "";
        }

        const tag = node.tagName.toLowerCase();
        if (tag === "br") {
          return "\n";
        }

        let chunk = "";
        node.childNodes.forEach((child) => {
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

  async function correctTextContent(text, language = selectedLanguage, fetchImpl = globalThis.fetch) {
    const original = String(text || "");
    if (!original.trim()) {
      return {
        corrected: "",
        changes: 0,
        method: "none",
        edits: [],
        ignoredRanges: [],
        original,
      };
    }

    let edits = [];
    let ignoredRanges = [];
    let method = "fallback";
    const activeLanguage = language === "es" ? "es" : "en";
    const apiLanguage = activeLanguage === "es" ? "es" : "en-US";

    try {
      if (typeof fetchImpl !== "function") {
        throw new Error("Fetch unavailable");
      }

      const response = await fetchImpl("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          text: original,
          language: apiLanguage,
          enabledOnly: "false",
        }),
      });

      if (!response.ok) {
        throw new Error("LanguageTool unavailable");
      }

      const data = await response.json();
      const result = applyLanguageToolFixes(original, data.matches || []);
      edits = result.edits;
      ignoredRanges = result.ignoredRanges;
      method = "languagetool";
    } catch (error) {
      const fallback = applySimpleCorrections(original, activeLanguage);
      edits = fallback.edits;
      ignoredRanges = [];
      method = "fallback";
    }

    const forcedEdits = findForcedEdits(original, activeLanguage);
    const combinedEdits = mergeEdits(edits, forcedEdits);

    return {
      corrected: applyEdits(original, combinedEdits),
      changes: combinedEdits.length,
      method,
      edits: combinedEdits,
      ignoredRanges,
      original,
    };
  }

  function findBestBreakIndex(text, maxLength) {
    if (text.length <= maxLength) {
      return text.length;
    }

    const slice = text.slice(0, maxLength + 1);
    const breakPatterns = [
      /\n{2,}(?![\s\S]*\n{2,})/,
      /[.!?…]["')\]]?\s+(?![\s\S]*[.!?…]["')\]]?\s+)/,
      /\n(?![\s\S]*\n)/,
      /\s(?![\s\S]*\s)/,
    ];

    for (const pattern of breakPatterns) {
      const match = slice.match(pattern);
      if (match && typeof match.index === "number") {
        if (pattern.source.startsWith("\\n{2,")) {
          return match.index;
        }

        return match.index + match[0].length;
      }
    }

    return maxLength;
  }

  function takeChunk(text, maxLength) {
    const safeLength = Math.max(1, maxLength);

    if (text.length <= safeLength) {
      return {
        chunk: text.trim(),
        rest: "",
      };
    }

    const breakIndex = findBestBreakIndex(text, safeLength);
    let chunk = text.slice(0, breakIndex).trim();
    let rest = text.slice(breakIndex).trimStart();

    if (!chunk) {
      chunk = text.slice(0, safeLength).trim();
      rest = text.slice(safeLength).trimStart();
    }

    return { chunk, rest };
  }

  function splitPlainPosts(text, getLimitForIndex) {
    let remaining = normalizeText(text);
    const chunks = [];
    let index = 0;

    while (remaining) {
      const available = getLimitForIndex(index);

      if (!Number.isFinite(available) || available < 1) {
        throw new Error("The selected limit is too small for the current settings.");
      }

      const { chunk, rest } = takeChunk(remaining, available);

      if (!chunk) {
        break;
      }

      chunks.push(chunk);
      remaining = rest;
      index += 1;
    }

    return chunks;
  }

  function tokenizeText(text) {
    const paragraphs = normalizeText(text)
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const units = [];

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const sentences =
        paragraph.match(/[^.!?…]+(?:[.!?…]+["')\]]*)?|[^.!?…]+$/g) || [paragraph];

      sentences
        .map((sentence) => sentence.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .forEach((sentence, sentenceIndex) => {
          units.push({
            text: sentence,
            separatorBefore:
              sentenceIndex === 0 ? (paragraphIndex === 0 ? "" : "\n\n") : " ",
          });
        });
    });

    return units;
  }

  function tokenizeWords(text) {
    const paragraphs = normalizeText(text)
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const units = [];

    paragraphs.forEach((paragraph, paragraphIndex) => {
      paragraph
        .split(/\s+/)
        .filter(Boolean)
        .forEach((word, wordIndex) => {
          units.push({
            text: word,
            separatorBefore:
              wordIndex === 0 ? (paragraphIndex === 0 ? "" : "\n\n") : " ",
          });
        });
    });

    return units;
  }

  function splitLongTextByWords(text, maxLength) {
    const safeLength = Math.max(1, maxLength);
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    const chunks = [];
    let current = "";

    function pushHardSlices(word) {
      for (let index = 0; index < word.length; index += safeLength) {
        chunks.push(word.slice(index, index + safeLength));
      }
    }

    words.forEach((word) => {
      if (!current) {
        if (word.length <= safeLength) {
          current = word;
        } else {
          pushHardSlices(word);
        }
        return;
      }

      const next = `${current} ${word}`;
      if (next.length <= safeLength) {
        current = next;
        return;
      }

      chunks.push(current);

      if (word.length <= safeLength) {
        current = word;
      } else {
        current = "";
        pushHardSlices(word);
      }
    });

    if (current) {
      chunks.push(current);
    }

    return chunks.length ? chunks : [String(text || "").slice(0, safeLength)];
  }

  function expandUnitsForLimit(units, minCapacity) {
    const safeCapacity = Math.max(1, minCapacity);

    return units.flatMap((unit) => {
      if (unit.text.length <= safeCapacity) {
        return [unit];
      }

      return splitLongTextByWords(unit.text, safeCapacity).map((piece, index) => ({
        text: piece,
        separatorBefore: index === 0 ? unit.separatorBefore : " ",
      }));
    });
  }

  function buildPostFromUnits(units, start, end) {
    let text = "";

    for (let index = start; index <= end; index += 1) {
      text += `${index === start ? "" : units[index].separatorBefore}${units[index].text}`;
    }

    return text;
  }

  function createLengthHelpers(units) {
    const textPrefix = [0];
    const separatorPrefix = [0];

    units.forEach((unit) => {
      textPrefix.push(textPrefix[textPrefix.length - 1] + unit.text.length);
      separatorPrefix.push(
        separatorPrefix[separatorPrefix.length - 1] + unit.separatorBefore.length
      );
    });

    function getRangeLength(start, end) {
      const textLength = textPrefix[end + 1] - textPrefix[start];
      const separatorLength = separatorPrefix[end + 1] - separatorPrefix[start + 1];
      return textLength + separatorLength;
    }

    return { getRangeLength };
  }

  function chooseBetterPlan(currentBest, candidate) {
    if (!currentBest) {
      return candidate;
    }

    const epsilon = 1e-9;

    if (candidate.minFill > currentBest.minFill + epsilon) {
      return candidate;
    }

    if (candidate.minFill < currentBest.minFill - epsilon) {
      return currentBest;
    }

    if (candidate.maxWaste < currentBest.maxWaste - epsilon) {
      return candidate;
    }

    if (candidate.maxWaste > currentBest.maxWaste + epsilon) {
      return currentBest;
    }

    if (candidate.totalWaste < currentBest.totalWaste - epsilon) {
      return candidate;
    }

    if (candidate.totalWaste > currentBest.totalWaste + epsilon) {
      return currentBest;
    }

    if (candidate.posts[0].length > currentBest.posts[0].length) {
      return candidate;
    }

    return currentBest;
  }

  function segmentUnits(units, capacities) {
    if (!units.length) {
      return [];
    }

    const { getRangeLength } = createLengthHelpers(units);
    const memo = new Map();

    function solve(start, postIndex) {
      const key = `${start}:${postIndex}`;
      if (memo.has(key)) {
        return memo.get(key);
      }

      const remainingPosts = capacities.length - postIndex;
      const remainingUnits = units.length - start;

      if (remainingUnits < remainingPosts || remainingPosts <= 0) {
        memo.set(key, null);
        return null;
      }

      const capacity = capacities[postIndex];
      const lastEnd =
        postIndex === capacities.length - 1
          ? units.length - 1
          : units.length - remainingPosts;

      let best = null;

      for (let end = start; end <= lastEnd; end += 1) {
        const length = getRangeLength(start, end);

        if (length > capacity) {
          break;
        }

        const currentPost = buildPostFromUnits(units, start, end);
        const currentWaste = capacity - length;
        const currentFill = length / capacity;

        if (postIndex === capacities.length - 1) {
          if (end !== units.length - 1) {
            continue;
          }

          best = chooseBetterPlan(best, {
            posts: [currentPost],
            minFill: currentFill,
            maxWaste: currentWaste,
            totalWaste: currentWaste,
          });
          continue;
        }

        const remainder = solve(end + 1, postIndex + 1);
        if (!remainder) {
          continue;
        }

        best = chooseBetterPlan(best, {
          posts: [currentPost, ...remainder.posts],
          minFill: Math.min(currentFill, remainder.minFill),
          maxWaste: Math.max(currentWaste, remainder.maxWaste),
          totalWaste: currentWaste + remainder.totalWaste,
        });
      }

      memo.set(key, best);
      return best;
    }

    return solve(0, 0)?.posts || null;
  }

  function estimatePostCount(text, limit, hashtagsBlock, numbering, options = {}) {
    const continuationMarker = options.continuationMarker || "";
    let estimate = 1;

    for (let iteration = 0; iteration < 12; iteration += 1) {
      const plainPosts = splitPlainPosts(text, (index) => {
        const suffix = numbering ? ` (${index + 1}/${estimate})` : "";
        const continuationReserve = index < estimate - 1 ? continuationMarker.length : 0;
        const reserved =
          suffix.length +
          continuationReserve +
          (index === estimate - 1 ? hashtagsBlock.length : 0);
        return limit - reserved;
      });

      if (plainPosts.length === estimate) {
        return plainPosts.length;
      }

      estimate = plainPosts.length;
    }

    return estimate;
  }

  function buildGreedyPosts(text, options) {
    const limit = Number(options.limit);
    const numbering = Boolean(options.numbering);
    const hashtagsBlock = options.hashtagsBlock || "";
    const continuationMarker = options.continuationMarker || "";
    const normalizedText = normalizeText(text);
    let estimate = 1;

    for (let iteration = 0; iteration < 12; iteration += 1) {
      const plainPosts = splitPlainPosts(normalizedText, (index) => {
        const suffix = numbering ? ` (${index + 1}/${estimate})` : "";
        const continuationReserve = index < estimate - 1 ? continuationMarker.length : 0;
        const reserved =
          suffix.length +
          continuationReserve +
          (index === estimate - 1 ? hashtagsBlock.length : 0);
        return limit - reserved;
      });

      if (plainPosts.length === estimate) {
        return finalizePosts(plainPosts, {
          numbering,
          hashtagsBlock,
          continuationMarker,
        });
      }

      estimate = plainPosts.length;
    }

    return null;
  }

  function createCapacities(totalPosts, limit, options = {}) {
    const numbering = Boolean(options.numbering);
    const hashtagsBlock = options.hashtagsBlock || "";
    const continuationMarker = options.continuationMarker || "";

    return Array.from({ length: totalPosts }, (_, index) => {
      const numberingReserve = numbering ? ` (${index + 1}/${totalPosts})`.length : 0;
      const lastPostReserve = index === totalPosts - 1 ? hashtagsBlock.length : 0;
      const continuationReserve = index < totalPosts - 1 ? continuationMarker.length : 0;
      return limit - numberingReserve - lastPostReserve - continuationReserve;
    });
  }

  function finalizePosts(posts, options = {}) {
    const numbering = Boolean(options.numbering);
    const hashtagsBlock = options.hashtagsBlock || "";
    const continuationMarker = options.continuationMarker || "";

    return posts.map((post, index) => {
      let output = post;

      if (index < posts.length - 1 && continuationMarker) {
        output += continuationMarker;
      }

      if (index === posts.length - 1 && hashtagsBlock) {
        output += hashtagsBlock;
      }

      if (numbering) {
        output += ` (${index + 1}/${posts.length})`;
      }

      return output;
    });
  }

  function buildBalancedPosts(text, options) {
    const limit = Number(options.limit);
    const numbering = Boolean(options.numbering);
    const hashtagsBlock = options.hashtagsBlock || "";
    const normalizedText = normalizeText(text);
    const estimatedUpperBound = Math.max(
      1,
      estimatePostCount(normalizedText, limit, hashtagsBlock, numbering)
    );

    for (let totalPosts = 1; totalPosts <= estimatedUpperBound; totalPosts += 1) {
      const capacities = createCapacities(totalPosts, limit, {
        numbering,
        hashtagsBlock,
      });

      if (capacities.some((capacity) => !Number.isFinite(capacity) || capacity < 1)) {
        continue;
      }

      const units = expandUnitsForLimit(tokenizeText(normalizedText), Math.min(...capacities));
      const plan = segmentUnits(units, capacities);

      if (!plan) {
        continue;
      }

      return finalizePosts(plan, {
        numbering,
        hashtagsBlock,
      });
    }

    return null;
  }

  function buildCompactPosts(text, options) {
    const limit = Number(options.limit);
    const numbering = Boolean(options.numbering);
    const hashtagsBlock = options.hashtagsBlock || "";
    const continuationMarker = options.continuationMarker || "";
    const normalizedText = normalizeText(text);
    const estimatedUpperBound = Math.max(
      1,
      estimatePostCount(normalizedText, limit, hashtagsBlock, numbering, {
        continuationMarker,
      })
    );

    for (let totalPosts = 1; totalPosts <= estimatedUpperBound; totalPosts += 1) {
      const capacities = createCapacities(totalPosts, limit, {
        numbering,
        hashtagsBlock,
        continuationMarker,
      });

      if (capacities.some((capacity) => !Number.isFinite(capacity) || capacity < 1)) {
        continue;
      }

      const units = expandUnitsForLimit(tokenizeWords(normalizedText), Math.min(...capacities));
      const plan = segmentUnits(units, capacities);

      if (!plan) {
        continue;
      }

      return finalizePosts(plan, {
        numbering,
        hashtagsBlock,
        continuationMarker,
      });
    }

    return null;
  }

  function buildThread(text, options) {
    const limit = Number(options.limit);
    const numbering = Boolean(options.numbering);
    const splitMode = options.splitMode === "compact" ? "compact" : "paragraph";
    const hashtags = normalizeHashtags(options.hashtags || "");
    const hashtagsBlock = hashtags ? `\n\n${hashtags}` : "";
    const normalizedText = normalizeText(text || "");

    if (!normalizedText) {
      return {
        posts: [],
        hashtags,
        totalCharacters: 0,
        warning: "",
      };
    }

    if (!Number.isFinite(limit) || limit < 1) {
      throw new Error("Please choose a valid character limit.");
    }

    if (hashtagsBlock.length >= limit) {
      throw new Error("The hashtags alone use the full last-post limit.");
    }

    if (numbering && limit - hashtagsBlock.length - " (1/1)".length < 1) {
      throw new Error("The hashtags and numbering leave no room for the last post.");
    }

    const posts =
      (splitMode === "compact"
        ? buildCompactPosts(normalizedText, {
            limit,
            numbering,
            hashtagsBlock,
            continuationMarker: "...",
          })
        : buildBalancedPosts(normalizedText, {
            limit,
            numbering,
            hashtagsBlock,
          })) ||
      buildGreedyPosts(normalizedText, {
        limit,
        numbering,
        hashtagsBlock,
        continuationMarker: splitMode === "compact" ? "..." : "",
      });

    if (!posts) {
      throw new Error("Could not split this text cleanly. Try a slightly higher limit.");
    }

    return {
      posts,
      hashtags,
      totalCharacters: posts.reduce((sum, post) => sum + post.length, 0),
      warning: "",
      splitMode,
    };
  }

  async function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "absolute";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    document.body.removeChild(helper);
  }

  function initApp() {
    const form = document.getElementById("thread-form");
    const moreMenu = document.getElementById("more-menu");
    const platformLimit = document.getElementById("platform-limit");
    const customLimit = document.getElementById("custom-limit");
    const splitModeInput = document.getElementById("split-mode");
    const numberingInput = document.getElementById("include-numbering");
    const pasteButton = document.getElementById("paste-text");
    const pasteButtonLabel = pasteButton.querySelector(".panel-button-label");
    const themeToggle = document.getElementById("theme-toggle");
    const correctEnglishButton = document.getElementById("correct-english");
    const correctSpanishButton = document.getElementById("correct-spanish");
    const correctionStatus = document.getElementById("correction-status");
    const sourceCharCount = document.getElementById("source-char-count");
    const hashtagsInput = document.getElementById("hashtags");
    const sourceInput = document.getElementById("source-text");
    const resultsList = document.getElementById("results-list");
    const template = document.getElementById("post-template");
    const banner = document.getElementById("message-banner");

    function loadThemePreference() {
      try {
        const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        return storedTheme === "light" ? "light" : "dark";
      } catch (error) {
        return "dark";
      }
    }

    function applyTheme(theme) {
      const safeTheme = theme === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = safeTheme;

      if (themeToggle) {
        themeToggle.checked = safeTheme === "light";
      }

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
      } catch (error) {
        return;
      }
    }

    let sourceMarkupActive = false;

    function setCorrectionStatus(message) {
      correctionStatus.textContent = message;
    }

    function syncCorrectActionState() {
      correctEnglishButton.classList.toggle("active", selectedLanguage === "en");
      correctSpanishButton.classList.toggle("active", selectedLanguage === "es");
    }

    function getSourceText() {
      return String(sourceInput.textContent || "")
        .replace(/^\uFEFF/, "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n?/g, "\n");
    }

    function setSourceText(text) {
      sourceInput.textContent = String(text || "");
      sourceMarkupActive = false;
    }

    function setSourceHtml(html) {
      sourceInput.innerHTML = html || "";
      sourceMarkupActive = Boolean(sourceInput.querySelector(".change, .flag, .reverted"));
    }

    function getSelectionOffsets(element) {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) {
        return null;
      }

      const range = selection.getRangeAt(0);
      if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
        return null;
      }

      const startRange = range.cloneRange();
      startRange.selectNodeContents(element);
      startRange.setEnd(range.startContainer, range.startOffset);

      const endRange = range.cloneRange();
      endRange.selectNodeContents(element);
      endRange.setEnd(range.endContainer, range.endOffset);

      return {
        start: startRange.toString().length,
        end: endRange.toString().length,
      };
    }

    function setSelectionOffsets(element, start, end = start) {
      const selection = window.getSelection();
      if (!selection) {
        return;
      }

      const safeStart = Math.max(0, start);
      const safeEnd = Math.max(safeStart, end);
      const range = document.createRange();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();

      if (!node) {
        range.setStart(element, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }

      let current = 0;
      let lastNode = node;
      let startNode = null;
      let endNode = null;
      let startOffset = 0;
      let endOffset = 0;

      while (node) {
        lastNode = node;
        const length = node.textContent.length;

        if (!startNode && safeStart <= current + length) {
          startNode = node;
          startOffset = Math.min(length, safeStart - current);
        }

        if (!endNode && safeEnd <= current + length) {
          endNode = node;
          endOffset = Math.min(length, safeEnd - current);
          break;
        }

        current += length;
        node = walker.nextNode();
      }

      if (!startNode) {
        startNode = lastNode;
        startOffset = lastNode.textContent.length;
      }

      if (!endNode) {
        endNode = lastNode;
        endOffset = lastNode.textContent.length;
      }

      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function focusSourceInput() {
      sourceInput.focus();
      const cursor = getSourceText().length;
      setSelectionOffsets(sourceInput, cursor);
    }

    function flattenSourceMarkupPreservingSelection() {
      if (!sourceMarkupActive) {
        return;
      }

      const selection = getSelectionOffsets(sourceInput);
      const plainText = getSourceText();
      setSourceText(plainText);
      sourceInput.focus();

      if (selection) {
        setSelectionOffsets(
          sourceInput,
          Math.min(selection.start, plainText.length),
          Math.min(selection.end, plainText.length),
        );
      }
    }

    function syncLanguageStatus() {
      const hasText = Boolean(normalizeText(getSourceText()));
      setCorrectionStatus(hasText ? `Correct ${languageLabels[selectedLanguage]}` : "");
    }

    function updateSourceCharCount() {
      sourceCharCount.textContent = `${getSourceText().length} chars`;
    }

    function canUseClipboardRead() {
      return Boolean(
        window.isSecureContext &&
          navigator.clipboard &&
          typeof navigator.clipboard.readText === "function"
      );
    }

    function showManualPasteFallback() {
      focusSourceInput();
      pasteButton.classList.add("pasted");
      pasteButtonLabel.textContent = "Paste";
      pasteButton.setAttribute("aria-label", "Tap and hold to paste");
      pasteButton.setAttribute("title", "Tap and hold to paste");
      setBanner(
        "Direct paste is blocked here. On iPhone, tap and hold inside the text box, then choose Paste."
      );
      window.setTimeout(() => {
        pasteButton.classList.remove("pasted");
        if (!pasteButton.disabled) {
          pasteButtonLabel.textContent = "Paste";
          pasteButton.setAttribute("aria-label", "Paste");
          pasteButton.setAttribute("title", "Paste");
        }
      }, 1600);
    }

    function applyLanguageSelection(language, options = {}) {
      selectedLanguage = language === "es" ? "es" : "en";
      if (options.manual) {
        languageSetManually = true;
      }

      document.documentElement.lang = selectedLanguage;
      syncCorrectActionState();
      syncLanguageStatus();
    }

    function maybeApplySuggestedLanguage(text) {
      const suggested = detectSuggestedLanguage(text);

      if (!languageSetManually && suggested.language && suggested.confidence >= 0.18) {
        if (suggested.language !== selectedLanguage) {
          applyLanguageSelection(suggested.language);
        }
      }
    }

    function updateCorrectButtonState() {
      const disabled = !normalizeText(getSourceText());
      correctEnglishButton.disabled = disabled;
      correctSpanishButton.disabled = disabled;
      correctionStatus.disabled = disabled;
    }

    function getLimitValue() {
      return platformLimit.value === "custom"
        ? Number(customLimit.value)
        : Number(platformLimit.value);
    }

    function renderEmpty() {
      resultsList.classList.add("empty");
      resultsList.innerHTML = '<div class="empty-state"></div>';
    }

    function renderPosts(posts) {
      resultsList.classList.remove("empty");
      resultsList.innerHTML = "";

      posts.forEach((post, index) => {
        const fragment = template.content.cloneNode(true);
        const postLabel = fragment.querySelector(".post-label");
        const postBody = fragment.querySelector(".post-body");
        const copyButton = fragment.querySelector(".copy-button");
        const copyButtonLabel = fragment.querySelector(".panel-button-label");
        const postCharCount = fragment.querySelector(".post-char-count");

        postLabel.textContent = `Post ${index + 1} of ${posts.length}`;
        postCharCount.textContent = `${post.length} chars`;
        postBody.textContent = post;
        copyButton.dataset.value = post;

        copyButton.addEventListener("click", async () => {
          try {
            await copyText(post);
            copyButton.classList.add("copied");
            copyButtonLabel.textContent = "Copied";
            copyButton.setAttribute("aria-label", "Copied");
            copyButton.setAttribute("title", "Copied");
            window.setTimeout(() => {
              copyButton.classList.remove("copied");
              copyButtonLabel.textContent = "Copy";
              copyButton.setAttribute("aria-label", "Copy post");
              copyButton.setAttribute("title", "Copy post");
            }, 1400);
          } catch (error) {
            banner.hidden = false;
            banner.textContent = "Copy failed in this browser. Try selecting the text manually.";
          }
        });

        resultsList.appendChild(fragment);
      });
    }

    function setBanner(message) {
      if (!message) {
        banner.hidden = true;
        banner.textContent = "";
        return;
      }

      banner.hidden = false;
      banner.textContent = message;
    }

    function normalizePastedText(text) {
      return String(text ?? "")
        .replace(/^\uFEFF/, "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n?/g, "\n");
    }

    function insertTextAtCursor(text) {
      const safeText = normalizePastedText(text);
      sourceInput.focus();
      const selection = window.getSelection();

      if (
        !selection ||
        !selection.rangeCount ||
        !sourceInput.contains(selection.anchorNode)
      ) {
        const nextValue = `${getSourceText()}${safeText}`;
        setSourceText(nextValue);
        focusSourceInput();
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

    function trimLeadingDraftPadding() {
      const currentValue = getSourceText();
      const nextValue = currentValue
        .replace(/^\uFEFF/, "")
        .replace(/^[\s\u00A0]+/, "");

      if (nextValue === currentValue) {
        return;
      }

      const trimmedCharacters = currentValue.length - nextValue.length;
      const selection = getSelectionOffsets(sourceInput);
      setSourceText(nextValue);
      sourceInput.focus();

      if (selection) {
        setSelectionOffsets(
          sourceInput,
          Math.max(0, selection.start - trimmedCharacters),
          Math.max(0, selection.end - trimmedCharacters),
        );
      }
    }

    function toggleAllMatches(original, toState) {
      const normalized = normalizeWord(original);
      const nodes = sourceInput.querySelectorAll("[data-original]");

      nodes.forEach((node) => {
        const nodeOriginal = decodeURIComponent(node.dataset.original || "");
        if (normalizeWord(nodeOriginal) !== normalized) {
          return;
        }

        const nodeCorrected = decodeURIComponent(node.dataset.corrected || "");
        if (toState === "reverted") {
          node.textContent = nodeOriginal;
          node.classList.remove("change");
          node.classList.add("reverted");
          return;
        }

        node.textContent = nodeCorrected || node.textContent;
        node.classList.remove("reverted");
        node.classList.add("change");
      });

      sourceMarkupActive = Boolean(sourceInput.querySelector(".change, .flag, .reverted"));
    }

    function render() {
      if (platformLimit.value === "custom") {
        customLimit.hidden = false;
      } else {
        customLimit.hidden = true;
      }

      const rawText = getSourceText();
      const limit = getLimitValue();
      updateCorrectButtonState();
      updateSourceCharCount();

      if (!normalizeText(rawText)) {
        syncLanguageStatus();
        setBanner("");
        renderEmpty();
        return;
      }

      syncLanguageStatus();

      try {
        const result = buildThread(rawText, {
          limit,
          numbering: numberingInput.checked,
          hashtags: hashtagsInput.value,
          splitMode: splitModeInput.value,
        });

        renderPosts(result.posts);
        setBanner(result.warning);
      } catch (error) {
        renderEmpty();
        setBanner(error.message);
      }
    }

    function closeMenuOnOutsidePress(event) {
      if (moreMenu.open && !moreMenu.contains(event.target)) {
        moreMenu.open = false;
      }
    }

    async function handleCorrection(language) {
      const rawText = getSourceText();
      if (!normalizeText(rawText)) {
        return;
      }

      applyLanguageSelection(language, { manual: true });
      moreMenu.open = false;
      correctionStatus.disabled = true;
      correctEnglishButton.disabled = true;
      correctSpanishButton.disabled = true;
      const button = language === "es" ? correctSpanishButton : correctEnglishButton;
      const originalLabel = button.textContent;
      button.textContent = language === "es" ? "Correcting Spanish..." : "Correcting English...";
      setCorrectionStatus("Correcting text...");

      try {
        const result = await correctTextContent(rawText, language);
        if (result.changes || result.ignoredRanges.length) {
          setSourceHtml(buildOutputHtml(result.original, result.edits, result.ignoredRanges));
        } else {
          setSourceText(result.corrected);
        }
        render();

        if (!result.changes && !result.ignoredRanges.length) {
          setCorrectionStatus(`No changes needed (${languageLabels[language]})`);
        } else if (result.method === "languagetool") {
          const parts = [];
          if (result.changes) {
            parts.push(`Corrected ${result.changes} issue${result.changes === 1 ? "" : "s"}`);
          }
          if (result.ignoredRanges.length) {
            parts.push(`flagged ${result.ignoredRanges.length} suspicious term${result.ignoredRanges.length === 1 ? "" : "s"}`);
          }
          setCorrectionStatus(`${parts.join(", ")} via LanguageTool`);
        } else {
          setCorrectionStatus(`Applied ${result.changes} fallback fix${result.changes === 1 ? "" : "es"}`);
        }
      } catch (error) {
        setCorrectionStatus("Correction failed");
      } finally {
        button.textContent = originalLabel;
        updateCorrectButtonState();
      }
    }

    function handleSourcePaste(event) {
      const plainText = event.clipboardData?.getData("text/plain") || "";
      const htmlText = event.clipboardData?.getData("text/html") || "";

      if (!plainText && !htmlText) {
        return;
      }

      event.preventDefault();
      flattenSourceMarkupPreservingSelection();

      const normalizedPlain = normalizePlainPaste(plainText);
      const htmlParagraphText = htmlToRenderedParagraphText(htmlText);
      let preferred = normalizedPlain || normalizePastedText(plainText);

      if (htmlParagraphText) {
        const plainBlocks = preferred ? preferred.split(/\n\n/).length : 0;
        const htmlBlocks = htmlParagraphText.split(/\n\n/).length;
        if (!preferred || htmlBlocks > plainBlocks) {
          preferred = htmlParagraphText;
        }
      }

      insertTextAtCursor(preferred || normalizePastedText(plainText));
      trimLeadingDraftPadding();
      sourceInput.dispatchEvent(new Event("input", { bubbles: true }));
      setBanner("");
    }

    async function handlePasteFromClipboard() {
      pasteButton.disabled = true;
      pasteButtonLabel.textContent = "Paste";
      pasteButton.setAttribute("aria-label", "Pasting...");
      pasteButton.setAttribute("title", "Pasting...");

      try {
        if (!canUseClipboardRead()) {
          showManualPasteFallback();
          return;
        }

        const pastedText = await navigator.clipboard.readText();
        if (!pastedText) {
          setBanner("Clipboard is empty.");
          return;
        }

        flattenSourceMarkupPreservingSelection();
        insertTextAtCursor(normalizePlainPaste(pastedText) || normalizePastedText(pastedText));
        trimLeadingDraftPadding();
        sourceInput.dispatchEvent(new Event("input", { bubbles: true }));
        setBanner("");
        pasteButton.classList.add("pasted");
        pasteButtonLabel.textContent = "Paste";
        pasteButton.setAttribute("aria-label", "Pasted");
        pasteButton.setAttribute("title", "Pasted");
        window.setTimeout(() => {
          pasteButton.classList.remove("pasted");
          pasteButtonLabel.textContent = "Paste";
          pasteButton.setAttribute("aria-label", "Paste");
          pasteButton.setAttribute("title", "Paste");
        }, 1400);
      } catch (error) {
        showManualPasteFallback();
      } finally {
        window.setTimeout(() => {
          pasteButton.disabled = false;
          if (
            pasteButton.getAttribute("aria-label") !== "Pasted" &&
            pasteButton.getAttribute("aria-label") !== "Tap and hold to paste"
          ) {
            pasteButtonLabel.textContent = "Paste";
            pasteButton.setAttribute("aria-label", "Paste");
            pasteButton.setAttribute("title", "Paste");
          }
        }, 0);
      }
    }

    function handleSourceInput(event) {
      if (sourceMarkupActive) {
        flattenSourceMarkupPreservingSelection();
      }

      const currentText = getSourceText();
      if (!currentText) {
        setSourceText("");
      }

      maybeApplySuggestedLanguage(currentText);
      if (banner.textContent.includes("tap and hold")) {
        setBanner("");
      }
      render();
    }

    function handleSourceClick(event) {
      const target = event.target.closest(".change, .reverted");
      if (!target || !sourceInput.contains(target)) {
        return;
      }

      event.preventDefault();
      const original = decodeURIComponent(target.dataset.original || "");
      if (!original) {
        return;
      }

      if (target.classList.contains("change")) {
        toggleAllMatches(original, "reverted");
        addIgnoredCorrection(original, selectedLanguage);
      } else {
        toggleAllMatches(original, "change");
        removeIgnoredCorrection(original, selectedLanguage);
      }

      render();
    }

    form.addEventListener("input", render);
    sourceInput.addEventListener("input", handleSourceInput);
    sourceInput.addEventListener("click", handleSourceClick);
    sourceInput.addEventListener("paste", handleSourcePaste);
    correctionStatus.addEventListener("click", () => handleCorrection(selectedLanguage));
    hashtagsInput.addEventListener("input", render);
    platformLimit.addEventListener("change", render);
    customLimit.addEventListener("input", render);
    splitModeInput.addEventListener("change", render);
    pasteButton.addEventListener("click", handlePasteFromClipboard);
    correctEnglishButton.addEventListener("click", () => handleCorrection("en"));
    correctSpanishButton.addEventListener("click", () => handleCorrection("es"));
    themeToggle.addEventListener("change", () => {
      applyTheme(themeToggle.checked ? "light" : "dark");
    });
    document.addEventListener("click", closeMenuOnOutsidePress);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && moreMenu.open) {
        moreMenu.open = false;
      }
    });

    applyTheme(loadThemePreference());
    applyLanguageSelection("en");
    render();
  }

  if (typeof window !== "undefined") {
    window.ThreadMaker = {
      buildThread,
      correctTextContent,
      detectSuggestedLanguage,
      normalizeHashtags,
    };

    if (typeof document !== "undefined") {
      document.addEventListener("DOMContentLoaded", initApp);
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      applySimpleCorrections,
      buildThread,
      correctTextContent,
      detectSuggestedLanguage,
      normalizeHashtags,
      takeChunk,
    };
  }
})();
