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
| 技能列（SPEC v0.7） | 底欄上方一排、鍵盤 1–6；20 個技能接上 Codex 的 12 組整體動畫（`avatar/motions.ts`，播放時取代紙娃娃），位移 dash／leap／blink／連鎖瞬移、cues、`path` 範圍，程式特效 `feel/SkillFx.ts`（閃電、隕石、岩刺、冰環、箭雨、殘影…）；遠程普攻瞄準與追蹤（`projectile.aim`）、爆裂箭（`projectile.explode`）；`feel/skills.test.ts` 檢查動作 Tag、特效名、圖示 |
| 開發／實際模式（SPEC v0.8） | 右上角設定切換（`web/src/SettingsPanel.tsx`、`lawn.mode`）；實際模式：普攻 + 常駐小技能 X（`ClassDef.secondary`），技能列靠掉落（LocalServer `SKILL_DROP_CHANCE` → `AttackResult.results[].drop`）、用一次就沒了；技能方塊 `feel/SkillDrops.ts` 落地展示後由 HUD `PickupLayer` 飛進格子；技能圖示統一在 `engine/src/ui/skillIcons.ts`（HUD 與方塊共用） |
| 大絕招（SPEC v0.9） | 每職業兩個全地圖大絕招（area `map`、`scatter`、金框、掉落權重 0.3）：聖劍斬、天劍降臨、隕石天降、死神召喚、萬箭齊發、流星神箭、分身飛鏢、忍術・影分身；所有技能位移與範圍放大、特效大小跟著範圍；技能列 8 格（1–8）；金幣飛向底欄持有金幣（`setHudAnchors`） |
| 其他 | 遊戲畫面畫在 HUD 底欄上方（`setViewInsets`）；LocalServer 略過混進一般生怪區的 Boss；投射物改用掃過區段判定（貼身的怪也打得到）；怪物巡邏抽成 `monster/patrol.ts`（斜坡不再當成邊緣、被擊退到區外能走回來、兩邊都走不了就發呆）；空中落地改沿整條移動線段判定（衝刺撞上坡不再穿地）；影襲／瞬移到怪背後會看牆；掉出地圖回到最後站過的地面 |

## 下一步（優先順序）

1. **技能逐個優化**（使用者要逐個看）：手感、時間點、特效美術化；目前特效全是程式繪製，可換成 Aseprite 特效。
2. **M4 怪潮**：LocalServer 依 RoomDef.wave 排程，HUD 警告橫幅。
3. **M3 剩餘**：押注等級外觀（武器光效；角色光源已完成）。
4. **M6**：炸彈怪連爆、Boss 定時出現與登場演出、大獎演出強化、畫質設定、手機觸控與窄螢幕排版、部署。
5. 掛機之後可補：鎖定指定怪種、自動換房的 N／T 開放設定。

## 驗證方式

