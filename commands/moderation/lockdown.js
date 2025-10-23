import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription('Lock or unlock the current channel')
  .addBooleanOption(o => o.setName('lock').setDescription('Lock channel? (true = lock, false = unlock)').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction) {
  const lock = interaction.options.getBoolean('lock');
  const channel = interaction.channel;

  if (channel.type !== ChannelType.GuildText) {
    return interaction.reply({ content: '❌ This command only works in text channels.', ephemeral: true });
  }

  try {
    if (lock) {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
      });
      await interaction.reply('🔒 Channel locked. Only staff can send messages.');
    } else {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null, // reset to default
      });
      await interaction.reply('🔓 Channel unlocked.');
    }

    logger.audit('MODERATION_LOCKDOWN', {
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      channelId: channel.id,
      action: lock ? 'LOCK' : 'UNLOCK',
    });
  } catch (err) {
    logger.error('LOCKDOWN_FAILED', { guildId: interaction.guild.id, error: err.message });
    await interaction.reply({ content: '❌ Failed to update channel permissions.', ephemeral: true });
  }
}
