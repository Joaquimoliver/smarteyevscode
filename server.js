/**
 * SmartEye v2.0 — Servidor Principal
 * ────────────────────────────────────
 * Melhorias desta versão:
 *  ✅ Suporte HTTPS (necessário para câmera em rede)
 *  ✅ Autenticação básica no dashboard via .env
 *  ✅ Configurações via variáveis de ambiente (.env)
 *  ✅ Persistência de eventos em arquivo JSON
 *  ✅ Middleware de segurança aprimorado
 *  ✅ Tratamento de erros robusto
 */

require("dotenv").config();

const express    = require("express");
const http       = require("http");
const https      = require("https");
const { Server } = require("socket.io");
const cors       = require("cors");
const path       = require("path");
const fs         = require("fs");

// ─── Configuração via .env ────────────────────────────────────────────────────
const PORT               = parseInt(process.env.PORT) || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "";
const SSL_KEY_PATH       = process.env.SSL_KEY_PATH || "./certs/key.pem";
const SSL_CERT_PATH      = process.env.SSL_CERT_PATH || "./certs/cert.pem";
const MAX_EVENTS         = parseInt(process.env.MAX_EVENTS) || 200;
const EVENTS_FILE        = process.env.EVENTS_FILE || "./data/events.json";

// ─── App Express ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── HTTPS ou HTTP dependendo dos certificados ────────────────────────────────
let server;
let protocol = "http";

if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
  try {
    const sslOptions = {
      key:  fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH),
    };
    server = https.createServer(sslOptions, app);
    protocol = "https";
    console.log("🔐 HTTPS ativado com certificado local.");
  } catch (err) {
    console.warn("⚠️  Erro ao carregar certificado SSL, usando HTTP:", err.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
  console.log("⚠️  Modo HTTP — câmera pode não funcionar no tablet fora do localhost.");
  console.log("   → Execute 'npm run setup-https' para ativar HTTPS.\n");
}

// ─── Socket.io ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 5e6, // 5 MB por mensagem (frames Base64)
});

// ─── Autenticação do dashboard ────────────────────────────────────────────────
function dashboardAuth(req, res, next) {
  if (!DASHBOARD_PASSWORD) return next(); // Sem senha configurada = acesso livre

  const authHeader = req.headers.authorization || "";
  const base64 = Buffer.from(`admin:${DASHBOARD_PASSWORD}`).toString("base64");

  if (authHeader === `Basic ${base64}`) return next();

  res.set("WWW-Authenticate", 'Basic realm="SmartEye Dashboard"');
  res.status(401).send(`
    <html><body style="font-family:monospace;background:#060b14;color:#00d4ff;
    display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center">
        <h2>🔐 SMARTEYE</h2>
        <p style="color:#8899bb">Autenticação necessária para acessar o dashboard.</p>
      </div>
    </body></html>
  `);
}

// ─── Rotas estáticas ──────────────────────────────────────────────────────────
app.use("/dashboard", dashboardAuth, express.static(path.join(__dirname, "../dashboard")));
app.use("/camera",    express.static(path.join(__dirname, "../client-camera")));

app.get("/", (req, res) => res.redirect("/dashboard"));

// ─── Estado global ────────────────────────────────────────────────────────────
const cameras  = new Map(); // socketId → camera object
const eventLog = [];        // array de eventos (em memória)

// ─── Persistência de eventos ──────────────────────────────────────────────────
function loadEvents() {
  if (!EVENTS_FILE) return;
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf-8"));
      eventLog.push(...data.slice(0, MAX_EVENTS));
      console.log(`📂 ${eventLog.length} eventos carregados de ${EVENTS_FILE}`);
    }
  } catch (err) {
    console.warn("⚠️  Erro ao carregar eventos:", err.message);
  }
}

function saveEvents() {
  if (!EVENTS_FILE) return;
  try {
    const dir = path.dirname(EVENTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Salva sem snapshots para economizar espaço
    const toSave = eventLog.map(({ snapshot, ...rest }) => rest);
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(toSave, null, 2));
  } catch (err) {
    console.warn("⚠️  Erro ao salvar eventos:", err.message);
  }
}

function addEvent(type, cameraId, data = {}) {
  const event = {
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    cameraId,
    timestamp: new Date().toISOString(),
    ...data,
  };
  eventLog.unshift(event);
  if (eventLog.length > MAX_EVENTS) eventLog.pop();
  saveEvents(); // persiste a cada novo evento
  return event;
}

// Carrega eventos salvos ao iniciar
loadEvents();

// ─── API REST ─────────────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    ok:       true,
    version:  "2.0.0",
    protocol,
    uptime:   Math.floor(process.uptime()),
    cameras:  cameras.size,
    events:   eventLog.length,
    auth:     !!DASHBOARD_PASSWORD,
  });
});

app.get("/api/cameras", (req, res) => {
  res.json(
    Array.from(cameras.values()).map(({ lastFrame, ...c }) => c)
  );
});

