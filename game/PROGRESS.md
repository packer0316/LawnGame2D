# 遊戲開發進度

依 [doc/SPEC.md §9](../doc/SPEC.md#9-里程碑) 的里程碑推進。每一輪開發先讀這份檔案決定下一個工作項目，完成後更新。

## M0 技術驗證 ✅（大致完成）

| 項目 | 狀態 | 結果 |
|---|---|---|
| 骨架：game/ workspaces、shared schema、engine、web | ✅ | typecheck、測試、截圖通過 |
| 測試美術產生器 `tools/placeholder-art` | ✅ | 18 部件、6 怪物、11 特效、3 主題、2 地圖、manifest；輸出有 schema 測試 |
| ① 像素渲染 + 光照效能 | ✅ | 1080p 剛好 2 倍、smoothPixelArt 清晰；87 隻怪 57 FPS、洞窟 70 隻怪全開光照 57 FPS（無頭 Edge，上限約 60）。手機實機尚未量測 |
| ② 戰鬥手感原型 | ✅ | 三連斬、按住連擊、翻滾（可被攻擊取消）、輸入緩衝 150ms、頓幀、鏡頭震動、閃白、擊退、刀光（依押注等級上色）、傷害數字往上疊 |
| ③ 紙娃娃：姿勢表 + 錨點 + 換色 | ✅ | 遊戲內組裝正常；換色（膚／髮／瞳／染）可用 |
| ④ 足場物理 | ✅ | 11 個單元測試；斜坡、下跳、繩梯、牆、天花板、土狼時間、跳躍緩衝 |

## M1 核心可玩 ✅（大致完成）

一刀一注（揮空不扣、投射物命中才扣）、LocalServer（錢包、擊殺判定、補怪、攻速限制）、押注控制（Q／E、HUD）、React HUD（換房、餘額、押注、技能冷卻、職業、訊息、大獎）、RTP 蒙地卡羅測試。

## M2（遊戲端負責的部分）✅

- `createMonsterPreview`（動作、模擬擊殺、判定框、巡邏）、`createMapPreview`（假鏡頭、光照、碰撞與導航圖疊加）已接上真畫面，`?preview=monster|map` 測試頁截圖驗證。
- `buildNavGraph`（@lawn/shared）：用 stepBody 模擬 run／drop／jump／climb，邊帶起跳點；7 個測試。產生器已用它填地圖導航圖。
- 實際操作驗證：爬梯上平台、傳送點換房（從上一房傳送點離開 → 出現在新房的下一房傳送點）、跳躍落地。

## 下一步（優先順序）

1. M3：四職業技能特效補齊（雷電、隕石、箭雨、旋風…目前共用刀光／施法特效）、押注等級外觀（武器光效、角色光源已完成）、20 房（等編輯器的 world.ldtk 匯出到 content/，或擴充產生器）、`tools/rtp-sim`。
2. M4：自動掛機（選怪、沿導航圖尋路、自動技能、自動換房、停止條件）、怪潮。
3. M5：`createAvatarPreview`、換裝 UI。
4. M6：炸彈怪連爆、Boss 登場、大獎演出強化、畫質設定、手機觸控按鈕、部署（靜態網站）。

## 驗證方式

- `npm run typecheck`、`npm test`（在 `game/`）
- `npm run dev` 後執行 `node scripts/shot.mjs <url> <輸出.png> <等待毫秒> <寬x高> <按鍵腳本>` 用本機 Edge 截圖並印出 console 錯誤與效能數據
- 網址參數：`?room=2&class=mage&mobs=2&lights=0&debug=1&content=dev|real`

## 決策紀錄

- 2026-10-15：content/ 檔名與 Aseprite frame 命名照 STUDIO_SPEC v0.2 §8.1。
- 2026-10-15：MapDef 足場拆成 footholds／walls／ceilings（編輯器提議）。
- 2026-10-15：`content/class/` 由遊戲手寫。
- 2026-10-15：紙娃娃所有部件畫在範本時間軸上；錨點部件只畫在視角幀（stand、ladder 第一幀）；變體圖層 `{layer}@{variant}`。
- 2026-10-15：主題 ID 遵守 ID 規則（theme_0001…）。
- 2026-10-15：背景圖上下各留 2px 透明，避免 TileSprite 平滑取樣時上緣出現一條線。
- 2026-10-15：玩家身上加一盞柔光（亮度隨押注等級），暗場景才看得清楚。
