import Image from "next/image";
import { LinkButton } from "@/components/ui/button";
import { SketchfabBackground, ThemeToggle } from "@/components/ui";
import * as motion from "framer-motion/client";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden min-h-[100dvh] shader-mesh-bg">
      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>
      
      <div className="absolute inset-0 z-0 pointer-events-none">
        <SketchfabBackground modelId="cec2957661f34c15987ff3a782f92bb2" />
      </div>
      
      <main className="relative z-10 flex flex-1 flex-col justify-center p-8 md:p-16 lg:p-24 w-full max-w-[1600px] mx-auto pointer-events-none">
        <motion.div
          className="max-w-[480px] w-full flex flex-col items-start text-left bg-black/40 backdrop-blur-md p-10 rounded-[2.5rem] border border-white/10 pointer-events-auto shadow-2xl"
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8"
          >
            <div className="p-3 bg-white/10 dark:bg-black/10 backdrop-blur-xl rounded-[1.5rem] border border-white/20 shadow-xl inline-block">
              <Image src="/brand/logo-256.png" alt="Coral Adventures" width={48} height={48} className="rounded-xl shadow-inner" priority />
            </div>
          </motion.div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-white drop-shadow-lg leading-[1.1] mb-6">
            Operations & Intelligence
          </h1>
          
          <p className="text-base md:text-lg text-white/80 font-medium leading-relaxed max-w-2xl mb-10">
            The offline-first decision-support platform running the fleet — from trip capture to forecasting and recommendations.
          </p>
          
          <motion.div 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <LinkButton 
              href="/dashboard" 
              size="lg" 
              className="bg-ocean-600 text-white hover:bg-ocean-500 shadow-xl shadow-ocean-900/50 font-bold rounded-full px-8 py-6 text-lg transition-transform active:scale-95"
            >
              Open Dashboard
            </LinkButton>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
