// Real-browser check of the M1 hunt-and-escape scenario.
//
//   npm run build
//   GRIMM_BOTS=none GRIMM_SEED=7 npm start        (bots off so the script controls every hero)
//   npm run verify:m1 [url]                       default url: http://localhost:2567
//
// Opens THREE real Chromium tabs against the running game: a Light hero, the
// Dark player who owns the Scout, and a Dark teammate who owns nothing. It
// plays the scenario with real key and mouse events and checks what each tab
// was actually sent and what it actually shows. Screenshots go to
// docs/evidence/m1-*.png. Playwright is not a project dependency: a locally
// or globally installed `playwright` package is used. In Codespaces first run
// `npm install --no-save playwright && npx playwright install chromium`.
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
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  try {
    return require(resolve(globalRoot, 'playwright'));
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error('Playwright is missing. In the repository root run:\n  npm install --no-save playwright\n  npx playwright install chromium\nThen rerun the browser check.');
  }
}

const url = process.argv[2] ?? 'http://localhost:2567';
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/evidence');
mkdirSync(outDir, { recursive: true });
const shot = (page, name) => page.screenshot({ path: resolve(outDir, name) });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const problems = [];

async function open(query, lightweight = false) {
  // Keep the commander's real 1280x720 viewport: its right-click orders
  // require accurate ground-ray targeting at normal zoom. Only the passive
  // Dark teammate's observer tab is reduced in CI to lower software GPU load.
  const viewport = process.env.CI && lightweight
    ? { width: 480, height: 270 }
    : { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && problems.push(`${query}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`${query}: ${e.message}`));
  await page.goto(`${url}/?${query}`);
  await page.waitForFunction(() => window.__grimm?.ready && window.__grimm.snapshot()?.you, null, { timeout: 30000 });
  // Record, inside the page, everything the tab is sent between polls.
  await page.evaluate(() => {
    const rec = (window.__rec = { maxAttention: 0, sawEnemyHero: false, moods: [], evidenceKinds: [], firstSighting: null, sawSightingHud: false, heroTicks: 0, modes: [], sounds: [], indicator: [], lastTick: 0 });
    setInterval(() => {
      const s = window.__grimm.snapshot();
      if (!s || s.tick === rec.lastTick) return;
      rec.lastTick = s.tick;
      rec.maxAttention = Math.max(rec.maxAttention, s.you.attention);
      const shown = document.getElementById('attention').dataset.state;
      if (shown && rec.indicator.at(-1) !== shown) rec.indicator.push(shown);
      if (s.actors.some((a) => a.kind === 'hero' && a.team !== s.you.team)) {
        rec.sawEnemyHero = true;
        rec.heroTicks++;
      }
      for (const a of s.actors) {
        if (a.mood && rec.moods.at(-1) !== a.mood) rec.moods.push(a.mood);
        if (a.mode && rec.modes.at(-1) !== a.mode) rec.modes.push(a.mode);
      }
      for (const e of s.evidence) {
        if (!rec.evidenceKinds.includes(e.kind)) rec.evidenceKinds.push(e.kind);
        if (e.kind === 'sighting' && !rec.firstSighting) rec.firstSighting = { ...e };
      }
      if (/Hero SIGHTED/.test(window.__grimm.hud().reports)) rec.sawSightingHud = true;
      for (const snd of s.sounds) rec.sounds.push(snd.kind);
    }, 10);
  });
  return page;
}

const snap = (page) => page.evaluate(() => window.__grimm.snapshot());
const rec = (page) => page.evaluate(() => window.__rec);
const resetRec = (page) => page.evaluate(() => Object.assign(window.__rec, { maxAttention: 0, sawEnemyHero: false, heroTicks: 0, moods: [], modes: [], sounds: [], indicator: [], firstSighting: null, sawSightingHud: false, evidenceKinds: [] }));
const hud = (page) => page.evaluate(() => window.__grimm.hud());
const me = async (page) => {
  const s = await snap(page);
  return s.actors.find((a) => a.id === s.you.actorId);
};
const send = (page, command) => page.evaluate((c) => window.__grimm.send(c), command);
const until = (page, fn, timeout = 30000, arg) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
const walkTo = async (page, x, z, timeout = 30000) => {
  await send(page, { type: 'moveTo', x, z });
  await page.waitForTimeout(400);
  await until(page, () => { const s = window.__grimm.snapshot(); return !s.actors.find((a) => a.id === s.you.actorId).moving; }, timeout);
};
// Run through a list of points without stopping at each one, the way a player
// holding a direction would: the next order goes out just before arrival.
const runRoute = async (page, points) => {
  for (const [i, [x, z]] of points.entries()) {
    await send(page, { type: 'moveTo', x, z });
    const last = i === points.length - 1;
    await until(page, ([px, pz, near]) => {
      const s = window.__grimm.snapshot();
      const hero = s.actors.find((a) => a.id === s.you.actorId);
      return Math.hypot(hero.x - px, hero.z - pz) < near;
    }, 30000, [x, z, last ? 0.2 : 2.5]);
  }
};
const focus = (page, x, z) => page.evaluate(([fx, fz]) => window.__grimm.focus(fx, fz), [x, z]);
const fmt = (a) => (a ? `${a.x.toFixed(1)}, ${a.z.toFixed(1)}` : 'not sent');

try {
  const light = await open('team=light');
  const owner = await open('team=dark'); // first Dark seat: owns the Scout
  const mate = await open('team=dark', true); // second Dark seat, observer-only tab
  const seats = await Promise.all([light, owner, mate].map(async (p) => (await snap(p)).you.slot));
  check('three tabs seated: Light 4, Dark 0 (Scout owner), Dark 1', seats.join() === '4,0,1', seats.join());

  // ---- 1. Fog is enforced by the server, per tab ---------------------------
  await light.waitForTimeout(1000);
  const [ls, os, ms] = await Promise.all([snap(light), snap(owner), snap(mate)]);
  check('Light tab was not sent the Dark heroes', ls.actors.every((a) => !(a.kind === 'hero' && a.team === 'dark')), `${ls.actors.length} actors`);
  check('Dark tabs were not sent the Light hero', [os, ms].every((s) => s.actors.every((a) => a.team === 'dark')));
  const scoutId = os.actors.find((a) => a.kind === 'monster').id;
  check('only the owner is sent the Scout\'s behaviour state and destination', os.actors.find((a) => a.id === scoutId).mode === 'patrol' && ms.actors.find((a) => a.id === scoutId).mode === undefined);

  // Park both Dark heroes in the far north-east corner, so that everything the
  // Dark tabs learn below comes from the Scout and not from a hero's own eyes.
  await send(owner, { type: 'moveTo', x: 28.5, z: -26.5 });
  await send(mate, { type: 'moveTo', x: 28.5, z: -28.5 });

  // ---- 2. Cover: wait behind the thicket while the Scout patrols the road --
  await walkTo(light, -6, 15.6);
  await resetRec(light);
  await light.waitForTimeout(14000); // a good part of a patrol loop
  const inCover = await rec(light);
  await focus(light, -2, 9);
  await light.waitForTimeout(600);
  await shot(light, 'm1-light-hiding-behind-thicket.png');
  check('hiding behind the thicket for 14 s: attention stayed at zero', inCover.maxAttention === 0, `max attention ${inCover.maxAttention}`);
  check('the attention indicator stays hidden while unnoticed', (await hud(light)).attentionState === 'hidden');

  // ---- 3. Exposure: stand in the road gap until noticed, then confirmed ----
  await resetRec(light);
  await resetRec(owner);
  await resetRec(mate);
  await walkTo(light, -0.5, 15.6);
  const noticed = await until(light, () => { const y = window.__grimm.snapshot().you; return y.attention > 0.15 && !y.spotted; }, 60000);
  await light.waitForTimeout(150);
  await shot(light, 'm1-light-being-noticed.png');
  check('standing in the open gap: attention starts to build', noticed);
  check('a monster that is watching the hero is visible to the hero', (await snap(light)).actors.some((a) => a.kind === 'monster'));

  const spotted = await until(light, () => window.__grimm.snapshot().you.spotted, 60000);
  // Observe receipt immediately without blocking the fleeing player's input.
  // Screenshots can take long enough on software WebGL to outlive evidence TTL.
  const mateSightingPromise = mate.waitForFunction(
    () => window.__grimm.snapshot().evidence.some((e) => e.kind === 'sighting'),
    null, { timeout: 15000, polling: 100 },
  ).then(() => true, () => false);
  // Flee at once, as a player would: east, behind the ruined wall and the boulder.
  // (Standing still for a few seconds lets the Scout close in, and from point-blank
  // range this route does not shake it: see known defects.)
  await send(light, { type: 'moveTo', x: 19.5, z: 15.5 });
  await shot(light, 'm1-light-spotted.png');
  const spottedHud = await hud(light);
  check('sustained exposure is confirmed: indicator reads SPOTTED', spotted && spottedHud.attentionState === 'spotted' && spottedHud.attention === 'SPOTTED');
  const lightRec = await rec(light);
  check('the on-screen indicator went hidden -> noticed -> spotted', lightRec.indicator.join(' > ').endsWith('noticed > spotted'), lightRec.indicator.join(' > '));
  check('the Scout showed its state in the world: suspicious, then alarmed', lightRec.moods.includes('alarmed'), lightRec.moods.join(' > '));
  const lightAudio = await light.evaluate(() => window.__grimm.audio().played);
  check('audio cues fired on the Light tab (heartbeat, howl, spotted sting)', lightAudio.pulse > 0 && lightAudio.howl > 0 && lightAudio.sting > 0, JSON.stringify(lightAudio));

  // ---- 4. D-012 in three real tabs -----------------------------------------
  await owner.waitForTimeout(400);
  const lightHero = await me(light);
  await focus(owner, lightHero.x, lightHero.z - 3);
  await focus(mate, lightHero.x, lightHero.z - 3);
  await owner.waitForTimeout(900);
  const [oAfter, mAfter] = await Promise.all([snap(owner), snap(mate)]);
  const oHero = oAfter.actors.find((a) => a.team === 'light');
  const mHero = mAfter.actors.find((a) => a.team === 'light');
  await shot(owner, 'm1-dark-owner-live-vision.png');
  await shot(mate, 'm1-dark-teammate-alert-only.png');
  check('OWNER tab is sent the hero live (its Scout\'s vision)', Boolean(oHero) || (await rec(owner)).sawEnemyHero, fmt(oHero));
  check('TEAMMATE tab is NOT sent the hero', !mHero, fmt(mHero));
  const mateAlertArrived = await mateSightingPromise;
  const [ownerHistory, mateHistory] = await Promise.all([rec(owner), rec(mate)]);
  const mAlert = mAfter.evidence.find((e) => e.kind === 'sighting') ?? mateHistory.firstSighting;
  check('TEAMMATE tab received the shared time-stamped sighting (no private evidence)', mateAlertArrived && Boolean(mAlert) && mAfter.evidence.every((e) => e.kind === 'sighting'), mAlert ? `at ${fmt(mAlert)}, tick ${mAlert.tick}` : `none; observed kinds: ${mateHistory.evidenceKinds.join(',')}`);
  check('both Dark tabs displayed the confirmed sighting alert', ownerHistory.sawSightingHud && mateHistory.sawSightingHud, `owner=${ownerHistory.sawSightingHud}, teammate=${mateHistory.sawSightingHud}; current=${(await hud(mate)).reports}`);
  const darkAudio = await mate.evaluate(() => window.__grimm.audio().played);
  check('the teammate tab rang the alert bell', darkAudio.bell > 0, JSON.stringify(darkAudio));

  // ---- 5. Escape: break line of sight and get away -------------------------
  await resetRec(mate);
  // Run without stopping: east behind the ruined wall, the boulder and the
  // hedge, north past the east cache, then west behind the north belt.
  await runRoute(light, [[19.5, 15.5], [22.5, 6], [22, -6], [12, -12.5], [2, -17], [-12, -12], [-21, -6]]);
  const lost = await until(owner, () => window.__grimm.snapshot().actors.some((a) => a.mode === 'search' || a.mode === 'return'), 40000);
  await owner.waitForTimeout(300);
  const oLost = await snap(owner);
  const scoutNow = oLost.actors.find((a) => a.id === scoutId);
  await focus(owner, scoutNow.x, scoutNow.z);
  await owner.waitForTimeout(900);
  await shot(owner, 'm1-dark-owner-scout-searching.png');
  const lastSeen = oLost.evidence.find((e) => e.kind === 'lastSeen');
  const trueHero = await me(light);
  check('the Scout lost the hero and is searching', lost, `scout at ${fmt(scoutNow)}`);
  check('owner is no longer sent the hero, only a frozen last-seen point', !oLost.actors.some((a) => a.team === 'light') && Boolean(lastSeen), lastSeen ? `last seen ${fmt(lastSeen)}; hero really at ${fmt(trueHero)}` : '');
  check('the last-seen point is not where the hero now is', lastSeen && Math.hypot(lastSeen.x - trueHero.x, lastSeen.z - trueHero.z) > 4);
  const calm = await until(light, () => { const y = window.__grimm.snapshot().you; return y.attention === 0 && !y.spotted; }, 30000);
  check('once hidden, the hero\'s attention indicator relaxes back to nothing', calm && (await hud(light)).attentionState === 'hidden');
  const backHome = await until(owner, () => window.__grimm.snapshot().actors.some((a) => a.mode === 'patrol'), 60000);
  const ownerRec = await rec(owner);
  check('the search ends and the Scout returns to its patrol', backHome, ownerRec.modes.join(' > '));
  check('the teammate tab never received the hero during the whole chase and search', !(await rec(mate)).sawEnemyHero);

  // ---- 6. Reward: open the west cache --------------------------------------
  await walkTo(light, -21, 3, 40000);
  const opened = await until(light, () => window.__grimm.snapshot().you.carried === 1, 15000);
  check('standing on the west cache opens it', opened, (await hud(light)).objective);

  // ---- 7. Noise: whistle from behind cover, then slip away -----------------
  await send(light, { type: 'setGait', sneak: false });
  await light.keyboard.down('ShiftLeft'); // real key: sneak into position
  await resetRec(light);
  await walkTo(light, -22, 10, 40000);
  await walkTo(light, -17, 15.5, 40000);
  await walkTo(light, -12, 15.5, 40000); // south of the ruined wall
  await light.keyboard.up('ShiftLeft');
  const sneaked = await rec(light);
  console.log(`info  sneaked back along the covered route; highest attention on the way: ${sneaked.maxAttention}`);
  // Wait until the Scout is within earshot but cannot see the hero.
  await until(owner, () => {
    const s = window.__grimm.snapshot();
    const scout = s.actors.find((a) => a.kind === 'monster');
    return scout.mode === 'patrol' && Math.hypot(scout.x + 12, scout.z - 15.5) < 13 && !s.actors.some((a) => a.team === 'light');
  }, 90000);
  await resetRec(owner);
  await resetRec(light);
  const growlsBefore = await light.evaluate(() => window.__grimm.audio().played.growl ?? 0);
  await light.keyboard.press('KeyF'); // real key press: whistle
  const heard = await until(owner, () => window.__grimm.snapshot().evidence.some((e) => e.kind === 'noise'), 8000);
  await light.keyboard.down('ShiftLeft'); // real key: sneak
  await light.waitForTimeout(200);
  await send(light, { type: 'moveTo', x: -20, z: 22 });
  await light.waitForTimeout(600);
  const sneaking = (await me(light)).sneaking === true;
  const oNoise = await snap(owner);
  const noise = oNoise.evidence.find((e) => e.kind === 'noise');
  await focus(owner, -7, 10);
  await owner.waitForTimeout(900);
  await shot(owner, 'm1-dark-owner-noise-report.png');
  check('F whistles: the owner gets a noise report with no hero attached', heard && noise && noise.subject === undefined, noise ? `noise at ${fmt(noise)} (hero whistled at -12.0, 15.5)` : '');
  check('the noise did not reveal the hero to the owner', !oNoise.actors.some((a) => a.team === 'light'));
  check('the Scout turns to investigate', (await until(owner, () => window.__grimm.snapshot().actors.some((a) => a.mode === 'investigate'), 5000)));
  check('holding Shift makes the hero sneak', sneaking);
  check('the hidden hero heard the Scout react (a growl, with no position)', (await light.evaluate(() => window.__grimm.audio().played.growl ?? 0)) > growlsBefore);
  await light.waitForTimeout(6000);
  await light.keyboard.up('ShiftLeft');

  // ---- 8. Commander: a real right-click posts the Scout at the east cache --
  await until(owner, () => window.__grimm.snapshot().actors.some((a) => a.mode === 'patrol' || a.mode === 'return'), 40000);
  await focus(owner, 14, -1);
  await owner.waitForTimeout(900);
  const target = await owner.evaluate(() => window.__grimm.worldToScreen(18.5, -3.5));
  await owner.mouse.click(target.x, target.y, { button: 'right' });
  const ordered = await until(owner, () => { const a = window.__grimm.snapshot().actors.find((m) => m.kind === 'monster'); return a.mode === 'return' && a.order && Math.hypot(a.order.x - 18.5, a.order.z + 3.5) < 1.5; }, 5000);
  const ownerHeroBefore = await me(owner);
  check('right-click orders the owner\'s Scout to that spot (and does not move the hero)', ordered && !(ownerHeroBefore.moving));
  // A teammate's right-click must not move someone else's Scout: for them it is a hero move.
  const mateTarget = await mate.evaluate(() => window.__grimm.worldToScreen(2, -20));
  await mate.mouse.click(mateTarget.x, mateTarget.y, { button: 'right' });
  await mate.waitForTimeout(500);
  const stillOrdered = (await snap(owner)).actors.find((a) => a.id === scoutId).order;
  check('a teammate cannot redirect the Scout', Boolean(stillOrdered) && Math.hypot(stillOrdered.x - 18.5, stillOrdered.z + 3.5) < 1.5);
  const posted = await until(owner, () => { const a = window.__grimm.snapshot().actors.find((m) => m.kind === 'monster'); return a.mode === 'patrol' && Math.hypot(a.x - 18.5, a.z + 3.5) < 1.5; }, 45000);
  await owner.waitForTimeout(600);
  await shot(owner, 'm1-dark-owner-scout-guarding-cache.png');
  check('the Scout travels there and stands guard at the cache', posted, (await hud(owner)).objective);
  await owner.keyboard.press('KeyP');
  check('P sends the Scout back to its patrol route', await until(owner, () => window.__grimm.snapshot().actors.some((a) => a.mode === 'return'), 4000));

  // ---- 9. The same feedback in the hero camera -----------------------------
  await light.keyboard.press('Tab');
  await light.waitForTimeout(1200);
  await send(light, { type: 'moveTo', x: -0.5, z: 15.6 });
  const heroSpotted = await until(light, () => window.__grimm.snapshot().you.attention > 0.2, 90000);
  await light.waitForTimeout(200);
  await shot(light, 'm1-hero-view-being-noticed.png');
  check('hero camera: the same attention indicator works', heroSpotted && (await light.evaluate(() => window.__grimm.mode())) === 'hero' && (await hud(light)).attentionState !== 'hidden');

  // ---- 10. Hygiene ----------------------------------------------------------
  const streams = await Promise.all([light, owner, mate].map((p) => p.evaluate(() => window.__grimm.debugStream())));
  check('no tab received development-only perception data', streams.every((s) => s === false));
  check('no browser console errors', problems.length === 0, problems.join(' | '));
} catch (error) {
  check('browser check ran to completion', false, error.message);
  if (problems.length) console.log('console errors:', problems.join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} M1 browser checks passed`);
process.exit(failed.length ? 1 : 0);
