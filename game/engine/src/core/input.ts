/** 遊戲動作；鍵盤、觸控按鈕、掛機都透過這層輸入（SPEC §2.6）。 */
export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'attack'
  | 'skill1'
  | 'skill2'
  | 'roll'
  | 'betDown'
  | 'betUp'
  | 'auto'
  | 'debug'
  | 'class1'
  | 'class2'
  | 'class3'
  | 'class4'
  | 'roomPrev'
  | 'roomNext';

/** 正在 HUD 的輸入框打字：不當成遊戲按鍵。 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'range'].includes(target.type);
  return target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Space: 'jump',
  AltLeft: 'jump',
  AltRight: 'jump',
  KeyZ: 'attack',
  ControlLeft: 'attack',
  ControlRight: 'attack',
  KeyX: 'skill1',
  KeyC: 'skill2',
  ShiftLeft: 'roll',
  ShiftRight: 'roll',
  KeyQ: 'betDown',
  KeyE: 'betUp',
  KeyA: 'auto',
  F1: 'debug',
  Digit1: 'class1',
  Digit2: 'class2',
  Digit3: 'class3',
  Digit4: 'class4',
  PageUp: 'roomPrev',
  PageDown: 'roomNext',
};

/**
 * 記錄按住與「剛按下」。剛按下的事件會保留到被消耗為止，
 * 因為固定步長的物理可能比畫面更新慢或快。
 */
export class InputState {
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private readonly onKeyDown = (event: KeyboardEvent) => {
    const action = KEYMAP[event.code];
    if (!action || isTyping(event.target)) return;
    event.preventDefault();
    if (!event.repeat) this.press(action);
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    const action = KEYMAP[event.code];
    if (!action || isTyping(event.target)) return;
    event.preventDefault();
    this.release(action);
  };
  private readonly onBlur = () => this.held.clear();
  /** 任何移動或攻擊輸入時呼叫（掛機用來偵測手動介入）。 */
  onManualInput: (() => void) | null = null;

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  press(action: Action): void {
    if (!this.held.has(action)) this.pressed.add(action);
    this.held.add(action);
    if (['left', 'right', 'up', 'down', 'jump', 'attack', 'skill1', 'skill2', 'roll'].includes(action)) this.onManualInput?.();
  }

  release(action: Action): void {
    this.held.delete(action);
  }

  isHeld(action: Action): boolean {
    return this.held.has(action);
  }

  /** 讀取並清除「剛按下」。 */
  consume(action: Action): boolean {
    return this.pressed.delete(action);
  }

  axisX(): -1 | 0 | 1 {
    const left = this.held.has('left');
    const right = this.held.has('right');
    return left === right ? 0 : left ? -1 : 1;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
