"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type SigninRow = {
  id: string;
  branch: string;
  displayName: string;
  isWalkIn: boolean;
  mealLabel: string;
  signedAt: string;
  signatureUrl: string;
};

type RegionBlock = {
  name: string;
  signins: SigninRow[];
  unsigned: Array<{ branch: string; displayName: string }>;
};

type Overview = {
  counts: {
    meat: number;
    veg: number;
    none: number;
    signed: number;
    walkIn: number;
    unsigned: number;
    registered: number;
  };
  regions: RegionBlock[];
};

export function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SigninRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "讀取失敗");
    setData(json);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, []);

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/signins/${id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "刪除失敗");
      setPendingDelete(null);
      setMessage("已刪除這筆簽到");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/import", { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "匯入失敗");
      setMessage(`已更新名單，共 ${json.count} 人`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "匯入失敗");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-4 py-5">
      <header className="flex flex-col gap-3 rounded-2xl bg-primary px-4 py-4 text-primary-foreground sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-white/70">後台</p>
          <h1 className="text-xl font-semibold">HCT 中籍美語教務主管會議簽到記錄</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href="/api/admin/pdf">下載簽到記錄</a>
          </Button>
          <Button variant="outline" size="sm" className="border-white/30 bg-transparent text-white" onClick={() => void logout()}>
            登出
          </Button>
        </div>
      </header>

      {error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}

      {data ? (
        <>
          <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="已簽到" value={data.counts.signed} />
            <Stat label="未簽到" value={data.counts.unsigned} />
            <Stat label="當場報名" value={data.counts.walkIn} />
            <Stat label="葷" value={data.counts.meat} />
            <Stat label="素" value={data.counts.veg} />
            <Stat label="不用餐" value={data.counts.none} />
            <Stat label="名單人數" value={data.counts.registered} />
          </section>

          <section className="mt-4 rounded-2xl border border-border bg-card p-4">
            <h2 className="font-semibold">匯入名單 CSV</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              欄位：編號,區域,分校,中文姓名,英文名。會取代目前名單，已簽到的記錄會保留。
            </p>
            <label className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-xl bg-secondary px-4 text-sm font-medium text-secondary-foreground">
              選擇 CSV 檔
              <input
                className="sr-only"
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCsv(file);
                  event.target.value = "";
                }}
              />
            </label>
          </section>

          <details className="mt-4 rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer font-semibold">未簽到名單（{data.counts.unsigned}）</summary>
            <div className="mt-3 grid gap-3">
              {data.regions
                .filter((region) => region.unsigned.length)
                .map((region) => (
                  <div key={region.name}>
                    <p className="text-sm font-medium text-primary">{region.name}</p>
                    <ul className="mt-1 text-sm text-muted-foreground">
                      {region.unsigned.map((person) => (
                        <li key={`${region.name}-${person.branch}-${person.displayName}`}>
                          {person.branch} · {person.displayName}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </details>

          <div className="mt-4 grid gap-4">
            {data.regions
              .filter((region) => region.signins.length)
              .map((region) => (
                <section key={region.name} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <h2 className="bg-secondary px-4 py-2 font-semibold">
                    {region.name}（{region.signins.length} 人）
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-[760px] w-full text-left text-sm">
                      <thead className="bg-primary text-primary-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">區域</th>
                          <th className="px-3 py-2 font-medium">分校</th>
                          <th className="px-3 py-2 font-medium">姓名</th>
                          <th className="px-3 py-2 font-medium">簽名</th>
                          <th className="px-3 py-2 font-medium">便當</th>
                          <th className="px-3 py-2 font-medium">簽到時間</th>
                          <th className="px-3 py-2 font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {region.signins.map((row) => (
                          <tr key={row.id} className="border-t border-border align-middle">
                            <td className="px-3 py-2">{region.name}</td>
                            <td className="px-3 py-2">{row.branch}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                {row.displayName}
                                {row.isWalkIn ? <Badge className="bg-amber-50 text-amber-800 ring-amber-200">當場報名</Badge> : null}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={row.signatureUrl} alt={`${row.displayName} 的簽名`} className="h-16 w-40 object-contain" />
                            </td>
                            <td className="px-3 py-2">{row.mealLabel}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{row.signedAt}</td>
                            <td className="px-3 py-2">
                              <Button variant="destructive" size="sm" onClick={() => setPendingDelete(row)}>
                                刪除
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            {data.counts.signed === 0 ? <p className="text-muted-foreground">還沒有人簽到。</p> : null}
          </div>
        </>
      ) : (
        <p className="mt-6 text-muted-foreground">讀取中…</p>
      )}

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogTitle>刪除這筆簽到？</DialogTitle>
          <DialogDescription>
            {pendingDelete?.displayName} 的簽名與便當記錄會一併移除，對方可以重新簽到。
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                取消
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => pendingDelete && void remove(pendingDelete.id)}
            >
              確認刪除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
