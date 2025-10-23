import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Delete messages in bulk')
  .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
  .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user (optional)'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction) {
  const amount = interaction.options.getInteger('amount');
  const filterUser = interaction.options.getUser('user');

  await interaction.deferReply({ ephemeral: true });

  let messages;
  try {
    if (filterUser) {
      messages = (
        await interaction.channel.messages.fetch({ limit: 100 })
      ).filter(m => m.author.id === filterUser.id)
        .first(amount);
    } else {
      messages = await interaction.channel.messages.fetch({ limit: amount });
    }

    if (messages.size === 0) {
      return interaction.editReply('❌ No messages found to delete.');
    }

    await interaction.channel.bulkDelete(messages, true);
    logger.audit('MODERATION_CLEAR', {
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      channelId: interaction.channel.id,
      count: messages.size,
      filteredBy: filterUser?.id || null,
    });

    await interaction.editReply(`✅ Deleted **${messages.size}** messages.`);
  } catch (err) {
    logger.error('CLEAR_FAILED', { guildId: interaction.guild.id, error: err.message });
    await interaction.editReply('❌ Failed to delete messages. Try again or check permissions.');
  }
}
