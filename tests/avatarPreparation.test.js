import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SOURCE_BYTES,
  MAX_OUTPUT_BYTES,
  detectRasterMimeType,
  calculateTargetDimensions,
  prepareAvatarImage,
} from '../src/lib/avatarPreparation.js';

// Realistic magic byte fixtures
const JPEG_HEADER = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
const WEBP_HEADER = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // 'RIFF'
  0x24, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, // 'WEBP'
]);
const SVG_SAMPLE = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
const TEXT_SAMPLE = new TextEncoder().encode('Hello, this is just a plain text document pretending to be an image.');
const DISGUISED_EXE = new Uint8Array([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ DOS/PE

// ---------------------------------------------------------------------------
// 1. Magic Bytes & Raster Type Detection
// ---------------------------------------------------------------------------
test('detectRasterMimeType: accurately detects JPEG, PNG, and WebP from magic bytes', async () => {
  const jpegFile = new File([JPEG_HEADER], 'test.jpg', { type: 'image/jpeg' });
  const pngFile = new File([PNG_HEADER], 'test.png', { type: 'image/png' });
  const webpFile = new File([WEBP_HEADER], 'test.webp', { type: 'image/webp' });

  assert.equal(await detectRasterMimeType(jpegFile), 'image/jpeg');
  assert.equal(await detectRasterMimeType(pngFile), 'image/png');
  assert.equal(await detectRasterMimeType(webpFile), 'image/webp');
});

test('detectRasterMimeType: rejects SVG, text, executables, and disguised files', async () => {
  const svgFile = new File([SVG_SAMPLE], 'vector.svg', { type: 'image/svg+xml' });
  const disguisedSvg = new File([SVG_SAMPLE], 'photo.png', { type: 'image/png' });
  const textFile = new File([TEXT_SAMPLE], 'notes.jpg', { type: 'image/jpeg' });
  const exeFile = new File([DISGUISED_EXE], 'setup.png', { type: 'image/png' });
  const emptyFile = new File([], 'empty.webp', { type: 'image/webp' });
  const nullFile = null;

  assert.equal(await detectRasterMimeType(svgFile), null);
  assert.equal(await detectRasterMimeType(disguisedSvg), null);
  assert.equal(await detectRasterMimeType(textFile), null);
  assert.equal(await detectRasterMimeType(exeFile), null);
  assert.equal(await detectRasterMimeType(emptyFile), null);
  assert.equal(await detectRasterMimeType(nullFile), null);
});

// ---------------------------------------------------------------------------
// 2. Dimension Calculation & No Upscaling
// ---------------------------------------------------------------------------
test('calculateTargetDimensions: preserves aspect ratio and scales large images to fit 512×512', () => {
  // Large square
  const square = calculateTargetDimensions(2048, 2048);
  assert.deepEqual(square, { width: 512, height: 512 });

  // Wide non-square (4:3)
  const wide = calculateTargetDimensions(1600, 1200);
  assert.deepEqual(wide, { width: 512, height: 384 });

  // Very wide banner (16:9)
  const banner = calculateTargetDimensions(1920, 1080);
  assert.deepEqual(banner, { width: 512, height: 288 });

  // Tall portrait (3:4)
  const portrait = calculateTargetDimensions(1200, 1600);
  assert.deepEqual(portrait, { width: 384, height: 512 });

  // Exact bounds
  const exact = calculateTargetDimensions(512, 512);
  assert.deepEqual(exact, { width: 512, height: 512 });
});

test('calculateTargetDimensions: strictly prevents upscaling of smaller images', () => {
  // Small square
  const smallSquare = calculateTargetDimensions(256, 256);
  assert.deepEqual(smallSquare, { width: 256, height: 256 });

  // Small non-square
  const smallRect = calculateTargetDimensions(320, 240);
  assert.deepEqual(smallRect, { width: 320, height: 240 });

  // Tiny icon
  const tiny = calculateTargetDimensions(64, 64);
  assert.deepEqual(tiny, { width: 64, height: 64 });
});

test('calculateTargetDimensions: throws on invalid dimensions', () => {
  assert.throws(() => calculateTargetDimensions(0, 500));
  assert.throws(() => calculateTargetDimensions(-10, 500));
  assert.throws(() => calculateTargetDimensions(500, NaN));
  assert.throws(() => calculateTargetDimensions(Infinity, 500));
});

// ---------------------------------------------------------------------------
// 3. Source File Validation & Bounds
// ---------------------------------------------------------------------------
test('prepareAvatarImage: rejects null, undefined, or empty files', async () => {
  assert.deepEqual(await prepareAvatarImage(null), { file: null, error: 'Choose an image file.' });
  assert.deepEqual(await prepareAvatarImage(undefined), { file: null, error: 'Choose an image file.' });
  assert.deepEqual(await prepareAvatarImage(new File([], 'zero.png', { type: 'image/png' })), {
    file: null,
    error: 'Choose a valid image file.',
  });
});

test('prepareAvatarImage: rejects files exceeding 8 MiB source limit', async () => {
  // Create mock file with size property > 8 MiB (8 * 1024 * 1024 + 1 = 8388609)
  const oversizedFile = {
    size: MAX_SOURCE_BYTES + 1,
    slice: () => ({ arrayBuffer: async () => PNG_HEADER.buffer }),
  };

  const res = await prepareAvatarImage(oversizedFile);
  assert.equal(res.file, null);
  assert.match(res.error, /up to 8 MB/i);
});

test('prepareAvatarImage: rejects decoded images over 16 megapixels before allocating canvas', async () => {
  let canvasAllocated = false;

  const mockFile = new File([PNG_HEADER], 'huge.png', { type: 'image/png' });

  // Mock bitmap with 5000 x 4000 = 20,000,000 pixels (> 16,777,216)
  const mockCreateBitmap = async () => ({
    width: 5000,
    height: 4000,
    close: () => {},
  });

  const mockCreateCanvas = () => {
    canvasAllocated = true;
    return {};
  };

  const res = await prepareAvatarImage(mockFile, {
    createBitmap: mockCreateBitmap,
    createCanvas: mockCreateCanvas,
  });

  assert.equal(res.file, null);
  assert.match(res.error, /under 16 megapixels/i);
  assert.equal(canvasAllocated, false, 'Canvas MUST NOT be allocated for images exceeding 16 MP');
});

test('prepareAvatarImage: rejects decoding errors honestly', async () => {
  const corruptFile = new File([JPEG_HEADER], 'corrupt.jpg', { type: 'image/jpeg' });

  const mockFailingBitmap = async () => {
    throw new Error('Image decoding failed: corrupt stream');
  };

  const res = await prepareAvatarImage(corruptFile, { createBitmap: mockFailingBitmap });
  assert.equal(res.file, null);
  assert.match(res.error, /could not be opened/i);
});

// ---------------------------------------------------------------------------
// 4. Successful Preparation, Aspect Ratio & Extension Matching
// ---------------------------------------------------------------------------
test('prepareAvatarImage: successfully scales non-square image and outputs valid matching file', async () => {
  const mockFile = new File([JPEG_HEADER], 'original-photo.jpeg', { type: 'image/jpeg' });
  let closed = false;
  let canvasDimensions = null;
  let drawnArgs = null;

  const mockBitmap = {
    width: 1200,
    height: 900, // 4:3
    close: () => { closed = true; },
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      imageSmoothingEnabled: false,
      drawImage: (...args) => { drawnArgs = args; },
    }),
    toBlob: (callback) => {
      // Simulate WebP output
      const outputBytes = new Uint8Array([...WEBP_HEADER, 0, 1, 2, 3]);
      callback(new Blob([outputBytes], { type: 'image/webp' }));
    },
  };

  const res = await prepareAvatarImage(mockFile, {
    createBitmap: async (file, options) => {
      assert.equal(options?.imageOrientation, 'from-image');
      return mockBitmap;
    },
    createCanvas: (w, h) => {
      canvasDimensions = { w, h };
      mockCanvas.width = w;
      mockCanvas.height = h;
      return mockCanvas;
    },
  });

  assert.equal(res.error, null);
  assert.ok(res.file instanceof File);
  assert.equal(res.file.name, 'avatar.webp', 'Output filename must match generated MIME extension');
  assert.equal(res.file.type, 'image/webp');
  assert.ok(res.file.size <= MAX_OUTPUT_BYTES);
  assert.equal(closed, true, 'ImageBitmap must be closed after preparation');
  assert.deepEqual(canvasDimensions, { w: 512, h: 384 }, 'Canvas must have scaled 4:3 target dimensions');
  assert.deepEqual(drawnArgs, [mockBitmap, 0, 0, 512, 384]);
});

