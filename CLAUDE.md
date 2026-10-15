# LawnGame2D

網頁版 2D 像素風「割草包裝的魚機」：每砍中一刀就是一次下注。外皮是楓之谷的世界與 Q 版紙娃娃，加上 Dead Cells 的手感與光影。

## 文件

- [doc/SPEC.md](doc/SPEC.md)：遊戲本體規格
- [doc/STUDIO_SPEC.md](doc/STUDIO_SPEC.md)：造型製作系統 LawnStudio 規格
- [doc/COLLAB.md](doc/COLLAB.md)：**兩個 agent 的分工與協作規則，開始工作前必讀**

## 資料夾

- `game/`：遊戲（Phaser 4 + TypeScript + Vite）
- `editor/`：LawnStudio（React + TypeScript + Vite）
- `content/`：編輯器寫入、遊戲讀取的遊戲資料
- `art/`：美術原始檔

開發時 `game/` 與 `editor/` 不要混在一起：只改自己負責的資料夾，需要改對方的檔案時用訊息請對方改（見 COLLAB.md）。

## 慣例

- 文件與註解用繁體中文。
- 使用者要求前不 commit、不 push。
