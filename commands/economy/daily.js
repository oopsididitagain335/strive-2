import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim your daily coins');

export async function execute(interaction) {
  const now = Date.now();
  const user = await UserEconomy.findOneAndUpdate(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $setOnInsert: { balance: 0, lastDaily: 0 } },
    { upsert: true, new: true }
  );

  const lastDaily = user.lastDaily || 0;
  const cooldown = 24 * 60 * 60 * 1000; // 24 hours

  if (now - lastDaily < cooldown) {
    const remaining = Math.ceil((cooldown - (now - lastDaily)) / (60 * 1000));
    return interaction.reply({
      content: `⏳ You already claimed your daily! Come back in **${remaining} minutes**.`,
      ephemeral: true
    });
  }

  const amount = 500;
  await UserEconomy.updateOne(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $inc: { balance: amount }, $set: { lastDaily: now } }
  );

  logger.audit('ECONOMY_DAILY_CLAIMED', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    amount
  });

  await interaction.reply(`🎁 You claimed your daily **${amount.toLocaleString()}** coins!`);
}
