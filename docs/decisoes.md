# Decisões técnicas

Registro curto do "porquê" das escolhas que não são óbvias no código.

---

## 1. Prevenção de double booking

**Decisão:** a garantia final é uma *exclusion constraint* GiST no PostgreSQL,
não a checagem da aplicação.

```sql
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    "hostUserId" WITH =,
    tstzrange("blockedStartAt", "blockedEndAt", '[)') WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED'));
```

**Por quê:** entre a listagem de horários e o clique em "Confirmar" pode
passar bastante tempo, e duas requisições podem chegar no mesmo milissegundo.
Qualquer verificação em aplicação tem uma janela de corrida; a constraint não
tem. O índice é **parcial**: quando uma reserva vira `CANCELLED`, `FAILED` ou
`RESCHEDULED`, ela sai do índice e o horário é liberado na mesma transação,
sem nenhum trabalho extra.

O intervalo protegido é `blockedStartAt/blockedEndAt` — que já inclui os
buffers — e não `startAt/endAt`. Isso faz o banco proteger exatamente a mesma
regra que o AvailabilityEngine aplica.

`btree_gist` é necessário para permitir `hostUserId WITH =` (uuid) dentro de
um índice GiST.

**Consequência:** o `BookingConflictService` traduz o erro `23P01` do Postgres
em `409 Conflict`. Testes em `test/concurrency.int-spec.ts` disparam 10
requisições simultâneas e verificam que exatamente uma é confirmada — incluindo
um teste que insere direto pelo Prisma, provando que a proteção não depende da
camada de aplicação.

---

## 2. Timezones

**Decisão:** UTC no banco e na aritmética; identificadores IANA nas bordas;
horários da agenda guardados como *minutos desde a meia-noite local*.

**Por quê:** guardar "09:00" como um instante fixo quebra duas vezes por ano.
Guardando o minuto local e resolvendo para hora de parede no dia específico,
"segunda às 09:00" continua sendo 09:00 antes e depois do horário de verão —
mesmo que o offset UTC mude.

O engine usa `DateTime.set({hour, minute})` em vez de
`startOf('day').plus({minutes})`: a segunda forma é aritmética absoluta e
produziria 10:00 em um dia de transição de DST à meia-noite.

Offsets fixos (`-03:00`) são **rejeitados** na validação, mesmo que o `Intl`
os aceite: eles ignoram DST. `UTC` é aceito porque alguns navegadores o
reportam em `Intl.DateTimeFormat().resolvedOptions().timeZone`.

**Testado em:** `availability.engine.spec.ts` cobre a virada do DST em
`America/New_York`, mudança de dia entre `America/Sao_Paulo` e `Asia/Tokyo`, e
a diferença de offset antes/depois da transição.

---

## 3. Buffers

**Decisão:** o intervalo bloqueado de cada reserva já inclui os buffers dela;
o candidato a novo horário também aplica os próprios buffers.

**Consequência (intencional):** uma reunião com 15 min de buffer depois,
seguida de outra com 15 min de buffer antes, resulta em 30 min de folga. É o
comportamento esperado — são duas regras diferentes se somando, não uma
contagem duplicada.

O buffer **não** aparece na duração do evento no Google Calendar: ele existe
apenas para impedir reservas vizinhas.

---

## 4. Armazenamento dos tokens do Google

**Decisão:** AES-256-GCM com a chave em variável de ambiente; formato
`<keyId>.<iv>.<authTag>.<payload>`.

**Por quê:** o prefixo com o id da chave permite rotação sem migração
destrutiva — chaves antigas continuam em `ENCRYPTION_KEYS_LEGACY` e conseguem
decriptar registros anteriores, enquanto tudo que é gravado usa a chave
corrente. `EncryptionService.rotate()` reescreve um segredo na chave nova.

GCM (e não CBC) porque autentica o texto cifrado: um valor adulterado falha na
decriptação em vez de devolver lixo.

**Regras absolutas:** refresh token nunca vai para o frontend, nunca aparece em
log (o `redact()` do logger remove chaves sensíveis) e nunca é gravado em
texto puro.

---

## 5. Escopos OAuth (menor privilégio)

```
openid, email                                  -> saber qual conta conectou
.../auth/calendar.readonly                     -> listar agendas e free/busy
.../auth/calendar.events                       -> criar/alterar/cancelar eventos
```

Deliberadamente **não** pedimos `.../auth/calendar` (acesso total à agenda).
Free/Busy devolve apenas blocos ocupado/livre: título, descrição e
participantes dos compromissos do host nunca são lidos nem armazenados.

---

## 6. Consistência entre banco e Google

