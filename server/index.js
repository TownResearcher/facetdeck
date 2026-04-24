import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import sqlite3 from "sqlite3";
import OSS from "ali-oss";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import { Resend } from "resend";
import svgCaptcha from "svg-captcha";
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

dotenv.config();

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const APP_BASE_URL = process.env.APP_BASE_URL || FRONTEND_ORIGIN;
const FACETDECK_DISTRIBUTION_MODE = String(process.env.FACETDECK_DISTRIBUTION_MODE || "oss")
  .trim()
  .toLowerCase() === "saas"
  ? "saas"
  : "oss";
const IS_SAAS_MODE = FACETDECK_DISTRIBUTION_MODE === "saas";
const NODE_ENV = String(process.env.NODE_ENV || "development").trim().toLowerCase();
const REQUIRE_OSS_STORAGE = String(
  process.env.REQUIRE_OSS_STORAGE || (IS_SAAS_MODE && NODE_ENV === "production" ? "true" : "false"),
)
  .trim()
  .toLowerCase() === "true";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const SQLITE_PATH = process.env.SQLITE_PATH || "./database/auth.db";
const APP_NAME = process.env.APP_NAME || "FacetDeck";
const CODE_EXPIRES_MINUTES = Number(process.env.AUTH_CODE_EXPIRES_MINUTES || 10);
const RESET_CODE_EXPIRES_MINUTES = Number(process.env.RESET_CODE_EXPIRES_MINUTES || 10);
const CAPTCHA_EXPIRES_MINUTES = Number(process.env.CAPTCHA_EXPIRES_MINUTES || 5);
const CAPTCHA_LENGTH = Number(process.env.CAPTCHA_LENGTH || 6);
const CAPTCHA_NOISE = Number(process.env.CAPTCHA_NOISE || 8);
const CAPTCHA_MAX_TRIES = Number(process.env.CAPTCHA_MAX_TRIES || 3);
const SEND_CODE_LIMIT_PER_IP_WINDOW_MS = Number(process.env.SEND_CODE_LIMIT_PER_IP_WINDOW_MS || 60_000);
const SEND_CODE_LIMIT_PER_IP_MAX = Number(process.env.SEND_CODE_LIMIT_PER_IP_MAX || 5);
const SEND_CODE_LIMIT_PER_EMAIL_WINDOW_MS = Number(process.env.SEND_CODE_LIMIT_PER_EMAIL_WINDOW_MS || 60_000);
const SEND_CODE_LIMIT_PER_EMAIL_MAX = Number(process.env.SEND_CODE_LIMIT_PER_EMAIL_MAX || 3);
const OSS_REGION = String(process.env.OSS_REGION || "").trim();
const OSS_BUCKET = String(process.env.OSS_BUCKET || "").trim();
const OSS_ACCESS_KEY_ID = String(process.env.OSS_ACCESS_KEY_ID || "").trim();
const OSS_ACCESS_KEY_SECRET = String(process.env.OSS_ACCESS_KEY_SECRET || "").trim();
const OSS_ENDPOINT = String(process.env.OSS_ENDPOINT || "").trim();
const OSS_PUBLIC_BASE_URL = String(process.env.OSS_PUBLIC_BASE_URL || "").trim();
const OSS_FOLDER = String(process.env.OSS_FOLDER || "assets").trim();
const INITIAL_SYSTEM_CREDITS = Number(process.env.INITIAL_SYSTEM_CREDITS || 200_000);
const CLOUD_DRIVE_QUOTA_BYTES = Number(process.env.CLOUD_DRIVE_QUOTA_BYTES || 5 * 1024 * 1024 * 1024);
const INVITE_REWARD_CREDITS = Number(process.env.INVITE_REWARD_CREDITS || 50_000);
const CREDIT_COST_INPUT_PER_M_TOKENS = Number(process.env.CREDIT_COST_INPUT_PER_M_TOKENS || 20_000);
const CREDIT_COST_OUTPUT_PER_M_TOKENS = Number(process.env.CREDIT_COST_OUTPUT_PER_M_TOKENS || 120_000);
const CREDIT_COST_IMAGE_PER_GENERATION = Number(process.env.CREDIT_COST_IMAGE_PER_GENERATION || 2_000);
const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PLUGIN_CAPABILITIES = [
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
];
const PLUGIN_RATE_LIMIT_WINDOW_MS = 60_000;
const PLUGIN_RATE_LIMITS = {
  "context.history.read": 60,
  "context.pageHtml.read": 120,
  "context.selection.read": 120,
  "ai.chat.invoke": 10,
  "ai.image.generate": 6,
  "storage.private": 80,
  "ui.toast": 120,
  "ui.openPanel": 120,
  "editor.slide.read": 120,
  "editor.slide.write": 120,
  "editor.selector.control": 120,
  "editor.resource.read": 120,
  "editor.resource.write": 120,
};

const PRIVATE_SAAS_SERVER_PATH = resolve(process.cwd(), "private", "saas", "server.private.js");
let privateSaasModule = null;
if (existsSync(PRIVATE_SAAS_SERVER_PATH)) {
  try {
    privateSaasModule = await import(pathToFileURL(PRIVATE_SAAS_SERVER_PATH).href);
  } catch (error) {
    console.warn("Failed to load private SaaS module:", error instanceof Error ? error.message : error);
  }
}

const dbFile = resolve(process.cwd(), SQLITE_PATH);
mkdirSync(dirname(dbFile), { recursive: true });

const db = new sqlite3.Database(dbFile);
const captchaStore = new Map();
const rateLimitStore = new Map();
const pptJobStore = new Map();
const pptJobAbortControllers = new Map();
const PPT_JOB_CANCELLED_ERROR = "__PPT_JOB_CANCELLED__";

const PROJECT_STYLE_PRESETS_PATH = resolve(
  process.cwd(),
  "guidelines",
  "ppt-style",
  "STYLE_PRESETS.md",
);
const PROJECT_VIEWPORT_BASE_CSS_PATH = resolve(
  process.cwd(),
  "guidelines",
  "ppt-style",
  "viewport-base.css",
);
const PROJECT_HTML_TEMPLATE_PATH = resolve(
  process.cwd(),
  "guidelines",
  "ppt-style",
  "html-template.md",
);
const PROJECT_ANIMATION_PATTERNS_PATH = resolve(
  process.cwd(),
  "guidelines",
  "ppt-style",
  "animation-patterns.md",
);
const USER_PRESET_ROOT = resolve(process.cwd(), "database", "user-presets");
mkdirSync(USER_PRESET_ROOT, { recursive: true });
const LOCAL_UPLOAD_ROOT = resolve(process.cwd(), "database", "uploads");
mkdirSync(LOCAL_UPLOAD_ROOT, { recursive: true });
const BUILTIN_PRESETS = [
  { id: "builtin-bold-signal", name: "Bold Signal", description: "High-contrast and assertive visuals.", colors: { primary: "#ef4444", secondary: "#f97316", bg: "#111827", text: "#f9fafb" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-electric-studio", name: "Electric Studio", description: "Vivid gradients and energetic composition.", colors: { primary: "#3b82f6", secondary: "#8b5cf6", bg: "#0b1020", text: "#e5e7eb" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-dark-botanical", name: "Dark Botanical", description: "Organic accents on deep dark background.", colors: { primary: "#22c55e", secondary: "#84cc16", bg: "#0f172a", text: "#ecfeff" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-creative-voltage", name: "Creative Voltage", description: "Playful bold accents with punchy contrast.", colors: { primary: "#f59e0b", secondary: "#ec4899", bg: "#111827", text: "#f8fafc" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-neon-cyber", name: "Neon Cyber", description: "Neon glow and futuristic dark-tech look.", colors: { primary: "#06b6d4", secondary: "#a855f7", bg: "#020617", text: "#e2e8f0" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-split-pastel", name: "Split Pastel", description: "Soft pastel tones with split-layout rhythm.", colors: { primary: "#fb7185", secondary: "#60a5fa", bg: "#fff7ed", text: "#1f2937" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-notebook-tabs", name: "Notebook Tabs", description: "Friendly tabbed notebook-inspired layout.", colors: { primary: "#f97316", secondary: "#0ea5e9", bg: "#fffaf0", text: "#334155" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-paper-ink", name: "Paper & Ink", description: "Editorial neutral palette with crisp typography.", colors: { primary: "#1f2937", secondary: "#64748b", bg: "#f8fafc", text: "#0f172a" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-swiss-modern", name: "Swiss Modern", description: "Grid-led minimalist style with bold accents.", colors: { primary: "#dc2626", secondary: "#0f172a", bg: "#ffffff", text: "#111827" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-vintage-editorial", name: "Vintage Editorial", description: "Warm retro editorial mood with texture.", colors: { primary: "#b45309", secondary: "#7c2d12", bg: "#fef3c7", text: "#1f2937" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-pastel-geometry", name: "Pastel Geometry", description: "Geometric pastel composition with clean hierarchy.", colors: { primary: "#a78bfa", secondary: "#f472b6", bg: "#f8fafc", text: "#334155" }, fonts: { title: "Manrope", body: "Inter" } },
  { id: "builtin-terminal-green", name: "Terminal Green", description: "Monochrome terminal-inspired green palette.", colors: { primary: "#22c55e", secondary: "#16a34a", bg: "#052e16", text: "#dcfce7" }, fonts: { title: "Manrope", body: "Inter" } },
];

const STYLE_PRESETS_FALLBACK_REFERENCE = [
  "# Style Presets (Fallback)",
  "",
  "Use these preset families as references (do not copy verbatim):",
  "- Bold Signal / Electric Studio / Dark Botanical",
  "- Creative Voltage / Neon Cyber / Split Pastel",
  "- Notebook Tabs / Paper & Ink / Swiss Modern",
  "- Vintage Editorial / Pastel Geometry / Terminal Green",
  "",
  "Always generate distinctive, non-generic aesthetics with clear typography, layout intent, and color hierarchy.",
].join("\n");

const PREVIEW_MOOD_PRESET_GUIDE = [
  "Mood to suggested presets:",
  "- Impressed/Confident => Bold Signal, Electric Studio, Dark Botanical",
  "- Excited/Energized => Creative Voltage, Neon Cyber, Split Pastel",
  "- Calm/Focused => Notebook Tabs, Paper & Ink, Swiss Modern",
  "- Inspired/Moved => Dark Botanical, Vintage Editorial, Pastel Geometry",
].join("\n");

const ANTI_HOMOGENEITY_PROMPT = [
  "Avoid generic AI-generated aesthetics.",
  "Do NOT use overused fonts like Arial, Roboto, Inter, or generic system-font stacks unless explicitly requested.",
  "Do NOT default to cliched purple-on-white gradients.",
  "Avoid predictable layouts and cookie-cutter component patterns.",
  "Interpret creatively and make context-specific, distinctive visual choices.",
].join("\n");

const SLIDE_LAYOUT_VARIATION_PROMPT = [
  "Maintain one cohesive style system (colors, typography, motion language), but vary composition across slides.",
  "Do not reuse the same dominant layout pattern on adjacent slides.",
  "Alternate structure patterns across slides (for example: hero, split, asymmetric columns, grid, timeline, comparison, quote-focus, stat-highlight).",
  "Do not repeat the exact same background composition treatment on consecutive slides.",
].join("\n");

const VIEWPORT_BASE_CSS_FALLBACK_REFERENCE = [
  "Viewport constraints (mandatory):",
  "- .slide must use height: 100vh and 100dvh",
  "- .slide must use overflow: hidden (no scrolling)",
  "- Typography and spacing should use clamp()",
  "- images max-height: min(50vh, 400px)",
  "- Include responsive breakpoints for short heights (700/600/500)",
  "- Include prefers-reduced-motion handling",
].join("\n");

const HTML_TEMPLATE_FALLBACK_REFERENCE = [
  "HTML template constraints:",
  "- Use semantic sections with class='slide' and inner .slide-content.",
  "- Keep one cohesive theme via CSS variables in :root.",
  "- Typography hard rule: readable text must use var(--font-display) or var(--font-body); decorative artistic lettering is the only exception.",
  "- Prefer self-start keyframe animations for staged entrance effects.",
  "- If state-driven animation is used, core text must stay visible without external classes.",
  "- Keep structure clean and presentation-friendly.",
].join("\n");

const ANIMATION_PATTERNS_FALLBACK_REFERENCE = [
  "Animation guidance:",
  "- Match animation intensity to the requested vibe.",
  "- Prefer transform/opacity motion for performance.",
  "- Prefer self-start animation + @keyframes for entrances.",
  "- State-driven transitions are allowed only with visible fallback content.",
  "- Forbid default-hidden content that depends only on .visible/.active/.show to become visible.",
  "- Use staggered reveal timing for headings and key bullets.",
  "- Include reduced-motion friendly behavior.",
].join("\n");

const SLIDE_ANIMATION_SAFETY_PROMPT = [
  "Animation safety requirements (hard constraints):",
  "- Core content (title, subtitle, body, list text) must remain readable even when no external state class is applied.",
  "- Preferred animation type: self-start keyframes (`animation` + `@keyframes`).",
  "- Optional animation type: state-driven transition, but fallback state must keep core content visible.",
  "- Forbidden pattern: default hidden core content (`opacity:0`, `visibility:hidden`, extreme off-screen transform) that is only revealed by `.visible`, `.active`, `.show`, or similar external classes.",
].join("\n");

const SINGLE_SLIDE_HARD_CONSTRAINTS = [
  "Generate exactly ONE slide as HTML SECTION ONLY.",
  "sectionHtml must start with <section and end with </section>.",
  "Use class='slide' on the section and place main content in .slide-content.",
  "Slide must fit viewport (100vh/100dvh) and must not scroll.",
  "Do not generate multi-section websites, landing pages, or long-scroll web app layouts.",
  "Typography hard constraints:",
  "- All readable text elements (headings, paragraphs, lists, labels, captions, buttons, table text) MUST use var(--font-display) or var(--font-body).",
  "- DO NOT hardcode readable text fonts with literal family names in font-family.",
  "- Exception allowed only for decorative artistic lettering used as non-essential ornament; core content text must still use the font variables.",
].join("\n");

function loadStylePresetReference() {
  try {
    // Keep context bounded to avoid unnecessary token bloat.
    return readFileSync(PROJECT_STYLE_PRESETS_PATH, "utf8").slice(0, 22_000);
  } catch (_error) {
    return STYLE_PRESETS_FALLBACK_REFERENCE;
  }
}

const STYLE_PRESET_REFERENCE = loadStylePresetReference();

function loadViewportBaseCssReference() {
  try {
    // Keep full base CSS available to the model when possible.
    return readFileSync(PROJECT_VIEWPORT_BASE_CSS_PATH, "utf8").slice(0, 22_000);
  } catch (_error) {
    return VIEWPORT_BASE_CSS_FALLBACK_REFERENCE;
  }
}

const VIEWPORT_BASE_CSS_REFERENCE = loadViewportBaseCssReference();

function loadHtmlTemplateReference() {
  try {
    // Keep bounded size to control token usage while preserving architecture guidance.
    return readFileSync(PROJECT_HTML_TEMPLATE_PATH, "utf8").slice(0, 12_000);
  } catch (_error) {
    return HTML_TEMPLATE_FALLBACK_REFERENCE;
  }
}

const HTML_TEMPLATE_REFERENCE = loadHtmlTemplateReference();

function loadAnimationPatternsReference() {
  try {
    // Keep bounded size to control token usage while preserving effect guidance.
    return readFileSync(PROJECT_ANIMATION_PATTERNS_PATH, "utf8").slice(0, 10_000);
  } catch (_error) {
    return ANIMATION_PATTERNS_FALLBACK_REFERENCE;
  }
}

const ANIMATION_PATTERNS_REFERENCE = loadAnimationPatternsReference();

function normalizeVibeToMood(vibe) {
  const source = String(vibe || "").trim().toLowerCase();
  if (!source) return "Impressed/Confident";
  if (source.includes("energetic") || source.includes("excited")) return "Excited/Energized";
  if (source.includes("creative")) return "Excited/Energized";
  if (source.includes("minimal") || source.includes("calm") || source.includes("focus")) return "Calm/Focused";
  if (source.includes("inspired") || source.includes("emotional")) return "Inspired/Moved";
  if (source.includes("professional") || source.includes("confident")) return "Impressed/Confident";
  return "Impressed/Confident";
}

function run(sql, params = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        rejectPromise(err);
        return;
      }
      resolvePromise(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        rejectPromise(err);
        return;
      }
      resolvePromise(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        rejectPromise(err);
        return;
      }
      resolvePromise(rows || []);
    });
  });
}

async function adjustUserCredits(userId, delta) {
  const safeUserId = Number(userId);
  if (!safeUserId || !Number.isFinite(delta) || delta === 0) {
    const row = await get("SELECT credits_balance FROM users WHERE id = ? LIMIT 1", [safeUserId]);
    return Number(row?.credits_balance) || 0;
  }
  await run(
    "UPDATE users SET credits_balance = MAX(0, CAST(COALESCE(credits_balance, 0) + ? AS INTEGER)) WHERE id = ?",
    [Math.round(delta), safeUserId],
  );
  const row = await get("SELECT credits_balance FROM users WHERE id = ? LIMIT 1", [safeUserId]);
  return Number(row?.credits_balance) || 0;
}

async function adjustUserCloudUsageBytes(userId, deltaBytes) {
  const safeUserId = Number(userId);
  const safeDelta = Math.round(Number(deltaBytes) || 0);
  if (!safeUserId || !Number.isFinite(safeDelta) || safeDelta === 0) {
    const row = await get("SELECT cloud_used_bytes FROM users WHERE id = ? LIMIT 1", [safeUserId]);
    return Number(row?.cloud_used_bytes) || 0;
  }
  await run(
    "UPDATE users SET cloud_used_bytes = MAX(0, CAST(COALESCE(cloud_used_bytes, 0) + ? AS INTEGER)) WHERE id = ?",
    [safeDelta, safeUserId],
  );
  const row = await get("SELECT cloud_used_bytes FROM users WHERE id = ? LIMIT 1", [safeUserId]);
  return Number(row?.cloud_used_bytes) || 0;
}

async function recalcUserCloudUsageBytes(userId) {
  const safeUserId = Number(userId);
  if (!safeUserId) return 0;
  const deckSizeRow = await get(
    "SELECT COALESCE(SUM(LENGTH(COALESCE(presentation_json, ''))), 0) AS total FROM repository_decks WHERE user_id = ?",
    [safeUserId],
  );
  const deckBytes = Number(deckSizeRow?.total) || 0;
  const { file } = getUserPresetFile(safeUserId);
  let presetBytes = 0;
  if (existsSync(file)) {
    try {
      presetBytes = Buffer.byteLength(readFileSync(file, "utf8"), "utf8");
    } catch (_error) {
      presetBytes = 0;
    }
  }
  const ossAssetRow = await get(
    "SELECT COALESCE(SUM(COALESCE(byte_size, 0)), 0) AS total FROM managed_assets WHERE owner_user_id = ? AND storage_type = 'oss'",
    [safeUserId],
  );
  const ossBytes = Number(ossAssetRow?.total) || 0;
  const totalBytes = Math.max(0, Math.round(deckBytes + presetBytes + ossBytes));
  await run("UPDATE users SET cloud_used_bytes = ? WHERE id = ?", [totalBytes, safeUserId]);
  return totalBytes;
}

async function consumeLlmCreditsByTokenUsage(userId, promptTokens, completionTokens) {
  const inTokens = Math.max(0, Number(promptTokens) || 0);
  const outTokens = Math.max(0, Number(completionTokens) || 0);
  const inputCost = (inTokens / 1_000_000) * CREDIT_COST_INPUT_PER_M_TOKENS;
  const outputCost = (outTokens / 1_000_000) * CREDIT_COST_OUTPUT_PER_M_TOKENS;
  const totalCost = Math.ceil(inputCost + outputCost);
  if (totalCost <= 0) return;
  await adjustUserCredits(userId, -totalCost);
}

function createHttpError(status, message) {
  const error = new Error(String(message || "Request failed"));
  error.httpStatus = Number(status) || 400;
  return error;
}

async function getUserUsageSnapshot(userId) {
  const safeUserId = Number(userId);
  const row = await get(
    "SELECT credits_balance, cloud_used_bytes, cloud_quota_bytes FROM users WHERE id = ? LIMIT 1",
    [safeUserId],
  );
  return {
    creditsBalance: Number(row?.credits_balance) || 0,
    cloudUsedBytes: Number(row?.cloud_used_bytes) || 0,
    cloudQuotaBytes: Number(row?.cloud_quota_bytes) || Math.max(0, Math.floor(CLOUD_DRIVE_QUOTA_BYTES)),
  };
}

async function ensureManagedCreditsAvailable(userId, requiredCredits = 1) {
  const snapshot = await getUserUsageSnapshot(userId);
  const minimum = Math.max(1, Math.round(Number(requiredCredits) || 1));
  if (snapshot.creditsBalance < minimum) {
    throw createHttpError(402, "积分不足，请充值或切换到 Custom 模式。");
  }
}

async function getUserDeckStorageBytes(userId) {
  const safeUserId = Number(userId);
  const row = await get(
    "SELECT COALESCE(SUM(LENGTH(COALESCE(presentation_json, ''))), 0) AS total FROM repository_decks WHERE user_id = ?",
    [safeUserId],
  );
  return Number(row?.total) || 0;
}

async function ensureCloudCapacityForProjectedUsage(userId, projectedBytes) {
  const snapshot = await getUserUsageSnapshot(userId);
  const projected = Math.max(0, Math.round(Number(projectedBytes) || 0));
  if (projected > snapshot.cloudQuotaBytes) {
    throw createHttpError(507, "云盘空间不足，请清理仓库后再试。");
  }
}

async function ensureCloudCapacityForAdditionalBytes(userId, additionalBytes) {
  const cloudUsedBytes = await recalcUserCloudUsageBytes(userId);
  const snapshot = await getUserUsageSnapshot(userId);
  const projected = cloudUsedBytes + Math.max(0, Math.round(Number(additionalBytes) || 0));
  if (projected > snapshot.cloudQuotaBytes) {
    throw createHttpError(507, "云盘空间不足，请清理仓库后再试。");
  }
}

function toManagedAssetKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let cleaned = raw.replace(/^['"(]+|['")]+$/g, "").trim();
  cleaned = cleaned.replace(/[),.;]+$/g, "");
  if (!cleaned) return "";
  if (/^\/uploads\//i.test(cleaned)) {
    return cleaned.split("?")[0].split("#")[0];
  }
  if (!/^https?:\/\//i.test(cleaned)) {
    return "";
  }
  try {
    const parsed = new URL(cleaned);
    const pathname = `${parsed.pathname || "/"}`.split("?")[0].split("#")[0];
    if (/^\/uploads\//i.test(pathname)) {
      return pathname;
    }
    return `${parsed.origin}${pathname}`;
  } catch (_error) {
    return "";
  }
}

function extractManagedAssetKeysFromText(value) {
  const text = String(value || "");
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s"'<>]+|\/uploads\/[^\s"'<>]+/gi) || [];
  const unique = new Set();
  for (const item of matches) {
    const key = toManagedAssetKey(item);
    if (key) unique.add(key);
  }
  return [...unique];
}

