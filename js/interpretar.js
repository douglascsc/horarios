// Interpreta as abas lidas da planilha e confere a consistência dos dados.
//
// Não depende de nomes fixos de abas: cada aba é classificada pelo que
// contém.
//  - "Dados": tabela com cabeçalho (Disciplina, Dia, Início...): é a fonte
//    dos horários publicados.
//  - "Grade": quadros com linha de dias (seg, ter, qua...) e horários na
//    1ª coluna; servem para descobrir os períodos (07:30–08:15, ...) e para
//    conferir se o que está desenhado bate com a tabela de dados.
//  - "Carga horária": tabela professor × total; conferida com a soma real.
// O resultado traz as aulas e uma lista de avisos (erro, divergência,
// dúvida, informação) para o administrador revisar antes de publicar.

export const DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "ead"];
export const NOME_DIA = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", ead: "EaD" };
export const NOME_TURNO = { M: "Manhã", T: "Tarde", N: "Noite" };

// Grade oficial de períodos (intervalos 09:45–10:00, 12:15–13:30,
// 15:45–16:00 e 20:30–20:45). No dia da REUNIÃO DE ENSINO (quarta-feira,
// salvo se o administrador escolher outro dia ao publicar) os intervalos
// são 09:00–09:15 e 15:00–15:15: o 3º período da manhã vai das 09:15 às
// 10:00 e o 3º da tarde das 15:15 às 16:00. As aulas desse dia sempre
// seguem esta grade, mesmo que a planilha diga outra coisa.
export const DIA_ESPECIAL_PADRAO = "qua";
export const MOTIVO_DIA_ESPECIAL = "reunião de ensino";
export const GRADE_OFICIAL = {
  normal: [["07:30", "08:15"], ["08:15", "09:00"], ["09:00", "09:45"], ["10:00", "10:45"], ["10:45", "11:30"], ["11:30", "12:15"],
    ["13:30", "14:15"], ["14:15", "15:00"], ["15:00", "15:45"], ["16:00", "16:45"], ["16:45", "17:30"], ["17:30", "18:15"],
    ["18:15", "19:00"], ["19:00", "19:45"], ["19:45", "20:30"], ["20:45", "21:30"], ["21:30", "22:15"]],
  especial: [["07:30", "08:15"], ["08:15", "09:00"], ["09:15", "10:00"], ["10:00", "10:45"], ["10:45", "11:30"], ["11:30", "12:15"],
    ["13:30", "14:15"], ["14:15", "15:00"], ["15:15", "16:00"], ["16:00", "16:45"], ["16:45", "17:30"], ["17:30", "18:15"],
    ["18:15", "19:00"], ["19:00", "19:45"], ["19:45", "20:30"], ["20:45", "21:30"], ["21:30", "22:15"]],
};

// Regra de contagem: as aulas destes cursos CONTAM em dobro nos totais de
// períodos e na carga horária. Só a contagem muda; horários, quadros e
// duração das aulas continuam iguais.
export const PESO_POR_CURSO = { PCP: 2 };
export function pesoDoCurso(curso, regras = PESO_POR_CURSO) {
  const n = normalizar(curso);
  for (const [c, peso] of Object.entries(regras || {})) if (normalizar(c) === n) return peso;
  return 1;
}

export function normalizar(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
const limpar = (v) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());
const vazio = (v) => limpar(v) === "";

// ---------------------------------------------------------------- colunas
const SINONIMOS = {
  curso: ["curso"],
  turma: ["turma", "classe"],
  periodo: ["ano", "serie", "sem", "semestre", "periodo letivo", "modulo", "etapa", "nivel"],
  turno: ["turno"],
  disciplina: ["disciplina", "componente", "componente curricular", "unidade curricular", "projeto", "atividade", "materia"],
  ch: ["ch", "ch total", "total", "carga horaria", "carga horaria total", "total de periodos", "periodos", "aulas", "n de periodos", "qtd periodos", "quantidade de periodos", "num periodos"],
  dia: ["dia semana", "dia da semana", "dia"],
  inicio: ["inicio", "horario inicio", "hora inicio", "horario de inicio", "hora de inicio", "horario", "hora"],
  professor: ["professor", "professores", "prof", "profs", "professor(a)", "docente", "docentes", "coordenador", "coordenadora", "responsavel"],
  sala: ["sala", "salas", "local", "ambiente", "laboratorio"],
};
export const ROTULO_CAMPO = { curso: "Curso", turma: "Turma", periodo: "Ano/Semestre", turno: "Turno", disciplina: "Disciplina", ch: "Nº de períodos", dia: "Dia", inicio: "Início", professor: "Professor", sala: "Sala" };

function campoDoCabecalho(texto) {
  const n = normalizar(texto).replace(/[º°.]/g, "").replace(/\s+/g, " ").trim();
  if (!n) return null;
  for (const [campo, lista] of Object.entries(SINONIMOS)) if (lista.includes(n)) return campo;
  return null;
}

// ---------------------------------------------------------------- valores
const MAPA_DIAS = {
  seg: "seg", segunda: "seg", "segunda-feira": "seg", "2a": "seg", "2ª": "seg",
  ter: "ter", terca: "ter", "terca-feira": "ter", "3a": "ter",
  qua: "qua", quarta: "qua", "quarta-feira": "qua", "4a": "qua",
  qui: "qui", quinta: "qui", "quinta-feira": "qui", "5a": "qui",
  sex: "sex", sexta: "sex", "sexta-feira": "sex", "6a": "sex",
  sab: "sab", sabado: "sab",
  ead: "ead", "a distancia": "ead", distancia: "ead", online: "ead", "on-line": "ead",
};
export function lerDia(v) {
  const n = normalizar(v).replace(/\.$/, "");
  return MAPA_DIAS[n] || null;
}

