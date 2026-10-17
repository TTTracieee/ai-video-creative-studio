"use client";
import { useState } from "react";
import { Film, ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/client-api";
import { useRouter } from "next/navigation";
export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="panel login-card">
      <span className="brand-mark">
        <Film />
      </span>
      <h1>A little space for big ideas.</h1>
      <p>This is a private creative studio. Enter the access password to continue.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("auth", "POST", { password });
            router.replace("/");
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Access password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <button className="btn primary full" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}Enter studio
        </button>
      </form>
    </main>
  );
}
