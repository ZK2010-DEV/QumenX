(async () => {
  try {
    const r = await window.__TAURI_INTERNALS__.invoke('ffmpeg_probe', { path: 'D:\\OpenCode Projects\\AppDevelopment\\QumenX\\test-input.mp4' });
    return JSON.stringify(r);
  } catch (e) {
    return 'ERROR: ' + e;
  }
})()
