# 遊戲開發進度

依 [doc/SPEC.md §9](../doc/SPEC.md#9-里程碑) 的里程碑推進。每一輪開發先讀這份檔案決定下一個工作項目，完成後更新。

## 已完成

| 階段 | 內容 |
|---|---|
| M0 技術驗證 | 像素渲染 + 光照（87 隻怪 57 FPS）、戰鬥手感、角色組裝、足場物理 |
| M1 核心可玩 | 一刀一注、LocalServer、押注控制、HUD、RTP 測試 |
| M2（遊戲端） | `createMonsterPreview`、`createMapPreview`、`buildNavGraph` |
| M3 部分 | 20 房（編輯器產出 content/）、`tools/rtp-sim`（10⁷ 刀誤差 0.05%）、`findPath`／`reachableFrom` |
| M5（SPEC v0.6） | 人物固定、只換武器：產生器輸出森境旅人 + 四把武器，武器握點對齊原畫的手（`HERO_HANDS`）；`createAvatarPreview`；換色相關全部移除 |
| M4 自動掛機 | `engine/src/auto/AutoHunt.ts`：選怪（最近／最高倍率／最密集）、沿導航圖走（跑、跳、下跳、爬繩、跳起來抓懸空繩）、跳起來打高處的怪、自動技能、停止條件（餘額／輸／贏／單次倍數／時間）、手動介入暫停 3 秒、怪少時自動換房。HUD 設定面板（`web/src/AutoPanel.tsx`，存 localStorage）、`A` 鍵切換 |
| 其他 | 遊戲畫面畫在 HUD 底欄上方（`setViewInsets`）；LocalServer 略過混進一般生怪區的 Boss；投射物改用掃過區段判定（貼身的怪也打得到） |

## 下一步（優先順序）

1. **M4 怪潮**：LocalServer 依 RoomDef.wave 排程，HUD 警告橫幅。
2. **M3 剩餘**：技能特效補齊（雷電、隕石、箭雨、旋風…目前共用刀光／施法特效）、押注等級外觀（武器光效；角色光源已完成）。
3. **M6**：炸彈怪連爆、Boss 定時出現與登場演出、大獎演出強化、畫質設定、手機觸控與窄螢幕排版、部署。
4. 掛機之後可補：鎖定指定怪種、自動換房的 N／T 開放設定。

## 驗證方式

- `npm run typecheck`、`npm test`（在 `game/`）
- `npm run dev` 後執行 `node scripts/shot.mjs <url> <輸出.png> <等待毫秒> <寬x高> <按鍵腳本>` 用本機 Edge 截圖並印出 console 錯誤與效能數據
- 網址參數：`?room=2&class=mage&mobs=2&lights=0&debug=1&content=dev|real`；預覽元件測試頁 `?preview=monster|map|avatar`
- `npm run sim -w @lawn/rtp-sim -- --strikes 100000000` 驗證 RTP
- `npx tsx scripts/hero-poses.ts <輸出.png>` 檢查主角原畫的武器握點
- 掛機中 `__lawnStats()` 會多出 `targetUid／targetX／targetY／targetFh／edgeTo／blacklisted`，可以看掛機在追哪隻、走哪條邊

## 決策紀錄

- 2026-10-15：content/ 檔名與 Aseprite frame 命名照 STUDIO_SPEC §8.1。
- 2026-10-15：MapDef 足場拆成 footholds／walls／ceilings（編輯器提議）。
- 2026-10-15：`content/class/` 由遊戲手寫。
- 2026-10-15：主題 ID 遵守 ID 規則（theme_0001…）。
- 2026-10-15：背景圖上下各留 2px 透明，避免 TileSprite 平滑取樣時上緣出現一條線。
- 2026-10-15：玩家身上加一盞柔光（亮度隨押注等級），暗場景才看得清楚。
- 2026-10-15：美術改為 Codex 的「森境：晨光魔法森林」（`game/assets/verdant/`）。
- 2026-10-15：使用者決定人物固定、只換武器、不換色（SPEC v0.6）。原畫主角的武器每幀都畫，握點用 `HERO_HANDS`。
- 2026-10-15：遊戲畫面不畫在 HUD 底欄下方（像楓之谷的狀態列）。
- 2026-10-15：掛機選怪分數 = 路線成本 × 80 + 水平距離（像素），目前目標 −60 避免來回換；自動換房條件先固定「走得到的怪少於 3 隻持續 8 秒」。
