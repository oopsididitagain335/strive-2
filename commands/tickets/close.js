// /commands/tickets/close.js
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Close this ticket')
  .addSubcommand(sc => sc.setName('close').setDescription('Close the current ticket'));

export async function execute(interaction) {
  if (!interaction.channel.isThread()) {
    return interaction.reply({ content: '❌ This command only works in ticket threads.', ephemeral: true });
  }

  await interaction.reply('🔒 Closing ticket...');
  await interaction.channel.setArchived(true);
}
