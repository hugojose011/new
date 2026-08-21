# Squad Funil Black Ofertas

Um squad só, dez agentes de IA, duas missões. **MISSÃO CAPTURA** monta uma campanha de Black Friday em cerca de 70 minutos: duas páginas de captura em teste A/B, três anúncios com nove criativos em PNG, três e-mails e cinco mensagens de grupo. **MISSÃO PERPÉTUO** monta um funil perpétuo em cerca de 58 minutos: página de vendas com oito dobras, página de upsell temporizada, roteiro de VSL, três peças de aquecimento e dois anúncios com seis criativos em PNG.

Cada agente lê arquivos com nome definido e escreve arquivos com nome definido. Nada passa por conversa solta. É isso que faz o time produzir peças que encaixam umas nas outras em vez de versões diferentes da mesma campanha.

## Leia isto antes do dia do hackathon

**Quase tudo aqui funciona sem instalar nada.** As páginas e os criativos abrem com dois cliques, no seu navegador, mesmo sem internet. Escrever a copy, o roteiro e a oferta depende só do Claude Code.

**Uma única coisa precisa ser instalada, e ela é a que transforma os criativos dos anúncios em imagem PNG.** Sem ela você entrega tudo, menos os PNG dos anúncios.

| O que | Quanto ocupa | Quando faz falta |
|---|---|---|
| Python 3 | instalador de 30 a 60 MB | cerca de 20 minutos depois do início |
| Playwright e o navegador que ele usa | **cerca de 500 MB em disco**, com download na casa de 200 MB | na primeira vez que um criativo virar PNG |

**Faça isso em casa, na sua internet, e não no dia.** Baixar 200 MB na rede de um evento cheio é o jeito mais provável de perder quinze minutos que você não tem. Se você deixar para depois, nada quebra: o download simplesmente acontece no meio do hackathon.

### Instale com um clique

Nesta mesma pasta há um instalador para o seu sistema. Dê duplo clique nele e espere terminar:

- **macOS:** `INSTALAR-MAC.command`
- **Windows:** `INSTALAR-WINDOWS.bat`

Ele procura o Python, instala o Playwright e baixa o Chromium sozinho, e no final mostra uma mensagem dizendo se ficou tudo pronto ou o que falta. Se faltar o Python, ele abre a página de download para você, explica o que marcar no instalador e encerra sem susto: é só rodar de novo depois de instalar o Python.

No Mac, se aparecer um aviso do sistema dizendo que o arquivo é de um desenvolvedor não identificado, clique com o botão direito nele, escolha "Abrir" e confirme. Isso só acontece na primeira vez.

Quando terminar, a própria janela do instalador te lembra do próximo passo: abrir esta pasta no Claude Code e dizer "Comece o hackathon", informando a missão.

### Plano B: instalar na mão

Se preferir usar o Terminal ou o Prompt de Comando diretamente, ou se o instalador de duplo clique não funcionar por algum motivo, os comandos são estes.

#### macOS

