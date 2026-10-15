# LawnStudio 造型製作系統規格書

| 項目 | 內容 |
|---|---|
| 版本 | v0.3（草案） |
| 日期 | 2026-10-15 |
| 上層文件 | [SPEC.md](SPEC.md)（遊戲本體規格）、[COLLAB.md](COLLAB.md)（分工與資料夾歸屬） |
| 範圍 | 造型製作系統 LawnStudio：工具功能、素材流程，以及角色、怪物、地圖的美術製作規格與內容資料格式 |
| 維護 | 編輯器 agent（`lawngame2d-91`） |

本文件自 SPEC.md v0.4 抽出。遊戲玩法、博奕規則、執行時系統以 [SPEC.md](SPEC.md) 為準；美術怎麼畫、工具怎麼檢查、輸出什麼資料，以本文件為準。

| 版本 | 變更 |
|---|---|
| v0.1 | 初版 |
| v0.2 | 路徑改為 COLLAB 配置（`editor/`、`game/shared`、`game/engine`、`editor/tools/`）；新增 §8.1 檔名與路徑慣例、Aseprite 匯出參數、`manifest.json`；§9 足場拆成地面／牆／天花板，補上座標慣例 |
| v0.3 | **角色不換裝、不換色，只換武器**：§4 改為「角色與武器」（四職業共用一個主角），移除換裝部件、錨點部件、調色盤與換色；§8、§9 同步 |

---

## 1. 定位與分工

**畫圖在 Aseprite、畫地圖在 LDtk，LawnStudio 負責把素材變成遊戲資料**，包括設定參數、檢查規格、預覽組合、試玩。

| 工具 | 負責 |
|---|---|
| Aseprite | 角色、武器、怪物、特效、UI、地形 tileset 的繪製與動畫 |
| Laigter | 從地形與背景圖自動產生法線貼圖（之後手修） |
| LDtk | 地圖繪製：碰撞格、自動拼貼、裝飾、實體（傳送點、生怪區、光源） |
| **LawnStudio** | 武器登錄與姿勢表、怪物參數、地圖後處理（足場、導航圖、主題光影）、房間表、規格檢查、預覽與試玩 |

