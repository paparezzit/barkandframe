(() => {
  const selector = '[data-baf-scroll-subnav]';
  const state = window.BAFScrollSubnav || {
    navs: new Set(),
    lastScrollY: Math.max(window.scrollY || 0, 0),
    ticking: false,
    measureTicking: false,
    bound: false,
    lenisBound: false,
    hidden: false,
  };

  window.BAFScrollSubnav = state;

  if (typeof state.measureTicking !== 'boolean') state.measureTicking = false;
  if (typeof state.hidden !== 'boolean') state.hidden = false;

  const getNavRoot = (nav) => nav.closest('.artist-collection, .shop-products') || document.documentElement;

  const measureNavs = () => {
    state.navs.forEach((nav) => {
      if (!document.documentElement.contains(nav)) {
        state.navs.delete(nav);
        return;
      }

      const height = Math.ceil(nav.getBoundingClientRect().height);
      if (height > 0) getNavRoot(nav).style.setProperty('--baf-scroll-subnav-height', `${height}px`);
    });
  };

  const queueMeasureNavs = () => {
    if (state.measureTicking) return;
    state.measureTicking = true;
    window.requestAnimationFrame(() => {
      state.measureTicking = false;
      measureNavs();
    });
  };

  document.querySelectorAll(selector).forEach((nav) => {
    if (nav instanceof HTMLElement) {
      state.navs.add(nav);
      nav.classList.toggle('is-hidden-on-scroll', state.hidden);
    }
  });

  queueMeasureNavs();

  if (state.bound) return;
  state.bound = true;

  const threshold = 6;

  const setHidden = (hidden) => {
    state.hidden = hidden;
    state.navs.forEach((nav) => {
      if (!document.documentElement.contains(nav)) {
        state.navs.delete(nav);
        return;
      }
      nav.classList.toggle('is-hidden-on-scroll', hidden);
    });
  };

  const updateFromScrollY = (currentScrollY) => {
    const delta = currentScrollY - state.lastScrollY;

    if (currentScrollY <= 4 || delta < -threshold) {
      setHidden(false);
    } else if (delta > threshold) {
      setHidden(true);
    }

    state.lastScrollY = currentScrollY;
  };

  const update = () => {
    updateFromScrollY(Math.max(window.scrollY || 0, 0));
    state.ticking = false;
  };

  const onScroll = () => {
    if (state.ticking) return;
    state.ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', queueMeasureNavs);

  const bindLenis = () => {
    const lenis = window.BarkFrameLenis;
    if (state.lenisBound || !lenis?.on) return;

    state.lenisBound = true;
    lenis.on('scroll', ({ scroll, direction }) => {
      const currentScrollY = Math.max(scroll || window.scrollY || 0, 0);

      if (currentScrollY <= 4 || direction < 0) {
        setHidden(false);
      } else if (direction > 0) {
        setHidden(true);
      }

      state.lastScrollY = currentScrollY;
    });
  };

  bindLenis();
  document.addEventListener('DOMContentLoaded', bindLenis, { once: true });
  window.addEventListener('load', bindLenis, { once: true });
  document.addEventListener('DOMContentLoaded', queueMeasureNavs, { once: true });
  window.addEventListener('load', queueMeasureNavs, { once: true });
  document.fonts?.ready?.then(queueMeasureNavs);
})();
