# COMBO Gold v1

原創像素斜體字形，金白上緣、橘金下緣、亮色描邊與深藍立體陰影。數字及英文 COMBO 使用同一套字型，取代角色旁的「幾連刃／連斬／連射／連鎖」。

## 資產與重製

- `combo-gold-v1.png`：透明字圖，768 × 256，8 欄 × 2 列，每格 96 × 128。
- `combo-gold-v1.fnt`：標準 XML BMFont；包含 `0123456789COMB+`，可供 Phaser bitmapText 等讀取。
- `combo-gold-v1.svg`：可編輯字形與描邊、漸層來源。
- `combo-gold-v1.json`：同一份 glyph metrics 的 JSON 版本，供其他工具使用。
- `node scripts/build-combo-font.mjs`：從原創像素字形矩陣重製全部資產；無外部字型依賴。需 Chrome（可設定 `CHROME_PATH`）。這組為程式定義字型，沒有使用生成圖片。

## 遊戲行為

每次伺服器確認的怪物命中累積 1 COMBO，同一次回覆以怪物 uid 去重；範圍技可同時增加多點，多段技與下一次普攻／技能接續累積。擊殺不是必要條件。揮空、無目標或伺服器拒絕不計。COMBO 只提供視覺回饋，沒有傷害、押注或獎勵加成。

- 連續命中至少 2 次才出現，最多顯示 99999。
- 每次確認命中刷新 **6 秒**接續時間，逾時淡出 450 ms；再次命中重新計數。
- 計時使用遊戲固定步進；背包暫停、命中停頓及慢動作不會額外消耗玩家的接續時間。
- 換房或換職業清空；舊房／舊職業尚未返回的命中回覆不能復活舊 COMBO。
- 普攻下一段的輸入寬限從 **250 ms → 650 ms**，與上面的累積計數分開處理。

## 演出與程式位置

`web/src/ComboHud.tsx` 直接讀取 `.fnt` 的字圖座標，在畫面中右方固定顯示數字與 COMBO；不跟角色、鏡頭震動移動，也不攔截點擊。每次命中短促放大回彈，10／50／100 COMBO 提升光芒強度與碎星，底部細光條顯示剩餘接續時間。支援手機、五位數及減少動態效果偏好。

`engine/src/feel/ComboTracker.ts` 管理計數；`GameScene.ts` 於實際命中回覆接入。原先 `SkillFx.contact()` 的每技能段數文字已移除。

驗證：`ComboTracker.test.ts`、`Player.test.ts` 與 `node scripts/combo-review.mjs`。瀏覽器截圖和報告存於忽略追蹤的 `art-review/`。
