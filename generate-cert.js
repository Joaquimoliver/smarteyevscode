/**
 * SmartEye — Gerador de Certificado SSL Auto-Assinado
 * Execute: node scripts/generate-cert.js
 *
 * Gera um certificado para uso em rede local (HTTPS)
 * Necessário para getUserMedia funcionar em dispositivos remotos.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const certsDir = path.join(__dirname, "../certs");

// Cria pasta certs se não existir
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

console.log("\n🔐 SmartEye — Gerando certificado SSL...\n");

// Detecta IP local
const { networkInterfaces } = require("os");
const nets = networkInterfaces();
const localIPs = [];
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === "IPv4" && !net.internal) localIPs.push(net.address);
  }
}

const subjectAltNames = [
  "IP:127.0.0.1",
  "DNS:localhost",
  ...localIPs.map((ip) => `IP:${ip}`),
].join(",");

const opensslConfig = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = SmartEye Local

[v3_req]
keyUsage = critical, digitalSignature, keyAgreement
extendedKeyUsage = serverAuth
subjectAltName = ${subjectAltNames}
`;

const configPath = path.join(certsDir, "openssl.conf");
fs.writeFileSync(configPath, opensslConfig);

try {
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${certsDir}/key.pem" ` +
    `-out "${certsDir}/cert.pem" -days 365 -nodes ` +
    `-config "${configPath}"`,
    { stdio: "inherit" }
  );

  console.log("\n✅ Certificado gerado com sucesso!");
  console.log(`   📁 ${certsDir}/key.pem`);
  console.log(`   📁 ${certsDir}/cert.pem`);
  console.log("\n⚠️  No Chrome/Android: vá em chrome://flags → 'Insecure origins'");
  console.log("   ou acesse a URL HTTPS e clique em 'Avançado → Prosseguir'");
  console.log("\n   IPs cobertos pelo certificado:");
  localIPs.forEach((ip) => console.log(`   → https://${ip}:3000`));
  console.log("");
} catch (err) {
  console.error("\n❌ OpenSSL não encontrado. Instale com:");
  console.error("   Windows: https://slproweb.com/products/Win32OpenSSL.html");
  console.error("   Linux:   sudo apt install openssl");
  console.error("   Mac:     brew install openssl\n");
  process.exit(1);
}
