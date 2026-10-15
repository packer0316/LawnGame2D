import type { ClassId } from '@lawn/shared';
import warrior from '../../assets/ui/warrior-icons-v1.png?url';
import mage from '../../assets/ui/mage-icons-v1.png?url';
import archer from '../../assets/ui/archer-icons-v1.png?url';
import assassin from '../../assets/ui/assassin-icons-v1.png?url';
import moonExecution from '../../assets/skills/moon-execution/moonblades-v4.png?url';

export const ICON_ATLASES = {
  warrior: { url: warrior, width: 1254, height: 1254, cols: 4, rows: 3, bands: [[32,386],[420,772],[790,1200]], ids: ['warrior','skill_0001','skill_0002','skill_0003','skill_0004','skill_0005','skill_0006','skill_0007','skill_0008','skill_0009','skill_0040','skill_0041'] },
  mage: { url: mage, width: 1254, height: 1254, cols: 3, rows: 3, bands: [[0,410],[420,800],[810,1254]], ids: ['mage','skill_0011','skill_0012','skill_0013','skill_0014','skill_0015','skill_0016','skill_0042','skill_0043'] },
  archer: { url: archer, width: 1254, height: 1254, cols: 3, rows: 3, bands: [[0,410],[412,798],[802,1240]], ids: ['archer','skill_0021','skill_0022','skill_0023','skill_0024','skill_0025','skill_0026','skill_0044','skill_0045'] },
  assassin: { url: assassin, width: 1774, height: 887, cols: 4, rows: 2, bands: [[0,443],[444,887]], ids: ['assassin','skill_0031','skill_0032','skill_0033','skill_0034','skill_0035','skill_0046','skill_0047'] },
} as const;

// The generated art's rows have optical gutters, not exact equal-height cells.
// Explicit source rectangles remove neighboring-row fragments and center the art.
export const PIXEL_ICONS = Object.fromEntries(Object.values(ICON_ATLASES).flatMap(atlas => atlas.ids.map((id, index) => {
  const col = index % atlas.cols, row = Math.floor(index / atlas.cols);
  const [top, bottom] = atlas.bands[row]!, width = atlas.width / atlas.cols, height = bottom - top;
  return [id, { url: atlas.url, col, row, aspect: width / height,
    sizeX: atlas.width / width * 100, sizeY: atlas.height / height * 100,
    positionX: col * width / (atlas.width - width) * 100, positionY: top / (atlas.height - height) * 100,
  }];
})));
PIXEL_ICONS.skill_0048={url:moonExecution,col:1,row:0,aspect:1,sizeX:400,sizeY:400,positionX:100/3,positionY:0};

export const BASIC_SKILL: Record<ClassId, string> = { warrior: 'skill_0001', mage: 'skill_0011', archer: 'skill_0021', assassin: 'skill_0031' };
export const CLASS_DESCRIPTION: Record<ClassId, string> = {
  warrior: '近身劍術與沉重斬擊，駕馭龍影、白虎與聖劍之力。',
  mage: '施放雷電、冰霜與隕石，召喚死神展開大範圍攻勢。',
  archer: '以精準穿透、連射與箭雨進攻，搭配翻身射擊拉開距離。',
  assassin: '以四刃飛鏢、疾風連斬和影分身發動靈巧的連續攻勢。',
};
export const SKILL_DESCRIPTION: Record<string, string> = {
  skill_0048: '赤瞳結印，一斬分月；影分身在各層怪群間現身，留下銀藍月印。收刀後引爆全圖八段月刃，化成月光碎瓣消散。',
  skill_0001: '揮劍近身斬擊；按住 Z 可銜接三段普攻。',
  skill_0002: '三連斬第二段，以反向揮劍銜接連擊。',
  skill_0003: '三連斬終段，以重斬完成連擊。',
  skill_0004: '以自身為中心旋轉揮劍，對周圍敵人連續斬擊。',
  skill_0005: '蓄勢拔刀，向前釋放迅疾的連續刀光。',
  skill_0006: '重劍劈向地面，掀起岩刺與地裂震波。',
  skill_0007: '向前衝鋒突刺，以集中劍壓貫穿前方。',
  skill_0008: '向上挑斬，喚出藍色龍影展開連段攻勢。',
  skill_0009: '召喚纏繞藍焰與雷光的白虎，沿所在平台衝刺啃咬。',
  skill_0040: '凝聚聖劍光芒，向整張地圖釋放多段神聖斬擊。',
  skill_0041: '召喚多波天劍降下，撞擊平台並插入地面。',
  skill_0011: '向前發射魔法彈，飛行時可小幅追蹤目標。',
  skill_0012: '引落雷電，對範圍內目標造成連續雷擊。',
  skill_0013: '召喚燃燒隕石墜落，以爆炸衝擊攻擊範圍內敵人。',
  skill_0014: '瞬間轉移位置，在落點釋放奧術衝擊。',
  skill_0015: '釋放向外擴散的冰霜新星，攻擊周圍敵人。',
  skill_0016: '雷光在目標之間跳躍，連續追擊附近敵人。',
  skill_0042: '召喚多波燃燒隕石，對整張地圖展開轟擊。',
  skill_0043: '召喚死神降臨，以多段鐮刀橫掃和靈魂爆發進攻。',
  skill_0021: '瞄準前方目標射出單箭，發射時校正方向。',
  skill_0022: '蓄力射出穿透光箭，連續貫穿前方敵人。',
  skill_0023: '躍起射向天空，召來多波箭雨落向前方區域。',
  skill_0024: '快速連射三箭，持續壓制前方目標。',
  skill_0025: '向後翻身並射出扇形箭矢，邊退邊攻。',
  skill_0026: '射出爆裂箭，命中後在周圍炸開火焰。',
  skill_0044: '箭矢向天空展開，化成覆蓋畫面的多波金色箭雨。',
  skill_0045: '凝聚鳳凰般的烈焰神箭，以流星衝擊展開連續爆發。',
  skill_0031: '投出四刃飛鏢，以旋轉刃鋒追擊前方目標。',
  skill_0032: '展開六刃飛鏢陣；飛刃自轉、公轉，再沿切線逐把射出。',
  skill_0033: '藉影子穿梭近身，對目標發動連續突襲。',
  skill_0034: '以疾風般的衝刺連斬，掃過前進路徑上的敵人。',
  skill_0035: '擲出高速自轉的四刃迴旋鏢，往返切割並爆發金色命中光。',
  skill_0046: '飛鏢分身旋轉追擊，連續命中後收回玩家身旁。',
  skill_0047: '召出多個影分身，接力發動連續斬擊。',
};
