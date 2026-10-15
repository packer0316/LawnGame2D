"""
音效素材建置：下載來源（全部 CC0）→ 裁切、淡出、統一峰值 → 轉成 game/assets/sfx/{名稱}.mp3，並產生 CREDITS.md。

    python scripts/build-sfx.py            # 在 game/ 執行；來源快取在 game/.sfx-cache（不進 git）
    python scripts/build-sfx.py swing_1    # 只重做指定的音效

需要 ffmpeg 與 numpy。一個音效只是一層素材；技能的聲音由 engine/src/audio/sfxCues.ts 把多層疊起來。
"""
import io, json, os, subprocess, sys, urllib.request, zipfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, 'assets', 'sfx')
CACHE = os.path.join(GAME, '.sfx-cache')
SR = 44100
PEAK_DB = -1.0

# Kenney（CC0）：https://kenney.nl/assets/<名稱>
KENNEY = {
    'impact': 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
    'rpg': 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
    'interface': 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
    'ui': 'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip',
    'scifi': 'https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip',
    'digital': 'https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip',
    'casino': 'https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip',
    'jingles': 'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
}
KENNEY_PAGE = {'impact': 'impact-sounds', 'rpg': 'rpg-audio', 'interface': 'interface-sounds', 'ui': 'ui-audio', 'scifi': 'sci-fi-sounds', 'digital': 'digital-audio', 'casino': 'casino-audio', 'jingles': 'music-jingles'}

# OpenGameArt（CC0）
OGA = {
    'rpgpack': ('https://opengameart.org/sites/default/files/rpg_sound_pack.zip', 'artisticdude', 'RPG Sound Pack', 'https://opengameart.org/content/rpg-sound-pack'),
    'swishes': ('https://opengameart.org/sites/default/files/swishes.zip', 'artisticdude', 'Swishes Sound Pack', 'https://opengameart.org/content/swishes-sound-pack'),
    'battle': ('https://opengameart.org/sites/default/files/battle_sound_effects_0.zip', 'Ogrebane', 'Battle Sound Effects（選 CC0 授權）', 'https://opengameart.org/content/battle-sound-effects'),
}

