// /commands/economy/shop-create.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('shop-create')
  .setDescription('Create a shop with roles')
  .addRoleOption(o => o.setName('vip_role').setDescription('VIP role').setRequired(true))
  .addRoleOption(o => o.setName('premium_role').setDescription('Premium role').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const vip = interaction.options.getRole('vip_role');
  const premium = interaction.options.getRole('premium_role');

  const items = [
    { id: 'vip', name: 'VIP Role', description: 'Access to VIP channels', price: 5000, type: 'role', roleId: vip.id },
    { id: 'premium', name: 'Premium Role', description: 'Exclusive color', price: 10000, type: 'role', roleId: premium.id }
  ];

  await GuildConfig.findOneAndUpdate(
    { guildId: interaction.guild.id },
    { shopItems: items },
    { upsert: true }
  );

  logger.audit('SHOP_CREATED', {
    guildId: interaction.guild.id,
    moderator: interaction.user.id
  });

  await interaction.reply({ content: '✅ Shop created!', ephemeral: true });
}
