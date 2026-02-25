import { createEditor } from "./modules/editor.js";
import { createCutoutTool } from "./modules/cutout.js";
import { createLayersTool } from "./modules/layers.js";
import { constrainImageLongSide, downloadBlob, loadImageFromBlob, loadImageFromFile } from "./modules/shared.js";

const statusPill = document.getElementById("statusPill");

// Shared image controls
const fileInput = document.getElementById("fileInput");
const pasteImageBtn = document.getElementById("pasteImageBtn");
const fileNameText = document.getElementById("fileNameText");
const exportMenuWrap = document.getElementById("exportMenuWrap");
const downloadEditorBtn = document.getElementById("downloadEditorBtn");

// Mode UI
const modeTabs = Array.from(document.querySelectorAll(".mode-tab"));
const editPanel = document.getElementById("editPanel");
const cutoutPanel = document.getElementById("cutoutPanel");
const layersPanel = document.getElementById("layersPanel");
const editorDropZone = document.getElementById("editorDropZone");
const cutoutWrap = document.getElementById("cutoutWrap");
const layersWrap = document.getElementById("layersWrap");
const canvasStack = document.querySelector(".canvas-stack");
const modelBarCanvas = document.getElementById("modelBarCanvas");
const canvasArea = document.querySelector(".canvas-area");

// Editor DOM
const editorCanvas = document.getElementById("editorCanvas");
const orientationButtons = Array.from(document.querySelectorAll("#orientationChips .chip-btn"));
const styleButtons = Array.from(document.querySelectorAll("#styleChips .chip-btn"));
const intensitySlider = document.getElementById("intensity");
const intensityValue = document.getElementById("intensityValue");
const roundnessSlider = document.getElementById("roundness");
const roundnessValue = document.getElementById("roundnessValue");
const noiseSlider = document.getElementById("noise");
const noiseValue = document.getElementById("noiseValue");
const fillBtn = document.getElementById("fillBtn");
const resetEditBtn = document.getElementById("resetEditBtn");
const sendToLayersBtn = document.getElementById("sendToLayersBtn");
const btnImportLayersComposition = document.getElementById("btnImportLayersComposition");

// Cutout DOM
const cutoutCanvas = document.getElementById("cutoutCanvas");
const overlayMsg = document.getElementById("overlayMsg");
const brushPreview = document.getElementById("brushPreview");
const cutoutBgButtons = Array.from(document.querySelectorAll("[data-cutout-bg]"));
const modelNoteEl = document.getElementById("modelNote");
const btnReloadModel = document.getElementById("btnReloadModel");
const modelDot = document.getElementById("modelDot");
const btnRemove = document.getElementById("btnRemove");
const btnRemoveChroma = document.getElementById("btnRemoveChroma");
const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const brushValueEl = document.getElementById("brushValue");
const brushSizeEl = document.getElementById("brushSize");
const aiStrengthEl = document.getElementById("aiStrength");
const aiStrengthValueEl = document.getElementById("aiStrengthValue");
const modeEraseBtn = document.getElementById("modeErase");
const modeRestoreBtn = document.getElementById("modeRestore");
const viewModeBrushBtn = document.getElementById("viewModeBrush");
const viewModeMoveBtn = document.getElementById("viewModeMove");
const btnApplyCutout = document.getElementById("btnApplyCutout");
const btnSendCutoutToLayers = document.getElementById("btnSendCutoutToLayers");
const btnResetCutout = document.getElementById("btnResetCutout");
const exportModeButtons = Array.from(document.querySelectorAll("[data-export-mode]"));

