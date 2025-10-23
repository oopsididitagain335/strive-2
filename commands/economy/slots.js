import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('slots')
  .setDescription('Play the slot machine')
  .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet (min: 10)').setMinValue(10).setRequired(true));

export async function execute(interaction) {
  const bet = interaction.options.getInteger('bet');
  const user = await UserEconomy.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

  if (!user || user.balance < bet) {
    return interaction.reply({ content: '❌ Not enough coins to place that bet!', ephemeral: true });
  }

  const emojis = ['🍇', '🍊', '🍒', '🍋', '🔔', '💎', '7️⃣'];
  const spin = Array.from({ length: 3 }, () => emojis[Math.floor(Math.random() * emojis.length)]);
  const result = spin.join(' | ');

  let win = false;
  if (spin[0] === spin[1] && spin[1] === spin[2]) {
    win = true;
  } else if (spin[0] === spin[2] || spin[1] === spin[2]) {
    win = Math.random() > 0.7; // partial win chance
  }

  const payout = win ? Math.floor(bet * (spin.includes('7️⃣') ? 5 : spin.includes('💎') ? 3 : 2)) : 0;

  await UserEconomy.updateOne(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $inc: { balance: win ? payout - bet : -bet } }
  );

  logger.audit('ECONOMY_SLOTS_PLAYED', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    bet,
    payout,
    win
  });

  await interaction.reply({
    content: `🎰 **Slots**\n${result}\n${win ? `🎉 You won **${payout.toLocaleString()}** coins!` : '💔 You lost.'}`
  });
}
