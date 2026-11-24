// Skrip opsional: menandai tautan menu yang sedang aktif saat halaman digulir.
(function () {
  var tautan = document.querySelectorAll('.nav a');
  if (!('IntersectionObserver' in window) || !tautan.length) return;

  var pengamat = new IntersectionObserver(function (entri) {
    entri.forEach(function (e) {
      if (!e.isIntersecting) return;
      tautan.forEach(function (a) {
        a.style.color = a.getAttribute('href') === '#' + e.target.id ? '#0b6fb8' : '';
      });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  ['harga', 'testimoni', 'cara-pesan', 'kontak'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) pengamat.observe(el);
  });
})();
