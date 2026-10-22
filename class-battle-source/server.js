const express = require("express");
const http = require("http");
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Add a PostgreSQL connection string in your environment.");
  process.exit(1);
}
if (isProd && !process.env.SESSION_SECRET) {
  console.error("Missing SESSION_SECRET in production.");
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false
});

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.socket.io"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || "local-development-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const questions = [
  { id: 1, subject: "Toán", text: "Giá trị của 7 × 8 là bao nhiêu?", options: ["54", "56", "64", "48"], answer: 1, explanation: "7 × 8 = 56." },
  { id: 2, subject: "Khoa học", text: "Hành tinh nào gần Mặt Trời nhất?", options: ["Trái Đất", "Sao Hỏa", "Sao Thủy", "Sao Mộc"], answer: 2, explanation: "Sao Thủy là hành tinh gần Mặt Trời nhất." },
  { id: 3, subject: "Tiếng Anh", text: "Chọn dạng quá khứ của động từ “go”.", options: ["goed", "gone", "went", "goes"], answer: 2, explanation: "Quá khứ đơn của go là went." },
  { id: 4, subject: "Lịch sử", text: "Ai là người đọc Tuyên ngôn Độc lập ngày 2/9/1945?", options: ["Trần Hưng Đạo", "Hồ Chí Minh", "Võ Nguyên Giáp", "Phan Bội Châu"], answer: 1, explanation: "Chủ tịch Hồ Chí Minh đọc Tuyên ngôn Độc lập tại Quảng trường Ba Đình." },
  { id: 5, subject: "Toán", text: "Diện tích hình chữ nhật có chiều dài 8 cm, chiều rộng 3 cm là?", options: ["11 cm²", "22 cm²", "24 cm²", "16 cm²"], answer: 2, explanation: "Diện tích = dài × rộng = 8 × 3 = 24 cm²." },
  { id: 6, subject: "Ngữ văn", text: "Từ nào sau đây là từ láy?", options: ["học sinh", "long lanh", "bàn ghế", "nhà cửa"], answer: 1, explanation: "“Long lanh” là từ láy." },
  { id: 7, subject: "Địa lý", text: "Đường xích đạo chia Trái Đất thành hai bán cầu nào?", options: ["Đông và Tây", "Bắc và Nam", "Trên và Dưới", "Lục địa và đại dương"], answer: 1, explanation: "Đường xích đạo chia Trái Đất thành bán cầu Bắc và bán cầu Nam." },
  { id: 8, subject: "Khoa học", text: "Nước tinh khiết đóng băng ở khoảng bao nhiêu độ C trong điều kiện tiêu chuẩn?", options: ["0°C", "10°C", "32°C", "100°C"], answer: 0, explanation: "Nước tinh khiết đóng băng ở 0°C trong điều kiện tiêu chuẩn." }
];

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(20) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      total_score INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS game_results (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_code VARCHAR(8) NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS game_results_user_id_idx ON game_results(user_id);
  `);
}

function safeUser(user) {
  return { id: Number(user.id), username: user.username, totalScore: user.total_score, gamesPlayed: user.games_played };
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Vui lòng đăng nhập trước." });
  next();
}
function makeCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/me", async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const result = await pool.query("SELECT id, username, total_score, games_played FROM users WHERE id = $1", [req.session.userId]);
  if (!result.rows[0]) {
    req.session.destroy(() => {});
    return res.json({ user: null });
  }
  res.json({ user: safeUser(result.rows[0]) });
});

app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: "Tên tài khoản cần 3–20 ký tự, chỉ gồm chữ không dấu, số hoặc dấu gạch dưới." });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: "Mật khẩu cần từ 8 đến 72 ký tự." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users(username, password_hash) VALUES($1, $2) RETURNING id, username, total_score, games_played",
      [username, passwordHash]
    );
    req.session.userId = result.rows[0].id;
    res.status(201).json({ user: safeUser(result.rows[0]) });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Tên tài khoản đã được sử dụng." });
    console.error(err);
    res.status(500).json({ error: "Không thể tạo tài khoản lúc này." });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Tên tài khoản hoặc mật khẩu chưa đúng." });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Không thể tạo phiên đăng nhập." });
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).json({ error: "Không thể lưu phiên đăng nhập." });
        res.json({ user: safeUser(user) });
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Không thể đăng nhập lúc này." });
  }
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Đăng xuất chưa thành công." });
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/leaderboard", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT username, total_score, games_played FROM users ORDER BY total_score DESC, username ASC LIMIT 20"
    );
    res.json({ leaderboard: result.rows.map((u, i) => ({ rank: i + 1, username: u.username, totalScore: u.total_score, gamesPlayed: u.games_played })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Không tải được bảng xếp hạng." });
  }
});

app.get("/api/questions", requireAuth, (_req, res) => {
  res.json({ questions: questions.map(({ id, subject, text, options }) => ({ id, subject, text, options })) });
});

const rooms = new Map();
function publicRoom(room) {
  return { code: room.code, hostId: room.hostId, status: room.status, players: [...room.players.values()].map(p => ({ username: p.username, score: p.score })) };
}
function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function socketUser(socket) {
  return socket.request.session && socket.request.session.userId;
}

io.on("connection", (socket) => {
  socket.on("room:create", async (callback) => {
    try {
      const userId = socketUser(socket);
      if (!userId) return callback?.({ error: "Bạn cần đăng nhập." });
      const result = await pool.query("SELECT id, username FROM users WHERE id = $1", [userId]);
      if (!result.rows[0]) return callback?.({ error: "Không tìm thấy tài khoản." });
      let code;
      do { code = makeCode(); } while (rooms.has(code));
      const room = {
        code, hostId: Number(userId), hostSocketId: socket.id, status: "lobby",
        players: new Map([[Number(userId), { userId: Number(userId), username: result.rows[0].username, score: 0, socketId: socket.id }]]),
        questionIds: [], current: 0, answered: new Set(), timer: null
      };
      rooms.set(code, room);
      socket.join(code);
      callback?.({ room: publicRoom(room) });
      emitRoom(room);
    } catch (err) {
      console.error(err);
      callback?.({ error: "Không tạo được phòng." });
    }
  });

  socket.on("room:join", async ({ code } = {}, callback) => {
    try {
      const userId = socketUser(socket);
      if (!userId) return callback?.({ error: "Bạn cần đăng nhập." });
      code = String(code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return callback?.({ error: "Không tìm thấy phòng. Kiểm tra lại mã nhé." });
      if (room.status !== "lobby") return callback?.({ error: "Trận đấu đã bắt đầu." });
      const result = await pool.query("SELECT id, username FROM users WHERE id = $1", [userId]);
      if (!result.rows[0]) return callback?.({ error: "Không tìm thấy tài khoản." });
      const id = Number(userId);
      room.players.set(id, { userId: id, username: result.rows[0].username, score: 0, socketId: socket.id });
      socket.join(code);
      callback?.({ room: publicRoom(room) });
      emitRoom(room);
    } catch (err) {
      console.error(err);
      callback?.({ error: "Không tham gia được phòng." });
    }
  });

  socket.on("game:start", ({ code } = {}, callback) => {
    const userId = socketUser(socket);
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || Number(userId) !== room.hostId || room.status !== "lobby") return callback?.({ error: "Chỉ chủ phòng mới có thể bắt đầu." });
    if (room.players.size < 1) return callback?.({ error: "Chưa có người chơi." });
    room.status = "playing";
    room.questionIds = questions.map(q => q.id).sort(() => Math.random() - 0.5).slice(0, 5);
    room.current = 0;
    room.answered = new Set();
    callback?.({ ok: true });
    sendQuestion(room);
  });

  socket.on("answer:submit", async ({ code, questionId, answerIndex } = {}, callback) => {
    const userId = socketUser(socket);
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.status !== "playing") return callback?.({ error: "Trận đấu chưa bắt đầu hoặc đã kết thúc." });
    const id = Number(userId);
    const player = room.players.get(id);
    const question = questions.find(q => q.id === room.questionIds[room.current]);
    if (!player || !question || Number(questionId) !== question.id) return callback?.({ error: "Câu hỏi không hợp lệ." });
    if (room.answered.has(id)) return callback?.({ error: "Bạn đã trả lời câu này rồi." });
    const choice = Number(answerIndex);
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return callback?.({ error: "Đáp án không hợp lệ." });
    room.answered.add(id);
    const correct = choice === question.answer;
    if (correct) player.score += 100;
    callback?.({ correct, explanation: question.explanation, score: player.score });
    io.to(room.code).emit("answer:progress", { answered: room.answered.size, total: room.players.size });
    if (room.answered.size >= room.players.size) advanceQuestion(room);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      for (const [id, player] of room.players.entries()) {
        if (player.socketId === socket.id) {
          // Keep their score in the room; their current connection can rejoin after reconnect only in a later version.
          player.socketId = null;
        }
      }
    }
  });
});

function sendQuestion(room) {
  if (room.timer) clearTimeout(room.timer);
  if (room.current >= room.questionIds.length) return finishRoom(room);
  room.answered = new Set();
  const q = questions.find(item => item.id === room.questionIds[room.current]);
  io.to(room.code).emit("game:question", {
    index: room.current + 1,
    total: room.questionIds.length,
    question: { id: q.id, subject: q.subject, text: q.text, options: q.options }
  });
  emitRoom(room);
  room.timer = setTimeout(() => advanceQuestion(room), 25000);
}
function advanceQuestion(room) {
  if (!rooms.has(room.code) || room.status !== "playing") return;
  if (room.timer) clearTimeout(room.timer);
  room.current += 1;
  sendQuestion(room);
}
async function finishRoom(room) {
  room.status = "finished";
  if (room.timer) clearTimeout(room.timer);
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const player of room.players.values()) {
        await client.query(
          "INSERT INTO game_results(user_id, room_code, score) VALUES($1, $2, $3)",
          [player.userId, room.code, player.score]
        );
        await client.query(
          "UPDATE users SET total_score = total_score + $1, games_played = games_played + 1 WHERE id = $2",
          [player.score, player.userId]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Could not save game results:", err);
  }
  io.to(room.code).emit("game:finished", { room: publicRoom(room) });
  emitRoom(room);
  io.emit("leaderboard:changed");
  setTimeout(() => rooms.delete(room.code), 10 * 60 * 1000);
}

async function start() {
  await initDb();
  server.listen(PORT, "0.0.0.0", () => console.log(`Class Battle listening on ${PORT}`));
}
start().catch(err => {
  console.error("Startup failed:", err);
  process.exit(1);
});
