import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, ExternalLink, ImagePlus, Loader2, Pencil, Plus, RotateCcw, Trash2, Type, Wand2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SettingSwitch } from "../ui/setting-switch";
import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  EditorBuiltinPreset,
  EditorCustomPreset,
  EditorOutlineDraft,
  EditorOutlineSlide,
  EditorMixSelection,
  EditorNewPresetDraft,
  EditorStylePathMode,
  EditorStylePreview,
  EditorStyleSelectionPayload,
  EditorWizardAsset,
  EditorWizardData,
  EditorWizardStep,
} from "../../types/editor";

type EditorWizardModalProps = {
  wizardOpen: boolean;
  wizardStep: EditorWizardStep;
  stylePathMode: EditorStylePathMode;
  isMixMode: boolean;
  wizardData: EditorWizardData;
  wizardAssets: EditorWizardAsset[];
  canProceedFromMaterials: boolean;
  materialsNextDisabledReason: string;
  outlineDraft: EditorOutlineDraft | null;
  outlineInstruction: string;
  isGeneratingOutline: boolean;
  isRevisingOutline: boolean;
  isGeneratingOutlineImages: boolean;
  canProceedFromOutline: boolean;
  outlineHasPendingImages: boolean;
  stylePreviews: EditorStylePreview[];
  isGeneratingPreviews: boolean;
  userPresets: EditorCustomPreset[];
  builtinPresets: EditorBuiltinPreset[];
  isLoadingPresets: boolean;
  isCreatePresetOpen: boolean;
  isSavingPreset: boolean;
  newPresetDraft: EditorNewPresetDraft;
  mixSelection: EditorMixSelection;
  setWizardOpen: Dispatch<SetStateAction<boolean>>;
  setWizardStep: Dispatch<SetStateAction<EditorWizardStep>>;
  setStylePathMode: Dispatch<SetStateAction<EditorStylePathMode>>;
  setWizardData: Dispatch<SetStateAction<EditorWizardData>>;
  setWizardAssets: Dispatch<SetStateAction<EditorWizardAsset[]>>;
  setOutlineDraft: Dispatch<SetStateAction<EditorOutlineDraft | null>>;
  setOutlineInstruction: Dispatch<SetStateAction<string>>;
  setIsCreatePresetOpen: Dispatch<SetStateAction<boolean>>;
  setNewPresetDraft: Dispatch<SetStateAction<EditorNewPresetDraft>>;
  setActiveCustomColorKey: Dispatch<SetStateAction<string | null>>;
  setIsMixMode: Dispatch<SetStateAction<boolean>>;
  setMixSelection: Dispatch<SetStateAction<EditorMixSelection>>;
  handleWizardBack: () => void;
  handleWizardNext: () => void;
  handleAddWizardAssets: (files: FileList | null) => Promise<void>;
  handleGenerateOutline: () => Promise<void>;
  handleOutlineSlideChange: (slideId: string, updates: Partial<EditorOutlineSlide>) => void;
  handleReviseOutline: () => Promise<void>;
  handleGenerateOutlineAiImage: (slideId: string, promptId: string) => Promise<void>;
  handleGenerateAllOutlineAiImages: () => Promise<void>;
  handleContinueWithoutAiImage: () => void;
  handleGeneratePreviews: () => void;
  handleCreatePreset: () => void;
  handleDeletePreset: (presetId: string) => void;
  handleStartFromPreset: (presetName: string, presetPayload?: Partial<EditorCustomPreset | EditorBuiltinPreset>) => void;
  handleStartFromMix: () => void;
  openStylePreviewPage: (style: EditorStylePreview) => void;
  handleStartGeneration: (style: EditorStylePreview, styleSelection?: EditorStyleSelectionPayload) => void;
  onClose: () => void;
};

