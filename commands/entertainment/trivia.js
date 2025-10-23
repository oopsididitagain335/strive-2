// /commands/entertainment/trivia.js
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fetch from 'node-fetch';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('trivia')
  .setDescription('Play a trivia quiz (earn 100 coins for correct answer)');

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const res = await fetch('https://opentdb.com/api.php?amount=1&type=multiple');
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error('No questions');

    const q = data.results[0];
    const correct = decode(q.correct_answer);
    const all = [correct, ...q.incorrect_answers.map(decode)].sort(() => 0.5 - Math.random());

    const buttons = all.map((ans, i) => 
      new ButtonBuilder()
        .setCustomId(`trivia_${i}_${correct === ans ? '1' : '0'}`)
        .setLabel(ans.substring(0, 80))
        .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
    const rows = [row];
    if (buttons[5]) rows.push(new ActionRowBuilder().addComponents(buttons.slice(5)));

    const embed = {
      title: '🧠 Trivia Time!',
      description: `**${decode(q.question)}**\n\n(Category: ${q.category} | ${q.difficulty})`,
      color: 0x00AAFF
    };

    await interaction.editReply({ embeds: [embed], components: rows });

    // Handle button interaction via event (not here)
    // Store correct answer in DB or cache with interaction.id
    logger.info('TRIVIA_STARTED', { userId: interaction.user.id, guildId: interaction.guild.id });

  } catch (err) {
    await interaction.editReply('❌ Failed to load trivia. Try again later.');
  }
}

function decode(str) {
  return str.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num))
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
}
