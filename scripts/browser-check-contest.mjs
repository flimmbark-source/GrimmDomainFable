// Live acceptance run for the Orchard Vale contest: two real browser clients
// (one Light, one Dark) with real mouse and keyboard input against the real
// server, and bots in the other six seats.
//
//   npm run build
//   GRIMM_SEED=7 GRIMM_RELAY_GOAL=3600 npm start     (see note)
//   npm run verify:contest [url]                      default url: http://localhost:2567
//
// Note: the run lasts several minutes of game time, longer than the default
// 480 output Dark needs to hold the Vale, so the server is started with a
// longer relay goal. Nothing else about the contest is changed.
//
// The bots fight each other while this runs, so the contest is not scripted
// end to end. Checks that depend on the fight going a particular way say so
// and report what actually happened. Screenshots go to docs/evidence/contest-*.png.
// Playwright is not a project dependency (see scripts/browser-check.mjs).
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND' || !error.message.includes("'playwright'")) throw error;
  }
  return require(resolve(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'));
}

const base = (process.argv[2] ?? 'http://localhost:2567').replace(/\/$/, '');
const url = `${base}/?region=orchard_operation&bakedShadows=1`;
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/evidence');
mkdirSync(outDir, { recursive: true });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const fmt = (p) => (p ? `${p.x.toFixed(1)}, ${p.z.toFixed(1)}` : 'none');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RELAY = { x: -3, z: -28 };
const WEST_SHRINE = { x: -60, z: 22 };
const NORTH_SHRINE = { x: -24, z: -32 };

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const open = async (query, viewport) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(`${url}${query}`);
  return page;
};
const ready = (page) => page.waitForFunction(() => window.__grimm?.ready && window.__grimm.snapshot()?.you?.kit, null, { timeout: 180000, polling: 250 });

// --- Page helpers ------------------------------------------------------------
const snap = (page) => page.evaluate(() => window.__grimm.snapshot());
const state = (page) => page.evaluate(() => {
  const s = window.__grimm.snapshot();
  const me = s.actors.find((a) => a.id === s.you.actorId);
  return { tick: s.tick, me, kit: s.you.kit, you: s.you, operation: s.operation };
});
const send = (page, command) => page.evaluate((c) => window.__grimm.send(c), command);
const text = (page, selector) => page.evaluate((sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? null, selector);
/** Wait for a condition on the page's own latest snapshot. Returns false on timeout. */
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 60 }).then(() => true, () => false);
const idle = async (page, timeout = 90000) => {
  await sleep(350);
  return until(page, () => {
    const s = window.__grimm.snapshot();
    const me = s.actors.find((a) => a.id === s.you.actorId);
    return me && !me.moving && !me.order;
  }, null, timeout);
};
const walk = async (page, x, z, timeout = 90000) => {
  await send(page, { type: 'moveTo', x, z });
  return idle(page, timeout);
};
const setMode = async (page, mode) => {
  await page.evaluate((m) => window.__grimm.setMode(m), mode);
  await until(page, (m) => window.__grimm.mode() === m && Math.abs(window.__grimm.camera().fov - (m === 'hero' ? 58 : 36)) < 0.5, mode, 60000);
  await sleep(1200);
};
/** Centre the command view on a ground point and return its screen pixel. */
const aim = async (page, x, z) => {
  await page.evaluate(([x, z]) => window.__grimm.focus(x, z), [x, z]);
  await sleep(2500);
  return page.evaluate(([x, z]) => window.__grimm.worldToScreen(x, z), [x, z]);
};
/** Ground points round the hero that are on screen and not under a HUD panel. */
const groundNearHero = (page, radius, angles) => page.evaluate(([radius, angles]) => {
  const g = window.__grimm;
  const s = g.snapshot();
  const me = s.actors.find((a) => a.id === s.you.actorId);
  const out = [];
  for (const angle of angles) {
    const x = me.x + Math.cos(angle) * radius;
    const z = me.z + Math.sin(angle) * radius;
    const p = g.worldToScreen(x, z);
    if (p.x < innerWidth * 0.15 || p.x > innerWidth * 0.85 || p.y < innerHeight * 0.2 || p.y > innerHeight * 0.75) continue;
    if (document.elementFromPoint(p.x, p.y)?.id !== 'view') continue;
    out.push({ x, z, sx: p.x, sy: p.y });
  }
  return out;
}, [radius, angles]);
const shot = async (page, name) => {
  await sleep(1500);
  await page.screenshot({ path: resolve(outDir, `contest-${name}.png`) });
  console.log(`shot  contest-${name}.png`);
};
/** Run one part of the demonstration; a crash in it is a failure, not the end of the run. */
async function part(name, fn) {
  console.log(`\n--- ${name}`);
  try {
    await fn();
  } catch (error) {
    check(`${name}: ran to the end`, false, String(error?.message ?? error).split('\n')[0]);
  }
}

const light = await open('', { width: 1280, height: 720 });
const dark = await open('&team=dark', { width: 960, height: 540 });
await Promise.all([ready(light), ready(dark)]);
const lightId = (await state(light)).you.actorId;
const darkId = (await state(dark)).you.actorId;

