const { client, DISCORD_TOKEN } = require('./bot');

/**
 * Función para mantener el bot activo
 * Este archivo se ejecuta desde la raíz del proyecto
 */
async function keepBotAlive() {
  try {
    console.log('💓 Keep-alive ejecutándose desde raíz...');
    
    // Verificar si el cliente está conectado
    if (client.isReady()) {
      console.log(`✅ Bot ya está conectado: ${client.user.tag}`);
      console.log(`🏠 Servidores: ${client.guilds.cache.size}`);
      return {
        status: 'Bot funcionando correctamente',
        user: client.user.tag,
        guilds: client.guilds.cache.size,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      };
    }
    
    // Si no está conectado, intentar reconectar
    console.log('🔄 Reconectando bot...');
    await client.login(DISCORD_TOKEN);
    
    return {
      status: 'Bot reconectado exitosamente',
      user: client.user?.tag || 'Conectando...',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error en keep-alive:', error);
    
    return {
      status: 'Error en keep-alive',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Ejecutar keep-alive si se llama directamente
if (require.main === module) {
  keepBotAlive().then(result => {
    console.log('📊 Resultado keep-alive:', result);
  }).catch(error => {
    console.error('❌ Error ejecutando keep-alive:', error);
  });
}

module.exports = { keepBotAlive };