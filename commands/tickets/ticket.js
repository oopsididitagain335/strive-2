// bot/commands/ticket.js
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { encryptJSON } from '../../utils/crypto.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create/manage support tickets')
  .addSubcommand(sc => sc.setName('panel').setDescription('Generate a ticket panel (admin only)'))
  .addSubcommand(sc => sc.setName('create').setDescription('Open a new ticket'))
  .addSubcommand(sc => sc.setName('close').setDescription('Close the current ticket'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'panel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You lack Manage Channels permission.', ephemeral: true });
    }

    const secret = process.env.ENCRYPTION_SECRET;
    if (!secret) {
      console.error('ENCRYPTION_SECRET missing');
      return interaction.reply({ content: '❌ Server misconfigured (missing secret).', ephemeral: true });
    }

    // Build payload with guildId, requesting user id, expiresAt, and a channels snapshot
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    const channels = interaction.guild.channels.cache
      .filter(ch => ch.type === ChannelType.GuildText && ch.viewable)
      .map(ch => ({ id: ch.id, name: ch.name }));

    const payload = {
      guildId: interaction.guild.id,
      guildName: interaction.guild.name,
      userId: interaction.user.id,
      expiresAt,
      channels,
    };

    const token = encryptJSON(payload, secret);
    const base = process.env.BASE_URL || process.env.REDIRECT_BASE || 'http://localhost:10000';
    const url = `${base}/setup.html?token=${encodeURIComponent(token)}`;

    await interaction.reply({ content: `🛠️ Open the panel builder: ${url}`, ephemeral: true });
    return;
  }

  // create / close subcommands (basic implementations)
  if (sub === 'create') {
    try {
      const thread = await interaction.channel.threads.create({
        name: `ticket-${interaction.user.username}`,
        autoArchiveDuration: 1440,
        type: 12, // PrivateThread
      });
      await thread.members.add(interaction.user.id);
      await interaction.reply({ content: `✅ Ticket created: ${thread.url || thread.id}`, ephemeral: true });
    } catch (err) {
      console.error('ticket create error', err);
      await interaction.reply({ content: '❌ Failed to create ticket.', ephemeral: true });
    }
    return;
  }

  if (sub === 'close') {
    if (!interaction.channel.isThread()) {
      return interaction.reply({ content: '❌ Use this command inside a ticket thread.', ephemeral: true });
    }
    try {
      await interaction.channel.setArchived(true);
      await interaction.reply({ content: '🔒 Ticket closed.', ephemeral: true });
    } catch (err) {
      console.error('ticket close error', err);
      await interaction.reply({ content: '❌ Failed to close ticket.', ephemeral: true });
    }
    return;
  }
}
