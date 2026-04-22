export const PLUGIN_CAPABILITIES = [
  "context.history.read",
  "context.pageHtml.read",
  "context.selection.read",
  "ai.chat.invoke",
  "ai.image.generate",
  "storage.private",
  "ui.toast",
  "ui.openPanel",
  "editor.slide.read",
  "editor.slide.write",
  "editor.selector.control",
  "editor.resource.read",
  "editor.resource.write",
] as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export type PluginPermissionLevel = "required" | "optional";

export type PluginPermissionRecord = {
  capability: PluginCapability;
  level?: PluginPermissionLevel;
  reason?: string;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  entry: string;
  description?: string;
  author?: string;
  screenshots?: string[];
  permissions: PluginPermissionRecord[];
};

export type PluginMarketItem = {
  id: string;
  manifestId?: string;
  ownerUserId?: number;
  name: string;
  description: string;
  author: string;
  version: string;
  entryHtml: string;
  screenshots: string[];
  manifest: PluginManifest;
  installed?: boolean;
  enabled?: boolean;
  grantedPermissions?: PluginCapability[];
  downloads?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type InstalledPlugin = {
  id: string;
  manifestId?: string;
  name: string;
  description: string;
  author: string;
  version: string;
  entryHtml: string;
  enabled: boolean;
  manifest: PluginManifest;
  grantedPermissions: PluginCapability[];
  requiresReauth?: boolean;
  missingPermissions?: PluginCapability[];
  installedAt?: number;
};

export function isPluginCapability(value: unknown): value is PluginCapability {
  return PLUGIN_CAPABILITIES.includes(value as PluginCapability);
}

export function normalizePluginPermissions(input: unknown): PluginPermissionRecord[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as { capability?: unknown; level?: unknown; reason?: unknown };
      const capability = String(source.capability || "").trim();
      if (!isPluginCapability(capability)) return null;
      const level: PluginPermissionLevel = source.level === "optional" ? "optional" : "required";
      return {
        capability,
        level,
        reason: String(source.reason || "").trim().slice(0, 300),
      };
    })
    .filter(Boolean) as PluginPermissionRecord[];
}

export function normalizePluginManifest(input: unknown): PluginManifest | null {
  if (!input || typeof input !== "object") return null;
  const source = input as {
    id?: unknown;
    name?: unknown;
    version?: unknown;
    entry?: unknown;
    description?: unknown;
    author?: unknown;
    screenshots?: unknown;
    permissions?: unknown;
  };
  const id = String(source.id || "").trim().slice(0, 100);
  const name = String(source.name || "").trim().slice(0, 120);
  const version = String(source.version || "").trim().slice(0, 30);
  const entry = String(source.entry || "").trim().slice(0, 200);
  const permissions = normalizePluginPermissions(source.permissions).slice(0, 20);
  if (!id || !name || !version || !entry || permissions.length === 0) return null;
  const screenshots = Array.isArray(source.screenshots)
    ? source.screenshots.map((item) => String(item || "").trim().slice(0, 2000)).filter(Boolean).slice(0, 8)
    : [];
  return {
    id,
    name,
    version,
    entry,
    description: String(source.description || "").trim().slice(0, 400),
    author: String(source.author || "").trim().slice(0, 120),
    screenshots,
    permissions,
  };
}
