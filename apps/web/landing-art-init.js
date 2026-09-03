(() => {
  const dark = window.__MH_LANDING_DARK || '';
  const light = window.__MH_LANDING_LIGHT || '';

  const validAvif = (base64, expectedLength) => {
    if (base64.length !== expectedLength) return false;
    try {
      const head = atob(base64.slice(0, 24));
      return head.includes('ftypavif');
    } catch {
      return false;
    }
  };

  const darkOk = validAvif(dark, 33396);
  const lightOk = validAvif(light, 39448);
  const root = document.documentElement;

  if (!darkOk || !lightOk) {
    root.classList.add('landing-art-invalid');
    console.error('MyeongHa landing artwork integrity check failed.', {
      darkLength: dark.length,
      lightLength: light.length,
      darkOk,
      lightOk,
    });
    return;
  }

  const darkImage = document.querySelector('[data-landing-art="night"]');
  const lightImage = document.querySelector('[data-landing-art="day"]');

  let loaded = 0;
  const markLoaded = () => {
    loaded += 1;
    if (loaded === 2) root.classList.add('landing-art-ready');
  };
  const markError = () => root.classList.add('landing-art-invalid');

  if (darkImage) {
    darkImage.addEventListener('load', markLoaded, { once: true });
    darkImage.addEventListener('error', markError, { once: true });
    darkImage.src = `data:image/avif;base64,${dark}`;
  }

  if (lightImage) {
    lightImage.addEventListener('load', markLoaded, { once: true });
    lightImage.addEventListener('error', markError, { once: true });
    lightImage.src = `data:image/avif;base64,${light}`;
  }

  delete window.__MH_LANDING_DARK;
  delete window.__MH_LANDING_LIGHT;
})();
