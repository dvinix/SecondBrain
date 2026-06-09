import { motion } from "framer-motion";

export function WhyBuilt() {
  return (
    <section id="why" className="relative py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-[11px] uppercase tracking-wider text-muted-foreground"
        >
          Project Story
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="mt-4 font-display text-4xl sm:text-5xl font-semibold text-gradient leading-[1.1]"
        >
          Why I Built SecondBrain
        </motion.h2>

        <div className="mt-10 space-y-6 text-lg text-muted-foreground leading-relaxed">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Most valuable information gets trapped inside PDFs, notes, documentation, and
            research papers. Finding connections between ideas often requires manually
            searching across dozens of files.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.18 }}
          >
            SecondBrain was built to transform isolated documents into a connected
            knowledge network that can be explored visually and queried naturally using AI.
          </motion.p>
        </div>
      </div>
    </section>
  );
}
