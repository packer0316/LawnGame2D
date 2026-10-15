/**
 * LDtk 專案 JSON 的型別（只列轉換會用到的欄位）。
 * 官方格式說明：https://ldtk.io/json/
 */

export interface LdtkProject {
  jsonVersion: string;
  defaultGridSize: number;
  /** 「關卡分開存檔」時為 true，此時 levels[].layerInstances 為 null，要另外讀 externalRelPath。 */
  externalLevels?: boolean;
  defs: LdtkDefs;
  levels: LdtkLevel[];
  /** 多世界模式時關卡放在這裡，levels 為空。 */
  worlds?: { identifier: string; levels: LdtkLevel[] }[];
}

export interface LdtkDefs {
  layers: LdtkLayerDef[];
  entities: LdtkEntityDef[];
  tilesets: LdtkTilesetDef[];
  enums: LdtkEnumDef[];
}

export type LdtkLayerType = 'IntGrid' | 'Entities' | 'Tiles' | 'AutoLayer';

export interface LdtkLayerDef {
  identifier: string;
  type: LdtkLayerType;
  uid: number;
  gridSize: number;
  intGridValues: { value: number; identifier: string | null; color: string }[];
  tilesetDefUid: number | null;
  autoSourceLayerDefUid?: number | null;
}

export interface LdtkEntityDef {
  identifier: string;
  uid: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
}

export interface LdtkTilesetDef {
  uid: number;
  identifier: string;
  /** 相對 .ldtk 檔的圖片路徑。 */
  relPath: string | null;
  pxWid: number;
  pxHei: number;
  tileGridSize: number;
  spacing: number;
  padding: number;
  __cWid: number;
  __cHei: number;
}

export interface LdtkEnumDef {
  identifier: string;
  uid: number;
  values: { id: string }[];
}

export interface LdtkLevel {
  identifier: string;
  iid: string;
  uid: number;
  worldX: number;
  worldY: number;
  pxWid: number;
  pxHei: number;
  fieldInstances: LdtkFieldInstance[];
  /** 由上到下（第一個是最上層）。 */
  layerInstances: LdtkLayerInstance[] | null;
  externalRelPath: string | null;
}

export interface LdtkLayerInstance {
  __identifier: string;
  __type: LdtkLayerType;
  __cWid: number;
  __cHei: number;
  __gridSize: number;
  __opacity: number;
  __pxTotalOffsetX: number;
  __pxTotalOffsetY: number;
  __tilesetDefUid: number | null;
  __tilesetRelPath: string | null;
  iid: string;
  levelId: number;
  layerDefUid: number;
  visible: boolean;
  overrideTilesetUid: number | null;
  /** 列優先；0 = 空。 */
  intGridCsv: number[];
  autoLayerTiles: LdtkTile[];
  gridTiles: LdtkTile[];
  entityInstances: LdtkEntityInstance[];
}

export interface LdtkTile {
  /** 圖塊左上角，相對圖層。 */
  px: [number, number];
  /** 圖塊在 tileset 圖中的左上角。 */
  src: [number, number];
  /** bit0 = 水平翻轉、bit1 = 垂直翻轉。 */
  f: number;
  /** tileset 中的圖塊編號。 */
  t: number;
  a: number;
}

export interface LdtkTileRect {
  tilesetUid: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LdtkEntityInstance {
  __identifier: string;
  __grid: [number, number];
  __pivot: [number, number];
  __tags: string[];
  __tile: LdtkTileRect | null;
  iid: string;
  defUid: number;
  width: number;
  height: number;
  /** pivot 點的位置，相對圖層。 */
  px: [number, number];
  fieldInstances: LdtkFieldInstance[];
}

export interface LdtkFieldInstance {
  __identifier: string;
  /** 例：Int、Float、String、Bool、Color、Array<String>、LocalEnum.PortalType、Tile */
  __type: string;
  __value: unknown;
  defUid: number;
}
