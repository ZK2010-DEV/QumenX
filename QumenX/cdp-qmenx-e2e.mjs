// QumenX end-to-end suite: drives the real Tauri app over CDP, runs real
// FFmpeg exports and verifies them with ffprobe.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const port = 9222;
const root = 'D:\\OpenCode Projects\\AppDevelopment\\QumenX';
const tmp = 'C:\\Users\\Gamer\\AppData\\Local\\Temp\\qumenx-e2e';
fs.mkdirSync(tmp, { recursive: true });

const video = path.join(root, 'test-input.mp4');
const video2 = path.join(root, 'test-second.mp4');
const audio = path.join(root, 'test-audio.wav');
const image = path.join(root, 'desktop-screenshot.png');

function asset(id, type, file, duration = 3, extra = {}) {
  return {
    id, name: path.basename(file), type, path: file,
    duration, width: type === 'audio' ? 0 : 640, height: type === 'audio' ? 0 : 360,
    fps: type === 'image' ? 0 : 30, size: fs.statSync(file).size,
    dateAdded: 1, hasAudio: type === 'audio' || (type === 'video' && id === 'v1'),
    ...extra,
  };
}
function clip(o) {
  return {
    id: o.id, trackId: o.trackId, assetId: o.assetId || '', name: o.name || o.id,
    start: o.start ?? 0, duration: o.duration ?? 2, sourceOffset: o.sourceOffset ?? 0,
    speed: o.speed ?? 1,
    transform: o.transform || { position: { x: 0, y: 0 }, scale: 1, rotation: 0, opacity: 1 },
    opacity: o.opacity ?? 1, keyframes: o.keyframes || [], effects: o.effects || [],
    muted: o.muted ?? false, volume: o.volume ?? 1, zIndex: o.zIndex ?? 0,
    transitionIn: o.transitionIn, transitionOut: o.transitionOut,
    fadeIn: o.fadeIn, fadeOut: o.fadeOut, audioFadeIn: o.audioFadeIn,
    audioFadeOut: o.audioFadeOut, text: o.text,
    freeze: o.freeze, groupId: o.groupId,
  };
}
function project(o = {}) {
  return {
    id: o.id || 'qumenx-e2e', name: o.name || 'E2E', createdAt: 1, updatedAt: 1,
    settings: {
      id: 'settings', aspectRatio: '16:9', fps: 30, resolution: '480p',
      codec: 'h264', audioBitrate: 128, crf: 26, ...(o.settings || {}),
    },
    assets: o.assets || [], tracks: o.tracks || [], clips: o.clips || [],
    markers: [], version: 2,
  };
}
const vtrack = { id: 'tv', name: 'Video 1', type: 'video', visible: true, locked: false, muted: false, order: 0, height: 70 };
const otrack = { id: 'to', name: 'Overlay 1', type: 'overlay', visible: true, locked: false, muted: false, order: 1, height: 64 };
const atrack = { id: 'ta', name: 'Audio 1', type: 'audio', visible: true, locked: false, muted: false, order: 2, height: 48 };
const ttrack = { id: 'tt', name: 'Text 1', type: 'text', visible: true, locked: false, muted: false, order: 3, height: 56 };

function probe(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name,width,height',
    '-show_entries', 'format=duration,size',
    '-of', 'json', file,
  ], { encoding: 'utf8' });
  return JSON.parse(out);
}

function frameHash(file, time) {
  const out = execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-ss', String(time),
    '-frames:v', '1', '-f', 'md5', '-',
  ], { encoding: 'utf8' });
  return (out.match(/MD5=([0-9a-f]+)/) || [])[1] || '';
}

// Lossy codecs can make two identical source frames decode with different MD5s.
// Compare held frames perceptually instead; a freeze should be ~1.0 SSIM while
// real motion is visibly lower.
function frameSimilarity(file, timeA, timeB) {
  const images = [['a', timeA], ['b', timeB]].map(([name, time]) => {
    const image = path.join(tmp, `similarity-${name}.png`);
    execFileSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', file,
      '-ss', String(time), '-frames:v', '1', image,
    ]);
    return image;
  });
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-i', images[0], '-i', images[1],
    '-lavfi', '[0:v][1:v]ssim', '-frames:v', '1', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const text = `${r.stdout || ''}\n${r.stderr || ''}`;
  const match = text.match(/All:([\d.]+)/);
  return match ? Number(match[1]) : NaN;
}

