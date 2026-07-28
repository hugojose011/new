# Landing Page Normedic — contexto do projeto

Documento de retomada. Leia isto antes de continuar o trabalho.

## Objetivo

Landing page de alta conversão para a Normedic. O desenho das seções deve ser
feito **dentro do Paper**, via integração MCP, em **formato wireframe desktop (PC)**.

## Por que este arquivo existe

O trabalho começou numa sessão remota do Claude Code (container na nuvem). Naquele
ambiente o servidor MCP `paper` é inalcançável: ele aponta para `http://127.0.0.1:29979/mcp`,
e `127.0.0.1` no container remoto não é a máquina do usuário. Nada escuta nessa porta lá.

O wireframe das dobras 01–04 foi montado em HTML/CSS como ponte, e está neste diretório.
A partir daqui o trabalho deve seguir **numa sessão local do Claude Code**, onde o
servidor `paper` carrega de verdade (config em `.claude/mcp-servers.json`, na raiz do repo).

## Fontes de verdade

- Copy da página: enviada pelo usuário em MD ("Normedic — Página de vendas"), 8 dobras.
- Manual de identidade visual Normedic (PDF, 56 páginas).

## Identidade da marca (extraída do manual)

Paleta principal (9 tons, destaque para 01, 05 e 09):

| # | HEX | Uso |
|---|---|---|
| 01 | `#FFF5EE` | creme / fundo claro |
| 02 | `#FFDFB5` | |
| 03 | `#FFC480` | |
| 04 | `#FFA866` | |
| 05 | `#FA6B26` | laranja principal |
| 06 | `#BD450B` | |
| 07 | `#7F3512` | |
| 08 | `#4A2000` | |
| 09 | `#1E0D00` | marrom escuro / fundo escuro |

Gradientes institucionais:

- **Gradient 01** — `#F75920` → `#FA6B26` → `#FF9D41`
- **Gradient 02** — `#FFF5EE` → `#FFDFB5`
- **Gradient 03** — `#1E0D00` → `#7F3512`

Uso dos gradientes: principalmente como fundo ou, de forma moderada, como efeito em
textos e elementos gráficos. Aplicação excessiva compromete a clareza — manter limpo
e equilibrado.

Tipografia: **Manrope** (ExtraLight 200 → ExtraBold 800). Arquivos woff2 em `fonts/`.

Tom da marca: inovador, expressivo e premium. Minimalista, mas não simples demais.

Logo: versão horizontal é prioritária; símbolo e wordmark isolados só quando o espaço
não permitir a horizontal. Área de proteção = tamanho do símbolo em todos os lados.
Arquivos SVG vetoriais em `assets/`.

Referências de aplicação em site estão nas páginas 18–22 do manual: hero com fundo
gradiente escuro, chips de funcionalidades, mockup de dashboard.

## Estado atual do wireframe

Arquivos: `index.html` + `styles.css`. Escala de cinza, largura 1440px, cada seção
marcada com a etiqueta da dobra correspondente.

- **Dobra 01 — Cabeçalho** — pronta. Logo, nav (Início / Soluções / Planos), botão de contato.
- **Dobra 02 — Hero** — pronta. Layout centralizado (decisão confirmada pelo usuário),
  CTA único "Agendar demonstração" (decisão confirmada), mockup em largura cheia abaixo,
  faixa de logos de parceiros.
- **Dobra 03 — Benefícios** — pronta. Grade 2×2 com os 4 cards da copy.
- **Dobra 04 — Plataforma** — pronta. Dashboard como card de destaque em largura cheia,
  seguido de 8 módulos em grade de 3 colunas.
- **Dobras 05 a 08** — não iniciadas (depoimentos, planos, FAQ, CTA final).

## Decisões já tomadas com o usuário

1. Hero centralizado, não dividido em duas colunas.
2. Hero com um único CTA; o botão de WhatsApp fica só na dobra 08.
3. Imagens ainda não enviadas entram como placeholders neutros no wireframe
   (mockup do sistema, logos de parceiros, fotos de depoimentos).

## Questão em aberto

A grade da Dobra 04 tem 8 módulos em 3 colunas, deixando a última linha com 2 cards e
um vazio. Três saídas foram propostas ao usuário, sem resposta ainda:

1. Promover Inteligência Artificial a card largo (fecharia em 6 cards + 2 destaques).
2. Mudar para grade de 4 colunas (2 linhas exatas).
3. Manter 3 colunas e centralizar os 2 últimos.

## Assets pendentes do usuário

- Mockup real da tela inicial do sistema (hero) e screenshot do dashboard.
- Logos das parceiras de tecnologia (Google, ChatGPT, Claude, Meta...).
- Fotos e textos dos depoimentos (dobra 05).
- Itens dos planos Smart / Business / Enterprise — a copy traz "ITEM 1…ITEM 7" como
  marcadores, o conteúdo real ainda não foi definido.
- Vídeo de demonstração da ferramenta (dobra 08).

## Como visualizar o wireframe HTML

```
python3 -m http.server 8399 --bind 127.0.0.1
node shot.js wireframe.png   # requer playwright
```

## Método de trabalho combinado

Etapa por etapa, dobra a dobra. Solicitar ao usuário qualquer arquivo necessário
(logo, tipografia, imagem) **antes** de entregar partes do projeto no Paper.
