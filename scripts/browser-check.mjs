// Real-browser regression check for the M0 foundations (3D client, input,
// collision, both cameras). The M1 hunt scenario is scripts/browser-check-m1.mjs.
//
//   npm run dev            (or: npm run build && npm start)
//   npm run verify:browser [url]      default url: http://localhost:5173
//
// Drives Chromium through Playwright with real mouse/keyboard events and
// asserts on what the page actually simulates and renders. Screenshots are
// written to docs/evidence/. Playwright is not a project dependency: the
// script uses a locally or globally installed `playwright` package.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(resolve(globalRoot, 'playwright'));
  }
}

const url = process.argv[2] ?? 'http://localhost:5173';
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/evidence');
mkdirSync(outDir, { recursive: true });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const fmt = (p) => (p ? `${p.x.toFixed(2)}, ${p.z.toFixed(2)}` : 'none');

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
page.on('pageerror', (e) => problems.push(e.message));

const hero = () => page.evaluate(() => {
  const g = window.__grimm;
  const s = g.snapshot();
  const me = s.actors.find((a) => a.id === s.you.actorId);
  return { sim: { x: me.x, z: me.z }, moving: me.moving, rendered: g.renderedPosition(me.id), tick: s.tick };
});
// Since M1 a Light client is only sent monsters its hero can see, so the
// patrol is observed from a Dark seat in a second tab.
// Kept tiny: in a software-rendered browser a second full-size tab halves the frame rate.
const darkPage = await browser.newPage({ viewport: { width: 160, height: 90 }, deviceScaleFactor: 1 });
const monster = () => darkPage.evaluate(() => {
  const g = window.__grimm;
  const m = g.snapshot().actors.find((a) => a.kind === 'monster');
  return { sim: { x: m.x, z: m.z }, rendered: g.renderedPosition(m.id) };
});
const waitIdle = async (timeout = 20000) => {
  await page.waitForFunction(() => {
    const s = window.__grimm.snapshot();
    return !s.actors.find((a) => a.id === s.you.actorId).moving;
  }, null, { timeout, polling: 100 });
  await page.waitForTimeout(400); // let interpolation settle
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

try {
  await page.goto(url);
  await page.waitForFunction(() => window.__grimm?.ready && window.__grimm.snapshot()?.you, null, { timeout: 30000 });
  await darkPage.goto(`${url}${url.includes('?') ? '&' : '?'}team=dark`);
  await darkPage.waitForFunction(() => window.__grimm?.ready && window.__grimm.snapshot()?.you, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  // 1. The 3D client is really running in the browser.
  const stats = await page.evaluate(() => window.__grimm.stats());
  check('browser opens the 3D client on WebGL2', /WebGL 2/.test(stats.renderer), stats.renderer);
  check('scene is being drawn', stats.drawCalls > 20 && stats.triangles > 10000, `${stats.drawCalls} draw calls, ${stats.triangles} triangles`);
  check('GLB model import path is used', stats.assets.standing_stone === 'glb', `standing_stone: ${stats.assets.standing_stone}`);
  const snap = await page.evaluate(() => window.__grimm.snapshot());
  check('eight slots: four Dark, four Light', snap.slots.length === 8 && snap.slots.filter((s) => s.team === 'dark').length === 4 && snap.slots.filter((s) => s.team === 'light').length === 4);
  check('client is seated in a Light slot', snap.you.team === 'light', `slot ${snap.you.slot}`);
  await page.screenshot({ path: resolve(outDir, 'm0-strategy-view.png') });

  // 2. Strategy view: a real mouse click on the ground orders the hero there.
  const before = await hero();
  const monsterBefore = await monster();
  const cameraRts = await page.evaluate(() => window.__grimm.camera());
  await page.mouse.click(640, 250);
  await page.waitForTimeout(1200);
  await waitIdle();
  const afterClick = await hero();
  check('click-to-move changes simulation state', dist(before.sim, afterClick.sim) > 3, `${fmt(before.sim)} -> ${fmt(afterClick.sim)}`);
  check('3D rendering follows the simulation', dist(afterClick.sim, afterClick.rendered) < 0.05, `rendered ${fmt(afterClick.rendered)}`);
  const screen = await page.evaluate(() => { const g = window.__grimm; return g.screenPosition(g.snapshot().you.actorId); });
  check('hero arrived under the clicked screen point', Math.hypot(screen.x - 640, screen.y - 250) < 60, `hero on screen at ${screen.x.toFixed(0)}, ${screen.y.toFixed(0)}`);

  // 3. The monster patrols by itself (no input was addressed to it).
  const monsterAfter = await monster();
  check('autonomous monster moved in simulation and on screen', dist(monsterBefore.sim, monsterAfter.sim) > 1 && dist(monsterBefore.rendered, monsterAfter.rendered) > 1, `${fmt(monsterBefore.sim)} -> ${fmt(monsterAfter.sim)}`);

  // 4. Collision with a major visible obstacle, using held keyboard input.
  //    Walk to a point south of the crooked house, then hold W (north) into it.
  const house = { x: -9, z: -5, hx: 3.2, hz: 2.6 };
  await page.evaluate(() => window.__grimm.send({ type: 'moveTo', x: -9, z: 3 }));
  await page.waitForTimeout(800);
  await waitIdle(30000);
  const staged = await hero();
  check('hero staged south of the house', dist(staged.sim, { x: -9, z: 3 }) < 0.2, fmt(staged.sim));

  await page.keyboard.press('Tab');
  await page.waitForTimeout(1200);
  const cameraHero = await page.evaluate(() => window.__grimm.camera());
  check('hero camera is a different rig from the strategy camera', (await page.evaluate(() => window.__grimm.mode())) === 'hero' && Math.abs(cameraHero.fov - cameraRts.fov) > 5 && cameraHero.position[1] < cameraRts.position[1] / 3, `strategy y=${cameraRts.position[1].toFixed(1)} fov=${cameraRts.fov} | hero y=${cameraHero.position[1].toFixed(1)} fov=${cameraHero.fov.toFixed(0)}`);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  const walking = await hero();
  check('holding W moves the hero north (direct control)', walking.moving && walking.sim.z < staged.sim.z - 0.5, `z ${staged.sim.z.toFixed(2)} -> ${walking.sim.z.toFixed(2)}`);
  await page.waitForTimeout(3500); // far longer than needed to cross the house
  const blocked = await hero();
  await page.screenshot({ path: resolve(outDir, 'm0-hero-view-blocked-by-house.png') });
  await page.keyboard.up('KeyW');
  const wallZ = house.z + house.hz + 0.5;
  check('hero cannot walk through the crooked house', Math.abs(blocked.sim.z - wallZ) < 0.01 && !blocked.moving, `stopped at z=${blocked.sim.z.toFixed(3)}, wall + radius = ${wallZ}`);

  // Slide off the wall and stop when the key is released.
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(600);
  const strafed = await hero();
  await page.waitForTimeout(500);
  const rested = await hero();
  check('releasing the key stops the hero', strafed.sim.x > blocked.sim.x + 1 && dist(strafed.sim, rested.sim) < 1e-9 && !rested.moving, `x ${blocked.sim.x.toFixed(2)} -> ${rested.sim.x.toFixed(2)}`);

  // 5. Hero view screenshot looking up the road to the castle, then switch back.
  await page.evaluate(() => window.__grimm.send({ type: 'moveTo', x: -1, z: 14 }));
  await page.waitForTimeout(800);
  await waitIdle(30000);
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(outDir, 'm0-hero-view.png') });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1200);
  check('switching back restores the strategy camera', (await page.evaluate(() => window.__grimm.mode())) === 'rts');
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(outDir, 'm0-strategy-view-collision-debug.png') });

  const final = await page.evaluate(() => window.__grimm.stats());
  console.log(`info  ${final.fps.toFixed(1)} fps in this (software-rendered, headless) browser; ${final.snapshots} snapshots received`);
  check('no browser console errors', problems.length === 0, problems.join(' | '));
} catch (error) {
  check('browser check ran to completion', false, error.message);
  if (problems.length) console.log('console errors:', problems.join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