function collectManagedAssetKeysFromPresentation(presentation) {
  const source = presentation && typeof presentation === "object" ? presentation : {};
  const keys = new Set();
  const slides = Array.isArray(source.slides) ? source.slides : [];
  const elements = Array.isArray(source.elements) ? source.elements : [];
  const snapshots = Array.isArray(source.versionSnapshots) ? source.versionSnapshots : [];
  for (const slide of slides) {
    for (const key of extractManagedAssetKeysFromText(slide?.html)) {
      keys.add(key);
    }
  }
  for (const element of elements) {
    const key = toManagedAssetKey(element?.url);
    if (key) keys.add(key);
  }
  for (const snapshot of snapshots) {
    const snapshotSlides = Array.isArray(snapshot?.slides) ? snapshot.slides : [];
    for (const slide of snapshotSlides) {
      for (const key of extractManagedAssetKeysFromText(slide?.html)) {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

function collectManagedAssetKeysFromCommunityPost({ hasImage, imageUrl }) {
  if (!hasImage) return [];
  const key = toManagedAssetKey(imageUrl);
  return key ? [key] : [];
}

async function registerManagedAssetRecord({ publicUrl, storageType, storageKey = "", localPath = "", ownerUserId = 0, byteSize = 0 }) {
  const assetKey = toManagedAssetKey(publicUrl);
  if (!assetKey) return "";
  const now = Date.now();
  await run(
    `INSERT INTO managed_assets (
      asset_key, public_url, storage_type, storage_key, local_path, owner_user_id, byte_size, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_key) DO UPDATE SET
      public_url = excluded.public_url,
      storage_type = excluded.storage_type,
      storage_key = excluded.storage_key,
      local_path = excluded.local_path,
      owner_user_id = excluded.owner_user_id,
      byte_size = excluded.byte_size`,
    [
      assetKey,
      String(publicUrl || "").trim(),
      String(storageType || "unknown").trim().slice(0, 40) || "unknown",
      String(storageKey || "").trim(),
      String(localPath || "").trim(),
      Number(ownerUserId) || 0,
      Math.max(0, Math.round(Number(byteSize) || 0)),
      now,
    ],
  );
  return assetKey;
}

function createSourceRefId(userId, entityId) {
  return `${Number(userId) || 0}:${String(entityId || "").trim()}`;
}

function isIgnorableAssetDeleteError(error) {
  const status = Number(error?.status) || 0;
  if (status === 404) return true;
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return message.includes("not found") || message.includes("no such file");
}

async function deleteManagedAssetStorage(assetRow) {
  const storageType = String(assetRow?.storage_type || "").trim().toLowerCase();
  if (storageType === "oss") {
    if (!ossClient) return;
    const objectKey = String(assetRow?.storage_key || "").trim();
    if (!objectKey) return;
    try {
      await ossClient.delete(objectKey);
    } catch (error) {
      if (!isIgnorableAssetDeleteError(error)) {
        throw error;
      }
    }
    return;
  }
  if (storageType === "local") {
    const localPath = String(assetRow?.local_path || "").trim();
    if (!localPath || !existsSync(localPath)) return;
    try {
      unlinkSync(localPath);
    } catch (error) {
      if (!isIgnorableAssetDeleteError(error)) {
        throw error;
      }
    }
  }
}

async function purgeUnreferencedManagedAssets(assetKeys) {
  const uniqueKeys = [...new Set((Array.isArray(assetKeys) ? assetKeys : []).map((item) => String(item || "").trim()).filter(Boolean))];
  for (const assetKey of uniqueKeys) {
    const refRow = await get("SELECT COUNT(*) AS total FROM managed_asset_references WHERE asset_key = ?", [assetKey]);
    if ((Number(refRow?.total) || 0) > 0) {
      continue;
    }
    const assetRow = await get(
      "SELECT asset_key, storage_type, storage_key, local_path FROM managed_assets WHERE asset_key = ? LIMIT 1",
      [assetKey],
    );
    if (!assetRow) continue;
    try {
      await deleteManagedAssetStorage(assetRow);
    } catch (_error) {
      continue;
    }
    await run("DELETE FROM managed_assets WHERE asset_key = ?", [assetKey]);
  }
}

async function syncManagedAssetReferencesForSource({ sourceType, sourceId, assetKeys }) {
  const normalizedSourceType = String(sourceType || "").trim();
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalizedSourceType || !normalizedSourceId) return;
  const nextKeys = [...new Set((Array.isArray(assetKeys) ? assetKeys : []).map((item) => String(item || "").trim()).filter(Boolean))];
  const existingRows = await all(
    "SELECT asset_key FROM managed_asset_references WHERE source_type = ? AND source_id = ?",
    [normalizedSourceType, normalizedSourceId],
  );
  const existingKeys = new Set(existingRows.map((row) => String(row.asset_key || "").trim()).filter(Boolean));
  const nextSet = new Set(nextKeys);
  const toRemove = [...existingKeys].filter((key) => !nextSet.has(key));
  const toMaybeAdd = nextKeys.filter((key) => !existingKeys.has(key));
  if (toRemove.length > 0) {
    for (const assetKey of toRemove) {
      await run(
        "DELETE FROM managed_asset_references WHERE asset_key = ? AND source_type = ? AND source_id = ?",
        [assetKey, normalizedSourceType, normalizedSourceId],
      );
    }
    await purgeUnreferencedManagedAssets(toRemove);
  }
  if (toMaybeAdd.length > 0) {
    const placeholders = toMaybeAdd.map(() => "?").join(", ");
    const knownRows = await all(
      `SELECT asset_key FROM managed_assets WHERE asset_key IN (${placeholders})`,
      toMaybeAdd,
    );
    const knownSet = new Set(knownRows.map((row) => String(row.asset_key || "").trim()).filter(Boolean));
    const now = Date.now();
    for (const assetKey of toMaybeAdd) {
      if (!knownSet.has(assetKey)) continue;
      await run(
        `INSERT OR IGNORE INTO managed_asset_references (asset_key, source_type, source_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [assetKey, normalizedSourceType, normalizedSourceId, now],
      );
    }
  }
}

async function clearManagedAssetReferencesForSource(sourceType, sourceId) {
  await syncManagedAssetReferencesForSource({ sourceType, sourceId, assetKeys: [] });
}

async function rebuildManagedAssetReferences() {
  await run("DELETE FROM managed_asset_references");
  const knownAssets = await all("SELECT asset_key FROM managed_assets");
  const knownSet = new Set(knownAssets.map((row) => String(row.asset_key || "").trim()).filter(Boolean));
  if (knownSet.size === 0) return;
  const now = Date.now();
  const deckRows = await all("SELECT id, user_id, presentation_json FROM repository_decks");
  for (const row of deckRows) {
    let presentation = {};
    try {
      const parsed = JSON.parse(String(row.presentation_json || "{}"));
      presentation = parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      presentation = {};
    }
    const keys = collectManagedAssetKeysFromPresentation(presentation).filter((key) => knownSet.has(key));
    const sourceId = createSourceRefId(row.user_id, row.id);
    for (const assetKey of keys) {
      await run(
        `INSERT OR IGNORE INTO managed_asset_references (asset_key, source_type, source_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [assetKey, "repository_deck", sourceId, now],
      );
    }
  }
  const postRows = await all("SELECT id, has_image, image_url FROM community_posts WHERE has_image = 1");
  for (const row of postRows) {
    const keys = collectManagedAssetKeysFromCommunityPost({
      hasImage: Number(row.has_image) === 1,
      imageUrl: row.image_url,
    }).filter((key) => knownSet.has(key));
    for (const assetKey of keys) {
      await run(
        `INSERT OR IGNORE INTO managed_asset_references (asset_key, source_type, source_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [assetKey, "community_post", String(row.id || "").trim(), now],
      );
    }
  }
}

async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      invite_code TEXT UNIQUE,
      invited_by_user_id INTEGER,
      use_managed_models INTEGER NOT NULL DEFAULT 1,
      credits_balance INTEGER NOT NULL DEFAULT ${Math.max(0, Math.floor(INITIAL_SYSTEM_CREDITS))},
      cloud_used_bytes INTEGER NOT NULL DEFAULT 0,
      cloud_quota_bytes INTEGER NOT NULL DEFAULT 5368709120,
      created_at INTEGER NOT NULL
    )
  `);
  const userColumns = await all("PRAGMA table_info(users)");
  if (!userColumns.some((column) => column.name === "display_name")) {
    await run("ALTER TABLE users ADD COLUMN display_name TEXT");
  }
  if (!userColumns.some((column) => column.name === "invite_code")) {
    await run("ALTER TABLE users ADD COLUMN invite_code TEXT");
  }
  if (!userColumns.some((column) => column.name === "invited_by_user_id")) {
    await run("ALTER TABLE users ADD COLUMN invited_by_user_id INTEGER");
  }
  if (!userColumns.some((column) => column.name === "use_managed_models")) {
    await run("ALTER TABLE users ADD COLUMN use_managed_models INTEGER NOT NULL DEFAULT 1");
  }
  if (!userColumns.some((column) => column.name === "credits_balance")) {
    await run(`ALTER TABLE users ADD COLUMN credits_balance INTEGER NOT NULL DEFAULT ${Math.max(0, Math.floor(INITIAL_SYSTEM_CREDITS))}`);
  }
  if (!userColumns.some((column) => column.name === "cloud_used_bytes")) {
    await run("ALTER TABLE users ADD COLUMN cloud_used_bytes INTEGER NOT NULL DEFAULT 0");
  }
  if (!userColumns.some((column) => column.name === "cloud_quota_bytes")) {
    await run(`ALTER TABLE users ADD COLUMN cloud_quota_bytes INTEGER NOT NULL DEFAULT ${Math.max(0, Math.floor(CLOUD_DRIVE_QUOTA_BYTES))}`);
  }
  const userRows = await all("SELECT id, email, display_name, invite_code, credits_balance, cloud_quota_bytes FROM users ORDER BY id ASC");
  const seenDisplayNames = new Set();
  for (const row of userRows) {
    let nextDisplayName = String(row.display_name || "").trim();
    const normalized = nextDisplayName.toLowerCase();
    if (!nextDisplayName || seenDisplayNames.has(normalized)) {
      nextDisplayName = await generateUniqueInitialDisplayName();
    }
    seenDisplayNames.add(nextDisplayName.toLowerCase());
    if (nextDisplayName !== String(row.display_name || "").trim()) {
      await run("UPDATE users SET display_name = ? WHERE id = ?", [nextDisplayName, row.id]);
    }
    if (!Number.isFinite(Number(row.credits_balance))) {
      await run("UPDATE users SET credits_balance = ? WHERE id = ?", [Math.max(0, Math.floor(INITIAL_SYSTEM_CREDITS)), row.id]);
    }
    if (!Number.isFinite(Number(row.cloud_quota_bytes)) || Number(row.cloud_quota_bytes) <= 0) {
      await run("UPDATE users SET cloud_quota_bytes = ? WHERE id = ?", [Math.max(0, Math.floor(CLOUD_DRIVE_QUOTA_BYTES)), row.id]);
    }
    const existingInviteCode = String(row.invite_code || "").trim().toUpperCase();
    if (!existingInviteCode) {
      const nextInviteCode = await generateUniqueInviteCode();
      await run("UPDATE users SET invite_code = ? WHERE id = ?", [nextInviteCode, row.id]);
    }
  }
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name_unique ON users(display_name COLLATE NOCASE)");
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code_unique ON users(invite_code)");

  await run(`
    CREATE TABLE IF NOT EXISTS email_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_email_codes_purpose ON email_codes(purpose)`);

  await run(`
    CREATE TABLE IF NOT EXISTS model_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      model_id TEXT NOT NULL,
      api_key TEXT NOT NULL,
      api_url TEXT NOT NULL,
      auto_concat INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, type)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_model_configs_user ON model_configs(user_id)`);
  const columns = await all("PRAGMA table_info(model_configs)");
  if (!columns.some((column) => column.name === "auto_concat")) {
    await run("ALTER TABLE model_configs ADD COLUMN auto_concat INTEGER NOT NULL DEFAULT 1");
  }

  await run(`
    CREATE TABLE IF NOT EXISTS repository_decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      share_code TEXT UNIQUE,
      slide_count INTEGER NOT NULL DEFAULT 0,
      theme_primary TEXT NOT NULL DEFAULT '#ff6b35',
      theme_secondary TEXT NOT NULL DEFAULT '#ff8a5c',
      presentation_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_repository_decks_user ON repository_decks(user_id)`);
  const deckColumns = await all("PRAGMA table_info(repository_decks)");
  if (!deckColumns.some((column) => column.name === "share_code")) {
    await run("ALTER TABLE repository_decks ADD COLUMN share_code TEXT");
  }
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_repository_decks_share_code ON repository_decks(share_code)`);

  await run(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      has_file INTEGER NOT NULL DEFAULT 0,
      has_image INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      template_attachments_json TEXT NOT NULL DEFAULT '[]',
      plugin_manifest_json TEXT NOT NULL DEFAULT '{}',
      plugin_entry_html TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_community_posts_type ON community_posts(type)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts(created_at DESC)`);
  const communityPostColumns = await all("PRAGMA table_info(community_posts)");
  if (!communityPostColumns.some((column) => column.name === "plugin_manifest_json")) {
    await run("ALTER TABLE community_posts ADD COLUMN plugin_manifest_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!communityPostColumns.some((column) => column.name === "plugin_entry_html")) {
    await run("ALTER TABLE community_posts ADD COLUMN plugin_entry_html TEXT NOT NULL DEFAULT ''");
  }

  await run(`
    CREATE TABLE IF NOT EXISTS community_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, created_at ASC)`);

  await run(`
    CREATE TABLE IF NOT EXISTS community_post_likes (
      post_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (post_id, user_id)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_community_post_likes_post ON community_post_likes(post_id)`);

  await run(`
    CREATE TABLE IF NOT EXISTS community_post_library_adds (
      post_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (post_id, user_id)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_community_post_library_adds_post ON community_post_library_adds(post_id)`);
  await run(`
    CREATE TABLE IF NOT EXISTS plugin_market_items (
      id TEXT PRIMARY KEY,
      manifest_id TEXT NOT NULL DEFAULT '',
      owner_user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      author TEXT NOT NULL,
      version TEXT NOT NULL,
      entry_html TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      screenshots_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'approved',
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  const pluginMarketColumns = await all("PRAGMA table_info(plugin_market_items)");
  if (!pluginMarketColumns.some((column) => column.name === "manifest_id")) {
    await run("ALTER TABLE plugin_market_items ADD COLUMN manifest_id TEXT NOT NULL DEFAULT ''");
  }
  const pluginMarketRowsForBackfill = await all("SELECT id, manifest_id, manifest_json FROM plugin_market_items");
  for (const item of pluginMarketRowsForBackfill) {
    const safeManifestId = String(item.manifest_id || "").trim();
    if (safeManifestId) continue;
    const parsed = parsePluginManifest(item.manifest_json);
    const fallbackManifestId = String(parsed?.id || item.id || "").trim().slice(0, 100);
    if (!fallbackManifestId) continue;
    await run("UPDATE plugin_market_items SET manifest_id = ? WHERE id = ?", [fallbackManifestId, String(item.id || "").trim()]);
  }
  await run(`CREATE INDEX IF NOT EXISTS idx_plugin_market_items_updated_at ON plugin_market_items(updated_at DESC)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_plugin_market_items_manifest_id ON plugin_market_items(manifest_id)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_market_owner_manifest ON plugin_market_items(owner_user_id, manifest_id)`);
  await run(`
    CREATE TABLE IF NOT EXISTS plugin_user_installs (
      user_id INTEGER NOT NULL,
      plugin_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      granted_permissions_json TEXT NOT NULL DEFAULT '[]',
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, plugin_id)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_plugin_user_installs_user ON plugin_user_installs(user_id)`);
  await run(`
    CREATE TABLE IF NOT EXISTS plugin_invocation_logs (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      plugin_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      ok INTEGER NOT NULL DEFAULT 1,
      error_message TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_plugin_invocation_logs_user_time ON plugin_invocation_logs(user_id, created_at DESC)`);
  await run(`
    CREATE TABLE IF NOT EXISTS plugin_usage_windows (
      user_id INTEGER NOT NULL,
      plugin_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, plugin_id, capability, window_start)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_plugin_usage_windows_updated_at ON plugin_usage_windows(updated_at DESC)`);
  await run(`
    CREATE TABLE IF NOT EXISTS plugin_private_storage (
      user_id INTEGER NOT NULL,
      plugin_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      storage_value TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, plugin_id, storage_key)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_plugin_private_storage_user_plugin ON plugin_private_storage(user_id, plugin_id)`);
  await run(`
    CREATE TABLE IF NOT EXISTS managed_assets (
      asset_key TEXT PRIMARY KEY,
      public_url TEXT NOT NULL,
      storage_type TEXT NOT NULL,
      storage_key TEXT,
      local_path TEXT,
      owner_user_id INTEGER NOT NULL DEFAULT 0,
      byte_size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_managed_assets_owner ON managed_assets(owner_user_id)`);
  await run(`
    CREATE TABLE IF NOT EXISTS managed_asset_references (
      asset_key TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (asset_key, source_type, source_id)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_managed_asset_references_source ON managed_asset_references(source_type, source_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_managed_asset_references_asset ON managed_asset_references(asset_key)`);
  await rebuildManagedAssetReferences();
  for (const row of userRows) {
    await recalcUserCloudUsageBytes(Number(row.id));
  }
  const pluginRows = await all("SELECT id FROM plugin_market_items LIMIT 1");
  if (pluginRows.length === 0) {
    const now = Date.now();
    const sampleManifest = {
      id: "community-html-inspector",
      name: "HTML Inspector",
      version: "1.0.0",
      entry: "index.html",
      description: "Read current page HTML and summarize it with LLM.",
      author: "FacetDeck Team",
      permissions: [
        { capability: "context.pageHtml.read", level: "required", reason: "Need page structure for analysis" },
        { capability: "ai.chat.invoke", level: "required", reason: "Need LLM response generation" },
        { capability: "ui.toast", level: "optional", reason: "Show action result" },
      ],
    };
    await run(
      `INSERT INTO plugin_market_items (
        id, manifest_id, owner_user_id, name, description, author, version, entry_html, manifest_json, screenshots_json, status, downloads, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 0, ?, ?)`,
      [
        "community-html-inspector",
        "community-html-inspector",
        0,
        "HTML Inspector",
        "Analyze active slide HTML and generate quick suggestions.",
        "FacetDeck Team",
        "1.0.0",
        `<!doctype html>
<html lang="en">
  <body style="font-family: sans-serif; margin: 0; padding: 16px;">
    <h3>HTML Inspector</h3>
    <button id="run-btn">Analyze Current Slide</button>
    <pre id="result" style="white-space: pre-wrap; margin-top: 12px;"></pre>
    <script>
      const api = window.FacetDeck?.api;
      async function run() {
        if (!api) return;
        const page = await api.context.getCurrentPageHtml({ maxLength: 10000 });
        const reply = await api.ai.chat.completions.create({
          prompt: "Summarize this slide html and suggest 3 improvements:\\n" + page.html
        });
        document.getElementById("result").textContent = reply.text || "";
      }
      document.getElementById("run-btn").addEventListener("click", run);
    </script>
  </body>
</html>`,
        JSON.stringify(sampleManifest),
        JSON.stringify([]),
        now,
        now,
      ],
    );
  }
}

const ossClient = OSS_REGION && OSS_BUCKET && OSS_ACCESS_KEY_ID && OSS_ACCESS_KEY_SECRET
  ? new OSS({
      region: OSS_REGION,
      bucket: OSS_BUCKET,
      accessKeyId: OSS_ACCESS_KEY_ID,
      accessKeySecret: OSS_ACCESS_KEY_SECRET,
      endpoint: OSS_ENDPOINT || undefined,
    })
  : null;

function getOssPublicUrl(objectKey) {
  const safeKey = String(objectKey || "").replace(/^\/+/, "");
  if (!safeKey) return "";
  if (OSS_PUBLIC_BASE_URL) {
    return `${OSS_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${safeKey}`;
  }
  if (!ossClient) return "";
  return `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${safeKey}`;
}

async function uploadImageBufferToOss({ buffer, mimeType, folder = OSS_FOLDER || "assets", ext = "png" }) {
  if (!ossClient) {
    throw new Error("OSS is not configured");
  }
  const cleanFolder = String(folder || "assets").replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "") || "assets";
  const cleanExt = String(ext || "png").replace(/[^a-zA-Z0-9]/g, "") || "png";
  const objectKey = `${cleanFolder}/${Date.now()}-${randomUUID()}.${cleanExt.toLowerCase()}`;
  await ossClient.put(objectKey, buffer, {
    headers: {
      "Content-Type": String(mimeType || "application/octet-stream"),
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-oss-object-acl": "public-read",
    },
  });
  return {
    key: objectKey,
    url: getOssPublicUrl(objectKey),
    ...sniffImageGeometryFromBuffer(buffer, mimeType),
  };
}

function parseImageDataUrl(dataUrl) {
  const value = String(dataUrl || "").trim();
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  const mimeType = String(match[1] || "image/png").toLowerCase();
  const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const buffer = Buffer.from(String(match[2] || ""), "base64");
  if (!buffer || buffer.length === 0) {
    throw new Error("Image payload is empty");
  }
  return { buffer, mimeType, ext };
}

function normalizeImageGeometry(width, height) {
  const imageWidth = Math.max(0, Math.floor(Number(width) || 0));
  const imageHeight = Math.max(0, Math.floor(Number(height) || 0));
  const imageAspectRatio =
    imageWidth > 0 && imageHeight > 0 ? Number((imageWidth / imageHeight).toFixed(6)) : 0;
  const imageOrientation =
    imageWidth > imageHeight ? "landscape" : imageHeight > imageWidth ? "portrait" : "square";
  return {
    imageWidth,
    imageHeight,
    imageAspectRatio,
    imageOrientation,
  };
}

function sniffImageGeometryFromBuffer(buffer, mimeType = "") {
  const safeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  if (safeBuffer.length < 12) return normalizeImageGeometry(0, 0);
  const normalizedMime = String(mimeType || "").toLowerCase();

  // PNG
  if (
    safeBuffer.length >= 24 &&
    safeBuffer[0] === 0x89 &&
    safeBuffer[1] === 0x50 &&
    safeBuffer[2] === 0x4e &&
    safeBuffer[3] === 0x47
  ) {
    const width = safeBuffer.readUInt32BE(16);
    const height = safeBuffer.readUInt32BE(20);
    return normalizeImageGeometry(width, height);
  }

  // GIF
  if (
    safeBuffer.length >= 10 &&
    safeBuffer.toString("ascii", 0, 3) === "GIF"
  ) {
    const width = safeBuffer.readUInt16LE(6);
    const height = safeBuffer.readUInt16LE(8);
    return normalizeImageGeometry(width, height);
  }

  // JPEG
  if (
    safeBuffer.length >= 4 &&
    safeBuffer[0] === 0xff &&
    safeBuffer[1] === 0xd8
  ) {
    let offset = 2;
    while (offset + 3 < safeBuffer.length) {
      while (offset < safeBuffer.length && safeBuffer[offset] === 0xff) offset += 1;
      if (offset >= safeBuffer.length) break;
      const marker = safeBuffer[offset];
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 1 >= safeBuffer.length) break;
      const segmentLength = safeBuffer.readUInt16BE(offset);
      if (!segmentLength || offset + segmentLength > safeBuffer.length) break;
      const isSofMarker =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSofMarker && offset + 7 < safeBuffer.length) {
        const height = safeBuffer.readUInt16BE(offset + 3);
        const width = safeBuffer.readUInt16BE(offset + 5);
        return normalizeImageGeometry(width, height);
      }
      offset += segmentLength;
    }
  }

  // WEBP (VP8X/VP8/VP8L)
  if (
    safeBuffer.length >= 30 &&
    safeBuffer.toString("ascii", 0, 4) === "RIFF" &&
    safeBuffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunkType = safeBuffer.toString("ascii", 12, 16);
    if (chunkType === "VP8X" && safeBuffer.length >= 30) {
      const width = 1 + safeBuffer.readUIntLE(24, 3);
      const height = 1 + safeBuffer.readUIntLE(27, 3);
      return normalizeImageGeometry(width, height);
    }
    if (chunkType === "VP8 " && safeBuffer.length >= 30) {
      const width = safeBuffer.readUInt16LE(26) & 0x3fff;
      const height = safeBuffer.readUInt16LE(28) & 0x3fff;
      return normalizeImageGeometry(width, height);
    }
    if (chunkType === "VP8L" && safeBuffer.length >= 25) {
      const b0 = safeBuffer[21];
      const b1 = safeBuffer[22];
      const b2 = safeBuffer[23];
      const b3 = safeBuffer[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return normalizeImageGeometry(width, height);
    }
  }

  if (normalizedMime.includes("svg")) {
    return normalizeImageGeometry(0, 0);
  }

  return normalizeImageGeometry(0, 0);
}

async function persistRemoteImageToOss(imageUrl, folder = `${OSS_FOLDER || "assets"}/ai-generated`) {
  const sourceUrl = String(imageUrl || "").trim();
  if (!ossClient || !/^https?:\/\//i.test(sourceUrl)) {
    return null;
  }
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image source (${response.status})`);
  }
  const contentType = String(response.headers.get("content-type") || "image/png").toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error("Image source is not an image content type");
  }
  const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const uploaded = await uploadImageBufferToOss({
    buffer,
    mimeType: contentType,
    folder,
    ext,
  });
  return {
    ...uploaded,
    byteSize: buffer.length,
    ...sniffImageGeometryFromBuffer(buffer, contentType),
  };
}

function normalizeCommunityType(value) {
  const type = String(value || "").trim().toLowerCase();
  return type === "templates" || type === "discussions" || type === "plugins" ? type : "";
}

function isPluginCapability(value) {
  return PLUGIN_CAPABILITIES.includes(String(value || "").trim());
}

function normalizePluginPermissions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const capability = String(item.capability || "").trim();
      if (!isPluginCapability(capability)) return null;
      const level = String(item.level || "").trim().toLowerCase() === "optional" ? "optional" : "required";
      return {
        capability,
        level,
        reason: String(item.reason || "").trim().slice(0, 300),
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function normalizePluginManifest(value) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || "").trim().slice(0, 100);
  const name = String(value.name || "").trim().slice(0, 120);
  const version = String(value.version || "").trim().slice(0, 40);
  const entry = String(value.entry || "").trim().slice(0, 200);
  const permissions = normalizePluginPermissions(value.permissions);
  if (!id || !name || !version || !entry || permissions.length === 0) return null;
  const screenshots = Array.isArray(value.screenshots)
    ? value.screenshots.map((item) => String(item || "").trim().slice(0, 2_000)).filter(Boolean).slice(0, 8)
    : [];
  return {
    id,
    name,
    version,
    entry,
    description: String(value.description || "").trim().slice(0, 400),
    author: String(value.author || "").trim().slice(0, 120),
    screenshots,
    permissions,
  };
}

function parsePluginManifest(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return normalizePluginManifest(JSON.parse(value));
    } catch (_error) {
      return null;
    }
  }
  return normalizePluginManifest(value);
}

function mapPluginMarketRow(row, options = {}) {
  const manifest = parsePluginManifest(row.manifest_json);
  return {
    id: String(row.id || ""),
    manifestId: String(row.manifest_id || manifest?.id || ""),
    ownerUserId: Number(row.owner_user_id) || 0,
    name: String(row.name || manifest?.name || ""),
    description: String(row.description || manifest?.description || ""),
    author: String(row.author || manifest?.author || "Community Author"),
    version: String(row.version || manifest?.version || "1.0.0"),
    entryHtml: String(row.entry_html || ""),
    screenshots: Array.isArray(options.screenshots) ? options.screenshots : [],
    manifest: manifest || null,
    installed: Boolean(options.installed),
    enabled: Boolean(options.enabled),
    grantedPermissions: Array.isArray(options.grantedPermissions) ? options.grantedPermissions : [],
    downloads: Number(row.downloads) || 0,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  };
}

function normalizeGrantedPermissions(input, manifest) {
  const requested = Array.isArray(manifest?.permissions)
    ? manifest.permissions.map((item) => item.capability).filter((capability) => isPluginCapability(capability))
    : [];
  const requestedSet = new Set(requested);
  const provided = Array.isArray(input) ? input : requested;
  const normalized = provided
    .map((item) => String(item || "").trim())
    .filter((capability, index, list) =>
      isPluginCapability(capability)
      && requestedSet.has(capability)
      && list.indexOf(capability) === index,
    );
  return normalized.length > 0 ? normalized : requested;
}

async function upsertPluginMarketItemByManifest({
  ownerUserId,
  manifest,
  entryHtml,
  description,
  author,
  now = Date.now(),
}) {
  const safeOwnerUserId = Number(ownerUserId) || 0;
  const safeManifestId = String(manifest?.id || "").trim().slice(0, 100);
  if (!safeOwnerUserId || !safeManifestId) {
    throw new Error("Invalid plugin owner or manifest id");
  }
  const existing = await get(
    "SELECT id FROM plugin_market_items WHERE owner_user_id = ? AND manifest_id = ? LIMIT 1",
    [safeOwnerUserId, safeManifestId],
  );
  const pluginUid = String(existing?.id || `plugin-${randomUUID()}`).trim();
  if (existing?.id) {
    await run(
      `UPDATE plugin_market_items
       SET name = ?, description = ?, author = ?, version = ?, entry_html = ?, manifest_json = ?, screenshots_json = ?, updated_at = ?
       WHERE id = ?`,
      [
        manifest.name,
        String(description || manifest.description || "").trim().slice(0, 400),
        String(author || manifest.author || `User ${safeOwnerUserId}`).trim().slice(0, 120),
        manifest.version,
        String(entryHtml || "").trim(),
        JSON.stringify(manifest),
        JSON.stringify(manifest.screenshots || []),
        now,
        pluginUid,
      ],
    );
  } else {
    await run(
      `INSERT INTO plugin_market_items (
        id, manifest_id, owner_user_id, name, description, author, version, entry_html, manifest_json, screenshots_json, status, downloads, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 0, ?, ?)`,
      [
        pluginUid,
        safeManifestId,
        safeOwnerUserId,
        manifest.name,
        String(description || manifest.description || "").trim().slice(0, 400),
        String(author || manifest.author || `User ${safeOwnerUserId}`).trim().slice(0, 120),
        manifest.version,
        String(entryHtml || "").trim(),
        JSON.stringify(manifest),
        JSON.stringify(manifest.screenshots || []),
        now,
        now,
      ],
    );
  }
  return pluginUid;
}

async function ensurePluginInvocationAllowed({ userId, pluginId, capability }) {
  const safeUserId = Number(userId);
  const safePluginId = String(pluginId || "").trim();
  const safeCapability = String(capability || "").trim();
  if (!safeUserId || !safePluginId || !isPluginCapability(safeCapability)) {
    throw new Error("Invalid plugin invocation request");
  }
  const row = await get(
    `SELECT i.enabled, i.granted_permissions_json, m.manifest_json
     FROM plugin_user_installs i
     LEFT JOIN plugin_market_items m ON m.id = i.plugin_id
     WHERE i.user_id = ? AND i.plugin_id = ? LIMIT 1`,
    [safeUserId, safePluginId],
  );
  if (!row) {
    const error = new Error("Plugin is not installed");
    error.httpStatus = 404;
    throw error;
  }
  if (Number(row.enabled) !== 1) {
    const error = new Error("Plugin is disabled");
    error.httpStatus = 403;
    throw error;
  }
  const manifest = parsePluginManifest(row.manifest_json);
  if (!manifest) {
    const error = new Error("Plugin manifest is invalid");
    error.httpStatus = 400;
    throw error;
  }
  const granted = normalizeGrantedPermissions(safeParseJsonArray(row.granted_permissions_json), manifest);
  if (!granted.includes(safeCapability)) {
    const error = new Error(`Capability ${safeCapability} is not granted`);
    error.httpStatus = 403;
    throw error;
  }
  return { manifest, granted };
}

async function enforcePluginRateLimit({ userId, pluginId, capability }) {
  const safeUserId = Number(userId);
  const safePluginId = String(pluginId || "").trim();
  const safeCapability = String(capability || "").trim();
  const limit = Number(PLUGIN_RATE_LIMITS[safeCapability] || 30);
  const now = Date.now();
  const windowStart = now - (now % PLUGIN_RATE_LIMIT_WINDOW_MS);
  const existing = await get(
    `SELECT count FROM plugin_usage_windows
     WHERE user_id = ? AND plugin_id = ? AND capability = ? AND window_start = ? LIMIT 1`,
    [safeUserId, safePluginId, safeCapability, windowStart],
  );
  const nextCount = Number(existing?.count || 0) + 1;
  if (nextCount > limit) {
    const error = new Error("Plugin capability rate limit exceeded");
    error.httpStatus = 429;
    throw error;
  }
  await run(
    `INSERT INTO plugin_usage_windows (user_id, plugin_id, capability, window_start, count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, plugin_id, capability, window_start)
     DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at`,
    [safeUserId, safePluginId, safeCapability, windowStart, nextCount, now],
  );
}

async function logPluginInvocation({ userId, pluginId, capability, ok, errorMessage, durationMs }) {
  await run(
    `INSERT INTO plugin_invocation_logs (id, user_id, plugin_id, capability, ok, error_message, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `plugin-log-${randomUUID()}`,
      Number(userId) || 0,
      String(pluginId || "").trim(),
      String(capability || "").trim(),
      ok ? 1 : 0,
      String(errorMessage || "").trim().slice(0, 500),
      Math.max(0, Math.round(Number(durationMs) || 0)),
      Date.now(),
    ],
  );
}

function normalizeTemplateAttachments(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const colors = item.colors && typeof item.colors === "object" ? item.colors : {};
      const fonts = item.fonts && typeof item.fonts === "object" ? item.fonts : {};
      const id = String(item.id || `template-${index + 1}`).trim().slice(0, 120);
      const name = String(item.name || "").trim().slice(0, 160);
      const description = String(item.description || "").trim().slice(0, 500);
      if (!name) return null;
      return {
        id,
        name,
        description,
        vibe: String(item.vibe || "").trim().slice(0, 180),
        layout: String(item.layout || "").trim().slice(0, 180),
        signatureElements: String(item.signatureElements || "").trim().slice(0, 180),
        animation: String(item.animation || "").trim().slice(0, 180),
        colors: {
          primary: normalizeHexColor(colors.primary, "#ff6b35"),
          secondary: normalizeHexColor(colors.secondary, "#ff8a5c"),
          bg: normalizeHexColor(colors.bg, "#0f172a"),
          text: normalizeHexColor(colors.text, "#f8fafc"),
        },
        fonts: {
          title: String(fonts.title || "Manrope").trim().slice(0, 40),
          body: String(fonts.body || "Inter").trim().slice(0, 40),
        },
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function safeParseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function mapCommunityPostRow(row, likedByMe = false, commentsList = [], author = "User") {
  const templateAttachments = normalizeTemplateAttachments(safeParseJsonArray(row.template_attachments_json));
  const pluginManifest = parsePluginManifest(row.plugin_manifest_json);
  return {
    id: String(row.id),
    type: String(row.type || ""),
    title: String(row.title || ""),
    author: String(author || "User"),
    date: Number(row.created_at) || Date.now(),
    createdAt: Number(row.created_at) || Date.now(),
    description: String(row.description || ""),
    likes: Number(row.likes) || 0,
    comments: Number(row.comments) || 0,
    hasFile: Number(row.has_file) === 1,
    hasImage: Number(row.has_image) === 1,
    imageUrl: String(row.image_url || ""),
    isLiked: Boolean(likedByMe),
    isAddedToLibrary: Boolean(row.isAddedToLibrary),
    templateAttachments,
    pluginManifest,
    pluginEntryHtml: String(row.plugin_entry_html || ""),
    commentsList,
  };
}

async function uploadImageBufferToStorage({ buffer, mimeType, ext, folder, req }) {
  const cleanExt = String(ext || "png").replace(/[^a-zA-Z0-9]/g, "") || "png";
  if (ossClient) {
    const uploaded = await uploadImageBufferToOss({ buffer, mimeType, folder, ext: cleanExt });
    return {
      url: uploaded.url,
      storageType: "oss",
      storageKey: uploaded.key,
      localPath: "",
      byteSize: buffer.length,
      imageWidth: uploaded.imageWidth,
      imageHeight: uploaded.imageHeight,
      imageAspectRatio: uploaded.imageAspectRatio,
      imageOrientation: uploaded.imageOrientation,
    };
  }
  if (REQUIRE_OSS_STORAGE) {
    const error = new Error(
      "OSS is required in this environment. Local fallback storage is disabled.",
    );
    error.httpStatus = 503;
    throw error;
  }
  const localFolder = String(folder || "community")
    .replace(/[^a-zA-Z0-9/_-]/g, "")
    .replace(/^\/+|\/+$/g, "");
  const localDir = resolve(LOCAL_UPLOAD_ROOT, localFolder || "community");
  mkdirSync(localDir, { recursive: true });
  const filename = `${Date.now()}-${randomUUID()}.${cleanExt.toLowerCase()}`;
  const filePath = resolve(localDir, filename);
  writeFileSync(filePath, buffer);
  const publicFolder = localFolder ? `/${localFolder}` : "";
  return {
    url: `${getRequestOrigin(req)}/uploads${publicFolder}/${filename}`,
    storageType: "local",
    storageKey: "",
    localPath: filePath,
    byteSize: buffer.length,
    ...sniffImageGeometryFromBuffer(buffer, mimeType),
  };
}

function generateCode() {
  const value = randomInt(0, 1_000_000);
  return String(value).padStart(6, "0");
}

function deriveDisplayNameFromEmail(email) {
  const source = String(email || "").trim().toLowerCase();
  const local = source.split("@")[0] || "";
  const normalized = local.replace(/[^a-z0-9._-]/gi, " ").replace(/[._-]+/g, " ").trim();
  if (!normalized) {
    return "User";
  }
  return normalized.slice(0, 80);
}

function resolveDisplayName(displayName, email) {
  const cleanDisplayName = String(displayName || "").trim();
  if (cleanDisplayName) {
    return cleanDisplayName.slice(0, 80);
  }
  return deriveDisplayNameFromEmail(email);
}

function generateRandomDisplayNameSuffix(length = 8) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += alphabet[randomInt(0, alphabet.length)];
  }
  return output;
}

function createInitialDisplayNameCandidate() {
  return `FacetDeck${generateRandomDisplayNameSuffix(8)}`;
}

async function isDisplayNameTaken(displayName, excludeUserId = 0) {
  const value = String(displayName || "").trim();
  if (!value) {
    return false;
  }
  const row = excludeUserId
    ? await get(
        "SELECT id FROM users WHERE id != ? AND display_name = ? COLLATE NOCASE LIMIT 1",
        [excludeUserId, value],
      )
    : await get("SELECT id FROM users WHERE display_name = ? COLLATE NOCASE LIMIT 1", [value]);
  return Boolean(row);
}

async function generateUniqueInitialDisplayName(maxAttempts = 80) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = createInitialDisplayNameCandidate();
    const taken = await isDisplayNameTaken(candidate);
    if (!taken) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique display name");
}

function buildInviteCodeCandidate() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FD";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function isInviteCodeTaken(code, excludeUserId = 0) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return false;
  const safeExclude = Number(excludeUserId) || 0;
  const row = await get(
    "SELECT id FROM users WHERE invite_code = ? AND (? <= 0 OR id != ?) LIMIT 1",
    [normalized, safeExclude, safeExclude],
  );
  return Boolean(row);
}

async function generateUniqueInviteCode(maxAttempts = 120) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = buildInviteCodeCandidate();
    const taken = await isInviteCodeTaken(candidate);
    if (!taken) return candidate;
  }
  throw new Error("Failed to generate unique invite code");
}

function createToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function cleanExpiredCaptcha() {
  const now = Date.now();
  for (const [key, value] of captchaStore.entries()) {
    if (value.expiresAt <= now) {
      captchaStore.delete(key);
    }
  }
}

function cleanExpiredRateLimit() {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.windowEndsAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function enforceRateLimit({ key, max, windowMs }) {
  cleanExpiredRateLimit();
  const now = Date.now();
  const existing = rateLimitStore.get(key);
  if (!existing || existing.windowEndsAt <= now) {
    rateLimitStore.set(key, { count: 1, windowEndsAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (existing.count >= max) {
    return { allowed: false, retryAfterMs: existing.windowEndsAt - now };
  }
  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

function randomString(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += chars[randomInt(0, chars.length)];
  }
  return output;
}

function createPptJob({ userId, prompt, style, styleSelection }) {
  const id = `ppt-${Date.now()}-${randomString(6).toLowerCase()}`;
  const now = Date.now();
  const job = {
    id,
    userId,
    prompt,
    style,
    styleSelection: styleSelection || null,
    status: "queued",
    cancelRequested: false,
    progress: 0,
    message: "Queued",
    error: "",
    warnings: [],
    presentation: {
      title: "",
      theme: style ? { primary: style.colors.primary, secondary: style.colors.secondary, tone: style.name } : { primary: "#ff6b35", secondary: "#ff8a5c", tone: "professional" },
      slides: [],
      fullHtml: "",
      htmlPath: "",
    },
    createdAt: now,
    updatedAt: now,
  };
  pptJobStore.set(id, job);
  return job;
}

function updatePptJob(jobId, patch) {
  const job = pptJobStore.get(jobId);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

function getPptJob(jobId) {
  return pptJobStore.get(jobId);
}

function isPptJobCancelled(job) {
  return Boolean(job?.cancelRequested || job?.status === "cancelled");
}

function ensurePptJobRunnable(jobId) {
  const job = getPptJob(jobId);
  if (!job || isPptJobCancelled(job)) {
    throw new Error(PPT_JOB_CANCELLED_ERROR);
  }
  return job;
}

function isPptJobCancelledError(error) {
  return String(error instanceof Error ? error.message : error || "") === PPT_JOB_CANCELLED_ERROR;
}

async function runWithPptJobAbortSignal(jobId, task) {
  ensurePptJobRunnable(jobId);
  const controller = new AbortController();
  pptJobAbortControllers.set(jobId, controller);
  try {
    return await task(controller.signal);
  } finally {
    const current = pptJobAbortControllers.get(jobId);
    if (current === controller) {
      pptJobAbortControllers.delete(jobId);
    }
  }
}

function cancelPptJob(jobId) {
  const job = getPptJob(jobId);
  if (!job) return null;
  job.cancelRequested = true;
  if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
    return job;
  }
  job.status = "cancelled";
  job.message = "Generation cancelled";
  job.error = "";
  job.updatedAt = Date.now();
  const controller = pptJobAbortControllers.get(jobId);
  if (controller) {
    try {
      controller.abort();
    } catch (_error) {}
    pptJobAbortControllers.delete(jobId);
  }
  return job;
}

function cleanupOldPptJobs() {
  const now = Date.now();
  for (const [jobId, job] of pptJobStore.entries()) {
    const ttlMs = job.status === "running" || job.status === "queued"
      ? 30 * 60 * 1000
      : 2 * 60 * 60 * 1000;
    if (now - job.updatedAt > ttlMs) {
      const controller = pptJobAbortControllers.get(jobId);
      if (controller) {
        try {
          controller.abort();
        } catch (_error) {}
        pptJobAbortControllers.delete(jobId);
      }
      pptJobStore.delete(jobId);
    }
  }
}

function issueCaptcha(ip) {
  cleanExpiredCaptcha();
  const generated = svgCaptcha.create({
    size: CAPTCHA_LENGTH,
    noise: CAPTCHA_NOISE,
    color: true,
    width: 200,
    height: 68,
    fontSize: 58,
    background: "#f8fafc",
    ignoreChars: "0oO1iIlL",
    charPreset: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  });
  const text = generated.text.toUpperCase();
  const captchaId = `${Date.now()}-${randomString(8)}`;
  const expiresAt = Date.now() + CAPTCHA_EXPIRES_MINUTES * 60 * 1000;
  captchaStore.set(captchaId, { text, ip, expiresAt, failedAttempts: 0 });
  return {
    captchaId,
    captchaSvg: `data:image/svg+xml;base64,${Buffer.from(generated.data).toString("base64")}`,
  };
}

function verifyCaptcha({ captchaId, captchaText, ip }) {
  cleanExpiredCaptcha();
  const item = captchaStore.get(captchaId);
  if (!item) {
    return { ok: false, error: "Captcha expired, please refresh and try again" };
  }
  if (item.ip !== ip) {
    captchaStore.delete(captchaId);
    return { ok: false, error: "Captcha validation failed" };
  }
  const normalizedText = captchaText.replace(/\s+/g, "").toUpperCase();
  if (item.text !== normalizedText) {
    item.failedAttempts += 1;
    if (item.failedAttempts >= CAPTCHA_MAX_TRIES) {
      captchaStore.delete(captchaId);
      return { ok: false, error: "Captcha failed too many times, please refresh" };
    }
    return { ok: false, error: "Incorrect captcha" };
  }
  captchaStore.delete(captchaId);
  return { ok: true };
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function cleanConfigInput(value) {
  if (!value || typeof value !== "object") {
    return { modelId: "", apiKey: "", apiUrl: "" };
  }
  return {
    modelId: String(value.id || "").trim(),
    apiKey: String(value.key || "").trim(),
    apiUrl: normalizeBaseUrl(value.url),
    autoConcat: value.autoConcat === false ? false : true,
  };
}

function getManagedProviderConfig(type) {
  const getter = privateSaasModule?.getManagedProviderConfig;
  if (typeof getter === "function") {
    const config = getter(type);
    return {
      modelId: String(config?.modelId || "").trim(),
      apiKey: String(config?.apiKey || "").trim(),
      apiUrl: normalizeBaseUrl(String(config?.apiUrl || "")),
      autoConcat: config?.autoConcat === false ? false : true,
    };
  }
  return { modelId: "", apiKey: "", apiUrl: "", autoConcat: true };
}

function hasCompleteProviderConfig(config) {
  return Boolean(config?.modelId && config?.apiKey && config?.apiUrl);
}

async function getUserProviderMode(userId) {
  if (!IS_SAAS_MODE) {
    return "custom";
  }
  const row = await get("SELECT use_managed_models FROM users WHERE id = ? LIMIT 1", [userId]);
  return row?.use_managed_models !== 0 ? "managed" : "custom";
}

async function getStoredProviderConfig(userId, type) {
  const row = await get(
    "SELECT model_id, api_key, api_url, auto_concat, updated_at FROM model_configs WHERE user_id = ? AND type = ?",
    [userId, type],
  );
  if (!row) {
    return null;
  }
  return {
    modelId: String(row.model_id || "").trim(),
    apiKey: String(row.api_key || "").trim(),
    apiUrl: normalizeBaseUrl(row.api_url),
    autoConcat: row.auto_concat !== 0,
    updatedAt: Number(row.updated_at) || null,
  };
}

async function getEffectiveProviderConfig(userId, type) {
  const mode = await getUserProviderMode(userId);
  if (mode === "managed") {
    const managed = getManagedProviderConfig(type);
    return {
      mode,
      source: "managed",
      config: hasCompleteProviderConfig(managed) ? managed : null,
    };
  }
  const custom = await getStoredProviderConfig(userId, type);
  return {
    mode,
    source: "custom",
    config: custom && hasCompleteProviderConfig(custom) ? custom : null,
  };
}

function resolveLlmCompletionUrl(config) {
  const base = normalizeBaseUrl(config.apiUrl);
  if (config.autoConcat) {
    if (base.endsWith("/v1/chat/completions")) {
      return base;
    }
    if (base.endsWith("/v1")) {
      return `${base}/chat/completions`;
    }
    if (base.endsWith("/chat/completions")) {
      const prefix = base.slice(0, -"/chat/completions".length).replace(/\/v1$/, "");
      return `${prefix}/v1/chat/completions`;
    }
    return `${base}/v1/chat/completions`;
  }
  return base;
}

function resolveImageGenerationUrl(config) {
  const base = normalizeBaseUrl(config.apiUrl);
  if (config.autoConcat) {
    if (base.endsWith("/v1/images/generations")) {
      return base;
    }
    if (base.endsWith("/v1")) {
      return `${base}/images/generations`;
    }
    if (base.endsWith("/images/generations")) {
      const prefix = base.slice(0, -"/images/generations".length).replace(/\/v1$/, "");
      return `${prefix}/v1/images/generations`;
    }
    return `${base}/v1/images/generations`;
  }
  return base;
}

function stripCodeFence(text) {
  const source = String(text || "").trim();
  const match = source.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return source;
}

function stripThinkPreamble(text) {
  const source = String(text || "").trim();
  if (!source) {
    return "";
  }
  // Remove complete think blocks first.
  let cleaned = source.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Some providers return an opening <think> without a closing tag.
  // Strip that orphan opening tag, then cut to first JSON token.
  if (/^<think\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/^<think\b[^>]*>/i, "").trim();
    const firstArray = cleaned.indexOf("[");
    const firstObject = cleaned.indexOf("{");
    const firstJsonStart =
      firstArray < 0
        ? firstObject
        : firstObject < 0
        ? firstArray
        : Math.min(firstArray, firstObject);
    if (firstJsonStart > 0) {
      cleaned = cleaned.slice(firstJsonStart).trim();
    }
  }
  return cleaned || source;
}

function parseJsonFromModelContent(content) {
  const cleaned = stripCodeFence(stripThinkPreamble(content));
  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    // Try to find an array first if it looks like one
    const startArray = cleaned.indexOf("[");
    const endArray = cleaned.lastIndexOf("]");
    const startObject = cleaned.indexOf("{");
    const endObject = cleaned.lastIndexOf("}");

    if (startArray >= 0 && endArray > startArray && (startObject === -1 || startArray < startObject)) {
      try {
        return JSON.parse(cleaned.slice(startArray, endArray + 1));
      } catch (e) {}
    }

    if (startObject >= 0 && endObject > startObject) {
      try {
        return JSON.parse(cleaned.slice(startObject, endObject + 1));
      } catch (e) {}
    }

    throw new Error("LLM did not return valid JSON");
  }
}

function normalizeHexColor(value, fallback) {
  const color = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }
  return fallback;
}

function normalizeWizardAsset(rawAsset, index) {
  const source = rawAsset && typeof rawAsset === "object" ? rawAsset : {};
  const id = String(source.id || `asset-${index + 1}`).trim().slice(0, 80) || `asset-${index + 1}`;
  const name = String(source.name || `Image ${index + 1}`).trim().slice(0, 200) || `Image ${index + 1}`;
  const mimeType = String(source.mimeType || "").trim().toLowerCase();
  const dataUrl = String(source.dataUrl || "").trim();
  const imageUrl = String(source.imageUrl || source.url || "").trim();
  const userDescription = String(source.userDescription || "").trim().slice(0, 500);
  const imageWidth = Math.max(0, Math.floor(Number(source.imageWidth) || 0));
  const imageHeight = Math.max(0, Math.floor(Number(source.imageHeight) || 0));
  const imageAspectRatio = Number(source.imageAspectRatio) > 0
    ? Number(Number(source.imageAspectRatio).toFixed(6))
    : (imageWidth > 0 && imageHeight > 0 ? Number((imageWidth / imageHeight).toFixed(6)) : 0);
  const imageOrientation = String(source.imageOrientation || "").trim().toLowerCase();
  const normalizedOrientation = imageOrientation === "landscape" || imageOrientation === "portrait" || imageOrientation === "square"
    ? imageOrientation
    : imageWidth > imageHeight
    ? "landscape"
    : imageHeight > imageWidth
    ? "portrait"
    : "square";
  const forcedAdopt = source.forcedAdopt === true;
  const size = Math.max(0, Number(source.size) || 0);
  const isImageMime = /^image\/[a-z0-9.+-]+$/i.test(mimeType);
  const isDataUrlImage = /^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl);
  const safeDataUrl = isDataUrlImage ? dataUrl.slice(0, 4_000_000) : "";
  const safeImageUrl = /^https?:\/\//i.test(imageUrl) ? imageUrl.slice(0, 2_000) : "";
  return {
    id,
    name,
    mimeType,
    size,
    dataUrl: safeDataUrl,
    imageUrl: safeImageUrl,
    imageWidth,
    imageHeight,
    imageAspectRatio,
    imageOrientation: normalizedOrientation,
    userDescription,
    forcedAdopt,
    isImage: isImageMime || isDataUrlImage || Boolean(safeImageUrl),
  };
}

function hasMissingAssetDescriptions(assets = []) {
  return Array.isArray(assets) && assets.some((asset) => !String(asset?.userDescription || "").trim());
}

function normalizeOutlineDraft(rawPrompt, rawOutline) {
  const source = rawOutline && typeof rawOutline === "object" ? rawOutline : {};
  const normalizedDeck = normalizeDeckDraft(rawPrompt, source);
  const sourceSlides = Array.isArray(source.slides) ? source.slides : [];
  const normalizedSlides = normalizedDeck.slides.map((slide, index) => {
    const sourceSlide = sourceSlides[index] && typeof sourceSlides[index] === "object" ? sourceSlides[index] : {};
    const imageAssetIds = Array.isArray(sourceSlide.imageAssetIds)
      ? sourceSlide.imageAssetIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const aiImagePrompts = Array.isArray(sourceSlide.aiImagePrompts)
      ? sourceSlide.aiImagePrompts
          .map((item, promptIndex) => {
            const sourcePrompt = item && typeof item === "object" ? item : {};
            const prompt = String(sourcePrompt.prompt || sourcePrompt.text || "").trim().slice(0, 500);
            if (!prompt) return null;
            const imageUrl = String(sourcePrompt.imageUrl || "").trim();
            return {
              id: String(sourcePrompt.id || `ai-${index + 1}-${promptIndex + 1}`).trim().slice(0, 80),
              prompt,
              status: imageUrl ? "done" : "idle",
              imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl.slice(0, 2000) : "",
              imageWidth: Math.max(0, Math.floor(Number(sourcePrompt.imageWidth) || 0)),
              imageHeight: Math.max(0, Math.floor(Number(sourcePrompt.imageHeight) || 0)),
              imageAspectRatio: Number(sourcePrompt.imageAspectRatio) > 0 ? Number(Number(sourcePrompt.imageAspectRatio).toFixed(6)) : 0,
              imageOrientation: String(sourcePrompt.imageOrientation || "").trim().toLowerCase(),
              error: "",
            };
          })
          .filter(Boolean)
      : [];
    const normalizedNeeded = sourceSlide.aiImageNeeded === true || aiImagePrompts.length > 0;
    return {
      ...slide,
      imageAssetIds,
      aiImageNeeded: normalizedNeeded,
      aiImagePrompts,
    };
  });
  return {
    title: normalizedDeck.title,
    slides: normalizedSlides,
  };
}

async function generateOutlineWithLlm({ llmConfig, prompt, purpose, length, vibe, slideLanguage, llmLanguage, assets }) {
  const content = await callLlmChatCompletionAdaptiveTokens({
    config: llmConfig,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: [
          "You are a presentation planning agent.",
          "Return strictly valid JSON object only.",
          "Generate a presentation outline that can be edited by users before style generation.",
          "Schema:",
          "{",
          '  "title": "string",',
          '  "slides": [',
          "    {",
          '      "type": "cover|agenda|content|data|summary",',
          '      "title": "string",',
          '      "bullets": ["string"],',
          '      "speakerNotes": "string",',
          '      "slideVisualDirection": "string (visual goal and non-homogeneous web layout direction for this slide)",',
          '      "imageAssetIds": ["string"],',
          '      "aiImageNeeded": true|false,',
          '      "aiImagePrompts": [] | [{ "prompt": "string" }] | [{ "prompt": "string" }, { "prompt": "string" }] | [{ "prompt": "string" }, { "prompt": "string" }, { "prompt": "string" }]',
          "    }",
          "  ]",
          "}",
          "Hard constraints (MUST follow):",
          "- Bullet density limit per slide type:",
          "  - cover: max 2 bullet items",
          "  - agenda/content/data/summary: max 6 bullet items",
          "- Length-to-slide-count rule (strict):",
          "  - If length contains an explicit single number N (e.g. '3', '3 slides', '3 pages'), slides.length MUST equal N.",
          "  - If length is 'Short (5-10)', generate by content rhythm but keep slides.length within [5, 10].",
          "  - If length is 'Medium (10-20)', generate by content rhythm but keep slides.length within [10, 20].",
          "  - If length is 'Long (20+)', generate by content rhythm with slides.length >= 20.",
          "  - Never output fewer than the minimum or more than the maximum when a maximum exists.",
          "Keep each bullet concise and presentation ready.",
          "When user assets are provided, use each asset's userDescription to decide the most suitable slide(s) and assign matching imageAssetIds.",
          "Do not assign the same asset to irrelevant slides just to fill slots.",
          "For EACH slide, analyze whether AI images are needed from three angles: visual aesthetics, content richness, and layout composition balance.",
          "If not needed, set aiImageNeeded=false and aiImagePrompts=[].",
          "If needed, set aiImageNeeded=true and provide 1-3 diverse prompts (never more than 3) tailored to the slide's purpose and composition.",
          "Critical distinction:",
          "- slideVisualDirection is for slide/web visual direction and composition guidance.",
          "- aiImagePrompts are STRICTLY text-to-image prompts for reusable visual assets used inside PPT slides.",
          "aiImagePrompts must ask for standalone assets only (objects, scenes, textures, illustrations, charts-as-assets if needed), not a complete slide.",
          "Never ask the model to generate full PPT pages/screenshots/layout compositions in aiImagePrompts.",
          "In aiImagePrompts, avoid instructions such as: full slide, ppt page, presentation page, title/subtitle text, bullet list, UI wireframe of whole slide.",
          "Do not force images on every slide. Cover/agenda/summary often can be text-led.",
          "Language rule: all textual values in returned JSON (title, slides[].title, bullets, speakerNotes, slideVisualDirection, aiImagePrompts.prompt) MUST use slideLanguage.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          idea: prompt,
          purpose,
          length,
          vibe,
          slideLanguage: String(slideLanguage || "English"),
          llmLanguage: String(llmLanguage || "English"),
          assets,
        }),
      },
    ],
  });
  return parseJsonFromModelContent(content);
}

function normalizePreviewHtml(value) {
  const cleaned = stripCodeFence(String(value || "").trim());
  if (!cleaned) {
    return "";
  }
  if (/<html[\s>]/i.test(cleaned) || /<!doctype html>/i.test(cleaned)) {
    return cleaned;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Style Preview</title>
</head>
<body>
${cleaned}
</body>
</html>`;
}

function normalizeStylePreview(rawStyle, index) {
  const style = rawStyle && typeof rawStyle === "object" ? rawStyle : {};
  const colors = style.colors && typeof style.colors === "object" ? style.colors : {};
  const fonts = style.fonts && typeof style.fonts === "object" ? style.fonts : {};
  return {
    id: String(style.id || `style-${index + 1}`),
    name: String(style.name || `Style ${index + 1}`).trim().slice(0, 50),
    description: String(style.description || "Distinct visual direction preview").trim().slice(0, 180),
    vibe: style.vibe ? String(style.vibe).trim().slice(0, 180) : undefined,
    layout: style.layout ? String(style.layout).trim().slice(0, 180) : undefined,
    signatureElements: style.signatureElements ? String(style.signatureElements).trim().slice(0, 180) : undefined,
    animation: style.animation ? String(style.animation).trim().slice(0, 180) : undefined,
    colors: {
      primary: normalizeHexColor(colors.primary, "#ff6b35"),
      secondary: normalizeHexColor(colors.secondary, "#ff8a5c"),
      bg: normalizeHexColor(colors.bg, "#ffffff"),
      text: normalizeHexColor(colors.text, "#1e293b"),
    },
    fonts: {
      title: String(fonts.title || "Manrope").trim().slice(0, 40),
      body: String(fonts.body || "Inter").trim().slice(0, 40),
    },
    previewHtml: normalizePreviewHtml(style.previewHtml),
  };
}

function buildStyleFromSelection(styleSelection) {
  if (!styleSelection || typeof styleSelection !== "object") {
    return null;
  }
  if (styleSelection.mode === "preset") {
    const presetName = String(styleSelection.presetName || "").trim() || "Custom Preset";
    const payload = styleSelection.payload && typeof styleSelection.payload === "object"
      ? styleSelection.payload
      : {};
    const colors = payload.colors && typeof payload.colors === "object" ? payload.colors : {};
    const fonts = payload.fonts && typeof payload.fonts === "object" ? payload.fonts : {};
    return {
      id: `preset-${presetName.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
      name: presetName,
      description: String(payload.description || `Direct preset selection: ${presetName}`).trim().slice(0, 180),
      vibe: payload.vibe ? String(payload.vibe).trim().slice(0, 180) : undefined,
      layout: payload.layout ? String(payload.layout).trim().slice(0, 180) : undefined,
      signatureElements: payload.signatureElements ? String(payload.signatureElements).trim().slice(0, 180) : undefined,
      animation: payload.animation ? String(payload.animation).trim().slice(0, 180) : undefined,
      colors: {
        primary: normalizeHexColor(colors.primary, "#ff6b35"),
        secondary: normalizeHexColor(colors.secondary, "#ff8a5c"),
        bg: normalizeHexColor(colors.bg, "#0f172a"),
        text: normalizeHexColor(colors.text, "#f8fafc"),
      },
      fonts: {
        title: String(fonts.title || "Manrope").trim().slice(0, 40),
        body: String(fonts.body || "Inter").trim().slice(0, 40),
      },
      previewHtml: "",
    };
  }
  if (styleSelection.mode === "mix") {
    return {
      id: "mix-style",
      name: "Mixed Style",
      description: `Mixed style: base=${styleSelection.baseStyleId || ""}, description=${styleSelection.descriptionFromId || ""}, colors=${styleSelection.colorsFromId || ""}, typography=${styleSelection.typographyFromId || ""}, vibe=${styleSelection.vibeFromId || ""}, layout=${styleSelection.layoutFromId || ""}, signature=${styleSelection.signatureElementsFromId || ""}, animation=${styleSelection.animationFromId || ""}, motion=${styleSelection.motionFromId || ""}`,
      vibe: "",
      layout: "",
      signatureElements: "",
      animation: "",
      colors: {
        primary: "#ff6b35",
        secondary: "#ff8a5c",
        bg: "#0f172a",
        text: "#f8fafc",
      },
      fonts: {
        title: "Manrope",
        body: "Inter",
      },
      previewHtml: "",
      mixSpec: {
        mode: "mix",
        baseStyleId: String(styleSelection.baseStyleId || ""),
        descriptionFromId: String(styleSelection.descriptionFromId || ""),
        colorsFromId: String(styleSelection.colorsFromId || ""),
        typographyFromId: String(styleSelection.typographyFromId || ""),
        vibeFromId: String(styleSelection.vibeFromId || ""),
        layoutFromId: String(styleSelection.layoutFromId || ""),
        signatureElementsFromId: String(styleSelection.signatureElementsFromId || ""),
        animationFromId: String(styleSelection.animationFromId || ""),
        motionFromId: String(styleSelection.motionFromId || ""),
      },
    };
  }
  return null;
}

function getUserPresetFile(userId) {
  const safeUserId = Number(userId);
  const userDir = resolve(USER_PRESET_ROOT, `user-${safeUserId}`);
  return {
    dir: userDir,
    file: resolve(userDir, "presets.json"),
  };
}

function normalizeUserPresetInput(rawPreset, index) {
  const raw = rawPreset && typeof rawPreset === "object" ? rawPreset : {};
  const colors = raw.colors && typeof raw.colors === "object" ? raw.colors : {};
  const fonts = raw.fonts && typeof raw.fonts === "object" ? raw.fonts : {};
  const now = Date.now();
  const id = String(raw.id || `custom-${now}-${index + 1}`).trim().slice(0, 80);
  const name = String(raw.name || "").trim().slice(0, 50);
  if (!name) {
    throw new Error("Preset name is required");
  }
  return {
    id,
    name,
    description: String(raw.description || "").trim().slice(0, 180),
    vibe: String(raw.vibe || "").trim().slice(0, 180),
    layout: String(raw.layout || "").trim().slice(0, 180),
    signatureElements: String(raw.signatureElements || "").trim().slice(0, 180),
    animation: String(raw.animation || "").trim().slice(0, 180),
    colors: {
      primary: normalizeHexColor(colors.primary, "#ff6b35"),
      secondary: normalizeHexColor(colors.secondary, "#ff8a5c"),
      bg: normalizeHexColor(colors.bg, "#0f172a"),
      text: normalizeHexColor(colors.text, "#f8fafc"),
    },
    fonts: {
      title: String(fonts.title || "Manrope").trim().slice(0, 40),
      body: String(fonts.body || "Inter").trim().slice(0, 40),
    },
    createdAt: Number(raw.createdAt) || now,
    updatedAt: now,
    visibility: "private",
  };
}

function normalizeStoredUserPreset(rawPreset, index) {
  const raw = rawPreset && typeof rawPreset === "object" ? rawPreset : {};
  const colors = raw.colors && typeof raw.colors === "object" ? raw.colors : {};
  const fonts = raw.fonts && typeof raw.fonts === "object" ? raw.fonts : {};
  const fallbackTime = Date.now();
  const name = String(raw.name || "").trim().slice(0, 50);
  if (!name) {
    return null;
  }
  return {
    id: String(raw.id || `custom-${fallbackTime}-${index + 1}`).trim().slice(0, 80),
    name,
    description: String(raw.description || "").trim().slice(0, 180),
    vibe: String(raw.vibe || "").trim().slice(0, 180),
    layout: String(raw.layout || "").trim().slice(0, 180),
    signatureElements: String(raw.signatureElements || "").trim().slice(0, 180),
    animation: String(raw.animation || "").trim().slice(0, 180),
    colors: {
      primary: normalizeHexColor(colors.primary, "#ff6b35"),
      secondary: normalizeHexColor(colors.secondary, "#ff8a5c"),
      bg: normalizeHexColor(colors.bg, "#0f172a"),
      text: normalizeHexColor(colors.text, "#f8fafc"),
    },
    fonts: {
      title: String(fonts.title || "Manrope").trim().slice(0, 40),
      body: String(fonts.body || "Inter").trim().slice(0, 40),
    },
    createdAt: Number(raw.createdAt) || fallbackTime,
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || fallbackTime,
    visibility: "private",
  };
}

function readUserPresets(userId) {
  const { file } = getUserPresetFile(userId);
  if (!existsSync(file)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(parsed?.presets) ? parsed.presets : [];
    return list
      .map((item, idx) => normalizeStoredUserPreset(item, idx))
      .filter(Boolean)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  } catch (_error) {
    return [];
  }
}

function writeUserPresets(userId, presets) {
  const { dir, file } = getUserPresetFile(userId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ presets }, null, 2), "utf8");
}

function isTokenLimitError(error) {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    message.includes("max_tokens") ||
    message.includes("maximum context length") ||
    message.includes("context length") ||
    message.includes("context_length_exceeded") ||
    message.includes("token limit") ||
    message.includes("too many tokens") ||
    message.includes("max output tokens")
  );
}

function toUserFacingLlmError(error, fallback = "LLM request failed") {
  const raw = String(error instanceof Error ? error.message : error || "").trim();
  const normalized = raw.toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (
    normalized.includes("insufficient balance") ||
    normalized.includes("insufficient_balance") ||
    normalized.includes("quota") ||
    normalized.includes("billing") ||
    normalized.includes("余额不足")
  ) {
    return "LLM 账户余额不足（Insufficient Balance）。请前往模型服务商充值或切换可用模型后重试。";
  }
  if (
    normalized.includes("invalid api key") ||
    normalized.includes("incorrect api key") ||
    normalized.includes("unauthorized")
  ) {
    return "LLM 鉴权失败（API Key 无效或已过期），请到 Profile 更新模型配置后重试。";
  }
  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("429")
  ) {
    return "LLM 请求过于频繁（Rate Limit），请稍后重试或切换更高配额模型。";
  }
  return raw;
}

function getPreviewTokenCandidates() {
  // ToC default: no user env setup required.
  // Start high, then auto-fallback when provider reports token/context limits.
  const candidates = [8192, 6144, 4096, 3072, 2048, 1536, 1200];
  const deduped = [];
  for (const value of candidates) {
    if (!Number.isFinite(value) || value <= 0) continue;
    if (!deduped.includes(value)) {
      deduped.push(value);
    }
  }
  return deduped;
}

async function callLlmChatCompletionAdaptiveTokens({ config, temperature, messages, signal }) {
  const tokenCandidates = getPreviewTokenCandidates();
  let lastError = null;
  for (const maxTokens of tokenCandidates) {
    try {
      return await callLlmChatCompletion({
        config,
        temperature,
        maxTokens,
        messages,
        signal,
      });
    } catch (error) {
      lastError = error;
      if (isTokenLimitError(error)) {
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error("Failed to generate preview with adaptive token fallback");
}

function normalizeStylePreviewPackage({ rawPackage, slotIndex, styleFallback, userCommonComponentsSpec }) {
  const source = rawPackage && typeof rawPackage === "object" ? rawPackage : {};
  const rawStyle = source.style && typeof source.style === "object" ? source.style : source;
  const normalizedStyle = normalizeStylePreview(
    {
      ...(rawStyle && typeof rawStyle === "object" ? rawStyle : {}),
      ...(styleFallback && typeof styleFallback === "object" ? styleFallback : {}),
      id: String(rawStyle?.id || styleFallback?.id || `style-${slotIndex + 1}`),
      name: String(rawStyle?.name || styleFallback?.name || `Style ${slotIndex + 1}`),
      description: String(rawStyle?.description || styleFallback?.description || "Distinct visual direction preview"),
      vibe: String(rawStyle?.vibe || styleFallback?.vibe || "").trim() || undefined,
      layout: String(rawStyle?.layout || styleFallback?.layout || "").trim() || undefined,
      signatureElements: String(rawStyle?.signatureElements || styleFallback?.signatureElements || "").trim() || undefined,
      animation: String(rawStyle?.animation || styleFallback?.animation || "").trim() || undefined,
      colors: rawStyle?.colors || styleFallback?.colors || {},
      fonts: rawStyle?.fonts || styleFallback?.fonts || {},
      previewHtml: rawStyle?.previewHtml,
    },
    slotIndex,
  );
  if (!normalizedStyle.previewHtml) {
    throw new Error(`Style ${slotIndex + 1} previewHtml is empty`);
  }
  return { style: normalizedStyle };
}

async function generateSingleStylePreviewPackage({
  llmConfig,
  idea,
  purpose,
  length,
  vibe,
  slotIndex,
  previousStyleNames,
}) {
  const slot = slotIndex + 1;
  const normalizedMood = normalizeVibeToMood(vibe);
  const messages = [
    {
      role: "system",
      content: [
        "You are a presentation design expert.",
        `Generate exactly ONE distinct style preview for slot ${slot} of 3.`,
        "Return strictly valid JSON OBJECT ONLY. No markdown, no explanation.",
        "The preview must be one complete self-contained HTML page (~50-100 lines) with inline CSS and optional inline JS.",
        "The preview should visibly show typography, colors, layout, and animation.",
        "The preview must fit one viewport (100vh) and avoid scrolling.",
        "Do not use external JS libraries.",
        ANTI_HOMOGENEITY_PROMPT,
        "Follow the style system reference and mood mapping below.",
        PREVIEW_MOOD_PRESET_GUIDE,
        "",
        "=== ANIMATION PATTERNS REFERENCE ===",
        ANIMATION_PATTERNS_REFERENCE,
        "=== END ANIMATION PATTERNS REFERENCE ===",
        "",
        "=== STYLE PRESET REFERENCE ===",
        STYLE_PRESET_REFERENCE,
        "=== END STYLE PRESET REFERENCE ===",
        "",
        "Apply the viewport-base.css constraints below as hard requirements for this preview.",
        "=== VIEWPORT BASE CSS REFERENCE ===",
        VIEWPORT_BASE_CSS_REFERENCE,
        "=== END VIEWPORT BASE CSS REFERENCE ===",
        "Schema:",
        "{",
        '  "style": {',
        '    "id": "style-1",',
        '    "name": "string (e.g. Bold Signal)",',
        '    "description": "string (e.g. Confident, modern, high-impact)",',
        '    "colors": { "primary": "#HEX", "secondary": "#HEX", "bg": "#HEX", "text": "#HEX" },',
        '    "fonts": { "title": "string (e.g. Archivo Black)", "body": "string (e.g. Space Grotesk)" },',
        '    "previewHtml": "full HTML document string"',
        "}",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        idea,
        purpose,
        length,
        vibe,
        normalizedMood,
        slot,
        previousStyleNames,
        instruction: "Use a clearly different visual direction from previousStyleNames while staying faithful to the style preset reference.",
      }),
    },
  ];

  const content = await callLlmChatCompletionAdaptiveTokens({
    config: llmConfig,
    temperature: 0.7,
    messages,
  });
  let parsed = null;
  try {
    const contentWithoutThink = String(content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^<think\b[^>]*>/i, "").trim();
    parsed = parseJsonFromModelContent(contentWithoutThink || content);
  } catch (error) {
    throw error;
  }
  const rawPackage = Array.isArray(parsed) ? parsed[0] : parsed;
  return normalizeStylePreviewPackage({
    rawPackage,
    slotIndex,
    styleFallback: { id: `style-${slot}` },
    });
}

async function generateSelectionStylePreviewPackage({
  llmConfig,
  style,
  idea,
  purpose,
  length,
  vibe,
}) {
  const styleHint = style && typeof style === "object" ? style : {};
  const messages = [
    {
      role: "system",
      content: [
        "You are a presentation design expert.",
        "Generate exactly ONE style preview from the provided style selection.",
        "Return strictly valid JSON OBJECT ONLY. No markdown, no explanation.",
        "The preview must be one complete self-contained HTML page (~50-100 lines) with inline CSS and optional inline JS.",
        "The preview should visibly show typography, colors, layout, and animation.",
        "The preview must fit one viewport (100vh) and avoid scrolling.",
        "Do not use external JS libraries.",
        ANTI_HOMOGENEITY_PROMPT,
        "Follow the style system reference below, but prioritize the provided style selection as source of truth.",
        "",
        "=== ANIMATION PATTERNS REFERENCE ===",
        ANIMATION_PATTERNS_REFERENCE,
        "=== END ANIMATION PATTERNS REFERENCE ===",
        "",
        "=== STYLE PRESET REFERENCE ===",
        STYLE_PRESET_REFERENCE,
        "=== END STYLE PRESET REFERENCE ===",
        "",
        "Apply the viewport-base.css constraints below as hard requirements for this preview.",
        "=== VIEWPORT BASE CSS REFERENCE ===",
        VIEWPORT_BASE_CSS_REFERENCE,
        "=== END VIEWPORT BASE CSS REFERENCE ===",
        "Schema:",
        "{",
        '  "style": {',
        '    "id": "string",',
        '    "name": "string",',
        '    "description": "string",',
        '    "vibe": "string (optional)",',
        '    "layout": "string (optional)",',
        '    "signatureElements": "string (optional)",',
        '    "animation": "string (optional)",',
        '    "colors": { "primary": "#HEX", "secondary": "#HEX", "bg": "#HEX", "text": "#HEX" },',
        '    "fonts": { "title": "string", "body": "string" },',
        '    "previewHtml": "full HTML document string"',
        "}",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        idea,
        purpose,
        length,
        vibe,
        styleSelection: styleHint,
        instruction:
          "Generate a single preview that strictly follows styleSelection (colors, fonts, vibe, layout, signatureElements, animation). Keep output production-grade and visually distinctive.",
      }),
    },
  ];

  const content = await callLlmChatCompletionAdaptiveTokens({
    config: llmConfig,
    temperature: 0.65,
    messages,
  });
  let parsed = null;
  try {
    const contentWithoutThink = String(content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^<think\b[^>]*>/i, "").trim();
    parsed = parseJsonFromModelContent(contentWithoutThink || content);
  } catch (error) {
    throw error;
  }
  const rawPackage = Array.isArray(parsed) ? parsed[0] : parsed;
  return normalizeStylePreviewPackage({
    rawPackage,
    slotIndex: 0,
    styleFallback: {
      id: String(styleHint?.id || "selection-preview"),
      name: String(styleHint?.name || "Selected Style Preview"),
      description: String(styleHint?.description || "Preview for selected style"),
      vibe: String(styleHint?.vibe || "").trim() || undefined,
      layout: String(styleHint?.layout || "").trim() || undefined,
      signatureElements: String(styleHint?.signatureElements || "").trim() || undefined,
      animation: String(styleHint?.animation || "").trim() || undefined,
      colors: styleHint?.colors || {},
      fonts: styleHint?.fonts || {},
    },
    });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encodeFontFamily(value, fallback) {
  const source = String(value || "").trim() || fallback;
  return encodeURIComponent(source.replace(/\s+/g, "+"));
}

function buildStylePreviewHtml({ style, idea, purpose, vibe }) {
  const titleFont = style.fonts.title || "Manrope";
  const bodyFont = style.fonts.body || "Inter";
  const titleText = (String(idea || "").trim().split(/[.!?。！？\n]/).find(Boolean) || style.name || "Presentation")
    .slice(0, 80);
  const subtitle = [purpose, vibe].map((item) => String(item || "").trim()).filter(Boolean).join(" • ");
  const safeTitle = escapeHtml(titleText || "Presentation Preview");
  const safeSubtitle = escapeHtml(subtitle || style.description || "Single-slide style preview");
  const safeName = escapeHtml(style.name || "Style Preview");
  const safeDesc = escapeHtml(style.description || "");
  const titleFontQuery = encodeFontFamily(titleFont, "Manrope");
  const bodyFontQuery = encodeFontFamily(bodyFont, "Inter");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeName} Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=${titleFontQuery}:wght@500;700;800&family=${bodyFontQuery}:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: ${style.colors.bg};
      --text: ${style.colors.text};
      --primary: ${style.colors.primary};
      --secondary: ${style.colors.secondary};
      --title-size: clamp(2rem, 6vw, 4.5rem);
      --subtitle-size: clamp(0.9rem, 2vw, 1.3rem);
      --body-size: clamp(0.85rem, 1.2vw, 1rem);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: "${bodyFont}", sans-serif;
    }
    .slide {
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      padding: clamp(1.5rem, 4vw, 4rem);
      isolation: isolate;
    }
    .slide::before,
    .slide::after {
      content: "";
      position: absolute;
      border-radius: 999px;
      filter: blur(6px);
      z-index: -1;
      opacity: 0.25;
      animation: float 9s ease-in-out infinite;
    }
    .slide::before {
      width: min(45vw, 520px);
      height: min(45vw, 520px);
      right: -12vw;
      top: -14vh;
      background: radial-gradient(circle at 30% 30%, var(--secondary), transparent 70%);
    }
    .slide::after {
      width: min(40vw, 420px);
      height: min(40vw, 420px);
      left: -10vw;
      bottom: -12vh;
      background: radial-gradient(circle at 65% 65%, var(--primary), transparent 70%);
      animation-delay: -3s;
    }
    .card {
      width: min(92vw, 1120px);
      max-height: min(88vh, 760px);
      border-radius: clamp(18px, 2vw, 28px);
      background: linear-gradient(145deg, color-mix(in srgb, var(--bg) 88%, white), color-mix(in srgb, var(--bg) 90%, black));
      border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
      box-shadow: 0 30px 80px color-mix(in srgb, var(--primary) 22%, transparent);
      padding: clamp(1.25rem, 3vw, 3rem);
      display: flex;
      flex-direction: column;
      gap: clamp(1rem, 2vw, 2rem);
      overflow: hidden;
    }
    .kicker {
      display: inline-flex;
      width: fit-content;
      align-items: center;
      gap: .5rem;
      border-radius: 999px;
      padding: .45rem .9rem;
      font-size: var(--body-size);
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: color-mix(in srgb, var(--text) 84%, var(--bg));
      background: color-mix(in srgb, var(--primary) 20%, transparent);
      border: 1px solid color-mix(in srgb, var(--primary) 38%, transparent);
    }
    h1 {
      font-family: "${titleFont}", sans-serif;
      font-size: var(--title-size);
      line-height: 1.04;
      letter-spacing: -0.02em;
      max-width: 18ch;
    }
    .subtitle {
      font-size: var(--subtitle-size);
      line-height: 1.5;
      max-width: 64ch;
      color: color-mix(in srgb, var(--text) 76%, var(--bg));
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: .75rem;
      margin-top: auto;
    }
    .meta-item {
      border-radius: 14px;
      padding: .8rem .9rem;
      border: 1px solid color-mix(in srgb, var(--secondary) 35%, transparent);
      background: color-mix(in srgb, var(--secondary) 14%, transparent);
      min-height: 72px;
    }
    .meta-label {
      font-size: clamp(.64rem, .8vw, .75rem);
      letter-spacing: .1em;
      text-transform: uppercase;
      opacity: .7;
      margin-bottom: .35rem;
    }
    .meta-value {
      font-size: var(--body-size);
      font-weight: 600;
    }
    .swatches {
      display: flex;
      gap: .45rem;
      margin-top: .35rem;
    }
    .swatch {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.5);
    }
    .reveal {
      opacity: 0;
      transform: translateY(18px);
      animation: reveal .7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .reveal:nth-child(2) { animation-delay: .12s; }
    .reveal:nth-child(3) { animation-delay: .24s; }
    .reveal:nth-child(4) { animation-delay: .36s; }
    @keyframes reveal {
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(16px); }
    }
    @media (max-width: 780px) {
      .meta { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <section class="slide">
    <article class="card">
      <div class="kicker reveal">${safeName}</div>
      <h1 class="reveal">${safeTitle}</h1>
      <p class="subtitle reveal">${safeSubtitle}</p>
      <div class="meta reveal">
        <div class="meta-item">
          <div class="meta-label">Style</div>
          <div class="meta-value">${safeDesc}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Typography</div>
          <div class="meta-value">${escapeHtml(titleFont)} + ${escapeHtml(bodyFont)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Colors</div>
          <div class="swatches">
            <span class="swatch" style="background:${style.colors.primary}"></span>
            <span class="swatch" style="background:${style.colors.secondary}"></span>
            <span class="swatch" style="background:${style.colors.bg}"></span>
          </div>
        </div>
      </div>
    </article>
  </section>
</body>
</html>`;
}

function normalizeSlideType(value) {
  const source = String(value || "").trim().toLowerCase();
  const allowed = new Set(["cover", "agenda", "content", "data", "summary"]);
  if (allowed.has(source)) {
    return source;
  }
  return "content";
}

function getMaxBulletsForSlideType(type) {
  const normalized = normalizeSlideType(type);
  if (normalized === "cover") return 2;
  return 6;
}

function enforceSlideDensityLimits(slides) {
  const inputSlides = Array.isArray(slides) ? slides : [];
  const normalizedSlides = [];
  const warnings = [];
  for (let index = 0; index < inputSlides.length; index += 1) {
    const slide = inputSlides[index];
    const maxBullets = getMaxBulletsForSlideType(slide?.type);
    const bullets = Array.isArray(slide?.bullets) ? slide.bullets.filter(Boolean) : [];
    if (bullets.length <= maxBullets) {
      normalizedSlides.push(slide);
      continue;
    }
    const chunks = [];
    for (let i = 0; i < bullets.length; i += maxBullets) {
      chunks.push(bullets.slice(i, i + maxBullets));
    }
    warnings.push(
      `Slide "${String(slide?.title || `Slide ${index + 1}`)}" exceeded density (${bullets.length} bullets). Split into ${chunks.length} slides.`,
    );
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      normalizedSlides.push({
        ...slide,
        id: `${String(slide?.id || `slide-${index + 1}`)}-${chunkIndex + 1}`,
        title: chunkIndex === 0
          ? slide.title
          : `${String(slide?.title || `Slide ${index + 1}`)} (Cont. ${chunkIndex})`,
        bullets: chunks[chunkIndex],
      });
    }
  }
  return { slides: normalizedSlides, warnings };
}

function sanitizeSlideSectionHtml(content) {
  const cleaned = stripCodeFence(String(content || "").trim());
  if (!cleaned) {
    return `<section class="slide"><div class="slide-content"><h2>Untitled Slide</h2></div></section>`;
  }
  const match = cleaned.match(/<section[\s\S]*?<\/section>/i);
  let sectionHtml = match && match[0]
    ? match[0]
    : `<section class="slide"><div class="slide-content">${cleaned}</div></section>`;

  if (!/\bclass\s*=\s*["'][^"']*\bslide\b/i.test(sectionHtml)) {
    if (/<section\b[^>]*\bclass\s*=/i.test(sectionHtml)) {
      sectionHtml = sectionHtml.replace(
        /<section\b([^>]*?)\bclass\s*=\s*["']([^"']*)["']([^>]*)>/i,
        (_m, pre, classNames, post) => `<section${pre}class="${String(classNames || "").trim()} slide"${post}>`,
      );
    } else {
      sectionHtml = sectionHtml.replace(/<section\b([^>]*)>/i, `<section class="slide"$1>`);
    }
  }

  if (!/\bslide-content\b/i.test(sectionHtml)) {
    const inner = sectionHtml
      .replace(/^<section\b[^>]*>/i, "")
      .replace(/<\/section>\s*$/i, "")
      .trim();
    const sectionOpenTag = sectionHtml.match(/^<section\b[^>]*>/i)?.[0] || `<section class="slide">`;
    sectionHtml = `${sectionOpenTag}<div class="slide-content">${inner || "<h2>Untitled Slide</h2>"}</div></section>`;
  }

  return sectionHtml;
}

function validateSlideSectionHtml(sectionHtml, slide) {
  const html = String(sectionHtml || "");
  const errors = [];
  if (!/\bclass\s*=\s*["'][^"']*\bslide\b/i.test(html)) {
    errors.push("Section must include class='slide'.");
  }
  if (!/\bslide-content\b/i.test(html)) {
    errors.push("Section should include a .slide-content container.");
  }
  if (/overflow\s*:\s*(auto|scroll)/i.test(html)) {
    errors.push("Slide must not use overflow:auto or overflow:scroll.");
  }
  if (!/<h1\b|<h2\b|<h3\b/i.test(html)) {
    errors.push("Slide should include a heading element (h1/h2/h3).");
  }
  const maxBullets = getMaxBulletsForSlideType(slide?.type);
  const liCount = (html.match(/<li\b/gi) || []).length;
  if (liCount > maxBullets) {
    errors.push(`Slide contains too many bullet items (${liCount}/${maxBullets}).`);
  }
  return errors;
}

function detectSlideStructure(rawHtml) {
  const html = String(rawHtml || "");
  return {
    hasSlideSection: /<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/i.test(html),
    hasSlideContentContainer: /<[^>]+\bclass\s*=\s*["'][^"']*\bslide-content\b/i.test(html),
  };
}

function isBlankOrNonSlideHtml(rawHtml) {
  const html = String(rawHtml || "").trim();
  if (!html) return true;
  const structure = detectSlideStructure(html);
  return !(structure.hasSlideSection && structure.hasSlideContentContainer);
}

function buildSingleSlideHtmlFromTemplate({ sectionHtml, templateHtml, fallbackTitle = "Slide" }) {
  const section = sanitizeSlideSectionHtml(sectionHtml);
  const template = String(templateHtml || "").trim();
  if (template && /<html[\s>]/i.test(template) && /<body[\s>]/i.test(template)) {
    return template.replace(/<body[\s\S]*?<\/body>/i, `<body>\n${section}\n</body>`);
  }
  return buildPresentationHtml({
    title: fallbackTitle,
    theme: {},
    slides: [section],
    style: {},
  });
}

function buildPresentationHtml({ title, theme, slides, style }) {
  const safeTitle = escapeHtml(title || "Presentation");
  const primary = normalizeHexColor(theme?.primary, "#ff6b35");
  const secondary = normalizeHexColor(theme?.secondary, "#ff8a5c");
  const bg = normalizeHexColor(style?.colors?.bg, "#0f172a");
  const text = normalizeHexColor(style?.colors?.text, "#f8fafc");
  const titleFont = escapeHtml(style?.fonts?.title || "Manrope");
  const bodyFont = escapeHtml(style?.fonts?.body || "Inter");
  const sections = Array.isArray(slides) ? slides.join("\n\n") : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=${encodeFontFamily(titleFont, "Manrope")}:wght@500;700;800&family=${encodeFontFamily(bodyFont, "Inter")}:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-primary: ${bg};
      --text-primary: ${text};
      --accent-primary: ${primary};
      --accent-secondary: ${secondary};
      --font-display: "${titleFont}", sans-serif;
      --font-body: "${bodyFont}", sans-serif;
    }
${VIEWPORT_BASE_CSS_REFERENCE}
    body {
      margin: 0;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-body);
    }
    .slide-content { gap: var(--content-gap); }
    h1, h2, h3 {
      font-family: var(--font-display);
      line-height: 1.1;
      margin: 0;
    }
    h1 { font-size: var(--title-size); }
    h2 { font-size: var(--h2-size); }
    p, li { font-size: var(--body-size); }
    ul { margin: 0; padding-left: 1.2em; }
  </style>
</head>
<body>
${sections}
</body>
</html>`;
}

async function generateSlideSectionHtml({
  llmConfig,
  deckTitle,
  slide,
  slideIndex,
  totalSlides,
  purpose,
  length,
  vibe,
  slideLanguage,
  style,
  selectedImageContexts = [],
  previousSlideTitles,
  previousSlideTypes = [],
  validationIssues = [],
  previousInvalidSection = "",
  abortSignal,
}) {
  const maxBullets = getMaxBulletsForSlideType(slide?.type);
  const messages = [
    {
      role: "system",
      content: [
        "You are a senior frontend presentation designer.",
        SINGLE_SLIDE_HARD_CONSTRAINTS,
        "Return strictly valid JSON object only. No markdown, no code fence, no explanations.",
        "Output schema: {\"sectionHtml\":\"<section ...>...</section>\"}.",
        "Do not include thinking process or analysis text in any field.",
        `Content density limit: max ${maxBullets} bullet points for this slide type.`,
        "Language rule: all human-readable text inside the slide HTML must be in slideLanguage.",
        "slideVisualDirection is a layout/style/composition directive for this slide, not an image-generation trigger.",
        "If selectedImages are provided in user payload, treat each image description as authoritative meaning and align layout/copy with that meaning.",
        "selectedImages may include uploaded assets (description from userDescription) and AI-generated assets (description from aiImagePrompt).",
        ANTI_HOMOGENEITY_PROMPT,
        SLIDE_LAYOUT_VARIATION_PROMPT,
        SLIDE_ANIMATION_SAFETY_PROMPT,
        "Respect the style and viewport references below.",
        "",
        "=== HTML TEMPLATE REFERENCE ===",
        HTML_TEMPLATE_REFERENCE,
        "=== END HTML TEMPLATE REFERENCE ===",
        "",
        "=== ANIMATION PATTERNS REFERENCE ===",
        ANIMATION_PATTERNS_REFERENCE,
        "=== END ANIMATION PATTERNS REFERENCE ===",
        "",
        "=== STYLE PRESET REFERENCE ===",
        STYLE_PRESET_REFERENCE,
        "=== END STYLE PRESET REFERENCE ===",
        "",
        "=== VIEWPORT BASE CSS REFERENCE ===",
        VIEWPORT_BASE_CSS_REFERENCE,
        "=== END VIEWPORT BASE CSS REFERENCE ===",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        deckTitle,
        purpose,
        length,
        vibe,
        slideLanguage: String(slideLanguage || "English"),
        style,
        slideIndex: slideIndex + 1,
        totalSlides,
        slideTitle: slide?.title,
        slideType: slide?.type,
        bullets: Array.isArray(slide?.bullets) ? slide.bullets : [],
        speakerNotes: slide?.speakerNotes || "",
        slideVisualDirection: slide?.slideVisualDirection || "",
        imageUrl: slide?.imageUrl || "",
        selectedImages: selectedImageContexts,
        aiImagePrompts: Array.isArray(slide?.aiImagePrompts)
          ? slide.aiImagePrompts
              .map((item) => ({
                id: String(item?.id || ""),
                prompt: String(item?.prompt || ""),
                imageUrl: String(item?.imageUrl || ""),
              }))
              .filter((item) => item.prompt || item.imageUrl)
          : [],
        previousSlideTitles,
        previousSlideTypes,
        maxBullets,
        validationIssues,
        previousInvalidSection,
        constraints: [
          "No external JS libraries",
          "Use concise semantic HTML",
          "Keep text readable and presentation-grade",
        ],
      }),
    },
  ];
  const section = await callLlmChatCompletionAdaptiveTokens({
    config: llmConfig,
    temperature: 0.55,
    messages,
    signal: abortSignal,
  });
  let rawSectionHtml = "";
  let usedFallbackRaw = false;
  try {
    const parsed = parseJsonFromModelContent(section);
    const candidate = parsed && typeof parsed === "object"
      ? parsed.sectionHtml || parsed.html || parsed.section || ""
      : "";
    rawSectionHtml = String(candidate || "").trim();
  } catch (_error) {
    // Fallback for providers/models that occasionally return plain text/html.
    usedFallbackRaw = true;
    rawSectionHtml = String(section || "").trim();
  }
  const sanitized = sanitizeSlideSectionHtml(rawSectionHtml);
  return sanitized;
}

function normalizeDeckDraft(rawPrompt, raw) {
  const baseTitle = String(rawPrompt || "").trim().slice(0, 80) || "New Presentation";
  const candidateSlides = Array.isArray(raw?.slides) ? raw.slides : [];
  const slides = candidateSlides
    .slice(0, 150)
    .map((item, index) => {
      const bullets = Array.isArray(item?.bullets)
        ? item.bullets.map((bullet) => String(bullet || "").trim()).filter(Boolean).slice(0, 12)
        : [];
      return {
        id: `slide-${index + 1}`,
        type: normalizeSlideType(item?.type),
        title: String(item?.title || "").trim().slice(0, 90) || `Slide ${index + 1}`,
        bullets: bullets.length > 0 ? bullets : ["Key point to be refined"],
        speakerNotes: String(item?.speakerNotes || "").trim().slice(0, 600),
        slideVisualDirection: String(item?.slideVisualDirection || item?.imagePrompt || "").trim().slice(0, 400),
        imageUrl: "",
        imageAssetIds: Array.isArray(item?.imageAssetIds)
          ? item.imageAssetIds.map((id) => String(id || "").trim()).filter(Boolean)
          : [],
        aiImageNeeded: item?.aiImageNeeded === true || (Array.isArray(item?.aiImagePrompts) && item.aiImagePrompts.length > 0),
        aiImagePrompts: Array.isArray(item?.aiImagePrompts)
          ? item.aiImagePrompts
              .map((promptItem, promptIndex) => {
                const sourcePrompt = promptItem && typeof promptItem === "object" ? promptItem : {};
                const prompt = String(sourcePrompt.prompt || "").trim().slice(0, 500);
                if (!prompt) return null;
                const imageUrl = String(sourcePrompt.imageUrl || "").trim();
                return {
                  id: String(sourcePrompt.id || `ai-${index + 1}-${promptIndex + 1}`).trim().slice(0, 80),
                  prompt,
                  status: imageUrl ? "done" : "idle",
                  imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl.slice(0, 2000) : "",
                  imageWidth: Math.max(0, Math.floor(Number(sourcePrompt.imageWidth) || 0)),
                  imageHeight: Math.max(0, Math.floor(Number(sourcePrompt.imageHeight) || 0)),
                  imageAspectRatio: Number(sourcePrompt.imageAspectRatio) > 0 ? Number(Number(sourcePrompt.imageAspectRatio).toFixed(6)) : 0,
                  imageOrientation: String(sourcePrompt.imageOrientation || "").trim().toLowerCase(),
                  error: "",
                };
              })
              .filter(Boolean)
          : [],
      };
    })
    .filter((item) => item.title);
  const fallbackSlides = [
    { id: "slide-1", type: "cover", title: baseTitle, bullets: ["Presentation generated from your one-line prompt"], speakerNotes: "", slideVisualDirection: "", imageUrl: "", imageAssetIds: [], aiImageNeeded: false, aiImagePrompts: [] },
    { id: "slide-2", type: "agenda", title: "Agenda", bullets: ["Background", "Approach", "Execution", "Next steps"], speakerNotes: "", slideVisualDirection: "", imageUrl: "", imageAssetIds: [], aiImageNeeded: false, aiImagePrompts: [] },
    { id: "slide-3", type: "content", title: "Core Idea", bullets: ["Define the objective", "Clarify user value", "Set measurable outcomes"], speakerNotes: "", slideVisualDirection: "", imageUrl: "", imageAssetIds: [], aiImageNeeded: false, aiImagePrompts: [] },
    { id: "slide-4", type: "summary", title: "Summary", bullets: ["Recap highlights", "Action items", "Call to action"], speakerNotes: "", slideVisualDirection: "", imageUrl: "", imageAssetIds: [], aiImageNeeded: false, aiImagePrompts: [] },
  ];

  return {
    title: String(raw?.title || "").trim().slice(0, 100) || baseTitle,
    theme: {
      primary: normalizeHexColor(raw?.theme?.primary, "#ff6b35"),
      secondary: normalizeHexColor(raw?.theme?.secondary, "#ff8a5c"),
      tone: String(raw?.theme?.tone || "").trim().slice(0, 40) || "professional",
    },
    slides: slides.length > 0 ? slides : fallbackSlides,
  };
}

function normalizeRepositoryDeckPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const presentation = payload.presentation && typeof payload.presentation === "object" ? payload.presentation : {};
  const slides = Array.isArray(presentation.slides) ? presentation.slides : [];
  const chatHistorySource = Array.isArray(presentation.chatHistory) ? presentation.chatHistory : [];
  const elementsSource = Array.isArray(presentation.elements) ? presentation.elements : [];
  const versionSnapshotsSource = Array.isArray(presentation.versionSnapshots) ? presentation.versionSnapshots : [];
  const slideLanguage = String(presentation.slideLanguage || "English").trim().slice(0, 40) || "English";
  const llmLanguage = String(presentation.llmLanguage || "English").trim().slice(0, 40) || "English";
  const normalizedSlides = slides
    .slice(0, 150)
    .map((item, index) => ({
      id: Number(item?.id) || index + 1,
      title: String(item?.title || `Slide ${index + 1}`).trim().slice(0, 120),
      type: String(item?.type || "Content").trim().slice(0, 40),
      html: String(item?.html || ""),
    }))
    .filter((slide) => slide.html.trim().length > 0);
  const normalizedChatHistory = chatHistorySource
    .slice(-300)
    .map((entry, index) => {
      const source = entry && typeof entry === "object" ? entry : {};
      const isVersionCard = source.isVersionCard === true;
      const version = Number(source.version);
      if (isVersionCard) {
        if (!Number.isFinite(version) || version <= 0) {
          return null;
        }
        return {
          id: String(source.id || `chat-version-${index + 1}`).trim().slice(0, 80),
          isUser: false,
          isVersionCard: true,
          version,
          versionTitle: String(source.versionTitle || "").trim().slice(0, 300) || `Version ${version}`,
        };
      }
      const text = String(source.text || "").trim();
      if (!text) {
        return null;
      }
      return {
        id: String(source.id || `chat-msg-${index + 1}`).trim().slice(0, 80),
        text: text.slice(0, 8000),
        isUser: source.isUser === true,
      };
    })
    .filter(Boolean);
  const normalizedElements = elementsSource
    .slice(-200)
    .map((entry, index) => {
      const source = entry && typeof entry === "object" ? entry : {};
      const name = String(source.name || "").trim().slice(0, 200);
      if (!name) return null;
      const rawDataUrl = String(source.dataUrl || "").trim();
      return {
        id: String(source.id || `element-${index + 1}`).trim().slice(0, 80),
        name,
        type: String(source.type || "FILE").trim().slice(0, 30).toUpperCase(),
        source: "asset",
        slideId: Number.isFinite(Number(source.slideId)) ? Number(source.slideId) : undefined,
        url: /^https?:\/\//i.test(String(source.url || "").trim()) ? String(source.url || "").trim().slice(0, 2000) : undefined,
        dataUrl: /^data:image\/[a-z0-9.+-]+;base64,/i.test(rawDataUrl) ? rawDataUrl.slice(0, 4_000_000) : undefined,
      };
    })
    .filter(Boolean);
  const normalizedVersionSnapshots = versionSnapshotsSource
    .slice(-50)
    .map((entry) => {
      const source = entry && typeof entry === "object" ? entry : {};
      const version = Number(source.version);
      if (!Number.isFinite(version) || version <= 0) return null;
      const slidesSource = Array.isArray(source.slides) ? source.slides : [];
      const slides = slidesSource
        .slice(0, 50)
        .map((slide, index) => ({
          id: Number(slide?.id) || index + 1,
          title: String(slide?.title || `Slide ${index + 1}`).trim().slice(0, 120),
          type: String(slide?.type || "Content").trim().slice(0, 40),
          html: String(slide?.html || ""),
        }))
        .filter((slide) => String(slide.html || "").trim().length > 0);
      if (slides.length === 0) return null;
      return {
        version,
        versionTitle: String(source.versionTitle || "").trim().slice(0, 300) || undefined,
        savedAt: Number(source.savedAt) || Date.now(),
        slides,
      };
    })
    .filter(Boolean);

  const title = String(payload.title || presentation.title || "Untitled Deck").trim().slice(0, 180) || "Untitled Deck";
  const theme = payload.theme && typeof payload.theme === "object" ? payload.theme : {};
  const primary = normalizeHexColor(theme.primary, "#ff6b35");
  const secondary = normalizeHexColor(theme.secondary, "#ff8a5c");

  return {
    title,
    slideCount: normalizedSlides.length,
    themePrimary: primary,
    themeSecondary: secondary,
    presentation: {
      title,
      slides: normalizedSlides,
      chatHistory: normalizedChatHistory,
      elements: normalizedElements,
      versionSnapshots: normalizedVersionSnapshots,
      slideLanguage,
      llmLanguage,
    },
  };
}

function parseRepositoryDeckRow(row) {
  if (!row || typeof row !== "object") {
    return {
      id: 0,
      title: "Untitled Deck",
      shareCode: "",
      slideCount: 0,
      theme: { primary: "#ff6b35", secondary: "#ff8a5c" },
      updatedAt: Date.now(),
      presentation: {
        title: "Untitled Deck",
        slides: [],
        chatHistory: [],
        elements: [],
        versionSnapshots: [],
        slideLanguage: "English",
        llmLanguage: "English",
      },
    };
  }
  let presentation = {
    title: row.title,
    slides: [],
    chatHistory: [],
    elements: [],
    versionSnapshots: [],
    slideLanguage: "English",
    llmLanguage: "English",
  };
  try {
    const parsed = JSON.parse(String(row.presentation_json || "{}"));
    if (parsed && typeof parsed === "object") {
      presentation = {
        title: String(parsed.title || row.title || "").trim() || row.title,
        slides: Array.isArray(parsed.slides) ? parsed.slides : [],
        chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : [],
        elements: Array.isArray(parsed.elements) ? parsed.elements : [],
        versionSnapshots: Array.isArray(parsed.versionSnapshots) ? parsed.versionSnapshots : [],
        slideLanguage: String(parsed.slideLanguage || "English").trim().slice(0, 40) || "English",
        llmLanguage: String(parsed.llmLanguage || "English").trim().slice(0, 40) || "English",
      };
    }
  } catch (_error) {
    presentation = {
      title: row.title,
      slides: [],
      chatHistory: [],
      elements: [],
      versionSnapshots: [],
      slideLanguage: "English",
      llmLanguage: "English",
    };
  }
  return {
    id: Number(row.id),
    title: String(row.title || "").trim() || "Untitled Deck",
    shareCode: String(row.share_code || "").trim(),
    slideCount: Number(row.slide_count) || 0,
    theme: {
      primary: normalizeHexColor(row.theme_primary, "#ff6b35"),
      secondary: normalizeHexColor(row.theme_secondary, "#ff8a5c"),
    },
    updatedAt: Number(row.updated_at) || Date.now(),
    presentation,
  };
}

async function callLlmChatCompletion({ config, messages, maxTokens = 1800, temperature = 0.6, signal }) {
  if (config?.userId && config?.billable) {
    await ensureManagedCreditsAvailable(config.userId, 1);
  }
  const endpoint = resolveLlmCompletionUrl(config);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model: config.modelId,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });
  } catch (error) {
    throw error;
  }
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch (_error) {}
  if (!response.ok) {
    const errorMessage = payload?.error?.message || payload?.error || `Provider HTTP ${response.status}`;
    throw new Error(String(errorMessage));
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned an empty response");
  }
  const promptTokens = Number(payload?.usage?.prompt_tokens) || 0;
  const completionTokens = Number(payload?.usage?.completion_tokens) || 0;
  if (config?.userId && config?.billable) {
    const fallbackPromptTokens = promptTokens || Math.ceil(Buffer.byteLength(JSON.stringify(messages || []), "utf8") / 4);
    const fallbackCompletionTokens = completionTokens || Math.ceil(Buffer.byteLength(String(content || ""), "utf8") / 4);
    await consumeLlmCreditsByTokenUsage(config.userId, fallbackPromptTokens, fallbackCompletionTokens);
  }
  return String(content);
}

async function tryGenerateImage({ config, prompt, signal }) {
  if (config?.userId && config?.billable) {
    await ensureManagedCreditsAvailable(config.userId, CREDIT_COST_IMAGE_PER_GENERATION);
  }
  const finalizeImage = async (candidate) => {
    const output = String(candidate || "").trim();
    if (!output) return "";
    if (config?.userId && config?.billable) {
      await adjustUserCredits(config.userId, -Math.max(0, Math.round(CREDIT_COST_IMAGE_PER_GENERATION)));
    }
    return output;
  };
  const endpoint = resolveImageGenerationUrl(config);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: config.modelId,
      prompt,
      n: 1,
      size: "1024x1024",
      imageSize: "1K",
      aspectRatio: "16:9",
    }),
  });

  const contentType = String(response.headers.get("content-type") || "");
  const transferEncoding = String(response.headers.get("transfer-encoding") || "");
  if (response.ok && (contentType.includes("text/event-stream") || transferEncoding.includes("chunked"))) {
    const streamText = await response.text();
    const toDataUrl = (value, mime = "image/png") => {
      const source = String(value || "").trim();
      if (!source) return "";
      if (/^data:image\//i.test(source)) {
        return source;
      }
      return `data:${mime};base64,${source}`;
    };
    const extractCandidate = (payload) => {
      if (typeof payload?.data?.[0]?.url === "string") return payload.data[0].url;
      if (typeof payload?.data?.[0]?.b64_json === "string") return toDataUrl(payload.data[0].b64_json, "image/png");
      if (typeof payload?.data?.[0]?.base64 === "string") return toDataUrl(payload.data[0].base64, "image/png");
      if (typeof payload?.results?.[0]?.url === "string") return payload.results[0].url;
      if (typeof payload?.results?.[0]?.b64_json === "string") return toDataUrl(payload.results[0].b64_json, "image/png");
      if (typeof payload?.output?.[0]?.url === "string") return payload.output[0].url;
      if (typeof payload?.output?.[0]?.b64_json === "string") return toDataUrl(payload.output[0].b64_json, "image/png");
      if (typeof payload?.image_base64 === "string") return toDataUrl(payload.image_base64, "image/png");
      if (typeof payload?.image === "string") return toDataUrl(payload.image, "image/png");
      if (typeof payload?.url === "string") return payload.url;
      return "";
    };
    const deepSearchCandidate = (value, depth = 0) => {
      if (!value || depth > 6) return "";
      if (typeof value === "string") {
        const source = value.trim();
        if (/^https?:\/\//i.test(source) || /^data:image\//i.test(source)) {
          return source;
        }
        if (/^[A-Za-z0-9+/=\r\n]+$/.test(source) && source.length > 128) {
          return toDataUrl(source, "image/png");
        }
        return "";
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const candidate = deepSearchCandidate(item, depth + 1);
          if (candidate) return candidate;
        }
        return "";
      }
      if (typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
          const normalizedKey = String(key || "").toLowerCase();
          if (typeof item === "string") {
            const text = item.trim();
            if ((normalizedKey.includes("url") || normalizedKey.includes("image")) && /^https?:\/\//i.test(text)) {
              return text;
            }
            if ((normalizedKey.includes("b64") || normalizedKey.includes("base64") || normalizedKey.includes("image")) && /^[A-Za-z0-9+/=\r\n]+$/.test(text) && text.length > 128) {
              return toDataUrl(text, "image/png");
            }
          }
          const nested = deepSearchCandidate(item, depth + 1);
          if (nested) return nested;
        }
      }
      return "";
    };
    let streamMatch = "";
    let streamFailureReason = "";
    const streamLines = String(streamText || "").split(/\r?\n/);
    for (const line of streamLines) {
      const trimmed = String(line || "").trim();
      if (!trimmed.startsWith("data:")) continue;
      const rawData = trimmed.slice(5).trim();
      if (!rawData || rawData === "[DONE]") continue;
      try {
        const parsedEvent = JSON.parse(rawData);
        const candidate = extractCandidate(parsedEvent);
        const deepCandidate = candidate ? "" : deepSearchCandidate(parsedEvent);
        if (String(parsedEvent?.status || "").toLowerCase() === "failed") {
          streamFailureReason = String(parsedEvent?.error || parsedEvent?.failure_reason || "").trim();
        }
        if (candidate || deepCandidate) {
          const finalCandidate = candidate || deepCandidate;
          streamMatch = finalCandidate;
          break;
        }
      } catch (_error) {}
    }
    if (!streamMatch && streamFailureReason) {
      throw new Error(`Image provider stream failed: ${streamFailureReason}`);
    }
    return finalizeImage(streamMatch);
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch (_error) {}
  if (!response.ok) {
    return "";
  }

  const toDataUrl = (value, mime = "image/png") => {
    const source = String(value || "").trim();
    if (!source) return "";
    if (/^data:image\//i.test(source)) {
      return source;
    }
    return `data:${mime};base64,${source}`;
  };

  if (typeof payload?.data?.[0]?.url === "string") {
    return finalizeImage(payload.data[0].url);
  }
  if (typeof payload?.data?.[0]?.b64_json === "string") {
    return finalizeImage(toDataUrl(payload.data[0].b64_json, "image/png"));
  }
  if (typeof payload?.data?.[0]?.base64 === "string") {
    return finalizeImage(toDataUrl(payload.data[0].base64, "image/png"));
  }
  if (typeof payload?.results?.[0]?.url === "string") {
    return finalizeImage(payload.results[0].url);
  }
  if (typeof payload?.results?.[0]?.b64_json === "string") {
    return finalizeImage(toDataUrl(payload.results[0].b64_json, "image/png"));
  }
  if (typeof payload?.output?.[0]?.url === "string") {
    return finalizeImage(payload.output[0].url);
  }
  if (typeof payload?.output?.[0]?.b64_json === "string") {
    return finalizeImage(toDataUrl(payload.output[0].b64_json, "image/png"));
  }
  if (typeof payload?.image_base64 === "string") {
    return finalizeImage(toDataUrl(payload.image_base64, "image/png"));
  }
  if (typeof payload?.image === "string") {
    return finalizeImage(toDataUrl(payload.image, "image/png"));
  }
  if (typeof payload?.url === "string") {
    return finalizeImage(payload.url);
  }
  const payloadErrorMessage = String(payload?.error?.message || payload?.error || "").trim();
  if (payloadErrorMessage) {
    throw new Error(`Image provider response error: ${payloadErrorMessage}`);
  }
  return "";
}

async function runPptGenerationJob({
  jobId,
  prompt,
  purpose,
  length,
  vibe,
  slideLanguage,
  style,
  llmConfig,
  outline,
  assets = [],
}) {
  try {
    ensurePptJobRunnable(jobId);
    updatePptJob(jobId, {
      status: "running",
      progress: 5,
      message: "Planning presentation structure...",
      error: "",
      warnings: [],
      presentation: {
        title: "Generating presentation...",
        theme: style ? { primary: style.colors.primary, secondary: style.colors.secondary, tone: style.name } : { primary: "#ff6b35", secondary: "#ff8a5c", tone: "professional" },
        slides: [],
        fullHtml: "",
        htmlPath: "",
      },
    });

    const normalizedAssets = Array.isArray(assets)
      ? assets
          .map((item, index) => normalizeWizardAsset(item, index))
          .filter((item) => item.isImage && item.imageUrl)
      : [];
    const assetById = new Map(normalizedAssets.map((item) => [item.id, item]));

    if (!(outline && typeof outline === "object" && Array.isArray(outline.slides) && outline.slides.length > 0)) {
      throw new Error("Outline is required and must contain at least one slide");
    }
    let normalizedDeck = normalizeDeckDraft(prompt, outline);
    if (style && style.colors && typeof style.colors === "object") {
      const stylePrimary = normalizeHexColor(style.colors.primary, normalizedDeck?.theme?.primary || "#ff6b35");
      const styleSecondary = normalizeHexColor(style.colors.secondary, normalizedDeck?.theme?.secondary || "#ff8a5c");
      normalizedDeck = {
        ...normalizedDeck,
        theme: {
          ...(normalizedDeck?.theme || {}),
          primary: stylePrimary,
          secondary: styleSecondary,
          tone: String(normalizedDeck?.theme?.tone || style.name || "professional").trim().slice(0, 40) || "professional",
        },
      };
    }
    const densityAdjusted = enforceSlideDensityLimits(normalizedDeck.slides);
    const normalizedSlides = densityAdjusted.slides;
    const totalSlides = normalizedSlides.length || 1;
    updatePptJob(jobId, {
      progress: 20,
      message: "Rendering slides...",
      presentation: {
        title: normalizedDeck.title,
        theme: normalizedDeck.theme,
        slides: [],
        fullHtml: "",
        htmlPath: "",
      },
      warnings: densityAdjusted.warnings,
    });

    const warnings = [...densityAdjusted.warnings];
    const generatedSections = [];
    const generatedSlides = [];
    for (let index = 0; index < normalizedSlides.length; index += 1) {
      ensurePptJobRunnable(jobId);
      const baseSlide = normalizedSlides[index];
      const nextSlide = { ...baseSlide };
      const uploadedImageContexts = Array.isArray(nextSlide.imageAssetIds)
        ? nextSlide.imageAssetIds
            .map((assetId) => assetById.get(String(assetId || "").trim()))
            .filter(Boolean)
            .map((asset) => ({
              id: asset.id,
              source: "uploaded",
              name: asset.name,
              imageUrl: asset.imageUrl || "",
              imageWidth: asset.imageWidth || 0,
              imageHeight: asset.imageHeight || 0,
              imageAspectRatio: asset.imageAspectRatio || 0,
              imageOrientation: asset.imageOrientation || "",
              description: asset.userDescription || "",
              descriptionSource: "userDescription",
            }))
        : [];
      const aiImagePromptContexts = Array.isArray(nextSlide.aiImagePrompts)
        ? nextSlide.aiImagePrompts
            .map((item) => (item && typeof item === "object" ? item : {}))
            .filter((item) => String(item.imageUrl || "").trim())
            .map((item, promptIndex) => ({
              id: String(item.id || `ai-${index + 1}-${promptIndex + 1}`),
              source: "ai-generated",
              name: `AI image ${promptIndex + 1}`,
              imageUrl: String(item.imageUrl || "").trim(),
              imageWidth: Math.max(0, Math.floor(Number(item.imageWidth) || 0)),
              imageHeight: Math.max(0, Math.floor(Number(item.imageHeight) || 0)),
              imageAspectRatio: Number(item.imageAspectRatio) > 0 ? Number(Number(item.imageAspectRatio).toFixed(6)) : 0,
              imageOrientation: String(item.imageOrientation || "").trim().toLowerCase(),
              description: String(item.prompt || "").trim(),
              descriptionSource: "aiImagePrompt",
            }))
        : [];
      const selectedImageContexts = [...uploadedImageContexts, ...aiImagePromptContexts];
      if (!nextSlide.imageUrl && Array.isArray(nextSlide.imageAssetIds) && nextSlide.imageAssetIds.length > 0) {
        const adoptedAsset = nextSlide.imageAssetIds
          .map((assetId) => assetById.get(String(assetId || "").trim()))
          .find(Boolean);
        if (adoptedAsset?.imageUrl) {
          nextSlide.imageUrl = adoptedAsset.imageUrl;
        }
      }
      if (!nextSlide.imageUrl && Array.isArray(nextSlide.aiImagePrompts) && nextSlide.aiImagePrompts.length > 0) {
        const donePrompt = nextSlide.aiImagePrompts.find(
          (item) => item && typeof item === "object" && String(item.imageUrl || "").trim(),
        );
        if (donePrompt?.imageUrl) {
          nextSlide.imageUrl = String(donePrompt.imageUrl).trim();
        }
      }
      const currentJob = getPptJob(jobId);
      if (!currentJob) {
        return;
      }
      let sectionHtml = "";
      let validationIssues = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        ensurePptJobRunnable(jobId);
        sectionHtml = await runWithPptJobAbortSignal(jobId, (signal) =>
          generateSlideSectionHtml({
            llmConfig,
            deckTitle: normalizedDeck.title,
            slide: nextSlide,
            slideIndex: index,
            totalSlides,
            purpose,
            length,
            vibe,
            slideLanguage,
            style,
            selectedImageContexts,
            previousSlideTitles: generatedSlides.map((item) => item.title),
            previousSlideTypes: generatedSlides.map((item) => String(item.type || "")),
            validationIssues,
            previousInvalidSection: attempt > 0 ? sectionHtml : "",
            abortSignal: signal,
          }),
        );
        validationIssues = validateSlideSectionHtml(sectionHtml, nextSlide);
        if (validationIssues.length === 0) {
          break;
        }
      }
      if (validationIssues.length > 0) {
        warnings.push(`Slide "${nextSlide.title}" had unresolved validation issues: ${validationIssues.join(" ")}`);
      }
      generatedSections.push(sectionHtml);
      const singleSlideHtml = buildPresentationHtml({
        title: `${normalizedDeck.title} - ${nextSlide.title}`,
        theme: normalizedDeck.theme,
        slides: [sectionHtml],
        style,
      });
      generatedSlides.push({
        id: nextSlide.id,
        type: nextSlide.type,
        title: nextSlide.title,
        bullets: nextSlide.bullets,
        imageUrl: nextSlide.imageUrl,
        html: singleSlideHtml,
      });
      const fullHtml = buildPresentationHtml({
        title: normalizedDeck.title,
        theme: normalizedDeck.theme,
        slides: generatedSections,
        style,
      });
      const progress = 20 + Math.round(((index + 1) / totalSlides) * 80);
      updatePptJob(jobId, {
        progress,
        message: `Generated ${index + 1}/${totalSlides} slides`,
        warnings,
        presentation: {
          ...currentJob.presentation,
          title: normalizedDeck.title,
          theme: normalizedDeck.theme,
          slides: generatedSlides,
          fullHtml,
          htmlPath: "",
        },
      });
    }

    ensurePptJobRunnable(jobId);
    updatePptJob(jobId, {
      status: "done",
      progress: 100,
      message: "Presentation generated",
      warnings,
    });
  } catch (error) {
    if (isPptJobCancelledError(error) || String(error instanceof Error ? error.name : "") === "AbortError") {
      const job = getPptJob(jobId);
      if (job && job.status !== "cancelled") {
        updatePptJob(jobId, {
          status: "cancelled",
          message: "Generation cancelled",
          error: "",
        });
      }
      return;
    }
    updatePptJob(jobId, {
      status: "failed",
      progress: 100,
      message: "Generation failed",
      error: error instanceof Error ? error.message : "Failed to generate presentation",
    });
  }
}

async function runProviderHealthCheck({ type, config }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };

    if (type === "llm") {
      const endpoint = resolveLlmCompletionUrl(config);
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: config.modelId,
          messages: [
            { role: "system", content: "You are a health-check assistant. Reply with: OK" },
            { role: "user", content: "FacetDeck preset health check message. Reply with OK only." },
          ],
          max_tokens: 8,
          temperature: 0,
        }),
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = JSON.parse(text);
      } catch (_error) {}
      if (!response.ok) {
        const errorMessage = payload?.error?.message || payload?.error || `Provider HTTP ${response.status}`;
        throw new Error(String(errorMessage));
      }
      return;
    }

    const endpoint = resolveImageGenerationUrl(config);
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.modelId,
        prompt: "FacetDeck preset health check prompt: generate a tiny orange icon.",
        size: "256x256",
        n: 1,
      }),
    });
    const contentType = String(response.headers.get("content-type") || "");
    const transferEncoding = String(response.headers.get("transfer-encoding") || "");

    // Some providers keep image generation connections open as streaming responses.
    // For health checks, a successful HTTP status with a stream response is sufficient.
    if (response.ok && (contentType.includes("text/event-stream") || transferEncoding.includes("chunked"))) {
      return;
    }

    const text = await response.text();
    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch (_error) {}
    if (!response.ok) {
      const errorMessage = payload?.error?.message || payload?.error || `Provider HTTP ${response.status}`;
      throw new Error(String(errorMessage));
    }
  } finally {
    clearTimeout(timer);
  }
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM are required");
  }
  return { client: new Resend(apiKey), from };
}

async function sendCodeEmail({ email, code, purpose }) {
  const title = purpose === "register" ? "Sign up verification code" : "Password reset code";
  const hint = purpose === "register"
    ? "Use this code to finish creating your account."
    : "Use this code to reset your password.";

  const { client, from } = getResendClient();
  await client.emails.send({
    from,
    to: email,
    subject: `${APP_NAME} ${title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
        <h2>${APP_NAME}</h2>
        <p>${hint}</p>
        <p style="font-size: 28px; letter-spacing: 6px; font-weight: bold; margin: 24px 0;">
          ${code}
        </p>
        <p>This code expires in ${purpose === "register" ? CODE_EXPIRES_MINUTES : RESET_CODE_EXPIRES_MINUTES} minutes.</p>
      </div>
    `,
  });
}

app.use(
  cors({
    origin: FRONTEND_ORIGIN.split(",").map((value) => value.trim()),
  }),
);
app.use("/uploads", express.static(LOCAL_UPLOAD_ROOT));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: FACETDECK_DISTRIBUTION_MODE });
});

app.get("/api/auth/captcha", (req, res) => {
  const ip = getClientIp(req);
  const payload = issueCaptcha(ip);
  res.json(payload);
});

function authRequired(req, res, next) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = payload;
    next();
  } catch (_error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function saasOnly(req, res, next) {
  if (!IS_SAAS_MODE) {
    res.status(403).json({
      ok: false,
      error: "This capability is disabled in OSS mode.",
    });
    return;
  }
  next();
}

function normalizeExportSlides(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 60)
    .map((item, index) => {
      const source = item && typeof item === "object" ? item : {};
      const id = Number(source.id);
      const html = String(source.html || "");
      if (!html.trim()) {
        return null;
      }
      return {
        id: Number.isFinite(id) && id > 0 ? id : index + 1,
        title: String(source.title || `Slide ${index + 1}`).trim().slice(0, 120) || `Slide ${index + 1}`,
        html,
      };
    })
    .filter(Boolean);
}

function buildPdfDeckHtml(slides, title) {
  const pages = slides
    .map(
      (slide) => `
<section class="pdf-page" data-slide-id="${slide.id}">
  <iframe title="${escapeHtml(slide.title)}" srcdoc="${escapeHtml(slide.html)}" loading="eager"></iframe>
</section>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title || "FacetDeck Export")}</title>
  <style>
    @page { size: 13.333in 7.5in; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      width: 100%;
    }
    .pdf-page {
      width: 1600px;
      height: 900px;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .pdf-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .pdf-page iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
  </style>
</head>
<body>
${pages}
</body>
</html>`;
}

function sanitizeExportFilename(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .slice(0, 80);
  return cleaned;
}

function buildExportTimestampBaseName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `export-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function resolveExportFileName(title, extension) {
  const normalizedExtension = String(extension || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const safeExtension = normalizedExtension || "txt";
  const baseName = sanitizeExportFilename(title) || buildExportTimestampBaseName();
  return `${baseName}.${safeExtension}`;
}

function buildAttachmentContentDisposition(fileName) {
  const source = String(fileName || "").trim() || `${buildExportTimestampBaseName()}.txt`;
  const asciiFallback = source
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .trim() || `${buildExportTimestampBaseName()}.txt`;
  const encoded = encodeURIComponent(source)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function generateShareCode(length = 10) {
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += SHARE_CODE_ALPHABET[randomInt(0, SHARE_CODE_ALPHABET.length)];
  }
  return output;
}

async function generateUniqueShareCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateShareCode(10);
    const existing = await get("SELECT id FROM repository_decks WHERE share_code = ? LIMIT 1", [candidate]);
    if (!existing) {
      return candidate;
    }
  }
  return `${Date.now().toString(36)}${randomInt(1000, 9999).toString(36)}`.toUpperCase();
}

async function ensureDeckShareCode(deckId) {
  const row = await get("SELECT id, share_code FROM repository_decks WHERE id = ? LIMIT 1", [deckId]);
  if (!row) {
    return "";
  }
  const existingCode = String(row.share_code || "").trim();
  if (existingCode) {
    return existingCode;
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const nextCode = await generateUniqueShareCode();
    const updated = await run(
      "UPDATE repository_decks SET share_code = ?, updated_at = updated_at WHERE id = ? AND (share_code IS NULL OR share_code = '')",
      [nextCode, deckId],
    );
    if (updated.changes > 0) {
      return nextCode;
    }
    const refreshed = await get("SELECT share_code FROM repository_decks WHERE id = ? LIMIT 1", [deckId]);
    const refreshedCode = String(refreshed?.share_code || "").trim();
    if (refreshedCode) {
      return refreshedCode;
    }
  }
  throw new Error("Failed to allocate share code");
}

function getRequestBaseUrl(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.headers.host || "");
  return host ? `${protocol}://${host}` : FRONTEND_ORIGIN.split(",")[0].trim();
}

function getHtmlAttribute(attributes, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`, "i");
  const match = String(attributes || "").match(pattern);
  return String(match?.[2] || match?.[3] || match?.[4] || "").trim();
}

function resolveRemoteUrl(url, baseUrl = "") {
  const source = String(url || "").trim();
  if (!source || source.startsWith("data:") || source.startsWith("blob:") || source.startsWith("#")) {
    return "";
  }
  if (source.startsWith("//")) {
    return `https:${source}`;
  }
  if (/^https?:\/\//i.test(source)) {
    return source;
  }
  if (!baseUrl) {
    return "";
  }
  try {
    return new URL(source, baseUrl).toString();
  } catch (_error) {
    return "";
  }
}

async function replaceAsync(source, regex, asyncReplacer) {
  const text = String(source || "");
  regex.lastIndex = 0;
  let output = "";
  let lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    output += text.slice(lastIndex, match.index);
    output += await asyncReplacer(...match);
    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }
  output += text.slice(lastIndex);
  return output;
}

function guessMimeType(url, contentTypeHeader = "") {
  const contentType = String(contentTypeHeader || "").split(";")[0].trim().toLowerCase();
  if (contentType) {
    return contentType;
  }
  const pathname = String(url || "").split("?")[0].toLowerCase();
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  if (pathname.endsWith(".woff")) return "font/woff";
  if (pathname.endsWith(".ttf")) return "font/ttf";
  if (pathname.endsWith(".otf")) return "font/otf";
  if (pathname.endsWith(".css")) return "text/css";
  if (pathname.endsWith(".js")) return "application/javascript";
  return "application/octet-stream";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function remoteUrlToDataUrl(url, cache) {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) {
    return "";
  }
  if (cache.has(normalizedUrl)) {
    return cache.get(normalizedUrl);
  }
  try {
    const response = await fetchWithTimeout(normalizedUrl);
    if (!response.ok) {
      cache.set(normalizedUrl, normalizedUrl);
      return normalizedUrl;
    }
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = guessMimeType(normalizedUrl, response.headers.get("content-type"));
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    cache.set(normalizedUrl, dataUrl);
    return dataUrl;
  } catch (_error) {
    cache.set(normalizedUrl, normalizedUrl);
    return normalizedUrl;
  }
}

async function inlineCssResources(cssText, baseUrl, cache) {
  return replaceAsync(cssText, /url\((['"]?)([^'")]+)\1\)/gi, async (_match, quote, urlValue) => {
    const absoluteUrl = resolveRemoteUrl(urlValue, baseUrl);
    if (!absoluteUrl) {
      return `url(${quote || ""}${urlValue}${quote || ""})`;
    }
    const dataUrl = await remoteUrlToDataUrl(absoluteUrl, cache);
    return `url("${dataUrl}")`;
  });
}

async function inlineHtmlResources(html, cache) {
  let nextHtml = String(html || "");

  nextHtml = await replaceAsync(nextHtml, /<link\b([^>]*?)>/gi, async (fullMatch, attrs) => {
    const rel = getHtmlAttribute(attrs, "rel").toLowerCase();
    const href = getHtmlAttribute(attrs, "href");
    if (!rel.includes("stylesheet")) {
      return fullMatch;
    }
    const absoluteUrl = resolveRemoteUrl(href, "");
    if (!absoluteUrl) {
      return fullMatch;
    }
    try {
      const response = await fetchWithTimeout(absoluteUrl);
      if (!response.ok) {
        return fullMatch;
      }
      let cssText = await response.text();
      cssText = await inlineCssResources(cssText, absoluteUrl, cache);
      return `<style data-offline-source="${escapeHtml(absoluteUrl)}">\n${cssText}\n</style>`;
    } catch (_error) {
      return fullMatch;
    }
  });

  nextHtml = await replaceAsync(nextHtml, /<style\b[^>]*>([\s\S]*?)<\/style>/gi, async (_match, cssContent) => {
    const inlinedCss = await inlineCssResources(String(cssContent || ""), "", cache);
    return `<style>${inlinedCss}</style>`;
  });

  nextHtml = await replaceAsync(nextHtml, /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, async (_match, quotedValue, doubleValue, singleValue) => {
    const styleValue = String(doubleValue || singleValue || "");
    const inlinedStyle = await inlineCssResources(styleValue, "", cache);
    const escaped = quotedValue.startsWith("'")
      ? `'${inlinedStyle.replace(/'/g, "&#39;")}'`
      : `"${inlinedStyle.replace(/"/g, "&quot;")}"`;
    return ` style=${escaped}`;
  });

  nextHtml = await replaceAsync(nextHtml, /\s(src|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>` + "`" + `]+))/gi, async (_match, attrName, fullValue, dbl, sgl, bare) => {
    const originalUrl = String(dbl || sgl || bare || "").trim();
    const absoluteUrl = resolveRemoteUrl(originalUrl, "");
    if (!absoluteUrl) {
      return ` ${attrName}=${fullValue}`;
    }
    const dataUrl = await remoteUrlToDataUrl(absoluteUrl, cache);
    return ` ${attrName}="${dataUrl}"`;
  });

  return nextHtml;
}

function buildOfflinePresentationHtml(slides, title) {
  const frames = slides
    .map(
      (slide, index) => `<section class="deck-slide${index === 0 ? " active" : ""}" data-index="${index}" data-slide-id="${slide.id}">
  <div class="deck-stage">
    <div class="deck-frame">
      <iframe title="${escapeHtml(slide.title)}" srcdoc="${escapeHtml(slide.html)}" sandbox="allow-scripts allow-same-origin"></iframe>
    </div>
  </div>
</section>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title || "FacetDeck Presentation")}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #app {
      position: fixed;
      inset: 0;
      overflow: hidden;
      background: #000;
    }
    .deck-slide {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: #000;
    }
    .deck-slide.active {
      display: flex;
    }
    .deck-stage {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .deck-frame {
      width: var(--deck-frame-width, 100vw);
      height: var(--deck-frame-height, 56.25vw);
      overflow: hidden;
      flex-shrink: 0;
    }
    .deck-slide iframe {
      width: 1920px;
      height: 1080px;
      border: 0;
      background: #fff;
      display: block;
      transform: scale(var(--deck-scale, 1));
      transform-origin: top left;
    }
    .play-hint {
      position: fixed;
      z-index: 20;
      color: rgba(255, 255, 255, 0.95);
      background: linear-gradient(to bottom right, rgba(255, 107, 53, 0.8), rgba(255, 138, 92, 0.8));
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(8px);
      pointer-events: none;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 240ms ease, transform 240ms ease;
      display: flex;
      align-items: center;
      gap: 10px;
      line-height: 1.45;
    }
    .play-hint.show {
      opacity: 1;
      transform: translateY(0);
    }
    .play-hint-dot {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.9);
      transform: rotate(45deg);
      flex-shrink: 0;
    }
    .play-hint-top {
      top: 32px;
      left: 32px;
      padding: 10px 20px;
      border-bottom-left-radius: 10px;
      font-size: 14px;
      letter-spacing: 0.02em;
      font-weight: 500;
    }
    .play-hint-bottom {
      left: 50%;
      bottom: 48px;
      transform: translateX(-50%) translateY(10px);
      padding: 12px 24px;
      border-top-right-radius: 10px;
      font-size: 14px;
      letter-spacing: 0.02em;
      font-weight: 500;
      text-align: center;
      white-space: nowrap;
    }
    .play-hint-bottom.show {
      transform: translateX(-50%) translateY(0);
    }
  </style>
</head>
<body>
  <div id="app">${frames}</div>
  <div class="play-hint play-hint-top" id="hintTop">
    <span class="play-hint-dot"></span>
    <span>Press ESC to exit</span>
  </div>
  <div class="play-hint play-hint-bottom" id="hintBottom">
    <span class="play-hint-dot"></span>
    <span>Use Arrow keys to navigate slides. Press F11 for best full-screen experience.</span>
  </div>
  <script>
    (() => {
      const BASE_SLIDE_WIDTH = 1920;
      const BASE_SLIDE_HEIGHT = 1080;
      const slides = Array.from(document.querySelectorAll(".deck-slide"));
      const hintTop = document.getElementById("hintTop");
      const hintBottom = document.getElementById("hintBottom");
      let hintTimer = null;
      let activeIndex = 0;
      let lastWheelTime = 0;
      const applyContainScale = () => {
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || BASE_SLIDE_WIDTH;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || BASE_SLIDE_HEIGHT;
        const scale = Math.max(0.01, Math.min(viewportWidth / BASE_SLIDE_WIDTH, viewportHeight / BASE_SLIDE_HEIGHT));
        const frameWidth = BASE_SLIDE_WIDTH * scale;
        const frameHeight = BASE_SLIDE_HEIGHT * scale;
        document.documentElement.style.setProperty("--deck-scale", String(scale));
        document.documentElement.style.setProperty("--deck-frame-width", frameWidth + "px");
        document.documentElement.style.setProperty("--deck-frame-height", frameHeight + "px");
      };
      const showPlayHint = () => {
        if (hintTimer) {
          window.clearTimeout(hintTimer);
        }
        hintTop?.classList.add("show");
        hintBottom?.classList.add("show");
        hintTimer = window.setTimeout(() => {
          hintTop?.classList.remove("show");
          hintBottom?.classList.remove("show");
        }, 3000);
      };
      const setActive = (index) => {
        const safeIndex = Math.max(0, Math.min(slides.length - 1, index));
        if (safeIndex === activeIndex) return;
        slides[activeIndex]?.classList.remove("active");
        slides[safeIndex]?.classList.add("active");
        activeIndex = safeIndex;
      };
      const next = () => {
        if (activeIndex < slides.length - 1) {
          setActive(activeIndex + 1);
        }
      };
      const prev = () => setActive(activeIndex - 1);
      const handleWheel = (event) => {
        event.preventDefault();
        const now = Date.now();
        if (now - lastWheelTime < 500) return;
        lastWheelTime = now;
        if (event.deltaY > 0) next();
        if (event.deltaY < 0) prev();
      };
      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          next();
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          prev();
        }
      };
      const attachIframeInputBridge = (frame) => {
        if (!frame) return;
        try {
          const frameWindow = frame.contentWindow;
          const frameDoc = frame.contentDocument;
          if (!frameWindow || !frameDoc) return;
          frameWindow.addEventListener("keydown", handleKeyDown, true);
          frameWindow.addEventListener("wheel", handleWheel, { passive: false });
          frameDoc.addEventListener("keydown", handleKeyDown, true);
        } catch (_error) {}
      };
      for (const slide of slides) {
        const frame = slide.querySelector("iframe");
        if (!frame) continue;
        frame.addEventListener("load", () => attachIframeInputBridge(frame));
        attachIframeInputBridge(frame);
      }
      showPlayHint();
      applyContainScale();
      window.addEventListener("resize", applyContainScale);
      window.addEventListener("wheel", handleWheel, { passive: false });
      window.addEventListener("keydown", handleKeyDown, true);
    })();
  </script>
</body>
</html>`;
}

app.get("/api/auth/me", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await get("SELECT id, email, display_name, invite_code, use_managed_models, created_at FROM users WHERE id = ?", [userId]);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: resolveDisplayName(user.display_name, user.email),
      inviteCode: String(user.invite_code || "").trim().toUpperCase(),
      useManagedModels: user.use_managed_models !== 0,
      createdAt: user.created_at,
    },
  });
});

app.put("/api/profile/display-name", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const displayName = String(req.body?.displayName || "").trim();
  if (!displayName) {
    res.status(400).json({ error: "Display Name cannot be empty" });
    return;
  }
  if (displayName.length < 3 || displayName.length > 80) {
    res.status(400).json({ error: "Display Name must be between 3 and 80 characters" });
    return;
  }
  const taken = await isDisplayNameTaken(displayName, userId);
  if (taken) {
    res.status(409).json({ error: "Display Name already exists" });
    return;
  }
  await run("UPDATE users SET display_name = ? WHERE id = ?", [displayName, userId]);
  const user = await get("SELECT id, email, display_name, created_at FROM users WHERE id = ?", [userId]);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: resolveDisplayName(user.display_name, user.email),
      createdAt: user.created_at,
    },
  });
});

