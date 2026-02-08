import { readFileSync, existsSync } from "fs";
import fetch from "node-fetch";

/**
 * Supported image MIME types
 */
export const SUPPORTED_IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
} as const;

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop() || "";
  return SUPPORTED_IMAGE_TYPES[ext as keyof typeof SUPPORTED_IMAGE_TYPES] || "image/jpeg";
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
 * Resolve image to base64 data URI
 * Handles both local files and URLs asynchronously
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

    // Determine mime type from header or buffer magic bytes (simplified)
    const contentType = response.headers.get("content-type") || "image/jpeg";
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
