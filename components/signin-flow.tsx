"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
  signinId: string | null;
};

type Branch = { name: string; people: Person[] };
type Region = { name: string; order: number; branches: Branch[] };
type DirectoryRegion = { name: string; order: number; branches: string[] };

type Done = {
  id: string;
  displayName: string;
  mealLabel: string;
  signedAt: string;
  isWalkIn: boolean;
  emailNote: string;
};

function isOptionalEmail(value: string) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const CUSTOM_BRANCH = "__custom__";

const MEAL_OPTIONS = [
  { id: "meat", label: "🥩 葷" },
  { id: "veg", label: "🥕 素" },
  { id: "none", label: "🙅🏼 不用餐" },
] as const;

const selectClassName =
  "h-14 w-full appearance-none rounded-3xl border border-border bg-white px-4 pr-12 text-base font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-[#fff0f6] disabled:text-muted-foreground";

function CertificateLink({ id, className }: { id: string; className?: string }) {
  return (
    <Button asChild size="lg" variant="secondary" className={className ?? "w-full rounded-3xl"}>
      <a href={`/api/certificates/${id}`} target="_blank" rel="noopener">
        下載出席證明
      </a>
    </Button>
  );
}

function SelectField({
  id,
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="grid gap-2 text-base font-medium">
      {label}
      <span className="relative block">
        <select
          id={id}
          value={value}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          className={selectClassName}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    </label>
  );
}

