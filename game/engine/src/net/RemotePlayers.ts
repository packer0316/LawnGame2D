import * as Phaser from 'phaser';
import { AvatarView } from '../avatar/AvatarView';
import type { ContentBundle } from '../content/bundle';
import { WEAPON_BY_ID } from '../inventory/catalog';
import { DEPTH } from '../map/MapView';
import type { PlayerState } from './protocol';
import type { RemotePlayer } from './session';

/** 會一直重播的紙娃娃動作（其他像揮刀、跳躍播一次就停在最後一幀） */
const LOOPING = new Set(['stand', 'run', 'ladder', 'rope', 'prone']);
/** 內插：每個畫面拉近的比例（presence 約 10 次／秒）；離太遠直接瞬移 */
const FOLLOW = 0.25;
const SNAP_PX = 240;

interface View {
  avatar: AvatarView;
  label: Phaser.GameObjects.Text;
  state: PlayerState;
  x: number;
  y: number;
  shownTag: string;
  shownMotion: string | null;
  shownSeq: number;
  look: string;
}

/**
 * 同一間房的其他玩家（SPEC §5.5）：用同一套紙娃娃畫出他們的角色、武器、套服與技能動作，頭上掛名字。
 * 位置每 ~100ms 收到一次，畫面上平滑內插；動作在本機播（只在換動作時同步）。
 */
export class RemotePlayers {
  private readonly views = new Map<string, View>();
  private readonly names = new Map<string, string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bundle: ContentBundle,
    private readonly nameOf: (by: string | null, peer: string) => Promise<string>,
    private readonly lit: () => boolean,
  ) {}

  get count(): number {
    return this.views.size;
  }

  /** 這位玩家畫面上的位置（重播技能特效用）；不在了回傳 null。 */
  position(peer: string): { x: number; y: number; facing: 1 | -1 } | null {
    const view = this.views.get(peer);
    return view ? { x: view.x, y: view.y, facing: view.state.f } : null;
  }

  /** 這位玩家目前的整體動畫幀（殘影、分身特效用）。 */
  motionFrame(peer: string): { key: string; frame: string } | null {
    return this.views.get(peer)?.avatar.motionFrame ?? null;
  }

  /** 技能特效要暫時藏起角色（例如月斷的瞬步）。 */
  setVisible(peer: string, visible: boolean): void {
    const view = this.views.get(peer);
    view?.avatar.setVisible(visible);
    view?.label.setVisible(visible);
  }

  /** 收到最新的玩家清單：新的建角色、不見的移除。 */
  sync(players: readonly RemotePlayer[]): void {
    const seen = new Set<string>();
    for (const player of players) {
      seen.add(player.peer);
      let view = this.views.get(player.peer);
      if (!view) {
        view = this.create(player);
        this.views.set(player.peer, view);
      }
      view.state = player.state;
      this.applyLook(view);
    }
    for (const [peer, view] of this.views) {
      if (seen.has(peer)) continue;
      view.avatar.destroy();
      view.label.destroy();
      this.views.delete(peer);
    }
  }

  /** 每個畫面：位置內插、動作、名字。 */
  update(dtMs: number): void {
    for (const view of this.views.values()) {
      const s = view.state;
      const far = Math.abs(s.x - view.x) > SNAP_PX || Math.abs(s.y - view.y) > SNAP_PX;
      view.x = far ? s.x : view.x + (s.x - view.x) * FOLLOW;
      view.y = far ? s.y : view.y + (s.y - view.y) * FOLLOW;
      const avatar = view.avatar;
      avatar.setFacing(s.f);
      if (s.m) {
        if (s.m !== view.shownMotion || s.ms !== view.shownSeq) {
          view.shownMotion = s.m;
          view.shownSeq = s.ms;
          if (!avatar.playMotion(s.m)) avatar.stopMotion();
        }
      } else if (view.shownMotion) {
        view.shownMotion = null;
        avatar.stopMotion();
      }
      if (!s.m && s.a !== view.shownTag) {
        view.shownTag = s.a;
        avatar.play(s.a, { loop: LOOPING.has(s.a), restart: true });
      }
      avatar.tick(dtMs);
      avatar.setPosition(Math.round(view.x), Math.round(view.y));
      view.label.setPosition(Math.round(view.x), Math.round(view.y) - 74);
    }
  }

  clear(): void {
    for (const view of this.views.values()) {
      view.avatar.destroy();
      view.label.destroy();
    }
    this.views.clear();
  }

  private create(player: RemotePlayer): View {
    const avatar = new AvatarView(this.scene, this.bundle);
    avatar.setDepth(DEPTH.player - 1).setAlpha(0.92);
    avatar.setLit(this.lit());
    const label = this.scene.add
      .text(player.state.x, player.state.y - 74, this.names.get(player.peer) ?? '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#d9f1ff',
        stroke: '#0b2230',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.numbers - 2)
      .setResolution(3);
    if (!this.names.has(player.peer)) {
      this.names.set(player.peer, '');
      void this.nameOf(player.by, player.peer).then((name) => {
        const text = name || '冒險者';
        this.names.set(player.peer, text);
        this.views.get(player.peer)?.label.setText(text);
      });
    } else label.setText(this.names.get(player.peer) || '冒險者');
    return { avatar, label, state: player.state, x: player.state.x, y: player.state.y, shownTag: '', shownMotion: null, shownSeq: -1, look: '' };
  }

  /** 職業武器、外觀武器、套服：有變才換。 */
  private applyLook(view: View): void {
    const s = view.state;
    const look = `${s.c}|${s.cw ?? ''}|${s.o ?? ''}`;
    if (look === view.look) return;
    view.look = look;
    const classDef = this.bundle.classes.get(s.c as never);
    view.avatar.setLoadout(classDef ? { weapon: classDef.weapon } : {});
    view.avatar.setOutfit(s.o);
    view.avatar.setCosmeticWeapon(s.cw ? WEAPON_BY_ID.get(s.cw) ?? null : null);
  }
}