/** The Dark commander's own monsters, as their client sees them. */
const army = () => dark.evaluate(() => window.__grimm.snapshot().actors.filter((a) => a.kind === 'monster' && a.mode !== undefined));
const scoutNow = async () => (await army()).find((m) => m.monster === 'scout');
const waitScout = () => until(dark, () => window.__grimm.snapshot().actors.some((a) => a.monster === 'scout' && a.mode !== undefined), null, 60000);
/** Dark hero: close with the Light hero (which it must be able to see) and strike with the A key. */
const darkStrikes = async (untilDead, maxSwings) => {
  for (let i = 0; i < maxSwings; i++) {
    const target = (await snap(dark)).actors.find((a) => a.id === lightId);
    const l = await state(light);
    if (l.kit.dead) return true;
    const d = await state(dark);
    const at = target ?? l.me;
    if (dist(d.me, at) > 2.4) {
      await walk(dark, at.x + (d.me.x > at.x ? 1.5 : -1.5), at.z + 0.3, 20000);
      continue;
    }
    await until(dark, () => window.__grimm.snapshot().you.kit.attackCooldown === 0, null, 5000);
    await dark.keyboard.press('KeyA');
    await sleep(250);
    if (!untilDead && i >= 1) return false;
  }
  return (await state(light)).kit.dead;
};

