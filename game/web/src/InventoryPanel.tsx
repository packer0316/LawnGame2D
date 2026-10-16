import { useEffect, useRef, useState } from 'react';
import { BAG_CAPACITY, MERCHANT_ART, SCROLL_RATES, SCROLL_RULES, UPGRADE_SLOTS, WEAPONS, WEAPON_ART, WEAPON_BY_ID, WEAPON_KINDS, sellValue, type GameCommand, type HudState, type ScrollRate, type WeaponDefinition, type WeaponKind } from '@lawn/engine';
import './inventory.css';
import { ForgeRitual, ScrollArt } from './ForgeRitual';
import { preloadForgeArt } from './forgeArt';
import { Icon } from './Icons';
import { OUTFITS, OUTFIT_ART, OUTFIT_BY_ID } from '@lawn/engine';
import './inventory-workshop.css';
import './inventory-mobile.css';

function OutfitArt({ outfit, large = false }: { outfit: (typeof OUTFITS)[number]; large?: boolean }) {
  return <span role="img" aria-label={outfit.name} className={`outfit-art ${large ? 'large' : ''}`} style={{ backgroundImage: `url("${OUTFIT_ART[outfit.id]}")` }} />;
}

function WeaponArt({ weapon, large = false }: { weapon: WeaponDefinition; large?: boolean }) {
  return <span role="img" aria-label={weapon.name} className={`weapon-art ${large ? 'large' : ''}`} style={{ backgroundImage: `url("${WEAPON_ART[weapon.kind]}")`, backgroundPosition: `${weapon.frame % 5 * 25}% ${Math.floor(weapon.frame / 5) * 100}%` }} />;
}
function Merchant({ snapshot }: { snapshot: NonNullable<HudState['inventory']> }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const kind = snapshot.feedback?.kind;
    const action = kind === 'sold' || kind === 'bought' ? [6, 7, 6, 7] : kind === 'success' || kind === 'failed' || kind === 'destroyed' ? [4, 5, 4, 5] : [3, 0];
    let tick = 0;
    const idle = [0, 1, 1, 0, 2, 0, 1, 0];
    setFrame(action[0]!);
    const timer = setInterval(() => { tick++; setFrame(tick < action.length ? action[tick]! : idle[(tick - action.length) % idle.length]!); }, 340);
    return () => clearInterval(timer);
  }, [snapshot.feedback?.id]);
  return <div className="merchant-stage"><div className="merchant-halo" /><div role="img" aria-label="武器商人鐵鬚布洛姆" data-frame={frame} className="merchant-sprite" style={{ backgroundImage: `url("${MERCHANT_ART}")`, backgroundPosition: `${frame % 4 / 3 * 100}% ${Math.floor(frame / 4) * 100}%` }} /><div className="merchant-plinth" /></div>;
}
export function InventoryPanel({ state, command, mobile = false }: { state: HudState; command: (cmd: GameCommand) => void; mobile?: boolean }) {
  const [mobileView, setMobileView] = useState<'collection' | 'detail' | 'shop'>('collection');
  const [ritual, setRitual] = useState<{ snapshot: NonNullable<HudState['inventory']>; uid: string; weapon: WeaponDefinition; rate: ScrollRate }>();
  const forging = useRef(false);
  const snapshot = ritual?.snapshot ?? state.inventory!, bag = snapshot.inventory;
  const [tab, setTab] = useState<'bag' | 'catalog'>('bag');
  const [filter, setFilter] = useState<WeaponKind | 'all' | 'outfit'>('all');
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const outfitSelected = selectedOutfitId !== null;
  const [selected, setSelected] = useState(bag.items[0]?.uid ?? '');
  const [catalogId, setCatalogId] = useState(WEAPONS[0]!.id);
  const [rate, setRate] = useState<ScrollRate>(60);
  const [confirmSell, setConfirmSell] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const showcase = useRef<HTMLDivElement>(null);
  const close = () => { if (!forging.current) command({ type: 'inventoryOpen', open: false }); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('.inventory-close')?.focus();
    void preloadForgeArt().catch(() => {});
    return () => previous?.focus();
  }, []);
  useEffect(() => { setConfirmSell(false); }, [selected, tab, snapshot.feedback?.id]);
  const owned = outfitSelected ? undefined : bag.items.find((w) => w.uid === selected);
  const outfit = OUTFIT_BY_ID.get(selectedOutfitId ?? '');
  const def = outfitSelected ? undefined : tab === 'catalog' ? WEAPON_BY_ID.get(catalogId) : owned ? WEAPON_BY_ID.get(owned.definitionId) : undefined;
  const equipped = owned && def && bag.equipped[def.classId] === owned.uid;
  const rule = SCROLL_RULES[rate];
  const startRitual = () => {
    if (forging.current || !owned || !def || !owned.slotsLeft || !bag.scrolls[rate]) return;
    forging.current = true;
    showcase.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    setRitual({ snapshot, uid: owned.uid, weapon: def, rate });
  };
  const dismissRitual = () => {
    forging.current = false; setRitual(undefined);
    requestAnimationFrame(() => {
      const upgrade = dialog.current?.querySelector<HTMLButtonElement>('.upgrade:not(:disabled)');
      (upgrade ?? dialog.current?.querySelector<HTMLButtonElement>('.inventory-close'))?.focus();
    });
  };
  const feedback = state.inventory?.feedback;
  const result = ritual && feedback?.id !== ritual.snapshot.feedback?.id && feedback && ['success', 'failed', 'destroyed', 'error'].includes(feedback.kind) ? feedback : undefined;
  const grid = (tab === 'bag' ? bag.items.map((item) => ({ key: item.uid, def: WEAPON_BY_ID.get(item.definitionId)!, item })) : WEAPONS.map((def) => ({ key: def.id, def, item: undefined }))).filter(({ def }) => filter === 'all' || def.kind === filter);
  return <div className="inventory-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <section className={`inventory-window ${mobile ? 'inventory-mobile' : ''} ${ritual ? 'is-forging' : ''}`} data-mobile-view={mobileView} role="dialog" aria-modal="true" aria-label={ritual ? '武器卷軸刻印' : undefined} aria-labelledby={ritual ? undefined : 'inventory-title'} ref={dialog} onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || e.code === 'KeyI') close();
      if (e.key === 'Tab') {
        const controls = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled)')].filter(el => !el.closest('[inert]') && el.getClientRects().length > 0);
        if (!controls.length) { e.preventDefault(); return; }
        if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0]?.focus(); }
      }
    }}>
      <header className="inventory-header" inert={!!ritual}><div><span className="inventory-kicker">THE WAYFARER’S COLLECTION</span><h2 id="inventory-title">{mobile ? '背包' : '行囊與換裝工坊'}</h2><p>收藏武器與套服，穿出你的冒險風格。</p></div><div className="inventory-wallet"><small>持有金幣</small><strong>◈ {state.balance.toLocaleString()}</strong></div><button className="inventory-close" aria-label="關閉背包" onClick={close}><Icon name="close" /></button></header>
      {mobile && <nav className="inventory-mobile-nav" aria-label="背包頁面" inert={!!ritual}>
        <button aria-pressed={mobileView === 'collection'} onClick={() => setMobileView('collection')}>收藏</button>
        <button aria-pressed={mobileView === 'detail'} onClick={() => setMobileView('detail')}>換裝／強化</button>
        <button aria-pressed={mobileView === 'shop'} onClick={() => setMobileView('shop')}>商店</button>
      </nav>}
      <div className="inventory-body" inert={!!ritual}>
        <div className="inventory-browse">
        <section className="inventory-collection" aria-label="裝備收藏">
          <div className="inventory-tabs"><button aria-pressed={tab === 'bag'} onClick={() => setTab('bag')}>我的行囊 <small>{bag.items.length}/{BAG_CAPACITY}</small></button><button aria-pressed={tab === 'catalog'} onClick={() => setTab('catalog')}>外觀圖鑑 <small>{WEAPONS.length + OUTFITS.length} 款</small></button></div>
          <button className="inventory-outfit-slot" onClick={() => { setFilter('outfit'); setSelectedOutfitId(bag.equippedOutfit ?? OUTFITS[0].id); setMobileView('detail'); }}><span>套服欄位</span><strong>{OUTFIT_BY_ID.get(bag.equippedOutfit ?? '')?.name ?? '森境旅人・原裝'}</strong><small>四職業共用 ›</small></button>
          <nav className="inventory-filters" aria-label="裝備種類"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部</button>{(Object.keys(WEAPON_KINDS) as WeaponKind[]).map((kind) => <button key={kind} aria-pressed={filter === kind} onClick={() => { setFilter(kind); setSelectedOutfitId(null); }}>{WEAPON_KINDS[kind].name}</button>)}<button aria-pressed={filter === 'outfit'} onClick={() => { setFilter('outfit'); setSelectedOutfitId(bag.equippedOutfit ?? OUTFITS[0].id); }}>套服</button></nav>
          <div className="inventory-grid">{(filter === 'all' || filter === 'outfit') && OUTFITS.filter(o => tab === 'catalog' || bag.outfits.includes(o.id)).map(o => <button key={o.id} className={`inventory-item ${selectedOutfitId === o.id ? 'selected' : ''}`} aria-label={o.name} aria-pressed={selectedOutfitId === o.id} onClick={() => { setSelectedOutfitId(o.id); setMobileView('detail'); }}>{bag.equippedOutfit === o.id && <span className="inventory-equipped">已裝備</span>}<OutfitArt outfit={o} /><span className="inventory-item-name">{o.name}</span><small>套服 · 全職業</small></button>)}{grid.map(({ key, def: weapon, item }) => <button key={key} className={`inventory-item ${!outfitSelected && (tab === 'bag' ? selected : catalogId) === key ? 'selected' : ''}`} aria-label={`${weapon.name}${item ? `，強化 ${item.successes} 次` : '，圖鑑'}`} aria-pressed={!outfitSelected && (tab === 'bag' ? selected : catalogId) === key} onClick={() => { setSelectedOutfitId(null); if (tab === 'bag') setSelected(key); else setCatalogId(key); setMobileView('detail'); }}>
            {item && bag.equipped[weapon.classId] === item.uid && <span className="inventory-equipped">已裝備</span>}<WeaponArt weapon={weapon} /><span className="inventory-item-name">{weapon.name}</span>{item && item.successes > 0 && <b className="inventory-plus">+{item.successes}</b>}{tab === 'catalog' && <small>{bag.items.some((w) => w.definitionId === weapon.id) ? '已收藏' : '尚未收藏'}</small>}
          </button>)}</div>
          {!grid.length && filter !== 'outfit' && filter !== 'all' && <p className="inventory-empty">這裡還沒有武器，冒險擊敗怪物就有機會拾取。</p>}
          <footer className="inventory-collection-footer"><p>每把武器基礎回收價 1,000。冒險可拾取武器與卷軸。</p>{state.mode === 'dev' && !bag.demoGranted && <button className="inventory-demo" onClick={() => command({ type: 'inventory', action: { type: 'demoCollection' } })}>領取展示收藏（40 款）</button>}</footer>
        </section>
        <aside className="inventory-merchant"><span className="inventory-kicker">WEAPON MERCHANT</span><h3>鐵鬚・布洛姆</h3><p className="merchant-subtitle">鑑價、收購與旅人的老朋友</p><Merchant snapshot={snapshot} /><div className="merchant-dialogue" aria-live="polite" data-kind={snapshot.feedback?.kind ?? 'idle'} key={snapshot.feedback?.id ?? 0}>{snapshot.feedback?.message ?? '好武器值得珍藏。若想換個風格，我也樂意出個好價錢。'}</div>
          {snapshot.storageError && <p role="alert" className="inventory-storage-error">目前無法保存進度，請保持此頁開啟並檢查瀏覽器儲存空間。</p>}
          <div className="merchant-trade"><h4>武器收購{mobile && owned && tab === 'bag' && ` · ${def?.name}`}</h4><p>{equipped && tab === 'bag' ? '裝備中的武器請先卸下。' : '出售後武器會離開行囊，金幣立即入帳。'}</p>{confirmSell && owned && tab === 'bag' ? <div className="merchant-confirm"><span>確定交出 {def?.name}？</span><button onClick={() => command({ type: 'inventory', action: { type: 'sell', uid: owned.uid } })}>確認出售 · {sellValue(owned).toLocaleString()}</button><button onClick={() => setConfirmSell(false)}>保留</button></div> : <button className="inventory-sell" disabled={tab !== 'bag' || !owned || !!equipped} onClick={() => setConfirmSell(true)}>出售武器 {owned && tab === 'bag' ? `· ◈ ${sellValue(owned).toLocaleString()}` : ''}</button>}</div>
          <div className="merchant-shop"><h4>補給卷軸</h4>{SCROLL_RATES.map((r) => <div key={r}><span><ScrollArt rate={r} />{r}% 卷軸 <small>×{bag.scrolls[r]}</small></span><button disabled={state.balance < SCROLL_RULES[r].price || bag.scrolls[r] >= 9999} aria-label={`購買 ${r}% 卷軸`} onClick={() => command({ type: 'inventory', action: { type: 'buyScroll', rate: r } })}>◈ {SCROLL_RULES[r].price}</button></div>)}</div>
        </aside>
        </div>
        <section className="inventory-detail" aria-label="裝備詳細資料">
          {outfit ? <div className="inventory-detail-content inventory-outfit-detail">
            <div className="inventory-showcase outfit-showcase"><div className="inventory-rune">◇</div><OutfitArt outfit={outfit} large /><small>套服 · 全職業共用</small></div>
            <h3>{outfit.name}</h3><p className="inventory-description">{outfit.description}</p><p className="inventory-cosmetic">純外觀・不增加傷害或擊殺機率</p>
            <div className="outfit-details"><p>同一位森境旅人，整套替換頭部造型、衣裝、護臂與衣襬。</p><p>走跑、跳躍、翻滾、攀爬與四職業招式皆有對應外觀。</p><p>套服獨立保存，換職業時繼續穿著，也能搭配已收藏的武器。</p></div>
            {bag.outfits.includes(outfit.id) ? <button className="inventory-primary" onClick={() => command({ type: 'inventory', action: bag.equippedOutfit === outfit.id ? {type:'unequipOutfit'} : {type:'equipOutfit',outfitId:outfit.id} })}>{bag.equippedOutfit === outfit.id ? '卸下套服・恢復原裝' : '穿上套服'}</button> : <p>尚未收藏</p>}
            <p className="outfit-note">展示套服已加入收藏。套服不佔武器格、不使用武器卷軸。</p>
          </div> : def ? <>
            <div className="inventory-detail-content">
              <div className="inventory-weapon-summary">
                <div ref={showcase} className={`inventory-showcase ${ritual ? 'forge-active' : ''}`}><div className="inventory-rune">◇</div><WeaponArt weapon={def} large /></div>
                <div className="inventory-weapon-copy"><span className="inventory-weapon-kind">{WEAPON_KINDS[def.kind].name} · 外觀收藏</span><h3>{def.name}{tab === 'bag' && owned && owned.successes > 0 && <em> +{owned.successes}</em>}</h3><p className="inventory-description">{def.description}</p><p className="inventory-cosmetic">純外觀・不影響戰鬥</p></div>
              </div>
              {tab === 'bag' && owned ? <div className="inventory-equip-row">
                <div className="inventory-value"><span>商人回收價</span><strong>◈ {sellValue(owned).toLocaleString()}</strong></div>
                <button className="inventory-primary" onClick={() => command({ type: 'inventory', action: equipped ? { type: 'unequip', classId: def.classId } : { type: 'equip', uid: owned.uid } })}>{equipped ? '卸下外觀' : `裝備至${state.classes.find((c) => c.id === def.classId)?.name ?? ''}`}</button>
              </div> : <div className="inventory-catalog-note"><strong>外觀圖鑑</strong><p>每個系列的性能相同。透過冒險收集後，可在「我的行囊」換裝、強化或出售。</p></div>}
            </div>
            {tab === 'bag' && owned && <section className="inventory-forge" aria-label="武器強化">
              <div className="inventory-scroll-heading"><h4>武器卷軸</h4><small>成功只提升回收價</small></div>
              <div className="inventory-scrolls">{SCROLL_RATES.map((r) => <button key={r} className={`scroll-${r}`} aria-pressed={rate === r} onClick={() => setRate(r)}><ScrollArt rate={r} /><strong>{r}%</strong><small>持有 {bag.scrolls[r]}</small></button>)}</div>
              <div className="inventory-slots"><span>強化機會 <b>{owned.slotsLeft} / {UPGRADE_SLOTS}</b></span><div>{Array.from({ length: UPGRADE_SLOTS }, (_, i) => <i key={i} className={i < owned.slotsLeft ? 'available' : ''} />)}</div></div>
              <p className="inventory-risk">成功 <b>+{rule.bonus.toLocaleString()}</b> · 失敗後 <b>{rule.breakOnFailure * 100}%</b> 損毀<br /><small>消耗 1 張卷軸與 1 次機會 · 總損毀率 {Number(((1 - rule.success) * rule.breakOnFailure * 100).toFixed(1))}%。</small></p>
              <button className="inventory-primary upgrade" data-sfx="none" disabled={!!ritual || !owned.slotsLeft || !bag.scrolls[rate]} onClick={startRitual}>{ritual ? '強化中…' : `使用 ${rate}% 卷軸`}</button>
            </section>}
          </> : <div className="inventory-empty"><h3>{snapshot.feedback?.kind === 'destroyed' ? '武器已損毀' : '挑選一把武器'}</h3><p>{mobile ? '從「收藏」選取武器，查看外觀與強化資訊。' : '從左側行囊選取武器，查看外觀與強化資訊。'}</p>{mobile && <button className="inventory-primary" onClick={() => setMobileView('collection')}>返回收藏</button>}</div>}
        </section>
      </div>
      <footer className="inventory-bottom" inert={!!ritual}><span>純外觀 · 武器依職業保存 · 套服全職業共用</span><span>ESC 關閉 · DEMO 工坊</span></footer>
      {ritual && <ForgeRitual anchor={showcase} weaponName={ritual.weapon.name} weaponArt={<WeaponArt weapon={ritual.weapon} large />} rate={ritual.rate} result={result} mobile={mobile}
        onCommit={() => command({ type: 'inventory', action: { type: 'upgrade', uid: ritual.uid, rate: ritual.rate } })} onDismiss={dismissRitual} />}
    </section>
  </div>;
}
