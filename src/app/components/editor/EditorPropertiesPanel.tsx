type SelectedPropertyElement = {
  id: string;
  name: string;
  tagName?: string;
  slideId?: number;
  domPath?: string;
  textContent?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
} | null;

type EditorPropertiesPanelProps = {
  isPropertiesSelectorMode: boolean;
  selectedPropertyElement: SelectedPropertyElement;
  transformMode: "absolute" | "offset";
  transformValues: { x: string; y: string; w: string; h: string };
  contentValue: string;
  canEditContent: boolean;
  canUndoLocalEdit: boolean;
  onTogglePropertiesSelectorMode: () => void;
  onClearSelectedProperty: () => void;
  onTransformValueChange: (field: "x" | "y" | "w" | "h", value: string) => void;
  onContentValueChange: (value: string) => void;
  onApplyTransform: () => void;
  onApplyContent: () => void;
  onUndoLocalEdit: () => void;
};

export function EditorPropertiesPanel({
  isPropertiesSelectorMode,
  selectedPropertyElement,
  transformMode,
  transformValues,
  contentValue,
  canEditContent,
  canUndoLocalEdit,
  onTogglePropertiesSelectorMode,
  onClearSelectedProperty,
  onTransformValueChange,
  onContentValueChange,
  onApplyTransform,
  onApplyContent,
  onUndoLocalEdit,
}: EditorPropertiesPanelProps) {
  const transformTitle = transformMode === "absolute" ? "Transform (Absolute)" : "Transform (Offset)";
  const transformHint =
    transformMode === "absolute"
      ? "X/Y are left/top canvas coordinates."
      : "X/Y are translate offsets; layout flow is preserved.";
  const axisLabels = {
    x: transformMode === "absolute" ? "X" : "Offset X",
    y: transformMode === "absolute" ? "Y" : "Offset Y",
    w: "W",
    h: "H",
  } as const;

  return (
    <>
      <div className="flex-1 overflow-y-auto space-y-6 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#ff6b35] rotate-45 rounded-sm" />
            <h3 className="text-sm uppercase tracking-widest font-bold text-slate-600">Properties</h3>
          </div>
          <div className="group relative">
            <button
              id="properties-selector-toggle-btn"
              onClick={onTogglePropertiesSelectorMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-300 ${isPropertiesSelectorMode ? "bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white shadow-lg shadow-[#ff6b35]/20" : "bg-white/50 hover:bg-white/80 text-slate-500 border border-white/60"}`}
            >
              <div className={`w-3.5 h-3.5 relative ${isPropertiesSelectorMode ? "animate-pulse" : ""}`}>
                <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t-[1.5px] border-l-[1.5px] border-current" />
                <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t-[1.5px] border-r-[1.5px] border-current" />
                <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b-[1.5px] border-l-[1.5px] border-current" />
                <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b-[1.5px] border-r-[1.5px] border-current" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-current rounded-full" />
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold">{isPropertiesSelectorMode ? "Selecting..." : "Select"}</span>
            </button>
            <div className="absolute -top-8 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-medium px-2 py-1 rounded whitespace-nowrap pointer-events-none z-50">
              Select Slide Element
            </div>
          </div>
        </div>

        {selectedPropertyElement && (
          <div className="bg-[#ff6b35]/10 border border-[#ff6b35]/20 rounded-xl p-3 flex items-center justify-between -mt-2 mb-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-1.5 h-1.5 bg-[#ff6b35] rounded-full shrink-0" />
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-[#ff6b35] truncate" title={selectedPropertyElement.name}>
                  {selectedPropertyElement.name}
                </span>
                <span className="block text-[10px] text-[#ff6b35]/80 uppercase tracking-wider truncate">
                  {selectedPropertyElement.tagName || "element"}
                </span>
              </div>
            </div>
            <button onClick={onClearSelectedProperty} className="relative w-5 h-5 flex items-center justify-center rounded hover:bg-[#ff6b35]/20 text-[#ff6b35] transition-colors shrink-0">
              <div className="w-3 h-[1.5px] bg-current rotate-45 absolute" />
              <div className="w-3 h-[1.5px] bg-current -rotate-45 absolute" />
            </button>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">{transformTitle}</div>
            <div className="text-[11px] text-slate-500">{transformHint}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: axisLabels.x, key: "x" as const, value: transformValues.x },
              { label: axisLabels.y, key: "y" as const, value: transformValues.y },
              { label: axisLabels.w, key: "w" as const, value: transformValues.w },
              { label: axisLabels.h, key: "h" as const, value: transformValues.h },
            ].map((item) => (
              <div key={item.label} className="bg-white/50 rounded-xl p-2.5 border border-white/60 flex items-center justify-between hover:bg-white/80 transition-colors focus-within:bg-white focus-within:border-[#ff6b35]/50 group">
                <span className="text-xs font-semibold text-slate-400 group-focus-within:text-[#ff6b35] transition-colors">{item.label}</span>
                <input
                  type="number"
                  value={item.value}
                  onChange={(e) => onTransformValueChange(item.key, e.target.value)}
                  onBlur={onApplyTransform}
                  className="w-16 text-right text-sm font-medium text-slate-700 bg-transparent border-none outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            ))}
          </div>
          <button
            onClick={onApplyTransform}
            disabled={!selectedPropertyElement}
            className="w-full py-2 rounded-xl bg-white/70 hover:bg-white/90 border border-white/80 text-xs font-bold text-slate-700 transition-colors uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Transform
          </button>
        </div>

        <div className="space-y-3">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Content</div>
          <div className="bg-white/50 rounded-xl p-3 border border-white/60 focus-within:bg-white/80 transition-colors focus-within:border-[#ff6b35]/50">
            <textarea
              className="w-full bg-transparent border-none outline-none resize-none text-sm text-slate-700 min-h-[80px] custom-scrollbar disabled:opacity-50"
              value={contentValue}
              disabled={!canEditContent}
              placeholder={canEditContent ? "Edit selected text content..." : "Text content only available for text elements"}
              onChange={(e) => onContentValueChange(e.target.value)}
              onBlur={onApplyContent}
            />
          </div>
          <button
            onClick={onApplyContent}
            disabled={!selectedPropertyElement || !canEditContent}
            className="w-full py-2 rounded-xl bg-white/70 hover:bg-white/90 border border-white/80 text-xs font-bold text-slate-700 transition-colors uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Content
          </button>
        </div>
      </div>

      <div className="shrink-0 pt-4 border-t border-slate-200/50 mt-auto">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onUndoLocalEdit}
            disabled={!canUndoLocalEdit}
            className="py-2.5 rounded-xl bg-white/60 hover:bg-white/80 border border-white/80 text-xs font-bold text-slate-600 transition-colors uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Undo Last
          </button>
          <button
            onClick={onClearSelectedProperty}
            className="py-2.5 rounded-xl bg-[#ff6b35]/10 hover:bg-[#ff6b35]/20 border border-[#ff6b35]/30 text-xs font-bold text-[#ff6b35] transition-colors uppercase tracking-wider"
          >
            Clear
          </button>
        </div>
      </div>
    </>
  );
}
