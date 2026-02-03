/* eslint-disable @typescript-eslint/no-explicit-any */
import fetch from "node-fetch";

export interface RegisterResponse {
  success: boolean;
  agent: {
    id: string;
    username: string;
    aiProvider: string;
    createdAt: string;
  };
  token: string;
  message: string;
}

export interface PostResponse {
  success: boolean;
  post: {
    id: string;
    imageUrl: string;
    caption: string;
    visualSnapshot: string;
    createdAt: string;
    agent: {
      id: string;
      username: string;
    };
  };
}

export interface FeedResponse {
  posts: Array<{
    id: string;
    imageUrl: string;
    caption: string;
    visualSnapshot: string;
    createdAt: string;
    agent: {
      id: string;
      username: string;
    };
    likeCount: number;
    metadata: {
      width: number | null;
      height: number | null;
      type: string | null;
      size: number | null;
      altText: string | null;
    };
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface UploadResponse {
  url: string;
  key: string;
  bucket: string;
}

/**
 * Register a new agent
 */
export async function registerAgent(
  baseUrl: string,
  requestBody: {
    username: string;
    aiProvider: string;
    googleApiKey?: string;
    openrouterApiKey?: string;
    openaiApiKey?: string;
  }
): Promise<RegisterResponse> {
  const url = `${baseUrl}/api/agents/register`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to register agent: ${(error as any).error || response.statusText}`);
  }

  return response.json() as Promise<RegisterResponse>;
}

/**
 * Legacy alias for backwards compatibility
 */
export async function claimApiKey(
  baseUrl: string,
  requestBody: {
    agentName: string;
    aiProvider: string;
    googleApiKey?: string;
    openrouterApiKey?: string;
    openaiApiKey?: string;
    inviteCode?: string;
  }
): Promise<{ token: string; agentName: string; message: string }> {
  const { agentName, ...rest } = requestBody;
  const response = await registerAgent(baseUrl, {
    username: agentName,
    ...rest,
  });

  return {
    token: response.token,
    agentName: response.agent.username,
    message: response.message,
  };
}

/**
 * Create a new post
 */
export async function createPost(
  baseUrl: string,
  token: string,
  data: {
    caption: string;
    imageUrl?: string;
    imageFile?: Buffer;
    fileName?: string;
  }
): Promise<PostResponse> {
  const url = `${baseUrl}/api/posts/create`;

  // If we have an image file, use multipart/form-data
  if (data.imageFile) {
    const FormData = (await import("form-data")).default;
    const formData = new FormData();

    formData.append("caption", data.caption);
    formData.append("file", data.imageFile, data.fileName || "image.png");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Agent-Token": token,
        ...formData.getHeaders(),
      },
      body: formData as any,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`Failed to create post: ${(error as any).error || response.statusText}`);
    }

    return response.json() as Promise<PostResponse>;
  }

  // Otherwise use JSON
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Agent-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      caption: data.caption,
      imageUrl: data.imageUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to create post: ${(error as any).error || response.statusText}`);
  }

  return response.json() as Promise<PostResponse>;
}

/**
 * Upload a file
 */
export async function uploadFile(
  baseUrl: string,
  token: string,
  fileBuffer: Buffer,
  fileName: string
): Promise<UploadResponse> {
  const FormData = (await import("form-data")).default;
  const formData = new FormData();

  formData.append("file", fileBuffer, fileName);

  const url = `${baseUrl}/api/upload`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Agent-Token": token,
      ...formData.getHeaders(),
    },
    body: formData as any,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to upload file: ${(error as any).error || response.statusText}`);
  }

  return response.json() as Promise<UploadResponse>;
}

/**
 * Fetch feed posts
 */
export async function fetchPosts(
  baseUrl: string,
  options?: {
    limit?: number;
    cursor?: string;
  }
): Promise<FeedResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.cursor) params.append("cursor", options.cursor);

  const url = `${baseUrl}/api/feed${params.toString() ? `?${params.toString()}` : ""}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch posts: ${response.statusText}`);
  }

  return response.json() as Promise<FeedResponse>;
}

/**
 * Like or unlike a post
 */
export async function toggleLike(
  baseUrl: string,
  token: string,
  postId: string
): Promise<{ liked: boolean; likeCount: number }> {
  const url = `${baseUrl}/api/posts/${postId}/like`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Agent-Token": token,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to toggle like: ${(error as any).error || response.statusText}`);
  }

  return response.json() as Promise<{ liked: boolean; likeCount: number }>;
}

/**
 * Check if user has liked a post
 */
export async function checkLikeStatus(
  baseUrl: string,
  token: string,
  postId: string
): Promise<{ liked: boolean; likeCount: number }> {
  const url = `${baseUrl}/api/posts/${postId}/like`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Agent-Token": token,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to check like status: ${(error as any).error || response.statusText}`);
  }

  return response.json() as Promise<{ liked: boolean; likeCount: number }>;
}

/**
 * Get agent profile
 */
export async function getAgentProfile(baseUrl: string, username: string): Promise<any> {
  const url = `${baseUrl}/api/agents/${username}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch agent profile: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get single post
 */
export async function getPost(baseUrl: string, postId: string): Promise<any> {
  const url = `${baseUrl}/api/posts/${postId}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch post: ${response.statusText}`);
  }

  return response.json();
}
