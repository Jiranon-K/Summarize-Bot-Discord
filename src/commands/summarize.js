const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const googleDriveService = require("../services/googleDrive");
const { checkPermission } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("สรุปการประชุม")
    .setDescription("📄 เลือกไฟล์การประชุมจาก Google Drive เพื่อสรุป"),

  async execute(interaction) {
    if (process.env.ALLOWED_ROLES) {
      const hasPermission = await checkPermission(interaction.member);
      if (!hasPermission) {
        return interaction.reply({
          content: "❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้",
          ephemeral: true,
        });
      }
    }

    await interaction.deferReply();

    try {
      await interaction.editReply({
        content: "🔍 กำลังดึงรายการไฟล์จาก Google Drive...",
      });

      const files = await googleDriveService.listFiles();

      if (!files || files.length === 0) {
        return await interaction.editReply({
          content:
            "📭 ไม่พบไฟล์การประชุมในโฟลเดอร์\n\nโปรดตรวจสอบว่า:\n• มีไฟล์ audio/video ในโฟลเดอร์\n• ไฟล์ไม่ถูกลบ (อยู่ในถังขยะ)\n• Bot มีสิทธิ์เข้าถึงโฟลเดอร์",
          embeds: [],
          components: [],
        });
      }

      const displayFiles = files.slice(0, 25);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📁 เลือกไฟล์การประชุมเพื่อสรุป")
        .setDescription(
          "กรุณาเลือกไฟล์ที่ต้องการจากรายการด้านล่างค่ะ/ครับ\nการประมวลผลอาจใช้เวลาหลายนาทีขึ้นอยู่กับขนาดไฟล์"
        )
        .addFields(
          {
            name: `📊 ไฟล์ที่พบ: ${files.length} ไฟล์`,
            value:
              files.length > 25
                ? "แสดง 25 ไฟล์ล่าสุด (จำกัดโดย Discord)"
                : "แสดงไฟล์ทั้งหมดที่พบ",
            inline: false,
          },
          {
            name: "💡 คำแนะนำ",
            value:
              "• เลือกไฟล์เสียงหรือวิดีโอที่รองรับ\n• ไฟล์ไม่ควรใหญ่เกิน 125MB",
          }
        )
        .setTimestamp()
        .setFooter({
          text: `ร้องขอโดย ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL(),
        });
      const menuOptions = displayFiles.map((file) => {
        const isValidSize = googleDriveService.isFileSizeValid(file.sizeBytes);
        const emoji = file.mimeType.includes("video") ? "🎥" : "🎵";

        let fileName = file.name;
        if (fileName.length > 80) {
          fileName = fileName.substring(0, 77) + "...";
        }

        let description = `${file.type} • ${file.size} • ${file.modifiedDate}`;
        if (!isValidSize) {
          description = `⚠️ ไฟล์ใหญ่เกิน 125MB • ${file.size}`;
        }

        return {
          label: fileName,
          description: description.substring(0, 100),
          value: file.id,
          emoji: emoji,
        };
      });
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("file_select")
        .setPlaceholder("🔽 เลือกไฟล์การประชุม")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(menuOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const cancelButton = new ButtonBuilder()
        .setCustomId("cancel_summary")
        .setLabel("ยกเลิก")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌");

      const refreshButton = new ButtonBuilder()
        .setCustomId("refresh_files")
        .setLabel("รีเฟรช")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄");

      const buttonRow = new ActionRowBuilder().addComponents(
        refreshButton,
        cancelButton
      );

      await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [row, buttonRow],
      });
    } catch (error) {
      console.error("❌ Error fetching files:", error);
      await interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการดึงรายการไฟล์: ${error.message}`,
        embeds: [],
        components: [],
      });
    }
  },

  async handleFileSelect(interaction, fileId) {
    try {
      await interaction.update({
        content: "🔍 กำลังตรวจสอบไฟล์ที่คุณเลือก...",
        embeds: [],
        components: [],
      });

      const file = await googleDriveService.getFile(fileId);
      if (!googleDriveService.isFileSizeValid(file.sizeBytes)) {
        return await interaction.editReply({
          content: `❌ ไฟล์ "${file.name}" มีขนาด ${file.size} ซึ่งใหญ่เกิน 125MB\n\nกรุณาเลือกไฟล์ที่มีขนาดเล็กกว่า หรือลดขนาดไฟล์ก่อนอัพโหลด`,
          embeds: [],
          components: [],
        });
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("✅ ไฟล์พร้อมส่งประมวลผล")
        .setDescription(`คุณได้เลือกไฟล์ **${file.name}**.`)
        .addFields(
          { name: "📊 ขนาด", value: file.size, inline: true },
          { name: "🎯 ประเภท", value: file.type, inline: true }
        )
        .setFooter({
          text: `ร้องขอโดย ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({
        content: "⏳ เตรียมส่งไฟล์...",
        embeds: [confirmEmbed],
        components: [],
      });

      const fileSizeMB = (file.sizeBytes || 0) / (1024 * 1024);
      const estimatedMinutes = Math.max(3, Math.ceil(fileSizeMB / 3));
      const estimatedTimeRange = `${estimatedMinutes}-${
        estimatedMinutes + 2
      } นาที`;

      const attemptingProcessEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("🚀 กำลังเริ่มต้นการประมวลผลไฟล์")
        .setDescription(
          `ไฟล์: **${file.name}**\nขนาด: **${fileSizeMB.toFixed(1)} MB**`
        )
        .addFields(
          { name: "⏱️ เวลาโดยประมาณ", value: estimatedTimeRange, inline: true },
          { name: "🔍 สถานะ", value: "กำลังส่งคำขอ...", inline: true }
        )
        .setFooter({
          text: `ไฟล์ของ ${interaction.user.tag} • ระบบจะแจ้งผลสรุปเป็นข้อความใหม่`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [attemptingProcessEmbed],
        content: null,
      });

      try {
        const n8nService = require("../services/n8n");
        await n8nService.triggerWorkflow({
          fileId: file.id,
          fileName: file.name,
          fileMimeType: file.mimeType,
          fileSize: file.sizeBytes,
          channelId: interaction.channelId,
          userId: interaction.user.id,
          userName: interaction.user.tag,
          userAvatarURL: interaction.user.displayAvatarURL(),
        });

        const successHandOffEmbed = new EmbedBuilder()
          .setColor(0x28a745)
          .setTitle("✅ ส่งคำขอประมวลผลสำเร็จ")
          .setDescription(
            `การประมวลผลไฟล์ **${file.name}** ได้เริ่มต้นแล้ว ผลสรุปจะถูกส่งเป็นข้อความใหม่ในไม่ช้า (หากมี)`
          )
          .setFooter({
            text: `ไฟล์ของ ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTimestamp();

        await interaction.editReply({
          embeds: [successHandOffEmbed],
          content: null,
        });
      } catch (error) {
        console.error("❌ Error in n8n processing:", error);
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ เกิดข้อผิดพลาดในการส่งไฟล์ไปประมวลผล")
          .setDescription(
            `ไม่สามารถส่งไฟล์ **${file.name}** ไปประมวลผลได้\n**สาเหตุ:** ${
              error.message || "ไม่ทราบสาเหตุ"
            }`
          )
          .setFooter({
            text: `ไฟล์ของ ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTimestamp();

        await interaction.editReply({
          embeds: [errorEmbed],
          content: null,
        });
      }
    } catch (error) {
      console.error("❌ Error handling file selection:", error);
      const criticalErrorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("❌ เกิดข้อผิดพลาดรุนแรง")
        .setDescription(
          `ไม่สามารถดำเนินการต่อได้: ${error.message || "ไม่ทราบสาเหตุ"}`
        )
        .setFooter({
          text: `ไฟล์ของ ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();
      await interaction.editReply({
        embeds: [criticalErrorEmbed],
        content: "กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแล",
        components: [],
      });
    }
  },
  async handleRefresh(interaction) {
    await interaction.update({
      content: "🔄 กำลังรีเฟรชรายการไฟล์...",
      embeds: [],
      components: [],
    });

    try {
      const files = await googleDriveService.listFiles();

      if (!files || files.length === 0) {
        return await interaction.editReply({
          content:
            "📭 ไม่พบไฟล์การประชุมในโฟลเดอร์\n\nโปรดตรวจสอบว่า:\n• มีไฟล์ audio/video ในโฟลเดอร์\n• ไฟล์ไม่ถูกลบ (อยู่ในถังขยะ)\n• Bot มีสิทธิ์เข้าถึงโฟลเดอร์",
          embeds: [],
          components: [],
        });
      }

      const displayFiles = files.slice(0, 25);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📁 เลือกไฟล์การประชุมเพื่อสรุป (รีเฟรชแล้ว)")
        .setDescription(
          "กรุณาเลือกไฟล์ที่ต้องการจากรายการด้านล่างค่ะ/ครับ\nการประมวลผลอาจใช้เวลาหลายนาทีขึ้นอยู่กับขนาดไฟล์"
        )
        .addFields(
          {
            name: `📊 ไฟล์ที่พบ: ${files.length} ไฟล์`,
            value:
              files.length > 25
                ? "แสดง 25 ไฟล์ล่าสุด (จำกัดโดย Discord)"
                : "แสดงไฟล์ทั้งหมดที่พบ",
            inline: false,
          },
          {
            name: "💡 คำแนะนำ",
            value:
              "• เลือกไฟล์เสียงหรือวิดีโอที่รองรับ\n• ไฟล์ไม่ควรใหญ่เกิน 125MB",
          }
        )
        .setTimestamp()
        .setFooter({
          text: `รีเฟรชโดย ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL(),
        });

      const menuOptions = displayFiles.map((file) => {
        const isValidSize = googleDriveService.isFileSizeValid(file.sizeBytes);
        const emoji = file.mimeType.includes("video") ? "🎥" : "🎵";

        let fileName = file.name;
        if (fileName.length > 80) {
          fileName = fileName.substring(0, 77) + "...";
        }

        let description = `${file.type} • ${file.size} • ${file.modifiedDate}`;
        if (!isValidSize) {
          description = `⚠️ ไฟล์ใหญ่เกิน 125MB • ${file.size}`;
        }

        return {
          label: fileName,
          description: description.substring(0, 100),
          value: file.id,
          emoji: emoji,
        };
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("file_select")
        .setPlaceholder("🔽 เลือกไฟล์การประชุม")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(menuOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const cancelButton = new ButtonBuilder()
        .setCustomId("cancel_summary")
        .setLabel("ยกเลิก")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌");

      const refreshButton = new ButtonBuilder()
        .setCustomId("refresh_files")
        .setLabel("รีเฟรช")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄");

      const buttonRow = new ActionRowBuilder().addComponents(
        refreshButton,
        cancelButton
      );

      await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [row, buttonRow],
      });
    } catch (error) {
      console.error("❌ Error refreshing files:", error);
      await interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการรีเฟรช: ${error.message}`,
        embeds: [],
        components: [],
      });
    }
  },
};