app.get("/api/events", (req, res) => {
  // Não retorna snapshots pela API (muito grandes)
  res.json(eventLog.map(({ snapshot, ...e }) => e));
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[WS] Conexão: ${socket.id} (${socket.handshake.address})`);

  // ── Câmera se registra ────────────────────────────────────────────────
  socket.on("camera:register", (data) => {
    const camera = {
      id:          socket.id,
      name:        (data.name || `Câmera ${cameras.size + 1}`).slice(0, 30),
      connectedAt: new Date().toISOString(),
      status:      "online",
      lastFrame:   null,
      lastMotion:  null,
      fps:         0,
      frameCount:  0,
    };
    cameras.set(socket.id, camera);
    console.log(`[CAM] ✅ Registrada: "${camera.name}" — ${socket.id}`);

    socket.emit("camera:registered", { id: camera.id, name: camera.name });

    const event = addEvent("camera_online", camera.id, { name: camera.name });
    io.to("dashboards").emit("event:new", event);
    io.to("dashboards").emit("cameras:update", getCameraList());
  });

  // ── Dashboard se registra ─────────────────────────────────────────────
  socket.on("dashboard:register", () => {
    socket.join("dashboards");
    socket.emit("cameras:update",  getCameraList());
    socket.emit("events:history",  eventLog.slice(0, 50)); // últimos 50
    console.log(`[DASH] Dashboard conectado: ${socket.id}`);
  });

  // ── Frame de vídeo ────────────────────────────────────────────────────
  socket.on("camera:frame", (data) => {
    const camera = cameras.get(socket.id);
    if (!camera) return;

    camera.lastFrame = data.frame;
    camera.frameCount++;

    io.to("dashboards").emit("frame:new", {
      cameraId:  socket.id,
      frame:     data.frame,
      timestamp: Date.now(),
    });
  });

  // ── Evento de movimento ───────────────────────────────────────────────
  socket.on("camera:motion", (data) => {
    const camera = cameras.get(socket.id);
    if (!camera) return;

    camera.lastMotion = new Date().toISOString();
    console.log(`[MOTION] 🚨 "${camera.name}" — intensidade: ${data.intensity}%`);

    const event = addEvent("motion", socket.id, {
      name:      camera.name,
      intensity: data.intensity,
      snapshot:  data.snapshot || null,
      manual:    data.manual || false,
    });

    io.to("dashboards").emit("event:new", event);
    io.to("dashboards").emit("motion:alert", {
      cameraId:   socket.id,
      cameraName: camera.name,
      intensity:  data.intensity,
      snapshot:   data.snapshot,
      timestamp:  event.timestamp,
    });
  });

  // ── Keep-alive ────────────────────────────────────────────────────────
  socket.on("ping", () => socket.emit("pong"));

  // ── Desconexão ────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    const camera = cameras.get(socket.id);
    if (camera) {
      console.log(`[CAM] ❌ Desconectada: "${camera.name}" — ${reason}`);
      cameras.delete(socket.id);
      const event = addEvent("camera_offline", socket.id, { name: camera.name });
      io.to("dashboards").emit("event:new", event);
      io.to("dashboards").emit("cameras:update", getCameraList());
    }
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCameraList() {
  return Array.from(cameras.values()).map(({ lastFrame, ...c }) => c);
}

// ─── Inicialização ────────────────────────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();
  const localIPs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) localIPs.push(net.address);
    }
  }

  const base = (ip) => `${protocol}://${ip}:${PORT}`;

  console.log("\n┌─────────────────────────────────────────┐");
  console.log("│     SmartEye v2.0 — Servidor Online     │");
  console.log("├─────────────────────────────────────────┤");
  console.log(`│  Protocolo : ${protocol.toUpperCase().padEnd(27)}│`);
  console.log(`│  Porta     : ${String(PORT).padEnd(27)}│`);
  console.log(`│  Autenticação: ${DASHBOARD_PASSWORD ? "✅ ATIVA".padEnd(25) : "⚠️  DESATIVADA".padEnd(23)}│`);
  console.log("├─────────────────────────────────────────┤");
  console.log("│  DASHBOARD                              │");
  console.log(`│  ${base("localhost") + "/dashboard"}`.padEnd(43) + "│");
  localIPs.forEach((ip) => {
    console.log(`│  ${(base(ip) + "/dashboard").padEnd(41)}│`);
  });
  console.log("├─────────────────────────────────────────┤");
  console.log("│  CÂMERA (tablet)                        │");
  localIPs.forEach((ip) => {
    console.log(`│  ${(base(ip) + "/camera").padEnd(41)}│`);
  });
  console.log("└─────────────────────────────────────────┘\n");
});

// Graceful shutdown
process.on("SIGTERM", () => { saveEvents(); process.exit(0); });
process.on("SIGINT",  () => { saveEvents(); process.exit(0); });
