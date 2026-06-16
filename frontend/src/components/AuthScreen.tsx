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
        // Supabase might require email confirmation depending on settings
        setError("Check your email for the confirmation link! (If auto-confirm is off)");
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-50 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-md w-full z-10 space-y-8 p-8 sm:p-10 rounded-3xl border border-white/10 bg-zinc-900/50 backdrop-blur-2xl shadow-2xl">
        <div className="flex flex-col items-center">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-6 shadow-inner">
            <Lock className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Knowledge Vault</h2>
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
              className="w-full rounded-xl border border-white/10 bg-black/40 pl-12 pr-5 py-4 text-white placeholder-zinc-500 focus:border-indigo-500/50 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-sm"
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
              className="w-full rounded-xl border border-white/10 bg-black/40 pl-12 pr-5 py-4 text-white placeholder-zinc-500 focus:border-indigo-500/50 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-sm"
              placeholder="Password"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center font-medium bg-red-500/10 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-4 px-4 rounded-xl text-sm font-semibold bg-white text-black hover:bg-zinc-200 transition-all active:scale-[0.98] shadow-lg shadow-white/10 disabled:opacity-50"
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
  );
}
