import { motion } from "motion/react";
import { useState } from "react";

interface ConversationInputProps {
  onGenerate: (prompt: string) => void;
  onEmptyProject: () => void;
}

export function ConversationInput({ onGenerate, onEmptyProject }: ConversationInputProps) {
  const [prompt, setPrompt] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onGenerate(prompt);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="w-full"
    >
      <form onSubmit={handleSubmit} className="relative">
        {/* Decorative floating element */}
        <motion.div
          className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-gradient-to-br from-[#ff6b35]/20 to-[#ff8a5c]/10 blur-2xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.div
          className="relative overflow-hidden rounded-3xl"
          animate={{
            scale: isFocused ? 1.02 : 1,
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {/* Glass effect container with enhanced depth */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-white/20 backdrop-blur-md" />
          
          {/* Animated border glow */}
          <motion.div
            className="absolute inset-0 rounded-3xl"
            style={{
              background: "linear-gradient(135deg, rgba(255, 107, 53, 0.4), rgba(255, 138, 92, 0.3), rgba(255, 176, 136, 0.4))",
              padding: "1px",
            }}
            animate={{
              opacity: isFocused ? 1 : 0.6,
              background: isFocused 
                ? ["linear-gradient(135deg, rgba(255, 107, 53, 0.4), rgba(255, 138, 92, 0.3), rgba(255, 176, 136, 0.4))",
                   "linear-gradient(225deg, rgba(255, 176, 136, 0.4), rgba(255, 138, 92, 0.3), rgba(255, 107, 53, 0.4))",
                   "linear-gradient(135deg, rgba(255, 107, 53, 0.4), rgba(255, 138, 92, 0.3), rgba(255, 176, 136, 0.4))"]
                : "linear-gradient(135deg, rgba(255, 107, 53, 0.4), rgba(255, 138, 92, 0.3), rgba(255, 176, 136, 0.4))",
            }}
            transition={{
              opacity: { duration: 0.3 },
              background: { duration: 3, repeat: Infinity, ease: "linear" }
            }}
          >
            <div className="w-full h-full rounded-3xl bg-gradient-to-br from-white/50 to-white/20 backdrop-blur-md" />
          </motion.div>

          {/* Corner accent */}
          <div className="absolute top-4 right-4 w-16 h-16 rounded-full bg-gradient-to-br from-[#ff6b35]/10 to-transparent blur-xl" />

          {/* Input container */}
          <div className="relative p-10">
            {/* Label */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-4 flex items-center gap-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#ff6b35]" />
              <span className="text-sm uppercase tracking-wider opacity-60 font-medium">
                Your Idea
              </span>
            </motion.div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (prompt.trim()) {
                    onGenerate(prompt);
                  }
                }
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Describe the presentation you want to create..."
              className="w-full bg-transparent border-none outline-none resize-none min-h-[140px] text-xl placeholder:opacity-50 text-inherit"
              rows={5}
            />

            {/* Action buttons */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#ff6b35]/10">
              <motion.div
                className="text-sm opacity-60 flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#ff6b35]/10 to-[#ff8a5c]/5 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-sm bg-[#ff6b35]/40" />
                </div>
                <span className="hidden sm:inline">
                  {prompt.trim() ? "Press Enter to generate" : "Start from scratch or describe your idea"}
                </span>
              </motion.div>

              {prompt.trim() ? (
                <motion.button
                  key="generate"
                  type="submit"
                  initial={{ opacity: 0, scale: 0.8, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: 20 }}
                  className="px-10 py-4 min-w-[240px] rounded-2xl bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white relative overflow-hidden group shadow-lg shadow-[#ff6b35]/20"
                  whileHover={{ scale: 1.05, shadow: "0 20px 40px rgba(255, 107, 53, 0.3)" }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="relative z-10 font-medium">Generate Presentation</span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-[#ff8a5c] to-[#ffb088]"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: 0 }}
                    transition={{ duration: 0.3 }}
                  />
                </motion.button>
              ) : (
                <motion.button
                  key="blank"
                  type="button"
                  onClick={onEmptyProject}
                  initial={{ opacity: 0, scale: 0.8, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: 20 }}
                  className="relative group px-10 py-4 min-w-[240px] rounded-2xl overflow-hidden"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {/* Glass background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-md" />
                  
                  {/* Border */}
                  <div className="absolute inset-0 rounded-2xl border-2 border-[#ff6b35]/40 group-hover:border-[#ff6b35]/60 transition-colors" />
                  
                  {/* Glow effect on hover */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-[#ff6b35]/0 via-[#ff6b35]/10 to-[#ff6b35]/0 rounded-2xl"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.6 }}
                  />

                  {/* Content */}
                  <span className="relative z-10 font-medium text-[#ff6b35]">Blank Project</span>
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Floating particles around input */}
        <div className="absolute -z-10 inset-0 scale-110">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: i % 2 === 0 ? "rgba(255, 107, 53, 0.4)" : "rgba(255, 138, 92, 0.4)",
                left: `${15 + Math.random() * 70}%`,
                top: `${10 + Math.random() * 80}%`,
              }}
              animate={{
                y: [0, -25, 0],
                x: [0, Math.random() * 15 - 7.5, 0],
                opacity: [0.3, 0.7, 0.3],
                scale: [1, 1.3, 1],
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </form>
    </motion.div>
  );
}