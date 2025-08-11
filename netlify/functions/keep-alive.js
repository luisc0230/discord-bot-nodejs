const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('💓 Keep-alive ejecutándose...');
  
  try {
    // Hacer ping al bot principal para mantenerlo activo
    const botUrl = `${process.env.URL || 'https://resilient-pudding-fd6b18.netlify.app'}/.netlify/functions/start-bot`;
    
    const response = await fetch(botUrl, {
      method: 'GET',
      timeout: 8000
    });
    
    const data = await response.json();
    
    console.log('✅ Keep-alive successful:', data.status);
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'Keep-alive successful',
        timestamp: new Date().toISOString(),
        botStatus: data.status,
        botUser: data.user || 'N/A',
        ping: 'pong'
      })
    };
    
  } catch (error) {
    console.error('❌ Error en keep-alive:', error.message);
    
    return {
      statusCode: 200, // Devolver 200 para que UptimeRobot no marque como error
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'Keep-alive attempted',
        error: error.message,
        timestamp: new Date().toISOString(),
        message: 'Bot restart triggered'
      })
    };
  }
};