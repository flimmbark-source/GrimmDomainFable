// Real-browser check and evidence capture for the Orchard Vale test region.
//
//   npm run build && GRIMM_BOTS=none GRIMM_SEED=7 npm start
//   npm run verify:orchard [url]        default url: http://localhost:2567
//
// Drives Chromium through Playwright with real mouse and keyboard input
// against the real server, asserts on what the page simulates and draws, and
// writes screenshots of the running game to docs/evidence/orchard-vale-*.png.
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
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  try {
    return require(resolve(globalRoot, 'playwright'));
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error('Playwright is missing. In the repository root run:\n  npm install --no-save playwright\n  npx playwright install chromium\nThen rerun the check.');
  }
}

const base = (process.argv[2] ?? 'http://localhost:2567').replace(/\/$/, '');
const regionUrl = `${base}/?region=orchard_vale`;
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/evidence');
mkdirSync(outDir, { recursive: true });
const shotPath = (name) => resolve(outDir, `orchard-vale-${name}.png`);

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const fmt = (p) => (p ? `${p.x.toFixed(2)}, ${p.z.toFixed(2)}` : 'none');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const watch = (page) => {
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
};
const ready = (page) => page.waitForFunction(() => window.__grimm?.ready && window.__grimm.snapshot()?.you, null, { timeout: 120000, polling: 250 });

const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
watch(page);
// Observer tabs draw nothing (?render=0): they only report what their seat is sent.
const owner = await browser.newPage({ viewport: { width: 320, height: 180 } });
const mate = await browser.newPage({ viewport: { width: 320, height: 180 } });

const hero = () => page.evaluate(() => {
  const g = window.__grimm;
  const s = g.snapshot();
  const me = s.actors.find((a) => a.id === s.you.actorId);
  const r = g.renderedPosition(me.id);
  return { sim: { x: me.x, z: me.z }, moving: me.moving, rendered: r, spotted: s.you.spotted, attention: s.you.attention };
});
const waitIdle = async (timeout = 90000) => {
  await page.waitForTimeout(500);
  await page.waitForFunction(() => {
    const s = window.__grimm.snapshot();
    return !s.actors.find((a) => a.id === s.you.actorId).moving;
  }, null, { timeout, polling: 200 });
  await page.waitForTimeout(500);
};
const walkTo = async (x, z) => {
  await page.evaluate(([x, z]) => window.__grimm.send({ type: 'moveTo', x, z }), [x, z]);
  await waitIdle();
};
const setMode = async (mode) => {
  await page.evaluate((m) => window.__grimm.setMode(m), mode);
  await page.waitForFunction((m) => {
    const g = window.__grimm;
    return g.mode() === m && Math.abs(g.camera().fov - (m === 'hero' ? 58 : 36)) < 0.5;
  }, mode, { timeout: 60000, polling: 100 });
};
/** Screenshot of the running game. `pose` positions the cameras; nothing else is touched. */
const shot = async (name, pose = {}) => {
  await setMode(pose.mode ?? 'rts');
  await page.evaluate((p) => {
    const g = window.__grimm;
    g.rig(p);
    if (p.focus) g.focus(p.focus[0], p.focus[1]);
  }, pose);
  await page.waitForTimeout(pose.mode === 'hero' ? 3500 : 2500);
  await page.screenshot({ path: shotPath(name) });
  const s = await page.evaluate(() => window.__grimm.stats());
  console.log(`shot  orchard-vale-${name}.png  ${s.fps.toFixed(1)} fps, ${s.drawCalls} draw calls, ${s.triangles} triangles`);
  return s;
};

