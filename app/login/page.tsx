import { LoginView } from "@/components/login-view";
import { LiveLoginView } from "@/components/live-login-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  return isSupabaseConfigured() ? <LiveLoginView /> : <LoginView />;
}