app.get("/api/profile/usage", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const cloudUsedBytes = await recalcUserCloudUsageBytes(userId);
    const row = await get(
      "SELECT credits_balance, cloud_quota_bytes FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    res.json({
      ok: true,
      usage: {
        systemCredits: Number(row?.credits_balance) || 0,
        cloudDriveUsedBytes: Number.isFinite(cloudUsedBytes) ? cloudUsedBytes : 0,
        cloudDriveQuotaBytes: Number(row?.cloud_quota_bytes) || Math.max(0, Math.floor(CLOUD_DRIVE_QUOTA_BYTES)),
      },
      pricing: {
        inputPerMTokens: CREDIT_COST_INPUT_PER_M_TOKENS,
        outputPerMTokens: CREDIT_COST_OUTPUT_PER_M_TOKENS,
        imagePerGeneration: CREDIT_COST_IMAGE_PER_GENERATION,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load usage",
    });
  }
});

app.get("/api/profile/invite", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const self = await get("SELECT id, invite_code FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!self) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const inviteCode = String(self.invite_code || "").trim().toUpperCase();
    if (!inviteCode) {
      const nextInviteCode = await generateUniqueInviteCode();
      await run("UPDATE users SET invite_code = ? WHERE id = ?", [nextInviteCode, userId]);
    }
    const finalCode = inviteCode || String((await get("SELECT invite_code FROM users WHERE id = ? LIMIT 1", [userId]))?.invite_code || "").trim().toUpperCase();
    const invitedUsersRows = await all(
      `SELECT id, email, display_name, created_at
       FROM users
       WHERE invited_by_user_id = ?
       ORDER BY created_at DESC`,
      [userId],
    );
    const invitedUsers = invitedUsersRows.map((row) => ({
      id: Number(row.id),
      email: String(row.email || ""),
      displayName: resolveDisplayName(row.display_name, row.email),
      createdAt: Number(row.created_at) || 0,
    }));
    const invitedCount = invitedUsers.length;
    res.json({
      ok: true,
      invite: {
        inviteCode: finalCode,
        inviteLink: `${APP_BASE_URL.replace(/\/+$/, "")}/register?invite=${encodeURIComponent(finalCode)}`,
        rewardPerInvite: INVITE_REWARD_CREDITS,
        invitedCount,
        totalRewardCredits: invitedCount * INVITE_REWARD_CREDITS,
        invitedUsers,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load invite data" });
  }
});

app.get("/api/model-configs", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const providerMode = await getUserProviderMode(userId);
  const llmStored = await getStoredProviderConfig(userId, "llm");
  const imgStored = await getStoredProviderConfig(userId, "img");
  const llmManaged = getManagedProviderConfig("llm");
  const imgManaged = getManagedProviderConfig("img");
  const llm = providerMode === "managed" ? llmManaged : llmStored;
  const img = providerMode === "managed" ? imgManaged : imgStored;
  res.json({
    providerMode,
    llm: llm
      ? {
          id: llm.modelId,
          url: llm.apiUrl,
          hasKey: Boolean(llm.apiKey),
          autoConcat: llm.autoConcat !== false,
          updatedAt: (llmStored?.updatedAt ?? null),
        }
      : { id: "", url: "", hasKey: false, autoConcat: true, updatedAt: null },
    img: img
      ? {
          id: img.modelId,
          url: img.apiUrl,
          hasKey: Boolean(img.apiKey),
          autoConcat: img.autoConcat !== false,
          updatedAt: (imgStored?.updatedAt ?? null),
        }
      : { id: "", url: "", hasKey: false, autoConcat: true, updatedAt: null },
  });
});

app.post("/api/model-configs", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const incoming = {
    llm: cleanConfigInput(req.body?.llm),
    img: cleanConfigInput(req.body?.img),
  };
  const providerMode = IS_SAAS_MODE
    ? (String(req.body?.providerMode || "").trim().toLowerCase() === "custom" ? "custom" : "managed")
    : "custom";
  await run("UPDATE users SET use_managed_models = ? WHERE id = ?", [providerMode === "managed" ? 1 : 0, userId]);

  const now = Date.now();
  for (const type of ["llm", "img"]) {
    const next = incoming[type];
    if (!next.modelId && !next.apiUrl && !next.apiKey) {
      continue;
    }
    if (!next.modelId || !next.apiUrl) {
      res.status(400).json({ error: `${type.toUpperCase()} model ID and API URL are required` });
      return;
    }

    const existing = await get(
      "SELECT id, api_key FROM model_configs WHERE user_id = ? AND type = ?",
      [userId, type],
    );
    const finalKey = next.apiKey || existing?.api_key || "";
    if (!finalKey) {
      res.status(400).json({ error: `${type.toUpperCase()} API key is required` });
      return;
    }

    if (existing) {
      await run(
        "UPDATE model_configs SET model_id = ?, api_key = ?, api_url = ?, auto_concat = ?, updated_at = ? WHERE id = ?",
        [next.modelId, finalKey, next.apiUrl, next.autoConcat ? 1 : 0, now, existing.id],
      );
    } else {
      await run(
        "INSERT INTO model_configs (user_id, type, model_id, api_key, api_url, auto_concat, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [userId, type, next.modelId, finalKey, next.apiUrl, next.autoConcat ? 1 : 0, now],
      );
    }
  }
  const llmStored = await getStoredProviderConfig(userId, "llm");
  const imgStored = await getStoredProviderConfig(userId, "img");
  const llmManaged = getManagedProviderConfig("llm");
  const imgManaged = getManagedProviderConfig("img");
  const llm = providerMode === "managed" ? llmManaged : llmStored;
  const img = providerMode === "managed" ? imgManaged : imgStored;
  res.json({
    message: "Configurations saved",
    providerMode,
    llm: llm
      ? {
          id: llm.modelId,
          url: llm.apiUrl,
          hasKey: Boolean(llm.apiKey),
          autoConcat: llm.autoConcat !== false,
          updatedAt: (llmStored?.updatedAt ?? null),
        }
      : { id: "", url: "", hasKey: false, autoConcat: true, updatedAt: null },
    img: img
      ? {
          id: img.modelId,
          url: img.apiUrl,
          hasKey: Boolean(img.apiKey),
          autoConcat: img.autoConcat !== false,
          updatedAt: (imgStored?.updatedAt ?? null),
        }
      : { id: "", url: "", hasKey: false, autoConcat: true, updatedAt: null },
  });
});