// Minutos desde 00:00. Aceita fração de dia do Excel (0.3125), "7:30", "07h30".
export function lerHora(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    const frac = v - Math.floor(v);
    if (v >= 1 && frac === 0) return null;
    return Math.round(frac * 1440) % 1440;
  }
  const m = /^(\d{1,2})\s*[:hH]\s*(\d{2})?$/.exec(limpar(v));
  if (!m) return null;
  const h = +m[1], mi = m[2] ? +m[2] : 0;
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function turnoDaHora(min) { return min < 12 * 60 + 30 ? "M" : min < 18 * 60 ? "T" : "N"; }
function lerTurno(v) {
  const n = normalizar(v);
  if (!n) return null;
  if (["m", "manha", "matutino"].includes(n)) return "M";
  if (["t", "tarde", "vespertino"].includes(n)) return "T";
  if (["n", "noite", "noturno"].includes(n)) return "N";
  if (["d", "dep", "dependencia"].includes(n)) return "D";
  return "?";
}
function textoSala(v) {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return limpar(v);
}
function salasDe(texto) { return texto.split("/").map((s) => s.trim()).filter(Boolean); }
function professoresDe(texto) { return limpar(texto).split(/\s*[,;]\s*/).map((s) => s.trim()).filter(Boolean); }

// Ordenação "natural" (INF2 antes de INF10)
const colator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
export const comparar = (a, b) => colator.compare(a, b);

const semPontuacao = (v) => normalizar(v).replace(/[.\-–,;:()]/g, " ").replace(/\s+/g, " ").trim();

// Uma letra a mais, a menos ou trocada numa única palavra de 5+ letras;
// numerais (I, II, IV, 1, 2…) precisam ser iguais.
const NUMERAL = /^([ivxlc]+|\d+)$/;
export function umaLetraDeDiferenca(a, b) {
  const ta = a.split(" "), tb = b.split(" ");
  if (ta.length !== tb.length) return false;
  let difs = 0;
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] === tb[i]) continue;
    if (++difs > 1) return false;
    const x = ta[i], y = tb[i];
    if (NUMERAL.test(x) || NUMERAL.test(y) || Math.min(x.length, y.length) < 5 || Math.abs(x.length - y.length) > 1) return false;
    let p = 0;
    while (p < x.length && x[p] === y[p]) p++;
    if (x.length === y.length) { if (x.slice(p + 1) !== y.slice(p + 1)) return false; }
    else if ((x.length > y.length ? x.slice(p + 1) : x.slice(p)) !== (x.length > y.length ? y.slice(p) : y.slice(p + 1))) return false;
  }
  return difs === 1;
}

// ---------------------------------------------------------------- classificação
// Procura o cabeçalho nas primeiras linhas (pode haver título, linhas em
// branco etc. antes dele) e em qualquer coluna, em qualquer ordem.
function acharCabecalho(linhas) {
  let quase = null;
  for (let r = 0; r < Math.min(linhas.length, 30); r++) {
    const linha = linhas[r] || [];
    const campos = linha.map(campoDoCabecalho);
    const tem = (c) => campos.includes(c);
    const obrig = ["disciplina", "dia", "inicio"].filter(tem);
    if (obrig.length === 3) return { tipo: "dados", linha: r, campos };
    if (tem("professor") && tem("ch") && !tem("dia")) return { tipo: "carga", linha: r, campos };
    if (obrig.length === 2 && !quase) quase = { tipo: "quase", linha: r, campos, falta: ["disciplina", "dia", "inicio"].filter((c) => !tem(c)) };
  }
  return quase;
}
const DIAS_GRADE = { seg: "seg", ter: "ter", qua: "qua", qui: "qui", sex: "sex", sab: "sab", ead: "ead" };
function linhaDeDias(linha) {
  const mapa = {};
  (linha || []).forEach((v, c) => { const d = DIAS_GRADE[normalizar(v).slice(0, 3)]; if (d && normalizar(v).length <= 13) mapa[c] = d; });
  return Object.keys(mapa).length >= 3 ? mapa : null;
}

