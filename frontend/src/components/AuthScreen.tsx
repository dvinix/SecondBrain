import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Lock, Mail, Key } from "lucide-react";

export function AuthScreen({ onAuthSuccess }: { onAuthSuccess: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        // Supabase requires email confirmation
        setError("A verification email has been sent to your inbox. Please verify your email to log in.");
        setLoading(false);
        return;
      }
      onAuthSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4">
      {/* Background glow matching landing page */}
      <div className="absolute -inset-10 -z-10 rounded-[40px] bg-gradient-to-tr from-primary/30 via-secondary/20 to-transparent blur-3xl opacity-60 pointer-events-none" />
      
      <div className="w-full max-w-md z-10 glass-strong rounded-2xl shadow-elegant overflow-hidden">
        {/* Top bar (macOS traffic lights) */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-black/10">
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="ml-3 text-[11px] text-muted-foreground font-['Inter']">secondbrain.app / auth</div>
        </div>

        <div className="p-8 sm:p-10 space-y-8 bg-zinc-900/30">
          <div className="flex flex-col items-center">
          <div className="relative mb-6">
            <img src="/favicon.svg" alt="Logo" className="w-14 h-14 drop-shadow-[0_0_15px_rgba(132,165,157,0.5)]" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-gradient-brand font-['Sora'] pb-1">Welcome Back!</h2>
          <p className="mt-3 text-sm text-zinc-400 text-center leading-relaxed">
            {isLogin ? "Sign in to access your personal knowledge base." : "Create an account to start your vault."}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 pl-12 pr-5 py-4 text-white placeholder-zinc-500 focus:border-primary/50 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-['Inter']"
              placeholder="Email address"
            />
          </div>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 pl-12 pr-5 py-4 text-white placeholder-zinc-500 focus:border-primary/50 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-['Inter']"
              placeholder="Password"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center font-medium bg-red-500/10 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-4 px-4 rounded-xl text-sm font-semibold bg-transparent border border-primary text-primary hover:bg-primary/10 transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(132,165,157,0.15)] disabled:opacity-50 font-['Sora']"
          >
            {loading ? "Authenticating..." : (isLogin ? "Sign In" : "Sign Up")}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
