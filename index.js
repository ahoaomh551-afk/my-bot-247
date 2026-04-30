const { Client } = require('discord.js-selfbot-v13');
const cloudscraper = require('cloudscraper');
const Jimp = require('jimp');
const jsQR = require('jsqr');
const axios = require('axios'); // ดึงมาใช้สำหรับการโหลดรูปและ webhook

// --- CONFIGURATION ---
const CONFIG = {
  token: "MTMyNjE4MzIzNjA5NDY1NjU0Mw.GaFAUL.kaoQwaql7y61ca3SSd_9kcayqaQCtsZ4Wtag3M",
  phone: "0640466997",
  webhook: "https://discord.com/api/webhooks/1497434314214736083/VU4JmZJwG4kRqmutdjThLL_iLqUOTGZGv2ioe9oXg6V-vdzogbyUMEPlVlt0Q4AmVKeo"
};

const client = new Client({ checkUpdate: false });
const seenVouchers = new Set();

// --- CORE FUNCTIONS ---

/**
 * ฟังก์ชันยิงซอง (Redeem Voucher)
 */
function shootVoucher(voucherCode) {
  if (!voucherCode || seenVouchers.has(voucherCode)) return;
  seenVouchers.add(voucherCode);

  const startTime = Date.now();
  const requestData = {
    mobile: CONFIG.phone,
    voucher_hash: voucherCode
  };
  
  cloudscraper.post(`https://gift.truemoney.com/campaign/vouchers/${voucherCode}/redeem`, {
    json: requestData,
    timeout: 30000,
    headers: {
      'Referer': `https://gift.truemoney.com/campaign/?v=${voucherCode}`,
      'Origin': 'https://gift.truemoney.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  })
  .then(response => {
    const elapsed = Date.now() - startTime;
    
    if (response && response.status && response.status.code === 'SUCCESS') {
      const amount = parseFloat(response.data.my_ticket.amount_baht);
      console.log(`💰 [${elapsed}ms] +${amount}฿ | ${voucherCode}`);
      
      if (CONFIG.webhook) {
        sendWebhook(`✅ ได้รับเงิน +${amount}฿`, {
          voucher: voucherCode,
          amount: amount,
          phone: CONFIG.phone,
          time: `${elapsed}ms`
        });
      }
    } else if (response && response.status) {
      const errorCode = response.status.code;
      const errorMsg = {
        'VOUCHER_OUT_OF_STOCK': 'ถูกใช้แล้ว',
        'VOUCHER_EXPIRED': 'หมดอายุ',
        'VOUCHER_NOT_FOUND': 'ไม่พบซอง',
        'RATE_LIMIT': 'ระบบยุ่ง'
      };
      console.log(`⚠️ [${elapsed}ms] ${errorMsg[errorCode] || errorCode} | ${voucherCode}`);
    }
  })
  .catch(error => {
    const elapsed = Date.now() - startTime;
    console.log(`❌ [${elapsed}ms] Error: ${error.message} | ${voucherCode}`);
  });
}

/**
 * ฟังก์ชันส่ง Webhook
 */
function sendWebhook(title, data) {
  axios.post(CONFIG.webhook, {
    embeds: [{
      title: title,
      description: `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
      color: 0x00ff00,
      timestamp: new Date().toISOString()
    }]
  }).catch(() => {});
}

/**
 * ฟังก์ชันอ่าน QR Code จาก Buffer รูปภาพ
 */
async function readQRCode(imageBuffer) {
  try {
    const image = await Jimp.read(imageBuffer);
    const processingMethods = [
      img => img,
      img => img.contrast(0.5),
      img => img.greyscale()
    ];
    
    for (const method of processingMethods) {
      const processedImage = method(image.clone());
      const { width, height, data } = processedImage.bitmap;
      const qrCode = jsQR(new Uint8ClampedArray(data), width, height);
      if (qrCode && qrCode.data) return qrCode.data;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * ฟังก์ชันดาวน์โหลดรูปภาพ
 */
async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return Buffer.from(response.data);
  } catch (error) {
    return null;
  }
}

/**
 * ตรวจสอบความถูกต้องของโค้ดซอง
 */
function isValidVoucherCode(str) {
  if (!str || str.length < 10 || str.length > 64) return false;
  if (!/^[a-zA-Z0-9]+$/.test(str)) return false;
  
  const lowerStr = str.toLowerCase();
  const blacklist = ['telegram', 'truemoney', 'password', 'discord', 'https', 'http'];
  return !blacklist.some(word => lowerStr.includes(word));
}

/**
 * ดึงโค้ดออกจาก Text หรือ URL
 */
function extractVoucherCodes(text) {
  if (!text) return [];
  const foundVouchers = [];
  
  // ดักจาก URL โดยตรง
  const urlPattern = /(?:v=|vouchers\/)([A-Za-z0-9]{10,})/gi;
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    const code = match[1].trim();
    if (isValidVoucherCode(code)) foundVouchers.push(code);
  }
  
  // ดักจากคำที่แยกด้วยช่องว่าง
  const words = text.split(/[\s\n\r,;.!?]+/);
  for (const word of words) {
    const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
    if (isValidVoucherCode(cleanWord)) foundVouchers.push(cleanWord);
  }
  
  return [...new Set(foundVouchers)];
}

// --- DISCORD EVENTS ---

client.on('ready', () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚡ ดักซองความไวสูง v1.0.0 (Combined)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ บัญชี: ${client.user.tag}`);
  console.log(`📞 เบอร์: ${CONFIG.phone}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

client.on('messageCreate', async (message) => {
  if (message.author.id === client.user.id) return;

  // 1. ตรวจสอบข้อความธรรมดา
  const textVouchers = extractVoucherCodes(message.content);
  textVouchers.forEach(v => shootVoucher(v));

  // 2. ตรวจสอบใน Embeds
  if (message.embeds.length > 0) {
    for (const embed of message.embeds) {
      const embedContent = [embed.title, embed.description, embed.url].join(' ');
      const embedVouchers = extractVoucherCodes(embedContent);
      embedVouchers.forEach(v => shootVoucher(v));

      // ตรวจสอบรูปใน Embed (Thumbnail/Image)
      const embedImgUrl = embed.image?.url || embed.thumbnail?.url;
      if (embedImgUrl) {
        downloadImage(embedImgUrl).then(readQRCode).then(qrData => {
          if (qrData) extractVoucherCodes(qrData).forEach(v => shootVoucher(v));
        });
      }
    }
  }

  // 3. ตรวจสอบไฟล์แนบ (Attachments)
  if (message.attachments.size > 0) {
    for (const attachment of message.attachments.values()) {
      if (attachment.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(attachment.url)) {
        downloadImage(attachment.url).then(readQRCode).then(qrData => {
          if (qrData) extractVoucherCodes(qrData).forEach(v => shootVoucher(v));
        });
      }
    }
  }
});

// ล้าง Set เพื่อประหยัด RAM ทุก 20 วินาที
setInterval(() => seenVouchers.clear(), 20000);

// LOGIN
console.log('🔄 กำลังเข้าสู่ระบบ...');
client.login(CONFIG.token).catch(err => {
  console.error('❌ Login ล้มเหลว:', err.message);
  process.exit(1);
});

