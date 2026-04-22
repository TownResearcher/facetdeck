import { AnimatePresence, motion } from "motion/react";
import type { RefObject } from "react";
import type { EditorSlide } from "../../types/editor";

type EditorPresentationOverlayProps = {
  isPresenting: boolean;
  showPlayHint: boolean;
  activeSlide: number;
  activeSlideData?: EditorSlide;
  presentationViewportRef: RefObject<HTMLDivElement | null>;
  presentationIframeRef: RefObject<HTMLIFrameElement | null>;
  presentationFrameWidth: number;
  presentationFrameHeight: number;
  presentationSlideScale: number;
  baseSlideWidth: number;
  baseSlideHeight: number;
};

export function EditorPresentationOverlay({
  isPresenting,
  showPlayHint,
  activeSlide,
  activeSlideData,
  presentationViewportRef,
  presentationIframeRef,
  presentationFrameWidth,
  presentationFrameHeight,
  presentationSlideScale,
  baseSlideWidth,
  baseSlideHeight,
}: EditorPresentationOverlayProps) {
  if (!isPresenting) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center cursor-default">
      <AnimatePresence>
        {showPlayHint && (
          <>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="absolute top-8 left-8 px-5 py-2.5 rounded-2xl rounded-bl-md bg-gradient-to-br from-[#ff6b35]/80 to-[#ff8a5c]/80 backdrop-blur-md border border-white/20 shadow-2xl flex items-center gap-3 z-[10000] pointer-events-none"
            >
              <div className="w-2 h-2 rounded-sm bg-white/90 shrink-0 rotate-45" />
              <span className="text-white/95 font-medium tracking-wide text-sm drop-shadow-sm">Press ESC to exit</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="absolute bottom-12 px-6 py-3 rounded-2xl rounded-tr-md bg-gradient-to-br from-[#ff6b35]/80 to-[#ff8a5c]/80 backdrop-blur-md border border-white/20 shadow-2xl flex items-center gap-4 z-[10000] pointer-events-none"
            >
              <div className="w-2 h-2 rounded-sm bg-white/90 shrink-0 rotate-45" />
              <span className="text-white/95 font-medium tracking-wide text-sm drop-shadow-sm">
                Use Arrow keys to navigate slides. Press F11 for best full-screen experience.
              </span>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.div
        key={activeSlide}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        ref={presentationViewportRef}
        className="relative w-screen h-screen bg-white overflow-hidden shrink-0 flex items-center justify-center"
      >
        {activeSlideData?.html ? (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                style={{
                  width: `${presentationFrameWidth}px`,
                  height: `${presentationFrameHeight}px`,
                  overflow: "hidden",
                }}
              >
                <iframe
                  ref={presentationIframeRef}
                  title={`Presentation slide ${activeSlide}`}
                  srcDoc={activeSlideData.html}
                  className="border-0"
                  style={{
                    width: `${baseSlideWidth}px`,
                    height: `${baseSlideHeight}px`,
                    transform: `scale(${presentationSlideScale})`,
                    transformOrigin: "top left",
                  }}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-[#ff6b35]/10 to-transparent rounded-bl-full pointer-events-none" />

            <div className="relative z-10 text-center space-y-10">
              <div className="text-[#ff6b35] font-bold tracking-widest uppercase text-2xl">Slide {activeSlide} Overview</div>
              <h3 className="text-7xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent leading-tight">{activeSlideData?.title}</h3>
              <div className="w-24 h-2 bg-[#ff6b35] rounded-full mx-auto" />
              <p className="max-w-2xl mx-auto text-slate-500 text-3xl leading-relaxed">
                This is a dynamically generated presentation slide utilizing the power of AI to synthesize your content beautifully.
              </p>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