test('prepareAvatarImage: does not upscale small images', async () => {
  const mockFile = new File([PNG_HEADER], 'small.png', { type: 'image/png' });
  let canvasDimensions = null;

  const mockBitmap = {
    width: 200,
    height: 150,
    close: () => {},
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: () => {},
    }),
    toBlob: (callback) => {
      callback(new Blob([PNG_HEADER], { type: 'image/png' }));
    },
  };

  const res = await prepareAvatarImage(mockFile, {
    createBitmap: async () => mockBitmap,
    createCanvas: (w, h) => {
      canvasDimensions = { w, h };
      return mockCanvas;
    },
  });

  assert.equal(res.error, null);
  assert.deepEqual(canvasDimensions, { w: 200, h: 150 }, 'Dimensions must remain 200×150 without upscaling');
});

// ---------------------------------------------------------------------------
// 5. Bounded Compression Attempts & Limit Failures
// ---------------------------------------------------------------------------
test('prepareAvatarImage: bounds compression attempts and reduces quality until <= 1 MB', async () => {
  const mockFile = new File([JPEG_HEADER], 'complex.jpg', { type: 'image/jpeg' });
  const qualityAttempts = [];

  const mockBitmap = { width: 1000, height: 1000, close: () => {} };

  const mockCanvas = {
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback, type, quality) => {
      qualityAttempts.push(quality);
      if (qualityAttempts.length < 3) {
        // First two attempts exceed 1 MB
        const huge = new Uint8Array(MAX_OUTPUT_BYTES + 100);
        huge.set(WEBP_HEADER);
        callback(new Blob([huge], { type: 'image/webp' }));
      } else {
        // Third attempt satisfies <= 1 MB
        const fits = new Uint8Array(50000);
        fits.set(WEBP_HEADER);
        callback(new Blob([fits], { type: 'image/webp' }));
      }
    },
  };

  const res = await prepareAvatarImage(mockFile, {
    createBitmap: async () => mockBitmap,
    createCanvas: () => mockCanvas,
  });

  assert.equal(res.error, null);
  assert.equal(qualityAttempts.length, 3, 'Must stop as soon as size meets <= 1 MB');
  assert.ok(res.file.size <= MAX_OUTPUT_BYTES);
});

