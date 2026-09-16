/**
 * Bot Telegram Serbaguna - Multi Menu (Node.js / Telegraf)
 * ==========================================================
 * Menu: AI, RPG, GAME, TOOLS, GROUP, DOWNLOAD, PANEL, ANIME, ISLAMIC, REKAP, JADIBOT
 *
 * Semua data disimpan di MEMORI (hilang saat restart). Kalau butuh
 * data permanen (level RPG, stats grup, dll tetap tersimpan setelah
 * restart), tinggal bilang nanti saya tambahkan database SQLite.
 *
 * ------------------------------------------------------------
 * SETUP
 * ------------------------------------------------------------
 * 1. npm init -y
 * 2. npm install telegraf sharp node-fetch qrcode mathjs
 * 3. Isi environment variable di bawah (atau file .env + dotenv):
 *      BOT_TOKEN=token dari @BotFather
 *      OWNER_ID=id telegram kamu (untuk /restart, /status)
 *      ANTHROPIC_API_KEY=(opsional, untuk fitur /ai)
 * 4. node bot.js
 *
 * Catatan JADIBOT: fitur ini menjalankan bot Telegram TAMBAHAN
 * memakai token milik user lain (token mereka sendiri dari
 * BotFather) di dalam proses yang sama. Ini legal selama tokennya
 * memang milik yang mendaftarkan.
 */

const { Telegraf, Markup } = require("telegraf");
const sharp = require("sharp");
const fetch = require("node-fetch");
const QRCode = require("qrcode");
const { evaluate } = require("mathjs");

const BOT_TOKEN = process.env.BOT_TOKEN || "8616635222:AAHJ9Z8umuAE_rfW2UCEEB_t-bW1MiJiEXU";
const OWNER_ID = process.env.OWNER_ID || 7836052754; // isi dengan Telegram user ID kamu
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || https://api.nexadev.my.id/ai/deepsek?text=apa%20nodejs;

const bot = new Telegraf(BOT_TOKEN);
const startTime = Date.now();

// ==============================================================
// "DATABASE" DI MEMORI
// ==============================================================
const userStats = {};   // { userId: { name, messageCount } }
const guessGame = {};   // { userId: { target, tries } }
const rpgData = {};     // { userId: { name, level, exp, gold, hp } }
const subBots = {};     // { ownerId: TelegrafInstance }  -> untuk JADIBOT

function trackUser(ctx) {
  const id = ctx.from.id;
  const name = ctx.from.first_name || "User";
  if (!userStats[id]) userStats[id] = { name, messageCount: 0 };
  userStats[id].messageCount++;
}

function isOwner(ctx) {
  return OWNER_ID && String(ctx.from.id) === String(OWNER_ID);
}

async function isGroupAdmin(ctx) {
  if (ctx.chat.type === "private") return false;
  const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
  return ["administrator", "creator"].includes(member.status);
}

// ==============================================================
// MENU UTAMA
// ==============================================================
function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🤖 AI", "menu_ai"), Markup.button.callback("⚔️ RPG", "menu_rpg_info")],
    [Markup.button.callback("🎮 Game", "menu_game"), Markup.button.callback("🛠 Tools", "menu_tools")],
    [Markup.button.callback("👥 Group", "menu_group"), Markup.button.callback("⬇️ Download", "menu_download")],
    [Markup.button.callback("🖥 Panel", "menu_panel"), Markup.button.callback("🍥 Anime", "menu_anime")],
    [Markup.button.callback("🕌 Islamic", "menu_islamic"), Markup.button.callback("📊 Rekap", "menu_rekap")],
    [Markup.button.callback("🤝 JadiBot", "menu_jadibot")],
  ]);
}

bot.start((ctx) => {
  trackUser(ctx);
  ctx.reply(`Halo ${ctx.from.first_name}! 👋\nPilih menu di bawah:`, mainMenu());
});

