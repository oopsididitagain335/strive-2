const { EmbedBuilder } = require("discord.js");
const WelcomeChannel = require("../../models/WelcomeChannel");

module.exports = {
  name: "guildMemberAdd",
  once: false,
  async execute(member) {
    try {
      // Fetch the welcome channel configuration
      const welcomeConfig = await WelcomeChannel.findOne({ guildId: member.guild.id });
      if (!welcomeConfig || !welcomeConfig.channelId) {
        return; // No welcome channel configured
      }

      // Get the channel from the guild's channel cache
      const channel = member.guild.channels.cache.get(welcomeConfig.channelId);
      if (!channel || channel.type !== "GUILD_TEXT") {
        console.warn(`Invalid or non-text welcome channel: ${welcomeConfig.channelId}`);
        return;
      }

      // Set description using guild description or fallback
      const description =
        member.guild.description?.trim() || `Welcome to **${member.guild.name}**!`;

      // Create the welcome embed
      const embed = new EmbedBuilder()
        .setTitle(`Welcome to ${member.guild.name}!`)
        .setDescription(description)
        .setColor(0x00FF00);

      // Set thumbnail and image
      if (member.guild.icon) {
        embed.setThumbnail(member.guild.iconURL({ size: 256 }));
      }
      if (welcomeConfig.imageUrl) {
        embed.setImage(welcomeConfig.imageUrl); // Prioritize custom image from WelcomeChannel
      } else if (member.guild.banner) {
        embed.setImage(member.guild.bannerURL({ size: 1024 }));
      } else if (member.guild.splash) {
        embed.setImage(member.guild.splashURL({ size: 1024 }));
      }

      // Send the welcome message
      await channel.send({
        content: `👋 Welcome, ${member}!`,
        embeds: [embed],
      });
    } catch (err) {
      console.error(`❌ Error sending welcome message in guild ${member.guild.id}:`, err);
    }
  },
};
