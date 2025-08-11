const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Cliente global - SOLO UNA INSTANCIA
let globalClient = null;
let isInitializing = false;

// Función principal de Netlify
exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  try {
    console.log('🚀 Start-bot function called');
    
    // Si el cliente ya existe y está listo, devolverlo
    if (globalClient && globalClient.isReady()) {
      console.log(`✅ Bot already running: ${globalClient.user.tag}`);
      return successResponse({
        status: 'Bot already running',
        user: globalClient.user.tag,
        guilds: globalClient.guilds.cache.size,
        uptime: Math.floor((Date.now() - globalClient.readyTimestamp) / 1000)
      });
    }
    
    // Si ya se está inicializando, esperar
    if (isInitializing) {
      console.log('🔄 Already initializing...');
      return successResponse({
        status: 'Bot initializing',
        message: 'Wait a moment, bot is starting up'
      });
    }
    
    // Verificar token
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN not configured');
    }
    
    // Inicializar bot
    console.log('🔧 Initializing Discord bot...');
    isInitializing = true;
    
    globalClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });
    
    // Configurar eventos básicos
    setupEvents(globalClient);
    
    // Login
    await globalClient.login(process.env.DISCORD_TOKEN);
    
    // Esperar ready con timeout
    await waitForReady(globalClient, 10000);
    
    isInitializing = false;
    console.log(`✅ Bot ready: ${globalClient.user.tag}`);
    
    return successResponse({
      status: 'Bot started successfully',
      user: globalClient.user.tag,
      guilds: globalClient.guilds.cache.size,
      message: 'Bot is now ready to handle interactions'
    });
    
  } catch (error) {
    console.error('❌ Error in start-bot:', error);
    isInitializing = false;
    
    return errorResponse(error.message);
  }
};

function setupEvents(client) {
  // Ready event
  client.once('ready', () => {
    console.log(`✅ Discord bot ready: ${client.user.tag}`);
    client.user.setActivity('Sistema de Asistencia', { type: 'WATCHING' });
  });
  
  // Message commands
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase().trim();
    
    if (content === '!setup' || content === '!setup_attendance') {
      if (!message.member?.permissions.has('Administrator')) {
        return message.reply('❌ Se requieren permisos de administrador.');
      }
      
      try {
        await setupPanel(message);
      } catch (error) {
        console.error('❌ Error en setup:', error);
        message.reply('❌ Error configurando el panel.').catch(() => {});
      }
    }
    
    if (content === '!status') {
      try {
        await message.reply(`✅ Bot funcionando: ${client.user.tag} | ${client.guilds.cache.size} servidores`);
      } catch (error) {
        console.error('❌ Error en status:', error);
      }
    }
  });
  
  // Interaction handler - CLAVE PARA LOS BOTONES
  client.on('interactionCreate', async (interaction) => {
    try {
      console.log(`🎯 Interaction: ${interaction.type} - ${interaction.customId || 'none'}`);
      
      if (interaction.isButton()) {
        await handleButton(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
      }
      
    } catch (error) {
      console.error('❌ Interaction error:', error);
      
      // Intentar responder con error
      try {
        const errorMsg = '❌ Error procesando. Intenta nuevamente.';
        
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: errorMsg, ephemeral: true });
        } else {
          await interaction.followup.send({ content: errorMsg, ephemeral: true });
        }
      } catch (replyError) {
        console.error('❌ Could not send error reply:', replyError);
      }
    }
  });
  
  // Error handling
  client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
  });
  
  client.on('warn', (info) => {
    console.warn('⚠️ Discord warning:', info);
  });
}

