# 白隼刺客服 · 兜帽半面套服

2026-10-15。行囊 →「套服」→「白隼刺客服」→「穿上套服」。可與蒼影忍裝獨立選取；四職業共用。

## 造型

依使用者提供的刺客教條參考，為原本森境旅人設計象牙白尖簷兜帽、灰色半面巾、深褐交叉束帶、暗紅腰巾與銀雕護臂。保留同一人物的琥珀眼睛、棕色瀏海與身形。所有姿勢都戴著兜帽，面巾遮住下半臉；背面顯示完整帽身，分岔衣襬隨跑跳、旋轉及攻擊改變姿態。

使用內建 **image_gen** 編輯模式，以原本動作圖作為姿勢參考、新套服基本圖作為服裝參考，逐張製作。提示詞與來源保存在 [prompts-v1.json](prompts-v1.json)。

## 完整動作

| 圖集 | 原畫格數 | 遊戲時間軸 | 動作 |
|---|---:|---:|---|
| base-v1.png | 16 | 67 | stand、run、jump、fall、land、roll、prone、ladder、rope、swing1、swing2、swing3、cast、shoot、throw |
| spin-draw-v1.png | 16 | 16 | jump_spin、draw_slash |
| slashes-v2.png | 16 | 16 | slash_horizontal、slash_rising |
| heavy-thrust-v1.png | 16 | 16 | cleave_heavy、thrust |
| mage-v1.png | 16 | 16 | mage_cast、mage_staff_burst |
| archer-v1.png | 16 | 16 | archer_aimed_shot、archer_quick_shot |
| assassin-v2-v1.png | 16 | 16 | assassin_dual_slash、assassin_throw |

7 張原畫共 112 個造型格，依現有規則整理成 **15 組基礎動作／67 格 + 12 組技能動作／96 格**。基礎時間軸延用原本關鍵姿勢重複方式；每組技能 8 格。所有位移、攻擊時間、傷害與碰撞仍由既有程式決定。

## 接入與保存

- `export/hood-base.png` 與 `.sheet.json`：128×128 虛擬畫布，沿用原本各幀時間、圖層、手／軀幹／頭／腳底錨點。
- `export/hood-motions.png` 與 `.sheet.json`：完整技能圖集；原地腳底對齊 (64,120)，旋轉跳沿用原本骨盆定位。
- `export/base-contact.png`、`motions-contact.png`：全部遊戲格的檢閱圖。
- `AvatarView.setOutfit('hood-1')` 同步替換身體、技能、握把遮擋與殘影；與武器獨立裝備。沿用原有武器規則：預設武器播放整體技能圖，收藏武器疊在對應基礎攻擊姿勢，使用技能時鐘。
- `InventoryState.equippedOutfit` 保存所穿套服。新存檔取得兩套；舊存檔驗證後補入新套服，保留原先穿著、武器、強化、金幣與卷軸。
- 純外觀、全職業共用，不佔武器格，不出售或衝卷。

## 重建與檢查

於 `game/` 執行 `npx tsx tools/placeholder-art/src/ninja-outfit.ts hood`。此共用打包工具僅切格、對齊與縮放，不繪製圖片；省略參數仍重建原忍裝。

`npm test` 檢查兩套完整時間軸、錨點、存檔遷移與切換。`node scripts/outfit-review.mjs` 檢查背包選取、穿卸、重載保存、四職業左右面向、全部 163 格與收藏武器握把遮擋。設定 `LAWN_OUTFIT_ID=ninja-1` 可回歸原忍裝，`LAWN_REVIEW_URL` 指定開發伺服器；桌面、手機截圖與報告輸出於 `art-review/`。
