import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create or manage support tickets') // Global description
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
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    try {
      // Ensure the bot has permission to create threads
      if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.CreatePrivateThreads)) {
        return interaction.reply({ content: '❌ I lack permission to create threads in this channel.', ephemeral: true });
      }

      const thread = await interaction.channel.threads.create({
        name: `ticket-${interaction.user.username}`,
        autoArchiveDuration: 1440, // 24 hours
        type: ChannelType.PrivateThread,
      });

      await thread.members.add(interaction.user.id);
      await interaction.reply({ content: `✅ Ticket created: ${thread}`, ephemeral: true });
    } catch (error) {
      console.error('Error creating ticket:', error);
      await interaction.reply({ content: '❌ Failed to create ticket.', ephemeral: true });
    }

  } else if (sub === 'close') {
    if (!interaction.channel.isThread()) {
      return interaction.reply({ content: '❌ This command must be used in a ticket thread.', ephemeral: true });
    }

    try {
      await interaction.channel.setArchived(true);
      await interaction.reply('🔒 Ticket closed.');
    } catch (error) {
      console.error('Error closing ticket:', error);
      await interaction.reply({ content: '❌ Failed to close ticket.', ephemeral: true });
    }

  } else if (sub === 'panel') {
    // ✅ Restrict this subcommand to admins only
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You lack permission to use this command.', ephemeral: true });
    }

    try {
      // Generate a unique token for dashboard setup
      const token = require('crypto').randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

      // Store token in memory (consider a database for production)
      if (!interaction.client.strive) interaction.client.strive = {};
      if (!interaction.client.strive.ticketTokens) interaction.client.strive.ticketTokens = new Map();
      interaction.client.strive.ticketTokens.set(token, {
        guildId: interaction.guild?.id,
        userId: interaction.user.id,
        channelId: interaction.channel.id,
        expiresAt,
      });

      const baseUrl = process.env.BASE_URL || 'https://solbot.store';
      const url = `${baseUrl}/setup.html?token=${token}`;

      await interaction.reply({
        content: `🛠️ Click to configure your ticket panel:\n${url}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error generating panel:', error);
      await interaction.reply({ content: '❌ Failed to generate ticket panel.', ephemera
