// Synchronous Webhook 
const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

class N8nService {
  constructor() {
    this.webhookUrl = process.env.N8N_WEBHOOK_URL;
    this.externalUrl = process.env.N8N_EXTERNAL_URL || this.webhookUrl;
    this.discordClient = null;
  }

  setDiscordClient(client) {
    this.discordClient = client;
  }

  async sendProcessingMessage(
    channelId,
    fileName,
    fileSizeMB,
    userName,
    userAvatarURL
  ) {
    try {
      if (!this.discordClient) {
        console.error(
          "Error sending processing message: Discord client not set."
        );
        return;
      }
      const channel = await this.discordClient.channels.fetch(channelId);
      if (!channel) {
        console.error(
          `Error sending processing message: Channel not found ${channelId}`
        );
        return;
      }

      const estimatedMinutes = Math.max(3, Math.ceil(fileSizeMB / 3));

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(
          "🚀 การประมวลผลเริ่มต้นแล้ว (DEPRECATED - Should not be called)"
        )
        .setDescription(
          `ไฟล์: **${fileName}**\nขนาด: **${fileSizeMB.toFixed(1)} MB**`
        )
        .addFields(
          {
            name: "⏱️ เวลาโดยประมาณ",
            value: `${estimatedMinutes}-${estimatedMinutes + 2} นาที`,
            inline: true,
          },
          {
            name: "🔍 สถานะปัจจุบัน",
            value: "รับไฟล์แล้ว, กำลังประมวลผล...",
            inline: true,
          }
        )
        .setTimestamp();

      if (userName && userAvatarURL) {
        embed.setFooter({
          text: `ไฟล์ของ ${userName} • ระบบจะแจ้งผลเมื่อประมวลผลเสร็จ`,
          iconURL: userAvatarURL,
        });
      } else {
        embed.setFooter({ text: "ระบบจะแจ้งผลเมื่อประมวลผลเสร็จ" });
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error sending processing message (deprecated):", error);
    }
  }

  async triggerWorkflow(data) {
    if (!this.webhookUrl) {
      throw new Error("N8N_WEBHOOK_URL ไม่ได้ตั้งค่าใน .env");
    }

    let attemptError = null;

    try {
      console.log(
        `🚀 Trying internal URL: ${this.webhookUrl} for file: ${data.fileName}`
      );

      const response = await axios.post(
        this.webhookUrl,
        {
          fileId: data.fileId,
          fileName: data.fileName,
          fileMimeType: data.fileMimeType,
          fileSize: data.fileSize,
          channelId: data.channelId,
          userId: data.userId,
          userName: data.userName,
          userAvatarURL: data.userAvatarURL,
          workflowId: `${data.userId}-${Date.now()}`,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 1500000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      console.log(
        `✅ Received response from N8N (internal URL) for file: ${data.fileName}. Status: ${response.status}`
      );

      if (response && response.data) {
        await this.processN8nResponse(
          response.data,
          data.channelId,
          data.fileName,
          data.userId
        );
      } else {
        console.error(
          `❌ No valid data in response from N8N (internal URL) for file: ${data.fileName}. Response status: ${response?.status}`
        );
        throw new Error(
          `N8N ไม่ได้ส่งข้อมูลตอบกลับที่ถูกต้อง (สถานะ: ${response?.status})`
        );
      }
      return { success: true };
    } catch (error) {
      attemptError = error;
      let errorMessage = error.message;

      if (error.isAxiosError) {
        if (error.response && error.response.status === 524) {
          errorMessage = `Request failed with status code 524 (หมดเวลาการเชื่อมต่อจาก Gateway/Proxy)`;
        } else if (error.code === "ECONNABORTED") {
          errorMessage = `Request timed out (ECONNABORTED)`;
        }
      } else if (error.originalError && error.originalError.isAxiosError) {
        if (
          error.originalError.response &&
          error.originalError.response.status === 524
        ) {
          errorMessage = `Request failed with status code 524 (หมดเวลาการเชื่อมต่อจาก Gateway/Proxy)`;
        } else if (error.originalError.code === "ECONNABORTED") {
          errorMessage = `Request timed out (ECONNABORTED)`;
        }
      }

      console.error(
        `❌ N8N internal URL processing error for ${data.fileName}: ${errorMessage} (Original error code: ${error.code}, Status: ${error.response?.status})`
      );

      const isRetryableError =
        error.code === "ECONNABORTED" ||
        (error.response && error.response.status === 524) ||
        (error.message && error.message.toLowerCase().includes("timeout"));

      if (
        isRetryableError &&
        this.externalUrl &&
        this.webhookUrl !== this.externalUrl
      ) {
        console.warn(
          `⚠️ Internal URL failed for ${data.fileName}. Trying external URL: ${this.externalUrl}`
        );
        try {
          const extResponse = await axios.post(
            this.externalUrl,
            {
              fileId: data.fileId,
              fileName: data.fileName,
              fileMimeType: data.fileMimeType,
              fileSize: data.fileSize,
              channelId: data.channelId,
              userId: data.userId,
              userName: data.userName,
              userAvatarURL: data.userAvatarURL,
              workflowId: `${data.userId}-${Date.now()}-ext`,
            },
            {
              headers: { "Content-Type": "application/json" },
              timeout: 1500000,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            }
          );

          console.log(
            `✅ Received response from N8N (external URL) for file: ${data.fileName}. Status: ${extResponse.status}`
          );
          if (extResponse && extResponse.data) {
            await this.processN8nResponse(
              extResponse.data,
              data.channelId,
              data.fileName,
              data.userId
            );
          } else {
            console.error(
              `❌ No valid data in response from N8N (external URL) for file: ${data.fileName}. Response status: ${extResponse?.status}`
            );
            throw new Error(
              `N8N (External URL) ไม่ได้ส่งข้อมูลตอบกลับที่ถูกต้อง (สถานะ: ${extResponse?.status})`
            );
          }
          return { success: true };
        } catch (extError) {
          let extErrorMessage = extError.message;
          if (extError.isAxiosError) {
            if (extError.response && extError.response.status === 524) {
              extErrorMessage = `Request failed with status code 524 (หมดเวลาการเชื่อมต่อจาก Gateway/Proxy)`;
            } else if (extError.code === "ECONNABORTED") {
              extErrorMessage = `Request timed out (ECONNABORTED)`;
            }
          }
          console.error(
            `❌ External URL also failed for ${data.fileName}: ${extErrorMessage} (Original error code: ${extError.code}, Status: ${extError.response?.status})`
          );
          const finalError = new Error(
            `External URL failed: ${extErrorMessage}`
          );
          finalError.originalError = extError;
          throw finalError;
        }
      }

      const finalErrorToThrow = new Error(errorMessage);
      finalErrorToThrow.originalError = attemptError;
      throw finalErrorToThrow;
    }
  }

  async processN8nResponse(responseData, channelId, fileName, userId) {
    try {
      if (!this.discordClient) {
        console.error("Error processing N8N response: Discord client not set.");
        return;
      }
      const channel = await this.discordClient.channels.fetch(channelId);
      if (!channel) {
        console.error(`❌ Channel not found: ${channelId}`);
        return;
      }

      console.log(`📥 Processing N8N response for file: ${fileName}`);

      if (!responseData) {
        console.error(
          `❌ CRITICAL: processN8nResponse called with no responseData for file: ${fileName}. This should have been caught earlier.`
        );
        await this.sendErrorMessage(
          channelId,
          {
            error: {
              message: `ได้รับข้อมูลว่างเปล่าจากระบบประมวลผลสำหรับไฟล์: ${fileName}`,
            },
          },
          fileName
        );
        return;
      }
      console.log("Response data keys:", Object.keys(responseData));

      if (Array.isArray(responseData)) {
        console.log(
          `Response is array with ${responseData.length} items, taking first.`
        );
        if (responseData.length === 0) {
          console.error(
            `❌ Empty array received as responseData for file: ${fileName}.`
          );
          await this.sendErrorMessage(
            channelId,
            {
              error: {
                message: `ได้รับข้อมูลเป็น array ว่างจากระบบประมวลผลสำหรับไฟล์: ${fileName}`,
              },
            },
            fileName
          );
          return;
        }
        responseData = responseData[0];
        if (!responseData) {
          console.error(
            `❌ CRITICAL: First item in responseData array is null/undefined for file: ${fileName}.`
          );
          await this.sendErrorMessage(
            channelId,
            {
              error: {
                message: `ข้อมูลแรกใน array ที่ได้รับจากระบบประมวลผลเป็นค่าว่างสำหรับไฟล์: ${fileName}`,
              },
            },
            fileName
          );
          return;
        }
      }

      if (responseData.success === false || responseData.error) {
        const errorMessageText =
          responseData.error?.message ||
          responseData.error ||
          "Unknown error from N8N workflow";
        console.error(
          `N8N workflow returned an error for file ${fileName}:`,
          errorMessageText
        );
        await this.sendErrorMessage(
          channelId,
          { error: { message: `N8N แจ้งข้อผิดพลาด: ${errorMessageText}` } },
          fileName
        );
        return;
      }

      if (
        !responseData.summary ||
        !responseData.summary.chunks ||
        !Array.isArray(responseData.summary.chunks)
      ) {
        console.error(
          `Invalid summary structure in N8N response for file ${fileName}:`,
          JSON.stringify(responseData, null, 2)
        );
        await this.sendErrorMessage(
          channelId,
          {
            error: {
              message: `โครงสร้างข้อมูลสรุปที่ได้รับจาก N8N ไม่ถูกต้องสำหรับไฟล์: ${fileName}`,
            },
          },
          fileName
        );
        return;
      }

      console.log(
        `📋 Sending ${responseData.summary.chunks.length} chunks to Discord for file ${fileName}`
      );

      const summaryMetadata = {
        fileName: fileName,
        userId: responseData.userId || userId,
      };

      for (let i = 0; i < responseData.summary.chunks.length; i++) {
        const chunk = responseData.summary.chunks[i];

        if (
          !chunk ||
          typeof chunk.content !== "string" ||
          !chunk.content.trim()
        ) {
          console.warn(
            `⚠️ Invalid chunk at index ${i} for file ${summaryMetadata.fileName}, skipping...`
          );
          continue;
        }

        await this.sendChunk(channel, chunk, summaryMetadata);

        if (i < responseData.summary.chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      console.log(
        `✅ Successfully sent all chunks for ${summaryMetadata.fileName}`
      );
    } catch (error) {
      console.error(
        `❌ Error within processN8nResponse for file ${fileName}:`,
        error
      );
      await this.sendErrorMessage(
        channelId,
        {
          error: {
            message: "เกิดข้อผิดพลาดภายในขณะประมวลผลข้อมูลตอบกลับจาก N8N",
            details: error.message,
          },
        },
        fileName
      );
    }
  }

  async sendChunk(channel, chunk, metadata) {
    try {
      if (!this.discordClient) {
        console.warn(
          `sendChunk: Discord client not set. Cannot send chunk for file ${metadata.fileName}`
        );
        return;
      }
      let messageContent = "";

      if (chunk.isFirst && metadata.userId) {
        try {
          const user = await this.discordClient.users.fetch(metadata.userId);
          if (user) {
            if (
              metadata.fileName &&
              metadata.fileName.toLowerCase() !== "unknown file"
            ) {
              messageContent = `${user} นี่คือ **สรุปการประชุม** จากไฟล์ **${metadata.fileName}** ที่คุณขอครับ:\n\n`;
            } else {
              messageContent = `${user} นี่คือ **สรุปการประชุม** ที่คุณขอครับ:\n\n`;
            }
          }
        } catch (fetchError) {
          console.warn(
            `Could not fetch user ${metadata.userId} for file ${metadata.fileName}:`,
            fetchError.message
          );
          if (
            metadata.fileName &&
            metadata.fileName.toLowerCase() !== "unknown file"
          ) {
            messageContent = `นี่คือ **สรุปการประชุม** จากไฟล์ **${metadata.fileName}**:\n\n`;
          } else {
            messageContent = `นี่คือ **สรุปการประชุม**:\n\n`;
          }
        }
      } else if (chunk.isFirst) {
        if (
          metadata.fileName &&
          metadata.fileName.toLowerCase() !== "unknown file"
        ) {
          messageContent = `นี่คือ **สรุปการประชุม** จากไฟล์ **${metadata.fileName}**:\n\n`;
        } else {
          messageContent = `นี่คือ **สรุปการประชุม**:\n\n`;
        }
      }

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "Meeting Summary Bot X",
          iconURL: this.discordClient.user.displayAvatarURL(),
        })
        .setColor(chunk.isLast ? 0x28a745 : 0x0099ff);

      if (chunk.total > 1) {
        embed.setTitle(`📄 สรุป (ส่วนที่ ${chunk.index}/${chunk.total})`);
      } else {
        embed.setTitle(`📄 สรุปการประชุม`);
      }

      embed.setDescription(chunk.content.substring(0, 4096)).setTimestamp();

      let footerText = `ไฟล์: ${metadata.fileName}`;
      if (chunk.total > 1) {
        footerText += ` • ส่วนที่ ${chunk.index}/${chunk.total}`;
      }
      if (chunk.isLast) {
        footerText = `ประมวลผลเสร็จสิ้น • ไฟล์: ${metadata.fileName}`;
      }

      let footerIconURL;
      if (metadata.userId) {
        try {
          const user = await this.discordClient.users.fetch(metadata.userId);
          if (user) footerIconURL = user.displayAvatarURL();
        } catch (e) {}
      }
      embed.setFooter({ text: footerText, iconURL: footerIconURL });

      if (messageContent) {
        await channel.send({ content: messageContent, embeds: [embed] });
      } else {
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error(
        `❌ Error sending chunk ${chunk.index}/${chunk.total} for file ${metadata.fileName}:`,
        error
      );
    }
  }

  async sendErrorMessage(channelId, errorData, fileName = "ไม่ทราบชื่อไฟล์") {
    try {
      if (!this.discordClient) {
        console.warn(
          `sendErrorMessage: Discord client not set. Cannot send error for file ${fileName}`
        );
        return;
      }
      const channel = await this.discordClient.channels.fetch(channelId);
      if (!channel) {
        console.warn(
          `sendErrorMessage: Channel not found ${channelId} for file ${fileName}`
        );
        return;
      }

      let description = "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
      if (errorData?.error?.message) {
        description = errorData.error.message;
      } else if (errorData?.message) {
        description = errorData.message;
      } else if (typeof errorData === "string" && errorData.trim()) {
        description = errorData.trim();
      }

      if (description.includes("timeout") || description.includes("524")) {
        description +=
          "\n\n**สาเหตุที่เป็นไปได้:**\n• ไฟล์มีขนาดใหญ่เกินไป\n• N8N กำลังประมวลผลงานอื่นอยู่\n• ปัญหาการเชื่อมต่อเครือข่าย หรือ Proxy/Firewall/Gateway Timeout";
      }

      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`❌ เกิดข้อผิดพลาดในการประมวลผลไฟล์: ${fileName}`)
        .setDescription(description)
        .addFields({
          name: "💡 คำแนะนำ",
          value:
            "• ลองใหม่อีกครั้งในภายหลัง\n• ตรวจสอบว่าไฟล์เป็น audio/video ที่รองรับ\n• ลองไฟล์ขนาดเล็กกว่า (แนะนำไม่เกิน 50MB)\n• ติดต่อผู้ดูแลระบบหากปัญหายังคงอยู่",
        })
        .setTimestamp();

      await channel.send({ embeds: [errorEmbed] });
    } catch (error) {
      console.error("❌ Error sending error message to Discord:", error);
    }
  }
}

const n8nService = new N8nService();
module.exports = n8nService;
