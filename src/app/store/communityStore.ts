import { useEffect, useSyncExternalStore } from "react";
import { normalizePluginManifest, type PluginManifest } from "../types/plugins";

export type Tab = "plugins" | "templates" | "discussions";
export type ViewMode = "list" | "grid";

export interface Comment {
  id: string;
  author: string;
  date: string;
  content: string;
}

export interface Post {
  id: string;
  type: Tab;
  title: string;
  author: string;
  date: string;
  createdAt?: number;
  description: string;
  likes: number;
  comments: number;
  hasFile?: boolean;
  hasImage?: boolean;
  imageUrl?: string;
  isLiked?: boolean;
  isAddedToLibrary?: boolean;
  templateAttachments?: Array<{
    id: string;
    name: string;
    description?: string;
    vibe?: string;
    layout?: string;
    signatureElements?: string;
    animation?: string;
    colors?: {
      primary: string;
      secondary: string;
      bg: string;
      text: string;
    };
    fonts?: {
      title: string;
      body: string;
    };
  }>;
  pluginManifest?: PluginManifest | null;
  pluginEntryHtml?: string;
  commentsList: Comment[];
}

type CreateCommunityPostInput = {
  type: Tab;
  title: string;
  description: string;
  hasImage?: boolean;
  imageDataUrl?: string;
  hasFile?: boolean;
  templateAttachments?: Array<{
    id: string;
    name: string;
    description?: string;
    vibe?: string;
    layout?: string;
    signatureElements?: string;
    animation?: string;
    colors?: {
      primary: string;
      secondary: string;
      bg: string;
      text: string;
    };
    fonts?: {
      title: string;
      body: string;
    };
  }>;
  pluginManifest?: PluginManifest;
  pluginEntryHtml?: string;
};

const MOCK_PLUGIN_POSTS: Post[] = [
  {
    id: "1",
    type: "plugins",
    title: "Liquid Flow Transitions Generator",
    author: "UI Alchemist",
    date: "2 hours ago",
    description: "A pure CSS plugin for the editor that generates complex, performant liquid transitions between slides without relying on JavaScript interpolations. Perfect for organic presentations.",
    likes: 342,
    comments: 2,
    hasFile: false,
    commentsList: [
      { id: "c1", author: "Motion Freak", date: "1 hour ago", content: "This is exactly what I needed for my agency pitch deck. The performance is buttery smooth!" },
      { id: "c2", author: "CSS Wizard", date: "45 mins ago", content: "Great work. Would love to see an option to tweak the bezier curves directly in the panel." }
    ]
  },
  {
    id: "2",
    type: "plugins",
    title: "Warm Color Palette Engine",
    author: "Color Theorist",
    date: "1 day ago",
    description: "Automatically extracts and harmonizes warm tones from uploaded images to create cohesive, soothing slide backgrounds. Avoids cold colors automatically.",
    likes: 890,
    comments: 1,
    hasFile: false,
    commentsList: [
      { id: "c3", author: "Sunny Design", date: "10 hours ago", content: "Beautiful results. The orange and peach tones it extracts are perfect." }
    ]
  },
];

let posts = [...MOCK_PLUGIN_POSTS];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function getAuthToken() {
  return localStorage.getItem("auth_token");
}

function formatRelativeTime(timestamp: number) {
  const deltaMs = timestamp - Date.now();
  const absMs = Math.abs(deltaMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absMs < hour) {
    const value = Math.round(deltaMs / minute) || 0;
    return rtf.format(value, "minute");
  }
  if (absMs < day) {
    const value = Math.round(deltaMs / hour);
    return rtf.format(value, "hour");
  }
  const value = Math.round(deltaMs / day);
  return rtf.format(value, "day");
}

