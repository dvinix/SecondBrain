import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain } from "lucide-react";

const links = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how" },
  { label: "Tech Stack", href: "#stack" },
  { label: "GitHub", href: "https://github.com/dvinix/SecondBrain/" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
        scrolled ? "py-3" : "py-5"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav
          className={`flex items-center justify-between rounded-2xl px-4 sm:px-6 py-3 transition-all duration-500 ${
            scrolled ? "glass-strong shadow-elegant" : "bg-transparent border border-transparent"
          }`}
        >
          <a href="#" className="flex items-center gap-2.5 group">
            <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary grid place-items-center glow-primary">
              <Brain className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display font-semibold text-white tracking-tight text-[17px]">
              SecondBrain
            </span>
          </a>

          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-white transition-colors rounded-md"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/chat"
              className="relative inline-flex items-center gap-1.5 rounded-lg bg-white text-background px-4 py-2 text-sm font-medium hover:bg-white/90 transition-all hover:scale-[1.02]"
            >
              Try Demo
            </a>
          </div>
        </nav>
      </div>
    </motion.header>
  );
}
