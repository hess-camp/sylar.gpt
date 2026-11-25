#!/usr/bin/env python3
"""Convert a meeting CSV into data/attendees.json.

Columns: 編號,區域,分校,中文姓名,英文名
Region order is the order regions first appear. Blank 中文姓名 is kept.

Usage:
  python3 scripts/compile_seed.py path/to/attendees.csv
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "attendees.json"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 scripts/compile_seed.py attendees.csv")
    rows = []
    regions: list[str] = []
    with open(sys.argv[1], encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for record in reader:
            region = (record.get("區域") or "").strip()
            branch = (record.get("分校") or "").strip()
            name_zh = (record.get("中文姓名") or "").strip()
            name_en = (record.get("英文名") or "").strip()
            if not region or not branch or not (name_zh or name_en):
                continue
            if region not in regions:
                regions.append(region)
            seq_raw = (record.get("編號") or "").strip()
            rows.append(
                {
                    "seq": int(seq_raw) if seq_raw.isdigit() else len(rows) + 1,
                    "region": region,
                    "branch": branch,
                    "nameZh": name_zh,
                    "nameEn": name_en,
                }
            )
    payload = {
        "sourceTitle": "2026.09.29 中籍美語教務主管會議 HCT Meeting",
        "seedNote": "報名名單 CSV。區域順序為檔案中第一次出現的順序。",
        "regionOrder": regions,
        "attendees": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} people, {len(regions)} regions -> {OUT}")


if __name__ == "__main__":
    main()
