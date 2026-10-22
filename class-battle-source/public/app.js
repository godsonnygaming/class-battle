const $ = (id) => document.getElementById(id);
let authMode = "login";
let me = null;
let socket = null;
let activeRoom = null;
let isHost = false;
let currentQuestion = null;
let answerLocked = false;
let questionTimeout = null;

function showMessage(id, text, kind = "") {
  const el = $(id);
  el.textContent = text || "";
  el.className = "message" + (kind ? " " + kind : "");
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Đã có lỗi xảy ra.");
  return data;
}
function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll(".auth-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
  $("authTitle").textContent = mode === "login" ? "Chào mừng trở lại!" : "Tạo tài khoản mới";
  $("authSubtitle").textContent = mode === "login" ? "Nhập tài khoản để tiếp tục cuộc chơi." : "Dùng biệt danh để bắt đầu hành trình.";
  $("authSubmit").innerHTML = mode === "login" ? 'Vào đấu trường <span>↗</span>' : 'Tạo tài khoản <span>✦</span>';
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  showMessage("authMessage", "");
}
document.querySelectorAll(".auth-tab").forEach(btn => btn.addEventListener("click", () => setAuthMode(btn.dataset.mode)));

async function handleAuth(event) {
  event.preventDefault();
  showMessage("authMessage", "");
  $("authSubmit").disabled = true;
  try {
    const data = await api(`/api/${authMode}`, {
      method: "POST",
      body: JSON.stringify({ username: $("username").value.trim(), password: $("password").value })
    });
    me = data.user;
    $("password").value = "";
    showApp();
  } catch (err) {
    showMessage("authMessage", err.message, "error");
  } finally {
    $("authSubmit").disabled = false;
  }
}
$("authForm").addEventListener("submit", handleAuth);

function showApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("userBadge").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("userBadge").textContent = `● ${me.username}`;
  $("welcomeName").textContent = me.username;
  $("myScore").textContent = `${Number(me.totalScore || 0)} XP`;
  if (!socket) setupSocket();
  loadLeaderboard();
}
$("logoutBtn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (_) {}
  if (socket) { socket.disconnect(); socket = null; }
  me = null; activeRoom = null;
  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
  $("userBadge").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  resetRoomUI();
});
async function loadLeaderboard() {
  try {
    const data = await api("/api/leaderboard");
    renderLeaderboard(data.leaderboard);
  } catch (err) {
    $("leaderboard").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}
function renderLeaderboard(rows) {
  const target = $("leaderboard");
  if (!rows.length) {
    target.innerHTML = '<div class="empty-state">Chưa có điểm nào. Hãy là người đầu tiên thi đấu! ✨</div>';
    return;
  }
  target.innerHTML = rows.map(row => {
    const rankClass = row.rank === 1 ? "gold" : row.rank === 2 ? "silver" : row.rank === 3 ? "bronze" : "";
    return `<div class="leader-row"><span class="rank ${rankClass}">${row.rank}</span><span><span class="player-name">${escapeHtml(row.username)}</span><small class="player-games">${row.gamesPlayed} trận</small></span><span class="player-xp">${row.totalScore} XP</span></div>`;
  }).join("");
}
$("refreshBoardBtn").addEventListener("click", loadLeaderboard);

function setupSocket() {
  socket = io();
  socket.on("connect", () => showMessage("roomMessage", "Đã kết nối máy chủ.", "success"));
  socket.on("connect_error", () => showMessage("roomMessage", "Không thể kết nối máy chủ. Hãy tải lại trang.", "error"));
  socket.on("room:update", room => {
    if (activeRoom && room.code !== activeRoom.code) return;
    activeRoom = room;
    $("roomPanel").classList.remove("hidden");
    $("roomCodeDisplay").textContent = room.code;
    $("roomStatus").textContent = room.status === "lobby" ? "Đang chờ người chơi tham gia..." : room.status === "playing" ? "Trận đấu đang diễn ra!" : "Trận đấu đã kết thúc.";
    $("playerList").innerHTML = room.players.map(p => `<li>${escapeHtml(p.username)}${p.username === me.username ? " (Bạn)" : ""} <span class="muted">· ${p.score} XP</span></li>`).join("");
    $("startGameBtn").classList.toggle("hidden", !isHost || room.status !== "lobby");
  });
  socket.on("game:question", payload => {
    currentQuestion = payload.question;
    answerLocked = false;
    $("gamePanel").classList.remove("hidden");
    $("resultsPanel").classList.add("hidden");
    $("quizSubject").textContent = payload.question.subject.toUpperCase();
    $("quizProgress").textContent = `CÂU ${payload.index}/${payload.total}`;
    $("quizQuestion").textContent = payload.question.text;
    $("quizFeedback").textContent = "";
    $("quizFeedback").className = "message";
    $("quizOptions").innerHTML = payload.question.options.map((option, i) => `<button class="quiz-option" data-answer="${i}">${String.fromCharCode(65 + i)}. ${escapeHtml(option)}</button>`).join("");
    $("quizOptions").querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => submitAnswer(Number(btn.dataset.answer), btn)));
    startVisualTimer();
  });
  socket.on("answer:progress", info => {
    $("quizTimer").textContent = `Đã trả lời: ${info.answered}/${info.total} người chơi`;
  });
  socket.on("game:finished", payload => {
    if (!activeRoom || payload.room.code !== activeRoom.code) return;
    activeRoom = payload.room;
    $("gamePanel").classList.add("hidden");
    $("resultsPanel").classList.remove("hidden");
    const sorted = [...payload.room.players].sort((a,b) => b.score - a.score);
    $("resultsList").innerHTML = sorted.map(p => `<li><strong>${escapeHtml(p.username)}</strong> — ${p.score} XP</li>`).join("");
    showMessage("roomMessage", "Trận đấu hoàn tất! Điểm đã được lưu.", "success");
    api("/api/me").then(data => { if (data.user) { me = data.user; $("myScore").textContent = `${me.totalScore} XP`; } }).catch(() => {});
    loadLeaderboard();
  });
  socket.on("leaderboard:changed", loadLeaderboard);
}
function startVisualTimer() {
  if (questionTimeout) clearInterval(questionTimeout);
  let seconds = 25;
  $("quizTimer").textContent = `Còn ${seconds} giây`;
  questionTimeout = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(questionTimeout);
      $("quizTimer").textContent = "Đã hết thời gian!";
      lockOptions();
    } else $("quizTimer").textContent = `Còn ${seconds} giây`;
  }, 1000);
}
function lockOptions() {
  $("quizOptions").querySelectorAll("button").forEach(btn => btn.disabled = true);
}
function submitAnswer(answerIndex, button) {
  if (answerLocked || !currentQuestion || !activeRoom) return;
  answerLocked = true;
  lockOptions();
  socket.emit("answer:submit", { code: activeRoom.code, questionId: currentQuestion.id, answerIndex }, response => {
    if (!response) return;
    if (response.error) {
      showMessage("quizFeedback", response.error, "error");
      return;
    }
    const options = [...$("quizOptions").querySelectorAll("button")];
    if (response.correct) button.classList.add("correct");
    else button.classList.add("wrong");
    showMessage("quizFeedback", response.correct ? `Chính xác! +100 XP. ${response.explanation}` : `Chưa đúng. ${response.explanation}`, response.correct ? "success" : "error");
  });
}
$("createRoomBtn").addEventListener("click", () => {
  showMessage("roomMessage", "");
  socket.emit("room:create", response => {
    if (response.error) return showMessage("roomMessage", response.error, "error");
    activeRoom = response.room; isHost = true;
    $("roomPanel").classList.remove("hidden");
    $("startGameBtn").classList.remove("hidden");
    showMessage("roomMessage", "Đã tạo phòng! Gửi mã cho bạn bè.", "success");
  });
});
$("joinRoomBtn").addEventListener("click", () => {
  const code = $("roomCode").value.trim().toUpperCase();
  if (!code) return showMessage("roomMessage", "Hãy nhập mã phòng.", "error");
  socket.emit("room:join", { code }, response => {
    if (response.error) return showMessage("roomMessage", response.error, "error");
    activeRoom = response.room; isHost = false;
    $("roomPanel").classList.remove("hidden");
    $("startGameBtn").classList.add("hidden");
    showMessage("roomMessage", "Bạn đã vào phòng thành công.", "success");
  });
});
$("roomCode").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0,6); });
$("copyCodeBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("roomCodeDisplay").textContent); showMessage("roomMessage", "Đã sao chép mã phòng.", "success"); }
  catch (_) { showMessage("roomMessage", "Mã phòng: " + $("roomCodeDisplay").textContent); }
});
$("startGameBtn").addEventListener("click", () => {
  if (!activeRoom) return;
  socket.emit("game:start", { code: activeRoom.code }, response => {
    if (response?.error) showMessage("roomMessage", response.error, "error");
    else showMessage("roomMessage", "Trận đấu bắt đầu!", "success");
  });
});
$("backLobbyBtn").addEventListener("click", () => {
  $("resultsPanel").classList.add("hidden");
  $("gamePanel").classList.add("hidden");
  $("roomPanel").classList.add("hidden");
  activeRoom = null; isHost = false;
  showMessage("roomMessage", "");
  loadLeaderboard();
});
function resetRoomUI() {
  $("roomPanel").classList.add("hidden");
  $("gamePanel").classList.add("hidden");
  $("resultsPanel").classList.add("hidden");
  showMessage("roomMessage", "");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
(async function init() {
  try {
    const data = await api("/api/me");
    if (data.user) { me = data.user; showApp(); }
  } catch (_) {}
})();
