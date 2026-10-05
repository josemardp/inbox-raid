# INBOX RAID: plano de campanha (Hackyard Yard #4, Gamification)

> "Every enemy you kill is an email that really leaves your inbox."

## Regras confirmadas (e-mail oficial do Hackyard, 02 e 03/10)
- Solo, qualquer IA. Código escrito só de seg 05/10 15:00 até sex 09/10 15:00 (Brasília).
- Entrega: repositório open source + vídeo de demo. Vagas: 50. Ficha do Josemar: spot #37.
- Speedrun badge: entregar até qua 07/10 15:00.
- **Quem decide é o voto da comunidade.** A votação abre sex 15:00 e o campeão sai dom 11/10 19:00.
- Prêmio: US$ 100 / 50 / 30 + moletom único para o campeão.
- [VERIFICAR no kickoff] dá para atualizar a entrega depois do Speedrun? Onde se vota e quem vota?

## Por que este projeto ganha
1. **Não tem como trapacear:** o golpe é a própria tarefa. O app de hábitos comum (marcar que fez) não prova nada; aqui cada ação mexe no Gmail de verdade.
2. **Gancho de 5 segundos no vídeo:** contador da caixa despencando até 0, com explosão de fliperama.
3. **Útil de verdade:** chefão = remetente em massa. O Gmail não mostra bem "quem mais me enche"; o jogo mostra e acaba com ele de uma vez (arquivar tudo + descadastrar).
4. **Jogável em 10 segundos:** Modo Demo sem login, para qualquer votante.
5. **Privacidade como argumento:** roda 100% no navegador, sem servidor. Os e-mails nunca saem da máquina do jogador.

## O jogo
### Partida = uma "raid" na caixa de entrada
1. **Scan:** lê os e-mails da caixa (só remetente, assunto, data e cabeçalho de descadastro).
2. **Fase 1, Boss Rush:** remetentes com 3+ e-mails viram chefões. Vida (HP) = nº de e-mails. Ordem: do maior para o menor.
   - `A` Arquivar tudo (golpe pesado)
   - `U` Descadastrar + arquivar tudo (golpe crítico, x2 pontos, o chefão "morre para sempre")
   - `D` Lixeira em tudo
   - `S` Poupar (vira aliado, sai da raid)
   - Demorou mais de 10s, o chefão ataca: barra de estresse sobe.
3. **Fase 2, Horda:** e-mails avulsos, um cartão por vez.
   - `←` arquivar · `↓` lixeira · `→` virar missão (estrela) · `↑` abrir no Gmail
   - Decisão em menos de 2s sobe o combo (x2, x3, x5).
4. **Fase 3, Missões:** os e-mails com estrela viram o diário de missões, ou seja, o que precisa de resposta de verdade. O jogo não finge que responde por você.
5. **STAGE CLEAR:** e-mails resolvidos, chefões abatidos, descadastros, tempo, pontuação. Cartão PNG para compartilhar. Sequência de dias salva no navegador.

### Segurança (para o jurado confiar)
- Nunca apaga definitivo: só arquivo ou lixeira (recuperável por 30 dias).
- `Ctrl+Z` desfaz a última ação no Gmail.
- **Modo privacidade:** esconde nome e assunto de remetentes pessoais e mostra só empresas e newsletters. Permite gravar e transmitir sem expor ninguém.

### Duas portas
- **Demo:** caixa fictícia com ~60 e-mails engraçados e 6 chefões. Mesmo motor, sem login.
- **Real (Gmail):** login Google no navegador. App em modo de teste (só contas cadastradas), por isso o votante joga a Demo e o vídeo mostra o Real.

## Google Cloud (configurado em 05/10 antes do kickoff, sem código)
- Projeto: `inbox-raid-510712` (conta josemardp). Gmail API ativada.
- Tela de permissão: "Inbox Raid", público Externo, status Testando.
- Testadores: josemardp@gmail.com, lojadares@gmail.com.
- Cliente OAuth "Inbox Raid Web" (público, vai no código):
  `653389391490-ilem4mi1lhkd76ta36ct5i8sob5bbuld.apps.googleusercontent.com`
