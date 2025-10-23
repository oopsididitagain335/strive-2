import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';
import GuildConfig from '../../models/GuildConfig.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Buy an item from the shop')
  .addStringOption(o => o.setName('item').setDescription('Name of the item').setRequired(true));

export async function execute(interaction) {
  const itemName = interaction.options.getString('item').toLowerCase();
  const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
  const items = config?.shopItems || [];

  const item = items.find(i => i.name.toLowerCase() === itemName);
  if (!item) {
    return interaction.reply({ content: '❌ Item not found in shop.', ephemeral: true });
  }

  const user = await UserEconomy.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
  if (!user || user.balance < item.price) {
    return interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
  }

  // Handle role purchase
  if (item.type === 'role') {
    const role = interaction.guild.roles.cache.get(item.roleId);
    if (!role) {
      return interaction.reply({ content: '❌ That role no longer exists.', ephemeral: true });
    }
    if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
      return interaction.reply({ content: '❌ I can’t assign roles (missing permission).', ephemeral: true });
    }
    await interaction.member.roles.add(role);
  }

  // Deduct balance
  await UserEconomy.updateOne(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $inc: { balance: -item.price } }
  );

  logger.audit('ECONOMY_ITEM_BOUGHT', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    itemId: item.id,
    price: item.price
  });

  await interaction.reply(`✅ Purchased **${item.name}** for ${item.price.toLocaleString()} coins!`);
}
