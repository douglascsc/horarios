# Horários de aula

Site para consultar os horários de aula por **turma, professor, sala, turno e dia**, gerado a partir da planilha do Excel. O administrador envia a planilha, o site organiza os dados sozinho, **mostra o que precisa ser revisado** (inconsistências, divergências e dúvidas), oferece uma prévia e só publica depois da **senha**.

A identidade visual segue o site [Chamada](https://github.com/douglascsc/chamada): paleta do IFSul, fonte DM Sans, fundo quadriculado, painéis "vidro", chips de filtro, avisos coloridos e ícones Lucide embutidos. Também usa o mesmo cuidado contra clickjacking.

## Funcionalidades

**Consulta (pública)**
- **Períodos letivos**: até 3 ficam disponíveis ao mesmo tempo (ex.: 2026/2 e 2027/1). Um seletor no topo mostra em qual período você está, e o marcado como *atual* abre primeiro.
- Busca por texto (disciplina, professor, turma, curso, sala, dia), que aceita vários termos.
- Filtros gerados a partir dos dados da planilha, sem opções fixas: curso, turma, professor, sala, turno e dia. Podem ser combinados e limpos com um clique.
- Contador de resultados (aulas, turmas, professores).
- Agrupamento por turma, professor, sala ou dia. A exibição pode ser **Semana** (quadro semanal, com a aula ocupando os períodos certos) ou **Lista**, que pode ser ordenada por horário, disciplina, turma, professor ou sala.
- Turmas divididas aparecem juntas no mesmo horário (ex.: *Eletricidade I / Robótica*).
- Destaque de **hoje**, da aula que está acontecendo **agora** e das que **começam em até 30 min**. Esses destaques se atualizam sozinhos a cada minuto, só com o relógio do aparelho, sem baixar nada de novo.
- Filtro **Agora**: mostra só as aulas em andamento (turma, professor e sala). Se não houver nenhuma, informa a próxima do dia.
- Escolher um curso volta a agrupar **por turma**.
- **Meu horário**: guarda a consulta (ex.: a turma do aluno) neste aparelho, com atalho para abrir de novo.
- Aulas EaD ficam num bloco separado.
- Contagem de períodos: as aulas do **PCP contam em dobro** nos totais e na carga horária. Horários e quadros não mudam. A regra fica em `PESO_POR_CURSO`, em `js/interpretar.js`.
- No celular, o quadro semanal vira uma lista por dia, sem rolagem horizontal, e os filtros ficam recolhidos num botão.
- Link compartilhável com os filtros (ex.: `…/#turma=INF1M`, `…/#prof=Mauro&periodo=2027-1`).
- **Impressão**: um quadro por página, ajustado à folha A4 deitada, com o título, o período e a data. O botão "Imprimir" de um quadro imprime só ele; o da barra imprime todos.

**Área do administrador** (`…/#admin`)
1. **Envio** da planilha `.xlsx` (por clique ou arrastando o arquivo).
2. **Leitura**: mostra cada aba e como ela foi usada, além dos cabeçalhos reconhecidos (ex.: `Dia Semana → Dia`) e das colunas ignoradas.
3. **Revisão**: avisos classificados como *Erro*, *Divergência*, *Dúvida* e *Informação*, com a aba e a linha de cada um (veja abaixo). Aulas com **início fora da grade** pedem uma decisão: **manter o horário** (autorizar) ou **colocar na grade**. Sem essa decisão, não dá para publicar.
4. **Destino**:
   - **A. Substituir** os horários de um período existente. Você escolhe qual, e os outros não mudam.
   - **B. Adicionar** um novo período (ex.: 2027/1). Se os 3 espaços já estiverem ocupados, é preciso escolher qual deles sai.
   - **C. Cancelar**: nada é alterado.

   Antes de uma substituição, o site mostra qual período será afetado e pede confirmação. Também mostra **o que muda** em relação à versão publicada: aulas novas, alteradas e que saem.
5. **Prévia** do site com os novos dados, antes de publicar.
6. **Publicação com senha**. Se houver erros ou divergências, é preciso confirmar que foram revisados.
7. **Períodos publicados**: ver, tornar atual, renomear (com observação, ex.: "válido a partir de 15/10") ou remover. Cada ação pede a senha.

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
- sem as abas de quadros (nesse caso, cada período é considerado de 45 minutos).

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
- `js/app.js`: interface. `css/estilo.css`: visual.

**Publicar** é gravar esses arquivos neste repositório pela API do GitHub. Cada ação (adicionar, substituir, renomear, remover) vira **um único commit**: ou tudo é gravado, ou nada muda. Antes de gravar, o índice é lido direto do repositório, para não desfazer uma publicação recente. O GitHub Pages atualiza o site em cerca de 1 minuto, e o histórico do Git guarda todas as versões, o que permite voltar a uma anterior.

**Versão dos arquivos:** `index.html` e `js/app.js` carregam os scripts e o CSS com `?v=AAAAMMDD…`. Ao mudar o código, troque esse número nos dois arquivos, para os navegadores não juntarem código novo com código antigo guardado em cache.

**Consumo:** quem consulta só baixa os arquivos do período que abriu, uma vez. Os destaques "agora" e "começa em" são recalculados no próprio navegador e não fazem requisições. A API do GitHub só é usada quando o administrador publica.

## Senha de publicação

O GitHub só aceita gravações com um token. Para que o administrador precise apenas de uma senha:

1. Na configuração (feita **uma vez**), o administrador cola um token *fine-grained* com acesso **só a este repositório** e permissão **Contents: Read and write**, e escolhe uma senha de **pelo menos 10 caracteres**.
2. O navegador cifra o token com **AES-GCM**, usando uma chave derivada da senha (**PBKDF2-SHA256, 600 mil iterações**, sal aleatório), e grava o resultado em `dados/publicacao.json`.
3. Para publicar, em qualquer computador, basta a senha. O token é decifrado na memória, usado e descartado. Com a senha errada, nada é enviado.

**Riscos aceitos.** O arquivo cifrado é público, então alguém pode tentar adivinhar a senha fora do site. As 600 mil iterações tornam isso lento, mas a segurança depende de uma **senha forte**. Mesmo que a senha seja descoberta, o token só consegue alterar este repositório, e cada alteração fica no histórico, de onde pode ser desfeita. Se houver suspeita, revogue o token no GitHub e refaça a configuração. Quando o token expira, o site avisa e é só configurar de novo. O limite de 5 tentativas por minuto vale apenas no aparelho onde as senhas foram digitadas.

### Como configurar

1. **Publicar o site**: no repositório, *Settings → Pages → Build and deployment*, escolha *Deploy from a branch*, ramo `main`, pasta `/ (root)`.
2. **Criar o token**: *GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*. Em *Repository access*, escolha *Only select repositories* → este repositório. Em *Permissions*, dê *Contents: Read and write*.
3. Abra `…/#admin` → **Configuração da publicação**, cole o token, confirme o repositório (`douglascsc/horarios`) e defina a senha.
4. Pronto: envie a planilha, revise, veja a prévia e publique com a senha. A senha pode ser trocada na mesma tela.

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