app.post("/api/model-configs/test", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const type = String(req.body?.type || "").trim();
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (type !== "llm" && type !== "img") {
    res.status(400).json({ error: "Invalid config type" });
    return;
  }

  const mode = await getUserProviderMode(userId);
  if (!IS_SAAS_MODE && mode === "managed") {
    res.status(400).json({ error: "Managed provider mode is unavailable in OSS mode" });
    return;
  }
  const provided = cleanConfigInput(req.body?.config);
  const saved = await getStoredProviderConfig(userId, type);
  const managed = getManagedProviderConfig(type);
  const merged = mode === "managed"
    ? managed
    : {
        modelId: provided.modelId || saved?.modelId || "",
        apiUrl: provided.apiUrl || saved?.apiUrl || "",
        apiKey: provided.apiKey || saved?.apiKey || "",
        autoConcat: typeof req.body?.config?.autoConcat === "boolean"
          ? req.body.config.autoConcat
          : saved?.autoConcat !== false,
      };
  if (!merged.modelId || !merged.apiUrl || !merged.apiKey) {
    res.status(400).json({ error: "Model ID, API URL and API key are required before testing" });
    return;
  }

  try {
    if (mode === "managed") {
      await ensureManagedCreditsAvailable(userId, type === "img" ? CREDIT_COST_IMAGE_PER_GENERATION : 1);
    }
    await runProviderHealthCheck({ type, config: merged });
    res.json({ ok: true, message: `${type.toUpperCase()} health check succeeded` });
  } catch (error) {
    res.status(error?.httpStatus || 400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Health check failed",
    });
  }
});

