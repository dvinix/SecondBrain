import { motion } from "framer-motion";

const groups = [
  {
    title: "Frontend",
    items: ["React", "Tailwind CSS", "Framer Motion", "React Flow"],
  },
  {
    title: "Backend",
    items: ["FastAPI", "Python"],
  },
  {
    title: "AI Layer",
    items: ["Gemini API", "Embeddings", "RAG Pipeline"],
  },
  {
    title: "Data Layer",
    items: ["Supabase", "pgvector"],
  },
];

export function TechStack() {
  return (
    <section id="stack" className="relative py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-wider">
            Tech Stack
          </div>
          <h2 className="mt-5 font-display text-4xl sm:text-5xl font-semibold text-gradient">
            Built with modern tooling
          </h2>
          <p className="mt-4 text-muted-foreground">
            A pragmatic stack chosen for performance, developer experience, and AI-native workflows.
          </p>
        </motion.div>

        <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {groups.map((g, gi) => (
            <motion.div
              key={g.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: gi * 0.06 }}
              className="glass rounded-2xl p-6"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {g.title}
              </div>
              <ul className="mt-5 space-y-2">
                {g.items.map((name) => (
                  <li
                    key={name}
                    className="group flex items-center gap-3 rounded-lg border border-border/60 bg-surface/40 px-3 py-2.5 transition-colors hover:border-primary/40"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary group-hover:scale-150 transition-transform" />
                    <span className="text-sm text-white/90 font-medium">{name}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
