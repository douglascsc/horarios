// Leitor de planilhas .xlsx sem bibliotecas externas.
//
// Um .xlsx é um arquivo .zip com textos XML dentro. Este leitor só abre o
// zip e lê os VALORES das células (para fórmulas, o último resultado salvo
// pelo Excel/Google Planilhas). Nada da planilha é executado: fórmulas e
// macros são ignoradas, e o XML é lido por um analisador próprio que não
// segue referências externas nem expande entidades (proteção contra XXE e
// "bomba de XML"). Também há limites de tamanho contra "bomba de zip".
//
// Funciona no navegador e no Node 18+ (usa DecompressionStream).

export const LIMITE_ARQUIVO = 15 * 1024 * 1024;        // 15 MB enviados
const LIMITE_DESCOMPACTADO = 80 * 1024 * 1024;         // 80 MB somando tudo
const LIMITE_POR_PARTE = 40 * 1024 * 1024;             // 40 MB por arquivo interno

export class ErroPlanilha extends Error {}

// Identifica o tipo pelo conteúdo (não pela extensão, que pode ser trocada).
export function tipoDoArquivo(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "zip";
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "ole"; // .xls antigo (ou .xlsx protegido por senha)
  return "desconhecido";
}

// ---------------------------------------------------------------- zip
function lerZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fim do diretório central: assinatura 0x06054b50 nos últimos ~64 KB
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new ErroPlanilha("O arquivo está corrompido ou não é uma planilha .xlsx.");
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  if (total > 5000) throw new ErroPlanilha("A planilha tem partes internas demais para ser lida.");
  const entradas = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw new ErroPlanilha("O arquivo está corrompido (índice do zip inválido).");
    const metodo = dv.getUint16(p + 10, true);
    const tamCompactado = dv.getUint32(p + 20, true);
    const tamOriginal = dv.getUint32(p + 24, true);
    const tamNome = dv.getUint16(p + 28, true);
    const tamExtra = dv.getUint16(p + 30, true);
    const tamComent = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = dec.decode(bytes.subarray(p + 46, p + 46 + tamNome));
    entradas.set(nome, { metodo, tamCompactado, tamOriginal, local });
    p += 46 + tamNome + tamExtra + tamComent;
  }
  return entradas;
}

async function extrair(bytes, entrada, orcamento) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entrada.local;
  if (p + 30 > bytes.length || dv.getUint32(p, true) !== 0x04034b50) throw new ErroPlanilha("O arquivo está corrompido (parte interna inválida).");
  const inicio = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
  const dados = bytes.subarray(inicio, inicio + entrada.tamCompactado);
  if (entrada.metodo === 0) return dados;
  if (entrada.metodo !== 8) throw new ErroPlanilha("A planilha usa um tipo de compactação não suportado.");
  const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const leitor = fluxo.getReader();
  const partes = [];
  let soma = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    soma += value.length;
    orcamento.usado += value.length;
    if (soma > LIMITE_POR_PARTE || orcamento.usado > LIMITE_DESCOMPACTADO) {
      await leitor.cancel();
      throw new ErroPlanilha("A planilha é grande demais depois de descompactada (proteção contra arquivos maliciosos).");
    }
    partes.push(value);
  }
  const saida = new Uint8Array(soma);
  let o = 0;
  for (const parte of partes) { saida.set(parte, o); o += parte.length; }
  return saida;
}

// ---------------------------------------------------------------- XML
// Analisador mínimo: devolve uma árvore { nome, atr, filhos, texto }.
// Só reconhece as 5 entidades padrão e as numéricas; <!DOCTYPE>/<!ENTITY>
// são ignorados (nunca expandidos).
const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
function desescapar(s) {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const cod = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cod > 0 && cod <= 0x10ffff ? String.fromCodePoint(cod) : "";
    }
    return Object.prototype.hasOwnProperty.call(ENTIDADES, e) ? ENTIDADES[e] : m;
  });
}
function semPrefixo(nome) { const i = nome.indexOf(":"); return i < 0 ? nome : nome.slice(i + 1); }

export function lerXml(texto) {
  const raiz = { nome: "#raiz", atr: {}, filhos: [], texto: "" };
  const pilha = [raiz];
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const lt = texto.indexOf("<", i);
    if (lt < 0) break;
    if (lt > i) pilha[pilha.length - 1].texto += desescapar(texto.slice(i, lt));
    if (texto.startsWith("<!--", lt)) { const f = texto.indexOf("-->", lt); i = f < 0 ? n : f + 3; continue; }
    if (texto.startsWith("<![CDATA[", lt)) { const f = texto.indexOf("]]>", lt); pilha[pilha.length - 1].texto += texto.slice(lt + 9, f < 0 ? n : f); i = f < 0 ? n : f + 3; continue; }
    if (texto[lt + 1] === "?" || texto[lt + 1] === "!") { const f = texto.indexOf(">", lt); i = f < 0 ? n : f + 1; continue; }
    const gt = texto.indexOf(">", lt);
    if (gt < 0) break;
    let corpo = texto.slice(lt + 1, gt);
    if (corpo[0] === "/") {
      if (pilha.length > 1) pilha.pop();
      i = gt + 1;
      continue;
    }
    const fecha = corpo.endsWith("/");
    if (fecha) corpo = corpo.slice(0, -1);
    const m = /^([^\s/>]+)/.exec(corpo);
    const el = { nome: semPrefixo(m ? m[1] : ""), atr: {}, filhos: [], texto: "" };
    const reAtr = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = reAtr.exec(corpo))) el.atr[a[1]] = desescapar(a[3] !== undefined ? a[3] : a[4]);
    pilha[pilha.length - 1].filhos.push(el);
    if (!fecha) pilha.push(el);
    i = gt + 1;
  }
  return raiz;
}
function filhos(el, nome) { return el.filhos.filter((f) => f.nome === nome); }
function filho(el, nome) { return el.filhos.find((f) => f.nome === nome); }
function* todos(el, nome) {
  for (const f of el.filhos) { if (f.nome === nome) yield f; yield* todos(f, nome); }
}
function textoDe(el) {
  // Texto de <t>, ignorando a pronúncia fonética (<rPh>)
  let s = "";
  for (const f of el.filhos) {
    if (f.nome === "t") s += f.texto;
    else if (f.nome === "r") s += textoDe(f);
  }
  return s;
}

