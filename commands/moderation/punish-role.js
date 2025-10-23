import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('punish-role')
  .setDescription('Set a role to assign for mutes or timeouts')
  .addRoleOption(o => o.setName('role').setDescription('Role to use for punishment').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction) {
  const role = interaction.options.getRole('role');

  if (role.managed) {
    return interaction.reply({ content: '❌ Cannot use bot-managed roles.', ephemeral: true });
  }

  await GuildConfig.findOneAndUpdate(
    { guildId: interaction.guild.id },
    { punishRoleId: role.id },
    { upsert: true }
  );

  await interaction.reply(`✅ Punishment role set to: ${role}`);
}
