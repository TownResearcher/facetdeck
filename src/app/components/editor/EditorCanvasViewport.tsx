import { motion } from "motion/react";
import type { RefObject } from "react";
import type { EditorSlide } from "../../types/editor";

type EditorCanvasViewportProps = {
  activeSlide: number;
  activeSlideData?: EditorSlide;
  isSelectorMode: boolean;
  isPropertiesSelectorMode: boolean;
  onTogglePresentation: () => void;
  editorViewportRef: RefObject<HTMLDivElement | null>;
  editorFrameWidth: number;
  editorFrameHeight: number;
  editorSlideScale: number;
  baseSlideWidth: number;
  baseSlideHeight: number;
};

export function EditorCanvasViewport({
  activeSlide,
  activeSlideData,
  isSelectorMode,
  isPropertiesSelectorMode,
  onTogglePresentation,
  editorViewportRef,
  editorFrameWidth,
  editorFrameHeight,
  editorSlideScale,
  baseSlideWidth,
  baseSlideHeight,
}: EditorCanvasViewportProps) {
  return (
    <div className="relative z-10 flex-1 w-full flex items-center justify-center min-h-0 group">
      <motion.div
        key={activeSlide}
        id="main-content-area"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-5xl max-h-full aspect-video bg-white rounded-2xl shadow-xl overflow-hidden shrink-0 group/slide flex items-center justify-center"
      >
        {!isSelectorMode && !isPropertiesSelectorMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePresentation();
            }}
            className="absolute bottom-6 right-6 z-50 opacity-0 group-hover/slide:opacity-100 transition-all duration-300 bg-slate-50 hover:bg-white text-[#ff6b35] hover:scale-110 w-14 h-14 rounded-2xl shadow-xl shadow-[#ff6b35]/20 flex items-center justify-center border border-white focus:outline-none"
            title="Start Presentation"
          >
            <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[12px] border-l-[#ff6b35] border-b-[8px] border-b-transparent ml-1.5" />
          </button>
        )}

        {activeSlideData?.html ? (
          <div ref={editorViewportRef} className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                style={{
                  width: `${editorFrameWidth}px`,
                  height: `${editorFrameHeight}px`,
                  overflow: "hidden",
                }}
              >
                <iframe
                  title={`Generated slide ${activeSlide}`}
                  srcDoc={activeSlideData.html}
                  className="border-0"
                  style={{
                    width: `${baseSlideWidth}px`,
                    height: `${baseSlideHeight}px`,
                    transform: `scale(${editorSlideScale})`,
                    transformOrigin: "top left",
                  }}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#ff6b35]/10 to-transparent rounded-bl-full" />

            <div className="relative z-10 text-center space-y-6">
              <div className="text-[#ff6b35] font-bold tracking-widest uppercase text-sm">Slide {activeSlide} Overview</div>
              <h3 className="text-5xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">{activeSlideData?.title}</h3>
              <div className="w-16 h-1 bg-[#ff6b35] rounded-full mx-auto" />
              <p className="max-w-md mx-auto text-slate-500 text-lg">
                This is a dynamically generated presentation slide utilizing the power of AI to synthesize your content beautifully.
              </p>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
