import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('antiraid')
  .setDescription('Toggle anti-raid protection')
  .addBooleanOption(o => o.setName('enabled').setDescription('Enable anti-raid?').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const enabled = interaction.options.getBoolean('enabled');
  await GuildConfig.findOneAndUpdate(
    { guildId: interaction.guild.id },
    { antiRaidEnabled: enabled },
    { upsert: true }
  );

  await interaction.reply(`✅ Anti-raid ${enabled ? 'enabled' : 'disabled'}.`);
}
