// Funcionamento sem internet (aplicativo instalado ou site já visitado).
// - Arquivos do site (HTML, CSS, JS, ícones): guardados na instalação.
// - Horários (dados/*.json): sempre buscados na internet primeiro; sem
//   conexão, usa a última cópia guardada neste aparelho.
// - Nada de fora do site é interceptado (a API do GitHub, usada para
//   publicar, passa direto).
// Ao mudar o código, troque VERSAO aqui e o ?v= do index.html/app.js.
const VERSAO = "20261009e";
const CACHE = "horarios-" + VERSAO;
const DADOS = "horarios-dados";
const BASICO = [
  "./", "index.html", "manifest.webmanifest",
  `css/estilo.css?v=${VERSAO}`, `js/protecao.js?v=${VERSAO}`, `js/icones.js?v=${VERSAO}`, `js/app.js?v=${VERSAO}`,
  `js/leitor-xlsx.js?v=${VERSAO}`, `js/interpretar.js?v=${VERSAO}`, `js/publicar.js?v=${VERSAO}`, `js/recursos.js?v=${VERSAO}`, `js/offline.js?v=${VERSAO}`,
  "assets/ifsul.png", "assets/icone-192.png", "assets/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE && n !== DADOS).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // horários: internet primeiro, cópia guardada se estiver sem conexão
  if (url.pathname.includes("/dados/") && url.pathname.endsWith(".json")) {
    const chave = url.origin + url.pathname; // sem o ?v=, para achar a cópia
    e.respondWith(fetch(req).then((resp) => {
      if (resp.ok) { const copia = resp.clone(); caches.open(DADOS).then((c) => c.put(chave, copia)); }
      return resp;
    }).catch(() => caches.open(DADOS).then((c) => c.match(chave)).then((r) => r || Response.error())));
    return;
  }

  // página: internet primeiro (pega versões novas), senão a guardada
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("index.html")));
    return;
  }

  // demais arquivos do site: guardados primeiro
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
    if (resp.ok && resp.type === "basic") { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return resp;
  })));
});
