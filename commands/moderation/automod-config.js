import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Configure auto-moderation settings')
  .addSubcommand(sc => sc
    .setName('toggle')
    .setDescription('Enable or disable auto-moderation')
    .addBooleanOption(o => o.setName('enabled').setDescription('Enable auto-mod?').setRequired(true))
  )
  .addSubcommand(sc => sc
    .setName('set-filter')
    .setDescription('Set keyword filter (comma-separated)')
    .addStringOption(o => o.setName('keywords').setDescription('Blocked words').setRequired(true))
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'toggle') {
    const enabled = interaction.options.getBoolean('enabled');
    await GuildConfig.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { autoModEnabled: enabled },
      { upsert: true }
    );
    logger.audit('AUTOMOD_TOGGLE', { guildId: interaction.guild.id, enabled, moderator: interaction.user.id });
    await interaction.reply(`✅ Auto-mod ${enabled ? 'enabled' : 'disabled'}.`);

  } else if (sub === 'set-filter') {
    const keywords = interaction.options.getString('keywords').split(',').map(k => k.trim()).filter(Boolean);
    await GuildConfig.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { autoModKeywords: keywords },
      { upsert: true }
    );
    logger.audit('AUTOMOD_KEYWORDS_SET', { guildId: interaction.guild.id, count: keywords.length, moderator: interaction.user.id });
    await interaction.reply(`✅ Blocked ${keywords.length} keyword(s).`);
  }
}
