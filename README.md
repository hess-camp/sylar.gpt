# HCT 中籍美語教務主管會議簽到

手機優先的現場簽到網站。與會者選擇區域、分校與姓名（或當場報名），手寫簽名，再選便當（葷／素／不用餐）。後台以密碼保護，可依區域查看簽名、刪除記錄，並下載 A4 橫式簽到 PDF。

## 本機執行

需要 Node.js 20+ 與 Postgres。

```bash
cp .env.example .env.local
# 編輯 DATABASE_URL 與 ADMIN_PASSWORD
npm install
npm run dev
```

開啟 http://127.0.0.1:43123 。後台在 http://127.0.0.1:43123/admin 。

本機若沒有設定 `BLOB_READ_WRITE_TOKEN`，簽名圖會存在 `data/signatures/`。

## 部署到 Vercel

1. 在 Vercel 新增專案，連接這個 Origin 儲存庫，Framework 選 Next.js。
2. 在專案裡加上 Neon（或 Vercel Postgres）與 Blob 儲存空間，並連到這個專案。資料庫連線會變成 `DATABASE_URL` 或 `POSTGRES_URL`（兩個都讀）；Blob 會注入 `BLOB_READ_WRITE_TOKEN`。
3. 在 Environment Variables 設定 `ADMIN_PASSWORD`（後台密碼）。不要把密碼寫進程式碼。

部署後第一次有人開啟網站，若資料表是空的，會自動寫入 `data/attendees.json`。

## 更換名單

兩種方式，都會整份取代目前名單（已簽到的記錄會留下）：

1. 後台「匯入名單 CSV」。欄位：`編號,區域,分校,中文姓名,英文名`。中文姓名可以空白，畫面就只顯示英文名。區域順序依檔案中第一次出現的順序。
2. 用報名 PDF（`pdftotext -layout` 可抽出文字）產生種子檔：

```bash
python3 scripts/extract_pdf.py path/to/名單.pdf
```

然後清空 `attendees` 資料表再重啟，或把產生的 JSON 轉成 CSV 後在後台匯入。

種子檔 `data/attendees.json` 是 2026.09.29 中籍美語教務主管會議報名名單：96 人、18 個區域，順序與原 CSV 相同。中文姓名空白時，畫面只顯示英文名。

## PDF

「下載簽到記錄」是唯一的匯出。A4 橫式，依區域分組，欄寬 100／150／200／260／其餘 pt，列高 80 pt。中文字型是完整的 Noto Sans CJK TC，以 `subset: false` 嵌入，避免 Chrome 內建 PDF 檢視器吃掉中文。
