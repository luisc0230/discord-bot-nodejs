const { Client } = require('discord.js');

// Variable para almacenar logs recientes
let recentLogs = [];
const MAX_LOGS = 50;

// Función para agregar logs
function addLog(level, message, data = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    data: data,
    id: Math.random().toString(36).substr(2, 9)
  };
  
  recentLogs.unshift(logEntry);
  if (recentLogs.length > MAX_LOGS) {
    recentLogs = recentLogs.slice(0, MAX_LOGS);
  }
  
  console.log(`[${level.toUpperCase()}] ${message}`, data || '');
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  addLog('info', 'Endpoint de logs accedido', { requestId: context.awsRequestId });

  try {
    // Verificar variables de entorno
    const envCheck = {
      DISCORD_TOKEN: {
        configured: !!process.env.DISCORD_TOKEN,
        length: process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.length : 0,
        preview: process.env.DISCORD_TOKEN ? 
          `${process.env.DISCORD_TOKEN.substring(0, 10)}...${process.env.DISCORD_TOKEN.substring(-10)}` : 
          'No configurado'
      },
      GOOGLE_SHEETS_WEBHOOK_URL: {
        configured: !!process.env.GOOGLE_SHEETS_WEBHOOK_URL,
        preview: process.env.GOOGLE_SHEETS_WEBHOOK_URL ? 
          `${process.env.GOOGLE_SHEETS_WEBHOOK_URL.substring(0, 30)}...` : 
          'No configurado'
      },
      DISCORD_LOG_CHANNEL_ID: {
        configured: !!process.env.DISCORD_LOG_CHANNEL_ID,
        value: process.env.DISCORD_LOG_CHANNEL_ID || 'No configurado'
      },
      URL: {
        configured: !!process.env.URL,
        value: process.env.URL || 'No configurado'
      }
    };

    // Información del sistema
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: Math.floor(process.uptime()),
      memoryUsage: process.memoryUsage(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString(),
      limaTime: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })
    };

    // Verificar conexión del bot (intentar obtener info del cliente global si existe)
    let botStatus = {
      connected: false,
      user: null,
      guilds: 0,
      lastReady: null,
      latency: null
    };

    // Intentar verificar estado del bot a través de start-bot
    try {
      const botUrl = `${process.env.URL || 'https://resilient-pudding-fd6b18.netlify.app'}/.netlify/functions/start-bot`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(botUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Logs-Checker/1.0' }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const botData = await response.json();
        botStatus = {
          connected: botData.status.includes('funcionando') || botData.status.includes('iniciado'),
          user: botData.user,
          guilds: botData.guilds || 0,
          lastCheck: new Date().toISOString(),
          status: botData.status
        };
        addLog('info', 'Estado del bot verificado', botStatus);
      }
    } catch (botError) {
      addLog('error', 'Error verificando estado del bot', { error: botError.message });
      botStatus.error = botError.message;
    }

    // Verificar Google Sheets (si está configurado)
    let sheetsStatus = { configured: false, working: false };
    if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      sheetsStatus.configured = true;
      try {
        const testData = {
          timestamp: new Date().toISOString(),
          usuario: 'test#0000',
          action: 'health_check',
          servidor: 'Logs Endpoint',
          canal: 'system-test'
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(process.env.GOOGLE_SHEETS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testData),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        
        if (response.ok) {
          const result = await response.json();
          sheetsStatus.working = result.result === 'success';
          sheetsStatus.response = result;
          addLog('info', 'Google Sheets verificado', { working: sheetsStatus.working });
        } else {
          sheetsStatus.error = `HTTP ${response.status}`;
          addLog('warn', 'Google Sheets no responde correctamente', { status: response.status });
        }
      } catch (sheetsError) {
        sheetsStatus.error = sheetsError.message;
        addLog('error', 'Error verificando Google Sheets', { error: sheetsError.message });
      }
    }

    // Información de diagnóstico
    const diagnostics = {
      dependencies: {
        'discord.js': require('discord.js').version || 'No detectado'
      },
      netlifyInfo: {
        region: process.env.AWS_REGION || 'Unknown',
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        requestId: context.awsRequestId,
        runtime: 'nodejs18.x'
      }
    };

    // Construir respuesta HTML para visualización web
    const htmlResponse = generateLogsHTML({
      envCheck,
      systemInfo,
      botStatus,
      sheetsStatus,
      diagnostics,
      recentLogs: recentLogs.slice(0, 20), // Solo últimos 20 logs
      timestamp: new Date().toISOString()
    });

    // Si es una petición API (Accept: application/json), devolver JSON
    const acceptHeader = event.headers?.accept || event.headers?.Accept || '';
    if (acceptHeader.includes('application/json')) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          status: 'Logs endpoint funcionando',
          envCheck,
          systemInfo,
          botStatus,
          sheetsStatus,
          diagnostics,
          recentLogs: recentLogs.slice(0, 10),
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId
        }, null, 2)
      };
    }

    // Respuesta HTML por defecto
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
      body: htmlResponse
    };

  } catch (error) {
    addLog('error', 'Error en endpoint de logs', { error: error.message, stack: error.stack });
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'Error en logs endpoint',
        error: error.message,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId
      })
    };
  }
};

