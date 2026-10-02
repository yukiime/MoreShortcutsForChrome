// A real Worker performs history aggregation, matching the WORKERS reason.
let worker, counter = 0;
const jobs = new Map();
function startWorker() {
  worker = new Worker('rank-worker.js', { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id); if (!job) return;
    jobs.delete(data.id); clearTimeout(job.timer);
    if (data.error) job.reject(new Error('历史计算失败。')); else job.resolve(data.sites);
  };
  worker.onerror = () => {
    for (const job of jobs.values()) { clearTimeout(job.timer); job.reject(new Error('历史计算失败。')); }
    jobs.clear(); worker.terminate(); worker = null;
  };
}
startWorker();
window.requestAutoOpen = requestId => chrome.runtime.sendMessage({ type: 'auto:gesture', requestId });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'offscreen:rank' || sender.id !== chrome.runtime.id ||
      (sender.url && sender.url !== chrome.runtime.getURL('worker.js'))) return false;
  if (!worker) startWorker();
  const id = ++counter;
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { jobs.delete(id); reject(new Error('历史计算超时。')); }, 15000);
    jobs.set(id, { resolve, reject, timer }); worker.postMessage({ id, items: message.items });
  }).then(sites => respond({ ok: true, sites }), () => respond({ ok: false }));
  return true;
});