bot.help((ctx) => {
  ctx.reply(
    "📋 Kategori & contoh perintah:\n\n" +
      "🤖 AI: /ai <pertanyaan>\n" +
      "⚔️ RPG: /rpg daftar, /rpg profil, /rpg hunt\n" +
      "🎮 Game: /tebak, /suit <batu/gunting/kertas>\n" +
      "🛠 Tools: /kalkulator <ekspresi>, /qr <teks>\n" +
      "👥 Group (admin only): /kick /promote /mute (reply ke user)\n" +
      "⬇️ Download: /wallpaper, /quoteimg <teks>\n" +
      "🖥 Panel (owner only): /status, /restart\n" +
      "🍥 Anime: /waifu, /anime <judul>\n" +
      "🕌 Islamic: /ayat, /asmaulhusna\n" +
      "📊 Rekap: /rekap\n" +
      "🤝 JadiBot: /jadibot <token_bot_kamu>, /stopbot"
  );
});

// Tombol menu -> kirim daftar perintah kategori terkait
const menuTexts = {
  menu_ai: "🤖 *AI MENU*\n/ai <pertanyaan> - tanya AI",
  menu_rpg_info: "⚔️ *RPG MENU*\n/rpg daftar - buat karakter\n/rpg profil - lihat statmu\n/rpg hunt - berburu (dapat exp & gold)",
  menu_game: "🎮 *GAME MENU*\n/tebak - tebak angka 1-100\n/suit <batu/gunting/kertas> - lawan bot",
  menu_tools: "🛠 *TOOLS MENU*\n/kalkulator <ekspresi> - hitung matematika\n/qr <teks> - buat QR code",
  menu_group: "👥 *GROUP MENU* (admin only, jalankan di grup)\n/kick (reply user)\n/promote (reply user)\n/mute (reply user)",
  menu_download: "⬇️ *DOWNLOAD MENU*\n/wallpaper - wallpaper acak bebas hak cipta\n/quoteimg <teks> - buat gambar quote",
  menu_panel: "🖥 *PANEL MENU* (owner only)\n/status - cek uptime & memory bot\n/restart - restart bot",
  menu_anime: "🍥 *ANIME MENU*\n/waifu - gambar anime acak (SFW)\n/anime <judul> - cari info anime",
  menu_islamic: "🕌 *ISLAMIC MENU*\n/ayat - ayat Al-Quran acak\n/asmaulhusna - Asmaul Husna acak",
  menu_rekap: "📊 *REKAP MENU*\n/rekap - top 5 user paling aktif",
  menu_jadibot: "🤝 *JADIBOT MENU*\n/jadibot <token> - jalankan bot pribadimu sendiri lewat sini\n/stopbot - matikan sub-bot kamu",
};
Object.keys(menuTexts).forEach((key) => {
  bot.action(key, (ctx) => {
    ctx.answerCbQuery();
    ctx.replyWithMarkdown(menuTexts[key]);
  });
});

// ==============================================================
// 🤖 AI MENU
// ==============================================================
bot.command("ai", async (ctx) => {
  trackUser(ctx);
  const question = ctx.message.text.split(" ").slice(1).join(" ");
  if (!question) return ctx.reply("Contoh: /ai jelaskan apa itu fotosintesis");
  if (!ANTHROPIC_API_KEY) {
    return ctx.reply("⚠️ Fitur AI belum aktif. Set environment variable ANTHROPIC_API_KEY dulu.");
  }
  try {
    await ctx.sendChatAction("typing");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: question }],
      }),
    });
    const data = await res.json();
    const answer = data?.content?.[0]?.text || "Maaf, tidak ada jawaban.";
    ctx.reply(answer);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Gagal menghubungi AI.");
  }
});