export function SigninFlow() {
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [directory, setDirectory] = useState<DirectoryRegion[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [walkRegion, setWalkRegion] = useState("");
  const [walkBranch, setWalkBranch] = useState("");
  const [customBranch, setCustomBranch] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [step, setStep] = useState<"pick" | "walkin" | "signature" | "meal" | "done">("pick");
  const [signature, setSignature] = useState<string | null>(null);
  const [meal, setMeal] = useState<"meat" | "veg" | "none" | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [notice, setNotice] = useState("");

  const walkRegionItem = directory?.find((item) => item.name === walkRegion) ?? null;
  const walkBranchName = walkBranch === CUSTOM_BRANCH ? customBranch.trim() : walkBranch.trim();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "名單載入失敗");
      setRegions(data.regions);
      setDirectory(data.branchDirectory ?? []);
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
    setWalkRegion("");
    setWalkBranch("");
    setCustomBranch("");
    setNameZh("");
    setNameEn("");
    setStep("pick");
    setSignature(null);
    setMeal(null);
    setEmail("");
    setDone(null);
    setNotice("");
    void load();
  }

  function selectRegion(name: string) {
    const next = regions?.find((item) => item.name === name) ?? null;
    setNotice("");
    setError("");
    setRegion(next);
    setBranch(null);
    setPerson(null);
  }

  function selectBranch(name: string) {
    const next = region?.branches.find((item) => item.name === name) ?? null;
    setNotice("");
    setError("");
    setBranch(next);
    setPerson(null);
  }

  function selectPerson(id: string) {
    const next = branch?.people.find((item) => item.id === id) ?? null;
    setError("");
    setWalkIn(false);
    setPerson(next);
    if (next?.signed) {
      setNotice(`${next.displayName} 已簽到${next.signedAt ? `（${next.signedAt}）` : ""}`);
      return;
    }
    setNotice("");
  }

  function continueToSignature() {
    if (!person || person.signed) {
      if (person?.signed) {
        setNotice(`${person.displayName} 已簽到${person.signedAt ? `（${person.signedAt}）` : ""}`);
      }
      return;
    }
    setNotice("");
    setError("");
    setWalkIn(false);
    setStep("signature");
  }

  function startWalkIn() {
    if (!directory?.length) {
      setError("分校總清單還沒準備好，請稍後再試");
      return;
    }
    setError("");
    setNotice("");
    setPerson(null);
    setWalkIn(true);
    setWalkRegion("");
    setWalkBranch("");
    setCustomBranch("");
    setNameZh("");
    setNameEn("");
    setStep("walkin");
  }

  async function submit() {
    if (!signature || !meal) return;
    if (walkIn) {
      if (!walkRegion || !walkBranchName || !nameZh.trim()) return;
    } else if (!person) {
      return;
    }
    const trimmedEmail = email.trim();
    if (!isOptionalEmail(trimmedEmail)) {
      setError("Email 格式看起來不太對，請再確認，或先留空");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          walkIn
            ? {
                region: walkRegion,
                branch: walkBranchName,
                nameZh,
                nameEn,
                email: trimmedEmail,
                meal,
                signature,
              }
            : {
                attendeeId: person?.id,
                email: trimmedEmail,
                meal,
                signature,
              },
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "簽到失敗");
      setDone({
        id: String(data.id ?? ""),
        displayName: String(data.displayName ?? ""),
        mealLabel: String(data.mealLabel ?? ""),
        signedAt: String(data.signedAt ?? ""),
        isWalkIn: Boolean(data.isWalkIn),
        emailNote: String(data.emailNote ?? ""),
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "簽到失敗");
    } finally {
      setSubmitting(false);
    }
  }

  const heading =
    step === "signature"
      ? "簽個名吧 ✍️"
      : step === "meal"
        ? "便當要哪一種？🍱"
        : step === "done"
          ? "完成啦 🎉"
          : step === "walkin"
            ? "當場報名 📝"
            : "請先從名單找自己";

  const place = walkIn
    ? `${walkRegion} · ${walkBranchName}`
    : region && branch
      ? `${region.name} · ${branch.name}`
      : "";

  return (
    <main className="signin-theme mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-8 pt-5">
      <header className="rounded-[1.75rem] bg-gradient-to-br from-[#ffd9ea] via-[#ffe7d6] to-[#e7e0ff] px-5 py-5 text-[#4a3358] shadow-sm">
        <p className="text-sm font-medium text-[#8a5070]">🌸 HESS 現場簽到</p>
        <h1 className="mt-1 text-2xl font-semibold leading-snug">嗨，歡迎你</h1>
        <p className="mt-1 text-sm text-[#6d5274]">HCT 中籍美語教務主管會議</p>
      </header>

      <section className="mt-4 flex flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{heading}</h2>
          {step === "walkin" ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setNotice("");
                setError("");
                setWalkIn(false);
                setStep("pick");
              }}
            >
              返回
            </Button>
          ) : null}
          {step === "signature" || step === "meal" ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setError("");
                if (step === "meal") setStep("signature");
                else setStep(walkIn ? "walkin" : "pick");
              }}
            >
              返回
            </Button>
          ) : null}
        </div>

        {loading && <p className="text-muted-foreground">名單載入中…</p>}
        {error && (
          <p className="mb-3 rounded-2xl bg-[#ffe8ea] px-3 py-2 text-sm text-[#9b3040]" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-3 rounded-2xl bg-[#e7f8ef] px-3 py-2 text-sm text-[#1f7a4d]">{notice}</p>
        )}

        {!loading && step === "pick" && (
          <div className="grid gap-4">
            {regions && regions.length > 0 ? (
              <div className="grid gap-4 rounded-[1.75rem] bg-white/90 p-4 shadow-sm ring-1 ring-[#f3d5e4]">
                <div>
                  <p className="text-base font-semibold">從名單找自己 📋</p>
                  <p className="mt-1 text-sm text-muted-foreground">依序選區域、分校和姓名</p>
                </div>
                <SelectField id="region" label="區域" value={region?.name ?? ""} onChange={selectRegion}>
                  <option value="">請選擇區域</option>
                  {regions.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  id="branch"
                  label="分校"
                  value={branch?.name ?? ""}
                  disabled={!region}
                  onChange={selectBranch}
                >
                  <option value="">{region ? "請選擇分校" : "請先選擇區域"}</option>
                  {region?.branches.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  id="person"
                  label="姓名"
                  value={person?.id ?? ""}
                  disabled={!branch}
                  onChange={selectPerson}
                >
                  <option value="">{branch ? "請選擇姓名" : "請先選擇分校"}</option>
                  {branch?.people.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.signed ? `${item.displayName}（已簽到）` : item.displayName}
                    </option>
                  ))}
                </SelectField>

                {person?.signed && person.signinId ? <CertificateLink id={person.signinId} /> : null}

                <Button
                  type="button"
                  size="lg"
                  className="w-full rounded-3xl"
                  disabled={!person || person.signed}
                  onClick={continueToSignature}
                >
                  下一步，簽名
                </Button>
              </div>
            ) : (
              <p className="rounded-3xl bg-white/80 px-4 py-3 text-sm text-muted-foreground">
                目前沒有報名名單。已在名單上的同事請等後台匯入。
              </p>
            )}
            <button
              type="button"
              className="mx-auto min-h-11 px-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={startWalkIn}
            >
              名單裡找不到自己？→ 當場報名
            </button>
          </div>
        )}

        {step === "walkin" && (
          <form
            className="grid gap-4 rounded-[1.75rem] bg-white/90 p-4 shadow-sm ring-1 ring-[#f3d5e4]"
            onSubmit={(event) => {
              event.preventDefault();
              if (!walkRegion) {
                setError("請選擇區域");
                return;
              }
              if (!walkBranchName) {
                setError(walkBranch === CUSTOM_BRANCH ? "請輸入分校名稱" : "請選擇分校");
                return;
              }
              if (!nameZh.trim()) {
                setError("請填寫姓名");
                return;
              }
              setError("");
              setPerson(null);
              setWalkIn(true);
              setStep("signature");
            }}
          >
            <p className="text-sm text-muted-foreground">選區域和分校，再寫下姓名。分校若不在清單裡，可以自己填。</p>
            <SelectField
              id="walk-region"
              label="區域"
              value={walkRegion}
              onChange={(value) => {
                setWalkRegion(value);
                setWalkBranch("");
                setCustomBranch("");
                setError("");
              }}
            >
              <option value="">請選擇區域</option>
              {directory?.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="walk-branch"
              label="分校"
              value={walkBranch}
              disabled={!walkRegion}
              onChange={(value) => {
                setWalkBranch(value);
                if (value !== CUSTOM_BRANCH) setCustomBranch("");
                setError("");
              }}
            >
              <option value="">{walkRegion ? "請選擇分校" : "請先選擇區域"}</option>
              {walkRegionItem?.branches.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value={CUSTOM_BRANCH}>其他分校（自行填寫）</option>
            </SelectField>

            {walkBranch === CUSTOM_BRANCH ? (
              <label className="grid gap-2 text-base font-medium">
                分校名稱
                <Input
                  className="h-14 rounded-3xl"
                  value={customBranch}
                  onChange={(event) => setCustomBranch(event.target.value)}
                  placeholder="輸入名單上沒有的分校"
                />
              </label>
            ) : null}

            <label className="grid gap-2 text-base font-medium">
              姓名
              <Input
                className="h-14 rounded-3xl"
                value={nameZh}
                onChange={(event) => setNameZh(event.target.value)}
                placeholder="例如：王小明"
              />
            </label>
            <label className="grid gap-2 text-base font-medium">
              英文名（選填）
              <Input
                className="h-14 rounded-3xl"
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder="例如：Amy"
              />
            </label>
            <Button type="submit" size="lg" className="w-full rounded-3xl">
              下一步，簽名
            </Button>
          </form>
        )}

        {step === "signature" && (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {walkIn ? `${nameZh} ${nameEn}`.trim() : person?.displayName} · {place}
            </p>
            <p className="text-sm text-muted-foreground">用手指慢慢簽，簽不好可以重來。</p>
            <SignaturePad onChange={setSignature} />
            <Button size="lg" className="rounded-3xl" disabled={!signature} onClick={() => setStep("meal")}>
              下一步
            </Button>
          </div>
        )}

        {step === "meal" && (
          <div className="grid gap-3">
            <label className="grid gap-2 rounded-3xl bg-white px-4 py-3 text-base font-medium ring-1 ring-[#f3d5e4]">
              <span>
                Email
                <span className="ml-2 font-normal text-muted-foreground">選填，但很建議留下</span>
              </span>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                className="h-14 rounded-3xl"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
              <span className="text-sm font-normal text-muted-foreground">簽到後會把出席證明寄到這個信箱</span>
            </label>
            <p className="text-sm text-muted-foreground">選一個就好，沒有標準答案。</p>
            <div className="grid grid-cols-3 gap-2">
              {MEAL_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`min-h-24 rounded-3xl border text-lg font-semibold ${
                    meal === option.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-[#f3d5e4] bg-white"
                  }`}
                  onClick={() => setMeal(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button size="lg" className="rounded-3xl" disabled={!meal || submitting} onClick={() => void submit()}>
              {submitting ? "送出中…" : "送出"}
            </Button>
          </div>
        )}

        {step === "done" && done && (
          <div className="rounded-[1.75rem] bg-white px-5 py-8 text-center shadow-sm ring-1 ring-[#f3d5e4]">
            <p className="text-5xl" aria-hidden>
              🎉
            </p>
            <p className="mt-3 text-sm font-medium text-[#b44b78]">簽到完成</p>
            <p className="mt-2 text-2xl font-semibold">{done.displayName}</p>
            <p className="mt-3 text-base">{done.signedAt}</p>
            <p className="text-sm text-muted-foreground">台灣時間 · 便當：{done.mealLabel}</p>
            <p className="mt-2 text-sm text-[#6d5274]">歡迎您出席，祝您今日收穫滿滿。</p>
            {done.emailNote ? <p className="mt-2 text-sm text-[#6d5274]">{done.emailNote}</p> : null}
            {done.isWalkIn ? <p className="mt-2 text-sm">這次是當場報名</p> : null}
            {done.id ? <CertificateLink id={done.id} className="mt-6 w-full rounded-3xl" /> : null}
            <Button size="lg" className="mt-3 w-full rounded-3xl" onClick={reset}>
              下一位簽到
            </Button>
          </div>
        )}
      </section>

      <footer className="mt-8 pb-1 text-center">
        <a href="/admin" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          後台
        </a>
        <p className="mt-2 text-[11px] tracking-wide text-[#c4aebc]">Created and Managed by EERD</p>
      </footer>
    </main>
  );
}