async function setupPanel(message) {
  const embed = new EmbedBuilder()
    .setTitle('🕐 SISTEMA DE CONTROL DE ASISTENCIA')
    .setDescription('**Registra tus eventos de trabajo:**')
    .setColor(0xffd700)
    .addFields([
      {
        name: '🟢 LOGIN',
        value: 'Inicio de jornada laboral',
        inline: true
      },
      {
        name: '⏸️ BREAK',
        value: 'Inicio de pausa/descanso',
        inline: true
      },
      {
        name: '▶️ LOGOUT BREAK',
        value: 'Fin de pausa',
        inline: true
      },
      {
        name: '🔴 LOGOUT',
        value: 'Fin de jornada + reporte ventas',
        inline: false
      }
    ]);
  
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

async function handleButton(interaction) {
  const { customId, user } = interaction;
  console.log(`🔘 Button pressed: ${customId} by ${user.username}`);
  
  // LOGOUT - mostrar modal
  if (customId === 'logout') {
    const modal = new ModalBuilder()
      .setCustomId('logout_modal')
      .setTitle('LOGOUT - Reporte de Ventas');
    
    const modeloInput = new TextInputBuilder()
      .setCustomId('modelo')
      .setLabel('Modelo trabajado')
      .setPlaceholder('Nombre del modelo...')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const montoInput = new TextInputBuilder()
      .setCustomId('monto')
      .setLabel('Monto Bruto ($)')
      .setPlaceholder('150.50')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const fansInput = new TextInputBuilder()
      .setCustomId('fans')
      .setLabel('Fans Suscritos')
      .setPlaceholder('25')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(modeloInput),
      new ActionRowBuilder().addComponents(montoInput),
      new ActionRowBuilder().addComponents(fansInput)
    );
    
    await interaction.showModal(modal);
    return;
  }
  
  // Otros botones (LOGIN, BREAK, LOGOUT_BREAK)
  const actions = {
    'login': { emoji: '🟢', name: 'Login', action: 'login' },
    'break': { emoji: '⏸️', name: 'Break', action: 'break' },
    'logout_break': { emoji: '▶️', name: 'Logout Break', action: 'logout_break' }
  };
  
  const config = actions[customId];
  if (!config) {
    console.warn(`Unknown button: ${customId}`);
    return;
  }
  
  // Respuesta inmediata
  await interaction.reply({
    content: `${config.emoji} **${config.name}** registrando...`,
    ephemeral: true
  });
  
  // Enviar a Google Sheets
  const success = await sendToSheets(user, config.action, interaction.guild, interaction.channel);
  
  // Respuesta final
  const embed = new EmbedBuilder()
    .setTitle(`${config.emoji} ${config.name} Registrado`)
    .setColor(0x00ff00)
    .addFields([
      { name: 'Usuario', value: user.username, inline: true },
      { name: 'Hora', value: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }), inline: true }
    ]);
  
  if (success) {
    embed.setFooter({ text: '✅ Guardado en Google Sheets' });
  } else {
    embed.setFooter({ text: '⚠️ Error con Google Sheets' });
  }
  
  await interaction.editReply({ content: `${config.emoji} **${config.name}** registrado`, embeds: [embed] });
  
  // Enviar DM
  try {
    await user.send({ content: `${config.emoji} **${config.name}** registrado exitosamente`, embeds: [embed] });
  } catch (dmError) {
    console.warn('Could not send DM to user');
  }
}

async function handleModal(interaction) {
  if (interaction.customId !== 'logout_modal') return;
  
  try {
    console.log(`📝 Logout modal from ${interaction.user.username}`);
    
    await interaction.reply({
      content: '🔴 **Procesando logout y ventas...**',
      ephemeral: true
    });
    
    const modelo = interaction.fields.getTextInputValue('modelo');
    const montoStr = interaction.fields.getTextInputValue('monto').replace(/[$,]/g, '');
    const fansStr = interaction.fields.getTextInputValue('fans').replace(/[#,]/g, '');
    
    const monto = parseFloat(montoStr);
    const fans = parseInt(fansStr);
    
    if (isNaN(monto) || monto < 0) {
      await interaction.editReply({ content: '❌ Monto inválido' });
      return;
    }
    
    if (isNaN(fans) || fans < 0) {
      await interaction.editReply({ content: '❌ Fans inválidos' });
      return;
    }
    
    const montoNeto = monto * 0.8;
    
    const ventasData = {
      modelo,
      monto_bruto: monto,
      monto_neto: montoNeto,
      fans_suscritos: fans
    };
    
    const success = await sendToSheets(interaction.user, 'logout', interaction.guild, interaction.channel, ventasData);
    
    const embed = new EmbedBuilder()
      .setTitle('🔴 Logout y Ventas Registrados')
      .setColor(0xff0000)
      .addFields([
        { name: 'Usuario', value: interaction.user.username, inline: true },
        { name: 'Modelo', value: modelo, inline: true },
        { name: 'Monto Bruto', value: `$${monto.toFixed(2)}`, inline: true },
        { name: 'Monto Neto', value: `$${montoNeto.toFixed(2)}`, inline: true },
        { name: 'Fans', value: fans.toString(), inline: true },
        { name: 'Hora', value: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }), inline: true }
      ]);
    
    if (success) {
      embed.setFooter({ text: '✅ Guardado en Google Sheets' });
    } else {
      embed.setFooter({ text: '⚠️ Error con Google Sheets' });
    }
    
    await interaction.editReply({
      content: '🔴 **Logout registrado exitosamente**',
      embeds: [embed]
    });
    
    // DM
    try {
      await interaction.user.send({ content: '🔴 **Logout registrado**', embeds: [embed] });
    } catch (dmError) {
      console.warn('Could not send logout DM');
    }
    
  } catch (error) {
    console.error('❌ Modal error:', error);
    await interaction.editReply({ content: '❌ Error procesando logout' });
  }
}

async function sendToSheets(user, action, guild, channel, ventasData = null) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) {
    console.warn('No Google Sheets URL configured');
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
    
    console.log(`📊 Sending to sheets: ${user.username} - ${action}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const result = await response.json();
      return result.result === 'success';
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ Sheets error:', error);
    return false;
  }
}

function waitForReady(client, timeout = 10000) {
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

function successResponse(data) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    })
  };
}

function errorResponse(error) {
  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: 'error',
      error,
      timestamp: new Date().toISOString()
    })
  };
}