const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// =========================
// CONFIGURACIÓN BÁSICA
// =========================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
const LOG_CHANNEL_ID = process.env.DISCORD_LOG_CHANNEL_ID || null;

if (!DISCORD_TOKEN) {
    console.error('❌ ERROR: Token de Discord no encontrado en las variables de entorno');
    process.exit(1);
}

if (!GOOGLE_SHEETS_WEBHOOK_URL) {
    console.warn('⚠️  GOOGLE_SHEETS_WEBHOOK_URL no configurado. Los eventos no se guardarán en Google Sheets.');
}

// Zona horaria de Lima
const TZ_OFFSET = -5; // UTC-5 para Lima

// =========================
// FUNCIONES AUXILIARES
// =========================
function getLimaTime() {
    const now = new Date();
    const limaTime = new Date(now.getTime() + (TZ_OFFSET * 60 * 60 * 1000));
    return limaTime;
}

function formatLimaTime(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

// =========================
// FUNCIÓN PARA GOOGLE SHEETS
// =========================
async function actualizarRegistroUsuario(user, action, guild, channel, ventasData = null) {
    if (!GOOGLE_SHEETS_WEBHOOK_URL) {
        console.warn('⚠️  No se puede enviar a Google Sheets: URL no configurada');
        return false;
    }

    try {
        const timestamp = getLimaTime();
        
        const data = {
            timestamp: timestamp.toISOString(),
            usuario: user.username + '#' + user.discriminator,
            action: action,
            servidor: guild ? guild.name : 'DM/Privado',
            canal: channel ? channel.name : 'Mensaje Directo'
        };

        // Agregar datos de ventas si es logout
        if (action === 'logout' && ventasData) {
            Object.assign(data, ventasData);
        }

        console.log(`🔍 Actualizando registro: ${data.usuario} - ${action}`);
        console.log(`📤 Datos:`, data);

        const response = await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (response.status === 200 && response.data.result === 'success') {
            console.log(`✅ Registro actualizado: ${data.usuario} - ${action}`);
            return true;
        } else {
            console.error(`❌ Error en Google Sheets:`, response.data);
            return false;
        }

    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error('❌ Timeout enviando a Google Sheets (10 segundos)');
        } else {
            console.error('❌ Error enviando a Google Sheets:', error.message);
        }
        return false;
    }
}

function buildEmbed(user, event, channel) {
    const timestamp = formatLimaTime(getLimaTime());
    
    const eventConfig = {
        'Login': { color: 0x00ff00, emoji: '🟢', desc: 'Entrada/Inicio de jornada' },
        'Break': { color: 0x0099ff, emoji: '⏸️', desc: 'Inicio de pausa/descanso' },
        'Logout Break': { color: 0x9900ff, emoji: '▶️', desc: 'Fin de pausa/vuelta al trabajo' },
        'Logout': { color: 0xff0000, emoji: '🔴', desc: 'Salida/Fin de jornada' }
    };
    
    const config = eventConfig[event] || { color: 0x808080, emoji: '📝', desc: event };
    
    const embed = new EmbedBuilder()
        .setTitle(`${config.emoji} ${event} Registrado`)
        .setDescription(`**${config.desc}**`)
        .setColor(config.color)
        .addFields([
            { name: '👤 Usuario', value: `<@${user.id}> (\`${user.username}\`)`, inline: false },
            { name: '⏰ Fecha/Hora (Lima)', value: `\`${timestamp}\``, inline: false }
        ])
        .setFooter({ text: '✅ Registro actualizado en Google Sheets' })
        .setTimestamp();

    if (channel && channel.guild) {
        embed.addFields([
            { name: '📍 Ubicación', value: `**${channel.guild.name}** - #${channel.name}`, inline: false }
        ]);
    }

    return embed;
}

// =========================
// CLIENTE DISCORD
// =========================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// =========================
// EVENTOS DEL BOT
// =========================
client.once('ready', () => {
    console.log('======================================================================');
    console.log(`✅ Bot de Asistencia conectado!`);
    console.log(`📝 Usuario: ${client.user.tag}`);
    console.log(`🏠 Servidores: ${client.guilds.cache.size}`);
    console.log(`📊 Google Sheets: ${GOOGLE_SHEETS_WEBHOOK_URL ? '✅ Configurado' : '❌ No configurado'}`);
    if (GOOGLE_SHEETS_WEBHOOK_URL) {
        console.log(`🔗 URL: ${GOOGLE_SHEETS_WEBHOOK_URL.substring(0, 50)}...`);
    }
    console.log('======================================================================');
    
    // Configurar el estado del bot
    client.user.setActivity('Control de Asistencia 24/7', { type: 'WATCHING' });
});