app.get("/api/style-presets", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const privatePresets = readUserPresets(userId);
  res.json({
    ok: true,
    builtinPresets: BUILTIN_PRESETS,
    privatePresets,
  });
});

app.post("/api/style-presets", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const incoming = normalizeUserPresetInput(req.body || {}, 0);
    const existing = readUserPresets(userId);
    const deduped = existing.filter(
      (item) => item.id !== incoming.id && item.name.toLowerCase() !== incoming.name.toLowerCase(),
    );
    const next = [incoming, ...deduped].slice(0, 100);
    const deckBytes = await getUserDeckStorageBytes(userId);
    const projectedPresetBytes = Buffer.byteLength(JSON.stringify({ presets: next }, null, 2), "utf8");
    await ensureCloudCapacityForProjectedUsage(userId, deckBytes + projectedPresetBytes);
    writeUserPresets(userId, next);
    await recalcUserCloudUsageBytes(userId);
    res.json({ ok: true, preset: incoming, privatePresets: next });
  } catch (error) {
    res.status(error?.httpStatus || 400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save preset",
    });
  }
});

app.delete("/api/style-presets/:id", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const presetId = req.params.id;
    const existing = readUserPresets(userId);
    const next = existing.filter((item) => item.id !== presetId);
    writeUserPresets(userId, next);
    await recalcUserCloudUsageBytes(userId);
    res.json({ ok: true, privatePresets: next });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to delete preset",
    });
  }
});

