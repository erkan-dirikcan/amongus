import { showScreen } from "../app.js";

interface StatsMe {
  username: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  tasksCompleted: number;
  winRate: number;
}

interface LeaderboardEntry {
  username: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export async function initStatsScreen(): Promise<void> {
  const backBtn = document.getElementById("btn-stats-back")!;
  backBtn.addEventListener("click", () => {
    showScreen("menu");
  });
}

export async function loadStats(): Promise<void> {
  const errorEl = document.getElementById("stats-error")!;
  const myEl = document.getElementById("my-stats")!;
  const body = document.getElementById("leaderboard-body")!;
  errorEl.textContent = "";
  myEl.innerHTML = "Yükleniyor...";
  body.innerHTML = "";

  try {
    const [meRes, lbRes] = await Promise.all([
      fetch("/api/stats/me", { credentials: "include" }),
      fetch("/api/stats/leaderboard?limit=20", { credentials: "include" }),
    ]);
    if (!meRes.ok || !lbRes.ok) throw new Error("İstatistikler yüklenemedi");
    const me = (await meRes.json()) as StatsMe;
    const lb = (await lbRes.json()) as { entries: LeaderboardEntry[] };

    myEl.innerHTML = "";
    const cards: [string, string | number][] = [
      ["🎮 Oynanan", me.gamesPlayed],
      ["🏆 Kazanılan", me.wins],
      ["💀 Kaybedilen", me.losses],
      ["📈 Kazanma %", `${me.winRate}%`],
      ["🛠️ Görev", me.tasksCompleted],
    ];
    for (const [label, value] of cards) {
      const card = document.createElement("div");
      card.className = "stat-tile";
      const v = document.createElement("strong");
      v.textContent = String(value);
      const l = document.createElement("span");
      l.textContent = label;
      card.appendChild(v);
      card.appendChild(l);
      myEl.appendChild(card);
    }

    if (lb.entries.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "Henüz maç oynanmamış";
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    lb.entries.forEach((e, i) => {
      const row = document.createElement("tr");
      const rank = document.createElement("td");
      rank.textContent = String(i + 1);
      const name = document.createElement("td");
      name.textContent = e.username;
      const games = document.createElement("td");
      games.textContent = String(e.gamesPlayed);
      const wins = document.createElement("td");
      wins.textContent = String(e.wins);
      const losses = document.createElement("td");
      losses.textContent = String(e.losses);
      const rate = document.createElement("td");
      rate.textContent = `${e.winRate}%`;
      row.append(rank, name, games, wins, losses, rate);
      body.appendChild(row);
    });
  } catch (err) {
    myEl.innerHTML = "";
    errorEl.textContent = err instanceof Error ? err.message : "Bir hata oluştu";
  }
}
