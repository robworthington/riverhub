// Browser-side photo cleaning. Drawing a photo onto a canvas and re-encoding it keeps the pixels but
// drops every bit of metadata: GPS position, camera serial number, timestamps. So River Hub never
// stores, and never could publish, where someone was standing when they took a photo. The browser
// applies the photo's rotation flag first, so portrait shots stay upright.

export type CleanedImage = { blob: Blob; width: number; height: number };

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older browsers: fall back to an <img> element (also orientation-aware in current browsers).
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Resize so the longer edge is at most `maxEdge` px, re-encode as JPEG, and strip all metadata. */
export async function cleanImage(file: File, maxEdge: number, quality = 0.85): Promise<CleanedImage> {
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await decode(file);
  } catch {
    throw new Error("This browser can't read that photo. Try a JPEG or PNG (on an iPhone, choose Most Compatible in Camera settings, or share it as a JPEG).");
  }
  const w0 = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h0 = "naturalHeight" in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  const width = Math.round(w0 * scale);
  const height = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the photo in this browser.");
  ctx.drawImage(src, 0, 0, width, height);
  if ("close" in src) src.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't process the photo in this browser.");
  return { blob, width, height };
}
