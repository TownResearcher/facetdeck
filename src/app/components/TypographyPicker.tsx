import { motion } from "motion/react";
import React, { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type TypographyPickerProps = {
  titleFont: string;
  bodyFont: string;
  onChange: (next: { title: string; body: string }) => void;
  onClose: () => void;
  applyScope: "slide" | "all";
  onChangeApplyScope: (scope: "slide" | "all") => void;
  onResetSlideToAll?: () => void;
};

const FONT_OPTIONS = [
  "Manrope",
  "Inter",
  "Space Grotesk",
  "DM Sans",
  "Outfit",
  "Poppins",
  "Merriweather",
  "Playfair Display",
  "Lora",
  "IBM Plex Sans",
];

const encodeFontFamily = (font: string) => encodeURIComponent(font).replace(/%20/g, "+");

const FONT_PAIR_PRESETS: Array<{ id: string; name: string; title: string; body: string; note: string }> = [
  { id: "clean-modern", name: "Clean Modern", title: "Manrope", body: "Inter", note: "Clean, professional, balanced" },
  { id: "tech-minimal", name: "Tech Minimal", title: "Space Grotesk", body: "IBM Plex Sans", note: "Product, data, precise" },
  { id: "creative-bold", name: "Creative Bold", title: "Outfit", body: "DM Sans", note: "Strong title rhythm" },
  { id: "editorial", name: "Editorial", title: "Playfair Display", body: "Lora", note: "Elegant and narrative" },
  { id: "friendly", name: "Friendly UI", title: "Poppins", body: "Inter", note: "Warm and approachable" },
];

export function TypographyPicker({
  titleFont,
  bodyFont,
  onChange,
  onClose,
  applyScope,
  onChangeApplyScope,
  onResetSlideToAll,
}: TypographyPickerProps) {
  useEffect(() => {
    const styleId = "typography-picker-font-link";
    const familyQuery = FONT_OPTIONS.map((font) => `family=${encodeFontFamily(font)}:wght@400;500;700;800`).join("&");
    const href = `https://fonts.googleapis.com/css2?${familyQuery}&display=swap`;

    let link = document.getElementById(styleId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = styleId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = href;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-gradient-to-br from-white/90 to-white/60 backdrop-blur-2xl border border-white/60 shadow-[0_24px_48px_rgba(255,107,53,0.15)] p-6 rounded-[32px] rounded-tl-lg flex flex-col gap-5 w-[560px] max-w-[92vw] max-h-[86vh] overflow-hidden"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] uppercase font-bold tracking-widest text-[#ff6b35]">Typography</h3>
          <div className="flex items-center gap-2">
            {applyScope === "slide" && onResetSlideToAll && (
              <button
                type="button"
                onClick={onResetSlideToAll}
                className="rounded-xl px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 bg-white/70 border border-white/80 hover:bg-white transition-colors"
              >
                Reset This Slide
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center bg-white/50 hover:bg-white rounded-full transition-all duration-300 text-slate-400 hover:text-slate-600 hover:shadow-sm"
            >
              <div className="w-3 h-3 relative">
                <div className="absolute top-1/2 left-0 w-full h-[2px] bg-current -translate-y-1/2 rotate-45 rounded-full" />
                <div className="absolute top-1/2 left-0 w-full h-[2px] bg-current -translate-y-1/2 -rotate-45 rounded-full" />
              </div>
            </button>
          </div>
        </div>

        <div className="bg-white/50 border border-white/70 rounded-2xl p-4 shadow-inner">
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Live Preview</div>
          <div className="text-xl text-slate-800 mb-1" style={{ fontFamily: `"${titleFont}", sans-serif` }}>
            Presentation Title
          </div>
          <div className="text-sm text-slate-600 leading-relaxed" style={{ fontFamily: `"${bodyFont}", sans-serif` }}>
            Clear body copy for supporting details. This preview follows your selected title and body fonts.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/50 border border-white/60 p-1">
          <button
            type="button"
            onClick={() => onChangeApplyScope("slide")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
              applyScope === "slide"
                ? "bg-[#ff6b35]/15 text-[#ff6b35] border border-[#ff6b35]/30"
                : "text-slate-500 hover:bg-white/80"
            }`}
          >
            This Slide
          </button>
          <button
            type="button"
            onClick={() => onChangeApplyScope("all")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
              applyScope === "all"
                ? "bg-[#ff6b35]/15 text-[#ff6b35] border border-[#ff6b35]/30"
                : "text-slate-500 hover:bg-white/80"
            }`}
          >
            All Slides
          </button>
        </div>
        <div className="overflow-y-auto pr-1 space-y-3">
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Font Pair Presets</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FONT_PAIR_PRESETS.map((preset) => {
              const active = preset.title === titleFont && preset.body === bodyFont;
              return (
                <button
                  key={preset.id}
                  onClick={() => onChange({ title: preset.title, body: preset.body })}
                  className={`text-left rounded-2xl p-3 border transition-all ${
                    active
                      ? "bg-[#ff6b35]/10 border-[#ff6b35]/40 shadow-[0_6px_18px_rgba(255,107,53,0.18)]"
                      : "bg-white/50 border-white/70 hover:bg-white/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-sm font-semibold text-slate-800">{preset.name}</div>
                    {active && <div className="text-[10px] uppercase font-bold tracking-wider text-[#ff6b35]">Active</div>}
                  </div>
                  <div className="text-xs text-slate-500 mb-2">{preset.note}</div>
                  <div className="text-sm text-slate-800" style={{ fontFamily: `"${preset.title}", sans-serif` }}>
                    {preset.title}
                  </div>
                  <div className="text-xs text-slate-500" style={{ fontFamily: `"${preset.body}", sans-serif` }}>
                    {preset.body}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-white/60">
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-3">Custom Pair</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="text-xs text-slate-500">
                <div className="mb-1">TitleFont</div>
                <Select value={titleFont} onValueChange={(value) => onChange({ title: value, body: bodyFont })}>
                  <SelectTrigger className="w-full rounded-xl border-white/80 bg-white/70 text-sm text-slate-700 h-10">
                    <SelectValue placeholder="Choose title font" />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((font) => (
                      <SelectItem key={`title-${font}`} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-slate-500">
                <div className="mb-1">BodyFont</div>
                <Select value={bodyFont} onValueChange={(value) => onChange({ title: titleFont, body: value })}>
                  <SelectTrigger className="w-full rounded-xl border-white/80 bg-white/70 text-sm text-slate-700 h-10">
                    <SelectValue placeholder="Choose body font" />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((font) => (
                      <SelectItem key={`body-${font}`} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

