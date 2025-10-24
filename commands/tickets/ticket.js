// /commands/tickets/ticket.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { encryptJSON } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Setup or manage the ticket system for this server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('setup')
      .setDescription('Generate a setup link for configuring the ticket system.')
  )
  .addSubcommand(sub =>
    sub
      .setName('status')
      .setDescription('Check the current ticket system setup status.')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  try {
    switch (sub) {
      case 'setup': {
        const guild = interaction.guild;
        const user = interaction.user;

        // Build encrypted setup token
        const payload = {
          guildId: guild.id,
          guildName: guild.name,
          createdBy: user.id,
          timestamp: Date.now(),
        };

        const token = encryptJSON(payload, process.env.SESSION_KEY);
        const baseUrl =
          process.env.DASHBOARD_URL ||
          process.env.REDIRECT_URI?.replace('/auth/callback', '') ||
          'http://localhost:10000';

        const setupLink = `${baseUrl}/setup.html?token=${encodeURIComponent(token)}`;

        logger.info(
          `🧩 Setup token created for guild ${guild.name} (${guild.id}) by ${user.tag}`
        );

        await interaction.reply({
          embeds: [
            {
              title: '🎫 Ticket System Setup',
              description: `Click below to configure your ticket panel for **${guild.name}**.`,
              fields: [
                { name: 'Server', value: `${guild.name} (${guild.id})`, inline: true },
                { name: 'Requested by', value: user.tag, inline: true },
              ],
              color: 0x5865f2,
              footer: { text: 'Ticket System Setup' },
            },
          ],
          components: [
            {
              type: 1, // Action Row
              components: [
                {
                  type: 2, // Button
                  style: 5, // Link
                  label: 'Open Setup Panel',
                  url: setupLink,
                },
              ],
            },
          ],
          ephemeral: true,
        });
        break;
      }

      case 'status': {
        await interaction.reply({
          content: `✅ Ticket system is active in **${interaction.guild.name}**.`,
          ephemeral: true,
        });
        break;
      }

      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true,
        });
    }
  } catch (err) {
    logger.error('❌ Ticket command failed', { error: err.message, stack: err.stack });
    await interaction.reply({
      content: 'An error occurred while processing your request.',
      ephemeral: true,
    });
  }
}
