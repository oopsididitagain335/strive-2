const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const OLD_CATEGORY_NAME = '📁・LOGS';
const DONATION_LINK = 'https://coff.ee/solacedev'; // ✅ Removed trailing space

// === NEW CATEGORY STRUCTURE ===
const LOG_CATEGORIES = {
  MOD: { name: '📁・MOD LOGS', color: 0xff4500 },
  MESSAGE: { name: '📁・MESSAGE LOGS', color: 0x5865f2 },
  MEMBER: { name: '📁・MEMBER LOGS', color: 0x00ff00 },
  SERVER: { name: '📁・SERVER LOGS', color: 0x0099ff },
  VOICE: { name: '📁・VOICE & STAGE', color: 0x800080 },
  INTEGRATIONS: { name: '📁・INTEGRATIONS', color: 0x6b7280 },
};

// Map log types to category
const LOG_TYPES = {
  // MOD
  bans: { name: 'bans', topic: '⛔ bans', category: 'MOD' },
  unbans: { name: 'unbans', topic: '🔓 unbans', category: 'MOD' },
  kicks: { name: 'kicks', topic: '👢 member kicked', category: 'MOD' },
  timeouts: { name: 'timeouts', topic: '🛡️ timeouts', category: 'MOD' },
  roleGiven: { name: 'role-given', topic: '✅ role assigned', category: 'MOD' },
  roleTaken: { name: 'role-taken', topic: '❌ role removed', category: 'MOD' },
  // MESSAGE
  msgSent: { name: 'msg-sent', topic: '💬 message sent', category: 'MESSAGE' },
  msgDeleted: { name: 'msg-deleted', topic: '🗑️ message deleted', category: 'MESSAGE' },
  msgEdited: { name: 'msg-edited', topic: '✏️ message edited', category: 'MESSAGE' },
  msgBulkDeleted: { name: 'msg-bulk-deleted', topic: '🧨 bulk delete', category: 'MESSAGE' },
  reactionsAdd: { name: 'reactions-add', topic: '➕ reaction add', category: 'MESSAGE' },
  reactionsRemove: { name: 'reactions-remove', topic: '➖ reaction remove', category: 'MESSAGE' },
  pins: { name: 'pins', topic: '📌 pins updated', category: 'MESSAGE' },
  // MEMBER
  joins: { name: 'joins', topic: '📥 member joins', category: 'MEMBER' },
  leaves: { name: 'leaves', topic: '🚪 member leaves', category: 'MEMBER' },
  nicknames: { name: 'nicknames', topic: '📛 nickname changes', category: 'MEMBER' },
  profileUpdates: { name: 'profile-update', topic: '👤 profile changes', category: 'MEMBER' },
  boost: { name: 'boost', topic: '🚀 boosts', category: 'MEMBER' },
  // SERVER
  roleCreates: { name: 'role-create', topic: '✅ role created', category: 'SERVER' },
  roleDeletes: { name: 'role-delete', topic: '❌ role deleted', category: 'SERVER' },
  roleUpdates: { name: 'role-update', topic: '🔄 role updated', category: 'SERVER' },
  permissions: { name: 'permissions', topic: '🔐 permission changes', category: 'SERVER' },
  channelCreates: { name: 'channel-create', topic: '✅ channel created', category: 'SERVER' },
  channelDeletes: { name: 'channel-delete', topic: '❌ channel deleted', category: 'SERVER' },
  channelUpdates: { name: 'channel-update', topic: '🔄 channel updated', category: 'SERVER' },
  emojiCreates: { name: 'emoji-create', topic: '✅ emoji added', category: 'SERVER' },
  emojiDeletes: { name: 'emoji-delete', topic: '❌ emoji removed', category: 'SERVER' },
  emojiUpdates: { name: 'emoji-update', topic: '🔄 emoji updated', category: 'SERVER' },
  stickerCreates: { name: 'sticker-create', topic: '✅ sticker added', category: 'SERVER' },
  stickerDeletes: { name: 'sticker-delete', topic: '❌ sticker removed', category: 'SERVER' },
  stickerUpdates: { name: 'sticker-update', topic: '🔄 sticker updated', category: 'SERVER' },
  serverUpdates: { name: 'server-update', topic: '🔧 server settings', category: 'SERVER' },
  // VOICE
  voiceJoins: { name: 'voice-join', topic: '🎙️ joined voice', category: 'VOICE' },
  voiceLeaves: { name: 'voice-leave', topic: '⏹️ left voice', category: 'VOICE' },
  voiceSwitches: { name: 'voice-switch', topic: '🔁 voice switch', category: 'VOICE' },
  voiceStates: { name: 'voice-states', topic: '🎚️ mute/deaf changes', category: 'VOICE' },
  threads: { name: 'threads', topic: '🧵 threads', category: 'VOICE' },
  stageEvents: { name: 'stage-events', topic: '🎙️ stage events', category: 'VOICE' },
  // INTEGRATIONS
  inviteCreates: { name: 'invite-create', topic: '🔗 invite created', category: 'INTEGRATIONS' },
  inviteDeletes: { name: 'invite-delete', topic: '❌ invite deleted', category: 'INTEGRATIONS' },
  webhookCreate: { name: 'webhook-create', topic: '🔗 webhook created', category: 'INTEGRATIONS' },
  webhookUpdate: { name: 'webhook-update', topic: '🔄 webhook updated', category: 'INTEGRATIONS' },
  webhookDelete: { name: 'webhook-delete', topic: '❌ webhook deleted', category: 'INTEGRATIONS' },
  integrationCreate: { name: 'integration-create', topic: '🔌 integration added', category: 'INTEGRATIONS' },
  integrationUpdate: { name: 'integration-update', topic: '🔄 integration updated', category: 'INTEGRATIONS' },
  integrationDelete: { name: 'integration-delete', topic: '❌ integration removed', category: 'INTEGRATIONS' },
  automod: { name: 'automod', topic: '🛡️ AutoMod triggered', category: 'INTEGRATIONS' },
  audit: { name: 'audit', topic: '📜 audit catch-all', category: 'INTEGRATIONS' },
  interactions: { name: 'interactions', topic: '🧩 slash/button usage', category: 'INTEGRATIONS' },
  applicationPerms: { name: 'application-perms', topic: '🛠️ app perms updated', category: 'INTEGRATIONS' },
};

