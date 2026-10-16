# 協作規則（遊戲 × 編輯器）

| 項目 | 內容 |
|---|---|
| 版本 | v0.1 |
| 日期 | 2026-10-15 |
| 維護 | 遊戲 agent 維護；編輯器 agent 要修改請用訊息提出 |

本專案由兩個 Claude session 分工開發。使用者要求**開發時資料夾不要混在一塊**。

| 角色 | Session 名稱 | 負責 | 主規格 |
|---|---|---|---|
| 遊戲 agent | `lawngame2d-22` | 遊戲本體 | [SPEC.md](SPEC.md) |
| 編輯器 agent | `lawngame2d-91` | 造型製作系統 LawnStudio | [STUDIO_SPEC.md](STUDIO_SPEC.md) |

---

## 1. 資料夾歸屬

```
LawnGame2D/
├─ doc/            規格書與本文件
├─ game/           遊戲（獨立 npm 專案，內部用 workspaces）
│  ├─ shared/      @lawn/shared：型別、內容 schema、Aseprite JSON 解析、足場物理、導航圖、RTP 公式
│  ├─ engine/      @lawn/engine：Phaser 4 場景、createGame()、預覽元件
│  ├─ web/         遊戲網頁入口 + HUD
│  └─ tools/       rtp-sim、placeholder-art
├─ editor/         LawnStudio（獨立 npm 專案）
│  └─ tools/       aseprite-export、ldtk-convert（CLI 外殼）
├─ art/            美術原始檔（.aseprite、.ldtk），由使用者／美術放入
└─ content/        遊戲資料：編輯器寫入、遊戲讀取
```

| 路徑 | 誰可以寫 | 另一方 |
|---|---|---|
| `game/**` | 遊戲 agent | 編輯器 agent **唯讀**（可 import `game/shared`、`game/engine`） |
| `editor/**` | 編輯器 agent | 遊戲 agent 唯讀 |
| `content/**` | 編輯器 agent（及其工具） | 遊戲 agent 唯讀 |
| `content/class/**`（職業、技能、押注等級） | **例外：遊戲 agent**（手寫 JSON，跟戰鬥程式綁很緊） | 編輯器 agent 唯讀；之後需要編輯頁再由編輯器做 |
| `art/**` | 使用者／美術 | 兩方都唯讀 |
| `doc/SPEC.md` | 遊戲 agent | 編輯器 agent 唯讀 |
| `doc/STUDIO_SPEC.md` | 編輯器 agent | 遊戲 agent 唯讀 |
| `doc/COLLAB.md`、根目錄設定檔（`.gitignore`、`.gitattributes`、`CLAUDE.md`） | 遊戲 agent | 編輯器 agent 用訊息提出修改 |

**需要改對方的檔案時：** 用 SendMessage 告訴對方要改什麼、為什麼，由對方修改。不要自己動手，也不要先在自己的資料夾複製一份來改。

**其他 session（使用者另外開來修特定問題的，例如 lawngame2d-5a）：** 可以照使用者的要求改 `game/`，但要先傳訊息給遊戲 agent（lawngame2d-22）說要改哪些檔案，等回覆再改，改完通知；改之前一律重新讀最新的檔案，不能拿舊內容整個覆寫。遊戲 agent 也一樣，改檔前先讀最新版。

---

## 2. 共用程式碼（遊戲提供、編輯器使用）

編輯器以相對路徑使用遊戲的套件：`@lawn/shared` → `game/shared`、`@lawn/engine` → `game/engine`（Vite alias 或 `file:` 依賴皆可，由編輯器決定）。編輯器要先在 `game/` 執行過 `npm install`，`phaser`、`zod` 等依賴才解析得到。

### 2.1 `@lawn/shared`

| 內容 | 說明 | 狀態 |
|---|---|---|
| 內容 schema（zod） | AvatarItem、PaletteFile、MonsterDef、MonsterMathFile、MapDef（含 walls、ceilings）、ThemeFile、RoomFile、ContentManifest（STUDIO_SPEC §9）。檔案層級的都有 `XxxFile.migrate(raw)` 入口 | ✅ 已提供 |
| 路徑 | `contentPaths`：content/ 內的固定路徑與 `{id}` 組檔名；`resolveSheetImage(sheetPath, meta.image)` | ✅ 已提供 |
| Aseprite 匯出 JSON | `parseAsepriteSheet(raw)`：json-array／json-hash、`"{frame}"` 與 `"{layer}|{frame}"` 命名、Tag、逐幀 Slice（`sliceAt`、`slicePivotAt`）；`tagFrameSequence`、`tagOfFrame` | ✅ 已提供 |
| ID 驗證 | `ID_PATTERN`、`isValidId(id, category?)`、`idCategory(id)` | ✅ 已提供 |
| 紙娃娃擺放 | `resolveLoadout(parts)`、`composeAvatarFrame(base, parts, frame, { expression })` → `DrawOp[]`；姿勢與錨點規則 `LAYER_ANCHOR`、`resolvePoseFrame`、`viewFrames` | ✅ 已提供 |
| 換色 | `paletteMapping`、`mergeMappings`、`itemPaletteId`、`loadoutMapping`、`recolorPixels`（Canvas2D 與遊戲共用） | ✅ 已提供 |
| 足場物理 | `PHYSICS`、`FootholdWorld`、`createBody`、`stepBody`，純函式、不依賴 Phaser | ✅ 已提供 |
| 導航圖產生 | `buildNavGraph(map)`，用同一套物理模擬；邊帶起跳點 `x`、方向 `dir` | ✅ 已提供 |

