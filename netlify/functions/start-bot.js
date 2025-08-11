const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Cliente global para persistencia
let client = null;
let isConnecting = false;
let lastActivity = Date.now();

// Marcar actividad para keep-alive
function markActivity() {
  lastActivity = Date.now();
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  markActivity();

  try {
    console.log('🚀 Función start-bot ejecutada...');

    // Si ya está conectado y funcionando, devolver estado
    if (client && client.isReady()) {
      console.log(`✅ Bot ya funcionando: ${client.user.tag}`);
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
          uptime: Math.floor((Date.now() - (client.readyTimestamp || Date.now())) / 1000),
          lastActivity: new Date(lastActivity).toISOString(),
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId
        })
      };
    }

    // Evitar múltiples conexiones simultáneas
    if (isConnecting) {
      console.log('🔄 Bot ya está conectándose...');
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          status: 'Bot conectándose...',
          message: 'Conexión en proceso, espera unos segundos',
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId
        })
      };
    }

    // Verificar token
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN no está configurado en las variables de entorno');
    }

    console.log('🔧 Iniciando nueva conexión del bot...');
    isConnecting = true;

    try {
      // Crear nuevo cliente
      client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMembers
        ]
      });

      // Configurar eventos ANTES de conectar
      setupBotEvents(client);

      // Conectar con timeout
      console.log('🔗 Conectando a Discord...');
      await client.login(process.env.DISCORD_TOKEN);
      
      // Esperar hasta que esté completamente listo
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout esperando ready event'));
        }, 15000);

        client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      isConnecting = false;
      console.log(`✅ Bot conectado exitosamente como ${client.user.tag}`);

      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          status: 'Bot iniciado exitosamente',
          user: client.user.tag,
          guilds: client.guilds.cache.size,
          timestamp: new Date().toISOString(),
          message: 'Bot listo para usar. Los botones deberían funcionar ahora.',
          requestId: context.awsRequestId
        })
      };

    } catch (loginError) {
      isConnecting = false;
      console.error('❌ Error en login:', loginError);
      throw loginError;
    }

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
        status: 'Error iniciando bot',
        error: error.message,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId,
        troubleshooting: 'Verifica el token de Discord y vuelve a intentar'
      })
    };
  }
};

function setupBotEvents(client) {
  // Evento ready
  client.once('ready', () => {
    console.log(`✅ Bot listo: ${client.user.tag}`);
    console.log(`🏠 Conectado a ${client.guilds.cache.size} servidor(es)`);
    
    // Establecer actividad
    client.user.setActivity('Control de Asistencia 24/7', { type: 'WATCHING' });
    markActivity();
  });

  // Comandos de mensaje
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    markActivity();
    
    const content = message.content.toLowerCase().trim();
    
    try {
      if (content === '!setup_attendance' || content === '!setup') {
        if (!message.member?.permissions.has('Administrator')) {
          return await message.reply('❌ Necesitas permisos de administrador para usar este comando.');
        }
        await setupAttendancePanel(message);
      }
      
      if (content === '!status') {
        await showStatus(message);
      }

      if (content === '!ping') {
        const start = Date.now();
        const msg = await message.reply('🏓 Calculando ping...');
        const latency = Date.now() - start;
        await msg.edit(`🏓 Pong! Latencia: ${latency}ms | WebSocket: ${Math.round(client.ws.ping)}ms`);
      }
    } catch (error) {
      console.error('❌ Error en comando:', error);
      await message.reply('❌ Error procesando el comando. Verifica los logs.').catch(() => {});
    }
  });

  // Manejo de interacciones de botones y modales
  client.on('interactionCreate', async (interaction) => {
    markActivity();
    
    try {
      console.log(`🎯 Interacción recibida: ${interaction.type} - ${interaction.customId || 'N/A'}`);
      
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
      }
    } catch (error) {
      console.error('❌ Error en interacción:', error);
      
      try {
        const errorMessage = '❌ Error procesando la interacción. Inténtalo nuevamente en unos segundos.';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followup.send({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        console.error('❌ No se pudo enviar mensaje de error:', replyError);
      }
    }
  });

  // Manejo de errores
  client.on('error', error => {
    console.error('❌ Error del cliente Discord:', error);
  });

  client.on('warn', info => {
    console.warn('⚠️ Advertencia Discord:', info);
  });

  // Reconexión automática
  client.on('disconnect', () => {
    console.warn('⚠️ Bot desconectado. Intentando reconectar...');
  });
}

