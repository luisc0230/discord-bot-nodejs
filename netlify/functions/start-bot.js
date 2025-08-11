const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

let client = null;
let isConnecting = false;

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    console.log('🚀 Iniciando función start-bot...');

    // Si ya está conectado, devolver estado
    if (client && client.isReady()) {
      console.log(`✅ Bot ya está funcionando: ${client.user.tag}`);
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          status: 'Bot ya está funcionando',
          user: client.user.tag,
          guilds: client.guilds.cache.size,
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId
        })
      };
    }

    // Evitar múltiples conexiones simultáneas
    if (isConnecting) {
      console.log('🔄 Bot conectándose...');
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          status: 'Bot conectándose...',
          message: 'Conexión en proceso',
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId
        })
      };
    }

    // Verificar token
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN no configurado');
    }

    // Crear cliente si no existe
    if (!client) {
      console.log('🔧 Creando cliente Discord...');
      isConnecting = true;

      client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMembers
        ]
      });

      // Configurar eventos del bot
      setupBotEvents(client);

      // Conectar a Discord con timeout
      const connectPromise = client.login(process.env.DISCORD_TOKEN);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Login timeout')), 15000)
      );

      await Promise.race([connectPromise, timeoutPromise]);
      isConnecting = false;
      
      console.log('✅ Cliente conectado exitosamente');
    }

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        status: 'Bot iniciado exitosamente',
        user: client.user?.tag || 'Conectando...',
        guilds: client.guilds?.cache.size || 0,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId
      })
    };

  } catch (error) {
    console.error('❌ Error en start-bot:', error);
    isConnecting = false;
    
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'Error',
        error: error.message,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId
      })
    };
  }
};

function setupBotEvents(client) {
  // Evento cuando el bot se conecta
  client.once('ready', () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    console.log(`🏠 Servidores: ${client.guilds.cache.size}`);
    client.user.setActivity('Control de Asistencia 24/7', { type: 'WATCHING' });
  });

  // Manejo de comandos
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    if (content === '!setup_attendance' || content === '!setup') {
      if (!message.member?.permissions.has('Administrator')) {
        return message.reply('❌ Necesitas permisos de administrador para usar este comando.');
      }
      await setupAttendancePanel(message);
    }
    
    if (content === '!status') {
      await showStatus(message);
    }
  });

  // Manejo de interacciones (botones y modales)
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
      }
    } catch (error) {
      console.error('❌ Error en interacción:', error);
    }
  });

  // Manejo de errores
  client.on('error', error => {
    console.error('❌ Error del cliente Discord:', error);
  });

  client.on('warn', info => {
    console.warn('⚠️ Advertencia Discord:', info);
  });
}

async function setupAttendancePanel(message) {
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
        value: 'Presionarlo **cada vez que te ausentes** del puesto.\n❌ **No usarlo** si vas a estar solo 1-2 minutos.',
        inline: false
      },
      {
        name: '▶️ LOGOUT BREAK - Fin de pausa/vuelta al trabajo',
        value: 'Presionarlo **apenas vuelvas** de la pausa.\nEsto marca que estás **nuevamente disponible**.',
        inline: false
      },
      {
        name: '🔴 LOGOUT - Salida/Fin de jornada + Reporte de Ventas',
        value: 'Presionarlo **al finalizar** tu turno.\n📋 **Se abrirá un formulario** para reportar ventas.',
        inline: false
      }
    ])
    .setFooter({ text: '📧 Las confirmaciones llegan por DM | ⏰ Hora de Lima' });

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('attendance_login')
        .setLabel('🟢 Login')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('attendance_break')
        .setLabel('⏸️ Break')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('attendance_logout_break')
        .setLabel('▶️ Logout Break')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('attendance_logout')
        .setLabel('🔴 Logout')
        .setStyle(ButtonStyle.Danger)
    );

  await message.channel.send({ embeds: [embed], components: [row] });
  
  try {
    await message.delete();
  } catch (error) {
    // Ignorar errores de eliminación
  }
}

