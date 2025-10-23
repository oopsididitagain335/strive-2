// /commands/tickets/create.js
import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create a support ticket')
  .addSubcommand(sc => sc.setName('create').setDescription('Open a new ticket'));

export async function execute(interaction) {
  const thread = await interaction.channel.threads.create({
    name: `ticket-${interaction.user.username}`,
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
  });
  await thread.members.add(interaction.user.id);
  logger.audit('TICKET_CREATED', {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    threadId: thread.id
  });
  await interaction.reply({ content: `✅ Ticket: ${thread}`, ephemeral: true });
}
