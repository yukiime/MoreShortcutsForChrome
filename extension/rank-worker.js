import { rankFrequentSites } from './frequent-sites.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, sites: rankFrequentSites(data.items) }); }
  catch { self.postMessage({ id: data.id, error: true }); }
};
