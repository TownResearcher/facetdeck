import { AnimatePresence, motion } from "motion/react";
import { Check, Pencil } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";

type EditorTopToolbarProps = {
  isEditingTitle: boolean;
  editTitle: string;
  presentationTitle: string;
  isExportMenuOpen: boolean;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  onEditTitleChange: (value: string) => void;
  onEditTitleBlur: () => void;
  onEditTitleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSaveTitle: () => void;
  onStartEditingTitle: () => void;
  onToggleExportMenu: () => void;
  onExportPdf: () => void;
  onExportPptx: () => void;
  onExportHtml: () => void;
  onExportShareLink: () => void;
  saveStatusText: string;
  saveStatusTone: "neutral" | "success" | "warning" | "error";
  centerViewMode: "slide" | "code";
  onChangeCenterViewMode: (mode: "slide" | "code") => void;
};

export function EditorTopToolbar({
  isEditingTitle,
  editTitle,
  presentationTitle,
  isExportMenuOpen,
  exportMenuRef,
  onEditTitleChange,
  onEditTitleBlur,
  onEditTitleKeyDown,
  onSaveTitle,
  onStartEditingTitle,
  onToggleExportMenu,
  onExportPdf,
  onExportPptx,
  onExportHtml,
  onExportShareLink,
  saveStatusText,
  saveStatusTone,
  centerViewMode,
  onChangeCenterViewMode,
}: EditorTopToolbarProps) {
  const statusDotClassName =
    saveStatusTone === "success"
      ? "bg-green-400"
      : saveStatusTone === "warning"
        ? "bg-amber-400"
        : saveStatusTone === "error"
          ? "bg-rose-400"
          : "bg-slate-400";

  return (
    <div className="h-24 flex items-center justify-between px-8 gap-4 min-w-0">
      <div className="flex flex-col min-w-0 flex-1">
        {isEditingTitle ? (
          <div className="flex items-center gap-2 max-w-full">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => onEditTitleChange(e.target.value)}
              onBlur={onEditTitleBlur}
              onKeyDown={onEditTitleKeyDown}
              autoFocus
              className="bg-transparent border-b-2 border-[#ff6b35] text-slate-800 text-xl font-bold outline-none py-0.5 transition-colors w-full min-w-0 flex-1"
            />
            <button onMouseDown={(e) => e.preventDefault()} onClick={onSaveTitle} className="p-1.5 text-[#ff6b35] hover:bg-[#ff6b35]/10 rounded-lg transition-colors shrink-0">
              <Check className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group cursor-pointer min-w-0" onClick={onStartEditingTitle}>
            <h1 className="text-xl font-bold text-slate-800 truncate" title={presentationTitle}>
              {presentationTitle}
            </h1>
            <button className="p-1.5 text-slate-800 hover:text-[#ff6b35] hover:bg-[#ff6b35]/10 rounded-lg transition-colors shrink-0" title="Edit Presentation Title">
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="text-sm opacity-50 flex items-center gap-2 mt-1 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDotClassName}`} />
          {saveStatusText}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center rounded-xl border border-white/70 bg-white/50 p-1 backdrop-blur-md">
          {[
            { id: "slide" as const, label: "Slide" },
            { id: "code" as const, label: "Code" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onChangeCenterViewMode(item.id)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                centerViewMode === item.id
                  ? "bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white"
                  : "text-slate-600 hover:bg-white/70"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative" ref={exportMenuRef}>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onToggleExportMenu} className="group relative px-6 py-2.5 rounded-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] opacity-90 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex items-center gap-3 text-white font-medium">
              Export
              <div className={`flex flex-col gap-[3px] transition-transform duration-300 ${isExportMenuOpen ? "rotate-180" : ""}`}>
                <div className="w-3 h-0.5 bg-white rounded-full" />
                <div className="w-2 h-0.5 bg-white rounded-full ml-1" />
              </div>
            </div>
          </motion.button>

          <AnimatePresence>
            {isExportMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-48 bg-white/80 backdrop-blur-xl border border-white/60 shadow-xl rounded-2xl overflow-hidden z-50 py-2"
              >
                <button onClick={onExportPdf} className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-[#ff6b35]/10 hover:text-[#ff6b35] transition-colors">
                  Export to PDF
                </button>
                {/* <button onClick={onExportPptx} className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-[#ff6b35]/10 hover:text-[#ff6b35] transition-colors">
                  Export to PPTX
                </button> */}
                <button onClick={onExportHtml} className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-[#ff6b35]/10 hover:text-[#ff6b35] transition-colors">
                  Export to HTML
                </button>
                <button onClick={onExportShareLink} className="w-full px-4 py-2.5 text-left text-sm font-medium text-[#ff6b35] hover:bg-[#ff6b35]/10 transition-colors">
                  Export to Share Link
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
