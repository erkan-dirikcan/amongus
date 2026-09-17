import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import type { MeetingPlayerInfo } from "../types.js";
import { getCurrentUserId } from "../session.js";

const COLOR_HEX: Record<string, string> = {
  red: "#e53935", blue: "#1e88e5", green: "#43a047", pink: "#ec407a",
  orange: "#fb8c00", yellow: "#fdd835", black: "#212121", white: "#fafafa",
  purple: "#8e24aa", brown: "#795548", cyan: "#00acc1", lime: "#c0ca33",
};

let meetingPlayers: MeetingPlayerInfo[] = [];
let myVote: string | "skip" | null = null;

export function initMeetingScreen(): void {
  const socket = getSocket();

  socket.on("game:meetingStarted", (payload: any) => {
    meetingPlayers = payload.players;
    const title = document.getElementById("meeting-title")!;
    title.textContent = payload.reason === "emergency"
      ? `📢 EMERGENCY MEETING (${payload.reporterName})`
      : `📢 ${payload.reporterName} ceset buldu!`;
    document.getElementById("meeting-chat")!.innerHTML = "";
    renderVoteButtons();
    showScreen("meeting");
    startTimer(payload.duration);
  });

  socket.on("game:voteUpdate", (payload: { voted: Record<string, boolean> }) => {
    renderVoteButtons(payload.voted);
  });

  socket.on("game:chatMessage", (payload: { userId: string; username: string; message: string }) => {
    const chat = document.getElementById("meeting-chat")!;
    const msg = document.createElement("div");
    msg.className = "chat-msg";
    const user = document.createElement("span");
    user.className = "chat-user";
    user.textContent = payload.username + ": ";
    const text = document.createElement("span");
    text.textContent = payload.message;
    msg.appendChild(user);
    msg.appendChild(text);
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  });

  socket.on("game:meetingEnded", (payload: any) => {
    const title = document.getElementById("meeting-title")!;
    if (payload.ejectedId) {
      title.textContent = `${payload.ejectedId} atıldı! Rol: ${payload.ejectedRole}`;
    } else if (payload.wasTie) {
      title.textContent = "Beraberlik! Kimse atılmadı.";
    } else {
      title.textContent = "Skip kazandı. Kimse atılmadı.";
    }
    setTimeout(() => {
      showScreen("game");
      myVote = null;
    }, 5000);
  });

  // Chat send
  const sendBtn = document.getElementById("chat-send")!;
  const chatInput = document.getElementById("chat-input") as HTMLInputElement;
  sendBtn.addEventListener("click", () => {
    const msg = chatInput.value.trim();
    if (msg) {
      socket.emit("game:sendChat", { message: msg });
      chatInput.value = "";
    }
  });
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendBtn.click();
  });
}

function renderVoteButtons(voted?: Record<string, boolean>): void {
  const container = document.getElementById("vote-buttons")!;
  container.innerHTML = "";
  const myUserId = getCurrentUserId();
  const me = meetingPlayers.find((p) => p.userId === myUserId);
  const canVote = me?.isAlive ?? false;

  for (const p of meetingPlayers) {
    if (!p.isAlive) continue;
    if (p.userId === myUserId) continue;
    const btn = document.createElement("button");
    btn.className = "vote-btn";
    if (myVote === p.userId) btn.classList.add("selected");
    const dot = document.createElement("span");
    dot.className = "vote-dot";
    dot.style.background = COLOR_HEX[p.color] || "#888";
    const name = document.createElement("span");
    name.textContent = p.username;
    btn.appendChild(dot);
    btn.appendChild(name);
    if (voted?.[p.userId]) {
      const mark = document.createElement("span");
      mark.className = "voted-mark";
      mark.textContent = "✓";
      btn.appendChild(mark);
    }
    if (canVote) {
      btn.addEventListener("click", () => {
        myVote = p.userId;
        getSocket().emit("game:vote", { targetId: p.userId });
        renderVoteButtons(voted);
      });
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  }

  // Skip button
  const skip = document.createElement("button");
  skip.className = "vote-btn";
  if (myVote === "skip") skip.classList.add("selected");
  skip.textContent = "Skip (çekimser)";
  if (canVote) {
    skip.addEventListener("click", () => {
      myVote = "skip";
      getSocket().emit("game:vote", { targetId: "skip" });
      renderVoteButtons(voted);
    });
  } else {
    skip.disabled = true;
  }
  container.appendChild(skip);
}

function startTimer(duration: number): void {
  const timerEl = document.getElementById("meeting-timer")!;
  const startTime = Date.now();
  const update = () => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
    timerEl.textContent = `⏱️ ${remaining} saniye`;
    if (remaining > 0) setTimeout(update, 1000);
  };
  update();
}
