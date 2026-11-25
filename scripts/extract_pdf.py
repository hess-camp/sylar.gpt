#!/usr/bin/env python3
"""Extract the HCT attendee PDF into data/attendees.json.

Expected columns, in order: 編號, 區域, 分校, 中文姓名, 英文名.
Blank Chinese names are kept; the app shows the English name alone.
Region order is the order regions first appear.

Usage:
  pdftotext -layout path/to/list.pdf - | python3 scripts/extract_pdf.py
  python3 scripts/extract_pdf.py path/to/list.pdf
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "attendees.json"

HEADER_HINTS = ("編號", "區域", "分校")


def load_text(argv: list[str]) -> str:
    if len(argv) > 1:
        path = argv[1]
        if path == "-":
            return sys.stdin.read()
        completed = subprocess.run(
            ["pdftotext", "-layout", path, "-"],
            check=True,
            capture_output=True,
            text=True,
        )
        return completed.stdout
    return sys.stdin.read()


def split_columns(line: str) -> list[str]:
    return [part.strip() for part in re.split(r"\s{2,}", line.strip()) if part.strip()]


def main() -> None:
    text = load_text(sys.argv)
    rows: list[dict[str, object]] = []
    region_order: list[str] = []
    current_region = ""
    started = False

    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if not started:
            if all(hint in line for hint in HEADER_HINTS):
                started = True
            continue
        parts = split_columns(line)
        if not parts:
            continue
        if parts[0] in {"編號", "區域"} or "頁" == parts[0]:
            continue
        if not re.fullmatch(r"\d+", parts[0]):
            # Continuation / group label. Keep the latest region if the line is just a region name.
            if len(parts) == 1 and not re.search(r"[A-Za-z]", parts[0]):
                current_region = parts[0]
                if current_region not in region_order:
                    region_order.append(current_region)
            continue

        seq = int(parts[0])
        region = current_region
        branch = ""
        name_zh = ""
        name_en = ""
        rest = parts[1:]
        if rest and rest[0] and not re.search(r"[A-Za-z]", rest[0]) and "分校" not in rest[0] and "校" not in rest[0]:
            region = rest.pop(0)
        if rest:
            branch = rest.pop(0)
        if rest:
            if re.search(r"[\u4e00-\u9fff]", rest[0]):
                name_zh = rest.pop(0)
            else:
                name_en = rest.pop(0)
        if rest and not name_en:
            name_en = " ".join(rest)
        elif rest and name_en:
            name_en = f"{name_en} {' '.join(rest)}".strip()
        if region and region not in region_order:
            region_order.append(region)
        current_region = region or current_region
        rows.append(
            {
                "seq": seq,
                "region": region,
                "branch": branch,
                "nameZh": name_zh,
                "nameEn": name_en,
            }
        )

    payload = {
        "sourceTitle": "2026.09.29 中籍美語教務主管會議 HCT Meeting",
        "regionOrder": region_order,
        "attendees": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} rows, {len(region_order)} regions -> {OUT}")


if __name__ == "__main__":
    main()