function normalizeComment(item: unknown): Comment | null {
  if (!item || typeof item !== "object") return null;
  const source = item as {
    id?: unknown;
    author?: unknown;
    date?: unknown;
    createdAt?: unknown;
    content?: unknown;
  };
  const id = String(source.id || "").trim();
  const content = String(source.content || "").trim();
  const author = String(source.author || "User").trim() || "User";
  const dateNumber = Number(source.createdAt ?? source.date);
  const date = Number.isFinite(dateNumber) ? formatRelativeTime(dateNumber) : String(source.date || "Just now");
  if (!id || !content) return null;
  return { id, author, date, content };
}

function normalizePost(item: unknown): Post | null {
  if (!item || typeof item !== "object") return null;
  const source = item as {
    id?: unknown;
    type?: unknown;
    title?: unknown;
    author?: unknown;
    date?: unknown;
    createdAt?: unknown;
    description?: unknown;
    likes?: unknown;
    comments?: unknown;
    hasFile?: unknown;
    hasImage?: unknown;
    imageUrl?: unknown;
    isLiked?: unknown;
    isAddedToLibrary?: unknown;
    templateAttachments?: unknown;
    pluginManifest?: unknown;
    pluginEntryHtml?: unknown;
    commentsList?: unknown;
  };
  const id = String(source.id || "").trim();
  const type = String(source.type || "").trim() as Tab;
  const title = String(source.title || "").trim();
  const description = String(source.description || "").trim();
  if (!id || !title || !description) return null;
  const createdAt = Number(source.createdAt ?? source.date);
  const date = Number.isFinite(createdAt) ? formatRelativeTime(createdAt) : String(source.date || "Just now");
  const commentsList = Array.isArray(source.commentsList)
    ? source.commentsList.map(normalizeComment).filter(Boolean) as Comment[]
    : [];
  const templateAttachments = Array.isArray(source.templateAttachments)
    ? source.templateAttachments
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const item = entry as {
            id?: unknown;
            name?: unknown;
            description?: unknown;
            vibe?: unknown;
            layout?: unknown;
            signatureElements?: unknown;
            animation?: unknown;
            colors?: unknown;
            fonts?: unknown;
          };
          const colors = item.colors && typeof item.colors === "object" ? item.colors as Record<string, unknown> : {};
          const fonts = item.fonts && typeof item.fonts === "object" ? item.fonts as Record<string, unknown> : {};
          const name = String(item.name || "").trim();
          if (!name) return null;
          return {
            id: String(item.id || name).trim(),
            name,
            description: String(item.description || "").trim(),
            vibe: String(item.vibe || "").trim(),
            layout: String(item.layout || "").trim(),
            signatureElements: String(item.signatureElements || "").trim(),
            animation: String(item.animation || "").trim(),
            colors: {
              primary: String(colors.primary || "#ff6b35"),
              secondary: String(colors.secondary || "#ff8a5c"),
              bg: String(colors.bg || "#0f172a"),
              text: String(colors.text || "#f8fafc"),
            },
            fonts: {
              title: String(fonts.title || "Manrope"),
              body: String(fonts.body || "Inter"),
            },
          };
        })
        .filter(Boolean) as Post["templateAttachments"]
    : [];
  const pluginManifest = normalizePluginManifest(source.pluginManifest);

  return {
    id,
    type,
    title,
    author: String(source.author || "User").trim() || "User",
    date,
    createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
    description,
    likes: Number(source.likes) || 0,
    comments: Number(source.comments) || commentsList.length,
    hasFile: Boolean(source.hasFile),
    hasImage: Boolean(source.hasImage),
    imageUrl: String(source.imageUrl || "").trim(),
    isLiked: Boolean(source.isLiked),
    isAddedToLibrary: Boolean(source.isAddedToLibrary),
    templateAttachments,
    pluginManifest,
    pluginEntryHtml: String(source.pluginEntryHtml || "").trim(),
    commentsList,
  };
}

