/**
 * Tier 2 — self-hosted Tesseract (plan.md §16: "₹0, ~2 s").
 *
 * The worker is created lazily and then reused: starting one costs about a
 * second and loads a language model, which is far too much to pay per upload.
 * A Tesseract worker handles exactly one recognition at a time, so calls are
 * serialised through a promise chain instead of racing on shared state.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker, type Worker } from 'tesseract.js';
import { logger } from '../config/logger';

const LANGUAGE = process.env.OCR_LANG ?? 'eng';

/**
 * Where the ~5 MB language model is cached. Left to itself tesseract.js drops
 * `eng.traineddata` into the process's working directory, which means a stray
 * blob in the repo and a re-download for every different cwd.
 * In production/cloud containers (e.g. Render/Linux), we use the system temp directory
 * where write permissions are guaranteed.
 */
const CACHE_PATH =
  process.env.OCR_CACHE_PATH ??
  (process.env.NODE_ENV === 'production'
    ? join(tmpdir(), 'tesseract')
    : join(
        dirname(createRequire(import.meta.url).resolve('tesseract.js/package.json')),
        '..',
        '.cache',
        'tesseract',
      ));

let worker: Promise<Worker> | null = null;
let tail: Promise<unknown> = Promise.resolve();
let idleTimer: NodeJS.Timeout | null = null;

/** Guard against huge camera images spiking WASM memory on memory-constrained hosts (Render 512MB RAM). */
const MAX_IMAGE_EDGE = 1200;

async function downscaleIfNeeded(buffer: Buffer): Promise<Buffer> {
  try {
    const img = await loadImage(buffer);
    if (img.width <= MAX_IMAGE_EDGE && img.height <= MAX_IMAGE_EDGE) {
      return buffer;
    }
    const scale = Math.min(MAX_IMAGE_EDGE / img.width, MAX_IMAGE_EDGE / img.height, 1);
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toBuffer('image/jpeg', 80);
  } catch {
    // If not a decodable image buffer, fall back to raw input
    return buffer;
  }
}

function scheduleIdleCleanup(): void {
  if (idleTimer) clearTimeout(idleTimer);
  // Auto-terminate worker after 30 seconds of inactivity to free ~200MB WASM memory on Render free tier
  idleTimer = setTimeout(() => {
    idleTimer = null;
    shutdownOcr().catch(() => {});
  }, 30_000);
  idleTimer.unref?.();
}

function getWorker(): Promise<Worker> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  worker ??= (async () => {
    mkdirSync(CACHE_PATH, { recursive: true });
    return createWorker(LANGUAGE, undefined, { cachePath: CACHE_PATH });
  })().catch((err: unknown) => {
    logger.error({ err }, 'failed to initialize tesseract worker');
    worker = null; // a failed start must not poison every later upload
    throw err;
  });
  return worker;
}

/** Queue a job behind whatever is already running, success or failure. */
function serialise<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.catch(() => undefined);
  return run;
}

export interface Recognition {
  text: string;
  /** Mean per-page confidence, 0–1. */
  confidence: number;
}

/** Cloud containers need more headroom on cold start to download traineddata and init WASM. */
const OCR_PAGE_TIMEOUT_MS = Number(process.env.OCR_PAGE_TIMEOUT_MS ?? 60_000);

export async function recognize(images: readonly Buffer[]): Promise<Recognition> {
  if (images.length === 0) return { text: '', confidence: 0 };

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  const texts: string[] = [];
  const confidences: number[] = [];

  try {
    for (const rawImage of images) {
      try {
        const image = await downscaleIfNeeded(rawImage);
        const recognitionPromise = serialise(async () => {
          const w = await getWorker();
          return w.recognize(image);
        });
        let timer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Tesseract recognition timed out')), OCR_PAGE_TIMEOUT_MS);
        });
        const { data } = await Promise.race([recognitionPromise, timeoutPromise]).finally(() => {
          if (timer) clearTimeout(timer);
        });
        texts.push(data.text);
        confidences.push(data.confidence / 100);
      } catch (err) {
        logger.warn({ err }, 'tesseract page recognition skipped or timed out');
      }
    }
  } finally {
    scheduleIdleCleanup();
  }

  if (confidences.length === 0) return { text: '', confidence: 0 };
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  return { text: texts.join('\n'), confidence: mean };
}

/** Release the worker — graceful shutdown, idle cleanup, and between test files. */
export async function shutdownOcr(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  return serialise(async () => {
    const pending = worker;
    worker = null;
    if (!pending) return;
    try {
      const w = await pending;
      await w.terminate();
      logger.info('ocr worker idle-terminated to release memory');
    } catch (err) {
      logger.warn({ err }, 'ocr worker did not terminate cleanly');
    }
  });
}

