document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  let stableMetricWidth = window.innerWidth;

  const setStableScrollMetrics = () => {
    const viewportHeight = window.innerHeight || root.clientHeight;
    const header = document.querySelector('#header-component');
    const headerHeight = header?.getBoundingClientRect().height
      || parseFloat(getComputedStyle(document.body).getPropertyValue('--header-height'))
      || 0;

    root.style.setProperty('--baf-stable-vh', `${viewportHeight * 0.01}px`);
    root.style.setProperty('--baf-stable-header-height', `${Math.round(headerHeight)}px`);
    stableMetricWidth = window.innerWidth;
  };

  setStableScrollMetrics();

  const internalLinkHosts = new Set([
    window.location.hostname,
    "barkandframe.com",
    "www.barkandframe.com",
    "barkandframe.myshopify.com"
  ]);

  document.querySelectorAll("a[href]").forEach(anchor => {
    let url;
    try {
      url = new URL(anchor.getAttribute("href"), window.location.href);
    } catch {
      return;
    }

    if (!["http:", "https:"].includes(url.protocol) || internalLinkHosts.has(url.hostname)) return;

    anchor.setAttribute("target", "_blank");
    const rel = new Set((anchor.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
    rel.add("noopener");
    rel.add("noreferrer");
    anchor.setAttribute("rel", Array.from(rel).join(" "));
  });

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isTouchScroll = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const lenis = isSafari || isTouchScroll ? null : new Lenis();
  window.BarkFrameLenis = lenis;

  if (window.ScrollTrigger?.config) {
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  if (lenis) {
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    lenis.on('scroll', ScrollTrigger.update);
  } else if (window.ScrollTrigger?.update) {
    window.addEventListener('scroll', () => ScrollTrigger.update(), { passive: true });
  }

  const fixedLayerMedia = window.matchMedia('(max-width: 989px), (hover: none), (pointer: coarse)');
  const fixedLayerRoots = Array.from(document.querySelectorAll('.floating-images, .artist-collection__showcase'));
  let fixedLayerFrame = null;

  const getStableHeaderHeight = () => (
    parseFloat(getComputedStyle(root).getPropertyValue('--baf-stable-header-height'))
    || parseFloat(getComputedStyle(document.body).getPropertyValue('--header-height'))
    || 0
  );

  const getStableViewportHeight = () => (
    (parseFloat(getComputedStyle(root).getPropertyValue('--baf-stable-vh')) || 0) * 100
    || window.innerHeight
    || root.clientHeight
  );

  const setFixedLayerState = (section, state) => {
    section.classList.toggle('is-fixed-active', state === 'active');
    section.classList.toggle('is-fixed-after', state === 'after');
  };

  const updateFixedLayers = () => {
    fixedLayerFrame = null;

    if (!fixedLayerMedia.matches) {
      fixedLayerRoots.forEach(section => setFixedLayerState(section, 'before'));
      return;
    }

    const top = getStableHeaderHeight();
    const scrollY = window.scrollY || window.pageYOffset || 0;

    fixedLayerRoots.forEach(section => {
      if (!section.classList.contains('baf-fixed-layer')) return;

      const layerHeight = parseFloat(section.style.getPropertyValue('--baf-layer-height')) || 0;
      const sectionTop = section.getBoundingClientRect().top + scrollY;
      const sectionHeight = section.offsetHeight;
      const start = sectionTop - top;
      const end = sectionTop + sectionHeight - layerHeight - top;

      if (scrollY >= end) {
        setFixedLayerState(section, 'after');
      } else if (scrollY >= start) {
        setFixedLayerState(section, 'active');
      } else {
        setFixedLayerState(section, 'before');
      }
    });
  };

  const queueFixedLayerUpdate = () => {
    if (fixedLayerFrame !== null) return;
    fixedLayerFrame = window.requestAnimationFrame(updateFixedLayers);
  };

  const measureFixedLayers = () => {
    const enabled = fixedLayerMedia.matches && fixedLayerRoots.length > 0;
    const top = getStableHeaderHeight();
    const layerHeight = Math.max(1, Math.round(getStableViewportHeight() - top));

    fixedLayerRoots.forEach(section => {
      if (!enabled) {
        section.classList.remove('baf-fixed-layer');
        section.style.removeProperty('--baf-layer-top');
        section.style.removeProperty('--baf-layer-height');
        section.style.removeProperty('--baf-layer-after-top');
        setFixedLayerState(section, 'before');
        return;
      }

      section.style.setProperty('--baf-layer-top', `${Math.round(top)}px`);
      section.style.setProperty('--baf-layer-height', `${layerHeight}px`);
      section.classList.add('baf-fixed-layer');
      section.style.setProperty('--baf-layer-after-top', `${Math.max(0, section.offsetHeight - layerHeight)}px`);
    });

    updateFixedLayers();
  };

  const handleStableLayoutResize = () => {
    if (Math.abs(window.innerWidth - stableMetricWidth) <= 20) {
      queueFixedLayerUpdate();
      return;
    }

    setStableScrollMetrics();
    measureFixedLayers();
  };

  measureFixedLayers();
  window.addEventListener('scroll', queueFixedLayerUpdate, { passive: true });
  window.addEventListener('resize', handleStableLayoutResize, { passive: true });
  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      setStableScrollMetrics();
      measureFixedLayers();
    }, 250);
  }, { passive: true });
  window.addEventListener('load', measureFixedLayers, { once: true });
  fixedLayerMedia.addEventListener?.('change', () => {
    setStableScrollMetrics();
    measureFixedLayers();
  });
  const floatingParallaxPattern = ["0svh", "-20svh", "-10svh", "0svh", "-20svh"];
  document.querySelectorAll(".floating-images__holder > .product-card--floating").forEach((card, index) => {
    if (!card.dataset.parallax) {
      card.dataset.parallax = floatingParallaxPattern[index % floatingParallaxPattern.length];
    }
  });

  document.querySelectorAll("[data-parallax]").forEach(parallax => {
    const amount = parallax.dataset.parallax ? parallax.dataset.parallax : "-5vh";
    gsap.to(parallax, {y: amount, scrollTrigger: {
        trigger: parallax,
        start: "top bottom",
        end: "+=200%",
        scrub: true,
        toggleActions: "play none reverse none"
    }});
  })

  document.querySelectorAll(".product-card--floating .image-block").forEach(parallax => {
    gsap.to(parallax, {"--floating-image-parallax-y": "-5vh", scrollTrigger: {
        trigger: parallax,
        start: "top bottom",
        end: "+=200%",
        scrub: true,
        toggleActions: "play none reverse none"
    }});
  })
});
