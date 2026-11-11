import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import type { MeetingPlayerInfo } from "../types.js";
import { getCurrentUserId } from "../session.js";
import { createCrewmateSvg } from "../phaser/sprites.js";
import { COLOR_HEX } from "../constants.js";

let meetingPlayers: MeetingPlayerInfo[] = [];
let myVote: string | "skip" | null = null;
let timerTimeout: ReturnType<typeof setTimeout> | null = null;

export function initMeetingScreen(): void {
  const socket = getSocket();

  socket.on("game:meetingStarted", (payload: any) => {
    meetingPlayers = payload.players;
    myVote = null;

    const ejectOverlay = document.getElementById("ejection-overlay");
    if (ejectOverlay) ejectOverlay.hidden = true;

    const title = document.getElementById("meeting-title")!;
    title.textContent = payload.reason === "emergency"
      ? `🚨 ACİL TOPLANTI (${payload.reporterName} çağırdı)`
      : `📢 CESET BİLDİRİLDİ! (${payload.reporterName} buldu)`;

    document.getElementById("meeting-chat")!.innerHTML = "";
    const myUserId = getCurrentUserId();
    const me = meetingPlayers.find((p) => p.userId === myUserId);
    const chatInput = document.getElementById("chat-input") as HTMLInputElement;
    if (chatInput) {
      chatInput.placeholder = me && !me.isAlive
        ? "👻 Hayalet sohbeti (sadece ölüler görür)..."
        : "Mesaj yaz...";
    }

    renderVoteButtons();
    showScreen("meeting");
    startTimer(payload.duration);
  });

  socket.on("game:voteUpdate", (payload: { voted: Record<string, boolean> }) => {
    renderVoteButtons(payload.voted);
  });

  socket.on("game:chatMessage", (payload: { userId: string; username: string; message: string; color?: string; isGhost?: boolean }) => {
    const chat = document.getElementById("meeting-chat")!;
    const msg = document.createElement("div");
    msg.className = "chat-msg" + (payload.isGhost ? " ghost-msg" : "");
    const user = document.createElement("span");
    user.className = "chat-user";
    if (payload.color && COLOR_HEX[payload.color]) {
      user.style.color = COLOR_HEX[payload.color];
    }
    user.textContent = (payload.isGhost ? "👻 " : "") + payload.username + ": ";
    const text = document.createElement("span");
    text.textContent = payload.message;
    msg.appendChild(user);
    msg.appendChild(text);
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  });

  socket.on("game:meetingEnded", (payload: {
    ejectedId: string | null;
    ejectedRole: "IMPOSTOR" | "CREW" | null;
    wasTie: boolean;
    votes?: Record<string, string | "skip">;
  }) => {
    if (timerTimeout) {
      clearTimeout(timerTimeout);
      timerTimeout = null;
    }

    // Show who voted for whom on the vote cards briefly
    renderVoteButtons(undefined, payload.votes);

    const title = document.getElementById("meeting-title")!;
    const ejectedPlayer = payload.ejectedId
      ? meetingPlayers.find((p) => p.userId === payload.ejectedId)
      : undefined;
    const ejectedName = ejectedPlayer?.username ?? payload.ejectedId;

    let headline = "";
    let subline = "";
    if (payload.ejectedId) {
      const roleLabel = payload.ejectedRole === "IMPOSTOR" ? "bir Impostor idi!" : "bir Impostor değildi.";
      headline = `${ejectedName} uzaya atıldı!`;
      subline = `${ejectedName} ${roleLabel}`;
      title.textContent = `${ejectedName} atıldı! Rol: ${payload.ejectedRole}`;
    } else if (payload.wasTie) {
      headline = "Oylar Eşit Çıktı (Beraberlik)!";
      subline = "Kimse uzaya atılmadı.";
      title.textContent = "Beraberlik! Kimse atılmadı.";
    } else {
      headline = "Oylama Pas Geçildi (Skip)!";
      subline = "Kimse uzaya atılmadı.";
      title.textContent = "Skip kazandı. Kimse atılmadı.";
    }

    // Show Ejection animation after 1.5s of viewing vote breakdown
    setTimeout(() => {
      const ejectOverlay = document.getElementById("ejection-overlay");
      const ejectAvatar = document.getElementById("ejection-avatar");
      const ejectText = document.getElementById("ejection-text");
      const ejectSub = document.getElementById("ejection-sub");
      if (ejectOverlay && ejectAvatar && ejectText && ejectSub) {
        ejectAvatar.innerHTML = ejectedPlayer
          ? createCrewmateSvg(COLOR_HEX[ejectedPlayer.color] ?? "#e53935", { size: 68 })
          : "🌌";
        ejectText.textContent = headline;
        ejectSub.textContent = subline;
        ejectOverlay.hidden = false;
      }
    }, 1400);

    setTimeout(() => {
      const ejectOverlay = document.getElementById("ejection-overlay");
      if (ejectOverlay) ejectOverlay.hidden = true;
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

function renderVoteButtons(
  voted?: Record<string, boolean>,
  finalVotes?: Record<string, string | "skip">
): void {
  const container = document.getElementById("vote-buttons")!;
  container.innerHTML = "";
  const myUserId = getCurrentUserId();
  const me = meetingPlayers.find((p) => p.userId === myUserId);
  const canVote = (me?.isAlive ?? false) && !finalVotes;

  // Group finalVotes by target
  const votersFor = (targetId: string): MeetingPlayerInfo[] => {
    if (!finalVotes) return [];
    const list: MeetingPlayerInfo[] = [];
    for (const [voterId, target] of Object.entries(finalVotes)) {
      if (target === targetId) {
        const voter = meetingPlayers.find((mp) => mp.userId === voterId);
        if (voter) list.push(voter);
      }
    }
    return list;
  };

  // Alive players first, then dead players
  const sorted = [...meetingPlayers].sort((a, b) => Number(b.isAlive) - Number(a.isAlive));

  for (const p of sorted) {
    const btn = document.createElement("button");
    btn.className = "vote-btn" + (p.isAlive ? "" : " dead-player");
    if (myVote === p.userId) btn.classList.add("selected");

    const avatar = document.createElement("span");
    avatar.innerHTML = createCrewmateSvg(COLOR_HEX[p.color] || "#888", { size: 28, dead: !p.isAlive });

    const name = document.createElement("span");
    name.textContent = p.username + (p.userId === myUserId ? " (Sen)" : "");

    btn.appendChild(avatar);
    btn.appendChild(name);

    if (!p.isAlive) {
      const deadTag = document.createElement("span");
      deadTag.className = "voted-mark";
      deadTag.style.color = "#ef476f";
      deadTag.style.background = "rgba(239, 71, 111, 0.15)";
      deadTag.textContent = "💀 Ölü";
      btn.appendChild(deadTag);
      btn.disabled = true;
    } else if (finalVotes) {
      const voters = votersFor(p.userId);
      const wrap = document.createElement("span");
      wrap.className = "vote-voters";
      for (const v of voters) {
        const vIcon = document.createElement("span");
        vIcon.title = `${v.username} oy verdi`;
        vIcon.innerHTML = createCrewmateSvg(COLOR_HEX[v.color] || "#888", { size: 18 });
        wrap.appendChild(vIcon);
      }
      btn.appendChild(wrap);
      btn.disabled = true;
    } else if (voted?.[p.userId]) {
      const mark = document.createElement("span");
      mark.className = "voted-mark";
      mark.textContent = "✓ Oy Verdi";
      btn.appendChild(mark);
    }

    if (canVote && p.isAlive && p.userId !== myUserId) {
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
  skip.textContent = "⏭️ Skip (Çekimser Oy)";
  if (finalVotes) {
    const skipVoters = votersFor("skip");
    const wrap = document.createElement("span");
    wrap.className = "vote-voters";
    for (const v of skipVoters) {
      const vIcon = document.createElement("span");
      vIcon.title = `${v.username} skip verdi`;
      vIcon.innerHTML = createCrewmateSvg(COLOR_HEX[v.color] || "#888", { size: 18 });
      wrap.appendChild(vIcon);
    }
    skip.appendChild(wrap);
    skip.disabled = true;
  } else if (canVote) {
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
  if (timerTimeout) clearTimeout(timerTimeout);
  const timerEl = document.getElementById("meeting-timer")!;
  const startTime = Date.now();
  const update = () => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
    timerEl.textContent = `⏱️ ${remaining} saniye`;
    if (remaining > 0) timerTimeout = setTimeout(update, 1000);
  };
  update();
}
