// Senha de leitura: quem pode VER os horários.
//
// Com a proteção ligada, os arquivos de horários (dados/periodos.json e
// dados/periodos/*.json) ficam cifrados com uma chave aleatória (AES-GCM
// 256). Essa chave fica guardada em dados/leitura.json, trancada com a
// senha de leitura (PBKDF2-SHA256). Quem digita a senha certa destranca a
// chave, que pode ficar guardada no aparelho ("lembrar"). A mesma chave
// também fica trancada com a senha de publicação, na configuração, para o
// administrador continuar publicando sem digitar a senha de leitura.
//
// Limite: é uma proteção de site estático. Quem tiver o arquivo cifrado
// pode tentar adivinhar a senha fora do site; por isso, use uma senha
// que não seja óbvia e troque-a (gerando chave nova) se ela vazar.

export const ARQUIVO_LEITURA = "dados/leitura.json";
export const TAMANHO_MINIMO_SENHA_LEITURA = 6;
const ITERACOES = 310000;

const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const paraBase64 = b64;
export const deBase64 = deB64;

export class SenhaIncorreta extends Error { constructor() { super("Senha incorreta."); } }

export const estaCifrado = (obj) => !!obj && obj.cifrado === 1 && typeof obj.dados === "string";
export function gerarChave() { return crypto.getRandomValues(new Uint8Array(32)); }
async function chaveAes(bruta) { return crypto.subtle.importKey("raw", bruta, "AES-GCM", false, ["encrypt", "decrypt"]); }

export async function cifrarJson(bruta, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifra = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveAes(bruta), new TextEncoder().encode(JSON.stringify(obj))));
  return { cifrado: 1, iv: b64(iv), dados: b64(cifra) };
}
export async function decifrarJson(bruta, obj) {
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(obj.iv) }, await chaveAes(bruta), deB64(obj.dados));
  return JSON.parse(new TextDecoder().decode(claro));
}

async function chaveDaSenha(senha, sal, iteracoes) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: iteracoes, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
// tranca a chave dos horários com a senha de leitura (conteúdo de dados/leitura.json)
export async function trancarComSenha(bruta, senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const cifra = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveDaSenha(senha, sal, ITERACOES), bruta));
  return { versao: 1, sal: b64(sal), iv: b64(iv), iteracoes: ITERACOES, chave: b64(cifra), criadoEm: new Date().toISOString() };
}
export async function destrancarComSenha(leitura, senha) {
  try {
    const k = await chaveDaSenha(senha, deB64(leitura.sal), leitura.iteracoes || ITERACOES);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(leitura.iv) }, k, deB64(leitura.chave)));
  } catch { throw new SenhaIncorreta(); }
}
