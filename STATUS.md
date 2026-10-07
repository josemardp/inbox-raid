# STATUS: INBOX RAID

Atualizado: 07/10/2026, ~13:25 (quarta, dia 3 do Hackyard).
**Onde paramos:** **Speedrun ENTREGUE** em 07/10 ~13:23 (aparece na página da Yard #4 como @josemardp). Vídeo público no YouTube: https://youtu.be/3pmce3kaHck (canal "Melinda Show" da conta lojadares, por escolha do Josemar). Jogo com visual V2, bilíngue e som novo (sem chiado).
**Para retomar:** ler este arquivo. Próximo passo: decidir se melhora algo para a entrega final (sexta 09/10 15:00); reenviar substitui a entrega atual.

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
- **Arquivo:** `C:\Users\pc\Downloads\inbox-raid-demo-video.mp4` (1:46, 1920x1080, 30 fps, som do jogo). Só nesta máquina (notebook atual); não vai para o git (21 MB).
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

## Próximo passo
1. Até sexta 09/10 15:00 (meta 12:00): entrega final. A atual já vale; reenviar só se houver melhoria (ideias: legenda "194 real emails" em vez de "in my inbox", GIF do modo real no README).
2. Pendente sem pressa: os scripts de restaurar/limpar a caixa e o plano da partida estão só em  desta máquina.

## Decisões e dados fixos
- Plano completo: [docs/PLANO.md](docs/PLANO.md).
- Google Cloud: projeto `inbox-raid-510712`, cliente OAuth público em teste. Testadoras: josemardp e lojadares.
- Prazos (Brasília): Speedrun qua 07/10 15:00; entrega final sex 09/10 15:00 (meta: 12:00).
- Visual: V2 aprovada pelo Josemar em 07/10. Vídeo em inglês (júri internacional); jogo bilíngue.