// =========================
// MANEJO DE COMANDOS
// =========================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    if (command === 'setup_attendance' || command === 'setup') {
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('❌ Necesitas permisos de administrador para usar este comando.');
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🕐 SISTEMA DE CONTROL DE ASISTENCIA')
            .setDescription('**Registra tus eventos de trabajo con un solo clic:**')
            .setColor(0xffd700)
            .addFields([
                {
                    name: '🟢 LOGIN - Entrada/Inicio de jornada',
                    value: 'Presionarlo **apenas empieces tu turno** de trabajo.\nDebe ser lo **primero que hagas** al conectarte.\n⚠️ Si lo haces tarde, el sistema te registrará como **\'Tarde\'**.',
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
            .setFooter({ text: '📧 Las confirmaciones llegan por DM | ⏰ Hora de Lima | 📊 Una fila por usuario' });

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
            // Ignore deletion errors
        }
    }
    
    if (command === 'status') {
        const embed = new EmbedBuilder()
            .setTitle('📊 Estado del Sistema de Asistencia')
            .setColor(0x0099ff)
            .addFields([
                {
                    name: '🔧 Configuración',
                    value: `Bot: ✅ Conectado\nGoogle Sheets: ${GOOGLE_SHEETS_WEBHOOK_URL ? '✅ Configurado' : '❌ No configurado'}\nZona horaria: \`UTC-5 (Lima)\`\nCanal logs: ${LOG_CHANNEL_ID ? '✅ Configurado' : '❌ No configurado'}`,
                    inline: false
                },
                {
                    name: '🎮 Botones Disponibles',
                    value: '🟢 **Login** - Entrada\n⏸️ **Break** - Inicio pausa\n▶️ **Logout Break** - Fin pausa\n🔴 **Logout** - Salida + Reporte ventas',
                    inline: false
                },
                {
                    name: '📋 Sistema Actualizado',
                    value: '• **Una fila por usuario** (no múltiples registros)\n• **Registro unificado** de asistencia y ventas\n• **Modal automático** en logout para ventas',
                    inline: false
                }
            ]);

        await message.reply({ embeds: [embed] });
    }
});

// =========================
// MANEJO DE INTERACCIONES
// =========================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
    }
});

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

        const success = await actualizarRegistroUsuario(user, config.action, guild, channel);
        const embed = buildEmbed(user, config.name, channel);

        const dmMessage = `${config.emoji} **${config.name}** registrado ${success ? 'exitosamente' : 'localmente (error con Google Sheets)'}.`;

        try {
            await user.send({ content: dmMessage, embeds: [embed] });
        } catch (dmError) {
            await interaction.followup.send({
                content: `${config.emoji} <@${user.id}> **${config.name}** registrado.\n💡 Activa los DMs para confirmaciones privadas.`,
                ephemeral: true
            });
        }

        // Log al canal si está configurado
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
            await interaction.followup.send({
                content: '❌ **Error**: El monto bruto debe ser un número válido.',
                ephemeral: true
            });
            return;
        }

        // Calcular monto neto (80% del bruto)
        const montoNeto = montoBruto * 0.80;

        // Validar fans suscritos
        const fansSuscritos = parseInt(fansSuscritosStr);
        if (isNaN(fansSuscritos)) {
            await interaction.followup.send({
                content: '❌ **Error**: Los fans suscritos deben ser un número entero.',
                ephemeral: true
            });
            return;
        }

        // Datos de ventas
        const ventasData = {
            modelo: modelo,
            monto_bruto: montoBruto,
            monto_neto: montoNeto,
            fans_suscritos: fansSuscritos
        };

        // Actualizar registro con logout y datos de ventas
        const success = await actualizarRegistroUsuario(
            interaction.user,
            'logout',
            interaction.guild,
            interaction.channel,
            ventasData
        );

        // Crear embed de confirmación
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
                { name: '⏰ Fecha/Hora', value: `\`${formatLimaTime(getLimaTime())}\``, inline: true }
            ])
            .setFooter({ text: success ? '✅ Logout y ventas registrados en Google Sheets' : '⚠️ Error guardando en Google Sheets' })
            .setTimestamp();

        const statusMessage = success ? 
            '🔴 **Logout registrado exitosamente con reporte de ventas**' : 
            '⚠️ **Logout registrado localmente** (error con Google Sheets)';

        await interaction.editReply({
            content: statusMessage,
            embeds: [embed]
        });

        // Enviar por DM
        try {
            await interaction.user.send({
                content: '🔴 **Logout y reporte de ventas registrado**',
                embeds: [embed]
            });
        } catch (dmError) {
            await interaction.followup.send({
                content: '💡 **Tip**: Activa los mensajes directos para recibir copias de tus registros.',
                ephemeral: true
            });
        }

        // Log al canal si está configurado
        if (LOG_CHANNEL_ID) {
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
                await interaction.followup.send({
                    content: '❌ **Error procesando logout**. El logout puede haberse registrado. Verifica en Google Sheets.',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '❌ **Error procesando logout**. Inténtalo nuevamente.',
                    ephemeral: true
                });
            }
        } catch (followupError) {
            console.error('❌ No se pudo notificar error al usuario:', followupError);
        }
    }
}

// =========================
// MANEJO DE ERRORES
// =========================
client.on('error', error => {
    console.error('❌ Error del cliente Discord:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Error no manejado:', error);
});

// =========================
// INICIAR BOT
// =========================
console.log('🚀 Iniciando bot de control de asistencia (Node.js)...');

client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Error iniciando sesión:', error);
    process.exit(1);
});