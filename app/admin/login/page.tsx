"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登入失敗");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <p className="text-xs text-muted-foreground">HCT 簽到後台</p>
        <h1 className="mt-1 text-2xl font-semibold">請輸入管理密碼</h1>
        <label className="mt-5 grid gap-2 text-sm font-medium">
          密碼
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy || !password}>
          {busy ? "登入中…" : "登入"}
        </Button>
      </form>
    </main>
  );
}
