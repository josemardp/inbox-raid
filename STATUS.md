# STATUS: INBOX RAID

Atualizado: 06/10/2026, manhã (terça, dia 2 do Hackyard).
**Onde paramos:** jogo completo e publicado (Demo + Gmail real testado na lojadares). Rodada 2 de auditoria com 2 de 3 relatórios recebidos e a lista de correções abaixo, ainda não aplicada. Gravação marcada para hoje 19:00. Speedrun: entregar até qua 07/10 15:00 (vídeo v0 de reserva existe só no scratchpad da sessão; regerar com `capture.mjs`/`captions.mjs` se preciso).
**Para retomar:** Josemar diz "retomar construção do game". Ler este arquivo, colar o 3º relatório se houver, conferir os achados e corrigir na ordem de prioridade.

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

## Auditoria rodada 2 (06/10, em andamento): 2 de 3 relatórios recebidos, NADA corrigido ainda
Prompt da rodada 2 enviado a 3 IAs. Recebidos o relatório 1 (superficial) e o 2 (profundo). Falta o 3.
Ao retomar: conferir cada achado no código antes de corrigir (relatório de IA também erra).

**Prioridade alta (antes de usar U ou gravar):**
- [ ] Descadastro one-click usa `no-cors`: o jogo não vê a resposta. Trocar "UNSUBSCRIBED! GONE FOREVER" e o crítico por "pedido de descadastro enviado"; separar `solicitado` de `confirmado` em `UnsubResult` e no contador. Revisar README ("die forever").
- [ ] Z depois de U volta os e-mails mas não desfaz o descadastro: avisar isso na tela.
- [ ] Plano B da lixeira com falha parcial: registrar IDs já movidos e não fazer rollback visual integral.
- [ ] Privacidade: tarjar TODOS os nomes e endereços em modo P (nome de pessoa com domínio de empresa + List-Unsubscribe escapou). P também na tela final (diário de missões). Tarja sem o texto original no DOM.
- [ ] Tela final: botão e tecla G para reconectar (401 no desfazer), botão DESFAZER clicável no celular, preservar histórico.
- [ ] `?rec`: `try/catch` e checagem de suporte (sem MediaRecorder o jogo trava em READY?); parar gravador anterior e cancelar timer ao jogar de novo; revogar URL.

**Prioridade média:**
- [ ] Reler `labels/INBOX` no fim para INBOX ZERO e cartão (e-mail que chega durante a partida).
- [ ] 403 de permissão nos metadados deve interromper a varredura (hoje vira lista vazia); tolerar só 404 isolado.
- [ ] Combo: não contar o tempo de espera do Gmail (`busy`).
- [ ] Recorde: salvar ao entrar na tela final (recarregar a aba perde o recorde).
- [ ] `parseFrom`: comentário depois do endereço (`Maria <m@x.com> (Sales)`).
- [ ] One-click só com `List-Unsubscribe=One-Click` exato; preferir URL https mesmo se houver http antes.
- [ ] `wasStarred` limpo a cada `load()`.
- [ ] Música para de agendar notas com a aba oculta.
- [ ] P não reinicia a trava de 350 ms do chefão.

**Baixo:** número gigante no cartão (measureText), download do cartão com `<a>` no DOM, monstros do cartão com semente aleatória, Esc na varredura, GIF mais leve (4,3 MB).

**Para a gravação (dos relatórios):** liberar pop-up e download automático para josemardp.github.io no Chrome; testar `?rec` numa Demo curta antes; P não protege a tela do próprio Gmail nem a de consentimento (enquadrar só a contagem); usar A nos chefões até corrigir U; não prometer zero antes de ver o total; cortar a varredura (~2 min para 500).

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
