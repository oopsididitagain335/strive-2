// /bot/events/interactionCreate.js
import Ticket from '../../models/Ticket.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const name = 'interactionCreate';

export async function execute(interaction) {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'close_ticket') {
    const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
    if (!ticket) {
      return interaction.reply({ content: '⚠️ Ticket not found in database.', ephemeral: true });
    }

    // Confirm closure
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_close')
        .setLabel('Confirm Close')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel_close')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: '⚠️ Are you sure you want to close this ticket?',
      components: [confirmRow],
      ephemeral: true,
    });
  }

  if (interaction.customId === 'confirm_close') {
    const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
    if (!ticket) {
      return interaction.reply({ content: '⚠️ Ticket not found.', ephemeral: true });
    }

    ticket.closed = true;
    await ticket.save();

    await interaction.channel.send('✅ Ticket closed. This channel will be deleted in 10 seconds.');
    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 10_000);
  }

  if (interaction.customId === 'cancel_close') {
    await interaction.reply({ content: '❌ Ticket closure canceled.', ephemeral: true });
  }
}