// ==============================================================
// ⚔️ RPG MENU (in-memory)
// ==============================================================
bot.command("rpg", (ctx) => {
  trackUser(ctx);
  const sub = ctx.message.text.split(" ")[1];
  const id = ctx.from.id;

  if (sub === "daftar") {
    if (rpgData[id]) return ctx.reply("Kamu sudah punya karakter! Ketik /rpg profil.");
    rpgData[id] = { name: ctx.from.first_name, level: 1, exp: 0, gold: 0, hp: 100 };
    return ctx.reply(`⚔️ Karakter dibuat! Selamat datang, ${ctx.from.first_name} (Level 1).`);
  }

  if (!rpgData[id]) return ctx.reply("Kamu belum punya karakter. Ketik /rpg daftar dulu.");

  if (sub === "profil") {
    const c = rpgData[id];
    return ctx.reply(
      `👤 ${c.name}\nLevel: ${c.level}\nEXP: ${c.exp}/100\nGold: ${c.gold}\nHP: ${c.hp}`
    );
  }

  if (sub === "hunt") {
    const c = rpgData[id];
    const expGain = Math.floor(Math.random() * 20) + 5;
    const goldGain = Math.floor(Math.random() * 15) + 1;
    c.exp += expGain;
    c.gold += goldGain;
    let levelUpMsg = "";
    if (c.exp >= 100) {
      c.exp -= 100;
      c.level++;
      levelUpMsg = `\n🎉 Level up! Sekarang level ${c.level}.`;
    }
    return ctx.reply(`🗡 Berburu... dapat ${expGain} EXP dan ${goldGain} Gold!${levelUpMsg}`);
  }

  return ctx.reply("Perintah RPG: /rpg daftar | /rpg profil | /rpg hunt");
});

// ==============================================================
// 🎮 GAME MENU
// ==============================================================
bot.command("tebak", (ctx) => {
  trackUser(ctx);
  guessGame[ctx.from.id] = { target: Math.floor(Math.random() * 100) + 1, tries: 0 };
  ctx.reply("🎯 Aku sudah pilih angka 1-100. Ketik angkanya langsung di chat!");
});

bot.command("suit", (ctx) => {
  trackUser(ctx);
  const choices = ["batu", "gunting", "kertas"];
  const userChoice = ctx.message.text.split(" ")[1]?.toLowerCase();
  if (!choices.includes(userChoice)) return ctx.reply("Pakai: /suit batu | gunting | kertas");
  const botChoice = choices[Math.floor(Math.random() * 3)];
  let result;
  if (userChoice === botChoice) result = "Seri!";
  else if (
    (userChoice === "batu" && botChoice === "gunting") ||
    (userChoice === "gunting" && botChoice === "kertas") ||
    (userChoice === "kertas" && botChoice === "batu")
  )
    result = "Kamu menang! 🎉";
  else result = "Kamu kalah! 😢";
  ctx.reply(`Kamu: ${userChoice}\nBot: ${botChoice}\n${result}`);
});

// ==============================================================
// 🛠 TOOLS MENU
// ==============================================================
bot.command("kalkulator", (ctx) => {
  trackUser(ctx);
  const expr = ctx.message.text.split(" ").slice(1).join(" ");
  if (!expr) return ctx.reply("Contoh: /kalkulator (5+3)*2");
  try {
    const result = evaluate(expr);
    ctx.reply(`🧮 ${expr} = ${result}`);
  } catch {
    ctx.reply("❌ Ekspresi tidak valid.");
  }
});

bot.command("qr", async (ctx) => {
  trackUser(ctx);
  const text = ctx.message.text.split(" ").slice(1).join(" ");
  if (!text) return ctx.reply("Contoh: /qr https://example.com");
  try {
    const buffer = await QRCode.toBuffer(text, { width: 400 });
    ctx.replyWithPhoto({ source: buffer });
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Gagal membuat QR code.");
  }
});

// ==============================================================
// 👥 GROUP MENU (admin only, reply ke user target)
// ==============================================================
bot.command("kick", async (ctx) => {
  if (!(await isGroupAdmin(ctx))) return ctx.reply("⚠️ Khusus admin grup.");
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply("Reply ke pesan user yang mau dikick.");
  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id); // kick, bukan ban permanen
    ctx.reply(`👢 ${target.first_name} dikeluarkan dari grup.`);
  } catch (err) {
    ctx.reply("❌ Gagal kick (pastikan bot adalah admin).");
  }
});