function cropYavg(file, time, w = 32, h = 32, x = 0, y = 0) {
  const out = execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-ss', String(time),
    '-vf', `crop=${w}:${h}:${x}:${y},signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`,
    '-frames:v', '1', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const match = out.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return match ? Number(match[1]) : NaN;
}

function clipStart(clips, id) {
  return clips.find(c => c.id === id)?.start;
}
function clipDuration(clips, id) {
  return clips.find(c => c.id === id)?.duration;
}

function projectSignature(p) {
  return {
    id: p.id,
    name: p.name,
    settings: {
      aspectRatio: p.settings?.aspectRatio, fps: p.settings?.fps,
      resolution: p.settings?.resolution, codec: p.settings?.codec,
    },
    assets: (p.assets || []).map(a => ({ id: a.id, type: a.type, path: a.path, duration: a.duration })),
    tracks: (p.tracks || []).map(t => ({ id: t.id, type: t.type, name: t.name, order: t.order })),
    clips: (p.clips || []).map(c => ({
      id: c.id, trackId: c.trackId, assetId: c.assetId, start: c.start,
      duration: c.duration, sourceOffset: c.sourceOffset, speed: c.speed,
      opacity: c.opacity, volume: c.volume,
      keyframes: (c.keyframes || []).map(k => ({ property: k.property, time: k.time, value: k.value })),
      effects: (c.effects || []).map(e => ({ kind: e.kind, value: e.value, enabled: e.enabled })),
      freeze: c.freeze, transitionIn: c.transitionIn, text: c.text?.text,
    })),
  };
}

