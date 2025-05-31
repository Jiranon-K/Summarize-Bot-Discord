// ไฟล์หลักของ Bot
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
    console.log(`📌 Loaded command: ${command.data.name}`);
  } else {
    console.log(
      `⚠️ Warning: Command at ${filePath} is missing "data" or "execute"`
    );
  }
}

async function testN8nConnection() {
  try {
    console.log("🔍 Testing N8N connection...");
    if (process.env.N8N_WEBHOOK_URL) {
      const testUrl = process.env.N8N_WEBHOOK_URL.replace(
        "/webhook/meeting-summary",
        "/healthz"
      );
      const response = await axios.get(testUrl, { timeout: 5000 });
      console.log("✅ N8N is reachable:", response.status);
    } else {
      console.error("❌ N8N_WEBHOOK_URL is not defined in .env file.");
    }
  } catch (error) {
    console.error("❌ Cannot reach N8N internal URL:", error.message);
    if (process.env.N8N_EXTERNAL_URL) {
      try {
        const externalTest = process.env.N8N_EXTERNAL_URL.replace(
          "/webhook/meeting-summary",
          "/healthz"
        );
        const response = await axios.get(externalTest, { timeout: 5000 });
        console.log("✅ N8N is reachable via external URL:", response.status);
      } catch (extError) {
        console.error(
          "❌ Cannot reach N8N via external URL either:",
          extError.message
        );
      }
    } else {
      console.log(
        "ℹ️ N8N_EXTERNAL_URL is not defined, skipping external test."
      );
    }
  }
}

client.once("ready", async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`📊 Bot is in ${client.guilds.cache.size} servers`);
  if (fs.existsSync("/app/build-info.txt")) {
    console.log(
      "📄 Build Info:",
      fs.readFileSync("/app/build-info.txt", "utf8")
    );
  }
  const n8nService = require("./services/n8n");
  if (n8nService && typeof n8nService.triggerWorkflow === "function") {
    console.log(
      "🔍 N8N Service type:",
      n8nService.triggerWorkflow.toString().includes("ASYNC")
        ? "ASYNC (OLD)"
        : "SYNC (NEW)"
    );
  } else {
    console.error("⚠️ N8N Service or triggerWorkflow method is not available.");
  }
  client.user.setActivity("พิมพ์ /สรุปการประชุม", { type: "LISTENING" });
  if (n8nService && typeof n8nService.setDiscordClient === "function") {
    n8nService.setDiscordClient(client);
    console.log("🔗 Connected n8n service to Discord client");
  } else {
    console.error(
      "⚠️ N8N Service or setDiscordClient method is not available."
    );
  }
  await testN8nConnection();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content === "!ping") {
    await message.reply("🏓 Pong! Bot กำลังทำงานครับ");
  }
  if (message.content === "!info") {
    const embed = {
      color: 0x5865f2,
      title: "📊 ข้อมูล Server",
      fields: [
        {
          name: "ชื่อ Server",
          value: message.guild.name,
          inline: true,
        },
        {
          name: "จำนวนสมาชิก",
          value: `${message.guild.memberCount} คน`,
          inline: true,
        },
        {
          name: "คุณคือ",
          value: message.author.tag,
          inline: true,
        },
      ],
      timestamp: new Date(),
      footer: {
        text: "Meeting Summary Bot",
      },
    };
    await message.reply({ embeds: [embed] });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`❌ No command found: ${interaction.commandName}`);
      return;
    }
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error executing ${interaction.commandName}:`, error);
      const errorMessage = {
        content: "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "file_select") {
      const selectedFileId = interaction.values[0];
      const command = client.commands.get("สรุปการประชุม");
      if (command && command.handleFileSelect) {
        await command.handleFileSelect(interaction, selectedFileId);
      }
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === "cancel_summary") {
      await interaction.update({
        content: "❌ ยกเลิกการสรุปการประชุม",
        embeds: [],
        components: [],
      });
    } else if (interaction.customId === "refresh_files") {
      const command = client.commands.get("สรุปการประชุม");
      if (command && command.handleRefresh) {
        await command.handleRefresh(interaction);
      }
    }
  }
});

client.on("error", (error) => {
  console.error("❌ Discord client error:", error);
});

client.on("guildCreate", (guild) => {
  console.log(`🎉 Bot joined new server: ${guild.name} (${guild.id})`);
});

client
  .login(process.env.BOT_TOKEN)
  .then(() => console.log("🚀 Bot is starting..."))
  .catch((error) => {
    console.error("❌ Failed to login:", error);
    process.exit(1);
  });

process.on("SIGINT", () => {
  console.log("\n👋 Bot is shutting down...");
  client.destroy();
  process.exit(0);
});
