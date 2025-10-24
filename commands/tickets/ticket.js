import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import crypto from 'crypto';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create or manage support tickets')
  .addSubcommand(sc =>
    sc.setName('create').setDescription('Open a new ticket'),
  )
  .addSubcommand(sc =>
    sc.setName('close').setDescription('Close the current ticket'),
  )
  .addSubcommand(sc =>
    sc.setName('panel').setDescription('Generate a ticket panel (admin only)'),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    // ... (same as before)
  } else if (sub === 'close') {
    // ... (same as before)
  } else if (sub === 'panel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You lack permission to use this command.', ephemeral: true });
    }

    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 15 * 60 * 1000;

      if (!interaction.client.strive) interaction.client.strive = {};
      if (!interaction.client.strive.ticketTokens) interaction.client.strive.ticketTokens = new Map();

      // Collect available text channels for the panel builder dropdown
      const channels = interaction.guild.channels.cache
        .filter(ch => ch.type === ChannelType.GuildText && ch.viewable)
        .map(ch => ({ id: ch.id, name: ch.name }));

      interaction.client.strive.ticketTokens.set(token, {
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        expiresAt,
        channels,
      });

      const baseUrl = process.env.BASE_URL || 'https://solbot.store';
      const url = `${baseUrl}/setup.html?token=${token}`;

      await interaction.reply({
        content: `🛠️ Click to configure your ticket panel:\n${url}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error generating panel:', error);
      await interaction.reply({ content: '❌ Failed to generate ticket panel.', ephemeral: true });
    }
  }
}
