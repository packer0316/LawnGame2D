# 技能與職業像素圖示 v1

2026-10-15。共 34 個技能圖示（含各職業普攻與劍士三段連擊）＋4 個職業頭像，使用 imagegen skill 的 built-in 模式生成；[原始提示詞](icon-prompts-v1.json)。原圖保留，UI 以 CSS source rectangle 取圖，沒有程式重繪或修改點陣圖。

| 圖集 | 尺寸／排列 | 內容 |
|---|---|---|
| [warrior-icons-v1.png](warrior-icons-v1.png) | 1254 × 1254，4 欄 × 3 列 | 劍士頭像、三段普攻、旋風、拔刀、地裂、突刺、昇龍、白虎、聖劍、天劍 |
| [mage-icons-v1.png](mage-icons-v1.png) | 1254 × 1254，3 欄 × 3 列 | 法師頭像、魔法彈、雷電、隕石、瞬移、冰霜、連鎖雷電、隕石天降、死神 |
| [archer-icons-v1.png](archer-icons-v1.png) | 1254 × 1254，3 欄 × 3 列 | 弓箭手頭像、單箭、穿透、箭雨、三連射、後空翻、爆裂、萬箭、流星神箭 |
| [assassin-icons-v1.png](assassin-icons-v1.png) | 1774 × 887，4 欄 × 2 列 | 刺客頭像、四刃飛鏢、六刃陣、影襲、疾風、迴旋、飛鏢分身、影分身 |

`web/src/skillArt.ts` 維護技能 ID → 圖集位置與繁體中文說明。各排使用明確裁切範圍，尤其劍士圖集不是等高的內容分布：以實際圖案界線排除相鄰列的碎片，再等比例置中，避免圖示頂高、底部漏圖。

技能按鈕只顯示圖片、快捷鍵和冷卻倒數。名稱、用途、冷卻秒數與現行押注費用移到 hover 說明卡；費用與冷卻取自 HUD 即時狀態，開發模式顯示每刀 1 倍。職業按鈕保留名稱，hover 額外顯示職業特色。

`HudAction.tsx` 使用 portal 避免 tooltip 被按鈕的 overflow 裁切；卡片依畫面邊界定位。支援滑鼠 hover、鍵盤 focus／Escape；冷卻按鈕仍能聚焦與查看說明，透過 aria-disabled 和 click guard 阻止施放。滑鼠點擊後停在按鈕上仍可閱讀說明。

hover／按下採整顆按鈕的覆蓋層，冷卻遮罩明確填滿按鈕後再按剩餘比例縮放，沒有只壓暗圖示的小矩形。快捷鍵與倒數保持在覆蓋層上方。

驗證：`node scripts/skill-icons-review.mjs` 檢查 34 技能完整對應、38 個不同圖格、36 個實際 HUD 技能按鈕、職業切換、名稱只出現在說明卡、鍵盤／冷卻互動、按下覆蓋層滿版，以及 1600／1920／680／375／320px 排版。截圖與報告在忽略的 `game/art-review/`。預設連線 5176，可用 `LAWN_REVIEW_URL` 覆寫。
