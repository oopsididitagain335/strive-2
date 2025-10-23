// /commands/economy/roulette.js
import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('roulette')
  .setDescription('Bet on roulette (0–36)')
  .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (min: 20)').setMinValue(20).setRequired(true))
  .addStringOption(o => o.setName('type').setDescription('Bet type').addChoices(
    { name: 'Red (2x)', value: 'red' },
    { name: 'Black (2x)', value: 'black' },
    { name: 'Even (2x)', value: 'even' },
    { name: 'Odd (2x)', value: 'odd' },
    { name: '1-18 (2x)', value: 'low' },
    { name: '19-36 (2x)', value: 'high' },
    { name: 'Exact number (36x)', value: 'number' }
  ).setRequired(true))
  .addIntegerOption(o => o.setName('number').setDescription('Pick 0–36 (only if "Exact number")').setMinValue(0).setMaxValue(36));

export async function execute(interaction) {
  const bet = interaction.options.getInteger('bet');
  const type = interaction.options.getString('type');
  const number = interaction.options.getInteger('number');
  const user = await UserEconomy.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

  if (!user || user.balance < bet) {
    return interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
  }

  if (type === 'number' && number === null) {
    return interaction.reply({ content: '❌ Please provide a number (0–36) for exact bet.', ephemeral: true });
  }

  const spin = Math.floor(Math.random() * 37); // 0–36
  const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(spin);
  const isBlack = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35].includes(spin);
  const isEven = spin !== 0 && spin % 2 === 0;
  const isOdd = spin !== 0 && spin % 2 === 1;
  const isLow = spin >= 1 && spin <= 18;
  const isHigh = spin >= 19 && spin <= 36;

  let win = false;
  let multiplier = 0;

  if (type === 'red') { win = isRed; multiplier = 2; }
  else if (type === 'black') { win = isBlack; multiplier = 2; }
  else if (type === 'even') { win = isEven; multiplier = 2; }
  else if (type === 'odd') { win = isOdd; multiplier = 2; }
  else if (type === 'low') { win = isLow; multiplier = 2; }
  else if (type === 'high') { win = isHigh; multiplier = 2; }
  else if (type === 'number') { win = spin === number; multiplier = 36; }

  const payout = win ? bet * multiplier : 0;

  await UserEconomy.updateOne(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $inc: { balance: win ? payout - bet : -bet } }
  );

  logger.audit('ECONOMY_ROULETTE_PLAYED', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    bet,
    type,
    number,
    result: spin,
    win
  });

  const color = spin === 0 ? '🟢' : isRed ? '🔴' : '⚫';
  await interaction.reply({
    content: `🎰 **Roulette**\nBall landed on: ${color} **${spin}**\nYou bet on **${type}** ${number !== null ? `(${number})` : ''}\n${win ? `🎉 You won **${payout.toLocaleString()}** coins!` : '💔 You lost.'}`
  });
}
