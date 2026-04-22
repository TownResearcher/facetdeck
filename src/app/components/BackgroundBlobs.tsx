import { motion } from "motion/react";

export function BackgroundBlobs() {
  const blobs = [
    {
      size: "w-[700px] h-[700px]",
      color: "bg-gradient-to-br from-[#ff6b35]/30 to-[#ff8a5c]/20",
      position: "top-[-15%] left-[-10%]",
      duration: 25,
    },
    {
      size: "w-[550px] h-[550px]",
      color: "bg-gradient-to-br from-[#ffb088]/30 to-[#ffd4bb]/20",
      position: "bottom-[-10%] right-[-5%]",
      duration: 30,
    },
    {
      size: "w-[500px] h-[500px]",
      color: "bg-gradient-to-br from-[#ff8a5c]/25 to-[#ffaa77]/15",
      position: "top-[15%] right-[5%]",
      duration: 28,
    },
    {
      size: "w-[600px] h-[600px]",
      color: "bg-gradient-to-br from-[#ffd4bb]/30 to-[#ffb088]/20",
      position: "bottom-[15%] left-[10%]",
      duration: 32,
    },
  ];

  return (
    <>
      {/* Animated blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {blobs.map((blob, index) => (
          <motion.div
            key={index}
            className={`absolute ${blob.size} ${blob.color} ${blob.position} rounded-full blur-3xl`}
            animate={{
              x: [0, 30, -30, 0],
              y: [0, -30, 30, 0],
              scale: [1, 1.1, 0.9, 1],
            }}
            transition={{
              duration: blob.duration,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Grid pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 107, 53, 0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 107, 53, 0.5) 1px, transparent 1px)
            `,
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      {/* Decorative geometric shapes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Top right corner accent */}
        <motion.div
          className="absolute top-[10%] right-[5%] w-[400px] h-[400px]"
          animate={{
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 40,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <div className="absolute inset-0 border-2 border-[#ff6b35]/10 rounded-full" />
          <div className="absolute inset-8 border-2 border-[#ff8a5c]/10 rounded-full" />
          <div className="absolute inset-16 border-2 border-[#ffb088]/10 rounded-full" />
        </motion.div>

        {/* Bottom left geometric accent */}
        <motion.div
          className="absolute bottom-[5%] left-[10%] w-[300px] h-[300px]"
          animate={{
            rotate: [0, -90, -180, -270, -360],
          }}
          transition={{
            duration: 50,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <div className="absolute inset-0 border-2 border-[#ff6b35]/10 rotate-45" />
          <div className="absolute inset-12 border-2 border-[#ff8a5c]/10 rotate-45" />
        </motion.div>

        {/* Floating lines */}
        <motion.div
          className="absolute top-[40%] left-[8%] w-[200px] h-[2px] bg-gradient-to-r from-transparent via-[#ff6b35]/20 to-transparent"
          animate={{
            x: [0, 50, 0],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-[60%] right-[12%] w-[150px] h-[2px] bg-gradient-to-r from-transparent via-[#ffb088]/20 to-transparent rotate-45"
          animate={{
            x: [0, -30, 0],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>
    </>
  );
}