// Layers DOM
const layersCanvas = document.getElementById("layersCanvas");
const layersCanvasWrap = document.getElementById("layersCanvasWrap");
const layersList = document.getElementById("layersList");
const layersOverlayMsg = document.getElementById("layersOverlayMsg");
const btnLayersAdd = document.getElementById("btnLayersAdd");
const layersRatioButtons = Array.from(document.querySelectorAll("#layersRatioChips .chip-btn"));
const btnAddCompositionLayer = document.getElementById("btnAddCompositionLayer");
const btnDownloadLayersZip = document.getElementById("btnDownloadLayersZip");
const btnParallaxToggle = document.getElementById("btnParallaxToggle");
const parallaxPanelBody = document.getElementById("parallaxPanelBody");
const parallaxDuration = document.getElementById("parallaxDuration");
const parallaxDurationValue = document.getElementById("parallaxDurationValue");
const parallaxIntensity = document.getElementById("parallaxIntensity");
const parallaxIntensityValue = document.getElementById("parallaxIntensityValue");
const parallaxQualityPreset = document.getElementById("parallaxQualityPreset");
const parallaxFps = document.getElementById("parallaxFps");
const parallaxLoopMode = document.getElementById("parallaxLoopMode");
const parallaxMotionType = document.getElementById("parallaxMotionType");
const btnExportParallaxGif = document.getElementById("btnExportParallaxGif");
const parallaxActionLabel = document.getElementById("parallaxActionLabel");
const parallaxPreviewOverlay = document.getElementById("parallaxPreviewOverlay");
const parallaxPreviewImage = document.getElementById("parallaxPreviewImage");
const btnSaveParallaxGif = document.getElementById("btnSaveParallaxGif");
const btnCloseParallaxPreview = document.getElementById("btnCloseParallaxPreview");

let currentMode = "layers";
let sourceFileName = "";
let sourceImage = null;
let cutoutImage = null;
let layers = null;
let isParallaxExporting = false;
let cutoutHasContext = false;
let cutoutBgMode = "checker";
const PARALLAX_EXPORT_LABEL = "Create Parallax Animation";
const MAX_IMPORT_LONG_SIDE = 4096;
let parallaxPreviewBlob = null;
let parallaxPreviewUrl = "";
let lockedRetroOrientation = null;

function setStatus(text) {
  if (statusPill) statusPill.textContent = text;
}

function setRetroOrientationUI(orientation) {
  orientationButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.orientation === orientation);
  });
}

function setRetroOrientationLock(orientationOrNull) {
  lockedRetroOrientation = orientationOrNull || null;
  const locked = !!lockedRetroOrientation;
  orientationButtons.forEach((button) => {
    button.disabled = locked;
    button.title = locked ? "Aspect ratio locked to imported Layers composition." : "";
  });
  if (lockedRetroOrientation) {
    editor.setOrientation(lockedRetroOrientation);
    setRetroOrientationUI(lockedRetroOrientation);
  }
}

function setCutoutPreviewBackground(mode) {
  if (!cutoutWrap) return;
  if (mode === "context" && !cutoutHasContext) mode = "checker";
  cutoutBgMode = mode;
  cutoutWrap.dataset.bg = mode;
  cutoutBgButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.cutoutBg === mode);
  });
  cutout.setReferenceVisible(mode === "context" && cutoutHasContext);
}

function setCutoutContextAvailability(enabled) {
  cutoutHasContext = !!enabled;
  const contextBtn = cutoutBgButtons.find((btn) => btn.dataset.cutoutBg === "context");
  if (contextBtn) contextBtn.hidden = !cutoutHasContext;
  if (!cutoutHasContext && cutoutBgMode === "context") {
    setCutoutPreviewBackground("checker");
    return;
  }
  setCutoutPreviewBackground(cutoutBgMode);
}

function setMode(mode) {
  currentMode = mode;
  const inEdit = mode === "edit";
  const inCutout = mode === "cutout";
  const inLayers = mode === "layers";

  modeTabs.forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  editPanel.hidden = !inEdit;
  cutoutPanel.hidden = !inCutout;
  layersPanel.hidden = !inLayers;
  if (exportMenuWrap) exportMenuWrap.hidden = inLayers;
  editorDropZone.hidden = !inEdit;
  cutoutWrap.hidden = !inCutout;
  layersWrap.hidden = !inLayers;
  if (modelBarCanvas) modelBarCanvas.hidden = !inCutout;
  editorDropZone.setAttribute("aria-hidden", inEdit ? "false" : "true");
  cutoutWrap.setAttribute("aria-hidden", inCutout ? "false" : "true");
  layersWrap.setAttribute("aria-hidden", inLayers ? "false" : "true");
  if (canvasArea) {
    canvasArea.classList.toggle("is-edit", inEdit);
    canvasArea.classList.toggle("is-cutout", inCutout);
    canvasArea.classList.toggle("is-layers", inLayers);
  }

  if (canvasStack) {
    canvasStack.classList.toggle("is-edit", inEdit);
    canvasStack.classList.toggle("is-cutout", inCutout);
    canvasStack.classList.toggle("is-layers", inLayers);
  }

  if (exportModeButtons.length > 0) {
    exportModeButtons.forEach((button) => {
      const targetMode = button.dataset.exportMode;
      button.hidden = targetMode !== mode;
    });
  }

  if (inEdit) {
    setStatus("Retro mode: tweak style + export PNG.");
  } else if (inCutout) {
    setStatus("BGone mode: remove + refine cutout.");
  } else {
    setStatus("Layers mode: build composites and export in video-friendly sizes.");
  }
  syncDownloadButton();
}

