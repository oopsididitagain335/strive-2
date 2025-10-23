// /commands/economy/shop-create.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('shop-create')
  .setDescription('Create or reset the server shop with default items')
  .addRoleOption(o => o.setName('vip_role').setDescription('VIP role to sell').setRequired(true))
  .addRoleOption(o => o.setName('premium_role').setDescription('Premium role to sell').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const vipRole = interaction.options.getRole('vip_role');
  const premiumRole = interaction.options.getRole('premium_role');

  const defaultItems = [
    {
      id: 'vip',
      name: 'VIP Role',
      description: 'Get access to VIP channels and perks',
      price: 5000,
      type: 'role',
      roleId: vipRole.id
    },
    {
      id: 'premium',
      name: 'Premium Role',
      description: 'Exclusive color and recognition',
      price: 10000,
      type: 'role',
      roleId: premiumRole.id
    },
    {
      id: 'custom_name',
      name: 'Custom Name Color',
      description: 'Set a custom color for your name (via role)',
      price: 2500,
      type: 'custom',
      effect: 'custom_color'
    }
  ];

  await GuildConfig.findOneAndUpdate(
    { guildId: interaction.guild.id },
    { shopItems: defaultItems },
    { upsert: true }
  );

  logger.audit('SHOP_CREATED', {
    guildId: interaction.guild.id,
    moderator: interaction.user.id,
    items: defaultItems.length
  });

  await interaction.reply({
    content: `✅ Shop created with ${defaultItems.length} items!\nUse \`/shop\` to view it.`,
    ephemeral: true
  });
}