async function setupAttendancePanel(message) {
  try {
    const embed = new EmbedBuilder()
      .setTitle('🕐 SISTEMA DE CONTROL DE ASISTENCIA')
      .setDescription('**Registra tus eventos de trabajo con un solo clic:**')
      .setColor(0xffd700)
      .addFields([
        {
          name: '🟢 LOGIN - Entrada/Inicio de jornada',
          value: 'Presionarlo **apenas empieces tu turno** de trabajo.\nDebe ser lo **primero que hagas** al conectarte.\n⚠️ Si lo haces tarde, el sistema te registrará como **"Tarde"**.',
          inline: false
        },
        {
          name: '⏸️ BREAK - Inicio de pausa/descanso',
          value: 'Presionarlo **cada vez que te ausentes** del puesto (baño, comer, personal).\n❌ **No usarlo** si vas a estar solo 1-2 minutos.\n✅ **Solo para pausas de más de 5 minutos**.',
          inline: false
        },
        {
          name: '▶️ LOGOUT BREAK - Fin de pausa/vuelta al trabajo',
          value: 'Presionarlo **apenas vuelvas** de la pausa.\nEsto marca que estás **nuevamente disponible y activo**.',
          inline: false
        },
        {
          name: '🔴 LOGOUT - Salida/Fin de jornada + Reporte de Ventas',
          value: 'Presionarlo **al finalizar** tu turno.\n📋 **Se abrirá un formulario** para reportar ventas del día.\n⚠️ **OBLIGATORIO** completar el reporte de ventas.',
          inline: false
        },
        {
          name: '📋 REGLAS IMPORTANTES',
          value: '• Los botones se deben usar en **orden lógico**: `Login → Break → Logout Break → Logout`\n• **No marcar** un Break sin luego marcar un Logout Break\n• **El Logout incluye** el reporte obligatorio de ventas\n• Usar siempre desde el **mismo dispositivo** y cuenta de Discord asignada\n• **Activa los mensajes directos** para recibir confirmaciones',
          inline: false
        }
      ])
      .setFooter({ 
        text: '📧 Las confirmaciones llegan por DM | ⏰ Hora de Lima | 📊 Una fila por usuario',
        iconURL: message.guild?.iconURL() || null
      })
      .setTimestamp();

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
    
    // Eliminar comando para mantener limpio
    try {
      await message.delete();
    } catch (error) {
      console.warn('⚠️ No se pudo eliminar el mensaje de comando');
    }

    console.log('✅ Panel de asistencia configurado exitosamente');
  } catch (error) {
    console.error('❌ Error configurando panel:', error);
    await message.reply('❌ Error configurando el panel de asistencia.').catch(() => {});
  }
}