export function EditorWizardModal({
  wizardOpen,
  wizardStep,
  stylePathMode,
  isMixMode,
  wizardData,
  wizardAssets,
  canProceedFromMaterials,
  materialsNextDisabledReason,
  outlineDraft,
  outlineInstruction,
  isGeneratingOutline,
  isRevisingOutline,
  isGeneratingOutlineImages,
  canProceedFromOutline,
  outlineHasPendingImages,
  stylePreviews,
  isGeneratingPreviews,
  userPresets,
  builtinPresets,
  isLoadingPresets,
  isCreatePresetOpen,
  isSavingPreset,
  newPresetDraft,
  mixSelection,
  setWizardOpen,
  setWizardStep,
  setStylePathMode,
  setWizardData,
  setWizardAssets,
  setOutlineDraft,
  setOutlineInstruction,
  setIsCreatePresetOpen,
  setNewPresetDraft,
  setActiveCustomColorKey,
  setIsMixMode,
  setMixSelection,
  handleWizardBack,
  handleWizardNext,
  handleAddWizardAssets,
  handleGenerateOutline,
  handleOutlineSlideChange,
  handleReviseOutline,
  handleGenerateOutlineAiImage,
  handleGenerateAllOutlineAiImages,
  handleContinueWithoutAiImage,
  handleGeneratePreviews,
  handleCreatePreset,
  handleDeletePreset,
  handleStartFromPreset,
  handleStartFromMix,
  openStylePreviewPage,
  handleStartGeneration,
  onClose,
}: EditorWizardModalProps) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [allowDuplicateBySlide, setAllowDuplicateBySlide] = useState<Record<string, boolean>>({});
  const purposeOptions = ["Pitch Deck", "Tutorial", "Report", "Conference"];
  const lengthOptions = ["Short (5-10)", "Medium (10-20)", "Long (20+)"];
  const vibeOptions = ["Professional", "Creative", "Minimal", "Energetic"];
  const languageOptions = [
    "English",
    "简体中文",
    "繁體中文",
    "日本語",
    "한국어",
    "Deutsch",
    "Français",
    "Español",
    "Português",
    "Italiano",
    "Nederlands",
    "Русский",
    "العربية",
    "हिन्दी",
    "Türkçe",
    "ไทย",
    "Tiếng Việt",
    "Bahasa Indonesia",
    "Polski",
    "Українська",
  ];
  const isCustomPurpose = Boolean(wizardData.purpose) && !purposeOptions.includes(wizardData.purpose);
  const isCustomLength = Boolean(wizardData.length) && !lengthOptions.includes(wizardData.length);
  const isCustomVibe = Boolean(wizardData.vibe) && !vibeOptions.includes(wizardData.vibe);
  const titleByStep: Record<number, string> = {
    1: "Presentation Setup",
    2: "Materials",
    3: "Outline",
    4: "Design System",
    5: stylePathMode === "preset" ? "Choose a Preset" : isMixMode ? "Mix Elements" : "Choose a Style",
  };
  const canGoNext = wizardStep < 5;
  const nextLabelByStep: Record<number, string> = {
    1: "Next: Materials",
    2: "Next: Outline",
    3: outlineHasPendingImages ? "Generate Images" : "Next: Design System",
    4: stylePathMode === "preset" ? "Next: Choose Preset" : "Next: Choose Style",
  };

  const updateAsset = (assetId: string, updater: (asset: EditorWizardAsset) => EditorWizardAsset) => {
    setWizardAssets((prev) => prev.map((asset) => (asset.id === assetId ? updater(asset) : asset)));
  };

  const removeAsset = (assetId: string) => {
    setWizardAssets((prev) => prev.filter((asset) => asset.id !== assetId));
    setOutlineDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        slides: prev.slides.map((slide) => ({
          ...slide,
          imageAssetIds: slide.imageAssetIds.filter((id) => id !== assetId),
        })),
      };
    });
  };

  const buildBlankOutlineSlide = (seed: number): EditorOutlineSlide => ({
    id: `slide-${Date.now()}-${seed}`,
    type: "content",
    title: "",
    bullets: [],
    speakerNotes: "",
    slideVisualDirection: "",
    imageAssetIds: [],
    aiImageExpanded: false,
    aiImageNeeded: false,
    aiImagePrompts: [],
  });

  const deleteOutlineSlide = (slideId: string) => {
    setOutlineDraft((prev) => {
      if (!prev) return prev;
      const filtered = prev.slides.filter((slide) => slide.id !== slideId);
      return {
        ...prev,
        slides: filtered.length > 0 ? filtered : [buildBlankOutlineSlide(1)],
      };
    });
  };

  const insertBlankSlideBelow = (slideId: string) => {
    setOutlineDraft((prev) => {
      if (!prev) return prev;
      const idx = prev.slides.findIndex((slide) => slide.id === slideId);
      if (idx < 0) return prev;
      const nextSlides = [...prev.slides];
      nextSlides.splice(idx + 1, 0, buildBlankOutlineSlide(idx + 2));
      return {
        ...prev,
        slides: nextSlides,
      };
    });
  };

  const renderStyleSelection = () => (
                <div className="space-y-6">
                  {isGeneratingPreviews ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                      <p className="text-slate-500">Designing style preview...</p>
                    </div>
                  ) : stylePathMode === "preset" && stylePreviews.length === 0 ? (
                    <>
                      <p className="text-sm text-slate-500">Direct preset path: choose built-in or your private preset, or create a new one.</p>
                      {isLoadingPresets ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                        </div>
                      ) : (
                        <>
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-slate-800">My Private Presets</p>
                              <button
                                onClick={() => setIsCreatePresetOpen((prev) => !prev)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" /> {isCreatePresetOpen ? "Close" : "Add Preset"}
                              </button>
                            </div>

                            {isCreatePresetOpen && (
                              <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <input value={newPresetDraft.name} onChange={(e) => setNewPresetDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Preset name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                  <input value={newPresetDraft.description} onChange={(e) => setNewPresetDraft((prev) => ({ ...prev, description: e.target.value }))} placeholder="Preset description" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <input value={newPresetDraft.vibe} onChange={(e) => setNewPresetDraft((prev) => ({ ...prev, vibe: e.target.value }))} placeholder="Vibe (e.g. Confident, bold, modern)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                  <input value={newPresetDraft.layout} onChange={(e) => setNewPresetDraft((prev) => ({ ...prev, layout: e.target.value }))} placeholder="Layout (e.g. Split panel, centered)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <input value={newPresetDraft.signatureElements} onChange={(e) => setNewPresetDraft((prev) => ({ ...prev, signatureElements: e.target.value }))} placeholder="Signature Elements (e.g. Neon glow, grid)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                  <input value={newPresetDraft.animation} onChange={(e) => setNewPresetDraft((prev) => ({ ...prev, animation: e.target.value }))} placeholder="Animation (e.g. Slow fade-ins, bouncy)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <input value={newPresetDraft.titleFont} onChange={(e) => setNewPresetDraft((prev) => ({ ...prev, titleFont: e.target.value }))} placeholder="Title font" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                  <input value={newPresetDraft.bodyFont} onChange={(e) => setNewPresetDraft((prev) => ({ ...prev, bodyFont: e.target.value }))} placeholder="Body font" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {[
                                    { key: "primary", label: "Primary" },
                                    { key: "secondary", label: "Secondary" },
                                    { key: "bg", label: "Background" },
                                    { key: "text", label: "Text" },
                                  ].map((item) => (
                                    <label key={item.key} className="flex items-center gap-2 text-xs text-slate-600">
                                      <div
                                        onClick={() => setActiveCustomColorKey(item.key)}
                                        className="h-8 w-8 rounded cursor-pointer shadow-sm border border-slate-200/60"
                                        style={{ backgroundColor: newPresetDraft.colors[item.key as keyof typeof newPresetDraft.colors] }}
                                      />
                                      <span>{item.label}</span>
                                    </label>
                                  ))}
                                </div>
                                <div className="flex justify-end">
                                  <button onClick={handleCreatePreset} disabled={isSavingPreset} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors">
                                    {isSavingPreset ? "Saving..." : "Save Private Preset"}
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                              {userPresets.length === 0 ? (
                                <p className="text-xs text-slate-500">No private presets yet.</p>
                              ) : (
                                userPresets.map((preset) => (
                                  <div key={preset.id} className="rounded-xl border border-slate-200 p-3 flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">{preset.name}</p>
                                      <p className="text-xs text-slate-500 line-clamp-1">{preset.description || "Private preset"}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => handleDeletePreset(preset.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete preset">
                                        <X className="w-4 h-4" />
                                      </button>
                                      <button onClick={() => handleStartFromPreset(preset.name, preset)} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors">
                                        Preview
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-sm font-semibold text-slate-800 mb-3">Built-in Presets</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {builtinPresets.map((preset) => (
                                <div key={preset.id || preset.name} className="rounded-xl border border-slate-200 p-3 flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-800">{preset.name}</p>
                                    <p className="text-xs text-slate-500 mt-1">Built-in preset</p>
                                  </div>
                                  <button onClick={() => handleStartFromPreset(preset.name, preset)} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors">
                                    Preview
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-500">Pick one style directly, or use Mix elements to combine sources.</p>
                        <button onClick={() => setIsMixMode((prev) => !prev)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors">
                          {isMixMode ? "Back to Single Select" : "Mix elements"}
                        </button>
                      </div>
                      {isMixMode ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                          <p className="text-sm font-semibold text-slate-800">Mix sources</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                              { key: "baseStyleId", label: "Base Style" },
                              { key: "descriptionFromId", label: "Description From" },
                              { key: "colorsFromId", label: "Colors From" },
                              { key: "typographyFromId", label: "Typography From" },
                              { key: "vibeFromId", label: "Vibe From" },
                              { key: "layoutFromId", label: "Layout From" },
                              { key: "signatureElementsFromId", label: "Signature Elements From" },
                              { key: "animationFromId", label: "Animation From" },
                              { key: "motionFromId", label: "Motion From" },
                            ].map((field) => (
                              <div key={field.key}>
                                <label className="block text-xs text-slate-500 mb-1.5">{field.label}</label>
                                <Select value={mixSelection[field.key as keyof typeof mixSelection]} onValueChange={(value) => setMixSelection((prev) => ({ ...prev, [field.key]: value }))}>
                                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white text-sm text-slate-700 h-10">
                                    <SelectValue placeholder="Choose style source" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {stylePreviews.map((style) => (
                                      <SelectItem key={style.id} value={style.id}>
                                        {style.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                          <button onClick={handleStartFromMix} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors">
                            Preview Mixed Style
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {stylePreviews.map((style, i) => (
                            <motion.div
                              initial={{ opacity: 0, y: 30 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.15, type: "spring", stiffness: 200, damping: 20 }}
                              key={style.id || i}
                              className="group relative bg-white border border-slate-200/60 rounded-[24px] overflow-hidden hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-500 cursor-pointer flex flex-col"
                              onClick={() => openStylePreviewPage(style)}
                            >
                              <div className="relative aspect-video overflow-hidden bg-white">
                                <iframe
                                  title={`${style.name} mini preview`}
                                  srcDoc={style.previewHtml}
                                  className="border-0 origin-top-left pointer-events-none"
                      style={{ width: "400%", height: "400%", transform: "scale(0.25)" }}
                                  sandbox="allow-scripts"
                                />
                              </div>

                              <div className="relative z-20 bg-white px-5 pb-5 pt-4">
                                <div className="pointer-events-none absolute -top-8 left-0 right-0 h-8 bg-gradient-to-b from-white/0 to-white" />
                                <h3 className="text-base font-bold text-slate-800 mb-1.5 group-hover:text-orange-500 transition-colors duration-300">{style.name}</h3>
                                <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">{style.description}</p>
                                <div className="flex items-center justify-between">
                                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[11px] font-medium flex items-center gap-1.5">
                                    <Type className="w-3 h-3" /> {style.fonts.title}
                                  </span>
                                  <div className="flex gap-1.5">
                                    {[style.colors.primary, style.colors.secondary, style.colors.bg].map((c, idx) => (
                                      <div key={idx} className="w-4 h-4 rounded-full border border-slate-200 shadow-sm" style={{ backgroundColor: c }} title={c} />
                                    ))}
                                  </div>
                                </div>
                                <div className="mt-4 flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openStylePreviewPage(style);
                                    }}
                                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" /> Detail
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (style.id === "preset-preview") {
                                        handleStartGeneration(style, {
                                          mode: "preset",
                                          presetName: style.name,
                                          payload: {
                                            description: style.description,
                                            vibe: style.vibe,
                                            layout: style.layout,
                                            signatureElements: style.signatureElements,
                                            animation: style.animation,
                                            colors: style.colors,
                                            fonts: style.fonts,
                                          },
                                        });
                                      } else if (style.id === "mix-preview") {
                                        handleStartGeneration(style, {
                                          mode: "mix",
                                          baseStyleId: mixSelection.baseStyleId,
                                          descriptionFromId: mixSelection.descriptionFromId,
                                          colorsFromId: mixSelection.colorsFromId,
                                          typographyFromId: mixSelection.typographyFromId,
                                          vibeFromId: mixSelection.vibeFromId,
                                          layoutFromId: mixSelection.layoutFromId,
                                          signatureElementsFromId: mixSelection.signatureElementsFromId,
                                          animationFromId: mixSelection.animationFromId,
                                          motionFromId: mixSelection.motionFromId,
                                        });
                                      } else {
                                        handleStartGeneration(style, { mode: "single", baseStyleId: style.id });
                                      }
                                    }}
                                    className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                                  >
                                    <Wand2 className="w-3.5 h-3.5" /> Generate
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-center pt-8 gap-4">
                        {stylePreviews.length > 1 && (
                          <button onClick={handleGeneratePreviews} className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors flex items-center gap-2">
                            <RotateCcw className="w-4 h-4" /> Regenerate Options
                          </button>
                        )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <AnimatePresence>
      {wizardOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white/90 backdrop-blur-2xl border border-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-200/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-orange-500" />
                {titleByStep[wizardStep]}
                <span className="ml-1 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  Step {wizardStep}/5
                </span>
              </h2>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-4 md:p-6 flex-1 min-h-0 overflow-y-auto">
              {wizardStep === 1 ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Your Idea</label>
                    <textarea
                      value={wizardData.idea}
                      onChange={(e) => setWizardData({ ...wizardData, idea: e.target.value })}
                      className="w-full p-3 rounded-2xl bg-white border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all resize-none h-20"
                      placeholder="What is your presentation about?"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Purpose</label>
                      <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
                        {purposeOptions.map((p) => (
                          <button key={p} onClick={() => setWizardData({ ...wizardData, purpose: p })} className={`p-2 rounded-xl text-center md:text-left text-sm transition-all ${wizardData.purpose === p ? "bg-orange-100 text-orange-700 border-orange-500 border-2" : "bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100"}`}>
                            {p}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            setWizardData((prev) => ({
                              ...prev,
                              purpose: purposeOptions.includes(prev.purpose) ? "" : prev.purpose,
                            }))
                          }
                          className={`p-2 rounded-xl text-center md:text-left text-sm transition-all ${isCustomPurpose || wizardData.purpose === "" ? "bg-orange-100 text-orange-700 border-orange-500 border-2" : "bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100"}`}
                        >
                          Custom
                        </button>
                      </div>
                      {(isCustomPurpose || wizardData.purpose === "") ? (
                        <input
                          value={wizardData.purpose}
                          onChange={(e) => setWizardData({ ...wizardData, purpose: e.target.value })}
                          placeholder="Enter custom purpose"
                          className="mt-2 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm"
                        />
                      ) : null}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Length</label>
                      <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
                        {lengthOptions.map((l) => (
                          <button key={l} onClick={() => setWizardData({ ...wizardData, length: l })} className={`p-2 rounded-xl text-center md:text-left text-sm transition-all ${wizardData.length === l ? "bg-orange-100 text-orange-700 border-orange-500 border-2" : "bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100"}`}>
                            {l}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            setWizardData((prev) => ({
                              ...prev,
                              length: lengthOptions.includes(prev.length) ? "" : prev.length,
                            }))
                          }
                          className={`p-2 rounded-xl text-center md:text-left text-sm transition-all ${isCustomLength || wizardData.length === "" ? "bg-orange-100 text-orange-700 border-orange-500 border-2" : "bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100"}`}
                        >
                          Custom
                        </button>
                      </div>
                      {(isCustomLength || wizardData.length === "") ? (
                        <input
                          value={wizardData.length}
                          onChange={(e) => setWizardData({ ...wizardData, length: e.target.value })}
                          placeholder="Enter custom length"
                          className="mt-2 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm"
                        />
                      ) : null}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Vibe</label>
                      <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
                        {vibeOptions.map((v) => (
                          <button key={v} onClick={() => setWizardData({ ...wizardData, vibe: v })} className={`p-2 rounded-xl text-center md:text-left text-sm transition-all ${wizardData.vibe === v ? "bg-orange-100 text-orange-700 border-orange-500 border-2" : "bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100"}`}>
                            {v}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            setWizardData((prev) => ({
                              ...prev,
                              vibe: vibeOptions.includes(prev.vibe) ? "" : prev.vibe,
                            }))
                          }
                          className={`p-2 rounded-xl text-center md:text-left text-sm transition-all ${isCustomVibe || wizardData.vibe === "" ? "bg-orange-100 text-orange-700 border-orange-500 border-2" : "bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100"}`}
                        >
                          Custom
                        </button>
                      </div>
                      {(isCustomVibe || wizardData.vibe === "") ? (
                        <input
                          value={wizardData.vibe}
                          onChange={(e) => setWizardData({ ...wizardData, vibe: e.target.value })}
                          placeholder="Enter custom vibe"
                          className="mt-2 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm"
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Slide Content Language
                      </label>
                      <Select
                        value={wizardData.slideLanguage || "English"}
                        onValueChange={(value) =>
                          setWizardData((prev) => ({ ...prev, slideLanguage: value }))
                        }
                      >
                        <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white text-sm text-slate-700 h-10">
                          <SelectValue placeholder="Select slide language" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {languageOptions.map((lang) => (
                            <SelectItem key={lang} value={lang}>
                              {lang}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        LLM Communication Language
                      </label>
                      <Select
                        value={wizardData.llmLanguage || "English"}
                        onValueChange={(value) =>
                          setWizardData((prev) => ({ ...prev, llmLanguage: value }))
                        }
                      >
                        <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white text-sm text-slate-700 h-10">
                          <SelectValue placeholder="Select communication language" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {languageOptions.map((lang) => (
                            <SelectItem key={lang} value={lang}>
                              {lang}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : wizardStep === 2 ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Material Library</p>
                      <div className="flex items-center gap-2">
                        <input
                          ref={uploadRef}
                          type="file"
                          accept="image/*,.webp,.gif,.jpg,.jpeg,.png,.svg,.bmp"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void handleAddWizardAssets(e.target.files);
                            e.currentTarget.value = "";
                          }}
                        />
                        <button
                          onClick={() => uploadRef.current?.click()}
                          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <ImagePlus className="w-3.5 h-3.5" />
                          Upload
                        </button>
                      </div>
                    </div>
                    {wizardAssets.length === 0 ? (
                      <p className="text-xs text-slate-500">No materials yet. You can continue without uploading images.</p>
                    ) : (
                      <div className="space-y-3">
                        {wizardAssets.map((asset) => (
                          <div key={asset.id} className="rounded-xl border border-slate-200 p-3 bg-white">
                            <div className="flex gap-3">
                              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                {asset.dataUrl ? (
                                  <img src={asset.dataUrl} alt={asset.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-[10px] text-slate-400">
                                    No preview
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <label className="sr-only" htmlFor={`asset-name-${asset.id}`}>
                                      Asset name
                                    </label>
                                    <div className="relative">
                                      <input
                                        id={`asset-name-${asset.id}`}
                                        value={asset.name}
                                        onChange={(e) => updateAsset(asset.id, (prev) => ({ ...prev, name: e.target.value }))}
                                        className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 py-1.5 text-xs text-slate-800"
                                      />
                                      <Pencil className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-900" />
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => removeAsset(asset.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                    title="Remove image"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Remove
                                  </button>
                                </div>
                                <p className="text-[11px] text-slate-500">
                                  {asset.mimeType || "image"} · {(asset.size / 1024).toFixed(0)} KB
                                </p>
                                <textarea
                                  value={asset.userDescription}
                                  onChange={(e) => updateAsset(asset.id, (prev) => ({ ...prev, userDescription: e.target.value }))}
                                  placeholder="Describe this image (required)"
                                  className="w-full h-16 rounded-lg border border-slate-200 px-3 py-2 text-xs resize-none"
                                />
                                {!asset.userDescription.trim() ? (
                                  <p className="text-[11px] text-amber-600">Please input image description</p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : wizardStep === 3 ? (
                <div className="space-y-5">
                  <div className="rounded-2xl p-4 md:p-5 space-y-4 border border-slate-100 bg-transparent">
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 border border-slate-100">
                      <div className="flex-1 space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outline Title</p>
                        <input
                          value={outlineDraft?.title || ""}
                          onChange={(e) =>
                            setOutlineDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                          }
                          placeholder="Outline title"
                          className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        onClick={() => void handleGenerateOutline()}
                        disabled={isGeneratingOutline}
                        className="self-end h-9 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg text-xs text-slate-700"
                      >
                        {isGeneratingOutline ? "Generating..." : "Regenerate"}
                      </button>
                    </div>
                    {outlineDraft?.slides?.map((slide, slideIndex) => (
                      <div
                        key={slide.id}
                        className={`rounded-2xl p-3 md:p-4 space-y-3 shadow-sm ${
                          slideIndex % 2 === 0
                            ? "bg-white border border-slate-100"
                            : "bg-orange-50/40 border border-orange-100/70"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 pb-1">
                          <div className="inline-flex items-center gap-2">
                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500 text-white text-[11px] font-bold px-2">
                              {slideIndex + 1}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {slide.type}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="md:col-span-2 space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Slide Title</p>
                            <input
                              value={slide.title}
                              onChange={(e) => handleOutlineSlideChange(slide.id, { title: e.target.value })}
                              className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs"
                              placeholder="Slide title"
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Slide Type</p>
                            <Select value={slide.type} onValueChange={(value) => handleOutlineSlideChange(slide.id, { type: value as EditorOutlineSlide["type"] })}>
                              <SelectTrigger className="w-full rounded-lg border-slate-200 bg-white text-xs h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["cover", "agenda", "content", "data", "summary"].map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">On-slide Text (Bullets)</p>
                          <textarea
                            value={slide.bullets.join("\n")}
                            onChange={(e) =>
                              handleOutlineSlideChange(slide.id, {
                                bullets: e.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                              })
                            }
                            className="w-full h-24 rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs resize-none"
                            placeholder="One bullet per line"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Speaker Notes</p>
                          <textarea
                            value={slide.speakerNotes || ""}
                            onChange={(e) => handleOutlineSlideChange(slide.id, { speakerNotes: e.target.value })}
                            className="w-full h-20 rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs resize-none"
                            placeholder="Notes for presenter (not shown on slide)"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Slide Visual Direction (Purpose + Web Style/Layout)
                          </p>
                          <input
                            value={slide.slideVisualDirection || ""}
                            onChange={(e) => handleOutlineSlideChange(slide.id, { slideVisualDirection: e.target.value })}
                            className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs"
                            placeholder="Describe page purpose + visual style/layout direction (non-homogeneous)"
                          />
                        </div>
                        {wizardAssets.length > 0 ? (
                          <div className="bg-white/70 rounded-xl p-2.5 border border-slate-100 space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Selected Images
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {slide.imageAssetIds
                                .map((assetId) =>
                                  wizardAssets.find((asset) => asset.id === assetId),
                                )
                                .filter(Boolean)
                                .map((asset) => (
                                  <span
                                    key={asset!.id}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 text-orange-700 text-xs px-2.5 py-1"
                                  >
                                    <span className="max-w-[180px] truncate">{asset!.name}</span>
                                    <button
                                      onClick={() =>
                                        handleOutlineSlideChange(slide.id, {
                                          imageAssetIds: slide.imageAssetIds.filter((id) => id !== asset!.id),
                                        })
                                      }
                                      className="rounded-full hover:bg-orange-200/70 p-0.5 transition-colors"
                                      title="Remove image"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))}

                              <Select
                                value=""
                                onValueChange={(value) => {
                                  if (!value) return;
                                  if (!allowDuplicateBySlide[slide.id] && slide.imageAssetIds.includes(value)) return;
                                  handleOutlineSlideChange(slide.id, {
                                    imageAssetIds: [...slide.imageAssetIds, value],
                                  });
                                }}
                              >
                                <SelectTrigger className="h-6 w-6 min-h-6 min-w-6 max-h-6 max-w-6 shrink-0 rounded-full border-slate-300 bg-white p-0 inline-flex items-center justify-center text-slate-600 [&>svg:not(.plus-icon)]:hidden">
                                  <Plus className="plus-icon w-3.5 h-3.5" />
                                </SelectTrigger>
                                <SelectContent
                                  className="w-72"
                                  sideOffset={8}
                                  onOpenAutoFocus={(e) => e.preventDefault()}
                                >
                                  <div
                                    className="px-2 py-1.5 border-b border-slate-100 mb-1 bg-slate-50/80"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <SettingSwitch
                                      checked={Boolean(allowDuplicateBySlide[slide.id])}
                                      onCheckedChange={(checked) =>
                                        setAllowDuplicateBySlide((prev) => ({
                                          ...prev,
                                          [slide.id]: checked,
                                        }))
                                      }
                                      label="Allow duplicate selection"
                                    />
                                  </div>
                                  {(() => {
                                    const currentSlideSelectedIds = new Set(slide.imageAssetIds);
                                    const selectedInOtherSlides = new Set(
                                      (outlineDraft?.slides || [])
                                        .filter((item) => item.id !== slide.id)
                                        .flatMap((item) => item.imageAssetIds || []),
                                    );
                                    const availableAssets = wizardAssets.filter((asset) => {
                                      if (currentSlideSelectedIds.has(asset.id)) return false;
                                      if (allowDuplicateBySlide[slide.id]) return true;
                                      return !selectedInOtherSlides.has(asset.id);
                                    });
                                    if (availableAssets.length === 0) {
                                      return (
                                        <div className="px-2 py-1.5 text-xs text-slate-500">
                                          No available materials
                                        </div>
                                      );
                                    }
                                    return availableAssets.map((asset) => (
                                      <SelectItem key={asset.id} value={asset.id}>
                                        <span className="block max-w-[240px] truncate">{asset.name}</span>
                                      </SelectItem>
                                    ));
                                  })()}
                                </SelectContent>
                              </Select>
                            </div>
                            <p className="text-[11px] text-slate-500">Add or remove images freely for this slide.</p>
                          </div>
                        ) : null}
                        <div className="rounded-xl border border-slate-100 bg-white/85">
                          <button
                            onClick={() =>
                              handleOutlineSlideChange(slide.id, {
                                aiImageExpanded: !slide.aiImageExpanded,
                              })
                            }
                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            <span>AI Image Module</span>
                            <span className="text-slate-400">{slide.aiImageExpanded ? "Collapse" : "Expand"}</span>
                          </button>
                          {slide.aiImageExpanded ? (
                            <div className="px-3 pb-3 space-y-2 border-t border-slate-100">
                              <div className="pt-2">
                                <SettingSwitch
                                  checked={slide.aiImageNeeded === true}
                                  onCheckedChange={(checked) => {
                                    const currentPrompts = Array.isArray(slide.aiImagePrompts) ? slide.aiImagePrompts : [];
                                    const ensuredPrompts =
                                      checked && currentPrompts.length === 0
                                        ? [
                                            {
                                              id: `${slide.id}-ai-1`,
                                              prompt: slide.slideVisualDirection || `Visual for ${slide.title || "this slide"}`,
                                              status: "idle",
                                              imageUrl: "",
                                              error: "",
                                            },
                                          ]
                                        : currentPrompts;
                                    handleOutlineSlideChange(slide.id, {
                                      aiImageNeeded: checked,
                                      aiImagePrompts: ensuredPrompts,
                                    });
                                  }}
                                  label="This slide needs AI images"
                                />
                              </div>
                              {slide.aiImageNeeded === true ? (
                                <>
                                  {(slide.aiImagePrompts || []).map((promptItem, promptIndex) => (
                                    <div key={promptItem.id || promptIndex} className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-semibold text-slate-500">Prompt {promptIndex + 1}</span>
                                        <button
                                          onClick={() =>
                                            handleOutlineSlideChange(slide.id, {
                                              aiImagePrompts: (slide.aiImagePrompts || []).filter((item) => item.id !== promptItem.id),
                                            })
                                          }
                                          className="text-[11px] text-slate-500 hover:text-red-500"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                      <textarea
                                        value={promptItem.prompt || ""}
                                        onChange={(e) =>
                                          handleOutlineSlideChange(slide.id, {
                                            aiImagePrompts: (slide.aiImagePrompts || []).map((item) =>
                                              item.id === promptItem.id
                                                ? { ...item, prompt: e.target.value, status: item.imageUrl ? item.status : "idle", error: "" }
                                                : item,
                                            ),
                                          })
                                        }
                                        className="w-full h-16 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs resize-none"
                                        placeholder="AI image prompt"
                                      />
                                      {promptItem.imageUrl ? (
                                        <div className="rounded-md overflow-hidden border border-slate-200 bg-slate-50 p-2">
                                          <div className="flex items-center justify-center rounded bg-white">
                                            <img
                                              src={promptItem.imageUrl}
                                              alt="AI generated preview"
                                              className="w-full h-auto max-h-72 object-contain"
                                            />
                                          </div>
                                        </div>
                                      ) : null}
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => void handleGenerateOutlineAiImage(slide.id, promptItem.id)}
                                          disabled={promptItem.status === "generating"}
                                          className="px-2.5 py-1.5 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-[11px] font-semibold"
                                        >
                                          {promptItem.status === "done" ? "Regenerate" : promptItem.status === "generating" ? "Generating..." : promptItem.status === "failed" ? "Retry" : "Generate"}
                                        </button>
                                        {promptItem.status === "failed" && promptItem.error ? (
                                          <span className="text-[11px] text-red-500 truncate">{promptItem.error}</span>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() =>
                                        handleOutlineSlideChange(slide.id, {
                                          aiImagePrompts: [
                                            ...(slide.aiImagePrompts || []),
                                            {
                                              id: `${slide.id}-ai-${(slide.aiImagePrompts || []).length + 1}-${Date.now()}`,
                                              prompt: slide.slideVisualDirection || `Visual for ${slide.title || "this slide"}`,
                                              status: "idle",
                                              imageUrl: "",
                                              error: "",
                                            },
                                          ],
                                        })
                                      }
                                      className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-[11px] text-slate-700 font-semibold"
                                    >
                                      Add prompt
                        </button>
                      </div>
                    </>
                              ) : (
                                <p className="text-[11px] text-slate-500">AI image disabled for this slide.</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={() => deleteOutlineSlide(slide.id)}
                            className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 hover:text-red-600 text-[11px] text-slate-600 font-semibold transition-colors"
                          >
                            Delete Slide
                          </button>
                          <button
                            onClick={() => insertBlankSlideBelow(slide.id)}
                            className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-[11px] text-slate-700 font-semibold"
                          >
                            Insert Blank Slide Below
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="space-y-2 rounded-xl bg-white p-3 border border-slate-100">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-600">Revise whole outline with AI</p>
                        <button
                          onClick={() => void handleGenerateOutline()}
                          disabled={isGeneratingOutline}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-md text-[11px] text-slate-700 font-semibold"
                        >
                          {isGeneratingOutline ? "Regenerating..." : "Regenerate Outline"}
                        </button>
                      </div>
                      <textarea
                        value={outlineInstruction}
                        onChange={(e) => setOutlineInstruction(e.target.value)}
                        placeholder="Talk to AI for overall revision, e.g. Make it investor-focused and trim to 8 slides."
                        className="w-full h-20 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs resize-none"
                      />
                      <button
                        onClick={() => void handleReviseOutline()}
                        disabled={isRevisingOutline}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg text-xs text-slate-700"
                      >
                        {isRevisingOutline ? "Revising..." : "Revise with AI"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : wizardStep === 4 ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Style Route</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        onClick={() => setStylePathMode("options")}
                        className={`p-2.5 rounded-xl text-center text-sm font-medium transition-all ${stylePathMode === "options" ? "bg-orange-100 text-orange-700 border-orange-500 border-2 shadow-sm" : "bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100"}`}
                      >
                        Show me options (3 previews)
                      </button>
                      <button
                        onClick={() => setStylePathMode("preset")}
                        className={`p-3 rounded-xl text-center text-sm font-medium transition-all ${stylePathMode === "preset" ? "bg-orange-100 text-orange-700 border-orange-500 border-2 shadow-sm" : "bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100"}`}
                      >
                        I know what I want (direct preset)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {renderStyleSelection()}
                </div>
              )}
            </div>
            <div className="px-4 md:px-6 py-4 border-t border-slate-200/60 flex items-center justify-between">
              <button
                onClick={handleWizardBack}
                disabled={wizardStep === 1}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-sm font-medium transition-colors"
              >
                Back
              </button>
              {canGoNext ? (
                <div className="flex items-center gap-2">
                  {wizardStep === 3 && outlineHasPendingImages ? (
                    <button
                      onClick={handleContinueWithoutAiImage}
                      disabled={isGeneratingOutlineImages}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 rounded-xl font-medium transition-colors text-sm"
                    >
                      Continue without AI image
                    </button>
                  ) : null}
                  <button
                    onClick={handleWizardNext}
                    disabled={
                      (wizardStep === 2 && (!canProceedFromMaterials || isGeneratingOutline)) ||
                      (wizardStep === 3 && isGeneratingOutlineImages)
                    }
                    className="px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                  >
                    {wizardStep === 2 && isGeneratingOutline ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Generating Outline...
                      </>
                    ) : wizardStep === 3 && isGeneratingOutlineImages ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Generating Images...
                      </>
                    ) : (
                      <>
                        {wizardStep === 2 && !canProceedFromMaterials
                          ? (materialsNextDisabledReason || "Please input image description")
                          : (nextLabelByStep[wizardStep] || "Next")}{" "}
                        <ArrowUp className="w-4 h-4 rotate-45" />
                      </>
                    )}
                  </button>
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