const editor = createEditor({
  canvas: editorCanvas,
  dropZone: editorDropZone,
  orientationButtons,
  styleButtons,
  intensitySlider,
  intensityValue,
  roundnessSlider,
  roundnessValue,
  noiseSlider,
  noiseValue,
  fillBtn
});

const cutout = createCutoutTool({
  canvas: cutoutCanvas,
  canvasWrap: cutoutWrap,
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
  onStatus: setStatus
});

layers = createLayersTool({
  canvas: layersCanvas,
  canvasWrap: layersCanvasWrap,
  listEl: layersList,
  overlayEl: layersOverlayMsg,
  ratioButtons: layersRatioButtons,
  onStatus: setStatus,
  onSendLayerToCutout: async ({ subjectBlob, contextBlob, layerName }) => {
    const subjectImage = await loadImageFromBlob(subjectBlob);
    await cutout.setImage(subjectImage, `${layerName || "layer"}-bgone.png`);
    sourceImage = subjectImage;
    sourceFileName = `${layerName || "layer"}-bgone.png`;
    fileNameText.textContent = sourceFileName;
    cutoutImage = null;

    if (contextBlob) {
      const contextImage = await loadImageFromBlob(contextBlob);
      cutout.setReferenceBackground(contextImage);
      setCutoutContextAvailability(true);
      setCutoutPreviewBackground("context");
    } else {
      cutout.setReferenceBackground(null);
      setCutoutContextAvailability(false);
      setCutoutPreviewBackground("checker");
    }

    setButtonsForImageLoaded(true);
    setMode("cutout");
    setStatus("Layer sent to BGone with context preview.");
  },
  onChange: () => {
    if (!layers) return;
    syncDownloadButton();
    syncLayersActionButtons();
  }
});

function syncDownloadButton() {
  if (currentMode === "layers") {
    downloadEditorBtn.disabled = !layers.getHasLayers();
  } else {
    downloadEditorBtn.disabled = !editor.getHasImage();
  }
}

function syncLayersActionButtons() {
  if (!layers) return;
  const hasLayers = layers.getHasLayers();
  const layerCount = layers.getLayerCount();
  const canParallax = layerCount >= 2;
  const canAddLayer = layers.getCanAddLayer();
  if (btnAddCompositionLayer) btnAddCompositionLayer.disabled = !hasLayers || !canAddLayer;
  if (btnImportLayersComposition) btnImportLayersComposition.disabled = !hasLayers;
  btnDownloadLayersZip.disabled = !hasLayers;
  if (btnExportParallaxGif) {
    btnExportParallaxGif.disabled = isParallaxExporting || !canParallax;
    btnExportParallaxGif.title = canParallax
      ? "Export layered parallax GIF"
      : "Parallax needs at least 2 layers";
  }
  if (parallaxDuration) parallaxDuration.disabled = !canParallax;
  if (parallaxIntensity) parallaxIntensity.disabled = !canParallax;
  if (parallaxQualityPreset) parallaxQualityPreset.disabled = !canParallax;
  if (parallaxFps) parallaxFps.disabled = !canParallax;
  if (parallaxLoopMode) parallaxLoopMode.disabled = !canParallax;
  if (parallaxMotionType) parallaxMotionType.disabled = !canParallax;
  if (btnLayersAdd) btnLayersAdd.disabled = !canAddLayer;
  if (currentMode === "edit" && sendToLayersBtn) {
    sendToLayersBtn.disabled = !editor.getHasImage() || !canAddLayer;
  }
  if (currentMode === "cutout" && btnSendCutoutToLayers) {
    btnSendCutoutToLayers.disabled = !sourceImage || !canAddLayer;
  }
}

