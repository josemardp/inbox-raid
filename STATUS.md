# STATUS: INBOX RAID

Atualizado: 05/10/2026, noite (segunda, dia 1 do Hackyard).

## Onde estamos
- **M1 (Modo Demo) pronto e no ar:** https://josemardp.github.io/inbox-raid/
- Partida completa: título, varredura, 6 chefões, horda de 31 e-mails, tela final com missões.
- Ações: arquivar, lixeira, descadastrar (crítico), poupar, missão (estrela + arquivar), desfazer (Z).
- Combo até x8, barra de estresse, pontuação, recorde salvo no navegador.
- Som: efeitos ZzFX + música chiptune gerada por código. Tecla M liga e desliga.
- Celular: botões grandes e arrastar o cartão (esquerda arquiva, baixo lixeira, direita missão).
- Testado: partida inteira por script (teclado) no desktop 1280x800 e por toque no celular 390x844.

- Site no ar conferido em 05/10 21:33: partida completa até INBOX ZERO, sem erro no console.
- Publicação atrasou ~40 min por falha geral do GitHub Actions (não era erro do projeto).

- 05/10 noite: Gmail real **ligado** ao botão "RAID MY GMAIL" (tecla G) e modo privacidade (tecla P) no ar.
  - Testado: login do Google abre com o cliente e a origem certos (sem erro de configuração). Privacidade tarja pessoas.
- **05/10 19:50: modo real testado na conta lojadares** (autorizado pelo Josemar, pelo navegador `nav-lojadares`).
  - Varredura leu a caixa real: só 3 e-mails, nenhum chefão (a lojadares é quase vazia).
  - Arquivar um e-mail real (Magalu): sumiu de `in:inbox` no Gmail. Desfazer (Z): voltou para a Caixa de entrada, ainda não lido. Conferido no Gmail web nas duas pontas.
  - Os erros "Cross-Origin-Opener-Policy" no console vêm da biblioteca do Google e são inofensivos.
  - Ainda não testados no real: lixeira, missão, descadastro (one-click, mailto, link) e chefões.

- **05/10 21:30: auditoria externa aplicada.** Conferido na doc oficial: cota de 6.000 unidades/min por usuário, `messages.get` = 20 (projetos criados após 01/05/2026). Corrigidos: varredura no ritmo da cota (4 leituras/s, espera em 429, máx. 500), fim da fila de teclas (ignora tecla segurada e tecla durante animação), INBOX ZERO só se a caixa inteira zerou, desfazer conserta o Gmail antes do jogo, injeção de cabeçalho no descadastro por mailto, privacidade tarja todo assunto, sessão expirada pede G para reconectar, botões DESFAZER/SOM/SAIR no celular, fonte hospedada no site, aba parada não dispara estresse nem música.
  - `npm test`: 20 testes passando (regras do jogo + Gmail simulado). Interface conferida no site publicado (desktop e 390x844).

- **05/10 21:45: segunda auditoria (Antigravity) aplicada.** Ela foi feita sobre a versão anterior; itens novos e válidos corrigidos: P durante a partida, cabeçalhos RFC 2047, ritmo da música ao desfazer, one-click só em https, privacidade também para Gmail/Hotmail/grupos, morte de chefão mais rápida, plano B da lixeira.
  - **Lixeira testada no Gmail real (lojadares):** `batchModify` com TRASH respondeu 204, como diz a doc do Google (o Antigravity dizia 400; estava errado). Desfazer: e-mail de volta na caixa, não lido, conferido no Gmail web.
  - `npm test`: 24 testes passando.

## Próximo passo
1. **Gravação: terça 06/10 às 19:00**, na caixa **josemardp** com privacidade ligada (decisão do Josemar). Ele joga no Chrome dele, Claude grava a tela com ffmpeg. Até lá, não limpar a caixa da josemardp.
1b. Auditoria externa (Codex e Antigravity) com o prompt de auditoria; revisar o relatório quando o Josemar colar de volta.
2. Testar descadastro real num remetente de marketing.
3. Speedrun até qua 07/10 15:00: README com GIF + vídeo v1 + entrega no Hackyard.
   - Varredura: `messages.list` em `in:inbox` + metadados (From, Subject, Date, List-Unsubscribe, List-Unsubscribe-Post).
   - Ações em lote com `messages.batchModify` (arquivar = tirar INBOX; lixeira = TRASH; missão = STARRED e tirar INBOX).
   - Descadastro: one-click POST, mailto pelo Gmail, ou abrir link.
   - Desfazer: devolver os rótulos anteriores.
2. Modo privacidade (esconder remetentes pessoais na gravação).
3. Testar na conta lojadares antes de qualquer outra.

## Decisões e dados fixos
- Plano completo: [docs/PLANO.md](docs/PLANO.md).
- Google Cloud: projeto `inbox-raid-510712`, cliente OAuth público no plano. Testadoras: josemardp e lojadares.
- Prazos (Brasília): Speedrun qua 07/10 15:00; entrega final sex 09/10 15:00 (meta: 12:00).
