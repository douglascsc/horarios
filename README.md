# Horários de aula

Site para consultar os horários de aula por **turma, professor, sala, turno e dia**, gerado a partir da planilha do Excel. O administrador envia a planilha, o site organiza os dados sozinho, **mostra o que precisa ser revisado** (inconsistências, divergências e dúvidas), oferece uma prévia e só publica depois da **senha**.

A identidade visual segue o site [Chamada](https://github.com/douglascsc/chamada): paleta do IFSul, fonte DM Sans, fundo quadriculado, painéis "vidro", chips de filtro, avisos coloridos e ícones Lucide embutidos. Também usa o mesmo cuidado contra clickjacking.

## Funcionalidades

**Consulta**
- **Períodos letivos**: até 3 ficam disponíveis ao mesmo tempo (ex.: 2026/2 e 2027/1). Um seletor no topo mostra em qual período você está, e o marcado como *atual* abre primeiro.
- Busca por texto (disciplina, professor, turma, curso, sala, dia), que aceita vários termos.
- Filtros gerados a partir dos dados da planilha, sem opções fixas: curso, turma, professor, sala, turno e dia. Podem ser combinados e limpos com um clique.
- Contador de resultados (aulas, turmas, professores).
- Agrupamento por turma, professor, sala ou dia. A exibição pode ser **Semana** (quadro semanal, com a aula ocupando os períodos certos) ou **Lista**, que pode ser ordenada por horário, disciplina, turma, professor ou sala.
- Turmas divididas aparecem juntas no mesmo horário (ex.: *Eletricidade I / Robótica*).
- Destaque de **hoje**, da aula que está acontecendo **agora** e das que **começam em até 30 min**. Esses destaques se atualizam sozinhos a cada minuto, só com o relógio do aparelho, sem baixar nada de novo.
- Filtro **Agora**: mostra só as aulas em andamento (turma, professor e sala). Se não houver nenhuma, informa a próxima do dia.
- Escolher um curso volta a agrupar **por turma**.
- **Meu horário**: guarda a consulta (ex.: o horário do próprio professor) neste aparelho, com atalho para abrir de novo.
- Aulas EaD ficam num bloco separado.
- Contagem de períodos: as aulas do **PCP contam em dobro** nos totais e na carga horária. Horários e quadros não mudam. A regra fica em `PESO_POR_CURSO`, em `js/interpretar.js`.
- No celular, o quadro semanal vira uma lista por dia, sem rolagem horizontal, e os filtros ficam recolhidos num botão.
- Link compartilhável com os filtros (ex.: `…/#turma=INF1M`, `…/#prof=Mauro&periodo=2027-1`).
- **Agenda**: o botão "Agenda" de cada quadro baixa um arquivo `.ics` com as aulas repetindo toda semana, para abrir no celular ou importar no Google Agenda. Usa as datas do período informadas pela coordenação, que podem ser ajustadas antes de baixar. Aulas EaD ficam de fora.
- **Mudou recentemente**: depois de uma atualização do mesmo período, as aulas novas ou alteradas ganham um selo ("antes: professor, sala") e as que saíram aparecem no quadro, por 14 dias. Um aviso no topo permite ver só as mudanças. Se mais da metade do horário mudou, é considerado um horário novo e nada é marcado.
- **Aplicativo e sem internet**: pode ser instalado na tela inicial ("Instalar app" ou "Adicionar à tela inicial"). Depois do primeiro acesso, funciona sem internet com os últimos horários guardados no aparelho, e avisa quando está assim.
- **Versão offline**: o botão "Baixar versão offline" (na consulta e na área do administrador) gera **um único arquivo .html** (cerca de 350 KB) com o visual, o código e os horários de todos os períodos publicados. Ele abre com dois cliques, sem internet: no computador, num pendrive ou na pasta do Google Drive para computador. É só para consulta (busca, filtros, quadros, impressão e agenda), mostra a data em que foi gerado e precisa ser baixado de novo quando o horário mudar. O arquivo **não contém o endereço do site**, para poder circular sem divulgar o link. Na área do administrador também há "Versão offline desta planilha (sem publicar)", que gera o arquivo direto da planilha enviada, sem colocar nada online.
- **Recado do período**: a coordenação pode deixar um aviso curto em destaque no topo (ex.: "Horário provisório até 20/10"). Ele é definido ao publicar ou em "Editar".
- **Comparar períodos**: com dois ou mais períodos, o botão "Comparar" mostra, com os filtros atuais, o que só existe num, o que só existe no outro e o que mudou de professor, sala ou término (ex.: o horário de um professor em 2026/2 × 2027/1).
- **Excel**: "Excel" baixa um `.xlsx` só com as aulas filtradas (dia, horário, turma, curso, disciplina, professor, sala e turno), pronto para filtrar e somar.
- **Barra fixa no celular**: atalhos sempre à mão para Filtros (com o número de filtros ativos), Agora, Hoje e Topo. Ela some enquanto se digita.
- **Impressão**: um quadro por página, ajustado à folha A4 deitada, com o título, o período e a data. O botão "Imprimir" de um quadro imprime só ele; o da barra imprime todos.

**Área do administrador** (`…/#admin`)

**Entrada com a senha de publicação**: depois que a publicação está configurada, a área do administrador só abre com a senha de publicação, a mesma criada junto com o token. Enquanto a aba estiver aberta, a senha não é pedida de novo para publicar, editar, remover ou mexer na senha de leitura. Fechar ou recarregar a página, ou clicar em "Sair", pede a senha outra vez. Ela fica só na memória da aba, nunca é gravada no aparelho. Trocar a própria senha continua pedindo a senha atual. Antes da primeira configuração, a área fica aberta, para que seja possível configurar.

Ao enviar uma planilha, a área vira um **assistente em 4 passos**, com uma barra de etapas no topo e os botões Voltar/Próximo. O site só deixa avançar quando o passo está resolvido e diz o que falta.

1. **Planilha**: envio do `.xlsx` (por clique ou arrastando o arquivo).
2. **Revisão**: avisos classificados como *Erro*, *Divergência*, *Dúvida* e *Informação*, com a aba e a linha de cada um (veja abaixo). Aulas com **início fora da grade** pedem uma decisão: **manter o horário** (autorizar) ou **colocar na grade**; sem ela, não dá para seguir. Em "Detalhes da leitura" aparecem cada aba e como ela foi usada, os cabeçalhos reconhecidos (ex.: `Dia Semana → Dia`) e as colunas ignoradas.
3. **Destino**:
   - **A. Substituir** os horários de um período existente. Você escolhe qual, e os outros não mudam.
   - **B. Adicionar** um novo período (ex.: 2027/1). Se os 3 espaços já estiverem ocupados, é preciso escolher qual deles sai.
   - **C. Cancelar**: nada é alterado.

   Antes de uma substituição, o site mostra qual período será afetado e pede confirmação; sem ela, não passa para o passo 4. Também mostra **o que muda** em relação à versão publicada (aulas novas, alteradas e que saem). Aqui se informam o primeiro e o último dia de aula (usados no botão "Agenda"), o dia dos intervalos diferenciados e o recado do período.
4. **Publicar**: um resumo do que vai acontecer, a **prévia** do site, o **PDF de conferência** (capa com o resumo da revisão e o quadro de todas as turmas, marcado "não publicado"), a **versão offline desta planilha** (sem colocar nada no ar) e a **publicação com senha**. Se houver erros ou divergências, é preciso confirmar que foram revisados.

Fora do assistente:
- **Períodos publicados**: ver, tornar atual, editar (nome, observação, recado e datas das aulas) ou remover. Cada ação pede a senha. Também é possível baixar a versão offline de tudo o que está publicado.
- **Configuração**: token, senha de publicação e **senha de leitura** (veja abaixo).

## Como a planilha é interpretada

Nada depende de nomes fixos de abas: cada aba é reconhecida pelo conteúdo.

| Tipo de aba | Como é reconhecida | Para que serve |
|---|---|---|
| **Tabela de horários** (ex.: `Dados ETM`) | cabeçalho com pelo menos *Disciplina*, *Dia* e *Início* | fonte dos horários publicados |
| **Quadros** (ex.: `ETM`, `PROF`, `SALAS`, `DEPENDENCIAS`) | linha com os dias (`seg ter qua qui sex ead`) e horários na 1ª coluna | define os períodos (07:30–08:15…) e serve para **conferência** |
| **Carga horária** (ex.: `CH Profs`) | cabeçalho com professor + total | **conferência** da soma de períodos |

Cabeçalhos aceitos na tabela de horários (sem diferença entre maiúsculas e acentos):

| Campo | Cabeçalhos |
|---|---|
| Ano/Semestre | Ano, Sem, Semestre, Série, Módulo, Etapa |
| Turno | Turno (`M`, `T`, `N`; `D` = dependência) |
| Disciplina | Disciplina, Componente, Projeto, Atividade |
| Nº de períodos | CH, Períodos, Aulas |
| Dia | Dia Semana, Dia (`SEGUNDA`, `seg`, `EaD`…) |
| Início | Início, Horário início, Hora |
| Professor | Professor, Docente, Coordenador (vários separados por vírgula) |
| Sala | Sala, Local (várias separadas por `/`, ex.: `305/402`) |
| Curso / Turma | opcionais; sem eles, o curso vem do nome da aba (`Dados INF` → `INF`) |

**Se a planilha mudar**, o site continua encontrando os dados nestes casos (todos testados):
- colunas em outra ordem;
- colunas novas no meio;
- título ou linhas em branco acima do cabeçalho (o cabeçalho é procurado nas 30 primeiras linhas);
- cabeçalhos com os sinônimos acima;
- abas renomeadas (`ETM dados`, `Horários - INF`);
- linhas fora de ordem ou com linhas vazias no meio;
- um curso novo (é só acrescentar a aba);
- sem as abas de quadros (nesse caso, é usada a grade oficial de períodos).

Se faltar uma coluna obrigatória, a revisão mostra **qual coluna falta e os nomes aceitos**. Uma estrutura que o site não entende nunca é publicada em silêncio.

**Grade de períodos e intervalos.** A grade oficial fica em `GRADE_OFICIAL`, no arquivo `js/interpretar.js`:
- Intervalos normais: 09:45–10:00, 12:15–13:30, 15:45–16:00 e 20:30–20:45.
- No dia da **reunião de ensino** (por padrão, **quarta-feira**), os intervalos são **09:00–09:15** e **15:00–15:15**. O 3º período da manhã vai das 09:15 às 10:00 e o 3º da tarde, das 15:15 às 16:00.
- As aulas desse dia sempre seguem essa grade, mesmo que a planilha diga outro horário: uma aula "15:00" na quarta aparece como 15:15–16:00.
- Na publicação, o site sempre informa isso e permite **trocar o dia** (ou escolher "nenhum"), caso a reunião mude. Se ninguém mexer, continua sendo quarta.
- A revisão avisa se os quadros da planilha tiverem horários diferentes da grade oficial.

A turma é montada como **curso + ano + turno** (`INF1M`, `PCP2N`), igual aos quadros por professor da planilha. As dependências viram `Dep. INF`, `Dep. ETM`. Cada linha ocupa *CH* períodos seguidos a partir do *Início*, seguindo os períodos dos quadros. Os intervalos, como o das 09:45 às 10:00, são respeitados.

### O que a revisão confere

- **Erros** (a linha não é publicada): falta disciplina, dia ou início; dia ou horário que não pode ser lido; mais períodos do que cabem no dia.
- **Divergências**:
  - o mesmo professor em dois lugares ao mesmo tempo;
  - a mesma sala com duas aulas;
  - registro repetido;
  - turno informado diferente do horário (ex.: `M` às 13:30);
  - **quadro × tabela**: cada quadro de turma, professor, sala e dependências é comparado, célula por célula, com o que a tabela de dados gera;
  - **carga horária** declarada diferente da soma das aulas.
- **Dúvidas**:
  - início fora dos períodos da grade (ex.: 13:45), que exige decisão do administrador;
  - aula que atravessa o intervalo do almoço;
  - falta de professor ou de sala;
  - disciplinas com uma letra de diferença, que são unificadas, mas ficam marcadas para conferência;
  - professor com aula no mesmo horário e na mesma sala (turmas juntas?);
  - quadros que não puderam ser ligados aos dados.
- **Informações**: abas ignoradas ou vazias, colunas não usadas, espaços extras corrigidos, resumo das conferências e **nomes unificados**.

**Nomes escritos de formas diferentes são juntados na consulta.** Diferenças só de acento, maiúscula, pontuação ou espaço contam como o mesmo nome (`Fisica I` = `Física I`); fica a grafia com acentos. Nas disciplinas, também são juntados nomes com **uma letra** de diferença numa palavra de 5 letras ou mais (`Emprendedorismo` = `Empreendedorismo`), mas nunca em numerais (`Física I` ≠ `Física II`). Nos professores isso não é feito: *Juliana* e *Juliane* são pessoas diferentes.

Para quem mantém o site, existe também a versão de terminal: `node ferramentas/gerar-json.mjs planilha.xlsx --periodo "2026/2" [--padrao]`. Ela grava o período em `dados/periodos/` e mostra a mesma revisão.

## Arquitetura

Site **estático** (HTML, CSS e JavaScript, sem framework nem bibliotecas externas), hospedado no **GitHub Pages**. Não há servidor nem banco de dados.

- `dados/periodos.json`: índice dos períodos letivos (até 3) e qual é o atual.
- `dados/periodos/<id>.json`: os horários de cada período, como `2026-2.json`.
- `dados/publicacao.json`: a configuração de publicação, com o token **cifrado**. Só existe depois de configurada.
- `js/leitor-xlsx.js`: leitor próprio de `.xlsx` (zip + XML).
- `js/interpretar.js`: interpretação e revisão. É uma função pura, que também roda no Node.
- `js/publicar.js`: cifra o token e grava os arquivos pela API do GitHub.
- `js/recursos.js`: arquivo de agenda (.ics), planilha do Excel exportada e comparação entre versões.
- `js/leitura.js`: senha de leitura (cifra e decifra os arquivos de horários).
- `dados/leitura.json`: só existe com a senha de leitura ligada; guarda a chave dos horários, trancada com essa senha.
- `js/offline.js`: monta a versão offline (cada módulo vira uma função dentro do arquivo e os dados vão embutidos, porque o navegador não carrega módulos nem `.json` em páginas abertas direto do computador).
- `manifest.webmanifest` e `sw.js`: aplicativo instalável e funcionamento sem internet.
- `js/app.js`: interface. `css/estilo.css`: visual.

**Publicar** é gravar esses arquivos neste repositório pela API do GitHub. Cada ação (adicionar, substituir, editar, remover) vira **um único commit**: ou tudo é gravado, ou nada muda. Antes de gravar, o índice é lido direto do repositório, para não desfazer uma publicação recente. O GitHub Pages atualiza o site em cerca de 1 minuto, e o histórico do Git guarda todas as versões, o que permite voltar a uma anterior.

**Versão dos arquivos:** `index.html`, `js/app.js`, `js/recursos.js`, `js/publicar.js` e `sw.js` usam a mesma versão (`?v=AAAAMMDD…` / `VERSAO`). Ao mudar o código, troque esse número em todos eles, para os navegadores não juntarem código novo com código antigo guardado em cache.

**Consumo:** quem consulta só baixa os arquivos do período que abriu, uma vez. Os destaques "agora" e "começa em" são recalculados no próprio navegador e não fazem requisições. A API do GitHub só é usada quando o administrador publica.

## Senha de publicação

O GitHub só aceita gravações com um token. Para que o administrador precise apenas de uma senha:

1. Na configuração (feita **uma vez**), o administrador cola um token *fine-grained* com acesso **só a este repositório** e permissão **Contents: Read and write**, e escolhe uma senha de **pelo menos 10 caracteres**.
2. O navegador cifra o token com **AES-GCM**, usando uma chave derivada da senha (**PBKDF2-SHA256, 600 mil iterações**, sal aleatório), e grava o resultado em `dados/publicacao.json`.
3. Para entrar na área do administrador e publicar, em qualquer computador, basta a senha. O token é decifrado na memória, usado e descartado. Com a senha errada, nada é enviado.

**Riscos aceitos.** O arquivo cifrado é público, então alguém pode tentar adivinhar a senha fora do site. As 600 mil iterações tornam isso lento, mas a segurança depende de uma **senha forte**. Mesmo que a senha seja descoberta, o token só consegue alterar este repositório, e cada alteração fica no histórico, de onde pode ser desfeita. Se houver suspeita, revogue o token no GitHub e refaça a configuração. Quando o token expira, o site avisa e é só configurar de novo. O limite de 5 tentativas por minuto vale apenas no aparelho onde as senhas foram digitadas. A tela de entrada da área do administrador é uma conveniência: como o site é estático, o código da página é público. O que de fato protege a publicação é o token cifrado, que só a senha certa abre.

### Como configurar

1. **Publicar o site**: no repositório, *Settings → Pages → Build and deployment*, escolha *Deploy from a branch*, ramo `main`, pasta `/ (root)`.
2. **Criar o token**: *GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*. Em *Repository access*, escolha *Only select repositories* → este repositório. Em *Permissions*, dê *Contents: Read and write*.
3. Abra `…/#admin` → **Configuração da publicação**, cole o token, confirme o repositório (`douglascsc/horarios`) e defina a senha.
4. Pronto: envie a planilha, revise, veja a prévia e publique com a senha. A senha pode ser trocada na mesma tela.

## Senha de leitura (opcional)

Por padrão, quem tem o link vê os horários. Em **Configuração → Senha de leitura**, o administrador pode exigir uma senha para **ver** o site:

- Os arquivos de horários passam a ser gravados **cifrados** (AES-GCM 256) com uma chave aleatória. A chave fica em `dados/leitura.json`, trancada com a senha de leitura (PBKDF2-SHA256, 310 mil iterações), e também trancada com a senha de publicação, para o administrador continuar publicando sem digitá-la.
- Quem abre o site vê uma tela pedindo a senha. Com "Lembrar neste aparelho", ela não é pedida de novo; "Bloquear", no rodapé, esquece.
- Ao trocar a senha, dá para **gerar chave nova**: os aparelhos que já tinham entrado precisam da senha nova. A proteção pode ser removida a qualquer momento (os arquivos voltam a ser gravados abertos).
- **Limites:** é uma proteção de site estático. O arquivo cifrado é público, então alguém pode tentar adivinhar a senha fora do site; use uma senha que não seja óbvia e troque-a, gerando chave nova, se ela vazar. A **versão offline** baixada por quem já entrou **não pede senha**: ela leva os horários abertos dentro do arquivo.

## Segurança da importação

- A planilha é lida **no navegador** e nada é enviado antes da publicação.
- Só os **valores** das células são lidos. Fórmulas e macros (`vbaProject.bin`) nunca são executadas.
- O XML é lido por um analisador próprio, que não expande entidades nem segue referências externas (proteção contra XXE e "bomba de XML").
- Há limites de 15 MB por arquivo, 80 MB descompactado, 20 mil linhas e 200 colunas (proteção contra "bomba de zip").
- O tipo do arquivo é conferido pelo conteúdo, não só pela extensão.
- Todo texto vindo da planilha entra na página como texto, nunca como HTML (proteção contra injeção de código). Há também uma política de segurança de conteúdo (CSP) que só permite scripts do próprio site.

## Limitações conhecidas

- **`.xls` antigo (Excel 97-2003)**: não é lido. O site explica como salvar como `.xlsx` no Excel ou no Google Planilhas (*Arquivo → Fazer download → .xlsx*). Ler `.xls` exigiria uma biblioteca externa grande.
- Um `.xlsx` protegido por senha também precisa ser salvo sem senha antes do envio.
- A dedução da turma (curso + ano + turno) segue o padrão desta planilha. Se outra planilha tiver uma coluna *Turma*, ela é usada diretamente.

## Créditos

Desenvolvido por [Prof. Douglas Camargo Carvalho](https://douglasc.top/sobre/), docente do IFSul — Campus Sapiranga. Ícones: [Lucide](https://lucide.dev) (ISC).
