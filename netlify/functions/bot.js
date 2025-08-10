// Netlify Function para mantener el bot corriendo
const { Client, GatewayIntentBits } = require('discord.js');

// Importar el bot principal
let botInstance = null;

exports.handler = async (event, context) => {
  console.log('🚀 Netlify Function ejecutándose...');
  
  // Solo iniciar el bot si no está ya corriendo
  if (!botInstance) {
    try {
      // Importar dinámicamente el bot
      const startBot = require('../../bot.js');
      console.log('✅ Bot iniciado desde Netlify Function');
      botInstance = true;
    } catch (error) {
      console.error('❌ Error iniciando bot:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Error iniciando bot' })
      };
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Bot de asistencia funcionando',
      timestamp: new Date().toISOString(),
      status: 'active'
    })
  };
};