Instale o Python em `python.org/downloads` e depois rode no Terminal:

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
```

**Use exatamente `python3 -m pip`, e não `pip` sozinho.** Numa mesma máquina costuma haver mais de um Python instalado, e `pip` sozinho pode instalar num deles enquanto o resto do trabalho roda em outro. Você só descobriria isso depois de baixar meio giga, com uma mensagem dizendo que o módulo não existe.

#### Windows

Instale o Python em `python.org/downloads`. **Na primeira tela do instalador, marque a caixa "Add python.exe to PATH".** Ela vem desmarcada, e sem ela os comandos abaixo não são encontrados. Depois, no Prompt de Comando ou no PowerShell:

```
python -m pip install playwright
python -m playwright install chromium
```

Aqui é `python`, sem o 3, porque no Windows o executável tem esse nome. Vale a mesma regra: **`python -m pip`, nunca `pip` sozinho.**

### Como saber se deu certo

Peça ao Claude, depois de abrir esta pasta: **"confira se as dependências estão instaladas"**. Ele sabe testar e vai dizer o que falta, com o comando certo para o seu sistema.

## Antes de começar: a pasta `referencias/`

Coloque nela as imagens da marca: foto do expert, foto ou mockup do produto, logo e prints de prova. Nomes de arquivo sem espaço e sem acento. O detalhe completo está em `referencias/LEIA-ME.md`.

Se você não tiver imagem nenhuma, pode começar assim mesmo. As peças degradam sozinhas para bloco de cor sólida com um aviso visível dentro delas. Nada quebra.

## Peça para começar

Abra o Claude Code nesta pasta e digite:

> /black-on

ou já informe a missão junto, `/black-on captura` ou `/black-on perpetuo`.

Se preferir falar em vez de digitar comando, a frase abaixo funciona igual:

> Comece o hackathon. Missão CAPTURA.

ou

> Comece o hackathon. Missão PERPÉTUO.

O orquestrador confirma a missão, entrevista você e despacha os outros agentes na ordem certa. **Em algum momento ele vai parar e pedir a sua aprovação.** Essa parada é de propósito, e é o momento mais importante do dia: na missão CAPTURA ele para nos dois ângulos da campanha, na missão PERPÉTUO ele para nos dois mecanismos. Leia com calma e responda, porque tudo o que vem depois é construído em cima da sua resposta.

---

## MISSÃO CAPTURA, dia 1, 70 minutos

Sete agentes montam uma campanha inteira de Black Friday: duas páginas de captura em teste A/B, três anúncios com nove criativos prontos em PNG, três e-mails e cinco mensagens para o grupo de WhatsApp.

### A ordem em que os agentes rodam

| Etapa | Quem roda | Espera por |
|---|---|---|
| 1 | `ifl-a-estrategista-de-oferta` | nada |
| 2 | **Você aprova os ângulos A e B** | etapa 1 |
| 3 | `ifl-a-copywriter-de-captura`, `ifl-a-copywriter-de-relacionamento` e `ifl-a-diretor-de-arte`, os três ao mesmo tempo | etapa 2 |
| 4 | `ifl-a-designer-de-paginas` | a copy das páginas, da etapa 3 |
| 5 | `ifl-a-verificador` | etapas 3 e 4 |
| 6 | `ifl-a-orquestrador` escreve a entrega | etapa 5 |

A etapa 2 é a única parada obrigatória. O squad não avança para copy e design sem alguém confirmar que os dois ângulos fazem sentido. Se você pular essa aprovação, os cinco agentes seguintes vão trabalhar em cima de uma hipótese que ninguém conferiu.

### Como chamar cada agente

Ao chamar qualquer agente, diga sempre quatro coisas: o papel, o arquivo que ele lê, o arquivo que ele escreve e a missão. Instrução vaga do tipo "faça a parte de copy" produz peça que ninguém consegue usar.

| Agente | O que ele faz | Lê | Escreve |
|---|---|---|---|
| `ifl-a-orquestrador` | Coordena o time, confere se cada arquivo apareceu e fecha a entrega | tudo | `ENTREGA.md` e o `.zip` final |
| `ifl-a-estrategista-de-oferta` | Entrevista você, uma pergunta por vez, e define a campanha | você | `CAMPANHA.md` |
| `ifl-a-copywriter-de-captura` | Escreve a copy das duas páginas, cada uma por um ângulo | `CAMPANHA.md` | `paginas/captura-a/copy.md`, `paginas/captura-b/copy.md`, `paginas/hipotese-ab.md` |
| `ifl-a-copywriter-de-relacionamento` | Escreve os e-mails e as mensagens do grupo | `CAMPANHA.md` | `emails/email-1-abertura.md`, `emails/email-2-prova.md`, `emails/email-3-ultima-chamada.md`, `grupo/mensagens.md` |
| `ifl-a-diretor-de-arte` | Cria os três anúncios, monta os nove criativos e gera os PNG | `CAMPANHA.md`, `referencias/` | `anuncios/anuncio-01.md` a `03.md`, `anuncios/prompts-imagem.md`, `anuncios/criativos/*` |
| `ifl-a-designer-de-paginas` | Transforma a copy aprovada em HTML de página | `paginas/captura-a/copy.md`, `paginas/captura-b/copy.md`, `CAMPANHA.md` | `paginas/captura-a/index.html`, `paginas/captura-b/index.html` |
| `ifl-a-verificador` | Confere tudo contra o `CAMPANHA.md` e lista as divergências | todas as peças | nada, só o relatório na tela |

Exemplo de chamada:

> Papel: `ifl-a-copywriter-de-captura`. Missão: CAPTURA. Ler: `CAMPANHA.md`. Escrever: `paginas/captura-a/copy.md`, `paginas/captura-b/copy.md` e `paginas/hipotese-ab.md`.

### Os três formatos dos criativos

Cada anúncio vira três artes, e elas não são a mesma imagem esticada. Com três anúncios, são nove peças.

| Formato | Tamanho exato | Onde roda |
|---|---|---|
| 4:5 | 1080 x 1350 | Feed |
| 9:16 | 1080 x 1920 | Stories e Reels |
| 1:1 | 1080 x 1080 | Feed quadrado |

**A regra que mais reprova peça é a zona segura do 9:16:** nada de texto nos 250 px do topo nem nos 400 px da base, que é onde a interface do Instagram cobre a sua arte. Os templates já cortam o excesso ali, de propósito, para você enxergar o problema na revisão em vez de descobrir depois que o botão ficou escondido atrás da barra do aplicativo.

### Três coisas que valem a hora que você economiza

**O `CAMPANHA.md` manda em todo mundo.** Se a data de fechamento mudar, ela muda ali primeiro. Os seis agentes seguintes copiam dele.

**O verificador não corrige nada.** Ele só aponta. Quem corrige é o agente dono do arquivo, chamado de volta. Isso é de propósito: um agente que conserta o trabalho do outro apaga o rastro do erro.

**A página de captura precisa do endereço da sua ferramenta de e-mail.** O template traz o marcador `{{ACAO_FORMULARIO}}` no formulário. Enquanto ele não for trocado, a página fica bonita e não captura ninguém, e nada na tela avisa isso.

### A pasta que você entrega

```
[pasta da entrega]/
  ENTREGA.md                         a entrega, escrita no fim
  CAMPANHA.md                        a fonte da verdade, escrita primeiro
  referencias/                       suas fotos: expert, produto, logo
  paginas/
    hipotese-ab.md
    captura-a/copy.md
    captura-a/index.html
    captura-b/copy.md
    captura-b/index.html
  anuncios/
    anuncio-01.md   anuncio-02.md   anuncio-03.md
    prompts-imagem.md
    criativos/
      anuncio-01-4x5.html   anuncio-01-4x5.png
      anuncio-01-9x16.html  anuncio-01-9x16.png
      anuncio-01-1x1.html   anuncio-01-1x1.png
      (os mesmos seis para o 02 e o 03)
  emails/
    email-1-abertura.md   email-2-prova.md   email-3-ultima-chamada.md
  grupo/
    mensagens.md
```

No fim, essa pasta vira um `.zip` no Drive. O `ENTREGA.md` é a porta de entrada de quem vai avaliar.

---

## MISSÃO PERPÉTUO, dia 2, 58 minutos

Oito agentes montam um funil perpétuo inteiro: a página de vendas do produto de entrada com oito dobras, a página de upsell com blocos temporizados, o roteiro do vídeo de upsell, três peças de aquecimento para Instagram e dois anúncios com seis criativos prontos em PNG.

### A diferença que muda tudo: perpétuo não é meteórico

Na captura o funil vende numa data só, e a urgência vem do relógio. **No perpétuo o funil vende todo dia.**

Isso proíbe uma coisa em todas as peças desta missão: **data de fechamento, contagem regressiva e "últimas 24 horas".** Uma página perpétua com prazo escrito nela vira mentira no dia seguinte, e o público percebe.

A urgência do funil perpétuo é outra, e é verdadeira todo dia:

- A **condição especial** que só existe na sessão logo após a compra do produto de entrada.
- O **bônus que expira** quando a pessoa sai da página de upsell.

Os agentes foram instruídos a recusar escassez de data, e o verificador trata isso como a falha mais grave da entrega.

### Antes de começar: os dois produtos

**Chegue com os dois produtos decididos.** Um de entrada, entre R$ 29 e R$ 197. Um de upsell, entre R$ 297 e R$ 997. Quem entra no hackathon ainda discutindo o que vender não termina a página.

E são dois produtos diferentes: o de upsell resolve o problema que o de entrada **revela**. Se o segundo for só "a versão maior do primeiro", a oferta não se sustenta e o estrategista vai apontar isso.

### A ordem em que os agentes rodam

| Etapa | Quem roda | Espera por |
|---|---|---|
| 1 | `ifl-a-estrategista-de-oferta` escreve o `OFERTA.md` | nada |
| 2 | `ifl-a-estrategista-de-oferta` escreve o `MECANISMOS.md` | etapa 1 |
| 3 | **Você aprova os dois mecanismos** | etapa 2 |
| 4 | `ifl-a-copywriter-de-vendas`, `ifl-a-roteirista-de-vsl`, `ifl-a-copywriter-de-conteudo` e `ifl-a-diretor-de-arte`, os quatro ao mesmo tempo | etapa 3 |
| 5 | `ifl-a-designer-de-paginas`, as duas páginas | a copy da etapa 4 |
| 6 | `ifl-a-verificador` | etapas 4 e 5 |
| 7 | `ifl-a-orquestrador` escreve a entrega e compacta | etapa 6 |

**A etapa 3 é a única parada obrigatória, e é a mais importante do dia.** Sem mecanismo aprovado, tudo o que for produzido depois vira lista de benefícios, que é exatamente o que separa página de vendas profissional de página amadora. O mecanismo é o critério que mais pesa na avaliação, acima de qualquer peça isolada, porque é ele que faz público frio comprar de quem não conhece.

### O que é mecanismo, em duas linhas

**Mecanismo do problema** não é a dor, é a explicação da causa da dor: por que essa pessoa continua travada mesmo tendo tentado outras coisas.

**Mecanismo da solução** não é o produto, é a explicação de por que a solução funciona, respondendo ponto a ponto ao mecanismo do problema.

Os dois têm nome próprio, de três a cinco palavras, e esse nome aparece escrito na página e no roteiro. Nome que ninguém consegue repetir não se espalha.

### As cinco entregas, em detalhe

Isto aqui é o que precisa existir no fim, e é a mesma lista que o avaliador vai procurar na sua pasta. O detalhe de como escrever cada peça bem está nas skills, que os agentes carregam sozinhos.

#### 1. A página de vendas do produto A, com oito dobras

A ordem não é estética, é funcional: cada dobra responde a dúvida que a anterior deixou aberta. Nenhuma pode faltar e nenhuma troca de lugar.

1. **Topo.** Esquerda: headline, subheadline e texto de apoio. Direita: imagem, oferta, preço e botão. O preço aparece já aqui.
2. **Problema.** O mecanismo do problema, com o nome dele. Não é lista de dores.
3. **Solução.** O mecanismo da solução, com o nome dele, respondendo ao da dobra 2.
4. **Produto.** O produto como aplicação do mecanismo da solução, com cada entregável ligado a uma parte dele. Botão.
5. **Alavancagem.** O que a pessoa paga comparado a um custo real que ela já conhece: quanto o problema custa hoje, quanto custa a alternativa, quantas horas ela perde. **Nunca uma soma de quanto cada item "vale"**, porque quem lê que o pacote vale R$ 3.000 e custa R$ 97 conclui que o R$ 3.000 é inventado, e desconta o preço verdadeiro junto. Bônus. Botão.
6. **Prova.** Depoimentos com nome e resultado, quando existirem. **Sem nenhum, que é o caso normal aqui, a dobra não some: ela muda de instrumento.** O mecanismo explicado passo a passo é prova de raciocínio, e a experiência do próprio expert é prova real. Depoimento inventado, nunca, em nenhuma hipótese. Botão.
7. **Bio.** Por que esse expert pode ensinar isso. Curta.
8. **FAQ.** De cinco a sete perguntas, e elas são objeções reais, não perguntas fáceis. A de preço entra sempre.

Os quatro botões da página têm exatamente o mesmo texto, e o preço é o mesmo em todos os pontos.

#### 2. A página de upsell, com blocos temporizados

Topo sempre visível, com o aviso de compra concluída e o espaço do vídeo, sem botão nenhum. Depois, quatro blocos que aparecem só quando o vídeo revela a oferta: explicação do produto, alavancagem, alavancagem por bônus e depoimentos. Os três últimos têm botão.

#### 3. O roteiro do vídeo de upsell, com nove beats

O vídeo não é gravado. O que se avalia é o roteiro.

| # | Beat | Palavras |
|---|---|---|
| 1 | Parabéns pela compra e segurança de que foi uma boa decisão | 100 a 130 |
| 2 | Algo extra ligado à dor ou ao desejo, antes de vender qualquer coisa | 120 a 150 |
| 3 | Aprofundar o problema, com o mecanismo do problema | 180 a 220 |
| 4 | A solução, com o mecanismo da solução | 180 a 220 |
| 5 | **Apresentar o produto 2**, que é a revelação da oferta | 150 a 180 |
| 6 | Alavancar: quanto vale contra quanto custa | 120 a 150 |
| 7 | A condição especial de quem comprou o produto A | 100 a 130 |
| 8 | O bônus que melhora a oferta | 100 a 130 |
| 9 | Urgência e fechamento: a condição não volta depois desta página | 80 a 120 |

**O total precisa ficar entre 1.050 e 1.600 palavras.** O roteirista conta as palavras de verdade, escreve a contagem beat a beat no arquivo e reescreve se estourar para qualquer lado, em vez de entregar avisando que ficou fora.

Os beats 1 a 4 somados são o que define quando os blocos da página de upsell aparecem.

#### 4. O conteúdo de aquecimento, três peças no Instagram

Uma por formato, com funções que não se repetem:

- **Carrossel de reconhecimento**, de 6 a 8 cards, para a pessoa pensar "é isso que acontece comigo". Sem link.
- **Reels de ruptura**, de 30 a 45 segundos, para derrubar a crença que mantém a pessoa presa. Sem link.
- **Stories de ponte**, de 5 a 7 telas, e é a única peça com chamada e link.

#### 5. Os anúncios

**Dois anúncios**, cada um nos três formatos do Instagram: 4:5, 9:16 e 1:1. São seis criativos em HTML e seis em PNG. Os três formatos não são a mesma arte esticada.

### Como chamar cada agente

Ao chamar qualquer agente, diga sempre quatro coisas: o papel, o arquivo que ele lê, o arquivo que ele escreve e a missão. Instrução vaga do tipo "faça a parte de copy" produz peça que ninguém consegue usar.

| Agente | O que ele faz | Lê | Escreve |
|---|---|---|---|
| `ifl-a-orquestrador` | Coordena o time, confere se cada arquivo apareceu e fecha a entrega | tudo | `ENTREGA.md` e o `.zip` final |
| `ifl-a-estrategista-de-oferta` | Entrevista você, uma pergunta por vez, e define os dois produtos e os dois mecanismos | você | `OFERTA.md`, `MECANISMOS.md` |
| `ifl-a-copywriter-de-vendas` | Escreve a copy das duas páginas | `OFERTA.md`, `MECANISMOS.md` | `produto-a/copy.md`, `upsell/copy.md` |
| `ifl-a-roteirista-de-vsl` | Escreve o roteiro do vídeo em nove beats, com a contagem de palavras | `OFERTA.md`, `MECANISMOS.md` | `upsell/roteiro-video.md` |
| `ifl-a-copywriter-de-conteudo` | Escreve o carrossel, o Reels e os Stories de aquecimento | `OFERTA.md`, `MECANISMOS.md` | `aquecimento/conteudo.md` |
| `ifl-a-diretor-de-arte` | Cria os dois anúncios, monta os seis criativos e gera os PNG | `OFERTA.md`, `MECANISMOS.md`, `referencias/` | `anuncios/anuncio-01.md` e `02.md`, `anuncios/prompts-imagem.md`, `anuncios/criativos/*` |
| `ifl-a-designer-de-paginas` | Transforma a copy aprovada em HTML | `produto-a/copy.md`, `upsell/copy.md`, `upsell/roteiro-video.md`, `OFERTA.md` | `produto-a/index.html`, `upsell/index.html` |
| `ifl-a-verificador` | Confere tudo contra o `OFERTA.md` e o `MECANISMOS.md` e lista as divergências | todas as peças | nada, só o relatório na tela |

Exemplo de chamada:

> Papel: `ifl-a-roteirista-de-vsl`. Missão: PERPÉTUO. Ler: `OFERTA.md` e `MECANISMOS.md`. Escrever: `upsell/roteiro-video.md`.

### Quatro coisas que valem a hora que você economiza

**O `OFERTA.md` e o `MECANISMOS.md` mandam em todo mundo.** Se o preço do upsell mudar, ele muda ali primeiro. Os outros seis agentes copiam de lá.

**O número da revelação é a peça mais frágil do funil.** O roteirista termina o roteiro com uma linha `SEGUNDOS_REVELACAO: NNN`, calculada a partir da contagem de palavras dos quatro primeiros beats. Esse número diz à página de upsell quando fazer os blocos de compra aparecerem, que é o instante em que o vídeo revela a oferta. Se essa linha sumir, a temporização quebra e ninguém percebe. Por isso ela é obrigatória na skill do roteiro, o orquestrador a passa ao designer e ela é item do checklist do verificador.

**Para conferir a página de upsell sem esperar cinco minutos**, abra com `?revelar=1` no fim do endereço:

```
upsell/index.html?revelar=1
```

Os quatro blocos aparecem na hora, com uma tarja avisando que você está no modo de teste. Depois abra sem o parâmetro para conferir que eles voltam a ficar ocultos. Se aparecer uma tarja vermelha, o número da revelação não foi preenchido.

**O verificador não corrige nada.** Ele só aponta. Quem corrige é o agente dono do arquivo, chamado de volta. Isso é de propósito: um agente que conserta o trabalho do outro apaga o rastro do erro.

### A pasta que você entrega

```
[pasta da entrega]/
  ENTREGA.md
  OFERTA.md                          a fonte da verdade, os dois produtos
  MECANISMOS.md                      o mecanismo do problema e o da solução
  referencias/                       suas fotos: expert, produto, logo
  produto-a/
    copy.md
    index.html
  upsell/
    roteiro-video.md                 o roteiro, com a contagem de palavras
    copy.md
    index.html
  aquecimento/
    conteudo.md                      as 3 peças
  anuncios/
    anuncio-01.md   anuncio-02.md
    prompts-imagem.md
    criativos/
      anuncio-01-4x5.html   anuncio-01-4x5.png
      anuncio-01-9x16.html  anuncio-01-9x16.png
      anuncio-01-1x1.html   anuncio-01-1x1.png
      (os mesmos seis para o anuncio-02)
```

No fim, essa pasta vira um `.zip` no Drive. O `ENTREGA.md` é a porta de entrada de quem vai avaliar.

### Como você será avaliado

A avaliação é assíncrona, sobre a pasta que você entregar. **Ninguém do grupo vai estar lá para explicar**, então o `ENTREGA.md` precisa se explicar sozinho, inclusive dizendo como abrir a página de upsell com `?revelar=1`.

O que mais vale ponto, nesta ordem:

1. **Mecanismo**, nomeado, e com o da solução respondendo ao do problema. É o que faz público frio comprar de quem não conhece, e é por isso que vem primeiro.
2. **Encaixe do funil**: anúncio, página, roteiro e upsell contam a mesma história, com o mesmo preço.
3. **Roteiro** com os nove beats na ordem e dentro da contagem de palavras.

E uma coisa **perde** ponto: página perpétua com data de fechamento. A urgência aqui vem da sessão, não de um prazo inventado.

Depois disso vem a execução, que é o piso e não o diferencial: as páginas abrem, a temporização funciona, os criativos existem.

## O que já vem pronto nesta pasta

- `.claude/agents/` os dez agentes, com escopo por missão.
- `.claude/skills/` as vinte skills que eles carregam.
- `templates/captura/index.html` o template da página de captura, missão CAPTURA.
- `templates/vendas/index.html` o template da página de vendas, missão PERPÉTUO.
- `templates/upsell/index.html` o template da página de upsell, missão PERPÉTUO.
- `templates/criativo/` os templates de criativo, um por formato e por missão.

Os templates você não reescreve. Reescrever custa tempo que o grupo não tem e sempre sai pior que o template testado.
