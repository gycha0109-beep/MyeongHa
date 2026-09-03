(() => {
  const root = document.documentElement;
  const saved = localStorage.getItem('myeongha-theme');
  const hour = new Date().getHours();
  root.dataset.theme = saved || (hour >= 7 && hour < 18 ? 'day' : 'night');
})();