app.get("/api/plugins/market", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await all(
      `SELECT m.*, i.enabled AS installed_enabled, i.granted_permissions_json
       FROM plugin_market_items m
       LEFT JOIN plugin_user_installs i ON i.plugin_id = m.id AND i.user_id = ?
       WHERE m.status = 'approved'
       ORDER BY m.updated_at DESC, m.id DESC`,
      [userId],
    );
    const plugins = rows
      .map((row) => {
        const manifest = parsePluginManifest(row.manifest_json);
        if (!manifest) return null;
        const grantedPermissions = normalizeGrantedPermissions(safeParseJsonArray(row.granted_permissions_json), manifest);
        return mapPluginMarketRow(row, {
          installed: row.installed_enabled !== null && row.installed_enabled !== undefined,
          enabled: Number(row.installed_enabled) === 1,
          grantedPermissions,
          screenshots: safeParseJsonArray(row.screenshots_json),
        });
      })
      .filter(Boolean);
    res.json({ ok: true, plugins, capabilities: PLUGIN_CAPABILITIES });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load plugin market",
    });
  }
});

app.post("/api/plugins/market", authRequired, async (req, res) => {
  res.status(403).json({
    ok: false,
    error: "Direct marketplace publish is disabled. Publish via Community plugin post only.",
  });
});

app.get("/api/plugins/me", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await all(
      `SELECT i.*, m.name, m.description, m.author, m.version, m.entry_html, m.manifest_json, m.manifest_id
       FROM plugin_user_installs i
       LEFT JOIN plugin_market_items m ON m.id = i.plugin_id
       WHERE i.user_id = ?
       ORDER BY i.updated_at DESC, i.plugin_id DESC`,
      [userId],
    );
    const plugins = rows
      .map((row) => {
        const manifest = parsePluginManifest(row.manifest_json);
        if (!manifest) return null;
        const grantedPermissions = normalizeGrantedPermissions(safeParseJsonArray(row.granted_permissions_json), manifest);
        const requestedPermissions = Array.isArray(manifest.permissions)
          ? manifest.permissions
            .map((item) => String(item?.capability || "").trim())
            .filter((item, index, list) => isPluginCapability(item) && list.indexOf(item) === index)
          : [];
        const missingPermissions = requestedPermissions.filter((capability) => !grantedPermissions.includes(capability));
        return {
          id: String(row.plugin_id || ""),
          manifestId: String(row.manifest_id || manifest.id || ""),
          name: String(row.name || manifest.name || ""),
          description: String(row.description || manifest.description || ""),
          author: String(row.author || manifest.author || "Community Author"),
          version: String(row.version || manifest.version || "1.0.0"),
          entryHtml: String(row.entry_html || ""),
          enabled: Number(row.enabled) === 1,
          manifest,
          grantedPermissions,
          requiresReauth: missingPermissions.length > 0,
          missingPermissions,
          installedAt: Number(row.installed_at) || Date.now(),
        };
      })
      .filter(Boolean);
    res.json({ ok: true, plugins });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load installed plugins",
    });
  }
});

app.post("/api/plugins/install", authRequired, async (req, res) => {
  res.status(403).json({
    ok: false,
    error: "Direct plugin install is disabled. Install via Community post add-to-library only.",
  });
});

app.post("/api/plugins/:id/toggle", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const pluginId = String(req.params.id || "").trim();
    const enabled = req.body?.enabled === false ? 0 : 1;
    const now = Date.now();
    const existing = await get("SELECT plugin_id FROM plugin_user_installs WHERE user_id = ? AND plugin_id = ? LIMIT 1", [userId, pluginId]);
    if (!existing) {
      res.status(404).json({ error: "Plugin not installed" });
      return;
    }
    await run(
      "UPDATE plugin_user_installs SET enabled = ?, updated_at = ? WHERE user_id = ? AND plugin_id = ?",
      [enabled, now, userId, pluginId],
    );
    res.json({ ok: true, pluginId, enabled: enabled === 1 });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to toggle plugin",
    });
  }
});

app.delete("/api/plugins/:id/install", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const pluginId = String(req.params.id || "").trim();
    await run("DELETE FROM plugin_user_installs WHERE user_id = ? AND plugin_id = ?", [userId, pluginId]);
    await run("DELETE FROM plugin_private_storage WHERE user_id = ? AND plugin_id = ?", [userId, pluginId]);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to uninstall plugin",
    });
  }
});

