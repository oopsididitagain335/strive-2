import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create or manage support tickets')
  .addSubcommand(sc =>
    sc
      .setName('create')
      .setDescription('Open a new ticket')
  )
  .addSubcommand(sc =>
    sc
      .setName('close')
      .setDescription('Close the current ticket')
  )
  .addSubcommand(sc =>
    sc
      .setName('panel')
      .setDescription('Generate a ticket panel (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels) // Corrected
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const thread = await interaction.channel.threads.create({
      name: `ticket-${interaction.user.username}`,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
    });
    await thread.members.add(interaction.user.id);
    await interaction.reply({ content: `✅ Ticket: ${thread}`, ephemeral: true });

  } else if (sub === 'close') {
    if (!interaction.channel.isThread()) {
      return interaction.reply({ content: '❌ Use in a ticket thread.', ephemeral: true });
    }
    await interaction.channel.setArchived(true);
    await interaction.reply('🔒 Ticket closed.');

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

    const baseUrl = process.env.BASE_URL || 'https://solbot.store';
    const url = `${baseUrl}/setup.html?token=${token}`;

    await interaction.reply({
      content: `🛠️ Click to configure your ticket panel:\n${url}`,
      ephemeral: true
    });
  }
}