# freesound（CC0；用公開的高品質預覽檔）：id → (預覽網址, 作者, 標題)
FREESOUND = {
    '60013': ('https://cdn.freesound.org/previews/60/60013_71257-hq.mp3', 'qubodup', "Whoosh"),
    '420668': ('https://cdn.freesound.org/previews/420/420668_6544098-hq.mp3', 'SypherZent', "Basic Melee Swing / Miss / Whoosh"),
    '420670': ('https://cdn.freesound.org/previews/420/420670_6544098-hq.mp3', 'SypherZent', "Strong Melee Swing"),
    '367182': ('https://cdn.freesound.org/previews/367/367182_5065048-hq.mp3', 'GaussTheWizard', "swing.mp3"),
    '72191': ('https://cdn.freesound.org/previews/72/72191_1070711-hq.mp3', 'snowflakes', "whip03.wav"),
    '724716': ('https://cdn.freesound.org/previews/724/724716_15139380-hq.mp3', 'greyfeather', "sword slash energy wave"),
    '442903': ('https://cdn.freesound.org/previews/442/442903_71257-hq.mp3', 'qubodup', "Slash"),
    '420674': ('https://cdn.freesound.org/previews/420/420674_6544098-hq.mp3', 'SypherZent', "Deep Cut / Slash / Gash"),
    '323526': ('https://cdn.freesound.org/previews/323/323526_4336114-hq.mp3', 'Kreastricon62', "Bloody Blade 2.wav"),
    '441666': ('https://cdn.freesound.org/previews/441/441666_3928631-hq.mp3', 'ethanchase7744', "sword slash.wav"),
    '547042': ('https://cdn.freesound.org/previews/547/547042_7614679-hq.mp3', 'CogFireStudios', "Hit Impact Sword 3"),
    '107589': ('https://cdn.freesound.org/previews/107/107589_1855536-hq.mp3', 'Qat', "unsheath_sword.wav"),
    '348242': ('https://cdn.freesound.org/previews/348/348242_4067257-hq.mp3', 'newagesoup', "PUNCH-BOXING-03.wav"),
    '458867': ('https://cdn.freesound.org/previews/458/458867_6436863-hq.mp3', 'Raclure', "Damage sound effect"),
    '263675': ('https://cdn.freesound.org/previews/263/263675_4946670-hq.mp3', 'PorkMuncher', "Bow_release.wav"),
    '536068': ('https://cdn.freesound.org/previews/536/536068_10912485-hq.mp3', 'EminYILDIRIM', "Bow Release Hit"),
    '394185': ('https://cdn.freesound.org/previews/394/394185_7280678-hq.mp3', 'saturdaysoundguy', "Arrow  Loose.wav"),
    '394180': ('https://cdn.freesound.org/previews/394/394180_7280678-hq.mp3', 'saturdaysoundguy', "Arrow Loose and Flyby"),
    '205938': ('https://cdn.freesound.org/previews/205/205938_3842302-hq.mp3', 'Twisted_Euphoria', "Arrow Impact"),
    '521552': ('https://cdn.freesound.org/previews/521/521552_11543986-hq.mp3', 'omerbhatti34', "Arrow Impact"),
    '515625': ('https://cdn.freesound.org/previews/515/515625_6769489-hq.mp3', 'mrickey13', "Throw/Swipe"),
    '346373': ('https://cdn.freesound.org/previews/346/346373_4882199-hq.mp3', 'denao270', "Throwing / Whip Effect"),
    '136542': ('https://cdn.freesound.org/previews/136/136542_1206321-hq.mp3', 'JoelAudio', "ELECTRIC_ZAP_001.wav"),
    '512471': ('https://cdn.freesound.org/previews/512/512471_7372230-hq.mp3', 'michael_grinnell', "Electric zap.wav"),
    '189630': ('https://cdn.freesound.org/previews/189/189630_2816253-hq.mp3', 'elliott.klein', "Spark"),
    '475094': ('https://cdn.freesound.org/previews/475/475094_9608356-hq.mp3', 'Josh74000MC', "thunder3.ogg"),
    '512476': ('https://cdn.freesound.org/previews/512/512476_7372230-hq.mp3', 'michael_grinnell', "Lightening bang Impact.wav"),
    '267887': ('https://cdn.freesound.org/previews/267/267887_5025429-hq.mp3', 'wjl', "Short-Fireball-Woosh.flac"),
    '539972': ('https://cdn.freesound.org/previews/539/539972_12029332-hq.mp3', 'Za-Games', "Fire Burst Flash"),
    '442872': ('https://cdn.freesound.org/previews/442/442872_71257-hq.mp3', 'qubodup', "Fire Magic"),
    '186932': ('https://cdn.freesound.org/previews/186/186932_545448-hq.mp3', 'ReadeOnly', "fire_explosion.wav"),
    '47252': ('https://cdn.freesound.org/previews/47/47252_364925-hq.mp3', 'deleted_user_364925', "bad explosion"),
    '138484': ('https://cdn.freesound.org/previews/138/138484_758593-hq.mp3', 'JustInvoke', "Chill Hit"),
    '719973': ('https://cdn.freesound.org/previews/719/719973_14083205-hq.mp3', 'InMotionAudio', "ICEBrk_Break04_InMotionAudio_FREESampleSunday"),
    '422633': ('https://cdn.freesound.org/previews/422/422633_8455865-hq.mp3', 'Aurelon', "Break something (ice/glass/...)"),
    '659762': ('https://cdn.freesound.org/previews/659/659762_6142149-hq.mp3', 'LilMati', "Magic Spell 05 Remastered.wav"),
    '264981': ('https://cdn.freesound.org/previews/264/264981_3370213-hq.mp3', 'renatalmar', "SFX Magic"),
    '249817': ('https://cdn.freesound.org/previews/249/249817_3756348-hq.mp3', 'spookymodem', "Magic Missiles.wav"),
    '406063': ('https://cdn.freesound.org/previews/406/406063_6556800-hq.mp3', 'Aleks41', "Magic Strike.wav"),
    '592573': ('https://cdn.freesound.org/previews/592/592573_11537497-hq.mp3', 'magnuswaker', "Laser Charge Up (Stronger)"),
    '676451': ('https://cdn.freesound.org/previews/676/676451_5672786-hq.mp3', 'TheLittleCrow', "Anime Charge Sound.wav"),
    '685256': ('https://cdn.freesound.org/previews/685/685256_12265588-hq.mp3', 'syntheffects', "Riser sound effect short.wav"),
    '561207': ('https://cdn.freesound.org/previews/561/561207_10825267-hq.mp3', 'Rizzard', "Riser"),
    '172207': ('https://cdn.freesound.org/previews/172/172207_2437358-hq.mp3', 'Leszek_Szary', "teleport"),
    '453391': ('https://cdn.freesound.org/previews/453/453391_9159316-hq.mp3', 'Breviceps', "Warp SFX"),
    '714257': ('https://cdn.freesound.org/previews/714/714257_71257-hq.mp3', 'qubodup', "Puff of Smoke"),
    '208111': ('https://cdn.freesound.org/previews/208/208111_2661585-hq.mp3', 'Planman', "Poof of Smoke"),
    '444491': ('https://cdn.freesound.org/previews/444/444491_9159316-hq.mp3', 'Breviceps', "Short Choir"),
    '240745': ('https://cdn.freesound.org/previews/240/240745_3215867-hq.mp3', 'majoranman', "Choir One-Shot"),
    '608892': ('https://cdn.freesound.org/previews/608/608892_3427082-hq.mp3', 'MarknKris1996', "Angel Reveal.wav"),
    '351408': ('https://cdn.freesound.org/previews/351/351408_4067257-hq.mp3', 'newagesoup', "GLEAM-GLOW-SFX-CHIME.wav"),
    '545238': ('https://cdn.freesound.org/previews/545/545238_11408647-hq.mp3', 'Mr._Fritz_', "Item Sparkle"),
    '442825': ('https://cdn.freesound.org/previews/442/442825_71257-hq.mp3', 'qubodup', "Dark Magic Loop"),
    '657653': ('https://cdn.freesound.org/previews/657/657653_6142149-hq.mp3', 'LilMati', "Black Portal - Dark Dimension Rift"),
    '428073': ('https://cdn.freesound.org/previews/428/428073_4067257-hq.mp3', 'newagesoup', "Sub Drop Smooth.wav"),
    '522099': ('https://cdn.freesound.org/previews/522/522099_11537497-hq.mp3', 'magnuswaker', "Concrete SMASH 2"),
    '385938': ('https://cdn.freesound.org/previews/385/385938_7097737-hq.mp3', 'Pól', "S020_Rock_Impact_Mono.wav"),
    '719865': ('https://cdn.freesound.org/previews/719/719865_14597127-hq.mp3', '_--Q--_', "Rumble 1"),
    '427803': ('https://cdn.freesound.org/previews/427/427803_2866779-hq.mp3', 'DeVern', "Cinematic Hit With Horns.wav"),
    '162455': ('https://cdn.freesound.org/previews/162/162455_311243-hq.mp3', 'Kastenfrosch', "Cannonball.mp3"),
    '571288': ('https://cdn.freesound.org/previews/571/571288_11058236-hq.mp3', 'Vaporpup', "tiger_roar.wav"),
    '85568': ('https://cdn.freesound.org/previews/85/85568_1206321-hq.mp3', 'JoelAudio', "DRAGON_ROAR.wav"),
    '442772': ('https://cdn.freesound.org/previews/442/442772_71257-hq.mp3', 'qubodup', "Slime Squish"),
    '751340': ('https://cdn.freesound.org/previews/751/751340_71257-hq.mp3', 'qubodup', "Slime Death"),
    '443334': ('https://cdn.freesound.org/previews/443/443334_1943411-hq.mp3', 'rolandseer', "MONEY_001.wav"),
    '387232': ('https://cdn.freesound.org/previews/387/387232_1474204-hq.mp3', 'steaq', "Badge Coin Win"),
    '607207': ('https://cdn.freesound.org/previews/607/607207_7724198-hq.mp3', 'Fupicat', "Congrats"),
    '521645': ('https://cdn.freesound.org/previews/521/521645_7724198-hq.mp3', 'Fupicat', "WinFantasia.wav"),
    '364690': ('https://cdn.freesound.org/previews/364/364690_2531187-hq.mp3', 'alegemaate', "Human Impact on Ground"),
}

