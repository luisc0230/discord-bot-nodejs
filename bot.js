const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');

// Variables de entorno
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
const LOG_CHANNEL_ID = process.env.DISCORD_LOG_CHANNEL_ID;

if (!DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN no configurado');
  process.exit(1);
}

// Cliente Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// =========================
// FUNCIONES AUXILIARES
// =========================

/**
 * Envía datos a Google Sheets
 */
async function sendToGoogleSheets(user, action, guild, channel, ventasData = null) {
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

    console.log('📤 Enviando a Google Sheets:', { user: user.username, action });

    const response = await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, data, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (response.status === 200 && response.data.result === 'success') {
      console.log(`✅ Enviado a Google Sheets: ${user.username} - ${action}`);
      return true;
    } else {
      console.error('❌ Error respuesta Google Sheets:', response.data);
      return false;
    }

  } catch (error) {
    console.error('❌ Error enviando a Google Sheets:', error.message);
    return false;
  }
}

/**
 * Crea embed para eventos de asistencia
 */
function createEventEmbed(user, eventName, emoji, color, guild, channel) {
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${eventName} Registrado`)
    .setDescription(`**${eventName} registrado exitosamente**`)
    .setColor(color)
    .addFields([
      { name: '👤 Usuario', value: `<@${user.id}>`, inline: true },
      { name: '⏰ Hora (Lima)', value: `\`${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}\``, inline: true }
    ])
    .setTimestamp();

  if (guild && channel) {
    embed.addFields([
      { name: '📍 Ubicación', value: `**${guild.name}** - #${channel.name}`, inline: false }
    ]);
  }

  return embed;
}

// =========================
// EVENT HANDLERS
// =========================

client.once('ready', () => {
  console.log('='*50);
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  console.log(`🏠 Servidores: ${client.guilds.cache.size}`);
  console.log(`📊 Google Sheets: ${GOOGLE_SHEETS_WEBHOOK_URL ? '✅ Configurado' : '❌ No configurado'}`);
  console.log('='*50);
  
  // Establecer actividad del bot
  client.user.setActivity('Control de Asistencia 24/7', { type: 'WATCHING' });
});

// Manejo de mensajes y comandos
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const content = message.content.toLowerCase();
  
  // Comando setup
  if (content === '!setup_attendance' || content === '!setup') {
    if (!message.member?.permissions.has('Administrator')) {
      return message.reply('❌ Necesitas permisos de administrador para usar este comando.');
    }
    await setupAttendancePanel(message);
  }
  
  // Comando status
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
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followup.send({
          content: '❌ Error procesando la interacción. Inténtalo nuevamente.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ Error procesando la interacción. Inténtalo nuevamente.',
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('❌ Error enviando mensaje de error:', err);
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

// =========================
// FUNCIONES DEL BOT
// =========================

/**
 * Configura el panel de asistencia
 */
async function setupAttendancePanel(message) {
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
    });

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
}

/**
 * Maneja las interacciones de botones
 */
async function handleButtonInteraction(interaction) {
  const { customId, user, guild, channel } = interaction;
  
  // Botón de logout - mostrar modal
  if (customId === 'attendance_logout') {
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

  // Mapeo de acciones para otros botones
  const actionMap = {
    'attendance_login': { action: 'login', emoji: '🟢', name: 'Login', color: 0x00ff00 },
    'attendance_break': { action: 'break', emoji: '⏸️', name: 'Break', color: 0x0099ff },
    'attendance_logout_break': { action: 'logout_break', emoji: '▶️', name: 'Logout Break', color: 0x9900ff }
  };

  const config = actionMap[customId];
  if (!config) return;

  try {
    // Respuesta inmediata
    await interaction.reply({
      content: `${config.emoji} **${config.name}** procesando...`,
      ephemeral: true
    });

    // Enviar a Google Sheets
    const success = await sendToGoogleSheets(user, config.action, guild, channel);
    
    // Crear embed
    const embed = createEventEmbed(user, config.name, config.emoji, config.color, guild, channel);
    
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
        content: `${config.emoji} **${config.name}** registrado. Confirmación enviada por DM.`
      });
    } catch (dmError) {
      await interaction.editReply({
        content: `${config.emoji} **${config.name}** registrado.\n💡 Activa los DMs para confirmaciones privadas.`
      });
    }

    // Enviar al canal de logs si está configurado
    if (LOG_CHANNEL_ID && success) {
      try {
        const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel && logChannel !== channel) {
          await logChannel.send({ embeds: [embed] });
        }
      } catch (logError) {
        console.error('❌ Error enviando a canal de logs:', logError);
      }
    }

  } catch (error) {
    console.error(`❌ Error en botón ${config.name}:`, error);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: `❌ Error procesando **${config.name}**. Inténtalo nuevamente.`,
        ephemeral: true
      });
    }
  }
}

