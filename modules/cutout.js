import { canvasToBlob } from "./shared.js";

import {
  removeBackground,
  preload
} from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.8/+esm";

const MODEL_READY_KEY = "bgoneModelReady";

export function createCutoutTool(opts) {
  const {
    canvas,
    canvasWrap,
    overlayMsg,
    brushPreview,
    modelNoteEl,
    btnReloadModel,
    modelDot,
    btnRemove,
    btnRemoveChroma,
    btnUndo,
    btnRedo,
    brushValueEl,
    brushSizeEl,
    aiStrengthEl,
    aiStrengthValueEl,
    modeEraseBtn,
    modeRestoreBtn,
    viewModeBrushBtn,
    viewModeMoveBtn,
    onStatus
  } = opts;

  const ctx = canvas.getContext("2d");

  const originalCanvas = document.createElement("canvas");
  const originalCtx = originalCanvas.getContext("2d");
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");

  let originalImageElement = null;
  let originalImageWidth = 0;
  let originalImageHeight = 0;
  let chromaPreviewCanvas = null;
  let chromaFullCanvas = null;
  let aiMaskAlpha = null;
  let aiStrength = Number(aiStrengthEl?.value || 60);
  let referenceCanvas = null;
  let referenceVisible = false;

  let hasImage = false;
  let working = false;
  let brushMode = "erase";
  let viewMode = "brush";
  let painting = false;
  let lastPointer = null;
  let moving = false;
  let moveStartClientX = 0;
  let moveStartClientY = 0;
  let moveStartScrollLeft = 0;
  let moveStartScrollTop = 0;
  let zoomPercent = 100;
  const ZOOM_MIN = 25;
  const ZOOM_MAX = 400;

  const history = { stack: [], redos: [], limit: 30 };
  const removeLabelDefault = "Cutout";
  const modelNoteDefault = "U²-Net model downloads once and then works offline in this browser.";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateAiStrengthLabel() {
    if (aiStrengthValueEl) aiStrengthValueEl.textContent = String(Math.round(aiStrength));
  }

  function setProcessingUI(flag) {
    if (btnRemove) {
      btnRemove.classList.toggle("is-loading", flag);
      btnRemove.innerHTML = flag
        ? '<span class="spinner" aria-hidden="true"></span><span>Removing...</span>'
        : removeLabelDefault;
    }
    if (modelNoteEl) {
      if (flag) {
        modelNoteEl.classList.add("is-loading");
        modelNoteEl.textContent = "AI model processing image...";
      } else {
        modelNoteEl.classList.remove("is-loading");
        checkModelReady();
      }
    }
  }

  function setModelDot(ready) {
    if (!modelDot) return;
    modelDot.classList.toggle("ok", ready);
    modelDot.setAttribute("aria-label", ready ? "Model cached and ready" : "Model not cached yet");
  }

  function markModelReady() {
    localStorage.setItem(MODEL_READY_KEY, "1");
    if (modelNoteEl) modelNoteEl.textContent = "Model cached in this browser. Background removal can work offline.";
    setModelDot(true);
  }

  function checkModelReady() {
    const ready = localStorage.getItem(MODEL_READY_KEY) === "1";
    if (ready && modelNoteEl) modelNoteEl.textContent = "Model cached in this browser. Background removal can work offline.";
    if (!ready && modelNoteEl) modelNoteEl.textContent = modelNoteDefault;
    setModelDot(ready);
  }

  function setWorking(flag) {
    working = flag;
    btnRemove.disabled = flag || !hasImage;
    if (btnRemoveChroma) btnRemoveChroma.disabled = flag || !hasImage;
    brushSizeEl.disabled = flag || !hasImage;
    modeEraseBtn.disabled = flag || !hasImage;
    modeRestoreBtn.disabled = flag || !hasImage;
    setUndoRedoState();
  }

  function setUndoRedoState() {
    btnUndo.disabled = working || history.stack.length <= 1;
    btnRedo.disabled = working || history.redos.length === 0;
  }

  function pushHistory() {
    if (!hasImage) return;
    try {
      const snap = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      history.stack.push(snap);
      if (history.stack.length > history.limit) history.stack.shift();
      history.redos.length = 0;
      setUndoRedoState();
    } catch (e) {
      console.error(e);
    }
  }

  function undo() {
    if (history.stack.length <= 1) return;
    const current = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const prev = history.stack[history.stack.length - 2];
    history.redos.push(current);
    history.stack.pop();
    maskCtx.putImageData(prev, 0, 0);
    render();
    setUndoRedoState();
    onStatus?.("Undid last stroke.");
  }

  function redo() {
    if (history.redos.length === 0) return;
    const redoImg = history.redos.pop();
    history.stack.push(redoImg);
    maskCtx.putImageData(redoImg, 0, 0);
    render();
    setUndoRedoState();
    onStatus?.("Redid stroke.");
  }

  btnUndo.addEventListener("click", undo);
  btnRedo.addEventListener("click", redo);

  function fitImageDimensions(imgWidth, imgHeight, maxWidth = 1400, maxHeight = 900) {
    let w = imgWidth;
    let h = imgHeight;
    const ratio = Math.min(maxWidth / w, maxHeight / h, 1);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
    return { w, h };
  }

  function render() {
    if (!hasImage) return;
    const w = canvas.width;
    const h = canvas.height;
    const sourceCanvas = chromaPreviewCanvas || originalCanvas;

    ctx.clearRect(0, 0, w, h);
    if (referenceVisible && referenceCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(referenceCanvas, 0, 0, w, h);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(sourceCanvas, 0, 0, w, h);

    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0, w, h);

    ctx.globalCompositeOperation = "source-over";
  }

  function initMaskFromImage() {
    const w = canvas.width;
    const h = canvas.height;
    maskCanvas.width = w;
    maskCanvas.height = h;
    maskCtx.clearRect(0, 0, w, h);
    maskCtx.fillStyle = "#fff";
    maskCtx.fillRect(0, 0, w, h);
    aiMaskAlpha = null;
    history.stack.length = 0;
    history.redos.length = 0;
    pushHistory();
  }

  function rebuildMaskFromAiAlpha(resetHistory = false) {
    if (!aiMaskAlpha || aiMaskAlpha.length !== canvas.width * canvas.height) return false;
    const w = canvas.width;
    const h = canvas.height;
    const maskData = maskCtx.createImageData(w, h);
    const dst = maskData.data;

    const strongBias = clamp((aiStrength - 50) / 50, 0, 1);
    const weakBias = clamp((50 - aiStrength) / 50, 0, 1);
    const lowCut = clamp(0.04 + strongBias * 0.2 - weakBias * 0.02, 0.01, 0.32);
    const highCut = clamp(0.82 - strongBias * 0.16 + weakBias * 0.08, 0.62, 0.98);
    const curve = Math.max(0.55, 1 + strongBias * 1.4 - weakBias * 0.35);

    for (let p = 0, i = 0; p < aiMaskAlpha.length; p += 1, i += 4) {
      const n = aiMaskAlpha[p] / 255;
      let alpha = 0;
      if (n <= lowCut) {
        alpha = 0;
      } else if (n >= highCut) {
        alpha = 255;
      } else {
        const t = (n - lowCut) / Math.max(0.000001, (highCut - lowCut));
        alpha = Math.round(Math.pow(t, curve) * 255);
      }

      if (strongBias > 0 && alpha < (18 + strongBias * 24)) alpha = 0;
      if (alpha > 246) alpha = 255;

      dst[i] = 255;
      dst[i + 1] = 255;
      dst[i + 2] = 255;
      dst[i + 3] = alpha;
    }

    maskCtx.putImageData(maskData, 0, 0);
    if (resetHistory) {
      history.stack.length = 0;
      history.redos.length = 0;
      pushHistory();
    } else {
      setUndoRedoState();
    }
    return true;
  }

  function initMaskFromResultBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        const w = canvas.width;
        const h = canvas.height;

        const temp = document.createElement("canvas");
        temp.width = w;
        temp.height = h;
        const tctx = temp.getContext("2d");
        tctx.drawImage(image, 0, 0, w, h);

        const imgData = tctx.getImageData(0, 0, w, h);
        const src = imgData.data;
        aiMaskAlpha = new Uint8ClampedArray(w * h);
        for (let p = 0, i = 0; i < src.length; p += 1, i += 4) {
          aiMaskAlpha[p] = src[i + 3];
        }
        rebuildMaskFromAiAlpha(true);
        resolve();
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Error rendering result."));
      };
      image.src = url;
    });
  }

  function initMaskFromChromaKey() {
    const w = canvas.width;
    const h = canvas.height;
    const src = originalCtx.getImageData(0, 0, w, h).data;
    const maskData = maskCtx.createImageData(w, h);
    const dst = maskData.data;

    function clamp01(value) {
      return Math.max(0, Math.min(1, value));
    }

    function chromaStrength(r, g, b) {
      const rn = r / 255;
      const gn = g / 255;
      const bn = b / 255;
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      const delta = max - min;
      const sat = max <= 0 ? 0 : delta / max;
      const greenBias = clamp01((g - Math.max(r, b) - 6) / 96);

      let hue = 0;
      if (delta > 0.000001) {
        if (max === rn) {
          hue = ((gn - bn) / delta) % 6;
        } else if (max === gn) {
          hue = (bn - rn) / delta + 2;
        } else {
          hue = (rn - gn) / delta + 4;
        }
        hue *= 60;
        if (hue < 0) hue += 360;
      }
      const hueDist = Math.abs(hue - 120);
      const circularDist = Math.min(hueDist, 360 - hueDist);
      const hueFactor = clamp01(1 - circularDist / 70);
      const satFactor = clamp01((sat - 0.08) / 0.55);
      const brightFactor = clamp01((max - 0.08) / 0.9);
      const soft = greenBias * (0.35 + satFactor * 0.4 + hueFactor * 0.25) * brightFactor;
      const hard = greenBias * hueFactor;
      return clamp01(Math.max(soft, hard));
    }

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const keyStrength = chromaStrength(r, g, b);
      let alpha = Math.round(255 * (1 - Math.pow(keyStrength, 0.72)));
      if (keyStrength >= 0.5) alpha = Math.min(alpha, 28);
      if (keyStrength >= 0.65) alpha = 0;

      dst[i] = 255;
      dst[i + 1] = 255;
      dst[i + 2] = 255;
      dst[i + 3] = alpha;
    }

    aiMaskAlpha = null;
    maskCtx.putImageData(maskData, 0, 0);
    history.stack.length = 0;
    history.redos.length = 0;
    pushHistory();
  }

  function buildChromaDespill(sourceCanvas) {
    const strengthFactor = 2.1;
    const out = document.createElement("canvas");
    out.width = sourceCanvas.width;
    out.height = sourceCanvas.height;
    const outCtx = out.getContext("2d");
    outCtx.drawImage(sourceCanvas, 0, 0);
    const imageData = outCtx.getImageData(0, 0, out.width, out.height);
    const data = imageData.data;

    function clamp01(value) {
      return Math.max(0, Math.min(1, value));
    }

    function chromaStrength(r, g, b) {
      const rn = r / 255;
      const gn = g / 255;
      const bn = b / 255;
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      const delta = max - min;
      const sat = max <= 0 ? 0 : delta / max;
      const greenBias = clamp01((g - Math.max(r, b) - 6) / 96);

      let hue = 0;
      if (delta > 0.000001) {
        if (max === rn) {
          hue = ((gn - bn) / delta) % 6;
        } else if (max === gn) {
          hue = (bn - rn) / delta + 2;
        } else {
          hue = (rn - gn) / delta + 4;
        }
        hue *= 60;
        if (hue < 0) hue += 360;
      }
      const hueDist = Math.abs(hue - 120);
      const circularDist = Math.min(hueDist, 360 - hueDist);
      const hueFactor = clamp01(1 - circularDist / 70);
      const satFactor = clamp01((sat - 0.08) / 0.55);
      const brightFactor = clamp01((max - 0.08) / 0.9);
      const soft = greenBias * (0.35 + satFactor * 0.4 + hueFactor * 0.25) * brightFactor;
      const hard = greenBias * hueFactor;
      return clamp01(Math.max(soft, hard));
    }

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const maxRB = Math.max(r, b);
      const keyStrength = chromaStrength(r, g, b);

      if (keyStrength <= 0.01) continue;

      const despill = Math.max(0, Math.min(1, keyStrength * strengthFactor));
      const targetGreen = maxRB + 2;
      const nextG = g - (g - targetGreen) * despill;
      const lift = (g - nextG) * 0.18;

      data[i] = Math.max(0, Math.min(255, r + lift));
      data[i + 1] = Math.max(0, Math.min(255, nextG));
      data[i + 2] = Math.max(0, Math.min(255, b + lift));
    }

    outCtx.putImageData(imageData, 0, 0);
    return out;
  }

  function updateBrushPreviewStyle() {
    if (!brushPreview) return;
    brushPreview.classList.toggle("restore", brushMode === "restore");
  }

  function updateViewModeUI() {
    const brushActive = viewMode === "brush";
    if (viewModeBrushBtn) {
      viewModeBrushBtn.classList.toggle("active", brushActive);
      viewModeBrushBtn.setAttribute("aria-selected", brushActive ? "true" : "false");
    }
    if (viewModeMoveBtn) {
      viewModeMoveBtn.classList.toggle("active", !brushActive);
      viewModeMoveBtn.setAttribute("aria-selected", brushActive ? "false" : "true");
    }
    canvas.style.cursor = brushActive ? "crosshair" : (moving ? "grabbing" : "grab");
    if (!brushActive) hideBrushPreview();
  }

  function applyZoom(nextPercent, anchorClientX = null, anchorClientY = null) {
    const previous = zoomPercent;
    zoomPercent = clamp(nextPercent, ZOOM_MIN, ZOOM_MAX);
    if (zoomPercent <= 100) {
      canvas.style.width = "auto";
      canvas.style.height = "auto";
      canvas.style.maxWidth = "100%";
      canvas.style.maxHeight = "100%";
      canvasWrap.scrollLeft = 0;
      canvasWrap.scrollTop = 0;
      return;
    }

    const wrapRect = canvasWrap.getBoundingClientRect();
    const localX = anchorClientX == null ? wrapRect.width / 2 : (anchorClientX - wrapRect.left);
    const localY = anchorClientY == null ? wrapRect.height / 2 : (anchorClientY - wrapRect.top);
    const anchorX = canvasWrap.scrollLeft + localX;
    const anchorY = canvasWrap.scrollTop + localY;

    canvas.style.width = `${zoomPercent}%`;
    canvas.style.height = "auto";
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";

    const ratio = zoomPercent / Math.max(1, previous);
    canvasWrap.scrollLeft = anchorX * ratio - localX;
    canvasWrap.scrollTop = anchorY * ratio - localY;
  }

  function setViewMode(mode) {
    viewMode = mode === "move" ? "move" : "brush";
    moving = false;
    updateViewModeUI();
  }

  function getCanvasPointer(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((evt.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  function showBrushPreview() {
    if (!hasImage || working || !brushPreview) return;
    brushPreview.style.display = "block";
    updateBrushPreviewStyle();
  }

  function hideBrushPreview() {
    if (!brushPreview) return;
    brushPreview.style.display = "none";
  }

  function updateBrushPreview(evt) {
    if (!hasImage || !brushPreview || working) return;
    const canvasRect = canvas.getBoundingClientRect();
    const wrapRect = canvasWrap.getBoundingClientRect();
    const radius = parseInt(brushSizeEl.value, 10) || 1;
    const scaleX = canvasRect.width / canvas.width || 1;
    const size = radius * 2 * scaleX;
    const x = evt.clientX - wrapRect.left;
    const y = evt.clientY - wrapRect.top;
    brushPreview.style.width = `${size}px`;
    brushPreview.style.height = `${size}px`;
    brushPreview.style.left = `${x}px`;
    brushPreview.style.top = `${y}px`;
    brushPreview.style.display = "block";
  }

  function drawStamp(x, y, radius) {
    maskCtx.save();
    maskCtx.lineCap = "round";
    maskCtx.lineJoin = "round";
    maskCtx.fillStyle = "#fff";
    maskCtx.strokeStyle = "#fff";

    maskCtx.globalCompositeOperation = brushMode === "erase" ? "destination-out" : "source-over";
    maskCtx.beginPath();
    maskCtx.arc(x, y, radius, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.restore();
  }

  function drawStroke(from, to, radius) {
    maskCtx.save();
    maskCtx.lineCap = "round";
    maskCtx.lineJoin = "round";
    maskCtx.lineWidth = radius * 2;
    maskCtx.strokeStyle = "#fff";
    maskCtx.globalCompositeOperation = brushMode === "erase" ? "destination-out" : "source-over";
    maskCtx.beginPath();
    maskCtx.moveTo(from.x, from.y);
    maskCtx.lineTo(to.x, to.y);
    maskCtx.stroke();
    maskCtx.restore();
  }

  function startPaint(evt) {
    if (viewMode === "move") {
      moving = true;
      moveStartClientX = evt.clientX;
      moveStartClientY = evt.clientY;
      moveStartScrollLeft = canvasWrap.scrollLeft;
      moveStartScrollTop = canvasWrap.scrollTop;
      canvas.setPointerCapture(evt.pointerId);
      updateViewModeUI();
      evt.preventDefault();
      return;
    }
    if (!hasImage || working) return;
    painting = true;
    canvas.setPointerCapture(evt.pointerId);
    const p = getCanvasPointer(evt);
    lastPointer = { x: p.x, y: p.y };
    const radius = parseInt(brushSizeEl.value, 10);
    drawStamp(p.x, p.y, radius);
    render();
    updateBrushPreview(evt);
    evt.preventDefault();
  }

  function movePaint(evt) {
    if (viewMode === "move") {
      if (!moving) return;
      const dx = evt.clientX - moveStartClientX;
      const dy = evt.clientY - moveStartClientY;
      canvasWrap.scrollLeft = moveStartScrollLeft - dx;
      canvasWrap.scrollTop = moveStartScrollTop - dy;
      evt.preventDefault();
      return;
    }
    if (!hasImage) return;
    updateBrushPreview(evt);
    if (!painting) return;
    const p = getCanvasPointer(evt);
    const radius = parseInt(brushSizeEl.value, 10);
    drawStroke(lastPointer, { x: p.x, y: p.y }, radius);
    lastPointer = { x: p.x, y: p.y };
    render();
    evt.preventDefault();
  }

  function endPaint(evt) {
    if (viewMode === "move") {
      if (!moving) return;
      moving = false;
      updateViewModeUI();
      evt && evt.preventDefault();
      return;
    }
    if (!painting) return;
    painting = false;
    lastPointer = null;
    pushHistory();
    evt && evt.preventDefault();
  }

  function setBrushMode(mode) {
    brushMode = mode;
    const eraseActive = mode === "erase";
    modeEraseBtn.classList.toggle("active", eraseActive);
    modeRestoreBtn.classList.toggle("active", !eraseActive);
    modeEraseBtn.setAttribute("aria-selected", eraseActive ? "true" : "false");
    modeRestoreBtn.setAttribute("aria-selected", eraseActive ? "false" : "true");
    updateBrushPreviewStyle();
  }

  modeEraseBtn.addEventListener("click", () => setBrushMode("erase"));
  modeRestoreBtn.addEventListener("click", () => setBrushMode("restore"));
  viewModeBrushBtn?.addEventListener("click", () => setViewMode("brush"));
  viewModeMoveBtn?.addEventListener("click", () => setViewMode("move"));

  brushSizeEl.addEventListener("input", () => {
    brushValueEl.textContent = brushSizeEl.value;
  });

  if (aiStrengthEl) {
    aiStrengthEl.addEventListener("input", () => {
      aiStrength = Number(aiStrengthEl.value || 60);
      updateAiStrengthLabel();
      if (!working && rebuildMaskFromAiAlpha(false)) {
        render();
      }
    });
    aiStrengthEl.addEventListener("change", () => {
      aiStrength = Number(aiStrengthEl.value || 60);
      updateAiStrengthLabel();
      if (!working && rebuildMaskFromAiAlpha(true)) {
        render();
        onStatus?.("AI strength applied.");
      }
    });
  }

  canvas.addEventListener("pointerdown", startPaint, { passive: false });
  canvas.addEventListener("pointermove", movePaint, { passive: false });
  canvas.addEventListener("pointerup", endPaint, { passive: false });
  canvas.addEventListener("pointercancel", endPaint, { passive: false });
  canvas.addEventListener("pointerleave", e => {
    endPaint(e);
    hideBrushPreview();
  });
  canvas.addEventListener("pointerenter", e => {
    if (!hasImage) return;
    if (viewMode !== "brush") return;
    showBrushPreview();
    updateBrushPreview(e);
  });
  canvasWrap.addEventListener("wheel", (event) => {
    if (viewMode !== "move") return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    applyZoom(zoomPercent * factor, event.clientX, event.clientY);
  }, { passive: false });

  btnReloadModel.addEventListener("click", async () => {
    if (!modelNoteEl) return;
    modelNoteEl.textContent = "Downloading or refreshing AI model…";
    btnReloadModel.disabled = true;
    setModelDot(false);
    try {
      await preload({ debug: true });
      markModelReady();
      onStatus?.("AI model ready.");
    } catch (err) {
      console.error(err);
      modelNoteEl.textContent = "Error downloading model. Check connection.";
      onStatus?.("Error downloading model.");
    } finally {
      btnReloadModel.disabled = false;
    }
  });

  async function setImage(imageEl, fileName = "") {
    originalImageElement = imageEl;
    originalImageWidth = imageEl?.width || 0;
    originalImageHeight = imageEl?.height || 0;

    if (!originalImageWidth || !originalImageHeight) return;

    const { w, h } = fitImageDimensions(originalImageWidth, originalImageHeight);
    canvas.width = w;
    canvas.height = h;
    originalCanvas.width = w;
    originalCanvas.height = h;

    originalCtx.clearRect(0, 0, w, h);
    originalCtx.drawImage(imageEl, 0, 0, w, h);
    chromaPreviewCanvas = null;
    chromaFullCanvas = null;

    hasImage = true;
    overlayMsg.style.display = "none";
    applyZoom(100);
    setWorking(false);
    initMaskFromImage();
    render();
    setUndoRedoState();
    onStatus?.(`Image loaded${fileName ? `: ${fileName}` : ""}.`);
  }

  function setReferenceBackground(imageEl) {
    if (!imageEl) {
      referenceCanvas = null;
      render();
      return;
    }
    const ref = document.createElement("canvas");
    ref.width = canvas.width;
    ref.height = canvas.height;
    const rctx = ref.getContext("2d");
    rctx.clearRect(0, 0, ref.width, ref.height);
    rctx.drawImage(imageEl, 0, 0, ref.width, ref.height);
    referenceCanvas = ref;
    render();
  }

  function setReferenceVisible(flag) {
    referenceVisible = !!flag;
    render();
  }

  function resetMask() {
    if (!hasImage) return;
    initMaskFromImage();
    render();
    onStatus?.("Cutout reset.");
  }

  async function removeBg() {
    if (!hasImage || working) return;
    setWorking(true);
    setProcessingUI(true);
    onStatus?.("Removing background…");
    try {
      chromaPreviewCanvas = null;
      chromaFullCanvas = null;
      const blob = await canvasToBlob(originalCanvas, "image/png");
      const outBlob = await removeBackground(blob, { debug: true });
      await initMaskFromResultBlob(outBlob);
      render();
      markModelReady();
      onStatus?.("Background removed. Adjust AI strength or refine with brush.");
    } catch (err) {
      console.error(err);
      onStatus?.("Error removing background.");
    } finally {
      setProcessingUI(false);
      setWorking(false);
      setUndoRedoState();
    }
  }

  btnRemove.addEventListener("click", removeBg);

  async function removeChroma() {
    if (!hasImage || working) return;
    setWorking(true);
    onStatus?.("Removing chroma key…");
    try {
      initMaskFromChromaKey();
      chromaPreviewCanvas = buildChromaDespill(originalCanvas);
      const fullSource = document.createElement("canvas");
      fullSource.width = originalImageWidth;
      fullSource.height = originalImageHeight;
      const fullCtx = fullSource.getContext("2d");
      fullCtx.drawImage(originalImageElement, 0, 0, originalImageWidth, originalImageHeight);
      chromaFullCanvas = buildChromaDespill(fullSource);
      render();
      onStatus?.("Chroma key removed. Refine with brush, then apply to editor.");
    } catch (err) {
      console.error(err);
      onStatus?.("Error removing chroma key.");
    } finally {
      setWorking(false);
      setUndoRedoState();
    }
  }

  btnRemoveChroma?.addEventListener("click", removeChroma);

  async function exportCutoutBlob() {
    if (!hasImage || !originalImageElement) throw new Error("No image loaded.");
    const ew = originalImageWidth;
    const eh = originalImageHeight;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = ew;
    exportCanvas.height = eh;
    const ectx = exportCanvas.getContext("2d");

    ectx.clearRect(0, 0, ew, eh);
    if (chromaFullCanvas) {
      ectx.drawImage(chromaFullCanvas, 0, 0, ew, eh);
    } else {
      ectx.drawImage(originalImageElement, 0, 0, ew, eh);
    }

    const maskFullCanvas = document.createElement("canvas");
    maskFullCanvas.width = ew;
    maskFullCanvas.height = eh;
    const maskFullCtx = maskFullCanvas.getContext("2d");
    maskFullCtx.clearRect(0, 0, ew, eh);
    maskFullCtx.drawImage(maskCanvas, 0, 0, ew, eh);

    ectx.globalCompositeOperation = "destination-in";
    ectx.drawImage(maskFullCanvas, 0, 0);
    ectx.globalCompositeOperation = "source-over";

    return canvasToBlob(exportCanvas, "image/png");
  }

  function setEnabled(flag) {
    btnRemove.disabled = !flag || working || !hasImage;
    if (btnRemoveChroma) btnRemoveChroma.disabled = !flag || working || !hasImage;
    if (aiStrengthEl) aiStrengthEl.disabled = !flag || working || !hasImage;
    brushSizeEl.disabled = !flag || working || !hasImage;
    modeEraseBtn.disabled = !flag || working || !hasImage;
    modeRestoreBtn.disabled = !flag || working || !hasImage;
    setUndoRedoState();
  }

  window.addEventListener("keydown", e => {
    if (!hasImage || working) return;
    switch (e.key.toLowerCase()) {
      case "e":
        setBrushMode("erase");
        onStatus?.("Brush: erase");
        break;
      case "r":
        setBrushMode("restore");
        onStatus?.("Brush: restore");
        break;
      case "z":
        undo();
        break;
      case "y":
        redo();
        break;
    }
  });

  checkModelReady();
  updateAiStrengthLabel();
  updateViewModeUI();
  setEnabled(false);
  setWorking(false);
  setProcessingUI(false);
  setUndoRedoState();

  return {
    setImage,
    resetMask,
    exportCutoutBlob,
    setEnabled,
    removeBg,
    setReferenceBackground,
    setReferenceVisible
  };
}
