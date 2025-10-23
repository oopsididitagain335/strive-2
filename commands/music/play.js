import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play music from YouTube, Spotify, etc.')
  .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true));

export async function execute(interaction) {
  const query = interaction.options.getString('query');
  const member = interaction.guild.members.cache.get(interaction.user.id);

  if (!member.voice.channel) {
    return interaction.reply({ content: '❌ Join a voice channel first!', ephemeral: true });
  }

  await interaction.deferReply();
  // In real app: integrate with ytdl-core, spotify-url-info, etc.
  await interaction.editReply(`▶️ Searching & playing: **${query}**`);
}
