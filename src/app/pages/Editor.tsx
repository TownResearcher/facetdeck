import { motion, AnimatePresence } from "motion/react";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import { toast, Toaster } from "sonner";

import { ColorPicker } from "../components/ColorPicker";
import { TypographyPicker } from "../components/TypographyPicker";
import { EditorCopilotPanel } from "../components/editor/EditorCopilotPanel";
import { EditorCanvasViewport } from "../components/editor/EditorCanvasViewport";
import { EditorPluginPlaceholder } from "../components/editor/EditorPluginPlaceholder";
import { EditorPresentationOverlay } from "../components/editor/EditorPresentationOverlay";
import { EditorPropertiesPanel } from "../components/editor/EditorPropertiesPanel";
import { EditorRightTabsBar } from "../components/editor/EditorRightTabsBar";
import { EditorSlideResourcesBar } from "../components/editor/EditorSlideResourcesBar";
import { EditorSlidesPanel } from "../components/editor/EditorSlidesPanel";
import { EditorTopToolbar } from "../components/editor/EditorTopToolbar";
import { EditorWizardModal } from "../components/editor/EditorWizardModal";
import { useEditorChat } from "../hooks/useEditorChat";
import { useEditorPresentation } from "../hooks/useEditorPresentation";
import { useEditorSelector } from "../hooks/useEditorSelector";
import { useEditorWizardState } from "../hooks/useEditorWizardState";
import type {
  EditorBuiltinPreset,
  EditorCustomPreset,
  EditorOutlineDraft,
  EditorOutlineSlide,
  EditorElement,
  EditorGeneratedPresentation,
  EditorVersionSnapshot,
  EditorSlide,
  EditorStylePreview,
  EditorStyleSelectionPayload,
  EditorWizardAsset,
} from "../types/editor";
import type { InstalledPlugin } from "../types/plugins";
import { getErrorMessage } from "../utils/errors";
import { createClientId } from "../utils/id";
import { COMMUNITY_FEATURE_ENABLED } from "../config/runtimeMode";

const BASE_SLIDE_WIDTH = 1920;
const BASE_SLIDE_HEIGHT = 1080;
type ApplyScope = "slide" | "all";
type TypographyPair = { title: string; body: string };
type SaveUiStatus = "idle" | "saving" | "saved" | "error";
type CenterViewMode = "slide" | "code";
type CodeTokenKind = "text" | "tag" | "attr" | "string" | "comment" | "punctuation";
type CodeToken = { text: string; kind: CodeTokenKind };
const DEFAULT_TYPOGRAPHY = { title: "Manrope", body: "Inter" };
const DEFAULT_EDITOR_SLIDES: EditorSlide[] = [
  { id: 1, title: "Introduction", type: "Cover", html: "" },
  { id: 2, title: "Market Analysis", type: "Data", html: "" },
  { id: 3, title: "Core Features", type: "List", html: "" },
  { id: 4, title: "Conclusion", type: "Summary", html: "" },
];

const CODE_TOKEN_CLASS_MAP: Record<CodeTokenKind, string> = {
  text: "text-slate-700",
  tag: "text-blue-600 font-medium",
  attr: "text-emerald-600",
  string: "text-amber-600",
  comment: "text-slate-400 italic",
  punctuation: "text-fuchsia-600",
};

const pushCodeToken = (tokens: CodeToken[], kind: CodeTokenKind, text: string) => {
  if (!text) {
    return;
  }
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) {
    last.text += text;
    return;
  }
  tokens.push({ kind, text });
};

const findTagEnd = (source: string, startIndex: number) => {
  let index = startIndex;
  let quote: '"' | "'" | null = null;
  while (index < source.length) {
    const char = source[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      index += 1;
      continue;
    }
    if (char === ">") {
      return index;
    }
    index += 1;
  }
  return source.length - 1;
};

const tokenizeTag = (rawTag: string): CodeToken[] => {
  if (rawTag.startsWith("<!--")) {
    return [{ kind: "comment", text: rawTag }];
  }
  const tokens: CodeToken[] = [];
  let index = 0;
  if (rawTag.startsWith("</")) {
    pushCodeToken(tokens, "punctuation", "</");
    index = 2;
  } else {
    pushCodeToken(tokens, "punctuation", "<");
    index = 1;
  }
  while (index < rawTag.length) {
    if (rawTag.startsWith("/>", index)) {
      pushCodeToken(tokens, "punctuation", "/>");
      index += 2;
      continue;
    }
    const current = rawTag[index];
    if (current === ">") {
      pushCodeToken(tokens, "punctuation", ">");
      index += 1;
      continue;
    }
    if (/\s/.test(current)) {
      const start = index;
      while (index < rawTag.length && /\s/.test(rawTag[index])) {
        index += 1;
      }
      pushCodeToken(tokens, "text", rawTag.slice(start, index));
      continue;
    }

    // Guard: malformed tags may contain standalone punctuation (e.g. "/" or "?")
    // that doesn't match a valid name token. Consume one char to avoid infinite loops.
    if (!/[^\s=/>]/.test(current)) {
      pushCodeToken(tokens, "punctuation", current);
      index += 1;
      continue;
    }

    const startName = index;
    while (index < rawTag.length && /[^\s=/>]/.test(rawTag[index])) {
      index += 1;
    }
    const name = rawTag.slice(startName, index);
    if (tokens.length <= 1) {
      pushCodeToken(tokens, "tag", name);
    } else {
      pushCodeToken(tokens, "attr", name);
    }

    const whitespaceStart = index;
    while (index < rawTag.length && /\s/.test(rawTag[index])) {
      index += 1;
    }
    if (index > whitespaceStart) {
      pushCodeToken(tokens, "text", rawTag.slice(whitespaceStart, index));
    }

    if (rawTag[index] === "=") {
      pushCodeToken(tokens, "punctuation", "=");
      index += 1;
      const postEqualWhitespaceStart = index;
      while (index < rawTag.length && /\s/.test(rawTag[index])) {
        index += 1;
      }
      if (index > postEqualWhitespaceStart) {
        pushCodeToken(tokens, "text", rawTag.slice(postEqualWhitespaceStart, index));
      }
      if (rawTag[index] === '"' || rawTag[index] === "'") {
        const quote = rawTag[index];
        const valueStart = index;
        index += 1;
        while (index < rawTag.length && rawTag[index] !== quote) {
          index += 1;
        }
        if (index < rawTag.length) {
          index += 1;
        }
        pushCodeToken(tokens, "string", rawTag.slice(valueStart, index));
      } else {
        const valueStart = index;
        while (index < rawTag.length && /[^\s>]/.test(rawTag[index])) {
          index += 1;
        }
        pushCodeToken(tokens, "string", rawTag.slice(valueStart, index));
      }
    }
  }
  return tokens;
};

const tokenizeCssContent = (tokens: CodeToken[], text: string) => {
  const regex = /(\/\*[\s\S]*?\*\/)|(["'].*?["'])|([{}:;,])|([^{\s:;,]+)|(\s+)/g;
  let match;
  let inBlock = false;
  let afterColon = false;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      pushCodeToken(tokens, "comment", match[1]);
    } else if (match[2]) {
      pushCodeToken(tokens, "string", match[2]);
    } else if (match[3]) {
      const p = match[3];
      pushCodeToken(tokens, "punctuation", p);
      if (p === "{") { inBlock = true; afterColon = false; }
      else if (p === "}") { inBlock = false; afterColon = false; }
      else if (p === ":") { afterColon = true; }
      else if (p === ";") { afterColon = false; }
    } else if (match[4]) {
      const word = match[4];
      if (!inBlock) {
        pushCodeToken(tokens, "tag", word);
      } else if (!afterColon) {
        pushCodeToken(tokens, "attr", word);
      } else {
        pushCodeToken(tokens, "string", word);
      }
    } else if (match[5]) {
      pushCodeToken(tokens, "text", match[5]);
    } else {
      pushCodeToken(tokens, "text", match[0]);
    }
  }
};

const tokenizeJsContent = (tokens: CodeToken[], text: string) => {
  const regex = /(\/\*[\s\S]*?\*\/)|(\/\/.*)|(["'`][\s\S]*?["'`])|([{}()[\].,;:+\-*/=!<>|&]+)|(\b(?:const|let|var|function|if|else|return|for|while|class|import|export|from|new|this|true|false|null|undefined)\b)|(\w+)|(\s+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1] || match[2]) {
      pushCodeToken(tokens, "comment", match[0]);
    } else if (match[3]) {
      pushCodeToken(tokens, "string", match[0]);
    } else if (match[4]) {
      pushCodeToken(tokens, "punctuation", match[0]);
    } else if (match[5]) {
      pushCodeToken(tokens, "tag", match[0]);
    } else if (match[6] || match[7]) {
      pushCodeToken(tokens, "text", match[0]);
    } else {
      pushCodeToken(tokens, "text", match[0]);
    }
  }
};

const tokenizeHtmlCode = (source: string): CodeToken[] => {
  if (!source) {
    return [];
  }
  const tokens: CodeToken[] = [];
  let index = 0;
  while (index < source.length) {
    const commentIndex = source.indexOf("<!--", index);
    const tagIndex = source.indexOf("<", index);
    const nextIndex =
      commentIndex >= 0 && (tagIndex < 0 || commentIndex <= tagIndex) ? commentIndex : tagIndex;
    if (nextIndex < 0) {
      pushCodeToken(tokens, "text", source.slice(index));
      break;
    }
    if (nextIndex > index) {
      pushCodeToken(tokens, "text", source.slice(index, nextIndex));
    }
    if (source.startsWith("<!--", nextIndex)) {
      const endIndex = source.indexOf("-->", nextIndex + 4);
      const actualEnd = endIndex >= 0 ? endIndex + 3 : source.length;
      pushCodeToken(tokens, "comment", source.slice(nextIndex, actualEnd));
      index = actualEnd;
      continue;
    }
    const end = findTagEnd(source, nextIndex + 1);
    const tag = source.slice(nextIndex, end + 1);
    tokenizeTag(tag).forEach((token) => pushCodeToken(tokens, token.kind, token.text));
    index = end + 1;

    const lowerTag = tag.toLowerCase();
    if (lowerTag.startsWith("<style") && !lowerTag.endsWith("/>")) {
      const endStyle = source.indexOf("</style>", index);
      const contentEnd = endStyle >= 0 ? endStyle : source.length;
      if (contentEnd > index) {
        tokenizeCssContent(tokens, source.slice(index, contentEnd));
        index = contentEnd;
      }
    } else if (lowerTag.startsWith("<script") && !lowerTag.endsWith("/>")) {
      const endScript = source.indexOf("</script>", index);
      const contentEnd = endScript >= 0 ? endScript : source.length;
      if (contentEnd > index) {
        tokenizeJsContent(tokens, source.slice(index, contentEnd));
        index = contentEnd;
      }
    }
  }
  return tokens;
};

