// In-place navigation. Clicking a link to another page on this site fetches
// it and swaps only the main column, so the sidebar (photo, name, nav) never
// redraws. The scene scripts are re-run on the new content; back/forward work.
(function () {
  const main = document.querySelector('.main-col');
  if (!main || !window.fetch || !window.history.pushState) return;

  function setActive(url) {
    const path = new URL(url, location.origin).pathname;
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
      const p = a.getAttribute('href');
      const on = p === '/' ? path === '/' : path.startsWith(p) || (p === '/pages/writing/' && (/^\/blogs\//.test(path) || /^\/til\//.test(path))) || (p === '/pages/projects/' && /^\/project\//.test(path));
      a.classList.toggle('active', on);
    });
  }
  async function go(url, push, scrollTo) {
    let html;
    // revalidate with the server so a page cached before a deploy is never swapped in
    try { const r = await fetch(url, { cache: 'no-cache', headers: { 'X-Requested-With': 'nav' } }); if (!r.ok) throw 0; html = await r.text(); }
    catch (_) { location.href = url; return; }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const next = doc.querySelector('.main-col');
    // a page from a different build than this one needs its own assets: load it fully
    const stamp = (d) => { const m = d.querySelector('meta[name="build"]'); return m ? m.content : ''; };
    if (!next || stamp(doc) !== stamp(document)) { location.href = url; return; }
    document.dispatchEvent(new Event('ascii:page-leave'));
    document.querySelector('.main-col').replaceWith(next);
    document.title = doc.title;
    if (push) { history.replaceState({ url: location.pathname + location.search, scroll: window.scrollY }, '', location.href); history.pushState({ url, scroll: 0 }, '', url); }
    const target = new URL(url, location.origin).hash && document.querySelector(new URL(url, location.origin).hash);
    if (target) target.scrollIntoView(); else window.scrollTo(0, scrollTo || 0);
    setActive(url);
    // re-run the scene scripts for the new content
    document.dispatchEvent(new CustomEvent('ascii:page-enter', { detail: { main: next } }));
    init();
  }
  function init() {
    const mainNow = document.querySelector('.main-col');
    document.querySelectorAll('a[href]').forEach(a => {
      if (a.dataset.nav) return;
      a.dataset.nav = '1';
      a.addEventListener('click', (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const u = new URL(a.href, location.href);
        if (u.origin !== location.origin || a.target || a.hasAttribute('download')) return;
        if (/\.(pdf|png|jpg|jpeg|svg|mp4|webp|gif|zip)$/i.test(u.pathname)) return;
        if (u.pathname === location.pathname && u.hash) return;
        if (u.pathname === location.pathname) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        e.preventDefault();
        go(u.pathname + u.search + u.hash, true);
      });
    });
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('popstate', (e) => go(location.pathname + location.search, false, e.state && e.state.scroll));
  history.replaceState({ url: location.pathname + location.search, scroll: 0 }, '', location.href);
  init();
})();
