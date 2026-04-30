const { Client } = require('discord.js-selfbot-v13');
const cloudscraper = require('cloudscraper');
const Jimp = require('jimp');
const jsQR = require('jsqr');

const CONFIG = {
  token: "MTMyNjE4MzIzNjA5NDY1NjU0Mw.GaFAUL.kaoQwaql7y61ca3SSd_9kcayqaQCtsZ4Wtag3M",
  phone: "0640466997",
  webhook: "https://discord.com/api/webhooks/1497434314214736083/VU4JmZJwG4kRqmutdjThLL_iLqUOTGZGv2ioe9oXg6V-vdzogbyUMEPlVlt0Q4AmVKeo"
};

const client = new Client({ checkUpdate: false });

function shootVoucher(voucherCode) {
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
      'Origin': 'https://gift.truemoney.com'
    }
  })
  .then(response => {
    const elapsed = Date.now() - startTime;
    
    if (response && response.status && response.status.code === 'SUCCESS') {
      const amount = parseFloat(response.data.my_ticket.amount_baht);
      console.log(`💰 [${elapsed}ms] +${amount}฿ | ${voucherCode}`);
      
      if (CONFIG.webhook && CONFIG.webhook.trim()) {
        sendWebhook(`✅ +${amount}฿`, {
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
    } else {
      console.log(`⚠️ [${elapsed}ms] ล้มเหลว | ${voucherCode}`);
    }
  })
  .catch(error => {
    const elapsed = Date.now() - startTime;
    
    if (error.response && error.response.body) {
      try {
        const errorData = typeof error.response.body === 'string' 
          ? JSON.parse(error.response.body) 
          : error.response.body;
        
        if (errorData && errorData.status && errorData.status.code === 'VOUCHER_OUT_OF_STOCK') {
          console.log(`⚠️ [${elapsed}ms] ถูกใช้แล้ว | ${voucherCode}`);
          return;
        }
      } catch (e) {}
    }
    
    console.log(`❌ [${elapsed}ms] ${error.message} | ${voucherCode}`);
  });
}

function sendWebhook(title, data) {
  const axios = require('axios');
  axios.post(CONFIG.webhook, {
    embeds: [{
      title: title,
      description: `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
      color: title.includes('✅') ? 0x00ff00 : 0xff0000,
      timestamp: new Date().toISOString()
    }]
  }, { timeout: 2000 }).catch(() => {});
}

async function readQRCode(imageBuffer) {
  try {
    const image = await Jimp.read(imageBuffer);
    
    const processingMethods = [
      img => img,
      img => img.invert(),
      img => img.contrast(0.5).brightness(0.1),
      img => img.greyscale().contrast(1),
      img => img.normalize().contrast(0.8)
    ];
    
    for (const method of processingMethods) {
      const processedImage = method(image.clone());
      const { width, height, data } = processedImage.bitmap;
      const qrCode = jsQR(new Uint8ClampedArray(data), width, height);
      
      if (qrCode && qrCode.data) {
        return qrCode.data;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function downloadImage(url) {
  try {
    const axios = require('axios');
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('Download Error:', error.message);
    return null;
  }
}

function isValidVoucherCode(str) {
  if (!str || str.length < 10 || str.length > 64) {
    return false;
  }
  
  if (!/^[a-zA-Z0-9]+$/.test(str)) {
    return false;
  }
  
  const hasNumbers = /\d/.test(str);
  const hasLetters = /[a-zA-Z]/.test(str);
  
  if (!hasNumbers || !hasLetters) {
    return false;
  }
  
  const lowerStr = str.toLowerCase();
  const blacklist = [
    'telegram', 'truemoney', 'password', 'username',
    'facebook', 'instagram', 'twitter', 'discord',
    'youtube', 'google', 'email', 'https', 'http'
  ];
  
  for (const word of blacklist) {
    if (lowerStr.includes(word)) {
      return false;
    }
  }
  
  return true;
}

const seenVouchers = new Set();

function extractVoucherCodes(text) {
  if (!text) return [];
  
  const foundVouchers = [];
  
  const urlPattern = /https?:\/\/gift\.truemoney\.com\/campaign\/?(?:voucher_detail\/?)?\?v=([A-Za-z0-9]+)/gi;
  let match;
  
  while ((match = urlPattern.exec(text)) !== null) {
    const code = match[1].trim();
    if (isValidVoucherCode(code) && !seenVouchers.has(code)) {
      foundVouchers.push(code);
      seenVouchers.add(code);
    }
  }
  
  const words = text.split(/[\s\n\r,;.!?()[\]{}'"<>\/\\|]+/);
  
  for (const word of words) {
    const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
    
    if (isValidVoucherCode(cleanWord) && !seenVouchers.has(cleanWord)) {
      foundVouchers.push(cleanWord);
      seenVouchers.add(cleanWord);
    }
  }
  
  return foundVouchers;
}

function extractFromEmbed(embed) {
  const foundVouchers = [];
  
  if (embed.title) {
    const vouchers = extractVoucherCodes(embed.title);
    foundVouchers.push(...vouchers);
  }
  
  if (embed.description) {
    const vouchers = extractVoucherCodes(embed.description);
    foundVouchers.push(...vouchers);
  }
  
  if (embed.fields && embed.fields.length > 0) {
    for (const field of embed.fields) {
      if (field.name) {
        const vouchers = extractVoucherCodes(field.name);
        foundVouchers.push(...vouchers);
      }
      if (field.value) {
        const vouchers = extractVoucherCodes(field.value);
        foundVouchers.push(...vouchers);
      }
    }
  }
  
  if (embed.footer && embed.footer.text) {
    const vouchers = extractVoucherCodes(embed.footer.text);
    foundVouchers.push(...vouchers);
  }
  
  if (embed.author && embed.author.name) {
    const vouchers = extractVoucherCodes(embed.author.name);
    foundVouchers.push(...vouchers);
  }
  
  if (embed.url) {
    const vouchers = extractVoucherCodes(embed.url);
    foundVouchers.push(...vouchers);
  }
  
  return foundVouchers;
}

setInterval(() => {
  seenVouchers.clear();
}, 20000);

client.on('ready', async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚡ ดักซองความไวสูง v1.0.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ ${client.user.tag}`);
  console.log(`📞 เบอร์รับ: ${CONFIG.phone}`);
  console.log(`📡 Webhook: ${CONFIG.webhook || 'ปิดใช้งาน'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

client.on('messageCreate', async (message) => {
  if (message.author.id === client.user.id) return;
  
  if (message.content) {
    const vouchers = extractVoucherCodes(message.content);
    
    if (vouchers.length > 0) {
      vouchers.forEach(voucher => {
        console.log(`🎁 ${voucher}`);
        shootVoucher(voucher);
      });
    }
  }
  
  if (message.embeds && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      const vouchersFromEmbed = extractFromEmbed(embed);
      
      if (vouchersFromEmbed.length > 0) {
        vouchersFromEmbed.forEach(voucher => {
          console.log(`🎁 (Embed) ${voucher}`);
          shootVoucher(voucher);
        });
      }
      
      if (embed.image || embed.thumbnail) {
        const imageUrl = embed.image?.url || embed.thumbnail?.url;
        
        if (imageUrl) {
          console.log('📸 ดาวน์โหลดรูป Embed...');
          const imageBuffer = await downloadImage(imageUrl);
          
          if (imageBuffer) {
            console.log('📸 สแกน QR...');
            const qrData = await readQRCode(imageBuffer);
            
            if (qrData) {
              console.log(`✅ QR: ${qrData.substring(0, 50)}...`);
              const vouchers = extractVoucherCodes(qrData);
              
              if (vouchers.length > 0) {
                vouchers.forEach(voucher => {
                  console.log(`🎁 (QR Embed) ${voucher}`);
                  shootVoucher(voucher);
                });
              }
            }
          }
        }
      }
    }
  }
  
  if (message.attachments && message.attachments.size > 0) {
    for (const attachment of message.attachments.values()) {
      const url = attachment.url;
      const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url) || 
                      attachment.contentType?.startsWith('image/');
      
      if (isImage) {
        console.log('📸 ดาวน์โหลดรูป...');
        const imageBuffer = await downloadImage(url);
        
        if (imageBuffer) {
          console.log('📸 สแกน QR...');
          const qrData = await readQRCode(imageBuffer);
          
          if (qrData) {
            console.log(`✅ QR: ${qrData.substring(0, 50)}...`);
            const vouchers = extractVoucherCodes(qrData);
            
            if (vouchers.length > 0) {
              vouchers.forEach(voucher => {
                console.log(`🎁 (QR) ${voucher}`);
                shootVoucher(voucher);
              });
            } else {
              console.log('⚠️ ไม่พบซอง');
            }
          } else {
            console.log('⚠️ อ่าน QR ไม่ได้');
          }
        }
      }
    }
  }
});

client.on('error', (error) => {
  console.error('Client Error:', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('Error:', error.message);
});

console.log('🔄 กำลังเข้าสู่ระบบ...');
client.login(CONFIG.token).catch(error => {
  console.error('❌ Login ล้มเหลว:', error.message);
  console.error('กรุณาตรวจสอบ Token');
  process.exit(1);
});