export function Editor() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state || {}) as {
    presentation?: unknown;
    jobId?: unknown;
    initialPrompt?: string;
    deckId?: unknown;
    newProject?: unknown;
    openWizardSetup?: unknown;
    preferPresetMode?: unknown;
    presetId?: unknown;
    presetName?: unknown;
  };
  const [presentationTitle, setPresentationTitle] = useState("FacetDeck Pitch 2026");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  
  const [slides, setSlides] = useState<EditorSlide[]>(DEFAULT_EDITOR_SLIDES);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [themeColors, setThemeColors] = useState(['#ff6b35', '#ff8a5c', '#ffb088', '#1e293b']);
  const [paletteGlobalOverride, setPaletteGlobalOverride] = useState<string[] | null>(null);
  const [paletteSlideOverrides, setPaletteSlideOverrides] = useState<Record<number, string[]>>({});
  const [typography, setTypography] = useState(DEFAULT_TYPOGRAPHY);
  const [typographyGlobalOverride, setTypographyGlobalOverride] = useState<TypographyPair | null>(null);
  const [typographySlideOverrides, setTypographySlideOverrides] = useState<Record<number, TypographyPair>>({});
  const [editingDeckId, setEditingDeckId] = useState<number | null>(() => {
    const rawDeckId = Number(locationState.deckId);
    return Number.isFinite(rawDeckId) && rawDeckId > 0 ? rawDeckId : null;
  });
  const [saveStatus, setSaveStatus] = useState<SaveUiStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const [isGenerationPolling, setIsGenerationPolling] = useState(false);
  const [saveStatusClock, setSaveStatusClock] = useState(Date.now());
  const [isThemeColorPickerOpen, setIsThemeColorPickerOpen] = useState(false);
  const [themePickerActiveIndex, setThemePickerActiveIndex] = useState(0);
  const [isTypographyPickerOpen, setIsTypographyPickerOpen] = useState(false);
  const [colorApplyScope, setColorApplyScope] = useState<ApplyScope>("all");
  const [typographyApplyScope, setTypographyApplyScope] = useState<ApplyScope>("all");
  const [pickerThumbPos, setPickerThumbPos] = useState({ x: 50, y: 50 });
  const [sliderLightness, setSliderLightness] = useState(50);
  const [currentHS, setCurrentHS] = useState({ h: 18, s: 100 });
  const [hexInput, setHexInput] = useState("");
  const [activeSlide, setActiveSlide] = useState(1);
  const [editingSlideId, setEditingSlideId] = useState<number | null>(null);
  const [editSlideType, setEditSlideType] = useState("");
  const [editSlideTitle, setEditSlideTitle] = useState("");
  const [activeRightTab, setActiveRightTab] = useState("copilot");
  const [enabledPlugins, setEnabledPlugins] = useState<InstalledPlugin[]>([]);
  const [centerViewMode, setCenterViewMode] = useState<CenterViewMode>("slide");
  const codePreRef = useRef<HTMLPreElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const elementsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollElementsLeft, setCanScrollElementsLeft] = useState(false);
  const [canScrollElementsRight, setCanScrollElementsRight] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setEnabledPlugins([]);
      return;
    }
    const loadPlugins = async () => {
      const response = await fetch("/api/plugins/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const installed = Array.isArray(data?.plugins)
        ? (data.plugins as InstalledPlugin[]).filter((item) => Boolean(item?.enabled))
        : [];
      setEnabledPlugins(installed);
      setActiveRightTab((prev) => {
        if (prev === "copilot" || prev === "properties") return prev;
        const exists = installed.some((plugin) => plugin.id === prev);
        return exists ? prev : (installed[0]?.id || "copilot");
      });
    };
    void loadPlugins();
  }, []);

  const activePluginTab = useMemo(
    () => enabledPlugins.find((plugin) => plugin.id === activeRightTab) || null,
    [enabledPlugins, activeRightTab],
  );

  // Export menu
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [showManualCopyModal, setShowManualCopyModal] = useState(false);
  const [manualShareLink, setManualShareLink] = useState("");
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const {
    chatInput,
    setChatInput,
    chatMessages,
    currentVersion,
    isSwitchingVersion,
    isWaitingForAI,
    chatError,
    isChatDisabled,
    chatScrollRef,
    appendUserMessage,
    appendAssistantMessage,
    appendVersionCard,
    removeMessageById,
    setIsWaitingForAI,
    setChatError,
    startInitialGenerationConversation,
    completeInitialGenerationConversation,
    failInitialGenerationConversation,
    hydrateChatMessages,
    clearChatMessages,
  } = useEditorChat();

  const {
    wizardOpen,
    setWizardOpen,
    wizardStep,
    setWizardStep,
    stylePathMode,
    setStylePathMode,
    wizardData,
    setWizardData,
    stylePreviews,
    setStylePreviews,
    isGeneratingPreviews,
    setIsGeneratingPreviews,
    userPresets,
    setUserPresets,
    builtinPresets,
    setBuiltinPresets,
    isLoadingPresets,
    setIsLoadingPresets,
    isCreatePresetOpen,
    setIsCreatePresetOpen,
    isSavingPreset,
    setIsSavingPreset,
    newPresetDraft,
    setNewPresetDraft,
    activeCustomColorKey,
    setActiveCustomColorKey,
    isMixMode,
    setIsMixMode,
    mixSelection,
    setMixSelection,
  } = useEditorWizardState();
  const [wizardAssets, setWizardAssets] = useState<EditorWizardAsset[]>([]);
  const [outlineDraft, setOutlineDraft] = useState<EditorOutlineDraft | null>(null);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [outlineInstruction, setOutlineInstruction] = useState("");
  const [isRevisingOutline, setIsRevisingOutline] = useState(false);
  const [isGeneratingOutlineImages, setIsGeneratingOutlineImages] = useState(false);
  const outlineDraftRef = useRef<EditorOutlineDraft | null>(null);
  const outlineImageTaskMapRef = useRef<Map<string, Promise<void>>>(new Map());
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const [propertyTransformValues, setPropertyTransformValues] = useState({ x: "0", y: "0", w: "0", h: "0" });
  const [propertyTransformMode, setPropertyTransformMode] = useState<"absolute" | "offset">("offset");
  const [propertyContentValue, setPropertyContentValue] = useState("");
  const [canEditPropertyContent, setCanEditPropertyContent] = useState(false);
  const localStructuredEditHistoryRef = useRef<Array<{ slideId: number; html: string }>>([]);
  const localStructuredRedoHistoryRef = useRef<Array<{ slideId: number; html: string }>>([]);
  const [versionSnapshots, setVersionSnapshots] = useState<EditorVersionSnapshot[]>([]);
  const [isRevertingVersion, setIsRevertingVersion] = useState(false);
  const [pendingRollbackSaveVersion, setPendingRollbackSaveVersion] = useState<number | null>(null);
  const [pendingPresetSelection, setPendingPresetSelection] = useState<{ id?: string; name?: string } | null>(null);

  const normalizeStoredElements = (value: unknown): EditorElement[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .slice(0, 200)
      .map((item, index) => ({
        id: String((item as Partial<EditorElement>)?.id || createClientId(`asset-${index + 1}`)),
        name: String((item as Partial<EditorElement>)?.name || `Asset ${index + 1}`).trim().slice(0, 200),
        type: String((item as Partial<EditorElement>)?.type || "FILE").trim().slice(0, 30).toUpperCase(),
        source: "asset" as const,
        slideId: Number.isFinite(Number((item as Partial<EditorElement>)?.slideId))
          ? Number((item as Partial<EditorElement>)?.slideId)
          : undefined,
        dataUrl: String((item as Partial<EditorElement>)?.dataUrl || "").trim().startsWith("data:image/")
          ? String((item as Partial<EditorElement>)?.dataUrl || "")
          : undefined,
        url: /^https?:\/\//i.test(String((item as Partial<EditorElement>)?.url || "").trim())
          ? String((item as Partial<EditorElement>)?.url || "").trim()
          : undefined,
      }))
      .filter((item) => item.name);
  };

  const normalizeStoredVersionSnapshots = (value: unknown): EditorVersionSnapshot[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .slice(-50)
      .map((entry) => {
        const source = entry && typeof entry === "object" ? (entry as Partial<EditorVersionSnapshot>) : {};
        const version = Number(source.version);
        if (!Number.isFinite(version) || version <= 0) {
          return null;
        }
        const slidesSource = Array.isArray(source.slides) ? source.slides : [];
        const slides = slidesSource
          .slice(0, 50)
          .map((slide, index) => ({
            id: Number((slide as Partial<EditorSlide>)?.id) || index + 1,
            title: String((slide as Partial<EditorSlide>)?.title || `Slide ${index + 1}`).trim().slice(0, 120),
            type: String((slide as Partial<EditorSlide>)?.type || "Content").trim().slice(0, 40),
            html: String((slide as Partial<EditorSlide>)?.html || ""),
          }))
          .filter((slide) => slide.html.trim().length > 0);
        if (slides.length === 0) {
          return null;
        }
        return {
          version,
          versionTitle: String(source.versionTitle || "").trim().slice(0, 300) || undefined,
          savedAt: Number(source.savedAt) || Date.now(),
          slides,
        } as EditorVersionSnapshot;
      })
      .filter((item): item is EditorVersionSnapshot => Boolean(item));
  };

  const applyGeneratedPresentation = (presentation: EditorGeneratedPresentation) => {
    if (!presentation) {
      return;
    }
    const resolvedSlideLanguage = String((presentation as { slideLanguage?: unknown })?.slideLanguage || "").trim();
    const resolvedLlmLanguage = String((presentation as { llmLanguage?: unknown })?.llmLanguage || "").trim();
    if (resolvedSlideLanguage || resolvedLlmLanguage) {
      setWizardData((prev) => ({
        ...prev,
        slideLanguage: resolvedSlideLanguage || prev.slideLanguage,
        llmLanguage: resolvedLlmLanguage || prev.llmLanguage,
      }));
    }
    setVersionSnapshots(normalizeStoredVersionSnapshots(presentation.versionSnapshots));
    const rawTheme = presentation && typeof presentation === "object" && "theme" in presentation
      ? (presentation as EditorGeneratedPresentation & { theme?: unknown }).theme
      : undefined;
    if (!paletteGlobalOverride && rawTheme && typeof rawTheme === "object") {
      const themeObj = rawTheme as { primary?: unknown; secondary?: unknown; bg?: unknown; text?: unknown };
      const normalizeThemeHex = (value: unknown, fallback: string) => {
        const normalized = String(value || "").trim().toLowerCase();
        return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
      };
      setThemeColors([
        normalizeThemeHex(themeObj.primary, "#ff6b35"),
        normalizeThemeHex(themeObj.secondary, "#ff8a5c"),
        normalizeThemeHex(themeObj.bg, "#0f172a"),
        normalizeThemeHex(themeObj.text, "#f8fafc"),
      ]);
    }

    if (!Array.isArray(presentation.slides) || presentation.slides.length === 0) {
      const nextTitle = String(presentation.title || "").trim();
      if (nextTitle) {
        setPresentationTitle(nextTitle);
      }
      if (paletteGlobalOverride) {
        setThemeColors(paletteGlobalOverride);
      }
      if (typographyGlobalOverride) {
        setTypography(typographyGlobalOverride);
      }
      setElements(normalizeStoredElements(presentation.elements));
      return;
    }
    const typeMap: Record<string, string> = {
      cover: "Cover",
      agenda: "Agenda",
      content: "Content",
      data: "Data",
      summary: "Summary",
    };
    const normalizedSlides = presentation.slides
      .slice(0, 20)
      .map((item, index) => {
        const title = String(item?.title || "").trim();
        const rawType = String(item?.type || "").trim().toLowerCase();
        return {
          id: Number(item?.id) || index + 1,
          title: title || `Slide ${index + 1}`,
          type: typeMap[rawType] || "Content",
          html: String(item?.html || ""),
        };
      });
    if (normalizedSlides.length === 0) {
      return;
    }
    const firstHtml = String(normalizedSlides.find((slide) => String(slide.html || "").trim())?.html || "");
    let normalizedThemeFromSlides: string[] | null = null;
    let normalizedTypographyFromSlides: { title: string; body: string } | null = null;
    if (firstHtml) {
      const readCssVar = (names: string[]) => {
        for (const name of names) {
          const match = firstHtml.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`, "i"));
          if (match?.[1]) {
            return match[1].toLowerCase();
          }
        }
        return "";
      };
      const fallback = ["#ff6b35", "#ff8a5c", "#0f172a", "#f8fafc"];
      normalizedThemeFromSlides = [
        readCssVar(["--primary", "--accent-primary"]),
        readCssVar(["--secondary", "--accent-secondary"]),
        readCssVar(["--bg", "--bg-primary"]),
        readCssVar(["--text", "--text-primary"]),
      ].map((value, idx) =>
        /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback[idx],
      );
      normalizedTypographyFromSlides = extractTypographyFromHtml(firstHtml);
    }

    const mappedSlides = normalizedSlides.map((slide) => ({
      ...slide,
      html: applyScopedOverridesToHtml(String(slide.html || ""), slide.id),
    }));

    if (paletteGlobalOverride) {
      setThemeColors(paletteGlobalOverride);
    } else if (normalizedThemeFromSlides) {
      setThemeColors(normalizedThemeFromSlides);
    }
    if (typographyGlobalOverride) {
      setTypography(typographyGlobalOverride);
    } else if (normalizedTypographyFromSlides) {
      setTypography(normalizedTypographyFromSlides);
    }

    setSlides(mappedSlides);
    setElements(normalizeStoredElements(presentation.elements));
    setActiveSlide((current) => (normalizedSlides.some((slide) => slide.id === current) ? current : normalizedSlides[0].id));
    const nextTitle = String(presentation.title || "").trim();
    if (nextTitle) {
      setPresentationTitle(nextTitle);
    }
  };

  useEffect(() => {
    outlineDraftRef.current = outlineDraft;
  }, [outlineDraft]);

  useEffect(() => {
    if (locationState.newProject) {
      localStorage.removeItem("generated_presentation");
      localStorage.removeItem("ppt_generation_job_id");
      setEditingDeckId(null);
      setPaletteGlobalOverride(null);
      setPaletteSlideOverrides({});
      setTypographyGlobalOverride(null);
      setTypographySlideOverrides({});
      setTypography(DEFAULT_TYPOGRAPHY);
      setSlides(DEFAULT_EDITOR_SLIDES);
      setElements([]);
      setActiveSlide(1);
      setPresentationTitle("FacetDeck Pitch 2026");
      setWizardAssets([]);
      setOutlineDraft(null);
      setOutlineInstruction("");
      setVersionSnapshots([]);
      clearChatMessages();
    }

    if (locationState.initialPrompt) {
      setWizardData(prev => ({ ...prev, idea: locationState.initialPrompt as string }));
      setWizardOpen(true);
      setWizardStep(1);
      setWizardAssets([]);
      setOutlineDraft(null);
      setOutlineInstruction("");
      window.history.replaceState({}, document.title);
      return;
    }

    if (locationState.openWizardSetup) {
      setWizardOpen(true);
      setWizardStep(1);
      if (locationState.preferPresetMode) {
        setStylePathMode("preset");
      }
      const presetId = String(locationState.presetId || "").trim();
      const presetName = String(locationState.presetName || "").trim();
      if (presetId || presetName) {
        setPendingPresetSelection({
          id: presetId || undefined,
          name: presetName || undefined,
        });
      }
      window.history.replaceState({}, document.title);
      return;
    }

    if (locationState.jobId) {
      return;
    }
    let presentation = locationState.presentation as EditorGeneratedPresentation | undefined;
    if (!presentation && !locationState.newProject) {
      const stored = localStorage.getItem("generated_presentation");
      if (stored) {
        try {
          presentation = JSON.parse(stored);
        } catch (_error) {
          presentation = undefined;
        }
      }
    }
    if (presentation) {
      applyGeneratedPresentation(presentation);
      hydrateChatMessages((presentation as EditorGeneratedPresentation).chatHistory || []);
    }
  }, [location.state]);

  useEffect(() => {
    const rawDeckId = Number(locationState.deckId);
    if (Number.isFinite(rawDeckId) && rawDeckId > 0) {
      setEditingDeckId(rawDeckId);
      return;
    }
    if (locationState.jobId) {
      // Starting a new AI generation should not overwrite an existing repository item.
      setEditingDeckId(null);
    }
  }, [location.state]);

  useEffect(() => {
    if (!wizardOpen || wizardStep !== 5 || stylePathMode !== "preset") {
      return;
    }
    if (builtinPresets.length > 0 || userPresets.length > 0) {
      return;
    }
    void loadPresetOptions();
  }, [wizardOpen, wizardStep, stylePathMode, builtinPresets.length, userPresets.length]);

  useEffect(() => {
    const locationState = (location.state || {}) as { jobId?: unknown };
    const stateJobId = String(locationState.jobId || "").trim();
    const savedJobId = String(localStorage.getItem("ppt_generation_job_id") || "").trim();
    const jobId = stateJobId || savedJobId;
    if (!jobId) {
      setIsGenerationPolling(false);
      return;
    }

    const token = localStorage.getItem("auth_token");
    if (!token) {
      setIsGenerationPolling(false);
      return;
    }

    localStorage.setItem("ppt_generation_job_id", jobId);
    setIsGenerationPolling(true);
    setSlides([]);
    setActiveSlide(1);
    setPresentationTitle("Generating presentation...");

    let disposed = false;
    let timerId = 0;
    let hasShownJobError = false;

    const pollJob = async () => {
      try {
        const response = await fetch(`/api/ppt/jobs/${encodeURIComponent(jobId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || disposed) {
          if (response.status === 404 || response.status === 401) {
            localStorage.removeItem("ppt_generation_job_id");
          }
          if (!hasShownJobError) {
            hasShownJobError = true;
            const errorMessage = String(data?.error || "").trim() || `Request failed (${response.status})`;
            toast.error("PPT generation request failed", {
              description: errorMessage,
            });
          }
          if (timerId) {
            clearInterval(timerId);
          }
          setIsGenerationPolling(false);
          return;
        }

        if (data?.presentation) {
          applyGeneratedPresentation(data.presentation);
          localStorage.setItem("generated_presentation", JSON.stringify(data.presentation));
        }

        const status = String(data?.status || "");
        if (status === "done" || status === "failed" || status === "cancelled") {
          localStorage.removeItem("ppt_generation_job_id");
          if (status === "done") {
            completeInitialGenerationConversation();
          } else {
            failInitialGenerationConversation();
          }
          if (status === "failed" && data?.error) {
            if (!hasShownJobError) {
              hasShownJobError = true;
              toast.error("PPT generation failed", {
                description: String(data.error),
              });
            }
          }
          if (timerId) {
            clearInterval(timerId);
          }
          setIsGenerationPolling(false);
        }
      } catch (_error) {
        failInitialGenerationConversation("Generation stopped. Please try again.");
        if (!hasShownJobError) {
          hasShownJobError = true;
          toast.error("PPT generation failed", {
            description: "Network error while polling generation task",
          });
        }
        if (timerId) {
          clearInterval(timerId);
        }
        setIsGenerationPolling(false);
      }
    };

    void pollJob();
    timerId = window.setInterval(pollJob, 1200);

    return () => {
      disposed = true;
      if (timerId) {
        clearInterval(timerId);
      }
      setIsGenerationPolling(false);
    };
  }, [location.state]);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const versionCards = chatMessages.filter((item) => item.isVersionCard && Number(item.version) > 0);
    if (versionCards.length === 0 || slides.length === 0) {
      return;
    }
    const latestCard = versionCards[versionCards.length - 1];
    const latestVersion = Number(latestCard.version);
    if (!Number.isFinite(latestVersion) || latestVersion <= 0) {
      return;
    }
    if (versionSnapshots.some((item) => Number(item.version) === latestVersion)) {
      return;
    }
    upsertVersionSnapshot(latestVersion, slides, latestCard.versionTitle);
  }, [chatMessages, slides, versionSnapshots]);

  const activeSlideData = slides.find((slide) => slide.id === activeSlide);
  const activeSlideCodeTokens = useMemo(() => {
    if (centerViewMode !== "code") {
      return [];
    }
    return tokenizeHtmlCode(String(activeSlideData?.html || ""));
  }, [centerViewMode, activeSlideData?.html]);
  const slideMappedElements = useMemo<EditorElement[]>(() => {
    if (!activeSlideData?.html || typeof window === "undefined") {
      return [];
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(activeSlideData.html, "text/html");
      const textNodes = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,button,span"))
        .map((node) => {
          const rawText = (node.textContent || "").replace(/\s+/g, " ").trim();
          if (!rawText) return null;
          return {
            text: rawText,
            code: node.outerHTML || rawText,
          };
        })
        .filter((item): item is { text: string; code: string } => Boolean(item))
        .filter((item, idx, arr) => arr.findIndex((entry) => entry?.text === item?.text) === idx)
        .slice(0, 10)
        .map((item, index) => ({
          id: `slide-${activeSlideData.id}-text-${index + 1}`,
          name: item.text.length > 48 ? `${item.text.slice(0, 45)}...` : item.text,
          type: "TEXT",
          source: "slide" as const,
          slideId: activeSlideData.id,
          code: String(item.code || "").slice(0, 2000),
        }));
      const imageNodes = Array.from(doc.querySelectorAll("img"))
        .map((img, index) => {
          const alt = (img.getAttribute("alt") || "").trim();
          const src = (img.getAttribute("src") || "").trim();
          if (!alt && !src) return null;
          return {
            id: `slide-${activeSlideData.id}-image-${index + 1}`,
            name: alt || `Image ${index + 1}`,
            type: "IMAGE",
            source: "slide" as const,
            slideId: activeSlideData.id,
            code: (img.outerHTML || "").slice(0, 2000),
          };
        })
        .filter(Boolean) as EditorElement[];
      return [...textNodes, ...imageNodes];
    } catch (_error) {
      return [];
    }
  }, [activeSlideData?.html, activeSlideData?.id]);
  const visibleResourceElements = useMemo(() => {
    const activeSlideId = Number(activeSlideData?.id);
    const assets = elements
      .filter((item) => {
        if (!Number.isFinite(activeSlideId) || activeSlideId <= 0) {
          return true;
        }
        return Number(item.slideId) === activeSlideId;
      })
      .map((item) => ({ ...item, source: "asset" as const }));
    return [...slideMappedElements, ...assets];
  }, [slideMappedElements, elements, activeSlideData?.id]);

  const upsertVersionSnapshot = (
    version: number,
    slidesSnapshot: EditorSlide[],
    versionTitle?: string,
  ) => {
    if (!Number.isFinite(version) || version <= 0 || !Array.isArray(slidesSnapshot) || slidesSnapshot.length === 0) {
      return;
    }
    const normalizedSlides = slidesSnapshot
      .slice(0, 50)
      .map((slide, index) => ({
        id: Number(slide?.id) || index + 1,
        title: String(slide?.title || `Slide ${index + 1}`).trim().slice(0, 120),
        type: String(slide?.type || "Content").trim().slice(0, 40),
        html: String(slide?.html || ""),
      }))
      .filter((slide) => slide.html.trim().length > 0);
    if (normalizedSlides.length === 0) {
      return;
    }
    setVersionSnapshots((prev) => {
      const withoutCurrent = prev.filter((item) => Number(item.version) !== Number(version));
      const next = [
        ...withoutCurrent,
        {
          version: Number(version),
          versionTitle: String(versionTitle || "").trim().slice(0, 300) || undefined,
          savedAt: Date.now(),
          slides: normalizedSlides,
        },
      ].sort((a, b) => Number(a.version) - Number(b.version));
      return next.slice(-50);
    });
  };
  const {
    isSelectorMode,
    selectedTags,
    selectedSlideIds,
    isPropertiesSelectorMode,
    selectedPropertyElement,
    hoveredRect,
    setSelectedPropertyElement,
    removeTag,
    clearSelectedTags,
    addSelectedTag,
    restoreSelectedTags,
    toggleSelectorMode,
    togglePropertiesSelectorMode,
  } = useEditorSelector();

  const {
    isPresenting,
    showPlayHint,
    togglePresentation,
    presentationIframeRef,
    editorViewportRef,
    presentationViewportRef,
    editorSlideScale,
    presentationSlideScale,
    editorFrameWidth,
    editorFrameHeight,
    presentationFrameWidth,
    presentationFrameHeight,
  } = useEditorPresentation({
    slides,
    activeSlide,
    setActiveSlide,
    activeSlideHtml: activeSlideData?.html,
  });

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(Math.ceil(scrollLeft) < scrollWidth - clientWidth - 1);
    }
  };

  const handleAddWizardAssets = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (accepted.length === 0) {
      toast.error("Please upload image files only");
      return;
    }
    const mapped = await Promise.all(
      accepted.map(
        (file) =>
          new Promise<EditorWizardAsset>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                id: createClientId("asset"),
                name: file.name,
                mimeType: file.type || "image/*",
                size: file.size,
                dataUrl: String(reader.result || ""),
                userDescription: "",
                adopt: true,
                reason: "User uploaded image",
                forcedAdopt: false,
                suggestedUsage: [],
              });
            };
            reader.onerror = () => {
              resolve({
                id: createClientId("asset"),
                name: file.name,
                mimeType: file.type || "image/*",
                size: file.size,
                dataUrl: "",
                userDescription: "",
                adopt: true,
                reason: "Failed to read file",
                forcedAdopt: false,
                suggestedUsage: [],
              });
            };
            reader.readAsDataURL(file);
          }),
      ),
    );
    setWizardAssets((prev) => [...prev, ...mapped]);
  };

  const normalizeOutlineForClient = (draft: EditorOutlineDraft): EditorOutlineDraft => {
    const source = draft && typeof draft === "object" ? draft : ({ title: "", slides: [] } as EditorOutlineDraft);
    return {
      title: String(source.title || "").trim(),
      slides: Array.isArray(source.slides)
        ? source.slides.map((slide, index) => {
            const aiPromptsSource = Array.isArray(slide.aiImagePrompts) ? slide.aiImagePrompts : [];
            let aiImagePrompts = aiPromptsSource
              .map((item, promptIndex) => ({
                // Keep strict status union for editor typing.
                id: String(item?.id || `${slide.id || `slide-${index + 1}`}-img-${promptIndex + 1}`),
                prompt: String(item?.prompt || "").trim(),
                status: (
                  item?.status === "done" || item?.status === "failed" || item?.status === "generating"
                    ? item.status
                    : "idle"
                ) as "idle" | "generating" | "done" | "failed",
                imageUrl: String(item?.imageUrl || "").trim(),
                error: String(item?.error || "").trim(),
              }))
              .filter((item) => item.prompt);
            const aiImageNeeded = slide.aiImageNeeded === true || aiImagePrompts.length > 0;
            return {
              ...slide,
              slideVisualDirection: String(slide.slideVisualDirection || (slide as { imagePrompt?: unknown }).imagePrompt || "").trim(),
              aiImageNeeded,
              aiImageExpanded: slide.aiImageExpanded === true,
              aiImagePrompts,
            };
          })
        : [],
    };
  };

  const hasPendingOutlineImages = (draft: EditorOutlineDraft | null) => {
    if (!draft || !Array.isArray(draft.slides)) return false;
    return draft.slides.some((slide) => {
      if (slide.aiImageNeeded === false) return false;
      const prompts = Array.isArray(slide.aiImagePrompts) ? slide.aiImagePrompts : [];
      if (prompts.length === 0) return true;
      return prompts.some((item) => !String(item?.imageUrl || "").trim());
    });
  };

  const handleGenerateOutlineAiImage = async (slideId: string, promptId: string) => {
    const taskKey = `${slideId}::${promptId}`;
    const existingTask = outlineImageTaskMapRef.current.get(taskKey);
    if (existingTask) {
      await existingTask;
      return;
    }
    const token = localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Please sign in first");
      return;
    }
    const currentDraft = outlineDraftRef.current;
    const slide = currentDraft?.slides.find((item) => item.id === slideId);
    const targetPrompt = slide?.aiImagePrompts?.find((item) => item.id === promptId);
    const promptText = String(targetPrompt?.prompt || "").trim();
    if (!promptText) {
      toast.error("Image prompt cannot be empty");
      return;
    }
    const task = (async () => {
      setOutlineDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          slides: prev.slides.map((item) =>
            item.id !== slideId
              ? item
              : {
                  ...item,
                  aiImagePrompts: (item.aiImagePrompts || []).map((promptItem) =>
                    promptItem.id === promptId ? { ...promptItem, status: "generating", error: "" } : promptItem,
                  ),
                },
          ),
        };
      });
      try {
        const response = await fetch("/api/ppt/generate-outline-image", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ prompt: promptText }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(data?.error || "Failed to generate image"));
        }
        const imageUrl = String(data?.imageUrl || "").trim();
        if (!imageUrl) {
          throw new Error("Image provider returned empty URL");
        }
        setOutlineDraft((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            slides: prev.slides.map((item) =>
              item.id !== slideId
                ? item
                : {
                    ...item,
                    aiImagePrompts: (item.aiImagePrompts || []).map((promptItem) =>
                      promptItem.id === promptId
                        ? { ...promptItem, status: "done", imageUrl, error: "" }
                        : promptItem,
                    ),
                  },
            ),
          };
        });
      } catch (error: unknown) {
        setOutlineDraft((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            slides: prev.slides.map((item) =>
              item.id !== slideId
                ? item
                : {
                    ...item,
                    aiImagePrompts: (item.aiImagePrompts || []).map((promptItem) =>
                      promptItem.id === promptId
                        ? {
                            ...promptItem,
                            status: "failed",
                            error: getErrorMessage(error, "Image generation failed"),
                          }
                        : promptItem,
                    ),
                  },
            ),
          };
        });
      } finally {
        outlineImageTaskMapRef.current.delete(taskKey);
      }
    })();
    outlineImageTaskMapRef.current.set(taskKey, task);
    await task;
  };

  const handleGenerateAllOutlineAiImages = async () => {
    const draft = outlineDraftRef.current;
    if (!draft) return;
    const pendingTasks = draft.slides
      .filter((slide) => slide.aiImageNeeded !== false)
      .flatMap((slide) =>
        (slide.aiImagePrompts || [])
          .filter((item) => String(item.prompt || "").trim() && !String(item.imageUrl || "").trim())
          .map((item) => ({ slideId: slide.id, promptId: item.id, status: item.status })),
      );
    if (pendingTasks.length === 0) return;
    setIsGeneratingOutlineImages(true);
    try {
      const allTasks = pendingTasks.map((item) => {
        const taskKey = `${item.slideId}::${item.promptId}`;
        if (item.status === "generating") {
          const existingTask = outlineImageTaskMapRef.current.get(taskKey);
          return existingTask || Promise.resolve();
        }
        return handleGenerateOutlineAiImage(item.slideId, item.promptId);
      });
      await Promise.allSettled(allTasks);
    } finally {
      setIsGeneratingOutlineImages(false);
    }
  };

  const handleGenerateOutline = async () => {
    if (!wizardData.idea.trim()) {
      toast.error("Please enter your idea");
      return;
    }
    const token = localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Please sign in first");
      return;
    }
    setIsGeneratingOutline(true);
    try {
      const response = await fetch("/api/ppt/generate-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...wizardData,
          assets: wizardAssets
            .filter((asset) => asset.dataUrl || String((asset as { url?: string }).url || "").trim())
            .map((asset) => ({
              ...asset,
              userDescription: String(asset.userDescription || "").trim(),
            })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || "Failed to generate outline"));
      }
      if (!data?.outline || !Array.isArray(data.outline.slides)) {
        throw new Error("Outline payload is invalid");
      }
      setOutlineDraft(normalizeOutlineForClient(data.outline as EditorOutlineDraft));
      setWizardStep(3);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to generate outline"));
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleReviseOutline = async () => {
    if (!outlineDraft) {
      toast.error("Generate outline first");
      return;
    }
    const instruction = outlineInstruction.trim();
    if (!instruction) {
      toast.error("Please describe what to change");
      return;
    }
    const token = localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Please sign in first");
      return;
    }
    setIsRevisingOutline(true);
    try {
      const response = await fetch("/api/ppt/revise-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...wizardData,
          outline: outlineDraft,
          instruction,
          assets: wizardAssets
            .filter((asset) => asset.dataUrl || String((asset as { url?: string }).url || "").trim())
            .map((asset) => ({ ...asset, userDescription: String(asset.userDescription || "").trim() })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || "Failed to revise outline"));
      }
      if (!data?.outline || !Array.isArray(data.outline.slides)) {
        throw new Error("Invalid revised outline");
      }
      setOutlineDraft(normalizeOutlineForClient(data.outline as EditorOutlineDraft));
      setOutlineInstruction("");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to revise outline"));
    } finally {
      setIsRevisingOutline(false);
    }
  };

  const handleOutlineSlideChange = (slideId: string, updates: Partial<EditorOutlineSlide>) => {
    setOutlineDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        slides: prev.slides.map((slide) => (slide.id === slideId ? { ...slide, ...updates } : slide)),
      };
    });
  };

  const handleGeneratePreviews = async () => {
    if (!wizardData.idea.trim()) {
      toast.error("Please enter your idea");
      return;
    }
    setIsGeneratingPreviews(true);
    setWizardStep(5);
    const token = localStorage.getItem("auth_token");
    try {
      const response = await fetch("/api/ppt/generate-previews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(wizardData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate previews");
      const normalizedStyles: EditorStylePreview[] = (Array.isArray(data.styles) ? data.styles : []).map((style: Partial<EditorStylePreview>, index: number) => ({
        id: String(style?.id || `style-${index + 1}`),
        name: String(style?.name || `Style ${index + 1}`),
        description: String(style?.description || "Distinct style direction"),
        colors: {
          primary: style?.colors?.primary || "#ff6b35",
          secondary: style?.colors?.secondary || "#ff8a5c",
          bg: style?.colors?.bg || "#ffffff",
          text: style?.colors?.text || "#1e293b",
        },
        fonts: {
          title: style?.fonts?.title || "Manrope",
          body: style?.fonts?.body || "Inter",
        },
        previewHtml: String(style?.previewHtml || "").trim(),
      })).filter((style: EditorStylePreview) => Boolean(style.previewHtml));
      setStylePreviews(normalizedStyles);
      if (normalizedStyles.length > 0) {
        const firstId = normalizedStyles[0].id;
        setMixSelection({
          baseStyleId: firstId,
          descriptionFromId: firstId,
          colorsFromId: firstId,
          typographyFromId: firstId,
          vibeFromId: firstId,
          layoutFromId: firstId,
          signatureElementsFromId: firstId,
          animationFromId: firstId,
          motionFromId: firstId,
        });
        setIsMixMode(false);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to generate previews"));
      setWizardStep(4);
    } finally {
      setIsGeneratingPreviews(false);
    }
  };

  const canProceedFromOutline = !hasPendingOutlineImages(outlineDraft);

  const handleWizardNext = async () => {
    if (wizardStep === 1) {
      if (!wizardData.idea.trim()) {
        toast.error("Please enter your idea");
        return;
      }
      setWizardStep(2);
      return;
    }
    if (wizardStep === 2) {
      const missingDescription = wizardAssets.some((asset) => !asset.userDescription.trim());
      if (missingDescription) {
        toast.error("Please input image description for each image");
        return;
      }
      if (outlineDraft && Array.isArray(outlineDraft.slides) && outlineDraft.slides.length > 0) {
        setWizardStep(3);
        return;
      }
      await handleGenerateOutline();
      return;
    }
    if (wizardStep === 3) {
      if (!outlineDraft || !Array.isArray(outlineDraft.slides) || outlineDraft.slides.length === 0) {
        toast.error("Please generate outline first");
        return;
      }
      if (hasPendingOutlineImages(outlineDraft)) {
        await handleGenerateAllOutlineAiImages();
        return;
      }
      setWizardStep(4);
      return;
    }
    if (wizardStep === 4) {
      if (stylePathMode === "options") {
        await handleGeneratePreviews();
        return;
      }
      const loaded = await loadPresetOptions();
      if (!loaded) {
        return;
      }
      setStylePreviews([]);
      setWizardStep(5);
      setIsMixMode(false);
      return;
    }
  };

  const handleContinueWithoutAiImage = () => {
    if (!outlineDraft || !Array.isArray(outlineDraft.slides) || outlineDraft.slides.length === 0) {
      toast.error("Please generate outline first");
      return;
    }
    setOutlineDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        slides: (prev.slides || []).map((slide) => ({
          ...slide,
          aiImageNeeded: false,
          aiImageExpanded: false,
          aiImagePrompts: [],
        })),
      };
    });
    setWizardStep(4);
  };

  const handleWizardBack = () => {
    if (wizardStep === 5 && stylePathMode === "preset" && stylePreviews.length > 0) {
      setStylePreviews([]);
      setIsMixMode(false);
      setWizardStep(5);
      return;
    }
    if (wizardStep <= 1) return;
    setWizardStep((prev) => (prev > 1 ? (prev - 1) as typeof prev : prev));
  };

  const openStylePreviewPage = (style: EditorStylePreview) => {
    if (!style.previewHtml) {
      toast.error("This style does not include HTML preview");
      return;
    }
    try {
      const blob = new Blob([style.previewHtml], { type: "text/html;charset=utf-8" });
      const previewUrl = URL.createObjectURL(blob);
      const opened = window.open(previewUrl, "_blank");
      if (!opened) {
        URL.revokeObjectURL(previewUrl);
        throw new Error("Popup blocked");
      }
      // Give the new tab enough time to load before revoking.
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
    } catch (_error) {
      toast.error("Failed to open style preview page");
    }
  };

  const normalizeHexColorSafe = (value: string, fallback: string) => {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim()) ? String(value).trim() : fallback;
  };

  const normalizeFontName = (value: unknown, fallback: string) => {
    const cleaned = String(value || "")
      .replace(/^['"]|['"]$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned ? cleaned.slice(0, 60) : fallback;
  };

  const encodeGoogleFontFamily = (fontFamily: string) => {
    return encodeURIComponent(normalizeFontName(fontFamily, "Inter")).replace(/%20/g, "+");
  };

  const extractThemeColorsFromHtml = (html: string) => {
    const source = String(html || "");
    const readCssVar = (names: string[]) => {
      for (const name of names) {
        const regex = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`, "i");
        const match = source.match(regex);
        if (match?.[1]) {
          return match[1].toLowerCase();
        }
      }
      return "";
    };
    return [
      readCssVar(["--primary", "--accent-primary"]),
      readCssVar(["--secondary", "--accent-secondary"]),
      readCssVar(["--bg", "--bg-primary"]),
      readCssVar(["--text", "--text-primary"]),
    ].map((value, index) =>
      normalizeHexColorSafe(
        value,
        ["#ff6b35", "#ff8a5c", "#0f172a", "#f8fafc"][index],
      ).toLowerCase(),
    );
  };

  const extractTypographyFromHtml = (html: string) => {
    const source = String(html || "");
    const readFontVar = (names: string[], fallback: string) => {
      for (const name of names) {
        const regex = new RegExp(`${name}\\s*:\\s*([^;\\n]+)`, "i");
        const match = source.match(regex);
        if (!match?.[1]) continue;
        const raw = String(match[1]).trim();
        const quoted = raw.match(/["']([^"']+)["']/);
        const first = quoted?.[1] || raw.split(",")[0] || "";
        const normalized = normalizeFontName(first, fallback);
        if (normalized) return normalized;
      }
      return fallback;
    };
    return {
      title: readFontVar(["--font-display"], DEFAULT_TYPOGRAPHY.title),
      body: readFontVar(["--font-body"], DEFAULT_TYPOGRAPHY.body),
    };
  };

  const applyThemeColorsToHtml = (html: string, prevColors: string[], nextColors: string[]) => {
    if (!html) return html;
    let updated = html;

    const variableMap: Array<[string, string]> = [
      ["--primary", nextColors[0]],
      ["--accent-primary", nextColors[0]],
      ["--secondary", nextColors[1]],
      ["--accent-secondary", nextColors[1]],
      ["--bg", nextColors[2]],
      ["--bg-primary", nextColors[2]],
      ["--text", nextColors[3]],
      ["--text-primary", nextColors[3]],
    ];

    for (const [cssVar, color] of variableMap) {
      const regex = new RegExp(`(${cssVar}\\s*:\\s*)(#[0-9a-fA-F]{6})`, "gi");
      updated = updated.replace(regex, `$1${color}`);
    }

    return updated;
  };

  const applyTypographyToHtml = (
    html: string,
    prevFonts: TypographyPair,
    nextFonts: TypographyPair,
  ) => {
    if (!html) return html;
    let updated = html;
    const nextTitle = normalizeFontName(nextFonts.title, DEFAULT_TYPOGRAPHY.title);
    const nextBody = normalizeFontName(nextFonts.body, DEFAULT_TYPOGRAPHY.body);
    const prevTitle = normalizeFontName(prevFonts.title, DEFAULT_TYPOGRAPHY.title);
    const prevBody = normalizeFontName(prevFonts.body, DEFAULT_TYPOGRAPHY.body);

    updated = updated.replace(
      /href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*"/i,
      `href="https://fonts.googleapis.com/css2?family=${encodeGoogleFontFamily(nextTitle)}:wght@500;700;800&family=${encodeGoogleFontFamily(nextBody)}:wght@400;500;700&display=swap"`,
    );

    updated = updated.replace(/(--font-display\s*:\s*)([^;]+)(;)/gi, `$1"${nextTitle}", sans-serif$3`);
    updated = updated.replace(/(--font-body\s*:\s*)([^;]+)(;)/gi, `$1"${nextBody}", sans-serif$3`);

    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    updated = updated.replace(new RegExp(`"${escapeRegex(prevTitle)}"\\s*,\\s*sans-serif`, "gi"), `"${nextTitle}", sans-serif`);
    updated = updated.replace(new RegExp(`"${escapeRegex(prevBody)}"\\s*,\\s*sans-serif`, "gi"), `"${nextBody}", sans-serif`);

    return updated;
  };

  const applyScopedOverridesToHtml = (
    html: string,
    slideId: number,
    options?: {
      paletteGlobal?: string[] | null;
      paletteBySlide?: Record<number, string[]>;
      typographyGlobal?: TypographyPair | null;
      typographyBySlide?: Record<number, TypographyPair>;
    },
  ) => {
    let updated = String(html || "");
    const paletteGlobal = options?.paletteGlobal ?? paletteGlobalOverride;
    const paletteBySlide = options?.paletteBySlide ?? paletteSlideOverrides;
    const typographyGlobal = options?.typographyGlobal ?? typographyGlobalOverride;
    const typographyBySlide = options?.typographyBySlide ?? typographySlideOverrides;

    if (paletteGlobal) {
      updated = applyThemeColorsToHtml(updated, extractThemeColorsFromHtml(updated), paletteGlobal);
    }
    const slidePalette = paletteBySlide[slideId];
    if (slidePalette) {
      updated = applyThemeColorsToHtml(updated, extractThemeColorsFromHtml(updated), slidePalette);
    }
    if (typographyGlobal) {
      updated = applyTypographyToHtml(updated, extractTypographyFromHtml(updated), typographyGlobal);
    }
    const slideTypography = typographyBySlide[slideId];
    if (slideTypography) {
      updated = applyTypographyToHtml(updated, extractTypographyFromHtml(updated), slideTypography);
    }

    return updated;
  };

  const arePalettesEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, idx) => value.toLowerCase() === String(b[idx] || "").toLowerCase());

  const areTypographyEqual = (a: TypographyPair, b: TypographyPair) =>
    normalizeFontName(a.title, DEFAULT_TYPOGRAPHY.title) === normalizeFontName(b.title, DEFAULT_TYPOGRAPHY.title) &&
    normalizeFontName(a.body, DEFAULT_TYPOGRAPHY.body) === normalizeFontName(b.body, DEFAULT_TYPOGRAPHY.body);

  const getCurrentGlobalPalette = () => {
    if (paletteGlobalOverride) return paletteGlobalOverride;
    const candidate = slides.find((slide) => !paletteSlideOverrides[slide.id] && String(slide.html || "").trim());
    if (candidate) return extractThemeColorsFromHtml(String(candidate.html || ""));
    return themeColors;
  };

  const getCurrentGlobalTypography = (): TypographyPair => {
    if (typographyGlobalOverride) return typographyGlobalOverride;
    const candidate = slides.find((slide) => !typographySlideOverrides[slide.id] && String(slide.html || "").trim());
    if (candidate) return extractTypographyFromHtml(String(candidate.html || ""));
    return typography;
  };

  const handleThemeColorsChange = (nextColors: string[], scope: ApplyScope) => {
    const nextPalette = nextColors.map((value, idx) =>
      normalizeHexColorSafe(String(value || ""), themeColors[idx] || "#000000").toLowerCase(),
    );
    setThemeColors(nextPalette);
    if (scope === "all") {
      const previousGlobal = getCurrentGlobalPalette();
      const nextPaletteBySlide = { ...paletteSlideOverrides };
      Object.keys(nextPaletteBySlide).forEach((key) => {
        const slideId = Number(key);
        if (!slideId) return;
        if (arePalettesEqual(nextPaletteBySlide[slideId], previousGlobal)) {
          delete nextPaletteBySlide[slideId];
        }
      });
      setPaletteGlobalOverride(nextPalette);
      setPaletteSlideOverrides(nextPaletteBySlide);
      setSlides((prevSlides) =>
        prevSlides.map((slide) => {
          const source = String(slide.html || "");
          const currentPalette = extractThemeColorsFromHtml(source);
          const shouldFollowGlobal = arePalettesEqual(currentPalette, previousGlobal);
          if (!shouldFollowGlobal) {
            return slide;
          }
          return {
            ...slide,
            html: applyScopedOverridesToHtml(source, slide.id, {
              paletteGlobal: nextPalette,
              paletteBySlide: nextPaletteBySlide,
            }),
          };
        }),
      );
      return;
    }
    if (!activeSlideData) return;
    const currentGlobal = getCurrentGlobalPalette();
    const nextPaletteBySlide = { ...paletteSlideOverrides };
    if (arePalettesEqual(nextPalette, currentGlobal)) {
      delete nextPaletteBySlide[activeSlideData.id];
    } else {
      nextPaletteBySlide[activeSlideData.id] = nextPalette;
    }
    setPaletteSlideOverrides(nextPaletteBySlide);
    setSlides((prevSlides) =>
      prevSlides.map((slide) =>
        slide.id === activeSlideData.id
          ? {
              ...slide,
              html: applyScopedOverridesToHtml(String(slide.html || ""), slide.id, {
                paletteBySlide: nextPaletteBySlide,
              }),
            }
          : slide,
      ),
    );
  };

  const handleTypographyChange = (nextFonts: TypographyPair, scope: ApplyScope) => {
    const normalizedNext = {
      title: normalizeFontName(nextFonts.title, DEFAULT_TYPOGRAPHY.title),
      body: normalizeFontName(nextFonts.body, DEFAULT_TYPOGRAPHY.body),
    };
    setTypography(normalizedNext);
    if (scope === "all") {
      const previousGlobal = getCurrentGlobalTypography();
      const nextTypographyBySlide = { ...typographySlideOverrides };
      Object.keys(nextTypographyBySlide).forEach((key) => {
        const slideId = Number(key);
        if (!slideId) return;
        if (areTypographyEqual(nextTypographyBySlide[slideId], previousGlobal)) {
          delete nextTypographyBySlide[slideId];
        }
      });
      setTypographyGlobalOverride(normalizedNext);
      setTypographySlideOverrides(nextTypographyBySlide);
      setSlides((prevSlides) =>
        prevSlides.map((slide) => {
          const source = String(slide.html || "");
          const currentTypography = extractTypographyFromHtml(source);
          const shouldFollowGlobal = areTypographyEqual(currentTypography, previousGlobal);
          if (!shouldFollowGlobal) {
            return slide;
          }
          return {
            ...slide,
            html: applyScopedOverridesToHtml(source, slide.id, {
              typographyGlobal: normalizedNext,
              typographyBySlide: nextTypographyBySlide,
            }),
          };
        }),
      );
      return;
    }
    if (!activeSlideData) return;
    const currentGlobal = getCurrentGlobalTypography();
    const nextTypographyBySlide = { ...typographySlideOverrides };
    if (areTypographyEqual(normalizedNext, currentGlobal)) {
      delete nextTypographyBySlide[activeSlideData.id];
    } else {
      nextTypographyBySlide[activeSlideData.id] = normalizedNext;
    }
    setTypographySlideOverrides(nextTypographyBySlide);
    setSlides((prevSlides) =>
      prevSlides.map((slide) =>
        slide.id === activeSlideData.id
          ? {
              ...slide,
              html: applyScopedOverridesToHtml(String(slide.html || ""), slide.id, {
                typographyBySlide: nextTypographyBySlide,
              }),
            }
          : slide,
      ),
    );
  };

  const handleResetSlideThemeToGlobal = () => {
    if (!activeSlideData) return;
    const globalPalette = getCurrentGlobalPalette();
    const nextPaletteBySlide = { ...paletteSlideOverrides };
    delete nextPaletteBySlide[activeSlideData.id];
    setPaletteSlideOverrides(nextPaletteBySlide);
    setThemeColors(globalPalette);
    setSlides((prevSlides) =>
      prevSlides.map((slide) =>
        slide.id === activeSlideData.id
          ? {
              ...slide,
              html: applyScopedOverridesToHtml(String(slide.html || ""), slide.id, {
                paletteBySlide: nextPaletteBySlide,
              }),
            }
          : slide,
      ),
    );
  };

  const handleResetSlideTypographyToGlobal = () => {
    if (!activeSlideData) return;
    const globalTypography = getCurrentGlobalTypography();
    const nextTypographyBySlide = { ...typographySlideOverrides };
    delete nextTypographyBySlide[activeSlideData.id];
    setTypographySlideOverrides(nextTypographyBySlide);
    setTypography(globalTypography);
    setSlides((prevSlides) =>
      prevSlides.map((slide) =>
        slide.id === activeSlideData.id
          ? {
              ...slide,
              html: applyScopedOverridesToHtml(String(slide.html || ""), slide.id, {
                typographyBySlide: nextTypographyBySlide,
              }),
            }
          : slide,
      ),
    );
  };

  const buildPresetStyle = (presetName: string, presetPayload?: Partial<EditorCustomPreset | EditorBuiltinPreset>): EditorStylePreview => {
    const cleanName = String(presetName || "").trim() || "Custom Preset";
    const colors = (presetPayload?.colors || {}) as Partial<EditorCustomPreset["colors"]>;
    const fonts = (presetPayload?.fonts || {}) as Partial<EditorCustomPreset["fonts"]>;
    return {
      id: `preset-${cleanName.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
      name: cleanName,
      description: String(presetPayload?.description || `Direct preset selection: ${cleanName}`),
      vibe: presetPayload?.vibe,
      layout: presetPayload?.layout,
      signatureElements: presetPayload?.signatureElements,
      animation: presetPayload?.animation,
      colors: {
        primary: normalizeHexColorSafe(colors.primary || "", "#ff6b35"),
        secondary: normalizeHexColorSafe(colors.secondary || "", "#ff8a5c"),
        bg: normalizeHexColorSafe(colors.bg || "", "#0f172a"),
        text: normalizeHexColorSafe(colors.text || "", "#f8fafc"),
      },
      fonts: {
        title: String(fonts.title || "Manrope"),
        body: String(fonts.body || "Inter"),
      },
      previewHtml: "",
    };
  };

  const loadPresetOptions = async () => {
    const token = localStorage.getItem("auth_token");
    setIsLoadingPresets(true);
    try {
      const response = await fetch("/api/style-presets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load presets");
      const normalizedBuiltinPresets: EditorBuiltinPreset[] = Array.isArray(data.builtinPresets)
        ? data.builtinPresets
            .map((item: unknown, index: number) => {
              if (typeof item === "string") {
                const name = String(item).trim();
                if (!name) return null;
                return {
                  id: `builtin-${index + 1}`,
                  name,
                  description: "Built-in preset",
                  colors: { primary: "#ff6b35", secondary: "#ff8a5c", bg: "#0f172a", text: "#f8fafc" },
                  fonts: { title: "Manrope", body: "Inter" },
                  visibility: "builtin" as const,
                };
              }
              if (!item || typeof item !== "object") return null;
              const preset = item as Partial<EditorBuiltinPreset>;
              const name = String(preset.name || "").trim();
              if (!name) return null;
              return {
                id: String(preset.id || `builtin-${index + 1}`),
                name,
                description: String(preset.description || "Built-in preset"),
                vibe: preset.vibe ? String(preset.vibe) : undefined,
                layout: preset.layout ? String(preset.layout) : undefined,
                signatureElements: preset.signatureElements ? String(preset.signatureElements) : undefined,
                animation: preset.animation ? String(preset.animation) : undefined,
                colors: {
                  primary: normalizeHexColorSafe(String(preset.colors?.primary || ""), "#ff6b35"),
                  secondary: normalizeHexColorSafe(String(preset.colors?.secondary || ""), "#ff8a5c"),
                  bg: normalizeHexColorSafe(String(preset.colors?.bg || ""), "#0f172a"),
                  text: normalizeHexColorSafe(String(preset.colors?.text || ""), "#f8fafc"),
                },
                fonts: {
                  title: String(preset.fonts?.title || "Manrope"),
                  body: String(preset.fonts?.body || "Inter"),
                },
                visibility: "builtin",
              };
            })
            .filter(Boolean) as EditorBuiltinPreset[]
        : [];
      setBuiltinPresets(normalizedBuiltinPresets);
      setUserPresets(Array.isArray(data.privatePresets) ? data.privatePresets : []);
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load presets"));
      return false;
    } finally {
      setIsLoadingPresets(false);
    }
  };

  const handleCreatePreset = async () => {
    const name = newPresetDraft.name.trim();
    if (!name) {
      toast.error("Preset name is required");
      return;
    }
    const token = localStorage.getItem("auth_token");
    setIsSavingPreset(true);
    try {
      const response = await fetch("/api/style-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name,
          description: newPresetDraft.description.trim(),
          vibe: newPresetDraft.vibe.trim(),
          layout: newPresetDraft.layout.trim(),
          signatureElements: newPresetDraft.signatureElements.trim(),
          animation: newPresetDraft.animation.trim(),
          colors: newPresetDraft.colors,
          fonts: {
            title: newPresetDraft.titleFont.trim() || "Manrope",
            body: newPresetDraft.bodyFont.trim() || "Inter",
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create preset");
      const nextPrivate = Array.isArray(data.privatePresets) ? data.privatePresets : [];
      setUserPresets(nextPrivate);
      setIsCreatePresetOpen(false);
      setNewPresetDraft({
        name: "",
        description: "",
        vibe: "",
        layout: "",
        signatureElements: "",
        animation: "",
        titleFont: "Manrope",
        bodyFont: "Inter",
        colors: {
          primary: "#ff6b35",
          secondary: "#ff8a5c",
          bg: "#0f172a",
          text: "#f8fafc",
        },
      });
      toast.success("Preset saved to your private library");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create preset"));
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    const token = localStorage.getItem("auth_token");
    try {
      const response = await fetch(`/api/style-presets/${presetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete preset");
      const nextPrivate = Array.isArray(data.privatePresets) ? data.privatePresets : [];
      setUserPresets(nextPrivate);
      toast.success("Preset deleted");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete preset"));
    }
  };

  const resolveStyleById = (styleId: string) => {
    return stylePreviews.find((item) => item.id === styleId) || stylePreviews[0];
  };

  const buildMixedStyle = (): EditorStylePreview | null => {
    if (stylePreviews.length === 0) {
      return null;
    }
    const base = resolveStyleById(mixSelection.baseStyleId);
    const descriptionFrom = resolveStyleById(mixSelection.descriptionFromId) || base;
    const colorsFrom = resolveStyleById(mixSelection.colorsFromId) || base;
    const typographyFrom = resolveStyleById(mixSelection.typographyFromId) || base;
    const vibeFrom = resolveStyleById(mixSelection.vibeFromId) || base;
    const layoutFrom = resolveStyleById(mixSelection.layoutFromId) || base;
    const signatureElementsFrom = resolveStyleById(mixSelection.signatureElementsFromId) || base;
    const animationFrom = resolveStyleById(mixSelection.animationFromId) || base;
    const motionFrom = resolveStyleById(mixSelection.motionFromId) || base;
    if (!base || !descriptionFrom || !colorsFrom || !typographyFrom || !vibeFrom || !layoutFrom || !signatureElementsFrom || !animationFrom || !motionFrom) {
      return null;
    }
    const mixed: EditorStylePreview = {
      id: createClientId("mix"),
      name: `Mix: ${base.name}`,
      description: String(descriptionFrom.description || `Mixed from ${base.name}`),
      vibe: vibeFrom.vibe || base.vibe,
      layout: layoutFrom.layout || base.layout,
      signatureElements: signatureElementsFrom.signatureElements || base.signatureElements,
      animation: animationFrom.animation || motionFrom.animation || base.animation,
      colors: {
        primary: colorsFrom.colors.primary,
        secondary: colorsFrom.colors.secondary,
        bg: colorsFrom.colors.bg,
        text: colorsFrom.colors.text,
      },
      fonts: {
        title: typographyFrom.fonts.title,
        body: typographyFrom.fonts.body,
      },
      previewHtml: "",
      mixSpec: {
        mode: "mix",
        baseStyleId: base.id,
        descriptionFromId: descriptionFrom.id,
        colorsFromId: colorsFrom.id,
        typographyFromId: typographyFrom.id,
        vibeFromId: vibeFrom.id,
        layoutFromId: layoutFrom.id,
        signatureElementsFromId: signatureElementsFrom.id,
        animationFromId: animationFrom.id,
        motionFromId: motionFrom.id,
      },
    };
    return mixed;
  };

  const handleStartGeneration = async (style: EditorStylePreview, styleSelection?: EditorStyleSelectionPayload) => {
    const token = localStorage.getItem("auth_token");
    try {
      startInitialGenerationConversation(wizardData.idea);
      setWizardOpen(false);
      const response = await fetch("/api/ppt/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...wizardData,
          style,
          styleSelection: styleSelection || { mode: "single", baseStyleId: style.id },
          outline: outlineDraft,
          assets: wizardAssets
            .filter((asset) => asset.dataUrl || String((asset as { url?: string }).url || "").trim())
            .map((asset) => ({ ...asset, userDescription: String(asset.userDescription || "").trim() })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start generation");
      
      const jobId = String(data?.jobId || "").trim();
      if (!jobId) throw new Error("Generation job id is missing");
      
      localStorage.setItem("ppt_generation_job_id", jobId);
      localStorage.removeItem("generated_presentation");
      navigate("/editor", { state: { jobId } });
    } catch (error: unknown) {
      failInitialGenerationConversation("Failed to start generation. Please try again.");
      toast.error(getErrorMessage(error, "Failed to start generation"));
      setWizardOpen(true);
    }
  };

  const handleStartFromPreset = async (presetName: string, presetPayload?: Partial<EditorCustomPreset | EditorBuiltinPreset>) => {
    const style = buildPresetStyle(presetName, presetPayload);
    setIsGeneratingPreviews(true);
    setWizardStep(5);
    const token = localStorage.getItem("auth_token");
    try {
      const response = await fetch("/api/ppt/preview-html", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          style,
          idea: wizardData.idea,
          purpose: wizardData.purpose,
          length: wizardData.length,
          vibe: wizardData.vibe,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate preview");
      
      const aiStyle = data?.style && typeof data.style === "object" ? (data.style as Partial<EditorStylePreview>) : {};
      const previewStyle: EditorStylePreview = {
        ...style,
        ...aiStyle,
        id: "preset-preview",
        previewHtml: String(data?.html || aiStyle.previewHtml || ""),
      };
      setStylePreviews([previewStyle]);
      setIsMixMode(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to generate preview"));
      setWizardStep(4);
    } finally {
      setIsGeneratingPreviews(false);
    }
  };

  useEffect(() => {
    if (!pendingPresetSelection || !wizardOpen || wizardStep !== 5 || stylePathMode !== "preset") {
      return;
    }
    const allPresets = [...userPresets, ...builtinPresets];
    if (allPresets.length === 0) {
      void loadPresetOptions();
      return;
    }
    const target = allPresets.find((preset) => {
      const idMatches = pendingPresetSelection.id && String(preset.id || "").trim() === pendingPresetSelection.id;
      const nameMatches =
        pendingPresetSelection.name &&
        String(preset.name || "").trim().toLowerCase() === pendingPresetSelection.name.toLowerCase();
      return Boolean(idMatches || nameMatches);
    });
    if (!target) {
      return;
    }
    setPendingPresetSelection(null);
    void handleStartFromPreset(target.name, target);
  }, [
    pendingPresetSelection,
    wizardOpen,
    wizardStep,
    stylePathMode,
    userPresets,
    builtinPresets,
    loadPresetOptions,
    handleStartFromPreset,
  ]);

  const handleStartFromMix = async () => {
    const mixed = buildMixedStyle();
    if (!mixed) {
      toast.error("Please generate style options before mixing elements");
      return;
    }
    
    setIsGeneratingPreviews(true);
    const token = localStorage.getItem("auth_token");
    try {
      const response = await fetch("/api/ppt/preview-html", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          style: mixed,
          idea: wizardData.idea,
          purpose: wizardData.purpose,
          length: wizardData.length,
          vibe: wizardData.vibe,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate preview");
      
      const aiStyle = data?.style && typeof data.style === "object" ? (data.style as Partial<EditorStylePreview>) : {};
      const previewStyle: EditorStylePreview = {
        ...mixed,
        ...aiStyle,
        id: "mix-preview",
        previewHtml: String(data?.html || aiStyle.previewHtml || ""),
      };
      setStylePreviews([previewStyle]);
      setIsMixMode(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to generate preview"));
    } finally {
      setIsGeneratingPreviews(false);
    }
  };

  const checkElementsScroll = () => {
    if (elementsScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = elementsScrollRef.current;
      setCanScrollElementsLeft(scrollLeft > 0);
      setCanScrollElementsRight(Math.ceil(scrollLeft) < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    checkScroll();
    checkElementsScroll();
    const handleResize = () => {
      checkScroll();
      checkElementsScroll();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [visibleResourceElements]);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({ 
        left: direction === 'left' ? -scrollAmount : scrollAmount, 
        behavior: 'smooth' 
      });
      // Allow scroll animation to finish before checking
      setTimeout(checkScroll, 350);
    }
  };

  const scrollElements = (direction: 'left' | 'right') => {
    if (elementsScrollRef.current) {
      const scrollAmount = 300;
      elementsScrollRef.current.scrollBy({ 
        left: direction === 'left' ? -scrollAmount : scrollAmount, 
        behavior: 'smooth' 
      });
      setTimeout(checkElementsScroll, 350);
    }
  };
  
  const handleAddSlide = () => {
    const newId = slides.length > 0 ? Math.max(...slides.map(s => s.id)) + 1 : 1;
    const newSlide = { id: newId, title: "Untitled Slide", type: "Blank", html: "" };
    setSlides([...slides, newSlide]);
    setActiveSlide(newId);
  };

  const handleSaveSlideEdit = (id: number) => {
    setSlides(slides.map(s => s.id === id ? { ...s, type: editSlideType || s.type, title: editSlideTitle || s.title } : s));
    setEditingSlideId(null);
  };

  const handleDeleteSlide = (id: number) => {
    setSlides((prevSlides) => {
      const deletedIndex = prevSlides.findIndex((slide) => slide.id === id);
      if (deletedIndex < 0) {
        return prevSlides;
      }

      const remainingSlides = prevSlides.filter((slide) => slide.id !== id);
      const nextSlides =
        remainingSlides.length > 0
          ? remainingSlides
          : [
              {
                id: 1,
                title: "Untitled Slide",
                type: "Blank",
                html: "",
              },
            ];

      setActiveSlide((current) => {
        if (current !== id) {
          return current;
        }
        if (remainingSlides.length === 0) {
          return nextSlides[0].id;
        }
        const fallbackIndex = Math.max(0, deletedIndex - 1);
        return nextSlides[fallbackIndex]?.id ?? nextSlides[0]?.id ?? current;
      });

      setEditingSlideId((current) => (current === id ? null : current));
      setPaletteSlideOverrides((current) => {
        if (!(id in current)) {
          return current;
        }
        const next = { ...current };
        delete next[id];
        return next;
      });
      setTypographySlideOverrides((current) => {
        if (!(id in current)) {
          return current;
        }
        const next = { ...current };
        delete next[id];
        return next;
      });

      return nextSlides;
    });
  };

  const handleReorderSlides = (draggedId: number, targetId: number) => {
    if (draggedId === targetId) {
      return;
    }
    setSlides((prevSlides) => {
      const sourceIndex = prevSlides.findIndex((slide) => slide.id === draggedId);
      const targetIndex = prevSlides.findIndex((slide) => slide.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return prevSlides;
      }
      const nextSlides = [...prevSlides];
      const [movedSlide] = nextSlides.splice(sourceIndex, 1);
      const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      nextSlides.splice(adjustedTargetIndex, 0, movedSlide);
      return nextSlides;
    });
  };

  const handleAddElementClick = () => {
    fileInputRef.current?.click();
  };

  useEffect(() => {
    if (!activeSlideData?.html) return;
    const extracted = extractThemeColorsFromHtml(activeSlideData.html);
    const isDifferent = extracted.some(
      (color, idx) => color.toLowerCase() !== String(themeColors[idx] || "").toLowerCase(),
    );
    if (isDifferent) {
      setThemeColors(extracted);
    }
  }, [activeSlideData?.html, activeSlide, themeColors]);

  useEffect(() => {
    if (!activeSlideData?.html) return;
    const extracted = extractTypographyFromHtml(activeSlideData.html);
    const isDifferent = extracted.title !== typography.title || extracted.body !== typography.body;
    if (isDifferent) {
      setTypography(extracted);
    }
  }, [activeSlideData?.html, activeSlide, typography]);

  const parseSlideDocument = (html: string) => {
    if (typeof window === "undefined") return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ""), "text/html");
    return doc;
  };

  const serializeSlideDocument = (doc: Document) => {
    if (!doc) return "";
    const html = String(doc.documentElement?.outerHTML || "").trim();
    return html ? `<!DOCTYPE html>\n${html}` : "";
  };

  const parseStylePx = (value: string | null | undefined) => {
    const raw = String(value || "").trim();
    const match = raw.match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : 0;
  };

  const parseTranslateFromTransform = (transformValue: string | null | undefined) => {
    const raw = String(transformValue || "").trim();
    if (!raw) {
      return null;
    }
    const translate3dMatch = raw.match(/translate3d\(\s*(-?\d+(\.\d+)?)px?\s*,\s*(-?\d+(\.\d+)?)px?\s*,/i);
    if (translate3dMatch) {
      return {
        x: Number(translate3dMatch[1] || 0),
        y: Number(translate3dMatch[3] || 0),
      };
    }
    const translateMatch = raw.match(/translate\(\s*(-?\d+(\.\d+)?)px?\s*,\s*(-?\d+(\.\d+)?)px?\s*\)/i);
    if (translateMatch) {
      return {
        x: Number(translateMatch[1] || 0),
        y: Number(translateMatch[3] || 0),
      };
    }
    return null;
  };

  const htmlToMultilineText = (html: string) => {
    const withBreaks = String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|blockquote|pre|tr|section|article|ul|ol)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ");
    const stripped = withBreaks.replace(/<[^>]+>/g, "");
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = stripped;
      return String(textarea.value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
    }
    return stripped.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  };

  const readEditableTextPreservingNewlines = (node: HTMLElement) => {
    const fromHtml = htmlToMultilineText(String(node.innerHTML || ""));
    if (fromHtml.trim().length > 0) {
      return fromHtml;
    }
    return String(node.textContent || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  };

  const escapeHtml = (value: string) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const textToHtmlWithLineBreaks = (value: string) =>
    escapeHtml(String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")).replace(/\n/g, "<br>");

  const isTextEditableTag = (tagName: string) => {
    const tag = String(tagName || "").trim().toLowerCase();
    if (!tag) return false;
    return !["img", "svg", "path", "video", "audio", "canvas", "iframe"].includes(tag);
  };

  useEffect(() => {
    if (!selectedPropertyElement?.domPath || !activeSlideData?.html) {
      setPropertyTransformValues({ x: "0", y: "0", w: "0", h: "0" });
      setPropertyTransformMode("offset");
      setPropertyContentValue("");
      setCanEditPropertyContent(false);
      return;
    }
    const doc = parseSlideDocument(activeSlideData.html);
    if (!doc) {
      return;
    }
    const node = doc.querySelector(selectedPropertyElement.domPath) as HTMLElement | null;
    if (!node) {
      setPropertyTransformValues({
        x: String(Math.round(Number(selectedPropertyElement.x || 0))),
        y: String(Math.round(Number(selectedPropertyElement.y || 0))),
        w: String(Math.round(Number(selectedPropertyElement.width || 0))),
        h: String(Math.round(Number(selectedPropertyElement.height || 0))),
      });
      setPropertyTransformMode("offset");
      setPropertyContentValue(String(selectedPropertyElement.textContent || ""));
      setCanEditPropertyContent(isTextEditableTag(String(selectedPropertyElement.tagName || "")));
      return;
    }
    const style = node.getAttribute("style") || "";
    const computedPosition = typeof window !== "undefined" ? window.getComputedStyle(node).position : "";
    const isOutOfFlowPosition = ["absolute", "fixed"].includes(String(computedPosition || "").toLowerCase())
      || ["absolute", "fixed"].includes(String(node.style.position || "").toLowerCase());
    const tagName = node.tagName.toLowerCase();
    const content = readEditableTextPreservingNewlines(node);
    const translate = parseTranslateFromTransform(node.style.transform || style.match(/transform\s*:\s*([^;]+)/i)?.[1]);
    const resolveNumericField = (
      inlineValue: string | null | undefined,
      styleValue: string | undefined,
      fallback: number,
    ) => {
      const raw = String(inlineValue || styleValue || "").trim();
      if (!raw) {
        return Math.round(Number(fallback || 0));
      }
      return Math.round(parseStylePx(raw));
    };
    setPropertyTransformMode(isOutOfFlowPosition ? "absolute" : "offset");
    setPropertyTransformValues({
      x: String(
        isOutOfFlowPosition
          ? resolveNumericField(node.style.left, style.match(/left\s*:\s*([^;]+)/i)?.[1], 0)
          : Math.round(Number.isFinite(translate?.x) ? Number(translate?.x) : 0),
      ),
      y: String(
        isOutOfFlowPosition
          ? resolveNumericField(node.style.top, style.match(/top\s*:\s*([^;]+)/i)?.[1], 0)
          : Math.round(Number.isFinite(translate?.y) ? Number(translate?.y) : 0),
      ),
      w: String(
        resolveNumericField(
          node.style.width,
          style.match(/width\s*:\s*([^;]+)/i)?.[1],
          Number(selectedPropertyElement.width || 0),
        ),
      ),
      h: String(
        resolveNumericField(
          node.style.height,
          style.match(/height\s*:\s*([^;]+)/i)?.[1],
          Number(selectedPropertyElement.height || 0),
        ),
      ),
    });
    setPropertyContentValue(content);
    setCanEditPropertyContent(isTextEditableTag(tagName));
  }, [selectedPropertyElement, activeSlideData?.html]);

  const pushLocalStructuredHistory = (slideId: number, html: string) => {
    if (!Number.isFinite(slideId) || !html.trim()) return;
    localStructuredEditHistoryRef.current = [
      ...localStructuredEditHistoryRef.current,
      { slideId, html },
    ].slice(-100);
    localStructuredRedoHistoryRef.current = [];
  };

  const applySelectedElementMutation = (
    mutator: (target: HTMLElement) => void,
  ) => {
    if (!selectedPropertyElement?.domPath || !activeSlideData?.html) return false;
    const doc = parseSlideDocument(activeSlideData.html);
    if (!doc) return false;
    const target = doc.querySelector(selectedPropertyElement.domPath) as HTMLElement | null;
    if (!target) {
      setChatError("Selected element is no longer available in this slide.");
      return false;
    }
    pushLocalStructuredHistory(activeSlideData.id, String(activeSlideData.html || ""));
    mutator(target);
    const nextHtml = serializeSlideDocument(doc);
    if (!nextHtml.trim()) return false;
    setSlides((prev) =>
      prev.map((slide) => (slide.id === activeSlideData.id ? { ...slide, html: nextHtml } : slide)),
    );
    setSaveStatus("saving");
    setHasPendingSave(true);
    setChatError(null);
    return true;
  };

  const applyPropertyTransform = () => {
    const nextX = Number(propertyTransformValues.x);
    const nextY = Number(propertyTransformValues.y);
    const nextW = Number(propertyTransformValues.w);
    const nextH = Number(propertyTransformValues.h);
    if (![nextX, nextY, nextW, nextH].every((value) => Number.isFinite(value))) {
      return;
    }
    applySelectedElementMutation((target) => {
      const computedPosition = typeof window !== "undefined" ? window.getComputedStyle(target).position : "";
      const isOutOfFlowPosition = ["absolute", "fixed"].includes(String(computedPosition || "").toLowerCase())
        || ["absolute", "fixed"].includes(String(target.style.position || "").toLowerCase());
      if (isOutOfFlowPosition) {
        target.style.left = `${Math.round(nextX)}px`;
        target.style.top = `${Math.round(nextY)}px`;
      } else {
        // Keep normal flow layout: use translate for XY instead of forcing absolute positioning.
        const rawTransform = String(target.style.transform || "").trim();
        const withoutTranslate = rawTransform
          .replace(/translate3d\([^)]*\)/gi, "")
          .replace(/translate\([^)]*\)/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        const translateExpr = `translate(${Math.round(nextX)}px, ${Math.round(nextY)}px)`;
        target.style.transform = withoutTranslate ? `${withoutTranslate} ${translateExpr}` : translateExpr;
      }
      target.style.width = `${Math.max(1, Math.round(nextW))}px`;
      target.style.height = `${Math.max(1, Math.round(nextH))}px`;
    });
  };

  const applyPropertyContent = () => {
    if (!canEditPropertyContent) return;
    applySelectedElementMutation((target) => {
      const text = String(propertyContentValue || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      target.innerHTML = textToHtmlWithLineBreaks(text);
    });
  };

  const undoLastLocalStructuredEdit = () => {
    const last = localStructuredEditHistoryRef.current.pop();
    if (!last || !last.html.trim()) return;
    const current = slides.find((slide) => slide.id === last.slideId);
    if (current?.html?.trim()) {
      localStructuredRedoHistoryRef.current = [
        ...localStructuredRedoHistoryRef.current,
        { slideId: current.id, html: String(current.html || "") },
      ].slice(-100);
    }
    setSlides((prev) =>
      prev.map((slide) => (slide.id === last.slideId ? { ...slide, html: last.html } : slide)),
    );
    setSaveStatus("saving");
    setHasPendingSave(true);
  };

  const redoLastLocalStructuredEdit = () => {
    const last = localStructuredRedoHistoryRef.current.pop();
    if (!last || !last.html.trim()) return;
    const current = slides.find((slide) => slide.id === last.slideId);
    if (current?.html?.trim()) {
      localStructuredEditHistoryRef.current = [
        ...localStructuredEditHistoryRef.current,
        { slideId: current.id, html: String(current.html || "") },
      ].slice(-100);
    }
    setSlides((prev) =>
      prev.map((slide) => (slide.id === last.slideId ? { ...slide, html: last.html } : slide)),
    );
    setSaveStatus("saving");
    setHasPendingSave(true);
  };

  const patchSlideHtmlFromPlugin = ({
    slideId,
    nextHtml,
  }: {
    slideId?: number;
    nextHtml: string;
  }) => {
    const effectiveSlideId = Number(slideId) || Number(activeSlideData?.id) || 0;
    const normalizedHtml = String(nextHtml || "").trim();
    if (!effectiveSlideId || !normalizedHtml) {
      return { ok: false, error: "slideId and nextHtml are required" };
    }
    const current = slides.find((slide) => slide.id === effectiveSlideId);
    if (!current) {
      return { ok: false, error: "Slide not found" };
    }
    pushLocalStructuredHistory(effectiveSlideId, String(current.html || ""));
    setSlides((prev) =>
      prev.map((slide) => (slide.id === effectiveSlideId ? { ...slide, html: normalizedHtml } : slide)),
    );
    setSaveStatus("saving");
    setHasPendingSave(true);
    return { ok: true };
  };

  const updateElementByDomPathFromPlugin = ({
    slideId,
    domPath,
    textPatch,
    stylePatch,
  }: {
    slideId?: number;
    domPath: string;
    textPatch?: string;
    stylePatch?: {
      mode?: "absolute" | "offset";
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      css?: Record<string, string>;
    };
  }) => {
    const effectiveSlideId = Number(slideId) || Number(activeSlideData?.id) || 0;
    const safeDomPath = String(domPath || "").trim();
    if (!effectiveSlideId || !safeDomPath) {
      return { ok: false, error: "slideId and domPath are required" };
    }
    const targetSlide = slides.find((slide) => slide.id === effectiveSlideId);
    if (!targetSlide?.html) {
      return { ok: false, error: "Slide html not found" };
    }
    const doc = parseSlideDocument(String(targetSlide.html || ""));
    if (!doc) {
      return { ok: false, error: "Unable to parse slide html" };
    }
    const target = doc.querySelector(safeDomPath) as HTMLElement | null;
    if (!target) {
      return { ok: false, error: "Target element not found" };
    }
    pushLocalStructuredHistory(effectiveSlideId, String(targetSlide.html || ""));
    if (textPatch !== undefined) {
      target.innerHTML = textToHtmlWithLineBreaks(String(textPatch || ""));
    }
    if (stylePatch && typeof stylePatch === "object") {
      const mode = stylePatch.mode === "absolute" ? "absolute" : "offset";
      const x = Number(stylePatch.x);
      const y = Number(stylePatch.y);
      const w = Number(stylePatch.w);
      const h = Number(stylePatch.h);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (mode === "absolute") {
          target.style.left = `${Math.round(x)}px`;
          target.style.top = `${Math.round(y)}px`;
          if (!target.style.position) {
            target.style.position = "absolute";
          }
        } else {
          const rawTransform = String(target.style.transform || "").trim();
          const withoutTranslate = rawTransform
            .replace(/translate3d\([^)]*\)/gi, "")
            .replace(/translate\([^)]*\)/gi, "")
            .replace(/\s+/g, " ")
            .trim();
          const translateExpr = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
          target.style.transform = withoutTranslate ? `${withoutTranslate} ${translateExpr}` : translateExpr;
        }
      }
      if (Number.isFinite(w)) {
        target.style.width = `${Math.max(1, Math.round(w))}px`;
      }
      if (Number.isFinite(h)) {
        target.style.height = `${Math.max(1, Math.round(h))}px`;
      }
      if (stylePatch.css && typeof stylePatch.css === "object") {
        Object.entries(stylePatch.css).forEach(([key, value]) => {
          const safeKey = String(key || "").trim();
          if (!safeKey) return;
          target.style.setProperty(safeKey, String(value || ""));
        });
      }
    }
    const nextHtml = serializeSlideDocument(doc);
    if (!nextHtml.trim()) {
      return { ok: false, error: "Generated html is empty" };
    }
    setSlides((prev) =>
      prev.map((slide) => (slide.id === effectiveSlideId ? { ...slide, html: nextHtml } : slide)),
    );
    setSaveStatus("saving");
    setHasPendingSave(true);
    return { ok: true };
  };

  const createPluginTransactionSnapshot = () =>
    slides.map((slide) => ({
      id: Number(slide.id) || 0,
      html: String(slide.html || ""),
    }));

  const restorePluginTransactionSnapshot = (
    snapshot: Array<{ id?: number; html?: string }>,
  ) => {
    if (!Array.isArray(snapshot) || snapshot.length === 0) {
      return { ok: false, error: "Invalid transaction snapshot" };
    }
    const snapshotMap = new Map<number, string>();
    snapshot.forEach((item) => {
      const id = Number(item?.id) || 0;
      if (!id) return;
      snapshotMap.set(id, String(item?.html || ""));
    });
    if (snapshotMap.size === 0) {
      return { ok: false, error: "Invalid transaction snapshot" };
    }
    setSlides((prev) =>
      prev.map((slide) =>
        snapshotMap.has(slide.id)
          ? { ...slide, html: String(snapshotMap.get(slide.id) || "") }
          : slide,
      ),
    );
    setSaveStatus("saving");
    setHasPendingSave(true);
    return { ok: true };
  };

  const listResourceElementsFromPlugin = ({
    slideId,
  }: {
    slideId?: number;
  }) => {
    const safeSlideId = Number(slideId) || 0;
    const result = elements
      .filter((item) => {
        if (!safeSlideId) return true;
        if (!Number.isFinite(Number(item.slideId))) return false;
        return Number(item.slideId) === safeSlideId;
      })
      .map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || ""),
        type: String(item.type || ""),
        source: item.source || "asset",
        slideId: Number.isFinite(Number(item.slideId)) ? Number(item.slideId) : undefined,
        dataUrl: String(item.dataUrl || ""),
        url: String(item.url || ""),
      }));
    return { ok: true, elements: result };
  };

  const createResourceElementFromPlugin = ({
    id,
    name,
    type,
    source,
    slideId,
    dataUrl,
    url,
    code,
  }: {
    id?: string;
    name: string;
    type?: string;
    source?: "slide" | "asset";
    slideId?: number;
    dataUrl?: string;
    url?: string;
    code?: string;
  }) => {
    const normalizedName = String(name || "").trim().slice(0, 200);
    if (!normalizedName) {
      return { ok: false, error: "Element name is required" };
    }
    const nextElement = {
      id: String(id || createClientId("plugin-element")).trim(),
      name: normalizedName,
      type: String(type || "FILE").trim().toUpperCase(),
      source: source === "slide" ? "slide" : "asset",
      slideId: Number.isFinite(Number(slideId)) ? Number(slideId) : activeSlideData?.id,
      dataUrl: String(dataUrl || "").trim() || undefined,
      url: String(url || "").trim() || undefined,
      code: String(code || "").trim() || undefined,
    };
    if (!nextElement.id) {
      return { ok: false, error: "Element id is required" };
    }
    setElements((prev) => {
      const exists = prev.some((item) => item.id === nextElement.id);
      if (exists) return prev;
      return [...prev, nextElement];
    });
    setSaveStatus("saving");
    setHasPendingSave(true);
    return { ok: true, element: nextElement };
  };

  const updateResourceElementFromPlugin = ({
    id,
    patch,
  }: {
    id: string;
    patch: Partial<{
      name: string;
      type: string;
      source: "slide" | "asset";
      slideId: number;
      dataUrl: string;
      url: string;
      code: string;
    }>;
  }) => {
    const safeId = String(id || "").trim();
    if (!safeId) return { ok: false, error: "Element id is required" };
    const currentElement = elements.find((item) => item.id === safeId);
    if (!currentElement) return { ok: false, error: "Element not found" };
    const updatedElement = {
      ...currentElement,
      ...(patch.name !== undefined ? { name: String(patch.name || "").trim().slice(0, 200) } : {}),
      ...(patch.type !== undefined ? { type: String(patch.type || "").trim().toUpperCase() } : {}),
      ...(patch.source !== undefined ? { source: patch.source === "slide" ? "slide" : "asset" } : {}),
      ...(patch.slideId !== undefined ? { slideId: Number(patch.slideId) || undefined } : {}),
      ...(patch.dataUrl !== undefined ? { dataUrl: String(patch.dataUrl || "").trim() || undefined } : {}),
      ...(patch.url !== undefined ? { url: String(patch.url || "").trim() || undefined } : {}),
      ...(patch.code !== undefined ? { code: String(patch.code || "").trim() || undefined } : {}),
    };
    setElements((prev) => prev.map((item) => (item.id === safeId ? updatedElement : item)));
    setSaveStatus("saving");
    setHasPendingSave(true);
    return { ok: true, element: updatedElement };
  };

  const deleteResourceElementFromPlugin = ({
    id,
  }: {
    id: string;
  }) => {
    const safeId = String(id || "").trim();
    if (!safeId) return { ok: false, error: "Element id is required" };
    const exists = elements.some((item) => item.id === safeId);
    if (!exists) return { ok: false, error: "Element not found" };
    setElements((prev) => prev.filter((item) => item.id !== safeId));
    setSaveStatus("saving");
    setHasPendingSave(true);
    return { ok: true };
  };

  const uploadResourceDataUrlFromPlugin = async ({
    dataUrl,
    fileName,
    slideId,
    createElement = true,
    name,
  }: {
    dataUrl: string;
    fileName?: string;
    slideId?: number;
    createElement?: boolean;
    name?: string;
  }) => {
    const safeDataUrl = String(dataUrl || "").trim();
    if (!safeDataUrl.startsWith("data:image/")) {
      return { ok: false, error: "Only image dataUrl is supported" };
    }
    const token = localStorage.getItem("auth_token");
    if (!token) {
      return { ok: false, error: "Unauthorized" };
    }
    const response = await fetch("/api/assets/upload-data-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        dataUrl: safeDataUrl,
        fileName: String(fileName || "plugin-upload.png").trim(),
        folder: "user-elements",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: String(data?.error || "Failed to upload element image") };
    }
    const uploadedUrl = String(data?.url || "").trim();
    let created: Record<string, unknown> | null = null;
    if (createElement) {
      const createResult = createResourceElementFromPlugin({
        name: String(name || fileName || "Plugin Uploaded Element").trim(),
        type: "IMAGE",
        source: "asset",
        slideId: Number(slideId) || activeSlideData?.id,
        dataUrl: safeDataUrl,
        url: uploadedUrl || undefined,
      });
      if (!createResult.ok) {
        return { ok: false, error: createResult.error || "Upload succeeded but create element failed" };
      }
      created = createResult.element || null;
    }
    return {
      ok: true,
      upload: {
        url: uploadedUrl,
      },
      element: created,
    };
  };

  const uploadResourceRemoteUrlFromPlugin = async ({
    url,
    fileName,
    slideId,
    createElement = true,
    name,
  }: {
    url: string;
    fileName?: string;
    slideId?: number;
    createElement?: boolean;
    name?: string;
  }) => {
    const safeUrl = String(url || "").trim();
    if (!/^https?:\/\//i.test(safeUrl)) {
      return { ok: false, error: "Only http(s) remote URL is supported" };
    }
    const token = localStorage.getItem("auth_token");
    if (!token) {
      return { ok: false, error: "Unauthorized" };
    }
    const response = await fetch("/api/assets/upload-remote-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: safeUrl,
        fileName: String(fileName || "plugin-remote-image.png").trim(),
        folder: "user-elements",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: String(data?.error || "Failed to upload remote image") };
    }
    const uploadedUrl = String(data?.url || "").trim();
    let created: Record<string, unknown> | null = null;
    if (createElement) {
      const createResult = createResourceElementFromPlugin({
        name: String(name || fileName || "Plugin Remote Element").trim(),
        type: "IMAGE",
        source: "asset",
        slideId: Number(slideId) || activeSlideData?.id,
        url: uploadedUrl || safeUrl,
      });
      if (!createResult.ok) {
        return { ok: false, error: createResult.error || "Upload succeeded but create element failed" };
      }
      created = createResult.element || null;
    }
    return {
      ok: true,
      upload: {
        url: uploadedUrl || safeUrl,
      },
      element: created,
    };
  };

  const addImageToSlideFromPlugin = async ({
    slideId,
    name,
    imageUrl,
    dataUrl,
    x,
    y,
    w,
    h,
    createElement = true,
    persistRemoteUrl = true,
  }: {
    slideId?: number;
    name?: string;
    imageUrl?: string;
    dataUrl?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    createElement?: boolean;
    persistRemoteUrl?: boolean;
  }) => {
    const effectiveSlideId = Number(slideId) || Number(activeSlideData?.id) || 0;
    if (!effectiveSlideId) return { ok: false, error: "slideId is required" };
    const safeDataUrl = String(dataUrl || "").trim();
    const safeImageUrl = String(imageUrl || "").trim();
    let finalUrl = "";
    let createdElement: Record<string, unknown> | null = null;
    if (safeDataUrl.startsWith("data:image/")) {
      const uploaded = await uploadResourceDataUrlFromPlugin({
        dataUrl: safeDataUrl,
        fileName: `${String(name || "plugin-image").trim() || "plugin-image"}.png`,
        slideId: effectiveSlideId,
        createElement,
        name: String(name || "Plugin Generated Image").trim(),
      });
      if (!uploaded.ok) return uploaded;
      finalUrl = String(uploaded.upload?.url || safeDataUrl).trim();
      createdElement = uploaded.element || null;
    } else if (/^https?:\/\//i.test(safeImageUrl)) {
      if (persistRemoteUrl) {
        const uploaded = await uploadResourceRemoteUrlFromPlugin({
          url: safeImageUrl,
          fileName: `${String(name || "plugin-remote-image").trim() || "plugin-remote-image"}.png`,
          slideId: effectiveSlideId,
          createElement,
          name: String(name || "Plugin Generated Image").trim(),
        });
        if (!uploaded.ok) return uploaded;
        finalUrl = String(uploaded.upload?.url || safeImageUrl).trim();
        createdElement = uploaded.element || null;
      } else {
        finalUrl = safeImageUrl;
        if (createElement) {
          const createResult = createResourceElementFromPlugin({
            name: String(name || "Plugin Image").trim(),
            type: "IMAGE",
            source: "asset",
            slideId: effectiveSlideId,
            url: finalUrl,
          });
          if (!createResult.ok) return createResult;
          createdElement = createResult.element || null;
        }
      }
    } else {
      return { ok: false, error: "Either dataUrl or imageUrl is required" };
    }
    const targetSlide = slides.find((slide) => slide.id === effectiveSlideId);
    if (!targetSlide) {
      return { ok: false, error: "Target slide not found" };
    }
    const baseHtml = String(targetSlide.html || "").trim() || "<!DOCTYPE html><html><body style='margin:0;position:relative;width:1920px;height:1080px;'></body></html>";
    const doc = parseSlideDocument(baseHtml);
    if (!doc) {
      return { ok: false, error: "Unable to parse slide html" };
    }
    const body = doc.body || doc.querySelector("body");
    if (!body) {
      return { ok: false, error: "Slide body is missing" };
    }
    const img = doc.createElement("img");
    img.setAttribute("src", finalUrl);
    img.setAttribute("alt", String(name || "Plugin image").trim() || "Plugin image");
    const safeW = Number.isFinite(Number(w)) ? Math.max(80, Math.round(Number(w))) : 360;
    const safeH = Number.isFinite(Number(h)) ? Math.max(80, Math.round(Number(h))) : 220;
    const safeX = Number.isFinite(Number(x)) ? Math.round(Number(x)) : 80;
    const safeY = Number.isFinite(Number(y)) ? Math.round(Number(y)) : 80;
    img.setAttribute(
      "style",
      [
        "position:absolute",
        `left:${safeX}px`,
        `top:${safeY}px`,
        `width:${safeW}px`,
        `height:${safeH}px`,
        "object-fit:cover",
        "border-radius:12px",
      ].join(";"),
    );
    body.appendChild(img);
    const nextHtml = serializeSlideDocument(doc);
    if (!nextHtml.trim()) {
      return { ok: false, error: "Failed to generate next slide html" };
    }
    const patchResult = patchSlideHtmlFromPlugin({
      slideId: effectiveSlideId,
      nextHtml,
    });
    if (!patchResult.ok) return patchResult;
    return {
      ok: true,
      inserted: true,
      slideId: effectiveSlideId,
      imageUrl: finalUrl,
      element: createdElement,
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const pending = Array.from(files).map((file) =>
        new Promise<EditorElement>((resolve) => {
          if (!file.type.startsWith("image/")) {
            resolve({
              id: createClientId("element"),
              name: file.name,
              type: "FILE",
              source: "asset",
              slideId: activeSlideData?.id,
            });
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            (async () => {
              const dataUrl = String(reader.result || "");
              const token = localStorage.getItem("auth_token");
              let persistedUrl = "";
              if (token && dataUrl.startsWith("data:image/")) {
                try {
                  const response = await fetch("/api/assets/upload-data-url", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      dataUrl,
                      fileName: file.name,
                      folder: "user-elements",
                    }),
                  });
                  const data = await response.json().catch(() => ({}));
                  if (response.ok) {
                    persistedUrl = String(data?.url || "").trim();
                  }
                } catch (_error) {}
              }
              resolve({
                id: createClientId("element"),
                name: file.name,
                type: "IMAGE",
                source: "asset",
                slideId: activeSlideData?.id,
                dataUrl,
                url: persistedUrl || undefined,
              });
            })();
          reader.onerror = () =>
            resolve({
              id: createClientId("element"),
              name: file.name,
              type: "IMAGE",
              source: "asset",
              slideId: activeSlideData?.id,
            });
          reader.readAsDataURL(file);
        }),
      );
      void Promise.all(pending).then((nextElements) => {
        setElements((prev) => [...prev, ...nextElements]);
      });
    }
    // Reset input so the same file can be uploaded again if needed
    if (e.target) e.target.value = '';
  };

  const handleRevertToVersion = (version: number) => {
    const targetVersion = Number(version);
    if (!Number.isFinite(targetVersion) || targetVersion <= 0) {
      return;
    }
    if (isWaitingForAI || isGenerationPolling || isRevertingVersion) {
      return;
    }
    const snapshot = versionSnapshots.find((item) => Number(item.version) === targetVersion);
    if (!snapshot || !Array.isArray(snapshot.slides) || snapshot.slides.length === 0) {
      setChatError("Version snapshot unavailable.");
      toast.error("Version snapshot unavailable");
      return;
    }
    const revertedSlides = snapshot.slides
      .slice(0, 50)
      .map((slide, index) => ({
        id: Number(slide?.id) || index + 1,
        title: String(slide?.title || `Slide ${index + 1}`).trim().slice(0, 120),
        type: String(slide?.type || "Content").trim().slice(0, 40),
        html: String(slide?.html || ""),
      }))
      .filter((slide) => slide.html.trim().length > 0);
    if (revertedSlides.length === 0) {
      setChatError("Version snapshot unavailable.");
      toast.error("Version snapshot unavailable");
      return;
    }
    setIsRevertingVersion(true);
    setChatError(null);
    setSlides(revertedSlides);
    setActiveSlide((current) =>
      revertedSlides.some((slide) => slide.id === current) ? current : revertedSlides[0].id,
    );
    appendAssistantMessage(`Rolled back slides to Version ${targetVersion}.`);
    appendVersionCard(`Reverted to Version ${targetVersion}.`);
    setPendingRollbackSaveVersion(targetVersion);
  };

  const handleCopilotSendMessage = async () => {
    if (isChatDisabled) {
      return;
    }
    const userText = String(chatInput || "").trim();
    if (!userText) {
      return;
    }
    const selectedTagsSnapshot = selectedTags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      kind: tag.kind,
      slideId: tag.slideId,
      elementId: tag.elementId,
    }));
    clearSelectedTags();

      const selectedElementSlideIds = Array.from(
      new Set(
        selectedTagsSnapshot
            .filter(
              (tag) =>
                (tag.kind === "element" || tag.kind === "resource")
                && typeof tag.slideId === "number",
            )
          .map((tag) => Number(tag.slideId))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    const scopedSlideIds = Array.from(new Set([...selectedSlideIds, ...selectedElementSlideIds]));
    const effectiveSlideIds =
      scopedSlideIds.length > 0
        ? scopedSlideIds
        : slides.map((slide) => slide.id).filter((id) => Number.isFinite(id));
    const selectionMode: "none" | "slide" | "element" | "mixed" =
      selectedSlideIds.length > 0 && selectedElementSlideIds.length > 0
        ? "mixed"
        : selectedSlideIds.length > 0
          ? "slide"
          : selectedElementSlideIds.length > 0
            ? "element"
            : "none";
    if (effectiveSlideIds.length === 0) {
      setChatError("No slides available to edit.");
      return;
    }

    const token = localStorage.getItem("auth_token");
    if (!token) {
      setChatError("Please sign in first.");
      return;
    }

    const userMessage = appendUserMessage(userText);
    if (!userMessage) {
      return;
    }
    setChatInput("");
    setChatError(null);
    setIsWaitingForAI(true);

    const historyForModel = [...chatMessages, userMessage]
      .slice(-10)
      .map((message) => ({
        role: message.isUser ? "user" : "assistant",
        type: message.isVersionCard ? "version" : "message",
        text: String(message.text || ""),
        version: message.isVersionCard ? Number(message.version) || undefined : undefined,
        versionTitle: message.isVersionCard ? String(message.versionTitle || "") : undefined,
      }));

    const editableSlides = slides
      .filter((slide) => effectiveSlideIds.includes(slide.id))
      .map((slide) => ({
        id: slide.id,
        title: slide.title,
        type: slide.type,
        html: slide.html,
      }));
    const selectedElementSlides = slides
      .filter((slide) => selectedElementSlideIds.includes(slide.id))
      .map((slide) => ({
        id: slide.id,
        title: slide.title,
        type: slide.type,
        html: slide.html,
      }));

    const selectedElements = selectedTagsSnapshot.map((tag) => {
      const matchedElement = tag.elementId
        ? visibleResourceElements.find((element) => element.id === tag.elementId)
        : visibleResourceElements.find((element) => (
            element.name === tag.name.replace(/^Element:\s*/i, "").replace(/^Resource:\s*/i, "")
            && (
              (typeof tag.slideId === "number" && element.slideId === tag.slideId)
              || (typeof tag.slideId !== "number" && element.source === "asset")
            )
          ));
      return {
        id: tag.id,
        name: tag.name,
        kind: tag.kind,
        slideId: typeof tag.slideId === "number" ? tag.slideId : undefined,
        elementId: tag.elementId,
        elementCode: String(matchedElement?.code || "").slice(0, 2000),
        elementType: matchedElement?.type,
        elementSource: matchedElement?.source,
        elementUrl: String(matchedElement?.url || "").trim() || undefined,
        elementDataUrl: String(matchedElement?.dataUrl || "").startsWith("data:image/")
          ? String(matchedElement?.dataUrl || "").slice(0, 500000)
          : undefined,
      };
    });

    try {
      const response = await fetch("/api/ppt/revise-selected-slides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentMessage: userText,
          recentHistory: historyForModel,
          slideLanguage: String(wizardData.slideLanguage || "English"),
          llmLanguage: String(wizardData.llmLanguage || "English"),
          selectionMode,
          selectedElements,
          selectedSlideIds: effectiveSlideIds,
          selectedElementSlideIds,
          selectedElementSlides,
          allSlides: slides.map((slide) => ({
            id: slide.id,
            title: slide.title,
            type: slide.type,
            html: slide.html,
          })),
          editableSlides,
          readonlySlideIds: slides
            .map((slide) => slide.id)
            .filter((slideId) => !effectiveSlideIds.includes(slideId)),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || "Failed to revise selected slides"));
      }

      const updates = Array.isArray(data?.updates) ? data.updates : [];
      const updatesById = new Map<number, { title?: string; type?: string; html?: string }>();
      updates.forEach((item: unknown) => {
        const source = item && typeof item === "object" ? item as { id?: unknown; title?: unknown; type?: unknown; html?: unknown } : {};
        const slideId = Number(source.id);
        if (!Number.isFinite(slideId) || !effectiveSlideIds.includes(slideId)) {
          return;
        }
        updatesById.set(slideId, {
          title: source.title === undefined ? undefined : String(source.title || ""),
          type: source.type === undefined ? undefined : String(source.type || ""),
          html: source.html === undefined ? undefined : String(source.html || ""),
        });
      });

      if (updatesById.size > 0) {
        setSlides((prev) =>
          prev.map((slide) => {
            const patch = updatesById.get(slide.id);
            if (!patch) return slide;
            return {
              ...slide,
              title: patch.title?.trim() ? patch.title : slide.title,
              type: patch.type?.trim() ? patch.type : slide.type,
              html: patch.html?.trim() ? patch.html : slide.html,
            };
          }),
        );
      }

      appendAssistantMessage(
        String(data?.assistantMessage || "Done. I updated only the selected slides."),
      );
      appendVersionCard(
        String(data?.versionTitle || `Updated ${Math.max(1, updatesById.size)} selected slide(s) based on your request.`),
      );
    } catch (error: unknown) {
      removeMessageById(userMessage.id);
      setChatInput(userText);
      setChatError(getErrorMessage(error, "Failed to revise selected slides"));
      restoreSelectedTags(selectedTagsSnapshot);
    } finally {
      setIsWaitingForAI(false);
    }
  };

  const saveCurrentDeckToRepository = async () => {
    const token = localStorage.getItem("auth_token");
    const resolvedTitle = String(presentationTitle || "").trim() || "Untitled Deck";
    const normalizedSlides = slides
      .map((slide, index) => ({
        id: Number(slide.id) || index + 1,
        title: String(slide.title || `Slide ${index + 1}`).trim(),
        type: String(slide.type || "Content").trim(),
        html: String(slide.html || ""),
      }))
      .filter((slide) => slide.html.trim().length > 0);
    const normalizedChatHistory = chatMessages
      .slice(-300)
      .map((message) => ({
        id: String(message.id || ""),
        text: String(message.text || ""),
        isUser: message.isUser === true,
        isVersionCard: message.isVersionCard === true,
        version: Number(message.version) || 0,
        versionTitle: String(message.versionTitle || ""),
      }));
    const normalizedAssetElements = elements
      .slice(-200)
      .map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || "").trim().slice(0, 200),
        type: String(item.type || "FILE").trim().slice(0, 30).toUpperCase(),
        source: "asset" as const,
        slideId: Number.isFinite(Number(item.slideId)) ? Number(item.slideId) : undefined,
        dataUrl: String(item.dataUrl || "").trim().startsWith("data:image/")
          ? String(item.dataUrl || "")
          : undefined,
        url: /^https?:\/\//i.test(String(item.url || "").trim())
          ? String(item.url || "").trim()
          : undefined,
      }))
      .filter((item) => item.name);
    const normalizedVersionSnapshots = versionSnapshots
      .slice(-50)
      .map((snapshot) => ({
        version: Number(snapshot.version) || 0,
        versionTitle: String(snapshot.versionTitle || "").trim().slice(0, 300),
        savedAt: Number(snapshot.savedAt) || Date.now(),
        slides: Array.isArray(snapshot.slides)
          ? snapshot.slides
              .slice(0, 50)
              .map((slide, index) => ({
                id: Number(slide.id) || index + 1,
                title: String(slide.title || "").trim().slice(0, 120),
                type: String(slide.type || "").trim().slice(0, 40),
                html: String(slide.html || ""),
              }))
              .filter((slide) => slide.html.trim().length > 0)
          : [],
      }))
      .filter((snapshot) => Number(snapshot.version) > 0 && snapshot.slides.length > 0);
    if (!token || normalizedSlides.length === 0) {
      return null;
    }

    const requestUrl = editingDeckId ? `/api/repository/decks/${editingDeckId}` : "/api/repository/decks";
    const requestMethod = editingDeckId ? "PUT" : "POST";
    const response = await fetch(requestUrl, {
      method: requestMethod,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: resolvedTitle,
        theme: {
          primary: themeColors[0],
          secondary: themeColors[1],
        },
        presentation: {
          title: resolvedTitle,
          slides: normalizedSlides,
          chatHistory: normalizedChatHistory,
          elements: normalizedAssetElements,
          versionSnapshots: normalizedVersionSnapshots,
          slideLanguage: String(wizardData.slideLanguage || "English"),
          llmLanguage: String(wizardData.llmLanguage || "English"),
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Failed to save deck to repository");
    }
    const savedDeckId = Number(data?.deck?.id);
    const resolvedDeckId =
      Number.isFinite(savedDeckId) && savedDeckId > 0
        ? savedDeckId
        : Number.isFinite(Number(editingDeckId)) && Number(editingDeckId) > 0
          ? Number(editingDeckId)
          : null;
    if (!editingDeckId && Number.isFinite(savedDeckId) && savedDeckId > 0) {
      setEditingDeckId(savedDeckId);
    }
    return resolvedDeckId;
  };

  const saveSnapshot = JSON.stringify({
    title: String(presentationTitle || "").trim(),
    theme: {
      primary: String(themeColors[0] || ""),
      secondary: String(themeColors[1] || ""),
    },
    slides: slides.map((slide, index) => ({
      id: Number(slide.id) || index + 1,
      title: String(slide.title || ""),
      type: String(slide.type || ""),
      html: String(slide.html || ""),
    })),
    elements: elements.map((item) => ({
      id: String(item.id || ""),
      name: String(item.name || ""),
      type: String(item.type || ""),
      source: String(item.source || "asset"),
      slideId: Number.isFinite(Number(item.slideId)) ? Number(item.slideId) : undefined,
      dataUrl: String(item.dataUrl || ""),
      url: String(item.url || ""),
    })),
    chatHistory: chatMessages.map((message) => ({
      id: String(message.id || ""),
      text: String(message.text || ""),
      isUser: message.isUser === true,
      isVersionCard: message.isVersionCard === true,
      version: Number(message.version) || 0,
      versionTitle: String(message.versionTitle || ""),
    })),
    versionSnapshots: versionSnapshots.map((snapshot) => ({
      version: Number(snapshot.version) || 0,
      versionTitle: String(snapshot.versionTitle || ""),
      savedAt: Number(snapshot.savedAt) || Date.now(),
      slides: Array.isArray(snapshot.slides)
        ? snapshot.slides.map((slide, index) => ({
            id: Number(slide.id) || index + 1,
            title: String(slide.title || ""),
            type: String(slide.type || ""),
            html: String(slide.html || ""),
          }))
        : [],
    })),
    slideLanguage: String(wizardData.slideLanguage || "English"),
    llmLanguage: String(wizardData.llmLanguage || "English"),
  });

  useEffect(() => {
    if (pendingRollbackSaveVersion === null) {
      return;
    }
    let disposed = false;
    const persistRollback = async () => {
      setSaveStatus("saving");
      try {
        const saved = await saveCurrentDeckToRepository();
        if (disposed) {
          return;
        }
        if (saved) {
          setSaveStatus("saved");
          setLastSavedAt(Date.now());
          lastSavedSnapshotRef.current = saveSnapshot;
          setHasPendingSave(false);
        } else {
          setSaveStatus("error");
          setChatError("Rollback applied, but save failed. Please retry.");
        }
      } catch (_error) {
        if (!disposed) {
          setSaveStatus("error");
          setChatError("Rollback applied, but save failed. Please retry.");
        }
      } finally {
        if (!disposed) {
          setPendingRollbackSaveVersion(null);
          setIsRevertingVersion(false);
        }
      }
    };
    void persistRollback();
    return () => {
      disposed = true;
    };
  }, [pendingRollbackSaveVersion]);

  useEffect(() => {
    if (lastSavedSnapshotRef.current === null) {
      lastSavedSnapshotRef.current = saveSnapshot;
      return;
    }
    if (saveSnapshot !== lastSavedSnapshotRef.current) {
      setHasPendingSave(true);
    }
  }, [saveSnapshot]);

  useEffect(() => {
    if (!hasPendingSave || isGenerationPolling || saveStatus === "saving") {
      return;
    }
    const delay = saveStatus === "error" ? 4000 : 1400;
    const timerId = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const saved = await saveCurrentDeckToRepository();
        if (!saved) {
          setSaveStatus("idle");
          setHasPendingSave(false);
          return;
        }
        lastSavedSnapshotRef.current = saveSnapshot;
        setLastSavedAt(Date.now());
        setHasPendingSave(false);
        setSaveStatus("saved");
      } catch (_error) {
        setSaveStatus("error");
      }
    }, delay);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [hasPendingSave, isGenerationPolling, saveStatus, saveSnapshot]);

  useEffect(() => {
    const timerId = window.setInterval(() => setSaveStatusClock(Date.now()), 30000);
    return () => window.clearInterval(timerId);
  }, []);

  const resolveSaveStatusUi = () => {
    if (isGenerationPolling || isWaitingForAI) {
      return { text: "Generating...", tone: "warning" as const };
    }
    if (saveStatus === "saving") {
      return { text: "Saving...", tone: "warning" as const };
    }
    if (saveStatus === "error") {
      return { text: "Save failed", tone: "error" as const };
    }
    if (!lastSavedAt) {
      return { text: hasPendingSave ? "Unsaved changes" : "Not saved yet", tone: "neutral" as const };
    }

    const elapsedMs = Math.max(0, saveStatusClock - lastSavedAt);
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    if (elapsedMinutes < 1) {
      return { text: "Saved just now", tone: "success" as const };
    }
    if (elapsedMinutes < 60) {
      return { text: `Saved ${elapsedMinutes}m ago`, tone: "success" as const };
    }
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return { text: `Saved ${elapsedHours}h ago`, tone: "success" as const };
    }
    const elapsedDays = Math.floor(elapsedHours / 24);
    return { text: `Saved ${elapsedDays}d ago`, tone: "success" as const };
  };

  const saveStatusUi = resolveSaveStatusUi();

  const handleBackToHome = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const runningJobId = String(localStorage.getItem("ppt_generation_job_id") || "").trim();
      if (token && runningJobId) {
        try {
          const cancelResponse = await fetch(`/api/ppt/jobs/${encodeURIComponent(runningJobId)}/cancel`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const cancelData = await cancelResponse.json().catch(() => ({}));
          if (cancelResponse.ok && cancelData?.presentation) {
            applyGeneratedPresentation(cancelData.presentation as EditorGeneratedPresentation);
            localStorage.setItem("generated_presentation", JSON.stringify(cancelData.presentation));
          }
          if (cancelResponse.ok || cancelResponse.status === 404 || cancelResponse.status === 401) {
            localStorage.removeItem("ppt_generation_job_id");
          }
        } catch (_error) {
          // Ignore cancellation network failure and continue best-effort save.
        }
      }

      const saved = await saveCurrentDeckToRepository();
      if (saved) {
        toast.success("PPT auto-saved to repository");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Auto-save failed. Returned to home.");
    } finally {
      navigate("/home");
    }
  };

  const commitPresentationTitle = () => {
    const trimmed = editTitle.trim();
    if (trimmed) setPresentationTitle(trimmed);
    setIsEditingTitle(false);
  };

  const handlePresentationTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitPresentationTitle();
    }
    if (e.key === "Escape") {
      setEditTitle(presentationTitle);
      setIsEditingTitle(false);
    }
  };

  const handleExportDownload = (format: "PDF" | "PPTX" | "HTML") => {
    const exportToastStyle = {
      background: "linear-gradient(to right, #ff6b35, #ff8a5c)",
      color: "white",
      border: "none",
      boxShadow: "0 10px 15px -3px rgba(255, 107, 53, 0.3)",
    };
    setIsExportMenuOpen(false);
    toast.success(`Downloading ${format}...`, { style: exportToastStyle });
  };

  const parseDownloadFileName = (contentDisposition: string | null, fallback: string) => {
    if (!contentDisposition) {
      return fallback;
    }
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]).replace(/["']/g, "").trim() || fallback;
      } catch (_error) {}
    }
    const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) {
      return quotedMatch[1].trim() || fallback;
    }
    const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
    if (plainMatch?.[1]) {
      return plainMatch[1].replace(/["']/g, "").trim() || fallback;
    }
    return fallback;
  };

  const handleExportPdfDownload = async () => {
    const exportToastStyle = {
      background: "linear-gradient(to right, #ff6b35, #ff8a5c)",
      color: "white",
      border: "none",
      boxShadow: "0 10px 15px -3px rgba(255, 107, 53, 0.3)",
    };
    setIsExportMenuOpen(false);
    const token = localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Please sign in again before exporting", { style: exportToastStyle });
      return;
    }
    const normalizedSlides = slides
      .slice(0, 60)
      .map((slide, index) => ({
        id: Number(slide.id) || index + 1,
        title: String(slide.title || `Slide ${index + 1}`).trim().slice(0, 120),
        html: String(slide.html || ""),
      }))
      .filter((slide) => slide.html.trim().length > 0);
    if (normalizedSlides.length === 0) {
      toast.error("No generated slides to export", { style: exportToastStyle });
      return;
    }

    const loadingToastId = toast.loading("Generating PDF...", { style: exportToastStyle });
    try {
      const response = await fetch("/api/ppt/export-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: presentationTitle,
          slides: normalizedSlides,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(String(data?.error || "Failed to export PDF"));
      }
      const blob = await response.blob();
      const fallbackName = `${String(presentationTitle || "FacetDeck").trim() || "FacetDeck"}.pdf`;
      const fileName = parseDownloadFileName(response.headers.get("content-disposition"), fallbackName);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("PDF downloaded", { style: exportToastStyle });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export PDF failed", { style: exportToastStyle });
    } finally {
      toast.dismiss(loadingToastId);
    }
  };

  const handleExportHtmlDownload = async () => {
    const exportToastStyle = {
      background: "linear-gradient(to right, #ff6b35, #ff8a5c)",
      color: "white",
      border: "none",
      boxShadow: "0 10px 15px -3px rgba(255, 107, 53, 0.3)",
    };
    setIsExportMenuOpen(false);
    const token = localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Please sign in again before exporting", { style: exportToastStyle });
      return;
    }
    const normalizedSlides = slides
      .slice(0, 60)
      .map((slide, index) => ({
        id: Number(slide.id) || index + 1,
        title: String(slide.title || `Slide ${index + 1}`).trim().slice(0, 120),
        html: String(slide.html || ""),
      }))
      .filter((slide) => slide.html.trim().length > 0);
    if (normalizedSlides.length === 0) {
      toast.error("No generated slides to export", { style: exportToastStyle });
      return;
    }
    const loadingToastId = toast.loading("Generating offline HTML...", { style: exportToastStyle });
    try {
      const response = await fetch("/api/ppt/export-html", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: presentationTitle,
          slides: normalizedSlides,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(String(data?.error || "Failed to export HTML"));
      }
      const blob = await response.blob();
      const fallbackName = `${String(presentationTitle || "FacetDeck").trim() || "FacetDeck"}.html`;
      const fileName = parseDownloadFileName(response.headers.get("content-disposition"), fallbackName);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("Offline HTML downloaded", { style: exportToastStyle });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export HTML failed", { style: exportToastStyle });
    } finally {
      toast.dismiss(loadingToastId);
    }
  };

  const handleExportShareLink = async () => {
    const exportToastStyle = {
      background: "linear-gradient(to right, #ff6b35, #ff8a5c)",
      color: "white",
      border: "none",
      boxShadow: "0 10px 15px -3px rgba(255, 107, 53, 0.3)",
    };
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("Please sign in again before sharing");
      }
      let deckId = editingDeckId;
      if (!deckId) {
        const saved = await saveCurrentDeckToRepository();
        deckId = Number(editingDeckId || saved || 0);
      }
      if (!deckId) {
        throw new Error("Please save this presentation before sharing");
      }
      const response = await fetch(`/api/repository/decks/${deckId}/share-link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || "Failed to create share link"));
      }
      const shareUrl = String(data?.shareUrl || "").trim();
      if (!/^https?:\/\//i.test(shareUrl)) {
        throw new Error("Share URL is invalid");
      }
      let success = false;
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
        success = true;
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setIsExportMenuOpen(false);
      if (!success) {
        setManualShareLink(shareUrl);
        setShowManualCopyModal(true);
        return;
      }

      toast.success("Share link copied!", {
        description: "Anyone with this link can open full-screen playback.",
        style: exportToastStyle,
      });
    } catch (error) {
      setIsExportMenuOpen(false);
      setManualShareLink("");
      setShowManualCopyModal(false);
      toast.error(error instanceof Error ? error.message : "Failed to create share link", {
        style: exportToastStyle,
      });
    }
  };

  const materialsMissingDescription = wizardAssets.some((asset) => !asset.userDescription.trim());
  const canProceedFromMaterials = !materialsMissingDescription;
  const materialsNextDisabledReason = materialsMissingDescription ? "Please add a description for each image" : "";
  const currentSlideThemeColors = (() => {
    if (!activeSlideData) {
      return themeColors;
    }
    const slideOverride = paletteSlideOverrides[activeSlideData.id];
    if (Array.isArray(slideOverride) && slideOverride.length === 4) {
      return slideOverride;
    }
    const html = String(activeSlideData.html || "").trim();
    if (html) {
      return extractThemeColorsFromHtml(html);
    }
    return paletteGlobalOverride || themeColors;
  })();

  return (
    <div className="relative z-10 h-screen w-full overflow-hidden p-6 flex gap-6 pt-8">
      <Toaster position="top-center" expand={true} richColors />
      
      {/* Selector Overlay */}
      {centerViewMode === "slide" && (isSelectorMode || isPropertiesSelectorMode) && hoveredRect && (
        <div
          id="selector-overlay"
          className="fixed border-2 border-[#ff6b35] bg-[#ff6b35]/10 pointer-events-none z-[9999] transition-all duration-75"
          style={{
            top: hoveredRect.top - 4,
            left: hoveredRect.left - 4,
            width: hoveredRect.width + 8,
            height: hoveredRect.height + 8,
            borderRadius: '8px'
          }}
        />
      )}

      {/* Absolute Back Button instead of header */}
      <motion.button 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={handleBackToHome}
        className="absolute top-8 left-8 z-50 text-[#ff6b35] font-medium tracking-wide flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#ff6b35]" />
        Back to Home
      </motion.button>

      <EditorSlidesPanel
        slides={slides}
        activeSlide={activeSlide}
        setActiveSlide={setActiveSlide}
        editingSlideId={editingSlideId}
        setEditingSlideId={setEditingSlideId}
        editSlideType={editSlideType}
        setEditSlideType={setEditSlideType}
        editSlideTitle={editSlideTitle}
        setEditSlideTitle={setEditSlideTitle}
        onSaveSlideEdit={handleSaveSlideEdit}
        onAddSlide={handleAddSlide}
        onDeleteSlide={handleDeleteSlide}
        onReorderSlides={handleReorderSlides}
      />

      {/* CENTER COLUMN: Current Slide Display & Export */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="flex-1 min-w-0 h-full flex flex-col relative"
      >
        {/* Top Header & Export Area */}
        <EditorTopToolbar
          isEditingTitle={isEditingTitle}
          editTitle={editTitle}
          presentationTitle={presentationTitle}
          isExportMenuOpen={isExportMenuOpen}
          exportMenuRef={exportMenuRef}
          onEditTitleChange={setEditTitle}
          onEditTitleBlur={commitPresentationTitle}
          onEditTitleKeyDown={handlePresentationTitleKeyDown}
          onSaveTitle={commitPresentationTitle}
          onStartEditingTitle={() => {
            setEditTitle(presentationTitle);
            setIsEditingTitle(true);
          }}
          onToggleExportMenu={() => setIsExportMenuOpen(!isExportMenuOpen)}
          onExportPdf={handleExportPdfDownload}
          onExportPptx={() => handleExportDownload("PPTX")}
          onExportHtml={handleExportHtmlDownload}
          onExportShareLink={handleExportShareLink}
          saveStatusText={saveStatusUi.text}
          saveStatusTone={saveStatusUi.tone}
          centerViewMode={centerViewMode}
          onChangeCenterViewMode={setCenterViewMode}
        />

        {/* Slide Canvas Wrapper - Liquid Glass */}
        <div className="flex-1 w-full flex flex-col items-center p-8 pt-4 relative gap-6">
          {/* removed background div */}

          {centerViewMode === "slide" ? (
            <>
              <EditorCanvasViewport
                activeSlide={activeSlide}
                activeSlideData={activeSlideData}
                isSelectorMode={isSelectorMode}
                isPropertiesSelectorMode={isPropertiesSelectorMode}
                onTogglePresentation={togglePresentation}
                editorViewportRef={editorViewportRef}
                editorFrameWidth={editorFrameWidth}
                editorFrameHeight={editorFrameHeight}
                editorSlideScale={editorSlideScale}
                baseSlideWidth={BASE_SLIDE_WIDTH}
                baseSlideHeight={BASE_SLIDE_HEIGHT}
              />

              <EditorSlideResourcesBar
                canScrollElementsLeft={canScrollElementsLeft}
                canScrollElementsRight={canScrollElementsRight}
                onScrollElements={scrollElements}
                elementsScrollRef={elementsScrollRef}
                onElementsScroll={checkElementsScroll}
                themeColors={currentSlideThemeColors}
                onOpenThemeColor={(index = 0) => {
                  setThemePickerActiveIndex(Math.max(0, Math.min(3, index)));
                  setColorApplyScope("all");
                  setIsThemeColorPickerOpen(true);
                }}
                titleFont={typography.title}
                bodyFont={typography.body}
                onPickTypography={() => setIsTypographyPickerOpen(true)}
                elements={visibleResourceElements}
                fileInputRef={fileInputRef}
                onFileUpload={handleFileUpload}
                onAddElementClick={handleAddElementClick}
                onSelectElement={(element) => {
                  const kind = element.source === "asset" ? "resource" : "element";
                  const fallbackSlideId =
                    kind === "resource" && typeof element.slideId !== "number"
                      ? activeSlideData?.id
                      : undefined;
                  addSelectedTag({
                    name: element.source === "asset" ? `Resource: ${element.name}` : `Element: ${element.name}`,
                    kind,
                    slideId: typeof element.slideId === "number" ? element.slideId : fallbackSlideId,
                    elementId: element.id,
                  });
                }}
              />
            </>
          ) : (
            <div className="relative z-10 w-full max-w-5xl h-[70vh] min-h-[420px] max-h-[720px] rounded-3xl overflow-hidden border border-white/50 bg-white/10 backdrop-blur-xl shadow-xl flex flex-col group/code">
              <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-white/10 pointer-events-none" />
              <div className="relative z-10 flex-1 min-h-0 w-full flex">
                <textarea
                  value={activeSlideData?.html || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSlides(prev => prev.map(s => s.id === activeSlide ? { ...s, html: val } : s));
                    setHasPendingSave(true);
                  }}
                  onScroll={(e) => {
                    if (codePreRef.current) {
                      codePreRef.current.scrollTop = e.currentTarget.scrollTop;
                      codePreRef.current.scrollLeft = e.currentTarget.scrollLeft;
                    }
                  }}
                  spellCheck={false}
                  className="absolute inset-0 w-full h-full p-5 m-0 font-mono text-[13px] leading-relaxed whitespace-pre text-transparent bg-transparent caret-slate-800 outline-none resize-none border-none z-20 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/40 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/60 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] selection:bg-slate-400/30"
                />
                <pre
                  ref={codePreRef}
                  aria-hidden="true"
                  className="absolute inset-0 pt-5 pl-5 pb-24 pr-24 m-0 font-mono text-[13px] leading-relaxed whitespace-pre overflow-hidden z-10 pointer-events-none text-slate-500"
                >
                  {activeSlideCodeTokens.length > 0 ? (
                    activeSlideCodeTokens.map((token, index) => (
                      <span key={`${token.kind}-${index}`} className={CODE_TOKEN_CLASS_MAP[token.kind]}>
                        {token.text}
                      </span>
                    ))
                  ) : (
                    "No slide HTML available for this page yet."
                  )}
                  <br />
                </pre>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* RIGHT COLUMN: Tools & Conversation */}
      <div id="right-panel" className="w-[360px] shrink-0 h-full flex flex-col gap-4 pb-4">
        
        <EditorRightTabsBar
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          onScrollTabs={scrollTabs}
          scrollContainerRef={scrollContainerRef}
          onTabsScroll={checkScroll}
          activeRightTab={activeRightTab}
          onChangeTab={setActiveRightTab}
          pluginTabs={enabledPlugins.map((plugin) => ({
            id: plugin.id,
            label: plugin.name,
          }))}
        />

        {/* Right Panel Container (Liquid Glass) */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex-1 relative rounded-3xl overflow-hidden flex flex-col bg-white/10 backdrop-blur-xl border border-white/50"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-white/10 pointer-events-none" />
          
          <div className="relative flex-1 p-6 flex flex-col overflow-hidden">
            
            {/* --- AI Copilot Tab --- */}
            {activeRightTab === "copilot" && (
              <EditorCopilotPanel
                chatScrollRef={chatScrollRef}
                chatMessages={chatMessages}
                currentVersion={currentVersion}
                isSwitchingVersion={isSwitchingVersion || isRevertingVersion || isWaitingForAI || isGenerationPolling}
                isWaitingForAI={isWaitingForAI}
                chatError={chatError}
                chatInput={chatInput}
                isChatDisabled={isChatDisabled}
                selectedTags={selectedTags}
                isSelectorMode={isSelectorMode}
                onVersionSwitch={handleRevertToVersion}
                onRemoveTag={removeTag}
                onChatInputChange={setChatInput}
                onSendMessage={handleCopilotSendMessage}
                onToggleSelectorMode={toggleSelectorMode}
              />
            )}

            {/* --- Properties Tab (Manual Edit) --- */}
            {activeRightTab === "properties" && (
              <EditorPropertiesPanel
                isPropertiesSelectorMode={isPropertiesSelectorMode}
                selectedPropertyElement={selectedPropertyElement}
                transformMode={propertyTransformMode}
                transformValues={propertyTransformValues}
                contentValue={propertyContentValue}
                canEditContent={canEditPropertyContent}
                canUndoLocalEdit={localStructuredEditHistoryRef.current.length > 0}
                onTogglePropertiesSelectorMode={togglePropertiesSelectorMode}
                onClearSelectedProperty={() => setSelectedPropertyElement(null)}
                onTransformValueChange={(field, value) =>
                  setPropertyTransformValues((prev) => ({ ...prev, [field]: value }))
                }
                onContentValueChange={setPropertyContentValue}
                onApplyTransform={applyPropertyTransform}
                onApplyContent={applyPropertyContent}
                onUndoLocalEdit={undoLastLocalStructuredEdit}
              />
            )}

            {/* --- Plugin Tab --- */}
            {activePluginTab && (
              activePluginTab.requiresReauth ? (
                <div className="h-full w-full rounded-3xl border border-amber-200/70 bg-amber-50/70 p-6 flex flex-col gap-5">
                  <div>
                    <h3 className="text-xl font-extrabold text-amber-900">Re-authorization Required</h3>
                    <p className="mt-2 text-sm text-amber-800">
                      Plugin <span className="font-bold">"{activePluginTab.name}"</span> requested new permissions in an update.
                      Please complete re-authorization before using this tab.
                    </p>
                  </div>
                  {Array.isArray(activePluginTab.missingPermissions) && activePluginTab.missingPermissions.length > 0 && (
                    <div className="rounded-2xl border border-amber-300/60 bg-white/80 px-4 py-3 text-sm text-amber-900">
                      <p className="font-bold mb-2">Missing permissions</p>
                      <p>{activePluginTab.missingPermissions.join(", ")}</p>
                    </div>
                  )}
                  {COMMUNITY_FEATURE_ENABLED ? (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => navigate("/community", { state: { tab: "plugins" } })}
                        className="px-5 py-2.5 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors"
                      >
                        Go to Community Re-authorize
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-800">
                      Community re-authorization is disabled in OSS mode. Reinstall the plugin locally with updated permissions.
                    </p>
                  )}
                </div>
              ) : (
                <EditorPluginPlaceholder
                  activePlugin={activePluginTab}
                  currentPageHtml={String(activeSlideData?.html || "")}
                  activeSlideId={activeSlideData?.id}
                  conversationHistory={chatMessages.map((message) => ({
                    id: String(message.id || ""),
                    role: message.isUser ? "user" : "assistant",
                    text: String(message.text || ""),
                    createdAt: Date.now(),
                  }))}
                  selection={selectedTags.map((tag) => ({
                    name: String(tag.name || ""),
                    kind: String(tag.kind || ""),
                    slideId: Number(tag.slideId) || undefined,
                  }))}
                  selectedPropertyElement={selectedPropertyElement
                    ? {
                        name: String(selectedPropertyElement.name || ""),
                        domPath: String(selectedPropertyElement.domPath || ""),
                        tagName: String(selectedPropertyElement.tagName || ""),
                        textContent: String(selectedPropertyElement.textContent || ""),
                        slideId: Number(activeSlideData?.id) || undefined,
                        x: Number(selectedPropertyElement.x) || 0,
                        y: Number(selectedPropertyElement.y) || 0,
                        width: Number(selectedPropertyElement.width) || 0,
                        height: Number(selectedPropertyElement.height) || 0,
                      }
                    : null}
                  onPatchSlideHtml={patchSlideHtmlFromPlugin}
                  onUpdateElementByDomPath={updateElementByDomPathFromPlugin}
                  onEnterPickMode={() => {
                    if (!isPropertiesSelectorMode) {
                      togglePropertiesSelectorMode();
                    }
                  }}
                  onExitPickMode={() => {
                    if (isPropertiesSelectorMode) {
                      togglePropertiesSelectorMode();
                    }
                  }}
                  isPickModeActive={isPropertiesSelectorMode}
                  onUndo={undoLastLocalStructuredEdit}
                  onRedo={redoLastLocalStructuredEdit}
                  canRedo={localStructuredRedoHistoryRef.current.length > 0}
                  createTransactionSnapshot={createPluginTransactionSnapshot}
                  restoreTransactionSnapshot={restorePluginTransactionSnapshot}
                  onListResources={listResourceElementsFromPlugin}
                  onCreateResource={createResourceElementFromPlugin}
                  onUpdateResource={updateResourceElementFromPlugin}
                  onDeleteResource={deleteResourceElementFromPlugin}
                  onUploadResourceDataUrl={uploadResourceDataUrlFromPlugin}
                  onUploadResourceRemoteUrl={uploadResourceRemoteUrlFromPlugin}
                  onAddImageToSlide={addImageToSlideFromPlugin}
                />
              )
            )}

          </div>
        </motion.div>
      </div>

      <EditorPresentationOverlay
        isPresenting={isPresenting}
        showPlayHint={showPlayHint}
        activeSlide={activeSlide}
        activeSlideData={activeSlideData}
        presentationViewportRef={presentationViewportRef}
        presentationIframeRef={presentationIframeRef}
        presentationFrameWidth={presentationFrameWidth}
        presentationFrameHeight={presentationFrameHeight}
        presentationSlideScale={presentationSlideScale}
        baseSlideWidth={BASE_SLIDE_WIDTH}
        baseSlideHeight={BASE_SLIDE_HEIGHT}
      />

      {/* Manual Copy Link Modal */}
      <AnimatePresence>
        {showManualCopyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShowManualCopyModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 border border-white/60"
            >
              <h3 className="text-xl font-bold text-slate-800 mb-2">Copy Share Link</h3>
              <p className="text-sm text-slate-500 mb-6">
                Your browser prevented us from copying the link automatically. Please copy it manually below.
              </p>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={manualShareLink || window.location.href}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#ff6b35]/50 focus:bg-white transition-colors"
                  onClick={(e) => {
                    (e.target as HTMLInputElement).select();
                    try { document.execCommand('copy'); } catch(e) {}
                  }}
                />
                <button 
                  onClick={() => setShowManualCopyModal(false)}
                  className="px-6 py-3 bg-[#ff6b35] hover:bg-[#ff8a5c] text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Color Picker Modal */}
      <AnimatePresence>
        {isThemeColorPickerOpen && (
          <ColorPicker
            colors={colorApplyScope === "all"
              ? getCurrentGlobalPalette()
              : (activeSlideData ? (paletteSlideOverrides[activeSlideData.id] || themeColors) : themeColors)}
            onChange={(nextColors) => {
              handleThemeColorsChange(nextColors, colorApplyScope);
            }}
            applyScope={colorApplyScope}
            onChangeApplyScope={setColorApplyScope}
            onResetSlideToAll={handleResetSlideThemeToGlobal}
            onClose={() => setIsThemeColorPickerOpen(false)}
            title="Theme Color"
            initialActiveColorIndex={themePickerActiveIndex}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTypographyPickerOpen && (
          <TypographyPicker
            titleFont={typography.title}
            bodyFont={typography.body}
            onChange={(next) => handleTypographyChange(next, typographyApplyScope)}
            applyScope={typographyApplyScope}
            onChangeApplyScope={setTypographyApplyScope}
            onResetSlideToAll={handleResetSlideTypographyToGlobal}
            onClose={() => setIsTypographyPickerOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Custom Template Color Picker Modal */}
      <AnimatePresence>
        {activeCustomColorKey !== null && (
          <ColorPicker
            colors={[
              newPresetDraft.colors.primary,
              newPresetDraft.colors.secondary,
              newPresetDraft.colors.bg,
              newPresetDraft.colors.text,
            ]}
            initialActiveColorIndex={
              activeCustomColorKey === "primary"
                ? 0
                : activeCustomColorKey === "secondary"
                ? 1
                : activeCustomColorKey === "bg"
                ? 2
                : 3
            }
            onChange={(nextColors) => {
              setNewPresetDraft((prev) => ({
                ...prev,
                colors: {
                  primary: nextColors[0] || prev.colors.primary,
                  secondary: nextColors[1] || prev.colors.secondary,
                  bg: nextColors[2] || prev.colors.bg,
                  text: nextColors[3] || prev.colors.text,
                },
              }));
            }}
            onClose={() => setActiveCustomColorKey(null)}
            title="Preset Theme Colors"
          />
        )}
      </AnimatePresence>

      <EditorWizardModal
        wizardOpen={wizardOpen}
        wizardStep={wizardStep}
        stylePathMode={stylePathMode}
        isMixMode={isMixMode}
        wizardData={wizardData}
        wizardAssets={wizardAssets}
        canProceedFromMaterials={canProceedFromMaterials}
        materialsNextDisabledReason={materialsNextDisabledReason}
        outlineDraft={outlineDraft}
        outlineInstruction={outlineInstruction}
        isGeneratingOutline={isGeneratingOutline}
        isRevisingOutline={isRevisingOutline}
        isGeneratingOutlineImages={isGeneratingOutlineImages}
        canProceedFromOutline={canProceedFromOutline}
        outlineHasPendingImages={hasPendingOutlineImages(outlineDraft)}
        stylePreviews={stylePreviews}
        isGeneratingPreviews={isGeneratingPreviews}
        userPresets={userPresets}
        builtinPresets={builtinPresets}
        isLoadingPresets={isLoadingPresets}
        isCreatePresetOpen={isCreatePresetOpen}
        isSavingPreset={isSavingPreset}
        newPresetDraft={newPresetDraft}
        mixSelection={mixSelection}
        setWizardOpen={setWizardOpen}
        setWizardStep={setWizardStep}
        setStylePathMode={setStylePathMode}
        setWizardData={setWizardData}
        setWizardAssets={setWizardAssets}
        setOutlineDraft={setOutlineDraft}
        setOutlineInstruction={setOutlineInstruction}
        setIsCreatePresetOpen={setIsCreatePresetOpen}
        setNewPresetDraft={setNewPresetDraft}
        setActiveCustomColorKey={setActiveCustomColorKey}
        setIsMixMode={setIsMixMode}
        setMixSelection={setMixSelection}
        handleWizardNext={handleWizardNext}
        handleWizardBack={handleWizardBack}
        handleAddWizardAssets={handleAddWizardAssets}
        handleGenerateOutline={handleGenerateOutline}
        handleOutlineSlideChange={handleOutlineSlideChange}
        handleReviseOutline={handleReviseOutline}
        handleGenerateOutlineAiImage={handleGenerateOutlineAiImage}
        handleGenerateAllOutlineAiImages={handleGenerateAllOutlineAiImages}
        handleContinueWithoutAiImage={handleContinueWithoutAiImage}
        handleGeneratePreviews={handleGeneratePreviews}
        handleCreatePreset={handleCreatePreset}
        handleDeletePreset={handleDeletePreset}
        handleStartFromPreset={handleStartFromPreset}
        handleStartFromMix={handleStartFromMix}
        openStylePreviewPage={openStylePreviewPage}
        handleStartGeneration={handleStartGeneration}
        onClose={() => navigate("/home")}
      />
    </div>
  );
}