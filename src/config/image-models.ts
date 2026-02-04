/**
 * Image Generation Models Configuration
 *
 * Defines available models for each AI provider with their capabilities.
 * Used by generate command to validate and select appropriate models.
 */

export interface ImageModel {
  id: string;
  name: string;
  supportsReferenceImage: boolean;
  supportsCustomSize: boolean;
  description?: string;
}

export interface ProviderModels {
  primary: string;
  fallbacks: string[];
  models: ImageModel[];
}

export const IMAGE_MODELS: Record<string, ProviderModels> = {
  openrouter: {
    primary: "google/gemini-2.5-flash-image-preview",
    fallbacks: ["google/gemini-3-pro-image-preview", "black-forest-labs/flux.2-pro"],
    models: [
      {
        id: "google/gemini-2.5-flash-image-preview",
        name: "Gemini 2.5 Flash Image (Nano Banana)",
        supportsReferenceImage: true,
        supportsCustomSize: true,
        description: "Fast, affordable image generation with reference image support",
      },
      {
        id: "google/gemini-3-pro-image-preview",
        name: "Nano Banana Pro (Gemini 3 Pro)",
        supportsReferenceImage: true,
        supportsCustomSize: true,
        description: "Professional graphics, 4K, multi-subject support",
      },
      {
        id: "black-forest-labs/flux.2-pro",
        name: "FLUX.2 Pro",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "High-quality image generation without reference support",
      },
      {
        id: "black-forest-labs/flux.2-flex",
        name: "FLUX.2 Flex",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "Flexible FLUX variant for diverse styles",
      },
      {
        id: "sourceful/riverflow-v2-standard-preview",
        name: "Riverflow V2 Standard Preview",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "Sourceful's unified t2i/i2i model",
      },
    ],
  },
  openai: {
    primary: "gpt-image-1.5",
    fallbacks: ["gpt-image-1", "dall-e-3"],
    models: [
      {
        id: "gpt-image-1.5",
        name: "GPT Image 1.5",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "Latest GPT image generation model",
      },
      {
        id: "gpt-image-1",
        name: "GPT Image 1",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "Standard GPT image generation",
      },
      {
        id: "gpt-image-1-mini",
        name: "GPT Image 1 Mini",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "Lightweight GPT image generation",
      },
      {
        id: "dall-e-3",
        name: "DALL-E 3",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "OpenAI's DALL-E 3 model",
      },
      {
        id: "dall-e-2",
        name: "DALL-E 2",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "OpenAI's DALL-E 2 model",
      },
    ],
  },
  google: {
    primary: "imagen-4.0-generate-001",
    fallbacks: ["imagen-4.0-fast-generate-001"],
    models: [
      {
        id: "imagen-4.0-generate-001",
        name: "Imagen 4.0",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "Google's Imagen 4.0 generation model",
      },
      {
        id: "imagen-4.0-fast-generate-001",
        name: "Imagen 4.0 Fast",
        supportsReferenceImage: false,
        supportsCustomSize: true,
        description: "Fast variant of Imagen 4.0",
      },
    ],
  },
};

/**
 * Get available models for a provider
 */
export function getProviderModels(provider: string): ImageModel[] {
  const providerConfig = IMAGE_MODELS[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return providerConfig.models;
}

/**
 * Get model by ID for a provider
 */
export function getModelById(provider: string, modelId: string): ImageModel | undefined {
  const models = getProviderModels(provider);
  return models.find((m) => m.id === modelId);
}

/**
 * Validate if a model exists for a provider
 */
export function isValidModel(provider: string, modelId: string): boolean {
  return getModelById(provider, modelId) !== undefined;
}

/**
 * Get primary model for a provider
 */
export function getPrimaryModel(provider: string): string {
  const providerConfig = IMAGE_MODELS[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return providerConfig.primary;
}

/**
 * Get fallback models for a provider
 */
export function getFallbackModels(provider: string): string[] {
  const providerConfig = IMAGE_MODELS[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return providerConfig.fallbacks;
}

/**
 * Check if a model supports reference images
 */
export function supportsReferenceImage(provider: string, modelId: string): boolean {
  const model = getModelById(provider, modelId);
  return model?.supportsReferenceImage ?? false;
}

/**
 * Get list of models that support reference images for a provider
 */
export function getModelsWithReferenceSupport(provider: string): ImageModel[] {
  return getProviderModels(provider).filter((m) => m.supportsReferenceImage);
}

/**
 * Format model list for display
 */
export function formatModelList(provider: string): string {
  const models = getProviderModels(provider);
  return models
    .map((m) => {
      const refSupport = m.supportsReferenceImage ? " [supports reference images]" : "";
      return `  • ${m.id}${refSupport}\n    ${m.description || ""}`;
    })
    .join("\n\n");
}
