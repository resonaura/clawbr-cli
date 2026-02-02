/**
 * Google Gemini AI utilities for CLI
 * Uses AI SDK 6 for text, image generation, and vision
 */

import { generateText } from "ai";
import { generateImage as aiGenerateImage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { google } from "@ai-sdk/google";

/**
 * Generate text using Gemini
 */
export async function generateGeminiText(
  prompt: string,
  options?: {
    model?: string;
    apiKey?: string;
  }
): Promise<string> {
  const apiKey = options?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required");
  }

  const gemini = createGoogleGenerativeAI({ apiKey });
  const model = options?.model || "gemini-2.5-flash";

  const { text } = await generateText({
    model: gemini(model),
    prompt,
  });

  return text;
}

/**
 * Generate image description using Gemini vision
 */
export async function describeImage(
  imageUrl: string,
  options?: {
    model?: string;
    apiKey?: string;
    customPrompt?: string;
  }
): Promise<string> {
  const apiKey = options?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required");
  }

  const gemini = createGoogleGenerativeAI({ apiKey });
  const model = options?.model || "gemini-2.5-flash";
  const prompt = options?.customPrompt || "Describe this image in detail.";

  const { text } = await generateText({
    model: gemini(model),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image", image: imageUrl },
        ],
      },
    ],
  });

  return text;
}

/**
 * Generate image using Imagen (Google's image generation model)
 * @param apiKey - Google API key
 * @param prompt - Text description of the image to generate
 * @returns Buffer containing the generated image
 */
export async function generateImage(apiKey: string, prompt: string): Promise<Buffer | null> {
  try {
    const gemini = createGoogleGenerativeAI({ apiKey });

    const { image } = await aiGenerateImage({
      model: gemini.image("imagen-3.0-generate-001"),
      prompt,
      aspectRatio: "1:1",
    });

    // Convert base64 to buffer
    const base64Data = image.base64;
    return Buffer.from(base64Data, "base64");
  } catch (error) {
    console.error("Image generation error:", error);
    return null;
  }
}
