# STATUS: INBOX RAID

Atualizado: 06/10/2026, noite (terça, dia 2 do Hackyard).
**Onde paramos:** jogo completo e publicado. Correções da rodada 2 de auditoria aplicadas e testadas na Demo (06/10 noite); falta conferir no Gmail real e gravar. Não há registro da gravação marcada para 19:00 de 06/10. Speedrun: entregar até qua 07/10 15:00 (vídeo v0 de reserva existe só no scratchpad da sessão; regerar com `capture.mjs`/`captions.mjs` se preciso).
**Para retomar:** Josemar diz "retomar construção do game". Ler este arquivo; próximo passo é o teste real na lojadares e a gravação.

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

- **06/10 manhã:** cartão para compartilhar (tecla C, 1200x630, sem nomes nem assuntos), GIF no topo do README, modo `?rec` que grava o som do jogo a partir do FIGHT! e baixa `inbox-raid-audio.webm` no fim.
  - Hackyard (página lida): entregar de novo substitui a entrega anterior. Campos: repo (obrigatório), vídeo, texto até 500, modelo de IA (obrigatório: Claude Code), recibo opcional.
  - Vídeo v0 (só Demo, 38 s, legendas + cartão final + som sincronizado) montado e conferido; fica de reserva para o Speedrun.
  - Ferramentas de captura e edição ficam fora do repo (scratchpad da sessão): `capture.mjs` (Playwright + Chrome), `captions.mjs` (legendas PNG na fonte do jogo), filtro ffmpeg 9 (`-/filter_complex arquivo`).

## Auditoria rodada 2 (06/10): correções APLICADAS na noite de 06/10
Cada achado foi conferido no código antes de corrigir. `npm test`: 31 testes passando. Build ok. Demo jogada inteira em 1280x720 e 390x844, sem erro no console.

**Feito:**
- Gmail lento: ações com no máximo 2 novas tentativas (espera 1 s, 2 s, 4 s), aviso na tela (`onWait` vira toast), limite de 8 s no POST one-click, 20 s em toda chamada. Esc sai da partida mesmo esperando o Gmail. Tempo de espera do Gmail não quebra combo nem enche estresse.
- Descadastro honesto: "CRITICAL HIT!" + "UNSUBSCRIBE SENT" (nunca "GONE FOREVER"), contador "UNSUBS SENT", `UnsubResult.confirmed` separa pedido de confirmado. Falha no descadastro tira o crítico do contador. Z depois de U avisa que o pedido já foi enviado. U repetido não reenvia. README revisado.
- Mailto seguro: assunto e corpo sempre "unsubscribe"; destino mostrado no chefão; só aceita endereço do mesmo site do remetente (senão usa o link, ou nada).
- One-click só com `List-Unsubscribe=One-Click` exato; usa o link https mesmo se houver http antes.
- Lixeira plano B: falha parcial devolve à caixa os que já foram, para o rollback do jogo ser verdadeiro.
- Privacidade: tarja sem o texto original no DOM; horda e diário de missões tarjam todo remetente; chefão só mostra nome se parecer remetente em massa (decisão: marcas ficam no vídeo). P funciona na tela final; link "Go check it" usa `/u/0` com P ligado. P no meio da partida não reinicia a trava do chefão.
- Tela final: botões UNDO, PRIVACY e RECONNECT (G), carimbos limpos ao entrar, recorde salvo ao entrar (desfazer devolve o anterior), recontagem real da caixa (`labels/INBOX`) para INBOX ZERO honesto. Cabe em 1280x720.
- `?rec`: checa suporte, não trava em READY, nova partida fecha a gravação anterior, Z na tela final não corta o áudio (testado), URL revogada.
- Varredura: Esc e botão CANCEL (para a leitura no Gmail também); 403 interrompe em vez de virar caixa vazia (só 404 é tolerado); `wasStarred` limpo a cada varredura.
- Também: RECONNECT some depois de reconectar, Enter funciona com o login do Google pendurado, cartão (cancelar no celular não baixa, C repetido não duplica, números centralizados, `<a>` no DOM), música não agenda com a aba oculta, `parseFrom` com comentário, `npm test` no deploy.

**Ainda NÃO testado no Gmail real:** nada do bloco acima rodou contra Gmail de verdade (só Demo e Gmail simulado nos testes). Antes da gravação: partida curta na lojadares (arquivar, lixeira, U, Z).

**Ficou para depois (baixo):** número gigante no cartão, monstros do cartão com semente aleatória, GIF mais leve (4,3 MB), sugestões de vídeo (GIF do modo real, tela dividida, contador do Gmail no canto).
- Texto de entrega alternativo (471 caracteres) do relatório 3: no scratchpad da sessão 00e21256 (`relatorio-auditoria-inbox-raid.md`, só no notebook laptop-3nsqg27t).

**Para a gravação (dos relatórios):** antes, contar a caixa (`in:inbox`): se passar de 500 ou tiver muitos avulsos, fechar com "STAGE CLEAR" e o número que caiu; zoom 125% ou 150% (a tela final agora cabe em 1280x720); não apertar Z na tela final; esperar ~1 s na tela final antes do corte; nos chefões "OPENS THEIR PAGE" usar A; desfocar Gmail e a seletora de contas na edição; liberar pop-up e download automático para josemardp.github.io no Chrome; testar `?rec` numa Demo curta antes; P não protege a tela do próprio Gmail nem a de consentimento (enquadrar só a contagem); não prometer zero antes de ver o total; cortar a varredura (~2 min para 500).

**Texto de entrega sugerido (relatório 2, 424 caracteres, ajustar se U mudar):**
> INBOX RAID turns inbox cleanup into an arcade boss fight. Repeat senders have HP equal to their email count; each hit really archives, trashes, or stars Gmail messages. One-click unsubscribe can land a critical, and the horde rewards fast decisions with combos. Play the no-login demo now; the video shows a real inbox being cleared. Gmail mode is invite-only during Google's review. Built solo with Claude Code for Yard #4.

## Roteiro da gravação (terça 19:00, caixa josemardp)
1. Chrome do Josemar em tela cheia, **zoom 150%**. Abrir `https://josemardp.github.io/inbox-raid/?rec`.
2. Claude inicia a gravação de tela (ffmpeg gdigrab, 1920x1080, 30 fps).
3. Plano 1: Gmail da josemardp com a caixa cheia (5 s). Não mostrar o endereço da conta.
4. Plano 2: jogo. Apertar **P** (privacidade) antes, depois **G**, autorizar, esperar a varredura (~1 a 2 min, cortada na edição).
5. Jogar: chefões com U quando houver descadastro, A ou D nos demais, S para quem não pode sumir. Horda: setas; missão (→) para o que precisa de resposta.
6. No fim, apertar **C** (cartão) e voltar ao Gmail: caixa vazia.
7. O áudio do jogo baixa sozinho (`inbox-raid-audio.webm`); a edição junta pelo FIGHT!.

## Próximo passo
1. **Publicar as correções** (push) e fazer partida curta real na lojadares: arquivar, lixeira, U, Z, tela final.
2. **Gravação** na caixa **josemardp** com privacidade ligada (decisão do Josemar). Ele joga no Chrome dele, Claude grava a tela com ffmpeg. Até lá, não limpar a caixa da josemardp.
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
