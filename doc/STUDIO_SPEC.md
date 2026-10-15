# LawnStudio 造型製作系統規格書

| 項目 | 內容 |
|---|---|
| 版本 | v0.2（草案） |
| 日期 | 2026-10-15 |
| 上層文件 | [SPEC.md](SPEC.md)（遊戲本體規格）、[COLLAB.md](COLLAB.md)（分工與資料夾歸屬） |
| 範圍 | 造型製作系統 LawnStudio：工具功能、素材流程，以及角色、怪物、地圖的美術製作規格與內容資料格式 |
| 維護 | 編輯器 agent（`lawngame2d-91`） |

本文件自 SPEC.md v0.4 抽出。遊戲玩法、博奕規則、執行時系統以 [SPEC.md](SPEC.md) 為準；美術怎麼畫、工具怎麼檢查、輸出什麼資料，以本文件為準。

| 版本 | 變更 |
|---|---|
| v0.1 | 初版 |
| v0.2 | 路徑改為 COLLAB 配置（`editor/`、`game/shared`、`game/engine`、`editor/tools/`）；新增 §8.1 檔名與路徑慣例、Aseprite 匯出參數、`manifest.json`；§9 足場拆成地面／牆／天花板，補上座標慣例 |

---

## 1. 定位與分工

**畫圖在 Aseprite、畫地圖在 LDtk，LawnStudio 負責把素材變成遊戲資料**，包括設定參數、檢查規格、預覽組合、試玩。

| 工具 | 負責 |
|---|---|
| Aseprite | 角色身體、換裝部件、怪物、特效、UI、地形 tileset 的繪製與動畫 |
| Laigter | 從地形與背景圖自動產生法線貼圖（之後手修） |
| LDtk | 地圖繪製：碰撞格、自動拼貼、裝飾、實體（傳送點、生怪區、光源） |
| **LawnStudio** | 部件登錄與設定、姿勢表、調色盤、怪物參數、地圖後處理（足場、導航圖、主題光影）、房間表、規格檢查、預覽與試玩 |

