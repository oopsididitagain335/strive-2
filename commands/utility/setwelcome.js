// /commands/utility/setwelcome.js
import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import Welcome from '../../models/Welcome.js'; // <-- import model

export const data = new SlashCommandBuilder()
  .setName('setwelcome')
  .setDescription('Set and preview the welcome channel (uses server info only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Channel to send the welcome message')
      .setRequired(true)
      .addChannelTypes([ChannelType.GuildText])
  );

export async function execute(interaction) {
  const { guild } = interaction;
  const channel = interaction.options.getChannel('channel');

  // Check bot permissions
  if (!channel.permissionsFor(guild.members.me).has('SendMessages')) {
    return interaction.reply({
      content: '❌ I need **Send Messages** permission in that channel.',
      ephemeral: true
    });
  }

  // Save to database
  try {
    await Welcome.findOneAndUpdate(
      { guildId: guild.id },
      { channelId: channel.id },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Error saving welcome channel:', err);
    return interaction.reply({
      content: '❌ Failed to save the welcome channel to the database.',
      ephemeral: true
    });
  }

  // Prepare embed
  const description = guild.description?.trim() || `Welcome to **${guild.name}**!`;

  const embed = new EmbedBuilder()
    .setTitle(`Welcome to ${guild.name}!`)
    .setDescription(description)
    .setColor(0x00FF00);

  if (guild.icon) embed.setThumbnail(guild.iconURL({ size: 256 }));
  if (guild.banner) embed.setImage(guild.bannerURL({ size: 1024 }));
  else if (guild.splash) embed.setImage(guild.splashURL({ size: 1024 }));

  // Send preview
  try {
    await channel.send({
      content: '✅ **Welcome embed preview** — this uses only your server’s description, icon, and banner.',
      embeds: [embed]
    });

    await interaction.reply({
      content: `✅ Welcome channel set to ${channel}. Preview sent.`,
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
