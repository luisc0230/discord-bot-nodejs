// Netlify Functions keep-alive
// Usar fetch nativo de Node.js 18+

exports.handler = async (event, context) => {
  console.log('💓 Keep-alive ejecutándose desde Netlify Functions...');
  
  try {
    // Hacer ping al bot principal para mantenerlo activo
    const botUrl = `${process.env.URL || 'https://resilient-pudding-fd6b18.netlify.app'}/.netlify/functions/start-bot`;
    
    console.log(`🔗 Haciendo ping a: ${botUrl}`);
    
    // Usar fetch nativo (disponible en Node.js 18+)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(botUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Netlify-Keep-Alive/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.warn('⚠️ No se pudo parsear respuesta como JSON:', parseError.message);
      data = { status: 'Response received but not JSON', statusCode: response.status };
    }
    
    console.log('✅ Keep-alive successful:', data.status || 'OK');
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        status: 'Keep-alive successful',
        timestamp: new Date().toISOString(),
        botStatus: data.status || 'Unknown',
        botUser: data.user || 'N/A',
        ping: 'pong',
        uptime: Math.floor(process.uptime()),
        requestId: context.awsRequestId
      })
    };
    
  } catch (error) {
    console.error('❌ Error en keep-alive:', error.message);
    
    // Determinar tipo de error
    let errorType = 'Unknown';
    if (error.name === 'AbortError') {
      errorType = 'Timeout';
    } else if (error.code === 'ECONNREFUSED') {
      errorType = 'Connection Refused';
    } else if (error.code === 'ENOTFOUND') {
      errorType = 'DNS Error';
    }
    
    return {
      statusCode: 200, // Devolver 200 para que UptimeRobot no marque como error
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        status: 'Keep-alive attempted',
        error: error.message,
        errorType: errorType,
        timestamp: new Date().toISOString(),
        message: 'Bot restart may be needed',
        requestId: context.awsRequestId
      })
    };
  }
};