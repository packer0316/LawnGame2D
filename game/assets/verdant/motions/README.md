# 森境旅人技能動作素材

延續 `../hero.png` 的栗髮、葉片髮飾、米白圍巾、綠衣披風與皮靴。四職業共 12 組，每組 8 幀，首尾使用該職業完全相同的待機像素。新增素材獨立交付，尚未綁定遊戲技能；機制與邏輯由 Claude 接入。

完整的技能動作描述、逐幀階段、出手時點與接入約定，見 [技能描述與接入紀錄](SKILL_RECORD.md)；程式可讀取的描述資料見 [skill-catalog.json](skill-catalog.json)。

直接開啟 [動畫預覽](export/preview.html)，支援播放／暫停、逐幀拖曳、半速、左右朝向與原點參考線。此檔內嵌圖集，可離線開啟。逐幀總覽見 [contact-sheet.png](export/contact-sheet.png)。

| 職業 | 動作 tag | 內容 |
|---|---|---|
| 劍士 | `jump_spin` | 原地蹲伏、收腿、背面／側面／正面轉身、收勢 |
| 劍士 | `draw_slash` | 入鞘、握柄蓄勢、抽刀、橫斬、收勢 |
| 劍士 | `slash_horizontal` | 起手、橫向揮砍、下壓收刀 |
| 劍士 | `slash_rising` | 壓低重心、低位上挑、回收 |
| 劍士 | `cleave_heavy` | 雙手舉刀蓄勢、重劈、回收 |
| 劍士 | `thrust` | 收肘、定點突刺、收刀 |
| 法師 | `mage_cast` | 聚能、掌心施法、收勢 |
| 法師 | `mage_staff_burst` | 雙手提杖、舉杖、向前爆發、回收 |
| 弓箭手 | `archer_aimed_shot` | 取箭、搭箭、拉弦蓄力、放弦、回收 |
| 弓箭手 | `archer_quick_shot` | 快速搭箭、斜向拉弓、釋放、準備接續 |
| 刺客 | `assassin_dual_slash` | 交叉蓄勢、左右雙刃連斬、收勢 |
| 刺客 | `assassin_throw` | 舉刃、投擲、空手回收、從腰間補刃 |

## 給 Claude 的接入資料

- `export/hero-motions.png` 與 `export/hero-motions.sheet.json`：可由現有 `parseAsepriteSheet` 讀取的獨立 Aseprite 格式圖集，每幀未裁切畫布為 128×128。
- `export/motions.json`：動作 tag、全域幀範圍、每幀毫秒數、視覺出手時點、原畫切格來源及對齊資料。
- 固定 root 為 `(64,120)`，所有幀 `rootMotion = {x:0,y:0}`；預設面向左。鏡像應以 root 為中心。
- 地面動作對齊腳底與身體中心；旋轉動作固定骨盆 `(64,102)`，不包含整個角色升降的跳躍弧線。程式自行施加跳躍、前衝、後退等世界位移。
- **角色與武器已合圖**，播放時替代整個紙娃娃；不要再疊原有身體、衣服或 `weapon_*`，避免雙重角色／武器。這批不是可任意換武器的分件素材，也沒有宣稱提供獨立握把錨點。
- 首尾待機只保證此套件同職業動作間一致。接回舊版 `overall_0001` 的待機時，請使用本套件首幀作銜接；舊版武器姿態與這批不相同。
- `visualReleaseAtMs` 是美術出手時間參考，不是命中、傷害、冷卻或取消規則。雙刃連斬第二段出手在 local frame 4；弓箭與飛刃投射物由程式建立。法師亮點只表現近手聚能。
- 新 tag 尚未加入共用 `AVATAR_TAGS` 或職業技能 JSON，也未改遊戲／編輯器邏輯。若要走既有紙娃娃系統，請先決定如何載入獨立整體動畫。

## 重建及驗證

在 `game/` 執行：

```powershell
npx tsx tools/placeholder-art/src/hero-motions.ts
node assets/verdant/motions/verify.mjs
npm run typecheck
```

輸出預設保存在此目錄的 `export/`，不會覆蓋 `content/`、`dev-content/` 或原有 `overall_0001`。匯出器先分離連通角色主體，保留跨名義格線的刀尖／披風，再用每張原畫固定倍率採樣至原有 62px 站姿高度，不按每幀包圍盒伸縮。圖集保留透明 alpha。驗證包含 96 幀尺寸／邊界、原點、同職業首尾一致及桌機／手機播放控制。

## 原畫來源

本批使用內建 `image_gen`，不是 CLI/API fallback。完整提示詞見 [prompts.json](prompts.json)、[class-prompts.json](class-prompts.json) 與 [repair-prompt.json](repair-prompt.json)。原畫保存在此目錄 `hero-motion-*.png`；刺客正式使用 `hero-motion-assassin-v2.png`，修正第五姿勢多餘手臂。原始生成仍屬逐格關鍵姿勢，不是動作捕捉或骨架插值。