**Decisão:** a reserva nasce `PENDING`, o evento é criado no Google e só então
ela vira `CONFIRMED`. Se o Google falhar, a reserva vai para `FAILED`.

**Por quê:** não existe transação distribuída entre o Postgres e a API do
Google. As alternativas eram:

1. confirmar antes de falar com o Google — geraria confirmações que não
   existem na agenda do host (o pior resultado possível);
2. manter a transação aberta durante a chamada HTTP — seguraria locks por
   segundos e derrubaria o throughput;
3. **estado intermediário + compensação** — a escolhida.

`PENDING` já ocupa o horário (está no índice parcial), então ninguém reserva
por cima durante a chamada ao Google. `FAILED` sai do índice, liberando o
horário na hora, e a chave de idempotência é liberada junto para permitir
retry seguro. O convidado recebe `503` com mensagem clara em vez de uma
confirmação falsa.

**Reagendamento:** um único `UPDATE` move o intervalo da própria linha, então a
constraint valida o novo horário contra as outras reservas e o horário
anterior só é liberado no commit — nunca existe um instante com os dois
livres. Se o Google falhar depois do commit, o serviço compensa revertendo o
banco ao horário anterior; se a reversão também falhar (alguém tomou o horário
antigo nesse meio tempo), mantemos o novo horário e gravamos `syncError` para
reconciliação.

---

## 7. Cache de disponibilidade

Existe um cache em memória de poucos segundos (`AVAILABILITY_CACHE_TTL_SECONDS`)
apenas para a leitura da página pública. O `POST /book` **nunca** usa cache:
refaz a checagem completa, incluindo uma nova consulta de Free/Busy ao Google.
Reserva, cancelamento e reagendamento invalidam as entradas do evento.

Em uma instalação com várias instâncias, o cache é por processo — o que é
seguro exatamente porque ele não participa da decisão de reservar.

---

## 8. Falha do Google na leitura vs. na escrita

Na **página pública** (leitura), uma falha do Google degrada para "apenas
reservas internas": é preferível mostrar a agenda parcial a derrubar a página,
e a reserva será revalidada de qualquer forma.

No **momento da reserva** (`strict: true`), uma falha do Google **interrompe** a
operação. Liberar um horário porque não conseguimos verificar a agenda seria
exatamente o erro que o produto existe para evitar.

Da mesma forma, se uma das agendas marcadas devolve erro no Free/Busy, o
provedor lança exceção em vez de tratar aquela agenda como vazia.

---

## 9. Tokens de cancelamento e reagendamento

Links públicos usam um token aleatório de 32 bytes; o banco guarda apenas o
SHA-256. O id da reserva nunca aparece na URL.

SHA-256 (e não Argon2) é adequado aqui porque o segredo tem 256 bits de
entropia real — não há espaço de busca para força bruta, diferente de uma
senha escolhida por humano.

---

## 10. Autenticação e CSRF

Sessão em JWT dentro de cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` em
produção): o token é inacessível ao JavaScript da página.

Como o cookie é enviado automaticamente pelo navegador, mutações autenticadas
exigem também o header `x-csrf-token` repetindo o valor de um cookie legível
(*double submit*). Um site terceiro consegue disparar a requisição, mas não
consegue ler o cookie para preencher o header.

Rotas públicas de agendamento não exigem CSRF: não há sessão nem ação
privilegiada envolvida.

Senhas usam Argon2id (19 MiB, 2 iterações). O login executa a verificação
mesmo quando o e-mail não existe, para não vazar quais e-mails estão
cadastrados pelo tempo de resposta.

---

## 11. Workspaces desde o início

Mesmo com um usuário por conta, o modelo já tem `Workspace` +
`WorkspaceMember` com papéis. Migrar dados depois é caro; a coluna extra
agora é barata. É o que vai permitir equipes, round robin e eventos coletivos
sem reescrever o domínio.

Pelo mesmo motivo, `EventType.kind` já existe com `ONE_TO_ONE | GROUP |
COLLECTIVE | ROUND_ROBIN`, mas **apenas `ONE_TO_ONE` está implementado** — não
há lógica pela metade fingindo suportar os outros.

---

## 12. Soft delete e snapshots

`EventType` usa `deletedAt`; reservas nunca são apagadas, apenas mudam de
status. Cada `Booking` guarda snapshots (`eventNameSnapshot`,
`eventDurationSnapshot`, `locationTypeSnapshot`) e cada resposta guarda
`questionLabelSnapshot`.

Assim, uma reunião do ano passado continua legível mesmo que o tipo de evento
tenha sido renomeado ou a pergunta reescrita.
