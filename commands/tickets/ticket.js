import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { encryptJSON } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Setup or manage the ticket system.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('setup').setDescription('Generate a setup link for the ticket panel.')
  )
  .addSubcommand(sub =>
    sub.setName('status').setDescription('Check ticket system status.')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const user = interaction.user;

  try {
    if (sub === 'setup') {
      const payload = { guildId: guild.id, guildName: guild.name, createdBy: user.id, ts: Date.now() };
      const token = encryptJSON(payload, process.env.SESSION_KEY);

      const baseUrl = process.env.DASHBOARD_URL || 'http://localhost:10000';
      const link = `${baseUrl}/setup.html?token=${encodeURIComponent(token)}`;

      logger.info(`Setup token generated for ${guild.name} (${guild.id}) by ${user.tag}`);

      await interaction.reply({
        embeds: [{
          title: '🎫 Ticket Setup',
          description: `Configure ticket panel for **${guild.name}**.`,
          fields: [
            { name: 'Server', value: `${guild.name} (${guild.id})`, inline: true },
            { name: 'Requested by', value: user.tag, inline: true },
          ],
          color: 0x5865f2
        }],
        components: [{
          type: 1,
          components: [{ type: 2, style: 5, label: 'Open Setup Panel', url: link }]
        }],
        ephemeral: true,
      });
    } else if (sub === 'status') {
      await interaction.reply({ content: `✅ Ticket system active in **${guild.name}**.`, ephemeral: true });
    }
  } catch (err) {
    logger.error('Ticket command error', { error: err.message, stack: err.stack });
    await interaction.reply({ content: '❌ Failed to process command.', ephemeral: true });
  }
}