app.post("/api/plugins/:id/context/history", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const pluginId = String(req.params.id || "").trim();
  const startedAt = Date.now();
  try {
    await ensurePluginInvocationAllowed({ userId, pluginId, capability: "context.history.read" });
    await enforcePluginRateLimit({ userId, pluginId, capability: "context.history.read" });
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const limit = Math.min(100, Math.max(1, Number(req.body?.limit) || 30));
    const cursor = Math.max(0, Number(req.body?.cursor) || 0);
    const normalized = history
      .slice(cursor, cursor + limit)
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        return {
          id: String(item.id || "").trim().slice(0, 120),
          role: String(item.role || "").trim().slice(0, 30),
          text: String(item.text || "").trim().slice(0, 20_000),
          createdAt: Number(item.createdAt) || Date.now(),
        };
      })
      .filter(Boolean);
    await logPluginInvocation({ userId, pluginId, capability: "context.history.read", ok: true, errorMessage: "", durationMs: Date.now() - startedAt });
    res.json({ ok: true, history: normalized, nextCursor: cursor + normalized.length, hasMore: cursor + normalized.length < history.length });
  } catch (error) {
    await logPluginInvocation({
      userId,
      pluginId,
      capability: "context.history.read",
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Invocation failed",
      durationMs: Date.now() - startedAt,
    });
    res.status(error?.httpStatus || 400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to read history" });
  }
});

app.post("/api/plugins/:id/context/page-html", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const pluginId = String(req.params.id || "").trim();
  const startedAt = Date.now();
  try {
    await ensurePluginInvocationAllowed({ userId, pluginId, capability: "context.pageHtml.read" });
    await enforcePluginRateLimit({ userId, pluginId, capability: "context.pageHtml.read" });
    const html = String(req.body?.html || "");
    const slideId = Number(req.body?.slideId) || 0;
    const maxLength = Math.min(100_000, Math.max(500, Number(req.body?.maxLength) || 40_000));
    const truncated = html.slice(0, maxLength);
    await logPluginInvocation({ userId, pluginId, capability: "context.pageHtml.read", ok: true, errorMessage: "", durationMs: Date.now() - startedAt });
    res.json({ ok: true, html: truncated, slideId, truncated: html.length > truncated.length });
  } catch (error) {
    await logPluginInvocation({
      userId,
      pluginId,
      capability: "context.pageHtml.read",
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Invocation failed",
      durationMs: Date.now() - startedAt,
    });
    res.status(error?.httpStatus || 400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to read page html" });
  }
});

app.post("/api/plugins/:id/invoke", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const pluginId = String(req.params.id || "").trim();
  const capability = String(req.body?.capability || "").trim();
  const method = String(req.body?.method || "").trim();
  const params = req.body?.params && typeof req.body.params === "object" ? req.body.params : {};
  const startedAt = Date.now();
  try {
    await ensurePluginInvocationAllowed({ userId, pluginId, capability });
    await enforcePluginRateLimit({ userId, pluginId, capability });
    if (capability === "ai.chat.invoke" && method === "ai.chat.completions.create") {
      const prompt = String(params.prompt || "").trim().slice(0, 30_000);
      if (!prompt) {
        throw new Error("Prompt is required");
      }
      const configBundle = await getEffectiveProviderConfig(userId, "llm");
      if (!configBundle.config) {
        const error = new Error("No available LLM provider");
        error.httpStatus = 400;
        throw error;
      }
      const resultText = await callLlmChatCompletionAdaptiveTokens({
        config: { ...configBundle.config, userId, billable: configBundle.source === "managed" },
        temperature: Number(params.temperature) || 0.6,
        messages: [
          {
            role: "system",
            content: "You are a plugin helper in FacetDeck. Return concise and safe output.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });
      await logPluginInvocation({ userId, pluginId, capability, ok: true, errorMessage: "", durationMs: Date.now() - startedAt });
      res.json({ ok: true, data: { text: resultText } });
      return;
    }
    if (capability === "ai.image.generate" && method === "ai.image.generate") {
      const prompt = String(params.prompt || "").trim().slice(0, 2_000);
      if (!prompt) {
        throw new Error("Prompt is required");
      }
      const configBundle = await getEffectiveProviderConfig(userId, "img");
      if (!configBundle.config) {
        const error = new Error("No available image provider");
        error.httpStatus = 400;
        throw error;
      }
      const image = await tryGenerateImage({
        config: { ...configBundle.config, userId, billable: configBundle.source === "managed" },
        prompt,
      });
      if (!image) {
        throw new Error("Image generation failed");
      }
      await logPluginInvocation({ userId, pluginId, capability, ok: true, errorMessage: "", durationMs: Date.now() - startedAt });
      res.json({ ok: true, data: { imageUrl: image } });
      return;
    }
    if (capability === "storage.private" && method === "storage.get") {
      const key = String(params.key || "").trim().slice(0, 120);
      if (!key) throw new Error("Storage key is required");
      const row = await get(
        "SELECT storage_value FROM plugin_private_storage WHERE user_id = ? AND plugin_id = ? AND storage_key = ? LIMIT 1",
        [userId, pluginId, key],
      );
      await logPluginInvocation({ userId, pluginId, capability, ok: true, errorMessage: "", durationMs: Date.now() - startedAt });
      res.json({ ok: true, data: { value: String(row?.storage_value || "") } });
      return;
    }
    if (capability === "storage.private" && method === "storage.set") {
      const key = String(params.key || "").trim().slice(0, 120);
      const value = String(params.value || "").slice(0, 20_000);
      if (!key) throw new Error("Storage key is required");
      await run(
        `INSERT INTO plugin_private_storage (user_id, plugin_id, storage_key, storage_value, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, plugin_id, storage_key)
         DO UPDATE SET storage_value = excluded.storage_value, updated_at = excluded.updated_at`,
        [userId, pluginId, key, value, Date.now()],
      );
      await logPluginInvocation({ userId, pluginId, capability, ok: true, errorMessage: "", durationMs: Date.now() - startedAt });
      res.json({ ok: true, data: { saved: true } });
      return;
    }
    if (capability === "context.selection.read" && method === "context.getSelection") {
      const selection = Array.isArray(params.selection) ? params.selection : [];
      const normalized = selection
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          return {
            name: String(item.name || "").trim().slice(0, 200),
            kind: String(item.kind || "").trim().slice(0, 40),
            slideId: Number(item.slideId) || undefined,
          };
        })
        .filter(Boolean);
      await logPluginInvocation({ userId, pluginId, capability, ok: true, errorMessage: "", durationMs: Date.now() - startedAt });
      res.json({ ok: true, data: { selection: normalized } });
      return;
    }
    throw new Error("Unsupported plugin invoke method");
  } catch (error) {
    await logPluginInvocation({
      userId,
      pluginId,
      capability,
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Invocation failed",
      durationMs: Date.now() - startedAt,
    });
    res.status(error?.httpStatus || 400).json({ ok: false, error: error instanceof Error ? error.message : "Plugin invoke failed" });
  }
});

app.get("/api/plugins/logs", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await all(
      `SELECT plugin_id, capability, ok, error_message, duration_ms, created_at
       FROM plugin_invocation_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 200`,
      [userId],
    );
    res.json({
      ok: true,
      logs: rows.map((row) => ({
        pluginId: String(row.plugin_id || ""),
        capability: String(row.capability || ""),
        ok: Number(row.ok) === 1,
        error: String(row.error_message || ""),
        durationMs: Number(row.duration_ms) || 0,
        createdAt: Number(row.created_at) || Date.now(),
      })),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load plugin logs",
    });
  }
});

if (IS_SAAS_MODE && typeof privateSaasModule?.registerCommunityRoutes === "function") {
  privateSaasModule.registerCommunityRoutes({
    app,
    authRequired,
    saasOnly,
    deps: {
      all,
      get,
      run,
      randomUUID,
      resolveDisplayName,
      mapCommunityPostRow,
      normalizeCommunityType,
      normalizeTemplateAttachments,
      normalizePluginManifest,
      parsePluginManifest,
      safeParseJsonArray,
      normalizeGrantedPermissions,
      normalizeUserPresetInput,
      upsertPluginMarketItemByManifest,
      collectManagedAssetKeysFromCommunityPost,
      syncManagedAssetReferencesForSource,
      parseImageDataUrl,
      ensureCloudCapacityForAdditionalBytes,
      ensureCloudCapacityForProjectedUsage,
      uploadImageBufferToStorage,
      registerManagedAssetRecord,
      adjustUserCloudUsageBytes,
      getUserDeckStorageBytes,
      readUserPresets,
      writeUserPresets,
      recalcUserCloudUsageBytes,
      OSS_FOLDER,
      Buffer,
    },
  });
}

app.get("/api/repository/decks", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await all(
      "SELECT id, title, share_code, slide_count, theme_primary, theme_secondary, presentation_json, updated_at FROM repository_decks WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
      [userId],
    );
    res.json({
      ok: true,
      decks: rows.map(parseRepositoryDeckRow),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load repository decks",
    });
  }
});

app.post("/api/repository/decks", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const normalized = normalizeRepositoryDeckPayload(req.body || {});
    if (normalized.slideCount <= 0) {
      res.status(400).json({ ok: false, error: "Presentation must include at least one slide with HTML" });
      return;
    }
    const currentUsage = await recalcUserCloudUsageBytes(userId);
    const projectedUsage = currentUsage + Buffer.byteLength(JSON.stringify(normalized.presentation), "utf8");
    await ensureCloudCapacityForProjectedUsage(userId, projectedUsage);
    const now = Date.now();
    const shareCode = await generateUniqueShareCode();
    const inserted = await run(
      "INSERT INTO repository_decks (user_id, title, share_code, slide_count, theme_primary, theme_secondary, presentation_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        userId,
        normalized.title,
        shareCode,
        normalized.slideCount,
        normalized.themePrimary,
        normalized.themeSecondary,
        JSON.stringify(normalized.presentation),
        now,
        now,
      ],
    );
    await syncManagedAssetReferencesForSource({
      sourceType: "repository_deck",
      sourceId: createSourceRefId(userId, inserted.lastID),
      assetKeys: collectManagedAssetKeysFromPresentation(normalized.presentation),
    });
    const row = await get(
      "SELECT id, title, share_code, slide_count, theme_primary, theme_secondary, presentation_json, updated_at FROM repository_decks WHERE id = ? AND user_id = ?",
      [inserted.lastID, userId],
    );
    if (!row) {
      res.status(500).json({ ok: false, error: "Saved deck could not be loaded" });
      return;
    }
    await recalcUserCloudUsageBytes(userId);
    res.json({ ok: true, deck: parseRepositoryDeckRow(row) });
  } catch (error) {
    res.status(error?.httpStatus || 500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save repository deck",
    });
  }
});

app.put("/api/repository/decks/:id", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const deckId = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!deckId) {
    res.status(400).json({ ok: false, error: "Invalid deck id" });
    return;
  }
  try {
    const normalized = normalizeRepositoryDeckPayload(req.body || {});
    if (normalized.slideCount <= 0) {
      res.status(400).json({ ok: false, error: "Presentation must include at least one slide with HTML" });
      return;
    }
    const existingRow = await get(
      "SELECT presentation_json FROM repository_decks WHERE id = ? AND user_id = ? LIMIT 1",
      [deckId, userId],
    );
    if (!existingRow) {
      res.status(404).json({ ok: false, error: "Deck not found" });
      return;
    }
    const currentUsage = await recalcUserCloudUsageBytes(userId);
    const oldBytes = Buffer.byteLength(String(existingRow.presentation_json || ""), "utf8");
    const nextBytes = Buffer.byteLength(JSON.stringify(normalized.presentation), "utf8");
    const projectedUsage = Math.max(0, currentUsage - oldBytes + nextBytes);
    await ensureCloudCapacityForProjectedUsage(userId, projectedUsage);
    const now = Date.now();
    const updated = await run(
      "UPDATE repository_decks SET title = ?, slide_count = ?, theme_primary = ?, theme_secondary = ?, presentation_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [
        normalized.title,
        normalized.slideCount,
        normalized.themePrimary,
        normalized.themeSecondary,
        JSON.stringify(normalized.presentation),
        now,
        deckId,
        userId,
      ],
    );
    if (!updated.changes) {
      res.status(404).json({ ok: false, error: "Deck not found" });
      return;
    }
    await syncManagedAssetReferencesForSource({
      sourceType: "repository_deck",
      sourceId: createSourceRefId(userId, deckId),
      assetKeys: collectManagedAssetKeysFromPresentation(normalized.presentation),
    });
    const row = await get(
      "SELECT id, title, share_code, slide_count, theme_primary, theme_secondary, presentation_json, updated_at FROM repository_decks WHERE id = ? AND user_id = ?",
      [deckId, userId],
    );
    if (!row) {
      res.status(500).json({ ok: false, error: "Updated deck could not be loaded" });
      return;
    }
    await recalcUserCloudUsageBytes(userId);
    res.json({ ok: true, deck: parseRepositoryDeckRow(row) });
  } catch (error) {
    res.status(error?.httpStatus || 500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update repository deck",
    });
  }
});

app.delete("/api/repository/decks/:id", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const deckId = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!deckId) {
    res.status(400).json({ ok: false, error: "Invalid deck id" });
    return;
  }
  try {
    const removed = await run("DELETE FROM repository_decks WHERE id = ? AND user_id = ?", [deckId, userId]);
    if (!removed.changes) {
      res.status(404).json({ ok: false, error: "Deck not found" });
      return;
    }
    await clearManagedAssetReferencesForSource("repository_deck", createSourceRefId(userId, deckId));
    await recalcUserCloudUsageBytes(userId);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to delete repository deck",
    });
  }
});

app.post("/api/repository/decks/:id/share-link", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const deckId = Number(req.params.id);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!deckId) {
    res.status(400).json({ ok: false, error: "Invalid deck id" });
    return;
  }
  try {
    const row = await get(
      "SELECT id, share_code FROM repository_decks WHERE id = ? AND user_id = ? LIMIT 1",
      [deckId, userId],
    );
    if (!row) {
      res.status(404).json({ ok: false, error: "Deck not found" });
      return;
    }
    const shareCode = String(row.share_code || "").trim() || await ensureDeckShareCode(deckId);
    const baseUrl = getRequestBaseUrl(req);
    const shareUrl = `${baseUrl}/api/share/${encodeURIComponent(shareCode)}`;
    res.json({
      ok: true,
      deckId,
      shareCode,
      shareUrl,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create share link",
    });
  }
});

async function renderSharedPresentationByCode(shareCodeRaw, res) {
  const shareCode = String(shareCodeRaw || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,24}$/.test(shareCode)) {
    res.status(404).send("Share link not found");
    return;
  }
  try {
    const row = await get(
      "SELECT id, title, presentation_json FROM repository_decks WHERE share_code = ? LIMIT 1",
      [shareCode],
    );
    if (!row) {
      res.status(404).send("Share link not found");
      return;
    }
    let presentation = {};
    try {
      presentation = JSON.parse(String(row.presentation_json || "{}"));
    } catch (_error) {
      presentation = {};
    }
    const slides = normalizeExportSlides(presentation?.slides);
    if (slides.length === 0) {
      res.status(404).send("Share link not found");
      return;
    }
    const html = buildOfflinePresentationHtml(
      slides,
      String(presentation?.title || row.title || "FacetDeck Presentation"),
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : "Failed to open shared presentation");
  }
}

app.get("/api/share/:shareCode", async (req, res) => {
  await renderSharedPresentationByCode(req.params.shareCode, res);
});

app.get("/share/:shareCode", async (req, res) => {
  await renderSharedPresentationByCode(req.params.shareCode, res);
});

app.post("/api/ppt/generate-outline", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const { idea, purpose, length, vibe, slideLanguage, llmLanguage, assets } = req.body || {};
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const prompt = String(idea || "").trim();
  if (!prompt) {
    res.status(400).json({ error: "Idea is required" });
    return;
  }
  const normalizedAssets = Array.isArray(assets)
    ? assets.map((item, index) => normalizeWizardAsset(item, index)).filter((item) => item.isImage)
    : [];
  if (hasMissingAssetDescriptions(normalizedAssets)) {
    res.status(400).json({ error: "Each uploaded image requires a description" });
    return;
  }

  const llmResolved = await getEffectiveProviderConfig(userId, "llm");
  if (!llmResolved.config) {
    res.status(400).json({ error: "Please configure an LLM provider in Profile first" });
    return;
  }
  const llmConfig = { ...llmResolved.config, userId, billable: llmResolved.source === "managed" };

  try {
    const rawOutline = await generateOutlineWithLlm({
      llmConfig,
      prompt,
      purpose,
      length,
      vibe,
      slideLanguage: String(slideLanguage || "English"),
      llmLanguage: String(llmLanguage || "English"),
      assets: normalizedAssets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        imageUrl: asset.imageUrl || "",
        imageWidth: asset.imageWidth || 0,
        imageHeight: asset.imageHeight || 0,
        imageAspectRatio: asset.imageAspectRatio || 0,
        imageOrientation: asset.imageOrientation || "",
        userDescription: asset.userDescription,
      })),
    });
    const outline = normalizeOutlineDraft(prompt, rawOutline);
    res.json({ ok: true, outline });
  } catch (error) {
    res.status(400).json({ error: toUserFacingLlmError(error, "Failed to generate outline") });
  }
});

app.post("/api/ppt/revise-outline", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const { idea, purpose, length, vibe, slideLanguage, llmLanguage, assets, outline, instruction } = req.body || {};
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const prompt = String(idea || "").trim();
  const userInstruction = String(instruction || "").trim();
  if (!prompt || !outline || !userInstruction) {
    res.status(400).json({ error: "idea, outline and instruction are required" });
    return;
  }

  const llmResolved = await getEffectiveProviderConfig(userId, "llm");
  if (!llmResolved.config) {
    res.status(400).json({ error: "Please configure an LLM provider in Profile first" });
    return;
  }
  const llmConfig = { ...llmResolved.config, userId, billable: llmResolved.source === "managed" };
  const normalizedAssets = Array.isArray(assets)
    ? assets.map((item, index) => normalizeWizardAsset(item, index)).filter((item) => item.isImage)
    : [];

  try {
    const revisedContent = await callLlmChatCompletionAdaptiveTokens({
      config: llmConfig,
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: [
            "You revise PPT outlines based on user instruction.",
            "Return strictly valid JSON object only.",
            "Keep schema unchanged: title + slides[] (type,title,bullets,speakerNotes,slideVisualDirection,imageAssetIds,aiImageNeeded,aiImagePrompts).",
            "Preserve structure quality and concise language.",
            "For each slide, reassess AI image necessity by aesthetics/content richness/layout balance.",
            "Use aiImageNeeded=false with aiImagePrompts=[] when image is unnecessary.",
            "When needed, aiImagePrompts must contain 1-3 prompts only.",
            "Critical distinction:",
            "- slideVisualDirection is slide/web visual-direction guidance.",
            "- aiImagePrompts are text-to-image prompts for reusable PPT assets only.",
            "aiImagePrompts must NOT request a full PPT page/screenshot/layout with title and bullets.",
            "Prefer asset-level outputs in aiImagePrompts (subject cutouts, scene photos, abstract textures, icon-style illustrations, data visuals as isolated assets).",
            "Language rule: all textual values in returned JSON (title, slides[].title, bullets, speakerNotes, slideVisualDirection, aiImagePrompts.prompt) MUST use slideLanguage.",
            "llmLanguage is only for understanding user instruction context; output language must still follow slideLanguage.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            idea: prompt,
            purpose,
            length,
            vibe,
            slideLanguage: String(slideLanguage || "English"),
            llmLanguage: String(llmLanguage || "English"),
            instruction: userInstruction,
            assets: normalizedAssets.map((asset) => ({
              id: asset.id,
              name: asset.name,
              imageUrl: asset.imageUrl || "",
              imageWidth: asset.imageWidth || 0,
              imageHeight: asset.imageHeight || 0,
              imageAspectRatio: asset.imageAspectRatio || 0,
              imageOrientation: asset.imageOrientation || "",
              userDescription: asset.userDescription,
            })),
            outline,
          }),
        },
      ],
    });
    const revised = parseJsonFromModelContent(revisedContent);
    const normalized = normalizeOutlineDraft(prompt, revised);
    res.json({ ok: true, outline: normalized });
  } catch (error) {
    res.status(400).json({ error: toUserFacingLlmError(error, "Failed to revise outline") });
  }
});

app.post("/api/assets/upload-data-url", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  try {
    if (!ossClient) {
      return res.status(400).json({
        error:
          "OSS is not configured. Please set OSS_REGION/OSS_BUCKET/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET.",
      });
    }
    const dataUrl = String(req.body?.dataUrl || "").trim();
    const fileName = String(req.body?.fileName || "").trim();
    const folder = String(req.body?.folder || `${OSS_FOLDER || "assets"}/user-elements`).trim().slice(0, 80);
    const { buffer, mimeType, ext } = parseImageDataUrl(dataUrl);
    if (buffer.length > 12 * 1024 * 1024) {
      return res.status(413).json({ error: "Image is too large (max 12MB)." });
    }
    if (userId) {
      await ensureCloudCapacityForAdditionalBytes(userId, buffer.length);
    }
    const suggestedExt = String(fileName.split(".").pop() || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const uploaded = await uploadImageBufferToOss({
      buffer,
      mimeType,
      folder: folder || `${OSS_FOLDER || "assets"}/user-elements`,
      ext: suggestedExt || ext,
    });
    if (userId) {
      await registerManagedAssetRecord({
        publicUrl: uploaded.url,
        storageType: "oss",
        storageKey: uploaded.key,
        ownerUserId: userId,
        byteSize: buffer.length,
      });
    }
    if (userId) {
      await adjustUserCloudUsageBytes(userId, buffer.length);
    }
    return res.json({
      ok: true,
      key: uploaded.key,
      url: uploaded.url,
      imageWidth: uploaded.imageWidth || 0,
      imageHeight: uploaded.imageHeight || 0,
      imageAspectRatio: uploaded.imageAspectRatio || 0,
      imageOrientation: uploaded.imageOrientation || "square",
    });
  } catch (error) {
    return res.status(error?.httpStatus || 400).json({ error: error instanceof Error ? error.message : "Failed to upload image" });
  }
});

