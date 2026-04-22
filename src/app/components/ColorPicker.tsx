import { motion } from "motion/react";
import React, { useState, useEffect, useRef } from "react";

export const hslToHex = (h: number, s: number, l: number) => {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

export const hexToHsl = (hex: string) => {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { 
    h: Math.round(h * 360), 
    s: Math.round(s * 100), 
    l: Math.round(l * 100) 
  };
};

interface ColorPickerProps {
  colors: string[];
  onChange: (colors: string[]) => void;
  onClose: () => void;
  title?: string;
  applyScope?: "slide" | "all";
  onChangeApplyScope?: (scope: "slide" | "all") => void;
  onResetSlideToAll?: () => void;
  initialActiveColorIndex?: number;
}

export function ColorPicker({
  colors,
  onChange,
  onClose,
  title = "Theme Color",
  applyScope,
  onChangeApplyScope,
  onResetSlideToAll,
  initialActiveColorIndex = 0,
}: ColorPickerProps) {
  const paletteLabels = ["Primary", "Secondary", "Background", "Text"];
  const normalizedColors = Array.from({ length: 4 }, (_, idx) => colors[idx] || "#000000");
  const [activeColorIndex, setActiveColorIndex] = useState(Math.max(0, Math.min(3, initialActiveColorIndex)));
  const activeColor = normalizedColors[activeColorIndex] || "#000000";
  const [hexInput, setHexInput] = useState(activeColor.toUpperCase());
  const [currentHue, setCurrentHue] = useState(0);
  const [currentSaturation, setCurrentSaturation] = useState(100);
  const [currentLightness, setCurrentLightness] = useState(50);
  const [pickerThumbPos, setPickerThumbPos] = useState({ x: 50, y: 50 });
  const skipColorSyncRef = useRef(false);

  const updateActiveColor = (nextColor: string, options?: { preservePickerState?: boolean }) => {
    const preservePickerState = options?.preservePickerState ?? true;
    if (preservePickerState) {
      skipColorSyncRef.current = true;
    }
    const nextPalette = [...normalizedColors];
    nextPalette[activeColorIndex] = nextColor;
    onChange(nextPalette);
  };

  useEffect(() => {
    if (skipColorSyncRef.current) {
      skipColorSyncRef.current = false;
      setHexInput(activeColor.toUpperCase());
      return;
    }
    const hsl = hexToHsl(activeColor);
    setCurrentHue(hsl.h);
    setCurrentSaturation(hsl.s);
    setCurrentLightness(hsl.l);
    setPickerThumbPos({
      x: (hsl.h / 360) * 100,
      y: (1 - hsl.l / 100) * 100,
    });
    setHexInput(activeColor.toUpperCase());
  }, [activeColor]);

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
        className="relative bg-gradient-to-br from-white/90 to-white/60 backdrop-blur-2xl border border-white/60 shadow-[0_24px_48px_rgba(255,107,53,0.15)] p-6 rounded-[32px] rounded-tl-lg flex flex-col gap-6 w-[420px] max-w-[92vw]"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] uppercase font-bold tracking-widest text-[#ff6b35]">{title}</h3>
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

        {applyScope && onChangeApplyScope && (
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
        )}
        {/* 2D Hue + Lightness panel */}
        <div 
          className="relative w-full max-w-[360px] h-[220px] mx-auto rounded-2xl shadow-[inset_0_4px_12px_rgba(0,0,0,0.1)] border-[6px] border-white/80 cursor-crosshair overflow-hidden"
          onPointerDown={(e) => {
            const updatePanel = (clientX: number, clientY: number, currentTarget: HTMLElement) => {
              const rect = currentTarget.getBoundingClientRect();
              const pctX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
              const pctY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
              const nextHue = Math.round(pctX * 360);
              const nextLightness = Math.round((1 - pctY) * 100);
              const nextSaturation = 100;
              const nextHex = hslToHex(nextHue, nextSaturation, nextLightness);
              setCurrentHue(nextHue);
              setCurrentSaturation(nextSaturation);
              setCurrentLightness(nextLightness);
              updateActiveColor(nextHex);

              setPickerThumbPos({
                x: pctX * 100,
                y: pctY * 100,
              });
            };
            
            const target = e.currentTarget;
            updatePanel(e.clientX, e.clientY, target);
            
            const handleMove = (ev: PointerEvent) => {
              updatePanel(ev.clientX, ev.clientY, target);
            };
            const handleUp = () => {
              window.removeEventListener('pointermove', handleMove);
              window.removeEventListener('pointerup', handleUp);
            };
            
            window.addEventListener('pointermove', handleMove);
            window.addEventListener('pointerup', handleUp);
          }}
        >
          <div
            className="absolute inset-0 rounded-[10px] pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0) 50%, #000000 100%), linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
            }}
          />
          {/* Thumb */}
          <motion.div 
            className="absolute w-4 h-4 -ml-2 -mt-2 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.3)] border-[2px] border-white pointer-events-none"
            animate={{ left: `${pickerThumbPos.x}%`, top: `${pickerThumbPos.y}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          />
        </div>

        {/* Values */}
        <div className="flex items-center gap-3 bg-white/40 p-2 rounded-2xl border border-white/50">
          <div 
            className="w-12 h-12 rounded-xl shadow-sm border border-white/80 shrink-0 transition-colors" 
            style={{ backgroundColor: activeColor }} 
          />
          <div className="flex-1 bg-white/60 border border-white/60 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 font-mono tracking-wider flex justify-between items-center shadow-inner">
            <span className="text-[#ff6b35] opacity-80">HEX</span>
            <input
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={() => {
                const validHex = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/i;
                if (validHex.test(hexInput)) {
                  let formattedHex = hexInput.startsWith('#') ? hexInput : '#' + hexInput;
                  if (formattedHex.length === 4) {
                    formattedHex = '#' + formattedHex[1] + formattedHex[1] + formattedHex[2] + formattedHex[2] + formattedHex[3] + formattedHex[3];
                  }
                  updateActiveColor(formattedHex, { preservePickerState: false });
                } else {
                  setHexInput(activeColor.toUpperCase());
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="bg-transparent border-none outline-none text-right w-24 uppercase focus:ring-1 focus:ring-[#ff6b35]/50 rounded"
            />
          </div>
        </div>

        {/* Theme slots */}
        <div className="pt-2 border-t border-white/50">
          <div className="flex justify-between w-full max-w-[360px] mx-auto">
          {normalizedColors.map((c, idx) => (
            <button 
              key={`${paletteLabels[idx]}-${idx}`}
              onClick={() => {
                setActiveColorIndex(idx);
              }}
              className={`flex-1 mx-1 h-10 rounded-xl shadow-sm border transition-all px-2 text-left ${
                idx === activeColorIndex
                  ? "border-[#ff6b35]/50 bg-[#ff6b35]/10"
                  : "border-white/80 bg-white/50 hover:bg-white/80"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-white/80" style={{ backgroundColor: c }} />
                <span className="text-[10px] font-semibold text-slate-600 truncate">{paletteLabels[idx]}</span>
              </div>
            </button>
          ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
