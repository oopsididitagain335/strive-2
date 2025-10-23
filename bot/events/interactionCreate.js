// /bot/events/interactionCreate.js
import { logger } from '../utils/logger.js';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction, client) {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
    logger.info('COMMAND_EXECUTED', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id
    });
  } catch (error) {
    logger.error('COMMAND_ERROR', {
      command: interaction.commandName,
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ An error occurred while running this command.', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ An error occurred while running this command.', ephemeral: true });
    }
  }
}