async function handleButtonInteraction(interaction) {
  const { customId, user, guild, channel } = interaction;
  
  if (customId === 'attendance_logout') {
    // Mostrar modal para logout con ventas
    const modal = new ModalBuilder()
      .setCustomId('logout_ventas_modal')
      .setTitle('LOGOUT - REPORTE DE VENTAS');

    const modeloInput = new TextInputBuilder()
      .setCustomId('modelo')
      .setLabel('MODELO')
      .setPlaceholder('Ingresa el modelo trabajado...')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const montoBrutoInput = new TextInputBuilder()
      .setCustomId('monto_bruto')
      .setLabel('Monto Bruto:')
      .setPlaceholder('$')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(20);

    const fansSuscritosInput = new TextInputBuilder()
      .setCustomId('fans_suscritos')
      .setLabel('Fans Suscritos:')
      .setPlaceholder('#')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(20);

    const row1 = new ActionRowBuilder().addComponents(modeloInput);
    const row2 = new ActionRowBuilder().addComponents(montoBrutoInput);
    const row3 = new ActionRowBuilder().addComponents(fansSuscritosInput);

    modal.addComponents(row1, row2, row3);
    await interaction.showModal(modal);
    return;
  }

  // Manejo de otros botones (login, break, logout_break)
  const actionMap = {
    'attendance_login': { action: 'login', emoji: '🟢', name: 'Login' },
    'attendance_break': { action: 'break', emoji: '⏸️', name: 'Break' },
    'attendance_logout_break': { action: 'logout_break', emoji: '▶️', name: 'Logout Break' }
  };

  const config = actionMap[customId];
  if (!config) return;

  try {
    await interaction.reply({
      content: `${config.emoji} **${config.name}** procesando...`,
      ephemeral: true
    });

    const success = await sendToGoogleSheets(user, config.action, guild, channel);
    
    const embed = new EmbedBuilder()
      .setTitle(`${config.emoji} ${config.name} Registrado`)
      .setDescription(`**${config.name} registrado exitosamente**`)
      .setColor(config.action === 'login' ? 0x00ff00 : config.action === 'break' ? 0x0099ff : 0x9900ff)
      .addFields([
        { name: '👤 Usuario', value: `<@${user.id}>`, inline: true },
        { name: '⏰ Hora (Lima)', value: `\`${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}\``, inline: true }
      ])
      .setTimestamp();

    const dmMessage = `${config.emoji} **${config.name}** registrado ${success ? 'exitosamente' : 'localmente'}.`;

    try {
      await user.send({ content: dmMessage, embeds: [embed] });
    } catch (dmError) {
      await interaction.followup.send({
        content: `${config.emoji} **${config.name}** registrado.\n💡 Activa los DMs para confirmaciones privadas.`,
        ephemeral: true
      });
    }

  } catch (error) {
    console.error(`❌ Error en botón ${config.name}:`, error);
    await interaction.reply({
      content: `❌ Error procesando **${config.name}**. Inténtalo nuevamente.`,
      ephemeral: true
    });
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId !== 'logout_ventas_modal') return;

  try {
    await interaction.reply({
      content: '🔴 **Procesando logout y reporte de ventas...** ⏳',
      ephemeral: true
    });

    const modelo = interaction.fields.getTextInputValue('modelo');
    const montoBrutoStr = interaction.fields.getTextInputValue('monto_bruto').replace(/[$,]/g, '').trim();
    const fansSuscritosStr = interaction.fields.getTextInputValue('fans_suscritos').replace(/[#,]/g, '').trim();

    // Validar monto bruto
    const montoBruto = parseFloat(montoBrutoStr);
    if (isNaN(montoBruto)) {
      await interaction.editReply({ content: '❌ **Error**: El monto bruto debe ser un número válido.' });
      return;
    }

    // Calcular monto neto (80% del bruto)
    const montoNeto = montoBruto * 0.80;

    // Validar fans suscritos
    const fansSuscritos = parseInt(fansSuscritosStr);
    if (isNaN(fansSuscritos)) {
      await interaction.editReply({ content: '❌ **Error**: Los fans suscritos deben ser un número entero.' });
      return;
    }

    // Enviar a Google Sheets con datos de ventas
    const success = await sendToGoogleSheets(
      interaction.user,
      'logout',
      interaction.guild,
      interaction.channel,
      { modelo, monto_bruto: montoBruto, monto_neto: montoNeto, fans_suscritos: fansSuscritos }
    );

    const embed = new EmbedBuilder()
      .setTitle('🔴 Logout y Ventas Registrados')
      .setDescription('**Jornada finalizada con reporte de ventas**')
      .setColor(0xff0000)
      .addFields([
        { name: '👤 Usuario', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Modelo', value: `\`${modelo}\``, inline: true },
        { name: '💵 Monto Bruto', value: `\`$${montoBruto.toFixed(2)}\``, inline: true },
        { name: '💰 Monto Neto (80%)', value: `\`$${montoNeto.toFixed(2)}\``, inline: true },
        { name: '👥 Fans Suscritos', value: `\`${fansSuscritos.toLocaleString()}\``, inline: true },
        { name: '⏰ Hora (Lima)', value: `\`${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}\``, inline: true }
      ])
      .setTimestamp();

    await interaction.editReply({
      content: success ? '🔴 **Logout registrado exitosamente con reporte de ventas**' : '⚠️ **Error con Google Sheets**',
      embeds: [embed]
    });

    // Enviar por DM
    try {
      await interaction.user.send({
        content: '🔴 **Logout y reporte de ventas registrado**',
        embeds: [embed]
      });
    } catch (dmError) {
      // Ignorar errores de DM
    }

  } catch (error) {
    console.error('❌ Error en modal de logout:', error);
    await interaction.editReply({
      content: '❌ **Error procesando logout**. Inténtalo nuevamente.'
    });
  }
}

async function sendToGoogleSheets(user, action, guild, channel, ventasData = null) {
  const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  
  if (!GOOGLE_SHEETS_WEBHOOK_URL) {
    console.warn('⚠️ Google Sheets URL no configurada');
    return false;
  }

  try {
    const data = {
      timestamp: new Date().toISOString(),
      usuario: `${user.username}#${user.discriminator}`,
      action: action,
      servidor: guild?.name || 'DM/Privado',
      canal: channel?.name || 'Mensaje Directo',
      ...ventasData
    };

    // Usar fetch nativo en lugar de axios
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      if (result.result === 'success') {
        console.log(`✅ Enviado a Google Sheets: ${user.username} - ${action}`);
        return true;
      }
    }
    
    console.error('❌ Error respuesta Google Sheets:', response.status);
    return false;

  } catch (error) {
    console.error('❌ Error enviando a Google Sheets:', error.message);
    return false;
  }
}

async function showStatus(message) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Estado del Sistema de Asistencia')
    .setDescription('Sistema funcionando en Netlify')
    .setColor(0x00ff00)
    .addFields([
      { name: '🤖 Bot', value: `✅ Conectado como ${client.user.tag}`, inline: true },
      { name: '🏠 Servidores', value: `${client.guilds.cache.size}`, inline: true },
      { name: '⏰ Uptime', value: `${Math.floor(process.uptime())} segundos`, inline: true },
      { name: '📊 Google Sheets', value: process.env.GOOGLE_SHEETS_WEBHOOK_URL ? '✅ Configurado' : '❌ No configurado', inline: true }
    ])
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}