# 輸出的每一層素材：(名稱, 來源, 起點秒, 終點秒, 淡出毫秒, 音量 dB)
# 來源：'k:<包>/<檔名>'（Kenney）、'o:<包>/<包內路徑>'（OpenGameArt）、'f:<id>'（freesound）
# 終點 None = 到結尾；音量 dB 是峰值正規化到 -1 dBFS 之後再加減（層與層的相對大小在 sfxCues.ts 調）
S = []
def add(name, src, start=0.0, end=None, fade=30, gain=0.0):
    S.append((name, src, start, end, fade, gain))

# 揮砍（短促的破風聲，多種隨機）
for i, n in enumerate([3, 7, 9, 5, 12]): add(f'swing_{i + 1}', f'o:swishes/swishes/swish-{n}.wav')
add('swing_6', 'o:rpgpack/RPG Sound Pack/battle/swing.wav')
add('swing_7', 'o:rpgpack/RPG Sound Pack/battle/swing3.wav')
add('swing_big', 'f:420670')
add('swing_heavy', 'f:367182', 0.12, 0.62, 80)
add('whoosh', 'f:60013')
add('whoosh_soft', 'f:420668')
add('whip', 'f:72191', 0.02, 0.4, 60)
add('swish_long', 'o:battle/battle_sound_effects/swish_3.wav', 0, 0.5, 80)
add('blade_wave', 'f:724716', 0.06, 0.44, 80)
# 刀刃命中
add('cut_1', 'f:442903')
add('cut_2', 'f:420674', 0.02)
add('cut_3', 'f:323526', 0.1, 0.7, 120)
add('slice_1', 'k:rpg/knifeSlice.ogg')
add('slice_2', 'k:rpg/knifeSlice2.ogg')
add('sword_ring', 'f:441666', 0.02, 1.15, 450, -2)
add('sword_clang', 'f:547042', 0, 0.9, 300)
add('draw_1', 'o:rpgpack/RPG Sound Pack/battle/sword-unsheathe.wav')
add('draw_2', 'o:rpgpack/RPG Sound Pack/battle/sword-unsheathe3.wav')
add('draw_long', 'f:107589', 0.04, 0.95, 200)
# 打擊（肉體、鈍器）
for i in range(5): add(f'punch_h_{i + 1}', f'k:impact/impactPunch_heavy_00{i}.ogg')
for i in range(5): add(f'punch_m_{i + 1}', f'k:impact/impactPunch_medium_00{i}.ogg')
for i in range(3): add(f'soft_h_{i + 1}', f'k:impact/impactSoft_heavy_00{i}.ogg')
add('hit_hard', 'f:348242', 0, 0.35, 120)
add('hit_flesh', 'f:458867')
# 金屬、鐘、玻璃、岩石
for i in range(3): add(f'metal_l_{i + 1}', f'k:impact/impactMetal_light_00{i}.ogg')
for i in range(3): add(f'metal_m_{i + 1}', f'k:impact/impactMetal_medium_00{i}.ogg')
for i in range(2): add(f'metal_h_{i + 1}', f'k:impact/impactMetal_heavy_00{i}.ogg')
for i in range(2): add(f'plate_h_{i + 1}', f'k:impact/impactPlate_heavy_00{i}.ogg')
for i in range(2): add(f'bell_{i + 1}', f'k:impact/impactBell_heavy_00{i}.ogg')
for i in range(3): add(f'glass_l_{i + 1}', f'k:impact/impactGlass_light_00{i}.ogg')
for i in range(2): add(f'glass_h_{i + 1}', f'k:impact/impactGlass_heavy_00{i}.ogg')
for i in range(3): add(f'mining_{i + 1}', f'k:impact/impactMining_00{i}.ogg')
for i in range(2): add(f'wood_{i + 1}', f'k:impact/impactWood_light_00{i}.ogg')
# 弓箭
add('bow_release', 'f:263675', 0.12, 0.45, 80)
add('bow_snap', 'f:536068')
add('bow_twang', 'o:battle/battle_sound_effects/Bow.wav', 0.09)
add('arrow_loose', 'f:394185', 0.07)
add('arrow_fly', 'f:394180')
add('arrow_hit_1', 'f:205938', 0.08, 0.5, 120)
add('arrow_hit_2', 'f:521552')
# 投擲（飛鏢、飛刀）
add('throw_1', 'f:515625', 0, 0.3, 80)
add('throw_2', 'f:346373', 0.1)
add('metal_ring', 'o:rpgpack/RPG Sound Pack/inventory/metal-ringing.wav')
add('metal_tick', 'o:rpgpack/RPG Sound Pack/inventory/metal-small2.wav')
# 雷電
add('zap_buzz', 'f:136542')
add('zap_short', 'f:512471')
add('spark', 'f:189630')
add('thunder', 'f:475094', 0.17, 2.4, 900)
add('thunder_bang', 'f:512476', 0.2, 2.2, 900)
# 火焰、爆炸
add('fire_whoosh', 'f:267887')
add('fire_burst', 'f:539972')
add('fire_hit', 'f:442872')
add('fire_roar', 'f:186932', 0.5, 3.9, 400)
add('explosion', 'f:47252')
add('explosion_low', 'k:scifi/lowFrequency_explosion_000.ogg')
for i in range(3): add(f'explosion_crunch_{i + 1}', f'k:scifi/explosionCrunch_00{i}.ogg')
add('cannon', 'f:162455', 0.06, 1.8, 600)
# 冰
add('ice_hit', 'f:138484')
add('ice_shatter', 'f:719973', 0, 0.8, 200)
add('ice_break', 'f:422633', 0.26, 1.0, 200)
# 魔法（施法、彈、蓄力、瞬移）
add('magic_cast', 'f:659762')
add('magic_sparkle', 'f:264981', 0, 1.2, 400)
add('magic_bolt', 'f:249817', 0.45, 1.4, 300)
add('magic_impact', 'f:406063', 0.1, 1.9, 500)
add('magic_whoosh', 'o:rpgpack/RPG Sound Pack/battle/magic1.wav')
add('charge_short', 'f:592573')
add('charge_long', 'f:676451', 0.05, 2.0, 300)
add('riser', 'f:685256', 0.9, 2.86, 20)
add('riser_2', 'f:561207', 0.5)
add('teleport', 'f:172207')
add('warp', 'f:453391', 0, 1.6, 400)
add('puff', 'f:714257')
add('poof', 'f:208111', 0.17)
# 神聖
add('choir', 'f:444491')
add('choir_2', 'f:240745')
add('angel', 'f:608892', 2.1, None, 600)
add('chime', 'f:351408', 1.4, 4.4, 1200)
add('sparkle', 'f:545238')
# 黑暗
add('dark_drone', 'f:442825', 0, None, 300)
add('dark_portal', 'f:657653', 0.08, None, 600)
add('sub_drop', 'f:428073', 0, 2.5, 800)
for i, n in enumerate([1, 5, 9]): add(f'shade_{i + 1}', f'o:rpgpack/RPG Sound Pack/NPC/shade/shade{n}.wav')
# 大地、重擊、演出
add('smash', 'f:522099')
add('rock', 'f:385938', 0.14)
add('rumble', 'f:719865', 0.3, 3.4, 900)
add('cinematic_hit', 'f:427803', 0, 3.0, 1200)
# 生物
add('tiger_roar', 'f:571288')
add('dragon_roar', 'f:85568', 0, 2.0, 500)
# 怪物
add('squish', 'f:442772')
add('monster_die', 'f:751340')
# 金幣、獎勵
add('coin_2', 'o:rpgpack/RPG Sound Pack/inventory/coin3.wav')
add('coins_handle', 'k:rpg/handleCoins.ogg')
add('coins_burst', 'f:443334', 0, 1.2, 400)
for i in range(1, 4): add(f'chips_{i}', f'k:casino/chips-collide-{i}.ogg')
add('chip_lay', 'k:casino/chip-lay-1.ogg')
add('chips_stack', 'k:casino/chips-stack-1.ogg')
add('power_up', 'k:digital/powerUp3.ogg')
add('win_coin', 'f:387232', 0, 2.4, 600)
add('win_big', 'k:jingles/jingles_STEEL07.ogg')
add('win_mega', 'f:607207')
add('win_super', 'f:521645', 0, 3.4, 600)
# 介面
add('ui_click', 'k:interface/select_002.ogg')
add('ui_hover', 'k:ui/rollover2.ogg')
add('ui_open', 'k:interface/maximize_006.ogg')
add('ui_close', 'k:interface/minimize_006.ogg')
add('ui_toggle', 'k:interface/toggle_002.ogg')
add('ui_confirm', 'k:interface/confirmation_002.ogg')
add('ui_error', 'k:interface/error_004.ogg')
add('ui_select', 'k:interface/select_002.ogg')
add('ui_switch', 'k:ui/switch3.ogg')
# 移動
add('jump', 'k:rpg/cloth2.ogg')
add('land_heavy', 'f:364690', 0, 0.45, 150)
for i in range(3): add(f'step_{i + 1}', f'k:impact/footstep_grass_00{i}.ogg')


