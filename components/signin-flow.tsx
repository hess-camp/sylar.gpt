"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/signature-pad";

type Person = {
  id: string;
  displayName: string;
  nameZh: string;
  nameEn: string;
  signed: boolean;
  signedAt: string | null;
};

type Branch = { name: string; people: Person[] };
type Region = { name: string; order: number; branches: Branch[] };

type Done = {
  displayName: string;
  mealLabel: string;
  signedAt: string;
  isWalkIn: boolean;
};

const MEAL_OPTIONS = [
  { id: "meat", label: "葷" },
  { id: "veg", label: "素" },
  { id: "none", label: "不用餐" },
] as const;

export function SigninFlow() {
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [nameZh, setNameZh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [step, setStep] = useState<"pick" | "signature" | "meal" | "done">("pick");
  const [signature, setSignature] = useState<string | null>(null);
  const [meal, setMeal] = useState<"meat" | "veg" | "none" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "名單載入失敗");
      setRegions(data.regions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "名單載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function reset() {
    setRegion(null);
    setBranch(null);
    setPerson(null);
    setWalkIn(false);
    setNameZh("");
    setNameEn("");
    setStep("pick");
    setSignature(null);
    setMeal(null);
    setDone(null);
    setNotice("");
    void load();
  }

  function choosePerson(next: Person) {
    if (next.signed) {
      setNotice(`${next.displayName} 已簽到${next.signedAt ? `（${next.signedAt}）` : ""}`);
      return;
    }
    setNotice("");
    setPerson(next);
    setWalkIn(false);
    setStep("signature");
  }

  async function submit() {
    if (!signature || !meal || !region || !branch) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeId: walkIn ? undefined : person?.id,
          region: region.name,
          branch: branch.name,
          nameZh: walkIn ? nameZh : person?.nameZh,
          nameEn: walkIn ? nameEn : person?.nameEn,
          meal,
          signature,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "簽到失敗");
      setDone(data);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "簽到失敗");
    } finally {
      setSubmitting(false);
    }
  }

  const heading = !region
    ? "請選擇區域"
    : !branch
      ? region.name
      : step === "signature"
        ? "請簽名"
        : step === "meal"
          ? "請選擇便當"
          : step === "done"
            ? "簽到完成"
            : walkIn
              ? "當場報名"
              : `${region.name} · ${branch.name}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-8 pt-5">
      <header className="rounded-2xl bg-primary px-4 py-4 text-primary-foreground shadow-sm">
        <p className="text-xs tracking-wide text-white/75">HESS</p>
        <h1 className="mt-1 text-xl font-semibold leading-snug">HCT 中籍美語教務主管會議</h1>
        <p className="mt-1 text-sm text-white/80">現場簽到</p>
      </header>

      <section className="mt-4 flex flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{heading}</h2>
          {step === "pick" && (region || branch || walkIn) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNotice("");
                if (walkIn) {
                  setWalkIn(false);
                  return;
                }
                if (branch) {
                  setBranch(null);
                  return;
                }
                setRegion(null);
              }}
            >
              返回
            </Button>
          ) : null}
          {step === "signature" || step === "meal" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setError("");
                if (step === "meal") setStep("signature");
                else setStep("pick");
              }}
            >
              返回
            </Button>
          ) : null}
        </div>

        {loading && <p className="text-muted-foreground">名單載入中…</p>}
        {error && (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
        )}

        {!loading && regions && step === "pick" && !region && (
          <div className="grid gap-2">
            {regions.length === 0 ? (
              <p className="text-muted-foreground">目前沒有報名名單。請由後台匯入 CSV。</p>
            ) : (
              regions.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="min-h-14 rounded-2xl border border-border bg-card px-4 text-left text-base font-medium shadow-sm active:bg-muted"
                  onClick={() => {
                    setNotice("");
                    setRegion(item);
                  }}
                >
                  {item.name}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {item.branches.length} 間分校
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {!loading && step === "pick" && region && !branch && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">請選擇分校</p>
            {region.branches.map((item) => (
              <button
                key={item.name}
                type="button"
                className="min-h-14 rounded-2xl border border-border bg-card px-4 text-left text-base font-medium shadow-sm active:bg-muted"
                onClick={() => {
                  setNotice("");
                  setBranch(item);
                }}
              >
                {item.name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{item.people.length} 人</span>
              </button>
            ))}
          </div>
        )}

        {!loading && step === "pick" && region && branch && !walkIn && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">請點選您的姓名</p>
            {branch.people.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 text-left shadow-sm active:bg-muted"
                onClick={() => choosePerson(item)}
              >
                <span className="text-base font-medium">{item.displayName}</span>
                {item.signed ? <Badge>已簽到</Badge> : null}
              </button>
            ))}
            <Button
              variant="secondary"
              size="lg"
              className="mt-2"
              onClick={() => {
                setNotice("");
                setWalkIn(true);
                setNameZh("");
                setNameEn("");
              }}
            >
              當場報名
            </Button>
          </div>
        )}

        {step === "pick" && walkIn && region && branch && (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!nameZh.trim() && !nameEn.trim()) {
                setError("請填寫中文姓名或英文名");
                return;
              }
              setError("");
              setPerson(null);
              setStep("signature");
            }}
          >
            <p className="text-sm text-muted-foreground">
              {region.name} · {branch.name}
            </p>
            <label className="grid gap-1 text-sm font-medium">
              中文姓名
              <Input value={nameZh} onChange={(event) => setNameZh(event.target.value)} placeholder="例如：王小明" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              英文名（選填）
              <Input value={nameEn} onChange={(event) => setNameEn(event.target.value)} placeholder="例如：Amy Wang" />
            </label>
            <Button type="submit" size="lg">
              下一步，簽名
            </Button>
          </form>
        )}

        {step === "signature" && (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {walkIn
                ? `${nameZh} ${nameEn}`.trim()
                : person?.displayName}{" "}
              · {branch?.name}
            </p>
            <SignaturePad onChange={setSignature} />
            <Button size="lg" disabled={!signature} onClick={() => setStep("meal")}>
              下一步
            </Button>
          </div>
        )}

        {step === "meal" && (
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              {MEAL_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`min-h-20 rounded-2xl border text-lg font-semibold ${
                    meal === option.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card"
                  }`}
                  onClick={() => setMeal(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button size="lg" disabled={!meal || submitting} onClick={() => void submit()}>
              {submitting ? "送出中…" : "送出"}
            </Button>
          </div>
        )}

        {step === "done" && done && (
          <div className="rounded-3xl border border-border bg-card px-5 py-8 text-center shadow-sm">
            <p className="text-sm text-emerald-700">簽到完成</p>
            <p className="mt-2 text-2xl font-semibold">{done.displayName}</p>
            <p className="mt-3 text-base">{done.signedAt}</p>
            <p className="text-sm text-muted-foreground">台灣時間 · 便當：{done.mealLabel}</p>
            {done.isWalkIn ? <p className="mt-2 text-sm">當場報名</p> : null}
            <Button size="lg" className="mt-6 w-full" onClick={reset}>
              下一位簽到
            </Button>
          </div>
        )}
      </section>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        <a href="/admin" className="underline-offset-2 hover:underline">
          後台
        </a>
      </footer>
    </main>
  );
}
