import { useEffect, useRef, useState } from "react";

const BASE_SLIDE_WIDTH = 1920;
const BASE_SLIDE_HEIGHT = 1080;

type SlideLike = {
  id: number;
  html?: string;
};

type Params = {
  slides: SlideLike[];
  activeSlide: number;
  setActiveSlide: (next: number | ((current: number) => number)) => void;
  activeSlideHtml?: string;
};

export function useEditorPresentation({ slides, activeSlide, setActiveSlide, activeSlideHtml }: Params) {
  const [isPresenting, setIsPresenting] = useState(false);
  const [showPlayHint, setShowPlayHint] = useState(false);
  const presentationIframeRef = useRef<HTMLIFrameElement>(null);
  const editorViewportRef = useRef<HTMLDivElement>(null);
  const presentationViewportRef = useRef<HTMLDivElement>(null);
  const [editorSlideScale, setEditorSlideScale] = useState(1);
  const [presentationSlideScale, setPresentationSlideScale] = useState(1);

  const editorFrameWidth = BASE_SLIDE_WIDTH * editorSlideScale;
  const editorFrameHeight = BASE_SLIDE_HEIGHT * editorSlideScale;
  const presentationFrameWidth = BASE_SLIDE_WIDTH * presentationSlideScale;
  const presentationFrameHeight = BASE_SLIDE_HEIGHT * presentationSlideScale;

  useEffect(() => {
    if (!isPresenting) {
      setShowPlayHint(false);
      return;
    }

    setShowPlayHint(true);
    const timer = window.setTimeout(() => setShowPlayHint(false), 3000);
    return () => window.clearTimeout(timer);
  }, [isPresenting]);

  useEffect(() => {
    const calcContainScale = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return 1;
      return Math.max(0.01, Math.min(width / BASE_SLIDE_WIDTH, height / BASE_SLIDE_HEIGHT));
    };

    const updateScaleFromElement = (element: HTMLDivElement | null, setter: (value: number) => void) => {
      if (!element) return;
      setter(calcContainScale(element.clientWidth, element.clientHeight));
    };

    const updateAllScales = () => {
      updateScaleFromElement(editorViewportRef.current, setEditorSlideScale);
      updateScaleFromElement(presentationViewportRef.current, setPresentationSlideScale);
    };

    updateAllScales();
    const raf1 = window.requestAnimationFrame(updateAllScales);
    const raf2 = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(updateAllScales);
    });

    const resizeObserver = new ResizeObserver(updateAllScales);
    if (editorViewportRef.current) resizeObserver.observe(editorViewportRef.current);
    if (presentationViewportRef.current) resizeObserver.observe(presentationViewportRef.current);

    window.addEventListener("resize", updateAllScales);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateAllScales);
    };
  }, [isPresenting, activeSlide, activeSlideHtml]);

  useEffect(() => {
    if (!isPresenting) return;

    const nextSlide = () => {
      const currentIndex = slides.findIndex((slide) => slide.id === activeSlide);
      if (currentIndex < slides.length - 1) {
        setActiveSlide(slides[currentIndex + 1].id);
      } else {
        setIsPresenting(false);
      }
    };

    const prevSlide = () => {
      const currentIndex = slides.findIndex((slide) => slide.id === activeSlide);
      if (currentIndex > 0) {
        setActiveSlide(slides[currentIndex - 1].id);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsPresenting(false);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        nextSlide();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        prevSlide();
      }
    };

    let lastWheelTime = 0;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelTime < 500) return;
      lastWheelTime = now;
      if (e.deltaY > 0) nextSlide();
      if (e.deltaY < 0) prevSlide();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("wheel", handleWheel, { passive: false });

    const attachIframeListeners = () => {
      const frame = presentationIframeRef.current;
      if (!frame) return () => {};
      try {
        const frameWindow = frame.contentWindow;
        const frameDoc = frame.contentDocument;
        if (!frameWindow || !frameDoc) return () => {};

        frameWindow.addEventListener("keydown", handleKeyDown as EventListener, true);
        frameWindow.addEventListener("wheel", handleWheel as EventListener, { passive: false });
        frameDoc.addEventListener("keydown", handleKeyDown as EventListener, true);
        return () => {
          frameWindow.removeEventListener("keydown", handleKeyDown as EventListener, true);
          frameWindow.removeEventListener("wheel", handleWheel as EventListener);
          frameDoc.removeEventListener("keydown", handleKeyDown as EventListener, true);
        };
      } catch {
        return () => {};
      }
    };

    let detachIframeListeners = attachIframeListeners();
    const frameEl = presentationIframeRef.current;
    const handleFrameLoad = () => {
      detachIframeListeners();
      detachIframeListeners = attachIframeListeners();
    };

    if (frameEl) frameEl.addEventListener("load", handleFrameLoad);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("wheel", handleWheel);
      detachIframeListeners();
      if (frameEl) frameEl.removeEventListener("load", handleFrameLoad);
    };
  }, [isPresenting, slides, activeSlide, setActiveSlide]);

  const togglePresentation = () => {
    setIsPresenting((prev) => !prev);
  };

  return {
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
  };
}
