import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { Header } from "../components/Header";
import { Edit2, Play, Trash2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import { getErrorMessage } from "../utils/errors";
import { EditorPresentationOverlay } from "../components/editor/EditorPresentationOverlay";
import { useEditorPresentation } from "../hooks/useEditorPresentation";

type RepositorySlide = {
  id: number;
  title: string;
  type: string;
  html: string;
};

type RepositoryDeck = {
  id: number;
  title: string;
  slideCount: number;
  theme: {
    primary: string;
    secondary: string;
  };
  updatedAt: number;
  presentation: {
    title: string;
    slides: RepositorySlide[];
  };
};

const formatDate = (timestamp: number) => {
  const value = Number(timestamp) || Date.now();
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

const BASE_SLIDE_WIDTH = 1920;
const BASE_SLIDE_HEIGHT = 1080;

export function Repository() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<RepositoryDeck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [playingDeckId, setPlayingDeckId] = useState<number | null>(null);
  const [activePlaySlide, setActivePlaySlide] = useState<number>(1);
  const [deletingDeckId, setDeletingDeckId] = useState<number | null>(null);

  const activePlayDeck = useMemo(
    () => decks.find((item) => item.id === playingDeckId) || null,
    [decks, playingDeckId],
  );
  const activeDeleteDeck = useMemo(
    () => decks.find((item) => item.id === deletingDeckId) || null,
    [decks, deletingDeckId],
  );
  const activePlaySlides = useMemo(
    () => (activePlayDeck?.presentation?.slides || []).map((slide) => ({
      id: Number(slide.id) || 0,
      title: String(slide.title || ""),
      type: String(slide.type || "Content"),
      html: String(slide.html || ""),
    })).filter((slide) => slide.id > 0),
    [activePlayDeck],
  );
  const activePlaySlideData = useMemo(
    () => activePlaySlides.find((slide) => slide.id === activePlaySlide),
    [activePlaySlides, activePlaySlide],
  );

  const {
    isPresenting,
    showPlayHint,
    togglePresentation,
    presentationIframeRef,
    presentationViewportRef,
    presentationSlideScale,
    presentationFrameWidth,
    presentationFrameHeight,
  } = useEditorPresentation({
    slides: activePlaySlides,
    activeSlide: activePlaySlide,
    setActiveSlide: setActivePlaySlide,
    activeSlideHtml: activePlaySlideData?.html,
  });

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    const loadDecks = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/repository/decks", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Failed to load repository");
        setDecks(Array.isArray(data?.decks) ? data.decks : []);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to load repository"));
      } finally {
        setIsLoading(false);
      }
    };
    loadDecks();
  }, []);

  const handleDelete = async () => {
    if (!deletingDeckId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    try {
      const response = await fetch(`/api/repository/decks/${deletingDeckId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to delete deck");
      setDecks((prev) => prev.filter((item) => item.id !== deletingDeckId));
      toast.success("Presentation deleted");
      setDeletingDeckId(null);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Delete failed"));
    }
  };

  const openDeckInEditor = (deck: RepositoryDeck) => {
    navigate("/editor", {
      state: {
        deckId: deck.id,
        presentation: {
          ...deck.presentation,
          theme: deck.theme,
        },
      },
    });
  };

  const openDeckPresentation = (deck: RepositoryDeck) => {
    const firstSlideId = Number(deck.presentation?.slides?.[0]?.id) || 1;
    setActivePlaySlide(firstSlideId);
    setPlayingDeckId(deck.id);
  };

  useEffect(() => {
    if (playingDeckId !== null && !isPresenting) {
      togglePresentation();
    }
  }, [playingDeckId, isPresenting]);

  useEffect(() => {
    if (playingDeckId !== null && !activePlaySlides.some((slide) => slide.id === activePlaySlide)) {
      setActivePlaySlide(activePlaySlides[0]?.id || 1);
    }
  }, [playingDeckId, activePlaySlides, activePlaySlide]);

  useEffect(() => {
    if (!isPresenting && playingDeckId !== null) {
      setPlayingDeckId(null);
    }
  }, [isPresenting, playingDeckId]);

  return (
    <>
      <Toaster position="top-center" expand={true} richColors />
      <Header />
      <div className="min-h-screen box-border bg-[#fafafa] pt-32 pb-12 px-6 sm:px-12 relative overflow-hidden flex justify-center">
        <div className="fixed top-[5%] right-[-5%] w-[600px] h-[600px] rounded-[100px] rotate-[30deg] bg-gradient-to-bl from-[#ff6b35]/15 to-transparent blur-[120px] pointer-events-none" />
        <div className="fixed bottom-[-10%] left-[-15%] w-[800px] h-[500px] rounded-[300px] rotate-[-15deg] bg-gradient-to-tr from-[#ff8a5c]/20 to-transparent blur-[100px] pointer-events-none" />

        <div className="w-full max-w-[1600px] relative z-10 flex flex-col lg:flex-row gap-8 xl:gap-12">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} className="w-full lg:w-80 flex-shrink-0">
            <div className="bg-white/50 backdrop-blur-3xl border border-white/80 rounded-[40px] p-8 shadow-[0_12px_40px_0_rgba(255,107,53,0.08)]">
              <div className="w-16 h-2 bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] rounded-full mb-6" />
              <h1 className="text-4xl font-extrabold text-slate-800 leading-tight mb-2">FacetDeck<br />Repository</h1>
              <p className="text-slate-500 font-medium leading-relaxed">Auto-saved presentations from your editor sessions.</p>
              <div className="mt-10 pt-8 border-t border-slate-200/50 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total Decks</span>
                <span className="text-2xl font-black text-[#ff6b35]">{decks.length}</span>
              </div>
            </div>
          </motion.div>

          <div className="flex-1">
            {isLoading ? (
              <div className="w-full py-20 flex justify-center text-slate-500 font-semibold">Loading repository...</div>
            ) : decks.length === 0 ? (
              <div className="w-full py-20 flex flex-col items-center justify-center bg-white/40 backdrop-blur-xl border border-white/60 rounded-[40px]">
                <p className="text-slate-500 font-bold text-lg">No presentations found.</p>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {decks.map((deck) => (
                  <motion.div key={deck.id} layout className="group relative aspect-video bg-white/60 backdrop-blur-xl border border-white/80 rounded-[24px] overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.04)]">
                    {String(deck.presentation?.slides?.[0]?.html || "").trim() ? (
                      <div className="absolute inset-0 bg-white">
                        <iframe
                          title={`${deck.title} cover preview`}
                          srcDoc={String(deck.presentation.slides[0].html || "")}
                          className="border-0 origin-top-left pointer-events-none"
                          style={{ width: "400%", height: "400%", transform: "scale(0.25)" }}
                          sandbox="allow-scripts"
                        />
                      </div>
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{ background: `linear-gradient(135deg, ${deck.theme.primary}, ${deck.theme.secondary})` }}
                      />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md px-5 py-4 border-t border-white/50 z-20">
                      <h3 className="text-lg font-bold text-slate-800 mb-0.5 truncate">{deck.title}</h3>
                      <p className="text-xs font-semibold text-slate-400">{formatDate(deck.updatedAt)} • {deck.slideCount} slides</p>
                    </div>
                    <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity z-30 flex items-center justify-center gap-4">
                      <button onClick={() => openDeckPresentation(deck)} className="w-12 h-12 rounded-full bg-[#ff6b35] text-white flex items-center justify-center shadow-lg">
                        <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                      </button>
                      <button onClick={() => openDeckInEditor(deck)} className="w-12 h-12 rounded-full bg-white text-slate-700 flex items-center justify-center shadow-lg">
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button onClick={() => setDeletingDeckId(deck.id)} className="w-12 h-12 rounded-full bg-white text-red-500 flex items-center justify-center shadow-lg">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {deletingDeckId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDeletingDeckId(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/60">
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Delete Presentation</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">Are you sure you want to delete <strong className="text-slate-700">{activeDeleteDeck?.title || "this deck"}</strong>?</p>
              <div className="flex w-full gap-4">
                <button onClick={() => setDeletingDeckId(null)} className="flex-1 py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors">Cancel</button>
                <button onClick={handleDelete} className="flex-1 py-3.5 px-4 bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white font-bold rounded-xl">Confirm Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activePlayDeck && (
          <EditorPresentationOverlay
            isPresenting={isPresenting}
            showPlayHint={showPlayHint}
            activeSlide={activePlaySlide}
            activeSlideData={activePlaySlideData}
            presentationViewportRef={presentationViewportRef}
            presentationIframeRef={presentationIframeRef}
            presentationFrameWidth={presentationFrameWidth}
            presentationFrameHeight={presentationFrameHeight}
            presentationSlideScale={presentationSlideScale}
            baseSlideWidth={BASE_SLIDE_WIDTH}
            baseSlideHeight={BASE_SLIDE_HEIGHT}
          />
        )}
      </AnimatePresence>
    </>
  );
}