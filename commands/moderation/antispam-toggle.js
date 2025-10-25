// /commands/antispam.js
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import ProtectionConfig from '../../models/ProtectionConfig.js';

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
  try {
    const enabled = interaction.options.getBoolean('enabled');

    // Update or create the guild's anti-spam configuration
    await ProtectionConfig.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { antiSpamEnabled: enabled },
      { upsert: true, new: true }
    );

    // Create an embed for the response
    const embed = new EmbedBuilder()
      .setColor(enabled ? '#00FF00' : '#FF0000') // Green for enabled, red for disabled
      .setTitle('Anti-Spam Protection Updated')
      .setDescription(`Anti-spam protection has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
      .setTimestamp()
      .setFooter({ text: `Updated by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    // Reply with the embed, ephemeral to keep it private
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.error('Error in /antispam command:', error);

    // Create an error embed
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Error')
      .setDescription('An error occurred while updating anti-spam settings. Please try again later.')
      .setTimestamp();

    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}
