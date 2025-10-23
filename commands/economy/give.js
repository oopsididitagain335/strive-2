import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';

export const data = new SlashCommandBuilder()
  .setName('give')
  .setDescription('Give coins to a user')
  .addUserOption(o => o.setName('user').setDescription('User to give coins to').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount to give').setMinValue(1).setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');

  await UserEconomy.findOneAndUpdate(
    { userId: target.id, guildId: interaction.guild.id },
    { $inc: { balance: amount }, $setOnInsert: { balance: 0 } },
    { upsert: true }
  );

  await interaction.reply(`✅ Gave **${amount.toLocaleString()}** coins to ${target}.`);
}