| 頁面 | 內容 | 章節 |
|---|---|---|
| 角色造型 | 角色（四職業共用、外觀固定）與各職業的武器 | [§4](#4-角色與武器) |
| 怪物 | 怪物動作、判定、行為、演出、數值 | [§5](#5-怪物製作) |
| 地圖 | LDtk 匯入與後處理、主題、光影、導航圖、試玩 | [§6](#6-地圖) |
| 房間表 | 20 房設定 | [§7](#7-房間表) |

---

## 2. 技術與素材流程

| 項目 | 規格 |
|---|---|
| 技術 | Vite + React + TypeScript |
| 預覽畫布 | 直接使用遊戲的 `game/engine`（`@lawn/engine`，Phaser 4），看到的就是遊戲裡的樣子 |
| 共用邏輯 | `game/shared`（`@lawn/shared`）：內容 schema、Aseprite JSON 解析、足場物理、導航圖。編輯器唯讀引用，不複製 |
| 執行環境 | 網頁工具，使用 Chrome 或 Edge（需要 File System Access API）。開啟時選擇專案根目錄，直接讀寫 `content/`、唯讀 `art/`，不需要後端 |
| 專案位置 | `editor/`（獨立 npm 專案；CLI 工具在 `editor/tools/`） |

**素材流程**

```
art/**/*.aseprite ──(editor：npm run art，Aseprite CLI 批次匯出)──→ content/**/*.png + *.sheet.json
art/maps/world.ldtk ──(LawnStudio 地圖頁 / editor/tools/ldtk-convert)──→ content/maps/*.json
LawnStudio：登錄、設定參數、檢查規格、預覽 ──→ content/**/*.json、content/manifest.json
遊戲（game/engine）只讀 content/
```

**Aseprite 匯出**

一般 sheet（怪物、特效、tileset、背景）：

```bash
aseprite -b art/monsters/mob_0001.aseprite \
  --format json-array --list-tags --list-slices --list-layers \
  --sheet-type packed --trim --shape-padding 1 \
  --filename-format "{frame}" \
  --sheet content/monsters/mob_0001.png --data content/monsters/mob_0001.sheet.json
```

角色與武器（分圖層、略過空白幀。角色檔不加 `--ignore-layer _body`，`body` 就是它自己的圖層）：

```bash
aseprite -b art/avatar/items/weapon_0001.aseprite \
  --format json-array --list-tags --list-slices --list-layers \
  --split-layers --ignore-empty --ignore-layer _body \
  --sheet-type packed --trim --shape-padding 1 \
  --filename-format "{layer}|{frame}" \
  --sheet content/avatar/items/weapon_0001.png --data content/avatar/items/weapon_0001.sheet.json
```

- 名稱以 `_` 開頭的圖層是參考用（例如 `_guide`、`_body`），不會匯出：匯出腳本先用 `--list-layers` 讀出圖層，對每個 `_` 開頭的圖層加上 `--ignore-layer`。
- `--filename-format`：一般 sheet 的 frame 名稱是時間軸幀號（從 0 起）；角色與武器 sheet 是 `{圖層}|{幀號}`。動作（Tag）一律由 `frameTags` 的幀號區間推算，不從 frame 名稱解析。詳見 §8.1。
- 匯出後由腳本把 `meta.image` 改成 PNG 檔名（不含資料夾），讓路徑與 Aseprite 執行時的工作目錄無關。
- Aseprite 執行檔路徑由環境變數 `ASEPRITE_PATH` 指定。
- `npm run art`（在 `editor/` 執行）匯出所有變更過的檔案；`npm run art:watch` 監看 `art/` 自動重新匯出，LawnStudio 偵測到 `content/` 更新會自動重新載入。

---

## 3. 共通介面

```
┌ LawnStudio ─ [角色造型] [怪物] [地圖] [房間表] ─────── [驗證] [匯出] ┐
│ 資源樹        │            預覽畫布               │ 屬性面板         │
│               │                                   │                  │
├───────────────┴───────────────────────────────────┴──────────────────┤
│ 動作 [run ▼] ▶ ■   幀 ◀ 3/8 ▶   姿勢 2   洋蔥皮 □  光照 ☑  縮放 ×4   │
└──────────────────────────────────────────────────────────────────────┘
```

- 預覽可整數倍放大檢查像素，可切換光照預覽（明亮場景／暗場景）。
- 復原／重做、自動存草稿。草稿存在瀏覽器的 IndexedDB，按「匯出」才寫入 `content/`；上次開啟的專案資料夾也記在 IndexedDB，下次開啟時只需再授權一次。
- 驗證面板：錯誤擋匯出，警告不擋。
- ID 規則：`{分類}_{4 位數}`，例如 `weapon_0001`、`mob_0003`、`map_0001`、`theme_0001`。
- 所有資料檔都帶 `schemaVersion`，改格式時寫 migration。

---

## 4. 角色與武器

遊戲中只有**一個主角，四個職業共用**，外觀固定：不換裝、不換色。**只有武器可以更換**，每個職業可以有多把武器。角色在遊戲中如何組裝與播放，見 [SPEC.md §4.3](SPEC.md#43-紙娃娃)。

**做法：角色畫很多幀，武器只畫「姿勢」。** 角色 67 幀，動作接近 Dead Cells 的流暢度；武器每個動作只畫少數幾張姿勢，角色每一幀指定使用哪一張，並依 `hand` 錨點的位移對齊，中間幀自動沿用最接近的姿勢。刀光、殘影等流暢感來源放在通用特效層，不屬於武器。

### 4.1 角色檔

`art/avatar/avatar_base.aseprite`（匯出為 `content/avatar/base.png` + `base.sheet.json`）

- 楓之谷式 Q 版 2.5 頭身，身高約 56–64 像素，頭部佔身高約 45%。
- 畫布 128×128，腳底中心固定在 (64, 120)；匯出時用 `--trim` 去掉空白。
- 每個動作是一個 Tag。分圖層畫：`body`（完整角色，含頭與後手臂）、`arm_front`（前手臂，要蓋在武器握把上；動作中前手臂沒有蓋到武器時可以不畫）。
- 匯出時分圖層（`--split-layers`），因為武器要夾在 `body` 與 `arm_front` 之間。
- 1 像素深色描邊，用同色系深色，不用純黑。
- 錨點用 Slice 標記，逐幀設定 pivot：

| Slice | 用途 |
|---|---|
| `hand` | 武器的對齊點；也是特效發射點（魔法彈、飛鏢、箭的起點） |
| `torso` | 背在身後的武器部分（`weapon_back`：弓、箭袋、劍鞘）的對齊點 |
| `head` | 選用：頭頂特效、名稱標籤的位置 |

### 4.2 動作與幀數預算

| 動作 | Tag | 角色幀數 | 武器姿勢數 |
|---|---|---|---|
| 待機 | `stand` | 6 | 2 |
| 跑步 | `run` | 8 | 4 |
| 起跳 | `jump` | 2 | 1 |
| 下落 | `fall` | 2 | 1 |
| 落地 | `land` | 2 | 1 |
| 翻滾（滑衝） | `roll` | 6 | 3 |
| 趴下 | `prone` | 1 | 1 |
| 爬梯 | `ladder` | 4 | 0（收起武器） |
| 爬繩 | `rope` | 4 | 0（收起武器） |
| 劍士三連斬 | `swing1` `swing2` `swing3` | 5 × 3 | 2 × 3（只有劍士武器） |
| 法師攻擊 | `cast` | 6 | 3（只有法師武器） |
| 弓箭手攻擊 | `shoot` | 6 | 3（只有弓箭手武器） |
| 刺客攻擊 | `throw` | 5 | 2（只有刺客武器） |
| **合計** | 15 個 Tag | **67** | 通用 13 + 職業攻擊 2–6 |

- 角色 67 幀；每把武器只要畫 15–19 張姿勢圖（通用 13 張 + 自己職業的攻擊動作）。這是**最少**的數量：角色的手在幀間位移較大時（例如原畫主角在幾張關鍵姿勢間切換），可以每一幀都畫，規格檢查只要求每個需要的動作至少有一張。
- 翻滾設計成「壓低身體向前滑衝」。
- 技能沿用攻擊動作加特效，不另畫角色動作。

### 4.3 圖層順序

由後到前：

| # | 圖層 | 內容 | 來源 | 對齊錨點 |
|---|---|---|---|---|
| 1 | `weapon_back` | 背在身後的武器部分（弓、箭袋、劍鞘） | 武器 | `torso` |
| 2 | `body` | 角色 | 角色檔 | – |
| 3 | `weapon` | 主武器 | 武器 | `hand` |
| 4 | `arm_front` | 前手臂（蓋在握把上） | 角色檔 | – |

### 4.4 武器製作流程

- **畫在角色檔的複本上：** 複製角色檔 → 角色圖層改名為 `_body` 並鎖住當參考 → 新增 `weapon`（需要時加 `weapon_back`）圖層 → 每個 Tag 只在「姿勢幀」上畫 → 存成 `art/avatar/items/weapon_0001.aseprite`。所以武器 sheet 的幀號 = 角色的幀號，Tag 也相同。匯出時只輸出武器圖層，空白幀自動略過。
- **要畫的動作：** 通用動作（`stand`、`run`、`jump`、`fall`、`land`、`roll`、`prone`）＋ 自己職業的攻擊動作。爬梯、爬繩時收起武器，不用畫；沒有畫姿勢的動作，遊戲會隱藏武器。
- **姿勢表：** 一個 Tag 內，武器圖層實際有畫的幀就是它的姿勢。角色每一幀用哪個姿勢預設依時間平均分配（例：`run` 角色 8 幀、武器 4 姿勢 → 每 2 幀共用一個姿勢），可用 `poseMap` 逐幀改指定。武器跟著 `hand`（`weapon_back` 跟著 `torso`）相對於姿勢幀的位移移動。對不準的幀可在工具中改指定其他姿勢，或加畫一張。
- **錨點對齊：** 工具中可拖曳設定整把武器的額外偏移（`offset`）。
- **顏色固定：** 武器不換色。押注等級外觀（SPEC §3.2）由遊戲用刀光、發光等特效處理，不另畫武器。

### 4.5 工具功能

| 功能 | 說明 |
|---|---|
| 角色 | 載入角色檔，列出 Tag、幀數、錨點；檢查 15 個 Tag 與 67 幀、`body` 圖層、`hand` 與 `torso` Slice |
| 武器登錄 | 掃描新匯出的武器 → 設定名稱、職業 |
| 姿勢表 | 顯示每個 Tag「角色幀 → 武器姿勢」的對應；預設自動分配，可逐幀改指定；逐幀播放檢查有沒有穿幫 |
| 規格檢查 | 必須設定職業；通用動作與自己職業的攻擊動作都要有姿勢圖；只能使用 `weapon`、`weapon_back` 圖層 |
| 錨點對齊 | 拖曳設定武器的偏移 |
| 試穿 | 選職業、武器、動作；逐幀播放；截圖。遊戲預覽可看押注等級外觀與光照 |
| 圖示 | 武器自動渲染成 32×32 圖示（像素風，不縮放模糊） |

---

## 5. 怪物製作

怪物在遊戲中的行為、等級、怪潮，見 [SPEC.md §3.8](SPEC.md#38-怪物)。

### 5.1 美術規格

- 每隻怪物一個 Aseprite 檔：`art/monsters/mob_0001.aseprite`。
- 尺寸：一般 24–48、菁英 64–96、Boss 128–192 像素高。
- 腳底中心對齊畫布底部中心；預設面向左，向右時由遊戲水平翻轉。
- 必備四個動作，即四個 Tag，名稱固定。幀數比楓之谷多，動作更流暢：

| 動作 | Tag | 建議幀數 | 循環 | 說明 |
|---|---|---|---|---|
| 移動 | `move` | 6–8 | 是 | 巡邏、飛行 |
| 待機 | `idle` | 4–6 | 是 | 停下時 |
| 受擊 | `hit` | 2–3 | 否 | 總長 ≤ 0.3s；閃白由遊戲處理，不用畫 |
| 死亡 | `die` | 6–10 | 否 | 要有爆散感（Dead Cells 式）；碎片與光暈交給特效層與粒子，動畫本身專注在身體崩解 |

- 選配：Boss 的 `appear`（登場）。
- Slice：`hitbox`（判定框）、`label`（倍率標籤與血條位置，取 pivot）。
- 同一房的怪物會打包成同一張圖集，方便合批。

### 5.2 工具功能

| 功能 | 說明 |
|---|---|
| 匯入 | 讀取 Aseprite 匯出的 sheet + JSON |
| 動作檢查 | 檢查四個必備 Tag `move`、`idle`、`hit`、`die`，名稱不同可手動對應；**缺任何一個就不能匯出**。可調整各幀時間（預設用 Aseprite 的設定） |
| 判定 | 讀取 Slice `hitbox` 與 `label`；沒有時可在工具中拖曳設定 |
| 行為 | 移動類型（地面／飛行／靜止）、速度、idle 與 move 時間區間、受擊擊退距離、死亡淡出時間 |
| 演出 | 受擊特效、死亡特效、音效、噴金幣的幀與數量、是否顯示血條、是否帶光源 |
| 數值 | 等級、倍率（固定或區間）、特殊玩法 → 存成獨立的數值檔（正式版只放伺服器）。倍率規則見 SPEC.md §3.1 |
| 預覽 | 四個動作輪播；模擬「受擊（含頓幀、閃白）→ 死亡 → 噴金幣」；顯示判定框；放在地板上測試巡邏；切換明暗場景看受光效果 |

---

## 6. 地圖

地圖在遊戲中的執行（足場物理、光影、傳送點、換房），見 [SPEC.md](SPEC.md) §3.5、§3.7、§4.2。

### 6.1 LDtk 專案規格

`art/maps/world.ldtk`

- 20 個關卡放在同一個專案，關卡名稱 `Room01` – `Room20`。
- 關卡欄位：`roomId`（整數）、`theme`（主題 ID）、`bgm`。
- 格子大小 16×16。

| 圖層 | 類型 | 內容 |
|---|---|---|
| `Collision` | IntGrid 16px | 見下表 |
| `Terrain` | Auto-layer（依 `Collision` 自動拼貼） | 地形圖塊 |
| `DecorBack` / `DecorFront` | Tiles | 手動擺放的裝飾圖塊；前景可半透明遮擋，增加景深 |
| `Entities` | Entities | 見下表 |

| `Collision` 值 | 名稱 | 說明 |
|---|---|---|
| 1 | 實地 | 不可穿越；頂面為足場，側面為牆 |
| 2 | 單向平台 | 可從下方跳上、`↓ + 跳` 穿下 |
| 3 | 上坡 | 45°，左低右高 |
| 4 | 下坡 | 45°，左高右低 |
| 5 | 繩索 | 垂直連續的格子組成一條繩 |
| 6 | 梯子 | 同上 |

| 實體 | 欄位 |
|---|---|
| `PlayerSpawn` | — |
| `Portal` | `type`（next／prev／toRoom）、`toRoom` |
| `SpawnZone`（矩形） | `maxCount`、`respawnSec`、`mobs`（字串陣列，格式 `mob_0001:3`，冒號後為權重） |
| `WaveEntry` | 怪潮的湧入點與方向 |
| `BossSpawn` | `mobId`、`intervalSec` |
| `Light` | `color`、`radius`、`intensity`、`flicker` |
| `Decor` | 不對齊格子的裝飾物件（圖塊欄位）、`layer`（back／front） |

### 6.2 主題美術

每套主題包含：

- 16×16 地形 tileset（Aseprite 繪製）＋法線貼圖（Laigter 產生後手修）。
- LDtk 自動拼貼規則。先做好 1 套主題的 tileset 與規則，其他主題複製後換圖。
- 背景組：遠景、中景、近景，各有視差係數，可設定水平重複與自動捲動；背景也可帶法線貼圖。
- 環境光顏色與亮度。例：森林白天偏亮、洞窟偏暗、廢墟夜晚帶藍紫月光。

### 6.3 工具功能

| 功能 | 說明 |
|---|---|
| 匯入 | 讀取 `world.ldtk`，偵測存檔後自動重新匯入 |
| 足場產生 | 依 `Collision` 產生足場折線（含斜坡）、牆、繩梯，疊在地圖上顯示 |
| 主題 | 編輯各主題的背景組（視差圖層、rx／ry、重複、自動捲動）、環境光顏色與亮度；拖動假鏡頭預覽 |
| 光影預覽 | 即時顯示光源與法線效果，可切換高／低畫質 |
| 導航圖 | 依遊戲共用的跳躍物理一鍵產生（跑、跳上、下跳、繩梯、翻滾、傳送點）；可手動增刪連線；視覺化顯示 |
| 驗證 | 到不了的平台、傳送點目標是否存在、生怪區是否在足場上、出生點是否在地面、每房是否都有下一房與上一房傳送點、怪潮湧入點是否存在 |
| 試玩 | 一鍵用 `createGame()` 啟動目前的地圖（真遊戲 + LocalServer），按 Esc 回到工具 |
| 小地圖 | 自動產生 |
| 輸出 | 轉換後的地圖 JSON 寫入 `content/maps/` |

### 6.4 LDtk → MapDef 轉換規則

轉換是瀏覽器可執行的純函式（輸入已 parse 的 LDtk JSON，輸出 `MapDef[]`），位於 `editor/src/ldtk/`；`editor/tools/ldtk-convert` 是 CLI 外殼。

| 項目 | 規則 |
|---|---|
| 關卡 → 地圖 | `Room01`–`Room20`；`id = map_{roomId 補滿 4 位}`、`name` = 關卡名稱；`theme`、`bgm` 取關卡欄位 |
| 地面（footholds） | 實地（1）上方不是實地／斜坡時，頂邊是地面；單向平台（2）只有頂邊，`oneWay: true`；上坡（3）是左下到右上的對角線、下坡（4）是左上到右下。端點相接的地面合併成一條折線，共線的線段合併成一段 |
| 實心邊 | 每種格子哪些邊是「整條實心」：實地 = 上下左右；上坡 = 下、右；下坡 = 下、左；其他 = 無 |
| 牆（walls） | 格子的左／右邊是實心、而相鄰格對應的那條邊不是實心時產生；同一條 x 上連續的牆合併。例：上坡右側接空氣 → 有牆；上坡右側接實地 → 沒有牆 |
| 天花板（ceilings） | 格子的底邊是實心（實地、斜坡）、而下方格子的頂邊不是實心時產生；同一個 y 上連續的合併。單向平台沒有天花板 |
| 繩梯（climbables） | 同一欄連續的繩索（5）或梯子（6）合併成一條 |
| 實體座標 | 取實體的 pivot 點（建議 pivot 設在底部中央，代表「腳底」位置）；`SpawnZone` 取整個矩形 |
| 生怪區 | `footholdIds` = 與矩形相交的地面；`mobs` 的 `mob_0001:3` 轉成 `{ mobId, weight }`，沒寫權重視為 1 |
| 傳送點 | `PlayerSpawn` → `type: 'spawn'`；`Portal.type` 可以是字串或 LDtk enum，值為 `next`／`prev`／`toRoom` |
| 圖塊層 | `Terrain`、`DecorBack` → `z: 'back'`；`DecorFront` → `z: 'front'`；tileset 依 LDtk tileset 的 identifier 對應到 `tilesets/{identifier}.png` |
| 鏡頭範圍 | 預設整個關卡 |
| 導航圖 | 呼叫 `@lawn/shared` 的 `buildNavGraph(map)`（遊戲同一套物理模擬），再套用手動修改 |
| 導航圖手動修改 | 存在 `content/maps/{mapId}.navedits.json`（只有編輯器讀寫）：`{ schemaVersion, add: Edge[], remove: Edge[] }`，`Edge = { from: [x, y], to: [x, y], type, dir? }`。以足場上的**座標**記錄（足場 ID 會因地圖修改而重新編號），套用時找最近的足場；找不到的在驗證面板出警告 |
| 導航圖過期 | 驗證時用目前的物理重新產生並比對；不一致（例如遊戲端改了物理常數）就提示重新產生 |

---

## 7. 房間表

編輯 20 房的設定，輸出 `content/rooms/rooms.json`。

| 欄位 | 說明 |
|---|---|
| 地圖 | 對應的 LDtk 關卡 |
| 名稱 | 顯示在 HUD 與換房列表 |
| 押注範圍 | 該房可用的押注等級。預設每房都能用押注等級表（`content/class/bet-levels.json`）的全部級距 |
| 怪物組成 | 換房列表顯示的怪物圖示（實際生怪依地圖的生怪區） |
| Boss | 怪物與出現間隔 |
| 怪潮 | 間隔、持續時間、怪物池、怪物上限 |
| BGM | 背景音樂 |

---

## 8. 輸出目錄

```
content/
├─ manifest.json                       內容索引（匯出時產生，見 §9 ContentManifest）
├─ avatar/
│  ├─ base.png / base.sheet.json       身體 sheet（含 Tag 與錨點 Slice）
│  └─ items/{itemId}.png               武器 sheet
│     items/{itemId}.sheet.json        武器 sheet 資料（Aseprite 匯出）
│     items/{itemId}.json              武器設定 AvatarItem（含姿勢表）
│     items/{itemId}.icon.png          武器圖示 32×32（編輯器自動渲染；AvatarItem.icon 指向它）
├─ class/                              classes.json、skills.json、bet-levels.json
├─ monsters/{mobId}.png / .sheet.json  怪物 sheet
│  monsters/{mobId}.json               怪物設定 MonsterDef
├─ fx/{fxId}.png / .sheet.json         技能特效、刀光 sheet
├─ ui/                                 UI 圖、點陣數字字型
├─ tilesets/{tilesetId}.png / _n.png   地形 tileset 與法線貼圖
├─ backgrounds/{bgId}.png / _n.png     背景圖層與法線貼圖
├─ maps/{mapId}.json                   轉換後的地圖 MapDef
│  maps/{mapId}.navedits.json          導航圖的手動修改（只有編輯器讀寫，遊戲不讀；§6.4）
├─ themes/themes.json                  主題 ThemeDef[]（主題 ID 也遵守 ID 規則：theme_0001…）
├─ rooms/rooms.json                    RoomDef[]
└─ math/                               monsters.math.json、features.json
```

`class/` 的技能與押注等級格式見 [SPEC.md §7](SPEC.md#7-資料格式)。

### 8.1 檔名與路徑慣例

| 規則 | 內容 |
|---|---|
| 三種檔案 | `{id}.png` = sheet 圖；`{id}.sheet.json` = Aseprite 匯出的 sheet 資料（不手改，重新匯出會覆蓋）；`{id}.json` = 編輯器產生的設定檔 |
| 法線貼圖 | 同名加 `_n`：`forest.png` → `forest_n.png`（Laigter 預設） |
| JSON 內的路徑 | 一律**相對 `content/` 根目錄**、使用 `/`，例如 `"monsters/mob_0001.sheet.json"`。跟 `ContentSource.json(path)` 的 path 相同 |
| 例外：`meta.image` | Aseprite sheet 資料裡的 `meta.image` 只有 PNG 檔名，相對於該 `.sheet.json` 所在的資料夾 |
| frame 名稱 | 一般 sheet（怪物、特效、tileset、背景）：時間軸幀號字串 `"0"`、`"1"`…，`frames` 陣列依幀號排序。角色與武器 sheet：`"{圖層}|{幀號}"`，例如 `"body|12"`、`"weapon|12"`；因為 `--ignore-empty`，沒畫的幀不會出現 |
| 角色與武器匯出 | 都用分圖層參數（§2）；角色檔不加 `--ignore-layer _body`（`body` 就是它自己的圖層） |
| 動作 | 由 `meta.frameTags[].from/to`（時間軸幀號，含頭尾）推算；武器幀依幀號落在哪個 Tag 區間決定屬於哪個動作 |
| Slice | `meta.slices[].keys[]` 的 `frame` 是時間軸幀號，該 key 一直有效到下一個 key 為止；`bounds` 與 `pivot` 是**未裁切畫布座標**（`pivot` 相對 `bounds` 左上角） |
| 裁切 | `--trim` 後每幀的 `spriteSourceSize` 是裁切後的圖在原畫布中的位置；組裝時一律換算回原畫布座標 |
| 原點 | 身體範本：畫布 128×128，腳底 (64, 120)。怪物：畫布底邊中心。地圖：左上角 (0, 0)，y 向下，單位像素 |
| 遊戲找檔案 | HTTP 無法列目錄，遊戲先讀 `manifest.json` 取得各類 ID，再依上表的固定路徑組出檔名 |
| 草稿 | 編輯器的未匯出草稿不寫入 `content/` |

---

## 9. 資料格式

正式定義以 `game/shared`（`@lawn/shared`）的 zod schema 為準，以下為示意。座標單位一律為像素；地圖座標原點在左上角、y 向下。

```ts
type ClassId = 'warrior' | 'mage' | 'archer' | 'assassin';

interface AvatarItem {          // 武器（v0.3 起角色不換裝，只有武器）
  schemaVersion: number;
  id: string;                   // weapon_0001
  name: string;
  category: 'weapon';
  classId: ClassId;             // 必填：這把武器屬於哪個職業
  kind: 'pose';
  sheet: string;                // 匯出的 sheet JSON
  layers: ('weapon' | 'weapon_back')[];
  poseMap?: Record<string, number[]>;   // 每個 Tag 的「角色幀 → 姿勢」對應；未填則自動分配
  offset?: { x: number; y: number };    // 額外偏移；weapon 跟 hand、weapon_back 跟 torso
  icon: string;                 // avatar/items/{id}.icon.png
}
interface MonsterDef {
  schemaVersion: number;
  id: string;
  name: string;
  sheet: string;                // Aseprite 匯出的 JSON
  tags: { move: string; idle: string; hit: string; die: string; appear?: string };
  hitbox: { x: number; y: number; w: number; h: number };   // 相對腳底原點
  labelOffset: { x: number; y: number };
  behavior: { move: 'ground' | 'fly' | 'static'; speed: number; idleSec: [number, number]; moveSec: [number, number]; knockback: number };
  fx: { hit?: string; die?: string; sfxHit?: string; sfxDie?: string; coinFrame: number; coinCount: number; light?: { color: string; radius: number } };
  showHpBar: boolean;
  mathId: string;               // 指向數值檔
}

interface MonsterMath {         // 正式版只存在伺服器
  id: string;
  tier: 'normal' | 'elite' | 'special' | 'boss';
  multiplier: number | [number, number];
  feature?: 'bomb' | 'chain' | 'drill' | 'chest' | 'wheel';
}

interface MapDef {              // 由 LDtk 轉換產生
  schemaVersion: number;
  id: string;
  name: string;
  theme: string;                // → ThemeDef
  bgm: string;
  tileSize: 16;
  size: { w: number; h: number };
  cameraBounds: { x: number; y: number; w: number; h: number };
  tileLayers: { name: string; tileset: string; z: 'back' | 'front'; tiles: [x: number, y: number, tileId: number, flip: number][] }[];
                                // tileset：content/ 相對路徑（tilesets/{id}.png）；x, y：圖塊左上角像素；flip：bit0 = 水平、bit1 = 垂直（同 LDtk）
  decors: { tileset: string; tileId: number; x: number; y: number; z: 'back' | 'front'; flipX: boolean }[];
  lights: { x: number; y: number; color: string; radius: number; intensity: number; flicker: number }[];
  footholds: { id: number; points: [number, number][]; oneWay: boolean }[];
                                // 可站立的地面：只含水平與 45° 線段，points 的 x 由左到右嚴格遞增；相連的地面合成同一條折線
  walls: { id: number; x: number; yTop: number; yBottom: number; side: -1 | 1 }[];
                                // 實地與斜坡的實心側面。side = 實心在牆的哪一側（-1 左、1 右）：side = 1 擋住往右走
  ceilings: { id: number; y: number; x1: number; x2: number }[];
                                // 實地與斜坡的底面，跳上來會撞頭（單向平台沒有天花板）
  climbables: { id: number; type: 'ladder' | 'rope'; x: number; yTop: number; yBottom: number }[];
                                // x：格子中心；yTop／yBottom：連續格子的上緣／下緣
  portals: { id: string; type: 'spawn' | 'next' | 'prev' | 'toRoom'; x: number; y: number; toRoom?: number }[];
  spawnZones: { id: string; rect: { x: number; y: number; w: number; h: number }; footholdIds: number[]; maxCount: number; respawnSec: number; pool: { mobId: string; weight: number }[] }[];
  waveEntries: { x: number; y: number; dir: 1 | -1 }[];
  boss?: { mobId: string; x: number; y: number; intervalSec: number };
  nav: { nodes: { id: number; footholdIds: number[] }[]; edges: { from: number; to: number; type: 'run' | 'jump' | 'drop' | 'climb' | 'roll' | 'portal' }[] };
}

interface ThemeDef {
  id: string;
  ambient: { color: string; intensity: number };
  tileset: { image: string; normal?: string };
  backgrounds: { image: string; normal?: string; rx: number; ry: number; tileX: boolean; tileY: boolean; scrollX?: number; y: number }[];
}

interface ContentManifest {     // content/manifest.json，匯出時產生
  schemaVersion: number;
  generatedAt: string;          // ISO 時間
  avatarItems: string[];        // 武器 itemId → avatar/items/{id}.json
  monsters: string[];           // mobId → monsters/{id}.json
  maps: string[];               // mapId → maps/{id}.json
  fx: string[];                 // fxId → fx/{id}.sheet.json
  // 固定路徑不列：avatar/base.sheet.json、themes/themes.json、rooms/rooms.json、class/*、math/*
}

interface RoomDef {
  id: number;                   // 1–20
  mapId: string;
  name: string;
  betRange: [number, number];
  boss?: { mobId: string; intervalSec: number };
  wave?: { everySec: [number, number]; durationSec: number; pool: { mobId: string; weight: number }[]; maxMonsters: number };
}
```

---

## 10. 里程碑

對應 [SPEC.md §9](SPEC.md#9-里程碑) 的整體里程碑。

| 階段 | 工具相關內容 | 完成標準 |
|---|---|---|
| M0 | 角色與武器技術驗證：姿勢表 + 錨點，跑過全部 15 個 Tag（先用遊戲端測試頁，工具尚未開始） | 測試美術能正確組裝 |
| M1 | `npm run art` 匯出腳本 | Aseprite 存檔後遊戲自動拿到新素材 |
| M2 | 工具 v1：共通介面、地圖頁、怪物頁 | 只用 LDtk 與工具就能做出新地圖與新怪物 |
| M3 | 房間表 | 20 房設定都由工具產生 |
| M5 | 角色造型頁：角色檢查、武器登錄、姿勢表、規格檢查、錨點對齊、試穿 | 美術用 Aseprite 畫好一把武器，不寫程式就能在遊戲中裝備 |

---

## 11. 風險

| 風險 | 對策 |
|---|---|
| 美術規格不一致（原點、錨點） | 規格檢查擋匯出；範本檔內附 `_guide` 參考圖層 |
| 姿勢表自動分配對不準，武器穿幫 | 工具逐幀播放檢查；可改指定姿勢或加畫一張 |
| Laigter 從亮度推算深度，對手繪像素圖可能判斷錯 | 只用在地形與背景；產生後手動修整 |
| LDtk 自動拼貼規則的學習成本 | 先做好 1 套主題，其他主題複製後換圖 |
| File System Access API 只支援 Chrome／Edge | 工具限定 Chrome／Edge；之後需要再用 Tauri 包成桌面版 |

---

## 12. 待確認問題

1. **怪物數值由誰管？** 倍率在工具裡編輯，還是由數學企劃用 Excel 管理後匯入？
2. **多人協作：** 工具直接寫檔、靠 git 合併就夠，還是需要多人同時編輯？
3. **Aseprite 授權：** 每位會畫圖的人都需要一套（約 US$20）。
