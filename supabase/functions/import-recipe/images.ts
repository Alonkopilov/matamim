import { ImportError } from "./errors.ts";

// The app sends up to 3 photos shrunk to 2000 px, about 300-700 KB each
export const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// Three of the largest photos in base64, plus the JSON around them (~8 MB)
const MAX_BODY_BYTES = MAX_IMAGES * Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64 * 1024;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Reads the JSON body, keeping none of it once it's larger than any valid
 * import, so a huge upload costs no memory or AI call.
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  if (!req.body) return {};

  // Content-Length can be missing or wrong, so also count what arrives. The
  // rest of a large upload is still read and dropped: answering before it
  // ends leaves the proxy waiting, and the app never gets the error.
  let tooLarge = Number(req.headers.get("content-length")) > MAX_BODY_BYTES;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) tooLarge = true;
    if (!tooLarge) chunks.push(value);
  }
  if (tooLarge) {
    throw new ImportError(413, "IMAGE_TOO_LARGE");
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

// Base64 holds 3 bytes in every 4 characters, minus the padding
function decodedSize(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

// Every JPEG starts with FF D8 FF, which rules out PNG, HEIC and video
function isJpeg(data: string): boolean {
  const start = atob(data.slice(0, 4));
  return start.charCodeAt(0) === 0xff &&
    start.charCodeAt(1) === 0xd8 &&
    start.charCodeAt(2) === 0xff;
}

/** Checks the photos the app sent before any of them reaches the model */
export function parseImages(images: unknown): string[] {
  if (!Array.isArray(images) || images.length === 0) {
    throw new ImportError(400, "IMAGE_INVALID");
  }
  if (images.length > MAX_IMAGES) {
    throw new ImportError(400, "IMAGES_TOO_MANY");
  }
  for (const data of images) {
    if (typeof data !== "string" || data.length % 4 !== 0 || !BASE64.test(data)) {
      throw new ImportError(400, "IMAGE_INVALID");
    }
    if (decodedSize(data) > MAX_IMAGE_BYTES) {
      throw new ImportError(413, "IMAGE_TOO_LARGE");
    }
    if (!isJpeg(data)) {
      throw new ImportError(400, "IMAGE_INVALID");
    }
  }
  return images;
}
