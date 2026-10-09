# Auditoria de UX/UI, usabilidade, acessibilidade e responsividade

Data: 09/10/2026. Escopo: consulta, área do administrador, versão offline, impressão.

## Como foi feita

- **Navegador real (Chromium) com emulação de dispositivos**, sem aparelhos físicos:
  - celular em pé nas larguras 320, 360, 375, 390, 414 e 430 px, e celular deitado (844×390);
  - tablets (768×1024 e 1024×768) e computadores (1280×800 e 1920×1080);
  - em cada tela, mediu-se: rolagem horizontal, elementos passando da borda, alvos de toque menores que 24 e que 44 px, textos menores que 12 px e erros no console.
- **Acessibilidade:**
  - **axe-core 4.10** (WCAG 2.0/2.1/2.2 A e AA, mais boas práticas), usado só nos testes e não incluído no site;
  - **contraste calculado à mão**, porque o axe não consegue medir o contraste sobre o fundo quadriculado decorativo;
  - teste de **navegação por teclado**: ordem do Tab, foco visível, janela e atalho.
- **Desempenho:**
  - celular com rede 4G ruim (300 ms de latência, cerca de 0,6 Mbit/s) e processador 4× mais lento;
  - medidos FCP, LCP e CLS, também com o Google Fonts fora do ar;
  - tempo de resposta da busca e dos filtros.
- **Regressão:** as baterias de testes de ponta a ponta já existentes cobrem:
  - consulta, filtros, "Agora", impressão e PDF;
  - períodos (adicionar, substituir, editar, remover), revisão, decisões e publicação;
  - agenda, mudanças, aplicativo sem internet e versões offline.

Não houve teste em aparelhos físicos nem com leitores de tela reais (NVDA, VoiceOver). Por isso, **não se declara conformidade WCAG**: as verificações acima são automáticas e por emulação.

## Diagnóstico (antes das correções)

| # | Gravidade | Problema | Onde | Impacto |
|---|---|---|---|---|
| 1 | **Crítico** | A tela "pulava" ao carregar: **CLS 0,97 no celular e 0,69 no computador** (bom é < 0,1). | Consulta, ao abrir | O conteúdo muda de lugar enquanto o professor toca. Clique errado e sensação de site instável. Causas: círculo decorativo preso ao fim da página, selo de status mudando de largura e seletor de período surgindo depois. |
| 2 | **Alto** | No celular, cerca de 650 a 700 px de controles antes do primeiro horário (agrupar, semana/lista, imprimir, offline, salvar, limpar, selo repetido). | Consulta, celular | A tarefa mais frequente (ver o horário) exige rolar uma tela inteira. |
| 3 | **Alto** | Alvos de toque de 26 a 36 px em **tablets e celular deitado** (chips, seletores, "Agenda", "Imprimir", "Só esta"). A regra de 44 px dependia da largura da tela, e não do tipo de tela. | Consulta | Toques errados em telas de toque grandes. |
| 4 | **Alto** | A área de resultados inteira era uma "região viva" para leitores de tela. | `#resultados` | A cada filtro, o leitor de tela lia todos os quadros. |
| 5 | **Médio** | Contraste insuficiente: o cinza-claro dos detalhes ("· 2 períodos", fim do período no quadro) tinha **2,6:1**; o texto de exemplo dos campos, **2,9:1**; o cinza dos rótulos sobre o fundo bege, **4,42:1**. | Toda a interface | Difícil leitura, principalmente ao sol ou com baixa visão. AA pede 4,5:1. |
| 6 | **Médio** | Textos de 9,9 a 11,8 px (etiquetas "ATUAL", "HOJE", "HORÁRIO ESPECIAL", tipo das abas, horários no quadro). | Consulta e administrador | Legibilidade ruim no celular. |
| 7 | **Médio** | A janela (agenda) não prendia o foco: o Tab "fugia" para a página de trás. | Janela | Usuário de teclado se perde; leitor de tela lê o fundo. |
| 8 | **Médio** | Sem atalho para pular os controles até os horários. | Teclado | Muitos Tabs até chegar ao horário. |
| 9 | **Médio** | Fechar ou recarregar a página com uma planilha enviada, revisada e ainda não publicada perdia tudo, sem aviso. | Administrador | Perda de trabalho (revisão e decisões). |
| 10 | **Médio** | Os arquivos de código eram baixados um depois do outro (cadeia de módulos). | Carregamento | Mais lento em rede ruim. |
| 11 | **Baixo** | Seletores cortados ("Todos os pr…") no celular e no tablet. | Filtros | Leitura truncada, embora o rótulo exista. |
| 12 | **Baixo** | O selo "Horários 2026/2" repetia o seletor de período, e o selo de status repetia de novo. | Consulta | Ruído visual. |
| 13 | **Baixo** | Cabeçalho do celular com o botão "Área do administrador" largo, que só a coordenação usa. | Cabeçalho, celular | Espaço tomado por uma função rara. |

O que já estava bom e foi mantido:
- **nenhuma rolagem horizontal** em nenhuma das 11 telas;
- o quadro semanal vira lista por dia no celular;
- estados vazios e de erro explicados;
- confirmações para ações destrutivas (substituir, remover);
- busca e filtros rápidos (5 a 100 ms);
- nenhum erro de JavaScript;
- funcionamento com o Google Fonts fora do ar (cai na fonte do sistema).

## Correções implementadas

