const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// CLIENTE GLOBAL - PERSISTE ENTRE LLAMADAS
let client = null;
let isConnecting = false;
let lastActivity = Date.now();

// FUNCIÓN PRINCIPAL DE NETLIFY
exports.handler = async (event, context) => {
  // NO TERMINAR LA FUNCIÓN HASTA QUE EL EVENT LOOP ESTÉ VACÍO
  context.callbackWaitsForEmptyEventLoop = false;
  
  try {
    console.log('🚀 Start-bot called');
    markActivity();
    
    // Si ya está conectado y funcionando
    if (client && client.isReady()) {
      console.log(`✅ Bot already running: ${client.user.tag}`);
      return createResponse(200, {
        status: 'Bot already running',
        user: client.user.tag,
        guilds: client.guilds.cache.size,
        uptime: Math.floor((Date.now() - client.readyTimestamp) / 1000),
        lastActivity: new Date(lastActivity).toISOString()
      });
    }
    
    // Si está conectándose
    if (isConnecting) {
      console.log('🔄 Already connecting...');
      return createResponse(200, {
        status: 'Bot connecting',
        message: 'Please wait, connection in progress'
      });
    }
    
    // Verificar token
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN not configured');
    }
    
    console.log('🔧 Starting new bot connection...');
    isConnecting = true;
    
    try {
      // Crear cliente
      client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMembers
        ]
      });
      
      // CONFIGURAR TODOS LOS EVENTOS
      setupAllEvents(client);
      
      // CONECTAR
      await client.login(process.env.DISCORD_TOKEN);
      
      // ESPERAR READY
      await waitForReady(client);
      
      isConnecting = false;
      console.log(`✅ Bot connected: ${client.user.tag}`);
      
      return createResponse(200, {
        status: 'Bot started successfully',
        user: client.user.tag,
        guilds: client.guilds.cache.size,
        message: 'Bot is ready for interactions'
      });
      
    } catch (loginError) {
      isConnecting = false;
      throw loginError;
    }
    
  } catch (error) {
    console.error('❌ Error in start-bot:', error);
    isConnecting = false;
    
    return createResponse(500, {
      status: 'Error',
      error: error.message
    });
  }
};

function setupAllEvents(client) {
  console.log('🔧 Setting up all bot events...');
  
  // READY EVENT
  client.once('ready', () => {
    console.log(`✅ Bot ready: ${client.user.tag}`);
    console.log(`🏠 Guilds: ${client.guilds.cache.size}`);
    client.user.setActivity('Sistema de Asistencia 24/7', { type: 'WATCHING' });
    markActivity();
  });
  
  // MESSAGE COMMANDS
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    markActivity();
    
    console.log(`📝 Message: "${message.content}" from ${message.author.username}`);
    
    const content = message.content.toLowerCase().trim();
    
    if (content === '!setup' || content === '!setup_attendance') {
      console.log(`🔧 Setup command from ${message.author.username}`);
      
      if (!message.member?.permissions.has('Administrator')) {
        console.log(`❌ No admin perms: ${message.author.username}`);
        return message.reply('❌ Se requieren permisos de administrador.');
      }
      
      try {
        await setupPanel(message);
        console.log(`✅ Panel setup completed for ${message.author.username}`);
      } catch (error) {
        console.error('❌ Setup error:', error);
        message.reply('❌ Error configurando panel').catch(() => {});
      }
    }
    
    if (content === '!status') {
      console.log(`📊 Status command from ${message.author.username}`);
      try {
        const embed = new EmbedBuilder()
          .setTitle('📊 Estado del Bot')
          .setColor(0x00ff00)
          .addFields([
            { name: 'Usuario', value: client.user.tag, inline: true },
            { name: 'Servidores', value: client.guilds.cache.size.toString(), inline: true },
            { name: 'Latencia', value: `${client.ws.ping}ms`, inline: true },
            { name: 'Uptime', value: `${Math.floor((Date.now() - client.readyTimestamp) / 1000)}s`, inline: true }
          ])
          .setTimestamp();
        
        await message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('❌ Status error:', error);
        message.reply('❌ Error mostrando estado').catch(() => {});
      }
    }
    
    if (content === '!ping') {
      console.log(`🏓 Ping from ${message.author.username}`);
      const start = Date.now();
      try {
        const msg = await message.reply('🏓 Calculando...');
        const latency = Date.now() - start;
        await msg.edit(`🏓 Pong! Latencia: ${latency}ms | WS: ${client.ws.ping}ms`);
      } catch (error) {
        console.error('❌ Ping error:', error);
      }
    }
  });
  
  // INTERACTION HANDLER - MUY IMPORTANTE
  client.on('interactionCreate', async (interaction) => {
    markActivity();
    
    try {
      console.log(`🎯 INTERACTION RECEIVED: Type=${interaction.type}, CustomId=${interaction.customId || 'none'}, User=${interaction.user.username}`);
      
      if (interaction.isButton()) {
        console.log(`🔘 BUTTON: ${interaction.customId} by ${interaction.user.username}`);
        await handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        console.log(`📝 MODAL: ${interaction.customId} by ${interaction.user.username}`);
        await handleModalSubmit(interaction);
      }
      
    } catch (error) {
      console.error('❌ INTERACTION ERROR:', error);
      
      try {
        const errorMsg = '❌ Error procesando. Inténtalo en unos segundos.';
        
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: errorMsg, ephemeral: true });
        } else if (interaction.deferred) {
          await interaction.editReply({ content: errorMsg });
        } else {
          await interaction.followup.send({ content: errorMsg, ephemeral: true });
        }
      } catch (replyError) {
        console.error('❌ Could not send error reply:', replyError);
      }
    }
  });
  
  // ERROR HANDLING
  client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
  });
  
  client.on('warn', (info) => {
    console.warn('⚠️ Discord warning:', info);
  });
  
  client.on('disconnect', () => {
    console.warn('⚠️ Bot disconnected');
  });
  
  client.on('reconnecting', () => {
    console.log('🔄 Bot reconnecting...');
  });
  
  console.log('✅ All events configured');
}