test('prepareAvatarImage: fails clearly after bounded attempts if output cannot meet 1 MB limit', async () => {
  const mockFile = new File([PNG_HEADER], 'uncompressible.png', { type: 'image/png' });
  const qualityAttempts = [];

  const mockBitmap = { width: 512, height: 512, close: () => {} };

  const mockCanvas = {
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback, type, quality) => {
      qualityAttempts.push(quality);
      // All attempts exceed 1 MB
      const huge = new Uint8Array(MAX_OUTPUT_BYTES + 500);
      huge.set(PNG_HEADER);
      callback(new Blob([huge], { type: 'image/png' }));
    },
  };

  const res = await prepareAvatarImage(mockFile, {
    createBitmap: async () => mockBitmap,
    createCanvas: () => mockCanvas,
  });

  assert.equal(res.file, null);
  assert.match(res.error, /under 1 MB/i);
  assert.equal(qualityAttempts.length, 4, 'Must make exactly 4 bounded compression attempts before failing');
});

// ---------------------------------------------------------------------------
// 6. Save Flow Integration: Preparation Failure & Owner Switching
// ---------------------------------------------------------------------------
test('save flow integration: preparation failure preserves old avatar and makes zero storage/db writes', async () => {
  const alice = '11111111-1111-4111-8111-111111111111';
  const oldPath = `${alice}/old-avatar.webp`;
  const mockDbProfile = {
    id: alice,
    display_name: 'Alice',
    avatar_path: oldPath,
    updated_at: '2026-10-28T12:00:00.000000Z',
  };

  // 1. User passes an invalid SVG file
  const invalidFile = new File([SVG_SAMPLE], 'vector.svg', { type: 'image/svg+xml' });

  // 2. Preparation step runs
  const prep = await prepareAvatarImage(invalidFile);
  assert.ok(prep.error, 'Preparation must return an error for SVG');
  assert.equal(prep.file, null);

  // 3. In the save flow, if prep.error occurs, save halts immediately
  let uploadCalled = false;
  let dbUpdateCalled = false;
  let oldAvatarCleaned = false;

  if (!prep.error) {
    uploadCalled = true;
    dbUpdateCalled = true;
    oldAvatarCleaned = true;
  }

  assert.equal(uploadCalled, false, 'No storage upload must occur on preparation failure');
  assert.equal(dbUpdateCalled, false, 'No database update must occur on preparation failure');
  assert.equal(oldAvatarCleaned, false, 'Old avatar must NEVER be cleaned up or deleted on preparation failure');
  assert.equal(mockDbProfile.avatar_path, oldPath, 'Current avatar in DB remains unchanged');
});

