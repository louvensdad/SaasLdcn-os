/** Reads a user-picked image file and returns a small, square-ish JPEG data URL
 * suitable for an inline profile avatar. Resizing happens entirely in the
 * browser (canvas) so the backend only ever stores a capped ~a few-KB image,
 * never the original multi-MB upload. Rejects non-images up front. */
export async function readImageAsAvatarDataUrl(file: File, maxSize = 256): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('unsupported-file-type');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas-unavailable');
    ctx.drawImage(image, 0, 0, width, height);

    // JPEG at 0.85 keeps a 256px avatar well under the server's ~300 KB cap.
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image-decode-failed'));
    image.src = src;
  });
}