try {
  // --- Map authority -----------------------------------------------------------
  const plain = await browser.newPage({ viewport: { width: 320, height: 180 } });
  await plain.goto(`${base}/?render=0`);
  await ready(plain);
  const defaultMap = await plain.evaluate(() => window.__grimm.mapId());
  check('the default match is still the M1 forest crossing', defaultMap === 'forest_crossing_v1', defaultMap);
  await plain.close();

  await owner.goto(`${regionUrl}&team=dark&render=0`);
  await ready(owner);
  await mate.goto(`${regionUrl}&team=dark&render=0`);
  await ready(mate);
  await page.goto(regionUrl);
  await ready(page);
  await page.waitForTimeout(2500);

  const mapId = await page.evaluate(() => window.__grimm.mapId());
  check('?region=orchard_vale joins the server\'s Orchard Vale room', mapId === 'orchard_vale_v1', mapId);
  const stats = await page.evaluate(() => window.__grimm.stats());
  check('WebGL2 scene is drawn', /WebGL 2/.test(stats.renderer) && stats.drawCalls > 50 && stats.triangles > 100000, `${stats.drawCalls} draw calls, ${stats.triangles} triangles`);
  check('region scenery is placed', stats.scene.props > 250 && stats.scene.cover > 2000, `${stats.scene.props} props, ${stats.scene.dressing} dressing, ${stats.scene.cover} ground cover`);
  const snap = await page.evaluate(() => window.__grimm.snapshot());
  check('eight slots, client seated Light', snap.slots.length === 8 && snap.you.team === 'light', `slot ${snap.you.slot}`);
  const seats = [await owner.evaluate(() => window.__grimm.snapshot().you.slot), await mate.evaluate(() => window.__grimm.snapshot().you.slot)];
  check('two Dark observers seated: the Scout\'s owner and a teammate', seats[0] === 0 && seats[1] >= 1 && seats[1] <= 3, `slots ${seats.join(', ')}`);

  // Park the Scout out of the way while the scenery is toured.
  const scoutId = await owner.evaluate(() => window.__grimm.snapshot().actors.find((a) => a.kind === 'monster' && a.mode !== undefined).id);
  await owner.evaluate((id) => window.__grimm.send({ type: 'monsterOrder', actorId: id, order: 'guard', x: 60, z: -38 }), scoutId);

  // --- Standing on shared terrain; real mouse click on sloping ground ------------------
  const start = await hero();
  const groundAtStart = await page.evaluate(([x, z]) => window.__grimm.height(x, z), [start.sim.x, start.sim.z]);
  check('the hero is drawn standing on the shared ground height', Math.abs(start.rendered.y - groundAtStart) < 0.02, `y ${start.rendered.y.toFixed(3)} vs ground ${groundAtStart.toFixed(3)}`);
  await shot('strategy-west-gate', { rtsDistance: 46 });
  const target = { x: -79, z: 13.5 };
  const pixel = await page.evaluate(([x, z]) => window.__grimm.worldToScreen(x, z), [target.x, target.z]);
  await page.mouse.click(pixel.x, pixel.y);
  await waitIdle();
  const clicked = await hero();
  check('a real mouse click on the terrain orders the hero to that ground point', dist(clicked.sim, target) < 0.6, `asked ${fmt(target)}, arrived ${fmt(clicked.sim)}`);
  const centred = await page.evaluate(() => { const g = window.__grimm; return g.screenPosition(g.snapshot().you.actorId); });
  check('strategy camera follows the hero', Math.hypot(centred.x - 640, centred.y - 360) < 60, `hero on screen at ${centred.x.toFixed(0)}, ${centred.y.toFixed(0)}`);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  const panned = await page.evaluate(() => { const g = window.__grimm; return g.screenPosition(g.snapshot().you.actorId); });
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  const recentred = await page.evaluate(() => { const g = window.__grimm; return g.screenPosition(g.snapshot().you.actorId); });
  check('manual pan moves the view; Space recentres on the hero', panned.x < 560 && Math.hypot(recentred.x - 640, recentred.y - 360) < 60, `panned to x=${panned.x.toFixed(0)}, recentred ${recentred.x.toFixed(0)}, ${recentred.y.toFixed(0)}`);

  // --- Tour: orchard, ford, boundary walk, ruin ------------------------------------
  await walkTo(-60, 22);
  await shot('hero-orchard-lane', { mode: 'hero', yaw: -1.2, pitch: 0.14, distance: 8 });
  await setMode('rts');
  await walkTo(-70, 2);
  await shot('hero-ford-lane', { mode: 'hero', yaw: -0.15, pitch: 0.2, distance: 9 });
  await setMode('rts');
  const south = await hero();
  await walkTo(-64, -20.5);
  const north = await hero();
  check('the ford is a real crossing: the hero walks from the south bank to the north bank', south.sim.z > 0 && dist(north.sim, { x: -64, z: -20.5 }) < 0.3, `${fmt(south.sim)} -> ${fmt(north.sim)}`);
  await walkTo(-58, -39);
  await shot('hero-boundary-walk', { mode: 'hero', yaw: -1.9, pitch: 0.12, distance: 9 });
  await setMode('rts');
  await walkTo(-38, -52.5);
  await shot('hero-old-road-ruin', { mode: 'hero', yaw: 1.2, pitch: 0.14, distance: 8 });
  await shot('strategy-ruin-and-oldwood', { focus: [-38, -50], rtsDistance: 52 });
  await page.keyboard.press('Space');

  // --- The lane round the witness tree, then the bridge --------------------------------
  await walkTo(-9, -28);
  await shot('strategy-witness-bend', { focus: [-22, -29], rtsDistance: 56 });
  await page.keyboard.press('Space');
  await walkTo(0, -22);
  const bankY = (await hero()).rendered.y;
  await page.evaluate(() => window.__grimm.send({ type: 'moveTo', x: 0, z: 3 }));
  let crown = -Infinity;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const h = await hero();
    crown = Math.max(crown, h.rendered.y);
    if (!h.moving && i > 4) break;
  }
  await waitIdle();
  const over = await hero();
  check('the stone bridge is walked, not skipped: the hero rises over its crown and arrives on the south bank', dist(over.sim, { x: 0, z: 3 }) < 0.3 && crown > bankY + 0.5, `bank y ${bankY.toFixed(2)}, crown y ${crown.toFixed(2)}`);
  await shot('hero-bridge-from-village', { mode: 'hero', yaw: 0.15, pitch: 0.16, distance: 9 });

  // --- Hero view: the river stops a held key; the camera does not enter a house --------------
  await setMode('rts');
  await walkTo(20, -0.5);
  await setMode('hero');
  await page.evaluate(() => window.__grimm.rig({ yaw: 0, pitch: 0.2, distance: 8 }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await hero();
  await page.waitForTimeout(3200);
  const stopped = await hero();
  await page.waitForTimeout(1500);
  const held = await hero(); // still holding W
  await page.keyboard.up('KeyW');
  // The bank here runs at a slant, so a hero pressed against it slides along it: what matters
  // is that no more ground is gained towards the water.
  // is that it never reaches the water however long the key is held.
  const heldGround = await page.evaluate(([x, z]) => window.__grimm.height(x, z), [held.sim.x, held.sim.z]);
  check('holding W in hero view walks north until the river bank stops the hero short of the water', stopped.sim.z < -2 && held.sim.z > -5.5 && heldGround > -0.75 + 0.3,
    `z -0.5 -> ${stopped.sim.z.toFixed(2)}, then sliding along the bank to ${fmt(held.sim)} on ground y ${heldGround.toFixed(2)} (water y -0.75)`);
  await setMode('rts');
  await walkTo(-9.5, -2.3); // tight against the north wall of a cottage
  await setMode('hero');
  await page.evaluate(() => window.__grimm.rig({ yaw: 0, pitch: 0.2, distance: 9 })); // the camera's place would be inside the cottage
  await page.waitForTimeout(2500);
  const cam = await page.evaluate(() => window.__grimm.camera());
  const here = await hero();
  const pulled = Math.hypot(cam.position[0] - here.sim.x, cam.position[2] - here.sim.z);
  check('hero camera pulls in rather than clipping into the cottage behind the hero', pulled < 3.2 && cam.position[2] < -1.1, `camera ${pulled.toFixed(2)} m behind the hero at z=${cam.position[2].toFixed(2)} (wall at z=-1.1)`);
  await page.screenshot({ path: shotPath('hero-camera-against-wall') });

  // --- Village, terraces, mill -------------------------------------------------------
  await setMode('rts');
  await walkTo(-3, 9);
  await shot('hero-village-square', { mode: 'hero', yaw: 0.5, pitch: 0.12, distance: 8 });
  const overview = await shot('strategy-village-overview', { focus: [0, 6], rtsDistance: 70 });
  await shot('strategy-terrace-orchard', { focus: [-20, 38], rtsDistance: 60 });
  await page.keyboard.press('KeyG');
  await shot('strategy-collision-debug', { focus: [0, 6], rtsDistance: 70 });
  await page.keyboard.press('KeyG');
  await page.keyboard.press('Space');
  await walkTo(3, 37.5);
  const terrace = await hero();
  check('the orchard lane climbs the terrace ramp: the hero ends about a metre higher', terrace.rendered.y > over.rendered.y + 0.8, `y ${over.rendered.y.toFixed(2)} -> ${terrace.rendered.y.toFixed(2)}`);
  await shot('hero-terrace-view', { mode: 'hero', yaw: 2.6, pitch: 0.16, distance: 9 });
  await setMode('rts');
  await walkTo(62, 17.5);
  await shot('strategy-mill', { focus: [63, 9], rtsDistance: 50 });
  const heroView = await shot('hero-mill-yard', { mode: 'hero', yaw: -0.6, pitch: 0.14, distance: 9 });
  await setMode('rts');
  await page.keyboard.press('Space');

  // --- The M1 hunt, here ---------------------------------------------------------------
  // The owner posts the Scout in the square with a real order; the hero walks up the bridge road in the open.
  await owner.evaluate((id) => window.__grimm.send({ type: 'monsterOrder', actorId: id, order: 'guard', x: 0, z: 9 }), scoutId);
  await walkTo(14, 9.5); // behind the cottage wall east of the square
  await owner.waitForFunction((id) => {
    const m = window.__grimm.snapshot().actors.find((a) => a.id === id);
    return m && Math.hypot(m.x, m.z - 9) < 1.5 && !m.moving;
  }, scoutId, { timeout: 120000, polling: 250 });
  await page.evaluate(() => window.__grimm.send({ type: 'moveTo', x: 0, z: 0.5 }));
  await page.waitForFunction(() => window.__grimm.snapshot().you.spotted, null, { timeout: 60000, polling: 100 });
  await page.screenshot({ path: shotPath('hunt-light-spotted') });
  const heroId = await page.evaluate(() => window.__grimm.snapshot().you.actorId);
  // (The teammate's seat owns the Brute, so it may see THAT monster's state; the Scout's is the owner's alone.)
  const seen = async (p) => p.evaluate(([id, scout]) => {
    const s = window.__grimm.snapshot();
    return { sightings: s.evidence.filter((e) => e.kind === 'sighting').length, hero: s.actors.some((a) => a.id === id), scoutMode: s.actors.find((a) => a.id === scout)?.mode ?? null };
  }, [heroId, scoutId]);
  await owner.waitForFunction(() => window.__grimm.snapshot().evidence.some((e) => e.kind === 'sighting'), null, { timeout: 20000, polling: 100 });
  await mate.waitForFunction(() => window.__grimm.snapshot().evidence.some((e) => e.kind === 'sighting'), null, { timeout: 20000, polling: 100 });
  const o = await seen(owner);
  const m = await seen(mate);
  check('confirmed sighting reaches every Dark seat as an alert (D-012)', o.sightings >= 1 && m.sightings >= 1, `owner ${o.sightings}, teammate ${m.sightings}`);
  check('live vision stays with the Scout\'s owner: the teammate is not sent the hero or the Scout\'s state', o.hero && o.scoutMode === 'chase' && !m.hero && m.scoutMode === null, `owner sees hero=${o.hero} mode=${o.scoutMode}; teammate sees hero=${m.hero} mode=${m.scoutMode}`);
  const lightView = await page.evaluate(() => { const s = window.__grimm.snapshot(); return { evidence: s.evidence.length, modes: s.actors.filter((a) => a.mode !== undefined).length }; });
  check('the Light client is sent no Dark evidence and no monster state', lightView.evidence === 0 && lightView.modes === 0);

  // Escape: round the cottage, along the bank behind the roadside hedge, over the ford.
  let searching = false;
  const poll = async () => { searching ||= (await seen(owner)).scoutMode === 'search'; };
  for (const [x, z] of [[-16, -2.6], [-31, 3.6], [-66, -26]]) {
    await page.evaluate(([x, z]) => window.__grimm.send({ type: 'moveTo', x, z }), [x, z]);
    for (let i = 0; i < 400; i++) {
      await page.waitForTimeout(150);
      await poll();
      const h = await hero();
      if (!h.moving && i > 3) break;
    }
  }
  await page.screenshot({ path: shotPath('hunt-light-escaped-over-the-ford') });
  for (let i = 0; i < 200 && !searching; i++) {
    await page.waitForTimeout(250);
    await poll();
  }
  const after = await hero();
  check('breaking line of sight shakes the Scout: it ends up searching and the hero is no longer spotted', searching && !after.spotted, `searching seen=${searching}, spotted=${after.spotted}`);

  // --- Performance, as measured here ----------------------------------------------------
  const final = await page.evaluate(() => window.__grimm.stats());
  console.log(`info  renderer: ${final.gpu}`);
  console.log(`info  strategy view over the village: ${overview.fps.toFixed(1)} fps, ${overview.drawCalls} draw calls, ${overview.triangles} triangles (shadow pass included)`);
  console.log(`info  hero view in the mill yard: ${heroView.fps.toFixed(1)} fps, ${heroView.drawCalls} draw calls, ${heroView.triangles} triangles`);
  console.log(`info  GPU objects: ${final.geometries} geometries, ${final.textures} textures, ${final.programs} shader programs; JS heap ${final.jsHeapMb ?? '?'} MB; ${final.snapshots} snapshots received`);
  console.log(`info  triangles by layer before culling: ${Object.entries(final.scene).filter(([k]) => k.startsWith('tris_')).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k.slice(5)} ${Math.round(v)}`).join(', ')}`);
  check('no browser console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (error) {
  check('orchard vale check ran to completion', false, error.message);
  await page.screenshot({ path: shotPath('check-failure') }).catch(() => {});
  if (problems.length) console.log('console errors:', problems.slice(0, 5).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} Orchard Vale browser checks passed`);
process.exit(failed.length ? 1 : 0);