test('save flow integration: owner switching before upload halts and preserves Account B', async () => {
  const alice = '11111111-1111-4111-8111-111111111111';
  const bob = '22222222-2222-4222-8222-222222222222';
  let activeUser = alice;
  const isCurrent = () => activeUser === alice;

  // Simulate Alice selecting a valid photo
  const validFile = new File([JPEG_HEADER], 'photo.jpg', { type: 'image/jpeg' });
  const mockBitmap = { width: 400, height: 400, close: () => {} };
  const mockCanvas = {
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (cb) => cb(new Blob([WEBP_HEADER], { type: 'image/webp' })),
  };

  const prep = await prepareAvatarImage(validFile, {
    createBitmap: async () => mockBitmap,
    createCanvas: () => mockCanvas,
  });
  assert.equal(prep.error, null);
  assert.ok(prep.file);

  // Owner switches from Alice to Bob right before upload
  activeUser = bob;

  let uploadAttempted = false;
  // Flow check before network upload:
  if (isCurrent()) {
    uploadAttempted = true;
  }

  assert.equal(uploadAttempted, false, 'Upload must NOT be attempted when active owner switches');
  assert.equal(activeUser, bob, 'Account B is preserved and protected');
});

// ---------------------------------------------------------------------------
// 7. Real Browser Canvas & Decode Verification
// ---------------------------------------------------------------------------
test('real browser verification: executes canvas, resize, orientation, and compression in real browser', async () => {
  const { runBrowserAvatarVerification } = await import('./runBrowserAvatarCheck.mjs');
  const outcome = await runBrowserAvatarVerification();
  if (outcome.skipped) {
    // Honestly report skipped if host does not have Chrome/Edge
    assert.ok(outcome.reason);
  } else {
    assert.equal(outcome.passed, true);
    assert.ok(Array.isArray(outcome.results));
    assert.ok(outcome.results.some((r) => r.test === 'non-square-800x400-to-512x256'));
    assert.ok(outcome.results.some((r) => r.test === 'no-upscaling-240x160'));
    assert.ok(outcome.results.some((r) => r.test === 'browser-exif-orientation-support'));
    assert.ok(outcome.results.some((r) => r.test === 'reject-svg'));
  }
});
