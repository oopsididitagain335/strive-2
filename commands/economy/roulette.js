// /commands/economy/roulette.js
import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('roulette')
  .setDescription('Bet on roulette')
  .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (min: 20)').setMinValue(20).setRequired(true))
  .addStringOption(o => o.setName('type').setDescription('Bet type').addChoices(
    { name: 'Red', value: 'red' },
    { name: 'Black', value: 'black' },
    { name: 'Even', value: 'even' },
    { name: 'Odd', value: 'odd' },
    { name: '1-18', value: 'low' },
    { name: '19-36', value: 'high' }
  ).setRequired(true));

export async function execute(interaction) {
  const bet = interaction.options.getInteger('bet');
  const type = interaction.options.getString('type');
  const user = await UserEconomy.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

  if (!user || user.balance < bet) {
    return interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
  }

  const spin = Math.floor(Math.random() * 37);
  const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(spin);
  const isEven = spin !== 0 && spin % 2 === 0;
  const isLow = spin >= 1 && spin <= 18;

  let win = false;
  if (type === 'red') win = isRed;
  else if (type === 'black') win = !isRed && spin !== 0;
  else if (type === 'even') win = isEven;
  else if (type === 'odd') win = !isEven && spin !== 0;
  else if (type === 'low') win = isLow;
  else if (type === 'high') win = spin >= 19 && spin <= 36;

  const payout = win ? bet * 2 : 0;

  await UserEconomy.updateOne(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $inc: { balance: win ? payout - bet : -bet } }
  );

  logger.audit('ECONOMY_ROULETTE_PLAYED', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    bet,
    type,
    result: spin,
    win
  });

  const color = spin === 0 ? '🟢' : isRed ? '🔴' : '⚫';
  await interaction.reply(`🎰 Ball landed on: ${color} **${spin}**\n${win ? '✅ You won!' : '❌ You lost.'}`);
}
