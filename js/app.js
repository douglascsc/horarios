// Interface: consulta pública dos horários + área do administrador
// (envio da planilha, revisão, prévia e publicação com senha).
// Todo conteúdo vindo da planilha entra na página como TEXTO
// (textContent), nunca como HTML.
import { lerPlanilha, ErroPlanilha, LIMITE_ARQUIVO } from "./leitor-xlsx.js";
import { interpretar, normalizar, comparar, DIAS, NOME_DIA, NOME_TURNO, ROTULO_CAMPO } from "./interpretar.js";
import { publicarHorarios, salvarConfiguracao, trocarSenha, ErroPublicacao, ARQUIVO_CONFIG, ARQUIVO_DADOS, TAMANHO_MINIMO_SENHA } from "./publicar.js";

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...filhos) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) e.append(f.nodeType ? f : String(f));
  return e;
}
const icone = (nome, classe) => window.icones.criar(nome, classe) || document.createTextNode("");
const desenharIcones = (raiz) => window.icones.desenhar(raiz);
const minutos = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const guardar = { ler(k) { try { return localStorage.getItem(k); } catch { return null; } }, gravar(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } } };

// ---------------------------------------------------------------- estado
const estado = {
  publicado: null,      // dados/horarios.json
  config: null,         // dados/publicacao.json
  importacao: null,     // resultado de interpretar() da planilha enviada
  previa: false,
  filtros: { q: "", curso: "", turma: "", professor: "", sala: "", turno: "", dia: "" },
  agrupar: "turma",
  exibir: "grade",
  ordenar: "horario",
};
const dadosAtivos = () => (estado.previa && estado.importacao ? dadosDaImportacao() : estado.publicado);

