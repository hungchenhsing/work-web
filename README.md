# work-web · CEEC-TERRA I

移交文件總台賬、週甘特圖與業主計劃的線上工作台。介面以英文為主、簡體中文為輔。

- 網站：靜態檔案，放在 GitHub Pages（`https://hungchenhsing.github.io/work-web/`）
- 數據：Supabase（登入、資料庫、即時同步、檔案存儲）
- 不載入任何外部 CDN 或 Google 字體；程式庫都放在 `vendor/` 內

`config.js` 還沒填 Supabase 時，網站以**演示模式**運行：數據只存在各自瀏覽器，方便先看介面。

---

## 一、上線步驟（約 15 分鐘，只需做一次）

### 1. 建立 Supabase 專案
1. 到 <https://supabase.com> 用 GitHub 帳號登入 → **New project**
2. Name：`work-web`；Region：**Southeast Asia (Singapore)**（離菲律賓最近，大陸也相對較快）；設定一個資料庫密碼並妥善保存
3. 等專案建立完成（約 2 分鐘）

### 2. 建立資料表與權限
1. 左側 **SQL Editor** → **New query**
2. 把 `supabase/schema.sql` 全部內容貼上 → **Run**
3. 看到 `Success` 即完成（可重複執行，不會破壞資料）

### 3. 設定登入網址
**Authentication → URL Configuration**
- Site URL：`https://hungchenhsing.github.io/work-web/`
- Redirect URLs：加入同一網址

### 4. 連接網站
**Project Settings → API**，複製：
- Project URL（`https://xxxx.supabase.co`）
- `anon` `public` key（或新版的 publishable key）

填入 `config.js` 的 `supabaseUrl` 與 `supabaseKey`，推送到 GitHub 即生效。
這兩個值本來就設計成可公開；真正的保護是資料庫裡的行級權限（RLS）。**不要**把 `service_role` / secret key 放進網站。

### 5. 第一次登入
1. 打開網站 → **Create account 註冊** → 到郵箱點確認連結 → 登入
2. **第一個註冊的帳號自動成為管理員**，請你自己先註冊

### 6. 導入數據
**Settings › Project & data › Import Excel**
- 可以直接導入你現有的台賬（會自動識別 文件編號、文件包類別、部門、文件名稱、Document Title、專業、提交階段、實際提交日期、Status、解釋說明、備注、對接人、Updating 等欄）
- 也可以導入週甘特表（序號、任務/文件、Block、計劃開始、計劃結束、完成率、狀態）
- 文件中出現的新文件包、部門、專業、階段、區域會自動加入

### 7. 邀請同事與業主
他們在登入頁自行註冊 → 你在 **Settings › Users & access** 分配角色：

| 角色 | 能做什麼 |
|---|---|
| Admin 管理員 | 全部，含審批用戶 |
| Editor 編輯 | 查看與修改全部項目數據 |
| Viewer 只讀 | 查看全部項目數據 |
| Owner 業主 | **只能**看到你發布的計劃快照，可逐行留言 |
| Pending 待審批 | 什麼都看不到 |

業主的帳號在資料庫層面就讀不到內部台賬，不是靠介面隱藏。

---

## 二、GitHub Pages
倉庫 `hungchenhsing/work-web` → **Settings → Pages** → Source：**Deploy from a branch** → Branch：`main` / `(root)` → Save。
一兩分鐘後網址生效。之後每次推送都會自動更新網站。

> 免費版 GitHub Pages 需要公開倉庫：公開的只有程式碼，**不含任何項目數據**（`.gitignore` 已排除所有 Excel/CSV）。

---

## 三、注意事項
- **中國大陸訪問**：`github.io` 和 `supabase.co` 在大陸不保證穩定。網站本身已不依賴任何外部 CDN；若大陸同事打不開，可以把這個資料夾原樣放到國內靜態托管（需備案的自有網域），Supabase 也可改用國內可達的代理網域。
- **Supabase 免費版**：連續 7 天沒有任何訪問，專案會被暫停，需到控制台手動恢復（數據不會丟）。日常使用不會觸發。
- **備份**：定期在 Settings › Project & data 點 **Export full register** 下載完整 Excel。
- **文件與照片**：存在 Supabase 私有存儲桶 `files`，單檔 ≤ 50 MB，只有已授權的內部角色能看。

---

## 四、檔案結構
```
index.html          頁面骨架
styles.css          樣式（淺色 / 深色主題）
app.js              全部功能
config.js           Supabase 連線設定
demo-data.js        演示模式的通用示例數據（不含真實項目數據）
vendor/             supabase-js 2.117.2、SheetJS 0.18.5
supabase/schema.sql 資料表、權限、存儲桶
```
