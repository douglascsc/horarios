// Não abre dentro de página de outro site (proteção contra "clickjacking":
// o GitHub Pages não deixa mandar o cabeçalho que bloqueia isso). Mesmo
// esquema do site Chamada: o <style id="anti-clickjack"> esconde a página
// até este script confirmar que ela não está numa moldura de outro site.
(function () {
  var emMoldura = window.top !== window.self;
  var mesmoSite = false;
  try { mesmoSite = emMoldura && window.top.location.origin === window.location.origin; } catch (e) { /* outro site */ }
  if (!emMoldura || mesmoSite) {
    var s = document.getElementById("anti-clickjack");
    if (s) s.remove();
  } else {
    try { window.top.location = window.location.href; } catch (e) { /* moldura bloqueada: a página fica em branco */ }
  }
})();
