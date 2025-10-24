import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
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
        name: `ticket-${interaction.user.username}-${crypto.randomBytes(4).toString('hex')}`,
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

    const token = `${interaction.guild.id}-${crypto.randomBytes(16).toString('hex')}`;
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

    const url = `${process.env.BASE_URL}/setup.html?token=${encodeURIComponent(token)}`;

    await interaction.reply({
      content: `🛠️ Configure your ticket panel here:\n${url}`,
      ephemeral: true,
    });
  }
}

// API handler for setup info (to be used by setup.html)
export async function handleSetupInfo(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const client = req.client; // Assume client is passed via middleware
  if (!client.strive?.ticketTokens?.has(token)) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const tokenData = client.strive.ticketTokens.get(token);
  if (tokenData.expiresAt < Date.now()) {
    client.strive.ticketTokens.delete(token);
    return res.status(400).json({ error: 'Token expired' });
  }

  res.json({
    bot: { tag: client.user.tag, id: client.user.id },
    guild: { id: tokenData.guildId, name: tokenData.guildName },
    channels: tokenData.channels,
  });
}

// API handler for saving panel config
export async function handleSavePanel(req, res) {
  const { token, channelId, panelMessage, embedColor } = req.body;
  if (!token || !channelId) return res.status(400).json({ error: 'Missing token or channel ID' });

  const client = req.client;
  if (!client.strive?.ticketTokens?.has(token)) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const tokenData = client.strive.ticketTokens.get(token);
  if (tokenData.expiresAt < Date.now()) {
    client.strive.ticketTokens.delete(token);
    return res.status(400).json({ error: 'Token expired' });
  }

  if (tokenData.guildId !== token.split('-')[0]) {
    return res.status(400).json({ error: 'Token does not match guild' });
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.guildId !== tokenData.guildId) {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    const embed = new EmbedBuilder()
      .setTitle('Support Ticket')
      .setDescription(panelMessage || 'Click the button below to create a support ticket.')
      .setColor(embedColor || '#5865F2')
      .setTimestamp();

    await channel.send({
      embeds: [embed],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Create Ticket',
              custom_id: `create_ticket_${tokenData.guildId}`,
            },
          ],
        },
      ],
    });

    client.strive.ticketTokens.delete(token);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send panel' });
  }
}
