// /commands/economy/slots.js
import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('slots')
  .setDescription('Play the slot machine')
  .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (min: 10)').setMinValue(10).setRequired(true));

export async function execute(interaction) {
  const bet = interaction.options.getInteger('bet');
  const user = await UserEconomy.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

  if (!user || user.balance < bet) {
    return interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
  }

  const emojis = ['🍇', '🍊', '🍒', '🍋', '🔔', '💎', '7️⃣'];
  const spin = Array.from({ length: 3 }, () => emojis[Math.floor(Math.random() * emojis.length)]);
  const win = spin[0] === spin[1] && spin[1] === spin[2];
  const payout = win ? bet * 10 : 0;

  await UserEconomy.updateOne(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $inc: { balance: win ? payout - bet : -bet } }
  );

  logger.audit('ECONOMY_SLOTS_PLAYED', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    bet,
    win
  });

  await interaction.reply(`🎰 ${spin.join(' | ')}\n${win ? '✅ Jackpot!' : '❌ Try again.'}`);
}
