// Verify real FFmpeg export progress events reach the frontend via Tauri IPC.
const port = 9222;
async function main() {
  let targets = [];
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(`http://localhost:${port}/json/list`); targets = await res.json(); if (targets.some(t => t.type === 'page')) break; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  const page = targets.find(t => t.type === 'page' && t.url.includes('5173')) || targets.find(t => t.type === 'page');
  if (!page) throw new Error('No page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const evalJs = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };

  for (let i = 0; i < 60; i++) { if ((await evalJs(`document.querySelectorAll('*').length`)) > 100) break; await new Promise(r => setTimeout(r, 300)); }

  // Register listener + run a real export, collecting every progress event payload.
  const result = await evalJs(`(async () => {
    const T = window.__TAURI_INTERNALS__;
    const events = [];
    let unlisten = () => {};
    try {
      // Mirror @tauri-apps/api/event listen() using Tauri v2 internals directly.
      const handler = T.transformCallback((e) => { events.push(e.payload); }, false);
      const eventId = await T.invoke('plugin:event|listen', {
        event: 'ffmpeg-export-progress',
        target: { kind: 'Any' },
        handler,
      });
      unlisten = async () => { await T.invoke('plugin:event|unlisten', { event: 'ffmpeg-export-progress', eventId }); };
    } catch (e) {
      return JSON.stringify({ error: 'listen failed: ' + e, keys: Object.keys(T).slice(0, 30) });
    }
    const video = ${JSON.stringify(process.env.TEST_VIDEO || 'D:\\OpenCode Projects\\AppDevelopment\\QumenX\\test-input.mp4')};
    const duration = ${JSON.stringify(Number(process.env.TEST_DURATION || 2))};
    const proj = {id:'p',name:'Progress',createdAt:1,updatedAt:1,
      settings:{id:'s',aspectRatio:'16:9',fps:30,resolution:'480p',codec:'h264',audioBitrate:128,crf:23},
      assets:[{id:'a',name:'clip',type:'video',path:video,duration,width:640,height:360,fps:30,size:243765,dateAdded:1}],
      tracks:[{id:'t',name:'V1',type:'video',visible:true,locked:false,muted:false,order:0,height:70}],
      clips:[{id:'c',trackId:'t',assetId:'a',name:'clip',start:0,duration,sourceOffset:0,speed:1,transform:{position:{x:0,y:0},scale:1,rotation:0,opacity:1},opacity:1,keyframes:[],effects:[],muted:false,volume:1,zIndex:0}],
      markers:[],version:1};
    let exportResult;
    try {
      exportResult = await T.invoke('ffmpeg_export', { project_json: JSON.stringify(proj), output_path: 'C:\\\\Users\\\\Gamer\\\\AppData\\\\Local\\\\Temp\\\\capcut-progress-test.mp4' });
    } catch (e) { return JSON.stringify({ error: 'export failed: ' + e, events }); }
    // Give the final 'done' event a moment to arrive.
    await new Promise(r => setTimeout(r, 300));
    unlisten();
    return JSON.stringify({ exportResult, eventCount: events.length, events: events.slice(0, 12), last: events[events.length - 1] });
  })()`);
  console.log(result);
  ws.close();
}
main().catch(e => { console.error('PROGRESS TEST FAILED:', e); process.exit(1); });