app.post("/api/assets/upload-remote-url", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  try {
    const remoteUrl = String(req.body?.url || "").trim();
    const fileName = String(req.body?.fileName || "").trim();
    const folder = String(req.body?.folder || `${OSS_FOLDER || "assets"}/user-elements`).trim().slice(0, 80);
    if (!/^https?:\/\//i.test(remoteUrl)) {
      return res.status(400).json({ error: "Invalid remote image URL" });
    }
    const response = await fetch(remoteUrl);
    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch remote image (HTTP ${response.status})` });
    }
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ error: "Remote URL is not an image" });
    }
    const extByType = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
    const suggestedExt = String(fileName.split(".").pop() || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const ext = suggestedExt || extByType || "png";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
      return res.status(400).json({ error: "Remote image is empty" });
    }
    if (buffer.length > 12 * 1024 * 1024) {
      return res.status(413).json({ error: "Image is too large (max 12MB)." });
    }
    if (userId) {
      await ensureCloudCapacityForAdditionalBytes(userId, buffer.length);
    }
    const uploaded = await uploadImageBufferToStorage({
      buffer,
      mimeType: contentType || "image/png",
      ext,
      folder: folder || `${OSS_FOLDER || "assets"}/user-elements`,
      req,
    });
    if (userId) {
      await registerManagedAssetRecord({
        publicUrl: uploaded.url,
        storageType: uploaded.storageType,
        storageKey: uploaded.storageKey,
        localPath: uploaded.localPath,
        ownerUserId: userId,
        byteSize: uploaded.byteSize,
      });
      await adjustUserCloudUsageBytes(userId, uploaded.byteSize);
    }
    return res.json({
      ok: true,
      url: uploaded.url,
      byteSize: uploaded.byteSize,
      storageType: uploaded.storageType,
      imageWidth: uploaded.imageWidth || 0,
      imageHeight: uploaded.imageHeight || 0,
      imageAspectRatio: uploaded.imageAspectRatio || 0,
      imageOrientation: uploaded.imageOrientation || "square",
    });
  } catch (error) {
    return res.status(error?.httpStatus || 400).json({ error: error instanceof Error ? error.message : "Failed to upload remote image" });
  }
});

app.post("/api/ppt/revise-selected-slides", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const currentMessage = String(body.currentMessage || "").trim();
  const slideLanguage = String(body.slideLanguage || "English").trim().slice(0, 40) || "English";
  const llmLanguage = String(body.llmLanguage || "English").trim().slice(0, 40) || "English";
  const selectionModeRaw = String(body.selectionMode || "").trim().toLowerCase();
  const selectionMode = ["none", "slide", "element", "mixed"].includes(selectionModeRaw)
    ? selectionModeRaw
    : "none";
  const recentHistory = Array.isArray(body.recentHistory) ? body.recentHistory : [];
  const selectedElements = Array.isArray(body.selectedElements) ? body.selectedElements : [];
  if (ossClient) {
    for (const item of selectedElements.slice(0, 10)) {
      const currentUrl = String(item?.elementUrl || "").trim();
      const fallbackDataUrl = String(item?.elementDataUrl || "").trim();
      if (!/^https?:\/\//i.test(currentUrl) || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(fallbackDataUrl)) {
        continue;
      }
      let reachable = false;
      try {
        const probe = await fetch(currentUrl, { method: "GET" });
        reachable = probe.ok;
      } catch (_error) {}
      if (reachable) {
        continue;
      }
      try {
        const { buffer, mimeType, ext } = parseImageDataUrl(fallbackDataUrl);
        const uploaded = await uploadImageBufferToOss({
          buffer,
          mimeType,
          folder: `${OSS_FOLDER || "assets"}/recovered-elements`,
          ext,
        });
        if (userId) {
          await registerManagedAssetRecord({
            publicUrl: uploaded.url,
            storageType: "oss",
            storageKey: uploaded.key,
            ownerUserId: userId,
            byteSize: buffer.length,
          });
        }
        item.elementUrl = uploaded.url;
      } catch (_error) {}
    }
  }
  const selectedSlideIds = Array.isArray(body.selectedSlideIds)
    ? body.selectedSlideIds
        .map((item) => Number(item))
        .filter((item, index, arr) => Number.isFinite(item) && item > 0 && arr.indexOf(item) === index)
    : [];
  const selectedElementSlideIds = Array.isArray(body.selectedElementSlideIds)
    ? body.selectedElementSlideIds
        .map((item) => Number(item))
        .filter((item, index, arr) => Number.isFinite(item) && item > 0 && arr.indexOf(item) === index)
    : [];
  const selectedElementSlidesRaw = Array.isArray(body.selectedElementSlides) ? body.selectedElementSlides : [];
  const allSlidesRaw = Array.isArray(body.allSlides) ? body.allSlides : [];
  const editableSlidesRaw = Array.isArray(body.editableSlides) ? body.editableSlides : [];
  const readonlySlideIds = Array.isArray(body.readonlySlideIds)
    ? body.readonlySlideIds.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
    : [];

  if (!currentMessage) {
    res.status(400).json({ error: "currentMessage is required" });
    return;
  }
  const allSlidesNormalized = (allSlidesRaw.length > 0 ? allSlidesRaw : editableSlidesRaw)
    .map((item, index) => ({
      id: Number(item?.id) || index + 1,
      title: String(item?.title || `Slide ${index + 1}`).trim().slice(0, 180),
      type: String(item?.type || "Content").trim().slice(0, 40),
      html: String(item?.html || ""),
    }));
  const editableSlidesNormalized = editableSlidesRaw.length > 0
    ? editableSlidesRaw
    : allSlidesNormalized;
  const effectiveEditableSlideIds = selectedSlideIds.length > 0
    ? selectedSlideIds
    : allSlidesNormalized
        .map((slide) => slide.id)
        .filter((id, index, arr) => Number.isFinite(id) && id > 0 && arr.indexOf(id) === index);
  const editableSlides = editableSlidesNormalized
    .map((item, index) => ({
      id: Number(item?.id) || index + 1,
      title: String(item?.title || `Slide ${index + 1}`).trim().slice(0, 180),
      type: String(item?.type || "Content").trim().slice(0, 40),
      html: String(item?.html || ""),
    }))
    .filter((slide) => effectiveEditableSlideIds.includes(slide.id));
  const blankEditableSlideIds = editableSlides
    .filter((slide) => isBlankOrNonSlideHtml(slide?.html))
    .map((slide) => Number(slide.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  const hasBlankEditableSlides = blankEditableSlideIds.length > 0;
  const templateSlide = allSlidesNormalized.find((slide) => !isBlankOrNonSlideHtml(slide?.html));
  const deckTemplateSnippet = templateSlide ? String(templateSlide.html || "").slice(0, 12_000) : "";
  const selectedElementSlides = selectedElementSlidesRaw
    .map((item, index) => ({
      id: Number(item?.id) || index + 1,
      title: String(item?.title || `Slide ${index + 1}`).trim().slice(0, 180),
      type: String(item?.type || "Content").trim().slice(0, 40),
      html: String(item?.html || ""),
    }))
    .filter((slide, index, arr) =>
      selectedElementSlideIds.includes(slide.id) && arr.findIndex((item) => item.id === slide.id) === index,
    );

  if (editableSlides.length === 0) {
    res.status(400).json({ error: "No editable slide code found for selected slides" });
    return;
  }

  const llmResolved = await getEffectiveProviderConfig(userId, "llm");
  if (!llmResolved.config) {
    res.status(400).json({ error: "Please configure an LLM provider in Profile first" });
    return;
  }
  const llmConfig = { ...llmResolved.config, userId, billable: llmResolved.source === "managed" };

  try {
    const applyStructuredOperations = (html, operations) => {
      let updated = String(html || "");
      const ops = Array.isArray(operations) ? operations : [];
      const safeName = (value) => String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
      const safeHexOrColor = (value) => String(value || "").trim().slice(0, 80);
      for (const op of ops.slice(0, 24)) {
        const type = String(op?.type || "").trim();
        if (type === "set_css_var") {
          const name = safeName(op?.name);
          const value = safeHexOrColor(op?.value);
          if (!name || !value) continue;
          const regex = new RegExp(`(--${name}\\s*:\\s*)([^;]+)(;)`, "gi");
          if (regex.test(updated)) {
            updated = updated.replace(regex, `$1${value}$3`);
          } else {
            updated = updated.replace(/<\/style>/i, `  --${name}: ${value};\n</style>`);
          }
          continue;
        }
        if (type === "replace_text") {
          const from = String(op?.from || "");
          const to = String(op?.to || "");
          if (!from) continue;
          updated = updated.split(from).join(to);
          continue;
        }
        if (type === "append_style") {
          const css = String(op?.css || "").trim().slice(0, 4000);
          if (!css) continue;
          if (/<style[\s>]/i.test(updated)) {
            updated = updated.replace(/<\/style>/i, `${css}\n</style>`);
          } else {
            updated = updated.replace(/<\/head>/i, `<style>\n${css}\n</style>\n</head>`);
          }
          continue;
        }
        if (type === "set_background") {
          const color = safeHexOrColor(op?.value);
          if (!color) continue;
          updated = updated.replace(/(--bg\s*:\s*)([^;]+)(;)/gi, `$1${color}$3`);
          updated = updated.replace(/(--bg-primary\s*:\s*)([^;]+)(;)/gi, `$1${color}$3`);
          continue;
        }
      }
      return updated;
    };

    const basePromptPayload = {
      context: {
        selectionMode,
        recentHistory: recentHistory.slice(-10).map((item) => ({
          role: String(item?.role || "user"),
          type: String(item?.type || "message"),
          text: String(item?.text || "").slice(0, 1200),
          version: Number(item?.version) || undefined,
          versionTitle: String(item?.versionTitle || "").slice(0, 300) || undefined,
        })),
        currentMessage,
        slideLanguage,
        llmLanguage,
        selectedElements: selectedElements.slice(0, 50).map((item) => ({
          id: String(item?.id || "").slice(0, 80),
          elementId: String(item?.elementId || "").slice(0, 80) || undefined,
          name: String(item?.name || "").slice(0, 200),
          kind: String(item?.kind || "").slice(0, 30),
          slideId: Number(item?.slideId) || undefined,
          elementType: String(item?.elementType || "").slice(0, 40) || undefined,
          elementSource: String(item?.elementSource || "").slice(0, 20) || undefined,
          elementCode: String(item?.elementCode || "").slice(0, 2000) || undefined,
          elementUrl: /^https?:\/\//i.test(String(item?.elementUrl || "").trim())
            ? String(item?.elementUrl || "").trim().slice(0, 2000)
            : undefined,
          elementDataUrl: /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(item?.elementDataUrl || "").trim())
            ? String(item?.elementDataUrl || "").trim().slice(0, 500000)
            : undefined,
        })),
        selectedElementSlides,
        hasBlankEditableSlides,
        blankEditableSlideIds,
        deckTemplateSnippet,
      },
      permissions: {
        editableSlideIds: effectiveEditableSlideIds,
        readonlySlideIds,
      },
      editableSlides,
      availableTool: {
        name: "get_slide_code_by_id",
        description: "Fetch slide code by id from current deck context when you need references.",
        inputSchema: { slideIds: "number[]" },
      },
    };
    const allSlidesById = new Map(
      allSlidesNormalized.map((slide) => [Number(slide.id), slide]),
    );
    const systemPromptParts = [
      "You are an AI slide code editor.",
      "Return strictly valid JSON only.",
      "Never output chain-of-thought, reasoning, or <think> tags.",
      "Only edit slides listed in editableSlides. Never edit readonly slides.",
      "Preserve existing style system unless user explicitly asks for a style change.",
      "Keep semantic structure and avoid removing critical content unless user requests it.",
      "Language rule: all human-readable text in any generated/replaced content MUST use slideLanguage.",
      "llmLanguage is only for understanding user instruction context; output text must still follow slideLanguage.",
      "Use structured protocol only. Never output raw prose outside JSON.",
      "You may optionally request tool get_slide_code_by_id to inspect slide code by id before producing final edits.",
      "When selectedElements include elementUrl, treat it as the canonical image URL and use it directly in img src if image insertion is requested.",
      "Response protocol (strict):",
      "{",
      '  "assistantMessage": "string",',
      '  "versionTitle": "string (one short sentence describing this update)",',
      '  "result": {',
      '    "type": "tool_call | apply_operations | apply_html | noop",',
      '    "toolCall": { "name": "get_slide_code_by_id", "slideIds": [number] },',
      '    "slideUpdates": [',
      "      {",
      '        "id": number,',
      '        "title": "string optional",',
      '        "type": "string optional",',
      '        "operations": [',
      '          { "type": "set_css_var", "name": "bg|bg-primary|primary|secondary|text", "value": "string" },',
      '          { "type": "set_background", "value": "string" },',
      '          { "type": "replace_text", "from": "string", "to": "string" },',
      '          { "type": "append_style", "css": "string" }',
      "        ]",
      "      }",
      "    ],",
      '    "htmlUpdates": [ { "id": number, "title": "string optional", "type": "string optional", "html": "string" } ]',
      "  }",
      "}",
      "Prefer apply_operations over apply_html to avoid huge output.",
      "If no change is needed, return result.type=noop.",
    ];
    if (hasBlankEditableSlides) {
      systemPromptParts.push(
        "Blank editable slide handling (hard constraints):",
        `When editing blank/non-slide pages (ids: ${blankEditableSlideIds.join(", ")}), you MUST generate proper PPT slide HTML instead of website-like long pages.`,
        SINGLE_SLIDE_HARD_CONSTRAINTS,
        "For blank/non-slide pages, prefer result.type=apply_html and return complete html for that slide id.",
        "For blank/non-slide pages, all text in generated html must follow slideLanguage.",
        "Use context.deckTemplateSnippet as style/structure reference if provided.",
        "If context.deckTemplateSnippet is empty (new blank project), build from the references below and still satisfy slide constraints.",
        "",
        "=== HTML TEMPLATE REFERENCE ===",
        HTML_TEMPLATE_REFERENCE,
        "=== END HTML TEMPLATE REFERENCE ===",
        "",
        "=== VIEWPORT BASE CSS REFERENCE ===",
        VIEWPORT_BASE_CSS_REFERENCE,
        "=== END VIEWPORT BASE CSS REFERENCE ===",
      );
    }
    const systemPrompt = systemPromptParts.join("\n");

    const llmMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(basePromptPayload) },
    ];

    let parsed = null;
    for (let toolRound = 0; toolRound < 3; toolRound += 1) {
      const llmContent = await callLlmChatCompletionAdaptiveTokens({
        config: llmConfig,
        temperature: 0.3,
        messages: llmMessages,
      });
      try {
        const contentWithoutThink = String(llmContent || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        parsed = parseJsonFromModelContent(contentWithoutThink || llmContent);
      } catch (parseError) {
        if (toolRound < 2) {
          llmMessages.push({
            role: "assistant",
            content: String(llmContent || ""),
          });
          llmMessages.push({
            role: "user",
            content: JSON.stringify({
              reminder:
                "Your previous response was invalid. Reply with STRICT JSON only, matching the final output schema exactly. Do not include <think>, markdown, or any extra text.",
            }),
          });
          continue;
        }
        throw parseError;
      }

      const parsedResult = parsed?.result && typeof parsed.result === "object" ? parsed.result : {};
      const toolCallCandidate = parsedResult?.toolCall && typeof parsedResult.toolCall === "object"
        ? parsedResult.toolCall
        : (parsed?.toolCall && typeof parsed.toolCall === "object" ? parsed.toolCall : null);
      const toolCall = toolCallCandidate;
      const toolName = String(toolCall?.name || "").trim();
      const requestedIds = Array.isArray(toolCall?.slideIds)
        ? toolCall.slideIds.map((item) => Number(item)).filter((id, index, arr) => Number.isFinite(id) && id > 0 && arr.indexOf(id) === index).slice(0, 20)
        : [];
      if (toolName !== "get_slide_code_by_id" || requestedIds.length === 0) {
        break;
      }

      const foundSlides = requestedIds
        .map((id) => allSlidesById.get(id))
        .filter(Boolean)
        .map((slide) => ({
          id: slide.id,
          title: slide.title,
          type: slide.type,
          html: slide.html,
          isEditable: effectiveEditableSlideIds.includes(slide.id),
        }));
      const notFoundSlideIds = requestedIds.filter((id) => !allSlidesById.has(id));

      llmMessages.push({
        role: "assistant",
        content: JSON.stringify({
          toolCall: {
            name: "get_slide_code_by_id",
            slideIds: requestedIds,
          },
        }),
      });
      llmMessages.push({
        role: "user",
        content: JSON.stringify({
          toolResult: {
            name: "get_slide_code_by_id",
            foundSlides,
            notFoundSlideIds,
          },
          reminder: "Use these references to produce final output in final schema. Do not include toolCall unless another lookup is required.",
        }),
      });
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Model response is invalid");
    }
    const parsedResult = parsed?.result && typeof parsed.result === "object" ? parsed.result : {};
    const resultType = String(parsedResult?.type || "").trim().toLowerCase();
    const editableSlideById = new Map(editableSlides.map((slide) => [Number(slide.id), slide]));
    const operationUpdates = Array.isArray(parsedResult?.slideUpdates)
      ? parsedResult.slideUpdates
      : [];
    const htmlUpdates = Array.isArray(parsedResult?.htmlUpdates)
      ? parsedResult.htmlUpdates
      : [];
    const rawUpdates = Array.isArray(parsed?.updates) ? parsed.updates : [];
    const allowedIdSet = new Set(effectiveEditableSlideIds);
    const normalizedFromOperations = operationUpdates
      .map((item) => {
        const slideId = Number(item?.id);
        if (!Number.isFinite(slideId) || !allowedIdSet.has(slideId)) return null;
        const source = editableSlideById.get(slideId);
        if (!source) return null;
        const html = applyStructuredOperations(source.html, item?.operations);
        return {
          id: slideId,
          title: item?.title === undefined ? undefined : String(item.title || "").trim().slice(0, 180),
          type: item?.type === undefined ? undefined : String(item.type || "").trim().slice(0, 40),
          html,
        };
      })
      .filter(Boolean);
    const normalizedFromHtmlUpdates = htmlUpdates
      .map((item) => ({
        id: Number(item?.id),
        title: item?.title === undefined ? undefined : String(item.title || "").trim().slice(0, 180),
        type: item?.type === undefined ? undefined : String(item.type || "").trim().slice(0, 40),
        html: item?.html === undefined ? undefined : String(item.html || ""),
      }))
      .filter((item) => Number.isFinite(item.id) && allowedIdSet.has(item.id));
    const normalizedFromLegacy = rawUpdates
      .map((item) => ({
        id: Number(item?.id),
        title: item?.title === undefined ? undefined : String(item.title || "").trim().slice(0, 180),
        type: item?.type === undefined ? undefined : String(item.type || "").trim().slice(0, 40),
        html: item?.html === undefined ? undefined : String(item.html || ""),
      }))
      .filter((item) => Number.isFinite(item.id) && allowedIdSet.has(item.id));
    const primaryRawUpdates =
      resultType === "apply_operations"
        ? normalizedFromOperations
        : resultType === "apply_html"
          ? normalizedFromHtmlUpdates
          : resultType === "noop"
            ? []
            : normalizedFromLegacy;
    const updates = primaryRawUpdates
      .map((item) => ({
        ...item,
        html: typeof item.html === "string" ? stripCodeFence(item.html).trim() : item.html,
      }))
      .map((item) => {
        const slideId = Number(item?.id);
        const html = String(item?.html || "");
        const structure = detectSlideStructure(html);
        const inBlankSet = Number.isFinite(slideId) && blankEditableSlideIds.includes(slideId);
        const isBlankLike = !(structure.hasSlideSection && structure.hasSlideContentContainer);
        // For blank editable targets, always normalize to full slide html with viewport-safe wrapper.
        const shouldNormalize = inBlankSet;
        if (!shouldNormalize) {
          return item;
        }
        const sourceSlide = editableSlideById.get(slideId);
        const normalizedHtml = buildSingleSlideHtmlFromTemplate({
          sectionHtml: html,
          templateHtml: deckTemplateSnippet,
          fallbackTitle: String(sourceSlide?.title || item?.title || `Slide ${slideId}`),
        });
        return {
          ...item,
          html: normalizedHtml,
        };
      })
      .filter((item) => item.html === undefined || item.html.length > 0);
    const blankTargetUpdate = updates.find((item) => blankEditableSlideIds.includes(Number(item?.id)));
    const blankHtml = String(blankTargetUpdate?.html || "");

    res.json({
      ok: true,
      assistantMessage: String(parsed?.assistantMessage || "Done. I updated only the selected slides.").trim().slice(0, 600),
      versionTitle: String(parsed?.versionTitle || `Updated ${updates.length || editableSlides.length} editable slide(s).`).trim().slice(0, 300),
      updates,
    });
  } catch (error) {
    res.status(400).json({ error: toUserFacingLlmError(error, "Failed to revise selected slides") });
  }
});

app.post("/api/ppt/generate-outline-image", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const prompt = String(req.body?.prompt || "").trim();
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!prompt) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }
  const imgResolved = await getEffectiveProviderConfig(userId, "img");
  if (!imgResolved.config) {
    res.status(400).json({ error: "Please configure an image provider in Profile first" });
    return;
  }
  const imgConfig = { ...imgResolved.config, userId, billable: imgResolved.source === "managed" };
  try {
    const imageUrl = await tryGenerateImage({
      config: imgConfig,
      prompt,
    });
    if (!imageUrl) {
      res.status(400).json({ error: "Image provider did not return an image URL" });
      return;
    }
    let persistedUrl = "";
    let imageGeometry = normalizeImageGeometry(0, 0);
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(imageUrl)) {
      const parsed = parseImageDataUrl(imageUrl);
      imageGeometry = sniffImageGeometryFromBuffer(parsed.buffer, parsed.mimeType);
    }
    try {
      const persisted = await persistRemoteImageToOss(imageUrl, `${OSS_FOLDER || "assets"}/ai-generated`);
      if (persisted?.url) {
        persistedUrl = persisted.url;
        imageGeometry = {
          imageWidth: persisted.imageWidth || 0,
          imageHeight: persisted.imageHeight || 0,
          imageAspectRatio: persisted.imageAspectRatio || 0,
          imageOrientation: persisted.imageOrientation || "square",
        };
        await registerManagedAssetRecord({
          publicUrl: persisted.url,
          storageType: "oss",
          storageKey: persisted.key,
          ownerUserId: userId,
          byteSize: persisted.byteSize,
        });
      }
    } catch (_error) {}
    res.json({
      ok: true,
      imageUrl: persistedUrl || imageUrl,
      sourceImageUrl: imageUrl,
      persisted: Boolean(persistedUrl),
      imageWidth: imageGeometry.imageWidth,
      imageHeight: imageGeometry.imageHeight,
      imageAspectRatio: imageGeometry.imageAspectRatio,
      imageOrientation: imageGeometry.imageOrientation,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to generate image" });
  }
});

app.post("/api/ppt/preview-html", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const { style, idea, purpose, length, vibe } = req.body || {};
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!style) {
    res.status(400).json({ error: "Style is required" });
    return;
  }

  const llmResolved = await getEffectiveProviderConfig(userId, "llm");
  if (!llmResolved.config) {
    res.status(400).json({ error: "Please configure an LLM provider in Profile before generating preview" });
    return;
  }
  const llmConfig = { ...llmResolved.config, userId, billable: llmResolved.source === "managed" };

  try {
    const previewPackage = await generateSelectionStylePreviewPackage({
      llmConfig,
      style,
      idea,
      purpose,
      length,
      vibe,
    });
    res.json({
      ok: true,
      html: previewPackage.style.previewHtml,
      style: previewPackage.style,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to generate preview" });
  }
});

app.post("/api/ppt/export-pdf", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const title = String(req.body?.title || "FacetDeck").trim();
  const slides = normalizeExportSlides(req.body?.slides);
  if (slides.length === 0) {
    res.status(400).json({ error: "No slide HTML available for PDF export" });
    return;
  }

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const html = buildPdfDeckHtml(slides, title);

    try {
      await page.setContent(html, { waitUntil: "networkidle", timeout: 30_000 });
    } catch (_error) {
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
    await page.waitForTimeout(500);

    const pdfBuffer = await page.pdf({
      printBackground: true,
      width: "13.333in",
      height: "7.5in",
      margin: {
        top: "0in",
        right: "0in",
        bottom: "0in",
        left: "0in",
      },
    });
    const fileName = resolveExportFileName(title, "pdf");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to export PDF",
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

app.post("/api/ppt/export-html", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const title = String(req.body?.title || "FacetDeck").trim();
  const slides = normalizeExportSlides(req.body?.slides);
  if (slides.length === 0) {
    res.status(400).json({ error: "No slide HTML available for HTML export" });
    return;
  }
  try {
    const assetCache = new Map();
    const offlineSlides = [];
    for (const slide of slides) {
      const offlineHtml = await inlineHtmlResources(slide.html, assetCache);
      offlineSlides.push({
        ...slide,
        html: offlineHtml,
      });
    }
    const exportHtml = buildOfflinePresentationHtml(offlineSlides, title);
    const fileName = resolveExportFileName(title, "html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
    res.send(exportHtml);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to export HTML",
    });
  }
});

app.post("/api/ppt/generate-previews", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const { idea, purpose, length, vibe } = req.body || {};
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!idea) {
    res.status(400).json({ error: "Idea is required" });
    return;
  }

  const llmResolved = await getEffectiveProviderConfig(userId, "llm");
  if (!llmResolved.config) {
    res.status(400).json({ error: "Please configure an LLM provider in Profile before generating PPT" });
    return;
  }
  const llmConfig = { ...llmResolved.config, userId, billable: llmResolved.source === "managed" };

  try {
    const styles = [];
    const previousStyleNames = [];
    for (let slotIndex = 0; slotIndex < 3; slotIndex += 1) {
      const stylePackage = await generateSingleStylePreviewPackage({
        llmConfig,
        idea,
        purpose,
        length,
        vibe,
        slotIndex,
        previousStyleNames,
        });
      const style = {
        ...stylePackage.style,
      };
      styles.push(style);
      previousStyleNames.push(style.name);
    }
    res.json({
      ok: true,
      styles,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to generate style previews",
    });
  }
});

app.post("/api/ppt/generate", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const { idea, purpose, length, vibe, slideLanguage, style, styleSelection, outline, assets } = req.body || {};
  const prompt = idea;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!prompt) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }
  if (!(outline && typeof outline === "object" && Array.isArray(outline.slides) && outline.slides.length > 0)) {
    res.status(400).json({ error: "outline is required and must contain at least one slide" });
    return;
  }
  const normalizedAssets = Array.isArray(assets)
    ? assets.map((item, index) => normalizeWizardAsset(item, index)).filter((item) => item.isImage)
    : [];
  if (hasMissingAssetDescriptions(normalizedAssets)) {
    res.status(400).json({ error: "Each uploaded image requires a description" });
    return;
  }
  cleanupOldPptJobs();

  const llmResolved = await getEffectiveProviderConfig(userId, "llm");
  if (!llmResolved.config) {
    res.status(400).json({ error: "Please configure an LLM provider in Profile before generating PPT" });
    return;
  }
  const llmConfig = { ...llmResolved.config, userId, billable: llmResolved.source === "managed" };
  const effectiveStyle = style || buildStyleFromSelection(styleSelection);
  const job = createPptJob({ userId, prompt, style: effectiveStyle, styleSelection });
  void runPptGenerationJob({
    jobId: job.id,
    prompt,
    purpose,
    length,
    vibe,
    slideLanguage: String(slideLanguage || "English"),
    style: effectiveStyle,
    llmConfig,
    outline,
    assets: normalizedAssets,
  });
  res.json({
    ok: true,
    jobId: job.id,
    status: job.status,
  });
});

app.get("/api/ppt/jobs/:jobId", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const jobId = String(req.params.jobId || "").trim();
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!jobId) {
    res.status(400).json({ error: "jobId is required" });
    return;
  }
  cleanupOldPptJobs();
  const job = getPptJob(jobId);
  if (!job || Number(job.userId) !== userId) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    warnings: job.warnings || [],
    presentation: job.presentation,
    updatedAt: job.updatedAt,
  });
});

app.post("/api/ppt/jobs/:jobId/cancel", authRequired, async (req, res) => {
  const userId = Number(req.auth?.userId);
  const jobId = String(req.params.jobId || "").trim();
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!jobId) {
    res.status(400).json({ error: "jobId is required" });
    return;
  }
  cleanupOldPptJobs();
  const job = getPptJob(jobId);
  if (!job || Number(job.userId) !== userId) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const cancelled = cancelPptJob(jobId);
  if (!cancelled) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({
    ok: true,
    jobId: cancelled.id,
    status: cancelled.status,
    progress: cancelled.progress,
    message: cancelled.message,
    error: cancelled.error,
    warnings: cancelled.warnings || [],
    presentation: cancelled.presentation,
    updatedAt: cancelled.updatedAt,
  });
});

app.post("/api/auth/register/send-code", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const captchaId = String(req.body?.captchaId || "").trim();
  const captchaText = String(req.body?.captchaText || "").trim().toUpperCase();
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  if (!captchaId || !captchaText) {
    res.status(400).json({ error: "Captcha is required" });
    return;
  }

  const ip = getClientIp(req);
  const captchaCheck = verifyCaptcha({ captchaId, captchaText, ip });
  if (!captchaCheck.ok) {
    res.status(400).json({ error: captchaCheck.error });
    return;
  }

  const ipLimit = enforceRateLimit({
    key: `send-code-ip:${ip}`,
    max: SEND_CODE_LIMIT_PER_IP_MAX,
    windowMs: SEND_CODE_LIMIT_PER_IP_WINDOW_MS,
  });
  if (!ipLimit.allowed) {
    res.status(429).json({ error: "Too many requests, please try later", retryAfterMs: ipLimit.retryAfterMs });
    return;
  }
  const emailLimit = enforceRateLimit({
    key: `send-code-register-email:${email}`,
    max: SEND_CODE_LIMIT_PER_EMAIL_MAX,
    windowMs: SEND_CODE_LIMIT_PER_EMAIL_WINDOW_MS,
  });
  if (!emailLimit.allowed) {
    res.status(429).json({ error: "Verification code requested too frequently", retryAfterMs: emailLimit.retryAfterMs });
    return;
  }

  const existing = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) {
    res.status(400).json({ error: "Email is already registered" });
    return;
  }

  const now = Date.now();
  const code = generateCode();
  const expiresAt = now + CODE_EXPIRES_MINUTES * 60 * 1000;
  await run("UPDATE email_codes SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL", [now, email, "register"]);
  await run(
    "INSERT INTO email_codes (email, code, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    [email, code, "register", expiresAt, now],
  );

  try {
    await sendCodeEmail({ email, code, purpose: "register" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send email. Check Resend configuration." });
    return;
  }

  res.json({ message: "Verification code sent" });
});

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const code = String(req.body?.code || "").trim();
  const inviteCode = String(req.body?.inviteCode || "").trim().toUpperCase();

  if (!email || !password || !code) {
    res.status(400).json({ error: "Email, password and code are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const existing = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) {
    res.status(400).json({ error: "Email is already registered" });
    return;
  }

  const now = Date.now();
  const match = await get(
    `SELECT id FROM email_codes
     WHERE email = ? AND purpose = 'register' AND code = ? AND used_at IS NULL AND expires_at > ?
     ORDER BY id DESC LIMIT 1`,
    [email, code, now],
  );
  if (!match) {
    res.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }

  let inviterUserId = 0;
  if (inviteCode) {
    const inviter = await get("SELECT id FROM users WHERE invite_code = ? LIMIT 1", [inviteCode]);
    if (!inviter) {
      res.status(400).json({ error: "Invalid invite code" });
      return;
    }
    inviterUserId = Number(inviter.id) || 0;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const displayName = await generateUniqueInitialDisplayName();
  const selfInviteCode = await generateUniqueInviteCode();
  const result = await run(
    "INSERT INTO users (email, password_hash, display_name, invite_code, invited_by_user_id, credits_balance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      email,
      passwordHash,
      displayName,
      selfInviteCode,
      inviterUserId > 0 ? inviterUserId : null,
      Math.max(0, Math.floor(INITIAL_SYSTEM_CREDITS)),
      now,
    ],
  );

  if (inviterUserId > 0) {
    await adjustUserCredits(inviterUserId, INVITE_REWARD_CREDITS);
  }

  await run("UPDATE email_codes SET used_at = ? WHERE id = ?", [now, match.id]);

  const user = { id: result.lastID, email, displayName, inviteCode: selfInviteCode };
  const token = createToken(user);
  res.status(201).json({
    token,
    user,
    invite: {
      usedInviteCode: inviteCode || null,
      inviterRewardCredits: inviterUserId > 0 ? INVITE_REWARD_CREDITS : 0,
    },
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const user = await get("SELECT id, email, display_name, invite_code, password_hash FROM users WHERE email = ?", [email]);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = createToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: resolveDisplayName(user.display_name, user.email),
      inviteCode: String(user.invite_code || "").trim().toUpperCase(),
    },
  });
});

app.post("/api/auth/forgot-password/send-code", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const captchaId = String(req.body?.captchaId || "").trim();
  const captchaText = String(req.body?.captchaText || "").trim().toUpperCase();
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  if (!captchaId || !captchaText) {
    res.status(400).json({ error: "Captcha is required" });
    return;
  }

  const ip = getClientIp(req);
  const captchaCheck = verifyCaptcha({ captchaId, captchaText, ip });
  if (!captchaCheck.ok) {
    res.status(400).json({ error: captchaCheck.error });
    return;
  }

  const ipLimit = enforceRateLimit({
    key: `send-code-ip:${ip}`,
    max: SEND_CODE_LIMIT_PER_IP_MAX,
    windowMs: SEND_CODE_LIMIT_PER_IP_WINDOW_MS,
  });
  if (!ipLimit.allowed) {
    res.status(429).json({ error: "Too many requests, please try later", retryAfterMs: ipLimit.retryAfterMs });
    return;
  }
  const emailLimit = enforceRateLimit({
    key: `send-code-forgot-email:${email}`,
    max: SEND_CODE_LIMIT_PER_EMAIL_MAX,
    windowMs: SEND_CODE_LIMIT_PER_EMAIL_WINDOW_MS,
  });
  if (!emailLimit.allowed) {
    res.status(429).json({ error: "Verification code requested too frequently", retryAfterMs: emailLimit.retryAfterMs });
    return;
  }

  const user = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (!user) {
    res.status(404).json({ error: "No account found with this email" });
    return;
  }

  const now = Date.now();
  const code = generateCode();
  const expiresAt = now + RESET_CODE_EXPIRES_MINUTES * 60 * 1000;
  await run("UPDATE email_codes SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL", [now, email, "forgot_password"]);
  await run(
    "INSERT INTO email_codes (email, code, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    [email, code, "forgot_password", expiresAt, now],
  );

  try {
    await sendCodeEmail({ email, code, purpose: "forgot_password" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send email. Check Resend configuration." });
    return;
  }

  res.json({ message: "Reset code sent" });
});

app.post("/api/auth/forgot-password/reset", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const code = String(req.body?.code || "").trim();

  if (!email || !password || !code) {
    res.status(400).json({ error: "Email, new password and code are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const now = Date.now();
  const user = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (!user) {
    res.status(404).json({ error: "No account found with this email" });
    return;
  }

  const match = await get(
    `SELECT id FROM email_codes
     WHERE email = ? AND purpose = 'forgot_password' AND code = ? AND used_at IS NULL AND expires_at > ?
     ORDER BY id DESC LIMIT 1`,
    [email, code, now],
  );
  if (!match) {
    res.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, user.id]);
  await run("UPDATE email_codes SET used_at = ? WHERE id = ?", [now, match.id]);

  res.json({ message: "Password reset successful" });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Auth API running on http://localhost:${PORT}`);
      console.log(`FacetDeck distribution mode: ${FACETDECK_DISTRIBUTION_MODE}`);
      console.log(`Require OSS storage: ${REQUIRE_OSS_STORAGE ? "enabled" : "disabled"}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize auth service:", error);
    process.exit(1);
  });
