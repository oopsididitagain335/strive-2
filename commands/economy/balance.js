import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your balance');

export async function execute(interaction) {
  const user = await UserEconomy.findOneAndUpdate(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $setOnInsert: { balance: 0 } },
    { upsert: true, new: true }
  );

  await interaction.reply(`💰 **Balance**: ${user.balance.toLocaleString()} coins`);
}
