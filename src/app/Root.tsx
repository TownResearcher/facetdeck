import { Outlet } from "react-router";
import { BackgroundBlobs } from "./components/BackgroundBlobs";
import { ParticleTrail } from "./components/ParticleTrail";

export function Root() {
  return (
    <div className="min-h-screen relative overflow-hidden animate-warm-bg text-slate-800">
      <BackgroundBlobs />
      <ParticleTrail />
      <Outlet />
      
      {/* Decorative corner elements shared across pages */}
      <div className="fixed top-0 right-0 w-64 h-64 pointer-events-none z-[-1]">
        <div className="absolute inset-0 bg-gradient-to-bl from-[#ff6b35]/5 to-transparent" />
      </div>
      <div className="fixed bottom-0 left-0 w-96 h-96 pointer-events-none z-[-1]">
        <div className="absolute inset-0 bg-gradient-to-tr from-[#ffb088]/5 to-transparent" />
      </div>
      
      {/* Bottom gradient */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background/80 to-transparent pointer-events-none z-[-1]" />
    </div>
  );
}