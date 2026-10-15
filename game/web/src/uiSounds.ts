import { useEffect } from 'react';
import { sfx } from '@lawn/engine';

/** 押注、職業、自動冒險的按鈕由遊戲端出聲（快捷鍵也一樣），這裡不重複 */
const GAME_SOUNDED = '.bet-controls, .bet-picker, .class-select, .auto-button, [data-sfx="none"]';

/**
 * HUD 按鈕音效：點擊、滑鼠滑過。開面板（aria-expanded=false）用開啟聲、關面板或「關閉」用關閉聲，
 * 按鈕可以用 data-sfx 指定 sfxCues 的名稱。
 */
export function useUiSounds(): void {
  useEffect(() => {
    let hovered: Element | null = null;
    const buttonOf = (target: EventTarget | null) => (target instanceof Element ? target.closest('button') : null);
    const onClick = (e: MouseEvent) => {
      const button = buttonOf(e.target);
      if (!button || button.disabled || button.closest(GAME_SOUNDED)) return;
      const label = button.getAttribute('aria-label') ?? '';
      const expanded = button.getAttribute('aria-expanded');
      const name = button.dataset.sfx ?? (expanded === 'false' ? 'ui:open' : expanded === 'true' || label.startsWith('關閉') ? 'ui:close' : 'ui:click');
      sfx.play(name);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const button = buttonOf(e.target);
      if (button === hovered) return;
      hovered = button;
      if (button && !button.disabled) sfx.play('ui:hover');
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerover', onOver, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerover', onOver, true);
    };
  }, []);
}