// ---------------------------------------------------------------- endereço (#)
const CHAVES_URL = { q: "q", curso: "curso", turma: "turma", professor: "prof", sala: "sala", turno: "turno", dia: "dia" };
function lerEndereco() {
  const h = location.hash.replace(/^#\/?/, "");
  if (h === "admin" || h.startsWith("admin")) return { admin: true };
  const p = new URLSearchParams(h);
  for (const [campo, chave] of Object.entries(CHAVES_URL)) estado.filtros[campo] = p.get(chave) || "";
  if (["turma", "professor", "sala", "dia"].includes(p.get("agrupar"))) estado.agrupar = p.get("agrupar");
  if (["grade", "lista"].includes(p.get("ver"))) estado.exibir = p.get("ver");
  if (p.get("ordem")) estado.ordenar = p.get("ordem");
  return { admin: false };
}
function gravarEndereco() {
  if (estado.previa) return;
  const p = new URLSearchParams();
  for (const [campo, chave] of Object.entries(CHAVES_URL)) if (estado.filtros[campo]) p.set(chave, estado.filtros[campo]);
  if (estado.agrupar !== "turma") p.set("agrupar", estado.agrupar);
  if (estado.exibir !== "grade") p.set("ver", estado.exibir);
  if (estado.ordenar !== "horario") p.set("ordem", estado.ordenar);
  const s = p.toString();
  history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
}

// ---------------------------------------------------------------- carregar
async function carregarJson(caminho) {
  try {
    const r = await fetch(`${caminho}?v=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
function dadosValidos(d) { return d && Array.isArray(d.aulas) && Array.isArray(d.turmas); }

async function iniciar() {
  $("ano-rodape").textContent = new Date().getFullYear();
  desenharIcones();
  ligarConsulta();
  ligarAdmin();
  const [dados, config] = await Promise.all([carregarJson(ARQUIVO_DADOS), carregarJson(ARQUIVO_CONFIG)]);
  estado.publicado = dadosValidos(dados) ? dados : null;
  estado.config = config && config.token && config.sal ? config : null;
  atualizarStatus();
  atualizarConfigUI();
  aoMudarEndereco();
  window.addEventListener("hashchange", aoMudarEndereco);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("view-consulta").hidden) renderConsulta(); });
}

function aoMudarEndereco() {
  const { admin } = lerEndereco();
  if (admin) { estado.previa = false; mostrarAdmin(); return; }
  mostrarConsulta();
}

function atualizarStatus() {
  const pill = $("status-publicacao"), txt = $("status-publicacao-texto");
  if (estado.previa) { pill.className = "status-pill ambar"; txt.textContent = "Prévia"; return; }
  const d = estado.publicado;
  if (!d) { pill.className = "status-pill ambar"; txt.textContent = "Sem horários publicados"; return; }
  pill.className = "status-pill verde";
  const quando = d.publicadoEm ? new Date(d.publicadoEm) : null;
  txt.textContent = quando && !isNaN(quando) ? `Atualizado em ${quando.toLocaleDateString("pt-BR")}` : (d.dataPlanilha ? `Publicado em ${d.dataPlanilha}` : "Publicado");
}

// ================================================================= CONSULTA
function mostrarConsulta() {
  $("view-admin").hidden = true;
  $("view-consulta").hidden = false;
  $("barra-previa").hidden = !estado.previa;
  atualizarStatus();
  renderConsulta();
}

function ligarConsulta() {
  const busca = $("busca");
  let espera;
  busca.addEventListener("input", () => {
    $("limpar-busca").hidden = !busca.value;
    clearTimeout(espera);
    espera = setTimeout(() => { estado.filtros.q = busca.value.trim(); gravarEndereco(); renderResultados(); }, 120);
  });
  $("limpar-busca").addEventListener("click", () => { busca.value = ""; estado.filtros.q = ""; $("limpar-busca").hidden = true; gravarEndereco(); renderResultados(); busca.focus(); });
  for (const campo of ["turma", "professor", "sala", "turno"]) {
    $("filtro-" + campo).addEventListener("change", (e) => {
      estado.filtros[campo] = e.target.value;
      // escolher uma turma/professor/sala já agrupa por ela
      if (e.target.value && ["turma", "professor", "sala"].includes(campo)) estado.agrupar = campo;
      gravarEndereco(); renderConsulta();
    });
  }
  $("btn-limpar-filtros").addEventListener("click", limparFiltros);
  for (const [id, chave] of [["seg-agrupar", "agrupar"], ["seg-exibir", "exibir"]]) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button[data-valor]");
      if (!b || b.disabled) return;
      estado[chave] = b.dataset.valor;
      gravarEndereco(); renderConsulta();
    });
  }
  $("ordenar").addEventListener("change", (e) => { estado.ordenar = e.target.value; gravarEndereco(); renderResultados(); });
  $("link-inicio").addEventListener("click", (e) => { e.preventDefault(); if (estado.previa) return; limparFiltros(); location.hash = ""; });
  $("btn-previa-voltar").addEventListener("click", () => { location.hash = "admin"; });
}

function limparFiltros() {
  estado.filtros = { q: "", curso: "", turma: "", professor: "", sala: "", turno: "", dia: "" };
  $("busca").value = "";
  $("limpar-busca").hidden = true;
  gravarEndereco();
  renderConsulta();
}

// Índice de busca e listas de valores, calculados uma vez por conjunto de dados
const cacheIndice = new WeakMap();
function indice(dados) {
  if (cacheIndice.has(dados)) return cacheIndice.get(dados);
  const aulas = dados.aulas.map((a, i) => {
    const salas = (a.sala || "").split("/").map((s) => s.trim()).filter(Boolean);
    return {
      ...a, id: i, salas, ini: minutos(a.inicio), fimMin: minutos(a.fim),
      busca: normalizar([a.disciplina, a.turma, a.curso, (a.professores || []).join(" "), a.sala, NOME_DIA[a.dia], NOME_TURNO[a.turno]].join(" ")),
    };
  });
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort(comparar);
  const ordemTurmas = new Map(dados.turmas.map((t, i) => [t.id, i]));
  const idx = {
    aulas,
    cursos: dados.cursos && dados.cursos.length ? dados.cursos : uniq(aulas.map((a) => a.curso)),
    turmas: [...new Set(aulas.map((a) => a.turma))].sort((a, b) => (ordemTurmas.get(a) ?? 999) - (ordemTurmas.get(b) ?? 999) || comparar(a, b)),
    professores: uniq(aulas.flatMap((a) => a.professores || [])),
    salas: uniq(aulas.flatMap((a) => a.salas)),
    turnos: ["M", "T", "N"].filter((t) => aulas.some((a) => a.turno === t)),
    dias: DIAS.filter((d) => aulas.some((a) => a.dia === d)),
    ordemTurmas,
    slots: slotsDe(dados, aulas),
  };
  cacheIndice.set(dados, idx);
  return idx;
}
function slotsDe(dados, aulas) {
  if (dados.periodos && dados.periodos.length) return dados.periodos.map(([i, f]) => ({ ini: minutos(i), fim: minutos(f) }));
  const mapa = new Map();
  for (const a of aulas) for (let k = 0; k < a.periodos; k++) mapa.set(a.ini + 45 * k, a.ini + 45 * (k + 1));
  return [...mapa].map(([ini, fim]) => ({ ini, fim })).sort((a, b) => a.ini - b.ini);
}

function preencherSelect(sel, valores, atual, vazio, rotulo = (v) => v) {
  sel.replaceChildren(el("option", { value: "", text: vazio }), ...valores.map((v) => el("option", { value: v, text: rotulo(v) })));
  sel.value = valores.includes(atual) ? atual : "";
  sel.classList.toggle("ativo", !!sel.value);
  return sel.value;
}

function renderConsulta() {
  const dados = dadosAtivos();
  const vazioTotal = !dados || !dados.aulas.length;
  $("view-consulta").querySelector(".hero-panel").hidden = vazioTotal;
  if (vazioTotal) {
    $("resultados").replaceChildren(estadoVazio("calendar-days", "Ainda não há horários publicados", "Quando a coordenação publicar a planilha de horários, eles aparecerão aqui.", null));
    return;
  }
  const idx = indice(dados);
  const f = estado.filtros;
  $("subtitulo-topo").textContent = dados.titulo || "Consulta por turma, professor, sala e dia";
  $("busca").value = f.q;
  $("limpar-busca").hidden = !f.q;

  // cursos (chips) — só aparecem se houver mais de um
  const cursosEl = $("filtro-cursos");
  if (!idx.cursos.includes(f.curso)) f.curso = "";
  cursosEl.replaceChildren(...(idx.cursos.length > 1 ? [
    chip("Todos os cursos", !f.curso, () => { f.curso = ""; gravarEndereco(); renderConsulta(); }),
    ...idx.cursos.map((c) => chip(c, f.curso === c, () => { f.curso = f.curso === c ? "" : c; f.turma = ""; gravarEndereco(); renderConsulta(); }, idx.aulas.filter((a) => a.curso === c).length)),
  ] : []));
  cursosEl.hidden = idx.cursos.length <= 1;

  // turmas limitadas ao curso escolhido
  const turmas = f.curso ? idx.turmas.filter((t) => idx.aulas.some((a) => a.turma === t && a.curso === f.curso)) : idx.turmas;
  f.turma = preencherSelect($("filtro-turma"), turmas, f.turma, "Todas as turmas");
  f.professor = preencherSelect($("filtro-professor"), idx.professores, f.professor, "Todos os professores");
  f.sala = preencherSelect($("filtro-sala"), idx.salas, f.sala, "Todas as salas");
  f.turno = preencherSelect($("filtro-turno"), idx.turnos, f.turno, "Todos os turnos", (t) => NOME_TURNO[t]);

  const diasEl = $("filtro-dias");
  if (!idx.dias.includes(f.dia)) f.dia = "";
  const hoje = diaDeHoje();
  diasEl.replaceChildren(
    chip("Todos os dias", !f.dia, () => { f.dia = ""; gravarEndereco(); renderConsulta(); }),
    ...idx.dias.map((d) => chip(NOME_DIA[d] + (d === hoje ? " (hoje)" : ""), f.dia === d, () => { f.dia = f.dia === d ? "" : d; gravarEndereco(); renderConsulta(); })),
  );

  // título conforme a escolha
  let titulo = "Consulte os horários", desc = "Pesquise ou filtre por curso, turma, professor, sala, turno e dia.";
  if (f.turma) { titulo = `Turma ${f.turma}`; desc = "Horário semanal da turma."; }
  else if (f.professor) { titulo = f.professor; desc = "Horário semanal do professor."; }
  else if (f.sala) { titulo = `Sala ${f.sala}`; desc = "Ocupação semanal da sala."; }
  else if (f.curso) { titulo = `Curso ${f.curso}`; }
  $("titulo-consulta").textContent = titulo;
  $("descricao-consulta").textContent = desc;

  // agrupar/exibir
  if (estado.agrupar === "dia" && estado.exibir === "grade") estado.exibir = "lista";
  for (const b of $("seg-agrupar").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.valor === estado.agrupar));
  for (const b of $("seg-exibir").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.valor === estado.exibir));
    b.disabled = b.dataset.valor === "grade" && estado.agrupar === "dia";
  }
  $("campo-ordenar").hidden = estado.exibir !== "lista";
  $("ordenar").value = estado.ordenar;
  renderResultados();
}

function chip(texto, ativo, aoClicar, n) {
  return el("button", { type: "button", class: "filtro-chip focus-ring", "aria-pressed": String(!!ativo), onclick: aoClicar }, texto, n !== undefined ? el("span", { class: "n", text: String(n) }) : null);
}

function filtrar(idx) {
  const f = estado.filtros;
  const termos = normalizar(f.q).split(" ").filter(Boolean);
  return idx.aulas.filter((a) =>
    (!f.curso || a.curso === f.curso) &&
    (!f.turma || a.turma === f.turma) &&
    (!f.professor || (a.professores || []).includes(f.professor)) &&
    (!f.sala || a.salas.includes(f.sala)) &&
    (!f.turno || a.turno === f.turno) &&
    (!f.dia || a.dia === f.dia) &&
    termos.every((t) => a.busca.includes(t)));
}

function agrupar(aulas, idx) {
  const f = estado.filtros;
  const grupos = new Map();
  const add = (chave, a) => { if (!grupos.has(chave)) grupos.set(chave, []); grupos.get(chave).push(a); };
  for (const a of aulas) {
    if (estado.agrupar === "turma") add(a.turma, a);
    else if (estado.agrupar === "professor") {
      const ps = (a.professores || []).length ? a.professores : ["Sem professor"];
      for (const p of ps) if (!f.professor || p === f.professor) add(p, a);
    } else if (estado.agrupar === "sala") {
      const ss = a.salas.length ? a.salas : [a.dia === "ead" ? "EaD" : "Sem sala"];
      for (const s of ss) if (!f.sala || s === f.sala) add(s, a);
    } else add(a.dia, a);
  }
  let chaves = [...grupos.keys()];
  if (estado.agrupar === "turma") chaves.sort((a, b) => (idx.ordemTurmas.get(a) ?? 999) - (idx.ordemTurmas.get(b) ?? 999) || comparar(a, b));
  else if (estado.agrupar === "dia") chaves.sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b));
  else chaves.sort(comparar);
  return chaves.map((k) => ({ chave: k, aulas: grupos.get(k) }));
}

function renderResultados() {
  const dados = dadosAtivos();
  if (!dados || !dados.aulas.length) return;
  const idx = indice(dados);
  const aulas = filtrar(idx);
  const f = estado.filtros;
  const ativos = Object.values(f).some(Boolean);
  $("btn-limpar-filtros").hidden = !ativos;
  const nT = new Set(aulas.map((a) => a.turma)).size, nP = new Set(aulas.flatMap((a) => a.professores || [])).size;
  const cont = $("contagem");
  cont.replaceChildren(el("strong", { text: String(aulas.length) }), aulas.length === 1 ? " aula encontrada" : " aulas encontradas",
    aulas.length ? ` · ${plural(nT, "turma", "turmas")} · ${plural(nP, "professor", "professores")}` : "",
    ativos ? ` (de ${idx.aulas.length})` : "");

  const res = $("resultados");
  if (!aulas.length) {
    res.replaceChildren(estadoVazio("search-x", "Nenhuma aula encontrada", "Nenhum horário corresponde à busca e aos filtros escolhidos. Tente outro termo ou limpe os filtros.", el("button", { type: "button", class: "botao botao-secundario", onclick: limparFiltros }, icone("undo-2"), "Limpar filtros")));
    return;
  }
  const grupos = agrupar(aulas, idx);
  const LIMITE = 60;
  const frag = grupos.slice(0, LIMITE).map((g) => renderGrupo(g, idx, dados));
  if (grupos.length > LIMITE) frag.push(el("p", { class: "notice notice-info", text: `Mostrando ${LIMITE} de ${grupos.length} grupos. Use a busca ou os filtros para encontrar os demais.` }));
  res.replaceChildren(...frag);
}

function estadoVazio(nomeIcone, titulo, texto, acao) {
  return el("section", { class: "glass-surface estado-vazio reveal" },
    el("div", { class: "icone-grande" }, icone(nomeIcone)), el("h3", { text: titulo }), el("p", { text: texto }), acao);
}

const TIPO_GRUPO = { turma: "Turma", professor: "Professor", sala: "Sala", dia: "Dia" };
function renderGrupo(g, idx, dados) {
  const tipo = estado.agrupar;
  let nome = g.chave, meta = "";
  if (tipo === "turma") {
    const t = dados.turmas.find((x) => x.id === g.chave);
    const partes = [];
    if (t) {
      if (t.curso && !g.chave.startsWith("Dep.")) partes.push(`Curso ${t.curso}`);
      if (t.periodo && !t.dependencia) partes.push(`${/sem/i.test(t.rotuloPeriodo || "") ? "Semestre" : (t.rotuloPeriodo || "Ano")} ${t.periodo}`);
      if (t.dependencia) partes.push("Dependências");
      if (t.turnos && t.turnos.length) partes.push(t.turnos.map((x) => NOME_TURNO[x]).join(" e "));
    }
    meta = partes.join(" · ");
  } else if (tipo === "dia") nome = NOME_DIA[g.chave] || g.chave;
  else if (tipo === "sala" && /^\d/.test(g.chave)) nome = `Sala ${g.chave}`;
  const periodos = g.aulas.reduce((s, a) => s + (a.periodos || 1), 0);
  meta = [meta, `${plural(g.aulas.length, "aula", "aulas")} · ${plural(periodos, "período", "períodos")}`].filter(Boolean).join(" · ");

  const acoes = el("div", { class: "grupo-acoes" });
  if (tipo !== "dia" && estado.filtros[tipo] !== g.chave && g.chave !== "Sem professor" && g.chave !== "Sem sala" && g.chave !== "EaD") {
    acoes.append(el("button", { type: "button", class: "botao-link", onclick: () => { estado.filtros[tipo] = g.chave; gravarEndereco(); renderConsulta(); window.scrollTo({ top: 0, behavior: "smooth" }); } }, icone("search"), "Só esta"));
  }
  acoes.append(el("button", { type: "button", class: "botao-link", onclick: () => window.print() }, icone("printer"), "Imprimir"));

  const corpo = estado.exibir === "grade" && tipo !== "dia" ? renderSemana(g.aulas, idx) : renderLista(g.aulas);
  return el("section", { class: "glass-surface grupo reveal" },
    el("div", { class: "grupo-topo" },
      el("div", null, el("div", { class: "grupo-tipo", text: TIPO_GRUPO[tipo] }), el("h3", { class: "grupo-nome", text: nome }), el("div", { class: "grupo-meta", text: meta })),
      acoes),
    corpo);
}

function diaDeHoje() { return [null, "seg", "ter", "qua", "qui", "sex", "sab"][new Date().getDay()]; }
function eAgora(a) {
  if (a.dia !== diaDeHoje()) return false;
  const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  return m >= a.ini && m < a.fimMin;
}

function cartaoAula(a, { comDia = false } = {}) {
  const tipo = estado.agrupar;
  const meta = el("div", { class: "aula-meta" });
  if (tipo !== "turma") meta.append(el("span", { title: "Turma" }, icone("users"), a.turma));
  if (tipo !== "professor" || (a.professores || []).length > 1) meta.append(el("span", { title: "Professor" }, icone("user"), (a.professores || []).join(", ") || "Sem professor"));
  if (a.dia === "ead") meta.append(el("span", { title: "A distância" }, icone("monitor"), "EaD"));
  else if (tipo !== "sala" || a.salas.length > 1) meta.append(el("span", { title: "Sala" }, icone("map-pin"), a.sala ? `Sala ${a.sala}` : "Sem sala"));
  const agora = eAgora(a);
  return el("article", { class: `aula dia-${a.dia}${agora ? " agora" : ""}` },
    el("div", { class: "aula-hora" },
      comDia ? el("span", { class: `pilula-dia dia-${a.dia}`, text: NOME_DIA[a.dia] }) : null,
      icone("clock"), `${a.inicio}–${a.fim}`,
      el("span", { class: "qtd-periodos", text: `· ${plural(a.periodos || 1, "período", "períodos")}` }),
      agora ? el("span", { class: "pilula-agora", text: "Agora" }) : null),
    el("div", { class: "aula-disc", text: a.disciplina }),
    meta);
}
function blocoParalelo(lista, opcoes) {
  if (lista.length === 1) return cartaoAula(lista[0], opcoes);
  return el("div", { class: "grupo-paralelo" },
    el("div", { class: "rotulo-paralelo", text: `${lista.length} aulas ao mesmo tempo (turma dividida ou aulas simultâneas)` }),
    ...lista.map((a) => cartaoAula(a, opcoes)));
}
// junta aulas que começam e terminam juntas no mesmo dia
function juntarParalelas(aulas) {
  const mapa = new Map();
  for (const a of aulas) { const k = `${a.dia}|${a.ini}|${a.fimMin}`; if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(a); }
  return [...mapa.values()].map((l) => l.sort((x, y) => comparar(x.disciplina, y.disciplina)));
}

function renderLista(aulas) {
  const ord = estado.ordenar;
  const porHorario = (a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || a.ini - b.ini;
  const criterios = {
    horario: porHorario,
    disciplina: (a, b) => comparar(a.disciplina, b.disciplina) || porHorario(a, b),
    turma: (a, b) => comparar(a.turma, b.turma) || porHorario(a, b),
    professor: (a, b) => comparar((a.professores || [""])[0] || "", (b.professores || [""])[0] || "") || porHorario(a, b),
    sala: (a, b) => comparar(a.sala || "", b.sala || "") || porHorario(a, b),
  };
  const lista = [...aulas].sort(criterios[ord] || porHorario);
  return el("div", { class: "lista-aulas" }, ...lista.map((a) => cartaoAula(a, { comDia: estado.agrupar !== "dia" })));
}

function renderSemana(aulas, idx) {
  const presenciais = aulas.filter((a) => a.dia !== "ead");
  const ead = aulas.filter((a) => a.dia === "ead").sort((a, b) => a.ini - b.ini);
  const hoje = diaDeHoje();
  const partes = [];

  if (presenciais.length) {
    // ---- computador: quadro semanal
    const diasCol = ["seg", "ter", "qua", "qui", "sex"].concat(idx.dias.includes("sab") ? ["sab"] : []);
    const slots = idx.slots;
    const slotDe = (min) => { let k = slots.findIndex((s) => s.ini === min); if (k < 0) k = slots.findIndex((s) => min > s.ini && min < s.fim); return k; };
    // células: aulas que começam no mesmo período ficam juntas; se uma aula
    // começa antes de outra terminar, as duas também ficam juntas
    const porDia = new Map();
    let usaFallback = false;
    for (const a of presenciais) {
      const k = slotDe(a.ini);
      if (k < 0) { usaFallback = true; break; }
      if (!porDia.has(a.dia)) porDia.set(a.dia, []);
      porDia.get(a.dia).push({ a, k, fimK: Math.min(slots.length - 1, k + Math.max(1, a.periodos || 1) - 1) });
    }
    if (!usaFallback) {
      const celulas = [];
      for (const [dia, lista] of porDia) {
        lista.sort((x, y) => x.k - y.k || y.fimK - x.fimK);
        let atual = null;
        for (const it of lista) {
          if (atual && it.k <= atual.fimK) { atual.aulas.push(it.a); atual.fimK = Math.max(atual.fimK, it.fimK); }
          else { atual = { dia, k: it.k, fimK: it.fimK, aulas: [it.a] }; celulas.push(atual); }
        }
      }
      const minK = Math.min(...celulas.map((c) => c.k)), maxK = Math.max(...celulas.map((c) => c.fimK));
      // linhas da grade (com uma linha fina nos intervalos longos, ex. almoço)
      const linhaDoSlot = new Map();
      const itensLinhas = [];
      let linha = 2;
      for (let k = minK; k <= maxK; k++) {
        if (k > minK && slots[k].ini - slots[k - 1].fim >= 30) { itensLinhas.push({ intervalo: true, linha }); linha++; }
        linhaDoSlot.set(k, linha);
        itensLinhas.push({ k, linha });
        linha++;
      }
      const grade = el("div", { class: "semana", style: `grid-template-columns: 4.4rem repeat(${diasCol.length}, minmax(0, 1fr)); grid-auto-rows: minmax(2.9rem, auto);` });
      grade.append(el("div", { style: "grid-row:1;grid-column:1" }));
      diasCol.forEach((d, i) => grade.append(el("div", { class: `cab-dia dia-${d}${d === hoje ? " hoje" : ""}`, style: `grid-row:1;grid-column:${i + 2}` }, NOME_DIA[d], d === hoje ? el("span", { class: "pilula-hoje", style: "margin-left:.35rem", text: "hoje" }) : null)));
      const ocupado = new Set();
      for (const c of celulas) {
        const col = diasCol.indexOf(c.dia) + 2;
        const ini = linhaDoSlot.get(c.k), fim = linhaDoSlot.get(c.fimK) + 1;
        for (let k = c.k; k <= c.fimK; k++) ocupado.add(`${c.dia}|${k}`);
        const juntas = juntarParalelas(c.aulas);
        grade.append(el("div", { class: "celula", style: `grid-column:${col};grid-row:${ini} / ${fim}` },
          ...(juntas.length === 1 ? [blocoParalelo(juntas[0])] : [blocoParalelo(c.aulas.sort((x, y) => x.ini - y.ini))])));
      }
      for (const it of itensLinhas) {
        if (it.intervalo) { grade.append(el("div", { class: "intervalo", style: `grid-row:${it.linha}` })); continue; }
        const s = slots[it.k];
        grade.append(el("div", { class: "cab-hora", style: `grid-row:${it.linha};grid-column:1` }, hhmm(s.ini), el("small", { text: hhmm(s.fim) })));
        diasCol.forEach((d, i) => { if (!ocupado.has(`${d}|${it.k}`)) grade.append(el("div", { class: "vazio-celula", style: `grid-row:${it.linha};grid-column:${i + 2}` })); });
      }
      partes.push(grade);
    }
    // ---- celular (e se a grade não puder ser montada): lista por dia
    const listaDias = el("div", { class: usaFallback ? "" : "lista-dias" });
    for (const d of DIAS.filter((x) => x !== "ead")) {
      const doDia = presenciais.filter((a) => a.dia === d).sort((a, b) => a.ini - b.ini);
      if (!doDia.length) continue;
      listaDias.append(el("div", { class: `dia-bloco dia-${d}` },
        el("h4", null, el("span", { class: "barra" }), NOME_DIA[d], d === hoje ? el("span", { class: "pilula-hoje", text: "hoje" }) : null),
        ...juntarParalelas(doDia).map((l) => blocoParalelo(l))));
    }
    partes.push(listaDias);
  }
  if (ead.length) {
    partes.push(el("div", { class: "ead-bloco" },
      el("h4", null, icone("monitor"), `A distância (EaD) — ${plural(ead.length, "aula", "aulas")}`),
      el("div", { class: "ead-lista" }, ...ead.map((a) => cartaoAula(a)))));
  }
  return el("div", null, ...partes);
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ================================================================= ADMIN
function mostrarAdmin() {
  $("view-consulta").hidden = true;
  $("view-admin").hidden = false;
  $("barra-previa").hidden = true;
  atualizarStatus();
  window.scrollTo({ top: 0 });
}

function mensagem(id, tipo, texto, extra) {
  const caixa = $(id);
  if (!texto) { caixa.hidden = true; return; }
  const icones = { success: "circle-check", error: "circle-alert", info: "info", warn: "triangle-alert" };
  caixa.className = `notice notice-${tipo}`;
  caixa.replaceChildren(icone(icones[tipo] || "info"), el("span", null, texto, extra || null));
  caixa.hidden = false;
}

function ligarAdmin() {
  $("btn-admin").addEventListener("click", () => { location.hash = "admin"; });
  $("btn-admin-voltar").addEventListener("click", () => { estado.previa = false; location.hash = ""; });
  const input = $("arquivo"), zona = $("zona-envio");
  input.addEventListener("change", () => { if (input.files[0]) processarArquivo(input.files[0]); input.value = ""; });
  zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("arrastando"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("arrastando"));
  zona.addEventListener("drop", (e) => {
    e.preventDefault(); zona.classList.remove("arrastando");
    const f = e.dataTransfer.files[0];
    if (f) processarArquivo(f);
  });
  $("btn-previa").addEventListener("click", () => {
    if (!estado.importacao) return;
    estado.previa = true;
    estado.filtros = { q: "", curso: "", turma: "", professor: "", sala: "", turno: "", dia: "" };
    history.pushState(null, "", location.pathname + location.search);
    mostrarConsulta();
    window.scrollTo({ top: 0 });
  });
  $("btn-baixar-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(dadosParaPublicar(), null, 1)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "horarios.json" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $("form-publicar").addEventListener("submit", aoPublicar);
  $("form-config").addEventListener("submit", aoConfigurar);
  $("form-senha").addEventListener("submit", aoTrocarSenha);
}

function tituloDoArquivo(nome) {
  return nome.replace(/\.(xlsx|xls)$/i, "").replace(/(\d{4})[_-](\d)\b/, "$1/$2").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

async function processarArquivo(arquivo) {
  mensagem("msg-envio", "info", `Lendo "${arquivo.name}"…`);
  for (const id of ["sec-leitura", "sec-revisao", "sec-publicar"]) $(id).hidden = true;
  mensagem("msg-publicar");
  estado.importacao = null;
  if (!/\.(xlsx|xls)$/i.test(arquivo.name)) { mensagem("msg-envio", "error", "Envie um arquivo do Excel (.xlsx)."); return; }
  if (arquivo.size > LIMITE_ARQUIVO) { mensagem("msg-envio", "error", `O arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB; o limite é ${Math.round(LIMITE_ARQUIVO / 1048576)} MB.`); return; }
  try {
    const abas = await lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()));
    const titulo = tituloDoArquivo(arquivo.name);
    const r = interpretar(abas, { arquivo: arquivo.name, titulo });
    estado.importacao = r;
    $("pub-titulo").value = titulo;
    mensagem("msg-envio", r.dados.aulas.length ? "success" : "error",
      r.dados.aulas.length ? `"${arquivo.name}" lida: ${plural(r.dados.aulas.length, "aula", "aulas")} encontradas. Revise abaixo.` : `"${arquivo.name}" foi aberta, mas nenhuma aula pôde ser lida. Veja a revisão abaixo.`);
    renderLeitura(r, arquivo.name);
    renderRevisao(r);
    renderPublicar();
    $("sec-leitura").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    console.error(e);
    mensagem("msg-envio", "error", e instanceof ErroPlanilha ? e.message : "Não foi possível ler a planilha. Confira se o arquivo é um .xlsx válido.");
  }
}

function renderLeitura(r, nome) {
  const d = r.dados;
  $("leitura-titulo").textContent = nome;
  const profs = new Set(d.aulas.flatMap((a) => a.professores)), salas = new Set(d.aulas.flatMap((a) => a.sala.split("/").map((s) => s.trim()).filter(Boolean)));
  const stat = (n, t) => el("div", { class: "estatistica" }, el("strong", { text: String(n) }), el("span", { text: t }));
  $("leitura-estatisticas").replaceChildren(stat(d.aulas.length, "aulas"), stat(d.turmas.length, "turmas"), stat(profs.size, "professores"), stat(salas.size, "salas"), stat(d.cursos.length, "cursos"));
  const nomesTipo = { dados: "Horários (fonte)", grade: "Quadros (conferência)", carga: "Carga horária (conferência)", ignorada: "Ignorada" };
  $("leitura-abas").replaceChildren(...r.abas.map((a) => el("tr", null,
    el("td", null, el("strong", { text: a.nome })),
    el("td", null, el("span", { class: `tipo-aba tipo-${a.tipo}`, text: nomesTipo[a.tipo] || a.tipo }), el("div", { class: "texto-pequeno", text: a.descricao })),
    el("td", { text: a.tipo === "dados" ? plural(a.linhas, "aula", "aulas") : a.tipo === "grade" ? plural(a.linhas, "quadro", "quadros") : a.tipo === "carga" ? plural(a.linhas, "professor", "professores") : "—" }),
    el("td", null, a.colunas && a.colunas.length ? el("div", { class: "mapa-colunas" }, ...a.colunas.map((c) => c.campo
      ? el("span", null, c.titulo, " → ", el("b", { text: ROTULO_CAMPO[c.campo] }))
      : el("span", { class: "nao", title: "Coluna não usada", text: c.titulo }))) : el("span", { class: "texto-pequeno", text: "—" })))));
}

const NOMES_NIVEL = { erro: ["Erro", "Erros"], divergencia: ["Divergência", "Divergências"], duvida: ["Dúvida", "Dúvidas"], info: ["Informação", "Informações"] };
const filtroNiveis = new Set(["erro", "divergencia", "duvida", "info"]);
function contarNiveis(avisos) { const c = { erro: 0, divergencia: 0, duvida: 0, info: 0 }; for (const a of avisos) c[a.nivel]++; return c; }

function renderRevisao(r) {
  const c = contarNiveis(r.avisos);
  const resumo = $("revisao-resumo");
  const linhas = [];
  if (c.erro) linhas.push(el("div", { class: "notice notice-error" }, icone("circle-alert"), el("span", { text: `${plural(c.erro, "linha com erro", "linhas com erro")}: ${c.erro === 1 ? "ela não será publicada" : "elas não serão publicadas"} até ser corrigida na planilha.` })));
  if (c.divergencia) linhas.push(el("div", { class: "notice notice-warn", style: "margin-top:.5rem" }, icone("triangle-alert"), el("span", { text: `${plural(c.divergencia, "divergência encontrada", "divergências encontradas")}: dados que não batem entre si (conflitos de horário, quadro diferente da tabela, carga horária…).` })));
  if (!c.erro && !c.divergencia) linhas.push(el("div", { class: "notice notice-success" }, icone("circle-check"), el("span", { text: `Nenhum erro ou divergência. ${c.duvida ? plural(c.duvida, "ponto merece", "pontos merecem") + " uma conferência (dúvidas)." : "Tudo pronto para publicar."}` })));
  resumo.replaceChildren(...linhas);

  const chips = $("revisao-niveis");
  chips.replaceChildren(...Object.keys(NOMES_NIVEL).filter((n) => c[n]).map((n) =>
    el("button", { type: "button", class: "filtro-chip nivel-chip focus-ring", "data-nivel": n, "aria-pressed": String(filtroNiveis.has(n)),
      onclick: () => { filtroNiveis.has(n) ? filtroNiveis.delete(n) : filtroNiveis.add(n); renderRevisao(r); } },
    el("span", { class: `marcador ${n}` }), NOMES_NIVEL[n][c[n] === 1 ? 0 : 1], el("span", { class: "n", text: String(c[n]) }))));

  // agrupado por categoria
  const cats = new Map();
  for (const a of r.avisos) {
    if (!filtroNiveis.has(a.nivel)) continue;
    const k = `${a.nivel}|${a.categoria}`;
    if (!cats.has(k)) cats.set(k, []);
    cats.get(k).push(a);
  }
  const lista = $("revisao-lista");
  if (!cats.size) { lista.replaceChildren(el("p", { class: "texto-pequeno", style: "margin-top:1rem", text: r.avisos.length ? "Nenhum aviso com os filtros escolhidos." : "Nenhum aviso." })); return; }
  lista.replaceChildren(...[...cats].map(([k, itens]) => {
    const [nivel, cat] = k.split("|");
    const det = el("details", { class: "categoria" },
      el("summary", null, el("span", { class: `marcador ${nivel}`, title: NOMES_NIVEL[nivel][0] }), cat, el("span", { class: "qtd", text: `(${itens.length})` }), icone("chevron-down", "chev")),
      ...itens.slice(0, 300).map((a) => el("div", { class: "aviso-item" }, a.texto, a.local ? el("span", { class: "local", text: a.local }) : null)),
      itens.length > 300 ? el("div", { class: "aviso-item texto-pequeno", text: `… e mais ${itens.length - 300}.` }) : null);
    if (nivel === "erro" || nivel === "divergencia" || itens.length <= 3) det.open = true;
    return det;
  }));
}

function dadosDaImportacao() {
  const r = estado.importacao;
  return { ...r.dados, titulo: $("pub-titulo").value.trim() || r.dados.titulo };
}
function dadosParaPublicar() {
  const c = contarNiveis(estado.importacao.avisos);
  return { ...dadosDaImportacao(), publicadoEm: new Date().toISOString(), revisao: { erros: c.erro, divergencias: c.divergencia, duvidas: c.duvida } };
}

function renderPublicar() {
  const r = estado.importacao;
  $("sec-leitura").hidden = false;
  $("sec-revisao").hidden = false;
  $("sec-publicar").hidden = false;
  const c = contarNiveis(r.avisos);
  const precisaConfirmar = c.erro + c.divergencia > 0;
  $("pub-confirmar-wrap").hidden = !precisaConfirmar;
  $("pub-confirmar").checked = false;
  $("pub-confirmar-texto").textContent = `Revisei ${c.erro ? plural(c.erro, "erro", "erros") + (c.divergencia ? " e " : "") : ""}${c.divergencia ? plural(c.divergencia, "divergência", "divergências") : ""} e quero publicar assim mesmo.`;
  const semAulas = !r.dados.aulas.length;
  $("btn-publicar").disabled = semAulas || !estado.config;
  $("btn-previa").disabled = semAulas;
  $("btn-baixar-json").disabled = semAulas;
  $("pub-sem-config").hidden = !!estado.config;
  $("form-publicar").hidden = !estado.config;
  if (!estado.config) $("detalhes-config").open = true;
}

// ---- tentativas de senha (só neste aparelho; a proteção real é a senha forte)
function bloqueio() {
  const ate = Number(guardar.ler("horarios-bloqueio") || 0);
  return ate > Date.now() ? Math.ceil((ate - Date.now()) / 1000) : 0;
}
function registrarErroSenha() {
  const n = Number(guardar.ler("horarios-erros") || 0) + 1;
  guardar.gravar("horarios-erros", String(n));
  if (n >= 5) { guardar.gravar("horarios-bloqueio", String(Date.now() + 60000)); guardar.gravar("horarios-erros", "0"); }
}

function ocupado(botao, sim, textoOcupado) {
  botao.disabled = sim;
  const span = botao.querySelector("span");
  if (sim) { botao.dataset.textoOriginal = span ? span.textContent : ""; if (span) span.textContent = textoOcupado; }
  else if (span && botao.dataset.textoOriginal) span.textContent = botao.dataset.textoOriginal;
}

async function aoPublicar(e) {
  e.preventDefault();
  if (!estado.importacao || !estado.config) return;
  const espera = bloqueio();
  if (espera) { mensagem("msg-publicar", "error", `Muitas tentativas com senha errada. Aguarde ${espera} s.`); return; }
  if (!$("pub-confirmar-wrap").hidden && !$("pub-confirmar").checked) { mensagem("msg-publicar", "warn", "Marque a confirmação de que revisou os avisos antes de publicar."); return; }
  const senha = $("pub-senha").value;
  const botao = $("btn-publicar");
  ocupado(botao, true, "Publicando…");
  mensagem("msg-publicar", "info", "Conferindo a senha e enviando os horários…");
  try {
    const dados = dadosParaPublicar();
    const link = await publicarHorarios(estado.config, senha, dados);
    guardar.gravar("horarios-erros", "0");
    estado.publicado = dados;
    atualizarStatus();
    $("pub-senha").value = "";
    mensagem("msg-publicar", "success", "Horários publicados! O site público é atualizado em cerca de 1 minuto. ",
      link ? el("a", { href: link, target: "_blank", rel: "noopener", text: "Ver o registro no GitHub" }) : null);
  } catch (err) {
    if (err instanceof ErroPublicacao && err.message === "Senha incorreta.") registrarErroSenha();
    mensagem("msg-publicar", "error", err instanceof ErroPublicacao ? err.message : "Não foi possível publicar. Tente de novo.");
    if (!(err instanceof ErroPublicacao)) console.error(err);
  } finally {
    ocupado(botao, false);
    botao.disabled = !estado.config;
  }
}

function repoPadrao() {
  if (estado.config && estado.config.repo) return estado.config.repo;
  const m = /^([\w-]+)\.github\.io$/i.exec(location.hostname);
  const pasta = location.pathname.split("/").filter(Boolean)[0];
  if (m && pasta) return `${m[1]}/${pasta}`;
  return "douglascsc/horarios";
}

function atualizarConfigUI() {
  const c = estado.config;
  $("cfg-repo").value = repoPadrao();
  $("config-status").textContent = c
    ? `Publicação configurada: repositório ${c.repo} (ramo ${c.ramo || "main"})${c.criadoEm ? ", desde " + new Date(c.criadoEm).toLocaleDateString("pt-BR") : ""}. Para publicar, só a senha é pedida.`
    : "A publicação ainda não foi configurada.";
  $("bloco-trocar-senha").hidden = !c;
  if (estado.importacao) renderPublicar();
}

async function aoConfigurar(e) {
  e.preventDefault();
  const token = $("cfg-token").value.trim(), repo = $("cfg-repo").value.trim(), senha = $("cfg-senha").value, senha2 = $("cfg-senha2").value;
  if (senha !== senha2) { mensagem("msg-config", "error", "As duas senhas não são iguais."); return; }
  if (senha.length < TAMANHO_MINIMO_SENHA) { mensagem("msg-config", "error", `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`); return; }
  const botao = $("btn-config");
  ocupado(botao, true, "Salvando…");
  mensagem("msg-config", "info", "Conferindo o token e salvando a configuração cifrada no repositório…");
  try {
    estado.config = await salvarConfiguracao({ token, repo, senha });
    for (const id of ["cfg-token", "cfg-senha", "cfg-senha2"]) $(id).value = "";
    mensagem("msg-config", "success", "Configuração salva. A partir de agora, para publicar basta a senha (em qualquer computador).");
    atualizarConfigUI();
  } catch (err) {
    mensagem("msg-config", "error", err instanceof ErroPublicacao ? err.message : "Não foi possível salvar a configuração.");
    if (!(err instanceof ErroPublicacao)) console.error(err);
  } finally { ocupado(botao, false); }
}

async function aoTrocarSenha(e) {
  e.preventDefault();
  const atual = $("sen-atual").value, nova = $("sen-nova").value, nova2 = $("sen-nova2").value;
  if (nova !== nova2) { mensagem("msg-senha", "error", "As duas senhas novas não são iguais."); return; }
  const espera = bloqueio();
  if (espera) { mensagem("msg-senha", "error", `Muitas tentativas com senha errada. Aguarde ${espera} s.`); return; }
  const botao = $("btn-senha");
  ocupado(botao, true, "Trocando…");
  try {
    estado.config = await trocarSenha(estado.config, atual, nova);
    for (const id of ["sen-atual", "sen-nova", "sen-nova2"]) $(id).value = "";
    mensagem("msg-senha", "success", "Senha trocada.");
    atualizarConfigUI();
  } catch (err) {
    if (err instanceof ErroPublicacao && err.message === "Senha incorreta.") registrarErroSenha();
    mensagem("msg-senha", "error", err instanceof ErroPublicacao ? err.message : "Não foi possível trocar a senha.");
  } finally { ocupado(botao, false); }
}

iniciar();
