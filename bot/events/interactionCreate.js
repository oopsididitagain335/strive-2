import pkg from 'discord.js';
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionResponseFlags } = pkg;
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction, client) {
  // Handle button interactions for ticket system
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('create_ticket_')) {
      try {
        await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });

        // Find or create the "Strive Tickets" category
        let category = interaction.guild.channels.cache.find(
          ch => ch.type === ChannelType.GuildCategory && ch.name === 'Strive Tickets'
        );

        if (!category) {
          category = await interaction.guild.channels.create({
            name: 'Strive Tickets',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: interaction.guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
              },
              {
                id: client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
              },
              {
                id: interaction.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
              },
            ],
          });
        }

        // Create the ticket channel
        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}-${crypto.randomBytes(4).toString('hex')}`,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            },
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
            },
          ],
        });

        // Create ticket embed
        const ticketEmbed = new EmbedBuilder()
          .setTitle('Support Ticket')
          .setDescription('Welcome to your support ticket. A staff member will assist you shortly.')
          .setColor('#5865F2')
          .setTimestamp();

        // Create ticket buttons
        const ticketButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_ticket_${ticketChannel.id}`)
            .setLabel('Claim')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`close_ticket_${ticketChannel.id}`)
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`reminder_ticket_${ticketChannel.id}`)
            .setLabel('Reminder')
            .setStyle(ButtonStyle.Secondary)
        );

        // Send ticket embed with buttons
        await ticketChannel.send({ embeds: [ticketEmbed], components: [ticketButtons] });

        await interaction.followUp({
          content: `✅ Ticket created: ${ticketChannel}`,
          flags: InteractionResponseFlags.Ephemeral,
        });

        logger.info('TICKET_CREATED', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          channelId: ticketChannel.id,
        });
      } catch (error) {
        console.error('Ticket creation error:', error);
        try {
          await interaction.followUp({
            content: '❌ Failed to create ticket.',
            flags: InteractionResponseFlags.Ephemeral,
          });
        } catch (followUpError) {
          console.error('Follow-up error:', followUpError);
        }
        logger.error('TICKET_CREATION_ERROR', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });
      }
    } else if (interaction.customId.startsWith('close_ticket_')) {
      try {
        await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });

        const channel = interaction.channel;
        if (!channel.isTextBased()) {
          await interaction.followUp({
            content: '❌ This command must be used in a ticket channel.',
            flags: InteractionResponseFlags.Ephemeral,
          });
          return;
        }

        const hasPermission = interaction.member.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels);
        if (!hasPermission) {
          await interaction.followUp({
            content: '❌ You do not have permission to close this ticket.',
            flags: InteractionResponseFlags.Ephemeral,
          });
          return;
        }

        await channel.delete();
        logger.info('TICKET_CLOSED', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          channelId: channel.id,
        });
      } catch (error) {
        console.error('Ticket close error:', error);
        try {
          await interaction.followUp({
            content: '❌ Failed to close ticket.',
            flags: InteractionResponseFlags.Ephemeral,
          });
        } catch (followUpError) {
          console.error('Follow-up error:', followUpError);
        }
        logger.error('TICKET_CLOSE_ERROR', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });
      }
    } else if (interaction.customId.startsWith('claim_ticket_')) {
      try {
        await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });

        const channel = interaction.channel;
        if (!channel.isTextBased()) {
          await interaction.followUp({
            content: '❌ This command must be used in a ticket channel.',
            flags: InteractionResponseFlags.Ephemeral,
          });
          return;
        }

        const hasPermission = interaction.member.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels);
        if (!hasPermission) {
          await interaction.followUp({
            content: '❌ You do not have permission to claim this ticket.',
            flags: InteractionResponseFlags.Ephemeral,
          });
          return;
        }

        await channel.send({
          content: `${interaction.user} has claimed this ticket.`,
        });

        await interaction.followUp({
          content: '✅ Ticket claimed.',
          flags: InteractionResponseFlags.Ephemeral,
        });

        logger.info('TICKET_CLAIMED', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          channelId: channel.id,
        });
      } catch (error) {
        console.error('Ticket claim error:', error);
        try {
          await interaction.followUp({
            content: '❌ Failed to claim ticket.',
            flags: InteractionResponseFlags.Ephemeral,
          });
        } catch (followUpError) {
          console.error('Follow-up error:', followUpError);
        }
        logger.error('TICKET_CLAIM_ERROR', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });
      }
    } else if (interaction.customId.startsWith('reminder_ticket_')) {
      try {
        await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });

        const channel = interaction.channel;
        if (!channel.isTextBased()) {
          await interaction.followUp({
            content: '❌ This command must be used in a ticket channel.',
            flags: InteractionResponseFlags.Ephemeral,
          });
          return;
        }

        // Assume the ticket opener is the user with view permissions (excluding the bot)
        const opener = channel.permissionOverwrites.cache.find(
          po => po.type === 'member' && po.id !== client.user.id
        );
        if (!opener) {
          await interaction.followUp({
            content: '❌ Could not identify ticket opener.',
            flags: InteractionResponseFlags.Ephemeral,
          });
          return;
        }

        const user = await client.users.fetch(opener.id);
        await user.send({
          content: `Hello! Please check your support ticket in ${interaction.guild.name}: ${channel}`,
        });

        await interaction.followUp({
          content: '✅ Reminder sent to ticket opener.',
          flags: InteractionResponseFlags.Ephemeral,
        });

        logger.info('TICKET_REMINDER_SENT', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          channelId: channel.id,
          openerId: opener.id,
        });
      } catch (error) {
        console.error('Ticket reminder error:', error);
        try {
          await interaction.followUp({
            content: '❌ Failed to send reminder.',
            flags: InteractionResponseFlags.Ephemeral,
          });
        } catch (followUpError) {
          console.error('Follow-up error:', followUpError);
        }
        logger.error('TICKET_REMINDER_ERROR', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });
      }
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;

  // Ensure bot is ready
  if (!client.isReady()) {
    logger.warn('BOT_NOT_READY', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    return;
  }

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn('COMMAND_NOT_FOUND', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    return;
  }

  // Check if user has permission to run the command
  if (command.permissions && !interaction.member.permissions.has(command.permissions)) {
    logger.info('COMMAND_PERMISSION_DENIED', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    await interaction.reply({
      content: '❌ You do not have permission to use this command.',
      flags: InteractionResponseFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction, client);
    logger.info('COMMAND_EXECUTED', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
    });
  } catch (error) {
    logger.error('COMMAND_ERROR', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });

    const errorMessage = '❌ An error occurred while running this command.';
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, flags: InteractionResponseFlags.Ephemeral });
      } else {
        await interaction.reply({ content: errorMessage, flags: InteractionResponseFlags.Ephemeral });
      }
    } catch (followUpError) {
      logger.error('COMMAND_FOLLOWUP_ERROR', {
        command: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        error: followUpError.message,
      });
      // Fallback to logging if interaction response fails (e.g., timed out)
    }
  }
}
