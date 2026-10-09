// Recursos auxiliares da consulta: arquivo de agenda (.ics) e comparação
// entre duas versões de um período (o que mudou).
import { normalizar } from "./interpretar.js?v=20261009s";

// ---------------------------------------------------------------- agenda (.ics)
const DIA_SEMANA = { seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
const doisDig = (n) => String(n).padStart(2, "0");
const dataIcs = (d) => `${d.getFullYear()}${doisDig(d.getMonth() + 1)}${doisDig(d.getDate())}`;
function escaparIcs(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
// linhas de no máximo 75 bytes (regra do formato), sem partir acentos
function dobrar(linha) {
  const enc = new TextEncoder();
  if (enc.encode(linha).length <= 75) return linha;
  const partes = [];
  let atual = "", bytes = 0, limite = 75;
  for (const ch of linha) {
    const n = enc.encode(ch).length;
    if (bytes + n > limite) { partes.push(atual); atual = ""; bytes = 0; limite = 74; }
    atual += ch; bytes += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}
export function dataDeTexto(iso) { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); }

// aulas: [{dia, inicio, fim, disciplina, professores, sala, turma}]; datas: "AAAA-MM-DD"
export function gerarIcs({ aulas, nomeCalendario, inicio, fim, idBase }) {
  const ini = dataDeTexto(inicio), fimD = dataDeTexto(fim);
  // fim do último dia (23:59:59 em Brasília, UTC−3) em UTC, para o UNTIL
  const ate = new Date(Date.UTC(fimD.getFullYear(), fimD.getMonth(), fimD.getDate() + 1, 2, 59, 59));
  const ateTxt = `${ate.getUTCFullYear()}${doisDig(ate.getUTCMonth() + 1)}${doisDig(ate.getUTCDate())}T${doisDig(ate.getUTCHours())}${doisDig(ate.getUTCMinutes())}${doisDig(ate.getUTCSeconds())}Z`;
  const agora = new Date();
  const carimbo = `${agora.getUTCFullYear()}${doisDig(agora.getUTCMonth() + 1)}${doisDig(agora.getUTCDate())}T${doisDig(agora.getUTCHours())}${doisDig(agora.getUTCMinutes())}${doisDig(agora.getUTCSeconds())}Z`;
  const linhas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IFSul//Horarios de aula//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escaparIcs(nomeCalendario)}`, "X-WR-TIMEZONE:America/Sao_Paulo",
    "BEGIN:VTIMEZONE", "TZID:America/Sao_Paulo", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0300", "TZOFFSETTO:-0300", "TZNAME:-03", "END:STANDARD", "END:VTIMEZONE",
  ];
  let n = 0;
  for (const a of aulas) {
    const alvo = DIA_SEMANA[a.dia];
    if (!alvo) continue; // EaD não tem dia fixo
    const primeiro = new Date(ini);
    while (primeiro.getDay() !== alvo) primeiro.setDate(primeiro.getDate() + 1);
    if (primeiro > fimD) continue;
    const hora = (h) => h.replace(":", "") + "00";
    const desc = [`Turma ${a.turma}`, (a.professores || []).length ? `Professor: ${a.professores.join(", ")}` : "", a.sala ? `Sala ${a.sala}` : ""].filter(Boolean).join("\n");
    linhas.push("BEGIN:VEVENT",
      `UID:${idBase}-${n++}-${a.turma}-${a.dia}-${a.inicio.replace(":", "")}@horarios`.replace(/[^\w@.-]/g, "_"),
      `DTSTAMP:${carimbo}`,
      `DTSTART;TZID=America/Sao_Paulo:${dataIcs(primeiro)}T${hora(a.inicio)}`,
      `DTEND;TZID=America/Sao_Paulo:${dataIcs(primeiro)}T${hora(a.fim)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${ateTxt}`,
      `SUMMARY:${escaparIcs(a.disciplina)}`,
      a.sala ? `LOCATION:${escaparIcs("Sala " + a.sala)}` : null,
      `DESCRIPTION:${escaparIcs(desc)}`,
      "END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  return { texto: linhas.filter(Boolean).map(dobrar).join("\r\n") + "\r\n", eventos: n };
}

// ---------------------------------------------------------------- comparação de versões
export const chaveAula = (a) => [a.turma, a.dia, a.inicio, normalizar(a.disciplina)].join("|");
export const detalheAula = (a, prof = (n) => n) => `${(a.professores || []).map(prof).join(", ") || "sem professor"}${a.sala ? ", sala " + a.sala : ""}`;
export function compararVersoes(antigas, novas) {
  const mapaA = new Map(antigas.map((a) => [chaveAula(a), a]));
  const mapaN = new Map(novas.map((a) => [chaveAula(a), a]));
  const novasL = [...mapaN].filter(([k]) => !mapaA.has(k)).map(([, a]) => a);
  const removidas = [...mapaA].filter(([k]) => !mapaN.has(k)).map(([, a]) => a);
  const mudadas = [...mapaN].filter(([k, a]) => mapaA.has(k) && (detalheAula(a) !== detalheAula(mapaA.get(k)) || a.fim !== mapaA.get(k).fim)).map(([k, a]) => [mapaA.get(k), a]);
  return { novas: novasL, removidas, mudadas, iguais: mapaN.size - novasL.length - mudadas.length };
}

// ---------------------------------------------------------------- planilha (.xlsx)
// Gera um .xlsx de verdade (zip sem compressão + XML), sem bibliotecas:
// cabeçalho em negrito, colunas com largura ajustada e primeira linha fixa.
const TABELA_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABELA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipSemCompressao(arquivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let pos = 0;
  for (const [nome, texto] of arquivos) {
    const n = enc.encode(nome), d = enc.encode(texto), crc = crc32(d);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint32(14, crc, true); local.setUint32(18, d.length, true); local.setUint32(22, d.length, true); local.setUint16(26, n.length, true);
    partes.push(new Uint8Array(local.buffer), n, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), n);
    pos += 30 + n.length + d.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const xmlEsc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
function colunaLetra(i) { let s = ""; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }

// cabecalho: ["Dia", ...]; linhas: [[...], ...] (texto ou número)
export function gerarXlsx({ nomeAba, cabecalho, linhas }) {
  const larguras = cabecalho.map((h, i) => Math.min(60, Math.max(String(h).length, ...linhas.map((l) => String(l[i] ?? "").length)) + 2));
  const celula = (v, l, c, estilo) => {
    const ref = colunaLetra(c) + (l + 1);
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const todas = [cabecalho, ...linhas];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${todas.map((l, li) => `<row r="${li + 1}">${l.map((v, ci) => celula(v, li, ci, li === 0 ? ' s="1"' : "")).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:${colunaLetra(cabecalho.length - 1)}${todas.length}"/></worksheet>`;
  const aba = xmlEsc(String(nomeAba || "Horários").replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  return zipSemCompressao([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${aba}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${aba.replace(/'/g, "''")}'!$A$1:$${colunaLetra(cabecalho.length - 1)}$${todas.length}</definedName></definedNames></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2B7A40"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ["xl/worksheets/sheet1.xml", sheet],
  ]);
}

// ---------------------------------------------------------------- tratamento dos professores
// O título (Prof., Prof.ª, Prof.(a)) só aparece na tela: na planilha e nos
// dados o nome continua como está. Vale o que a coordenação confirmou
// (dados/professores.json); sem confirmação, "Prof.(a)".
export const TITULO_PROF = { m: "Prof.", f: "Prof.ª", "": "Prof.(a)" };
export const chaveProf = (nome) => String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export function comTitulo(nome, tratamento) {
  if (!nome || nome === "Sem professor") return nome;
  return `${TITULO_PROF[(tratamento || {})[chaveProf(nome)]] || TITULO_PROF[""]} ${nome}`;
}
// Sugestão para a coordenação conferir (nunca vai para o site sem
// confirmação): só nomes comuns e sem ambiguidade; o resto fica "Prof.(a)".
const NOMES_F = new Set("adriana alessandra alice aline amanda ana angela angelica aurora barbara beatriz bianca bruna camila carine carla carolina caroline cassia catarina cecilia cintia clara clarice claudia cleusa cristiane cristina daiana daiane daniela debora denise diana dirce edilaine edna eduarda elaine eliana eliane elisa elisangela estela eva fabiana fabiola fatima fernanda flavia franciele francieli francine gabriela gabriele giovana gisele glaucia gloria graziela helena heloisa iara ieda ines ingrid irene isabel isabela ivete ivone jamile janaina jane jaqueline jessica joana jociane joice joseane josiane josiele joyce julia juliana jussara karen karina karla katia keila kelly lais lara larissa laura leila leticia lidiane lilian liliane lisiane livia lorena luana lucia luciana luciane luisa luiza manuela marcia maria mariana marilene marina marisa marlene marli marta melissa michele michelle milena miriam mirian monica nadia naiara nair naira natalia neiva neusa noemi odete olga pamela patricia paula priscila priscilla rafaela raquel regina rejane renata rita roberta rosa rosana rosane rosangela roseli rosemary rosemeri sabrina sabrine samanta sandra sara scheila sheila silvana silvia simone sirlei solange sonia stela sueli susana suzana tais tania tatiana tatiane teresa tereza thais valeria vanessa vania vera veronica vilma vitoria vivian viviane yasmin zelia".split(" "));
const NOMES_M = new Set("ademir adriano airton alan alberto alcides alessandro alex alexandre alvaro anderson andre antonio ari arnaldo arthur artur augusto benjamin bruno caio carlo carlos cassiano celso cesar claudio cleber clovis cristiano daniel dario davi david denis diego diogo douglas eder ederson edgar edson eduardo elias elton elvis emerson enzo erico evandro everton fabiano fabio fabricio fausto felipe felix fernando flavio francisco frederico gabriel gelson geraldo gilberto gilmar giovani guilherme gustavo heitor henrique hugo igor ismael ivan ivo jaime jair jairo jardel jeferson jefferson joao joaquim joel jonas jorge jose josue juarez juliano julio lauro leandro leo leomar leonardo lisandro luan lucas luciano luis luiz manoel manuel marcelo marcio marco marcos mario marlon mateus matheus mathias mauricio mauro miguel moises murilo nelson neri nicolas norberto odair olavo orlando osmar otavio otto patrick paulo pedro rafael raul reinaldo renan renato ricardo roberto rodolfo rodrigo rogerio romeu ronaldo ruben rubens rui samuel sandro saulo sebastiao sergio sidnei sidney silvano silvio tadeu tales teodoro thales thiago tiago tomas ulisses vagner valdir valmir valter vanderlei vasco vicente victor vilson vinicius vitor volnei wagner walter william wilson".split(" "));
export function sugerirTratamento(nome) {
  const primeiro = chaveProf(nome).split(/[\s.]/)[0];
  return NOMES_F.has(primeiro) ? "f" : NOMES_M.has(primeiro) ? "m" : "";
}
