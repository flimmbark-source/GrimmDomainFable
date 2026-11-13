import type { OperationView, Snapshot } from '../shared/protocol.ts';
import './player-hud.css';

const ICON_ROOT = `${import.meta.env.BASE_URL}art/player-hud/`;
const icon = (name: string) => `<img src="${ICON_ROOT}${name}.webp" alt="" draggable="false">`;
const gearSlots = ['Weapon', 'Boots', 'Charm'] as const;
type GearSlot = typeof gearSlots[number];

interface Item {
  id: string;
  name: string;
  description: string;
  count: number;
  gear?: GearSlot;
  quick?: boolean;
}

// The selectable layout preview is local to this client. The relay contest
// does not yet project combat health, loadouts, or stolen cargo.
const previewItems: readonly Item[] = [
  { id: 'stone', name: 'Stone', description: 'A throwable distraction.', count: 6, quick: true },
  { id: 'smoke', name: 'Smoke', description: 'Break sight briefly.', count: 2, quick: true },
  { id: 'salve', name: 'Salve', description: 'A jar of field medicine.', count: 3, quick: true },
  { id: 'rope', name: 'Rope', description: 'A coil of rough hemp.', count: 1 },
  { id: 'purse', name: 'Coin purse', description: 'Holds the Goblin’s personal gold.', count: 15 },
  { id: 'cheese', name: 'Cheese', description: 'A wedge wrapped for the road.', count: 2 },
  { id: 'apple', name: 'Orchard apple', description: 'Picked in Orchard Vale.', count: 3 },
  { id: 'scroll', name: 'Scroll', description: 'A message sealed with ribbon.', count: 1 },
  { id: 'picks', name: 'Lockpicks', description: 'Two slender steel picks.', count: 1 },
  { id: 'lamp', name: 'Oil lamp', description: 'A small brass lamp.', count: 1 },
  { id: 'herb', name: 'Lavender', description: 'An aromatic sprig.', count: 4 },
  { id: 'journal', name: 'Field notes', description: 'Pages of observations from the road.', count: 2 },
  { id: 'dagger', name: 'Dagger', description: 'A short blade worn at the belt.', count: 1, gear: 'Weapon' },
  { id: 'boots', name: 'Leather boots', description: 'Soft leather walking boots.', count: 1, gear: 'Boots' },
  { id: 'charm', name: 'Spiral charm', description: 'A small silver keepsake.', count: 1, gear: 'Charm' },
];

const actions = [
  { id: 'strike', label: 'Strike', hint: 'Combat is pending in this playtest' },
  { id: 'evade', label: 'Evade', hint: 'Evade is pending in this playtest' },
  { id: 'sneak', label: 'Sneak', hint: 'Toggle sneak or hold Shift' },
  { id: 'whistle', label: 'Whistle', hint: 'Whistle (F)' },
] as const;

type Action = typeof actions[number]['id'] | 'relay' | 'stop' | 'camera';

export class PlayerHud {
  private readonly root = document.createElement('section');
  private readonly items = new Map<string, Item>();
  private readonly gear = new Map<GearSlot, string>();
  private readonly quick: Array<string | null> = [null, null, null];
  private selected: string | null = null;
  private assigning = false;
  private open = false;
  private enabled = false;
  private snapshotKey = '';
  private readonly bag: HTMLElement;
  private readonly bagToggle: HTMLButtonElement;
  private readonly gearList: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly details: HTMLElement;
  private readonly slots: HTMLButtonElement[];
  private readonly objective: HTMLElement;
  private readonly relay: HTMLButtonElement;
  private readonly meters: HTMLElement;
  private readonly detection: HTMLElement;
  private readonly sneak: HTMLButtonElement;
  private readonly whistle: HTMLButtonElement;
  private readonly cooldown: HTMLElement;
  private readonly camera: HTMLButtonElement;

