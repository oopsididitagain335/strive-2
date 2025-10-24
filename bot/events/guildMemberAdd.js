// /bot/events/guildMemberAdd.js
import { EmbedBuilder } from 'discord.js';
import Welcome from '../../models/Welcome.js';

export const name = 'guildMemberAdd';

export async function execute(member) {
  try {
    const data = await Welcome.findOne({ guildId: member.guild.id });
    if (!data) return; // No channel configured

    const channel = member.guild.channels.cache.get(data.channelId);
    if (!channel) return;

    const description =
      member.guild.description?.trim() || `Welcome to **${member.guild.name}**!`;

    const embed = new EmbedBuilder()
      .setTitle(`Welcome to ${member.guild.name}!`)
      .setDescription(description)
      .setColor(0x00FF00);

    if (member.guild.icon) embed.setThumbnail(member.guild.iconURL({ size: 256 }));
    if (member.guild.banner) embed.setImage(member.guild.bannerURL({ size: 1024 }));
    else if (member.guild.splash) embed.setImage(member.guild.splashURL({ size: 1024 }));

    await channel.send({
      content: `👋 Welcome, ${member}!`,
      embeds: [embed],
    });
  } catch (err) {
    console.error('❌ Error sending welcome message:', err);
  }
}