// ---------------------------------------------------------------- células
function colunaParaIndice(ref) {
  let c = 0;
  for (const ch of ref) {
    const k = ch.charCodeAt(0);
    if (k < 65 || k > 90) break;
    c = c * 26 + (k - 64);
  }
  return c - 1;
}

const LIMITE_LINHAS = 20000;
const LIMITE_COLUNAS = 200;

function lerAba(xml, compartilhadas) {
  const doc = lerXml(xml);
  const linhas = [];
  for (const row of todos(doc, "row")) {
    const r = parseInt(row.atr.r, 10);
    const idx = Number.isFinite(r) ? r - 1 : linhas.length;
    if (idx >= LIMITE_LINHAS) throw new ErroPlanilha(`Uma aba tem mais de ${LIMITE_LINHAS} linhas: grande demais para um quadro de horários.`);
    const valores = [];
    let proxima = 0;
    for (const c of filhos(row, "c")) {
      const col = c.atr.r ? colunaParaIndice(c.atr.r) : proxima;
      proxima = col + 1;
      if (col < 0 || col >= LIMITE_COLUNAS) continue;
      const tipo = c.atr.t || "n";
      const v = filho(c, "v");
      let valor = null;
      if (tipo === "s") valor = v ? (compartilhadas[parseInt(v.texto, 10)] ?? "") : "";
      else if (tipo === "inlineStr") { const is = filho(c, "is"); valor = is ? textoDe(is) : ""; }
      else if (tipo === "str") valor = v ? v.texto : "";
      else if (tipo === "b") valor = v ? v.texto === "1" : null;
      else if (tipo === "e") valor = null; // erro de fórmula (#N/A, #REF!...)
      else if (v && v.texto !== "") { const num = Number(v.texto); valor = Number.isFinite(num) ? num : v.texto; }
      valores[col] = valor;
    }
    for (let k = 0; k < valores.length; k++) if (valores[k] === undefined) valores[k] = null;
    linhas[idx] = valores;
  }
  for (let k = 0; k < linhas.length; k++) if (!linhas[k]) linhas[k] = [];
  return linhas;
}

function caminhoAlvo(alvo) {
  if (alvo.startsWith("/")) return alvo.slice(1);
  const partes = ("xl/" + alvo).split("/");
  const saida = [];
  for (const p of partes) { if (p === "..") saida.pop(); else if (p !== ".") saida.push(p); }
  return saida.join("/");
}

// Lê o arquivo e devolve [{ nome, oculta, linhas: [[valor,...],...] }].
// Valores: texto, número, booleano ou null.
export async function lerPlanilha(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length > LIMITE_ARQUIVO) throw new ErroPlanilha(`O arquivo tem mais de ${Math.round(LIMITE_ARQUIVO / 1048576)} MB. Uma planilha de horários costuma ter bem menos que isso.`);
  const tipo = tipoDoArquivo(bytes);
  if (tipo === "ole") {
    throw new ErroPlanilha("Este arquivo está no formato antigo do Excel (.xls, 97-2003) ou protegido por senha. Abra-o no Excel ou no Google Planilhas e use \"Salvar como\" / \"Fazer download\" → .xlsx; depois envie o novo arquivo.");
  }
  if (tipo !== "zip") throw new ErroPlanilha("O arquivo não é uma planilha do Excel (.xlsx).");
  const zip = lerZip(bytes);
  const orcamento = { usado: 0 };
  const dec = new TextDecoder();
  const texto = async (nome) => {
    const e = zip.get(nome);
    return e ? dec.decode(await extrair(bytes, e, orcamento)) : null;
  };
  if (zip.has("xl/vbaProject.bin")) { /* macros: simplesmente nunca são lidas */ }
  const wbXml = await texto("xl/workbook.xml");
  if (!wbXml) throw new ErroPlanilha("O arquivo é um .zip, mas não parece uma planilha do Excel (falta xl/workbook.xml).");
  const relsXml = await texto("xl/_rels/workbook.xml.rels");
  const rels = {};
  if (relsXml) for (const r of todos(lerXml(relsXml), "Relationship")) rels[r.atr.Id] = r.atr.Target;
  const ssXml = await texto("xl/sharedStrings.xml");
  const compartilhadas = ssXml ? filhos(filho(lerXml(ssXml), "sst") || { filhos: [] }, "si").map(textoDe) : [];
  const abas = [];
  for (const s of todos(lerXml(wbXml), "sheet")) {
    const rid = s.atr["r:id"] || Object.entries(s.atr).find(([k]) => k.endsWith(":id"))?.[1];
    const alvo = rels[rid];
    if (!alvo) continue;
    const xml = await texto(caminhoAlvo(alvo));
    if (xml === null) continue; // aba de gráfico etc.
    abas.push({ nome: s.atr.name || "Aba", oculta: !!s.atr.state && s.atr.state !== "visible", linhas: lerAba(xml, compartilhadas) });
  }
  if (!abas.length) throw new ErroPlanilha("A planilha não tem nenhuma aba com dados.");
  return abas;
}
