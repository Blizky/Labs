import { canvasToBlob } from "./shared.js";
import {
  removeBackground,
  preload
} from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.8/+esm";

const DOC_PRESETS = {
  square: { w: 1080, h: 1080 },
  landscape43: { w: 1440, h: 1080 },
  landscape169: { w: 1920, h: 1080 },
  portrait34: { w: 1080, h: 1440 }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function truncateName(name = "layer") {
  const clean = name.trim() || "layer";
  return clean.length > 28 ? `${clean.slice(0, 25)}…` : clean;
}

function safeFilenamePart(text = "layer") {
  return text.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "layer";
}

const WB_LIMIT = 25;
const TINT_LIMIT = 25;
const BRIGHT_LIMIT = 30;
const SAT_LIMIT = 30;
const CONTRAST_LIMIT = 30;
const MAX_LAYERS = 6;
const MODEL_READY_KEY = "bgoneModelReady";

function hasWhiteBalanceAdjust(layer) {
  return (
    Math.abs(layer.wbTemp || 0) > 0.001 ||
    Math.abs(layer.wbTint || 0) > 0.001 ||
    Math.abs(layer.wbBright || 0) > 0.001 ||
    Math.abs(layer.wbSat || 0) > 0.001 ||
    Math.abs(layer.wbContrast || 0) > 0.001
  );
}

function getLayerRenderSource(layer) {
  return layer.processedCanvas || layer.image;
}

function computeShadowMetrics(drawW, drawH) {
  const basis = Math.max(1, Math.min(drawW, drawH));
  const blur = clamp(Math.round(basis * 0.018), 6, 24);
  const offsetY = clamp(Math.round(basis * 0.025), 4, 26);
  const opacity = 0.34;
  return { blur, offsetY, opacity };
}

const PARALLAX_MAX_SCALE = 0.16;
const PARALLAX_PAN_X = 0.085;
const PARALLAX_PAN_Y = 0.07;

const PARALLAX_QUALITY_PRESETS = {
  100: { scale: 1.0, quality: 7 },
  50: { scale: 0.72, quality: 10 },
  30: { scale: 0.56, quality: 13 }
};

const PARALLAX_WATERMARK_SRC = "/assets/images/blizlab_logo_white.png";
let parallaxWatermarkPromise = null;

function loadParallaxWatermark() {
  if (parallaxWatermarkPromise) return parallaxWatermarkPromise;
  parallaxWatermarkPromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = PARALLAX_WATERMARK_SRC;
  });
  return parallaxWatermarkPromise;
}

function markModelReady() {
  localStorage.setItem(MODEL_READY_KEY, "1");
}

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

