import { motion } from "motion/react";
import type { ChangeEvent, RefObject } from "react";
import type { EditorElement } from "../../types/editor";

type EditorSlideResourcesBarProps = {
  canScrollElementsLeft: boolean;
  canScrollElementsRight: boolean;
  onScrollElements: (direction: "left" | "right") => void;
  elementsScrollRef: RefObject<HTMLDivElement | null>;
  onElementsScroll: () => void;
  themeColors: string[];
  onOpenThemeColor: (index?: number) => void;
  titleFont: string;
  bodyFont: string;
  onPickTypography: () => void;
  elements: EditorElement[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddElementClick: () => void;
  onSelectElement: (element: EditorElement) => void;
};

export function EditorSlideResourcesBar({
  canScrollElementsLeft,
  canScrollElementsRight,
  onScrollElements,
  elementsScrollRef,
  onElementsScroll,
  themeColors,
  onOpenThemeColor,
  titleFont,
  bodyFont,
  onPickTypography,
  elements,
  fileInputRef,
  onFileUpload,
  onAddElementClick,
  onSelectElement,
}: EditorSlideResourcesBarProps) {
  return (
    <div className="relative w-full max-w-5xl shrink-0 z-10 flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-[10px] uppercase tracking-widest font-bold text-[#ff6b35] opacity-80">Slide Elements & Resources</h3>
        <div className="flex gap-2">
          <button
            onClick={() => onScrollElements("left")}
            className={`w-6 h-6 flex items-center justify-center bg-white/60 backdrop-blur-xl border border-white/50 shadow-sm rounded-full transition-all duration-300 hover:bg-white hover:scale-110 hover:shadow-md focus:outline-none ${canScrollElementsLeft ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <div className="w-1.5 h-1.5 border-b-2 border-l-2 border-[#ff6b35] rotate-45 ml-0.5" />
          </button>
          <button
            onClick={() => onScrollElements("right")}
            className={`w-6 h-6 flex items-center justify-center bg-white/60 backdrop-blur-xl border border-white/50 shadow-sm rounded-full transition-all duration-300 hover:bg-white hover:scale-110 hover:shadow-md focus:outline-none ${canScrollElementsRight ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <div className="w-1.5 h-1.5 border-t-2 border-r-2 border-[#ff6b35] rotate-45 mr-0.5" />
          </button>
        </div>
      </div>

      <div
        className="relative w-full"
        style={{
          maskImage: canScrollElementsRight && canScrollElementsLeft
            ? "linear-gradient(to right, transparent, black 16px, black calc(100% - 24px), transparent 100%)"
            : canScrollElementsRight
              ? "linear-gradient(to right, black calc(100% - 24px), transparent 100%)"
              : canScrollElementsLeft
                ? "linear-gradient(to right, transparent, black 16px, black 100%)"
                : "none",
          WebkitMaskImage: canScrollElementsRight && canScrollElementsLeft
            ? "linear-gradient(to right, transparent, black 16px, black calc(100% - 24px), transparent 100%)"
            : canScrollElementsRight
              ? "linear-gradient(to right, black calc(100% - 24px), transparent 100%)"
              : canScrollElementsLeft
                ? "linear-gradient(to right, transparent, black 16px, black 100%)"
                : "none",
        }}
      >
        <div ref={elementsScrollRef} onScroll={onElementsScroll} className="flex overflow-x-auto gap-4 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] items-center px-2">
          <motion.button
            type="button"
            data-resource-name="Theme Color"
            whileHover={{ y: -2 }}
            onClick={() => onOpenThemeColor(0)}
            className="shrink-0 bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-white/60 min-w-[180px] h-16 flex flex-col justify-center text-left hover:bg-white/70 transition-colors"
          >
            <div className="text-[9px] uppercase font-bold text-slate-500 mb-2">Theme Color</div>
            <div className="flex gap-2 relative z-20">
              {themeColors.map((color, index) => (
                <motion.div
                  key={index}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-5 h-5 rounded-full shadow-sm border border-white/80 cursor-pointer"
                  style={{ backgroundColor: color }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenThemeColor(index);
                  }}
                />
              ))}
            </div>
          </motion.button>

          <motion.button
            type="button"
            data-resource-name={`Typography ${titleFont} ${bodyFont}`}
            whileHover={{ y: -2 }}
            onClick={onPickTypography}
            className="shrink-0 bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-white/60 min-w-[200px] h-16 flex flex-col justify-center text-left hover:bg-white/70 transition-colors"
          >
            <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">Typography</div>
            <div className="flex gap-2 items-center overflow-hidden">
              <span className="font-bold text-slate-800 text-sm truncate" title={`TitleFont: ${titleFont}`}>
                T: {titleFont}
              </span>
              <div className="w-1 h-1 rounded-full bg-slate-400" />
              <span className="text-slate-600 text-xs truncate" title={`BodyFont: ${bodyFont}`}>
                B: {bodyFont}
              </span>
            </div>
          </motion.button>

          {elements.map((element) => (
            <motion.button
              type="button"
              data-resource-name={element.name}
              key={element.id}
              whileHover={{ y: -2 }}
              onClick={() => onSelectElement(element)}
              className="shrink-0 bg-white/40 backdrop-blur-md rounded-2xl p-3 border border-white/60 w-[180px] h-16 flex items-center gap-3 text-left hover:bg-white/70 transition-colors"
              title={element.name}
            >
              <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-[#ff6b35]/10 to-[#ff8a5c]/5 border border-[#ff6b35]/20 flex items-center justify-center overflow-hidden">
                {element.dataUrl || element.url ? (
                  <img src={element.dataUrl || element.url} alt={element.name} className="w-full h-full object-cover" />
                ) : element.type === "IMAGE" ? (
                  <div className="w-4 h-4 rounded-full bg-[#ff6b35]/45" />
                ) : (
                  <div className="w-4 h-4 bg-[#ff6b35]/50 rotate-12" />
                )}
              </div>
              <div className="flex flex-col flex-1 justify-center overflow-hidden">
                <div className="text-[9px] uppercase font-bold text-slate-500 mb-0.5 truncate">
                  {element.source === "asset" ? "ASSET" : element.type}
                </div>
                <div className="text-xs font-medium text-slate-800 truncate">{element.name}</div>
              </div>
            </motion.button>
          ))}

          <input type="file" ref={fileInputRef} hidden onChange={onFileUpload} />
          <motion.button whileHover={{ scale: 1.02 }} onClick={onAddElementClick} className="shrink-0 bg-white/20 backdrop-blur-md rounded-2xl p-3 border border-dashed border-[#ff6b35]/40 min-w-[120px] h-16 flex items-center justify-center gap-2 text-[#ff6b35] hover:bg-white/40 transition-colors">
            <div className="text-xl leading-none mb-0.5">+</div>
            <div className="text-[10px] uppercase font-bold">Element</div>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