def fetch(url, path):
    if os.path.exists(path): return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, 'wb') as f: f.write(r.read())
    return path


def source_file(src):
    kind, rest = src.split(':', 1)
    if kind == 'f':
        return fetch(FREESOUND[rest][0], os.path.join(CACHE, 'freesound', f'{rest}.mp3'))
    pack, inner = rest.split('/', 1)
    if kind == 'k':
        zpath = fetch(KENNEY[pack], os.path.join(CACHE, 'kenney', f'{pack}.zip'))
    else:
        zpath = fetch(OGA[pack][0], os.path.join(CACHE, 'oga', f'{pack}.zip'))
    out = os.path.join(CACHE, 'x', kind, pack, inner)
    if not os.path.exists(out):
        with zipfile.ZipFile(zpath) as z:
            names = [n for n in z.namelist() if (n == inner or n.endswith('/' + inner)) and '__MACOSX' not in n]
            if not names: raise SystemExit(f'{src}：壓縮檔裡找不到 {inner}')
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, 'wb') as f: f.write(z.read(names[0]))
    return out


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def build(name, src, start, end, fade, gain):
    x = decode(source_file(src))
    a = int(start * SR)
    b = len(x) if end is None else min(len(x), int(end * SR))
    x = x[a:b]
    # 去掉前面的靜音（保留 5ms），讓疊加時起音對齊
    env = np.abs(x)
    thr = env.max() * 0.03
    lead = max(0, int(np.argmax(env > thr)) - int(0.005 * SR))
    x = x[lead:]
    # 尾端剪掉 -60 dB 以下
    tail = np.where(env[lead:] > env.max() * 0.001)[0]
    if len(tail): x = x[: tail[-1] + 1]
    n_in = min(len(x), int(0.003 * SR))
    x[:n_in] *= np.linspace(0, 1, n_in)
    n_out = min(len(x), int(fade / 1000 * SR))
    if n_out > 0: x[-n_out:] *= np.linspace(1, 0, n_out) ** 1.5
    x *= 10 ** ((PEAK_DB + gain) / 20) / (np.abs(x).max() + 1e-9)
    os.makedirs(OUT, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, f'{name}.mp3')],
                   input=x.astype(np.float32).tobytes(), check=True)
    return len(x) / SR


