document.addEventListener('DOMContentLoaded', () => {
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

  const lenis = new Lenis();
  window.BarkFrameLenis = lenis;

  if (window.ScrollTrigger?.config) {
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);

  lenis.on('scroll', ScrollTrigger.update);

  const outlinePairs = [
    ...Array.from(document.querySelectorAll('.floating-images')).map((root) => ({
      layer: root.querySelector('.floating-images__fake-title'),
      source: root.querySelector('.floating-images__content .floating-images__title'),
      target: root.querySelector('.floating-images__fake-title .floating-images__title'),
    })),
    ...Array.from(document.querySelectorAll('.artist-collection')).map((root) => ({
      layer: root.querySelector('.artist-collection__hero-outline'),
      source: root.querySelector('.artist-collection__hero .artist-collection__title'),
      target: root.querySelector('.artist-collection__hero-outline .artist-collection__title'),
    })),
  ].filter(({ layer, source, target }) => layer && source && target);

  let outlineSyncFrame = null;
  const syncOutlinePairs = () => {
    outlinePairs.forEach(({ layer, source, target }) => {
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      layer.style.setProperty('--outline-sync-x', `${sourceRect.left - targetRect.left}px`);
      layer.style.setProperty('--outline-sync-y', `${sourceRect.top - targetRect.top}px`);
    });
    outlineSyncFrame = null;
  };
  const queueOutlineSync = () => {
    if (!outlinePairs.length || outlineSyncFrame) return;
    outlineSyncFrame = window.requestAnimationFrame(syncOutlinePairs);
  };

  queueOutlineSync();
  window.addEventListener('scroll', queueOutlineSync, { passive: true });
  window.addEventListener('resize', queueOutlineSync);
  document.fonts?.ready?.then(queueOutlineSync);
  lenis.on('scroll', queueOutlineSync);

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
