// commands/welcome/setwelcome.js
const {
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  ChatInputCommandInteraction,
  Message,
  ChannelType,
} = require("discord.js");
const WelcomeChannel = require("../../models/Welcome");

module.exports = {
  name: "setwelcome",
  prefixCommand: true,
  data: new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set the channel where welcome messages are sent.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel to send welcome messages to.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("image_url")
        .setDescription("Optional: A direct link to an image for the embed.")
        .setRequired(false)
    ),

  async execute(interaction, args) {
    // ✅ Defer immediately to avoid 3-second timeout
    if (interaction.isChatInputCommand?.()) {
      await interaction.deferReply({ ephemeral: true });
    }

    const guild = interaction.guild;

    if (!guild) {
      return interaction.editReply
        ? await interaction.editReply("❌ This command can only be used in a server.")
        : await interaction.reply("❌ This command can only be used in a server.");
    }

    let channelId, imageUrl;

    if (interaction.isChatInputCommand?.()) {
      const channel = interaction.options.getChannel("channel");
      channelId = channel.id;
      imageUrl = interaction.options.getString("image_url")?.trim() || null;
    } else if (args && args.length >= 1) {
      const channelArg = args[0].trim();
      const channelMentionMatch = channelArg.match(/<#(\d{17,19})>/);
      channelId = channelMentionMatch
        ? channelMentionMatch[1]
        : channelArg.match(/\d{17,19}/)?.[0];

      if (!channelId) {
        return interaction.reply
          ? await interaction.reply({ content: "❌ Invalid channel format.", ephemeral: true })
          : await interaction.editReply("❌ Invalid channel format.");
      }

      imageUrl = args.slice(1).join(" ").trim() || null;
    } else {
      return interaction.editReply
        ? await interaction.editReply("❌ Please provide a channel.")
        : await interaction.reply({ content: "❌ Please provide a channel.", ephemeral: true });
    }

    const channel = guild.channels.cache.get(channelId);

    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.editReply
        ? await interaction.editReply("❌ Please specify a valid text channel.")
        : await interaction.reply({ content: "❌ Please specify a valid text channel.", ephemeral: true });
    }

    const executor = interaction.user || interaction.author;
    const member = await guild.members.fetch(executor.id);

    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.editReply
        ? await interaction.editReply("❌ You don't have permission.")
        : await interaction.reply({ content: "❌ You don't have permission.", ephemeral: true });
    }

    if (imageUrl) {
      try {
        new URL(imageUrl);
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(imageUrl)) {
          return interaction.editReply("❌ Invalid image URL.");
        }
      } catch {
        return interaction.editReply("❌ Invalid image URL format.");
      }
    }

    try {
      await WelcomeChannel.findOneAndUpdate(
        { guildId: guild.id },
        { channelId, imageUrl },
        { upsert: true, new: true }
      );

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("✅ Welcome Channel Set")
        .setDescription(`Welcome messages will now be sent in ${channel}.`)
        .addFields(
          { name: "Channel", value: channel.toString(), inline: true },
          { name: "Moderator", value: executor.tag, inline: true }
        )
        .setTimestamp();

      if (imageUrl) embed.setImage(imageUrl);
      else if (guild.banner) embed.setImage(guild.bannerURL({ size: 1024 }));

      // ✅ Use editReply for deferred, reply otherwise
      if (interaction.editReply) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }

    } catch (error) {
      console.error("Error setting welcome channel:", error);
      await interaction.editReply
        ? await interaction.editReply("❌ Could not save to database.")
        : await interaction.reply("❌ Database error.");
    }
  },
};
