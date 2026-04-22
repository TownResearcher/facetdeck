import { motion } from "motion/react";
import { ArrowUp, CheckCircle2, RotateCcw } from "lucide-react";
import type { RefObject } from "react";
import type { EditorChatMessage } from "../../types/editor";

type Tag = { id: string; name: string };

type EditorCopilotPanelProps = {
  chatScrollRef: RefObject<HTMLDivElement | null>;
  chatMessages: EditorChatMessage[];
  currentVersion: number;
  isSwitchingVersion: boolean;
  isWaitingForAI: boolean;
  chatError: string | null;
  chatInput: string;
  isChatDisabled: boolean;
  selectedTags: Tag[];
  isSelectorMode: boolean;
  onVersionSwitch: (version: number) => void;
  onRemoveTag: (id: string) => void;
  onChatInputChange: (value: string) => void;
  onSendMessage: () => void;
  onToggleSelectorMode: () => void;
};

export function EditorCopilotPanel({
  chatScrollRef,
  chatMessages,
  currentVersion,
  isSwitchingVersion,
  isWaitingForAI,
  chatError,
  chatInput,
  isChatDisabled,
  selectedTags,
  isSelectorMode,
  onVersionSwitch,
  onRemoveTag,
  onChatInputChange,
  onSendMessage,
  onToggleSelectorMode,
}: EditorCopilotPanelProps) {
  return (
    <>
      <div className="flex items-center gap-2 mb-6 shrink-0">
        <div className="w-2 h-2 rounded-full bg-[#ff6b35] animate-pulse" />
        <h3 className="text-sm uppercase tracking-widest font-bold text-slate-600">AI Copilot</h3>
      </div>

      <div ref={chatScrollRef} className="flex-1 overflow-y-auto custom-scrollbar mb-4 pr-2 flex flex-col pb-4">
        <div className="flex flex-col space-y-4 mt-auto">
          {chatMessages.map((msg) => {
            if (msg.isVersionCard) {
              const isCurrent = msg.version === currentVersion;
              return (
                <div
                  key={msg.id}
                  className="self-start w-full max-w-[90%] bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(255,107,53,0.05)] p-4 rounded-3xl rounded-bl-sm flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${isCurrent ? "bg-[#ff6b35] shadow-[0_0_8px_rgba(255,107,53,0.5)]" : "bg-slate-300"}`} />
                      <span className="text-sm font-bold text-slate-700 tracking-wide">Version {msg.version}</span>
                    </div>

                    {isCurrent ? (
                      <div className="flex items-center gap-1 px-2.5 py-1 bg-[#ff6b35]/10 border border-[#ff6b35]/20 text-[#ff6b35] text-[10px] font-bold uppercase tracking-wider rounded-xl shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Current
                      </div>
                    ) : (
                      <button
                        onClick={() => onVersionSwitch(msg.version || 1)}
                        disabled={isSwitchingVersion}
                        className={`group flex items-center gap-1 px-2.5 py-1 bg-white/50 border border-white/60 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all duration-300 shadow-sm shrink-0 ${isSwitchingVersion ? "opacity-50 cursor-not-allowed text-slate-400" : "hover:bg-[#ff6b35] hover:border-[#ff6b35] text-slate-600 hover:text-white hover:shadow-md"}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5 transition-transform group-hover:-rotate-90" />
                        Revert
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 font-medium leading-relaxed">{msg.versionTitle}</p>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={
                  msg.isUser
                    ? "self-end max-w-[85%] bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white p-3 rounded-2xl rounded-br-sm shadow-md text-sm whitespace-pre-wrap break-words"
                    : "self-start max-w-[85%] bg-white/60 p-3 rounded-2xl rounded-bl-sm shadow-sm text-sm text-slate-700 whitespace-pre-wrap break-words"
                }
              >
                {msg.text}
              </div>
            );
          })}

          {isWaitingForAI && (
            <div className="self-start bg-white/60 backdrop-blur-md p-3.5 rounded-2xl rounded-bl-sm shadow-sm border border-white/40 flex items-center gap-2.5">
              <span className="text-sm font-medium text-slate-700">Generating</span>
              <div className="flex items-center gap-1">
                <motion.div className="w-1.5 h-1.5 bg-[#ff6b35] rounded-full" animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0 }} />
                <motion.div className="w-1.5 h-1.5 bg-[#ff6b35] rounded-full" animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }} />
                <motion.div className="w-1.5 h-1.5 bg-[#ff6b35] rounded-full" animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative rounded-2xl overflow-hidden shrink-0 mt-auto p-[1px]">
        <motion.div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, rgba(255, 107, 53, 0.4), rgba(255, 138, 92, 0.2), rgba(255, 176, 136, 0.4))",
          }}
          animate={{
            background: [
              "linear-gradient(135deg, rgba(255, 107, 53, 0.4), rgba(255, 138, 92, 0.2), rgba(255, 176, 136, 0.4))",
              "linear-gradient(225deg, rgba(255, 176, 136, 0.4), rgba(255, 138, 92, 0.2), rgba(255, 107, 53, 0.4))",
              "linear-gradient(135deg, rgba(255, 107, 53, 0.4), rgba(255, 138, 92, 0.2), rgba(255, 176, 136, 0.4))",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        <div className="relative bg-white/80 backdrop-blur-md rounded-2xl p-3 flex flex-col gap-3">
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <div key={tag.id} className="flex items-center gap-1.5 bg-[#ff6b35]/10 border border-[#ff6b35]/20 rounded-lg pl-2 pr-1 py-1">
                  <div className="w-1.5 h-1.5 bg-[#ff6b35] rounded-full" />
                  <span className="text-[10px] font-semibold text-[#ff6b35] truncate max-w-[180px]">{tag.name}</span>
                  <button onClick={() => onRemoveTag(tag.id)} className="relative w-4 h-4 flex items-center justify-center rounded-md hover:bg-[#ff6b35]/20 text-[#ff6b35] transition-colors">
                    <div className="w-2.5 h-[1.5px] bg-current rotate-45 absolute" />
                    <div className="w-2.5 h-[1.5px] bg-current -rotate-45 absolute" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {chatError && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-3 p-3 rounded-2xl rounded-tr-sm bg-gradient-to-br from-[#ff6b35]/10 to-[#ff6b35]/5 backdrop-blur-xl border border-[#ff6b35]/30 shadow-[0_4px_16px_rgba(255,107,53,0.05)] flex items-start gap-2.5">
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-[#ff6b35] mt-0.5 shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest font-bold text-[#ff6b35]/80">Error</span>
                <span className="text-xs font-semibold text-slate-700 leading-snug">{chatError}</span>
              </div>
            </motion.div>
          )}

          <textarea
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isChatDisabled) onSendMessage();
              }
            }}
            placeholder="Ask AI to modify this slide..."
            className="w-full bg-transparent border-none outline-none resize-none text-sm placeholder:opacity-50 text-slate-800 min-h-[60px] custom-scrollbar"
          />

          <div className="flex justify-between items-center border-t border-slate-200/50 pt-2">
            <div className="group relative">
              <button
                id="selector-toggle-btn"
                onClick={onToggleSelectorMode}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-300 ${isSelectorMode ? "bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white shadow-lg shadow-[#ff6b35]/20" : "bg-slate-100/50 hover:bg-slate-200/50 text-slate-500"}`}
              >
                <div className={`w-3.5 h-3.5 relative ${isSelectorMode ? "animate-pulse" : ""}`}>
                  <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t-[1.5px] border-l-[1.5px] border-current" />
                  <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t-[1.5px] border-r-[1.5px] border-current" />
                  <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b-[1.5px] border-l-[1.5px] border-current" />
                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b-[1.5px] border-r-[1.5px] border-current" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-current rounded-full" />
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold">{isSelectorMode ? "Selecting..." : "Select"}</span>
              </button>
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-medium px-2 py-1 rounded whitespace-nowrap pointer-events-none z-50">
                Point and edit
              </div>
            </div>

            <motion.button
              onClick={onSendMessage}
              disabled={isChatDisabled}
              whileHover={!isChatDisabled ? { scale: 1.05 } : {}}
              whileTap={!isChatDisabled ? { scale: 0.95 } : {}}
              className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-md transition-colors ${isChatDisabled ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none" : "bg-gradient-to-br from-[#ff6b35] to-[#ff8a5c] text-white shadow-[#ff6b35]/20"}`}
            >
              <ArrowUp className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </>
  );
}
