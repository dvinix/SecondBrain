import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthScreen } from "@/components/AuthScreen";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate({ to: "/chat" });
      }
    });
  }, [navigate]);

  return <AuthScreen onAuthSuccess={() => navigate({ to: "/chat" })} />;
}