try {
  await part('Seats and starting kit', async () => {
    const s = await snap(light);
    const humans = s.slots.filter((x) => x.occupant === 'human');
    const bots = s.slots.filter((x) => x.occupant === 'bot');
    check('eight seats: one human per side and six bots', humans.length === 2 && bots.length === 6 && new Set(humans.map((h) => h.team)).size === 2, s.slots.map((x) => `${x.team[0]}:${x.occupant}`).join(' '));
    const l = (await state(light)).kit;
    const d = (await state(dark)).kit;
    check('both human heroes spawn with a basic weapon equipped', l.equipment.weapon === 'dagger' && d.equipment.weapon === 'cleaver' && l.attack && d.attack, `light ${l.equipment.weapon}, dark ${d.equipment.weapon}`);
    check('the Light client is in hero view with the player HUD; the Dark client in command view', await light.evaluate(() => window.__grimm.mode()) === 'hero' && await dark.evaluate(() => window.__grimm.mode()) === 'rts' && await text(dark, '.ph-name') === 'Dark Hero');
    // The Dark hero sets off for the west road now; it takes a while to get there.
    await send(dark, { type: 'moveTo', x: -40, z: 12.5 });
  });

  let bareEvade = 0;
  await part('Controls: click to move, drag to turn, action menu, hotkeys, cancel, blocked ground', async () => {
    await until(light, () => Math.abs(window.__grimm.camera().fov - 58) < 0.5, null, 60000);
    await sleep(2500);
    // Plain left-click in hero view.
    let spots = await groundNearHero(light, 4.5, [0, Math.PI, 0.5, -0.5]);
    let before = await state(light);
    await light.mouse.click(spots[0].sx, spots[0].sy);
    const ordered = await until(light, () => { const s = window.__grimm.snapshot(); return Boolean(s.actors.find((a) => a.id === s.you.actorId)?.order); }, null, 5000);
    await idle(light);
    let after = await state(light);
    check('hero view: a plain left-click on terrain moves the hero there', ordered && dist(after.me, spots[0]) < 1.2 && dist(after.me, before.me) > 2, `${fmt(before.me)} -> ${fmt(after.me)}, clicked ${fmt(spots[0])}`);

    // Left-drag turns the camera and gives no order.
    const cam0 = await light.evaluate(() => window.__grimm.camera().position);
    await light.mouse.move(640, 300);
    await light.mouse.down();
    await light.mouse.move(820, 320, { steps: 10 });
    await light.mouse.up();
    await sleep(1500);
    const cam1 = await light.evaluate(() => window.__grimm.camera().position);
    const still = await state(light);
    check('hero view: a left-drag turns the camera and does not move the hero', Math.hypot(cam1[0] - cam0[0], cam1[2] - cam0[2]) > 1 && !still.me.order && dist(still.me, after.me) < 0.05, `camera moved ${Math.hypot(cam1[0] - cam0[0], cam1[2] - cam0[2]).toFixed(1)} m`);

    // The same click in strategy view (Tab switches).
    await light.keyboard.press('Tab');
    await until(light, () => window.__grimm.mode() === 'rts' && Math.abs(window.__grimm.camera().fov - 36) < 0.5, null, 60000);
    await sleep(2500);
    spots = await groundNearHero(light, 4, [Math.PI, 0]);
    before = await state(light);
    await light.mouse.click(spots[0].sx, spots[0].sy);
    await idle(light);
    after = await state(light);
    check('strategy view: a plain left-click moves the hero too', dist(after.me, spots[0]) < 1.2 && dist(after.me, before.me) > 2, `${fmt(before.me)} -> ${fmt(after.me)}`);
    await light.keyboard.press('Tab');
    await until(light, () => window.__grimm.mode() === 'hero' && Math.abs(window.__grimm.camera().fov - 58) < 0.5, null, 60000);
    await sleep(2500);

    // Right-click: the action menu opens at the cursor; an option walks there, then acts.
    spots = await groundNearHero(light, 5, [0, Math.PI, 0.6, -0.6]);
    const target = spots[0];
    await light.mouse.click(target.sx, target.sy, { button: 'right' });
    const menu = await light.evaluate(() => { const m = document.querySelector('.ph-actions'); const r = m.getBoundingClientRect(); return { hidden: m.hidden, left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
    const nearCursor = !menu.hidden && Math.min(Math.abs(menu.left - target.sx), Math.abs(menu.right - target.sx)) < 30 && Math.min(Math.abs(menu.top - target.sy), Math.abs(menu.bottom - target.sy)) < 30;
    before = await state(light);
    check('right-click opens the action menu at the cursor without moving the hero', nearCursor && !before.me.order, `menu at ${menu.left.toFixed(0)},${menu.top.toFixed(0)}; cursor ${target.sx.toFixed(0)},${target.sy.toFixed(0)}`);
    await light.click('.ph-action[data-action="whistle"]');
    await sleep(200);
    const onTheWay = await state(light);
    const whistled = await until(light, () => window.__grimm.snapshot().you.whistleCooldown > 0, null, 15000);
    const arrived = await state(light);
    check('a menu option makes the hero walk to that point and perform the action on arrival', Boolean(onTheWay.me.order) && onTheWay.you.whistleCooldown === 0 && whistled && dist(arrived.me, target) < 1.2,
      `whistled at ${fmt(arrived.me)}, target ${fmt(target)}`);

    // Hotkeys act at once, where the hero stands.
    await idle(light);
    before = await state(light);
    await light.keyboard.press('KeyS');
    const sneaking = await until(light, () => { const s = window.__grimm.snapshot(); return s.actors.find((a) => a.id === s.you.actorId)?.sneaking === true; }, null, 3000);
    const stood = await state(light);
    await light.keyboard.press('KeyS');
    await until(light, () => { const s = window.__grimm.snapshot(); return !s.actors.find((a) => a.id === s.you.actorId)?.sneaking; }, null, 3000);
    check('S toggles Sneak immediately at the current location', sneaking && dist(stood.me, before.me) < 0.05);
    await light.keyboard.press('KeyA');
    const swung = await until(light, () => { const s = window.__grimm.snapshot(); return s.actors.find((a) => a.id === s.you.actorId)?.action?.kind === 'attack'; }, null, 3000);
    check('A attacks immediately', swung && dist((await state(light)).me, before.me) < 0.05);
    await light.keyboard.press('KeyE');
    await sleep(1200);
    after = await state(light);
    bareEvade = dist(after.me, before.me);
    check('E evades immediately (no boots worn)', bareEvade > 1.5 && bareEvade < 2.8 && after.kit.equipment.boots === null, `${bareEvade.toFixed(2)} m`);
    await until(light, () => window.__grimm.snapshot().you.whistleCooldown === 0, null, 8000);
    before = await state(light);
    await light.keyboard.press('KeyW');
    const hotWhistle = await until(light, () => window.__grimm.snapshot().you.whistleCooldown > 0, null, 3000);
    check('W whistles immediately at the current location', hotWhistle && dist((await state(light)).me, before.me) < 0.05);

    // X cancels a queued action.
    spots = await groundNearHero(light, 6, [0, Math.PI, 0.6, -0.6]);
    await light.mouse.click(spots[0].sx, spots[0].sy, { button: 'right' });
    await light.click('.ph-action[data-action="sneak"]');
    await until(light, () => { const s = window.__grimm.snapshot(); return Boolean(s.actors.find((a) => a.id === s.you.actorId)?.order); }, null, 3000);
    await sleep(200);
    await light.keyboard.press('KeyX');
    await sleep(2500);
    after = await state(light);
    check('X cancels a queued action: the hero stops and never performs it', !after.me.order && !after.me.moving && !after.me.sneaking && dist(after.me, spots[0]) > 1.5, `stopped at ${fmt(after.me)}, ${dist(after.me, spots[0]).toFixed(1)} m short`);

    // Blocked ground: an order into the roadside hedge resolves to standable ground.
    await walk(light, -79, 13);
    await light.keyboard.press('Tab');
    await until(light, () => window.__grimm.mode() === 'rts', null, 10000);
    const hedge = { x: -79, z: 16.2 };
    const pixel = await aim(light, hedge.x, hedge.z - 2);
    const hedgePixel = await light.evaluate(([x, z]) => window.__grimm.worldToScreen(x, z), [hedge.x, hedge.z]);
    void pixel;
    await light.mouse.click(hedgePixel.x, hedgePixel.y, { button: 'right' });
    await light.click('.ph-action[data-action="sneak"]');
    await sleep(300);
    const order = (await state(light)).me.order;
    await until(light, () => { const s = window.__grimm.snapshot(); return s.actors.find((a) => a.id === s.you.actorId)?.sneaking === true; }, null, 15000);
    after = await state(light);
    check('an order onto blocked ground goes to the nearest walkable point and the action still happens there',
      Boolean(order) && dist(order, hedge) > 0.4 && dist(order, hedge) < 3 && after.me.sneaking && dist(after.me, order) < 0.3, `clicked ${fmt(hedge)}, server sent the hero to ${fmt(order)}`);
    await light.keyboard.press('KeyS');
    await light.keyboard.press('Space');
    await light.keyboard.press('Tab');
    await until(light, () => window.__grimm.mode() === 'hero', null, 10000);
  });

  await part('Finds, weapon swap, boots and charm', async () => {
    const count = async (item) => (await state(light)).kit.inventory.find((i) => i.item === item)?.count ?? 0;
    await walk(light, -78, 12);
    await walk(light, -66, 12.5);
    await walk(light, -64, -2);
    await walk(light, -48, 12);
    await walk(light, -30, 12);
    const kit = (await state(light)).kit;
    check('walking the Light approach collects a weapon, boots, a charm, an active item and a material stack',
      (await count('sling')) === 1 && (await count('springheel_boots')) === 1 && (await count('spiral_charm')) === 1 && (await count('salve')) === 3 && (await count('herb')) === 3,
      kit.inventory.map((i) => `${i.item}×${i.count}`).join(', '));
    check('the quick slot shows the new salve count', await text(light, '[data-quick="0"] .ph-count') === '3');

    // Weapon swap through the inventory panel.
    const statBefore = await text(light, '[data-stat="attack"]');
    await light.keyboard.press('KeyA');
    const daggerSwing = await until(light, () => { const s = window.__grimm.snapshot(); return s.actors.find((a) => a.id === s.you.actorId)?.action?.weapon === 'dagger'; }, null, 3000);
    await light.screenshot({ path: resolve(outDir, 'contest-attack-dagger-sweep.png') });
    await light.keyboard.press('KeyI');
    await light.click('#player-inventory [data-item="sling"]');
    await light.click('#player-inventory [data-action="equip"]');
    const swapped = await until(light, () => window.__grimm.snapshot().you.kit.equipment.weapon === 'sling', null, 5000);
    await shot(light, 'inventory-sling-equipped');
    await light.keyboard.press('Escape');
    const attack = (await state(light)).kit.attack;
    const statAfter = await text(light, '[data-stat="attack"]');
    await until(light, () => window.__grimm.snapshot().you.kit.attackCooldown === 0, null, 5000);
    await light.keyboard.press('KeyA');
    const slingShot = await until(light, () => { const s = window.__grimm.snapshot(); return s.actors.find((a) => a.id === s.you.actorId)?.action?.weapon === 'sling'; }, null, 3000);
    await light.screenshot({ path: resolve(outDir, 'contest-attack-sling-shot.png') });
    check('equipping the sling changes Attack from a close sweep to a long straight shot', daggerSwing && swapped && slingShot && attack.pattern === 'line' && attack.range > 5,
      `"${statBefore}" -> "${statAfter}"`);

    // Boots: Evade goes farther.
    await light.keyboard.press('KeyI');
    await light.click('#player-inventory [data-item="springheel_boots"]');
    await light.click('#player-inventory [data-action="equip"]');
    await until(light, () => window.__grimm.snapshot().you.kit.equipment.boots === 'springheel_boots', null, 5000);
    await light.keyboard.press('Escape');
    // Face east along a clear stretch of the road first, then dash.
    await walk(light, -57, 12.3);
    await walk(light, -55, 12.3);
    await until(light, () => window.__grimm.snapshot().you.kit.evadeCooldown === 0, null, 5000);
    const before = await state(light);
    await light.keyboard.press('KeyE');
    await sleep(1500);
    const after = await state(light);
    const booted = dist(after.me, before.me);
    check('wearing the boots makes Evade carry farther', booted > bareEvade + 1 && Math.abs(booted - after.kit.evadeDistance) < 0.4, `${bareEvade.toFixed(2)} m bare, ${booted.toFixed(2)} m with boots (HUD: ${await text(light, '[data-stat="evade"]')})`);

    // Charm: the salve figure changes the moment it is worn or taken off.
    const heal0 = (await state(light)).kit.salveHeal;
    await light.keyboard.press('KeyI');
    await light.click('#player-inventory [data-item="spiral_charm"]');
    await light.click('#player-inventory [data-action="equip"]');
    await until(light, () => window.__grimm.snapshot().you.kit.equipment.charm === 'spiral_charm', null, 5000);
    const heal1 = (await state(light)).kit.salveHeal;
    const hud1 = await text(light, '[data-stat="salve"]');
    await light.click('#player-inventory .ph-gear [data-item="spiral_charm"]');
    await light.click('#player-inventory [data-action="unequip"]');
    await until(light, () => window.__grimm.snapshot().you.kit.equipment.charm === null, null, 5000);
    const heal2 = (await state(light)).kit.salveHeal;
    await light.click('#player-inventory [data-item="spiral_charm"]');
    await light.click('#player-inventory [data-action="equip"]');
    await until(light, () => window.__grimm.snapshot().you.kit.equipment.charm === 'spiral_charm', null, 5000);
    check('equipping and unequipping the charm changes salve healing immediately', heal1 > heal0 && heal2 === heal0 && (await state(light)).kit.salveHeal === heal1, `${heal0} -> ${heal1} -> ${heal2} -> ${heal1} (HUD: ${hud1})`);

    // Assign the salve to quick slot 2 from the panel.
    await light.click('#player-inventory [data-item="salve"]');
    await light.click('#player-inventory [data-action="assign"]');
    await light.keyboard.press('Digit2');
    const assigned = await until(light, () => window.__grimm.snapshot().you.kit.quick[1] === 'salve', null, 5000);
    await light.keyboard.press('Escape');
    check('an active item can be assigned to a quick slot', assigned && (await state(light)).kit.quick[0] === null);
  });

  const post = { x: -10, z: 13 };
  await part('Army command, then the Dark Hero fights in person', async () => {
    // Real right-click in command view posts the selected monster (the Scout by default).
    await waitScout();
    let pixel = await aim(dark, post.x, post.z);
    await dark.mouse.click(pixel.x, pixel.y, { button: 'right' });
    const posted = await until(dark, ([x, z]) => window.__grimm.snapshot().actors.some((a) => a.monster === 'scout' && a.order && Math.hypot(a.order.x - x, a.order.z - z) < 1.5), [post.x, post.z], 8000);
    check('command view: right-click posts the Dark commander\'s Scout (army orders preserved)', posted && (await dark.evaluate(() => document.querySelector('.ph-actions').hidden)));

    // Left-click one of your monsters to select it, then post that one.
    // (The relay guard may be routed at this moment; give it time to walk back in.)
    await until(dark, () => window.__grimm.snapshot().actors.some((a) => a.monster === 'brute' && a.mode !== undefined), null, 45000);
    const brute = (await army()).find((m) => m.monster === 'brute');
    let bruteOrdered = false;
    if (brute) {
      await dark.evaluate(([x, z]) => window.__grimm.focus(x, z), [brute.x, brute.z]);
      await sleep(2500);
      const now = (await army()).find((m) => m.id === brute.id) ?? brute;
      const at = await dark.evaluate(([x, z]) => window.__grimm.worldToScreen(x, z), [now.x, now.z]);
      const heroOrder = (await state(dark)).me.order;
      await dark.mouse.click(at.x, at.y);
      await sleep(300);
      const unchanged = JSON.stringify((await state(dark)).me.order) === JSON.stringify(heroOrder);
      const ground = { x: 12, z: -34 };
      pixel = await aim(dark, ground.x, ground.z);
      await dark.mouse.click(pixel.x, pixel.y, { button: 'right' });
      bruteOrdered = unchanged && await until(dark, ([id, x, z]) => window.__grimm.snapshot().actors.some((a) => a.id === id && a.order && Math.hypot(a.order.x - x, a.order.z - z) < 2), [brute.id, ground.x, ground.z], 8000);
    }
    check('command view: clicking an owned monster selects it for the next order', bruteOrdered, brute ? '' : 'the relay guard was routed at that moment');
    // If that click missed a moving monster the order went to the Scout: put the Scout back on its post.
    const scoutOrder = (await scoutNow())?.order;
    if (scoutOrder && dist(scoutOrder, post) > 2) await send(dark, { type: 'monsterOrder', actorId: (await scoutNow()).id, order: 'guard', x: post.x, z: post.z });

    // Wait for the Scout to take its post, then fight on the road, out of its sight.
    const atPost = await until(dark, ([x, z]) => window.__grimm.snapshot().actors.some((a) => a.monster === 'scout' && a.mode === 'patrol' && !a.moving && Math.hypot(a.x - x, a.z - z) < 1.5), [post.x, post.z], 90000);
    await dark.keyboard.press('Space');
    await idle(dark, 60000);
    // The duel. Light bots coming back from a wayshrine can cut it short by
    // killing the Dark Hero; if so it returns from the castle road and tries again.
    let hp0 = 0;
    let darkHp0 = 0;
    let hurt = null;
    let darkHurt = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await until(dark, () => !window.__grimm.snapshot().you.kit.dead, null, 30000);
      hp0 = (await state(light)).kit.hp;
      darkHp0 = (await state(dark)).kit.hp;
      await darkStrikes(false, 8);
      hurt = await state(light);
      // The Light hero answers with its own weapon.
      await until(light, () => window.__grimm.snapshot().you.kit.attackCooldown === 0, null, 5000);
      await light.keyboard.press('KeyA');
      await until(dark, (hp) => window.__grimm.snapshot().you.kit.hp < hp, darkHp0, 6000);
      darkHurt = await state(dark);
      if (hurt.kit.hp < hp0 && darkHurt.kit.hp < darkHp0 && !darkHurt.kit.dead) break;
      console.log(`info  duel attempt ${attempt + 1} was cut short (Dark Hero ${darkHurt.kit.dead ? 'fell' : 'did not connect'}); trying again`);
    }
    await shot(dark, 'dark-hero-fights-scout-holds-post');
    const scout = await scoutNow();
    check('the Dark Hero fights in person: both heroes take damage from the other\'s weapon', hurt.kit.hp < hp0 && darkHurt.kit.hp < darkHp0, `Light ${hp0} -> ${hurt.kit.hp}, Dark ${darkHp0} -> ${darkHurt.kit.hp}`);
    check('meanwhile the Scout holds its assignment at the post', atPost && scout && scout.mode === 'patrol' && dist(scout, post) < 1.5, scout ? `Scout ${scout.mode} at ${fmt(scout)}` : 'Scout not in view');

    // Quick slot: health up, count down.
    const before = await state(light);
    const stock = before.kit.inventory.find((i) => i.item === 'salve').count;
    await light.keyboard.press('Digit2');
    await until(light, (hp) => window.__grimm.snapshot().you.kit.hp > hp, before.kit.hp, 5000);
    const after = await state(light);
    const left = after.kit.inventory.find((i) => i.item === 'salve')?.count ?? 0;
    check('using the salve from its quick slot restores health and uses one up',
      after.kit.hp === Math.min(before.kit.maxHp, before.kit.hp + before.kit.salveHeal) && left === stock - 1 && await text(light, '[data-quick="1"] .ph-count') === String(left) && (await text(light, '.ph-health-text')).startsWith(String(after.kit.hp)),
      `health ${before.kit.hp} -> ${after.kit.hp}, salves ${stock} -> ${left}`);
    await shot(light, 'after-fight-salve-used');
  });

  await part('Pursuit, cover and Scout reports', async () => {
    // The Scout is still guarding its post on the road (put it back if the brawl drew it off).
    await waitScout();
    if (!await until(dark, ([x, z]) => window.__grimm.snapshot().actors.some((a) => a.monster === 'scout' && a.mode === 'patrol' && Math.hypot(a.x - x, a.z - z) < 1.5), [post.x, post.z], 3000)) {
      await send(dark, { type: 'monsterOrder', actorId: (await scoutNow()).id, order: 'guard', x: post.x, z: post.z });
      await until(dark, ([x, z]) => window.__grimm.snapshot().actors.some((a) => a.monster === 'scout' && a.mode === 'patrol' && !a.moving && Math.hypot(a.x - x, a.z - z) < 1.5), [post.x, post.z], 90000);
    }
    // What the Scout's owner is sent at the moment of confirmation, captured as it happens.
    const ownerSees = dark.waitForFunction((id) => {
      const s = window.__grimm.snapshot();
      const me = s.actors.find((a) => a.id === s.you.actorId);
      const hero = s.actors.find((a) => a.id === id);
      const report = s.evidence.filter((e) => e.kind === 'sighting' && e.subject === id).at(-1);
      if (!hero || !report || !me) return false;
      return { far: Math.hypot(hero.x - me.x, hero.z - me.z), report, tick: s.tick, list: document.getElementById('reports').textContent, scout: s.actors.find((a) => a.monster === 'scout')?.mode };
    }, lightId, { timeout: 60000, polling: 30 }).then((h) => h.jsonValue(), () => null);
    // The Light hero walks east along the open road, into the Scout's view.
    await send(light, { type: 'moveTo', x: -22, z: 12.3 });
    let spotted = await until(light, () => window.__grimm.snapshot().you.spotted, null, 25000);
    if (!spotted) {
      await light.keyboard.press('KeyW');
      spotted = await until(light, () => window.__grimm.snapshot().you.spotted, null, 30000);
    }
    const hpSpotted = (await state(light)).kit.hp;
    const spottedShot = light.screenshot({ path: resolve(outDir, 'contest-light-spotted-by-scout.png') });

    // Escape at once: off the road, along the bank behind the roadside hedge, over the ford.
    let searching = false;
    let diedFleeing = false;
    let lastSeen = null;
    const poll = async () => {
      const v = await dark.evaluate(() => { const s = window.__grimm.snapshot(); return { mode: s.actors.find((a) => a.monster === 'scout')?.mode, lost: s.evidence.filter((e) => e.kind === 'lastSeen').at(-1) ?? null }; });
      searching ||= v.mode === 'search';
      lastSeen = v.lost ?? lastSeen;
    };
    for (const [x, z] of [[-31, 3.6], [-66, -26]]) {
      await send(light, { type: 'moveTo', x, z });
      for (let i = 0; i < 300; i++) {
        await sleep(150);
        await poll();
        const l = await state(light);
        diedFleeing ||= l.kit.dead;
        if (!l.me.moving && i > 3) break;
      }
    }
    for (let i = 0; i < 120 && !searching; i++) {
      await sleep(250);
      await poll();
    }
    await spottedShot;
    const ownerView = await ownerSees;
    check('the Scout confirms the Light hero and its owner receives live vision through it', spotted && ownerView && ownerView.far > 20 && ownerView.scout === 'chase', ownerView ? `Dark hero was ${ownerView.far.toFixed(0)} m away, beyond its own sight` : 'owner never received the hero');
    check('the confirmed sighting is a time-stamped report', Boolean(ownerView?.report) && ownerView.report.tick <= ownerView.tick && /Hero SIGHTED\d+s ago/.test(ownerView.list), ownerView?.list ?? '');
    const escaped = await state(light);
    await shot(light, 'light-escaped-through-cover');
    check('the Light hero breaks pursuit through cover: alive, no longer spotted, and the Scout is left searching', searching && !escaped.you.spotted && !escaped.kit.dead && !diedFleeing,
      `searching seen=${searching}, spotted=${escaped.you.spotted}, health ${hpSpotted} -> ${escaped.kit.hp}${diedFleeing ? ', died on the way' : ''}`);
    check('the Scout searches from where it last saw the hero, not from where the hero is', Boolean(lastSeen) && dist(lastSeen, escaped.me) > 8, lastSeen ? `last seen ${fmt(lastSeen)}, hero now at ${fmt(escaped.me)}` : 'no last-seen report');
    const lightView = await light.evaluate(() => { const s = window.__grimm.snapshot(); return { evidence: s.evidence.length, modes: s.actors.filter((a) => a.mode !== undefined || a.order !== undefined && a.kind === 'monster').length }; });
    check('the Light client is sent no reports and no monster state', lightView.evidence === 0 && lightView.modes === 0);
    const hidden = await dark.evaluate((id) => window.__grimm.snapshot().actors.some((a) => a.id === id), lightId);
    check('once sight is lost the owner no longer receives the hero', !hidden);
  });

  await part('Death, a ritual lost to corruption, and sanctuary resurrection', async () => {
    if ((await state(light)).kit.dead) {
      // Not part of the plan: the hero was killed earlier. Recover at the north wayshrine first.
      console.log('info  the hero was already dead; resurrecting at the north wayshrine before this part');
      await send(light, { type: 'moveTo', x: NORTH_SHRINE.x - 0.5, z: NORTH_SHRINE.z + 0.5 });
      await until(light, () => window.__grimm.snapshot().you.kit.interaction === 'ritual', null, 120000);
      await light.keyboard.press('KeyR');
      await until(light, () => !window.__grimm.snapshot().you.kit.dead, null, 40000);
    }
    // The two heroes meet on the road, outside the west wayshrine's precinct.
    await walk(dark, -64.5, 12.3, 120000);
    await walk(light, -66, 12.3, 120000);
    const died = await darkStrikes(true, 30);
    await sleep(500);
    const darkView = await snap(dark);
    // Then the Dark Hero walks into the precinct and begins to corrupt it.
    await send(dark, { type: 'moveTo', x: -61, z: 21 });
    const fallen = await state(light);
    const body = (await snap(light)).bodies.find((b) => b.heroId === lightId);
    check('the Light hero dies: a body is left where it fell and the player controls a ghost', died && fallen.kit.dead && fallen.me.ghost === true && Boolean(body) && await text(light, '.ph-name') === 'Ghost', body ? `body at ${fmt(body)}` : '');
    await shot(light, 'ghost-and-body');

    // The ghost travels; what each side is sent.
    await light.keyboard.press('KeyA');
    await light.keyboard.press('Digit2');
    await send(light, { type: 'moveTo', x: WEST_SHRINE.x - 0.5, z: WEST_SHRINE.z + 0.5 });
    await sleep(1500);
    const ghostView = await snap(light);
    const darkLater = await snap(dark);
    check('the ghost\'s view carries no enemy, though a Dark Hero stands a few metres away', ghostView.actors.every((a) => a.team === 'light') && ghostView.evidence.length === 0 && ghostView.you.attention === 0,
      `${ghostView.actors.length} actors, all Light`);
    check('the Dark client is never sent the ghost; the Dark Hero standing over the body sees the body', !darkView.actors.some((a) => a.id === lightId) && !darkLater.actors.some((a) => a.id === lightId) && darkView.bodies.some((b) => b.heroId === lightId));
    check('a ghost cannot attack or use items', (await state(light)).kit.hp === 0 && !(await snap(light)).actors.find((a) => a.id === lightId).action);

    const inCircle = await until(light, () => window.__grimm.snapshot().you.kit.interaction === 'ritual', null, 30000);
    check('the ghost reaches the wayshrine under attack and may begin its ritual there', inCircle, await text(light, '.ph-relay') ?? '');
    const alerted = await until(light, () => window.__grimm.snapshot().sanctuaries[0].threatened, null, 20000);
    const alert = await text(light, '.ph-notice');
    check('Light is alerted that the wayshrine is under attack, with its corruption level and no attacker', alerted && /West road wayshrine is under attack · corruption \d+%/.test(alert ?? ''), alert ?? '');
    // Start once the takeover is far enough along that it will finish first.
    await until(light, () => window.__grimm.snapshot().sanctuaries[0].corruption >= 0.6, null, 60000);
    await light.keyboard.press('KeyR');
    const begun = await until(light, () => window.__grimm.snapshot().you.kit.channel?.kind === 'ritual', null, 5000);
    const first = (await state(light)).kit.channel;
    // Watch from now: the notice is only shown for a few seconds.
    const lostNotice = light.waitForFunction(() => window.__grimm.snapshot().you.kit.ritualLost && document.querySelector('.ph-notice')?.textContent, null, { timeout: 60000, polling: 60 })
      .then((handle) => handle.jsonValue(), () => null);
    await sleep(2000);
    const mid = await snap(light);
    await light.screenshot({ path: resolve(outDir, 'contest-ritual-during-siege.png') });
    check('the ritual continues while the sanctuary is besieged', begun && mid.you.kit.channel?.kind === 'ritual' && mid.you.kit.channel.progress > first.progress && mid.sanctuaries[0].threatened && !mid.sanctuaries[0].corrupted,
      `progress ${(first.progress * 100).toFixed(0)}% -> ${((mid.you.kit.channel?.progress ?? 0) * 100).toFixed(0)}%, corruption ${(mid.sanctuaries[0].corruption * 100).toFixed(0)}%`);
    const lostText = await lostNotice;
    const lost = Boolean(lostText);
    const afterLoss = await snap(light);
    await light.screenshot({ path: resolve(outDir, 'contest-ritual-ended-by-full-corruption.png') });
    check('full corruption ends the ritual: the hero stays dead and that wayshrine is no longer eligible',
      lost && afterLoss.you.kit.dead && !afterLoss.you.kit.channel && afterLoss.you.kit.interaction === null && afterLoss.sanctuaries[0].corrupted && /fell to corruption/.test(lostText ?? ''), lostText ?? 'no notice seen');

    // The other wayshrine is still eligible. The ghost makes the journey.
    await send(light, { type: 'moveTo', x: NORTH_SHRINE.x - 0.5, z: NORTH_SHRINE.z + 0.5 });
    const arrived = await until(light, () => window.__grimm.snapshot().you.kit.interaction === 'ritual', null, 120000);
    const age = (await state(light)).kit.deadSeconds;
    await light.keyboard.press('KeyR');
    await until(light, () => window.__grimm.snapshot().you.kit.channel?.kind === 'ritual', null, 5000);
    const second = (await state(light)).kit.channel;
    const risen = await until(light, () => !window.__grimm.snapshot().you.kit.dead, null, 40000);
    const alive = await state(light);
    await shot(light, 'resurrected-at-north-wayshrine');
    check('sanctuary route: the ghost travels to an uncorrupted wayshrine, performs the ritual and returns to life there',
      arrived && risen && alive.kit.hp === alive.kit.maxHp && dist(alive.me, NORTH_SHRINE) < 4, `at ${fmt(alive.me)}, health ${alive.kit.hp}`);
    check('the ritual was shorter for the longer-dead hero', Boolean(first && second) && second.seconds < first.seconds + first.progress * 20, `first ritual ${first?.seconds}s left at ${Math.round((first?.progress ?? 0) * 100)}%, second ${second?.seconds}s after ${age}s dead`);
  });

  await part('Body route: a living ally revives the fallen hero', async () => {
    // The Dark Hero comes for the hero again, near the Light bots this time.
    let l = await state(light);
    // (Light bots near the relay sometimes kill the Dark Hero first; it then returns and tries again.)
    let died = false;
    for (let attempt = 0; attempt < 3 && !died; attempt++) {
      await until(dark, () => !window.__grimm.snapshot().you.kit.dead, null, 30000);
      await walk(dark, l.me.x + 1.5, l.me.z + 0.3, 120000);
      died = await darkStrikes(true, 30);
    }
    const body = (await snap(light)).bodies.find((b) => b.heroId === lightId);
    await send(dark, { type: 'moveTo', x: -40, z: -45 });
    check('the hero falls again, within reach of its bot allies', died && Boolean(body), body ? `body at ${fmt(body)}` : '');
    // The ghost waits. A living Light bot must come to the body and revive it.
    let rescuing = false;
    let revived = false;
    for (let i = 0; i < 480 && !revived; i++) {
      await sleep(250);
      const s = await state(light);
      rescuing ||= s.kit.channel?.kind === 'rescued';
      revived = !s.kit.dead;
    }
    l = await state(light);
    await shot(light, 'revived-at-body-by-ally');
    check('body route: a living Light bot reached the body and revived the hero there', rescuing && revived && body && dist(l.me, body) < 0.5 && l.kit.hp < l.kit.maxHp,
      revived ? `stood up at ${fmt(l.me)} with ${l.kit.hp} health` : `not revived within 2 minutes (bots: ${(await snap(light)).actors.filter((a) => a.team === 'light' && a.id !== lightId).map((a) => (a.ghost ? 'ghost' : 'alive')).join(', ')})`);
    if (!revived) {
      // Carry on with the run: take the sanctuary route instead.
      await send(light, { type: 'moveTo', x: NORTH_SHRINE.x - 0.5, z: NORTH_SHRINE.z + 0.5 });
      await until(light, () => window.__grimm.snapshot().you.kit.interaction === 'ritual', null, 60000);
      await light.keyboard.press('KeyR');
      await until(light, () => !window.__grimm.snapshot().you.kit.dead, null, 40000);
    }
  });

  await part('Sabotage changes the Dark Energy rate', async () => {
    const energyText = () => Promise.all([text(light, '.ph-energy'), text(dark, '.ph-energy')]);
    const [l0, d0] = await energyText();
    const before = (await state(light)).operation;
    check('both HUDs show the relay feeding Dark Energy', before.active && /\+3\/s/.test(l0 ?? '') && /\+3\/s/.test(d0 ?? ''), `Light: ${l0} · Dark: ${d0}`);
    let done = false;
    let deaths = 0;
    let presses = 0;
    for (let i = 0; i < 600 && !done; i++) {
      const s = await state(light);
      if (s.operation.result) break;
      done = !s.operation.active;
      if (done) break;
      if (s.kit.dead) {
        // Killed in the brawl at the relay: take the ghost to the north wayshrine and come back.
        deaths++;
        if (deaths > 3) break;
        await send(light, { type: 'moveTo', x: NORTH_SHRINE.x - 0.5, z: NORTH_SHRINE.z + 0.5 });
        for (let k = 0; k < 400; k++) {
          await sleep(250);
          const g = await state(light);
          if (!g.kit.dead) break;
          if (g.kit.interaction) await light.keyboard.press('KeyR');
        }
        continue;
      }
      if (s.kit.hp <= 60 && s.kit.quick[1] === 'salve') await light.keyboard.press('Digit2');
      if (s.operation.progress > 0) {
        await sleep(200);
        continue;
      }
      if (s.operation.interaction === 'sabotage') {
        await light.keyboard.press('KeyR');
        presses++;
        await sleep(250);
        continue;
      }
      if (!s.me.order && dist(s.me, RELAY) > 2.2) await send(light, { type: 'moveTo', x: RELAY.x - 1.3, z: RELAY.z + 1.2 });
      await sleep(250);
    }
    const after = (await state(light)).operation;
    await until(dark, () => !window.__grimm.snapshot().operation.active, null, 3000);
    await sleep(400);
    const [l1, d1] = await energyText();
    // (If Dark repairs within that half second the HUD is already back at the full rate.)
    const repairedEarly = done && (await state(dark)).operation.active;
    await light.screenshot({ path: resolve(outDir, 'contest-relay-sabotaged-rate-drops.png') });
    await dark.screenshot({ path: resolve(outDir, 'contest-dark-sees-rate-drop.png') });
    check('the Light hero sabotages the relay in the live contest', done, `${presses} attempt(s), ${deaths} death(s) on the way`);
    check('sabotage removes the relay\'s contribution to future Dark Energy and leaves the bank intact', done && after.energy >= before.energy && after.energyPerSecond === 1, `banked ${before.energy} -> ${after.energy}, rate +${before.energyPerSecond}/s -> +${after.energyPerSecond}/s`);
    check('both HUDs show the lower rate', done && (/\+1\/s/.test(l1 ?? '') && /\+1\/s/.test(d1 ?? '') || repairedEarly), `Light: ${l1} · Dark: ${d1}`);
    // What happens next is up to the contest: a Dark repair restores the rate, or Light holds 25 s and takes the Vale.
    let repaired = false;
    let result = null;
    for (let i = 0; i < 160 && !repaired && !result; i++) {
      await sleep(250);
      const o = (await state(dark)).operation;
      result = o.result;
      repaired = done && o.active;
    }
    const end = (await state(dark)).operation;
    console.log(`info  after the sabotage: ${repaired ? `Dark repaired the relay; rate back to +${end.energyPerSecond}/s` : result ? `local result: ${result}` : 'relay still offline'}`);
    if (repaired) check('a Dark repair restores the relay\'s contribution', end.energyPerSecond === 3);
    if (result) check('the relay result is local to this playtest and both clients receive it', (await state(light)).operation.result === result, `${result} holds Orchard Vale`);
  });
} finally {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (problems.length) console.log(`Page errors:\n  ${[...new Set(problems)].slice(0, 10).join('\n  ')}`);
  await browser.close();
  process.exitCode = failed.length || problems.length ? 1 : 0;
}