bot.command("promote", async (ctx) => {
  if (!(await isGroupAdmin(ctx))) return ctx.reply("⚠️ Khusus admin grup.");
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply("Reply ke pesan user yang mau dipromote.");
  try {
    await ctx.telegram.promoteChatMember(ctx.chat.id, target.id, {
      can_change_info: true,
      can_delete_messages: true,
      can_invite_users: true,
      can_restrict_members: true,
      can_pin_messages: true,
    });
    ctx.reply(`⭐ ${target.first_name} sekarang admin.`);
  } catch {
    ctx.reply("❌ Gagal promote (pastikan bot adalah admin).");
  }
});

bot.command("mute", async (ctx) => {
  if (!(await isGroupAdmin(ctx))) return ctx.reply("⚠️ Khusus admin grup.");
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply("Reply ke pesan user yang mau dimute.");
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: { can_send_messages: false },
    });
    ctx.reply(`🔇 ${target.first_name} dimute.`);
  } catch {
    ctx.reply("❌ Gagal mute (pastikan bot adalah admin).");
  }
});

// ==============================================================
// ⬇️ DOWNLOAD MENU (konten bebas hak cipta)
// ==============================================================
bot.command("wallpaper", async (ctx) => {
  trackUser(ctx);
  try {
    const seed = Math.floor(Math.random() * 1000);
    const url = `https://picsum.photos/seed/${seed}/1080/1920`;
    ctx.replyWithPhoto(url, { caption: "🖼 Wallpaper acak (Lorem Picsum, bebas dipakai)." });
  } catch {
    ctx.reply("❌ Gagal mengambil wallpaper.");
  }
});

bot.command("quoteimg", async (ctx) => {
  trackUser(ctx);
  const text = ctx.message.text.split(" ").slice(1).join(" ") || "Tetap semangat!";
  try {
    const svg = `
      <svg width="800" height="450" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#1e1e2f"/>
        <foreignObject x="40" y="40" width="720" height="370">
          <div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font-size:36px;font-family:sans-serif;display:flex;align-items:center;height:100%;text-align:center;justify-content:center;">
            "${text}"
          </div>
        </foreignObject>
      </svg>`;
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    ctx.replyWithPhoto({ source: buffer });
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Gagal membuat gambar quote.");
  }
});

// ==============================================================
// 🖥 PANEL MENU (owner only - kontrol bot, bukan hosting eksternal)
// ==============================================================
bot.command("status", (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⚠️ Khusus owner bot.");
  const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
  const mem = process.memoryUsage().rss / 1024 / 1024;
  ctx.reply(
    `🖥 Status Bot\nUptime: ${uptimeSec}s\nMemory: ${mem.toFixed(1)} MB\nSub-bot aktif: ${Object.keys(subBots).length}`
  );
});

bot.command("restart", (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("⚠️ Khusus owner bot.");
  ctx.reply("♻️ Merestart bot...").then(() => process.exit(0));
  // Butuh process manager (pm2 / systemd / restart policy panel) agar otomatis nyala lagi.
});

// ==============================================================
// 🍥 ANIME MENU
// ==============================================================
bot.command("waifu", async (ctx) => {
  trackUser(ctx);
  try {
    const res = await fetch("https://api.waifu.pics/sfw/waifu");
    const data = await res.json();
    ctx.replyWithPhoto(data.url);
  } catch {
    ctx.reply("❌ Gagal mengambil gambar.");
  }
});

bot.command("anime", async (ctx) => {
  trackUser(ctx);
  const query = ctx.message.text.split(" ").slice(1).join(" ");
  if (!query) return ctx.reply("Contoh: /anime naruto");
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`);
    const data = await res.json();
    const anime = data.data?.[0];
    if (!anime) return ctx.reply("Anime tidak ditemukan.");
    ctx.replyWithPhoto(anime.images.jpg.image_url, {
      caption: `🍥 ${anime.title}\n⭐ Score: ${anime.score || "-"}\n📺 Episode: ${anime.episodes || "-"}`,
    });
  } catch {
    ctx.reply("❌ Gagal mengambil data anime.");
  }
});

// ==============================================================
// 🕌 ISLAMIC MENU
// ==============================================================
const asmaulHusna = [
  "Ar-Rahman - Yang Maha Pengasih",
  "Ar-Rahim - Yang Maha Penyayang",
  "Al-Malik - Yang Maha Merajai",
  "Al-Quddus - Yang Maha Suci",
  "As-Salam - Yang Maha Sejahtera",
  "Al-Ghaffar - Yang Maha Pengampun",
  "Ar-Razzaq - Yang Maha Pemberi Rezeki",
];

bot.command("asmaulhusna", (ctx) => {
  trackUser(ctx);
  const pick = asmaulHusna[Math.floor(Math.random() * asmaulHusna.length)];
  ctx.reply(`🕌 ${pick}`);
});

bot.command("ayat", async (ctx) => {
  trackUser(ctx);
  try {
    const nomor = Math.floor(Math.random() * 6236) + 1; // total ayat Al-Quran
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${nomor}/id.indonesian`);
    const data = await res.json();
    const ayah = data.data;
    ctx.reply(`🕌 QS. ${ayah.surah.englishName} : ${ayah.numberInSurah}\n\n"${ayah.text}"`);
  } catch {
    ctx.reply("❌ Gagal mengambil ayat.");
  }
});

