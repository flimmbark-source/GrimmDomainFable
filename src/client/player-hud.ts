/**
 * Player HUD for the Orchard contest. It shows what the server projected for
 * this seat and turns clicks and keys into commands. It holds no game state:
 * health, the bag, worn gear and quick slots all come from `you.kit`, and
 * every change is a request the server may refuse.
 */
import type { Command, HeroAction, KitView, OperationView, SanctuaryView, Snapshot, Team } from '../shared/protocol.ts';
import { GEAR_SLOTS, ITEMS, type GearSlot, type ItemId } from '../shared/sim/items.ts';
import './player-hud.css';

const ICON_ROOT = `${import.meta.env.BASE_URL}art/player-hud/`;
const icon = (name: string) => `<img src="${ICON_ROOT}${name}.webp" alt="" draggable="false">`;
const GEAR_LABEL: Record<GearSlot, string> = { weapon: 'Weapon', boots: 'Boots', charm: 'Charm' };

const actions = [
  { id: 'attack', art: 'strike', label: 'Attack', key: 'A' },
  { id: 'evade', art: 'evade', label: 'Evade', key: 'E' },
  { id: 'sneak', art: 'sneak', label: 'Sneak', key: 'S' },
  { id: 'whistle', art: 'whistle', label: 'Whistle', key: 'W' },
] as const;

type Action = HeroAction | 'interact' | 'stop' | 'camera';
type GroundPoint = { x: number; z: number };

export interface PlayerHudHost {
  /** Ask the server for something. */
  send(command: Command): void;
  toggleCamera(): void;
}

export class PlayerHud {
  private readonly root = document.createElement('section');
  private kit: KitView | null = null;
  private team: Team = 'light';
  private interact: Command | null = null;
  private selected: ItemId | null = null;
  private assigning = false;
  private open = false;
  private enabled = false;
  private snapshotKey = '';
  private kitKey = '';
  private actionTarget: GroundPoint | null = null;
  private operationFinished = false;

  private readonly actionMenu: HTMLElement;
  private readonly menuAnchor: HTMLElement;
  private readonly bag: HTMLElement;
  private readonly bagToggle: HTMLButtonElement;
  private readonly gearList: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly details: HTMLElement;
  private readonly slots: HTMLButtonElement[];
  private readonly objective: HTMLElement;
  private readonly prompt: HTMLButtonElement;
  private readonly location: HTMLElement;
  private readonly energy: HTMLElement;
  private readonly output: HTMLProgressElement;
  private readonly offline: HTMLProgressElement;
  private readonly objectiveDetails: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly detection: HTMLElement;
  private readonly detectionLabel: HTMLElement;
  private readonly attack: HTMLButtonElement;
  private readonly sneak: HTMLButtonElement;
  private readonly whistle: HTMLButtonElement;
  private readonly cooldown: HTMLElement;
  private readonly camera: HTMLButtonElement;
  private readonly cameraLabel: HTMLElement;
  private readonly heroName: HTMLElement;
  private readonly health: HTMLMeterElement;
  private readonly healthText: HTMLElement;
  private readonly stats: HTMLElement;

