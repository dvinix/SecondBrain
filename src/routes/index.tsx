import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { EngineeringChallenges } from "@/components/landing/EngineeringChallenges";
import { TechStack } from "@/components/landing/TechStack";
import { WhyBuilt } from "@/components/landing/WhyBuilt";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SecondBrain — Personal Knowledge Operating System" },
      { name: "description", content: "Upload documents, research papers, and notes. Explore connections, retrieve knowledge instantly, and interact with your information through AI." },
      { property: "og:title", content: "SecondBrain — Personal Knowledge OS" },
      { property: "og:description", content: "An AI-powered knowledge OS with semantic retrieval, source-grounded answers, and an interactive knowledge graph." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-clip">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[1200px] rounded-full blur-3xl opacity-25"
          style={{ background: "radial-gradient(closest-side, rgba(245,158,11,0.35), transparent)" }} />
      </div>

      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <EngineeringChallenges />
        <TechStack />
        <WhyBuilt />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
