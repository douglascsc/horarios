// Publicação protegida por senha.
//
// O site é estático (GitHub Pages): publicar = gravar dados/horarios.json no
// próprio repositório pela API do GitHub. Para isso é preciso um token do
// GitHub com permissão de escrita SÓ neste repositório. O token nunca fica
// em texto aberto: ele é cifrado (AES-GCM, chave derivada da senha com
// PBKDF2-SHA256, 600 mil iterações) e guardado em dados/publicacao.json.
// Quem publica só digita a senha; o token é decifrado na memória, usado e
// descartado. Sem a senha, o arquivo cifrado não serve para nada.

const ITERACOES = 600000;
export const TAMANHO_MINIMO_SENHA = 10;
export const ARQUIVO_CONFIG = "dados/publicacao.json";
export const ARQUIVO_DADOS = "dados/horarios.json"; // formato antigo (um período só), ainda lido se não houver índice

export class ErroPublicacao extends Error {}

const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function chaveDaSenha(senha, sal, iteracoes) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: iteracoes, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function cifrarToken(token, senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chave = await chaveDaSenha(senha, sal, ITERACOES);
  const cifra = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(token)));
  return { sal: b64(sal), iv: b64(iv), iteracoes: ITERACOES, token: b64(cifra) };
}

export async function decifrarToken(config, senha) {
  try {
    const chave = await chaveDaSenha(senha, deB64(config.sal), config.iteracoes || ITERACOES);
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(config.iv) }, chave, deB64(config.token));
    return new TextDecoder().decode(claro);
  } catch {
    throw new ErroPublicacao("Senha incorreta.");
  }
}

