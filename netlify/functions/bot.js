// netlify/functions/bot.js
const { Client, GatewayIntentBits } = require('discord.js');

let client = null;

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // Si el bot ya está conectado, devolver estado
    if (client && client.isReady()) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Bot funcionando',
          user: client.user.tag,
          guilds: client.guilds.cache.size,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        })
      };
    }

    // Crear y configurar cliente si no existe
    if (!client) {
      console.log('🚀 Creando cliente Discord...');
      
      client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent
        ]
      });

      // Configurar eventos básicos
      client.once('ready', () => {
        console.log(`✅ Bot conectado: ${client.user.tag}`);
        client.user.setActivity('Control de Asistencia', { type: 'WATCHING' });
      });

      client.on('error', console.error);
    }

    // Conectar si no está conectado
    if (!client.isReady()) {
      console.log('🔗 Conectando a Discord...');
      await client.login(process.env.DISCORD_TOKEN);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Bot iniciado exitosamente',
        message: 'Discord bot is running on Netlify',
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Error',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};