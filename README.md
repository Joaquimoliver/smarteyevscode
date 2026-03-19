# 📷 SmartEye — Sistema de Câmera de Segurança com Tablet

Transforme um tablet antigo em uma câmera de segurança inteligente usando tecnologias web modernas.

---

## 🗂️ Estrutura do Projeto

```
smarteye/
├── server/                 ← Servidor Node.js
│   ├── server.js           ← Lógica principal (Express + Socket.io)
│   └── package.json        ← Dependências
│
├── client-camera/          ← PWA instalável no tablet
│   ├── index.html          ← App da câmera (captura + detecção)
│   ├── manifest.json       ← Manifest PWA (instalação)
│   └── sw.js               ← Service Worker (cache offline)
│
├── dashboard/              ← Painel de monitoramento
│   └── index.html          ← Dashboard completo (vídeo + alertas + logs)
│
└── README.md               ← Este arquivo
```

---

## ⚙️ Pré-requisitos

- **Node.js** v16 ou superior → https://nodejs.org
- Tablet e computador na **mesma rede Wi-Fi**
- Navegador **Chrome** (recomendado) no tablet

---

## 🚀 Instalação e Execução

### 1. Instalar dependências do servidor

```bash
cd smarteye/server
npm install
```

### 2. Iniciar o servidor

```bash
npm start
```

Você verá no terminal:

```
╔══════════════════════════════════════╗
║     SmartEye - Servidor Iniciado     ║
╠══════════════════════════════════════╣
║  Porta: 3000                         ║
║                                      ║
║  Acesso local:                       ║
║  http://localhost:3000/dashboard     ║
║  http://192.168.1.10:3000/dashboard  ║
║                                      ║
║  Câmera (tablet):                    ║
║  http://192.168.1.10:3000/camera     ║
╚══════════════════════════════════════╝
```

### 3. Abrir o Dashboard (no computador ou TV)

Acesse no navegador:
```
http://localhost:3000/dashboard
```
ou pelo IP da rede:
```
http://192.168.1.10:3000/dashboard
```

### 4. Configurar o Tablet (câmera)

1. No tablet, abra o **Chrome**
2. Acesse a URL mostrada no terminal:
   ```
   http://192.168.1.10:3000/camera
   ```
3. Toque em **"INICIAR CÂMERA"**
4. Aceite a permissão de câmera quando solicitado
5. O tablet começa a transmitir imediatamente!

> 💡 **Dica PWA:** No Chrome Android, toque nos 3 pontos → "Adicionar à tela inicial" para instalar como app.

---

## 🔍 Como funciona (explicação simples)

```
TABLET (câmera)
    │
    │  1. Captura frame do vídeo via Canvas
    │  2. Compara com frame anterior (detecção de movimento)
    │  3. Converte para JPEG Base64
    │  4. Envia via WebSocket
    ▼
SERVIDOR (Node.js)
    │
    │  5. Recebe o frame
    │  6. Repassa para todos os dashboards conectados
    │  7. Guarda logs de eventos
    ▼
DASHBOARD (monitoramento)
    │
    │  8. Recebe frame e exibe no elemento <img>
    │  9. Mostra alertas de movimento
    │  10. Atualiza log de eventos em tempo real
```

---

## 🎯 Funcionalidades

| Funcionalidade         | Onde acontece      | Descrição                                          |
|------------------------|--------------------|----------------------------------------------------|
| Streaming de vídeo     | Tablet → Servidor → Dashboard | Frames JPEG via WebSocket (5 FPS) |
| Detecção de movimento  | Tablet (cliente)   | Comparação pixel-a-pixel entre frames              |
| Alerta visual          | Dashboard          | Banner + borda vermelha + som                      |
| Snapshot automático    | Tablet → Servidor  | Captura JPEG quando detecta movimento              |
| Log de eventos         | Dashboard          | Histórico com timestamp de todos os eventos        |
| Status de câmeras      | Dashboard          | Online/Offline em tempo real                       |
| Multi-câmera           | Dashboard          | Suporte a múltiplos tablets simultâneos            |
| Wake Lock              | Tablet             | Evita que a tela do tablet apague                  |
| PWA installável        | Tablet             | Instala como app nativo no Android                 |

---

## 🔧 Configurações (ajuste conforme necessário)

No arquivo `client-camera/index.html`, procure o objeto `CONFIG`:

```javascript
const CONFIG = {
  FRAME_INTERVAL_MS: 200,    // Intervalo entre frames (200ms = ~5 FPS)
                             // Reduza para mais fluidez (ex: 100ms = ~10 FPS)
                             // Aumente para economizar banda (ex: 500ms = 2 FPS)

  FRAME_QUALITY: 0.5,        // Qualidade JPEG dos frames (0.1 a 1.0)
                             // 0.5 = bom equilíbrio qualidade/velocidade

  FRAME_WIDTH: 640,          // Largura do frame capturado
  FRAME_HEIGHT: 480,         // Altura do frame capturado

  MOTION_THRESHOLD: 30,      // Sensibilidade da detecção (0-255)
                             // Menor = mais sensível | Maior = menos sensível

  MOTION_MIN_PIXELS: 500,    // Mínimo de pixels alterados para alertar
                             // Aumente para ignorar pequenos movimentos

  MOTION_COOLDOWN_MS: 3000,  // Tempo mínimo entre alertas (ms)

  SNAPSHOT_QUALITY: 0.85,    // Qualidade do snapshot de alerta (mais alta)
};
```