/**
 * Maneja el envío del modal de logout
 */
async function handleModalSubmit(interaction) {
  if (interaction.customId !== 'logout_ventas_modal') return;

  try {
    // Respuesta inmediata
    await interaction.reply({
      content: '🔴 **Procesando logout y reporte de ventas...** ⏳',
      ephemeral: true
    });

    // Obtener valores del modal
    const modelo = interaction.fields.getTextInputValue('modelo');
    const montoBrutoStr = interaction.fields.getTextInputValue('monto_bruto').replace(/[$,]/g, '').trim();
    const fansSuscritosStr = interaction.fields.getTextInputValue('fans_suscritos').replace(/[#,]/g, '').trim();

    // Validar monto bruto
    const montoBruto = parseFloat(montoBrutoStr);
    if (isNaN(montoBruto) || montoBruto < 0) {
      await interaction.editReply({ 
        content: '❌ **Error**: El monto bruto debe ser un número válido mayor o igual a 0.' 
      });
      return;
    }

    // Calcular monto neto (80% del bruto)
    const montoNeto = montoBruto * 0.80;

    // Validar fans suscritos
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

    // Crear embed de respuesta
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

    // Actualizar respuesta
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
      console.warn('⚠️ No se pudo enviar DM al usuario');
    }

    // Enviar al canal de logs si está configurado
    if (LOG_CHANNEL_ID && success) {
      try {
        const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
          await logChannel.send({ embeds: [embed] });
        }
      } catch (logError) {
        console.error('❌ Error enviando a canal de logs:', logError);
      }
    }

  } catch (error) {
    console.error('❌ Error en modal de logout:', error);
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: '❌ **Error procesando logout**. Inténtalo nuevamente.'
        });
      } else {
        await interaction.reply({
          content: '❌ **Error procesando logout**. Inténtalo nuevamente.',
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('❌ Error enviando mensaje de error:', err);
    }
  }
}

/**
 * Muestra el estado del sistema
 */
async function showStatus(message) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Estado del Sistema de Asistencia')
    .setDescription('Sistema funcionando en Netlify Functions')
    .setColor(0x00ff00)
    .addFields([
      { name: '🤖 Bot', value: `✅ Conectado como ${client.user.tag}`, inline: true },
      { name: '🏠 Servidores', value: `${client.guilds.cache.size}`, inline: true },
      { name: '⏰ Uptime', value: `${Math.floor(process.uptime())} segundos`, inline: true },
      { name: '📊 Google Sheets', value: GOOGLE_SHEETS_WEBHOOK_URL ? '✅ Configurado' : '❌ No configurado', inline: true },
      { name: '📝 Canal Logs', value: LOG_CHANNEL_ID ? '✅ Configurado' : '❌ No configurado', inline: true },
      { name: '🎮 Botones', value: '🟢 Login\n⏸️ Break\n▶️ Logout Break\n🔴 Logout + Ventas', inline: true }
    ])
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

// =========================
// EXPORTAR CLIENTE
// =========================
module.exports = { client, DISCORD_TOKEN };

// Conectar al bot si se ejecuta directamente
if (require.main === module) {
  client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Error conectando el bot:', error);
    process.exit(1);
  });
}