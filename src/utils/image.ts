import { readFileSync, existsSync } from "fs";
import fetch from "node-fetch";
import { fileTypeFromBuffer } from "file-type";

/**
 * Supported image MIME types
 */
export const SUPPORTED_IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
} as const;

/**
 * Non-standard MIME aliases normalised to canonical form
 */
const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/jpe": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/x-bmp": "image/bmp",
  "image/x-ms-bmp": "image/bmp",
};

/**
 * Normalise a raw MIME string: strip parameters (charset, etc.) and resolve
 * known non-standard aliases to their canonical equivalents.
 */
export function normalizeMimeType(raw: string): string {
  const base = raw.split(";")[0].trim().toLowerCase();
  return MIME_ALIASES[base] ?? base;
}

/**
 * Get MIME type from file extension (normalised).
 * Falls back gracefully for unknown extensions.
 */
export function getMimeTypeFromExtension(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop() || "";
  return SUPPORTED_IMAGE_TYPES[ext as keyof typeof SUPPORTED_IMAGE_TYPES] ?? "image/octet-stream";
}

/**
 * Detect MIME type from buffer magic bytes via the file-type library.
 * Returns the canonical (normalised) MIME type, or null if unrecognised.
 */
export async function detectMimeTypeFromBuffer(buffer: Buffer): Promise<string | null> {
  const result = await fileTypeFromBuffer(buffer);
  if (!result) return null;
  return normalizeMimeType(result.mime);
}

/**
 * Check if a string is a URL
 */
export function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

/**
 * Check if a string is a base64 data URI
 */
export function isDataUri(input: string): boolean {
  return input.startsWith("data:image");
}

/**
 * Validate image path or URL
 */
export function validateImageInput(input: string): { valid: boolean; error?: string } {
  if (!input || input.trim() === "") {
    return { valid: false, error: "Image path or URL is required" };
  }

  const cleanInput = input.trim();

  // Check if it's a URL
  if (isUrl(cleanInput)) {
    return { valid: true };
  }

  // Check if it's already a data URI
  if (isDataUri(cleanInput)) {
    return { valid: true };
  }

  // Check if it's a local file
  if (!existsSync(cleanInput)) {
    return { valid: false, error: `File not found: ${cleanInput}` };
  }

  return { valid: true };
}

/**
 * Convert image to base64 data URI
 * Supports local files, URLs, and data URIs
 */
export function encodeImageToDataUri(imagePath: string): string {
  // If it's already a URL or data URI, return as-is
  if (isUrl(imagePath) || isDataUri(imagePath)) {
    return imagePath;
  }

  // Read local file and encode to base64
  const fileBuffer = readFileSync(imagePath);
  const mimeType = getMimeTypeFromExtension(imagePath);
  const base64Image = fileBuffer.toString("base64");

  return `data:${mimeType};base64,${base64Image}`;
}

/**
 * Resolve image to base64 data URI.
 * Handles both local files and URLs asynchronously.
 * Uses magic-byte detection for the most accurate MIME type.
 */
export async function resolveImageToDataUri(imagePath: string): Promise<string> {
  // If it's already a data URI, return as-is
  if (isDataUri(imagePath)) {
    return imagePath;
  }

  // If it's a URL, fetch it
  if (isUrl(imagePath)) {
    const response = await fetch(imagePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Prefer magic-byte detection; fall back to the Content-Type header
    const detectedMime = await detectMimeTypeFromBuffer(buffer);
    const headerMime = response.headers.get("content-type")
      ? normalizeMimeType(response.headers.get("content-type")!)
      : null;
    const contentType = detectedMime ?? headerMime ?? "image/jpeg";

    const base64Image = buffer.toString("base64");
    return `data:${contentType};base64,${base64Image}`;
  }

  // Fallback to local file encoding
  return encodeImageToDataUri(imagePath);
}

/**
 * Extract base64 data from data URI (for Google API)
 */
export function extractBase64FromDataUri(dataUri: string): {
  mimeType: string;
  base64Data: string;
} {
  if (!isDataUri(dataUri)) {
    throw new Error("Input is not a data URI");
  }

  const [header, base64Data] = dataUri.split(",");
  const mimeType = header.split(";")[0].split(":")[1] || "image/jpeg";

  return { mimeType, base64Data };
}
