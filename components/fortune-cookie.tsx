"use client";

import { useEffect, useState } from "react";
import type { Fortune } from "@/lib/fortunes";

type Drawn = Fortune & { index: number };

function storageKey(id: string) {
  return `hct-fortune:${id}`;
}

function readLocal(id: string) {
  try {
    const value = Number(localStorage.getItem(storageKey(id)));
    return Number.isInteger(value) ? value : null;
  } catch {
    return null;
  }
}

function writeLocal(id: string, index: number) {
  try {
    localStorage.setItem(storageKey(id), String(index));
  } catch {
    // The server copy still keeps the draw if this browser cannot store it.
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FortuneCookie({ signinId }: { signinId: string }) {
  const [ready, setReady] = useState(false);
  const [fortune, setFortune] = useState<Drawn | null>(null);
  const [phase, setPhase] = useState<"closed" | "cracking" | "open">("closed");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const localIndex = readLocal(signinId);
      try {
        const response = await fetch(`/api/fortunes/${signinId}`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled || !response.ok) return;
        if (data.drawn) {
          writeLocal(signinId, data.index);
          setFortune(data);
          setPhase("open");
          return;
        }
        if (localIndex !== null) {
          const saved = await fetch(`/api/fortunes/${signinId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index: localIndex }),
          });
          const savedData = await saved.json();
          if (!cancelled && saved.ok && savedData.drawn) {
            writeLocal(signinId, savedData.index);
            setFortune(savedData);
            setPhase("open");
          }
        }
      } catch {
        if (!cancelled && localIndex !== null) setPhase("closed");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [signinId]);

  async function draw() {
    if (busy || phase !== "closed") return;
    setBusy(true);
    try {
      const response = await fetch(`/api/fortunes/${signinId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok || !data.drawn) return;
      writeLocal(signinId, data.index);
      setFortune(data);
      if (prefersReducedMotion()) {
        setPhase("open");
        return;
      }
      setPhase("cracking");
      window.setTimeout(() => setPhase("open"), 620);
    } catch {
      // Keep the cookie tappable if the network fails.
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="mt-5">
      {phase !== "open" ? (
        <button
          type="button"
          className="mx-auto grid min-h-14 justify-items-center gap-1 text-sm text-[#8a5070]"
          onClick={() => void draw()}
          disabled={busy || phase === "cracking"}
        >
          <span className={`fortune-cookie ${phase === "closed" ? "fortune-wobble" : "is-open"}`} aria-hidden>
            <svg viewBox="0 0 140 88" className="h-20 w-32">
              <g className="fortune-half half-left">
                <path
                  d="M70 18c-22 0-42 12-48 28-4 11 2 22 14 26 8 3 18 1 28-6 4-3 6-6 6-10V18z"
                  fill="#f6d7a2"
                />
                <path d="M38 36c8 6 18 8 28 4" fill="none" stroke="#e7b56a" strokeWidth="2" strokeLinecap="round" />
              </g>
              <g className="fortune-half half-right">
                <path
                  d="M70 18c22 0 42 12 48 28 4 11-2 22-14 26-8 3-18 1-28-6-4-3-6-6-6-10V18z"
                  fill="#f3c98b"
                />
                <path d="M102 36c-8 6-18 8-28 4" fill="none" stroke="#e0a85a" strokeWidth="2" strokeLinecap="round" />
              </g>
              <path d="M58 44c6 8 18 8 24 0" fill="none" stroke="#c9844a" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <span>點我抽今日運勢 🥠</span>
        </button>
      ) : fortune ? (
        <div className="grid justify-items-center gap-2">
          <span className="fortune-cookie is-open" aria-hidden>
            <svg viewBox="0 0 140 88" className="h-16 w-28">
              <g className="fortune-half half-left">
                <path
                  d="M70 18c-22 0-42 12-48 28-4 11 2 22 14 26 8 3 18 1 28-6 4-3 6-6 6-10V18z"
                  fill="#f6d7a2"
                />
              </g>
              <g className="fortune-half half-right">
                <path
                  d="M70 18c22 0 42 12 48 28 4 11-2 22-14 26-8 3-18 1-28-6-4-3-6-6-6-10V18z"
                  fill="#f3c98b"
                />
              </g>
            </svg>
          </span>
          <article className="fortune-slip w-full rounded-3xl bg-[#fffaf3] px-4 py-4 text-left shadow-sm ring-1 ring-[#f3d5e4]">
            <p
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                fortune.grade === "上上" ? "bg-[#ffe0ee] text-[#b44b78]" : "bg-[#efe6ff] text-[#6a4c93]"
              }`}
            >
              {fortune.grade}
            </p>
            <h3 className="mt-2 text-xl font-semibold leading-snug">{fortune.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#6d5274]">{fortune.description}</p>
          </article>
        </div>
      ) : null}
    </div>
  );
}
