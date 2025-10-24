import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import crypto from 'crypto';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create or manage support tickets')
  .addSubcommand(sc => sc.setName('create').setDescription('Open a new ticket'))
  .addSubcommand(sc => sc.setName('panel').setDescription('Generate a ticket panel (admin only)'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    try {
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
              id: interaction.client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
            },
          ],
        });
      }

      // Create the ticket thread
      const thread = await interaction.channel.threads.create({
        name: `ticket-${interaction.user.username}-${crypto.randomBytes(4).toString('hex')}`,
        autoArchiveDuration: 1440,
        type: ChannelType.PrivateThread,
      });

      // Move thread to Strive Tickets category
      await thread.setParent(category.id);
      await thread.members.add(interaction.user.id);

      // Create ticket embed
      const ticketEmbed = new EmbedBuilder()
        .setTitle('Support Ticket')
        .setDescription('Welcome to your support ticket. A staff member will assist you shortly.')
        .setColor('#5865F2')
        .setTimestamp();

      // Create ticket buttons
      const ticketButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_ticket_${thread.id}`)
          .setLabel('Claim')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`close_ticket_${thread.id}`)
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`reminder_ticket_${thread.id}`)
          .setLabel('Reminder')
          .setStyle(ButtonStyle.Secondary)
      );

      // Send ticket embed with buttons to the thread
      await thread.send({ embeds: [ticketEmbed], components: [ticketButtons] });

      // Send default ticket panel to the current channel
      const panelEmbed = new EmbedBuilder()
        .setTitle('Support Ticket Panel')
        .setDescription('Click the button below to create a support ticket.')
        .setColor('#5865F2')
        .setTimestamp();

      const panelButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`create_ticket_${interaction.guild.id}`)
          .setLabel('Create Ticket')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.channel.send({ embeds: [panelEmbed], components: [panelButton] });
      await interaction.reply({ content: `✅ Ticket created: ${thread}`, ephemeral: true });
    } catch (error) {
      console.error('Create error:', error);
      await interaction.reply({ content: '❌ Failed to create ticket.', ephemeral: true });
    }

  } else if (sub === 'panel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You lack permission.', ephemeral: true });
    }

    const token = `${interaction.guild.id}-${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

    if (!interaction.client.strive) interaction.client.strive = {};
    if (!interaction.client.strive.ticketTokens) interaction.client.strive.ticketTokens = new Map();
    console.log('Storing token:', token, 'for guild:', interaction.guild.id, 'at:', new Date().toISOString());

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
    console.log('Generated URL:', url);

    await interaction.reply({
      content: `🛠️ Configure your ticket panel here:\n${url}`,
      ephemeral: true,
    });
  }
}

export async function handleSetupInfo(req, res) {
  const { token } = req.query;
  if (!token) {
    console.log('Missing token at:', new Date().toISOString());
    return res.status(400).json({ error: 'Missing token' });
  }

  const client = req.client;
  if (!client.strive?.ticketTokens?.has(token)) {
    console.log('Invalid token:', token, 'at:', new Date().toISOString());
    return res.status(404).json({ error: 'Invalid token' });
  }

  const tokenData = client.strive.ticketTokens.get(token);
  if (tokenData.expiresAt < Date.now()) {
    console.log('Expired token:', token, 'at:', new Date().toISOString());
    client.strive.ticketTokens.delete(token);
    return res.status(410).json({ error: 'Token expired' });
  }

  const [guildIdFromToken] = token.split('-');
  if (guildIdFromToken !== tokenData.guildId) {
    console.log('Guild mismatch for token:', token, 'Expected:', tokenData.guildId, 'Got:', guildIdFromToken, 'at:', new Date().toISOString());
    return res.status(403).json({ error: 'Token guild mismatch' });
  }

  console.log('Valid token:', token, 'for guild:', tokenData.guildId, 'at:', new Date().toISOString());
  res.json({
    bot: { tag: client.user.tag, id: client.user.id },
    guild: { id: tokenData.guildId, name: tokenData.guildName },
    channels: tokenData.channels,
  });
}

export async function handleSavePanel(req, res) {
  const { token, channelId, panelMessage, embedColor } = req.body;
  if (!token || !channelId) {
    console.log('Missing token or channel ID at:', new Date().toISOString());
    return res.status(400).json({ error: 'Missing token or channel ID' });
  }

  const client = req.client;
  if (!client.strive?.ticketTokens?.has(token)) {
    console.log('Invalid token in save:', token, 'at:', new Date().toISOString());
    return res.status(404).json({ error: 'Invalid or expired token' });
  }

  const tokenData = client.strive.ticketTokens.get(token);
  if (tokenData.expiresAt < Date.now()) {
    console.log('Expired token in save:', token, 'at:', new Date().toISOString());
    client.strive.ticketTokens.delete(token);
    return res.status(410).json({ error: 'Token expired' });
  }

  if (tokenData.guildId !== token.split('-')[0]) {
    console.log('Guild mismatch in save:', token, 'at:', new Date().toISOString());
    return res.status(403).json({ error: 'Token does not match guild' });
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.guildId !== tokenData.guildId) {
      console.log('Invalid channel:', channelId, 'at:', new Date().toISOString());
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
    console.log('Panel sent successfully for token:', token, 'at:', new Date().toISOString());
    res.json({ success: true });
  } catch (error) {
    console.error('Save panel error:', error, 'at:', new Date().toISOString());
    res.status(500).json({ error: 'Failed to send panel' });
  }
}