function showLayerLimitPopup() {
  const max = layers?.getMaxLayers?.() || 6;
  window.alert(`Maximum layers reached (${max}). Delete a layer before adding more.`);
}

function setParallaxActionLabel(text) {
  if (parallaxActionLabel) {
    parallaxActionLabel.textContent = text;
  } else if (btnExportParallaxGif) {
    btnExportParallaxGif.textContent = text;
  }
}

function setParallaxPanelOpen(open) {
  if (!btnParallaxToggle || !parallaxPanelBody) return;
  btnParallaxToggle.classList.toggle("is-open", open);
  btnParallaxToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    parallaxPanelBody.hidden = false;
    requestAnimationFrame(() => parallaxPanelBody.classList.add("is-open"));
  } else {
    parallaxPanelBody.classList.remove("is-open");
    setTimeout(() => {
      if (!parallaxPanelBody.classList.contains("is-open")) parallaxPanelBody.hidden = true;
    }, 220);
  }
}

btnParallaxToggle?.addEventListener("click", () => {
  const nextOpen = !parallaxPanelBody || parallaxPanelBody.hidden;
  setParallaxPanelOpen(nextOpen);
});

function closeParallaxPreview() {
  if (!parallaxPreviewOverlay) return;
  parallaxPreviewOverlay.hidden = true;
  if (parallaxPreviewImage) parallaxPreviewImage.removeAttribute("src");
  if (parallaxPreviewUrl) URL.revokeObjectURL(parallaxPreviewUrl);
  parallaxPreviewUrl = "";
  parallaxPreviewBlob = null;
}

function openParallaxPreview(blob) {
  if (!parallaxPreviewOverlay || !parallaxPreviewImage) return;
  if (parallaxPreviewUrl) URL.revokeObjectURL(parallaxPreviewUrl);
  parallaxPreviewBlob = blob;
  parallaxPreviewUrl = URL.createObjectURL(blob);
  parallaxPreviewImage.src = parallaxPreviewUrl;
  parallaxPreviewOverlay.hidden = false;
}

function setButtonsForImageLoaded(loaded) {
  const canAddLayer = layers?.getCanAddLayer?.() ?? false;
  const hasLayers = layers?.getHasLayers?.() ?? false;
  syncDownloadButton();
  resetEditBtn.disabled = !loaded;
  sendToLayersBtn.disabled = !loaded || !canAddLayer;
  if (btnImportLayersComposition) btnImportLayersComposition.disabled = !hasLayers;
  btnApplyCutout.disabled = !loaded;
  btnSendCutoutToLayers.disabled = !loaded || !canAddLayer;
  btnResetCutout.disabled = !loaded;
  cutout.setEnabled(loaded);
  syncLayersActionButtons();
}

async function loadNewFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Please choose an image file.");
    return;
  }

  sourceFileName = file.name || "";
  fileNameText.textContent = sourceFileName || "Image loaded.";

  try {
    const loadedImage = await loadImageFromFile(file);
    const limited = constrainImageLongSide(loadedImage, MAX_IMPORT_LONG_SIDE);
    sourceImage = limited.image;
    setRetroOrientationLock(null);
    cutoutImage = null;
    editor.setImage(sourceImage);
    await cutout.setImage(sourceImage, sourceFileName);
    cutout.setReferenceBackground(null);
    setCutoutContextAvailability(false);
    setCutoutPreviewBackground("checker");
    setButtonsForImageLoaded(true);
    if (limited.resized) {
      setStatus(`Image loaded and resized to ${limited.width}x${limited.height} (4K max).`);
    } else {
      setStatus(`Image loaded: ${sourceFileName}`);
    }
  } catch (err) {
    console.error(err);
    setButtonsForImageLoaded(false);
    setStatus("Could not load image.");
  }
}

