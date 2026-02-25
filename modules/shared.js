export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image."));
    };
    image.src = url;
  });
}

export function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image from blob."));
    };
    image.src = url;
  });
}

export function constrainImageLongSide(source, maxLongSide = 4096) {
  const srcW = Math.max(1, Number(source?.naturalWidth || source?.width || 0));
  const srcH = Math.max(1, Number(source?.naturalHeight || source?.height || 0));
  const maxSide = Math.max(1, Number(maxLongSide) || 4096);
  const longSide = Math.max(srcW, srcH);
  if (longSide <= maxSide) {
    return {
      image: source,
      resized: false,
      width: srcW,
      height: srcH,
      originalWidth: srcW,
      originalHeight: srcH
    };
  }

  const scale = maxSide / longSide;
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, targetW, targetH);

  return {
    image: canvas,
    resized: true,
    width: targetW,
    height: targetH,
    originalWidth: srcW,
    originalHeight: srcH
  };
}

export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Canvas export returned null blob."));
      resolve(blob);
    }, type, quality);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
