// /commands/economy/coinflip.js
import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('Bet on heads or tails')
  .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet (min: 10)').setMinValue(10).setRequired(true))
  .addStringOption(o => o.setName('choice').setDescription('Heads or tails?').addChoices(
    { name: 'Heads', value: 'heads' },
    { name: 'Tails', value: 'tails' }
  ).setRequired(true));

export async function execute(interaction) {
  const bet = interaction.options.getInteger('bet');
  const choice = interaction.options.getString('choice');
  const user = await UserEconomy.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

  if (!user || user.balance < bet) {
    return interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
  }

  const result = Math.random() > 0.5 ? 'heads' : 'tails';
  const win = choice === result;
  const payout = win ? bet : 0;

  await UserEconomy.updateOne(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $inc: { balance: win ? bet : -bet } }
  );

  logger.audit('ECONOMY_COINFLIP_PLAYED', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    bet,
    choice,
    result,
    win
  });

  await interaction.reply({
    content: `🪙 Result: **${result.toUpperCase()}**\nYou chose: **${choice.toUpperCase()}**\n${win ? '✅ You won!' : '❌ You lost.'}`
  });
}
