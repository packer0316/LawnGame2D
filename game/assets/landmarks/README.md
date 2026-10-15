# 景點地圖美術套件

2026-10-15：在既有三層寬平台地圖加入六套景點主題。原有森林、洞窟、遺跡繼續保留；20 房中 6 房套用景點美術，14 房沿用奇幻原境。景觀以真實地標為靈感，採遊戲用的像素奇幻構圖。

遊戲「換房」可依 **奇幻原境／台灣景點／日本景點／世界景點** 篩選；編輯器主題清單也顯示景點分類及名稱。

| 分類 | 房間／主題 | 場景 | 地板與石階 | 平台與攀爬 | 台緣細節 |
|---|---|---|---|---|---|
| 台灣 | 04／theme_0004 | 九份燈雨山城 | 冷灰板岩、細密石砌接縫、石階踏面 | 深木棧台、紅色包邊、木梯及編繩 | 小型紅燈籠 |
| 台灣 | 05／theme_0005 | 阿里山曙光雲海 | 苔色山石、自然坡面 | 杉木棧台、下緣斜撐、綁帶木梯 | 蕨葉與木材端面 |
| 日本 | 09／theme_0006 | 富士山櫻映湖畔 | 冷藍灰石砌、淡色石階 | 石板平台、櫻粉邊框、紫木梯 | 石燈籠、落櫻及粉色微粒 |
| 日本 | 10／theme_0007 | 京都千本鳥居 | 苔灰參道石材、石階刻線 | 朱紅漆木平台、深色接頭與紅木梯 | 稀疏小鳥居 |
| 世界／希臘 | 16／theme_0008 | 聖托里尼藍灣 | 白灰泥、暖白石階、低對比修補紋理 | 厚白石露台、藍色飾帶、藍金屬梯 | 九重葛陶盆 |
| 世界／埃及 | 17／theme_0009 | 吉薩金砂神殿 | 大塊砂岩、幾何石刻、砂岩階面 | 厚砂岩平台、青綠嵌飾、銅色梯具 | 尖頂小石柱 |

## 素材與介面

- 本目錄 `tw_jiufen.png`、`tw_alishan.png`、`jp_fuji.png`、`jp_kyoto.png`、`gr_santorini.png`、`eg_giza.png` 是 **內建 image_gen** 產生的原始背景；完整六組提示詞在 [prompts.json](prompts.json)。沒有使用 CLI 圖像 API。
- [catalog.json](catalog.json) 統一記錄分類、國家、名稱、房號、主題 ID、材質與色盤。遊戲選圖、編輯器房間生成及地形產生器共用此檔。
- 正式背景：`content/backgrounds/{sceneId}_painted.png`。
- 正式圖塊及法線：`content/tilesets/{sceneId}.png`、`{sceneId}_n.png`；每張 128×96，格子 16×16，沿用 Verdant 索引。
- `game/tools/placeholder-art/src/landmarks.ts` 原生像素繪圖產生砌石、木構、平台、斜面、梯子及繩索；不是把舊圖塊整張換色。
- `game/engine/src/map/LandmarkScenery.ts` 根據實際足場放置主題裝飾，避開攀爬出口與傳送門；裝飾不增加碰撞。
- 石階刻線位於原有斜面內側，沿用既有斜坡碰撞與導航。平台位置、三層高度與大範圍戰鬥空間沿用平台設計。
- 房間怪物池、押注、傷害、掉落與 Boss 規則由遊戲機制維護，這套工具只同步景點房名與美術資料。

## 重建

只更新六套正式美術，在 `game/` 執行：

```powershell
npx tsx tools/placeholder-art/src/landmarks-cli.ts
```

原本 `npm run art` 也會把這六套背景／圖塊／主題帶入 `dev-content`，供正式內容建置工具使用；開發測試房間仍維持原本兩房。

需要重建完整三層房間來源時，在 `editor/` 執行：

```powershell
npm run fixtures -- --profile verdant --tilesets-from ../content/tilesets
npm run ldtk-convert -- --in editor/fixtures/ldtk-verdant/world.ldtk
npx tsx tools/fixtures/src/landmarkRooms.ts
```

fixtures 會重建 LDtk，之後若有手動編輯房間，先整合那些修改再執行。`landmarkRooms.ts` 只改六個景點房名，保留房間其他欄位。使用預設正式內容或 `?content=real` 觀看本次地圖。

擴充新景點時加入 catalog、背景原畫及需要的主題裝飾分支，再重建美術及指定房間；更動房名時也同步 catalog，以維持選圖分類一致。

## 驗證

- 遊戲與編輯器 TypeScript 檢查通過。
- 景點素材／美術輸出測試 9 項通過；平台導航／LDtk 轉換測試 9 項通過。
- 20 張地圖轉換：0 錯誤、0 警告。六套圖塊的實地及斜面透明邊界也通過檢查。
- 瀏覽器實際進入六個景點房間，檢查主題名稱、生怪、內容圖片載入、四個分類、分類內換房與 390px 手機選圖介面，沒有頁面例外或素材 404。
- 畫面紀錄：`game/art-review/landmark-{sceneId}.png`、`landmark-categories.png`、`landmark-mobile.png`，此資料夾不進 Git。
