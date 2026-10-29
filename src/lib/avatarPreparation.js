/**
 * Avatar image preparation helper (B3.1).
 *
 * Resizes and compresses user-selected avatar images client-side before upload:
 * - Accepts supported raster formats (JPEG, PNG, WebP) verified by magic bytes.
 * - Rejects SVG, HTML, arbitrary files, and corrupt/undecodable images.
 * - Enforces source file size limit of 8 MiB (8,388,608 bytes).
 * - Enforces dimension safety check: rejects images > 16 megapixels before allocating canvas.
 * - Resizes to fit within 512×512 bounding box, preserves aspect ratio, never upscales.
 * - Compresses output to <= 1 MiB (1,048,576 bytes) compatible with avatars bucket rules.
 * - Bounded compression iterations (max 4 quality steps); fails clearly if limit cannot be met.
 * - Handles EXIF orientation via browser-native imageOrientation: 'from-image'.
 * - Generates matching filename extension and MIME type without trusting original extension.
 * - Releases temporary object URLs, ImageBitmap instances, and canvas buffers.
 * - Never persists source image contents or logs sensitive image data.
 *
 * Browser EXIF Orientation Limitation:
 * Modern browsers (Chrome 52+, Firefox 93+, Safari 15+, Edge 79+) support EXIF orientation
 * automatically via `createImageBitmap(blob, { imageOrientation: 'from-image' })` or `image.decode()`.
 * In legacy environments lacking the `imageOrientation` dictionary option, images are drawn in their
 * baseline storage orientation. Per zero-dependency requirements, no external EXIF parser is bundled.
 */

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // 8 MiB
export const MAX_SOURCE_PIXELS = 16 * 1024 * 1024; // 16 Megapixels (16,777,216 pixels)
export const MAX_OUTPUT_DIMENSION = 512; // 512×512 bounding box
export const MAX_OUTPUT_BYTES = 1048576; // 1 MiB (avatars bucket upload limit)
export const COMPRESSION_QUALITIES = [0.85, 0.70, 0.50, 0.35];

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Validates binary signature (magic bytes) to accept only real JPEG, PNG, or WebP rasters.
 * Rejects SVGs, HTML, text, executables, or disguised files.
 */
export async function detectRasterMimeType(file) {
  if (!file || typeof file.slice !== 'function') return null;
  try {
    const slice = file.slice(0, 12);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 4) return null;

    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes.length >= 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 &&
        bytes[2] === 0x4E && bytes[3] === 0x47 &&
        bytes[4] === 0x0D && bytes[5] === 0x0A &&
        bytes[6] === 0x1A && bytes[7] === 0x0A) {
      return 'image/png';
    }

    // WebP: RIFF ???? WEBP
    if (bytes.length >= 12) {
      const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (riff === 'RIFF' && webp === 'WEBP') {
        return 'image/webp';
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Calculates target dimensions fitting within maxDimension × maxDimension.
 * Preserves aspect ratio and never upscales images smaller than maxDimension.
 */
export function calculateTargetDimensions(sourceWidth, sourceHeight, maxDimension = MAX_OUTPUT_DIMENSION) {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Invalid source dimensions.');
  }

  // Do not upscale if both dimensions are within the maximum limit
  if (sourceWidth <= maxDimension && sourceHeight <= maxDimension) {
    return {
      width: Math.round(sourceWidth),
      height: Math.round(sourceHeight),
    };
  }

  const ratio = Math.min(maxDimension / sourceWidth, maxDimension / sourceHeight);
  const targetWidth = Math.max(1, Math.round(sourceWidth * ratio));
  const targetHeight = Math.max(1, Math.round(sourceHeight * ratio));

  return {
    width: targetWidth,
    height: targetHeight,
  };
}

/**
 * Encodes canvas to blob with bounded fallback across environment APIs.
 */
export async function encodeCanvasToBlob(canvas, mimeType, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return await canvas.convertToBlob({ type: mimeType, quality });
  }

  if (typeof canvas.toBlob === 'function') {
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob encoding failed.'));
        },
        mimeType,
        quality
      );
    });
  }

  throw new Error('No canvas blob encoding API available in current environment.');
}

/**
 * Prepares an avatar image file before upload.
 * Performs validation, dimension scaling (max 512×512, no upscaling), EXIF orientation,
 * and bounded compression (<= 1 MiB).
 *
 * @param {Blob|File} file Source image selected by user
 * @param {Object} [options] Injection hooks for testing
 * @returns {Promise<{ file: File|null, error: string|null }>}
 */
