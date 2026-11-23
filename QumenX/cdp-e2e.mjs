// End-to-end test: drive the real Tauri app via CDP through its native IPC.
import fs from 'node:fs';

const port = 9222;
const testVideo = 'D:\\OpenCode Projects\\AppDevelopment\\QumenX\\test-input.mp4';
const outFile = 'C:\\Users\\Gamer\\AppData\\Local\\Temp\\capcut-e2e-export.mp4';
const projectFile = 'C:\\Users\\Gamer\\AppData\\Local\\Temp\\capcut-e2e-project.json';

async function main() {
  // Wait for CDP
  let targets = [];
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/json/list`);
      targets = await res.json();
      if (targets.some(t => t.type === 'page')) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  const page = targets.find(t => t.type === 'page' && t.url.includes('5173')) || targets.find(t => t.type === 'page');
  if (!page) throw new Error('No page target; targets=' + JSON.stringify(targets));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(JSON.stringify(msg.params.exceptionDetails?.text || msg.params));
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') consoleErrors.push(msg.params.entry.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map(a => a.value || a.description).join(' '));
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const send = (method, params = {}) => new Promise(resolve => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Log.enable');
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('Eval exception: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };

  // Wait for the React app to mount
  for (let i = 0; i < 60; i++) {
    const n = await evaluate(`document.querySelectorAll('*').length`);
    if (n > 10) break;
    await new Promise(r => setTimeout(r, 500));
  }

  const results = {};
  results.initial = await evaluate(`JSON.stringify({title:document.title, isTauri:typeof window.__TAURI_INTERNALS__!=='undefined', domNodes:document.querySelectorAll('*').length})`);

  // 1. ffmpeg_probe
  results.probe = await evaluate(`(async()=>{try{const r=await window.__TAURI_INTERNALS__.invoke('ffmpeg_probe',{path:${JSON.stringify(testVideo)}});return JSON.stringify(r)}catch(e){return 'ERROR: '+e}})()`);

  // 2. ffmpeg_capabilities
  results.capabilities = await evaluate(`(async()=>{try{const r=await window.__TAURI_INTERNALS__.invoke('ffmpeg_capabilities',{});return JSON.stringify(r)}catch(e){return 'ERROR: '+e}})()`);

  // 3. ffmpeg_thumbnail
  results.thumbnail = await evaluate(`(async()=>{try{const r=await window.__TAURI_INTERNALS__.invoke('ffmpeg_thumbnail',{path:${JSON.stringify(testVideo)},time:0.5,width:240});return JSON.stringify(r)}catch(e){return 'ERROR: '+e}})()`);

  // 4. project_save + project_open round trip
  results.projectRoundTrip = await evaluate(`(async()=>{
    try{
      const proj={id:'e2e-1',name:'E2E Test',createdAt:1,updatedAt:1,settings:{id:'settings',aspectRatio:'16:9',fps:30,resolution:'480p',codec:'h264',audioBitrate:128,crf:23},assets:[{id:'a1',name:'test-input.mp4',type:'video',path:${JSON.stringify(testVideo)},duration:2,width:854,height:480,fps:30,size:76033,dateAdded:1}],tracks:[{id:'t1',name:'Video 1',type:'video',visible:true,locked:false,muted:false,order:0,height:70}],clips:[{id:'c1',trackId:'t1',assetId:'a1',name:'clip',start:0,duration:2,sourceOffset:0,speed:1,transform:{position:{x:0,y:0},scale:1,rotation:0,opacity:1},opacity:1,keyframes:[],effects:[],muted:false,volume:1,zIndex:0}],markers:[],version:1};
      const pj=${JSON.stringify(projectFile)};
      const saved=await window.__TAURI_INTERNALS__.invoke('project_save',{project_json:JSON.stringify(proj),file_path:pj});
      const opened=await window.__TAURI_INTERNALS__.invoke('project_open',{file_path:pj});
      const back=JSON.parse(opened);
      return JSON.stringify({saved, openName:back.name, clips:back.clips.length, assetPath:back.assets[0].path});
    }catch(e){return 'ERROR: '+e}
  })()`);

  // 5. Real FFmpeg export via native IPC
  results.export = await evaluate(`(async()=>{
    try{
      const proj={id:'e2e-1',name:'E2E Test',createdAt:1,updatedAt:1,settings:{id:'settings',aspectRatio:'16:9',fps:30,resolution:'480p',codec:'h264',audioBitrate:128,crf:23},assets:[{id:'a1',name:'test-input.mp4',type:'video',path:${JSON.stringify(testVideo)},duration:2,width:854,height:480,fps:30,size:76033,dateAdded:1}],tracks:[{id:'t1',name:'Video 1',type:'video',visible:true,locked:false,muted:false,order:0,height:70}],clips:[{id:'c1',trackId:'t1',assetId:'a1',name:'clip',start:0,duration:2,sourceOffset:0,speed:1,transform:{position:{x:0,y:0},scale:1,rotation:0,opacity:1},opacity:1,keyframes:[],effects:[],muted:false,volume:1,zIndex:0}],markers:[],version:1};
      const r=await window.__TAURI_INTERNALS__.invoke('ffmpeg_export',{project_json:JSON.stringify(proj),output_path:${JSON.stringify(outFile)}});
      return JSON.stringify(r);
    }catch(e){return 'ERROR: '+e}
  })()`);

  results.consoleErrors = consoleErrors;
  console.log('=== E2E RESULTS ===');
  for (const [k, v] of Object.entries(results)) console.log(k + ': ' + v);
  ws.close();
}
main().catch(e => { console.error('E2E FAILED:', e); process.exit(1); });
