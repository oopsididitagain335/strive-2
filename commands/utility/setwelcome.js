// /commands/utility/setwelcome.js
import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('setwelcome')
  .setDescription('Preview a welcome embed using only server description, icon, and banner')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Channel to preview the welcome embed')
      .setRequired(true)
      .addChannelTypes([ChannelType.GuildText])
  );

export async function execute(interaction) {
  const { guild } = interaction;
  const channel = interaction.options.getChannel('channel');

  // Ensure bot can send messages
  if (!channel.permissionsFor(guild.members.me).has('SendMessages')) {
    return interaction.reply({
      content: '❌ I need **Send Messages** permission in that channel.',
      ephemeral: true
    });
  }

  // Use server description; fallback if empty
  const description = guild.description?.trim() || `Welcome to **${guild.name}**!`;

  // Build embed with NO user mention, NO custom text
  const embed = new EmbedBuilder()
    .setTitle(`Welcome to ${guild.name}!`)
    .setDescription(description)
    .setColor(0x00FF00);

  // Logo = server icon
  if (guild.icon) {
    embed.setThumbnail(guild.iconURL({ size: 256 }));
  }

  // Banner = server banner (or splash)
  if (guild.banner) {
    embed.setImage(guild.bannerURL({ size: 1024 }));
  } else if (guild.splash) {
    embed.setImage(guild.splashURL({ size: 1024 }));
  }

  // Send preview
  try {
    await channel.send({
      content: '✅ **Welcome embed preview** — this uses only your server’s description, icon, and banner.',
      embeds: [embed]
    });

    await interaction.reply({
      content: `✅ Preview sent to ${channel}.`,
      ephemeral: true
    });
  } catch (err) {
    console.error('Failed to send welcome preview:', err);
    await interaction.reply({
      content: '❌ Failed to send preview. Check my permissions.',
      ephemeral: true
    });
  }
}
