const form = document.querySelector('#download-form');
const input = document.querySelector('#media-url');
const toast = document.querySelector('#toast');
const showToast = (message) => { toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 5000); };
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
    const response = await fetch('/api/inspect', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({url}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'We could not inspect that link.');
    showToast(result.message || `${result.platform} link recognized. Direct ${result.platform} downloads are not currently supported.`);
  } catch (error) { showToast(error.message || 'Something went wrong. Try again.'); }
  finally { button.disabled = false; button.innerHTML = original; }
});
