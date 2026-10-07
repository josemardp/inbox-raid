# STATUS: INBOX RAID

Atualizado: 07/10/2026, fim da tarde (quarta, dia 3 do Hackyard).
**Onde paramos:** candidato final refinado, com personalidade e medalhas na Demo e correções de segurança na triagem. Speedrun entregue em 07/10 ~13:23; vídeo público: https://youtu.be/3pmce3kaHck.
**Vídeo v2 ENTREGUE (07/10 ~17:48):** https://youtu.be/kkd659QDP_A (público, canal Melinda Show/lojadares), 1:37. Parte 1: Demo Rápida (fala, crítico, medalhas, mesa de triagem, briefing com resposta sugerida, rascunho, combo x8, INBOX ZERO). Parte 2: Gmail real da josemardp com privacidade (202 -> 0, desfazer, rascunho real). Entrega do Hackyard substituída com o link novo e texto de 477 caracteres. Rascunho criado na gravação apagado; caixa devolvida ao estado original (8 e-mails do dia na caixa, 271 na Lixeira, nenhuma estrela). Arquivo: Downloadsinbox-raid-demo-video-v2.mp4. Editor: tools/video/edit2.mjs (duas gravações).
**Auditoria do commit a7777db (Claude, 07/10):** aprovado sem bloqueadores. Corrigido em seguida: a medalha Caixa Zero só aparece (tela final e cartão PNG) enquanto a caixa estiver de fato zerada; letras da tela final em 1280x720 voltaram a no mínimo 10 px; amarelo das medalhas virou o token --gold. Combo x8 é alcançável na Demo Rápida (o combo dos chefões continua na horda).
**Para retomar:** conferir o deploy do Pages e decidir se reenvia a entrega final; reenviar substitui a atual.

## Refinamento final para o voto (07/10, fim da tarde)
- **Chefões com personalidade:** os seis remetentes fictícios da Demo ganharam provocações autorais em português e inglês. Nenhuma fala é inventada para remetentes do Gmail real.
- **Medalhas arcade:** Faxina Crítica, Velocidade Máxima e Caixa Zero aparecem durante a partida, no relatório e no cartão PNG compartilhável.
- **Mais impacto:** o golpe de descadastro ganhou uma micro-pausa de 45 ms antes da explosão, desativada quando `prefers-reduced-motion` está ativo.
- **Rascunhos seguros:** a mesma missão não cria nem pontua um segundo rascunho na partida; a tela final marca o que já foi salvo e diferencia claramente rascunho fictício da Demo.
- **Desfazer fiel:** escolher um minicartão fora de ordem e desfazer agora restaura a posição exata da fila.
- **Atalhos consistentes:** `S` continua significando poupar nos chefões e deixou de arquivar/estrelar silenciosamente na horda.
- **Briefing pós-raid:** mensagens informativas explicam que não precisam de resposta, em vez de parecer uma tela sem ação.
- **Validado:** 49 testes, `npm run build`, `git diff --check`, partidas na Demo Rápida em Mesa e Clássico, PT/EN, 1280x720 e fluxo móvel responsivo. Cartão PNG conferido em 1200x630.
- Sem servidor, sem escopo OAuth novo e sem mudar as garantias de desfazer/nunca enviar e-mail.

## Candidato final do Hackyard (07/10 ~14:50)
- **Demo Rápida · 45s:** 245 e-mails, dois chefões (142 + 96) e sete decisões com ordem narrativa; a Raid Completa continua disponível.
- **Primeiros 30 segundos:** resumo do poder antes da luta, tutorial contextual U → AGIR → recomendação segura, Mesa de Triagem como padrão para visitantes novos.
- **Ritmo e impacto:** menos partículas cobrindo a próxima tela, fila responsiva (3 cartões no celular), janela de combo da Mesa em 4s e Clássico em 2,5s; a primeira ação agora sempre começa em x1.
- **Confiança:** classificador conservador separa pessoas de endereços funcionais; Prompt API local só é oferecida no idioma oficialmente suportado pelo jogo; modal com foco preso e fundo inerte.
- **Validado:** `npm test` com 47 testes, `npm run build`, partidas completas na Demo Rápida em Mesa (40s) e Clássico (18s), teclado, 390x844, PT/EN e nenhum aviso/erro no console.
- Sem servidor, sem escopo OAuth novo e sem mudar as garantias de desfazer/nunca enviar e-mail.

## Onde estamos
- **Jogo no ar:** https://josemardp.github.io/inbox-raid/ (commit `f546204` e seguintes).
- **Visual V2 "orbital command console"** (aprovado pelo Josemar entre 12 direções; ver `.design-ideas/`, fora do git):
  - topo branco com placar e tempo;
  - radar azul-marinho com o monstro (desenhado em pontos de luz);
  - console central com dois mostradores de painel de carro (caixa e estresse com ponteiro e faixa vermelha) e o combo no meio;
  - cartão branco do chefão (nome, vida em segmentos, ataques tarjados, selo de descadastro);
  - botões que afundam quando a tecla é apertada.
  - Fontes Space Grotesk e DM Mono hospedadas no site.
- **Bilíngue:** português se o navegador estiver em português, inglês nos outros casos; tecla `L` ou o botão EN / PT trocam. Textos em `src/i18n.ts`.
- Conferido: 1280x720, 1920x1080, 390x844 e 360x640, partida inteira sem erro no console, `npm test` 31 passando.
- Correções de hoje: carimbo "MAX COMBO" só uma vez, barra de rolagem que piscava com o tremor da tela, título cabendo em 720 de altura, celular baixo com os botões sempre visíveis.

