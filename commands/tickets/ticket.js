// /commands/tickets/ticket.js
import { SlashCommandBuilder, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create or manage support tickets')
  .addSubcommand(sc => sc.setName('create').setDescription('Open a new ticket'))
  .addSubcommand(sc => sc.setName('close').setDescription('Close the current ticket'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'create') {
    const thread = await interaction.channel.threads.create({
      name: `ticket-${interaction.user.username}`,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
    });
    await thread.members.add(interaction.user.id);
    await interaction.reply({ content: `✅ Ticket: ${thread}`, ephemeral: true });
  } else if (sub === 'close') {
    if (!interaction.channel.isThread()) {
      return interaction.reply({ content: '❌ Use in a ticket thread.', ephemeral: true });
    }
    await interaction.channel.setArchived(true);
    await interaction.reply('🔒 Ticket closed.');
  }
}
