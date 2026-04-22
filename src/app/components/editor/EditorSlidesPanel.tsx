import { motion } from "motion/react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EditorSlide } from "../../types/editor";

type EditorSlidesPanelProps = {
  slides: EditorSlide[];
  activeSlide: number;
  setActiveSlide: Dispatch<SetStateAction<number>>;
  editingSlideId: number | null;
  setEditingSlideId: Dispatch<SetStateAction<number | null>>;
  editSlideType: string;
  setEditSlideType: Dispatch<SetStateAction<string>>;
  editSlideTitle: string;
  setEditSlideTitle: Dispatch<SetStateAction<string>>;
  onSaveSlideEdit: (id: number) => void;
  onAddSlide: () => void;
  onDeleteSlide: (id: number) => void;
  onReorderSlides: (draggedId: number, targetId: number) => void;
};

export function EditorSlidesPanel({
  slides,
  activeSlide,
  setActiveSlide,
  editingSlideId,
  setEditingSlideId,
  editSlideType,
  setEditSlideType,
  editSlideTitle,
  setEditSlideTitle,
  onSaveSlideEdit,
  onAddSlide,
  onDeleteSlide,
  onReorderSlides,
}: EditorSlidesPanelProps) {
  const [draggingSlideId, setDraggingSlideId] = useState<number | null>(null);
  const [dragOverSlideId, setDragOverSlideId] = useState<number | null>(null);

  return (
    <motion.div
      id="left-panel"
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="w-[280px] shrink-0 h-full flex flex-col pt-20 pb-4"
    >
      <div className="mb-8 pl-4 border-l-2 border-[#ff6b35]/30">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] bg-clip-text text-transparent">Slides</h2>
        <div className="text-sm opacity-60 mt-1">{slides.length} pages total</div>
      </div>

      <div className="flex-1 overflow-y-auto pr-4 space-y-4 flex flex-col relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="absolute left-6 top-4 bottom-4 w-px bg-gradient-to-b from-[#ff6b35]/20 via-[#ff6b35]/10 to-transparent z-[-1]" />

        {slides.map((slide, index) => (
          <motion.div
            key={slide.id}
            data-slide-title={slide.title}
            data-slide-id={slide.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.1 }}
            draggable
            onDragStart={(e) => {
              setDraggingSlideId(slide.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(slide.id));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (draggingSlideId !== null && draggingSlideId !== slide.id) {
                setDragOverSlideId(slide.id);
              }
            }}
            onDragLeave={() => {
              if (dragOverSlideId === slide.id) {
                setDragOverSlideId(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const rawId = e.dataTransfer.getData("text/plain");
              const droppedId = Number(rawId);
              const draggedId = Number.isFinite(droppedId) ? droppedId : draggingSlideId;
              if (draggedId !== null && draggedId !== slide.id) {
                onReorderSlides(draggedId, slide.id);
              }
              setDraggingSlideId(null);
              setDragOverSlideId(null);
            }}
            onDragEnd={() => {
              setDraggingSlideId(null);
              setDragOverSlideId(null);
            }}
            onClick={() => setActiveSlide(slide.id)}
            className="relative group cursor-pointer"
          >
            <div
              className={`relative p-5 rounded-2xl transition-all duration-300 ${activeSlide === slide.id ? "bg-white/60 backdrop-blur-xl border-white/80 shadow-[0_8px_32px_rgba(255,107,53,0.15)] ml-4 border" : "bg-white/20 backdrop-blur-md border-white/20 hover:bg-white/40 ml-0 hover:ml-2 border"} ${dragOverSlideId === slide.id ? "ring-2 ring-[#ff6b35]/60" : ""} ${draggingSlideId === slide.id ? "opacity-60" : ""}`}
            >
              {activeSlide === slide.id && (
                <motion.div layoutId="activeIndicator" className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#ff6b35]/20 flex items-center justify-center backdrop-blur-sm">
                  <div className="w-2 h-2 rounded-full bg-[#ff6b35]" />
                </motion.div>
              )}

              <div className="flex justify-between items-start gap-2 h-full min-w-0">
                {editingSlideId === slide.id ? (
                  <>
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="text-xs font-semibold text-[#ff6b35] uppercase tracking-wider flex items-center gap-1">
                        <span className="shrink-0">{String(index + 1).padStart(2, "0")} —</span>
                        <input
                          value={editSlideType}
                          onChange={(e) => setEditSlideType(e.target.value)}
                          className="bg-transparent border-b border-[#ff6b35]/50 outline-none flex-1 min-w-0"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onSaveSlideEdit(slide.id);
                            if (e.key === "Escape") setEditingSlideId(null);
                          }}
                        />
                      </div>
                      <input
                        value={editSlideTitle}
                        onChange={(e) => setEditSlideTitle(e.target.value)}
                        className="font-medium text-slate-800 bg-transparent border-b border-slate-300 outline-none w-full"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSaveSlideEdit(slide.id);
                          if (e.key === "Escape") setEditingSlideId(null);
                        }}
                      />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSaveSlideEdit(slide.id);
                      }}
                      className="p-1.5 rounded-lg text-[#ff6b35] hover:bg-[#ff6b35]/10 transition-colors shrink-0"
                      title="Save Changes"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="text-xs font-semibold text-[#ff6b35] mb-1.5 uppercase tracking-wider opacity-80 flex items-center gap-1 truncate">
                        <span className="shrink-0">{String(index + 1).padStart(2, "0")} —</span>
                        <span className="truncate">{slide.type}</span>
                      </div>
                      <div className="font-medium text-slate-800 truncate" title={slide.title}>
                        {slide.title}
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${activeSlide === slide.id ? "opacity-100" : ""}`}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSlideId(slide.id);
                          setEditSlideType(slide.type);
                          setEditSlideTitle(slide.title);
                        }}
                        className="p-1.5 rounded-lg text-slate-800 hover:bg-slate-800/10 transition-colors"
                        title="Edit Slide"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSlide(slide.id);
                        }}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="Delete Slide"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="pt-4 pr-4 shrink-0">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onAddSlide}
          className="w-full py-4 rounded-2xl border border-dashed border-[#ff6b35]/40 bg-[#ff6b35]/5 text-[#ff6b35] font-medium flex items-center justify-center gap-2 hover:bg-[#ff6b35]/10 transition-colors"
        >
          <div className="text-lg leading-none">+</div>
          New Slide
        </motion.button>
      </div>
    </motion.div>
  );
}