// ---------------------------------------------------------------- GitHub
async function github(token, metodo, caminho, corpo) {
  let resp;
  try {
    resp = await fetch(`https://api.github.com${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ErroPublicacao("Sem conexão com o servidor de publicação. Verifique a internet e tente de novo.");
  }
  if (resp.status === 404 && metodo === "GET") return null;
  if (!resp.ok) {
    let msg = "";
    try { msg = (await resp.json()).message || ""; } catch { /* sem corpo */ }
    if (resp.status === 401) throw new ErroPublicacao("O token de acesso foi recusado (expirou ou foi revogado). Refaça a configuração da publicação com um token novo.");
    if (resp.status === 403 || resp.status === 404) throw new ErroPublicacao(`O token não tem permissão de escrita no repositório (${resp.status}${msg ? ": " + msg : ""}). Confira se ele dá acesso "Contents: Read and write" a este repositório.`);
    if (resp.status === 409 || (resp.status === 422 && metodo === "PATCH")) throw new ErroPublicacao("Outra publicação foi feita ao mesmo tempo. Nada foi alterado; tente de novo.");
    throw new ErroPublicacao(`O servidor de publicação recusou a operação (${resp.status}${msg ? ": " + msg : ""}).`);
  }
  return resp.json();
}

function base64Utf8(texto) { return b64(new TextEncoder().encode(texto)); }

async function gravarArquivo(token, repo, ramo, caminho, conteudo, mensagem) {
  const atual = await github(token, "GET", `/repos/${repo}/contents/${caminho}?ref=${encodeURIComponent(ramo)}`);
  return github(token, "PUT", `/repos/${repo}/contents/${caminho}`, {
    message: mensagem, content: base64Utf8(conteudo), branch: ramo, ...(atual && atual.sha ? { sha: atual.sha } : {}),
  });
}

export async function verificarToken(token, repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new ErroPublicacao("Repositório inválido. Use o formato dono/nome (ex.: escola/horarios).");
  const info = await github(token, "GET", `/repos/${repo}`);
  if (!info) throw new ErroPublicacao("Repositório não encontrado com esse token. Confira o nome e se o token dá acesso a ele.");
  if (info.permissions && info.permissions.push === false) throw new ErroPublicacao("O token consegue ler o repositório, mas não escrever nele.");
  return info.default_branch || "main";
}

// Grava a configuração (token cifrado) no repositório.
export async function salvarConfiguracao({ token, repo, senha }) {
  if (senha.length < TAMANHO_MINIMO_SENHA) throw new ErroPublicacao(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  const ramo = await verificarToken(token, repo);
  const config = { versao: 1, repo, ramo, ...(await cifrarToken(token, senha)), criadoEm: new Date().toISOString() };
  await gravarArquivo(token, repo, ramo, ARQUIVO_CONFIG, JSON.stringify(config, null, 2) + "\n", "Atualiza a configuração de publicação (token cifrado)");
  return config;
}

export async function trocarSenha(config, senhaAtual, senhaNova) {
  if (senhaNova.length < TAMANHO_MINIMO_SENHA) throw new ErroPublicacao(`A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  const token = await decifrarToken(config, senhaAtual);
  return salvarConfiguracao({ token, repo: config.repo, senha: senhaNova });
}

// ---------------------------------------------------------------- períodos letivos
// Cada período fica em dados/periodos/<id>.json e o índice em
// dados/periodos.json. Toda mudança (importar, substituir, remover,
// renomear, tornar padrão) vira UM commit só, pela API "Git Data" do
// GitHub: ou tudo é gravado, ou nada muda.
export const MAX_PERIODOS = 3;
export const ARQUIVO_INDICE = "dados/periodos.json";
export const arquivoDoPeriodo = (id) => `dados/periodos/${id}.json`;

export function idDoPeriodo(nome) {
  return String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function decodificarBase64Utf8(b) { return new TextDecoder().decode(deB64(b.replace(/\s/g, ""))); }

// Índice atual lido direto do repositório (não do site, que pode estar
// em cache), para nunca sobrescrever uma publicação recente.
async function lerIndiceRemoto(token, repo, ramo) {
  const r = await github(token, "GET", `/repos/${repo}/contents/${ARQUIVO_INDICE}?ref=${encodeURIComponent(ramo)}`);
  if (!r || !r.content) return { versao: 2, padrao: null, periodos: [] };
  try {
    const indice = JSON.parse(decodificarBase64Utf8(r.content));
    if (!Array.isArray(indice.periodos)) throw new Error();
    return indice;
  } catch {
    throw new ErroPublicacao("O índice de períodos no repositório está corrompido (dados/periodos.json).");
  }
}

async function gravarCommit(token, repo, ramo, mudancas, mensagem) {
  const ref = await github(token, "GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(ramo)}`);
  if (!ref) throw new ErroPublicacao(`O ramo "${ramo}" não existe no repositório.`);
  const commitAtual = await github(token, "GET", `/repos/${repo}/git/commits/${ref.object.sha}`);
  const arvore = await github(token, "POST", `/repos/${repo}/git/trees`, {
    base_tree: commitAtual.tree.sha,
    tree: mudancas.map((m) => (m.conteudo === null
      ? { path: m.caminho, mode: "100644", type: "blob", sha: null }
      : { path: m.caminho, mode: "100644", type: "blob", content: m.conteudo })),
  });
  const novo = await github(token, "POST", `/repos/${repo}/git/commits`, { message: mensagem, tree: arvore.sha, parents: [ref.object.sha] });
  await github(token, "PATCH", `/repos/${repo}/git/refs/heads/${encodeURIComponent(ramo)}`, { sha: novo.sha, force: false });
  return novo.html_url || `https://github.com/${repo}/commit/${novo.sha}`;
}

const dataValida = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : "");
function resumoDoPeriodo(id, nome, descricao, dados, datas) {
  return {
    id, nome, descricao: descricao || "", arquivo: arquivoDoPeriodo(id),
    inicioAulas: dataValida(datas && datas.inicio), fimAulas: dataValida(datas && datas.fim),
    recado: String((datas && datas.recado) || "").trim().slice(0, 240),
    publicadoEm: dados.publicadoEm, aulas: dados.aulas.length, turmas: dados.turmas.length,
    planilha: dados.arquivo || "", revisao: dados.revisao || null,
  };
}

// Aplica uma operação sobre o índice atual e grava tudo num commit.
//  op = { tipo: "importar", modo: "substituir"|"novo", alvo?, sai?, nome, descricao, padrao, dados }
//     | { tipo: "remover", id } | { tipo: "padrao", id } | { tipo: "renomear", id, nome, descricao }
export async function alterarPeriodos(config, senha, op) {
  const token = await decifrarToken(config, senha);
  const repo = config.repo, ramo = config.ramo || "main";
  const indice = await lerIndiceRemoto(token, repo, ramo);
  const lista = indice.periodos.slice();
  const acha = (id) => lista.find((p) => p.id === id);
  const mudancas = [];
  let mensagem;

  if (op.tipo === "importar") {
    const nome = String(op.nome || "").trim();
    const id = idDoPeriodo(nome);
    if (!id) throw new ErroPublicacao("Informe o nome do período letivo (ex.: 2027/1).");
    let saiId = null;
    if (op.modo === "substituir") {
      if (!acha(op.alvo)) throw new ErroPublicacao("O período escolhido para substituir não existe mais. Recarregue a página.");
      saiId = op.alvo;
    } else {
      if (acha(id)) throw new ErroPublicacao(`Já existe um período "${acha(id).nome}". Para atualizá-lo, escolha "Substituir um período existente".`);
      if (lista.length >= MAX_PERIODOS) {
        if (!op.sai || !acha(op.sai)) throw new ErroPublicacao(`Já há ${MAX_PERIODOS} períodos publicados. Escolha qual deles será substituído pelo novo.`);
        saiId = op.sai;
      }
    }
    if (saiId !== id && acha(id)) throw new ErroPublicacao(`Já existe outro período chamado "${acha(id).nome}". Use outro nome.`);
    const dados = { ...op.dados, periodo: { id, nome }, publicadoEm: new Date().toISOString() };
    const entrada = resumoDoPeriodo(id, nome, op.descricao, dados, { ...(op.datas || {}), recado: op.recado });
    let pos = lista.length;
    const nomeSai = saiId ? acha(saiId).nome : "";
    if (saiId) {
      pos = lista.findIndex((p) => p.id === saiId);
      lista.splice(pos, 1);
      if (saiId !== id) mudancas.push({ caminho: arquivoDoPeriodo(saiId), conteudo: null });
    }
    lista.splice(pos, 0, entrada);
    mudancas.push({ caminho: arquivoDoPeriodo(id), conteudo: JSON.stringify(dados) + "\n" });
    if (op.padrao || !indice.padrao || indice.padrao === saiId) indice.padrao = id;
    const origem = dados.arquivo ? ` — ${dados.arquivo}` : "";
    if (!saiId) mensagem = `Adiciona o período ${nome}${origem} (${dados.aulas.length} aulas)`;
    else if (saiId === id) mensagem = `Atualiza o período ${nome}${origem} (${dados.aulas.length} aulas)`;
    else mensagem = `Substitui o período ${nomeSai} por ${nome}${origem} (${dados.aulas.length} aulas)`;
  } else if (op.tipo === "remover") {
    const p = acha(op.id);
    if (!p) throw new ErroPublicacao("Esse período não existe mais. Recarregue a página.");
    lista.splice(lista.indexOf(p), 1);
    mudancas.push({ caminho: arquivoDoPeriodo(p.id), conteudo: null });
    if (indice.padrao === p.id) indice.padrao = lista[0] ? lista[0].id : null;
    mensagem = `Remove o período ${p.nome}`;
  } else if (op.tipo === "padrao") {
    const p = acha(op.id);
    if (!p) throw new ErroPublicacao("Esse período não existe mais. Recarregue a página.");
    indice.padrao = p.id;
    mensagem = `Define ${p.nome} como período padrão`;
  } else if (op.tipo === "renomear") {
    const p = acha(op.id);
    if (!p) throw new ErroPublicacao("Esse período não existe mais. Recarregue a página.");
    const nome = String(op.nome || "").trim();
    if (!idDoPeriodo(nome)) throw new ErroPublicacao("Informe o nome do período.");
    const outro = lista.find((x) => x.id !== p.id && idDoPeriodo(x.nome) === idDoPeriodo(nome));
    if (outro) throw new ErroPublicacao(`Já existe um período chamado "${outro.nome}".`);
    mensagem = p.nome === nome ? `Edita o período ${nome}` : `Renomeia o período ${p.nome} para ${nome}`;
    p.nome = nome;
    p.descricao = String(op.descricao || "").trim();
    if (op.datas) { p.inicioAulas = dataValida(op.datas.inicio); p.fimAulas = dataValida(op.datas.fim); }
    if (op.recado !== undefined) p.recado = String(op.recado || "").trim().slice(0, 240);
    // o id (e o arquivo) continuam os mesmos: links antigos seguem valendo
  } else throw new ErroPublicacao("Operação desconhecida.");

  const novoIndice = { versao: 2, padrao: indice.padrao, atualizadoEm: new Date().toISOString(), periodos: lista.map((p) => ({ ...p })) };
  mudancas.push({ caminho: ARQUIVO_INDICE, conteudo: JSON.stringify(novoIndice, null, 1) + "\n" });
  const link = await gravarCommit(token, repo, ramo, mudancas, mensagem);
  return { indice: novoIndice, link, dados: op.tipo === "importar" ? JSON.parse(mudancas.find((m) => m.caminho.startsWith("dados/periodos/") && m.conteudo)?.conteudo || "null") : null };
}
