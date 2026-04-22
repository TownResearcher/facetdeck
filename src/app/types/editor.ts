export type EditorSlide = {
  id: number;
  title: string;
  type: string;
  html: string;
};

export type EditorElement = {
  id: string;
  name: string;
  type: string;
  source?: "slide" | "asset";
  slideId?: number;
  dataUrl?: string;
  url?: string;
  code?: string;
};

export type EditorStylePreview = {
  id: string;
  name: string;
  description: string;
  vibe?: string;
  layout?: string;
  signatureElements?: string;
  animation?: string;
  colors: {
    primary: string;
    secondary: string;
    bg: string;
    text: string;
  };
  fonts: {
    title: string;
    body: string;
  };
  previewHtml: string;
  mixSpec?: {
    mode: "mix";
    baseStyleId: string;
    descriptionFromId: string;
    colorsFromId: string;
    typographyFromId: string;
    vibeFromId: string;
    layoutFromId: string;
    signatureElementsFromId: string;
    animationFromId: string;
    motionFromId: string;
  };
};

export type EditorCustomPreset = {
  id: string;
  name: string;
  description: string;
  vibe?: string;
  layout?: string;
  signatureElements?: string;
  animation?: string;
  colors: {
    primary: string;
    secondary: string;
    bg: string;
    text: string;
  };
  fonts: {
    title: string;
    body: string;
  };
  visibility?: "private";
};

export type EditorPresetStylePayload = {
  description?: string;
  vibe?: string;
  layout?: string;
  signatureElements?: string;
  animation?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    bg?: string;
    text?: string;
  };
  fonts?: {
    title?: string;
    body?: string;
  };
};

export type EditorBuiltinPreset = {
  id: string;
  name: string;
  description: string;
  vibe?: string;
  layout?: string;
  signatureElements?: string;
  animation?: string;
  colors: {
    primary: string;
    secondary: string;
    bg: string;
    text: string;
  };
  fonts: {
    title: string;
    body: string;
  };
  visibility?: "builtin";
};

export type EditorStyleSelectionPayload =
  | { mode: "single"; baseStyleId: string }
  | {
      mode: "preset";
      presetName: string;
      payload?: EditorPresetStylePayload;
    }
  | {
      mode: "mix";
      baseStyleId: string;
      descriptionFromId: string;
      colorsFromId: string;
      typographyFromId: string;
      vibeFromId: string;
      layoutFromId: string;
      signatureElementsFromId: string;
      animationFromId: string;
      motionFromId: string;
    };

export type EditorMixSelection = {
  baseStyleId: string;
  descriptionFromId: string;
  colorsFromId: string;
  typographyFromId: string;
  vibeFromId: string;
  layoutFromId: string;
  signatureElementsFromId: string;
  animationFromId: string;
  motionFromId: string;
};

export type EditorStylePathMode = "options" | "preset";

export type EditorWizardStep = 1 | 2 | 3 | 4 | 5;

export type EditorNewPresetDraft = {
  name: string;
  description: string;
  vibe: string;
  layout: string;
  signatureElements: string;
  animation: string;
  titleFont: string;
  bodyFont: string;
  colors: {
    primary: string;
    secondary: string;
    bg: string;
    text: string;
  };
};

export type EditorWizardData = {
  idea: string;
  purpose: string;
  length: string;
  vibe: string;
  slideLanguage: string;
  llmLanguage: string;
};

export type EditorWizardAsset = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageAspectRatio?: number;
  imageOrientation?: "landscape" | "portrait" | "square";
  url?: string;
  userDescription: string;
  adopt: boolean;
  reason: string;
  forcedAdopt: boolean;
  suggestedUsage: string[];
};

export type EditorOutlineSlide = {
  id: string;
  type: "cover" | "agenda" | "content" | "data" | "summary";
  title: string;
  bullets: string[];
  speakerNotes: string;
  slideVisualDirection: string;
  imageAssetIds: string[];
  aiImageExpanded?: boolean;
  aiImageNeeded?: boolean;
  aiImagePrompts?: Array<{
    id: string;
    prompt: string;
    status?: "idle" | "generating" | "done" | "failed";
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    imageAspectRatio?: number;
    imageOrientation?: "landscape" | "portrait" | "square";
    error?: string;
  }>;
};

export type EditorOutlineDraft = {
  title: string;
  slides: EditorOutlineSlide[];
};

export type EditorSlideTypeKey = "cover" | "agenda" | "content" | "data" | "summary";

export type EditorChatMessage = {
  id: string;
  text?: string;
  isUser: boolean;
  isVersionCard?: boolean;
  version?: number;
  versionTitle?: string;
};

export type EditorGeneratedSlide = {
  id: string | number;
  title?: string;
  type?: string;
  html?: string;
};

export type EditorVersionSnapshot = {
  version: number;
  versionTitle?: string;
  savedAt: number;
  slides: EditorGeneratedSlide[];
};

export type EditorGeneratedPresentation = {
  title?: unknown;
  slides?: EditorGeneratedSlide[];
  chatHistory?: EditorChatMessage[];
  elements?: EditorElement[];
  versionSnapshots?: EditorVersionSnapshot[];
  slideLanguage?: unknown;
  llmLanguage?: unknown;
};