async function addFileAsLayer(file) {
  if (!file) return;
  if (!layers.getCanAddLayer()) {
    const max = layers.getMaxLayers?.() || 6;
    setStatus(`Layer limit reached (${max}). Delete one to add another.`);
    showLayerLimitPopup();
    return;
  }
  if (!file.type.startsWith("image/")) {
    setStatus("Please choose an image file.");
    return;
  }
  try {
    const loadedImage = await loadImageFromFile(file);
    const limited = constrainImageLongSide(loadedImage, MAX_IMPORT_LONG_SIDE);
    const image = limited.image;
    const added = layers.addLayerFromImage(image, file.name || "layer");
    if (added) {
      setMode("layers");
      if (limited.resized) {
        setStatus(`Layer added and resized to ${limited.width}x${limited.height} (4K max).`);
      }
    }
  } catch (err) {
    console.error(err);
    setStatus("Could not add image as layer.");
  }
}

function handleImageInputByMode(file) {
  if (!file) return;
  if (currentMode === "layers") {
    addFileAsLayer(file);
  } else {
    loadNewFile(file);
  }
}

async function readClipboardImageAsFile() {
  if (!navigator.clipboard?.read) {
    throw new Error("Clipboard image access is not available in this browser.");
  }

  const items = await navigator.clipboard.read();
  for (const item of items) {
    const imageType = item.types.find(type => type.startsWith("image/"));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    const ext = imageType.split("/")[1] || "png";
    return new File([blob], `clipboard-image.${ext}`, { type: imageType });
  }
  return null;
}

function readImageFileFromPasteItems(items) {
  if (!items) return null;
  for (const item of items) {
    if (!item.type?.startsWith("image/")) continue;
    const blob = item.getAsFile?.();
    if (!blob) continue;
    const ext = item.type.split("/")[1] || "png";
    return new File([blob], `clipboard-image.${ext}`, { type: item.type });
  }
  return null;
}

async function pasteImageFromClipboard() {
  // Try direct paste command path first (some browsers allow this under user gesture).
  const sink = document.createElement("div");
  sink.contentEditable = "true";
  sink.setAttribute("aria-hidden", "true");
  sink.style.position = "fixed";
  sink.style.left = "-9999px";
  sink.style.top = "0";
  sink.style.opacity = "0";
  document.body.appendChild(sink);

  const pastedFile = await new Promise((resolve) => {
    let done = false;
    const finish = (file) => {
      if (done) return;
      done = true;
      resolve(file || null);
    };

    const onPaste = (event) => {
      const file = readImageFileFromPasteItems(event.clipboardData?.items);
      if (file) {
        event.preventDefault();
        finish(file);
      }
    };

    sink.addEventListener("paste", onPaste, { once: true });
    sink.focus();

    try {
      document.execCommand("paste");
    } catch (error) {
      // Ignore and fallback below.
    }

    setTimeout(() => finish(null), 120);
  });

  sink.remove();
  if (pastedFile) return pastedFile;

  // Fallback to Async Clipboard API.
  return readClipboardImageAsFile();
}

fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  handleImageInputByMode(file);
});

pasteImageBtn?.addEventListener("click", async () => {
  try {
    const file = await pasteImageFromClipboard();
    if (!file) {
      setStatus("Clipboard has no image.");
      return;
    }
    handleImageInputByMode(file);
  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Could not read image from clipboard.");
  }
});

// Drag-and-drop for both canvases
function attachDropTarget(el, onDropFile, highlightEl = editorDropZone) {
  ["dragenter", "dragover"].forEach(ev => {
    el.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      highlightEl.classList.add("dragover");
    }, { passive: false });
  });
  ["dragleave", "dragend", "drop"].forEach(ev => {
    el.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      highlightEl.classList.remove("dragover");
    }, { passive: false });
  });
  el.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    onDropFile(file);
  }, { passive: false });
}

attachDropTarget(editorDropZone, loadNewFile, editorDropZone);
attachDropTarget(cutoutWrap, loadNewFile, editorDropZone);
attachDropTarget(layersWrap, addFileAsLayer, layersCanvasWrap);

// Paste support (same as BGone)
document.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      handleImageInputByMode(file);
      e.preventDefault();
      break;
    }
  }
});

modeTabs.forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

btnResetCutout.addEventListener("click", () => {
  cutout.resetMask();
});

resetEditBtn.addEventListener("click", () => {
  if (!editor.getHasImage()) return;
  editor.resetEditorState();
  if (lockedRetroOrientation) {
    editor.setOrientation(lockedRetroOrientation);
    setRetroOrientationUI(lockedRetroOrientation);
  }
  setStatus("Retro settings reset.");
});

