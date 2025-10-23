// /commands/tickets/create.js
import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create or manage support tickets')
  .addSubcommand(sc => sc
    .setName('create')
    .setDescription('Open a new support ticket')
    .addStringOption(o => o.setName('reason').setDescription('Reason for ticket').setRequired(false))
  )
  .addSubcommand(sc => sc
    .setName('panel')
    .setDescription('Generate a ticket panel (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const thread = await interaction.channel.threads.create({
      name: `ticket-${interaction.user.username}`,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      invitable: false,
    });

    await thread.members.add(interaction.user.id);
    await thread.send({
      content: `${interaction.user}, a staff member will assist you shortly.`,
      embeds: [{
        title: '🎫 Support Ticket',
        description: reason,
        color: 0x00FF00
      }]
    });

    logger.audit('TICKET_CREATED', {
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      threadId: thread.id
    });

    await interaction.reply({ content: `✅ Ticket created: ${thread}`, ephemeral: true });

  } else if (sub === 'panel') {
    // Generate a unique token for dashboard setup
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

    // Store in memory (or DB for persistence)
    if (!interaction.client.strive) interaction.client.strive = {};
    if (!interaction.client.strive.ticketTokens) interaction.client.strive.ticketTokens = new Map();
    interaction.client.strive.ticketTokens.set(token, {
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      channelId: interaction.channel.id,
      expiresAt
    });

    const baseUrl = process.env.BASE_URL || 'https://strive-dashboard.onrender.com';
    const url = `${baseUrl}/setup.html?token=${token}`;

    await interaction.reply({
      content: `🛠️ Click to configure your ticket panel:\n${url}`,
      ephemeral: true
    });
  }
}
