import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { HeroVisual } from "./HeroVisual";

export function Hero() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 20 });
  const sy = useSpring(my, { stiffness: 50, damping: 20 });
  const bgX = useTransform(sx, (v) => `${v}px`);
  const bgY = useTransform(sy, (v) => `${v}px`);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      mx.set(e.clientX - r.left);
      my.set(e.clientY - r.top);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my]);

  return (
    <section ref={ref} className="relative pt-40 pb-24 sm:pt-48 sm:pb-32 overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px"
        style={{
          background: useTransform(
            [bgX, bgY],
            ([x, y]) =>
              `radial-gradient(600px circle at ${x} ${y}, rgba(139,92,246,0.15), transparent 60%)`,
          ),
        }}
      />
      <div className="absolute inset-x-0 -top-32 h-[520px] pointer-events-none">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[520px] w-[1100px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(139,92,246,0.35), transparent)" }} />
        <div className="absolute left-[20%] top-20 h-[300px] w-[500px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(6,182,212,0.35), transparent)" }} />
      </div>

      {/* Floating particles */}
      {Array.from({ length: 18 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-white/40"
          initial={{
            x: `${(i * 53) % 100}%`,
            y: `${(i * 37) % 100}%`,
            opacity: 0,
          }}
          animate={{
            y: [`${(i * 37) % 100}%`, `${((i * 37) % 100) - 10}%`, `${(i * 37) % 100}%`],
            opacity: [0, 0.7, 0],
          }}
          transition={{
            duration: 6 + (i % 5),
            repeat: Infinity,
            delay: i * 0.3,
            ease: "easeInOut",
          }}
        />
      ))}

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.a
            href="#"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs text-muted-foreground hover:text-white transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Introducing SecondBrain 1.0
            <ArrowRight className="h-3 w-3" />
          </motion.a>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-6 font-display text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-gradient leading-[1.05]"
          >
            Your Personal
            <br />
            <span className="text-gradient-brand">Knowledge Operating System</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto"
          >
            Upload documents, research papers, and notes. Explore connections, retrieve
            knowledge instantly, and interact with your information through AI.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <a
              href="#demo"
              className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-secondary px-5 py-3 text-sm font-medium text-primary-foreground glow-primary hover:scale-[1.02] transition-transform"
            >
              View Demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="https://github.com"
              className="inline-flex items-center gap-2 rounded-xl glass px-5 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors"
            >
              <Play className="h-4 w-4 text-primary" />
              View Source
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="relative mt-20"
        >
          <HeroVisual />
        </motion.div>
      </div>
    </section>
  );
}
