import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('antispam')
  .setDescription('Toggle anti-spam protection')
  .addBooleanOption(o => o.setName('enabled').setDescription('Enable anti-spam?').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const enabled = interaction.options.getBoolean('enabled');
  await GuildConfig.findOneAndUpdate(
    { guildId: interaction.guild.id },
    { antiSpamEnabled: enabled },
    { upsert: true }
  );

  await interaction.reply(`✅ Anti-spam ${enabled ? 'enabled' : 'disabled'}.`);
}
