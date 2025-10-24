// events/guildMemberAdd.js
import { EmbedBuilder, ChannelType } from 'discord.js';
import WelcomeChannel from '../models/Welcome.js';

export default {
  name: 'guildMemberAdd',
  async execute(member, client) {
    try {
      // Find the welcome channel configuration for the guild
      const welcomeData = await WelcomeChannel.findOne({ guildId: member.guild.id });
      if (!welcomeData) {
        console.log(`No welcome channel set for guild ${member.guild.id}`);
        return;
      }

      // Get the channel from the guild's cache
      const channel = member.guild.channels.cache.get(welcomeData.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        console.log(`Invalid or non-text channel ${welcomeData.channelId} in guild ${member.guild.id}`);
        return;
      }

      // Create a welcome embed
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('Welcome!')
        .setDescription(`Welcome to **${member.guild.name}**, ${member.user.tag}! We're glad you're here!`)
        .addFields(
          { name: 'User', value: member.user.toString(), inline: true },
          { name: 'Joined', value: new Date().toLocaleDateString(), inline: true }
        )
        .setTimestamp();

      // Set image if provided in the welcome configuration or use guild banner
      if (welcomeData.imageUrl) {
        embed.setImage(welcomeData.imageUrl);
      } else if (member.guild.banner) {
        embed.setImage(member.guild.bannerURL({ size: 1024 }));
      }

      // Send the welcome message
      await channel.send({ embeds: [embed] });
      console.log(`Sent welcome message for ${member.user.tag} in ${member.guild.name}`);
    } catch (error) {
      console.error(`Error in guildMemberAdd event for guild ${member.guild.id}:`, error);
    }
  },
};
