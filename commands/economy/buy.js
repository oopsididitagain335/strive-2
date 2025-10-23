// /commands/economy/buy.js
import { SlashCommandBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';
import GuildConfig from '../../models/GuildConfig.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Buy an item from the shop')
  .addStringOption(option =>
    option.setName('item')
      .setDescription('Name of the item to buy')
      .setRequired(true));

export async function execute(interaction) {
  const itemName = interaction.options.getString('item').toLowerCase();
  const user = await UserEconomy.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
  if (!user) {
    return interaction.reply({ content: '❌ You have no balance. Use `/daily` to get started.', ephemeral: true });
  }

  const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
  const items = config?.shopItems || [];
  const item = items.find(i => i.name.toLowerCase() === itemName);

  if (!item) {
    return interaction.reply({ content: '❌ Item not found in shop.', ephemeral: true });
  }

  if (user.balance < item.price) {
    return interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
  }

  // Handle role purchase
  if (item.type === 'role' && item.roleId) {
    const role = interaction.guild.roles.cache.get(item.roleId);
    if (role && !interaction.member.roles.cache.has(role.id)) {
      await interaction.member.roles.add(role).catch(() => {});
    }
  }

  await UserEconomy.updateOne(
    { userId: interaction.user.id, guildId: interaction.guild.id },
    { $inc: { balance: -item.price } }
  );

  logger.audit('ECONOMY_ITEM_BOUGHT', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    item: item.name,
    price: item.price
  });

  await interaction.reply(`✅ Purchased **${item.name}** for ${item.price} coins!`);
}