| # | O que mudou | Arquivos |
|---|---|---|
| 1 | Bloco "Carregando os horários…" no lugar onde a consulta vai aparecer. O círculo decorativo passou a ficar preso ao topo. O rodapé ficou abaixo da dobra durante o carregamento. O selo de status tem tamanho estável. **CLS: 0,97 → 0,000 (celular) e 0,69 → 0,005 (computador).** | `index.html`, `css/estilo.css`, `js/app.js` |
| 2 | Celular: "Agrupar por", "Semana/Lista" e "Ordenar" entraram no painel recolhível **"Filtros e exibição"**. Imprimir, Versão offline, Salvar e Limpar ficaram juntos na linha do resultado. O selo repetido some quando há seletor de período. O botão do administrador virou só o ícone, com nome acessível. O status ficou curto ("2026/2 · 09/10/2026"). O primeiro horário subiu cerca de 200 px. | `index.html`, `css/estilo.css`, `js/app.js` |
| 3 | Regra `@media (pointer: coarse)`: em **qualquer** tela de toque (celular, tablet, celular deitado), chips, seletores, links de ação, selos, caixas de seleção, "X" da janela e logo têm no mínimo 44 px. **Alvos < 44 px em tablet: 78 → 0.** | `css/estilo.css` |
| 4 | `aria-live` removido dos resultados (fica só na contagem, que é curta). | `index.html` |
| 5 | Novo cinza de texto secundário `#5b6b80` (≥ 4,9:1 em branco, no bege e no cinza-claro). O cinza-claro saiu dos textos. O texto de exemplo dos campos usa o mesmo cinza. | `css/estilo.css` |
| 6 | Menor texto da interface: **12 px** (token `--fs-min`), inclusive no quadro semanal. **Textos < 12 px: 71 a 765 por tela → 0.** | `css/estilo.css` |
| 7 | Janela com fundo **inerte** (`inert`): o Tab e o leitor de tela ficam só nela. O Esc fecha a janela e devolve o foco ao botão. | `js/app.js` |
| 8 | Atalho **"Pular para os horários"**, que aparece no primeiro Tab. | `index.html`, `css/estilo.css`, `js/app.js` |
| 9 | Aviso do navegador ao sair ou recarregar com uma planilha enviada e ainda não publicada nem cancelada. | `js/app.js` |
| 10 | `modulepreload` dos módulos: são baixados em paralelo. Na versão offline, esses links são retirados. | `index.html`, `js/offline.js` |
| 11 | Seletores com o texto "Todas" / "Todos" (o rótulo do campo já diz o quê). | `js/app.js` |

Design system (tokens em `css/estilo.css`):
- **cores:** paleta IFSul, com `--slate-500` agora acessível;
- **tamanhos:** `--fs-min` (12 px) e `--alvo-toque` (44 px);
- **raios:** `--raio`;
- **quebras de layout:** 640, 768 e 900 px, mais `pointer: coarse` para telas de toque.

Nenhuma dependência nova no site.

## Resultados depois das correções

| Medida | Antes | Depois |
|---|---|---|
| CLS celular / computador | 0,97 / 0,69 | **0,000 / 0,005** |
| LCP, celular em rede ruim | 4,5 s | **3,4 s** |
| Rolagem horizontal (11 telas) | nenhuma | nenhuma |
| Alvos de toque < 44 px (tablet e celular deitado) | 78 | **0** |
| Alvos < 24 px (WCAG 2.5.8) | 0 (exceto opções invisíveis dentro de cartões clicáveis) | igual |
| Textos < 12 px | até 765 por tela | **0** |
| Violações do axe (sem animação) | 0 automáticas, com contraste não medido | 0, e o contraste foi corrigido por cálculo manual |
| Erros de JavaScript | 0 | 0 |

Teclado:
- o primeiro Tab mostra o atalho, e o Enter leva aos horários;
- os 30 primeiros Tabs têm todos foco visível;
- na janela, o foco não escapa, e o Esc devolve o foco.

Testes funcionais de ponta a ponta, com a publicação no GitHub simulada, **todos passando**:
- consulta, filtros, "Agora", "Meu horário" e troca de período;
- impressão (18 quadros = 18 páginas) e PDF de conferência (19 páginas);
- períodos (adicionar, substituir com confirmação, cancelar, editar, tornar atual, remover, senha errada);
- intervalos de quarta e troca do dia;
- agenda (.ics), "mudou recentemente" e aplicativo sem internet;
- versões offline, que abrem pelo `file://` sem internet e sem o endereço do site;
- ausência de "null" solto e de menções ao GitHub na tela.

## Identificado, mas não implementado

| Item | Motivo |
|---|---|
| Hospedar a fonte DM Sans no próprio site | Removeria a dependência do Google Fonts, mas os arquivos da fonte não puderam ser baixados neste ambiente. O site já funciona sem ela (cai na fonte do sistema). |
| Navegação fixa no rodapé do celular (filtros e período sempre à mão) | Mudança de produto: ocuparia espaço fixo na tela e muda o padrão do site Chamada. Proposta para avaliação. |
| Área do administrador em etapas separadas (assistente passo a passo) | Hoje é uma página longa e numerada (1 a 4), que funciona e é usada só pela coordenação. Reestruturar seria uma mudança grande sem ganho proporcional. |
| Tema escuro | Não existe no Chamada, e a identidade visual pede consistência. |
| Minificar o código (app.js tem cerca de 95 KB) | Exigiria uma etapa de build; o projeto foi pensado para ser editável sem ferramentas. O ganho em rede é pequeno (o servidor já compacta). |

## Pendências e recomendações

1. Testar em aparelhos físicos: um Android simples, um iPhone e um tablet. Testar também com o leitor de tela do celular (TalkBack ou VoiceOver).
2. Medir os Core Web Vitals reais no site publicado (PageSpeed Insights) depois de algumas visitas.
3. Ao mudar o código, trocar o número de versão dos arquivos (veja o README).
