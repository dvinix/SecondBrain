import { Brain } from "lucide-react";

const cols = [
  { title: "Project", links: ["Features", "How It Works", "Tech Stack"] },
  { title: "Technology", links: ["React", "FastAPI", "Gemini", "Supabase"] },
  { title: "Links", links: ["GitHub", "LinkedIn", "Portfolio", "Contact"] },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border pt-20 pb-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary grid place-items-center">
                <Brain className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
              </div>
              <span className="font-display font-semibold text-white text-lg">SecondBrain</span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground max-w-xs">
              A personal knowledge operating system — built as an exploration of RAG,
              embeddings, and interactive knowledge graphs.
            </p>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <div className="text-xs uppercase tracking-wider text-white font-medium">{c.title}</div>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-muted-foreground hover:text-white transition-colors">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} SecondBrain. Built with care.</div>
          <div>Crafted as an engineering portfolio project.</div>
        </div>
      </div>
    </footer>
  );
}
