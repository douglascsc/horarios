// Recursos auxiliares da consulta: arquivo de agenda (.ics) e comparação
// entre duas versões de um período (o que mudou).
import { normalizar } from "./interpretar.js?v=20261009i";

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
export const detalheAula = (a) => `${(a.professores || []).join(", ") || "sem professor"}${a.sala ? ", sala " + a.sala : ""}`;
export function compararVersoes(antigas, novas) {
  const mapaA = new Map(antigas.map((a) => [chaveAula(a), a]));
  const mapaN = new Map(novas.map((a) => [chaveAula(a), a]));
  const novasL = [...mapaN].filter(([k]) => !mapaA.has(k)).map(([, a]) => a);
  const removidas = [...mapaA].filter(([k]) => !mapaN.has(k)).map(([, a]) => a);
  const mudadas = [...mapaN].filter(([k, a]) => mapaA.has(k) && (detalheAula(a) !== detalheAula(mapaA.get(k)) || a.fim !== mapaA.get(k).fim)).map(([k, a]) => [mapaA.get(k), a]);
  return { novas: novasL, removidas, mudadas, iguais: mapaN.size - novasL.length - mudadas.length };
}