btnApplyCutout.addEventListener("click", async () => {
  if (!sourceImage) return;
  try {
    setStatus("Generating cutout…");
    const blob = await cutout.exportCutoutBlob();
    cutoutImage = await loadImageFromBlob(blob);
    editor.setImage(cutoutImage);
    setMode("edit");
    setStatus("Cutout applied. Continue in Retro or download PNG.");
  } catch (err) {
    console.error(err);
    setStatus("Could not apply cutout.");
  }
});

sendToLayersBtn.addEventListener("click", async () => {
  if (!editor.getHasImage()) return;
  if (!layers.getCanAddLayer()) {
    const max = layers.getMaxLayers?.() || 6;
    setStatus(`Layer limit reached (${max}). Delete one to add another.`);
    showLayerLimitPopup();
    return;
  }
  try {
    setStatus("Preparing edited image as new layer...");
    const blob = await editor.exportInnerPngBlob();
    const editedImage = await loadImageFromBlob(blob);
    const added = layers.addLayerFromImage(editedImage, `${(sourceFileName || "retrocut").replace(/\.[^.]+$/, "")}-edit`);
    if (added) setMode("layers");
  } catch (err) {
    console.error(err);
    setStatus("Could not send image to Layers.");
  }
});

btnSendCutoutToLayers.addEventListener("click", async () => {
  if (!sourceImage) return;
  if (!layers.getCanAddLayer()) {
    const max = layers.getMaxLayers?.() || 6;
    setStatus(`Layer limit reached (${max}). Delete one to add another.`);
    showLayerLimitPopup();
    return;
  }
  try {
    setStatus("Preparing cutout as new layer...");
    const blob = await cutout.exportCutoutBlob();
    const image = await loadImageFromBlob(blob);
    const added = layers.addLayerFromImage(image, `${(sourceFileName || "retrocut").replace(/\.[^.]+$/, "")}-cutout`);
    if (added) setMode("layers");
  } catch (err) {
    console.error(err);
    setStatus("Could not send cutout to Layers.");
  }
});

btnLayersAdd?.addEventListener("click", () => {
  setMode("layers");
  fileInput.click();
});

btnAddCompositionLayer?.addEventListener("click", async () => {
  if (!layers.getHasLayers()) return;
  if (!layers.getCanAddLayer()) {
    const max = layers.getMaxLayers?.() || 6;
    setStatus(`Layer limit reached (${max}). Delete one to add another.`);
    showLayerLimitPopup();
    return;
  }
  try {
    setStatus("Creating composition layer...");
    const blob = await layers.exportPngBlob();
    const image = await loadImageFromBlob(blob);
    const added = layers.addLayerFromImage(image, "composition");
    if (added) {
      setMode("layers");
      setStatus("Composition added as new layer.");
    }
  } catch (err) {
    console.error(err);
    setStatus("Could not add composition as layer.");
  }
});

async function importLayersCompositionToRetro() {
  if (!layers.getHasLayers()) return;
  try {
    setStatus("Preparing composition for Retro...");
    const blob = await layers.exportPngBlob();
    const image = await loadImageFromBlob(blob);
    const layersRatio = layers.getRatio?.() || "landscape43";
    setRetroOrientationLock(layersRatio);
    editor.setImage(image);
    sourceImage = image;
    sourceFileName = "layers-composition.png";
    fileNameText.textContent = sourceFileName;
    setButtonsForImageLoaded(true);
    setMode("edit");
    setStatus("Composition sent to Retro.");
  } catch (err) {
    console.error(err);
    setStatus("Could not send composition to Retro.");
  }
}

btnImportLayersComposition?.addEventListener("click", importLayersCompositionToRetro);

btnDownloadLayersZip.addEventListener("click", async () => {
  if (!layers.getHasLayers()) return;
  try {
    setStatus("Preparing layers ZIP...");
    const zipBlob = await layers.exportLayersZipBlob();
    downloadBlob(zipBlob, "retrocut-layers.zip");
    setStatus("Downloaded layers ZIP.");
  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Could not export layers ZIP.");
  }
});

