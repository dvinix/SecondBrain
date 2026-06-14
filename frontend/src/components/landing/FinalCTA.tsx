import { motion } from "framer-motion";
import { ArrowRight, Github } from "lucide-react";

export function FinalCTA() {
  return (
    <section id="demo" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <motion.div
          animate={{ opacity: [0.3, 0.55, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[900px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(245,158,11,0.35), rgba(96,165,250,0.15) 50%, transparent)" }}
        />
      </div>
      <div className="absolute inset-0 grid-bg opacity-40" />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="font-display text-4xl sm:text-6xl font-semibold text-gradient leading-[1.05]"
        >
          Explore the Future of <span className="text-gradient-brand">Personal Knowledge</span>
        </motion.h2>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <a
            href="/chat"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-secondary px-6 py-3.5 text-sm font-medium text-primary-foreground glow-primary hover:scale-[1.03] transition-transform"
          >
            Try Demo Now
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="https://github.com/dvinix/SecondBrain/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl glass px-6 py-3.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            <Github className="h-4 w-4" />
            View Source Code
          </a>
        </motion.div>
      </div>
    </section>
  );
}
