"use client";

import { useEffect, useRef } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";

export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePadLib(canvas, {
      minWidth: 1.5,
      maxWidth: 3.4,
      penColor: "#1a365d",
      throttle: 12,
    });
    padRef.current = pad;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const data = pad.toData();
      canvas.width = Math.max(rect.width, 1) * ratio;
      canvas.height = Math.max(rect.height, 1) * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      pad.clear();
      if (data.length) pad.fromData(data);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const emit = () => onChangeRef.current(pad.isEmpty() ? null : pad.toDataURL("image/png"));
    pad.addEventListener("endStroke", emit);
    return () => {
      observer.disconnect();
      pad.off();
    };
  }, []);

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-[#b7c6da] bg-white">
        <canvas ref={canvasRef} className="h-56 w-full touch-none sm:h-64" />
        <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-sm text-slate-400">
          請用手指在此簽名
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        onClick={() => {
          padRef.current?.clear();
          onChangeRef.current(null);
        }}
      >
        重簽
      </Button>
    </div>
  );
}