if (parallaxDuration && parallaxDurationValue) {
  const syncDurationLabel = () => {
    parallaxDurationValue.textContent = `${parallaxDuration.value}s`;
  };
  parallaxDuration.addEventListener("input", syncDurationLabel);
  syncDurationLabel();
}

if (parallaxIntensity && parallaxIntensityValue) {
  const syncIntensityLabel = () => {
    parallaxIntensityValue.textContent = `${parallaxIntensity.value}%`;
  };
  parallaxIntensity.addEventListener("input", syncIntensityLabel);
  syncIntensityLabel();
}

btnExportParallaxGif?.addEventListener("click", async () => {
  if (isParallaxExporting) return;
  if (!layers.getHasLayers()) return;
  if (layers.getLayerCount() < 2) {
    setStatus("Parallax needs at least 2 layers.");
    return;
  }
  const durationSec = Number(parallaxDuration?.value || 3);
  const intensity = Number(parallaxIntensity?.value || 100) / 100;
  const qualityPreset = Number(parallaxQualityPreset?.value || 50);
  const fps = Number(parallaxFps?.value || 12);
  const loopMode = parallaxLoopMode?.value === "linear" ? "linear" : "pingpong";
  const motionType = parallaxMotionType?.value || "zoom";
  let lastProgressBucket = -1;
  try {
    isParallaxExporting = true;
    setStatus("Rendering parallax GIF...");
    btnExportParallaxGif.disabled = true;
    setParallaxActionLabel("Preparing...");
    const gifBlob = await layers.exportParallaxGifBlob({
      durationSec,
      intensity,
      qualityPreset,
      fps,
      loopMode,
      motionType,
      onProgress: ({ stage, progress }) => {
        const bucket = Math.floor((progress * 100) / 5) * 5;
        if (bucket === lastProgressBucket) return;
        lastProgressBucket = bucket;
        if (stage === "render") {
          setStatus(`Rendering frames... ${Math.round(progress * 100)}%`);
          setParallaxActionLabel(`Rendering... ${Math.round(progress * 100)}%`);
        } else {
          setStatus(`Encoding GIF... ${Math.round(progress * 100)}%`);
          setParallaxActionLabel(`Encoding... ${Math.round(progress * 100)}%`);
        }
      }
    });
    openParallaxPreview(gifBlob);
    setStatus("Parallax animation ready.");
  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Could not export parallax GIF.");
  } finally {
    isParallaxExporting = false;
    setParallaxActionLabel(PARALLAX_EXPORT_LABEL);
    syncLayersActionButtons();
  }
});

btnSaveParallaxGif?.addEventListener("click", () => {
  if (!parallaxPreviewBlob) return;
  downloadBlob(parallaxPreviewBlob, "retrocut-parallax.gif");
});

btnCloseParallaxPreview?.addEventListener("click", () => {
  closeParallaxPreview();
});

parallaxPreviewOverlay?.addEventListener("click", (event) => {
  if (event.target === parallaxPreviewOverlay) closeParallaxPreview();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && parallaxPreviewOverlay && !parallaxPreviewOverlay.hidden) {
    closeParallaxPreview();
  }
});

downloadEditorBtn.addEventListener("click", async () => {
  if (currentMode === "layers") {
    if (!layers.getHasLayers()) return;
    try {
      setStatus("Preparing layered export…");
      const blob = await layers.exportPngBlob();
      downloadBlob(blob, "retrocut-layers.png");
      setStatus("Downloaded layered PNG.");
    } catch (err) {
      console.error(err);
      setStatus("Could not export layers.");
    }
    return;
  }

  if (!editor.getHasImage()) return;
  try {
    setStatus("Preparing export…");
    const blob = await editor.exportInnerPngBlob();
    const base = (sourceFileName || "retrocut").replace(/\.[^.]+$/, "");
    downloadBlob(blob, `${base}-retrocut.png`);
    setStatus("Downloaded PNG.");
  } catch (err) {
    console.error(err);
    setStatus("Could not export PNG.");
  }
});

// Init
setButtonsForImageLoaded(false);
cutoutBgButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setCutoutPreviewBackground(btn.dataset.cutoutBg || "checker");
  });
});
setCutoutContextAvailability(false);
setCutoutPreviewBackground("checker");
setMode("layers");
