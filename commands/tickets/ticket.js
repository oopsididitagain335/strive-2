import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import crypto from 'crypto';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create or manage support tickets')
  .addSubcommand(sc => sc.setName('create').setDescription('Open a new ticket'))
  .addSubcommand(sc => sc.setName('close').setDescription('Close the current ticket'))
  .addSubcommand(sc => sc.setName('panel').setDescription('Generate a ticket panel (admin only)'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    try {
      const thread = await interaction.channel.threads.create({
        name: `ticket-${interaction.user.username}`,
        autoArchiveDuration: 1440,
        type: ChannelType.PrivateThread,
      });
      await thread.members.add(interaction.user.id);
      await interaction.reply({ content: `✅ Ticket created: ${thread}`, ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '❌ Failed to create ticket.', ephemeral: true });
    }

  } else if (sub === 'close') {
    if (!interaction.channel.isThread())
      return interaction.reply({ content: '❌ Use this inside a ticket thread.', ephemeral: true });

    await interaction.channel.setArchived(true);
    await interaction.reply('🔒 Ticket closed.');

  } else if (sub === 'panel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return interaction.reply({ content: '❌ You lack permission.', ephemeral: true });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

    if (!interaction.client.strive) interaction.client.strive = {};
    if (!interaction.client.strive.ticketTokens) interaction.client.strive.ticketTokens = new Map();

    const channels = interaction.guild.channels.cache
      .filter(ch => ch.type === ChannelType.GuildText && ch.viewable)
      .map(ch => ({ id: ch.id, name: ch.name }));

    interaction.client.strive.ticketTokens.set(token, {
      guildId: interaction.guild.id,
      guildName: interaction.guild.name,
      userId: interaction.user.id,
      channels,
      expiresAt,
    });

    const url = `${process.env.BASE_URL}/setup.html?token=${token}`;

    await interaction.reply({
      content: `🛠️ Configure your ticket panel here:\n${url}`,
      ephemeral: true,
    });
  }
}
