const form = document.querySelector('#download-form');
const input = document.querySelector('#media-url');
const toast = document.querySelector('#toast');
const showToast = (message) => { toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 5000); };
const inspectionMessage = (result) => {
  if (result.provider === 'facebook' || result.platform === 'Facebook') return 'Facebook link recognized. Direct Facebook video and Reel downloads are not currently supported.';
  return result.message || `${result.platform || 'This platform'} link recognized. Direct downloads are not currently supported.`;
};
document.querySelector('#clear-btn').addEventListener('click', () => { input.value = ''; input.focus(); });
document.querySelector('#paste-btn').addEventListener('click', async () => { try { input.value = await navigator.clipboard.readText(); input.focus(); } catch { showToast('Clipboard access is unavailable. Paste the link manually.'); } });
document.querySelector('.menu-toggle').addEventListener('click', (event) => { const button = event.currentTarget; const menu = document.querySelector('#site-menu'); const open = menu.classList.toggle('open'); button.setAttribute('aria-expanded', String(open)); });
const menu = document.querySelector('#site-menu');
const menuButton = document.querySelector('.menu-toggle');
const closeMenu = () => { menu.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); };
menu.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && menu.classList.contains('open')) { closeMenu(); menuButton.focus(); } });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) { showToast('Paste a media link to get started.'); input.focus(); return; }
  const button = form.querySelector('button[type="submit"]'); const original = button.innerHTML; button.disabled = true; button.innerHTML = '<span>Checking link…</span><span aria-hidden="true">◌</span>';
  try {
    let parsed; try { parsed = new URL(url); } catch { throw new Error('That is not a valid HTTPS direct-file URL.'); }
    const platform = Object.values(window.AREWA_PLATFORMS || {}).find((item) => item.hosts.includes(parsed.hostname.toLowerCase()) || item.hosts.some((host) => parsed.hostname.toLowerCase().endsWith(`.${host}`)));
    if (platform) {
      const response = await fetch('/api/inspect', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({url}) });
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'We could not inspect that link.');
      showToast(inspectionMessage(result));
    } else {
      button.innerHTML = '<span>Downloading…</span><span aria-hidden="true">↓</span>';
      const response = await fetch('/api/download', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({url}) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'This direct file could not be downloaded safely.'); }
      const blob = await response.blob(); if (!blob.size) throw new Error('The download was empty.');
      const disposition = response.headers.get('content-disposition') || ''; const match = disposition.match(/filename="([^"]+)"/i); const filename = match?.[1] || 'download';
      const objectUrl = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(objectUrl); showToast('Download started.');
    }
  } catch (error) { showToast(error.message || 'Something went wrong. Try again.'); }
  finally { button.disabled = false; button.innerHTML = original; }
});
