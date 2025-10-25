// /commands/moderation/antispam-toggle.js
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import ProtectionConfig from '../../models/ProtectionConfig.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('antispam')
  .setDescription('Toggle anti-spam protection')
  .addBooleanOption(o =>
    o.setName('enabled')
      .setDescription('Enable or disable anti-spam protection')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  // Defer reply to avoid "Unknown Interaction" error
  await interaction.deferReply({ ephemeral: true });

  try {
    const enabled = interaction.options.getBoolean('enabled');

    // Update or create the guild's anti-spam configuration
    const config = await ProtectionConfig.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { antiSpamEnabled: enabled },
      { upsert: true, new: true }
    );

    logger.debug('Anti-spam config updated', {
      guildId: interaction.guild.id,
      antiSpamEnabled: config.antiSpamEnabled,
    });

    // Create success embed
    const embed = new EmbedBuilder()
      .setColor(enabled ? '#00FF00' : '#FF0000')
      .setTitle('Anti-Spam Protection Updated')
      .setDescription(`Anti-spam protection has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
      .setTimestamp()
      .setFooter({ text: `Updated by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    // Edit the deferred reply
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error in /antispam command', {
      guildId: interaction.guild?.id,
      userId: interaction.user.id,
      error: error.message,
      stack: error.stack,
    });

    // Create error embed
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Error')
      .setDescription('Failed to update anti-spam settings. Please try again later.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
