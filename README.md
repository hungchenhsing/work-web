# work-web · CEEC-TERRA I

光伏项目的線上工作台：**現場施工、資料移交、TDS、尾項、會議紀要**等台賬都在同一個網站，彼此可以互相關聯。介面以英文為主、簡體中文為輔。

- 網站：靜態檔案，放在 GitHub Pages（`https://hungchenhsing.github.io/work-web/`）
- 數據：Supabase（登入、資料庫、即時同步、檔案存儲、修改記錄）
- 不載入任何外部 CDN 或 Google 字體；程式庫都放在 `vendor/` 內

`config.js` 還沒填 Supabase 時，網站以**演示模式**運行：數據只存在各自瀏覽器。

---

## v2 有什麼

| 功能 | 說明 |
|---|---|
| 自訂台賬 | 每個台賬有自己的欄位；可新增、刪除、改名、排序欄位，選擇類型（文字、數字、百分比、日期、選項、分類樹、勾選、網址、檔案/照片、關聯記錄、計算、子表）。 |
| 選項隨時新增 | 專業、區域、人員、分包商等是**共享列表**，也可以直接在單元格裡輸入新選項。 |
| 私有台賬 | 設為「僅自己可見」的台賬只有建立者看得到，**管理員也看不到**（由資料庫權限保證）。附件同樣私有。 |
| 修改記錄 | 每次新增、修改、刪除都由**資料庫觸發器**自動記錄：誰、何時、哪個欄位、舊值→新值。可一鍵撤銷（撤銷本身也被記錄）。 |
| 現場 + 資料 | 總覽按區域（Block B/C/D/E）匯總各台賬進度；「進度計劃」把多個台賬放在同一個甘特圖；記錄之間可以互相關聯（如施工活動 ↔ 竣工圖 ↔ 測試報告）。 |
| 視圖 | 表格（行內編輯、分組、批量修改）、看板（拖動改狀態）、甘特圖（拖動改日期）、區域矩陣（工作包 × 區域的完成量/計劃量）。 |
| 會議 | 議程、紀要、待辦事項（子表），一鍵打印會議紀要；總覽顯示未完成的待辦。 |
| 業主計劃 | 選擇台賬、記錄與欄位發布成固定快照；業主只能看到快照並逐行留言。 |
| Excel | 導入時逐列對應到欄位並預覽；「提交阶段 PH-xx」自動換算成起止日期；導出當前篩選或完整備份。 |

初始模板：移交文件台賬、現場施工、尾項/缺陷清單、會議議程與紀要、TDS 技術數據表（預設私有）。

---

## 從 v1 升級（只做一次）

1. Supabase → **SQL Editor** → **New query** → 貼上新的 `supabase/schema.sql` 全部內容 → **Run**（可重複執行，不會刪除數據）。
2. 以管理員帳號登入網站，頁面頂部會出現 **Set up now 立即設置** → 點擊。
   - 自動建立五個台賬；原有的移交數據、分類樹、區域、專業、部門、對接人會搬到新結構。
   - 舊的 `items` 表保留不動，作為備份。

## 首次部署

1. 建立 Supabase 專案，在 SQL Editor 執行 `supabase/schema.sql`。
2. Authentication → Sign In / Providers → Email：開啟 Email provider，關閉 **Confirm email**。
3. Authentication → URL Configuration：Site URL 與 Redirect URLs 填 `https://hungchenhsing.github.io/work-web/`。
4. Project Settings → API Keys：把 Project URL 與 **Publishable key** 填入 `config.js`。**不要**放 secret / service_role key。
5. GitHub 倉庫 → Settings → Pages → Deploy from a branch → `main` / `(root)`。
6. 第一個註冊的帳號自動成為管理員；登入後點 **Set up now**。

## 角色

| 角色 | 能做什麼 |
|---|---|
| Admin 管理員 | 全部團隊台賬，審批用戶，刪除團隊台賬 |
| Editor 編輯 | 查看與修改團隊台賬，建立台賬 |
| Viewer 只讀 | 查看團隊台賬；可建立自己的私有台賬 |
| Owner 業主 | 只能看發布的快照並留言 |
| Pending 待審批 | 什麼都看不到 |

私有台賬只屬於建立者，與角色無關。

---

## 注意事項
- **中國大陸訪問**：`github.io` 和 `supabase.co` 在大陸不保證穩定。網站本身不依賴外部 CDN；若長期打不開，可把這個資料夾放到國內靜態托管（需備案網域）。
- **Supabase 免費版**：連續 7 天沒有任何訪問會暫停，到控制台恢復即可（數據不會丟）。
- **備份**：Settings › Data & backup 下載 Excel（每個台賬一張表）或 JSON。
- **檔案與照片**：存在私有存儲桶 `files`（路徑 `r/<台賬>/<記錄>/…`），跟隨台賬的可見範圍；單檔 ≤ 50 MB。

## 檔案結構
```
index.html          頁面骨架
styles.css          樣式（淺色 / 深色、手機版）
config.js           Supabase 連線設定
js/core.js          工具、語言、欄位類型、台賬模板
js/store.js         數據層（Supabase / 演示）
js/model.js         欄位取值、篩選、分組、撤銷、v1 遷移、演示數據
js/ui.js            版面、單元格、選擇器、記錄詳情、對話框、登入
js/views1.js        總覽、台賬（表格 / 看板 / 甘特 / 區域矩陣）、進度計劃
js/views2.js        修改記錄、文件、業主計劃、設定、欄位管理
js/excel.js         Excel 導入導出、備份、會議紀要打印
js/main.js          事件與啟動
vendor/             supabase-js 2.117.2、SheetJS 0.18.5
supabase/schema.sql 資料表、權限（含私有台賬）、修改記錄觸發器、存儲桶
```