---

## 🌐 Rotas da API REST

| Método | URL              | Descrição                          |
|--------|------------------|------------------------------------|
| GET    | `/`              | Redireciona para o dashboard       |
| GET    | `/dashboard`     | Painel de monitoramento            |
| GET    | `/camera`        | App da câmera (para o tablet)      |
| GET    | `/api/status`    | Status do servidor (JSON)          |
| GET    | `/api/cameras`   | Lista de câmeras conectadas (JSON) |
| GET    | `/api/events`    | Histórico de eventos (JSON)        |

---

## 📡 Eventos WebSocket

### Tablet → Servidor
| Evento             | Dados                                      |
|--------------------|--------------------------------------------|
| `camera:register`  | `{ name: "Câmera 01" }`                    |
| `camera:frame`     | `{ frame: "data:image/jpeg;base64,..." }`  |
| `camera:motion`    | `{ intensity: 42, snapshot: "..." }`       |
| `ping`             | — (keep-alive)                             |

### Servidor → Dashboard
| Evento             | Dados                                      |
|--------------------|--------------------------------------------|
| `cameras:update`   | Array de câmeras conectadas                |
| `events:history`   | Array de eventos anteriores                |
| `frame:new`        | `{ cameraId, frame, timestamp }`           |
| `event:new`        | Objeto de evento (motion/online/offline)   |
| `motion:alert`     | `{ cameraId, cameraName, intensity, snapshot }` |

---

## 🚀 Como evoluir (próximos passos)

### 1. Adicionar IA com TensorFlow.js
```html
<!-- No cliente, adicione: -->
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd"></script>
```
```javascript
// Detecta objetos específicos (pessoas, animais, carros)
const model = await cocoSsd.load();
const predictions = await model.detect(captureCanvas);
if (predictions.some(p => p.class === 'person')) {
  triggerMotionAlert(100); // Alerta apenas para pessoas!
}
```

### 2. Notificações reais (Push API)
```javascript
// Solicitar permissão
await Notification.requestPermission();

// Enviar notificação quando detectar movimento
new Notification('SmartEye — Movimento detectado!', {
  body: `Câmera: ${cameraName}`,
  icon: '/camera/icon.png'
});
```

### 3. Notificações por WhatsApp/Telegram
Use serviços como **Twilio** (WhatsApp) ou **Telegram Bot API**:
```javascript
// No servidor, ao receber camera:motion:
await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
  method: 'POST',
  body: JSON.stringify({
    chat_id: CHAT_ID,
    photo: snapshot,
    caption: `⚠️ Movimento detectado em ${cameraName}`
  })
});
```

### 4. Deploy online (Render / Railway / Heroku)
```bash
# Criar Procfile
echo "web: node server/server.js" > Procfile

# Fazer deploy
git init && git add . && git commit -m "SmartEye deploy"
# Conectar ao Render.com ou Railway.app
```

### 5. Gravar vídeo no servidor
```javascript
// No servidor, acumular frames e usar FFmpeg:
const ffmpeg = require('fluent-ffmpeg');
// Salvar frames como imagens e converter em MP4
```

### 6. Autenticação no dashboard
```javascript
// Adicionar autenticação básica no Express:
app.use('/dashboard', (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Basic ' + btoa('admin:senha')) {
    res.set('WWW-Authenticate', 'Basic realm="SmartEye"');
    return res.status(401).send('Acesso negado');
  }
  next();
});
```

---

## ❓ Solução de Problemas

**A câmera não abre no tablet:**
- Verifique se o Chrome tem permissão de câmera (Configurações → Privacidade)
- Tente usar HTTPS (navegadores modernos às vezes exigem para `getUserMedia`)

**O tablet não conecta ao servidor:**
- Confirme que tablet e computador estão na mesma rede Wi-Fi
- Verifique se o firewall do computador bloqueia a porta 3000
- Use o IP correto mostrado no terminal do servidor

**Vídeo travando ou lento:**
- Aumente `FRAME_INTERVAL_MS` (ex: 500ms para 2 FPS)
- Reduza `FRAME_QUALITY` (ex: 0.3)
- Reduza `FRAME_WIDTH` e `FRAME_HEIGHT`

**Muitos falsos alertas de movimento:**
- Aumente `MOTION_THRESHOLD` (ex: 50 ou 70)
- Aumente `MOTION_MIN_PIXELS` (ex: 2000)
- Aumente `MOTION_COOLDOWN_MS` (ex: 5000)

---

## 📄 Licença

MIT — Use, modifique e distribua livremente.