export const communityStore = {
  getPosts: () => posts,
  loadPosts: async () => {
    const token = getAuthToken();
    if (!token) {
      posts = [...MOCK_PLUGIN_POSTS];
      emit();
      return;
    }
    const response = await fetch("/api/community/posts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load community posts");
    }
    const remotePosts = Array.isArray(data.posts)
      ? data.posts.map(normalizePost).filter(Boolean) as Post[]
      : [];
    posts = remotePosts;
    emit();
  },
  addPost: async (input: CreateCommunityPostInput) => {
    const token = getAuthToken();
    if (!token) throw new Error("Please login first");
    let imageUrl = "";
    if (input.hasImage && input.imageDataUrl) {
      const uploadRes = await fetch("/api/community/upload-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dataUrl: input.imageDataUrl }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || "Failed to upload image");
      }
      imageUrl = String(uploadData.imageUrl || "").trim();
    }
    const response = await fetch("/api/community/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: input.type,
        title: input.title,
        description: input.description,
        hasImage: Boolean(input.hasImage),
        imageUrl,
        hasFile: Boolean(input.hasFile),
        templateAttachments: input.templateAttachments || [],
        pluginManifest: input.pluginManifest || null,
        pluginEntryHtml: String(input.pluginEntryHtml || ""),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to publish post");
    }
    const newPost = normalizePost(data.post);
    if (!newPost) throw new Error("Invalid post payload");
    posts = [newPost, ...posts];
    emit();
    return newPost;
  },
  updatePost: (id: string, updater: (p: Post) => Post) => {
    posts = posts.map(p => p.id === id ? updater(p) : p);
    emit();
  },
  toggleLike: async (id: string) => {
    const target = posts.find((item) => item.id === id);
    if (!target) return;
    const token = getAuthToken();
    if (!token) throw new Error("Please login first");
    const response = await fetch(`/api/community/posts/${id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to toggle like");
    }
    posts = posts.map((p) =>
      p.id === id
        ? {
            ...p,
            isLiked: Boolean(data.liked),
            likes: Number(data.likes) || 0,
          }
        : p,
    );
    emit();
  },
  addComment: async (id: string, content: string) => {
    const target = posts.find((item) => item.id === id);
    if (!target) return;
    const cleanContent = content.trim();
    if (!cleanContent) return;
    const token = getAuthToken();
    if (!token) throw new Error("Please login first");
    const response = await fetch(`/api/community/posts/${id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: cleanContent }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to add comment");
    }
    const nextComment = normalizeComment(data.comment);
    posts = posts.map((p) =>
      p.id === id
        ? {
            ...p,
            comments: Number(data.comments) || p.comments,
            commentsList: nextComment ? [...p.commentsList, nextComment] : p.commentsList,
          }
        : p,
    );
    emit();
  },
  addPostToLibrary: async (id: string) => {
    const target = posts.find((item) => item.id === id);
    if (!target) return { importedCount: 0, skippedCount: 0 };
    if (target.type === "plugins") {
      const token = getAuthToken();
      if (!token) throw new Error("Please login first");
      const response = await fetch(`/api/community/posts/${id}/add-to-library`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add plugin to library");
      }
      posts = posts.map((p) =>
        p.id === id
          ? {
              ...p,
              isAddedToLibrary: true,
            }
          : p,
      );
      emit();
      return {
        importedCount: Number(data.importedCount) || 0,
        skippedCount: Number(data.skippedCount) || 0,
      };
    }
    if (target.type !== "templates") {
      return { importedCount: 0, skippedCount: 0 };
    }
    const token = getAuthToken();
    if (!token) throw new Error("Please login first");
    const response = await fetch(`/api/community/posts/${id}/add-to-library`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to add templates to library");
    }
    posts = posts.map((p) =>
      p.id === id
        ? {
            ...p,
            isAddedToLibrary: true,
          }
        : p,
    );
    emit();
    return {
      importedCount: Number(data.importedCount) || 0,
      skippedCount: Number(data.skippedCount) || 0,
    };
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};

export function useCommunityPosts() {
  const snapshot = useSyncExternalStore(communityStore.subscribe, communityStore.getPosts);
  useEffect(() => {
    void communityStore.loadPosts().catch(() => {});
  }, []);
  return snapshot;
}