async function connect() {
  let targets = [];
  let page = null;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/json/list`);
      targets = await r.json();
      page = targets.find(t => t.type === 'page' && t.url.includes('5173') && t.title && t.title !== 'about:blank')
        || targets.find(t => t.type === 'page' && t.url.includes('5173'));
      if (page) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!page) {
    const seen = targets.map(t => `${t.type}:${t.title || ''}:${t.url || ''}`).join(' | ');
    throw new Error(`No QumenX CDP page target on port ${port}. Seen: ${seen || 'none'}`);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onclose = ev => {
    try { fs.appendFileSync(path.join(tmp, 'live-log.txt'), `CDP CLOSED code=${ev.code} reason=${ev.reason}\n`); } catch {}
  };
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.text || 'exception');
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
      errors.push(msg.params.args.map(a => a.value || a.description).join(' '));
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    const timer = setTimeout(() => {
      if (pending.delete(i)) rej(new Error(`CDP timeout: ${method}`));
    }, 30000);
    pending.set(i, msg => { clearTimeout(timer); res(msg); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  return { ws, evaluate, errors };
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  console.log(line);
  try { fs.appendFileSync(path.join(tmp, 'live-log.txt'), line + '\n'); } catch {}
}

async function main() {
  try { fs.writeFileSync(path.join(tmp, 'live-log.txt'), ''); } catch {}
  const { ws, evaluate, errors } = await connect();
  let ready = null;
  for (let i = 0; i < 60; i++) {
    const raw = await evaluate(`JSON.stringify({
      nodes: document.querySelectorAll('*').length,
      title: document.title,
      tauri: typeof window.__TAURI_INTERNALS__ !== 'undefined',
      stores: !!window.__QUMENX_STORES__,
    })`);
    const snapshot = JSON.parse(raw);
    if (snapshot.nodes > 10 && snapshot.tauri && snapshot.stores) {
      ready = snapshot;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!ready) throw new Error('QumenX page did not become ready (native IPC or dev store hook missing)');
  fs.appendFileSync(path.join(tmp, 'live-log.txt'), `READY ${JSON.stringify(ready)}\n`);
  const invoke = (cmd, args) => evaluate(
    `(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)},${JSON.stringify(args)})}}catch(e){return {ok:false,error:String(e)}}})()`
  );
  const exportProject = async (pj, name) => {
    const out = path.join(tmp, `${name}.mp4`);
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const r = await invoke('ffmpeg_export', { project_json: JSON.stringify(pj), output_path: out });
    if (!r.ok || !r.value) throw new Error(r.error || 'export returned no result');
    return { out, info: probe(out) };
  };
  const summarize = info => ({
    duration: Number(info.format.duration).toFixed(2),
    streams: info.streams.map(s => `${s.codec_type}:${s.codec_name}${s.width ? ':' + s.width + 'x' + s.height : ''}`),
    bytes: Number(info.format.size),
  });

  // TEST 1 — import, trim, export -------------------------------------------
  try {
    const p = project({
      assets: [asset('v1', 'video', video)],
      tracks: [vtrack],
      clips: [clip({ id: 'c1', trackId: 'tv', assetId: 'v1', duration: 1.5, sourceOffset: 0.5 })],
    });
    const { info } = await exportProject(p, 'test1-trim');
    const d = Number(info.format.duration);
    record('TEST 1 import/trim/export', d > 1.2 && d < 2.0 && info.streams.some(s => s.codec_type === 'video'), summarize(info));
  } catch (e) { record('TEST 1 import/trim/export', false, String(e)); }

  // TEST 2 — two videos + transition + export -------------------------------
  try {
    const p = project({
      assets: [asset('v1', 'video', video), asset('v2', 'video', video2)],
      tracks: [vtrack],
      clips: [
        clip({ id: 'c1', trackId: 'tv', assetId: 'v1', start: 0, duration: 1.5 }),
        clip({ id: 'c2', trackId: 'tv', assetId: 'v2', start: 1.5, duration: 1.5, transitionIn: { kind: 'fade', duration: 0.4 } }),
      ],
    });
    const { info } = await exportProject(p, 'test2-transition');
    const d = Number(info.format.duration);
    record('TEST 2 two clips + transition', d > 2.6 && d < 3.4, summarize(info));
  } catch (e) { record('TEST 2 two clips + transition', false, String(e)); }

  // TEST 3 — video + music, volume keyframes, fades, export -----------------
  try {
    const p = project({
      assets: [asset('v1', 'video', video), asset('a1', 'audio', audio)],
      tracks: [vtrack, atrack],
      clips: [
        clip({ id: 'c1', trackId: 'tv', assetId: 'v1', duration: 3 }),
        clip({
          id: 'c2', trackId: 'ta', assetId: 'a1', duration: 3, volume: 0.6,
          audioFadeIn: 0.4, audioFadeOut: 0.4,
          keyframes: [
            { id: 'k1', property: 'volume', time: 0, value: 0.2, easing: 'linear' },
            { id: 'k2', property: 'volume', time: 2.5, value: 0.9, easing: 'easeInOut' },
          ],
        }),
      ],
    });
    const { info } = await exportProject(p, 'test3-audio');
    record('TEST 3 audio sync/volume/fades', info.streams.some(s => s.codec_type === 'audio'), summarize(info));
  } catch (e) { record('TEST 3 audio sync/volume/fades', false, String(e)); }

  // TEST 4 — text styling + animation + export ------------------------------
  try {
    const text = {
      text: 'Hello QumenX', fontFamily: 'Arial', fontSize: 56, fontWeight: 700,
      color: '#ffffff', align: 'center', outlineWidth: 2, outlineColor: '#000000',
      shadow: true, shadowColor: '#000000', background: true,
      backgroundColor: '#101010', backgroundPadding: 10, letterSpacing: 3,
      lineSpacing: 1.2, animation: 'fadeIn', animationDuration: 0.5,
    };
    const p = project({
      assets: [asset('i1', 'image', image)],
      tracks: [otrack, ttrack],
      clips: [
        clip({ id: 'c1', trackId: 'to', assetId: 'i1', duration: 2 }),
        clip({ id: 'c2', trackId: 'tt', start: 0.2, duration: 1.6, text }),
      ],
    });
    const { info } = await exportProject(p, 'test4-text');
    record('TEST 4 text styling/export', Number(info.format.duration) > 1.4 && info.streams.some(s => s.codec_type === 'video'), summarize(info));
  } catch (e) { record('TEST 4 text styling/export', false, String(e)); }

  // TEST 5 — keyframed transform + effects + export -------------------------
  try {
    const p = project({
      assets: [asset('v1', 'video', video)],
      tracks: [vtrack],
      clips: [clip({
        id: 'c1', trackId: 'tv', assetId: 'v1', duration: 2, opacity: 0.8,
        effects: [{ id: 'e1', kind: 'saturation', value: 0.25, enabled: true }],
        keyframes: [
          { id: 'k1', property: 'scale', time: 0, value: 0.6, easing: 'linear' },
          { id: 'k2', property: 'scale', time: 1.9, value: 1.1, easing: 'easeInOut' },
          { id: 'k3', property: 'positionX', time: 0, value: -80, easing: 'linear' },
          { id: 'k4', property: 'positionX', time: 1.9, value: 80, easing: 'linear' },
          { id: 'k5', property: 'opacity', time: 0, value: 0.2, easing: 'linear' },
          { id: 'k6', property: 'opacity', time: 1.9, value: 1, easing: 'linear' },
        ],
      })],
    });
    const { info } = await exportProject(p, 'test5-keyframes');
    record('TEST 5 keyframed animation/export', Number(info.format.duration) > 1.7 && info.streams.some(s => s.codec_type === 'video'), summarize(info));
  } catch (e) { record('TEST 5 keyframed animation/export', false, String(e)); }

  // TEST 6 — save, backup, corrupt, recover, restore ------------------------
  try {
    const pj = path.join(tmp, 'project.json');
    const p1 = project({ id: 'backup-test', name: 'Backup Test', assets: [asset('v1', 'video', video)], tracks: [vtrack], clips: [clip({ id: 'c1', trackId: 'tv', assetId: 'v1', duration: 1 })] });
    const p2 = { ...p1, name: 'Backup Test 2', updatedAt: 2 };
    const mark = m => fs.appendFileSync(path.join(tmp, 'live-log.txt'), `  T6: ${m}\n`);
    mark('save1');
    const s1 = await invoke('project_save', { project_json: JSON.stringify(p1), file_path: pj });
    mark('save2');
    const s2 = await invoke('project_save', { project_json: JSON.stringify(p2), file_path: pj });
    mark('list backups');
    const backups = await invoke('project_list_backups', { file_path: pj });
    mark('corrupt file');
    fs.writeFileSync(pj, '{ this is not valid json');
    mark('open corrupted');
    const opened = await invoke('project_open', { file_path: pj });
    const parsed = JSON.parse(opened.value);
    // The automatic backup taken by the second save contains the previous
    // good version ("Backup Test"); that is exactly what recovery should use.
    const recovered = !!parsed.__recoveredFrom && parsed.name === 'Backup Test';
    mark(`opened name=${parsed.name} recoveredFrom=${parsed.__recoveredFrom}`);
    const restore = backups.value?.length
      ? await invoke('project_restore_backup', { backup_path: backups.value[0].path, target_path: pj })
      : { ok: false, error: 'no backups' };
    const afterRestore = await invoke('project_open', { file_path: pj });
    record('TEST 6 save/backup/recovery/restore',
      s1.ok && s2.ok && backups.ok && backups.value.length >= 1 && recovered && restore.ok && JSON.parse(afterRestore.value).name === 'Backup Test',
      { backups: backups.value?.length, recovered, openedName: parsed.name, recoveredFrom: parsed.__recoveredFrom, restoredName: JSON.parse(afterRestore.value).name });
  } catch (e) { record('TEST 6 save/backup/recovery/restore', false, String(e)); }

  // TEST 6b — literal close/reopen restores the entire multi-track timeline --
  try {
    const roundPath = path.join(tmp, 'roundtrip-full.json');
    const full = project({
      id: 'roundtrip-full',
      name: 'Full Timeline Roundtrip',
      assets: [
        asset('rv', 'video', video, 3),
        asset('ra', 'audio', audio, 3),
        asset('ri', 'image', image, 5),
      ],
      tracks: [vtrack, atrack, otrack, ttrack],
      clips: [
        clip({
          id: 'rc-v', trackId: 'tv', assetId: 'rv', duration: 1.8, sourceOffset: 0.3,
          speed: 1.25, opacity: 0.85,
          transform: { position: { x: 12, y: -8 }, scale: 1.1, rotation: 5, opacity: 0.85 },
          keyframes: [
            { id: 'rk1', property: 'scale', time: 0, value: 0.9, easing: 'linear' },
            { id: 'rk2', property: 'scale', time: 1.6, value: 1.2, easing: 'easeInOut' },
            { id: 'rk3', property: 'volume', time: 0, value: 0.3, easing: 'linear' },
          ],
          effects: [{ id: 're1', kind: 'saturation', value: 0.2, enabled: true }],
          freeze: { enabled: true, at: 0.6, duration: 0.4 },
          transitionIn: { kind: 'fade', duration: 0.3 },
        }),
        clip({
          id: 'rc-a', trackId: 'ta', assetId: 'ra', start: 0.4, duration: 1.7,
          volume: 0.55, audioFadeIn: 0.2, audioFadeOut: 0.3,
        }),
        clip({ id: 'rc-i', trackId: 'to', assetId: 'ri', start: 0.2, duration: 1.4, opacity: 0.7 }),
        clip({
          id: 'rc-t', trackId: 'tt', start: 0.5, duration: 1.1,
          text: {
            text: 'Roundtrip Title', fontFamily: 'Arial', fontSize: 48, fontWeight: 700,
            color: '#ffffff', align: 'center', outlineWidth: 1, outlineColor: '#000000',
            shadow: true, shadowColor: '#000000', shadowBlur: 6, background: true,
            backgroundColor: '#101010', backgroundPadding: 8, letterSpacing: 1,
            lineSpacing: 1.2, animation: 'fadeIn', animationDuration: 0.4,
          },
        }),
      ],
    });
    const saveFull = await invoke('project_save', { project_json: JSON.stringify(full), file_path: roundPath });
    const closed = await evaluate(`(() => {
      const s = window.__QUMENX_STORES__?.project;
      if (!s) return { error: 'dev store hook missing' };
      s.getState().setProject({
        id: 'closed', name: 'Closed', createdAt: 1, updatedAt: 1,
        settings: { aspectRatio: '16:9', fps: 30, resolution: '480p', codec: 'h264' },
        assets: [], tracks: [], clips: [], markers: [], version: 2,
      });
      window.__QUMENX_STORES__?.media?.getState().setAssets([]);
      const p = s.getState().project;
      return { tracks: p.tracks.length, clips: p.clips.length };
    })()`);
    const reopened = await evaluate(`(async () => {
      const s = window.__QUMENX_STORES__?.project;
      if (!s) return { error: 'dev store hook missing' };
      const raw = await window.__TAURI_INTERNALS__.invoke('project_open', { file_path: ${JSON.stringify(roundPath)} });
      const loaded = JSON.parse(raw);
      s.getState().setProject({ ...loaded, path: ${JSON.stringify(roundPath)} });
      window.__QUMENX_STORES__?.media?.getState().setAssets(loaded.assets || []);
      return JSON.stringify(s.getState().project);
    })()`);
    const restored = JSON.parse(reopened);
    const expected = JSON.stringify(projectSignature(full));
    const actual = JSON.stringify(projectSignature(restored));
    const ok = saveFull.ok && closed.tracks === 0 && closed.clips === 0
      && restored.path === roundPath && expected === actual;
    record('TEST 6b full timeline close/reopen', ok, {
      saved: saveFull.ok,
      closed,
      reopenedPath: restored.path,
      tracks: restored.tracks?.length,
      clips: restored.clips?.length,
      signatureMatch: expected === actual,
      expected: expected.length,
      actual: actual.length,
    });
  } catch (e) { record('TEST 6b full timeline close/reopen', false, String(e)); }

  // TEST 7 — multi-operation undo / redo ------------------------------------
  try {
    const r = await evaluate(`(async () => {
      const s = window.__QUMENX_STORES__?.project;
      if (!s) return { error: 'dev store hook missing' };
      const before = s.getState().project.clips.length;
      const nav = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Text');
      if (!nav) return { error: 'Text section button missing' };
      nav.click();
      await new Promise(r => setTimeout(r, 80));
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Heading');
      if (!btn) return { error: 'text preset button missing' };
      btn.click();
      const afterAdd = s.getState().project.clips.length;
      btn.click();
      const afterSecondAdd = s.getState().project.clips.length;
      const byTitle = t => [...document.querySelectorAll('button')].find(b => (b.title || '').includes(t));
      const tick = () => new Promise(r => setTimeout(r, 80));
      await tick();
      const undo = byTitle('Undo');
      const redo = byTitle('Redo');
      if (!undo || !redo) return { error: 'undo/redo buttons missing' };
      const diag = { undoTitle: undo.title, undoDisabled: undo.disabled, redoDisabled: redo.disabled, past: s.getState().history.past.length, future: s.getState().history.future.length };
      byTitle('Undo').click(); await tick(); const afterUndo1 = s.getState().project.clips.length;
      byTitle('Undo').click(); await tick(); const afterUndo2 = s.getState().project.clips.length;
      byTitle('Redo').click(); await tick(); const afterRedo1 = s.getState().project.clips.length;
      byTitle('Redo').click(); await tick(); const afterRedo2 = s.getState().project.clips.length;
      s.getState().clearHistory();
      return { before, afterAdd, afterSecondAdd, afterUndo1, afterUndo2, afterRedo1, afterRedo2, diag };
    })()`);
    const ok = r && !r.error && r.afterAdd === r.before + 1 && r.afterSecondAdd === r.before + 2 &&
      r.afterUndo1 === r.before + 1 && r.afterUndo2 === r.before &&
      r.afterRedo1 === r.before + 1 && r.afterRedo2 === r.before + 2;
    record('TEST 7 undo/redo consistency', ok, r);
  } catch (e) { record('TEST 7 undo/redo consistency', false, String(e)); }

  // TEST 8 — mid-clip freeze produces a real held frame --------------------
  try {
    const at = 0.5;
    const hold = 0.6;
    const p = project({
      assets: [asset('v1', 'video', video)],
      tracks: [vtrack],
      clips: [clip({
        id: 'cf', trackId: 'tv', assetId: 'v1', duration: 1.8,
        freeze: { enabled: true, at, duration: hold },
      })],
    });
    const { out, info } = await exportProject(p, 'test8-freeze');
    const inHoldA = frameHash(out, at + 0.1);
    const inHoldB = frameHash(out, at + hold - 0.1);
    const afterHold = frameHash(out, at + hold + 0.25);
    const holdSsim = frameSimilarity(out, at + 0.1, at + hold - 0.1);
    const motionSsim = frameSimilarity(out, at + 0.1, at + hold + 0.25);
    const ok = Number(info.format.duration) > 1.6 && Number(info.format.duration) < 2.0
      && inHoldA.length === 32 && inHoldB.length === 32 && afterHold.length === 32
      && holdSsim > 0.99 && motionSsim < 0.98;
    record('TEST 8 freeze hold/export', ok, {
      ...summarize(info), inHoldA, inHoldB, afterHold,
      holdSsim: Number(holdSsim.toFixed(5)), motionSsim: Number(motionSsim.toFixed(5)),
    });
  } catch (e) { record('TEST 8 freeze hold/export', false, String(e)); }

  // TEST 9 — static scale shrinks into a transparent canvas -----------------
  try {
    const scaledSource = path.join(tmp, 'scale-source.mp4');
    execFileSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
      '-i', 'color=c=blue:s=640x360:d=2',
      '-vf', 'drawbox=x=160:y=100:w=320:h=160:color=red:t=fill',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', scaledSource,
    ]);
    const baseAsset = asset('sv', 'video', scaledSource, 2, { width: 640, height: 360 });
    const make = (scale, name) => project({
      assets: [baseAsset],
      tracks: [vtrack],
      clips: [clip({
        id: 'cs', trackId: 'tv', assetId: 'sv', duration: 1.5,
        transform: { position: { x: 0, y: 0 }, scale, rotation: 0, opacity: 1 },
      })],
    });
    const full = await exportProject(make(1, 'full'), 'test9-scale-full');
    const half = await exportProject(make(0.5, 'half'), 'test9-scale-half');
    const yFull = cropYavg(full.out, 0.5);
    const yHalf = cropYavg(half.out, 0.5);
    const fullDim = full.info.streams.find(s => s.codec_type === 'video');
    const halfDim = half.info.streams.find(s => s.codec_type === 'video');
    const ok = yHalf < 25 && yFull > 30
      && fullDim?.width === halfDim?.width && fullDim?.height === halfDim?.height;
    record('TEST 9 static scale preview/export parity', ok, {
      yFull, yHalf,
      full: `${fullDim?.width}x${fullDim?.height}`,
      half: `${halfDim?.width}x${halfDim?.height}`,
    });
  } catch (e) { record('TEST 9 static scale preview/export parity', false, String(e)); }

  // TEST 10 — proxy generation is real, cached and actually used in preview --
  try {
    const before = fs.statSync(video);
    const beforeSig = `${before.size}:${before.mtimeMs}`;
    const generated = await invoke('ffmpeg_proxy', { path: video });
    const proxyPath = generated.value?.path;
    const exists = !!proxyPath && fs.existsSync(proxyPath);
    const info = exists ? probe(proxyPath) : null;
    const after = fs.statSync(video);
    const sourceUnchanged = `${after.size}:${after.mtimeMs}` === beforeSig;
    const videoStream = info?.streams.find(s => s.codec_type === 'video');
    const proxyFileOk = generated.ok && exists && proxyPath.includes(`QumenX${path.sep}proxies`)
      && !!videoStream && videoStream.width <= 960
      && !info.streams.some(s => s.codec_type === 'audio') && sourceUnchanged;

    const previewCheck = await evaluate(`(async () => {
      const stores = window.__QUMENX_STORES__;
      if (!stores) return { error: 'dev store hook missing' };
      const asset = {
        id: 'proxy-preview', name: 'proxy.mp4', type: 'video',
        path: ${JSON.stringify(video)}, proxyPath: ${JSON.stringify(proxyPath || '')},
        duration: 3, width: 640, height: 360, fps: 30, size: 1, dateAdded: 1,
        hasAudio: false,
      };
      stores.project.getState().updateSettings({ proxyEnabled: true, previewQuality: 'low' });
      stores.project.getState().setProject({
        ...stores.project.getState().project,
        assets: [asset],
        tracks: [{
          id: 'proxy-track', name: 'Video 1', type: 'video', visible: true,
          locked: false, muted: false, order: 0, height: 64,
        }],
        clips: [{
          id: 'proxy-clip', trackId: 'proxy-track', assetId: asset.id, name: 'proxy',
          start: 0, duration: 2, sourceOffset: 0, speed: 1,
          transform: { position: { x: 0, y: 0 }, scale: 1, rotation: 0, opacity: 1 },
          opacity: 1, keyframes: [], effects: [], muted: false, volume: 1, zIndex: 0,
        }],
      });
      stores.media.getState().setAssets([asset]);
      stores.preview.getState().setCurrentTime(0.2);
      stores.timeline.getState().setPlayheadTime(0.2);
      await new Promise(r => setTimeout(r, 250));
      const el = document.querySelector('video');
      const src = el?.currentSrc || el?.src || '';
      return { count: document.querySelectorAll('video').length, src, usesProxy: decodeURIComponent(src).includes('proxies') };
    })()`);

    record('TEST 10 proxy generation/usage', proxyFileOk && previewCheck.usesProxy === true, {
      generated: generated.ok,
      exists,
      sourceUnchanged,
      proxyStreams: info?.streams.map(s => `${s.codec_type}:${s.codec_name}${s.width ? ':' + s.width + 'x' + s.height : ''}`),
      previewUsesProxy: previewCheck.usesProxy,
      previewSrc: previewCheck.src ? previewCheck.src.slice(0, 160) : '',
      error: previewCheck.error,
    });
  } catch (e) { record('TEST 10 proxy generation/usage', false, String(e)); }

  // TEST 11 — stability: no-op undo, modal shortcut isolation, replay at end --
  try {
    const r = await evaluate(`(async () => {
      const stores = window.__QUMENX_STORES__;
      if (!stores) return { error: 'dev store hook missing' };
      const project = stores.project;
      const preview = stores.preview;
      const workspace = stores.workspace;
      project.getState().clearHistory();
      const clipEl = document.querySelector('[title^="proxy"]');
      if (!clipEl) return { error: 'timeline clip missing' };
      const before = project.getState().history.past.length;
      clipEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
      await new Promise(r => setTimeout(r, 80));
      const afterClick = project.getState().history.past.length;
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 180, clientY: 100 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
      const afterDrag = project.getState().history.past.length;

      preview.getState().setPlaying(false);
      workspace.getState().setShortcutsOpen(true);
      await new Promise(r => setTimeout(r, 80));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
      const playingInModal = preview.getState().isPlaying;
      workspace.getState().setShortcutsOpen(false);
      await new Promise(r => setTimeout(r, 80));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
      const playingOutside = preview.getState().isPlaying;

      preview.getState().setPlaying(false);
      preview.getState().setDuration(2);
      preview.getState().setCurrentTime(2);
      preview.getState().togglePlay();
      const replay = { time: preview.getState().currentTime, playing: preview.getState().isPlaying };
      preview.getState().setPlaying(false);
      project.getState().clearHistory();
      return { before, afterClick, afterDrag, playingInModal, playingOutside, replay };
    })()`);
    record('TEST 11 stability/no-op undo/shortcuts/replay',
      !r?.error && r.before === 0 && r.afterClick === 0 && r.afterDrag === 1 &&
      r.playingInModal === false && r.playingOutside === true &&
      r.replay?.time === 0 && r.replay?.playing === true, r);
  } catch (e) { record('TEST 11 stability/no-op undo/shortcuts/replay', false, String(e)); }

  // TEST 12 — ripple delete/trim, insert, overwrite, close gaps, markers ------
  try {
    const base = project({
      assets: [asset('v1', 'video', video, 1.2), asset('a1', 'audio', audio, 3)],
      tracks: [vtrack, atrack],
      clips: [
        clip({ id: 'c1', trackId: 'tv', assetId: 'v1', start: 0, duration: 1 }),
        clip({ id: 'c2', trackId: 'tv', assetId: 'v1', start: 1, duration: 1 }),
        clip({ id: 'c3', trackId: 'tv', assetId: 'v1', start: 2, duration: 1 }),
        clip({ id: 'a1', trackId: 'ta', assetId: 'a1', start: 0, duration: 3 }),
      ],
    });
    const setup = await evaluate(`(() => {
      const stores = window.__QUMENX_STORES__;
      if (!stores) return { error: 'dev store hook missing' };
      stores.project.getState().setProject(${JSON.stringify(base)});
      stores.media.getState().setAssets(${JSON.stringify(base.assets)});
      stores.project.getState().clearHistory();
      return { clips: stores.project.getState().project.clips.length };
    })()`);
    const opsJson = await evaluate(`(() => {
      const s = window.__QUMENX_STORES__?.project;
      if (!s) return JSON.stringify({ error: 'dev store hook missing' });
      const videoClips = () => s.getState().project.clips
        .filter(c => c.trackId === 'tv')
        .map(c => ({ id: c.id, start: +c.start.toFixed(3), duration: +c.duration.toFixed(3) }))
        .sort((a, b) => a.start - b.start);
      const clipById = id => videoClips().find(c => c.id === id);
      const audioStart = () => s.getState().project.clips.find(c => c.id === 'a1')?.start;

      s.getState().rippleDelete(['c2']);
      const afterRipple = { clips: videoClips(), audio: audioStart() };

      const inserted = s.getState().insertAssetAtPlayhead('v1', 1, 'tv');
      const afterInsert = videoClips();

      const overwritten = s.getState().overwriteAssetAtPlayhead('v1', 1, 'tv');
      const afterOverwrite = videoClips();

      s.getState().rippleTrim('c1', 'right', 0.6);
      const afterTrim = videoClips();

      s.getState().moveClip('c3', 3, 'tv');
      const beforeClose = clipById('c3');
      s.getState().closeGaps('tv');
      const afterClose = videoClips();

      const markerId = s.getState().addMarker(0.5, 'Edit check', '#22d3ee');
      s.getState().setClipColor('c1', '#3b82f6');
      const marker = s.getState().project.markers.find(m => m.id === markerId);
      const color = s.getState().project.clips.find(c => c.id === 'c1')?.colorTag;
      const history = s.getState().history.past.length;
      s.getState().clearHistory();
      return JSON.stringify({
        afterRipple, inserted, afterInsert, overwritten, afterOverwrite,
        afterTrim, beforeClose, afterClose,
        marker: marker ? { time: marker.time, label: marker.label, color: marker.color } : null,
        color, history,
      });
    })()`);
    const ops = JSON.parse(opsJson);
    const finalJson = await evaluate(`JSON.stringify(window.__QUMENX_STORES__.project.getState().project)`);
    const finalProject = JSON.parse(finalJson);
    const { info } = await exportProject(finalProject, 'test12-timeline-editing');
    const ok = setup?.clips === 4 && !ops.error
      && ops.afterRipple.clips.length === 2 && clipStart(ops.afterRipple.clips, 'c3') === 1
      && ops.afterRipple.audio === 0
      && !!ops.inserted && clipStart(ops.afterInsert, ops.inserted) === 1
      && clipStart(ops.afterInsert, 'c3') === 2.2
      && !!ops.overwritten && !ops.afterOverwrite.some(c => c.id === ops.inserted)
      && clipStart(ops.afterOverwrite, ops.overwritten) === 1
      && clipStart(ops.afterTrim, 'c1') === 0 && clipDuration(ops.afterTrim, 'c1') === 0.6
      && clipStart(ops.afterTrim, ops.overwritten) === 0.6 && clipStart(ops.afterTrim, 'c3') === 1.8
      && ops.beforeClose?.start === 3 && clipStart(ops.afterClose, 'c3') === 1.8
      && ops.marker?.time === 0.5 && ops.marker?.label === 'Edit check' && ops.color === '#3b82f6'
      && ops.history > 0 && Number(info.format.duration) > 2.6;
    record('TEST 12 ripple/insert/overwrite/markers', ok, {
      ...ops,
      export: summarize(info),
    });
  } catch (e) { record('TEST 12 ripple/insert/overwrite/markers', false, String(e)); }

  const state = await evaluate(`JSON.stringify({title:document.title, nodes:document.querySelectorAll('*').length, isTauri:typeof window.__TAURI_INTERNALS__!=='undefined'})`);
  record('App health / no runtime errors', errors.length === 0, { state: JSON.parse(state), errors });
  fs.writeFileSync(path.join(tmp, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  ws.close();

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}
main().catch(e => {
  const line = 'SUITE FAILED: ' + (e?.stack || String(e));
  console.error(line);
  try { fs.appendFileSync(path.join(tmp, 'live-log.txt'), line + '\n'); } catch {}
  process.exit(1);
});
