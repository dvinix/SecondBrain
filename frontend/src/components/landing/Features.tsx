import { motion } from "framer-motion";
import { Network, Layers, Search, Quote, GitBranch, LayoutGrid } from "lucide-react";

const features = [
  { icon: Network, title: "Knowledge Graph Visualization", desc: "Force-directed graph of documents, concepts, and citations rendered with React Flow." },
  { icon: Layers, title: "Multi-Document Retrieval", desc: "Query across the entire library in one pass — chunks are ranked and merged before generation." },
  { icon: Search, title: "Semantic Search", desc: "Embeddings + pgvector similarity search surface meaning rather than keyword matches." },
  { icon: Quote, title: "Source-Grounded Responses", desc: "Every answer is linked back to the originating chunk, page, and document." },
  { icon: GitBranch, title: "Cross-Document Reasoning", desc: "Synthesize across multiple sources to surface agreements, contradictions, and gaps." },
  { icon: LayoutGrid, title: "Interactive Research Workspace", desc: "Side-by-side graph, chat, and document viewer for exploring an idea end-to-end." },
];

export function Features() {
  return (
    <section id="features" className="relative py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-wider">
            Features
          </div>
          <h2 className="mt-5 font-display text-4xl sm:text-5xl font-semibold text-gradient">
            Features
          </h2>
          <p className="mt-4 text-muted-foreground">
            Six capabilities that turn a folder of files into a connected, queryable
            knowledge system.
          </p>
        </motion.div>

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              whileHover={{ y: -6 }}
              className="group relative glass rounded-2xl p-6 transition-all hover:border-primary/30"
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: "radial-gradient(500px circle at var(--x,50%) var(--y,0%), rgba(245,158,11,0.15), transparent 50%)" }} />
              <div className="relative">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-white/10 group-hover:scale-110 group-hover:rotate-3 transition-transform">
                  <f.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                </div>
                <h3 className="mt-5 font-display font-semibold text-white text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