## Vídeo (pronto)
- **No YouTube (público):** https://youtu.be/3pmce3kaHck
- **Arquivo:** `C:\Users\pc\Downloads\inbox-raid-demo-video.mp4` (1:50, 1920x1080, 30 fps, som do jogo já sem chiado e no volume do YouTube). Só nesta máquina (notebook atual); não vai para o git (21 MB).
- **Conteúdo, em inglês:**
  1. Gmail real com 194 e-mails (assuntos desfocados).
  2. Título e privacidade ligada.
  3. Varredura acelerada.
  4. Chefões em tempo real: 9 primeiros, corte "5 bosses later", e os 2 últimos ("Lydia from Claude Code").
  5. Horda em tempo real, com um "erro" desfeito com Z, corte "N cards later" e o fim.
  6. INBOX ZERO 194 → 0, Gmail vazio e cartão final.
- **Revisado:**
  - nenhum quadro cortado;
  - som sincronizado (estrondo ~50 ms após o clarão);
  - sem silêncio fora das transições;
  - abertura e fechamento conferidos quadro a quadro.
- **Como foi gravado:** o robô `tools/video/raid-bot.mjs` jogou no Gmail real da josemardp com ritmo humano. Ele roda sem janela (headless com `--force-device-scale-factor=1.5`), porque com janela as barras do Chrome encolhiam a captura.
  - **Os 194 e-mails vieram da Lixeira da josemardp** (a caixa estava vazia): foram restaurados para a gravação e devolvidos à Lixeira depois. A caixa ficou como estava.
  - Descadastros reais enviados para Academia Mentions, Skyscanner e Headliner.
- **Regerar:**
  1. Restaurar os e-mails.
  2. `node tools/video/raid-bot.mjs --mode gmail --out <pasta> --plan <plano.json> --profile C:\Users\pc\.claude-browser\perfil-josemardp`.
  3. `node tools/video/base.mjs <pasta>`, depois `node tools/video/edit.mjs <pasta>`.
  - Plano e scripts de restaurar/limpar ficam em `.playwright-mcp/` (fora do git, só nesta máquina).

## Entrega no Hackyard (FEITA em 07/10, autorizada pelo Josemar)
- Campos: repo (obrigatório), vídeo, texto até 500 caracteres, modelo de IA (Claude Code), recibo opcional. Entregar de novo substitui a entrega anterior.
- Enviado: repo, vídeo https://youtu.be/3pmce3kaHck, modelo "Claude Opus 5.5" (editor/coding agent), print do chefão Cloudflare, e este texto (444 caracteres):
> INBOX RAID turns inbox cleanup into an arcade raid. Senders who flood you become bosses whose HP is their email count; every hit really archives, trashes or unsubscribes in Gmail, and Z undoes it in Gmail too. Then a horde of single emails rewards fast calls with combos. Runs 100% in the browser, no server, in English and Portuguese. Play the no-login demo; the video shows a real inbox going to zero. Built solo with Claude Code for Yard #4.

## Concluído (07/10 tarde): Mesa de Triagem + Briefing da missão
- **No ar desde 07/10 ~14:05** (commit `e53f1f5`, deploy do Pages conferido).
- Na tela inicial o jogador escolhe o estilo da horda (tecla `T`): **Clássico** (o do vídeo, intacto) ou **Mesa de Triagem** (minicartões à esquerda, arrastar para ARQUIVAR / LIXEIRA / AGIR; `↑` escolhe o cartão, setas enviam).
- **AGIR abre o briefing:** texto completo (só desse e-mail, lido na hora), tipo detectado (golpe, conta, confirmação, reunião, pedido, pergunta, pessoal, informativo), pistas (datas, valores, links), dica de ação e resposta sugerida com 3 tons (sim, depois, não) no idioma do e-mail. Botões: salvar rascunho + missão (+300 pontos), missão, arquivar, lixeira, pôr na agenda (abre o Google Agenda preenchido). O relógio para enquanto o briefing está aberto.
- **Nunca envia:** só cria rascunho no Gmail (`drafts.create`, coberto pelo escopo `gmail.modify` atual).
- IA do Chrome (Prompt API, roda no PC): botão "melhorar" só aparece se o modelo já estiver baixado; o jogo nunca dispara download.
- Na tela final, nos dois estilos, cada missão é clicável e abre o briefing para escrever o rascunho.
- Arquivos novos: `src/board.ts` (arrastar), `src/briefing.ts` (janela), `src/suggest.ts` (regras), `src/html.ts`; testes em `tests/suggest.test.ts`. 42 testes passando.
- Conferido na Demo: 1280x720 e 390x844, partida inteira nos dois estilos, PT e EN, sem erro no console.
- **Falta testar no Gmail real:** leitura completa (`format=full`) e criação de rascunho na caixa da josemardp.

## Próximo passo
1. Até sexta 09/10 15:00 (meta 12:00): entrega final. A atual já vale; reenviar só se houver melhoria (ideias: legenda "194 real emails" em vez de "in my inbox", GIF do modo real no README).
2. Pendente sem pressa: os scripts de restaurar/limpar a caixa e o plano da partida estão só em `.playwright-mcp/` desta máquina.

## Decisões e dados fixos
- Plano completo: [docs/PLANO.md](docs/PLANO.md).
- Google Cloud: projeto `inbox-raid-510712`, cliente OAuth público em teste. Testadoras: josemardp e lojadares.
- Prazos (Brasília): Speedrun qua 07/10 15:00; entrega final sex 09/10 15:00 (meta: 12:00).
- Visual: V2 aprovada pelo Josemar em 07/10. Vídeo em inglês (júri internacional); jogo bilíngue.
