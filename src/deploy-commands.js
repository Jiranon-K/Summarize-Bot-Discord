// ลงทะเบียน Slash Commands
const { REST, Routes } = require("discord.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const dotenv = require("dotenv");

dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName("สรุปการประชุม")
    .setDescription("📄 เลือกไฟล์การประชุมจาก Google Drive เพื่อสรุป")
    .setDMPermission(false)
    .toJSON(),
];

async function deployCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

  try {
    console.log("🔄 Started refreshing application (/) commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Successfully reloaded application (/) commands!");
    console.log("📝 Registered commands:");
    commands.forEach((cmd) => {
      console.log(`   - /${cmd.name}: ${cmd.description}`);
    });
  } catch (error) {
    console.error("❌ Error deploying commands:", error);
  }
}

deployCommands();
