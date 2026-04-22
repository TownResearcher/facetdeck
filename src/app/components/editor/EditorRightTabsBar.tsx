import { motion } from "motion/react";
import type { RefObject } from "react";

type EditorRightTabsBarProps = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onScrollTabs: (direction: "left" | "right") => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onTabsScroll: () => void;
  activeRightTab: string;
  onChangeTab: (tabId: string) => void;
  pluginTabs?: Array<{ id: string; label: string }>;
};

export function EditorRightTabsBar({
  canScrollLeft,
  canScrollRight,
  onScrollTabs,
  scrollContainerRef,
  onTabsScroll,
  activeRightTab,
  onChangeTab,
  pluginTabs = [],
}: EditorRightTabsBarProps) {
  const tabs = [
    { id: "copilot", label: "AI Copilot" },
    { id: "properties", label: "Properties" },
    ...pluginTabs,
  ];

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#ff6b35]/80">Tools & Plugins</div>
        <div className="flex gap-2">
          <button
            onClick={() => onScrollTabs("left")}
            className={`w-7 h-7 flex items-center justify-center bg-white/60 backdrop-blur-xl border border-white/50 shadow-sm rounded-full transition-all duration-300 hover:bg-white hover:scale-110 hover:shadow-md focus:outline-none ${canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <div className="w-1.5 h-1.5 border-b-2 border-l-2 border-[#ff6b35] rotate-45 ml-0.5" />
          </button>
          <button
            onClick={() => onScrollTabs("right")}
            className={`w-7 h-7 flex items-center justify-center bg-white/60 backdrop-blur-xl border border-white/50 shadow-sm rounded-full transition-all duration-300 hover:bg-white hover:scale-110 hover:shadow-md focus:outline-none ${canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <div className="w-1.5 h-1.5 border-t-2 border-r-2 border-[#ff6b35] rotate-45 mr-0.5" />
          </button>
        </div>
      </div>

      <div
        className="relative w-full"
        style={{
          maskImage: canScrollRight && canScrollLeft
            ? "linear-gradient(to right, transparent, black 16px, black calc(100% - 24px), transparent 100%)"
            : canScrollRight
              ? "linear-gradient(to right, black calc(100% - 24px), transparent 100%)"
              : canScrollLeft
                ? "linear-gradient(to right, transparent, black 16px, black 100%)"
                : "none",
          WebkitMaskImage: canScrollRight && canScrollLeft
            ? "linear-gradient(to right, transparent, black 16px, black calc(100% - 24px), transparent 100%)"
            : canScrollRight
              ? "linear-gradient(to right, black calc(100% - 24px), transparent 100%)"
              : canScrollLeft
                ? "linear-gradient(to right, transparent, black 16px, black 100%)"
                : "none",
        }}
      >
        <div
          ref={scrollContainerRef}
          onScroll={onTabsScroll}
          className="flex overflow-x-auto gap-2 pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
        >
          {tabs.map((tab) => (
            <motion.button
              key={tab.id}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onChangeTab(tab.id)}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${activeRightTab === tab.id ? "bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white shadow-lg shadow-[#ff6b35]/20" : "bg-white/40 text-slate-500 hover:bg-white/60 backdrop-blur-md border border-white/50"}`}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>
      </div>
    </>
  );
}
