let data;
const output = document.querySelector('#output');
const status = document.querySelector('#status');
async function refresh() {
  try {
    const [session, layout, defaults] = await Promise.all([
      chrome.storage.session.get('events'), chrome.sidePanel.getLayout(), chrome.sidePanel.getOptions({})
    ]);
    data = { capturedAt: new Date().toISOString(), extensionVersion: chrome.runtime.getManifest().version, userAgent: navigator.userAgent, layout, defaults, events: session.events ?? [] };
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) { status.textContent = error.message; }
}
document.querySelector('#refresh').addEventListener('click', refresh);
document.querySelector('#copy').addEventListener('click', async () => {
  try { await refresh(); await navigator.clipboard.writeText(JSON.stringify(data, null, 2)); status.textContent = '已复制。'; }
  catch { status.textContent = '请直接选择下方 JSON 并复制。'; }
});
refresh();
