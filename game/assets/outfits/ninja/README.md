# 蒼影忍裝 · 完整角色套服

2026-10-15。背包 →「套服」→「穿上套服」。套服與武器分開裝備，四職業共用；卸下即恢復森境旅人原裝。

## 外觀

保留原本棕色亂髮、琥珀眼睛、葉形髮飾、臉型與身形。新裝採深靛交襟上衣、銀邊輕甲、蒼青腰帶與雙尾長巾、炭黑褲、綁腿和分趾忍鞋。臉部保持可見；飄帶跟隨跑跳、旋轉、揮砍與背身攀爬改變姿態。

圖片使用內建 **image_gen** 編輯模式製作，逐張參考原本完整序列；原始圖片不覆寫。提示詞保存在 [prompts-v1.json](prompts-v1.json)。

## 全部動作

| 圖集 | 原始造型格 | 遊戲時間軸 | 對應動作 |
|---|---:|---:|---|
| base-v1.png | 16 | 67 | stand、run、jump、fall、land、roll、prone、ladder、rope、swing1、swing2、swing3、cast、shoot、throw |
| spin-draw-v1.png | 16 | 16 | jump_spin、draw_slash |
| slashes-v1.png | 16 | 16 | slash_horizontal、slash_rising |
| heavy-thrust-v1.png | 16 | 16 | cleave_heavy、thrust |
| mage-v1.png | 16 | 16 | mage_cast、mage_staff_burst |
| archer-v1.png | 16 | 16 | archer_aimed_shot、archer_quick_shot |
| assassin-v2-v1.png | 16 | 16 | assassin_dual_slash、assassin_throw |

共 7 張新原畫、112 個造型格；依原本播放規則整理為 **15 組基礎動作／67 格 + 12 組技能動作／96 格**。基礎動作延用原本關鍵姿勢的重複節奏；技能各 8 格。遊戲仍決定位移，圖片不新增根位移。

## 接入

- `export/ninja-base.png`、`ninja-base.sheet.json`：128×128 虛擬畫布、腳底 (64,120)、面向左；完全沿用原始時間軸、圖層與手／軀幹／頭錨點。
- `export/ninja-motions.png`、`ninja-motions.sheet.json`：對應全部 12 組整體技能動畫，時間與原圖一致；旋轉跳使用原本骨盆對齊。
- `export/base-contact.png` 與 `motions-contact.png`：全部遊戲格的檢閱圖。
- `AvatarView.setOutfit('ninja-1' | null)` 同步切換基礎圖集、技能圖集、握把遮擋及殘影來源。沿用現有武器規則：原始職業武器使用整體技能動畫，收藏武器使用可疊圖的對應姿勢與原技能時鐘。
- `InventoryState.outfits` 保存套服收藏，`equippedOutfit` 保存全職業共用欄位。新存檔直接取得此套；舊 v1 存檔遷移時保留金幣、武器、強化與卷軸，補上套服欄位。
- 套服不加能力、不改碰撞、傷害或技能時間，不佔武器背包格，也不參與武器衝卷和出售。
- 素材由遊戲美術包載入，原本 `content/` 與編輯器檔案不變。

## 重建與驗證

在 `game/` 執行 `npx tsx tools/placeholder-art/src/ninja-outfit.ts`。此工具沿用既有圖集打包程式，僅切格、對齊與面積縮放，不重畫或換色；輸出 67 + 96 格，遇到缺圖、切邊或主體數量不符會失敗。

`npm test` 包含舊存檔遷移、穿卸保存、未知套服防護、全動作時間與錨點一致性。

`node scripts/outfit-review.mjs` 檢查真實背包穿卸、重載保存、四職業切換、左右面向 536 次基礎格、268 次收藏武器疊圖及 96 個技能格／殘影來源，並輸出桌面與手機截圖至 `art-review/`。可用 `LAWN_REVIEW_URL` 指定開發伺服器。
