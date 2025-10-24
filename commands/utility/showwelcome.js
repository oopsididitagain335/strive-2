import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import Welcome from '../../models/Welcome.js'; // ✅ Correct path for /src/models/Welcome.js

export const data = new SlashCommandBuilder()
  .setName('showwelcome')
  .setDescription('Show or preview your configured welcome embed.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Channel to preview the welcome embed (optional)')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
  );

export async function execute(interaction) {
  const { guild } = interaction;
  const previewChannel = interaction.options.getChannel('channel');

  try {
    // Try to load configuration from DB
    const config = await Welcome.findOne({ guildId: guild.id });

    // If no configuration found, fallback to defaults
    const description =
      config?.message ||
      guild.description ||
      `Welcome to **${guild.name}**!`;

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(config?.title || `Welcome to ${guild.name}!`)
      .setDescription(description)
      .setColor(config?.color || 0x00ff00)
      .setTimestamp();

    // Add icon and banner
    if (guild.icon) embed.setThumbnail(guild.iconURL({ size: 256 }));
    if (guild.banner) {
      embed.setImage(guild.bannerURL({ size: 1024 }));
    } else if (guild.splash) {
      embed.setImage(guild.splashURL({ size: 1024 }));
    }

    // If a specific preview channel is chosen
    if (previewChannel) {
      // Ensure bot can send there
      const perms = previewChannel.permissionsFor(guild.members.me);
      if (!perms.has('SendMessages')) {
        return interaction.reply({
          content: `❌ I don’t have permission to send messages in ${previewChannel}.`,
          ephemeral: true,
        });
      }

      await previewChannel.send({
        content: '👋 **Welcome Embed Preview**',
        embeds: [embed],
      });

      return interaction.reply({
        content: `✅ Welcome embed preview sent to ${previewChannel}.`,
        ephemeral: true,
      });
    }

    // Otherwise, show embed directly in interaction
    await interaction.reply({
      content: 'Here’s your current welcome embed:',
      embeds: [embed],
      ephemeral: true,
    });
  } catch (err) {
    console.error('Failed to show welcome embed:', err);
    await interaction.reply({
      content: '❌ Something went wrong while loading the welcome message.',
      ephemeral: true,
    });
  }
}
