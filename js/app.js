// Interface: consulta pública dos horários + área do administrador
// (envio da planilha, revisão, destino da importação, prévia e
// publicação com senha), com até MAX_PERIODOS períodos letivos.
// Todo conteúdo vindo da planilha entra na página como TEXTO
// (textContent), nunca como HTML.
import { lerPlanilha, ErroPlanilha, LIMITE_ARQUIVO } from "./leitor-xlsx.js?v=20261009k";
import { interpretar, normalizar, comparar, pesoDoCurso, DIAS, NOME_DIA, NOME_TURNO, ROTULO_CAMPO, DIA_ESPECIAL_PADRAO, MOTIVO_DIA_ESPECIAL, GRADE_OFICIAL } from "./interpretar.js?v=20261009k";
import {
  alterarPeriodos, salvarConfiguracao, trocarSenha, idDoPeriodo, ErroPublicacao,
  ARQUIVO_CONFIG, ARQUIVO_DADOS, ARQUIVO_INDICE, MAX_PERIODOS, TAMANHO_MINIMO_SENHA,
} from "./publicar.js?v=20261009k";
import { gerarArquivoOffline } from "./offline.js?v=20261009k";
import { gerarXlsx, gerarIcs, compararVersoes, chaveAula, detalheAula, dataDeTexto } from "./recursos.js?v=20261009k";

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
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataBr = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString("pt-BR") : ""; };
const guardar = {
  ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
  gravar(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
  apagar(k) { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
};
const FILTROS_VAZIOS = () => ({ q: "", curso: "", turma: "", professor: "", sala: "", turno: "", dia: "", agora: "", mudou: "" });

// Versão offline (arquivo único baixado): dados embutidos na página
const OFFLINE = (() => {
  const e = document.getElementById("dados-offline");
  if (!e) return null;
  try { return JSON.parse(e.textContent); } catch { return null; }
})();
const VERSAO = (() => { try { return new URL(import.meta.url).searchParams.get("v") || ""; } catch { return ""; } })();

// ---------------------------------------------------------------- estado
const estado = {
  indice: null,          // dados/periodos.json  { padrao, periodos: [...] }
  dadosPorPeriodo: new Map(), // id -> dados (carregados sob demanda)
  periodoId: "",         // período em consulta
  config: null,          // dados/publicacao.json
  importacao: null,      // resultado de interpretar() da planilha enviada
  previa: false,
  filtros: FILTROS_VAZIOS(),
  agrupar: "turma",
  exibir: "grade",
  ordenar: "horario",
  comparar: "",          // id do período comparado com o atual ("" = sem comparação)
};
const periodos = () => (estado.indice ? estado.indice.periodos : []);
const periodoPorId = (id) => periodos().find((p) => p.id === id);
const dadosAtivos = () => (estado.previa && estado.importacao ? dadosDaImportacao() : estado.dadosPorPeriodo.get(estado.periodoId) || null);

// ---------------------------------------------------------------- endereço (#)
const CHAVES_URL = { q: "q", curso: "curso", turma: "turma", professor: "prof", sala: "sala", turno: "turno", dia: "dia", agora: "agora", mudou: "mudou" };
function lerEndereco() {
  const h = location.hash.replace(/^#\/?/, "");
  if (!OFFLINE && (h === "admin" || h.startsWith("admin"))) return { admin: true };
  const p = new URLSearchParams(h);
  for (const [campo, chave] of Object.entries(CHAVES_URL)) estado.filtros[campo] = p.get(chave) || "";
  estado.agrupar = ["turma", "professor", "sala", "dia"].includes(p.get("agrupar")) ? p.get("agrupar") : "turma";
  estado.exibir = ["grade", "lista"].includes(p.get("ver")) ? p.get("ver") : "grade";
  estado.ordenar = p.get("ordem") || "horario";
  estado.comparar = p.get("comparar") || "";
  const pid = p.get("periodo");
  estado.periodoId = pid && periodoPorId(pid) ? pid : periodoPadrao();
  return { admin: false };
}
function enderecoDaConsulta({ comPeriodo = true } = {}) {
  const p = new URLSearchParams();
  if (comPeriodo && estado.periodoId && estado.periodoId !== periodoPadrao()) p.set("periodo", estado.periodoId);
  for (const [campo, chave] of Object.entries(CHAVES_URL)) if (estado.filtros[campo]) p.set(chave, estado.filtros[campo]);
  if (estado.agrupar !== "turma") p.set("agrupar", estado.agrupar);
  if (estado.exibir !== "grade") p.set("ver", estado.exibir);
  if (estado.ordenar !== "horario") p.set("ordem", estado.ordenar);
  if (estado.comparar) p.set("comparar", estado.comparar);
  return p.toString();
}
function gravarEndereco() {
  if (estado.previa) return;
  const s = enderecoDaConsulta();
  history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
}
function periodoPadrao() {
  const ps = periodos();
  if (!ps.length) return "";
  return ps.some((p) => p.id === estado.indice.padrao) ? estado.indice.padrao : ps[0].id;
}

// ---------------------------------------------------------------- carregar
async function carregarJson(caminho) {
  if (OFFLINE) return OFFLINE.arquivos[caminho] ?? null;
  try {
    const r = await fetch(`${caminho}?v=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
function dadosValidos(d) { return d && Array.isArray(d.aulas) && Array.isArray(d.turmas); }

async function carregarIndice() {
  const indice = await carregarJson(ARQUIVO_INDICE);
  if (indice && Array.isArray(indice.periodos)) { estado.indice = indice; return; }
  // formato antigo: um único arquivo dados/horarios.json
  const legado = await carregarJson(ARQUIVO_DADOS);
  if (dadosValidos(legado)) {
    estado.indice = { versao: 1, padrao: "atual", periodos: [{ id: "atual", nome: legado.titulo || "Atual", arquivo: ARQUIVO_DADOS, publicadoEm: legado.publicadoEm, aulas: legado.aulas.length, turmas: legado.turmas.length, legado: true }] };
    estado.dadosPorPeriodo.set("atual", legado);
  } else estado.indice = { versao: 2, padrao: null, periodos: [] };
}
async function garantirPeriodo(id) {
  if (!id || estado.dadosPorPeriodo.has(id)) return;
  const p = periodoPorId(id);
  if (!p) return;
  const d = await carregarJson(p.arquivo);
  estado.dadosPorPeriodo.set(id, dadosValidos(d) ? d : null);
}

async function iniciar() {
  $("ano-rodape").textContent = new Date().getFullYear();
  desenharIcones();
  ligarConsulta();
  ligarAdmin();
  const [, config] = await Promise.all([carregarIndice(), carregarJson(ARQUIVO_CONFIG)]);
  estado.config = config && config.token && config.sal ? config : null;
  atualizarConfigUI();
  await aoMudarEndereco();
  window.addEventListener("hashchange", aoMudarEndereco);
  window.addEventListener("afterprint", aposImprimir);
  ligarModal();
  ligarAplicativo();
  $("pular").addEventListener("click", (e) => {
    e.preventDefault();
    const alvo = !$("view-admin").hidden ? $("view-admin") : $("resultados");
    alvo.setAttribute("tabindex", "-1");
    alvo.focus();
    alvo.scrollIntoView({ block: "start" });
  });
  // planilha enviada e ainda não publicada: avisa antes de sair/recarregar
  window.addEventListener("beforeunload", (e) => { if (estado.importacao) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("view-consulta").hidden) renderResultados(); });
  // "Agora" e "começa em X min" acompanham o relógio
  setInterval(() => {
    if (document.hidden || $("view-consulta").hidden || estado.previa) return;
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest("#resultados")) return;
    renderResultados();
  }, 60000);
}

async function aoMudarEndereco() {
  const { admin } = lerEndereco();
  if (admin) { estado.previa = false; mostrarAdmin(); return; }
  if (!estado.previa) await garantirPeriodo(estado.periodoId);
  mostrarConsulta();
}

function atualizarStatus() {
  const pill = $("status-publicacao"), txt = $("status-publicacao-texto");
  if (estado.previa) { pill.className = "status-pill ambar"; txt.textContent = "Prévia (não publicada)"; return; }
  const p = periodoPorId(estado.periodoId);
  const d = dadosAtivos();
  if (!p || !d) { pill.className = "status-pill ambar"; txt.textContent = periodos().length ? "Carregando…" : "Sem horários publicados"; return; }
  pill.className = "status-pill verde";
  const quando = dataBr(d.publicadoEm || p.publicadoEm);
  // no celular: "2026/2 · 09/10/2026"; em telas maiores: "… · atualizado em …"
  txt.replaceChildren(p.nome, quando ? el("span", { class: "so-curto", text: ` · ${quando}` }) : "", quando ? el("span", { class: "so-largo", text: ` · atualizado em ${quando}` }) : "");
}

// ================================================================= APLICATIVO
// Instalação (ícone na tela inicial) e funcionamento sem internet (sw.js).
let pedidoInstalar = null;
function ligarAplicativo() {
  if (OFFLINE) {
    $("btn-admin").hidden = true;
    $("btn-offline").hidden = true;
    $("barra-offline").hidden = false;
    $("barra-offline").classList.add("arquivo-offline");
    $("barra-offline-texto").textContent = `Versão offline, gerada em ${new Date(OFFLINE.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`;
    return;
  }
  $("btn-offline").addEventListener("click", () => baixarVersaoOffline($("btn-offline"), arquivosPublicados));
  $("btn-offline-admin").addEventListener("click", () => baixarVersaoOffline($("btn-offline-admin"), arquivosPublicados));
  $("btn-offline-planilha").addEventListener("click", () => baixarVersaoOffline($("btn-offline-planilha"), arquivosDaPlanilha));
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* sem modo offline */ });
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalar = e; $("btn-instalar").hidden = false; });
  window.addEventListener("appinstalled", () => { $("btn-instalar").hidden = true; pedidoInstalar = null; });
  $("btn-instalar").addEventListener("click", async () => {
    if (!pedidoInstalar) return;
    pedidoInstalar.prompt();
    await pedidoInstalar.userChoice.catch(() => null);
    pedidoInstalar = null;
    $("btn-instalar").hidden = true;
  });
  const situacao = () => {
    const off = !navigator.onLine;
    $("barra-offline").hidden = !off;
    const p = periodoPorId(estado.periodoId);
    $("barra-offline-texto").textContent = off
      ? `Sem internet: mostrando os horários guardados neste aparelho${p && p.publicadoEm ? " (atualizados em " + dataBr(p.publicadoEm) + ")" : ""}. A publicação só funciona com internet.`
      : "";
  };
  window.addEventListener("online", situacao);
  window.addEventListener("offline", situacao);
  situacao();
}

// todos os períodos publicados
async function arquivosPublicados() {
  if (!periodos().length) throw new Error("Nenhum período publicado.");
  const arquivos = { [ARQUIVO_INDICE]: estado.indice };
  for (const p of periodos()) {
    await garantirPeriodo(p.id);
    const d = estado.dadosPorPeriodo.get(p.id);
    if (!d) throw new Error(`Não foi possível carregar o período ${p.nome}.`);
    arquivos[p.arquivo] = d;
  }
  return { arquivos, nome: "" };
}
// só a planilha enviada na área do administrador, sem publicar nada
async function arquivosDaPlanilha() {
  if (!estado.importacao) throw new Error("Envie uma planilha primeiro.");
  const nome = nomeDestino() || "Horários";
  const id = idDoPeriodo(nome) || "horarios";
  const dados = { ...dadosParaPublicar(), periodo: { id, nome } };
  const caminho = `dados/periodos/${id}.json`;
  const indice = { versao: 2, padrao: id, periodos: [{ id, nome, descricao: $("dest-descricao").value.trim(), arquivo: caminho, publicadoEm: dados.publicadoEm, aulas: dados.aulas.length, turmas: dados.turmas.length, inicioAulas: $("dest-inicio-aulas").value, fimAulas: $("dest-fim-aulas").value, recado: $("dest-recado").value.trim() }] };
  return { arquivos: { [ARQUIVO_INDICE]: indice, [caminho]: dados }, nome: id };
}
async function baixarVersaoOffline(botao, montar) {
  const span = botao.querySelector("span");
  const original = span.textContent;
  botao.disabled = true;
  span.textContent = "Preparando…";
  try {
    const { arquivos, nome } = await montar();
    const { html } = await gerarArquivoOffline({ versao: VERSAO, arquivos });
    const hoje = isoData(new Date());
    baixarArquivo(new Blob([html], { type: "text/html;charset=utf-8" }), `horarios-offline-${nome ? nome + "-" : ""}${hoje}.html`);
    span.textContent = "Baixado!";
    setTimeout(() => { span.textContent = original; }, 2500);
  } catch (e) {
    console.error(e);
    span.textContent = e && e.message && !/fetch|ler /i.test(e.message) ? e.message : "Não foi possível gerar (sem internet?)";
    setTimeout(() => { span.textContent = original; }, 4000);
  } finally { botao.disabled = false; }
}

// ================================================================= JANELA (modal)
function ligarModal() {
  $("modal-fechar").addEventListener("click", fecharModal);
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) fecharModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").hidden) fecharModal(); });
}
let focoAntesModal = null;
function abrirModal(titulo, ...conteudo) {
  focoAntesModal = document.activeElement;
  $("modal-titulo").textContent = titulo;
  $("modal-corpo").replaceChildren(...conteudo.filter((x) => x !== null && x !== undefined && x !== false));
  $("modal").hidden = false;
  document.body.classList.add("com-modal");
  document.querySelector(".app-wrapper").inert = true; // Tab e leitor de tela ficam só na janela
  setTimeout(() => ($("modal-corpo").querySelector("button, input, a") || $("modal-fechar")).focus(), 0);
}
function fecharModal() {
  $("modal").hidden = true;
  document.body.classList.remove("com-modal");
  document.querySelector(".app-wrapper").inert = false;
  if (focoAntesModal && focoAntesModal.focus) focoAntesModal.focus();
}
function baixarArquivo(blob, nome) {
  const a = el("a", { href: URL.createObjectURL(blob), download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const nomeArquivo = (t) => normalizar(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "horario";

const nomeDoGrupo = (tipo, chave) => (tipo === "turma" ? `Turma ${chave}` : tipo === "sala" ? `Sala ${chave}` : chave);

// ---- agenda (.ics)
function segundaDestaSemana() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
const isoData = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function abrirAgenda(tipo, chave, aulas) {
  const p = periodoPorId(estado.periodoId);
  const presenciais = aulas.filter((a) => a.dia !== "ead");
  const ini0 = p && p.inicioAulas ? p.inicioAulas : isoData(segundaDestaSemana());
  const fim0 = p && p.fimAulas ? p.fimAulas : isoData(new Date(dataDeTexto(ini0).getTime() + 18 * 7 * 86400000));
  const ini = el("input", { class: "text-field", type: "date", value: ini0, required: true });
  const fim = el("input", { class: "text-field", type: "date", value: fim0, required: true });
  const msg = el("p", { class: "texto-pequeno", role: "status" });
  const nomeCal = `${nomeDoGrupo(tipo, chave)}${p ? " — " + p.nome : ""}`;
  abrirModal(`Agenda — ${nomeDoGrupo(tipo, chave)}`,
    el("p", { class: "subtitulo", style: "margin-top:0", text: `Baixe um arquivo com as ${plural(presenciais.length, "aula", "aulas")} da semana, repetindo toda semana entre as datas abaixo. Abra-o no celular, ou importe no Google Agenda (Configurações → Importar).` }),
    p && p.inicioAulas ? null : el("p", { class: "texto-pequeno", text: "As datas do período não foram informadas pela coordenação; confira antes de baixar." }),
    el("div", { class: "form-grade duas" },
      el("label", null, el("span", { class: "campo-rotulo", text: "De" }), ini),
      el("label", null, el("span", { class: "campo-rotulo", text: "Até" }), fim)),
    aulas.length > presenciais.length ? el("p", { class: "texto-pequeno", style: "margin-top:.5rem", text: `Aulas EaD (${aulas.length - presenciais.length}) não entram na agenda, porque não têm dia fixo.` }) : null,
    el("div", { class: "linha-acoes" },
      el("button", { type: "button", class: "botao botao-primario", onclick: () => {
        if (!ini.value || !fim.value || ini.value > fim.value) { msg.textContent = "Confira as datas: o início precisa ser antes do fim."; return; }
        const r = gerarIcs({ aulas: presenciais, nomeCalendario: nomeCal, inicio: ini.value, fim: fim.value, idBase: `${estado.periodoId}-${nomeArquivo(chave)}` });
        baixarArquivo(new Blob([r.texto], { type: "text/calendar;charset=utf-8" }), `horario-${nomeArquivo(chave)}.ics`);
        msg.textContent = `Arquivo baixado com ${plural(r.eventos, "aula semanal", "aulas semanais")}.`;
      } }, icone("calendar-days"), "Baixar para a agenda (.ics)")),
    msg);
}

// ---- impressão (fim): limpa os modos especiais
function aposImprimir() {
  const conferencia = document.body.classList.contains("conferencia");
  document.body.classList.remove("imprimindo-um", "imprimindo-todos", "conferencia");
  if (conferencia) { estado.previa = false; location.hash = "admin"; }
}

// ================================================================= CONSULTA
function mostrarConsulta() {
  $("carregando").hidden = true;
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
      // escolher uma turma/professor/sala já agrupa por ela e volta para o
      // quadro da Semana; a sala mostra também todos os dias
      if (["turma", "professor", "sala"].includes(campo)) {
        if (e.target.value) estado.agrupar = campo;
        estado.exibir = "grade";
        estado.filtros.agora = "";
        if (campo === "sala" || campo === "turma") estado.filtros.dia = "";
      }
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
  $("link-inicio").addEventListener("click", (e) => { e.preventDefault(); if (estado.previa) return; estado.periodoId = periodoPadrao(); limparFiltros(); });
  $("btn-previa-voltar").addEventListener("click", () => { location.hash = "admin"; });
  $("btn-filtros").addEventListener("click", () => {
    const f = $("painel-filtros");
    f.classList.toggle("aberto");
    $("btn-filtros").setAttribute("aria-expanded", String(f.classList.contains("aberto")));
  });
  $("btn-imprimir-todos").addEventListener("click", () => imprimir(null));
  $("btn-excel").addEventListener("click", baixarExcel);
  ligarBarraMovel();
  $("btn-meu-horario").addEventListener("click", alternarMeuHorario);
}

function limparFiltros() {
  estado.filtros = FILTROS_VAZIOS();
  estado.agrupar = "turma";
  $("busca").value = "";
  $("limpar-busca").hidden = true;
  gravarEndereco();
  renderConsulta();
}

async function trocarPeriodo(id) {
  if (id === estado.periodoId) return;
  estado.periodoId = id;
  gravarEndereco();
  $("resultados").replaceChildren(el("p", { class: "contagem", style: "text-align:center;padding:2rem", text: "Carregando o período…" }));
  await garantirPeriodo(id);
  atualizarStatus();
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
      peso: a.peso || pesoDoCurso(a.curso, dados.pesoPorCurso || {}),
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
    especiais: especiaisDe(dados),
  };
  cacheIndice.set(dados, idx);
  return idx;
}
// dias com grade diferente (dados.periodosPorDia), ex.: quarta 15:15–16:00
function especiaisDe(dados) {
  const base = dados.periodos || [];
  const out = {};
  for (const [d, lista] of Object.entries(dados.periodosPorDia || {})) {
    const dif = lista.map(([i, f], k) => base[k] && (base[k][0] !== i || base[k][1] !== f)
      ? { ini: minutos(base[k][0]), fim: minutos(base[k][1]), iniEsp: minutos(i), fimEsp: minutos(f), intervaloIni: k > 0 ? minutos(lista[k - 1][1]) : minutos(i) } : null).filter(Boolean);
    if (dif.length) out[d] = dif;
  }
  return out;
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

function renderSeletorPeriodo() {
  const box = $("seletor-periodo");
  if (estado.previa) {
    box.replaceChildren(el("span", { class: "campo-rotulo", style: "margin:0" }, "Período letivo"),
      el("span", { class: "selo selo-previa", text: `${dadosAtivos()?.periodo?.nome || "Novo período"} · prévia` }));
    box.hidden = false;
    return;
  }
  const ps = periodos();
  box.hidden = ps.length === 0;
  if (!ps.length) return;
  const padrao = periodoPadrao();
  const seg = el("div", { class: "segmentado segmentado-periodo", role: "group", "aria-label": "Período letivo" },
    ...ps.map((p) => el("button", {
      type: "button", "aria-pressed": String(p.id === estado.periodoId), title: p.descricao || "",
      onclick: () => trocarPeriodo(p.id),
    }, icone("calendar-days"), p.nome, p.id === padrao && ps.length > 1 ? el("span", { class: "tag-atual", text: "atual" }) : null)));
  const btnComparar = ps.length > 1 ? el("button", { type: "button", class: "botao-link", "aria-pressed": String(!!estado.comparar), onclick: abrirComparacao, title: "Ver o que muda entre dois períodos" }, icone("git-compare"), estado.comparar ? "Comparando" : "Comparar") : null;
  box.replaceChildren(el("span", { class: "campo-rotulo", style: "margin:0" }, "Período letivo"), seg, btnComparar || "");
}

function renderConsulta() {
  renderSeletorPeriodo();
  const dados = dadosAtivos();
  const p = periodoPorId(estado.periodoId);
  const vazioTotal = !dados || !dados.aulas.length;
  $("bloco-consulta").hidden = vazioTotal;
  $("selo-consulta").textContent = estado.previa ? "Horários · prévia" : p ? `Horários ${p.nome}` : "Horários";
  $("selo-consulta").hidden = !$("seletor-periodo").hidden; // o seletor já mostra o período
  $("descricao-periodo").textContent = !estado.previa && p && p.descricao ? p.descricao : "";
  $("descricao-periodo").hidden = !$("descricao-periodo").textContent;
  const recado = !estado.previa && p && p.recado ? p.recado : estado.previa ? ($("dest-recado")?.value || "").trim() : "";
  $("recado-periodo").hidden = !recado;
  if (recado) $("recado-periodo").replaceChildren(icone("megaphone"), el("span", { text: recado }));
  if (estado.comparar && (estado.previa || !periodoPorId(estado.comparar) || estado.comparar === estado.periodoId)) estado.comparar = "";
  const outro = periodoPorId(estado.comparar);
  $("aviso-comparacao").hidden = !outro;
  if (outro) $("aviso-comparacao").replaceChildren(icone("git-compare"),
    el("span", null, "Comparando ", el("strong", { text: p ? p.nome : "" }), " com ", el("strong", { text: outro.nome }), ". Os filtros valem para os dois períodos."),
    el("button", { type: "button", class: "botao-link", onclick: () => { estado.comparar = ""; gravarEndereco(); renderConsulta(); } }, icone("x"), "Sair da comparação"));
  if (vazioTotal) {
    atualizarBarraMovel();
    $("titulo-consulta").textContent = "Consulte os horários";
    $("descricao-consulta").textContent = "";
    $("resultados").replaceChildren(periodos().length && !estado.previa
      ? estadoVazio("calendar-days", "Não foi possível carregar este período", "Verifique a conexão e recarregue a página.", null)
      : estadoVazio("calendar-days", "Ainda não há horários publicados", "Quando a coordenação publicar a planilha de horários, eles aparecerão aqui.", null));
    return;
  }
  const idx = indice(dados);
  const f = estado.filtros;
  $("subtitulo-topo").textContent = dados.titulo || "Consulta por turma, professor, sala e dia";
  $("busca").value = f.q;
  $("limpar-busca").hidden = !f.q;

  // cursos (chips) — só aparecem se houver mais de um; escolher um curso
  // volta para o agrupamento por turma
  const cursosEl = $("filtro-cursos");
  if (!idx.cursos.includes(f.curso)) f.curso = "";
  const escolherCurso = (c) => { f.curso = c; f.turma = ""; f.agora = ""; estado.agrupar = "turma"; estado.exibir = "grade"; gravarEndereco(); renderConsulta(); };
  cursosEl.replaceChildren(...(idx.cursos.length > 1 ? [
    chip("Todos os cursos", !f.curso, () => escolherCurso("")),
    ...idx.cursos.map((c) => chip(c, f.curso === c, () => escolherCurso(f.curso === c ? "" : c), idx.aulas.filter((a) => a.curso === c).length)),
  ] : []));
  cursosEl.hidden = idx.cursos.length <= 1;

  // turmas limitadas ao curso escolhido
  const turmas = f.curso ? idx.turmas.filter((t) => idx.aulas.some((a) => a.turma === t && a.curso === f.curso)) : idx.turmas;
  f.turma = preencherSelect($("filtro-turma"), turmas, f.turma, "Todas");
  f.professor = preencherSelect($("filtro-professor"), idx.professores, f.professor, "Todos");
  f.sala = preencherSelect($("filtro-sala"), idx.salas, f.sala, "Todas");
  f.turno = preencherSelect($("filtro-turno"), idx.turnos, f.turno, "Todos", (t) => NOME_TURNO[t]);

  const diasEl = $("filtro-dias");
  if (!idx.dias.includes(f.dia)) f.dia = "";
  const hoje = diaDeHoje();
  const podeAgora = !estado.previa && estado.periodoId === periodoPadrao() && !!hoje;
  if (!podeAgora) f.agora = "";
  const chipAgora = podeAgora ? chip("Agora", !!f.agora, () => {
    f.agora = f.agora ? "" : "1";
    if (f.agora) { f.dia = ""; estado.exibir = "lista"; } else estado.exibir = "grade";
    gravarEndereco(); renderConsulta();
  }) : null;
  if (chipAgora) { chipAgora.classList.add("chip-agora"); chipAgora.prepend(el("span", { class: "ponto-vivo", "aria-hidden": "true" })); chipAgora.title = "Aulas acontecendo neste momento"; }
  diasEl.replaceChildren(
    ...(chipAgora ? [chipAgora] : []),
    chip("Todos os dias", !f.dia && !f.agora, () => { f.dia = ""; f.agora = ""; gravarEndereco(); renderConsulta(); }),
    ...idx.dias.map((d) => chip(NOME_DIA[d] + (d === hoje ? " (hoje)" : ""), f.dia === d, () => { f.dia = f.dia === d ? "" : d; f.agora = ""; gravarEndereco(); renderConsulta(); })),
  );

  // aviso de mudanças recentes + filtro "Mudanças"
  const recentes = mudancasRecentes(dados);
  if (!recentes) f.mudou = "";
  const nMud = recentes ? idx.aulas.filter((a) => a.mudou).length : 0, nSaiu = recentes ? (dados.mudancas.removidas || []).length : 0;
  const aviso = $("aviso-mudancas");
  aviso.hidden = !recentes || (!nMud && !nSaiu);
  if (!aviso.hidden) {
    aviso.replaceChildren(icone("refresh-cw"), el("span", null,
      el("strong", { text: `Horário atualizado em ${dataBr(dados.mudancas.em)}: ` }),
      [nMud ? plural(nMud, "aula nova ou alterada", "aulas novas ou alteradas") : "", nSaiu ? `${plural(nSaiu, "aula saiu", "aulas saíram")} do horário` : ""].filter(Boolean).join(" e "), ". "),
      el("button", { type: "button", class: "botao-link", "aria-pressed": String(!!f.mudou), onclick: () => { f.mudou = f.mudou ? "" : "1"; if (f.mudou) { estado.exibir = "lista"; f.agora = ""; } gravarEndereco(); renderConsulta(); } }, f.mudou ? "Ver tudo" : "Ver só as mudanças"));
  }

  // título conforme a escolha
  let titulo = "Consulte os horários", desc = "Pesquise ou filtre por curso, turma, professor, sala, turno e dia.";
  if (f.turma) { titulo = `Turma ${f.turma}`; desc = "Horário semanal da turma."; }
  else if (f.professor) { titulo = f.professor; desc = "Horário semanal do professor."; }
  else if (f.sala) { titulo = `Sala ${f.sala}`; desc = "Ocupação semanal da sala."; }
  else if (f.curso) { titulo = `Curso ${f.curso}`; desc = "Turmas do curso. Escolha uma turma para ver só o horário dela."; }
  if (f.mudou) { titulo = "Mudanças recentes"; desc = `Aulas novas ou alteradas na atualização de ${dataBr(dados.mudancas.em)}${dados.mudancas.de ? " (comparado com a versão anterior)" : ""}.`; }
  if (f.agora) { titulo = f.turma || f.professor || f.sala || f.curso ? `${titulo} — agora` : "Acontecendo agora"; desc = `Aulas em andamento às ${hhmm(new Date().getHours() * 60 + new Date().getMinutes())}. A lista se atualiza sozinha.`; }
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

  // celular: botão "Filtros" mostra quantos estão ativos
  const nAtivos = ["curso", "turma", "professor", "sala", "turno", "dia", "agora", "mudou"].filter((k) => f[k]).length;
  $("btn-filtros-n").textContent = nAtivos ? String(nAtivos) : "";
  $("btn-filtros-n").hidden = !nAtivos;
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
    (!f.agora || situacaoAgora(a)?.agora) &&
    (!f.mudou || !!a.mudou) &&
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
  const chaves = [...grupos.keys()];
  if (estado.agrupar === "turma") chaves.sort((a, b) => (idx.ordemTurmas.get(a) ?? 999) - (idx.ordemTurmas.get(b) ?? 999) || comparar(a, b));
  else if (estado.agrupar === "dia") chaves.sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b));
  else chaves.sort(comparar);
  return chaves.map((k) => ({ chave: k, aulas: grupos.get(k) }));
}

// períodos que CONTAM (PCP em dobro), sem mudar a duração real
const periodosContados = (aulas) => aulas.reduce((s, a) => s + (a.periodos || 1) * (a.peso || 1), 0);

function renderResultados() {
  const dados = dadosAtivos();
  if (!dados || !dados.aulas.length) return;
  const idx = indice(dados);
  const aulas = filtrar(idx);
  const f = estado.filtros;
  const ativos = Object.values(f).some(Boolean);
  $("btn-limpar-filtros").hidden = !ativos;
  renderMeuHorario(ativos);
  const nT = new Set(aulas.map((a) => a.turma)).size, nP = new Set(aulas.flatMap((a) => a.professores || [])).size;
  $("contagem").replaceChildren(el("strong", { text: String(aulas.length) }), aulas.length === 1 ? " aula encontrada" : " aulas encontradas",
    aulas.length ? ` · ${plural(nT, "turma", "turmas")} · ${plural(nP, "professor", "professores")}` : "",
    ativos ? ` (de ${idx.aulas.length})` : "");

  const res = $("resultados");
  atualizarBarraMovel();
  if (estado.comparar && periodoPorId(estado.comparar)) { renderComparacaoPeriodos(aulas); return; }
  if (!aulas.length && f.agora) {
    $("btn-imprimir-todos").hidden = true;
    const m = new Date().getHours() * 60 + new Date().getMinutes();
    const semAgora = { ...f, agora: "" };
    const proximas = idx.aulas.filter((a) => a.dia === diaDeHoje() && a.ini > m).filter((a) => {
      const g = estado.filtros; estado.filtros = semAgora; const ok = filtrar({ aulas: [a] }).length > 0; estado.filtros = g; return ok;
    }).sort((a, b) => a.ini - b.ini);
    const texto = proximas.length ? `A próxima aula de hoje começa às ${proximas[0].inicio} (${proximas[0].disciplina}, ${proximas[0].turma}).` : "Não há mais aulas hoje com os filtros escolhidos.";
    res.replaceChildren(estadoVazio("clock", "Nenhuma aula acontecendo agora", texto,
      el("button", { type: "button", class: "botao botao-secundario", onclick: () => { f.agora = ""; f.dia = diaDeHoje(); estado.exibir = "lista"; gravarEndereco(); renderConsulta(); } }, icone("calendar-days"), "Ver as aulas de hoje")));
    return;
  }
  if (!aulas.length) {
    $("btn-imprimir-todos").hidden = true;
    res.replaceChildren(estadoVazio("search-x", "Nenhuma aula encontrada", "Nenhum horário corresponde à busca e aos filtros escolhidos. Tente outro termo ou limpe os filtros.", el("button", { type: "button", class: "botao botao-secundario", onclick: limparFiltros }, icone("undo-2"), "Limpar filtros")));
    return;
  }
  const grupos = agrupar(aulas, idx);
  const LIMITE = 60;
  $("btn-imprimir-todos").hidden = false;
  $("btn-offline").hidden = !!OFFLINE || estado.previa;
  $("btn-imprimir-todos-texto").textContent = grupos.length > 1 ? `Imprimir ${Math.min(grupos.length, LIMITE)} quadros` : "Imprimir";
  $("btn-imprimir-todos").title = grupos.length > 1 ? "Um quadro por página, em A4 deitada" : "";
  const frag = grupos.slice(0, LIMITE).map((g) => renderGrupo(g, idx, dados));
  if (grupos.length > LIMITE) frag.push(el("p", { class: "notice notice-info", text: `Mostrando ${LIMITE} de ${grupos.length} grupos. Use a busca ou os filtros para encontrar os demais.` }));
  res.replaceChildren(...frag);
}

function estadoVazio(nomeIcone, titulo, texto, acao) {
  return el("section", { class: "glass-surface estado-vazio reveal" },
    el("div", { class: "icone-grande" }, icone(nomeIcone)), el("h3", { text: titulo }), el("p", { text: texto }), acao);
}

// ---- impressão: um quadro por página; o botão de um quadro imprime só ele
function imprimir(grupoEl) {
  document.querySelectorAll(".grupo.imprimir-este").forEach((g) => g.classList.remove("imprimir-este"));
  document.body.classList.remove("imprimindo-um", "imprimindo-todos");
  if (grupoEl) { grupoEl.classList.add("imprimir-este"); document.body.classList.add("imprimindo-um"); }
  else document.body.classList.add("imprimindo-todos");
  const p = periodoPorId(estado.periodoId);
  const d = dadosAtivos();
  const cab = [d && d.titulo, estado.previa ? "Prévia" : p ? "Período " + p.nome : "", `impresso em ${new Date().toLocaleDateString("pt-BR")}`].filter(Boolean).join(" · ");
  document.querySelectorAll(".grupo .so-impressao").forEach((e) => { e.textContent = cab; });
  window.print();
}

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
  const reais = g.aulas.reduce((s, a) => s + (a.periodos || 1), 0), contados = periodosContados(g.aulas);
  const txtPeriodos = contados !== reais
    ? `${plural(contados, "período", "períodos")} (PCP conta em dobro)`
    : plural(reais, "período", "períodos");
  meta = [meta, `${plural(g.aulas.length, "aula", "aulas")} · ${txtPeriodos}`].filter(Boolean).join(" · ");

  const secao = el("section", { class: "glass-surface grupo reveal" });
  const acoes = el("div", { class: "grupo-acoes" });
  if (tipo !== "dia" && estado.filtros[tipo] !== g.chave && !["Sem professor", "Sem sala", "EaD"].includes(g.chave)) {
    acoes.append(el("button", { type: "button", class: "botao-link", onclick: () => { estado.filtros[tipo] = g.chave; gravarEndereco(); renderConsulta(); window.scrollTo({ top: 0, behavior: "smooth" }); } }, icone("search"), "Só esta"));
  }
  const especial = ["Sem professor", "Sem sala", "EaD"].includes(g.chave);
  if (tipo !== "dia" && !especial && !estado.previa) {
    if (g.aulas.some((a) => a.dia !== "ead")) acoes.append(el("button", { type: "button", class: "botao-link", title: "Colocar este horário na agenda do celular", onclick: () => abrirAgenda(tipo, g.chave, g.aulas) }, icone("calendar-days"), "Agenda"));
  }
  acoes.append(el("button", { type: "button", class: "botao-link", onclick: () => imprimir(secao) }, icone("printer"), "Imprimir"));

  const corpo = estado.exibir === "grade" && tipo !== "dia" ? renderSemana(g.aulas, idx) : renderLista(g.aulas);
  const saiu = removidasRecentes(dados).filter((a) => (tipo === "turma" && a.turma === g.chave) || (tipo === "professor" && (a.professores || []).includes(g.chave))
    || (tipo === "sala" && (a.sala || "").split("/").map((x) => x.trim()).includes(g.chave)) || (tipo === "dia" && a.dia === g.chave));
  if (saiu.length) corpo.append(el("div", { class: "nota-mudanca" }, icone("info"),
    el("span", null, el("strong", { text: `Saiu na atualização de ${dataBr(dados.mudancas.em)}: ` }),
      saiu.map((a) => `${a.disciplina} (${a.turma}, ${NOME_DIA[a.dia]} ${a.inicio}–${a.fim})`).join("; "), ".")));
  secao.append(
    el("div", { class: "grupo-topo" },
      el("div", { class: "grupo-titulo" },
        el("img", { src: "assets/ifsul.png", alt: "", class: "logo-impressao" }),
        el("div", null, el("div", { class: "grupo-tipo", text: { turma: "Horário da turma", professor: "Horário do(a) professor(a)", sala: "Ocupação da sala", dia: "Dia" }[tipo] }), el("h3", { class: "grupo-nome", text: nome }), el("div", { class: "grupo-meta", text: meta }),
          el("div", { class: "so-impressao" }))),
      acoes),
    corpo);
  return secao;
}

function diaDeHoje() { return [null, "seg", "ter", "qua", "qui", "sex", "sab"][new Date().getDay()]; }
// "Mudou recentemente": até DIAS_DESTAQUE_MUDANCA dias depois da atualização
const DIAS_DESTAQUE_MUDANCA = 14;
function mudancasRecentes(dados) {
  if (!dados || !dados.mudancas || !dados.mudancas.em || estado.previa) return false;
  return Date.now() - new Date(dados.mudancas.em).getTime() < DIAS_DESTAQUE_MUDANCA * 86400000;
}
function removidasRecentes(dados) { return mudancasRecentes(dados) ? dados.mudancas.removidas || [] : []; }

// "agora" (em andamento) ou minutos até começar (até 30 min antes), só
// no período atual e no dia de hoje
function situacaoAgora(a) {
  if (estado.previa || estado.periodoId !== periodoPadrao()) return null;
  if (a.dia !== diaDeHoje()) return null;
  const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  if (m >= a.ini && m < a.fimMin) return { agora: true, resta: a.fimMin - m };
  if (a.ini > m && a.ini - m <= 30) return { agora: false, falta: a.ini - m };
  return null;
}

function cartaoAula(a, { comDia = false } = {}) {
  const tipo = estado.agrupar;
  const meta = el("div", { class: "aula-meta" });
  if (tipo !== "turma") meta.append(el("span", { title: "Turma" }, icone("users"), a.turma));
  if (tipo !== "professor" || (a.professores || []).length > 1) meta.append(el("span", { title: "Professor" }, icone("user"), (a.professores || []).join(", ") || "Sem professor"));
  if (a.dia === "ead") meta.append(el("span", { title: "A distância" }, icone("monitor"), "EaD"));
  else if (tipo !== "sala" || a.salas.length > 1) meta.append(el("span", { title: "Sala" }, icone("map-pin"), a.sala ? `Sala ${a.sala}` : "Sem sala"));
  const sit = situacaoAgora(a);
  const agora = sit && sit.agora;
  const n = a.periodos || 1;
  const txt = a.peso && a.peso !== 1 ? `· ${plural(n, "período", "períodos")} (conta ${n * a.peso})` : `· ${plural(n, "período", "períodos")}`;
  return el("article", { class: `aula dia-${a.dia}${agora ? " agora" : ""}` },
    el("div", { class: "aula-hora" },
      comDia ? el("span", { class: `pilula-dia dia-${a.dia}`, text: NOME_DIA[a.dia] }) : null,
      icone("clock"), `${a.inicio}–${a.fim}`,
      el("span", { class: "qtd-periodos", text: txt }),
      agora ? el("span", { class: "pilula-agora", title: `Termina em ${sit.resta} min`, text: "Agora" }) : null,
      sit && !sit.agora ? el("span", { class: "pilula-em-breve", text: `começa em ${sit.falta} min` }) : null,
      a.mudou && mudancasRecentes(dadosAtivos()) ? el("span", { class: "pilula-mudou", title: a.mudou === "alterada" && a.antes ? `Antes: ${a.antes}` : "Aula nova neste horário", text: a.mudou === "alterada" ? "mudou" : "nova" }) : null),
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

function renderSemana(aulas, idx, dados = dadosAtivos() || {}) {
  const presenciais = aulas.filter((a) => a.dia !== "ead");
  const ead = aulas.filter((a) => a.dia === "ead").sort((a, b) => a.ini - b.ini);
  const hoje = estado.periodoId === periodoPadrao() && !estado.previa ? diaDeHoje() : null;
  const partes = [];

  if (presenciais.length) {
    // ---- computador (e impressão): quadro semanal
    const diasCol = ["seg", "ter", "qua", "qui", "sex"].concat(idx.dias.includes("sab") ? ["sab"] : []);
    const slots = idx.slots;
    const slotDe = (min) => { let k = slots.findIndex((s) => s.ini === min); if (k < 0) k = slots.findIndex((s) => min > s.ini && min < s.fim); return k; };
    // aulas que começam no mesmo período ficam juntas; se uma começa antes
    // de outra terminar, as duas também ficam juntas
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
      const grade = el("div", { class: "semana", style: `grid-template-columns: 4.4rem repeat(${diasCol.length}, minmax(0, 1fr));` });
      grade.append(el("div", { style: "grid-row:1;grid-column:1" }));
      diasCol.forEach((d, i) => grade.append(el("div", { class: `cab-dia dia-${d}${d === hoje ? " hoje" : ""}`, style: `grid-row:1;grid-column:${i + 2}` }, NOME_DIA[d], d === hoje ? el("span", { class: "pilula-hoje", style: "margin-left:.35rem", text: "hoje" }) : null,
        idx.especiais[d] && presenciais.some((a) => a.dia === d) ? el("small", { class: "cab-especial", text: "horário especial" }) : null)));
      const ocupado = new Set();
      for (const c of celulas) {
        const col = diasCol.indexOf(c.dia) + 2;
        const ini = linhaDoSlot.get(c.k), fim = linhaDoSlot.get(c.fimK) + 1;
        for (let k = c.k; k <= c.fimK; k++) ocupado.add(`${c.dia}|${k}`);
        const juntas = juntarParalelas(c.aulas);
        grade.append(el("div", { class: "celula", style: `grid-column:${col};grid-row:${ini} / ${fim}` },
          juntas.length === 1 ? blocoParalelo(juntas[0]) : blocoParalelo(c.aulas.sort((x, y) => x.ini - y.ini))));
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
  // nota sobre dias com horário especial (ex.: quarta, intervalo 15:00–15:15)
  for (const [d, dif] of Object.entries(idx.especiais)) {
    if (!presenciais.some((a) => a.dia === d && dif.some((x) => a.ini < x.fimEsp && a.fimMin > x.iniEsp))) continue;
    partes.push(el("p", { class: "nota-especial" }, icone("info"),
      `${NOME_DIA[d]}: intervalos diferenciados${dados.motivoDiaEspecial ? ` (${dados.motivoDiaEspecial})` : ""} — ${dif.map((x) => `${hhmm(x.iniEsp)}–${hhmm(x.fimEsp)} em vez de ${hhmm(x.ini)}–${hhmm(x.fim)}`).join(", ")} (intervalos ${dif.map((x) => `${hhmm(x.intervaloIni)}–${hhmm(x.iniEsp)}`).join(" e ")}).`));
  }
  if (ead.length) {
    partes.push(el("div", { class: "ead-bloco" },
      el("h4", null, icone("monitor"), `A distância (EaD) — ${plural(ead.length, "aula", "aulas")}`),
      el("div", { class: "ead-lista" }, ...ead.map((a) => cartaoAula(a)))));
  }
  return el("div", null, ...partes);
}

// ---- Excel: as aulas mostradas (com os filtros atuais)
function baixarExcel() {
  const dados = dadosAtivos();
  if (!dados || !dados.aulas.length) return;
  const idx = indice(dados);
  const aulas = filtrar(idx).slice().sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || a.ini - b.ini || comparar(a.turma, b.turma));
  const p = periodoPorId(estado.periodoId);
  const nomeP = estado.previa ? (dados.periodo && dados.periodo.nome) || "prévia" : p ? p.nome : "";
  const comPeso = aulas.some((a) => (a.peso || 1) !== 1);
  const cabecalho = ["Período letivo", "Dia", "Início", "Fim", "Períodos", ...(comPeso ? ["Períodos (contagem)"] : []), "Turma", "Curso", "Disciplina", "Professor(es)", "Sala", "Turno"];
  const linhas = aulas.map((a) => [nomeP, NOME_DIA[a.dia], a.inicio, a.fim, a.periodos || 1, ...(comPeso ? [(a.periodos || 1) * (a.peso || 1)] : []), a.turma, a.curso, a.disciplina, (a.professores || []).join(", "), a.sala || (a.dia === "ead" ? "EaD" : ""), NOME_TURNO[a.turno] || ""]);
  const desc = descricaoFiltros(estado.filtros);
  const blob = gerarXlsx({ nomeAba: desc || "Horários", cabecalho, linhas });
  baixarArquivo(blob, `horarios-${nomeArquivo(desc || "completo")}${nomeP ? "-" + nomeArquivo(nomeP) : ""}.xlsx`);
}

// ---- comparar o período atual com outro (mesmos filtros nos dois)
function abrirComparacao() {
  if (estado.comparar) { estado.comparar = ""; gravarEndereco(); renderConsulta(); return; }
  const atual = periodoPorId(estado.periodoId);
  const outros = periodos().filter((p) => p.id !== estado.periodoId);
  if (outros.length === 1) { estado.comparar = outros[0].id; gravarEndereco(); renderConsulta(); return; }
  abrirModal(`Comparar ${atual ? atual.nome : ""} com…`,
    el("p", { class: "subtitulo", style: "margin-top:0", text: "Mostra o que só existe em um dos períodos e o que mudou de professor, sala ou horário de término. Os filtros escolhidos (turma, professor, sala…) valem para os dois." }),
    el("div", { class: "linha-acoes" }, ...outros.map((o) => el("button", { type: "button", class: "botao botao-secundario", onclick: () => { fecharModal(); estado.comparar = o.id; gravarEndereco(); renderConsulta(); } }, icone("calendar-days"), o.nome))));
}
async function renderComparacaoPeriodos(aulasA) {
  const res = $("resultados");
  const pA = periodoPorId(estado.periodoId), pB = periodoPorId(estado.comparar);
  $("btn-imprimir-todos").hidden = true;
  if (!estado.dadosPorPeriodo.has(pB.id)) {
    res.replaceChildren(el("p", { class: "contagem", style: "text-align:center;padding:2rem", text: `Carregando ${pB.nome}…` }));
    await garantirPeriodo(pB.id);
    if (estado.comparar !== pB.id) return;
  }
  const dB = estado.dadosPorPeriodo.get(pB.id);
  if (!dB) { res.replaceChildren(estadoVazio("circle-alert", `Não foi possível carregar ${pB.nome}`, "Verifique a conexão e tente de novo.", null)); return; }
  const aulasB = filtrar(indice(dB));
  const c = compararVersoes(aulasA, aulasB);
  const ordem = (l) => l.slice().sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || minutos(a.inicio) - minutos(b.inicio) || comparar(a.turma, b.turma));
  const bloco = (titulo, desc, itens, render) => el("section", { class: "glass-surface grupo reveal" },
    el("div", { class: "grupo-topo" }, el("div", null, el("div", { class: "grupo-tipo", text: "Comparação" }), el("h3", { class: "grupo-nome", text: titulo }), el("div", { class: "grupo-meta", text: desc }))),
    itens.length ? el("div", { class: "lista-aulas" }, ...itens.map(render)) : el("p", { class: "texto-pequeno", style: "margin-top:.75rem", text: "Nenhuma." }));
  const comNota = (a, nota) => { const card = cartaoAula(a, { comDia: true }); card.append(el("div", { class: "nota-comparacao", text: nota })); return card; };
  res.replaceChildren(
    el("section", { class: "glass-surface grupo resumo-comparacao reveal" },
      el("div", { class: "estatisticas estatisticas-4" },
        el("div", { class: "estatistica" }, el("strong", { text: String(c.iguais) }), el("span", { text: "iguais nos dois" })),
        el("div", { class: "estatistica est-nova" }, el("strong", { text: String(c.novas.length) }), el("span", { text: `só em ${pB.nome}` })),
        el("div", { class: "estatistica est-saiu" }, el("strong", { text: String(c.removidas.length) }), el("span", { text: `só em ${pA ? pA.nome : ""}` })),
        el("div", { class: "estatistica est-mudou" }, el("strong", { text: String(c.mudadas.length) }), el("span", { text: "mudaram professor, sala ou término" })))),
    bloco(`Só em ${pB.nome}`, "Aulas que aparecem no outro período e não neste.", ordem(c.novas), (a) => cartaoAula(a, { comDia: true })),
    bloco(`Só em ${pA ? pA.nome : ""}`, "Aulas deste período que não existem no outro.", ordem(c.removidas), (a) => cartaoAula(a, { comDia: true })),
    bloco("Mudaram", `Mesma turma, dia, horário e disciplina, com outro professor, sala ou término em ${pB.nome}.`, c.mudadas.sort((x, y) => DIAS.indexOf(x[1].dia) - DIAS.indexOf(y[1].dia) || minutos(x[1].inicio) - minutos(y[1].inicio)),
      ([a, b]) => comNota(b, `Em ${pA ? pA.nome : ""}: ${detalheAula(a)}${a.fim !== b.fim ? ", até " + a.fim : ""}`)));
}

// ---- barra fixa no celular: Filtros, Agora, Hoje e Topo à mão
function ligarBarraMovel() {
  $("barra-movel").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-acao]");
    if (!b || b.disabled) return;
    const f = estado.filtros;
    if (b.dataset.acao === "filtros") {
      $("painel-filtros").classList.add("aberto");
      $("btn-filtros").setAttribute("aria-expanded", "true");
      $("btn-filtros").scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => $("btn-filtros").focus({ preventScroll: true }), 400);
      return;
    }
    if (b.dataset.acao === "topo") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (b.dataset.acao === "agora") { f.agora = f.agora ? "" : "1"; f.dia = ""; f.mudou = ""; estado.exibir = f.agora ? "lista" : "grade"; }
    if (b.dataset.acao === "hoje") { const h = diaDeHoje(); f.dia = f.dia === h ? "" : h; f.agora = ""; }
    gravarEndereco(); renderConsulta();
    $("resultados").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // teclado virtual aberto: a barra sai do caminho
  document.addEventListener("focusin", (e) => { if (e.target.matches && e.target.matches("input, select, textarea")) document.body.classList.add("digitando"); });
  document.addEventListener("focusout", () => document.body.classList.remove("digitando"));
}
function atualizarBarraMovel() {
  const bar = $("barra-movel");
  const dados = dadosAtivos();
  const mostrar = !!dados && dados.aulas.length > 0 && !$("view-consulta").hidden;
  bar.hidden = !mostrar;
  document.body.classList.toggle("com-barra", mostrar);
  if (!mostrar) return;
  const f = estado.filtros, idx = indice(dados), hoje = diaDeHoje();
  const podeAgora = !estado.previa && estado.periodoId === periodoPadrao() && !!hoje;
  const bAgora = bar.querySelector('[data-acao="agora"]'), bHoje = bar.querySelector('[data-acao="hoje"]');
  bAgora.hidden = !podeAgora;
  bAgora.setAttribute("aria-pressed", String(!!f.agora));
  bHoje.disabled = !hoje || !idx.dias.includes(hoje);
  bHoje.setAttribute("aria-pressed", String(!!hoje && f.dia === hoje));
  const n = ["curso", "turma", "professor", "sala", "turno", "dia", "agora", "mudou"].filter((k) => f[k]).length;
  $("barra-movel-n").textContent = n ? String(n) : "";
  $("barra-movel-n").hidden = !n;
}

// ---- "Meu horário": guarda a consulta atual neste aparelho
const CHAVE_MEU = "horarios-meu";
function descricaoFiltros(f) {
  const partes = [];
  if (f.turma) partes.push(`Turma ${f.turma}`);
  if (f.professor) partes.push(f.professor);
  if (f.sala) partes.push(`Sala ${f.sala}`);
  if (f.curso && !f.turma) partes.push(`Curso ${f.curso}`);
  if (f.turno) partes.push(NOME_TURNO[f.turno]);
  if (f.dia) partes.push(NOME_DIA[f.dia]);
  if (f.q) partes.push(`"${f.q}"`);
  if (f.agora) partes.push("Agora");
  if (f.mudou) partes.push("Mudanças");
  return partes.join(" · ");
}
function lerMeu() { try { return JSON.parse(guardar.ler(CHAVE_MEU) || "null"); } catch { return null; } }
function renderMeuHorario(ativos) {
  const meu = lerMeu();
  const atual = enderecoDaConsulta({ comPeriodo: false });
  const salvoAqui = meu && meu.endereco === atual;
  const btn = $("btn-meu-horario");
  btn.hidden = estado.previa || (!ativos && !salvoAqui);
  btn.setAttribute("aria-pressed", String(!!salvoAqui));
  $("btn-meu-horario-texto").textContent = salvoAqui ? "Este é o meu horário" : "Salvar como meu horário";
  const atalho = $("atalho-meu");
  if (meu && !ativos && !estado.previa) {
    atalho.replaceChildren(icone("star"), el("span", null, "Meu horário: ", el("strong", { text: meu.descricao })),
      el("button", { type: "button", class: "botao-link", onclick: () => { location.hash = meu.endereco; } }, "Abrir"),
      el("button", { type: "button", class: "botao-link", onclick: () => { guardar.apagar(CHAVE_MEU); renderResultados(); } }, "Esquecer"));
    atalho.hidden = false;
  } else atalho.hidden = true;
}
function alternarMeuHorario() {
  const meu = lerMeu();
  const atual = enderecoDaConsulta({ comPeriodo: false });
  if (meu && meu.endereco === atual) guardar.apagar(CHAVE_MEU);
  else guardar.gravar(CHAVE_MEU, JSON.stringify({ endereco: atual, descricao: descricaoFiltros(estado.filtros) || "Consulta salva" }));
  renderResultados();
}

// ================================================================= ADMIN
function mostrarAdmin() {
  $("carregando").hidden = true;
  $("barra-movel").hidden = true;
  document.body.classList.remove("com-barra");
  $("view-consulta").hidden = true;
  $("view-admin").hidden = false;
  $("barra-previa").hidden = true;
  estado.periodoId = periodoPadrao();
  atualizarStatus();
  garantirPeriodo(estado.periodoId).then(atualizarStatus);
  renderPeriodosAdmin();
  if (estado.importacao) renderDestino();
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
    estado.filtros = FILTROS_VAZIOS();
    estado.agrupar = "turma";
    history.pushState(null, "", location.pathname + location.search);
    mostrarConsulta();
    window.scrollTo({ top: 0 });
  });
  $("btn-pdf-conferencia").addEventListener("click", pdfConferencia);
  $("btn-previa-pdf").addEventListener("click", pdfConferencia);
  $("btn-baixar-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(dadosParaPublicar(), null, 1)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `horarios-${idDoPeriodo(nomeDestino()) || "periodo"}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $("form-destino").addEventListener("submit", (e) => e.preventDefault());
  $("dest-dia-especial").addEventListener("change", (e) => {
    const imp = estado.importacao;
    if (!imp) return;
    imp.opcoes.diaEspecial = e.target.value;
    const novo = interpretar(imp.abasLidas, imp.opcoes);
    Object.assign(imp, { dados: novo.dados, avisos: novo.avisos, pendencias: novo.pendencias, abas: novo.abas });
    renderRevisao(imp); renderPendencias(); renderPublicarConfig(); renderDiaEspecial(); renderResumoDestino(); renderComparacao();
  });
  $("form-destino").addEventListener("change", renderDestino);
  $("form-destino").addEventListener("input", (e) => { if (e.target.matches("input[type=text]")) renderResumoDestino(); });
  $("btn-cancelar-importacao").addEventListener("click", cancelarImportacao);
  $("form-publicar").addEventListener("submit", aoPublicar);
  $("form-config").addEventListener("submit", aoConfigurar);
  $("form-senha").addEventListener("submit", aoTrocarSenha);
}

// "Horários - IFSul - SG - 2026_2.xlsx" → "2026/2"
function periodoDoArquivo(nome) {
  const m = /(20\d{2})\s*[_/.\-]\s*([12])(?!\d)/.exec(nome);
  return m ? `${m[1]}/${m[2]}` : "";
}
function tituloDoArquivo(nome) {
  return nome.replace(/\.(xlsx|xls)$/i, "").replace(/(\d{4})[_-](\d)\b/, "$1/$2").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function esconderEtapas() {
  for (const id of ["sec-leitura", "sec-revisao", "sec-destino", "sec-publicar"]) $(id).hidden = true;
}

function cancelarImportacao() {
  estado.importacao = null;
  estado.previa = false;
  esconderEtapas();
  mensagem("msg-publicar");
  mensagem("msg-envio", "info", "Importação cancelada. Nenhum dado do site foi alterado.");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function processarArquivo(arquivo) {
  mensagem("msg-envio", "info", `Lendo "${arquivo.name}"…`);
  esconderEtapas();
  mensagem("msg-publicar");
  estado.importacao = null;
  if (!/\.(xlsx|xls)$/i.test(arquivo.name)) { mensagem("msg-envio", "error", "Envie um arquivo do Excel (.xlsx)."); return; }
  if (arquivo.size > LIMITE_ARQUIVO) { mensagem("msg-envio", "error", `O arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB; o limite é ${Math.round(LIMITE_ARQUIVO / 1048576)} MB.`); return; }
  try {
    const abas = await lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()));
    await garantirPeriodo(periodoPadrao());
    const titulo = tituloDoArquivo(arquivo.name);
    const opcoes = { arquivo: arquivo.name, titulo, decisoesInicio: {} };
    const r = interpretar(abas, opcoes);
    Object.assign(r, { abasLidas: abas, opcoes, nomeSugerido: periodoDoArquivo(arquivo.name) });
    estado.importacao = r;
    // o título mostrado no site é o do período em uso, se houver
    const atual = estado.dadosPorPeriodo.get(periodoPadrao());
    $("pub-titulo").value = atual && atual.titulo ? atual.titulo : titulo;
    prepararDestino(r);
    mensagem("msg-envio", r.dados.aulas.length ? "success" : "error",
      r.dados.aulas.length ? `"${arquivo.name}" lida: ${plural(r.dados.aulas.length, "aula", "aulas")} encontradas. Revise abaixo; nada foi publicado ainda.` : `"${arquivo.name}" foi aberta, mas nenhuma aula pôde ser lida. Veja a revisão abaixo.`);
    renderLeitura(r, arquivo.name);
    renderRevisao(r);
    renderPendencias();
    $("sec-leitura").hidden = false;
    $("sec-revisao").hidden = false;
    $("sec-destino").hidden = !r.dados.aulas.length;
    $("sec-publicar").hidden = !r.dados.aulas.length;
    renderDestino();
    renderPublicarConfig();
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
  const linhas = [];
  if (c.erro) linhas.push(el("div", { class: "notice notice-error" }, icone("circle-alert"), el("span", { text: `${plural(c.erro, "linha com erro", "linhas com erro")}: ${c.erro === 1 ? "ela não será publicada" : "elas não serão publicadas"} até ser corrigida na planilha.` })));
  if (c.divergencia) linhas.push(el("div", { class: "notice notice-warn", style: "margin-top:.5rem" }, icone("triangle-alert"), el("span", { text: `${plural(c.divergencia, "divergência encontrada", "divergências encontradas")}: dados que não batem entre si (conflitos de horário, quadro diferente da tabela, carga horária…).` })));
  if (!c.erro && !c.divergencia) linhas.push(el("div", { class: "notice notice-success" }, icone("circle-check"), el("span", { text: `Nenhum erro ou divergência. ${c.duvida ? plural(c.duvida, "ponto merece", "pontos merecem") + " uma conferência (dúvidas)." : "Tudo pronto para publicar."}` })));
  $("revisao-resumo").replaceChildren(...linhas);

  $("revisao-niveis").replaceChildren(...Object.keys(NOMES_NIVEL).filter((n) => c[n]).map((n) =>
    el("button", { type: "button", class: "filtro-chip nivel-chip focus-ring", "data-nivel": n, "aria-pressed": String(filtroNiveis.has(n)),
      onclick: () => { filtroNiveis.has(n) ? filtroNiveis.delete(n) : filtroNiveis.add(n); renderRevisao(r); } },
    el("span", { class: `marcador ${n}` }), NOMES_NIVEL[n][c[n] === 1 ? 0 : 1], el("span", { class: "n", text: String(c[n]) }))));

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

// ---------------------------------------------------------------- decisões pendentes
// Início fora da grade: o administrador autoriza (mantém) ou põe na grade.
function decidir(chave, decisao) {
  const imp = estado.importacao;
  if (chave) imp.opcoes.decisoesInicio[chave] = decisao;
  else imp.opcoes.decisoesInicio = {};
  const novo = interpretar(imp.abasLidas, imp.opcoes);
  Object.assign(imp, { dados: novo.dados, avisos: novo.avisos, pendencias: novo.pendencias, abas: novo.abas });
  renderRevisao(imp);
  renderPendencias();
  renderPublicarConfig();
  renderResumoDestino();
}
function renderPendencias() {
  const imp = estado.importacao;
  const box = $("revisao-pendencias");
  const pend = imp ? imp.pendencias : [];
  const decididas = imp ? Object.entries(imp.opcoes.decisoesInicio) : [];
  if (!pend.length && !decididas.length) { box.hidden = true; return; }
  box.hidden = false;
  const inicios = pend.filter((p) => p.tipo === "inicio");
  box.replaceChildren(...[
    el("h4", { class: "subtitulo-bloco" }, icone("clock"), pend.length ? `Decida antes de publicar (${pend.length})` : "Decisões tomadas"),
    inicios.length ? el("p", { class: "texto-pequeno", style: "margin-top:.5rem", text: "Estas aulas começam num horário que não está na grade. Mantenha o horário informado (autorizar) ou coloque a aula no horário da grade." }) : null,
    ...inicios.map((p) => el("div", { class: "pendencia" },
      el("div", null, el("strong", { text: `${p.disciplina} · ${p.turma} · ${NOME_DIA[p.dia]}` }),
        el("div", { class: "texto-pequeno", text: `Começa às ${p.inicio}; o período da grade é ${p.grade}–${p.gradeFim}.` }),
        el("span", { class: "local", text: p.local })),
      el("div", { class: "pendencia-acoes" },
        el("button", { type: "button", class: "botao botao-secundario", onclick: () => decidir(p.chave, "manter") }, icone("check"), `Manter ${p.inicio}`),
        el("button", { type: "button", class: "botao botao-suave", onclick: () => decidir(p.chave, "grade") }, icone("clock"), `Colocar às ${p.grade}`)))),
    decididas.length ? el("div", { class: "texto-pequeno", style: "margin-top:.6rem" },
      `${plural(decididas.length, "decisão tomada", "decisões tomadas")}. `,
      el("button", { type: "button", class: "botao-link", style: "display:inline-flex;min-height:0", onclick: () => decidir(null) }, "Refazer as decisões")) : null,
  ].filter(Boolean));
}

// ---------------------------------------------------------------- destino da importação
// A: substituir um período existente · B: adicionar novo · C: cancelar
function prepararDestino(r) {
  const ps = periodos().filter((p) => !p.legado);
  const sugestao = r.nomeSugerido;
  const igual = ps.find((p) => idDoPeriodo(p.nome) === idDoPeriodo(sugestao));
  const modo = !ps.length ? "novo" : igual ? "substituir" : "novo";
  for (const radio of document.querySelectorAll("input[name=dest-modo]")) radio.checked = radio.value === modo;
  preencherSelectPeriodos($("dest-alvo"), ps, igual ? igual.id : periodoPadrao());
  preencherSelectPeriodos($("dest-sai"), ps, "", "Escolha o período que sai…");
  $("dest-nome-novo").value = igual ? "" : sugestao;
  const alvo = periodoPorId($("dest-alvo").value);
  $("dest-nome-subst").value = alvo ? alvo.nome : "";
  $("dest-descricao").value = "";
  const base = igual || null;
  $("dest-inicio-aulas").value = base && base.inicioAulas ? base.inicioAulas : "";
  $("dest-fim-aulas").value = base && base.fimAulas ? base.fimAulas : "";
  $("dest-recado").value = base && base.recado ? base.recado : "";
  $("dest-padrao").checked = !ps.length;
  $("dest-confirmar").checked = false;
  $("dest-alvo").dataset.anterior = $("dest-alvo").value;
}
function preencherSelectPeriodos(sel, ps, valor, vazio) {
  sel.replaceChildren(...(vazio ? [el("option", { value: "", text: vazio })] : []),
    ...ps.map((p) => el("option", { value: p.id, text: `${p.nome} — ${plural(p.aulas || 0, "aula", "aulas")}${p.publicadoEm ? ", publicado em " + dataBr(p.publicadoEm) : ""}${p.id === periodoPadrao() ? " (atual)" : ""}` })));
  sel.value = ps.some((p) => p.id === valor) ? valor : (vazio ? "" : ps[0]?.id || "");
}
const modoDestino = () => document.querySelector("input[name=dest-modo]:checked")?.value || "novo";
function nomeDestino() {
  return (modoDestino() === "substituir" ? $("dest-nome-subst").value : $("dest-nome-novo").value).trim();
}
function periodoQueSai() {
  const ps = periodos().filter((p) => !p.legado);
  if (modoDestino() === "substituir") return periodoPorId($("dest-alvo").value) || null;
  if (ps.length >= MAX_PERIODOS) return periodoPorId($("dest-sai").value) || null;
  return null;
}

// Intervalos diferenciados (reunião de ensino): quarta por padrão; o
// administrador pode mudar o dia (ou nenhum) caso um dia mude.
function renderDiaEspecial() {
  const imp = estado.importacao;
  if (!imp) return;
  const dia = imp.opcoes.diaEspecial === undefined ? DIA_ESPECIAL_PADRAO : imp.opcoes.diaEspecial;
  const sel = $("dest-dia-especial");
  if (!sel.options.length) {
    sel.append(...["seg", "ter", "qua", "qui", "sex"].map((d) => el("option", { value: d, text: NOME_DIA[d] + (d === DIA_ESPECIAL_PADRAO ? " (padrão)" : "") })),
      el("option", { value: "", text: "Nenhum dia (todos iguais)" }));
  }
  sel.value = dia;
  const base = GRADE_OFICIAL.normal, esp = GRADE_OFICIAL.especial;
  const intervalos = esp.map((p, i) => (i > 0 && p[0] !== esp[i - 1][1] && p[0] !== base[i][0] ? `${esp[i - 1][1]}–${p[0]}` : null)).filter(Boolean);
  $("dest-dia-especial-texto").textContent = dia
    ? `Na ${NOME_DIA[dia].toLowerCase()}-feira os intervalos são diferenciados por causa da ${MOTIVO_DIA_ESPECIAL}: ${intervalos.join(" e ")}. As aulas desse dia seguem esse horário, mesmo que a planilha diga outro.`
    : `Nenhum dia terá intervalos diferenciados: todos seguem a mesma grade.`;
}

function renderDestino() {
  if (!estado.importacao) return;
  renderDiaEspecial();
  const ps = periodos().filter((p) => !p.legado);
  const cheio = ps.length >= MAX_PERIODOS;
  const opSubst = document.querySelector("input[name=dest-modo][value=substituir]");
  opSubst.disabled = !ps.length;
  if (!ps.length && opSubst.checked) document.querySelector("input[name=dest-modo][value=novo]").checked = true;
  const modo = modoDestino();
  $("dest-bloco-substituir").hidden = modo !== "substituir";
  $("dest-bloco-novo").hidden = modo !== "novo";
  $("dest-cheio").hidden = !(modo === "novo" && cheio);
  $("dest-cheio-texto").textContent = `Já existem ${MAX_PERIODOS} períodos publicados (${ps.map((p) => p.nome).join(", ")}), o máximo. Para adicionar um novo, escolha qual deles será substituído; os outros continuam como estão.`;
  $("dest-vagas").textContent = ps.length
    ? `Períodos publicados: ${ps.length} de ${MAX_PERIODOS} (${ps.map((p) => p.nome).join(", ")}).`
    : `Nenhum período publicado ainda (máximo de ${MAX_PERIODOS}).`;
  // ao trocar o período a substituir, o nome acompanha
  if ($("dest-alvo").dataset.anterior !== $("dest-alvo").value) {
    const alvo = periodoPorId($("dest-alvo").value);
    $("dest-nome-subst").value = alvo ? alvo.nome : "";
    $("dest-alvo").dataset.anterior = $("dest-alvo").value;
  }
  for (const card of document.querySelectorAll(".opcao-destino")) card.classList.toggle("selecionada", card.querySelector("input")?.checked);
  renderResumoDestino();
  renderComparacao();
}

function renderResumoDestino() {
  if (!estado.importacao) return;
  const nome = nomeDestino();
  const sai = periodoQueSai();
  const ps = periodos().filter((p) => !p.legado);
  const novos = estado.importacao.dados.aulas.length;
  const outros = ps.filter((p) => !sai || p.id !== sai.id).filter((p) => idDoPeriodo(p.nome) !== idDoPeriodo(nome) || (sai && p.id === sai.id));
  const box = $("dest-resumo");
  let problema = "";
  if (!idDoPeriodo(nome)) problema = "Informe o nome do período letivo (ex.: 2027/1).";
  else if (modoDestino() === "novo" && ps.some((p) => idDoPeriodo(p.nome) === idDoPeriodo(nome))) problema = `Já existe o período "${nome}". Para atualizá-lo, escolha "Substituir os horários de um período existente".`;
  else if (sai && ps.some((p) => p.id !== sai.id && idDoPeriodo(p.nome) === idDoPeriodo(nome))) problema = `Já existe outro período chamado "${nome}". Use outro nome.`;
  else if (modoDestino() === "novo" && ps.length >= MAX_PERIODOS && !sai) problema = "Escolha qual período será substituído pelo novo.";
  else if (estado.importacao.pendencias && estado.importacao.pendencias.length) problema = `Falta decidir ${plural(estado.importacao.pendencias.length, "aula com início fora da grade", "aulas com início fora da grade")} (etapa 2, Revisão).`;
  if (problema) {
    box.className = "notice notice-error";
    box.replaceChildren(icone("circle-alert"), el("span", { text: problema }));
  } else if (sai) {
    box.className = "notice notice-warn";
    box.replaceChildren(icone("triangle-alert"), el("span", null,
      el("strong", { text: `Atenção: o período ${sai.nome} será substituído.` }),
      ` Os ${plural(sai.aulas || 0, "horário", "horários")} publicados em ${dataBr(sai.publicadoEm) || "data desconhecida"} serão trocados pelos ${novos} desta planilha${idDoPeriodo(sai.nome) !== idDoPeriodo(nome) ? `, com o nome "${nome}"` : ""}.`,
      outros.length ? ` ${outros.length === 1 ? "O período" : "Os períodos"} ${outros.map((p) => p.nome).join(", ")} ${outros.length === 1 ? "continua" : "continuam"} intacto${outros.length === 1 ? "" : "s"}.` : "",
      " A versão anterior fica guardada no histórico de versões."));
  } else {
    box.className = "notice notice-info";
    box.replaceChildren(icone("info"), el("span", null,
      el("strong", { text: `Será criado o período ${nome}` }), ` com ${novos} horários.`,
      ps.length ? ` ${ps.length === 1 ? "O período" : "Os períodos"} ${ps.map((p) => p.nome).join(", ")} ${ps.length === 1 ? "continua" : "continuam"} disponíve${ps.length === 1 ? "l" : "is"}.` : ""));
  }
  box.hidden = false;
  $("dest-confirmar-wrap").hidden = !sai || !!problema;
  $("dest-confirmar-texto").textContent = sai ? `Confirmo que os horários de ${sai.nome} serão substituídos.` : "";
  $("btn-publicar").disabled = !!problema || !estado.config;
  $("btn-publicar-texto").textContent = sai ? `Substituir ${sai.nome}` : `Publicar ${nome || "novo período"}`;
}

// Comparação com o período que será substituído
async function renderComparacao() {
  const box = $("dest-comparacao");
  const sai = periodoQueSai();
  if (!sai || !estado.importacao) { box.hidden = true; return; }
  const pedido = sai.id;
  box.hidden = false;
  box.replaceChildren(el("p", { class: "texto-pequeno", text: `Comparando com ${sai.nome}…` }));
  await garantirPeriodo(sai.id);
  if (periodoQueSai()?.id !== pedido) return;
  const antigos = estado.dadosPorPeriodo.get(sai.id);
  if (!antigos) { box.replaceChildren(el("p", { class: "texto-pequeno", text: `Não foi possível carregar ${sai.nome} para comparar.` })); return; }
  const desc = (a) => `${a.turma} · ${NOME_DIA[a.dia]} ${a.inicio}–${a.fim} · ${a.disciplina}`;
  const detalhe = detalheAula;
  const { novas, removidas, mudadas, iguais } = compararVersoes(antigos.aulas, estado.importacao.dados.aulas);
  const bloco = (titulo, itens, fmt, classe) => !itens.length ? null : el("details", { class: "categoria" },
    el("summary", null, el("span", { class: `marcador ${classe}` }), titulo, el("span", { class: "qtd", text: `(${itens.length})` }), icone("chevron-down", "chev")),
    ...itens.slice(0, 200).map((x) => el("div", { class: "aviso-item" }, fmt(x))),
    itens.length > 200 ? el("div", { class: "aviso-item texto-pequeno", text: `… e mais ${itens.length - 200}.` }) : null);
  box.replaceChildren(...[
    el("h4", { class: "subtitulo-bloco" }, icone("list"), `O que muda em relação a ${sai.nome}`),
    el("div", { class: "estatisticas estatisticas-4" },
      el("div", { class: "estatistica" }, el("strong", { text: String(iguais) }), el("span", { text: "sem mudança" })),
      el("div", { class: "estatistica est-nova" }, el("strong", { text: String(novas.length) }), el("span", { text: "novas" })),
      el("div", { class: "estatistica est-mudou" }, el("strong", { text: String(mudadas.length) }), el("span", { text: "com professor, sala ou fim diferentes" })),
      el("div", { class: "estatistica est-saiu" }, el("strong", { text: String(removidas.length) }), el("span", { text: "saem" }))),
    !novas.length && !removidas.length && !mudadas.length ? el("p", { class: "texto-pequeno", style: "margin-top:.75rem", text: "A nova planilha tem exatamente os mesmos horários." }) : null,
    bloco("Aulas novas", novas, (a) => [desc(a), el("span", { class: "local", text: detalhe(a) })], "info"),
    bloco("Aulas alteradas", mudadas, ([a, n]) => [desc(n), el("span", { class: "local", text: `antes: ${detalhe(a)}${a.fim !== n.fim ? " até " + a.fim : ""} → agora: ${detalhe(n)}${a.fim !== n.fim ? " até " + n.fim : ""}` })], "duvida"),
    bloco("Aulas que saem", removidas, (a) => [desc(a), el("span", { class: "local", text: detalhe(a) })], "divergencia"),
  ].filter(Boolean));
}

// PDF de conferência: capa com o resumo da revisão + quadro de todas as
// turmas da planilha enviada, marcado como não publicado.
async function pdfConferencia() {
  const imp = estado.importacao;
  if (!imp) return;
  const sai = periodoQueSai();
  let comp = null;
  if (sai) { await garantirPeriodo(sai.id); const a = estado.dadosPorPeriodo.get(sai.id); if (a) comp = compararVersoes(a.aulas, imp.dados.aulas); }
  const c = contarNiveis(imp.avisos);
  const d = imp.dados;
  const profs = new Set(d.aulas.flatMap((a) => a.professores)).size;
  const itens = imp.avisos.filter((a) => a.nivel !== "info");
  const nomes = { erro: "Erro", divergencia: "Divergência", duvida: "Dúvida" };
  $("capa-conferencia").replaceChildren(...[
    el("div", { class: "capa-selo", text: "Conferência — NÃO PUBLICADO" }),
    el("h1", { text: `Horários ${nomeDestino() || "(período sem nome)"}` }),
    el("p", { text: [$("pub-titulo").value.trim(), `planilha "${d.arquivo}"`, `gerado em ${new Date().toLocaleString("pt-BR")}`].filter(Boolean).join(" · ") }),
    el("table", { class: "capa-tabela" }, el("tbody", null,
      el("tr", null, el("th", { text: "Aulas" }), el("td", { text: String(d.aulas.length) }), el("th", { text: "Turmas" }), el("td", { text: String(d.turmas.length) }), el("th", { text: "Professores" }), el("td", { text: String(profs) })),
      el("tr", null, el("th", { text: "Erros" }), el("td", { text: String(c.erro) }), el("th", { text: "Divergências" }), el("td", { text: String(c.divergencia) }), el("th", { text: "Dúvidas" }), el("td", { text: String(c.duvida) })))),
    el("p", { class: "capa-destino", text: $("dest-resumo").textContent || "" }),
    comp ? el("p", { text: `Em relação a ${sai.nome}: ${comp.iguais} sem mudança, ${comp.novas.length} novas, ${comp.mudadas.length} alteradas, ${comp.removidas.length} saem.` }) : null,
    el("p", { text: $("dest-dia-especial-texto").textContent || "" }),
    el("h2", { text: itens.length ? "Pontos da revisão" : "Revisão: nenhum erro, divergência ou dúvida." }),
    itens.length ? el("ol", { class: "capa-lista" }, ...itens.slice(0, 80).map((a) => el("li", null, el("strong", { text: `${nomes[a.nivel]} · ${a.categoria}: ` }), a.texto, a.local ? el("em", { text: ` (${a.local})` }) : null))) : null,
    itens.length > 80 ? el("p", { text: `… e mais ${itens.length - 80}. Veja a lista completa na área do administrador.` }) : null,
  ].filter(Boolean));
  estado.previa = true;
  estado.filtros = FILTROS_VAZIOS();
  estado.agrupar = "turma";
  estado.exibir = "grade";
  history.pushState(null, "", location.pathname + location.search);
  mostrarConsulta();
  document.body.classList.add("conferencia");
  imprimir(null);
}

function dadosDaImportacao() {
  const r = estado.importacao;
  return { ...r.dados, titulo: $("pub-titulo").value.trim() || r.dados.titulo, periodo: { id: idDoPeriodo(nomeDestino()), nome: nomeDestino() } };
}
function dadosParaPublicar() {
  const c = contarNiveis(estado.importacao.avisos);
  return { ...dadosDaImportacao(), publicadoEm: new Date().toISOString(), revisao: { erros: c.erro, divergencias: c.divergencia, duvidas: c.duvida } };
}

// ---------------------------------------------------------------- períodos publicados (gerenciar)
let acaoPeriodo = null; // { tipo, id }
function renderPeriodosAdmin() {
  const lista = $("lista-periodos");
  const ps = periodos();
  $("periodos-vagas").textContent = `${ps.filter((p) => !p.legado).length} de ${MAX_PERIODOS} espaços ocupados.`;
  if (!ps.length) { lista.replaceChildren(el("p", { class: "texto-pequeno", style: "margin-top:1rem", text: "Nenhum período publicado ainda. Envie uma planilha acima." })); return; }
  const padrao = periodoPadrao();
  lista.replaceChildren(...ps.map((p) => {
    const aberto = acaoPeriodo && acaoPeriodo.id === p.id;
    const card = el("article", { class: `periodo-card${p.id === padrao ? " padrao" : ""}` },
      el("div", { class: "periodo-topo" },
        el("div", null,
          el("div", { class: "periodo-nome" }, icone("calendar-days"), p.nome, p.id === padrao ? el("span", { class: "tag-atual", text: "atual (abre primeiro)" }) : null),
          p.descricao ? el("div", { class: "texto-pequeno", text: p.descricao }) : null,
          el("div", { class: "texto-pequeno", text: [`${plural(p.aulas || 0, "aula", "aulas")}`, `${plural(p.turmas || 0, "turma", "turmas")}`, p.publicadoEm ? `publicado em ${dataBr(p.publicadoEm)}` : "", p.inicioAulas && p.fimAulas ? `aulas de ${dataBr(p.inicioAulas + "T12:00")} a ${dataBr(p.fimAulas + "T12:00")}` : "", p.planilha ? `planilha "${p.planilha}"` : ""].filter(Boolean).join(" · ") })),
        el("div", { class: "grupo-acoes" },
          el("button", { type: "button", class: "botao-link", onclick: () => { estado.previa = false; location.hash = p.id === padrao ? "" : `periodo=${encodeURIComponent(p.id)}`; } }, icone("eye"), "Ver"),
          p.legado ? null : [
            p.id !== padrao ? el("button", { type: "button", class: "botao-link", onclick: () => abrirAcao("padrao", p.id) }, icone("check"), "Tornar atual") : null,
            el("button", { type: "button", class: "botao-link", onclick: () => abrirAcao("renomear", p.id) }, icone("pencil"), "Editar"),
            el("button", { type: "button", class: "botao-link botao-perigo", onclick: () => abrirAcao("remover", p.id) }, icone("trash-2"), "Remover"),
          ])));
    if (aberto) card.append(formAcao(p));
    return card;
  }));
}
function abrirAcao(tipo, id) { acaoPeriodo = { tipo, id }; renderPeriodosAdmin(); setTimeout(() => $("acao-senha")?.focus(), 0); }
function formAcao(p) {
  const { tipo } = acaoPeriodo;
  const textos = {
    padrao: `"${p.nome}" passará a ser o período que abre primeiro no site. Nenhum horário muda.`,
    renomear: `Mude o nome, a observação, o recado ou as datas do período "${p.nome}". Os horários não mudam.`,
    remover: `O período "${p.nome}" (${plural(p.aulas || 0, "aula", "aulas")}) deixará de aparecer no site. Os outros períodos não mudam. A versão removida fica guardada no histórico de versões.`,
  };
  const form = el("form", { class: `acao-periodo acao-${tipo}`, autocomplete: "off" },
    el("div", { class: `notice ${tipo === "remover" ? "notice-error" : "notice-info"}` }, icone(tipo === "remover" ? "triangle-alert" : "info"), el("span", { text: textos[tipo] })),
    tipo === "renomear" ? el("div", { class: "form-grade duas" },
      el("label", null, el("span", { class: "campo-rotulo", text: "Nome do período" }), el("input", { id: "acao-nome", class: "text-field", type: "text", maxlength: "40", value: p.nome, required: true })),
      el("label", null, el("span", { class: "campo-rotulo", text: "Observação (opcional)" }), el("input", { id: "acao-descricao", class: "text-field", type: "text", maxlength: "120", value: p.descricao || "", placeholder: "Ex.: válido a partir de 15/10" })),
      el("label", { class: "campo-largo" }, el("span", { class: "campo-rotulo", text: "Recado em destaque no site (opcional)" }), el("input", { id: "acao-recado", class: "text-field", type: "text", maxlength: "240", value: p.recado || "", placeholder: "Ex.: Horário provisório até 20/10" })),
      el("label", null, el("span", { class: "campo-rotulo", text: "Primeiro dia de aula (agenda)" }), el("input", { id: "acao-inicio", class: "text-field", type: "date", value: p.inicioAulas || "" })),
      el("label", null, el("span", { class: "campo-rotulo", text: "Último dia de aula (agenda)" }), el("input", { id: "acao-fim", class: "text-field", type: "date", value: p.fimAulas || "" }))) : null,
    tipo === "remover" ? el("label", { class: "caixa-marcar" }, el("input", { id: "acao-confirmar", type: "checkbox", required: true }), el("span", { text: `Confirmo a remoção de ${p.nome}.` })) : null,
    el("div", { class: "form-grade duas" },
      el("label", null, el("span", { class: "campo-rotulo", text: "Senha de publicação" }), el("input", { id: "acao-senha", class: "text-field", type: "password", autocomplete: "current-password", required: true }))),
    el("div", { class: "linha-acoes" },
      el("button", { type: "submit", class: `botao ${tipo === "remover" ? "botao-perigo-cheio" : "botao-primario"}` }, el("span", { text: { padrao: "Tornar atual", renomear: "Salvar", remover: `Remover ${p.nome}` }[tipo] })),
      el("button", { type: "button", class: "botao botao-secundario", onclick: () => { acaoPeriodo = null; renderPeriodosAdmin(); } }, "Cancelar")),
    el("div", { id: "msg-acao", class: "notice", style: "margin-top:1rem", hidden: true, role: "status" }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!estado.config) { mensagem("msg-acao", "error", "Configure a publicação primeiro (abaixo)."); return; }
    const espera = bloqueio();
    if (espera) { mensagem("msg-acao", "error", `Muitas tentativas com senha errada. Aguarde ${espera} s.`); return; }
    const botao = form.querySelector("button[type=submit]");
    ocupado(botao, true, "Gravando…");
    try {
      const op = { tipo, id: p.id };
      if (tipo === "renomear") {
        op.nome = $("acao-nome").value; op.descricao = $("acao-descricao").value;
        op.datas = { inicio: $("acao-inicio").value, fim: $("acao-fim").value };
        op.recado = $("acao-recado").value;
        if (op.datas.inicio && op.datas.fim && op.datas.inicio > op.datas.fim) throw new ErroPublicacao("O primeiro dia de aula precisa ser antes do último.");
      }
      const r = await alterarPeriodos(estado.config, $("acao-senha").value, op);
      guardar.gravar("horarios-erros", "0");
      estado.indice = r.indice;
      if (tipo === "remover") estado.dadosPorPeriodo.delete(p.id);
      acaoPeriodo = null;
      renderPeriodosAdmin();
      if (estado.importacao) { prepararDestino(estado.importacao); renderDestino(); }
      mensagem("msg-periodos", "success", "Feito. O site público é atualizado em cerca de 1 minuto.");
    } catch (err) {
      if (err instanceof ErroPublicacao && err.message === "Senha incorreta.") registrarErroSenha();
      mensagem("msg-acao", "error", err instanceof ErroPublicacao ? err.message : "Não foi possível gravar. Tente de novo.");
      if (!(err instanceof ErroPublicacao)) console.error(err);
      ocupado(botao, false);
    }
  });
  return form;
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
  const c = contarNiveis(estado.importacao.avisos);
  if (c.erro + c.divergencia > 0 && !$("pub-confirmar").checked) { mensagem("msg-publicar", "warn", "Marque a confirmação de que revisou os avisos antes de publicar."); return; }
  const sai = periodoQueSai();
  if (sai && !$("dest-confirmar").checked) { mensagem("msg-publicar", "warn", `Confirme, na etapa 3, que os horários de ${sai.nome} serão substituídos.`); $("sec-destino").scrollIntoView({ behavior: "smooth" }); return; }
  const botao = $("btn-publicar");
  ocupado(botao, true, "Publicando…");
  mensagem("msg-publicar", "info", "Conferindo a senha e enviando os horários…");
  try {
    const modo = modoDestino();
    const ini = $("dest-inicio-aulas").value, fimA = $("dest-fim-aulas").value;
    if (ini && fimA && ini > fimA) throw new ErroPublicacao("Confira as datas do período: o primeiro dia de aula precisa ser antes do último.");
    const dados = dadosParaPublicar();
    // marca o que mudou em relação à versão substituída (só se for o mesmo
    // semestre: se mais da metade mudou, é outro horário e não se marca)
    if (sai) {
      await garantirPeriodo(sai.id);
      const antigos = estado.dadosPorPeriodo.get(sai.id);
      if (antigos) {
        const c = compararVersoes(antigos.aulas, dados.aulas);
        const total = c.novas.length + c.mudadas.length + c.removidas.length;
        if (total && total <= dados.aulas.length / 2) {
          const antes = new Map(c.mudadas.map(([a, n]) => [chaveAula(n), detalheAula(a) + (a.fim !== n.fim ? ` até ${a.fim}` : "")]));
          const novasK = new Set(c.novas.map(chaveAula));
          dados.aulas = dados.aulas.map((a) => {
            const k = chaveAula(a);
            if (novasK.has(k)) return { ...a, mudou: "nova" };
            if (antes.has(k)) return { ...a, mudou: "alterada", antes: antes.get(k) };
            return a;
          });
          dados.mudancas = { em: new Date().toISOString(), de: sai.nome, removidas: c.removidas.map(({ turma, dia, inicio, fim, disciplina, professores, sala }) => ({ turma, dia, inicio, fim, disciplina, professores, sala })) };
        }
      }
    }
    const op = {
      tipo: "importar", modo, nome: nomeDestino(), descricao: $("dest-descricao").value.trim(), padrao: $("dest-padrao").checked,
      alvo: modo === "substituir" ? $("dest-alvo").value : undefined,
      sai: modo === "novo" && sai ? sai.id : undefined,
      datas: { inicio: ini, fim: fimA },
      recado: $("dest-recado").value,
      dados,
    };
    const r = await alterarPeriodos(estado.config, $("pub-senha").value, op);
    guardar.gravar("horarios-erros", "0");
    estado.indice = r.indice;
    if (sai) estado.dadosPorPeriodo.delete(sai.id);
    if (r.dados) estado.dadosPorPeriodo.set(r.dados.periodo.id, r.dados);
    $("pub-senha").value = "";
    const nome = op.nome;
    estado.importacao = null;
    esconderEtapas();
    renderPeriodosAdmin();
    mensagem("msg-envio", "success", `${sai ? `Período ${sai.nome} substituído` : `Período ${nome} publicado`}! O site público é atualizado em cerca de 1 minuto.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    if (err instanceof ErroPublicacao && err.message === "Senha incorreta.") registrarErroSenha();
    mensagem("msg-publicar", "error", err instanceof ErroPublicacao ? err.message : "Não foi possível publicar. Nada foi alterado. Tente de novo.");
    if (!(err instanceof ErroPublicacao)) console.error(err);
  } finally {
    ocupado(botao, false);
    if (estado.importacao) renderResumoDestino();
  }
}

function renderPublicarConfig() {
  const r = estado.importacao;
  $("pub-sem-config").hidden = !!estado.config;
  $("form-publicar").hidden = !estado.config;
  if (!estado.config) $("detalhes-config").open = true;
  if (!r) return;
  const c = contarNiveis(r.avisos);
  $("pub-confirmar-wrap").hidden = c.erro + c.divergencia === 0;
  $("pub-confirmar-texto").textContent = `Revisei ${c.erro ? plural(c.erro, "erro", "erros") + (c.divergencia ? " e " : "") : ""}${c.divergencia ? plural(c.divergencia, "divergência", "divergências") : ""} e quero publicar assim mesmo.`;
}

function repoPadrao() {
  if (estado.config && estado.config.repo) return estado.config.repo;
  const m = /^([\w-]+)\.github\.io$/i.exec(location.hostname);
  const pasta = location.pathname.split("/").filter(Boolean)[0];
  if (m && pasta) return `${m[1]}/${pasta}`;
  return "";
}

function atualizarConfigUI() {
  const c = estado.config;
  $("cfg-repo").value = repoPadrao();
  $("config-status").textContent = c
    ? `Publicação configurada: repositório ${c.repo} (ramo ${c.ramo || "main"})${c.criadoEm ? ", desde " + dataBr(c.criadoEm) : ""}. Para publicar, só a senha é pedida.`
    : "A publicação ainda não foi configurada.";
  $("bloco-trocar-senha").hidden = !c;
  renderPublicarConfig();
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
    if (estado.importacao) renderResumoDestino();
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
