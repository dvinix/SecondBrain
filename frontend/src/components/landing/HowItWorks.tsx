import { motion } from "framer-motion";
import { Upload, Cpu, Network, MessageSquare, FileCheck2 } from "lucide-react";

const steps = [
  { icon: Upload, title: "Upload Documents", desc: "PDFs, papers, notes, bookmarks — drop them in." },
  { icon: Cpu, title: "Create Embeddings", desc: "Each chunk is vectorized for meaning-based recall." },
  { icon: Network, title: "Build Knowledge Graph", desc: "Concepts and citations are linked automatically." },
  { icon: MessageSquare, title: "Ask Questions", desc: "Query across everything in natural language." },
  { icon: FileCheck2, title: "Answers With Citations", desc: "Every claim grounded in the source." },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative py-28">
      <div className="absolute inset-0 -z-10 opacity-50"
        style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.08), transparent 60%)" }} />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-wider">
            How it works
          </div>
          <h2 className="mt-5 font-display text-4xl sm:text-5xl font-semibold text-gradient">
            From raw files to living knowledge
          </h2>
        </motion.div>

        <div className="mt-20 relative">
          {/* Center timeline line (desktop) */}
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-primary/30 to-transparent" />

          <div className="space-y-10 lg:space-y-16">
            {steps.map((s, i) => {
              const left = i % 2 === 0;
              return (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.6, delay: 0.05 }}
                  className={`relative grid lg:grid-cols-2 gap-6 items-center ${left ? "" : "lg:[&>*:first-child]:order-2"}`}
                >
                  <div className={`${left ? "lg:text-right lg:pr-16" : "lg:pl-16"}`}>
                    <div className={`inline-flex items-center gap-3 ${left ? "lg:flex-row-reverse" : ""}`}>
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary grid place-items-center glow-primary shrink-0">
                        <s.icon className="h-5 w-5 text-white" strokeWidth={2} />
                      </div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Step {i + 1}</span>
                    </div>
                    <h3 className="mt-4 font-display text-2xl font-semibold text-white">{s.title}</h3>
                    <p className="mt-2 text-muted-foreground max-w-md lg:max-w-none mx-auto lg:mx-0">
                      {s.desc}
                    </p>
                  </div>
                  <div className="hidden lg:block" />

                  {/* center node */}
                  <div className="hidden lg:block absolute left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-primary glow-primary" />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