// ---------------------------------------------------------------- principal
export function interpretar(abas, opcoes = {}) {
  const avisos = [];
  const avisar = (nivel, categoria, texto, local) => avisos.push({ nivel, categoria, texto, local: local || "" });
  const resumoAbas = [];

  const abasDados = [], abasGrade = [], abasCarga = [];
  for (const aba of abas) {
    const cab = acharCabecalho(aba.linhas);
    if (cab && cab.tipo === "dados") { abasDados.push({ aba, cab }); continue; }
    if (cab && cab.tipo === "carga") { abasCarga.push({ aba, cab }); continue; }
    if (cab && cab.tipo === "quase") {
      const achados = (aba.linhas[cab.linha] || []).map((h, i) => (cab.campos[i] ? `${limpar(h)} → ${ROTULO_CAMPO[cab.campos[i]]}` : null)).filter(Boolean);
      resumoAbas.push({ nome: aba.nome, tipo: "ignorada", descricao: `Parece uma tabela de horários, mas falta a coluna ${cab.falta.map((c) => ROTULO_CAMPO[c]).join(", ")}`, linhas: 0, colunas: [] });
      avisar("erro", "Coluna obrigatória", `A aba "${aba.nome}" parece uma tabela de horários (linha ${cab.linha + 1}: ${achados.join(", ")}), mas não tem a coluna ${cab.falta.map((c) => ROTULO_CAMPO[c]).join(" e ")}. Nomes aceitos: ${cab.falta.map((c) => SINONIMOS[c].join(", ")).join(" / ")}. A aba não foi usada.`, aba.nome);
      continue;
    }
    if (aba.linhas.some((l) => linhaDeDias(l))) { abasGrade.push(aba); continue; }
    const preenchida = aba.linhas.some((l) => l.some((v) => !vazio(v)));
    resumoAbas.push({ nome: aba.nome, tipo: "ignorada", descricao: preenchida ? "Formato não reconhecido" : "Vazia", linhas: 0, colunas: [] });
    if (preenchida) avisar("info", "Abas", `A aba "${aba.nome}" não foi reconhecida (não tem cabeçalho de horários nem quadro com dias da semana) e foi ignorada.`, aba.nome);
  }
  if (!abasDados.length) {
    avisar("erro", "Estrutura", "Nenhuma aba com a tabela de horários foi encontrada. É preciso uma aba com cabeçalho contendo pelo menos as colunas Disciplina, Dia (ou Dia Semana) e Início.");
  }

  // ---- 1. períodos (slots) a partir das grades
  const slotsMapa = new Map();
  const blocosGrade = [];
  const datasPublicacao = new Set();
  for (const aba of abasGrade) {
    let r = 0;
    while (r < aba.linhas.length) {
      const dias = linhaDeDias(aba.linhas[r]);
      if (!dias) { r++; continue; }
      // título: linha logo acima com texto na 1ª coluna
      const linhaTitulo = aba.linhas[r - 1] || [];
      const titulo = limpar(linhaTitulo[0]);
      for (const v of linhaTitulo) { const m = /publicado em\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(limpar(v)); if (m) datasPublicacao.add(m[1]); }
      const bloco = { aba: aba.nome, titulo, linhaTitulo: r, celulas: [] };
      r++;
      while (r < aba.linhas.length) {
        const l = aba.linhas[r] || [];
        const ini = lerHora(l[0]);
        if (ini === null) break;
        let fim = null;
        for (let c = 1; c <= 3; c++) { const f = lerHora(l[c]); if (f !== null && f > ini) { fim = f; break; } }
        if (fim !== null && !slotsMapa.has(ini)) slotsMapa.set(ini, fim);
        for (const [c, dia] of Object.entries(dias)) {
          const t = l[c] === null || l[c] === undefined ? "" : String(l[c]);
          bloco.celulas.push({ dia, ini, linha: r + 1, texto: t });
        }
        r++;
      }
      blocosGrade.push(bloco);
    }
    resumoAbas.push({ nome: aba.nome, tipo: "grade", descricao: "Quadro de horários (usado para conferência)", linhas: blocosGrade.filter((b) => b.aba === aba.nome).length, colunas: [] });
  }
  const paraMin = (lista) => lista.map(([i, f]) => ({ ini: lerHora(i), fim: lerHora(f) }));
  const oficialNormal = paraMin(GRADE_OFICIAL.normal), oficialQuarta = paraMin(GRADE_OFICIAL.especial);
  let slots = [...slotsMapa.entries()].map(([ini, fim]) => ({ ini, fim })).sort((a, b) => a.ini - b.ini);
  const slotsDaGrade = true;
  if (!slots.length) {
    slots = oficialNormal;
    if (abasDados.length) avisar("info", "Períodos", "A planilha não tem quadros de grade; foi usada a grade oficial de períodos (07:30–22:15, com os intervalos de sempre).");
  } else {
    // a grade dos quadros bate com a oficial?
    const fmt = (x) => `${hhmm(x.ini)}–${hhmm(x.fim)}`;
    const faltam = oficialNormal.filter((o) => !slots.some((x) => x.ini === o.ini && x.fim === o.fim)).map(fmt);
    const sobram = slots.filter((x) => !oficialNormal.some((o) => x.ini === o.ini && x.fim === o.fim)).map(fmt);
    if (faltam.length || sobram.length) {
      avisar("divergencia", "Grade de períodos", `Os horários dos quadros da planilha não são iguais à grade oficial.${sobram.length ? " Na planilha e não na grade oficial: " + sobram.join(", ") + "." : ""}${faltam.length ? " Na grade oficial e não na planilha: " + faltam.join(", ") + "." : ""} Foi usada a grade da planilha.`);
    }
  }
  // grade de quarta alinhada período a período com a grade usada
  const slotsQuarta = slots.map((x) => { const i = oficialNormal.findIndex((o) => o.ini === x.ini); return i >= 0 ? oficialQuarta[i] : x; });

  if (datasPublicacao.size > 1) avisar("duvida", "Publicação", `Os quadros da planilha têm datas de publicação diferentes: ${[...datasPublicacao].join(", ")}.`);

  // ---- 2. registros das abas de dados
  const registros = [];
  for (const { aba, cab } of abasDados) {
    const col = {};
    cab.campos.forEach((c, i) => { if (c && col[c] === undefined) col[c] = i; });
    const cabecalho = aba.linhas[cab.linha] || [];
    const colunas = cabecalho.map((h, i) => ({ titulo: limpar(h), campo: cab.campos[i] || null })).filter((c) => c.titulo);
    const ignoradas = colunas.filter((c) => !c.campo).map((c) => c.titulo);
    if (ignoradas.length) avisar("info", "Colunas", `Aba "${aba.nome}": coluna(s) não usadas na consulta: ${ignoradas.join(", ")}.`, aba.nome);
    // "Dados ETM", "ETM dados", "Horários - INF" → curso ETM / INF
    const cursoDaAba = limpar(aba.nome.replace(/\b(dados|tabela|hor[aá]rios?|grade)\b/gi, " ").replace(/^[\s\-–—:_]*(de|do|da|dos|das)?\s+|[\s\-–—:_]+$/gi, "").replace(/^[\s\-–—:_]+/, "")) || aba.nome;
    const rotuloPeriodo = col.periodo !== undefined ? limpar(cabecalho[col.periodo]) : "";
    let qtd = 0;
    for (let r = cab.linha + 1; r < aba.linhas.length; r++) {
      const l = aba.linhas[r] || [];
      const get = (c) => (col[c] === undefined ? null : l[col[c]]);
      const local = `${aba.nome}, linha ${r + 1}`;
      if (["disciplina", "dia", "inicio", "professor"].every((c) => vazio(get(c)))) continue;
      const faltam = ["disciplina", "dia", "inicio"].filter((c) => vazio(get(c)));
      if (faltam.length) {
        avisar("erro", "Dados incompletos", `Falta ${faltam.map((c) => ROTULO_CAMPO[c]).join(", ")}; a linha não foi publicada.`, local);
        continue;
      }
      const dia = lerDia(get("dia"));
      if (!dia) { avisar("erro", "Dia inválido", `Dia "${limpar(get("dia"))}" não reconhecido; a linha não foi publicada.`, local); continue; }
      const ini = lerHora(get("inicio"));
      if (ini === null) { avisar("erro", "Horário inválido", `Início "${limpar(get("inicio"))}" não é um horário; a linha não foi publicada.`, local); continue; }
      let ch = 1;
      const chBruto = get("ch");
      if (col.ch !== undefined) {
        const n = typeof chBruto === "number" ? chBruto : Number(limpar(chBruto).replace(",", "."));
        if (vazio(chBruto)) avisar("duvida", "Nº de períodos", "Sem número de períodos; considerado 1 período.", local);
        else if (!Number.isFinite(n) || n < 1) avisar("duvida", "Nº de períodos", `Número de períodos "${limpar(chBruto)}" inválido; considerado 1.`, local);
        else { ch = Math.round(n); if (ch !== n) avisar("duvida", "Nº de períodos", `Número de períodos ${n} não é inteiro; considerado ${ch}.`, local); }
        if (ch > 8) avisar("duvida", "Nº de períodos", `${ch} períodos seguidos parece muito; confira.`, local);
      }
      const discBruta = String(get("disciplina"));
      const disciplina = limpar(discBruta);
      if (discBruta !== disciplina && discBruta.trim() !== disciplina) avisar("info", "Espaços extras", `Disciplina "${discBruta}" tinha espaços extras (corrigido na consulta).`, local);
      else if (discBruta !== discBruta.trim()) avisar("info", "Espaços extras", `Disciplina "${disciplina}" tinha espaço no início ou no fim (corrigido na consulta).`, local);
      const professores = professoresDe(get("professor"));
      const sala = textoSala(get("sala"));
      const periodoBruto = get("periodo");
      const turnoDecl = lerTurno(get("turno"));
      const periodoTxt = typeof periodoBruto === "number" ? String(Math.round(periodoBruto)) : limpar(periodoBruto);
      const dependencia = turnoDecl === "D" || /^(d|dep|dependencia|dependencias)$/.test(normalizar(periodoTxt));
      const turnoHora = turnoDaHora(ini);
      if (turnoDecl === "?") avisar("duvida", "Turno", `Turno "${limpar(get("turno"))}" não reconhecido; usado ${NOME_TURNO[turnoHora]} (pelo horário).`, local);
      else if (turnoDecl && turnoDecl !== "D" && turnoDecl !== turnoHora && dia !== "ead") {
        avisar("divergencia", "Turno × horário", `${disciplina}: turno ${NOME_TURNO[turnoDecl]} informado, mas o início (${hhmm(ini)}) é de ${NOME_TURNO[turnoHora]}; considerado ${NOME_TURNO[turnoHora]}.`, local);
      }
      const turno = turnoHora;
      const curso = col.curso !== undefined && !vazio(get("curso")) ? limpar(get("curso")) : cursoDaAba;
      let turma;
      if (col.turma !== undefined && !vazio(get("turma"))) turma = limpar(get("turma"));
      else if (dependencia) turma = `Dep. ${curso}`;
      else if (periodoTxt) turma = `${curso}${periodoTxt}${dia === "ead" && turnoDecl && turnoDecl !== "?" ? turnoDecl : turno}`;
      else turma = curso;
      if (!professores.length) avisar("duvida", "Sem professor", `${disciplina} (${turma}, ${NOME_DIA[dia]} ${hhmm(ini)}) está sem professor.`, local);
      if (!sala && dia !== "ead") avisar("duvida", "Sem sala", `${disciplina} (${turma}, ${NOME_DIA[dia]} ${hhmm(ini)}) está sem sala.`, local);
      registros.push({ aba: aba.nome, linha: r + 1, local, curso, turma, periodo: periodoTxt, rotuloPeriodo, turno, dependencia, dia, ini, ch, disciplina, professores, sala, salas: salasDe(sala) });
      qtd++;
    }
    resumoAbas.push({ nome: aba.nome, tipo: "dados", descricao: "Tabela de horários (fonte da consulta)", linhas: qtd, colunas });
    if (!qtd) avisar("info", "Abas", `A aba "${aba.nome}" tem o cabeçalho de horários, mas nenhuma linha preenchida.`, aba.nome);
  }

  // ---- 2b. nomes escritos de formas diferentes viram um só na consulta
  //  - disciplinas e professores: diferença só de acento, maiúscula,
  //    pontuação ou espaços ("Matematica I" = "Matemática I");
  //  - só disciplinas: uma letra a mais/menos/trocada numa palavra de 5+
  //    letras ("Portugues" = "Português"), nunca em numerais (I, II, 1, 2).
  //  Professores com uma letra de diferença NÃO são unidos (ex.: Juliana e
  //  Juliane são pessoas diferentes).
  // Fica a grafia com acentos (a mais completa); empate: a mais usada.
  const unificar = (rotulo, valores, porLetra, aplicar) => {
    const chave = (v) => normalizar(v).replace(/[.\-–,;:()]/g, " ").replace(/\s+/g, " ").trim();
    const grupos = new Map(); // chave -> Map(variante -> {n, locais})
    for (const { valor, local } of valores) {
      const k = chave(valor);
      if (!grupos.has(k)) grupos.set(k, new Map());
      const g = grupos.get(k);
      if (!g.has(valor)) g.set(valor, { n: 0, local });
      g.get(valor).n++;
    }
    // junta chaves com uma letra de diferença (union-find simples)
    const pai = new Map([...grupos.keys()].map((k) => [k, k]));
    const raiz = (k) => { while (pai.get(k) !== k) k = pai.get(k); return k; };
    const porLetraUsado = new Set();
    if (porLetra) {
      const chaves = [...grupos.keys()];
      for (let i = 0; i < chaves.length; i++) for (let j = i + 1; j < chaves.length; j++) {
        if (umaLetraDeDiferenca(chaves[i], chaves[j])) { pai.set(raiz(chaves[j]), raiz(chaves[i])); porLetraUsado.add(chaves[i]); porLetraUsado.add(chaves[j]); }
      }
    }
    const final = new Map(); // raiz -> Map(variante -> info)
    for (const [k, g] of grupos) {
      const r = raiz(k);
      if (!final.has(r)) final.set(r, { variantes: new Map(), porLetra: false });
      const f = final.get(r);
      for (const [v, info] of g) f.variantes.set(v, info);
      if (porLetraUsado.has(k)) f.porLetra = true;
    }
    const acentos = (v) => (v.normalize("NFD").match(/[\u0300-\u036f]/g) || []).length;
    const troca = new Map();
    for (const f of final.values()) {
      if (f.variantes.size < 2) continue;
      const lista = [...f.variantes].sort((x, y) => acentos(y[0]) - acentos(x[0]) || y[1].n - x[1].n || y[0].length - x[0].length);
      const canonico = lista[0][0];
      for (const [v] of lista) troca.set(v, canonico);
      avisar(f.porLetra ? "duvida" : "info", f.porLetra ? `Nomes unificados (${rotulo}, diferença de letra)` : `Nomes unificados (${rotulo})`,
        `${lista.map(([v, i]) => `"${v}" (${i.n}×)`).join(", ")} aparecem juntos na consulta como "${canonico}".${f.porLetra ? " Confira se são mesmo a mesma " + rotulo + "." : ""}`,
        lista.map(([, i]) => i.local).join("; "));
    }
    if (troca.size) aplicar(troca);
  };
  unificar("disciplina", registros.map((g) => ({ valor: g.disciplina, local: g.local })), true,
    (t) => { for (const g of registros) if (t.has(g.disciplina)) g.disciplina = t.get(g.disciplina); });
  unificar("professor", registros.flatMap((g) => g.professores.map((p) => ({ valor: p, local: g.local }))), false,
    (t) => { for (const g of registros) g.professores = g.professores.map((p) => t.get(p) || p); });

  // ---- 3. expandir em períodos
  const pendencias = [];
  // dia com intervalos diferenciados (reunião de ensino): quarta, a menos
  // que o administrador escolha outro dia (opcoes.diaEspecial; "" = nenhum)
  const diaEspecial = opcoes.diaEspecial === undefined ? DIA_ESPECIAL_PADRAO : opcoes.diaEspecial;
  const temQuarta = !!diaEspecial && registros.some((g) => g.dia === diaEspecial);
  const quartaDifere = slotsQuarta.some((x, i) => x.ini !== slots[i].ini || x.fim !== slots[i].fim);
  const quartaEspecial = temQuarta && quartaDifere;
  if (diaEspecial && diaEspecial !== DIA_ESPECIAL_PADRAO) avisar("info", "Dia dos intervalos diferenciados", `Os intervalos diferenciados (${MOTIVO_DIA_ESPECIAL}) foram aplicados na ${NOME_DIA[diaEspecial]}, e não na ${NOME_DIA[DIA_ESPECIAL_PADRAO]} (escolha do administrador).`);
  if (!diaEspecial) avisar("info", "Dia dos intervalos diferenciados", `Nenhum dia com intervalos diferenciados: todos os dias seguem a mesma grade (escolha do administrador).`);
  if (quartaEspecial) {
    const dif = slots.map((x, i) => [x, slotsQuarta[i]]).filter(([x, q]) => x.ini !== q.ini || x.fim !== q.fim)
      .map(([x, q]) => `${hhmm(q.ini)}–${hhmm(q.fim)} (em vez de ${hhmm(x.ini)}–${hhmm(x.fim)})`).join(", ");
    const intervalos = slotsQuarta.map((q, i) => (i > 0 && q.ini - slotsQuarta[i - 1].fim > 0 && (q.ini !== slots[i].ini) ? `${hhmm(slotsQuarta[i - 1].fim)}–${hhmm(q.ini)}` : null)).filter(Boolean);
    avisar("info", "Intervalos diferenciados", `${NOME_DIA[diaEspecial]} (${MOTIVO_DIA_ESPECIAL}) usa os intervalos ${intervalos.join(" e ")}: ${dif}.`);
  }
  let ajustadasQuarta = 0;
  const decisoes = opcoes.decisoesInicio || {};
  const aulas = [];
  for (const g of registros) {
    const periodos = [];
    if (slotsDaGrade) {
      const gradeDia = g.dia === diaEspecial && quartaEspecial ? slotsQuarta : slots;
      let k = gradeDia.findIndex((s) => s.ini === g.ini);
      if (k < 0) {
        k = slots.findIndex((s) => s.ini === g.ini); // horário "normal" numa quarta especial
        if (k >= 0 && gradeDia !== slots) { if (gradeDia[k].ini !== g.ini) ajustadasQuarta++; }
      }
      if (k >= 0) g.ini = gradeDia[k].ini;
      if (k < 0) {
        // o administrador decide: manter o horário informado ou pôr na grade
        k = gradeDia.findIndex((s) => g.ini > s.ini && g.ini < s.fim);
        if (k < 0) { // antes do 1º, depois do último ou num intervalo: período mais próximo
          let melhor = -1, dist = Infinity;
          gradeDia.forEach((s, i) => { const d = Math.abs(s.ini - g.ini); if (d < dist) { dist = d; melhor = i; } });
          if (dist <= 60) k = melhor;
        }
        const chave = `${g.aba}|${g.linha}`;
        const quando = `${g.disciplina} (${g.turma}, ${NOME_DIA[g.dia]})`;
        if (k < 0) avisar("duvida", "Início fora da grade", `${quando}: início ${hhmm(g.ini)} não corresponde a nenhum período dos quadros da planilha; mantido como está.`, g.local);
        else if (decisoes[chave] === "grade") {
          avisar("info", "Início ajustado à grade", `${quando}: início ${hhmm(g.ini)} foi colocado na grade, às ${hhmm(gradeDia[k].ini)} (decisão do administrador).`, g.local);
          g.ini = gradeDia[k].ini;
        } else if (decisoes[chave] === "manter") {
          avisar("info", "Início fora da grade autorizado", `${quando}: início ${hhmm(g.ini)} mantido, dentro do período ${hhmm(gradeDia[k].ini)}–${hhmm(gradeDia[k].fim)} (autorizado pelo administrador).`, g.local);
        } else {
          pendencias.push({ chave, tipo: "inicio", local: g.local, disciplina: g.disciplina, turma: g.turma, dia: g.dia, inicio: hhmm(g.ini), grade: hhmm(gradeDia[k].ini), gradeFim: hhmm(gradeDia[k].fim) });
          avisar("duvida", "Início fora da grade", `${quando}: início ${hhmm(g.ini)} não é um horário da grade (${hhmm(gradeDia[k].ini)}–${hhmm(gradeDia[k].fim)}). Decida: manter ${hhmm(g.ini)} ou colocar às ${hhmm(gradeDia[k].ini)}.`, g.local);
        }
      }
      if (k < 0) { for (let j = 0; j < g.ch; j++) periodos.push({ ini: g.ini + 45 * j, fim: g.ini + 45 * (j + 1) }); }
      else {
        for (let j = 0; j < g.ch; j++) {
          const s = gradeDia[k + j];
          if (!s) { avisar("erro", "Períodos além da grade", `${g.disciplina} (${g.turma}, ${NOME_DIA[g.dia]} ${hhmm(g.ini)}): ${g.ch} períodos passam do último horário do dia.`, g.local); break; }
          if (j > 0 && s.ini - periodos[j - 1].fim > 50) avisar("duvida", "Aula atravessa intervalo", `${g.disciplina} (${g.turma}, ${NOME_DIA[g.dia]}): os ${g.ch} períodos a partir de ${hhmm(g.ini)} atravessam o intervalo entre ${hhmm(periodos[j - 1].fim)} e ${hhmm(s.ini)}.`, g.local);
          periodos.push({ ini: s.ini, fim: s.fim, base: slots[k + j].ini });
        }
      }
    } else {
      for (let j = 0; j < g.ch; j++) periodos.push({ ini: g.ini + 45 * j, fim: g.ini + 45 * (j + 1) });
    }
    if (!periodos.length) continue;
    aulas.push({ ...g, periodos, fim: periodos[periodos.length - 1].fim });
  }
  if (ajustadasQuarta) avisar("info", "Intervalos diferenciados", `${ajustadasQuarta} aula(s) de ${NOME_DIA[diaEspecial]} tinham na planilha o horário dos outros dias e foram colocadas no horário diferenciado (${MOTIVO_DIA_ESPECIAL}).`);

  // ---- 4. repetidos e conflitos (por período)
  const vistos = new Map();
  for (const a of aulas) {
    const chave = [a.turma, a.dia, a.ini, normalizar(a.disciplina), a.professores.map(normalizar).sort().join("+")].join("|");
    if (vistos.has(chave)) avisar("divergencia", "Registro repetido", `${a.disciplina} (${a.turma}, ${NOME_DIA[a.dia]} ${hhmm(a.ini)}) aparece repetida (também em ${vistos.get(chave)}).`, a.local);
    else vistos.set(chave, a.local);
  }
  const porProf = new Map(), porSala = new Map(), porTurma = new Map();
  const add = (mapa, chave, a) => { if (!mapa.has(chave)) mapa.set(chave, []); mapa.get(chave).push(a); };
  // professor e sala: sobreposição real, de 5 em 5 minutos (pega também
  // horários fora da grade e planilhas sem quadros, em que as aulas não
  // começam no mesmo minuto); a 1ª marca em comum é o início do choque
  for (const a of aulas) {
    if (a.dia === "ead") continue;
    for (const p of a.periodos) {
      for (let t = Math.max(p.ini, a.ini); t < p.fim; t += 5) { // início mantido fora da grade: conta do início real
        for (const prof of a.professores) add(porProf, `${normalizar(prof)}|${a.dia}|${t}`, a);
        for (const s of a.salas) add(porSala, `${normalizar(s)}|${a.dia}|${t}`, a);
      }
      add(porTurma, `${a.turma}|${a.dia}|${p.ini}`, a);
    }
  }
  const jaAvisado = new Set();
  const descr = (a) => `${a.disciplina} (${a.turma}${a.sala ? ", sala " + a.sala : ""})`;
  for (const [chave, lista] of porProf) {
    const unicos = [...new Set(lista)];
    if (unicos.length < 2) continue;
    if (new Set(unicos.map((a) => a.turma + "|" + normalizar(a.disciplina))).size < 2) continue; // repetido (já avisado)
    const [prof, dia, ini] = chave.split("|");
    const id = "p|" + unicos.map((a) => a.local).sort().join("~");
    if (jaAvisado.has(id)) continue;
    jaAvisado.add(id);
    const nome = unicos[0].professores.find((p) => normalizar(p) === prof) || prof;
    const mesmaSala = new Set(unicos.map((a) => normalizar(a.sala))).size === 1 && unicos[0].sala;
    if (mesmaSala) avisar("duvida", "Turmas juntas?", `${nome} tem ${unicos.length} aulas ao mesmo tempo na mesma sala (${NOME_DIA[dia]} ${hhmm(+ini)}): ${unicos.map(descr).join(" e ")}. Se for aula conjunta, está certo.`, unicos.map((a) => a.local).join("; "));
    else avisar("divergencia", "Professor em dois lugares", `${nome} está em ${unicos.length} aulas ao mesmo tempo (${NOME_DIA[dia]} ${hhmm(+ini)}): ${unicos.map(descr).join(" e ")}.`, unicos.map((a) => a.local).join("; "));
  }
  for (const [chave, lista] of porSala) {
    const unicos = [...new Set(lista)];
    if (unicos.length < 2) continue;
    // mesmo professor já foi avisado acima
    const profs = new Set(unicos.flatMap((a) => a.professores.map(normalizar)));
    if (profs.size < unicos.reduce((s, a) => s + a.professores.length, 0)) continue;
    if (new Set(unicos.map((a) => a.turma + "|" + normalizar(a.disciplina))).size < 2) continue;
    const [sala, dia, ini] = chave.split("|");
    const id = "s|" + unicos.map((a) => a.local).sort().join("~");
    if (jaAvisado.has(id)) continue;
    jaAvisado.add(id);
    avisar("divergencia", "Sala ocupada duas vezes", `Sala ${sala} tem ${unicos.length} aulas ao mesmo tempo (${NOME_DIA[dia]} ${hhmm(+ini)}): ${unicos.map((a) => `${a.disciplina} (${a.turma}, ${a.professores.join(", ") || "sem professor"})`).join(" e ")}.`, unicos.map((a) => a.local).join("; "));
  }
  let divididas = 0;
  for (const lista of porTurma.values()) if (new Set(lista).size > 1) divididas++;
  if (divididas) avisar("info", "Turmas divididas", `${divididas} período(s) têm a turma dividida em grupos com aulas diferentes ao mesmo tempo (ex.: "Eletricidade I / Robótica"). Isso é esperado e aparece junto na consulta.`);

  // ---- 6. conferência com os quadros (grades) da planilha
  const parteCelula = (texto) => texto.split("\n").map((l) => l.trim());
  const listaCelula = (linha) => (linha ? linha.split(" / ").map((s) => s.trim()).filter(Boolean) : []);
  const indiceGrade = new Map(); // turma-grupo -> aulas
  const cursoPeriodo = (a) => `${normalizar(a.curso)}|${normalizar(a.periodo)}`;
  for (const a of aulas) if (!a.dependencia) add(indiceGrade, cursoPeriodo(a), a);
  const profsConhecidos = new Map();
  for (const a of aulas) for (const p of a.professores) profsConhecidos.set(normalizar(p), p);
  const salasConhecidas = new Set(aulas.flatMap((a) => a.salas.map(normalizar)));
  const cursos = [...new Set(aulas.map((a) => a.curso))];
  const conferidos = { blocos: 0, celulas: 0, divergencias: 0, naoReconhecidos: [] };

  for (const bloco of blocosGrade) {
    const tituloN = normalizar(bloco.titulo);
    let esperado = null, tipo = "", leitura;
    // 1) dependências
    if (/^dependencia/.test(tituloN)) {
      tipo = "Dependências";
      esperado = aulas.filter((a) => a.dependencia);
      leitura = (a) => [`${normalizar(a.curso)} ${normalizar(a.disciplina)}`];
    } else {
      // 2) turma: título começa com um curso conhecido + período
      const curso = cursos.find((c) => tituloN.replace(/\s+/g, "").startsWith(normalizar(c).replace(/\s+/g, "")));
      const m = curso ? new RegExp("^" + normalizar(curso).replace(/\s+/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(\\w+?)(m|t|n|m\\/t)?$").exec(tituloN.replace(/\s+/g, "")) : null;
      if (curso && m && indiceGrade.has(`${normalizar(curso)}|${m[1]}`)) {
        tipo = "Turma";
        esperado = indiceGrade.get(`${normalizar(curso)}|${m[1]}`);
        leitura = (a) => [normalizar(a.disciplina)];
      } else if (profsConhecidos.has(tituloN)) {
        tipo = "Professor";
        esperado = aulas.filter((a) => a.professores.some((p) => normalizar(p) === tituloN));
        leitura = (a) => [normalizar(a.disciplina)];
      } else if (salasConhecidas.has(tituloN)) {
        tipo = "Sala";
        esperado = aulas.filter((a) => a.salas.some((s) => normalizar(s) === tituloN));
        leitura = (a) => [normalizar(a.disciplina)];
      }
    }
    if (!esperado) {
      const temConteudo = bloco.celulas.some((c) => c.texto.replace(/\s/g, ""));
      if (temConteudo) conferidos.naoReconhecidos.push(`${bloco.aba}: "${bloco.titulo || "(sem título)"}"`);
      continue;
    }
    conferidos.blocos++;
    const mapaEsperado = new Map();
    for (const a of esperado) for (const p of a.periodos) {
      const k = `${a.dia}|${p.base ?? p.ini}`;
      if (!mapaEsperado.has(k)) mapaEsperado.set(k, new Map());
      for (const v of leitura(a)) mapaEsperado.get(k).set(v.replace(/[.\s]+$/, ""), a.disciplina);
    }
    const difs = [];
    const vistosBloco = new Set();
    for (const cel of bloco.celulas) {
      const k = `${cel.dia}|${cel.ini}`;
      vistosBloco.add(k);
      const linhas = parteCelula(cel.texto);
      const naGrade = new Map(listaCelula(linhas[0]).map((s) => [normalizar(s).replace(/[.\s]+$/, ""), s]));
      const nosDados = mapaEsperado.get(k) || new Map();
      conferidos.celulas++;
      let soGrade = [...naGrade.keys()].filter((x) => !nosDados.has(x));
      let soDados = [...nosDados.keys()].filter((x) => !naGrade.has(x));
      // grafias que a consulta junta (acento, pontuação, uma letra) não contam como diferença
      const mesmo = (x, y) => semPontuacao(x) === semPontuacao(y) || umaLetraDeDiferenca(semPontuacao(x), semPontuacao(y));
      soGrade = soGrade.filter((x) => !soDados.some((y) => mesmo(x, y)));
      soDados = soDados.filter((y) => !soGrade.some((x) => mesmo(x, y)) && ![...naGrade.keys()].some((x) => mesmo(x, y)));
      if (!soGrade.length && !soDados.length) continue;
      const partes = [];
      if (soDados.length) partes.push(`a tabela de dados tem ${soDados.map((x) => `"${nosDados.get(x)}"`).join(", ")}`);
      if (soGrade.length) partes.push(`o quadro mostra ${soGrade.map((x) => `"${naGrade.get(x)}"`).join(", ")}`);
      if (!soGrade.length && naGrade.size === 0) partes.push("o quadro está vazio");
      if (!soDados.length && nosDados.size === 0) partes.push("a tabela de dados não tem aula nesse horário");
      difs.push({ dia: cel.dia, ini: cel.ini, texto: partes.join("; "), linha: cel.linha });
    }
    // junta períodos seguidos com a mesma diferença (07:30 e 08:15 → 07:30–09:00)
    difs.sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || a.ini - b.ini);
    const fimSlot = (ini) => slotsMapa.get(ini) ?? ini + 45;
    const proximo = (ini) => { const k = slots.findIndex((s) => s.ini === ini); return k >= 0 && slots[k + 1] ? slots[k + 1].ini : null; };
    for (let i = 0; i < difs.length; i++) {
      const d = difs[i];
      let j = i;
      while (j + 1 < difs.length && difs[j + 1].dia === d.dia && difs[j + 1].texto === d.texto && difs[j + 1].ini === proximo(difs[j].ini)) j++;
      const faixa = j > i ? `${hhmm(d.ini)}–${hhmm(fimSlot(difs[j].ini))}` : hhmm(d.ini);
      const linhas = j > i ? `linhas ${d.linha}–${difs[j].linha}` : `linha ${d.linha}`;
      conferidos.divergencias++;
      avisar("divergencia", "Quadro × dados", `${tipo} ${bloco.titulo}, ${NOME_DIA[d.dia]} ${faixa}: ${d.texto}.`, `${bloco.aba}, ${linhas}`);
      i = j;
    }
    // aulas dos dados em horários que o quadro nem tem
    for (const [k, mapa] of mapaEsperado) {
      if (vistosBloco.has(k) || !mapa.size) continue;
      const [dia, ini] = k.split("|");
      if (!bloco.celulas.some((c) => c.dia === dia)) continue; // quadro sem essa coluna
      conferidos.divergencias++;
      avisar("divergencia", "Quadro × dados", `${tipo} ${bloco.titulo}: ${[...mapa.values()].join(", ")} (${NOME_DIA[dia]} ${hhmm(+ini)}) está na tabela de dados, mas o quadro não tem esse horário.`, bloco.aba);
    }
  }
  if (blocosGrade.length) {
    avisar("info", "Conferência dos quadros", `${conferidos.blocos} quadro(s) conferido(s) com a tabela de dados (${conferidos.celulas} células): ${conferidos.divergencias ? conferidos.divergencias + " diferença(s) encontrada(s)" : "tudo igual"}.`);
  }
  if (conferidos.naoReconhecidos.length) {
    avisar("duvida", "Quadro não identificado", `${conferidos.naoReconhecidos.length} quadro(s) não puderam ser ligados a uma turma, professor ou sala dos dados e não foram conferidos: ${conferidos.naoReconhecidos.slice(0, 12).join("; ")}${conferidos.naoReconhecidos.length > 12 ? "…" : ""}.`);
  }

  // ---- 7. carga horária declarada × soma (com a regra de contagem)
  const regras = opcoes.pesoPorCurso || PESO_POR_CURSO;
  for (const { aba, cab } of abasCarga) {
    const cProf = cab.campos.indexOf("professor"), cCh = cab.campos.indexOf("ch");
    const soma = new Map(), somaSimples = new Map();
    for (const a of aulas) for (const p of a.professores) {
      const k = normalizar(p);
      soma.set(k, (soma.get(k) || 0) + a.periodos.length * pesoDoCurso(a.curso, regras));
      somaSimples.set(k, (somaSimples.get(k) || 0) + a.periodos.length);
    }
    const declarados = new Set();
    const semDobro = [];
    let conf = 0, dif = 0;
    for (let r = cab.linha + 1; r < aba.linhas.length; r++) {
      const l = aba.linhas[r] || [];
      const nome = limpar(l[cProf]);
      if (!nome) continue;
      const decl = typeof l[cCh] === "number" ? l[cCh] : Number(limpar(l[cCh]).replace(",", "."));
      declarados.add(normalizar(nome));
      conf++;
      const real = soma.get(normalizar(nome)) || 0, simples = somaSimples.get(normalizar(nome)) || 0;
      if (!real) { avisar("duvida", "Carga horária", `${nome} está na aba "${aba.nome}" (${Number.isFinite(decl) ? decl : "?"} períodos), mas não tem nenhuma aula na tabela de dados.`, `${aba.nome}, linha ${r + 1}`); dif++; continue; }
      if (!Number.isFinite(decl) || Math.abs(decl - real) < 0.01) continue;
      // bate só se não contar em dobro: um aviso agrupado no fim
      if (real !== simples && Math.abs(decl - simples) < 0.01) { semDobro.push(`${nome} (${decl}; com a regra: ${real})`); dif++; continue; }
      avisar("divergencia", "Carga horária", `${nome}: a aba "${aba.nome}" informa ${decl} períodos, mas a soma das aulas na tabela de dados dá ${real}${real !== simples ? ` (contando em dobro os cursos ${Object.keys(regras).join(", ")})` : ""}.`, `${aba.nome}, linha ${r + 1}`);
      dif++;
    }
    if (semDobro.length) {
      avisar("duvida", "Carga horária", `A aba "${aba.nome}" não conta em dobro os períodos de ${Object.keys(regras).join(", ")} para ${semDobro.length} professor(es); sem o dobro, os números batem. No site, esses períodos contam em dobro: ${semDobro.join("; ")}.`, aba.nome);
    }
    for (const [n, real] of soma) if (!declarados.has(n)) { avisar("duvida", "Carga horária", `${profsConhecidos.get(n) || n} tem ${real} períodos na tabela de dados, mas não aparece na aba "${aba.nome}".`, aba.nome); dif++; }
    resumoAbas.push({ nome: aba.nome, tipo: "carga", descricao: "Carga horária por professor (usada para conferência)", linhas: conf, colunas: [] });
    avisar("info", "Carga horária", `Carga horária de ${conf} professor(es) conferida com a soma das aulas${Object.keys(regras).length ? ` (períodos de ${Object.keys(regras).join(", ")} contam em dobro)` : ""}: ${dif ? dif + " diferença(s)" : "tudo igual"}.`);
  }

  // ---- 8. resultado publicável
  aulas.sort((a, b) => comparar(a.turma, b.turma) || DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || a.ini - b.ini || comparar(a.disciplina, b.disciplina));
  const turmasMapa = new Map();
  for (const a of aulas) {
    if (!turmasMapa.has(a.turma)) turmasMapa.set(a.turma, { id: a.turma, curso: a.curso, periodo: a.periodo, rotuloPeriodo: a.rotuloPeriodo, turnos: new Set(), dependencia: a.dependencia });
    turmasMapa.get(a.turma).turnos.add(a.turno);
  }
  const turmas = [...turmasMapa.values()].map((t) => ({ ...t, turnos: ["M", "T", "N"].filter((x) => t.turnos.has(x)) })).sort((a, b) => (a.dependencia - b.dependencia) || comparar(a.id, b.id));
  const ordemNivel = { erro: 0, divergencia: 1, duvida: 2, info: 3 };
  avisos.sort((a, b) => ordemNivel[a.nivel] - ordemNivel[b.nivel] || comparar(a.categoria, b.categoria));

  const dados = {
    versao: 1,
    titulo: opcoes.titulo || "",
    arquivo: opcoes.arquivo || "",
    dataPlanilha: [...datasPublicacao][0] || "",
    publicadoEm: null,
    periodos: slots.map((s) => [hhmm(s.ini), hhmm(s.fim)]),
    periodosPorDia: quartaEspecial ? { [diaEspecial]: slotsQuarta.map((s) => [hhmm(s.ini), hhmm(s.fim)]) } : {},
    motivoDiaEspecial: quartaEspecial ? MOTIVO_DIA_ESPECIAL : "",
    cursos: [...new Set(aulas.map((a) => a.curso))].sort(comparar),
    pesoPorCurso: regras,
    turmas,
    aulas: aulas.map((a) => ({
      turma: a.turma, curso: a.curso, dia: a.dia, inicio: hhmm(a.ini), fim: hhmm(a.fim), periodos: a.periodos.length,
      turno: a.turno, disciplina: a.disciplina, professores: a.professores, sala: a.sala,
      ...(pesoDoCurso(a.curso, regras) !== 1 ? { peso: pesoDoCurso(a.curso, regras) } : {}),
    })),
  };
  return { dados, avisos, abas: resumoAbas, registros: registros.length, pendencias };
}
