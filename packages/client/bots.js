import { io } from "socket.io-client";

const ROOM = "B85MD3";

async function createBot(botId) {
  const username = `bot${botId}_${Date.now()}`;
  const password = "password123";

  console.log(`[Bot ${botId}] Registering ${username}...`);
  const res = await fetch("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  
  if (!res.ok) {
    console.error(`[Bot ${botId}] Registration failed`, await res.text());
    return;
  }

  // Get the session cookie
  const setCookie = res.headers.get("set-cookie");
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

  console.log(`[Bot ${botId}] Registered. Connecting socket...`);
  
  const socket = io("http://localhost:3000", {
    extraHeaders: {
      Cookie: cookieHeader
    }
  });

  socket.on("connect", () => {
    console.log(`[Bot ${botId}] Connected. Joining lobby ${ROOM}...`);
    socket.emit("lobby:join", { code: ROOM });
    setTimeout(() => {
      console.log(`[Bot ${botId}] Marking as ready...`);
      socket.emit("lobby:toggleReady");
    }, 1000);
  });

  socket.on("lobby:update", (data) => {
    console.log(`[Bot ${botId}] Joined lobby successfully! Players: ${data.players.length}`);
  });
  
  socket.on("connect_error", (err) => {
    console.error(`[Bot ${botId}] Connection error:`, err.message);
  });
  
  // keep process alive
}

async function run() {
  for (let i = 1; i <= 3; i++) {
    await createBot(i);
    await new Promise(r => setTimeout(r, 500)); // slight delay between bots
  }
}

run();
