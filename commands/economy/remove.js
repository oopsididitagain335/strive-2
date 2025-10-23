import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove coins from a user')
  .addUserOption(o => o.setName('user').setDescription('User to remove coins from').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount to remove').setMinValue(1).setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');

  await UserEconomy.updateOne(
    { userId: target.id, guildId: interaction.guild.id },
    { $inc: { balance: -amount } }
  );

  await interaction.reply(`✅ Removed **${amount.toLocaleString()}** coins from ${target}.`);
}
