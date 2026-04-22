import { useState } from "react";
import type {
  EditorBuiltinPreset,
  EditorCustomPreset,
  EditorMixSelection,
  EditorNewPresetDraft,
  EditorStylePathMode,
  EditorStylePreview,
  EditorWizardData,
  EditorWizardStep,
} from "../types/editor";

export function useEditorWizardState() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<EditorWizardStep>(1);
  const [stylePathMode, setStylePathMode] = useState<EditorStylePathMode>("options");
  const [wizardData, setWizardData] = useState<EditorWizardData>({
    idea: "",
    purpose: "Pitch Deck",
    length: "Short (5-10)",
    vibe: "Professional",
    slideLanguage: "English",
    llmLanguage: "English",
  });
  const [stylePreviews, setStylePreviews] = useState<EditorStylePreview[]>([]);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [userPresets, setUserPresets] = useState<EditorCustomPreset[]>([]);
  const [builtinPresets, setBuiltinPresets] = useState<EditorBuiltinPreset[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [isCreatePresetOpen, setIsCreatePresetOpen] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetDraft, setNewPresetDraft] = useState<EditorNewPresetDraft>({
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
  const [activeCustomColorKey, setActiveCustomColorKey] = useState<string | null>(null);
  const [isMixMode, setIsMixMode] = useState(false);
  const [mixSelection, setMixSelection] = useState<EditorMixSelection>({
    baseStyleId: "",
    descriptionFromId: "",
    colorsFromId: "",
    typographyFromId: "",
    vibeFromId: "",
    layoutFromId: "",
    signatureElementsFromId: "",
    animationFromId: "",
    motionFromId: "",
  });

  return {
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
  };
}
