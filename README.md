# Plataforma de Agendamento

Aplicação de agendamento de reuniões integrada ao Google Calendar: o host
define sua disponibilidade, conecta a conta Google e compartilha um link
público. Quem recebe o link escolhe um horário realmente livre, e o evento
(com Google Meet opcional) é criado automaticamente na agenda do host.

O convidado **não** precisa de conta.

---

## Sumário

- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados, migrations e seed](#banco-de-dados-migrations-e-seed)
- [Executando](#executando)
- [Testes](#testes)
- [Configuração do Google Cloud](#configuração-do-google-cloud)
- [Endpoints](#endpoints)
- [Telas](#telas)
- [Deploy](#deploy)
- [Troubleshooting](#troubleshooting)
- [Limitações atuais](#limitações-atuais)

---

## Visão geral

O que está implementado:

| Área | Estado |
| --- | --- |
| Cadastro, login, sessão e onboarding | ✅ |
| Perfil, username e fuso horário | ✅ |
| OAuth 2.0 com o Google (offline access) | ✅ |
| Escolha de agendas para conflito e de destino | ✅ |
| Disponibilidade semanal com múltiplos intervalos | ✅ |
| Exceções por data (indisponível / horário especial) | ✅ |
| Tipos de evento one-to-one, duração e slot interval | ✅ |
| Buffers, antecedência mínima, janela e limite diário | ✅ |
| Perguntas personalizadas | ✅ |
| Página pública de agendamento | ✅ |
| Criação do evento no Google + Meet exclusivo por reserva | ✅ |
| Dashboard, lista de agendamentos e detalhes | ✅ |
| Cancelamento e reagendamento por link seguro | ✅ |
| Proteção contra double booking no banco | ✅ |
| Rate limiting, auditoria e logs estruturados | ✅ |
| Eventos em grupo, round robin, equipes | ❌ (estrutura preparada) |

---

## Arquitetura

Monorepo pnpm:

```
apps/
  api/                  NestJS + REST + Swagger
    src/
      auth/             sessão (cookie HttpOnly), Argon2id, CSRF
      users/            perfil, username, onboarding
      availability/
        engine/         AvailabilityEngine puro (sem Prisma/Google/Nest)
        schedules.*     CRUD de agendas de disponibilidade
      event-types/      tipos de evento e perguntas
      bookings/         reserva, cancelamento, reagendamento, tokens
      public/           página pública e disponibilidade
      integrations/
        calendar-provider.ts   porta (interface) do provedor
        google/                adaptador Google (OAuth + Calendar)
      notifications/    NotificationService + providers de e-mail
      audit/            registro de eventos relevantes
      crypto/           EncryptionService (AES-256-GCM)
  web/                  Next.js (App Router) + Tailwind + React Query
packages/
  database/             schema Prisma, migrations, seed
  shared/               tipos e contratos compartilhados
docs/
  decisoes.md           por que as partes difíceis são assim
```

### Princípios

**O AvailabilityEngine é puro.** Recebe regras, exceções, intervalos ocupados
e "agora"; devolve slots. Não conhece Prisma, Google nem Nest — por isso tem
29 testes unitários determinísticos, incluindo horário de verão.

```
AVAILABLE_SLOTS =
  ConfiguredAvailability
  − GoogleBusyIntervals
  − InternalBookings
  − Buffers
  − DateOverrides
  − BookingRestrictions (antecedência, janela, limite diário)
```

**O Google entra por uma porta.** `BookingsService` depende da interface
`CalendarProvider`, nunca da `googleapis`. Isso permite mockar nos testes
(`FakeCalendarProvider`) e adicionar Outlook/Teams depois sem tocar no domínio.

**A consistência crítica é do banco.** Ver
[`docs/decisoes.md`](docs/decisoes.md) — vale a leitura antes de mexer em
reservas.

---

## Pré-requisitos

- Node.js >= 20.11 (testado em 22)
- pnpm 9
- PostgreSQL 16 com a extensão `btree_gist` disponível
- Docker (opcional, para subir o Postgres)

---

## Instalação

```bash
pnpm install
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
```

Gere os segredos:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

Cole os dois no `.env`. **`ENCRYPTION_KEY` precisa ter exatamente 32 bytes em
base64** — a aplicação recusa subir com uma chave de outro tamanho.

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sim | Conexão PostgreSQL. |
| `JWT_SECRET` | sim | Assina o cookie de sessão. Mínimo 32 caracteres em produção. |
| `ENCRYPTION_KEY` | sim | AES-256-GCM, 32 bytes em base64. Criptografa os tokens do Google. |
| `ENCRYPTION_KEY_ID` | não | Id da chave corrente (default `v1`), usado na rotação. |
| `ENCRYPTION_KEYS_LEGACY` | não | Chaves antigas ainda aceitas: `v1:base64,v0:base64`. |
| `WEB_URL` | sim | URL do frontend; usada nos links de cancelamento/reagendamento e no CORS. |
| `API_URL` | não | URL pública da API. |
| `PORT` | não | Porta da API (default 3333). |
| `GOOGLE_CLIENT_ID` | para Google | Client OAuth. |
| `GOOGLE_CLIENT_SECRET` | para Google | **Nunca** no bundle do frontend. |
| `GOOGLE_REDIRECT_URI` | para Google | Precisa bater exatamente com o console. |
| `EMAIL_PROVIDER` | não | `console` (default, só loga) ou `resend`. |
| `EMAIL_FROM` | não | Remetente das notificações. |
| `EMAIL_PROVIDER_API_KEY` | não | Chave do provedor de e-mail. |
| `AVAILABILITY_CACHE_TTL_SECONDS` | não | Cache da disponibilidade pública (default 20; `0` desliga). |
| `RATE_LIMIT_DEFAULT` / `_AUTH` / `_PUBLIC` / `_BOOKING` | não | Requisições por minuto (120 / 10 / 60 / 10). |
| `REDIS_URL` | não | Reservado para cache/filas distribuídos. Não é necessário: a proteção contra double booking é do PostgreSQL. |
| `NEXT_PUBLIC_API_URL` | web | URL da API vista pelo navegador. |

Sem `GOOGLE_CLIENT_ID/SECRET` a aplicação sobe normalmente: só o botão
"Conectar Google Agenda" fica indisponível, e tipos de evento com Google Meet
não podem ser reservados.

---

## Banco de dados, migrations e seed

```bash
docker compose up -d db          # ou use um Postgres já existente

pnpm db:generate                 # gera o Prisma Client
pnpm db:deploy                   # aplica as migrations (produção/CI)
# pnpm db:migrate                # cria uma migration nova (desenvolvimento)
pnpm db:seed                     # host de demonstração (opcional)
```

O seed cria `demo@agenda.local` / `demo12345`, agenda de segunda a sexta das
09h às 18h e o tipo de evento "Reunião de Demonstração" (30 min) em
`/demo/demonstracao`. Nenhum token Google falso é persistido.

### Migrations

| Migration | Conteúdo |
| --- | --- |
| `20260915170305_init` | Todas as tabelas, enums, índices e chaves estrangeiras. |
| `20260915170400_booking_no_overlap` | `EXCLUDE USING gist` contra sobreposição, CHECKs de integridade, índices parciais de "uma agenda de destino" e "um schedule padrão". |

A segunda migration é escrita à mão porque o Prisma não modela exclusion
constraints. Ela é a peça central da prevenção de double booking.

---

## Executando

```bash
pnpm dev            # API (3333) + Web (3000) em paralelo
```

Ou separadamente:

```bash
pnpm --filter @agenda/api dev
pnpm --filter @agenda/web dev
```

- Aplicação: http://localhost:3000
- API: http://localhost:3333
- Swagger: http://localhost:3333/docs (fora de produção)
- Health: http://localhost:3333/health

---

## Testes

```bash
pnpm test                                   # unitários + integração
pnpm --filter @agenda/api test:unit         # só unitários (sem banco)
pnpm --filter @agenda/api test:integration  # só integração (exige banco)
```

Os testes de integração precisam de um banco migrado. Aponte
`TEST_DATABASE_URL` para ele:

```bash
createdb agenda_test
DATABASE_URL=postgres://.../agenda_test pnpm db:deploy
TEST_DATABASE_URL=postgres://.../agenda_test pnpm --filter @agenda/api test
```

O que é coberto:

| Suíte | Foco |
| --- | --- |
| `availability.engine.spec.ts` | 29 casos: dois intervalos no mesmo dia, exceções, buffers, antecedência, janela, limite diário, slot ≠ duração, múltiplos calendários, DST em `America/New_York`, mudança de dia entre fusos. |
| `google-calendar.provider.spec.ts` | Free/Busy agrupado, Meet novo a cada reserva, 401 → reautenticação sem loop, retry em 429/503, sem retry em 403, 404 silencioso no cancelamento. |
| `encryption.service.spec.ts` | Round-trip, IV aleatório, detecção de adulteração, rotação de chave. |
| `booking-flow.int-spec.ts` | Página pública, listagem sem vazar dados privados, reserva + evento + Meet, 409 na segunda tentativa, idempotência, buffers, falha do Google → `FAILED`, dashboard, cancelamento idempotente, reagendamento, ownership, sessão, CSRF. |
| `concurrency.int-spec.ts` | 2 e 10 requisições simultâneas no mesmo horário, sobreposição por buffer, `INSERT` direto recusado pelo banco. |
| `rate-limit.int-spec.ts` | 429 após tentativas repetidas de login. |

### E2E (Playwright)

Exige API + Web rodando contra um banco de testes:

```bash
pnpm --filter @agenda/web exec playwright install chromium   # primeira vez
E2E_WEB_URL=http://localhost:3000 E2E_API_URL=http://localhost:3333 pnpm test:e2e
```

Se o ambiente já tiver um Chromium instalado, aponte
`PLAYWRIGHT_CHROMIUM_PATH` para o executável em vez de baixar outro.

Cenários: agendar → aparecer no dashboard → cancelar → horário volta; e
agendar → reagendar → novo horário ocupado e anterior livre.

---

## Configuração do Google Cloud

1. **Criar o projeto** em https://console.cloud.google.com → *Novo projeto*.
2. **Ativar a API**: *APIs e serviços → Biblioteca → Google Calendar API →
   Ativar*.
3. **Tela de consentimento OAuth**: *APIs e serviços → Tela de permissão OAuth*.
   - Tipo **Externo** (ou **Interno**, se todos os usuários forem do mesmo
     Workspace).
   - Preencha nome do app, e-mail de suporte e e-mail do desenvolvedor.
   - Em *Escopos*, adicione:
     - `openid`
     - `.../auth/userinfo.email`
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/calendar.events`
4. **Criar o OAuth Client**: *Credenciais → Criar credenciais → ID do cliente
   OAuth → Aplicativo da Web*.
5. **Registrar o redirect URI** — precisa ser idêntico ao `GOOGLE_REDIRECT_URI`:
   - desenvolvimento: `http://localhost:3333/integrations/google/callback`
   - produção: `https://api.seudominio.com/integrations/google/callback`
6. **Preencher o `.env`** com `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e
   `GOOGLE_REDIRECT_URI`.
7. **Usuários de teste**: enquanto o app estiver em *Teste*, adicione em
   *Tela de permissão OAuth → Usuários de teste* cada conta que for conectar.
   Sem isso o Google bloqueia o consentimento.
8. **Testar**: entre na aplicação → *Integrações* → *Conectar Google Agenda*.
9. **Antes de abrir ao público**: o app precisa passar pela
   [verificação OAuth do Google](https://support.google.com/cloud/answer/9110914).
   Escopos de Calendar são considerados sensíveis, então a revisão pede vídeo
   de demonstração, política de privacidade publicada e domínio verificado.
   Até lá, tokens de contas fora da lista de teste expiram em 7 dias.

### Escopos e justificativa

| Escopo | Para quê |
| --- | --- |
| `openid`, `userinfo.email` | Exibir qual conta Google está conectada. |
| `calendar.readonly` | Listar as agendas do usuário e consultar Free/Busy. |
| `calendar.events` | Criar, atualizar e cancelar os eventos dos agendamentos. |

Não pedimos `auth/calendar` (acesso irrestrito). Free/Busy devolve apenas
blocos ocupado/livre: título, descrição e participantes dos compromissos do
host nunca são lidos nem armazenados.

---

## Endpoints

Documentação interativa em `/docs`. Resumo:

### Auth
```
POST   /auth/register          cria conta + sessão
POST   /auth/login             autentica (cookie HttpOnly)
POST   /auth/logout            encerra a sessão
GET    /auth/me                usuário autenticado
```

### Usuários
```
GET    /users/me
PUT    /users/me               nome, username, timezone, idioma
GET    /users/username-available?username=
POST   /users/onboarding       marca a etapa concluída
```

### Google
```
GET    /integrations/google/connect      devolve a URL de autorização
GET    /integrations/google/callback     callback do OAuth (público, state assinado)
GET    /integrations/google/calendars    agendas + preferências
PUT    /integrations/google/calendars    define conflitos e agenda de destino
DELETE /integrations/google              revoga e apaga os tokens
```

### Disponibilidade
```
GET    /availability-schedules
POST   /availability-schedules
GET    /availability-schedules/:id
PUT    /availability-schedules/:id
DELETE /availability-schedules/:id
```

### Tipos de evento
```
GET    /event-types
POST   /event-types
GET    /event-types/:id
PUT    /event-types/:id
DELETE /event-types/:id                  soft delete
POST   /event-types/:id/duplicate
```

### Público (sem autenticação)
```
GET    /public/:username/:eventSlug
GET    /public/:username/:eventSlug/availability?startDate=&endDate=&timezone=
POST   /public/:username/:eventSlug/book
```

### Agendamentos (host)
```
GET    /bookings?filter=upcoming|past|cancelled|all
GET    /bookings/summary
GET    /bookings/:id
POST   /bookings/:id/cancel
```

### Gestão pela reserva (convidado, via token)
```
GET    /booking/cancel/:token
POST   /booking/cancel/:token
GET    /booking/reschedule/:token
POST   /booking/reschedule/:token
```

### Códigos HTTP

| Código | Quando |
| --- | --- |
| 200 / 201 | Sucesso / recurso criado. |
| 400 | Payload inválido. |
| 401 | Sem sessão. |
| 403 | Sem permissão ou CSRF ausente. |
| 404 | Recurso inexistente (ou de outro usuário). |
| 409 | Horário não está mais disponível. |
| 422 | Regra de negócio (ex.: fora do prazo de cancelamento). |
| 429 | Rate limit. |
| 503 | Google Agenda indisponível — nada foi confirmado. |

Toda resposta de erro tem a forma
`{ statusCode, code, message, requestId }`, com `code` estável para o frontend
escolher a mensagem. Stack traces nunca são expostos.

---

## Telas

| Rota | Descrição |
| --- | --- |
| `/` | Landing. |
| `/cadastro`, `/entrar` | Criação de conta e login. |
| `/onboarding` | 4 etapas: dados → Google → agendas → disponibilidade. |
| `/visao-geral` | Hoje, próximos 7 dias, status do Google, próximas reuniões. |
| `/agendamentos` | Filtros (próximos, passados, cancelados, todos), detalhes, cancelamento. |
| `/tipos-de-evento` | Cards com copiar link, editar, ativar/desativar, duplicar, excluir. |
| `/tipos-de-evento/novo`, `/tipos-de-evento/:id` | Editor por seções. |
| `/disponibilidade` | Dias, múltiplos intervalos, copiar horários, exceções por data. |
| `/integracoes` | Conectar/reconectar/desconectar, escolher agendas. |
| `/configuracoes` | Perfil, username, fuso, idioma, segurança. |
| `/{username}/{eventSlug}` | Página pública de agendamento. |
| `/agendamento/cancelar/{token}` | Cancelamento pelo convidado. |
| `/agendamento/reagendar/{token}` | Reagendamento pelo convidado. |

---

## Deploy

1. `pnpm build` (gera Prisma Client, compila shared, API e Web).
2. Rode `pnpm db:deploy` no ambiente alvo antes de subir a nova versão.
3. Suba a API com `node apps/api/dist/main.js` e o Web com `next start`.
4. Em produção, garanta:
   - `NODE_ENV=production` (ativa `Secure` no cookie e desliga o Swagger);
   - `WEB_URL` e `GOOGLE_REDIRECT_URI` com os domínios reais e HTTPS;
   - `JWT_SECRET` e `ENCRYPTION_KEY` vindos do gerenciador de segredos, nunca
     do repositório;
   - backup do `ENCRYPTION_KEY` — sem ela, os refresh tokens salvos tornam-se
     irrecuperáveis e todos os hosts precisam reconectar o Google.

O usuário do banco precisa de permissão para `CREATE EXTENSION btree_gist` na
primeira migration (ou um superusuário deve criá-la antes).

---

## Troubleshooting

**`Variável de ambiente obrigatória ausente: ENCRYPTION_KEY`**
A API se recusa a subir sem segredos. Gere a chave conforme
[Instalação](#instalação).

**`ENCRYPTION_KEY deve ser 32 bytes codificados em base64`**
Use `randomBytes(32).toString('base64')` — 44 caracteres terminando em `=`.

**`type "gist" does not exist` / falha na migration**
O usuário do banco não pode criar extensões. Rode como superusuário:
`CREATE EXTENSION IF NOT EXISTS btree_gist;`

**"O Google não devolveu um refresh token"**
O Google só envia o refresh token no primeiro consentimento. Remova o acesso
do app em https://myaccount.google.com/permissions e conecte novamente.

**`redirect_uri_mismatch`**
`GOOGLE_REDIRECT_URI` precisa ser idêntico ao registrado no console —
incluindo protocolo, porta e barra final.

**Status "Precisa reconectar" no dashboard**
O refresh token foi revogado (o usuário removeu o acesso, ou o app em modo
*Teste* passou de 7 dias). Clique em *Reconectar*.

**Horários não aparecem na página pública**
Verifique, nesta ordem: o tipo de evento está ativo; o host tem username; há
regras semanais para aquele dia; a antecedência mínima não consumiu o dia
inteiro; a data está dentro da janela de agendamento; não há exceção
bloqueando a data.

**409 ao confirmar**
Comportamento correto: alguém reservou o horário primeiro. O frontend
recarrega a lista automaticamente.

**CORS ou cookie não persiste**
`WEB_URL` precisa ser exatamente a origem do frontend, e o navegador precisa
receber `credentials: 'include'` — é o que o cliente da API já faz.

---

## Limitações atuais

- **Apenas eventos one-to-one.** `GROUP`, `COLLECTIVE` e `ROUND_ROBIN` existem
  no modelo, mas não há lógica implementada — de propósito, para não entregar
  meia funcionalidade.
- **Um host por workspace na interface.** O modelo de dados já suporta vários.
- **Sem sincronização incremental do Google.** A disponibilidade consulta
  Free/Busy sob demanda. Os campos `syncChannelId`, `syncChannelExpiresAt` e
  `syncToken` já existem para uma implementação futura de webhooks.
- **Notificações apenas por e-mail e apenas na confirmação/cancelamento/
  reagendamento.** Lembretes (24h, 1h) e follow-up ainda não foram
  implementados — o `NotificationService` já está desacoplado para recebê-los.
- **Cache de disponibilidade por processo.** Seguro, porque não participa da
  decisão de reservar, mas em várias instâncias cada uma tem o seu.
- **Sem CAPTCHA.** Há rate limiting; a arquitetura permite acrescentar
  verificação depois de comportamento suspeito.
- **Interface só em pt-BR.** Os textos estão centralizados nos componentes e as
  datas respeitam locale, mas não há biblioteca de i18n instalada.
- **Limites de reunião apenas diários.** O domínio está preparado para limites
  semanais/mensais.

## Próxima fase sugerida

1. Lembretes automáticos (24h e 1h) com fila de jobs.
2. Webhooks do Google + sync tokens, com renovação automática dos canais.
3. Eventos em grupo e round robin (o modelo já comporta).
4. Embed da página pública em sites de terceiros.
5. Analytics de conversão usando os campos UTM já capturados.
6. i18n en-US.
