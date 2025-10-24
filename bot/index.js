import { Client, Collection, GatewayIntentBits, Partials, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import mongoose from 'mongoose';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'fs/promises';
import 'dotenv/config';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ---------- ENV CHECK ----------
const required = ['DISCORD_TOKEN','MONGO_URI','SESSION_KEY','DASHBOARD_URL'];
for(const key of required){
  if(!process.env[key]){
    console.error(`❌ Missing env var: ${key}`);
    process.exit(1);
  }
}

// ---------- CRYPTO UTIL ----------
function encryptJSON(obj, secret){
  const json = JSON.stringify(obj);
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(secret).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(json,'utf8','base64');
  enc += cipher.final('base64');
  return iv.toString('base64') + ':' + enc;
}
function decryptJSON(token, secret){
  const [ivBase64,dataBase64] = token.split(':');
  const iv = Buffer.from(ivBase64,'base64');
  const encrypted = Buffer.from(dataBase64,'base64');
  const key = crypto.createHash('sha256').update(secret).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc',key,iv);
  let dec = decipher.update(encrypted,'base64','utf8');
  dec += decipher.final('utf8');
  return JSON.parse(dec);
}

// ---------- DISCORD CLIENT ----------
const client = new Client({ intents:[GatewayIntentBits.Guilds], partials:[Partials.Channel] });
client.commands = new Collection();

// ---------- MONGODB ----------
await mongoose.connect(process.env.MONGO_URI);
console.log('✅ Connected to MongoDB');

// ---------- LOAD COMMANDS ----------
async function loadCommands(dir){
  const files = await fs.readdir(dir,{withFileTypes:true});
  const cmds = [];
  for(const file of files){
    const path = join(dir,file.name);
    if(file.isDirectory()) cmds.push(...await loadCommands(path));
    else if(file.name.endsWith('.js')){
      const cmd = await import(`file://${path}`);
      if(cmd.data && cmd.execute) cmds.push(cmd);
    }
  }
  return cmds;
}
const commands = await loadCommands(join(PROJECT_ROOT,'commands'));
for(const c of commands) client.commands.set(c.data.name,c);
console.log(`✅ Loaded ${commands.length} commands`);

// ---------- TICKET COMMAND INTEGRATED ----------
client.commands.set('ticket',{
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Setup/manage ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub=>sub.setName('setup').setDescription('Generate setup link'))
    .addSubcommand(sub=>sub.setName('status').setDescription('Check ticket status')),
  execute: async (interaction)=>{
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const user = interaction.user;
    if(sub==='setup'){
      const payload = {guildId:guild.id,guildName:guild.name,createdBy:user.id,ts:Date.now()};
      const token = encryptJSON(payload,process.env.SESSION_KEY);
      const link = `${process.env.DASHBOARD_URL}/setup.html?token=${encodeURIComponent(token)}`;
      await interaction.reply({
        embeds:[{
          title:'🎫 Ticket Setup',
          description:`Configure panel for **${guild.name}**`,
          fields:[
            {name:'Server',value:`${guild.name} (${guild.id})`,inline:true},
            {name:'Requested by',value:user.tag,inline:true}
          ],
          color:0x5865f2
        }],
        components:[{
          type:1,
          components:[{type:2,style:5,label:'Open Setup Panel',url:link}]
        }],
        ephemeral:true
      });
    } else if(sub==='status'){
      await interaction.reply({content:`✅ Ticket system active in **${guild.name}**.`,ephemeral:true});
    }
  }
});

// ---------- EVENTS ----------
client.once('clientReady',()=>console.log(`🤖 Logged in as ${client.user.tag}`));
client.on('interactionCreate', async (i)=>{
  if(!i.isChatInputCommand()) return;
  const cmd = client.commands.get(i.commandName);
  if(cmd) try{ await cmd.execute(i); }catch(e){ console.error(e); }
});

// ---------- EXPRESS DASHBOARD ----------
const app = express();
const PORT = process.env.PORT || 10000;
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(join(PROJECT_ROOT,'dashboard','public')));
app.use(session({
  secret:process.env.SESSION_KEY,
  resave:false,
  saveUninitialized:false,
  store:MongoStore.create({mongoUrl:process.env.MONGO_URI})
}));

// AUTH MIDDLEWARE
function ensureAuth(req,res,next){ if(!req.session.discordUser) return res.redirect('/login'); next(); }

// ---------- API: VERIFY SETUP TOKEN ----------
app.get('/api/setup',ensureAuth,(req,res)=>{
  const { token } = req.query;
  if(!token) return res.json({error:'No token provided'});
  try{
    const payload = decryptJSON(token,process.env.SESSION_KEY);
    res.json({guildId:payload.guildId,guildName:payload.guildName,createdBy:payload.createdBy});
  }catch(e){
    res.json({error:'Invalid or expired token'});
  }
});

// ---------- DASHBOARD ROUTES ----------
app.get('/',(req,res)=>res.sendFile(join(PROJECT_ROOT,'dashboard','public','index.html')));
app.get('/setup.html',ensureAuth,(req,res)=>res.sendFile(join(PROJECT_ROOT,'dashboard','public','setup.html')));

// ---------- START SERVER + BOT ----------
app.listen(PORT,'0.0.0.0',()=>console.log(`🌐 Dashboard running at http://0.0.0.0:${PORT}`));
try{ await client.login(process.env.DISCORD_TOKEN); }
catch(err){ console.error('❌ Discord login failed',err.message); process.exit(1); }
