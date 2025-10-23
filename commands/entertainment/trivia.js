// /commands/entertainment/trivia.js
import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('trivia')
  .setDescription('Play a trivia quiz');

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const res = await fetch('https://opentdb.com/api.php?amount=1&type=multiple');
    const data = await res.json();
    if (!data.results?.[0]) throw new Error('No question');

    const q = data.results[0];
    await interaction.editReply(`🧠 **${q.question}**\nAnswer: ||${q.correct_answer}||`);
    logger.info('TRIVIA_PLAYED', { userId: interaction.user.id });
  } catch (err) {
    logger.error('TRIVIA_ERROR', { error: err.message });
    await interaction.editReply('❌ Failed to load trivia.');
  }
}