async function handleButtonInteraction(interaction) {
  const { customId, user, guild, channel } = interaction;
  console.log(`🔘 Botón presionado: ${customId} por ${user.username}`);
  
  try {
    if (customId === 'attendance_logout') {
      // Modal para logout con ventas
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
        .setPlaceholder('Ejemplo: 150.50')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(20);

      const fansSuscritosInput = new TextInputBuilder()
        .setCustomId('fans_suscritos')
        .setLabel('Fans Suscritos:')
        .setPlaceholder('Ejemplo: 25')
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

    // Mapeo de otros botones
    const actionMap = {
      'attendance_login': { action: 'login', emoji: '🟢', name: 'Login', color: 0x00ff00 },
      'attendance_break': { action: 'break', emoji: '⏸️', name: 'Break', color: 0x0099ff },
      'attendance_logout_break': { action: 'logout_break', emoji: '▶️', name: 'Logout Break', color: 0x9900ff }
    };

    const config = actionMap[customId];
    if (!config) {
      console.warn(`⚠️ CustomId desconocido: ${customId}`);
      return;
    }

    // Respuesta inmediata
    await interaction.reply({
      content: `${config.emoji} **${config.name}** procesando...`,
      ephemeral: true
    });

    // Enviar a Google Sheets
    const success = await sendToGoogleSheets(user, config.action, guild, channel);
    
    // Crear embed de confirmación
    const embed = new EmbedBuilder()
      .setTitle(`${config.emoji} ${config.name} Registrado`)
      .setDescription(`**${config.name} registrado exitosamente**`)
      .setColor(config.color)
      .addFields([
        { name: '👤 Usuario', value: `<@${user.id}>`, inline: true },
        { name: '⏰ Hora (Lima)', value: `\`${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}\``, inline: true }
      ])
      .setTimestamp();

    if (success) {
      embed.setFooter({ text: '✅ Registro actualizado en Google Sheets' });
    } else {
      embed.setFooter({ text: '⚠️ Error guardando en Google Sheets' });
    }

    const dmMessage = `${config.emoji} **${config.name}** registrado ${success ? 'exitosamente' : 'localmente'}.`;

    // Enviar por DM
    try {
      await user.send({ content: dmMessage, embeds: [embed] });
      await interaction.editReply({
        content: `${config.emoji} **${config.name}** registrado exitosamente. Confirmación enviada por DM.`
      });
    } catch (dmError) {
      console.warn('⚠️ No se pudo enviar DM:', dmError.message);
      await interaction.editReply({
        content: `${config.emoji} **${config.name}** registrado exitosamente.\n💡 Activa los DMs para recibir confirmaciones privadas.`
      });
    }

    console.log(`✅ ${config.name} registrado para ${user.username}`);

  } catch (error) {
    console.error(`❌ Error en botón ${customId}:`, error);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ Error procesando **${customId}**. Inténtalo nuevamente.`,
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('❌ Error enviando respuesta de error:', replyError);
    }
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId !== 'logout_ventas_modal') return;

  try {
    console.log(`📝 Modal de ventas enviado por ${interaction.user.username}`);
    
    // Respuesta inmediata
    await interaction.reply({
      content: '🔴 **Procesando logout y reporte de ventas...** ⏳',
      ephemeral: true
    });

    // Obtener datos del modal
    const modelo = interaction.fields.getTextInputValue('modelo');
    const montoBrutoStr = interaction.fields.getTextInputValue('monto_bruto').replace(/[$,]/g, '').trim();
    const fansSuscritosStr = interaction.fields.getTextInputValue('fans_suscritos').replace(/[#,]/g, '').trim();

    // Validaciones
    const montoBruto = parseFloat(montoBrutoStr);
    if (isNaN(montoBruto) || montoBruto < 0) {
      await interaction.editReply({ 
        content: '❌ **Error**: El monto bruto debe ser un número válido mayor o igual a 0.' 
      });
      return;
    }

    const montoNeto = montoBruto * 0.80;

    const fansSuscritos = parseInt(fansSuscritosStr);
    if (isNaN(fansSuscritos) || fansSuscritos < 0) {
      await interaction.editReply({ 
        content: '❌ **Error**: Los fans suscritos deben ser un número entero mayor o igual a 0.' 
      });
      return;
    }

    // Datos de ventas
    const ventasData = { 
      modelo, 
      monto_bruto: montoBruto, 
      monto_neto: montoNeto, 
      fans_suscritos: fansSuscritos 
    };

    // Enviar a Google Sheets
    const success = await sendToGoogleSheets(
      interaction.user,
      'logout',
      interaction.guild,
      interaction.channel,
      ventasData
    );

    // Crear embed
    const embed = new EmbedBuilder()
      .setTitle('🔴 Logout y Ventas Registrados')
      .setDescription('**Jornada finalizada con reporte de ventas**')
      .setColor(0xff0000)
      .addFields([
        { name: '👤 Usuario', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Modelo', value: `\`${modelo}\``, inline: true },
        { name: '💵 Monto Bruto', value: `\`$${montoBruto.toLocaleString('en-US', { minimumFractionDigits: 2 })}\``, inline: true },
        { name: '💰 Monto Neto (80%)', value: `\`$${montoNeto.toLocaleString('en-US', { minimumFractionDigits: 2 })}\``, inline: true },
        { name: '👥 Fans Suscritos', value: `\`${fansSuscritos.toLocaleString()}\``, inline: true },
        { name: '⏰ Hora (Lima)', value: `\`${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}\``, inline: true }
      ])
      .setTimestamp();

    if (success) {
      embed.setFooter({ text: '✅ Logout y ventas registrados en Google Sheets' });
    } else {
      embed.setFooter({ text: '⚠️ Error guardando en Google Sheets' });
    }

    await interaction.editReply({
      content: success ? 
        '🔴 **Logout registrado exitosamente con reporte de ventas**' : 
        '⚠️ **Logout registrado localmente** (error con Google Sheets)',
      embeds: [embed]
    });

    // Enviar por DM
    try {
      await interaction.user.send({
        content: '🔴 **Logout y reporte de ventas registrado**',
        embeds: [embed]
      });
    } catch (dmError) {
      console.warn('⚠️ No se pudo enviar DM de logout');
    }

    console.log(`✅ Logout con ventas registrado para ${interaction.user.username}`);

  } catch (error) {
    console.error('❌ Error en modal de logout:', error);
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: '❌ **Error procesando logout**. Inténtalo nuevamente.'
        });
      }
    } catch (editError) {
      console.error('❌ Error editando respuesta de modal:', editError);
    }
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

    console.log(`📊 Enviando a Google Sheets: ${user.username} - ${action}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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
        console.log(`✅ Google Sheets actualizado: ${user.username} - ${action}`);
        return true;
      } else {
        console.error('❌ Google Sheets rechazó los datos:', result);
        return false;
      }
    } else {
      console.error(`❌ Google Sheets HTTP ${response.status}`);
      return false;
    }

  } catch (error) {
    console.error('❌ Error enviando a Google Sheets:', error.message);
    return false;
  }
}

async function showStatus(message) {
  try {
    const embed = new EmbedBuilder()
      .setTitle('📊 Estado del Sistema de Asistencia')
      .setDescription('Sistema funcionando en Netlify Functions')
      .setColor(0x00ff00)
      .addFields([
        { name: '🤖 Bot', value: `✅ Conectado como ${client.user.tag}`, inline: true },
        { name: '🏠 Servidores', value: `${client.guilds.cache.size}`, inline: true },
        { name: '⏰ Uptime', value: `${Math.round((Date.now() - client.readyTimestamp) / 1000)}s`, inline: true },
        { name: '📊 Google Sheets', value: process.env.GOOGLE_SHEETS_WEBHOOK_URL ? '✅ Configurado' : '❌ No configurado', inline: true },
        { name: '🔗 Latencia', value: `${Math.round(client.ws.ping)}ms`, inline: true },
        { name: '📝 Última actividad', value: `<t:${Math.floor(lastActivity / 1000)}:R>`, inline: true }
      ])
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ Error en comando status:', error);
    await message.reply('❌ Error mostrando el estado.').catch(() => {});
  }
}

// Exportar cliente para otras funciones
module.exports = { client };