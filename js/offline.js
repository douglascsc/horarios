// "Baixar versão offline": monta UM arquivo .html com o visual, o código e
// os horários de todos os períodos publicados. Ele abre com dois cliques,
// sem internet (pendrive, pasta do Drive no computador…). É uma foto do
// momento: serve só para consulta e precisa ser baixado de novo quando os
// horários mudarem.
//
// Como o navegador não carrega módulos nem arquivos .json quando a página
// é aberta direto do computador (file://), cada módulo vira uma função
// dentro do próprio arquivo e os dados vão embutidos.

// ordem em que os módulos são definidos (cada um só usa os anteriores)
const MODULOS = ["leitor-xlsx", "interpretar", "publicar", "recursos", "offline", "app"];

// transforma um módulo ES em um bloco que guarda o que ele exporta em __m
export function comoBloco(nome, codigo) {
  let src = codigo.replace(/import\s*\{([\s\S]*?)\}\s*from\s*["']\.\/([\w-]+)\.m?js(?:\?[^"']*)?["'];?/g, (m, nomes, arq) => {
    const lista = nomes.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+as\s+/, ": "));
    return `const { ${lista.join(", ")} } = __m["${arq}"];`;
  });
  if (/^\s*import[\s{(]/m.test(src)) throw new Error(`Importação não suportada em ${nome}.js`);
  const exportados = [];
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([\w$]+)/gm, (m, tipo, n) => { exportados.push(n); return `${tipo} ${n}`; });
  if (/^export\s/m.test(src)) throw new Error(`Exportação não suportada em ${nome}.js`);
  return `__m["${nome}"] = (() => {\n${src}\nreturn { ${exportados.join(", ")} };\n})();\n`;
}

async function texto(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Não foi possível ler ${url}`);
  return r.text();
}
async function dataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) return "";
  const b = new Uint8Array(await r.arrayBuffer());
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return `data:${r.headers.get("content-type") || "image/png"};base64,${btoa(s)}`;
}
// nada dentro de <script> pode conter "</script"
const seguroEmScript = (t) => t.replace(/<\/(script)/gi, "<\\/$1");

// arquivos: { "dados/periodos.json": {...}, "dados/periodos/2026-2.json": {...} }
export async function gerarArquivoOffline({ versao, arquivos }) {
  const v = versao ? `?v=${versao}` : "";
  const [html, css, icones, logo, favicon, ...codigos] = await Promise.all([
    texto("index.html"), texto(`css/estilo.css${v}`), texto(`js/icones.js${v}`),
    dataUrl("assets/ifsul.png"), dataUrl("assets/icone-192.png"),
    ...MODULOS.map((n) => texto(`js/${n}.js${v}`)),
  ]);
  const geradoEm = new Date().toISOString();
  // o endereço do site NÃO vai no arquivo (ele pode circular sem divulgar o link)
  const pacote = { geradoEm, arquivos };
  const bundle = "const __m = {};\n" + MODULOS.map((n, i) => comoBloco(n, codigos[i])).join("\n");

  const doc = new DOMParser().parseFromString(html, "text/html");
  const q = (sel) => doc.querySelector(sel);
  // segurança: o arquivo não acessa nada da internet além da fonte do Google
  const csp = q('meta[http-equiv="Content-Security-Policy"]');
  if (csp) csp.setAttribute("content", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'");
  for (const l of doc.querySelectorAll('link[rel="modulepreload"]')) l.remove();
  for (const sel of ["#anti-clickjack", 'script[src*="protecao.js"]', 'link[rel="manifest"]', 'link[rel="apple-touch-icon"]', 'meta[name="apple-mobile-web-app-capable"]', 'meta[name="mobile-web-app-capable"]', 'meta[name="apple-mobile-web-app-title"]']) q(sel)?.remove();
  const icon = q('link[rel="icon"]');
  if (icon) { if (favicon) icon.setAttribute("href", favicon); else icon.remove(); }
  const estilo = doc.createElement("style");
  estilo.textContent = css;
  q('link[rel="stylesheet"][href*="estilo.css"]').replaceWith(estilo);
  const scriptIcones = doc.createElement("script");
  scriptIcones.textContent = seguroEmScript(icones);
  q('script[src*="icones.js"]').replaceWith(scriptIcones);
  for (const img of doc.querySelectorAll('img[src="assets/ifsul.png"]')) img.setAttribute("src", logo);
  // dados embutidos (JSON com "<" escapado) + código
  const dados = doc.createElement("script");
  dados.type = "application/json";
  dados.id = "dados-offline";
  dados.textContent = JSON.stringify(pacote).replace(/</g, "\\u003c");
  const app = q('script[type="module"][src*="app.js"]');
  const modulo = doc.createElement("script");
  modulo.type = "module";
  modulo.textContent = seguroEmScript(bundle.split('"assets/ifsul.png"').join(JSON.stringify(logo)));
  app.replaceWith(dados, modulo);
  doc.title = "Horários (offline)";
  return { html: "<!doctype html>\n" + doc.documentElement.outerHTML, geradoEm };
}
