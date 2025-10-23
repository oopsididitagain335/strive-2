import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user')
  .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  try {
    await interaction.guild.bans.create(user.id, { reason });
    await interaction.reply(`✅ Banned ${user.tag} | ${reason}`);
  } catch (e) {
    await interaction.reply({ content: '❌ Failed to ban user. Check permissions.', ephemeral: true });
  }
}