async function setupPanel(message) {
  const embed = new EmbedBuilder()
    .setTitle('🕐 SISTEMA DE CONTROL DE ASISTENCIA')
    .setDescription('**Registra tus eventos de trabajo con un solo clic:**')
    .setColor(0xffd700)
    .addFields([
      {
        name: '🟢 LOGIN - Entrada/Inicio de jornada',
        value: 'Presionarlo **apenas empieces tu turno** de trabajo.\nDebe ser lo **primero que hagas** al conectarte.',
        inline: false
      },
      {
        name: '⏸️ BREAK - Inicio de pausa/descanso',
        value: 'Presionarlo **cada vez que te ausentes** del puesto (baño, comer, personal).\n❌ **No usarlo** si vas a estar solo 1-2 minutos.',
        inline: false
      },
      {
        name: '▶️ LOGOUT BREAK - Fin de pausa/vuelta al trabajo',
        value: 'Presionarlo **apenas vuelvas** de la pausa.\nEsto marca que estás **nuevamente disponible y activo**.',
        inline: false
      },
      {
        name: '🔴 LOGOUT - Salida/Fin de jornada + Reporte de Ventas',
        value: 'Presionarlo **al finalizar** tu turno.\n📋 **Se abrirá un formulario** para reportar ventas del día.',
        inline: false
      },
      {
        name: '📋 REGLAS IMPORTANTES',
        value: '• Los botones se deben usar en **orden lógico**: `Login → Break → Logout Break → Logout`\n• **No marcar** un Break sin luego marcar un Logout Break\n• **El Logout incluye** el reporte obligatorio de ventas',
        inline: false
      }
    ])
    .setFooter({ text: '📧 Las confirmaciones llegan por DM | ⏰ Hora de Lima' })
    .setTimestamp();
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('login')
        .setLabel('🟢 Login')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('break')
        .setLabel('⏸️ Break')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('logout_break')
        .setLabel('▶️ Logout Break')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('logout')
        .setLabel('🔴 Logout')
        .setStyle(ButtonStyle.Danger)
    );
  
  await message.channel.send({ embeds: [embed], components: [buttons] });
  
  try {
    await message.delete();
  } catch (error) {
    console.warn('Could not delete setup command');
  }
}