**內容 schema 的修改流程：** schema 放在 `game/shared`，由遊戲 agent 修改；但內容是編輯器產出的，所以編輯器 agent 有需要時提出，遊戲 agent 優先處理。任何一方改了 schema，都要通知對方。

### 2.2 `@lawn/engine`

```ts
// 內容來源可注入：遊戲用 HTTP，編輯器可以餵本機檔案或未存檔的草稿
interface ContentSource {
  json<T = unknown>(path: string): Promise<T>;   // path 相對 content/，例：'monsters/mob_0001.json'
  imageUrl(path: string): Promise<string>;       // 回傳 Phaser 可載入的 URL（http: 或 blob:）
}
function httpContentSource(baseUrl: string): ContentSource;

// 真遊戲（含 LocalServer）。編輯器的試玩用 mapOverride／roomId 指定起點
function createGame(parent: HTMLElement, options: {
  content: ContentSource;
  roomId?: number;
  mapOverride?: MapDef;
  hud?: boolean;                 // 編輯器試玩可關掉 HUD
  onExit?: () => void;           // 試玩時按 Esc
}): GameHandle;

// 預覽元件（不啟動 HUD 與 LocalServer）
function createAvatarPreview(parent: HTMLElement, options: AvatarPreviewOptions): AvatarPreviewHandle;
//   部件組合、顏色、動作、指定幀、洋蔥皮、光照開關
function createMonsterPreview(parent: HTMLElement, options: MonsterPreviewOptions): MonsterPreviewHandle;
//   單隻怪物；可觸發 hit → die → 噴金幣；顯示判定框
function createMapPreview(parent: HTMLElement, options: MapPreviewOptions): MapPreviewHandle;
//   假鏡頭、光照開關、足場／導航圖除錯層

interface GameHandle { destroy(): void; reloadContent(): Promise<void>; }
```

| 介面 | 提供時間 |
|---|---|
| `ContentSource`、`httpContentSource`、`createGame`（空殼）、三個預覽元件（空殼） | ✅ 已提供 |
| `createGame` 可玩（地圖、紙娃娃、戰鬥、LocalServer） | ✅ 已提供 |
| `createMonsterPreview`、`createMapPreview` | ✅ 已提供 |
| `createAvatarPreview` | M5 前 |

實際的參數型別以 `game/engine/src/index.ts` 為準；有變動時遊戲 agent 會通知。

### 2.3 編輯器自己負責的部分

- LDtk → MapDef 轉換：瀏覽器可執行的純函式（輸入已 parse 的 LDtk JSON，輸出 MapDef），放在 `editor/`；`editor/tools/ldtk-convert` 只是 CLI 外殼。
- 測試用 `world.ldtk`：編輯器自己在 `editor/` 的 fixtures 產生。
- `content/` 的檔名與目錄細節（例如 Aseprite 匯出資料與設定檔要不要用 `*.sheet.json` 區分），由編輯器決定並寫進 STUDIO_SPEC，再通知遊戲 agent。

---

## 3. 測試美術

這台電腦沒有安裝 Aseprite 與 LDtk。

- 遊戲 agent 提供 `game/tools/placeholder-art`：用程式產生 **Aseprite 匯出格式**的 PNG + `.sheet.json`（身體、部件、怪物、特效、tileset），檔名與目錄照 STUDIO_SPEC §8，可指定輸出資料夾。編輯器可以執行它，把結果放到 `editor/` 的 fixtures。
- 遊戲只讀正式內容 `content/`。`game/dev-content/`（不進 git）是主角測試美術的產生結果，已不再自動產生；需要（例如 build-content 同步 content/avatar）時在 `game/` 執行 `npm run art`。

---

## 4. Git

- **使用者要求前不 commit、不 push。**
- 兩個 session 共用同一個工作目錄與分支：**不要切換分支、不要 stash、不要 reset、不要 `git add -A`**，這些都會影響對方。
- 使用者要求 commit 時，各自只加自己資料夾的檔案（`git add game/` 或 `git add editor/`），並用 `git commit -- <自己的路徑>` 只提交自己的變更。

---

## 5. 溝通

用 SendMessage 互傳訊息（收件人填對方的 session 名稱）。以下情況要通知對方：

- 共用介面（`@lawn/shared`、`@lawn/engine`、`content/` 格式）新增或變動
- 對方等待中的功能完成（例如「`createMonsterPreview` 可以用了」）
- 需要對方修改檔案
- 卡住了，需要對方先完成某件事

訊息第一行寫清楚主旨，內容具體（檔案、函式名稱、要改什麼）。
