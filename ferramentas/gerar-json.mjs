// Gera os dados de um período letivo a partir de uma planilha, sem abrir o
// site (alternativa à Área do administrador). Mostra a mesma revisão.
//
//   node ferramentas/gerar-json.mjs "Horários.xlsx" --periodo "2026/2" [--titulo "IFSul — Campus Sapiranga"] [--padrao]
//
// Grava dados/periodos/<id>.json e atualiza dados/periodos.json (até 3 períodos).
// Inícios fora da grade são mantidos como estão (use --na-grade para colocá-los na grade).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { lerPlanilha } from "../js/leitor-xlsx.js";
import { interpretar } from "../js/interpretar.js";

const args = process.argv.slice(2);
const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
const comValor = new Set(["--periodo", "--titulo"]);
const arquivo = args.find((a, i) => !a.startsWith("--") && !comValor.has(args[i - 1]));
const nomePeriodo = opcao("--periodo");
if (!arquivo || !nomePeriodo) { console.error('Uso: node ferramentas/gerar-json.mjs planilha.xlsx --periodo "2026/2" [--titulo "..."] [--padrao] [--na-grade]'); process.exit(1); }
const id = nomePeriodo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const nome = basename(arquivo);
const titulo = opcao("--titulo") || nome.replace(/\.(xlsx|xls)$/i, "").replace(/_/g, " ").trim();

const abas = await lerPlanilha(readFileSync(arquivo));
let r = interpretar(abas, { arquivo: nome, titulo });
const decisao = args.includes("--na-grade") ? "grade" : "manter";
if (r.pendencias.length) r = interpretar(abas, { arquivo: nome, titulo, decisoesInicio: Object.fromEntries(r.pendencias.map((p) => [p.chave, decisao])) });
const c = { erro: 0, divergencia: 0, duvida: 0, info: 0 };
for (const a of r.avisos) { c[a.nivel]++; console.log(`[${a.nivel}] ${a.categoria}: ${a.texto}${a.local ? "  (" + a.local + ")" : ""}`); }
const agora = new Date().toISOString();
const dados = { ...r.dados, periodo: { id, nome: nomePeriodo }, publicadoEm: agora, revisao: { erros: c.erro, divergencias: c.divergencia, duvidas: c.duvida } };
mkdirSync("dados/periodos", { recursive: true });
const destino = `dados/periodos/${id}.json`;
writeFileSync(destino, JSON.stringify(dados) + "\n");

const indice = existsSync("dados/periodos.json") ? JSON.parse(readFileSync("dados/periodos.json", "utf8")) : { versao: 2, padrao: null, periodos: [] };
const entrada = { id, nome: nomePeriodo, descricao: "", arquivo: destino, publicadoEm: agora, aulas: dados.aulas.length, turmas: dados.turmas.length, planilha: nome, revisao: dados.revisao };
const pos = indice.periodos.findIndex((p) => p.id === id);
if (pos >= 0) indice.periodos[pos] = { ...indice.periodos[pos], ...entrada, descricao: indice.periodos[pos].descricao || "" };
else if (indice.periodos.length >= 3) { console.error("Já há 3 períodos em dados/periodos.json; remova um antes."); process.exit(1); }
else indice.periodos.push(entrada);
if (args.includes("--padrao") || !indice.padrao) indice.padrao = id;
indice.atualizadoEm = agora;
writeFileSync("dados/periodos.json", JSON.stringify(indice, null, 1) + "\n");
console.log(`\n${dados.aulas.length} aulas, ${dados.turmas.length} turmas → ${destino} (período ${nomePeriodo})`);
console.log(`Erros: ${c.erro} · Divergências: ${c.divergencia} · Dúvidas: ${c.duvida} · Informações: ${c.info}`);
