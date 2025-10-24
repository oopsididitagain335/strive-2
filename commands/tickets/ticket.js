import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import Ticket from '../../models/Ticket.js'; // ✅ fixed path

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create a new private support ticket.');

export async function execute(interaction) {
  const { guild, user } = interaction;

  if (!guild) {
    return interaction.reply({
      content: '❌ This command can only be used inside a server.',
      ephemeral: true,
    });
  }

  // Check for existing open ticket
  const existing = await Ticket.findOne({ guildId: guild.id, userId: user.id, closed: false });
  if (existing) {
    const existingChannel = guild.channels.cache.get(existing.channelId);
    if (existingChannel) {
      return interaction.reply({
        content: `❌ You already have an open ticket: ${existingChannel}`,
        ephemeral: true,
      });
    } else {
      // Channel was deleted → mark as closed
      existing.closed = true;
      await existing.save();
    }
  }

  // Find or create a "Tickets" category
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
      console.error('❌ Failed to create ticket category:', err);
      return interaction.reply({
        content: '❌ Could not create ticket category. Check my permissions.',
        ephemeral: true,
      });
    }
  }

  // Create ticket channel
  const safeName = user.username.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
  const channelName = `ticket-${safeName}`;

  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Ticket for ${user.tag} (${user.id})`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ],
    });

    // Save ticket in MongoDB
    await Ticket.create({
      guildId: guild.id,
      userId: user.id,
      channelId: channel.id,
      closed: false,
      createdAt: new Date(),
    });

    // Embed
    const embed = new EmbedBuilder()
      .setTitle('🎟️ Support Ticket')
      .setDescription(`Hi ${user}, please describe your issue below. A staff member will assist you shortly.`)
      .setColor(0x00aaff)
      .setTimestamp();

    // Button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });

    return interaction.reply({
      content: `✅ Your ticket has been created: ${channel}`,
      ephemeral: true,
    });
  } catch (err) {
    console.error('❌ Failed to create ticket channel:', err);
    return interaction.reply({
      content: '❌ Failed to create your ticket. Check my permissions.',
      ephemeral: true,
    });
  }
}
