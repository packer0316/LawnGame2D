# LawnStudio 造型製作系統規格書

| 項目 | 內容 |
|---|---|
| 版本 | v0.1（草案） |
| 日期 | 2026-10-15 |
| 上層文件 | [SPEC.md](SPEC.md)（遊戲本體規格） |
| 範圍 | 造型製作系統 LawnStudio：工具功能、素材流程，以及角色、怪物、地圖的美術製作規格與內容資料格式 |

本文件自 SPEC.md v0.4 抽出。遊戲玩法、博奕規則、執行時系統以 [SPEC.md](SPEC.md) 為準；美術怎麼畫、工具怎麼檢查、輸出什麼資料，以本文件為準。

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
| 預覽畫布 | 直接使用遊戲的 `packages/engine`（Phaser 4），看到的就是遊戲裡的樣子 |
| 執行環境 | 網頁工具，使用 Chrome 或 Edge（需要 File System Access API）。開啟時選擇專案根目錄，直接讀寫 `content/`，不需要後端 |
| 專案位置 | `apps/studio/` |

**素材流程**

```
art/**/*.aseprite ──(npm run art：Aseprite CLI 批次匯出)──→ content/**/*.png + *.json
art/maps/world.ldtk ──(LawnStudio 地圖頁 / tools/ldtk-convert)──→ content/maps/*.json
LawnStudio：登錄、設定參數、檢查規格、預覽 ──→ content/**/*.json
遊戲（packages/engine）只讀 content/
```

**Aseprite 匯出（範例）**

```bash
aseprite -b art/monsters/mob_0001.aseprite \
  --list-tags --list-slices --format json-array \
  --sheet-pack --trim \
  --sheet content/monsters/mob_0001.png --data content/monsters/mob_0001.json
```

- 紙娃娃部件加上 `--split-layers --ignore-layer _body --ignore-empty`，只輸出部件圖層與有畫的姿勢幀。
- 名稱以 `_` 開頭的圖層是參考用（例如 `_guide`、`_body`），不會匯出。
- Aseprite 執行檔路徑由環境變數 `ASEPRITE_PATH` 指定。
- `npm run art` 匯出所有變更過的檔案；`npm run dev` 時監看 `art/` 自動重新匯出，LawnStudio 偵測到 `content/` 更新會自動重新載入。

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
- 復原／重做、自動存草稿。
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
- 每個動作是一個 Tag；身體分圖層畫：`body`（含後手臂）、`arm_front`（前手臂，要蓋在武器上）。頭另外畫正面與背面兩張，跟其他錨點部件一樣貼在 `head` 錨點上。
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

- **姿勢部件（衣服、鞋、手套、披風、武器）：** 複製範本檔 → 鎖住身體圖層當參考（改名為 `_body`）→ 在每個 Tag 中只在「姿勢幀」上畫部件 → 存成 `art/avatar/items/top_0001.aseprite`。匯出時只輸出部件圖層，空白幀自動略過。
- **姿勢表：** 預設依時間平均分配（例：`run` 身體 8 幀、部件 4 姿勢 → 每 2 幀共用一個姿勢）。部件跟著 `torso`（武器跟著 `hand`）錨點相對於姿勢幀的位移移動。對不準的幀可在工具中改指定其他姿勢，或加畫一張。
- **武器：** 只需要畫該職業會用到的攻擊 Tag，加上通用動作。
- **錨點部件（頭、頭髮、臉、帽子、飾品）：** 每件畫「正面」與「背面」兩張（臉沒有背面），在工具中設定相對 `head` 錨點的偏移。執行時依每幀錨點貼上，所以跑步時頭的上下晃動會自動跟著。
- **表情：** 臉的檔案用 Tag 區分 `default`、`blink`、`hit`、`smile`；眨眼由遊戲每 3–6 秒隨機觸發。
- **遮蔽規則：** 髮型提供 `full`（完整）與 `underHat`（戴帽版）兩組圖；帽子宣告 `hairMode: full | underHat | hidden`；套服宣告隱藏 `bottom`；其他部件可用 `hidesLayers` 宣告要隱藏的圖層。

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
| 規格檢查 | 每個 Tag 都要有姿勢圖；錨點部件要有正面圖（臉以外還要有背面圖）；圖中不能出現非 Key 色階的換色用顏色 |
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
├─ avatar/
│  ├─ base.png / base.json         身體 sheet（含 Tag 與錨點 Slice）
│  ├─ palettes.json                Key 色階與各顏色色階
│  └─ items/{itemId}.png / .json   部件 sheet + 部件設定（含姿勢表）
├─ class/                          classes.json、skills.json、bet-levels.json
├─ monsters/{mobId}.png / .json    怪物 sheet + 怪物設定
├─ fx/                             技能特效、刀光 sheet
├─ ui/                             UI 圖、點陣數字字型
├─ maps/{mapId}.json               轉換後的地圖 + 圖塊
├─ themes/                         主題：背景組、法線貼圖、環境光 themes.json
├─ rooms/                          rooms.json
└─ math/                           monsters.math.json、features.json
```

`class/` 的技能與押注等級格式見 [SPEC.md §7](SPEC.md#7-資料格式)。

---

## 9. 資料格式

正式定義以 `packages/shared` 的 zod schema 為準，以下為示意。

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
  anchor?: { slice: 'head' | 'torso' | 'hand'; offset: { x: number; y: number } };
  views?: { front: string; back?: string };   // 錨點部件的正面／背面 frame
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
  decors: { tileset: string; tileId: number; x: number; y: number; z: 'back' | 'front'; flipX: boolean }[];
  lights: { x: number; y: number; color: string; radius: number; intensity: number; flicker: number }[];
  footholds: { id: number; points: [number, number][]; oneWay: boolean }[];
  climbables: { id: number; type: 'ladder' | 'rope'; x: number; yTop: number; yBottom: number }[];
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