- `npm run typecheck`、`npm test`（在 `game/`）
- `npm run dev` 後執行 `node scripts/shot.mjs <url> <輸出.png> <等待毫秒> <寬x高> <按鍵腳本>` 用本機 Edge 截圖並印出 console 錯誤與效能數據
- 網址參數：`?room=2&class=mage&mobs=2&lights=0&debug=1&content=dev|real`；預覽元件測試頁 `?preview=monster|map|avatar`
- `npm run sim -w @lawn/rtp-sim -- --strikes 100000000` 驗證 RTP
- `npx tsx scripts/hero-poses.ts <輸出.png>` 檢查主角原畫的武器握點
- 實際模式測掉落：`?mode=real&drop=1`（每殺必掉）；`?mode=dev` 直接用開發模式
- 技能截圖：`__lawnStats()` 的 `screenX／screenY` 是角色腳底在畫面上的位置，截圖可以用它對準角色
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
- 2026-10-15：技能列取代 X／C 兩格技能；職業改成只能在 HUD 點選切換（1–4 讓給技能列）。普攻保留紙娃娃動作（出手快），技能列技能播整體動畫。
- 2026-10-15：森境旅人技能動作是遊戲自帶素材（Vite 直接 import `game/assets/verdant/motions/export`），不經過 content/。
- 2026-10-15：遠程普攻瞄準（editor agent 轉達使用者需求）：法師 ±35° 追蹤 540°/s、弓箭 ±25° 只在出手時轉向、飛鏢 ±35° 追蹤 300°/s；投射物不被地形擋。
- 2026-10-15：使用者要開發模式／實際模式（右上角設定）。實際模式的兩個基礎技能 = 普攻 + 常駐小技能（使用者選定），其餘大技能靠掉落、用一次就沒了。掉落機率普通 5%／菁英 25%／特殊 35%／Boss 100%（遊戲端決定，可再調）。
- 2026-10-15：`FootholdWorld.findLanding` 改成掃過整條移動線段（上升中只接實心足場），`PHYSICS_VERSION` 升到 2。content/ 裡存的導航圖是舊物理算的，map_0003／0007／0012／0015／0019 有幾條跳躍邊不同，要請編輯器重新產生。
- 2026-10-15：使用者要大絕招全地圖範圍。技能特效先做示意，正式特效由使用者用 Codex 美術化。注意：一刀一注下，大範圍不會多殺（擊殺機率按打到的隻數分攤）；要「殺得多」需要另外的特殊玩法預算，待使用者決定。
- 2026-10-15：lawngame2d-5a（使用者另開的 session）改了押注 21 級、持有金幣移到底欄、怪物巡邏與落地判定；已照 COLLAB 協調。
- 2026-10-15：使用者要地圖滿版、少用小地圖，而且**不要放大遊戲比例**（試過鏡頭放大填滿，使用者否決、已移除）。要重新設計地圖本身：已請 lawngame2d-91 把每房寬度改成至少 1920（建議 1920–2880）。
- 2026-10-15：使用者要我直接重新設計地圖：先試 1920–2880（分段構圖），使用者說太寬、要「螢幕看得到頭尾」→ 改成每房固定 1440px（舊 6 房的寬度，使用者認可的樣子），一房一組構圖、30 隻怪。產生器在 editor/tools/fixtures（`roomWidth`），已通知 lawngame2d-91。
- 2026-10-15：跑步時劍跟前臂平行（使用者回報）。原因是武器角度沿用舊骨架、但握點換成原畫的手。改成依原畫關鍵姿勢設定劍與法杖的角度（`HERO_RUN_HELD`，跑步姿勢 1–3），劍身與握拳的前臂垂直；重產 dev-content 並用 build-content --only avatar 同步 content/avatar。
- 2026-10-15：使用者改規則：實際模式跟開發模式一樣固定技能列，但技能用押注解鎖（`SkillDef.unlockBet`：一般技能 10／50／100／200／500、大絕招 1000／2000；X 常駐小技能一直能用）。取消技能方塊掉落（移除 SkillDrops、PickupLayer、LocalServer 掉落判定、`?drop=`）。
- 2026-10-15：使用者改規則：技能不用押注解鎖，改成每個技能有價格 ×N（1–20）。一刀扣 押注 × c，c = (N÷刀數)×min(1, 打中÷滿價隻數)，擊殺率乘上 c、派彩倍率不變，RTP 恆為 96%。價格 = round(預期打中隻次^0.7)（大量折扣＝CP 值），大絕招 20、普攻 1。計算工具 `npm run prices -w @lawn/rtp-sim [-- --write]`（從正式地圖量密度）；數學在 shared/src/math/skillCost.ts；開發模式每刀 1 倍（AttackReq.flat）。
- 2026-10-15：掉落演出（使用者要求）：金幣、武器、卷軸先落地、漂浮 1–1.5 秒，再被吸到玩家身上（`feel/Pickups.ts`，取代 FxLayer 的金幣與「飛向持有金幣」）。伺服器回傳每隻怪的掉落物（`rollLootDrops`、`AttackResult.results[].loot`），卷軸圖示用程式畫、依成功率上色。
- 2026-10-15：使用者要昇龍斬、瞬移術、影襲多一些垂直移動、斜上斜下、距離加大，掛機不要一直停在同一層。新增位移 `tierLeap`／`tierBlink`（找上下兩層內怪最多的足場，落點水平至少差 160 → 斜著過去；大跳用拋物線、往下穿過腳下平台），連鎖加 `verticalWeight`；掛機 `tierSkill`（目標在別層直接用技能）與 `proactiveHop`（別層怪差不多多、或同層待 8 秒就換層）。房 6 掛機 30 秒：劍士地面 87%→18%、換層 2→14 次。
