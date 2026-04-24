import { motion } from "motion/react";
import { useNavigate, useLocation } from "react-router";
import { COMMUNITY_FEATURE_ENABLED } from "../config/runtimeMode";
import facetLogo from "../../../facetlogo.svg";

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isCommunity = location.pathname.startsWith("/community");
  const isProfile = location.pathname === "/profile";
  const isRepository = location.pathname === "/repository";

  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 px-8 py-6 pointer-events-none"
    >
      <div className="w-full flex items-center justify-between pointer-events-auto">
        {/* Left Section */}
        {isProfile || isRepository || isCommunity ? (
          <motion.button
            onClick={() => navigate("/home")}
            whileHover={{ scale: 1.05 }}
            className="group relative flex items-center justify-center w-12 h-12 rounded-[18px] bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_4px_16px_0_rgba(255,107,53,0.05)] cursor-pointer overflow-hidden"
            aria-label="Back to Home"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#ff6b35]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            {/* Pure CSS Geometric Left Arrow */}
            <div className="relative w-2.5 h-2.5 border-t-2 border-l-2 border-[#ff6b35] rotate-[-45deg] ml-1 transition-transform group-hover:scale-110" />
          </motion.button>
        ) : !isCommunity ? (
          <motion.div
            className="relative"
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.2 }}
            onClick={() => navigate("/home")}
          >
            <div className="relative px-6 py-3 rounded-2xl overflow-hidden group cursor-pointer">
              {/* Glass background */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/70 to-white/30 backdrop-blur-md" />
              
              {/* Gradient border */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#ff6b35]/40 to-[#ffb088]/40 rounded-2xl blur-sm group-hover:blur-md transition-all" />
              
              <div className="relative flex items-center gap-3">
                {/* Logo mark */}
                <img src={facetLogo} alt="FacetDeck logo" className="w-8 h-8 object-contain" />

                {/* Text */}
                <span className="text-2xl tracking-tight bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] bg-clip-text text-transparent font-semibold">
                  FacetDeck
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}

        {/* Navigation */}
        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-4"
        >
          {COMMUNITY_FEATURE_ENABLED && (
            <motion.button
              onClick={() => navigate("/community")}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-5 py-2 rounded-xl bg-white/60 backdrop-blur-md border border-white/40 hover:bg-white/80 transition-colors font-medium text-[#ff6b35]"
            >
              Community
            </motion.button>
          )}
          
          <motion.a
            href="https://github.com/TownResearcher/facetdeck.git"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-5 py-2 rounded-xl bg-white/60 backdrop-blur-md border border-white/40 hover:bg-white/80 transition-colors font-medium text-[#ff6b35]"
          >
            GitHub
          </motion.a>

          <motion.button
            onClick={() => navigate("/profile")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white font-medium shadow-md shadow-[#ff6b35]/20"
          >
            Profile
          </motion.button>
        </motion.nav>
      </div>
    </motion.header>
  );
}