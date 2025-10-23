// /commands/economy/shop.js (UPDATED)
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('View the server shop');

export async function execute(interaction) {
  let config = await GuildConfig.findOne({ guildId: interaction.guild.id });

  // Auto-generate basic shop if missing
  if (!config || !config.shopItems || config.shopItems.length === 0) {
    const defaultItems = [
      {
        id: 'booster',
        name: 'Server Booster Perk',
        description: 'Special role for boosters (demo)',
        price: 1000,
        type: 'role',
        roleId: interaction.guild.roles.premiumSubscriberRole?.id || interaction.guild.roles.everyone.id
      },
      {
        id: 'meme_pass',
        name: 'Meme Pass',
        description: 'Unlock exclusive meme commands',
        price: 300,
        type: 'custom',
        effect: 'meme_access'
      }
    ];

    config = await GuildConfig.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { shopItems: defaultItems },
      { upsert: true, new: true }
    );

    await interaction.reply({
      content: '🛒 First-time setup! A default shop has been created.\nAdmins can customize it with `/shop-create`.',
      ephemeral: true
    });
    return;
  }

  const description = config.shopItems.map(item => 
    `**${item.name}** — ${item.price.toLocaleString()} coins\n> ${item.description || 'No description'}`
  ).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Server Shop')
    .setDescription(description)
    .setColor(0x00FF00);

  await interaction.reply({ embeds: [embed] });
}