export function createLayersTool(opts) {
  const {
    canvas,
    canvasWrap,
    listEl,
    overlayEl,
    ratioButtons,
    onStatus,
    onChange
  } = opts;

  const ctx = canvas.getContext("2d");
  const state = {
    ratio: "landscape43",
    layers: [],
    activeLayerId: null
  };

  const interaction = {
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startLayerX: 0,
    startLayerY: 0
  };

  let layerSeed = 0;
  let modelWarmPromise = null;
  let soloLayerId = null;
  let soloPrevVisibility = null;
  let bgEditor = null;

  function clearSolo(restore = true) {
    if (!soloLayerId) return;
    if (restore && Array.isArray(soloPrevVisibility)) {
      const prevMap = new Map(soloPrevVisibility.map(entry => [entry.id, entry.visible]));
      state.layers.forEach(layer => {
        if (prevMap.has(layer.id)) {
          layer.visible = !!prevMap.get(layer.id);
        }
      });
    }
    soloLayerId = null;
    soloPrevVisibility = null;
  }

  function toggleSolo(layerId) {
    if (!layerId) return;
    if (soloLayerId === layerId) {
      clearSolo(true);
      return;
    }
    if (soloLayerId) clearSolo(true);
    soloPrevVisibility = state.layers.map(layer => ({ id: layer.id, visible: !!layer.visible }));
    soloLayerId = layerId;
    state.layers.forEach(layer => {
      layer.visible = layer.id === layerId;
    });
  }

  function warmModel() {
    if (!modelWarmPromise) {
      modelWarmPromise = preload({ debug: true }).then(() => {
        markModelReady();
      });
    }
    return modelWarmPromise;
  }

  function ensureBackgroundEditor() {
    if (bgEditor) return bgEditor;

    const overlay = document.createElement("div");
    overlay.className = "layer-bg-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="layer-bg-modal" role="dialog" aria-modal="true" aria-label="Layer brush editor">
        <div class="layer-bg-head">
          <div class="layer-bg-controls-row">
            <div class="pill-toggle layer-bg-brush-toggle" role="tablist" aria-label="Brush type">
              <button type="button" data-bg-brush-mode="erase" class="active"><img src="/RetroCut/svg/eraser_line.svg" alt="">Erase</button>
              <button type="button" data-bg-brush-mode="restore"><img src="/RetroCut/svg/paint_brush_line.svg" alt="">Restore</button>
            </div>
            <label class="layer-bg-brush-size">
              <span>Size</span>
              <input type="range" min="4" max="140" value="50" data-bg-brush-size>
              <span data-bg-brush-size-value>50</span>
            </label>
          </div>
        </div>
        <div class="layer-bg-canvas-wrap" data-bg-canvas-wrap>
          <canvas data-bg-canvas></canvas>
          <div class="layer-bg-brush-preview" data-bg-brush-preview></div>
        </div>
        <div class="layer-bg-foot">
          <div class="layer-bg-meta layer-bg-view-left">
            <div class="layer-bg-view">
              <button type="button" class="cutout-bg-btn active" data-editor-bg="checker" title="Checker background"></button>
              <button type="button" class="cutout-bg-btn" data-editor-bg="white" title="White background"></button>
              <button type="button" class="cutout-bg-btn" data-editor-bg="black" title="Black background"></button>
            </div>
            <div class="layer-bg-hint"><img src="/RetroCut/svg/hand_line.svg" alt="">Hold Space to move</div>
          </div>
          <div class="layer-bg-actions layer-bg-actions-center">
            <button type="button" class="secondary-btn" data-bg-cutout><img src="/RetroCut/svg/eraser_ai_line.svg" alt="">Cutout</button>
            <button type="button" class="secondary-btn" data-bg-chroma><img src="/RetroCut/svg/color_picker_line.svg" alt="">Color</button>
            <button type="button" class="secondary-btn" data-bg-reset><img src="/RetroCut/svg/recycle_line.svg" alt="">Reset</button>
          </div>
          <div class="layer-bg-actions layer-bg-actions-right">
            <button type="button" class="secondary-btn" data-bg-cancel>Cancel</button>
            <button type="button" class="secondary-btn" data-bg-apply>Apply</button>
            <button type="button" class="layer-bg-info-icon" data-bg-info title="About apply behavior" aria-label="About apply behavior"><img src="/RetroCut/svg/information_line.svg" alt=""></button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const canvasWrapEl = overlay.querySelector("[data-bg-canvas-wrap]");
    const canvasEl = overlay.querySelector("[data-bg-canvas]");
    const brushPreviewEl = overlay.querySelector("[data-bg-brush-preview]");
    const brushSizeEl = overlay.querySelector("[data-bg-brush-size]");
    const brushSizeValueEl = overlay.querySelector("[data-bg-brush-size-value]");
    const brushModeButtons = Array.from(overlay.querySelectorAll("[data-bg-brush-mode]"));
    const editorBgButtons = Array.from(overlay.querySelectorAll("[data-editor-bg]"));
    const btnCutout = overlay.querySelector("[data-bg-cutout]");
    const btnChroma = overlay.querySelector("[data-bg-chroma]");
    const btnReset = overlay.querySelector("[data-bg-reset]");
    const btnCancel = overlay.querySelector("[data-bg-cancel]");
    const btnInfo = overlay.querySelector("[data-bg-info]");
    const btnApply = overlay.querySelector("[data-bg-apply]");
    [btnCutout, btnChroma, btnReset].forEach(btn => {
      if (!btn) return;
      btn.dataset.labelHtml = btn.innerHTML;
    });

    const sourceCanvas = document.createElement("canvas");
    const sourceCtx = sourceCanvas.getContext("2d");
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    const compCanvas = document.createElement("canvas");
    const compCtx = compCanvas.getContext("2d");
    const drawCtx = canvasEl.getContext("2d");

    bgEditor = {
      overlay,
      canvasWrapEl,
      canvasEl,
      brushSizeEl,
      brushSizeValueEl,
      brushPreviewEl,
      brushModeButtons,
      editorBgButtons,
      btnCutout,
      btnChroma,
      btnReset,
      btnCancel,
      btnInfo,
      btnApply,
      sourceCanvas,
      sourceCtx,
      maskCanvas,
      maskCtx,
      compCanvas,
      compCtx,
      drawCtx,
      layerId: null,
      baseImage: null,
      zoom: 100,
      editMode: "brush",
      spaceMove: false,
      brushMode: "erase",
      brushSize: Number(brushSizeEl.value || 50),
      colorPickMode: false,
      colorPickBusy: false,
      painting: false,
      panning: false,
      pointerId: null,
      lastPoint: null,
      baseScale: 1,
      panX: 0,
      panY: 0,
      panStartX: 0,
      panStartY: 0,
      startPanX: 0,
      startPanY: 0,
      applyZoom: null,
      handleColorPick: null,
      outsidePickHandler: null,
      updateModeButtons: null
    };

    function isMoveActive() {
      return bgEditor.editMode === "move" || bgEditor.spaceMove;
    }

    function updateModeButtons() {
      if (bgEditor.colorPickMode || bgEditor.colorPickBusy) {
        canvasWrapEl.classList.add("is-color-pick");
        canvasWrapEl.style.cursor = "crosshair";
        canvasEl.style.cursor = "crosshair";
        if (brushPreviewEl) brushPreviewEl.style.display = "none";
        return;
      }
      canvasWrapEl.classList.remove("is-color-pick");
      const moveActive = isMoveActive();
      const isBrush = !moveActive;
      brushModeButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.bgBrushMode === bgEditor.brushMode));
      const nextCursor = isBrush ? "crosshair" : (bgEditor.panning ? "grabbing" : "grab");
      canvasWrapEl.style.cursor = nextCursor;
      canvasEl.style.cursor = nextCursor;
      if (!isBrush && brushPreviewEl) {
        brushPreviewEl.style.display = "none";
      }
    }

    function getScale() {
      return Math.max(0.0001, bgEditor.baseScale * (bgEditor.zoom / 100));
    }

    function applyTransform() {
      const scale = getScale();
      canvasEl.style.transformOrigin = "top left";
      canvasEl.style.transform = `translate(${bgEditor.panX}px, ${bgEditor.panY}px) scale(${scale})`;
    }

    function fitToViewport() {
      const rect = canvasWrapEl.getBoundingClientRect();
      const pad = 18;
      const fitX = (rect.width - pad * 2) / Math.max(1, canvasEl.width);
      const fitY = (rect.height - pad * 2) / Math.max(1, canvasEl.height);
      bgEditor.baseScale = clamp(Math.min(fitX, fitY, 1), 0.05, 1);
      const scale = getScale();
      bgEditor.panX = (rect.width - canvasEl.width * scale) / 2;
      bgEditor.panY = (rect.height - canvasEl.height * scale) / 2;
      applyTransform();
    }

    function applyZoom(nextZoom, clientX = null, clientY = null) {
      const prevScale = getScale();
      const rect = canvasWrapEl.getBoundingClientRect();
      const anchorX = clientX == null ? rect.width / 2 : (clientX - rect.left);
      const anchorY = clientY == null ? rect.height / 2 : (clientY - rect.top);
      const imageX = (anchorX - bgEditor.panX) / prevScale;
      const imageY = (anchorY - bgEditor.panY) / prevScale;
      bgEditor.zoom = clamp(nextZoom, 25, 400);
      const nextScale = getScale();
      bgEditor.panX = anchorX - imageX * nextScale;
      bgEditor.panY = anchorY - imageY * nextScale;
      applyTransform();
    }

    function renderEditor() {
      const w = canvasEl.width;
      const h = canvasEl.height;
      compCtx.clearRect(0, 0, w, h);
      compCtx.globalCompositeOperation = "source-over";
      compCtx.drawImage(sourceCanvas, 0, 0, w, h);
      compCtx.globalCompositeOperation = "destination-in";
      compCtx.drawImage(maskCanvas, 0, 0, w, h);
      compCtx.globalCompositeOperation = "source-over";

      drawCtx.clearRect(0, 0, w, h);
      drawCtx.drawImage(compCanvas, 0, 0, w, h);
    }

    function toCanvasPoint(evt) {
      const rect = canvasWrapEl.getBoundingClientRect();
      const scale = getScale();
      const localX = evt.clientX - rect.left;
      const localY = evt.clientY - rect.top;
      return {
        x: clamp((localX - bgEditor.panX) / scale, 0, canvasEl.width),
        y: clamp((localY - bgEditor.panY) / scale, 0, canvasEl.height)
      };
    }

    function updateBrushPreview(evt) {
      if (!brushPreviewEl || isMoveActive()) return;
      const wrapRect = canvasWrapEl.getBoundingClientRect();
      const radius = Math.max(1, Number(bgEditor.brushSize) || 1);
      const size = radius * 2 * getScale();
      brushPreviewEl.style.width = `${size}px`;
      brushPreviewEl.style.height = `${size}px`;
      brushPreviewEl.style.left = `${evt.clientX - wrapRect.left}px`;
      brushPreviewEl.style.top = `${evt.clientY - wrapRect.top}px`;
      brushPreviewEl.classList.toggle("restore", bgEditor.brushMode === "restore");
      brushPreviewEl.style.display = "block";
    }

    function drawStroke(from, to) {
      const radius = Math.max(1, Number(bgEditor.brushSize) || 1);
      const mode = bgEditor.brushMode === "erase" ? "destination-out" : "source-over";
      maskCtx.save();
      maskCtx.globalCompositeOperation = mode;
      maskCtx.lineCap = "round";
      maskCtx.lineJoin = "round";
      maskCtx.lineWidth = radius * 2;
      maskCtx.strokeStyle = "#fff";
      maskCtx.beginPath();
      maskCtx.moveTo(from.x, from.y);
      maskCtx.lineTo(to.x, to.y);
      maskCtx.stroke();
      maskCtx.restore();
    }

    canvasWrapEl.addEventListener("pointerdown", (evt) => {
      if (bgEditor.colorPickMode) {
        bgEditor.painting = false;
        bgEditor.panning = false;
        bgEditor.pointerId = null;
        bgEditor.lastPoint = null;
        if (brushPreviewEl) brushPreviewEl.style.display = "none";
        const p = toCanvasPoint(evt);
        bgEditor.handleColorPick?.(p);
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      if (bgEditor.colorPickBusy) {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      if (isMoveActive()) {
        bgEditor.panning = true;
        bgEditor.pointerId = evt.pointerId;
        bgEditor.panStartX = evt.clientX;
        bgEditor.panStartY = evt.clientY;
        bgEditor.startPanX = bgEditor.panX;
        bgEditor.startPanY = bgEditor.panY;
        updateModeButtons();
        evt.preventDefault();
        return;
      }

      bgEditor.painting = true;
      bgEditor.pointerId = evt.pointerId;
      const p = toCanvasPoint(evt);
      bgEditor.lastPoint = p;
      drawStroke(p, p);
      renderEditor();
      updateBrushPreview(evt);
      evt.preventDefault();
    }, { passive: false });

    canvasWrapEl.addEventListener("pointermove", (evt) => {
      if (bgEditor.colorPickMode) {
        if (brushPreviewEl) brushPreviewEl.style.display = "none";
        return;
      }
      if (bgEditor.pointerId != null && evt.pointerId !== bgEditor.pointerId) return;
      if (isMoveActive()) {
        if (!bgEditor.panning) return;
        const dx = evt.clientX - bgEditor.panStartX;
        const dy = evt.clientY - bgEditor.panStartY;
        bgEditor.panX = bgEditor.startPanX + dx;
        bgEditor.panY = bgEditor.startPanY + dy;
        applyTransform();
        evt.preventDefault();
        return;
      }
      updateBrushPreview(evt);
      if (!bgEditor.painting) return;
      const events = evt.getCoalescedEvents ? evt.getCoalescedEvents() : [evt];
      for (const sample of events) {
        const p = toCanvasPoint(sample);
        drawStroke(bgEditor.lastPoint || p, p);
        bgEditor.lastPoint = p;
      }
      renderEditor();
      evt.preventDefault();
    }, { passive: false });

    function endPointer(evt) {
      if (bgEditor.pointerId != null && evt && evt.pointerId != null && evt.pointerId !== bgEditor.pointerId) return;
      if (bgEditor.panning) {
        bgEditor.panning = false;
        updateModeButtons();
      }
      bgEditor.pointerId = null;
      bgEditor.painting = false;
      bgEditor.lastPoint = null;
      if (brushPreviewEl) brushPreviewEl.style.display = "none";
    }

    canvasWrapEl.addEventListener("pointerup", endPointer, { passive: false });
    canvasWrapEl.addEventListener("pointercancel", endPointer, { passive: false });
    canvasWrapEl.addEventListener("pointerleave", endPointer, { passive: false });
    window.addEventListener("pointerup", endPointer, { passive: true });
    window.addEventListener("pointercancel", endPointer, { passive: true });

    canvasWrapEl.addEventListener("pointermove", (evt) => {
      if (bgEditor.colorPickMode) return;
      if (isMoveActive()) return;
      updateBrushPreview(evt);
    }, { passive: true });
    canvasWrapEl.addEventListener("pointerenter", (evt) => {
      if (bgEditor.colorPickMode) return;
      if (isMoveActive()) return;
      updateBrushPreview(evt);
    }, { passive: true });
    canvasWrapEl.addEventListener("pointerleave", () => {
      if (brushPreviewEl) brushPreviewEl.style.display = "none";
    }, { passive: true });

    canvasWrapEl.addEventListener("wheel", (evt) => {
      evt.preventDefault();
      const factor = evt.deltaY < 0 ? 1.12 : 1 / 1.12;
      applyZoom(bgEditor.zoom * factor, evt.clientX, evt.clientY);
    }, { passive: false });

    brushModeButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        bgEditor.brushMode = btn.dataset.bgBrushMode === "restore" ? "restore" : "erase";
        updateModeButtons();
        if (brushPreviewEl) brushPreviewEl.classList.toggle("restore", bgEditor.brushMode === "restore");
      });
    });

    editorBgButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.editorBg;
        if (!mode) return;
        canvasWrapEl.dataset.bgMode = mode;
        editorBgButtons.forEach(entry => entry.classList.toggle("active", entry === btn));
      });
    });

    brushSizeEl.addEventListener("input", () => {
      bgEditor.brushSize = Number(brushSizeEl.value || 50);
      if (brushSizeValueEl) brushSizeValueEl.textContent = String(Math.round(bgEditor.brushSize));
    });

    window.addEventListener("keydown", (evt) => {
      if (overlay.hidden) return;
      if (evt.code !== "Space") return;
      const tag = evt.target && evt.target.tagName ? evt.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (bgEditor.spaceMove) return;
      bgEditor.spaceMove = true;
      editor.updateModeButtons();
      evt.preventDefault();
      evt.stopPropagation();
    });
    window.addEventListener("keyup", (evt) => {
      if (evt.code !== "Space") return;
      if (!bgEditor.spaceMove) return;
      bgEditor.spaceMove = false;
      editor.updateModeButtons();
      evt.preventDefault();
      evt.stopPropagation();
    });

    bgEditor.applyZoom = applyZoom;
    bgEditor.fitToViewport = fitToViewport;
    bgEditor.updateModeButtons = updateModeButtons;

    return bgEditor;
  }

  async function openLayerBrushEditor(layer) {
    const editor = ensureBackgroundEditor();
    const image = layer?.image;
    const renderedSource = layer ? getLayerRenderSource(layer) : null;
    const baseImage = renderedSource || image;
    if (!image || !renderedSource) return;

    editor.layerId = layer.id;
    editor.baseImage = baseImage;
    editor.overlay.hidden = false;
    editor.editMode = "brush";
    editor.brushMode = "erase";
    editor.brushSize = Number(editor.brushSizeEl.value || 50);
    editor.zoom = 100;
    editor.sourceCanvas.width = renderedSource.width;
    editor.sourceCanvas.height = renderedSource.height;
    editor.maskCanvas.width = renderedSource.width;
    editor.maskCanvas.height = renderedSource.height;
    editor.compCanvas.width = renderedSource.width;
    editor.compCanvas.height = renderedSource.height;
    editor.canvasEl.width = renderedSource.width;
    editor.canvasEl.height = renderedSource.height;

    editor.sourceCtx.clearRect(0, 0, renderedSource.width, renderedSource.height);
    editor.sourceCtx.drawImage(renderedSource, 0, 0);
    editor.maskCtx.clearRect(0, 0, renderedSource.width, renderedSource.height);
    editor.maskCtx.fillStyle = "#fff";
    editor.maskCtx.fillRect(0, 0, renderedSource.width, renderedSource.height);

    editor.fitToViewport();
    editor.canvasWrapEl.dataset.bgMode = "checker";
    editor.canvasWrapEl.classList.remove("is-color-pick");
    editor.editorBgButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.editorBg === "checker"));
    editor.brushSizeValueEl.textContent = String(Math.round(editor.brushSize));
    editor.brushModeButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.bgBrushMode === "erase"));
    editor.colorPickMode = false;
    editor.colorPickBusy = false;
    editor.btnChroma.classList.remove("is-active");
    editor.spaceMove = false;
    editor.canvasWrapEl.style.cursor = "crosshair";
    editor.canvasEl.style.cursor = "crosshair";
    if (editor.brushPreviewEl) {
      editor.brushPreviewEl.style.display = "none";
      editor.brushPreviewEl.classList.remove("restore");
    }

    const applyHandler = async () => {
      const target = layerById(editor.layerId);
      if (!target) {
        editor.overlay.hidden = true;
        return;
      }
      const composed = document.createElement("canvas");
      composed.width = editor.sourceCanvas.width;
      composed.height = editor.sourceCanvas.height;
      const cctx = composed.getContext("2d");
      cctx.drawImage(editor.sourceCanvas, 0, 0);
      cctx.globalCompositeOperation = "destination-in";
      cctx.drawImage(editor.maskCanvas, 0, 0);
      cctx.globalCompositeOperation = "source-over";

      const blob = await canvasToBlob(composed, "image/png");
      const nextImage = await loadImageFromBlob(blob);
      target.image = nextImage;
      // The brush editor starts from rendered/tuned pixels, so clear WB tuning to avoid double-applying it.
      target.wbTemp = 0;
      target.wbTint = 0;
      target.wbBright = 0;
      target.wbSat = 0;
      target.wbContrast = 0;
      target.thumbDataUrl = makeThumbDataUrl(nextImage);
      target.processedCanvas = null;
      rebuildLayerProcessed(target);
      refreshWarnings(target);
      editor.overlay.hidden = true;
      refreshList();
      render();
      onStatus?.("Layer brush edit applied.");
    };

    function renderFromSource() {
      const w = editor.canvasEl.width;
      const h = editor.canvasEl.height;
      editor.compCtx.clearRect(0, 0, w, h);
      editor.compCtx.globalCompositeOperation = "source-over";
      editor.compCtx.drawImage(editor.sourceCanvas, 0, 0, w, h);
      editor.compCtx.globalCompositeOperation = "destination-in";
      editor.compCtx.drawImage(editor.maskCanvas, 0, 0, w, h);
      editor.compCtx.globalCompositeOperation = "source-over";
      editor.drawCtx.clearRect(0, 0, w, h);
      editor.drawCtx.drawImage(editor.compCanvas, 0, 0, w, h);
    }

    function buildComposedSourceCanvas() {
      const composed = document.createElement("canvas");
      composed.width = editor.sourceCanvas.width;
      composed.height = editor.sourceCanvas.height;
      const cctx = composed.getContext("2d");
      cctx.drawImage(editor.sourceCanvas, 0, 0);
      cctx.globalCompositeOperation = "destination-in";
      cctx.drawImage(editor.maskCanvas, 0, 0);
      cctx.globalCompositeOperation = "source-over";
      return composed;
    }

    function intersectMask(nextMaskCanvas) {
      editor.maskCtx.save();
      editor.maskCtx.globalCompositeOperation = "destination-in";
      editor.maskCtx.drawImage(nextMaskCanvas, 0, 0);
      editor.maskCtx.restore();
    }

    function setBusyButton(button, label, busy) {
      if (!button) return;
      if (busy) {
        button.classList.add("is-loading");
        button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${label}</span>`;
      } else {
        button.classList.remove("is-loading");
        button.innerHTML = button.dataset.labelHtml || label;
      }
    }

    function setEditorBusy(flag) {
      const disabled = !!flag;
      editor.btnCutout.disabled = disabled;
      editor.btnChroma.disabled = disabled;
      editor.btnReset.disabled = disabled;
      editor.btnCancel.disabled = disabled;
      editor.btnInfo.disabled = disabled;
      editor.btnApply.disabled = disabled;
      editor.brushSizeEl.disabled = disabled;
      editor.brushModeButtons.forEach(btn => { btn.disabled = disabled; });
      editor.canvasWrapEl.style.pointerEvents = disabled ? "none" : "auto";
      editor.canvasWrapEl.style.opacity = disabled ? "0.85" : "1";
      setBusyButton(editor.btnCutout, "Cutout", false);
      setBusyButton(editor.btnChroma, "Color", false);
    }

    function setColorBusy(flag) {
      const disabled = !!flag;
      editor.btnChroma.disabled = disabled;
      setBusyButton(editor.btnChroma, disabled ? "Working..." : "Color", disabled);
    }

    const closeHandler = () => {
      if (editor.brushPreviewEl) editor.brushPreviewEl.style.display = "none";
      editor.colorPickMode = false;
      editor.colorPickBusy = false;
      editor.btnChroma.classList.remove("is-active");
      editor.canvasWrapEl.classList.remove("is-color-pick");
      editor.spaceMove = false;
      editor.panning = false;
      editor.pointerId = null;
      editor.canvasWrapEl.style.cursor = "crosshair";
      editor.canvasEl.style.cursor = "crosshair";
      editor.overlay.hidden = true;
    };

    if (editor.outsidePickHandler) {
      window.removeEventListener("pointerdown", editor.outsidePickHandler, true);
    }
    editor.outsidePickHandler = (evt) => {
      if (!editor.colorPickMode) return;
      const target = evt.target;
      if (editor.canvasWrapEl.contains(target) || editor.btnChroma.contains(target)) return;
      editor.colorPickMode = false;
      editor.colorPickBusy = false;
      editor.btnChroma.classList.remove("is-active");
      editor.canvasWrapEl.classList.remove("is-color-pick");
      editor.updateModeButtons();
      onStatus?.("Color picker cancelled.");
    };
    window.addEventListener("pointerdown", editor.outsidePickHandler, true);

    editor.btnApply.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyHandler().catch((error) => {
        console.error(error);
        onStatus?.("Could not apply layer brush edit.");
      });
    };
    editor.btnCutout.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        setEditorBusy(true);
        setBusyButton(editor.btnCutout, "Working...", true);
        onStatus?.("Preparing quick cutout...");
        const composedSource = buildComposedSourceCanvas();
        const sourceBlob = await canvasToBlob(composedSource, "image/png");
        const sourceImage = await loadImageFromBlob(sourceBlob);
        const sourceCanvas = makeCanvasFromImage(sourceImage);
        const nextImage = await buildAiCutoutImageFromCanvas(sourceCanvas);
        const aiMask = alphaToMaskCanvas(nextImage);
        intersectMask(aiMask);
        renderFromSource();
        onStatus?.("Quick cutout done.");
      } catch (error) {
        console.error(error);
        onStatus?.("Quick cutout failed.");
      } finally {
        setEditorBusy(false);
      }
    };
    editor.handleColorPick = async (point) => {
      try {
        editor.colorPickBusy = true;
        editor.colorPickMode = false;
        editor.btnChroma.classList.remove("is-active");
        editor.updateModeButtons();
        setColorBusy(true);
        onStatus?.("Applying picked color...");
        const sx = clamp(Math.round(point.x), 0, Math.max(0, editor.sourceCanvas.width - 1));
        const sy = clamp(Math.round(point.y), 0, Math.max(0, editor.sourceCanvas.height - 1));
        const pixel = editor.sourceCtx.getImageData(sx, sy, 1, 1).data;
        const composedSource = buildComposedSourceCanvas();
        const sourceBlob = await canvasToBlob(composedSource, "image/png");
        const sourceImage = await loadImageFromBlob(sourceBlob);
        const sourceCanvas = makeCanvasFromImage(sourceImage);
        const nextMask = buildSampledColorKeyCanvas(sourceCanvas, {
          r: pixel[0],
          g: pixel[1],
          b: pixel[2]
        });
        intersectMask(nextMask);
        renderFromSource();
        onStatus?.("Color removal applied.");
      } catch (error) {
        console.error(error);
        onStatus?.("Color removal failed.");
      } finally {
        setColorBusy(false);
        editor.colorPickBusy = false;
        editor.updateModeButtons();
      }
    };
    editor.btnChroma.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      editor.colorPickMode = !editor.colorPickMode;
      editor.painting = false;
      editor.panning = false;
      editor.pointerId = null;
      editor.lastPoint = null;
      editor.btnChroma.classList.toggle("is-active", editor.colorPickMode);
      if (editor.colorPickMode) {
        onStatus?.("Pick a color on canvas. Click outside to cancel.");
      } else {
        onStatus?.("Color picker cancelled.");
      }
      editor.updateModeButtons();
    };
    editor.btnReset.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const resetImage = editor.baseImage || image;
      if (!resetImage) return;
      editor.sourceCanvas.width = resetImage.width;
      editor.sourceCanvas.height = resetImage.height;
      editor.maskCanvas.width = resetImage.width;
      editor.maskCanvas.height = resetImage.height;
      editor.compCanvas.width = resetImage.width;
      editor.compCanvas.height = resetImage.height;
      editor.canvasEl.width = resetImage.width;
      editor.canvasEl.height = resetImage.height;
      editor.sourceCtx.clearRect(0, 0, resetImage.width, resetImage.height);
      editor.sourceCtx.drawImage(resetImage, 0, 0);
      editor.maskCtx.clearRect(0, 0, resetImage.width, resetImage.height);
      editor.maskCtx.fillStyle = "#fff";
      editor.maskCtx.fillRect(0, 0, resetImage.width, resetImage.height);
      editor.zoom = 100;
      editor.spaceMove = false;
      editor.fitToViewport();
      editor.brushMode = "erase";
      editor.brushModeButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.bgBrushMode === "erase"));
      if (editor.brushPreviewEl) {
        editor.brushPreviewEl.style.display = "none";
        editor.brushPreviewEl.classList.remove("restore");
      }
      renderFromSource();
      onStatus?.("Layer brush editor reset to original.");
    };
    editor.btnCancel.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeHandler();
    };
    editor.btnInfo.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.alert("Apply replaces the image on this layer. Restore brush wont work to recover transparency but you can always reset to original on the layer.");
    };
    editor.btnReset.onpointerdown = event => event.stopPropagation();
    editor.btnCutout.onpointerdown = event => event.stopPropagation();
    editor.btnChroma.onpointerdown = event => event.stopPropagation();
    editor.btnInfo.onpointerdown = event => event.stopPropagation();
    editor.btnApply.onpointerdown = event => event.stopPropagation();
    editor.btnCancel.onpointerdown = event => event.stopPropagation();
    editor.overlay.onclick = null;

    // initial render
    const w = editor.canvasEl.width;
    const h = editor.canvasEl.height;
    editor.compCtx.clearRect(0, 0, w, h);
    editor.compCtx.globalCompositeOperation = "source-over";
    editor.compCtx.drawImage(editor.sourceCanvas, 0, 0, w, h);
    editor.compCtx.globalCompositeOperation = "destination-in";
    editor.compCtx.drawImage(editor.maskCanvas, 0, 0, w, h);
    editor.compCtx.globalCompositeOperation = "source-over";
    editor.drawCtx.clearRect(0, 0, w, h);
    editor.drawCtx.drawImage(editor.compCanvas, 0, 0, w, h);
  }

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load cutout image."));
      };
      image.src = url;
    });
  }

  function setChipActive(buttons, predicate) {
    buttons.forEach(button => button.classList.toggle("active", predicate(button)));
  }

  function getDims(ratio) {
    return DOC_PRESETS[ratio] || DOC_PRESETS.landscape43;
  }

  function activeLayer() {
    return state.layers.find(layer => layer.id === state.activeLayerId) || null;
  }

  function hasLayers() {
    return state.layers.length > 0;
  }

  function canAddLayer() {
    return state.layers.length < MAX_LAYERS;
  }

  function getMaxLayers() {
    return MAX_LAYERS;
  }

  function getLayerCount() {
    return state.layers.length;
  }

  function getRatio() {
    return state.ratio;
  }

  function updateOverlay() {
    if (!overlayEl) return;
    overlayEl.style.display = hasLayers() ? "none" : "block";
  }

  function refreshWarnings(layer) {
    layer.lowResolution = layer.scale > 1.02;
  }

  function rebuildLayerProcessed(layer) {
    const needsWb = hasWhiteBalanceAdjust(layer);
    if (!needsWb) {
      layer.processedCanvas = null;
      return;
    }
    let source = layer.image;

    if (needsWb) {
      const work = document.createElement("canvas");
      work.width = source.width;
      work.height = source.height;
      const wctx = work.getContext("2d");
      wctx.drawImage(source, 0, 0);
      const imgData = wctx.getImageData(0, 0, work.width, work.height);
      const data = imgData.data;

      const temp = clamp(layer.wbTemp || 0, -WB_LIMIT, WB_LIMIT) / 100;
      const tint = clamp(layer.wbTint || 0, -TINT_LIMIT, TINT_LIMIT) / 100;
      const bright = clamp(layer.wbBright || 0, -BRIGHT_LIMIT, BRIGHT_LIMIT) / 100;
      const sat = clamp(layer.wbSat || 0, -SAT_LIMIT, SAT_LIMIT) / 100;
      const contrast = clamp(layer.wbContrast || 0, -CONTRAST_LIMIT, CONTRAST_LIMIT) / 100;
      const tempShift = temp * 42;
      const brightShift = bright * 255;
      const satFactor = 1 + sat;
      const contrastFactor = 1 + contrast * 1.5;
      const tintShift = tint * 30;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        let rr = r + tempShift + tintShift * 0.5;
        let gg = g - tintShift;
        let bb = b - tempShift + tintShift * 0.5;

        if (Math.abs(sat) > 0.0001) {
          const gray = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
          rr = gray + (rr - gray) * satFactor;
          gg = gray + (gg - gray) * satFactor;
          bb = gray + (bb - gray) * satFactor;
        }

        rr += brightShift;
        gg += brightShift;
        bb += brightShift;

        if (Math.abs(contrast) > 0.0001) {
          rr = (rr - 128) * contrastFactor + 128;
          gg = (gg - 128) * contrastFactor + 128;
          bb = (bb - 128) * contrastFactor + 128;
        }

        data[i] = clamp(Math.round(rr), 0, 255);
        data[i + 1] = clamp(Math.round(gg), 0, 255);
        data[i + 2] = clamp(Math.round(bb), 0, 255);
      }

      wctx.putImageData(imgData, 0, 0);
      source = work;
    }

    layer.processedCanvas = source;
  }

  function makeCanvasFromImage(image) {
    const canvasEl = document.createElement("canvas");
    canvasEl.width = image.width;
    canvasEl.height = image.height;
    const canvasCtx = canvasEl.getContext("2d");
    canvasCtx.drawImage(image, 0, 0);
    return canvasEl;
  }

  async function buildAiCutoutImageFromCanvas(sourceCanvas) {
    await warmModel();
    const srcBlob = await canvasToBlob(sourceCanvas, "image/png");
    const outBlob = await removeBackground(srcBlob, { debug: true });
    const nextImage = await loadImageFromBlob(outBlob);
    markModelReady();
    return nextImage;
  }

  function rgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta > 0.000001) {
      if (max === rn) {
        h = ((gn - bn) / delta) % 6;
      } else if (max === gn) {
        h = (bn - rn) / delta + 2;
      } else {
        h = (rn - gn) / delta + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max <= 0 ? 0 : delta / max;
    const v = max;
    return { h, s, v };
  }

  function buildSampledColorKeyCanvas(sourceCanvas, sample) {
    const work = document.createElement("canvas");
    work.width = sourceCanvas.width;
    work.height = sourceCanvas.height;
    const wctx = work.getContext("2d");
    wctx.drawImage(sourceCanvas, 0, 0);
    const imageData = wctx.getImageData(0, 0, work.width, work.height);
    const data = imageData.data;
    const sampleHsv = rgbToHsv(sample.r, sample.g, sample.b);
    const sampleSatLow = sampleHsv.s < 0.12;
    const satFloor = sampleSatLow ? 0 : Math.max(0.12, sampleHsv.s * 0.5);
    const valueFloor = sampleSatLow ? 0 : Math.max(0.28, sampleHsv.v - 0.22);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = sourceCanvas.width;
    maskCanvas.height = sourceCanvas.height;
    const mctx = maskCanvas.getContext("2d");
    const maskImage = mctx.createImageData(maskCanvas.width, maskCanvas.height);
    const maskData = maskImage.data;

    for (let i = 0; i < data.length; i += 4) {
      maskData[i] = 255;
      maskData[i + 1] = 255;
      maskData[i + 2] = 255;
      maskData[i + 3] = 255;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const dr = r - sample.r;
      const dg = g - sample.g;
      const db = b - sample.b;
      const rgbDist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.67295593;
      const hsv = rgbToHsv(r, g, b);
      const hueDiff = Math.min(Math.abs(hsv.h - sampleHsv.h), 360 - Math.abs(hsv.h - sampleHsv.h)) / 180;
      const satDiff = Math.abs(hsv.s - sampleHsv.s);
      const valDiff = Math.abs(hsv.v - sampleHsv.v);

      let keyStrength;
      if (sampleSatLow) {
        keyStrength = clamp01((0.2 - rgbDist) / 0.2);
      } else {
        const colorScore = (1 - hueDiff) * 0.58 + (1 - satDiff) * 0.24 + (1 - valDiff) * 0.18;
        const hueGate = hueDiff < 0.18 ? 1 : clamp01((0.28 - hueDiff) / 0.1);
        const scoreBased = clamp01((colorScore - 0.67) / 0.33) * hueGate;
        const rgbBased = clamp01((0.14 - rgbDist) / 0.14);
        keyStrength = Math.max(scoreBased, rgbBased * 0.92);
        if (hsv.s < satFloor) keyStrength *= 0.12;
        if (hsv.v < valueFloor) keyStrength *= 0.3;
        if (hueDiff > 0.2 && hsv.s < sampleHsv.s * 0.75) keyStrength *= 0.1;
      }
      if (keyStrength <= 0.1) continue;
      let alpha = Math.round(255 * (1 - Math.pow(keyStrength, 0.86)));
      if (keyStrength >= 0.5) alpha = Math.min(alpha, 28);
      if (keyStrength >= 0.65) alpha = 0;
      maskData[i + 3] = alpha;
    }

    mctx.putImageData(maskImage, 0, 0);
    return maskCanvas;
  }

  function alphaToMaskCanvas(alphaSource) {
    const mask = document.createElement("canvas");
    mask.width = alphaSource.width;
    mask.height = alphaSource.height;
    const mctx = mask.getContext("2d");
    mctx.drawImage(alphaSource, 0, 0);
    const imageData = mctx.getImageData(0, 0, mask.width, mask.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a;
    }
    mctx.putImageData(imageData, 0, 0);
    return mask;
  }

  function updateCanvasSize(ratio) {
    const prevW = canvas.width || 1;
    const prevH = canvas.height || 1;
    const { w, h } = getDims(ratio);
    const sx = w / prevW;
    const sy = h / prevH;
    state.layers.forEach(layer => {
      layer.x *= sx;
      layer.y *= sy;
      const geometric = Math.sqrt((sx * sx + sy * sy) / 2);
      layer.scale *= geometric;
      layer.baseScale *= geometric;
      refreshWarnings(layer);
    });
    canvas.width = w;
    canvas.height = h;
    canvasWrap.style.aspectRatio = `${w} / ${h}`;
  }

  function render() {
    drawLayers(ctx, 0, false);
  }

  function drawLayers(targetCtx, progress = 0, parallaxEnabled = false, motionType = "zoom", intensity = 1) {
    targetCtx.clearRect(0, 0, canvas.width, canvas.height);
    const total = Math.max(1, state.layers.length);
    state.layers.forEach((layer, index) => {
      if (!layer.visible) return;
      const source = getLayerRenderSource(layer);
      const depth = (index + 1) / total;
      const strength = clamp(Number(intensity) || 1, 0.25, 1);
      const signed = progress * 2 - 1;
      const parallaxScale = parallaxEnabled && motionType === "zoom"
        ? (1 + PARALLAX_MAX_SCALE * strength * depth * progress)
        : 1;
      const drawW = source.width * layer.scale * parallaxScale;
      const drawH = source.height * layer.scale * parallaxScale;
      const panX = parallaxEnabled && motionType === "panx"
        ? signed * canvas.width * PARALLAX_PAN_X * strength * depth
        : 0;
      const panY = parallaxEnabled && motionType === "pany"
        ? signed * canvas.height * PARALLAX_PAN_Y * strength * depth
        : 0;
      const cx = canvas.width / 2 + layer.x + panX;
      const cy = canvas.height / 2 + layer.y + panY;
      const angle = (layer.rotationDeg || 0) * Math.PI / 180;

      if (layer.shadowEnabled) {
        const shadow = computeShadowMetrics(drawW, drawH);
        targetCtx.save();
        targetCtx.translate(cx, cy + shadow.offsetY);
        targetCtx.rotate(angle);
        targetCtx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
        targetCtx.globalAlpha = shadow.opacity;
        targetCtx.filter = `brightness(0) saturate(0) blur(${shadow.blur}px)`;
        targetCtx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
        targetCtx.filter = "none";
        targetCtx.globalAlpha = 1;
        targetCtx.restore();
      }

      targetCtx.save();
      targetCtx.translate(cx, cy);
      targetCtx.rotate(angle);
      targetCtx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
      targetCtx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
      targetCtx.restore();
    });
  }

  function refreshList() {
    if (!listEl) return;
    listEl.innerHTML = "";
    const entries = [...state.layers].reverse();
    entries.forEach(layer => {
      const el = document.createElement("div");
      el.className = `layer-item${layer.id === state.activeLayerId ? " active" : ""}`;
      el.dataset.layerId = layer.id;
      const warn = layer.lowResolution
        ? '<span class="warn" title="Low resolution image at current size">⚠</span>'
        : "";
      el.innerHTML = `
        <img class="layer-thumb" src="${layer.thumbDataUrl}" alt="">
        <div class="layer-meta">
          <div class="layer-name">${layer.name}</div>
          <div class="layer-hint">${warn}<span>${layer.processing ? "Processing..." : (layer.visible ? "Visible" : "Hidden")}</span></div>
        </div>
        <div class="layer-actions">
          <button class="layer-btn up" type="button" title="Move up">↑</button>
          <button class="layer-btn down" type="button" title="Move down">↓</button>
          <button class="layer-btn hide ${layer.visible ? "" : "active"}" type="button" title="${layer.visible ? "Mute layer" : "Unmute layer"}">M</button>
          <button class="layer-btn solo ${soloLayerId === layer.id ? "active" : ""}" type="button" title="${soloLayerId === layer.id ? "Exit solo mode" : "Solo this layer"}">S</button>
          <button class="layer-btn delete" type="button" title="Delete layer"><img src="/RetroCut/svg/delete_fill.svg" alt=""></button>
        </div>
        <div class="layer-tools">
          <button class="layer-tool-btn fill" type="button" title="Fill canvas"><img src="/RetroCut/svg/fullscreen_2_line.svg" alt=""></button>
          <button class="layer-tool-btn flipx" type="button" title="Flip horizontally"><img src="/RetroCut/svg/flip_vertical_line.svg" alt=""></button>
          <button class="layer-tool-btn flipy" type="button" title="Flip vertically"><img src="/RetroCut/svg/flip_horizontal_line.svg" alt=""></button>
          <button class="layer-tool-btn cutout" type="button" title="Background tools"><img src="/RetroCut/svg/scissors_line.svg" alt=""></button>
          <button class="layer-tool-btn shadow ${layer.shadowEnabled ? "active" : ""}" type="button" title="Toggle shadow"><img src="/RetroCut/svg/background_line.svg" alt=""></button>
          <button class="layer-tool-btn reset" type="button" title="Reset image"><img src="/RetroCut/svg/recycle_line.svg" alt=""></button>
        </div>
        <button class="layer-tuning-toggle ${layer.tuningOpen ? "is-open" : ""}" type="button" title="${layer.tuningOpen ? "Hide tuning" : "Show tuning"}">
          <span>TUNING</span>
          <span class="caret" aria-hidden="true">▾</span>
        </button>
        <div class="layer-more"${layer.tuningOpen ? "" : " hidden"}>
          <div class="layer-wb">
            <label class="layer-wb-row">
              <span>Temp</span>
              <input class="layer-wb-slider" data-kind="temp" type="range" min="-25" max="25" value="${Math.round(layer.wbTemp || 0)}">
            </label>
            <label class="layer-wb-row">
              <span>Tint</span>
              <input class="layer-wb-slider" data-kind="tint" type="range" min="-25" max="25" value="${Math.round(layer.wbTint || 0)}">
            </label>
            <label class="layer-wb-row">
              <span>Bright</span>
              <input class="layer-wb-slider" data-kind="bright" type="range" min="-30" max="30" value="${Math.round(layer.wbBright || 0)}">
            </label>
            <label class="layer-wb-row">
              <span>Sat</span>
              <input class="layer-wb-slider" data-kind="sat" type="range" min="-30" max="30" value="${Math.round(layer.wbSat || 0)}">
            </label>
            <label class="layer-wb-row">
              <span>Cont</span>
              <input class="layer-wb-slider" data-kind="contrast" type="range" min="-30" max="30" value="${Math.round(layer.wbContrast || 0)}">
            </label>
            <label class="layer-wb-row">
              <span>Rotate</span>
              <input class="layer-wb-slider" data-kind="rotate" type="range" min="-30" max="30" value="${Math.round(layer.rotationDeg || 0)}">
            </label>
          </div>
        </div>
      `;
      listEl.appendChild(el);
    });
    updateOverlay();
    onChange?.();
  }

  function makeThumbDataUrl(image) {
    const thumb = document.createElement("canvas");
    thumb.width = 96;
    thumb.height = 72;
    const tctx = thumb.getContext("2d");
    tctx.fillStyle = "#fff";
    tctx.fillRect(0, 0, thumb.width, thumb.height);
    const ratio = Math.min(thumb.width / image.width, thumb.height / image.height);
    const w = image.width * ratio;
    const h = image.height * ratio;
    tctx.drawImage(image, (thumb.width - w) / 2, (thumb.height - h) / 2, w, h);
    return thumb.toDataURL("image/png");
  }

  function selectLayer(layerId) {
    state.activeLayerId = layerId;
    refreshList();
    render();
  }

  function layerById(layerId) {
    return state.layers.find(layer => layer.id === layerId) || null;
  }

  function addLayerFromImage(image, name = "Layer") {
    if (!canAddLayer()) {
      onStatus?.(`Layer limit reached (${MAX_LAYERS}). Delete one to add another.`);
      return false;
    }
    const fillScale = Math.max(canvas.width / image.width, canvas.height / image.height);
    layerSeed += 1;
    const layer = {
      id: `layer-${layerSeed}`,
      name: truncateName(name),
      image,
      originalImage: image,
      thumbDataUrl: makeThumbDataUrl(image),
      processedCanvas: null,
      wbTemp: 0,
      wbTint: 0,
      wbBright: 0,
      wbSat: 0,
      wbContrast: 0,
      rotationDeg: 0,
      processing: false,
      tuningOpen: false,
      visible: soloLayerId ? false : true,
      shadowEnabled: false,
      x: 0,
      y: 0,
      scale: fillScale,
      baseScale: fillScale,
      flipX: false,
      flipY: false,
      lowResolution: false
    };
    refreshWarnings(layer);
    state.layers.push(layer);
    state.activeLayerId = layer.id;
    refreshList();
    render();
    onStatus?.(`Layer added: ${layer.name}`);
    return true;
  }

  function setRatio(ratio) {
    if (!DOC_PRESETS[ratio]) return;
    state.ratio = ratio;
    updateCanvasSize(state.ratio);
    setChipActive(ratioButtons, button => button.dataset.ratio === ratio);
    render();
    refreshList();
  }

  function exportPngBlob() {
    if (!hasLayers()) throw new Error("No layers to export.");
    render();
    return canvasToBlob(canvas, "image/png");
  }

  function fillSelectedLayer() {
    const layer = activeLayer();
    if (!layer) return false;
    const source = getLayerRenderSource(layer);
    const angle = (layer.rotationDeg || 0) * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const coverScaleX = (canvas.width * cos + canvas.height * sin) / Math.max(1, source.width);
    const coverScaleY = (canvas.width * sin + canvas.height * cos) / Math.max(1, source.height);
    const overscan = 1.01;
    const fill = Math.max(coverScaleX, coverScaleY) * overscan;
    layer.scale = fill;
    layer.x = 0;
    layer.y = 0;
    refreshWarnings(layer);
    refreshList();
    render();
    return true;
  }

  function resetSelectedLayer() {
    const layer = activeLayer();
    if (!layer) return false;
    const original = layer.originalImage || layer.image;
    layer.image = original;
    layer.thumbDataUrl = makeThumbDataUrl(original);
    layer.processedCanvas = null;
    layer.wbTemp = 0;
    layer.wbTint = 0;
    layer.wbBright = 0;
    layer.wbSat = 0;
    layer.wbContrast = 0;
    layer.rotationDeg = 0;
    layer.flipX = false;
    layer.flipY = false;
    layer.shadowEnabled = false;
    const resetScale = Math.max(canvas.width / original.width, canvas.height / original.height);
    layer.baseScale = resetScale;
    layer.scale = resetScale;
    layer.x = 0;
    layer.y = 0;
    refreshWarnings(layer);
    refreshList();
    render();
    return true;
  }

  function getHasSelectedLayer() {
    return !!activeLayer();
  }

  function getSelectedLayer() {
    const layer = activeLayer();
    if (!layer) return null;
    return {
      name: layer.name,
      image: layer.image
    };
  }

  async function exportLayersZipBlob() {
    if (!hasLayers()) throw new Error("No layers to export.");
    const ZipCtor = globalThis.JSZip;
    if (!ZipCtor) throw new Error("ZIP library not loaded.");

    const zip = new ZipCtor();
    const ordered = [...state.layers].reverse();
    for (let index = 0; index < ordered.length; index += 1) {
      const layer = ordered[index];
      const layerCanvas = document.createElement("canvas");
      const source = getLayerRenderSource(layer);
      const angle = (layer.rotationDeg || 0) * Math.PI / 180;
      const cos = Math.abs(Math.cos(angle));
      const sin = Math.abs(Math.sin(angle));
      const outW = Math.max(1, Math.ceil(source.width * cos + source.height * sin));
      const outH = Math.max(1, Math.ceil(source.width * sin + source.height * cos));
      layerCanvas.width = outW;
      layerCanvas.height = outH;
      const lctx = layerCanvas.getContext("2d");
      lctx.save();
      lctx.translate(outW / 2, outH / 2);
      lctx.rotate(angle);
      lctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
      lctx.drawImage(source, -source.width / 2, -source.height / 2);
      lctx.restore();
      const blob = await canvasToBlob(layerCanvas, "image/png");
      const arr = await blob.arrayBuffer();
      const serial = String(index + 1).padStart(2, "0");
      const name = `${serial}_${safeFilenamePart(layer.name)}.png`;
      zip.file(name, arr);
    }
    return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  async function exportParallaxGifBlob(options = {}) {
    if (!hasLayers()) throw new Error("No layers to export.");
    const GifCtor = globalThis.GIF;
    if (!GifCtor) throw new Error("GIF encoder is not loaded.");
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;

    const durationSec = clamp(Number(options.durationSec) || 3, 1, 5);
    const intensity = clamp(Number(options.intensity) || 1, 0.25, 1);
    const qualityPreset = [100, 50, 30].includes(Number(options.qualityPreset))
      ? Number(options.qualityPreset)
      : 50;
    const qualityConfig = PARALLAX_QUALITY_PRESETS[qualityPreset];
    const fps = clamp(Number(options.fps) || 12, 8, 24);
    const loopMode = options.loopMode === "linear" ? "linear" : "pingpong";
    const motionType = ["zoom", "panx", "pany"].includes(options.motionType) ? options.motionType : "zoom";
    const frameCount = Math.max(2, Math.round(durationSec * fps));
    const delay = Math.round(1000 / fps);

    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = Math.max(2, Math.round(canvas.width * qualityConfig.scale));
    frameCanvas.height = Math.max(2, Math.round(canvas.height * qualityConfig.scale));
    const frameCtx = frameCanvas.getContext("2d");
    frameCtx.imageSmoothingEnabled = true;
    frameCtx.imageSmoothingQuality = "high";
    const watermarkImage = await loadParallaxWatermark();

    const gif = new GifCtor({
      workers: 2,
      quality: qualityConfig.quality,
      width: frameCanvas.width,
      height: frameCanvas.height,
      repeat: 0,
      workerScript: "/RetroCut/gif.worker.proxy.js"
    });

    for (let i = 0; i < frameCount; i += 1) {
      const t = frameCount <= 1 ? 0 : i / (frameCount - 1);
      const progress = loopMode === "pingpong"
        ? (t <= 0.5 ? t * 2 : (1 - t) * 2)
        : t;
      frameCtx.save();
      frameCtx.scale(qualityConfig.scale, qualityConfig.scale);
      drawLayers(frameCtx, progress, true, motionType, intensity);
      frameCtx.restore();
      if (watermarkImage) {
        const markW = clamp(Math.round(frameCanvas.width * 0.13), 54, 128);
        const markH = Math.round(markW * (watermarkImage.height / Math.max(1, watermarkImage.width)));
        const pad = clamp(Math.round(frameCanvas.width * 0.01), 6, 12);
        const x = frameCanvas.width - markW - pad;
        const y = frameCanvas.height - markH - pad;
        frameCtx.save();
        frameCtx.globalAlpha = 0.62;
        frameCtx.drawImage(watermarkImage, x, y, markW, markH);
        frameCtx.restore();
      }
      gif.addFrame(frameCanvas, { copy: true, delay });
      onProgress?.({ stage: "render", progress: (i + 1) / frameCount });
    }

    drawLayers(ctx, 0, false);

    return new Promise((resolve, reject) => {
      gif.on("progress", percent => {
        onProgress?.({ stage: "encode", progress: clamp(percent, 0, 1) });
      });
      gif.on("finished", blob => resolve(blob));
      gif.on("abort", () => reject(new Error("GIF render was aborted.")));
      gif.render();
    });
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function pickTopLayerAt(point) {
    for (let index = state.layers.length - 1; index >= 0; index -= 1) {
      const layer = state.layers[index];
      if (!layer.visible) continue;
      const source = getLayerRenderSource(layer);
      const drawW = source.width * layer.scale;
      const drawH = source.height * layer.scale;
      const left = canvas.width / 2 + layer.x - drawW / 2;
      const top = canvas.height / 2 + layer.y - drawH / 2;
      const right = left + drawW;
      const bottom = top + drawH;
      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return layer;
    }
    return activeLayer();
  }

  function pointerDown(event) {
    if (!hasLayers()) return;
    const point = getCanvasPoint(event);
    let picked = activeLayer();
    if (!picked) {
      picked = pickTopLayerAt(point);
    }
    if (!picked) return;
    interaction.dragging = true;
    interaction.pointerId = event.pointerId;
    interaction.startX = point.x;
    interaction.startY = point.y;
    interaction.startLayerX = picked.x;
    interaction.startLayerY = picked.y;
    state.activeLayerId = picked.id;
    canvas.setPointerCapture(event.pointerId);
    refreshList();
    render();
    event.preventDefault();
  }

  function pointerMove(event) {
    if (!interaction.dragging) return;
    const layer = activeLayer();
    if (!layer) return;
    const point = getCanvasPoint(event);
    const dx = point.x - interaction.startX;
    const dy = point.y - interaction.startY;
    layer.x = interaction.startLayerX + dx;
    layer.y = interaction.startLayerY + dy;
    render();
    event.preventDefault();
  }

  function pointerEnd(event) {
    if (!interaction.dragging) return;
    interaction.dragging = false;
    if (interaction.pointerId !== null) {
      canvas.releasePointerCapture(interaction.pointerId);
    }
    interaction.pointerId = null;
    refreshList();
    render();
    event.preventDefault();
  }

  function onWheel(event) {
    const layer = activeLayer();
    if (!layer) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    layer.scale = clamp(layer.scale * factor, 0.04, 12);
    refreshWarnings(layer);
    refreshList();
    render();
  }

  canvas.addEventListener("pointerdown", pointerDown, { passive: false });
  canvas.addEventListener("pointermove", pointerMove, { passive: false });
  canvas.addEventListener("pointerup", pointerEnd, { passive: false });
  canvas.addEventListener("pointercancel", pointerEnd, { passive: false });
  canvas.addEventListener("wheel", onWheel, { passive: false });

  listEl.addEventListener("click", async event => {
    const item = event.target.closest(".layer-item");
    if (!item) return;
    const layerId = item.dataset.layerId;
    const layer = layerById(layerId);
    if (!layer) return;

    if (event.target.closest(".layer-tool-btn")) {
      const button = event.target.closest(".layer-tool-btn");
      state.activeLayerId = layerId;
      if (button.classList.contains("fill")) {
        fillSelectedLayer();
        onStatus?.("Layer filled.");
      } else if (button.classList.contains("reset")) {
        if (resetSelectedLayer()) {
          onStatus?.("Selected layer reset.");
        }
        return;
      } else if (button.classList.contains("delete")) {
        if (layer.id === soloLayerId) clearSolo(true);
        state.layers = state.layers.filter(entry => entry.id !== layerId);
        if (state.activeLayerId === layerId) {
          state.activeLayerId = state.layers[state.layers.length - 1]?.id || null;
        }
        refreshList();
        render();
        return;
      } else if (button.classList.contains("flipx")) {
        layer.flipX = !layer.flipX;
      } else if (button.classList.contains("flipy")) {
        layer.flipY = !layer.flipY;
      } else if (button.classList.contains("shadow")) {
        layer.shadowEnabled = !layer.shadowEnabled;
      } else if (button.classList.contains("cutout")) {
        openLayerBrushEditor(layer).catch((error) => {
          console.error(error);
          onStatus?.("Could not open layer brush editor.");
        });
        return;
      }
      refreshList();
      render();
      return;
    }

    if (event.target.closest(".layer-btn")) {
      const button = event.target.closest(".layer-btn");
      const index = state.layers.findIndex(entry => entry.id === layerId);
      if (button.classList.contains("up") && index < state.layers.length - 1) {
        const swap = state.layers[index + 1];
        state.layers[index + 1] = layer;
        state.layers[index] = swap;
      } else if (button.classList.contains("down") && index > 0) {
        const swap = state.layers[index - 1];
        state.layers[index - 1] = layer;
        state.layers[index] = swap;
      } else if (button.classList.contains("hide")) {
        if (soloLayerId) clearSolo(true);
        layer.visible = !layer.visible;
      } else if (button.classList.contains("solo")) {
        toggleSolo(layerId);
      } else if (button.classList.contains("delete")) {
        if (layer.id === soloLayerId) clearSolo(true);
        state.layers = state.layers.filter(entry => entry.id !== layerId);
        if (state.activeLayerId === layerId) {
          state.activeLayerId = state.layers[state.layers.length - 1]?.id || null;
        }
      }
      refreshList();
      render();
      return;
    }

    if (event.target.closest(".layer-tuning-toggle")) {
      state.activeLayerId = layerId;
      const next = !layer.tuningOpen;
      state.layers.forEach(entry => {
        entry.tuningOpen = entry.id === layerId ? next : false;
      });
      refreshList();
      render();
      return;
    }

    selectLayer(layerId);
  });

  listEl.addEventListener("input", event => {
    const slider = event.target.closest(".layer-wb-slider");
    if (!slider) return;
    const item = event.target.closest(".layer-item");
    if (!item) return;
    const layer = layerById(item.dataset.layerId);
    if (!layer) return;

    if (slider.dataset.kind === "temp") {
      layer.wbTemp = clamp(Number(slider.value) || 0, -WB_LIMIT, WB_LIMIT);
      rebuildLayerProcessed(layer);
    } else if (slider.dataset.kind === "tint") {
      layer.wbTint = clamp(Number(slider.value) || 0, -TINT_LIMIT, TINT_LIMIT);
      rebuildLayerProcessed(layer);
    } else if (slider.dataset.kind === "bright") {
      layer.wbBright = clamp(Number(slider.value) || 0, -BRIGHT_LIMIT, BRIGHT_LIMIT);
      rebuildLayerProcessed(layer);
    } else if (slider.dataset.kind === "sat") {
      layer.wbSat = clamp(Number(slider.value) || 0, -SAT_LIMIT, SAT_LIMIT);
      rebuildLayerProcessed(layer);
    } else if (slider.dataset.kind === "contrast") {
      layer.wbContrast = clamp(Number(slider.value) || 0, -CONTRAST_LIMIT, CONTRAST_LIMIT);
      rebuildLayerProcessed(layer);
    } else if (slider.dataset.kind === "rotate") {
      layer.rotationDeg = clamp(Number(slider.value) || 0, -30, 30);
    }
    render();
  });

  ratioButtons.forEach(button => {
    button.addEventListener("click", () => setRatio(button.dataset.ratio));
  });

  updateCanvasSize(state.ratio);
  setChipActive(ratioButtons, button => button.dataset.ratio === state.ratio);
  refreshList();
  render();

  return {
    addLayerFromImage,
    exportPngBlob,
    exportLayersZipBlob,
    exportParallaxGifBlob,
    fillSelectedLayer,
    resetSelectedLayer,
    getSelectedLayer,
    getHasLayers: hasLayers,
    getLayerCount,
    getRatio,
    getHasSelectedLayer,
    getCanAddLayer: canAddLayer,
    getMaxLayers,
    setRatio
  };
}
