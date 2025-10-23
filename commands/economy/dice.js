// /commands/economy/dice.js
import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('dice')
  .setDescription('Roll a 6-sided die and bet')
  .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet (min: 10)').setMinValue(10).setRequired(true));

export async function execute(interaction) {
  const bet = interaction.options.getInteger('bet');
  const user = await UserEconomy.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

  if (!user || user.balance < bet) {
    return interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
  }

  const roll = Math.floor(Math.random() * 6) + 1; // 1–6
  const win = roll >= 5; // 5 or 6 = win (33% chance)
  const payout = win ? bet * 2 : 0;

  await UserEconomy.updateOne(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $inc: { balance: win ? payout - bet : -bet } }
  );

  logger.audit('ECONOMY_DICE_PLAYED', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    bet,
    roll,
    win
  });

  await interaction.reply({
    content: `🎲 You rolled a **${roll}**!\n${win ? `🎉 You won **${payout.toLocaleString()}** coins!` : '💔 You lost.'}`
  });
}
