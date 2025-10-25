import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';

export const data = new SlashCommandBuilder()
  .setName('give')
  .setDescription('Give coins to a user')
  .addUserOption(o => o.setName('user').setDescription('User to give coins to').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount to give').setMinValue(1).setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  try {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    // Update the user's balance, initializing with 0 only for fields that won't conflict
    await UserEconomy.findOneAndUpdate(
      { userId: target.id, guildId: interaction.guild.id },
      {
        $inc: { balance: amount }, // Increment balance by the specified amount
        $setOnInsert: {
          userId: target.id, // Set userId and guildId only on insert
          guildId: interaction.guild.id,
          // Do not set balance here to avoid conflict with $inc
        },
      },
      { upsert: true, new: true } // Create a new document if it doesn't exist, return updated document
    );

    // Reply with success message
    await interaction.reply(`✅ Gave **${amount.toLocaleString()}** coins to ${target}.`);
  } catch (error) {
    console.error('Error in /give command:', error);
    await interaction.reply({
      content: '❌ An error occurred while processing the command. Please try again later.',
      ephemeral: true, // Make the error message visible only to the user
    });
  }
}