  constructor(private readonly preview: boolean, private readonly onAction: (action: Action) => void) {
    if (preview) {
      for (const item of previewItems) {
        this.items.set(item.id, item);
        if (item.gear) this.gear.set(item.gear, item.id);
      }
      this.quick.splice(0, 3, 'stone', 'smoke', 'salve');
      this.selected = 'smoke';
    }
    this.root.id = 'player-hud';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Player interface');
    this.root.innerHTML = `
      <section class="ph-objective ph-surface" aria-label="Orchard objective">
        <div class="ph-objective-title"><span class="ph-marker" aria-hidden="true"></span><strong></strong></div>
        <div class="ph-objective-meters"></div>
        <button type="button" class="ph-relay" data-action="relay" hidden></button>
      </section>
      <button type="button" class="ph-view ph-surface" data-action="camera">Hero view <kbd>Tab</kbd></button>
      <section id="player-inventory" class="ph-bag ph-surface" aria-label="Inventory" hidden>
        <header class="ph-bag-header"><strong>Inventory</strong>${preview ? '<span>Preview kit</span>' : ''}<button type="button" class="ph-close" data-action="bag" aria-label="Close inventory">Close <kbd>Esc</kbd></button></header>
        <div class="ph-storage">
          <div class="ph-gear" aria-label="Equipment"></div>
          <div class="ph-grid" aria-label="Carried items"></div>
        </div>
        <div class="ph-detail" aria-live="polite"></div>
      </section>
      <div class="ph-dock ph-surface">
        <div class="ph-character">
          <div class="ph-portrait">${icon('portrait')}</div>
          <div class="ph-identity"><strong>Goblin Outlaw</strong><span class="ph-detection"></span>
            ${preview ? '<meter class="ph-health" min="0" max="100" value="83" aria-label="Sample health"></meter>' : ''}
          </div>
        </div>
        <div class="ph-actions" aria-label="Player actions">
          ${actions.map(({ id, label, hint }) => `<button type="button" class="ph-action" data-action="${id}" title="${hint}" ${id === 'strike' || id === 'evade' ? 'disabled' : ''}>
            <span class="ph-slot">${icon(id)}${id === 'whistle' ? '<span class="ph-cooldown" hidden></span>' : ''}</span><span>${label}</span>
          </button>`).join('')}
        </div>
        <div class="ph-quick" aria-label="Quick slots">
          ${this.quick.map((_, index) => `<button type="button" class="ph-slot ph-quick-slot" data-quick="${index}"></button>`).join('')}
        </div>
        <button type="button" class="ph-bag-toggle" data-action="bag" aria-controls="player-inventory" aria-expanded="false" aria-label="Inventory (I)">
          ${icon('bag')}<kbd>I</kbd>
        </button>
        <div class="ph-cargo">${icon('cargo')}<div>${preview ? '<strong>Carrying supplies</strong><meter min="0" max="100" value="65" aria-label="Sample cargo progress"></meter>' : '<strong>No cargo</strong><small>Objective supplies</small>'}</div></div>
      </div>`;
    document.body.append(this.root);
    this.bag = this.element('#player-inventory');
    this.bagToggle = this.element('.ph-bag-toggle');
    this.gearList = this.element('.ph-gear');
    this.grid = this.element('.ph-grid');
    this.details = this.element('.ph-detail');
    this.slots = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-quick]'));
    this.objective = this.element('.ph-objective-title strong');
    this.relay = this.element('.ph-relay');
    this.meters = this.element('.ph-objective-meters');
    this.detection = this.element('.ph-detection');
    this.sneak = this.element('[data-action="sneak"]');
    this.whistle = this.element('[data-action="whistle"]');
    this.cooldown = this.element('.ph-cooldown');
    this.camera = this.element('.ph-view');
    this.root.addEventListener('click', (event) => this.click(event));
    this.renderBag();
    this.renderQuick();
  }

  get isOpen(): boolean { return this.open; }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.setOpen(false);
    this.snapshotKey = '';
    this.root.hidden = !enabled;
    document.body.classList.toggle('has-player-hud', enabled);
  }

  setMode(hero: boolean): void {
    this.camera.innerHTML = `${hero ? 'Strategy view' : 'Hero view'} <kbd>Tab</kbd>`;
  }

  handleKey(event: KeyboardEvent): boolean {
    if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.code === 'KeyI' || (this.open && event.code === 'Escape')) {
      if (!event.repeat) this.setOpen(!this.open);
      return true;
    }
    if (/^Digit[1-3]$/.test(event.code)) {
      if (!event.repeat) this.useSlot(Number(event.code.at(-1)) - 1);
      return true;
    }
    return false;
  }

  setSnapshot(snapshot: Snapshot): void {
    const operation = snapshot.operation;
    const you = snapshot.you;
    if (!this.enabled || !operation || !you) return;
    const sneaking = snapshot.actors.find((actor) => actor.id === you.actorId)?.sneaking === true;
    const notice = you.spotted ? 'Spotted' : you.attention > 0 ? 'Noticed' : 'Unseen';
    const seconds = Math.ceil(you.whistleCooldown / 30);
    const key = JSON.stringify([operation.active, operation.offlineSeconds, operation.production,
      operation.interaction, Math.floor(operation.progress * 100), operation.interrupted, operation.result, sneaking, notice, seconds]);
    if (key === this.snapshotKey) return;
    this.snapshotKey = key;
    this.detection.textContent = notice;
    this.detection.dataset.notice = notice;
    this.sneak.setAttribute('aria-pressed', String(sneaking));
    this.whistle.disabled = seconds > 0;
    this.cooldown.hidden = seconds === 0;
    this.cooldown.textContent = `${seconds}s`;
    this.whistle.title = seconds ? `Whistle ready in ${seconds}s` : 'Whistle (F)';
    this.setObjective(operation);
  }

  private setObjective(op: OperationView): void {
    this.objective.textContent = op.result === 'light' ? 'Light secured Orchard Vale' : op.result === 'dark' ? 'Dark held Orchard Vale' :
      op.active ? 'Sabotage the Dark relay' : 'Keep the relay offline';
    this.meters.textContent = op.result ? '' : op.active ?
      `North of the bridge · Output ${op.production}/${op.productionGoal}` :
      `Offline ${op.offlineSeconds}/${op.offlineGoal}s · Output ${op.production}/${op.productionGoal}`;
    this.meters.hidden = Boolean(op.result);
    this.relay.hidden = Boolean(op.result) || (!op.interaction && !op.interrupted);
    this.relay.disabled = !op.interaction && op.progress === 0;
    this.relay.dataset.action = op.progress > 0 ? 'stop' : 'relay';
    const prompt = op.progress > 0 ? `Sabotaging ${Math.floor(op.progress * 100)}% <kbd>X</kbd> Cancel` :
      op.interaction ? `<kbd>R</kbd> ${op.interrupted ? 'Interrupted · Retry sabotage' : 'Sabotage relay'}` : 'Interrupted by a nearby threat';
    if (this.relay.innerHTML !== prompt) this.relay.innerHTML = prompt;
  }

  private element<T extends HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }

  private setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
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
    const { action, item, quick } = button.dataset;
    if (item) {
      this.selected = item;
      this.assigning = false;
      this.updateSelection();
    } else if (quick !== undefined) this.useSlot(Number(quick));
    else if (action === 'bag') this.setOpen(!this.open);
    else if (action === 'assign') {
      this.assigning = !this.assigning;
      this.renderDetails();
      this.renderQuick();
      const target = this.assigning ? this.slots[0] : this.details.querySelector<HTMLButtonElement>('[data-action="assign"]');
      target?.focus({ preventScroll: true });
    } else if (action === 'equip' || action === 'drop') this.changeItem(action);
    else if (action === 'sneak' || action === 'whistle' || action === 'relay' || action === 'stop' || action === 'camera') {
      this.onAction(action);
      button.blur();
    }
  }

  private changeItem(action: 'equip' | 'drop'): void {
    const item = this.selected && this.items.get(this.selected);
    if (!item) return;
    if (action === 'equip' && item.gear) {
      if (this.gear.get(item.gear) === item.id) this.gear.delete(item.gear);
      else this.gear.set(item.gear, item.id);
    } else if (action === 'drop' && !this.isEquipped(item)) {
      if (item.count > 1) this.items.set(item.id, { ...item, count: item.count - 1 });
      else {
        this.items.delete(item.id);
        this.quick.forEach((id, index) => { if (id === item.id) this.quick[index] = null; });
        this.selected = null;
      }
    }
    this.assigning = false;
    this.renderBag();
    (this.bag.querySelector<HTMLElement>('[aria-pressed="true"]') ?? this.element('.ph-close')).focus({ preventScroll: true });
  }

  private useSlot(index: number): void {
    const selected = this.selected && this.items.get(this.selected);
    if (this.open && this.assigning && selected && selected.quick) {
      const previous = this.quick.indexOf(selected.id);
      if (previous !== -1) this.quick[previous] = null;
      this.quick[index] = selected.id;
      this.assigning = false;
      this.renderQuick();
      this.renderDetails();
      this.slots[index]?.focus({ preventScroll: true });
    } else {
      const id = this.quick[index];
      if (!id) return;
      this.selected = id;
      if (!this.open) this.setOpen(true);
      this.updateSelection();
    }
  }

  private isEquipped(item: Item): boolean { return Boolean(item.gear && this.gear.get(item.gear) === item.id); }

  private itemButton(item: Item, label: string): string {
    return `<button type="button" class="ph-slot" data-item="${item.id}" aria-label="${label}" title="${label}" aria-pressed="false">${icon(item.id)}${item.count > 1 ? `<span class="ph-count">${item.count}</span>` : ''}</button>`;
  }

  private renderBag(): void {
    this.gearList.innerHTML = gearSlots.map((slot) => {
      const item = this.items.get(this.gear.get(slot) ?? '');
      return item ? this.itemButton(item, `${slot}: ${item.name}`) : `<span class="ph-slot ph-empty">${slot}</span>`;
    }).join('');
    const bag = [...this.items.values()].filter((item) => !this.isEquipped(item));
    this.grid.innerHTML = bag.map((item) => this.itemButton(item, `${item.name}${item.count > 1 ? `, ${item.count}` : ''}`)).join('') +
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
    const item = this.selected && this.items.get(this.selected);
    const equipped = Boolean(item && this.isEquipped(item));
    const slot = item ? this.quick.indexOf(item.id) + 1 : 0;
    this.details.innerHTML = item ? `${icon(item.id)}<div class="ph-description"><strong>${item.name}</strong><span>${item.description}</span></div>
      <div class="ph-item-actions">
        ${item.quick ? `<button type="button" data-action="assign" aria-pressed="${this.assigning}">${this.assigning ? 'Choose 1–3' : 'Assign'} ${!this.assigning && slot ? `<kbd>${slot}</kbd>` : ''}</button>` : ''}
        ${item.gear ? `<button type="button" data-action="equip">${equipped ? 'Unequip' : 'Equip'}</button>` : ''}
        ${!equipped ? '<button type="button" data-action="drop">Drop one</button>' : ''}
      </div>` : this.items.size
      ? '<div class="ph-description"><strong>Select an item</strong><span>Inspect equipment or carried supplies.</span></div>'
      : '<div class="ph-description"><strong>Bag empty</strong><span>Personal gear and supplies appear here.</span></div>';
  }

  private renderQuick(): void {
    this.slots.forEach((button, index) => {
      const item = this.items.get(this.quick[index] ?? '');
      const key = index + 1;
      if (button.dataset.contents !== `${item?.id ?? ''}|${item?.count ?? 0}`) {
        button.dataset.contents = `${item?.id ?? ''}|${item?.count ?? 0}`;
        button.innerHTML = `<kbd>${key}</kbd>${item ? `${icon(item.id)}<span class="ph-count">${item.count}</span>` : ''}`;
      }
      button.setAttribute('aria-label', `Quick slot ${key}${item ? `: ${item.name}, ${item.count}` : ': empty'}`);
      button.setAttribute('aria-pressed', String(Boolean(this.open && item && item.id === this.selected)));
      button.disabled = !item && !this.assigning;
      button.title = item ? `Inspect ${item.name} (${key})` : `Quick slot ${key}`;
    });
  }
}