  constructor(private readonly host: PlayerHudHost) {
    this.root.id = 'player-hud';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Player interface');
    this.root.innerHTML = `
      <section class="ph-objective" aria-label="Orchard objective">
        <div class="ph-objective-title"><span class="ph-marker" aria-hidden="true"></span><strong></strong></div>
        <div class="ph-objective-details">
          <div class="ph-location">North of the bridge</div>
          <div class="ph-energy" aria-label="Dark Energy"></div>
          <div class="ph-objective-meter ph-output">
            <div>Dark relay output <span class="ph-total" aria-hidden="true"></span></div>
            <progress aria-label="Dark relay output"></progress>
          </div>
          <div class="ph-objective-meter ph-offline" hidden>
            <div>Time held offline <span class="ph-total" aria-hidden="true"></span></div>
            <progress aria-label="Time held offline"></progress>
          </div>
        </div>
        <div class="ph-notice" role="status" hidden></div>
      </section>
      <button type="button" class="ph-view ph-surface" data-action="camera" aria-keyshortcuts="Tab"><span></span> <kbd>Tab</kbd></button>
      <button type="button" class="ph-relay ph-surface" data-action="interact" hidden></button>
      <div class="ph-detection ph-surface" hidden><span class="ph-eye" aria-hidden="true"></span><span class="ph-detection-label"></span></div>
      <div class="ph-menu-anchor" aria-hidden="true" hidden></div>
      <div class="ph-actions ph-surface" role="group" aria-label="Actions at selected location" hidden>
        ${actions.map(({ id, art, label, key }) => `<button type="button" class="ph-action" data-action="${id}" aria-keyshortcuts="${key}">
          ${icon(art)}<span>${label}</span>${id === 'whistle' ? '<span class="ph-cooldown" hidden></span>' : ''}<kbd aria-hidden="true">${key}</kbd>
        </button>`).join('')}
      </div>
      <section id="player-inventory" class="ph-bag ph-surface" aria-label="Inventory" hidden>
        <header class="ph-bag-header"><strong>Inventory</strong><button type="button" class="ph-close" data-action="bag" aria-label="Close inventory">Close <kbd>Esc</kbd></button></header>
        <div class="ph-storage">
          <div class="ph-gear" aria-label="Equipment"></div>
          <div class="ph-grid" aria-label="Carried items"></div>
        </div>
        <div class="ph-detail" aria-live="polite"></div>
      </section>
        <div class="ph-character ph-surface">
          <div class="ph-portrait">${icon('portrait')}</div>
          <div class="ph-identity"><strong class="ph-name"></strong>
            <div class="ph-health-row"><meter class="ph-health" min="0" max="100" value="100" aria-label="Health"></meter><span class="ph-health-text"></span></div>
            <div class="ph-stats"></div>
          </div>
        </div>
        <div class="ph-kit">
          <div class="ph-quick" role="group" aria-label="Quick slots">
            ${[0, 1, 2].map((index) => `<button type="button" class="ph-slot ph-quick-slot" data-quick="${index}"></button>`).join('')}
          </div>
          <button type="button" class="ph-bag-toggle" data-action="bag" aria-controls="player-inventory" aria-expanded="false" aria-label="Inventory" aria-keyshortcuts="I">
            ${icon('bag')}<kbd aria-hidden="true">I</kbd>
          </button>
        </div>`;
    document.body.append(this.root);
    this.actionMenu = this.element('.ph-actions');
    this.menuAnchor = this.element('.ph-menu-anchor');
    this.bag = this.element('#player-inventory');
    this.bagToggle = this.element('.ph-bag-toggle');
    this.gearList = this.element('.ph-gear');
    this.grid = this.element('.ph-grid');
    this.details = this.element('.ph-detail');
    this.slots = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-quick]'));
    this.objective = this.element('.ph-objective-title strong');
    this.prompt = this.element('.ph-relay');
    this.location = this.element('.ph-location');
    this.energy = this.element('.ph-energy');
    this.output = this.element('.ph-output progress');
    this.offline = this.element('.ph-offline progress');
    this.objectiveDetails = this.element('.ph-objective-details');
    this.notice = this.element('.ph-notice');
    this.detection = this.element('.ph-detection');
    this.detectionLabel = this.element('.ph-detection-label');
    this.attack = this.element('.ph-action[data-action="attack"]');
    this.sneak = this.element('.ph-action[data-action="sneak"]');
    this.whistle = this.element('.ph-action[data-action="whistle"]');
    this.cooldown = this.element('.ph-cooldown');
    this.camera = this.element('.ph-view');
    this.cameraLabel = this.element('.ph-view span');
    this.heroName = this.element('.ph-name');
    this.health = this.element('.ph-health');
    this.healthText = this.element('.ph-health-text');
    this.stats = this.element('.ph-stats');
    this.setMode(false);
    this.root.addEventListener('click', (event) => this.click(event));
    this.actionMenu.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('pointerdown', (event) => {
      if (!this.actionTarget || !(event.target instanceof Node) || this.actionMenu.contains(event.target)) return;
      this.closeActions();
      // This press only dismissed the menu: it must not also move the hero.
      this.dismissed = true;
      setTimeout(() => (this.dismissed = false), 0);
    }, true);
    window.addEventListener('blur', () => this.closeActions());
    window.addEventListener('resize', () => this.closeActions());
    this.renderBag();
    this.renderQuick();
  }

  private dismissed = false;
  /** True while handling the press that just closed the action menu. */
  get dismissedMenu(): boolean { return this.dismissed; }
  get isOpen(): boolean { return this.open; }
  get usesActionMenu(): boolean { return this.enabled; }
  /** The command R would send right now (relay work or a revival), if any. */
  get interaction(): Command | null { return this.interact; }

  openActions(x: number, y: number, target: GroundPoint): void {
    if (!this.enabled || this.open || this.operationFinished || this.kit?.dead) return;
    this.actionTarget = target;
    this.actionMenu.hidden = false;
    const width = this.actionMenu.offsetWidth;
    const height = this.actionMenu.offsetHeight;
    const left = x + 14 + width <= innerWidth - 8 ? x + 14 : x - width - 14;
    const top = y + 14 + height <= innerHeight - 8 ? y + 14 : y - height - 14;
    this.actionMenu.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
    this.actionMenu.style.top = `${Math.max(8, Math.min(top, innerHeight - height - 8))}px`;
    this.menuAnchor.style.transform = `translate(${x}px, ${y}px)`;
    this.menuAnchor.hidden = false;
    this.actionMenu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  setHeroScreenPosition(x: number, y: number, visible: boolean): void {
    const hidden = !this.enabled || this.team !== 'light' || Boolean(this.kit?.dead) || !visible || x < 0 || y < 0 || x > innerWidth || y > innerHeight;
    if (this.detection.hidden !== hidden) this.detection.hidden = hidden;
    if (!hidden) this.detection.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  private closeActions(): void {
    if (!this.actionTarget) return;
    this.actionTarget = null;
    this.actionMenu.hidden = true;
    this.menuAnchor.hidden = true;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.closeActions();
      this.setOpen(false);
    }
    this.snapshotKey = '';
    this.root.hidden = !enabled;
    document.body.classList.toggle('has-player-hud', enabled);
  }

  setMode(hero: boolean): void {
    this.closeActions();
    const current = hero ? 'Hero view' : this.team === 'dark' ? 'Command view' : 'Strategy view';
    const target = hero ? (this.team === 'dark' ? 'Command view' : 'Strategy view') : 'Hero view';
    this.cameraLabel.textContent = current;
    this.camera.title = `Switch to ${target} (Tab)`;
    this.camera.setAttribute('aria-label', `${current}. Switch to ${target}`);
    this.heroMode = hero;
  }
  private heroMode = false;

  handleKey(event: KeyboardEvent): boolean {
    if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.code === 'KeyI' || (this.open && event.code === 'Escape')) {
      if (!event.repeat) this.setOpen(!this.open);
      return true;
    }
    if (this.actionTarget && event.code === 'Escape') {
      this.closeActions();
      return true;
    }
    if (event.code === 'KeyX') this.closeActions();
    if (/^Digit[1-3]$/.test(event.code)) {
      if (!event.repeat) this.useSlot(Number(event.code.at(-1)) - 1);
      return true;
    }
    if (!this.open) {
      const action = actions.find(({ key }) => event.code === `Key${key}`);
      if (action) {
        // The server applies the same rules to a hotkey as to a menu order;
        // the HUD only avoids sending what it already knows will be refused.
        if (!event.repeat && !this.operationFinished && !this.kit?.dead) {
          this.closeActions();
          this.host.send({ type: 'heroAction', action: action.id });
        }
        return true;
      }
    }
    return false;
  }

  setSnapshot(snapshot: Snapshot): void {
    const operation = snapshot.operation;
    const you = snapshot.you;
    const kit = you?.kit;
    if (!this.enabled || !operation || !you || !kit) return;
    if (you.team !== this.team) {
      this.team = you.team;
      this.root.dataset.team = you.team;
      document.body.dataset.team = you.team;
      this.setMode(this.heroMode);
    }
    this.kit = kit;
    this.interact = kit.interaction ? { type: 'revive' } : operation.interaction ? { type: 'workOperation' } : null;

    const kitKey = JSON.stringify([kit.equipment, kit.inventory, kit.quick, kit.attack, kit.evadeDistance, kit.salveHeal, kit.dead]);
    if (kitKey !== this.kitKey) {
      this.kitKey = kitKey;
      if (this.selected && !kit.inventory.some((entry) => entry.item === this.selected)) this.selected = null;
      if (kit.dead) this.setOpen(false);
      this.renderBag();
      this.renderStats(kit);
    }

    const sneaking = snapshot.actors.find((actor) => actor.id === you.actorId)?.sneaking === true;
    const notice = you.spotted ? 'Spotted' : you.attention > 0 ? 'Noticed' : 'Unseen';
    const seconds = Math.ceil(you.whistleCooldown / 30);
    const threatened = (snapshot.sanctuaries ?? []).filter((s) => s.threatened || s.corrupted);
    const key = JSON.stringify([operation.active, operation.offlineSeconds, operation.production, operation.energy, operation.energyPerSecond,
      operation.productionGoal, operation.offlineGoal, operation.interaction, Math.floor(operation.progress * 100),
      operation.interrupted, operation.result, sneaking, notice, seconds, kit.hp, kit.dead, kit.interaction,
      kit.channel && [kit.channel.kind, kit.channel.seconds], kit.ritualLost, kit.returnSeconds, threatened]);
    if (key === this.snapshotKey) return;
    this.snapshotKey = key;

    this.detectionLabel.textContent = notice;
    this.detection.dataset.notice = notice;
    this.sneak.setAttribute('aria-pressed', String(sneaking));
    this.attack.disabled = !kit.attack;
    this.attack.title = kit.attack ? 'Attack (A)' : 'No weapon equipped';
    this.whistle.disabled = seconds > 0;
    this.cooldown.hidden = seconds === 0;
    this.cooldown.textContent = `${seconds}s`;
    this.whistle.title = seconds ? `Whistle ready in ${seconds}s` : 'Whistle (W)';

    this.heroName.textContent = kit.dead ? (this.team === 'light' ? 'Ghost' : 'Fallen') : this.team === 'light' ? 'Goblin Outlaw' : 'Dark Hero';
    this.root.dataset.dead = String(kit.dead);
    this.health.max = kit.maxHp;
    this.health.low = kit.maxHp * 0.3;
    this.health.high = kit.maxHp * 0.6;
    this.health.optimum = kit.maxHp;
    this.health.value = kit.hp;
    this.healthText.textContent = `${kit.hp} / ${kit.maxHp}`;
    this.setObjective(operation, kit, threatened);
  }

  private setObjective(op: OperationView, kit: KitView, threatened: SanctuaryView[]): void {
    this.operationFinished = Boolean(op.result);
    if (this.operationFinished) this.closeActions();
    const light = this.team === 'light';
    this.objective.textContent = op.result === 'light' ? 'Light secured Orchard Vale' : op.result === 'dark' ? 'Dark held Orchard Vale' :
      kit.dead ? (light ? 'You have fallen' : 'You have fallen') :
      light ? (op.active ? 'Sabotage the Dark relay' : 'Keep the relay offline') : op.active ? 'Defend the Dark relay' : 'Repair the Dark relay';
    this.objectiveDetails.hidden = Boolean(op.result);
    this.location.hidden = !op.active;
    this.energy.textContent = `Dark Energy ${op.energy} (+${op.energyPerSecond}/s)`;
    this.energy.dataset.slowed = String(!op.active);
    this.offline.parentElement!.hidden = op.active;
    this.setProgress(this.output, op.production, op.productionGoal);
    if (!op.active) this.setProgress(this.offline, op.offlineSeconds, op.offlineGoal, 's');

    // One line of situation text: your own condition first, then sanctuary alerts.
    const lines: string[] = [];
    if (kit.dead && light) {
      lines.push(kit.ritualLost ? 'The wayshrine fell to corruption. Your ritual has ended: seek another wayshrine.' :
        'Travel to an uncorrupted wayshrine, or wait for a living ally at your body.');
    } else if (kit.dead && kit.returnSeconds !== undefined) lines.push(`Returning at the castle road in ${kit.returnSeconds}s`);
    if (light) {
      for (const s of threatened) lines.push(s.corrupted ? `${s.name} is corrupted` : `${s.name} is under attack · corruption ${Math.round(s.corruption * 100)}%`);
    }
    this.notice.hidden = lines.length === 0 || Boolean(op.result);
    this.notice.textContent = lines.join(' · ');

    const channel = kit.channel;
    const percent = (value: number) => `${Math.floor(value * 100)}%`;
    let html = '';
    let disabled = false;
    let stop = false;
    if (op.result) html = '';
    else if (channel?.kind === 'ritual') [html, stop] = [`<span>Resurrection ritual ${percent(channel.progress)} · ${channel.seconds}s</span><span>Abandon <kbd>X</kbd></span>`, true];
    else if (channel?.kind === 'rescue') [html, stop] = [`<span>Reviving ally ${percent(channel.progress)}</span><span>Cancel <kbd>X</kbd></span>`, true];
    else if (channel?.kind === 'rescued') [html, disabled] = [`An ally is reviving you · ${channel.seconds}s`, true];
    else if (kit.interaction === 'ritual') html = '<span>Begin the resurrection ritual</span><kbd>R</kbd>';
    else if (kit.interaction === 'rescue') html = '<span>Revive your ally</span><kbd>R</kbd>';
    else if (op.progress > 0) [html, stop] = [`<span>${light ? 'Sabotaging' : 'Repairing'} ${percent(op.progress)}</span><span>Cancel <kbd>X</kbd></span>`, true];
    else if (op.interaction) html = `<span>${op.interrupted ? 'Retry' : ''} ${op.interaction === 'repair' ? 'Repair' : 'Sabotage'} relay</span><kbd>R</kbd>`;
    else if (op.interrupted) [html, disabled] = ['Interrupted by a nearby threat', true];
    this.prompt.hidden = html === '';
    this.prompt.disabled = disabled;
    this.prompt.dataset.action = stop ? 'stop' : 'interact';
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
  }

  private setProgress(progress: HTMLProgressElement, value: number, max: number, unit = ''): void {
    progress.max = max;
    progress.value = value;
    const total = `${value} / ${max}${unit}`;
    progress.setAttribute('aria-valuetext', total);
    progress.parentElement!.querySelector('.ph-total')!.textContent = total;
  }

  private element<T extends HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }

  private setOpen(open: boolean): void {
    if (open && this.kit?.dead) return;
    if (open === this.open) return;
    this.open = open;
    if (open) this.closeActions();
    this.assigning = false;
    this.bag.hidden = !open;
    this.bagToggle.setAttribute('aria-expanded', String(open));
    this.renderDetails();
    this.renderQuick();
    if (open) {
      const target = this.bag.querySelector<HTMLElement>('[aria-pressed="true"]') ?? this.element('.ph-close');
      target.focus({ preventScroll: true });
    } else if (this.enabled) this.bagToggle.focus({ preventScroll: true });
  }

  private click(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    const { action, item, quick, slot } = button.dataset;
    if (item) {
      this.selected = item as ItemId;
      this.assigning = false;
      this.updateSelection();
    } else if (quick !== undefined) this.useSlot(Number(quick));
    else if (action === 'bag') this.setOpen(!this.open);
    else if (action === 'assign') {
      this.assigning = !this.assigning;
      this.renderDetails();
      this.renderQuick();
    } else if (action === 'equip' && this.selected) this.host.send({ type: 'equip', item: this.selected });
    else if (action === 'unequip' && slot) this.host.send({ type: 'unequip', slot: slot as GearSlot });
    else if (action === 'drop' && this.selected) this.host.send({ type: 'dropItem', item: this.selected });
    else if (action === 'attack' || action === 'sneak' || action === 'evade' || action === 'whistle') {
      const target = this.actionTarget;
      if (target) {
        this.closeActions();
        this.host.send({ type: 'heroAction', action, target });
      }
    } else if (action === 'interact' || action === 'stop' || action === 'camera') {
      this.act(action);
      if (event.detail > 0) button.blur();
    }
  }

  private act(action: Action): void {
    if (action === 'camera') this.host.toggleCamera();
    else if (action === 'stop') this.host.send({ type: 'stop' });
    else if (action === 'interact' && this.interact) this.host.send(this.interact);
  }

  /** 1-3 or a click on a quick slot: assign while choosing, otherwise use the item. */
  private useSlot(index: number): void {
    const selected = this.selected && ITEMS[this.selected];
    if (this.open && this.assigning && selected && selected.kind === 'active') {
      this.host.send({ type: 'assignQuick', slot: index, item: selected.id });
      this.assigning = false;
      this.renderDetails();
      this.renderQuick();
    } else if (this.kit?.quick[index]) this.host.send({ type: 'useQuick', slot: index });
  }

  private countOf(item: ItemId): number {
    return this.kit?.inventory.find((entry) => entry.item === item)?.count ?? 0;
  }

  private wornIn(item: ItemId): GearSlot | null {
    const slot = ITEMS[item].slot;
    return slot && this.kit?.equipment[slot] === item ? slot : null;
  }

  /** What the item does right now, with the numbers the server reported. */
  private effect(item: ItemId): string {
    const def = ITEMS[item];
    const kit = this.kit;
    if (def.weapon) {
      const w = def.weapon;
      return w.pattern === 'arc' ? `Sweep · reach ${w.range} m · ${w.damage} damage` : `Straight shot · range ${w.range} m · ${w.damage} damage`;
    }
    if (item === 'salve' && kit) return `Restores ${kit.salveHeal} health`;
    return def.kind === 'material' ? 'Material' : '';
  }

  private itemButton(item: ItemId, label: string, count: number): string {
    return `<button type="button" class="ph-slot" data-item="${item}" aria-label="${label}" title="${label}" aria-pressed="false">${icon(ITEMS[item].icon)}${count > 1 ? `<span class="ph-count">${count}</span>` : ''}</button>`;
  }

  private renderStats(kit: KitView): void {
    const weapon = kit.equipment.weapon ? ITEMS[kit.equipment.weapon].name : null;
    const attack = kit.attack ? `${weapon} · ${kit.attack.pattern === 'arc' ? 'sweep' : 'shot'} ${kit.attack.range} m · ${kit.attack.damage}` : 'No weapon';
    this.stats.innerHTML = `<span data-stat="attack">${attack}</span><span data-stat="evade">Evade ${kit.evadeDistance} m</span><span data-stat="salve">Salve +${kit.salveHeal}</span>`;
  }

  private renderBag(): void {
    const kit = this.kit;
    this.gearList.innerHTML = GEAR_SLOTS.map((slot) => {
      const item = kit?.equipment[slot];
      return item ? this.itemButton(item, `${GEAR_LABEL[slot]}: ${ITEMS[item].name}`, 1) : `<span class="ph-slot ph-empty" data-gear="${slot}">${GEAR_LABEL[slot]}</span>`;
    }).join('');
    // Worn gear shows in its slot; spare copies and everything else in the bag.
    const bag = (kit?.inventory ?? []).map((entry) => ({ item: entry.item, count: entry.count - (this.wornIn(entry.item) ? 1 : 0) })).filter((entry) => entry.count > 0);
    this.grid.innerHTML = bag.map(({ item, count }) => this.itemButton(item, `${ITEMS[item].name}${count > 1 ? `, ${count}` : ''}`, count)).join('') +
      '<span class="ph-slot ph-empty" aria-hidden="true"></span>'.repeat(Math.max(0, 12 - bag.length));
    this.updateSelection();
  }

  private updateSelection(): void {
    for (const button of this.bag.querySelectorAll<HTMLButtonElement>('[data-item]')) {
      button.setAttribute('aria-pressed', String(button.dataset.item === this.selected));
    }
    this.renderDetails();
    this.renderQuick();
  }

  private renderDetails(): void {
    const item = this.selected && this.countOf(this.selected) > 0 ? ITEMS[this.selected] : null;
    if (!item) {
      this.details.innerHTML = this.kit?.inventory.length
        ? '<div class="ph-description"><strong>Select an item</strong><span>Inspect equipment or carried supplies.</span></div>'
        : '<div class="ph-description"><strong>Bag empty</strong><span>Personal gear and supplies appear here.</span></div>';
      return;
    }
    const worn = this.wornIn(item.id);
    const quickSlot = (this.kit?.quick.indexOf(item.id) ?? -1) + 1;
    const effect = this.effect(item.id);
    const canDrop = !(worn && this.countOf(item.id) === 1);
    this.details.innerHTML = `${icon(item.icon)}<div class="ph-description"><strong>${item.name}</strong><span>${item.description}</span>${effect ? `<em class="ph-effect">${effect}</em>` : ''}</div>
      <div class="ph-item-actions">
        ${item.kind === 'active' ? `<button type="button" data-action="assign" aria-pressed="${this.assigning}">${this.assigning ? 'Choose 1–3' : 'Assign'} ${!this.assigning && quickSlot ? `<kbd>${quickSlot}</kbd>` : ''}</button>` : ''}
        ${item.kind === 'gear' ? (worn ? `<button type="button" data-action="unequip" data-slot="${worn}">Unequip</button>` : '<button type="button" data-action="equip">Equip</button>') : ''}
        ${canDrop ? '<button type="button" data-action="drop">Drop one</button>' : ''}
      </div>`;
  }

  private renderQuick(): void {
    this.slots.forEach((button, index) => {
      const id = this.kit?.quick[index] ?? null;
      const count = id ? this.countOf(id) : 0;
      const key = index + 1;
      const contents = `${id ?? ''}|${count}`;
      if (button.dataset.contents !== contents) {
        button.dataset.contents = contents;
        button.innerHTML = `<kbd>${key}</kbd>${id ? `${icon(ITEMS[id].icon)}<span class="ph-count">${count}</span>` : ''}`;
      }
      const name = id ? ITEMS[id].name : '';
      button.setAttribute('aria-label', `Quick slot ${key}${id ? `: ${name}, ${count}` : ': empty'}`);
      button.classList.toggle('is-empty', !id && !this.assigning);
      button.disabled = (!id && !this.assigning) || Boolean(this.kit?.dead);
      button.title = this.assigning ? `Assign to quick slot ${key}` : id ? `Use ${name} (${key})` : `Quick slot ${key}`;
    });
  }
}
