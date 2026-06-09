import { motion } from "framer-motion";
import { FileText, Search, Network, Quote } from "lucide-react";

const items = [
  {
    icon: FileText,
    title: "Document Processing",
    desc: "Extract and normalize information from PDFs, notes, and markdown files into clean, chunkable text.",
  },
  {
    icon: Search,
    title: "Semantic Retrieval",
    desc: "Retrieve relevant context using embeddings and vector similarity search across the full library.",
  },
  {
    icon: Network,
    title: "Knowledge Graph Construction",
    desc: "Visualize relationships between documents, concepts, and retrieved information as a live graph.",
  },
  {
    icon: Quote,
    title: "Citation Grounding",
    desc: "Generate responses backed by traceable source references — every claim tied to a chunk.",
  },
];

export function EngineeringChallenges() {
  return (
    <section id="challenges" className="relative py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-wider">
            Engineering
          </div>
          <h2 className="mt-5 font-display text-4xl sm:text-5xl font-semibold text-gradient">
            Engineering Challenges Solved
          </h2>
          <p className="mt-4 text-muted-foreground">
            The four core problems behind making a personal knowledge OS feel effortless.
          </p>
        </motion.div>

        <div className="mt-16 grid sm:grid-cols-2 gap-4">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: (i % 2) * 0.08 }}
              whileHover={{ y: -4 }}
              className="group relative glass rounded-2xl p-7 transition-all hover:border-primary/30"
            >
              <div className="flex items-start gap-4">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 border border-white/10 group-hover:scale-105 transition-transform shrink-0">
                  <it.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    0{i + 1}
                  </div>
                  <h3 className="mt-1 font-display font-semibold text-white text-lg">{it.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{it.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
