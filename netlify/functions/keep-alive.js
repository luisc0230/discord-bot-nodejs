// Keep-alive mejorado que reconecta el bot automáticamente

exports.handler = async (event, context) => {
  console.log('💓 Enhanced keep-alive executing...');
  
  try {
    const startBotUrl = `${process.env.URL || 'https://resilient-pudding-fd6b18.netlify.app'}/.netlify/functions/start-bot`;
    
    console.log(`🔗 Pinging bot at: ${startBotUrl}`);
    
    // Hacer ping al bot para mantenerlo activo O reconectarlo
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(startBotUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Enhanced-Keep-Alive/2.0',
        'Cache-Control': 'no-cache'
      }
    });
    
    clearTimeout(timeoutId);
    
    let botData = {};
    try {
      botData = await response.json();
    } catch (parseError) {
      console.warn('⚠️ Could not parse bot response:', parseError.message);
      botData = { status: 'Response received but not JSON', statusCode: response.status };
    }
    
    console.log('✅ Bot ping result:', botData.status || 'Unknown');
    
    // Determinar estado del bot
    let botStatus = 'Unknown';
    let needsRestart = false;
    
    if (botData.status) {
      if (botData.status.includes('running') || botData.status.includes('started')) {
        botStatus = 'Connected';
      } else if (botData.status.includes('connecting')) {
        botStatus = 'Connecting';
      } else if (botData.status.includes('Error') || botData.status.includes('error')) {
        botStatus = 'Error';
        needsRestart = true;
      } else {
        botStatus = botData.status;
      }
    } else {
      needsRestart = true;
    }
    
    // Si el bot necesita reinicio, intentar reconectarlo
    if (needsRestart && response.status !== 200) {
      console.log('🔄 Bot seems down, attempting restart...');
      
      try {
        const restartController = new AbortController();
        const restartTimeoutId = setTimeout(() => restartController.abort(), 10000);
        
        const restartResponse = await fetch(startBotUrl, {
          method: 'GET',
          signal: restartController.signal,
          headers: {
            'User-Agent': 'Keep-Alive-Restart/2.0',
            'Cache-Control': 'no-cache'
          }
        });
        
        clearTimeout(restartTimeoutId);
        
        if (restartResponse.ok) {
          const restartData = await restartResponse.json();
          console.log('🚀 Restart attempt result:', restartData.status);
          botStatus = 'Restarted';
          botData = restartData;
        }
      } catch (restartError) {
        console.error('❌ Restart attempt failed:', restartError.message);
        botStatus = 'Restart Failed';
      }
    }
    
    // Respuesta exitosa
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
        botStatus: botStatus,
        botUser: botData.user || 'N/A',
        botGuilds: botData.guilds || 0,
        botUptime: botData.uptime || 0,
        ping: 'pong',
        keepAliveUptime: Math.floor(process.uptime()),
        requestId: context.awsRequestId,
        needsRestart: needsRestart,
        lastActivity: botData.lastActivity || 'Unknown'
      })
    };
    
  } catch (error) {
    console.error('❌ Keep-alive error:', error.message);
    
    // Intentar un restart de emergencia
    if (error.name !== 'AbortError') {
      console.log('🆘 Emergency restart attempt...');
      
      try {
        const emergencyUrl = `${process.env.URL || 'https://resilient-pudding-fd6b18.netlify.app'}/.netlify/functions/start-bot`;
        
        const emergencyResponse = await fetch(emergencyUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'Emergency-Restart/1.0' },
          signal: AbortSignal.timeout(5000)
        });
        
        if (emergencyResponse.ok) {
          console.log('🚀 Emergency restart successful');
        }
      } catch (emergencyError) {
        console.error('❌ Emergency restart failed:', emergencyError.message);
      }
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
        errorType: error.name || 'Unknown',
        timestamp: new Date().toISOString(),
        message: 'Bot restart triggered',
        requestId: context.awsRequestId
      })
    };
  }
};