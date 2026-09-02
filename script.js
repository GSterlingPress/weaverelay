(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const items = document.querySelectorAll('.step,.provider,.diagnosis-card,.big-providers div,.security-grid article');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.animate([
          {opacity: 0, transform: 'translateY(12px)'},
          {opacity: 1, transform: 'translateY(0)'}
        ], {duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both'});
        observer.unobserve(entry.target);
      }
    });
  }, {threshold: .12});
  items.forEach((item) => observer.observe(item));
})();
