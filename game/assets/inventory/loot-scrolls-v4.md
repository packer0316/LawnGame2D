# 怪物掉落卷軸 v4：側面紙卷

2026-10-16。依使用者提供的楓之谷卷軸截圖，重做成側面微展開、上下錯位捲邊的像素紙卷。紙身採 S 形弧度，捲口有暗色螺旋；以大色塊與單一印記，讓小尺寸掉落物容易辨識。

| 成功率 | 紙身與印記 | 地面光暈 |
|---|---|---|
| 10% | 金黃紙身、蜂蜜色捲邊、紫色四芒星印 | 淺金 |
| 60% | 朱紅紙身、米白折邊、米白火焰印 | 淡珊瑚紅 |
| 90% | 冰藍紙身、青色捲口、深青雙葉印 | 淺藍 |

素材為 `loot-scrolls-v4.png`，2172 × 724 RGBA；一列三格，左至右 10%／60%／90%。使用 imagegen skill 的 built-in `image_gen` 模式製作，生成原圖與 alpha 直接保存，完整提示詞及來源記於 [loot-scrolls-v4-prompts.json](loot-scrolls-v4-prompts.json)。

`engine/src/inventory/scrollArt.ts` 載入 v4，依 alpha 邊界裁出三款後，僅為地圖掉落建立 18 × 17 像素圖格；透明邊緣採硬切，再以最近鄰放大至最長邊 34 世界像素，呈現較粗的馬賽克顆粒。處理在載入時完成一次，完成後釋放來源 GPU 紋理。拋出、彈跳、漂浮、暫停、吸取與掉落規則沿用既有設定。

背包與商人繼續直接使用清晰的原 PNG，不套用掉落的低解析圖格。`forgeArt.ts` 保存三格 alpha 裁切座標，`ScrollArt` 透過 SVG viewBox 去掉多餘留白、等比例置中。桌面選項 64px、手機 42px、商人 36px。v3 圖保留作歷史素材。

驗證：`npm run typecheck`、`npm run build -w @lawn/web`，以及 `node scripts/loot-scroll-review.mjs`。瀏覽器檢查三款 frame、紋理、顯示大小、落地漂浮、暫停、三件吸取與完整清除；地圖截圖在 `art-review/scroll-loot-v4-map.png`。
