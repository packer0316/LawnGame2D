# 森境美術套件

遊戲預設美術方向：晨光魔法森林。深青綠環境、霧金介面、栗髮綠斗篷旅人、可辨識輪廓的森林怪物。森林與洞窟各有獨立背景。

## 原畫與產出

`forest.png`、`cave.png`、`monsters.png`、`hero.png` 由內建 image_gen 產生；完整提示詞保存在 [prompts.json](prompts.json)。PNG 原畫保留在此目錄，不依賴使用者電腦上的生成暫存路徑。

`game/tools/placeholder-art/src/painted.ts` 將透明原畫切成角色與怪物圖格，使用 alpha 加權面積採樣縮到遊戲尺寸，再輸出現有 Aseprite JSON 格式。怪物沿用既有待機、移動、受擊、死亡與出現時間軸；死亡使用逐幀壓縮、碎化與淡出。主角 16 張關鍵姿勢對應 15 種動作、67 幀時間軸，並非 67 張不同的手繪原畫。

主角以標準 `overall_0001` 整體造型部件接入紙娃娃，四職業武器獨立疊圖。此造型的髮色、臉與衣服整合在原畫中；卸下整體造型後仍可使用原有分件、表情與換色功能。原有分件也更新了衣領、扣具、靴子及武器細節。沒有修改編輯器、內容 schema 或正式 `content/` 資料。

地形圖塊、材質法線、草葉藤蔓、傳送門與粒子由程式生成。非重複背景以 cover 方式顯示並隨鏡頭移動；地形的足場、碰撞、押注與派彩規則維持既有資料。

## 重建與驗證

在 `game/` 執行：

```sh
npm run art
npm run dev
npm run typecheck
npm test
npm run build
node visual-check.mjs http://localhost:5173
```

`dev` 與 `build` 會先重建 `game/dev-content/`；正式 build 會將素材複製到 `game/web/dist/dev-content/`。根目錄的啟動批次檔也會重建。網址加 `?content=dev` 可明確預覽此套件。

瀏覽器檢查使用本機 Chrome／Edge（也可設定 `CHROME_PATH`），驗證職業、技能按鈕、押注、移動、跳躍、戰鬥、說明、除錯切換、房間往返及桌機／窄螢幕排版，截圖輸出至 `game/art-review/`。自動掛機沿用原本尚未實作的狀態，介面明示「即將開放」。
