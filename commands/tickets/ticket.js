// /commands/utility/ticket.js
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import Ticket from '../../../models/Ticket.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create a new support ticket');

export async function execute(interaction) {
  const { guild, user } = interaction;

  // Check for existing open ticket
  const existing = await Ticket.findOne({ guildId: guild.id, userId: user.id, closed: false });
  if (existing) {
    const existingChannel = guild.channels.cache.get(existing.channelId);
    if (existingChannel) {
      return interaction.reply({
        content: `❌ You already have an open ticket: ${existingChannel}`,
        ephemeral: true,
      });
    }
  }

  // Optional: find or create a "Tickets" category
  let category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket')
  );
  if (!category) {
    try {
      category = await guild.channels.create({
        name: '🎫 Tickets',
        type: ChannelType.GuildCategory,
      });
    } catch (err) {
      console.error('Failed to create ticket category:', err);
      return interaction.reply({
        content: '❌ Could not create ticket category. Check my permissions.',
        ephemeral: true,
      });
    }
  }

  // Create private channel
  const channelName = `ticket-${user.username}`.replace(/[^a-zA-Z0-9-_]/g, '');
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ],
  });

  // Save ticket to database
  await Ticket.create({
    guildId: guild.id,
    userId: user.id,
    channelId: channel.id,
  });

  // Build welcome embed
  const embed = new EmbedBuilder()
    .setTitle('🎟️ Support Ticket')
    .setDescription(`Hi ${user}, please describe your issue below. A staff member will assist you soon.`)
    .setColor(0x00aaff)
    .setTimestamp();

  // Add close button
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });

  await interaction.reply({
    content: `✅ Your ticket has been created: ${channel}`,
    ephemeral: true,
  });
}
