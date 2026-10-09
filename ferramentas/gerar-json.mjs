// Gera dados/horarios.json a partir de uma planilha, sem abrir o site
// (alternativa à Área do administrador). Mostra a mesma revisão no terminal.
//
//   node ferramentas/gerar-json.mjs "Horários.xlsx" [--titulo "Horários 2026/2"] [--saida dados/horarios.json]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { lerPlanilha } from "../js/leitor-xlsx.js";
import { interpretar } from "../js/interpretar.js";

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--titulo" && args[args.indexOf(a) - 1] !== "--saida");
if (!arquivo) { console.error('Uso: node ferramentas/gerar-json.mjs planilha.xlsx [--titulo "..."] [--saida dados/horarios.json]'); process.exit(1); }
const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
const nome = basename(arquivo);
const titulo = opcao("--titulo") || nome.replace(/\.(xlsx|xls)$/i, "").replace(/(\d{4})[_-](\d)\b/, "$1/$2").replace(/_/g, " ").trim();
const saida = opcao("--saida") || "dados/horarios.json";

const r = interpretar(await lerPlanilha(readFileSync(arquivo)), { arquivo: nome, titulo });
const c = { erro: 0, divergencia: 0, duvida: 0, info: 0 };
for (const a of r.avisos) { c[a.nivel]++; console.log(`[${a.nivel}] ${a.categoria}: ${a.texto}${a.local ? "  (" + a.local + ")" : ""}`); }
const dados = { ...r.dados, publicadoEm: new Date().toISOString(), revisao: { erros: c.erro, divergencias: c.divergencia, duvidas: c.duvida } };
writeFileSync(saida, JSON.stringify(dados) + "\n");
console.log(`\n${dados.aulas.length} aulas, ${dados.turmas.length} turmas → ${saida}`);
console.log(`Erros: ${c.erro} · Divergências: ${c.divergencia} · Dúvidas: ${c.duvida} · Informações: ${c.info}`);
