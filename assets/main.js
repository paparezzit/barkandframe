document.addEventListener('DOMContentLoaded', () => {
  const lenis = new Lenis();
  window.BarkFrameLenis = lenis;

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);

  lenis.on('scroll', ScrollTrigger.update);


  document.querySelectorAll("[data-parallax], .product-card--floating .image-block img").forEach(parallax => {
    const amount = parallax.dataset.parallax ? parallax.dataset.parallax : "-5vh";
    gsap.to(parallax, {y: amount, scrollTrigger: {
        trigger: parallax,
        start: "top bottom",
        end: "+=200%",
        scrub: true,
        toggleActions: "play none reverse none"
    }});
  })
});