def credit(src):
    kind, rest = src.split(':', 1)
    if kind == 'f':
        _, author, title = FREESOUND[rest]
        return f'freesound「{title}」by {author}（https://freesound.org/s/{rest}/）'
    pack, inner = rest.split('/', 1)
    if kind == 'k':
        return f'Kenney「{KENNEY_PAGE[pack]}」{inner}（https://kenney.nl/assets/{KENNEY_PAGE[pack]}）'
    _, author, title, page = OGA[pack]
    return f'OpenGameArt「{title}」by {author}：{inner.split("/")[-1]}（{page}）'


def main():
    only = set(sys.argv[1:])
    names = [s[0] for s in S]
    dup = {n for n in names if names.count(n) > 1}
    if dup: raise SystemExit(f'名稱重複：{dup}')
    total = 0.0
    for name, src, start, end, fade, gain in S:
        if only and name not in only: continue
        total += build(name, src, start, end, fade, gain)
    lines = ['# 音效素材來源', '', '由 `game/scripts/build-sfx.py` 產生，請勿手改。全部是 **CC0（公眾領域）**，不需署名；列出來源方便追溯與替換。', '',
             '| 檔案 | 來源 | 裁切 |', '|---|---|---|']
    for name, src, start, end, fade, gain in S:
        cut = f'{start:g}–{"結尾" if end is None else f"{end:g}"} 秒'
        lines.append(f'| `{name}.mp3` | {credit(src)} | {cut} |')
    with open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8', newline='\n') as f: f.write('\n'.join(lines) + '\n')
    print(f'{len(S) if not only else len(only)} 個音效，總長 {total:.1f} 秒 → {OUT}')


if __name__ == '__main__':
    main()
