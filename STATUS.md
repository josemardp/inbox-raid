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

## Próximo passo (M2, terça 06/10)
1. `src/gmailSource.ts` **já escrito e compilando, ainda não ligado à interface nem testado**. Falta: botão "RAID MY GMAIL" chamar `signIn()` e `startRaid(new GmailSource(token))`, e testar com o Josemar autorizando o acesso.
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