async function handleButtonInteraction(interaction) {
  const { customId, user, guild, channel } = interaction;
  
  console.log(`🔘 Processing button: ${customId} from ${user.username}`);
  
  try {
    // LOGOUT BUTTON - SHOW MODAL
    if (customId === 'logout') {
      console.log(`🔴 Creating logout modal for ${user.username}`);
      
      const modal = new ModalBuilder()
        .setCustomId('logout_modal')
        .setTitle('LOGOUT - Reporte de Ventas');
      
      const modeloInput = new TextInputBuilder()
        .setCustomId('modelo')
        .setLabel('Modelo trabajado')
        .setPlaceholder('Nombre del modelo...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);
      
      const montoInput = new TextInputBuilder()
        .setCustomId('monto_bruto')
        .setLabel('Monto Bruto ($)')
        .setPlaceholder('150.50')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(20);
      
      const fansInput = new TextInputBuilder()
        .setCustomId('fans_suscritos')
        .setLabel('Fans Suscritos')
        .setPlaceholder('25')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(20);
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(modeloInput),
        new ActionRowBuilder().addComponents(montoInput),
        new ActionRowBuilder().addComponents(fansInput)
      );
      
      await interaction.showModal(modal);
      console.log(`✅ Modal shown to ${user.username}`);
      return;
    }
    
    // OTHER BUTTONS (LOGIN, BREAK, LOGOUT_BREAK)
    const buttonActions = {
      'login': { emoji: '🟢', name: 'Login', action: 'login', color: 0x00ff00 },
      'break': { emoji: '⏸️', name: 'Break', action: 'break', color: 0x0099ff },
      'logout_break': { emoji: '▶️', name: 'Logout Break', action: 'logout_break', color: 0x9900ff }
    };
    
    const config = buttonActions[customId];
    if (!config) {
      console.warn(`❌ Unknown button: ${customId}`);
      return;
    }
    
    console.log(`⚡ Processing ${config.name} for ${user.username}`);
    
    // IMMEDIATE RESPONSE
    await interaction.reply({
      content: `${config.emoji} **${config.name}** procesando...`,
      ephemeral: true
    });
    
    console.log(`📤 Sending to Google Sheets: ${user.username} - ${config.action}`);
    
    // SEND TO GOOGLE SHEETS
    const success = await sendToGoogleSheets(user, config.action, guild, channel);
    
    // CREATE CONFIRMATION EMBED
    const embed = new EmbedBuilder()
      .setTitle(`${config.emoji} ${config.name} Registrado`)
      .setDescription(`**${config.name} registrado exitosamente**`)
      .setColor(config.color)
      .addFields([
        { name: '👤 Usuario', value: `${user.username}`, inline: true },
        { name: '⏰ Hora (Lima)', value: `${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`, inline: true }
      ])
      .setTimestamp();
    
    if (success) {
      embed.setFooter({ text: '✅ Guardado en Google Sheets' });
    } else {
      embed.setFooter({ text: '⚠️ Error con Google Sheets' });
    }
    
    // UPDATE RESPONSE
    await interaction.editReply({
      content: `${config.emoji} **${config.name}** registrado exitosamente`,
      embeds: [embed]
    });
    
    // SEND DM
    try {
      await user.send({
        content: `${config.emoji} **${config.name}** registrado`,
        embeds: [embed]
      });
      console.log(`✉️ DM sent to ${user.username}`);
    } catch (dmError) {
      console.warn(`⚠️ Could not send DM to ${user.username}: ${dmError.message}`);
    }
    
    console.log(`✅ ${config.name} completed for ${user.username}`);
    
  } catch (error) {
    console.error(`❌ Button error for ${customId}:`, error);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ Error procesando **${customId}**. Inténtalo nuevamente.`,
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('❌ Could not send button error reply:', replyError);
    }
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId !== 'logout_modal') return;
  
  const { user } = interaction;
  
  try {
    console.log(`📝 Processing logout modal from ${user.username}`);
    
    // IMMEDIATE RESPONSE
    await interaction.reply({
      content: '🔴 **Procesando logout y reporte de ventas...** ⏳',
      ephemeral: true
    });
    
    // GET MODAL DATA
    const modelo = interaction.fields.getTextInputValue('modelo');
    const montoBrutoStr = interaction.fields.getTextInputValue('monto_bruto').replace(/[$,]/g, '').trim();
    const fansSuscritosStr = interaction.fields.getTextInputValue('fans_suscritos').replace(/[#,]/g, '').trim();
    
    console.log(`📊 Modal data: modelo=${modelo}, monto=${montoBrutoStr}, fans=${fansSuscritosStr}`);
    
    // VALIDATE DATA
    const montoBruto = parseFloat(montoBrutoStr);
    if (isNaN(montoBruto) || montoBruto < 0) {
      await interaction.editReply({ content: '❌ **Error**: Monto bruto inválido' });
      return;
    }
    
    const fansSuscritos = parseInt(fansSuscritosStr);
    if (isNaN(fansSuscritos) || fansSuscritos < 0) {
      await interaction.editReply({ content: '❌ **Error**: Fans suscritos inválido' });
      return;
    }
    
    const montoNeto = montoBruto * 0.8;
    
    const ventasData = {
      modelo,
      monto_bruto: montoBruto,
      monto_neto: montoNeto,
      fans_suscritos: fansSuscritos
    };
    
    console.log(`📤 Sending logout to Google Sheets: ${user.username}`);
    
    // SEND TO GOOGLE SHEETS
    const success = await sendToGoogleSheets(user, 'logout', interaction.guild, interaction.channel, ventasData);
    
    // CREATE RESPONSE EMBED
    const embed = new EmbedBuilder()
      .setTitle('🔴 Logout y Ventas Registrados')
      .setDescription('**Jornada finalizada con reporte de ventas**')
      .setColor(0xff0000)
      .addFields([
        { name: '👤 Usuario', value: user.username, inline: true },
        { name: '📝 Modelo', value: modelo, inline: true },
        { name: '💵 Monto Bruto', value: `$${montoBruto.toFixed(2)}`, inline: true },
        { name: '💰 Monto Neto (80%)', value: `$${montoNeto.toFixed(2)}`, inline: true },
        { name: '👥 Fans Suscritos', value: fansSuscritos.toString(), inline: true },
        { name: '⏰ Hora (Lima)', value: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }), inline: true }
      ])
      .setTimestamp();
    
    if (success) {
      embed.setFooter({ text: '✅ Logout y ventas guardados en Google Sheets' });
    } else {
      embed.setFooter({ text: '⚠️ Error guardando en Google Sheets' });
    }
    
    // UPDATE RESPONSE
    await interaction.editReply({
      content: '🔴 **Logout registrado exitosamente con reporte de ventas**',
      embeds: [embed]
    });
    
    // SEND DM
    try {
      await user.send({
        content: '🔴 **Logout y reporte de ventas registrado**',
        embeds: [embed]
      });
      console.log(`✉️ Logout DM sent to ${user.username}`);
    } catch (dmError) {
      console.warn(`⚠️ Could not send logout DM to ${user.username}`);
    }
    
    console.log(`✅ Logout completed for ${user.username}`);
    
  } catch (error) {
    console.error('❌ Modal error:', error);
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '❌ **Error procesando logout**. Inténtalo nuevamente.' });
      }
    } catch (editError) {
      console.error('❌ Could not edit modal error reply:', editError);
    }
  }
}

async function sendToGoogleSheets(user, action, guild, channel, ventasData = null) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  
  if (!url) {
    console.warn('⚠️ Google Sheets URL not configured');
    return false;
  }
  
  try {
    const data = {
      timestamp: new Date().toISOString(),
      usuario: `${user.username}#${user.discriminator}`,
      action,
      servidor: guild?.name || 'DM',
      canal: channel?.name || 'Direct',
      ...ventasData
    };
    
    console.log(`📊 Sending to Google Sheets:`, data);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const result = await response.json();
      const success = result.result === 'success';
      console.log(`📊 Google Sheets result: ${success ? 'SUCCESS' : 'FAILED'}`);
      return success;
    } else {
      console.error(`❌ Google Sheets HTTP ${response.status}`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Google Sheets error:', error.message);
    return false;
  }
}

function waitForReady(client, timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (client.isReady()) {
      resolve();
      return;
    }
    
    const timer = setTimeout(() => {
      reject(new Error('Ready timeout'));
    }, timeout);
    
    client.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function markActivity() {
  lastActivity = Date.now();
}

function createResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    })
  };
}