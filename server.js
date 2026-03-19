/**
 * SmartEye - Servidor Principal
 * Node.js + Express + Socket.io
 *
 * Responsabilidades:
 *  - Servir os arquivos estáticos (cliente e dashboard)
 *  - Receber frames de vídeo do tablet via WebSocket
 *  - Repassar frames e eventos para o dashboard
 *  - Gerenciar estado de câmeras conectadas
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// ─── Configuração ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = http.createServer(app);

// Socket.io com CORS aberto para rede local
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  // Aumentar limite para transmissão de frames Base64
  maxHttpBufferSize: 5e6, // 5 MB
});

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos
app.use("/camera", express.static(path.join(__dirname, "../client-camera")));
app.use("/dashboard", express.static(path.join(__dirname, "../dashboard")));

// ─── Estado Global ────────────────────────────────────────────────────────────
/**
 * cameras: Map de câmeras conectadas
 * { socketId → { id, name, connectedAt, status, lastFrame, lastMotion } }
 */
const cameras = new Map();

/**
 * eventLog: histórico de eventos (máx. 100)
 */
const eventLog = [];
const MAX_LOG = 100;

function addEvent(type, cameraId, data = {}) {
  const event = {
    id: Date.now() + Math.random().toString(36).slice(2),
    type,      // 'camera_online' | 'camera_offline' | 'motion' | 'snapshot'
    cameraId,
    timestamp: new Date().toISOString(),
    ...data,
  };
  eventLog.unshift(event);
  if (eventLog.length > MAX_LOG) eventLog.pop();
  return event;
}

// ─── Rotas REST ───────────────────────────────────────────────────────────────

// Status geral do servidor
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    cameras: cameras.size,
    events: eventLog.length,
  });
});

// Lista de câmeras conectadas
app.get("/api/cameras", (req, res) => {
  const list = Array.from(cameras.values()).map((c) => ({
    id: c.id,
    name: c.name,
    connectedAt: c.connectedAt,
    status: c.status,
    lastMotion: c.lastMotion,
  }));
  res.json(list);
});

// Histórico de eventos
app.get("/api/events", (req, res) => {
  res.json(eventLog);
});

// Rota raiz → redireciona para dashboard
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[WS] Novo cliente conectado: ${socket.id}`);

  // ── Registro de câmera ──────────────────────────────────────────────────
  socket.on("camera:register", (data) => {
    const camera = {
      id: socket.id,
      name: data.name || `Câmera ${cameras.size + 1}`,
      connectedAt: new Date().toISOString(),
      status: "online",
      lastFrame: null,
      lastMotion: null,
    };
    cameras.set(socket.id, camera);

    console.log(`[CAM] Câmera registrada: ${camera.name} (${socket.id})`);

    // Confirma para o tablet
    socket.emit("camera:registered", { id: camera.id, name: camera.name });

    // Notifica dashboards
    const event = addEvent("camera_online", camera.id, { name: camera.name });
    io.to("dashboards").emit("event:new", event);
    io.to("dashboards").emit("cameras:update", Array.from(cameras.values()));
  });

  // ── Registro de dashboard ───────────────────────────────────────────────
  socket.on("dashboard:register", () => {
    socket.join("dashboards");
    console.log(`[DASH] Dashboard conectado: ${socket.id}`);

    // Envia estado atual
    socket.emit("cameras:update", Array.from(cameras.values()));
    socket.emit("events:history", eventLog);
  });

  // ── Recebimento de frame de vídeo ──────────────────────────────────────
  // O tablet captura um frame do canvas e envia como Base64
  socket.on("camera:frame", (data) => {
    // data = { frame: "data:image/jpeg;base64,...", cameraId }
    const camera = cameras.get(socket.id);
    if (!camera) return;

    camera.lastFrame = data.frame;

    // Repassa para todos os dashboards com o ID da câmera
    io.to("dashboards").emit("frame:new", {
      cameraId: socket.id,
      frame: data.frame,
      timestamp: Date.now(),
    });
  });

  // ── Evento de movimento detectado ──────────────────────────────────────
  socket.on("camera:motion", (data) => {
    // data = { intensity: 0-100, snapshot: "data:image/jpeg;base64,..." }
    const camera = cameras.get(socket.id);
    if (!camera) return;

    camera.lastMotion = new Date().toISOString();

    console.log(`[MOTION] Câmera ${camera.name} detectou movimento! Intensidade: ${data.intensity}%`);

    const event = addEvent("motion", socket.id, {
      name: camera.name,
      intensity: data.intensity,
      snapshot: data.snapshot || null,
    });

    // Notifica dashboards com o evento completo
    io.to("dashboards").emit("event:new", event);
    io.to("dashboards").emit("motion:alert", {
      cameraId: socket.id,
      cameraName: camera.name,
      intensity: data.intensity,
      snapshot: data.snapshot,
      timestamp: event.timestamp,
    });
  });

  // ── Heartbeat (keep-alive) ─────────────────────────────────────────────
  socket.on("ping", () => socket.emit("pong"));

  // ── Desconexão ─────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    const camera = cameras.get(socket.id);
    if (camera) {
      console.log(`[CAM] Câmera desconectada: ${camera.name} — ${reason}`);
      cameras.delete(socket.id);

      const event = addEvent("camera_offline", socket.id, { name: camera.name, reason });
      io.to("dashboards").emit("event:new", event);
      io.to("dashboards").emit("cameras:update", Array.from(cameras.values()));
    } else {
      console.log(`[WS] Cliente desconectado: ${socket.id} — ${reason}`);
    }
  });
});

// ─── Inicialização ────────────────────────────────────────────────────────────
httpServer.listen(PORT, "0.0.0.0", () => {
  // Obtém IP local para facilitar acesso
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();
  const localIPs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) localIPs.push(net.address);
    }
  }

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║     SmartEye - Servidor Iniciado     ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║  Porta: ${PORT}                          ║`);
  console.log("║                                      ║");
  console.log("║  Acesso local:                       ║");
  console.log(`║  http://localhost:${PORT}/dashboard     ║`);
  localIPs.forEach((ip) => {
    console.log(`║  http://${ip}:${PORT}/dashboard  ║`);
  });
  console.log("║                                      ║");
  console.log("║  Câmera (tablet):                    ║");
  localIPs.forEach((ip) => {
    console.log(`║  http://${ip}:${PORT}/camera     ║`);
  });
  console.log("╚══════════════════════════════════════╝\n");
});