export async function prepareAvatarImage(file, {
  createBitmap = typeof createImageBitmap === 'function' ? createImageBitmap : null,
  ImageConstructor = typeof Image !== 'undefined' ? Image : null,
  createCanvas = null,
} = {}) {
  // 1. Basic type and existence check
  if (!file || typeof file.size !== 'number' || typeof file.slice !== 'function') {
    return { file: null, error: 'Choose an image file.' };
  }

  // 2. Source file size bound (8 MiB)
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { file: null, error: 'Choose a valid image file.' };
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { file: null, error: 'Choose a photo up to 8 MB.' };
  }

  // 3. Supported raster type validation via magic bytes (rejects SVG and arbitrary non-rasters)
  const sourceRasterMime = await detectRasterMimeType(file);
  if (!sourceRasterMime) {
    return { file: null, error: 'Choose a JPEG, PNG or WebP image. SVG and unsupported formats are not allowed.' };
  }

  // 4. Decode image and handle EXIF orientation
  let drawable = null;
  let objectUrl = null;
  let sourceWidth = 0;
  let sourceHeight = 0;

  try {
    if (createBitmap) {
      try {
        drawable = await createBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        // Fallback for browsers/shims that reject the options dictionary
        drawable = await createBitmap(file);
      }
      sourceWidth = drawable.width;
      sourceHeight = drawable.height;
    } else if (ImageConstructor && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const img = new ImageConstructor();
      objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      if (typeof img.decode === 'function') {
        await img.decode();
      } else {
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image decode error'));
        });
      }
      drawable = img;
      sourceWidth = img.naturalWidth || img.width;
      sourceHeight = img.naturalHeight || img.height;
    } else {
      return { file: null, error: 'Browser image decoding is unavailable.' };
    }
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    return { file: null, error: 'This image could not be opened. Choose another photo.' };
  }

  try {
    // 5. Dimension safety check: verify positive dimensions and reject > 16 megapixels before allocating canvas
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
      return { file: null, error: 'This image has invalid dimensions. Choose another photo.' };
    }

    if (sourceWidth * sourceHeight > MAX_SOURCE_PIXELS) {
      return { file: null, error: 'Photo dimensions are too large. Choose a photo under 16 megapixels.' };
    }

    // 6. Calculate target dimensions (fit within 512×512, preserve aspect ratio, no upscaling)
    const { width: targetWidth, height: targetHeight } = calculateTargetDimensions(sourceWidth, sourceHeight, MAX_OUTPUT_DIMENSION);

    // 7. Allocate canvas and draw image
    let canvas;
    if (createCanvas) {
      canvas = createCanvas(targetWidth, targetHeight);
    } else if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(targetWidth, targetHeight);
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    } else {
      return { file: null, error: 'Browser canvas is unavailable.' };
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { file: null, error: 'Could not initialize canvas context.' };
    }

    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) {
      ctx.imageSmoothingQuality = 'high';
    }
    ctx.drawImage(drawable, 0, 0, targetWidth, targetHeight);

    // 8. Bounded compression attempts to meet <= 1 MiB limit
    // We prefer WebP for superior compression, with graceful fallback to JPEG if WebP encoding is unsupported
    let bestBlob = null;
    let chosenMime = 'image/webp';

    for (const quality of COMPRESSION_QUALITIES) {
      try {
        const candidate = await encodeCanvasToBlob(canvas, chosenMime, quality);
        if (candidate) {
          // If browser defaulted to PNG when WebP was requested, record actual MIME
          if (candidate.type && candidate.type !== chosenMime) {
            chosenMime = candidate.type;
          }
          if (candidate.size <= MAX_OUTPUT_BYTES) {
            bestBlob = candidate;
            break;
          }
        }
      } catch {
        // If chosen format fails, try JPEG
        if (chosenMime === 'image/webp') {
          chosenMime = 'image/jpeg';
          try {
            const candidate = await encodeCanvasToBlob(canvas, chosenMime, quality);
            if (candidate && candidate.size <= MAX_OUTPUT_BYTES) {
              bestBlob = candidate;
              break;
            }
          } catch {
            // continue loop
          }
        }
      }
    }

    // Release canvas pixel buffer
    if (typeof canvas.width === 'number') {
      canvas.width = 0;
      canvas.height = 0;
    }

    if (!bestBlob || bestBlob.size > MAX_OUTPUT_BYTES) {
      return { file: null, error: 'Could not compress photo to under 1 MB. Choose another photo.' };
    }

    // 9. Verify output raster type and generate matching filename extension
    const outputMime = await detectRasterMimeType(bestBlob) || chosenMime;
    const extension = MIME_TO_EXT[outputMime] || 'webp';

    const preparedFile = new File([bestBlob], `avatar.${extension}`, {
      type: outputMime,
      lastModified: Date.now(),
    });

    return { file: preparedFile, error: null };
  } finally {
    // Release resources
    if (drawable?.close) drawable.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
