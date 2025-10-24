import { logger } from '../utils/logger.js';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction, client) {
  // Only handle slash commands
  if (!interaction.isChatInputCommand()) return;

  // Ensure bot is ready
  if (!client.isReady()) {
    logger.warn('BOT_NOT_READY', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    return;
  }

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn('COMMAND_NOT_FOUND', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    return;
  }

  // Check if user has permission to run the command
  if (command.permissions && !interaction.member.permissions.has(command.permissions)) {
    logger.info('COMMAND_PERMISSION_DENIED', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    await interaction.reply({
      content: '❌ You do not have permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction, client);
    logger.info('COMMAND_EXECUTED', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
    });
  } catch (error) {
    logger.error('COMMAND_ERROR', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });

    const errorMessage = '❌ An error occurred while running this command.';
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (followUpError) {
      logger.error('COMMAND_FOLLOWUP_ERROR', {
        command: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        error: followUpError.message,
      });
      // Fallback to logging if interaction response fails (e.g., timed out)
    }
  }
}