module.exports = (client) => {
  const formatUser = (user) => (user ? `${user.tag} (${user.id})` : 'Unknown User');
  const formatChannel = (ch) => (ch ? `<#${ch.id}>` : 'Unknown Channel');

  // === CLEANUP OLD ===
  const cleanupOldLogs = async (guild) => {
    const oldCat = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name === OLD_CATEGORY_NAME
    );
    if (!oldCat) return;
    try {
      for (const channel of oldCat.children.cache.values()) {
        await channel.delete().catch(() => {});
      }
      await oldCat.delete().catch(() => {});
    } catch (err) {
      console.error(`[Cleanup] ${guild.name}:`, err.message);
    }
  };

  // === SETUP ===
  const ensureLogScaffold = async (guild) => {
    if (!guild?.available || guild.deleted) return;
    await cleanupOldLogs(guild);
    const categoryCache = new Map();

    for (const config of Object.values(LOG_TYPES)) {
      const categoryName = LOG_CATEGORIES[config.category]?.name;
      if (!categoryName) continue;

      let category = categoryCache.get(categoryName);
      if (!category) {
        category = guild.channels.cache.find(
          (ch) => ch.type === ChannelType.GuildCategory && ch.name === categoryName
        );
        if (!category) {
          category = await guild.channels
            .create({
              name: categoryName,
              type: ChannelType.GuildCategory,
              permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                {
                  id: client.user.id,
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                  ],
                },
              ],
            })
            .catch(() => null);
        }
        if (!category) continue;
        categoryCache.set(categoryName, category);
      }

      const exists = guild.channels.cache.find(
        (ch) => ch.parentId === category.id && ch.name === config.name
      );
      if (!exists) {
        await guild.channels
          .create({
            name: config.name,
            type: ChannelType.GuildText,
            topic: config.topic,
            parent: category.id,
            permissionOverwrites: [
              { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
              {
                id: client.user.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.EmbedLinks,
                ],
              },
            ],
          })
          .catch(() => {});
      }
    }
  };

  // === GET CHANNEL ===
  const getLogChannel = (guild, typeKey) => {
    const config = LOG_TYPES[typeKey];
    if (!config || !guild) return null;
    const categoryName = LOG_CATEGORIES[config.category]?.name;
    if (!categoryName) return null;

    const category = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name === categoryName
    );
    if (!category) return null;

    return guild.channels.cache.find(
      (ch) => ch.parentId === category.id && ch.name === config.name
    );
  };

  // === SEND ===
  const sendLog = async (guild, typeKey, embed) => {
    if (!guild || guild.deleted) return;
    const channel = getLogChannel(guild, typeKey);
    if (!channel) return;

    embed.addFields({
      name: '🔐 Permanently logged',
      value: `Nothing is hidden. [Support development](${DONATION_LINK})`,
    });
    embed.setTimestamp();

    try {
      await channel.send({ embeds: [embed] });
    } catch (err) {
      // Silent fail — don't crash bot over logging
    }
  };

  // === SETUP HOOKS ===
  client.once('ready', async () => {
    for (const guild of client.guilds.cache.values()) {
      await ensureLogScaffold(guild).catch(console.error);
    }
  });

  client.on('guildCreate', (guild) => {
    ensureLogScaffold(guild).catch(console.error);
  });

  // === MESSAGE EVENTS ===
  client.on('messageCreate', (msg) => {
    if (!msg.guild || msg.author.bot) return;
    const embed = new EmbedBuilder()
      .setTitle('💬 Message Sent')
      .setDescription(msg.content?.slice(0, 1024) || '*No content*')
      .addFields(
        { name: 'Author', value: formatUser(msg.author) },
        { name: 'Channel', value: formatChannel(msg.channel) }
      )
      .setColor(LOG_CATEGORIES.MESSAGE.color);
    sendLog(msg.guild, 'msgSent', embed);
  });

  client.on('messageDelete', (msg) => {
    if (!msg.guild) return;
    // Handle partials by fetching if needed (optional)
    const author = msg.author || { tag: 'Unknown', id: '0' };
    const embed = new EmbedBuilder()
      .setTitle('🗑️ Message Deleted')
      .setDescription(msg.content?.slice(0, 1024) || '*No content*')
      .addFields(
        { name: 'Author', value: formatUser(author) },
        { name: 'Channel', value: formatChannel(msg.channel) }
      )
      .setColor(LOG_CATEGORIES.MESSAGE.color);
    sendLog(msg.guild, 'msgDeleted', embed);
  });

  client.on('messageUpdate', (oldMsg, newMsg) => {
    if (!oldMsg.guild || oldMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;

    const embed = new EmbedBuilder()
      .setTitle('✏️ Message Edited')
      .addFields(
        { name: 'Author', value: formatUser(oldMsg.author) },
        { name: 'Channel', value: formatChannel(oldMsg.channel) },
        { name: 'Before', value: (oldMsg.content || '*No content*').slice(0, 1024) },
        { name: 'After', value: (newMsg.content || '*No content*').slice(0, 1024) }
      )
      .setColor(LOG_CATEGORIES.MESSAGE.color);
    sendLog(oldMsg.guild, 'msgEdited', embed);
  });

  client.on('messageDeleteBulk', (msgs) => {
    const guild = msgs.first()?.guild;
    if (!guild) return;
    const embed = new EmbedBuilder()
      .setTitle('🧨 Bulk Messages Deleted')
      .setDescription(`${msgs.size} messages deleted`)
      .setColor(LOG_CATEGORIES.MESSAGE.color);
    sendLog(guild, 'msgBulkDeleted', embed);
  });

  // === REACTIONS ===
  client.on('messageReactionAdd', (reaction, user) => {
    if (user.bot) return;
    const guild = reaction.message?.guild;
    if (!guild) return;
    const embed = new EmbedBuilder()
      .setTitle('➕ Reaction Added')
      .setDescription(`${reaction.emoji.toString()}`)
      .addFields(
        { name: 'User', value: formatUser(user) },
        { name: 'Message', value: `[Jump](${reaction.message.url})` }
      )
      .setColor(LOG_CATEGORIES.MESSAGE.color);
    sendLog(guild, 'reactionsAdd', embed);
  });

  client.on('messageReactionRemove', (reaction, user) => {
    if (user.bot) return;
    const guild = reaction.message?.guild;
    if (!guild) return;
    const embed = new EmbedBuilder()
      .setTitle('➖ Reaction Removed')
      .setDescription(`${reaction.emoji.toString()}`)
      .addFields(
        { name: 'User', value: formatUser(user) },
        { name: 'Message', value: `[Jump](${reaction.message.url})` }
      )
      .setColor(LOG_CATEGORIES.MESSAGE.color);
    sendLog(guild, 'reactionsRemove', embed);
  });

  // === MEMBER ===
  client.on('guildMemberAdd', (member) => {
    const embed = new EmbedBuilder()
      .setTitle('📥 Member Joined')
      .setDescription(formatUser(member.user))
      .setColor(LOG_CATEGORIES.MEMBER.color);
    sendLog(member.guild, 'joins', embed);
  });

  client.on('guildMemberRemove', (member) => {
    const embed = new EmbedBuilder()
      .setTitle('🚪 Member Left')
      .setDescription(formatUser(member.user))
      .setColor(LOG_CATEGORIES.MEMBER.color);
    sendLog(member.guild, 'leaves', embed);
  });

  client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
      const embed = new EmbedBuilder()
        .setTitle('📛 Nickname Changed')
        .addFields(
          { name: 'User', value: formatUser(newMember.user) },
          { name: 'Before', value: oldMember.nickname || 'None' },
          { name: 'After', value: newMember.nickname || 'None' }
        )
        .setColor(LOG_CATEGORIES.MEMBER.color);
      sendLog(newMember.guild, 'nicknames', embed);
    }

    const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

    if (addedRoles.size > 0) {
      const embed = new EmbedBuilder()
        .setTitle('✅ Role Assigned')
        .setDescription(`Role(s) added to ${formatUser(newMember.user)}`)
        .addFields({ name: 'Roles', value: addedRoles.map((r) => r.name).join(', ') })
        .setColor(LOG_CATEGORIES.MOD.color);
      sendLog(newMember.guild, 'roleGiven', embed);
    }
    if (removedRoles.size > 0) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Role Removed')
        .setDescription(`Role(s) removed from ${formatUser(newMember.user)}`)
        .addFields({ name: 'Roles', value: removedRoles.map((r) => r.name).join(', ') })
        .setColor(LOG_CATEGORIES.MOD.color);
      sendLog(newMember.guild, 'roleTaken', embed);
    }
  });

  // === SERVER EVENTS ===
  client.on('roleCreate', (role) => {
    const embed = new EmbedBuilder()
      .setTitle('✅ Role Created')
      .setDescription(role.name)
      .setColor(LOG_CATEGORIES.SERVER.color);
    sendLog(role.guild, 'roleCreates', embed);
  });

  client.on('roleDelete', (role) => {
    const embed = new EmbedBuilder()
      .setTitle('❌ Role Deleted')
      .setDescription(role.name)
      .setColor(LOG_CATEGORIES.SERVER.color);
    sendLog(role.guild, 'roleDeletes', embed);
  });

  client.on('roleUpdate', (oldRole, newRole) => {
    if (
      oldRole.name !== newRole.name ||
      oldRole.color !== newRole.color ||
      !oldRole.permissions.equals(newRole.permissions)
    ) {
      const embed = new EmbedBuilder()
        .setTitle('🔄 Role Updated')
        .setDescription(`Role: ${newRole.name}`)
        .addFields(
          { name: 'Name Before', value: oldRole.name || 'None' },
          { name: 'Name After', value: newRole.name || 'None' },
          {
            name: 'Color Before',
            value: oldRole.color ? `#${oldRole.color.toString(16).padStart(6, '0')}` : 'None',
          },
          {
            name: 'Color After',
            value: newRole.color ? `#${newRole.color.toString(16).padStart(6, '0')}` : 'None',
          }
        )
        .setColor(LOG_CATEGORIES.SERVER.color);
      sendLog(newRole.guild, 'roleUpdates', embed);
    }
  });

  client.on('channelCreate', (channel) => {
    if (channel.type === ChannelType.GuildCategory) return; // Skip categories
    const embed = new EmbedBuilder()
      .setTitle('✅ Channel Created')
      .setDescription(channel.name)
      .setColor(LOG_CATEGORIES.SERVER.color);
    sendLog(channel.guild, 'channelCreates', embed);
  });

  client.on('channelDelete', (channel) => {
    if (channel.type === ChannelType.GuildCategory) return;
    const embed = new EmbedBuilder()
      .setTitle('❌ Channel Deleted')
      .setDescription(channel.name)
      .setColor(LOG_CATEGORIES.SERVER.color);
    sendLog(channel.guild, 'channelDeletes', embed);
  });

  client.on('channelUpdate', (oldChannel, newChannel) => {
    if (oldChannel.type === ChannelType.GuildCategory) return;
    if (oldChannel.name !== newChannel.name || oldChannel.topic !== newChannel.topic) {
      const embed = new EmbedBuilder()
        .setTitle('🔄 Channel Updated')
        .setDescription(`Channel: ${newChannel.name}`)
        .addFields(
          { name: 'Name Before', value: oldChannel.name || 'None' },
          { name: 'Name After', value: newChannel.name || 'None' },
          { name: 'Topic Before', value: oldChannel.topic || 'None' },
          { name: 'Topic After', value: newChannel.topic || 'None' }
        )
        .setColor(LOG_CATEGORIES.SERVER.color);
      sendLog(newChannel.guild, 'channelUpdates', embed);
    }
  });

  // === VOICE ===
  client.on('voiceStateUpdate', (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const member = newState.member || oldState.member;
    if (!member) return;

    // Join
    if (!oldState.channelId && newState.channelId) {
      const embed = new EmbedBuilder()
        .setTitle('🎙️ Joined Voice')
        .setDescription(`${formatUser(member.user)} joined ${formatChannel(newState.channel)}`)
        .setColor(LOG_CATEGORIES.VOICE.color);
      sendLog(guild, 'voiceJoins', embed);
    }
    // Leave
    else if (oldState.channelId && !newState.channelId) {
      const embed = new EmbedBuilder()
        .setTitle('⏹️ Left Voice')
        .setDescription(`${formatUser(member.user)} left ${formatChannel(oldState.channel)}`)
        .setColor(LOG_CATEGORIES.VOICE.color);
      sendLog(guild, 'voiceLeaves', embed);
    }
    // Switch
    else if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId
    
