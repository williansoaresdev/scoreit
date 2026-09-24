# ScoreIt

Jogo de basquete multiplayer online controlado por movimento. Os jogadores
balançam o celular pra arremessar 10 lances livres e disputam a pontuação
com todo mundo que estiver na mesma quadra, em tempo real.

- **Frontend**: PWA em HTML/CSS/JS puros (`/public`) — sem framework, sem build.
- **Backend**: Node.js + [`ws`](https://github.com/websockets/ws) (servidor WebSocket) em `/server`, servido junto com o frontend estático por uma única aplicação Express.
- **Hospedagem**: pensado pro [Render](https://render.com) (`render.yaml` já incluso).

Este README explica o projeto com calma, como se você estivesse vendo pela
primeira vez — principalmente a parte de **WebSockets**, que é o coração do
multiplayer.

## Rodando localmente

```bash
npm install
npm start
```

Abra `http://localhost:3000` no celular (mesma rede Wi-Fi do computador) ou
num navegador desktop. O sensor de movimento (`DeviceMotion`) só funciona em
um **contexto seguro** (HTTPS) em celulares de verdade — `localhost` é uma
exceção, então testar localmente funciona em HTTP puro, mas depois de
publicado o jogo precisa estar em HTTPS (o Render já entrega isso pronto).

Pra testar o multiplayer sem precisar de dois celulares, abra duas abas do
navegador na mesma URL de quadra — nesse caso o arremesso usa o modo de
"deslizar o dedo" (fallback de toque) em vez do movimento real do aparelho.

## Como o projeto é organizado

```
scoreit/
├── server/
│   ├── index.js     # servidor Express + WebSocket (o "backend")
│   └── rooms.js      # regras de quadras e jogadores (em memória)
└── public/            # tudo que o navegador baixa e executa (o "frontend")
    ├── index.html     # as telas do jogo (splash, personagem, quadra...)
    ├── manifest.json  # metadados do PWA (nome, ícone, cor do tema)
    ├── service-worker.js  # cache offline básico do PWA
    ├── css/style.css
    └── js/
        ├── network.js  # abre e gerencia a conexão WebSocket com o servidor
        ├── app.js       # o "cérebro": troca de telas, estado do jogo, HUD
        ├── motion.js    # lê o sensor de movimento (ou o toque) e vira um arremesso
        ├── audio.js     # efeitos sonoros sintetizados (sem arquivos de áudio)
        └── avatar.js    # desenha os personagens em SVG
```

## Entendendo o Backend (Node.js)

O backend é um único processo Node.js que faz **duas coisas ao mesmo tempo**
na mesma porta:

1. **Serve os arquivos estáticos** do jogo (`public/`) via Express — é o que
   acontece quando o navegador pede `GET /index.html`, `GET /js/app.js`, etc.
   Isso é HTTP normal, sem novidade nenhuma.
2. **Aceita conexões WebSocket** no caminho `/ws` — é aqui que mora toda a
   lógica de multiplayer, e é o que vamos destrinchar agora.

Veja em [server/index.js](server/index.js):

```js
const server = http.createServer(app);              // servidor HTTP normal
const wss = new WebSocketServer({ server, path: '/ws' }); // "escuta" em cima dele
```

O servidor WebSocket **compartilha a mesma porta** do Express. Quando chega
uma requisição pedindo para "virar" um WebSocket (isso se chama *upgrade*),
o `wss` assume; todo o resto continua sendo tratado pelo Express normalmente.

### O que é WebSocket, e por que não HTTP comum?

Numa requisição HTTP tradicional, o navegador **pergunta** e o servidor
**responde uma vez só** — depois disso, a conexão se encerra. Isso é ótimo
pra carregar uma página, mas péssimo pra um jogo em tempo real: se o
servidor precisar avisar "um jogador novo entrou na quadra!", ele não tem
como "empurrar" essa informação pro navegador sem que o navegador pergunte
primeiro (o jeito antigo de resolver isso era ficar perguntando de novo a
cada 1 segundo, o famoso *polling* — funciona, mas é lento e desperdiça
recursos).

O **WebSocket** resolve isso abrindo uma conexão que fica **aberta o tempo
todo** (não é "pergunta e resposta", é uma linha telefônica que continua
conectada). Depois que a conexão é estabelecida:

- O **cliente** (navegador) pode mandar mensagens pro servidor a qualquer momento.
- O **servidor** pode mandar mensagens pro cliente a qualquer momento, sem
  precisar esperar ser perguntado.

É exatamente esse "o servidor pode falar primeiro" que permite avisar todo
mundo na quadra em tempo real quando alguém entra, sai ou pontua.

### O protocolo: mensagens JSON

Cada jogador mantém **uma conexão WebSocket** aberta com o servidor, em
`/ws`. Por essa conexão trafegam mensagens de texto simples, formatadas como
JSON, com um campo `type` dizendo do que se trata:

| Cliente → Servidor | Dados enviados | Servidor → Cliente | Dados recebidos |
|---|---|---|---|
| `create_room` | `{ name, character }` | `joined` | `{ roomId, selfId, players[] }` |
| `join_room` | `{ roomId, name, character }` | `room_update` | `{ players[] }` |
| `shot` | `{ made }` | `error` | `{ message }` |
| `leave_room` | `{}` | | |

Por exemplo, quando você aperta "Create a Court" no app, o frontend manda:

```json
{ "type": "create_room", "name": "Alex", "character": "boy_dark" }
```

E o servidor responde só pra você:

```json
{ "type": "joined", "roomId": "TBZHGK", "selfId": "aB3xQ2z1", "players": [...] }
```

### Salas (rooms) e "broadcast" — o pulo do gato

A parte mais importante pra quem tá aprendendo WebSocket é essa: **o
servidor mantém uma lista de todas as conexões abertas** (`wss.clients`), e
cada conexão é só um objeto JavaScript onde a gente pode **pendurar dados
extras**. Em [server/index.js](server/index.js), assim que um jogador cria
ou entra numa sala, fazemos isso:

```js
ws.roomId = room.id;      // "etiqueta" essa conexão com o ID da quadra
ws.playerId = player.id;  // e com o ID do jogador
```

Isso não é nenhuma mágica do WebSocket — é só guardar um valor num objeto
JavaScript comum. Mas é o suficiente pra implementar salas: quando algo
muda numa quadra (um jogador entrou, arremessou, etc.), o servidor
**percorre todas as conexões abertas e manda a mensagem só pras que têm a
mesma etiqueta `roomId`**:

```js
function broadcastRoom(room, message) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && client.roomId === room.id) {
      client.send(payload); // "empurra" a mensagem pro navegador desse jogador
    }
  }
}
```

Isso se chama **broadcast** (transmissão): uma mensagem, vários
destinatários. É assim que, quando um segundo jogador entra na quadra, o
primeiro jogador vê a lista de jogadores atualizar sozinha na tela, sem
precisar recarregar nada.

O estado de cada quadra (quem está nela, pontuação, quantos arremessos cada
um já deu) fica guardado **na memória do processo Node.js**, organizado em
[server/rooms.js](server/rooms.js):

```js
class RoomManager {
  constructor() {
    this.rooms = new Map(); // "ABC123" -> Room
  }
}

class Room {
  constructor(id) {
    this.players = new Map(); // playerId -> { name, character, score, shots, finished }
  }
}
```

Ou seja: um `Map` de salas, e cada sala é um `Map` de jogadores. Nada de
banco de dados — é só isso. Isso é simples e rápido, mas tem uma
consequência importante: **se o servidor reiniciar (ou o Render "dormir" o
serviço no plano grátis), todas as quadras ativas são perdidas.** Pra um
jogo casual entre amigos, tudo bem; pra um sistema sério, o próximo passo
seria guardar esse estado em algo como Redis.

### Passo a passo de uma partida (do ponto de vista do WebSocket)

1. Jogador A abre o app → o navegador dele abre uma conexão `new
   WebSocket('wss://.../ws')` → o servidor recebe o evento `connection`.
2. Jogador A manda `create_room` → servidor cria a sala, etiqueta a conexão
   dele com `roomId`, responde `joined` só pra ele.
3. Jogador B abre o link `?room=TBZHGK` → conecta no WebSocket → manda
   `join_room` com esse ID → servidor etiqueta a conexão dele também →
   responde `joined` só pro B, **e manda `room_update` (broadcast) pra
   todo mundo na sala, inclusive o A** → é assim que o A vê o B aparecer
   na lista sem fazer nada.
4. Cada arremesso manda `shot` → servidor atualiza a pontuação → broadcast
   de `room_update` de novo → todo mundo vê o placar mudar ao vivo.
5. Se alguém fecha o app/aba, o evento `close` do WebSocket dispara no
   servidor → ele remove o jogador da sala e avisa o resto (broadcast).

### E do lado do navegador?

O arquivo [public/js/network.js](public/js/network.js) é só uma casquinha
fina em volta da API nativa `WebSocket` do navegador, pra deixar o resto do
código mais organizado:

```js
this.ws = new WebSocket(url);
this.ws.addEventListener('message', (evt) => {
  const data = JSON.parse(evt.data);
  // chama quem "assinou" esse tipo de mensagem, ex: net.on('room_update', fn)
});
```

Em vez de espalhar `if (data.type === 'room_update')` por todo canto, o
resto do app simplesmente escreve `net.on('room_update', (data) => {...})`
uma vez e pronto — parecido com `addEventListener`, mas pros nossos próprios
tipos de mensagem.

## Entendendo o Frontend

O frontend é um PWA (Progressive Web App) — ou seja, um site que se comporta
como um app instalável, mas é só HTML/CSS/JS rodando no navegador. Não tem
build step (Webpack, Vite, etc.): os arquivos em `public/` são exatamente o
que o navegador recebe.

- **Telas**: todas as "telas" do jogo (splash, escolher personagem, criar
  quadra, quadra, resultado) já existem juntas no [index.html](public/index.html)
  como `<section class="screen">` escondidas — o [app.js](public/js/app.js)
  só troca qual delas tem a classe `is-active` visível. Não tem navegação de
  verdade (sem trocar de URL/página), é tudo uma única página.
- **Estado do jogo**: um objeto `state` simples dentro do `app.js` guarda
  nome, personagem escolhido, ID da quadra, pontuação, quantos arremessos já
  foram dados, etc.
- **Arremesso**: [motion.js](public/js/motion.js) é uma abstração de
  entrada — ele escuta tanto o evento `devicemotion` (sensor real do
  celular) quanto um gesto de arrastar o dedo na tela (funciona em
  desktop/sem sensor), e converte qualquer um dos dois no mesmo formato:
  `{ power, lateral }` (força do arremesso e o quanto saiu do eixo). Assim,
  o resto do jogo nunca precisa saber qual dos dois disparou o arremesso.
- **Acerto ou erro**: existe uma "força ideal" escondida
  (`IDEAL_POWER`/`POWER_TOLERANCE`/`LATERAL_TOLERANCE` em `app.js`) — se a
  força e a direção do arremesso caem dentro dessa margem de tolerância, é
  cesta; senão, é erro. Dá pra ajustar esses números pra deixar o jogo mais
  fácil ou mais difícil.
- **Sons**: [audio.js](public/js/audio.js) gera todos os efeitos sonoros na
  hora, usando a Web Audio API (osciladores e ruído filtrado) — não existe
  nenhum arquivo `.mp3`/`.wav` no projeto.
- **Personagens**: [avatar.js](public/js/avatar.js) desenha os 4
  personagens em SVG puro, gerado por código. As imagens de referência em
  `/assets` são capturas de tela de um jogo comercial de terceiros
  (Basketball Stars) — usadas só como inspiração de layout (visão de
  costas, bola nas mãos, cesta ao fundo), não fazem parte do jogo.

## Sobre o jogo

- Até **30 jogadores** por quadra, **10 arremessos** cada, **3 pontos** por cesta.
- Máximo de 16 caracteres pro nome do jogador.
- O link de compartilhamento (`?room=XXXXXX`) faz quem clica cair direto na
  seleção de personagem e, na sequência, direto pra quadra — sem passar pela
  tela de criar/entrar em quadra.

## Publicando no Render

1. Suba este repositório pro GitHub.
2. No Render, clique em **New +** → **Blueprint** e aponte pro repositório —
   ele lê o [render.yaml](render.yaml) e cria o serviço web sozinho (Node,
   plano grátis, `npm install` / `npm start`).
   - Alternativa: criar um **Web Service** manualmente com os mesmos comandos.
3. O Render já entrega HTTPS automaticamente, o que é obrigatório pro sensor
   de movimento funcionar em celulares de verdade.
4. Compartilhe a URL publicada (ou o link de uma quadra, `?room=XXXX`) com
   os amigos.
5. Todo `git push` na branch `main` dispara um novo deploy automático.

## Limitações conhecidas / próximos passos

- O Safari do iOS exige um toque explícito pra liberar a permissão do
  sensor de movimento — é a tela "Enable Motion Controls" que aparece na
  primeira vez que se entra numa quadra.
- Não existe reconexão automática: se a conexão WebSocket de alguém cair no
  meio do jogo, essa pessoa precisa entrar de novo como um jogador novo.
- Sem anti-cheat: é o próprio celular do jogador que informa se o arremesso
  foi cesta ou erro. Tranquilo pra jogar casualmente com amigos; pra
  qualquer coisa competitiva de verdade, precisaria validar o arremesso no
  servidor.
- Estado 100% em memória: um redeploy, reinício ou o serviço "dormindo" no
  plano grátis do Render apaga todas as quadras ativas.