function generateLogsHTML(data) {
  const { envCheck, systemInfo, botStatus, sheetsStatus, diagnostics, recentLogs, timestamp } = data;
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 Bot Discord - Logs y Diagnósticos</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', system-ui, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333; 
            line-height: 1.6; 
            min-height: 100vh;
            padding: 20px;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: rgba(255,255,255,0.95); 
            border-radius: 15px; 
            padding: 30px; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
        }
        h1 { 
            color: #2c3e50; 
            text-align: center; 
            margin-bottom: 30px; 
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        .grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .card { 
            background: white; 
            border-radius: 10px; 
            padding: 20px; 
            box-shadow: 0 5px 15px rgba(0,0,0,0.08);
            border-left: 4px solid #3498db;
            transition: transform 0.2s ease;
        }
        .card:hover { transform: translateY(-2px); }
        .card h3 { 
            color: #2c3e50; 
            margin-bottom: 15px; 
            display: flex; 
            align-items: center; 
            gap: 8px;
        }
        .status { 
            padding: 4px 8px; 
            border-radius: 20px; 
            font-size: 0.8em; 
            font-weight: bold; 
            text-transform: uppercase;
        }
        .status.success { background: #2ecc71; color: white; }
        .status.error { background: #e74c3c; color: white; }
        .status.warning { background: #f39c12; color: white; }
        .status.info { background: #3498db; color: white; }
        .code { 
            background: #f8f9fa; 
            padding: 10px; 
            border-radius: 5px; 
            font-family: 'Monaco', monospace; 
            font-size: 0.9em; 
            border: 1px solid #e9ecef;
            overflow-x: auto;
        }
        .logs { 
            background: #2c3e50; 
            color: #ecf0f1; 
            padding: 20px; 
            border-radius: 10px; 
            font-family: 'Monaco', monospace; 
            font-size: 0.85em; 
            max-height: 400px; 
            overflow-y: auto;
            margin-top: 20px;
        }
        .log-entry { 
            margin-bottom: 8px; 
            padding: 5px; 
            border-radius: 3px;
        }
        .log-info { background: rgba(52, 152, 219, 0.2); }
        .log-warn { background: rgba(243, 156, 18, 0.2); }
        .log-error { background: rgba(231, 76, 60, 0.2); }
        .refresh-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #3498db;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 5px 15px rgba(52, 152, 219, 0.3);
            transition: all 0.2s ease;
        }
        .refresh-btn:hover {
            background: #2980b9;
            transform: translateY(-2px);
        }
        @media (max-width: 768px) {
            .container { padding: 15px; }
            h1 { font-size: 2em; }
            .grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Bot Discord - Dashboard de Logs</h1>
        
        <div class="grid">
            <div class="card">
                <h3>🔑 Variables de Entorno</h3>
                <div><strong>DISCORD_TOKEN:</strong> 
                    <span class="status ${envCheck.DISCORD_TOKEN.configured ? 'success' : 'error'}">
                        ${envCheck.DISCORD_TOKEN.configured ? 'Configurado' : 'No configurado'}
                    </span>
                    ${envCheck.DISCORD_TOKEN.configured ? `<br><small>${envCheck.DISCORD_TOKEN.preview}</small>` : ''}
                </div>
                <div><strong>GOOGLE_SHEETS:</strong> 
                    <span class="status ${envCheck.GOOGLE_SHEETS_WEBHOOK_URL.configured ? 'success' : 'warning'}">
                        ${envCheck.GOOGLE_SHEETS_WEBHOOK_URL.configured ? 'Configurado' : 'No configurado'}
                    </span>
                </div>
                <div><strong>LOG_CHANNEL:</strong> 
                    <span class="status ${envCheck.DISCORD_LOG_CHANNEL_ID.configured ? 'success' : 'info'}">
                        ${envCheck.DISCORD_LOG_CHANNEL_ID.configured ? 'Configurado' : 'Opcional'}
                    </span>
                </div>
            </div>

            <div class="card">
                <h3>🤖 Estado del Bot</h3>
                <div><strong>Conectado:</strong> 
                    <span class="status ${botStatus.connected ? 'success' : 'error'}">
                        ${botStatus.connected ? 'Sí' : 'No'}
                    </span>
                </div>
                ${botStatus.user ? `<div><strong>Usuario:</strong> ${botStatus.user}</div>` : ''}
                <div><strong>Servidores:</strong> ${botStatus.guilds}</div>
                ${botStatus.status ? `<div><strong>Estado:</strong> ${botStatus.status}</div>` : ''}
                ${botStatus.error ? `<div class="code" style="color: #e74c3c;">Error: ${botStatus.error}</div>` : ''}
            </div>

            <div class="card">
                <h3>📊 Google Sheets</h3>
                <div><strong>Configurado:</strong> 
                    <span class="status ${sheetsStatus.configured ? 'success' : 'warning'}">
                        ${sheetsStatus.configured ? 'Sí' : 'No'}
                    </span>
                </div>
                ${sheetsStatus.configured ? `
                    <div><strong>Funcionando:</strong> 
                        <span class="status ${sheetsStatus.working ? 'success' : 'error'}">
                            ${sheetsStatus.working ? 'Sí' : 'No'}
                        </span>
                    </div>
                ` : ''}
                ${sheetsStatus.error ? `<div class="code" style="color: #e74c3c;">Error: ${sheetsStatus.error}</div>` : ''}
            </div>

            <div class="card">
                <h3>⚙️ Sistema</h3>
                <div><strong>Node.js:</strong> ${systemInfo.nodeVersion}</div>
                <div><strong>Uptime:</strong> ${systemInfo.uptime}s</div>
                <div><strong>Memoria:</strong> ${Math.round(systemInfo.memoryUsage.heapUsed / 1024 / 1024)}MB</div>
                <div><strong>Hora Lima:</strong> ${systemInfo.limaTime}</div>
            </div>
        </div>

        <div class="card">
            <h3>📝 Logs Recientes</h3>
            <div class="logs">
                ${recentLogs.map(log => `
                    <div class="log-entry log-${log.level}">
                        <strong>[${new Date(log.timestamp).toLocaleTimeString()}]</strong> 
                        <span class="status ${log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : 'info'}">${log.level.toUpperCase()}</span>
                        ${log.message}
                        ${log.data ? `<br><small>${JSON.stringify(log.data, null, 2)}</small>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #7f8c8d;">
            <small>Última actualización: ${new Date(timestamp).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</small>
        </div>
    </div>

    <button class="refresh-btn" onclick="window.location.reload()">🔄 Actualizar</button>

    <script>
        // Auto-refresh cada 30 segundos
        setTimeout(() => window.location.reload(), 30000);
        
        // Agregar efecto de carga
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.card').forEach((card, index) => {
                card.style.animation = \`fadeInUp 0.6s ease forwards \${index * 0.1}s\`;
            });
        });
    </script>

    <style>
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .card { opacity: 0; }
    </style>
</body>
</html>
  `;
}

// Exportar función para agregar logs (para uso en otras funciones)
exports.addLog = addLog;