| 頁面 | 內容 | 章節 |
|---|---|---|
| 角色造型 | 紙娃娃：身體、頭髮、眼睛、膚色、裝備 | [§4](#4-角色造型) |
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

紙娃娃（身體 base 與部件；分圖層、略過空白幀。base 不加 `--ignore-layer _body`）：

```bash
aseprite -b art/avatar/items/top_0001.aseprite \
  --format json-array --list-tags --list-slices --list-layers \
  --split-layers --ignore-empty --ignore-layer _body \
  --sheet-type packed --trim --shape-padding 1 \
  --filename-format "{layer}|{frame}" \
  --sheet content/avatar/items/top_0001.png --data content/avatar/items/top_0001.sheet.json
```

- 名稱以 `_` 開頭的圖層是參考用（例如 `_guide`、`_body`），不會匯出：匯出腳本先用 `--list-layers` 讀出圖層，對每個 `_` 開頭的圖層加上 `--ignore-layer`。
- `--filename-format`：一般 sheet 的 frame 名稱是時間軸幀號（從 0 起）；紙娃娃 sheet 是 `{圖層}|{幀號}`。動作（Tag）一律由 `frameTags` 的幀號區間推算，不從 frame 名稱解析。詳見 §8.1。
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
- ID 規則：`{分類}_{4 位數}`，例如 `hair_0001`、`hat_0012`、`mob_0003`、`map_0001`。
- 所有資料檔都帶 `schemaVersion`，改格式時寫 migration。

---

## 4. 角色造型

紙娃娃在遊戲中如何組裝與播放，見 [SPEC.md §4.3](SPEC.md#43-紙娃娃)。

**核心問題：** 動作要流暢（Dead Cells）就要很多幀，但手繪紙娃娃每件衣服都要跟著每一幀畫，美術量會爆。

**解法：身體畫很多幀，換裝部件只畫「姿勢」。** 每一幀身體指定使用哪一張姿勢圖，並依錨點位移對齊，所以中間幀會自動沿用最接近的姿勢。刀光、殘影等流暢感來源放在通用特效層，不屬於任何部件。

### 4.1 範本檔

`art/avatar/avatar_base.aseprite`

- 楓之谷式 Q 版 2.5 頭身，身高約 56–64 像素，頭部佔身高約 45%。
- 畫布 128×128，腳底中心固定在 (64, 120)；匯出時用 `--trim` 去掉空白。
- 每個動作是一個 Tag；身體分圖層畫：`body`（含後手臂）、`arm_front`（前手臂，要蓋在武器上）、`head`（頭）。`head` 只畫在兩個**視角幀**上，跟其他錨點部件一樣，執行時貼在每幀的 `head` 錨點上：
  - 正面視角幀 = `stand` 的第一幀；背面視角幀 = `ladder` 的第一幀（`rope` 也用背面）。幀號由 Tag 推算，不寫死。
- 匯出時分圖層（`--split-layers`），因為武器要夾在 `body` 與 `arm_front` 之間。
- 1 像素深色描邊，用同色系深色，不用純黑。
- 錨點用 Slice 標記，逐幀設定 pivot：

| Slice | 用途 |
|---|---|
| `head` | 頭、頭髮、臉、帽子、飾品的貼附點 |
| `torso` | 衣服、鞋、手套等姿勢部件的對齊點 |
| `hand` | 武器的對齊點；也是特效發射點（魔法彈、飛鏢、箭的起點） |

### 4.2 動作與幀數預算

| 動作 | Tag | 身體幀數 | 部件姿勢數 | 頭部視角 |
|---|---|---|---|---|
| 待機 | `stand` | 6 | 2 | 正面 |
| 跑步 | `run` | 8 | 4 | 正面 |
| 起跳 | `jump` | 2 | 1 | 正面 |
| 下落 | `fall` | 2 | 1 | 正面 |
| 落地 | `land` | 2 | 1 | 正面 |
| 翻滾（滑衝） | `roll` | 6 | 3 | 正面 |
| 趴下 | `prone` | 1 | 1 | 正面 |
| 爬梯 | `ladder` | 4 | 2 | 背面 |
| 爬繩 | `rope` | 4 | 2 | 背面 |
| 劍士三連斬 | `swing1` `swing2` `swing3` | 5 × 3 | 2 × 3 | 正面 |
| 法師攻擊 | `cast` | 6 | 3 | 正面 |
| 弓箭手攻擊 | `shoot` | 6 | 3 | 正面 |
| 刺客攻擊 | `throw` | 5 | 2 | 正面 |
| **合計** | 15 個 Tag | **67** | **31** | |

- 身體 67 幀，動作接近 Dead Cells 的流暢度；每件衣服只要畫 31 張姿勢圖。角色只有約 60 像素高，大多數姿勢只是小幅修改。
- 翻滾設計成「壓低身體向前滑衝」，頭部保持正立，避免頭髮、帽子要多畫旋轉圖。
- 技能沿用攻擊動作加特效，不另畫角色動作。

### 4.3 圖層順序與部件類型

由後到前：

| # | 圖層 | 部件 | 類型 | 換色 |
|---|---|---|---|---|
| 1 | `cape` | 披風 | 姿勢 | 染色 |
| 2 | `hair_back` | 後髮 | 錨點 | 髮色 |
| 3 | `weapon_back` | 弓、箭袋等背在後面的部分 | 姿勢 | – |
| 4 | `body` | 身體 | 範本 | 膚色 |
| 5 | `shoes` | 鞋子 | 姿勢 | 染色 |
| 6 | `bottom` | 下衣 | 姿勢 | 染色 |
| 7 | `top` | 上衣（套服同時取代 top + bottom） | 姿勢 | 染色 |
| 8 | `head` | 頭（含耳朵） | 錨點 | 膚色 |
| 9 | `face` | 臉／眼睛（含表情） | 錨點 | 瞳色 |
| 10 | `face_acc` | 臉飾 | 錨點 | – |
| 11 | `eye_acc` | 眼飾 | 錨點 | – |
| 12 | `hair_front` | 前髮 | 錨點 | 髮色 |
| 13 | `hat` | 帽子 | 錨點 | 染色 |
| 14 | `weapon` | 主武器 | 姿勢 | – |
| 15 | `arm_front` | 前手臂（蓋在武器握把上） | 範本 | 膚色 |
| 16 | `sleeve` | 上衣前袖（跟 `top` 同一件，分層畫） | 姿勢 | 染色 |
| 17 | `glove` | 手套 | 姿勢 | 染色 |

部件分類：臉型（眼睛）、髮型、帽子、上衣、下衣、套服、鞋子、手套、披風、武器（依職業）、臉飾、眼飾。膚色由調色盤處理，不是部件。

### 4.4 部件製作流程

**所有部件都畫在範本檔的複本上**，所以部件 sheet 的幀號 = 範本的幀號，Tag 也相同。圖層名稱就是 §4.3 的圖層名稱。

- **姿勢部件（衣服、鞋、手套、披風、武器）：** 複製範本檔 → 鎖住身體圖層當參考（改名為 `_body`）→ 在每個 Tag 中只在「姿勢幀」上畫部件 → 存成 `art/avatar/items/top_0001.aseprite`。匯出時只輸出部件圖層，空白幀自動略過。
- **姿勢表：** 一個 Tag 內，部件圖層實際有畫的幀就是它的姿勢。身體每一幀用哪個姿勢預設依時間平均分配（例：`run` 身體 8 幀、部件 4 姿勢 → 每 2 幀共用一個姿勢），可用 `poseMap` 逐幀改指定。部件跟著錨點相對於姿勢幀的位移移動。對不準的幀可在工具中改指定其他姿勢，或加畫一張。
- **每個圖層跟哪個錨點：** 頭部類（`hair_back`、`head`、`face`、`face_acc`、`eye_acc`、`hair_front`、`hat`）→ `head`；`weapon`、`glove` → `hand`；其他 → `torso`。
- **武器：** 只需要畫該職業會用到的攻擊 Tag，加上通用動作。爬梯、爬繩（`ladder`、`rope`）時收起武器，不用畫；沒有畫姿勢的動作，遊戲會隱藏該圖層。
- **錨點部件（頭、頭髮、臉、帽子、飾品）：** 只畫在兩個視角幀上（§4.1：正面 = `stand` 第一幀、背面 = `ladder` 第一幀）。每個圖層都要有正面圖；背面圖整件至少一個圖層有就好（例：從背後看，頭髮全部畫在 `hair_front`）。臉、臉飾、眼飾從背後看不到，不用畫背面。執行時依每幀 `head` 錨點相對視角幀的位移貼上，所以跑步時頭的上下晃動會自動跟著。工具中的「錨點對齊」只設定額外的微調偏移（`anchor.offset`）。
- **變體用圖層名稱 `{圖層}@{變體}`：**
  - 表情：`face` 是預設表情，另畫 `face@blink`、`face@hit`、`face@smile`；眨眼由遊戲每 3–6 秒隨機觸發。
  - 戴帽髮型：`hair_front@underHat`、`hair_back@underHat`。
- **遮蔽規則：** 帽子宣告 `hairMode: full | underHat | hidden`（`underHat` 時改用髮型的 `@underHat` 變體）；套服宣告隱藏 `bottom`；其他部件可用 `hidesLayers` 宣告要隱藏的圖層。

### 4.5 換色

- 膚色、髮色、瞳色、染色各保留一組固定的 **Key 色階**（例如膚色 4 階、髮色 5 階、瞳色 3 階），這些顏色只能用在需要換色的地方。
- `palettes.json` 定義每種顏色對應的色階，例如「金髮」= 5 個顏色。
- 遊戲執行時把 Key 色階逐像素替換成目標色階並快取。像素風顏色數少，替換結果完全精準。
- 一款髮型可以直接出 N 種髮色、一件衣服可以出 N 種染色，不用重畫。

### 4.6 工具功能

| 功能 | 說明 |
|---|---|
| 基礎身體 | 載入 `avatar_base`，列出 Tag、幀數、錨點；檢查 67 幀與 `head`、`torso`、`hand` Slice 是否齊全 |
| 調色盤 | 編輯 Key 色階與各顏色的色階（膚色、髮色、瞳色、染色）；即時預覽 |
| 部件登錄 | 掃描新匯出的部件 → 設定分類、圖層、名稱、職業限制、換色群組、遮蔽規則 |
| 姿勢表 | 顯示每個 Tag「身體幀 → 部件姿勢」的對應；預設自動分配，可逐幀改指定；逐幀播放檢查有沒有穿幫 |
| 規格檢查 | 每個需要的 Tag 都要有姿勢圖（武器見 §4.4）；錨點部件要有正面圖、整件要有背面圖（臉、臉飾、眼飾除外）；圖中不能出現「接近 Key 色但不相等」的顏色（換色時不會被替換）；用到其他換色群組的 Key 色時警告；臉缺少 `@blink`／`@hit`／`@smile`、有帽子用 `underHat` 時髮型缺少 `@underHat` 都是警告 |
| 錨點對齊 | 錨點部件拖曳設定相對 `head` 的偏移 |
| 試穿 | 任意組合部件、顏色、職業、押注等級外觀、動作；隨機搭配（QA 用）；截圖 |
| 圖示 | 部件自動渲染成 32×32 圖示（像素風，不縮放模糊） |

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
| 押注範圍 | 該房可用的押注等級 |
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
│  ├─ palettes.json                    Key 色階與各顏色色階
│  └─ items/{itemId}.png               部件 sheet
│     items/{itemId}.sheet.json        部件 sheet 資料（Aseprite 匯出）
│     items/{itemId}.json              部件設定 AvatarItem（含姿勢表）
│     items/{itemId}.icon.png          部件圖示 32×32（編輯器自動渲染；AvatarItem.icon 指向它）
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
| frame 名稱 | 一般 sheet（怪物、特效、tileset、背景）：時間軸幀號字串 `"0"`、`"1"`…，`frames` 陣列依幀號排序。紙娃娃 sheet（身體 base 與所有部件）：`"{圖層}|{幀號}"`，例如 `"top|12"`、`"face@blink|0"`；因為 `--ignore-empty`，沒畫的幀不會出現 |
| 紙娃娃匯出 | 身體 base 與部件都用分圖層參數（§2）；base 不加 `--ignore-layer _body`（`body` 就是它自己的圖層） |
| 動作 | 由 `meta.frameTags[].from/to`（時間軸幀號，含頭尾）推算；部件幀依幀號落在哪個 Tag 區間決定屬於哪個動作 |
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

interface AvatarItem {
  schemaVersion: number;
  id: string;
  name: string;
  category: 'face' | 'hair' | 'hat' | 'top' | 'bottom' | 'overall' | 'shoes'
          | 'gloves' | 'cape' | 'weapon' | 'faceAcc' | 'eyeAcc';
  classId?: ClassId;            // 武器限定職業
  kind: 'pose' | 'anchor';      // 姿勢部件／錨點部件
  sheet: string;                // 匯出的 sheet JSON
  layers: string[];             // 佔用的圖層（例：上衣 = ['top', 'sleeve']）
  poseMap?: Record<string, number[]>;   // 姿勢部件：每個 Tag 的「身體幀 → 姿勢」對應；未填則自動分配
  anchor?: { offset: { x: number; y: number } };   // 額外微調偏移；跟哪個錨點由圖層決定（§4.4）
  views?: { front?: number; back?: number };       // 覆寫錨點部件的視角幀號；不填用預設（stand／ladder 第一幀）
  recolor?: 'hair' | 'eye' | 'dye';
  hairMode?: 'full' | 'underHat' | 'hidden';
  hidesLayers?: string[];
  icon: string;
}

interface Palette {
  id: string;
  group: 'skin' | 'hair' | 'eye' | 'dye';
  name: string;
  colors: string[];             // 依序對應該群組 Key 色階的每一階
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
  avatarItems: string[];        // itemId → avatar/items/{id}.json
  monsters: string[];           // mobId → monsters/{id}.json
  maps: string[];               // mapId → maps/{id}.json
  fx: string[];                 // fxId → fx/{id}.sheet.json
  // 固定路徑不列：avatar/base.sheet.json、avatar/palettes.json、themes/themes.json、rooms/rooms.json、class/*、math/*
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
| M0 | 紙娃娃技術驗證：姿勢表 + 錨點 + 換色，跑過全部 15 個 Tag（先用遊戲端測試頁，工具尚未開始） | 測試美術能正確組裝 |
| M1 | `npm run art` 匯出腳本 | Aseprite 存檔後遊戲自動拿到新素材 |
| M2 | 工具 v1：共通介面、地圖頁、怪物頁 | 只用 LDtk 與工具就能做出新地圖與新怪物 |
| M3 | 房間表 | 20 房設定都由工具產生 |
| M5 | 角色造型頁：調色盤、部件登錄、姿勢表、規格檢查、錨點對齊、試穿 | 美術用 Aseprite 畫好一件裝備，不寫程式就能在遊戲中穿上 |

---

## 11. 風險

| 風險 | 對策 |
|---|---|
| 美術規格不一致（原點、錨點、Key 色階） | 規格檢查擋匯出；範本檔內附 `_guide` 參考圖層 |
| 姿勢表自動分配對不準，部件穿幫 | 工具逐幀播放檢查；可改指定姿勢或加畫一張 |
| Laigter 從亮度推算深度，對手繪像素圖可能判斷錯 | 只用在地形與背景；產生後手動修整 |
| LDtk 自動拼貼規則的學習成本 | 先做好 1 套主題，其他主題複製後換圖 |
| File System Access API 只支援 Chrome／Edge | 工具限定 Chrome／Edge；之後需要再用 Tauri 包成桌面版 |

---

## 12. 待確認問題

1. **怪物數值由誰管？** 倍率在工具裡編輯，還是由數學企劃用 Excel 管理後匯入？
2. **多人協作：** 工具直接寫檔、靠 git 合併就夠，還是需要多人同時編輯？
3. **Aseprite 授權：** 每位會畫圖的人都需要一套（約 US$20）。
