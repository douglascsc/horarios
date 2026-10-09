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
export const ARQUIVO_DADOS = "dados/horarios.json";

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
    throw new ErroPublicacao("Sem conexão com o GitHub. Verifique a internet e tente de novo.");
  }
  if (resp.status === 404 && metodo === "GET") return null;
  if (!resp.ok) {
    let msg = "";
    try { msg = (await resp.json()).message || ""; } catch { /* sem corpo */ }
    if (resp.status === 401) throw new ErroPublicacao("O token do GitHub foi recusado (expirou ou foi revogado). Refaça a configuração da publicação com um token novo.");
    if (resp.status === 403 || resp.status === 404) throw new ErroPublicacao(`O token não tem permissão de escrita no repositório (${resp.status}${msg ? ": " + msg : ""}). Confira se ele dá acesso "Contents: Read and write" a este repositório.`);
    if (resp.status === 409) throw new ErroPublicacao("O arquivo foi alterado por outra publicação ao mesmo tempo. Tente publicar de novo.");
    throw new ErroPublicacao(`O GitHub recusou a operação (${resp.status}${msg ? ": " + msg : ""}).`);
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
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new ErroPublicacao("Repositório inválido. Use o formato dono/nome (ex.: douglascsc/horarios).");
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

export async function publicarHorarios(config, senha, dados) {
  const token = await decifrarToken(config, senha);
  const conteudo = JSON.stringify(dados) + "\n";
  const resposta = await gravarArquivo(token, config.repo, config.ramo || "main", ARQUIVO_DADOS, conteudo,
    `Publica horários${dados.arquivo ? " — " + dados.arquivo : ""} (${dados.aulas.length} aulas)`);
  return resposta && resposta.commit ? resposta.commit.html_url : null;
}