- Origens autorizadas: `https://josemardp.github.io` e `http://localhost:5173`.
- A chave secreta do cliente não é usada (fluxo de token no navegador) e não foi guardada.

## Decisões técnicas
- Site estático: Vite + TypeScript, DOM + CSS para cartões e canvas para partículas. Sem framework pesado.
- Gmail API direto do navegador com Google Identity Services. Escopo `gmail.modify` (sem exclusão definitiva). Token só em memória.
- Ações em lote: `messages.batchModify` (até 1000 por chamada), então um chefão cai num golpe só.
- Descadastro: cabeçalho `List-Unsubscribe`. Com one-click (RFC 8058), POST direto; com `mailto`, envio pelo Gmail; só com link, abre em nova aba. [TESTAR cada caso]
- Som: ZzFX (efeitos gerados por código, MIT). Fonte: Press Start 2P (OFL).
- Deploy: GitHub Pages por Actions, no repositório `josemardp/inbox-raid` (público, licença MIT).
- Interface em inglês (votação internacional).

## Vídeo (60s, sem narração, legenda em inglês + chiptune)
| Tempo | Cena |
|---|---|
| 0-5s | Gmail real: contador alto. Legenda: "I hate email. So I turned it into a raid." |
| 5-12s | Tela título INBOX RAID, scan, chefões aparecendo com HP |
| 12-35s | Boss Rush: descadastro crítico, explosões, contador do Gmail no canto despencando |
| 35-48s | Horda com combo x5 |
| 48-55s | STAGE CLEAR + volta ao Gmail real: **0** |
| 55-60s | "Every enemy you kill is an email that really leaves your inbox." + link |

- Regra de ouro: **não limpar a caixa escolhida antes de gravar.** A primeira partida real é a gravação.
- Gravação: captura de tela com ffmpeg. Edição por script (ffmpeg). Josemar joga, Claude grava e edita.

## Cronograma (horário de Brasília)
| Quando | Entrega | Tempo do Josemar |
|---|---|---|
| Seg até 15:00 | Plano, Google Cloud configurado, ffmpeg instalado, caixa do vídeo escolhida. Nenhum código | 5 min (aprovar) |
| Seg 15:00 | Repositório criado, 1º commit = este plano | - |
| Seg noite | **M1:** Modo Demo jogável de ponta a ponta, com sons, no ar | 10 min (jogar e opinar) |
| Ter | **M2:** Gmail real (scan, chefões, arquivar, lixeira, desfazer, descadastro, privacidade), testado numa caixa secundária | 15 min (testar) |
| Ter noite | Gravação da partida real na caixa do vídeo | 20 min |
| Qua até 12:00 | **M3 = Speedrun:** README com GIF, vídeo v1, entrega feita até 15:00 | 5 min (aprovar envio) |
| Qui | Acabamento: tremor de tela, cartão de compartilhamento, sequência de dias, vídeo final | 10 min |
| Sex até 12:00 | Entrega final (3h de folga) | 5 min (aprovar envio) |
| Sex 15:00 a dom 19:00 | Votação: divulgar o link | o quanto quiser |

## Riscos e contramedidas
| Risco | Contramedida |
|---|---|
| Tela "app não verificado" do Google | Normal em modo de teste; contas do Josemar cadastradas como testadoras |
| Descadastro falhar em algum remetente | Cai para "abrir link"; nunca trava a partida |
| Pouco tempo do Josemar (CAO) | Claude constrói sozinho; ele só testa, joga a gravação e aprova os envios |
| Questionar "código antes do kickoff" | Repositório nasce às 15:00; histórico de commits prova a data |
| Expor dado de terceiro no vídeo | Modo privacidade ligado na gravação; nunca o e-mail funcional da PM |