// ==============================================================
// 📊 REKAP MENU
// ==============================================================
bot.command("rekap", (ctx) => {
  const sorted = Object.values(userStats)
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 5);
  if (sorted.length === 0) return ctx.reply("Belum ada data.");
  const text = sorted
    .map((u, i) => `${i + 1}. ${u.name} - ${u.messageCount} pesan`)
    .join("\n");
  ctx.reply(`📊 Top 5 User Paling Aktif:\n${text}`);
});

// ==============================================================
// 🤝 JADIBOT MENU (sub-bot pribadi pakai token milik user sendiri)
// ==============================================================
bot.command("jadibot", async (ctx) => {
  const id = ctx.from.id;
  const token = ctx.message.text.split(" ")[1];
  if (!token) return ctx.reply("Contoh: /jadibot 123456:ABC-your-own-bot-token");
  if (subBots[id]) return ctx.reply("Kamu sudah punya sub-bot aktif. Ketik /stopbot dulu.");

  try {
    const subBot = new Telegraf(token);
    subBot.start((c) => c.reply(`Halo! Ini adalah bot pribadi milik ${ctx.from.first_name}.`));
    subBot.on("text", (c) => c.reply(`Echo: ${c.message.text}`));
    await subBot.launch();
    subBots[id] = subBot;
    ctx.reply("✅ Sub-bot kamu sudah aktif! Coba chat bot barumu itu langsung.");
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Token tidak valid atau gagal menjalankan bot.");
  }
});

bot.command("stopbot", (ctx) => {
  const id = ctx.from.id;
  if (!subBots[id]) return ctx.reply("Kamu tidak punya sub-bot aktif.");
  subBots[id].stop("manual");
  delete subBots[id];
  ctx.reply("🛑 Sub-bot kamu sudah dimatikan.");
});

// ==============================================================
// PESAN TEKS BIASA (counter + game tebak angka)
// ==============================================================
bot.on("text", (ctx) => {
  trackUser(ctx);
  const text = ctx.message.text.trim();
  const game = guessGame[ctx.from.id];
  if (game && /^\d+$/.test(text)) {
    const guess = parseInt(text, 10);
    game.tries++;
    if (guess === game.target) {
      ctx.reply(`🎉 Benar! Angkanya ${game.target} (${game.tries} percobaan).`);
      delete guessGame[ctx.from.id];
    } else if (guess < game.target) ctx.reply("⬆️ Lebih besar!");
    else ctx.reply("⬇️ Lebih kecil!");
  }
});

// ==============================================================
// ERROR HANDLER & LAUNCH
// ==============================================================
bot.catch((err, ctx) => console.error(`Error di ${ctx.updateType}:`, err));

if (BOT_TOKEN === "PASTE_YOUR_TOKEN_HERE") {
  console.log("⚠️  Set BOT_TOKEN dulu (env var atau langsung di kode)!");
}

bot.launch().then(() => console.log("✅ Bot utama berjalan..."));

process.once("SIGINT", () => {
  bot.stop("SIGINT");
  Object.values(subBots).forEach((b) => b.stop("SIGINT"));
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  Object.values(subBots).forEach((b) => b.stop("SIGTERM"));
});
