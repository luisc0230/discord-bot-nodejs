// Handler especial para mantener el bot siempre conectado durante interacciones

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  try {
    console.log('🔄 Interaction handler called - ensuring bot is connected...');
    
    const startBotUrl = `${process.env.URL || 'https://resilient-pudding-fd6b18.netlify.app'}/.netlify/functions/start-bot`;
    
    // Verificar y asegurar que el bot esté conectado
    let botConnected = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!botConnected && attempts < maxAttempts) {
      attempts++;
      console.log(`🔍 Connection attempt ${attempts}/${maxAttempts}`);
      
      try {
        const response = await fetch(startBotUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'Interaction-Precheck/1.0' },
          signal: AbortSignal.timeout(8000)
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.status && (data.status.includes('running') || data.status.includes('started'))) {
            botConnected = true;
            console.log(`✅ Bot confirmed connected: ${data.user}`);
          } else {
            console.log(`⚠️ Bot status: ${data.status} - attempting restart...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          }
        } else {
          console.log(`❌ HTTP ${response.status} - retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Attempt ${attempts} failed:`, error.message);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    if (!botConnected) {
      throw new Error('Could not ensure bot connection after multiple attempts');
    }
    
    // Bot está conectado, devolver estado exitoso
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        status: 'Bot connection verified',
        message: 'Bot is ready for interactions',
        timestamp: new Date().toISOString(),
        attempts: attempts,
        requestId: context.awsRequestId
      })
    };
    
  } catch (error) {
    console.error('❌ Interaction handler error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'Interaction handler error',
        error: error.message,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId
      })
    };
  }
};