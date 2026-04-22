import * as React from "react";
import { motion } from "motion/react";
import { Header } from "../components/Header";
import { ConversationInput } from "../components/ConversationInput";
import { useNavigate } from "react-router";

export function Home() {
  const navigate = useNavigate();

  const handleGenerate = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    // 立即跳转到编辑器，并打开生成向导弹窗
    navigate("/editor", {
      state: {
        newProject: true,
        initialPrompt: trimmed,
      },
    });
  };

  const handleEmptyProject = () => {
    navigate("/editor", {
      state: {
        newProject: true,
      },
    });
  };

  return (
    <>
      <Header />
      <main className="relative z-10 min-h-screen px-8 pt-32 pb-20">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-12 gap-8 items-center min-h-[calc(100vh-13rem)]">
            <div className="col-span-12 lg:col-span-7 space-y-12">
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="relative"
              >
                <div className="absolute -left-4 -top-8 text-[200px] font-bold bg-gradient-to-br from-[#ff6b35]/10 to-[#ff8a5c]/5 bg-clip-text text-transparent leading-none select-none">
                  01
                </div>
                
                <motion.h1
                  className="relative text-8xl mb-8 leading-[0.95]"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  <span className="block bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] bg-clip-text text-transparent">
                    Create
                  </span>
                  <span className="block text-inherit mt-2">
                    Professional
                  </span>
                  <span className="block bg-gradient-to-r from-[#ff8a5c] to-[#ffb088] bg-clip-text text-transparent mt-2">
                    Presentations
                  </span>
                </motion.h1>

                <motion.div
                  className="h-1 w-32 bg-gradient-to-r from-[#ff6b35] to-transparent rounded-full"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  style={{ transformOrigin: "left" }}
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="space-y-6 max-w-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-3">
                    {[1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        className="w-12 h-12 rounded-full border-4 border-background"
                        style={{
                          background: `linear-gradient(135deg, ${
                            i === 1
                              ? "#ff6b35, #ff8a5c"
                              : i === 2
                              ? "#ff8a5c, #ffb088"
                              : "#ffb088, #ffd4bb"
                          })`,
                        }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}
                      />
                    ))}
                  </div>
                  <div className="text-sm opacity-80">
                    <span className="font-semibold text-inherit">Open source</span> & community driven
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mt-8 max-w-xl"
              >
                <button
                  onClick={() => navigate("/repository")}
                  className="group relative overflow-hidden rounded-[24px] bg-white/40 backdrop-blur-2xl border border-white/60 p-6 flex items-center justify-between w-full hover:bg-white/60 transition-all duration-500 shadow-[0_8px_32px_0_rgba(255,107,53,0.05)] cursor-pointer text-left"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#ff6b35]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="relative z-10 flex flex-col gap-1">
                    <span className="text-[#ff6b35] font-bold tracking-widest text-xs uppercase mb-1">Personal Space</span>
                    <h3 className="text-2xl font-bold text-slate-800">My Slide Repository</h3>
                    <p className="text-slate-500 text-sm font-medium mt-1">Manage, play, and export your generated decks.</p>
                  </div>

                  <div className="relative z-10 w-12 h-12 rounded-full border-2 border-[#ff6b35]/20 flex items-center justify-center group-hover:border-[#ff6b35]/50 group-hover:scale-110 transition-all duration-500">
                    <div className="w-3 h-3 border-t-2 border-r-2 border-[#ff6b35] rotate-45 -ml-1" />
                  </div>
                </button>
              </motion.div>
            </div>

            <div className="col-span-12 lg:col-span-5">
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              >
                <ConversationInput onGenerate={handleGenerate} onEmptyProject={handleEmptyProject} />
                
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="mt-8 text-center"
                >
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/40 backdrop-blur-sm border border-white/60">
                    <div className="w-2 h-2 rounded-full bg-[#ff6b35] animate-pulse" />
                    <span className="text-sm opacity-60">No credit card required</span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/40 backdrop-blur-sm border border-white/60">
                    <div className="w-2 h-2 rounded-full bg-[#ff6b35] animate-pulse" />
                    <span className="text-sm opacity-60">
                      Configure your own models in Profile or use ours. Invite new users to earn model tokens.
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}