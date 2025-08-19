const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// --- Avatar and Color Configuration ---
const AVATARS_CONFIG = [
  { file: "avatar1.png", color: "#f39c12" }, // כתום בוהק
  { file: "avatar2.png", color: "#3498db" }, // תכלת
  { file: "avatar3.png", color: "#e84393" }, // ורוד עז
  { file: "avatar4.png", color: "#e74c3c" }, // אדום חזק
  { file: "avatar5.png", color: "#f1c40f" }, // צהוב שמשי
  { file: "avatar6.png", color: "#2ecc71" }, // ירוק חי
];

// --- Game State Management ---
const games = {};

// --- Word Loading ---
const wordCategories = {};
const dataPath = path.join(__dirname, "data");
fs.readdirSync(dataPath).forEach((file) => {
  if (file.endsWith(".json")) {
    const filePath = path.join(dataPath, file);
    const categoryData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const categoryKey = path.basename(file, ".json");
    wordCategories[categoryKey] = categoryData;
  }
});
console.log(`✅ Loaded ${Object.keys(wordCategories).length} word categories.`);

// --- Helper Functions ---
function generateGameCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (games[code]);
  return code;
}

// Gets a random available avatar for a game
function getAvailableAvatar(game) {
  const usedAvatars = game.players.map((p) => p.avatar.file);
  const availableAvatars = AVATARS_CONFIG.filter(
    (a) => !usedAvatars.includes(a.file)
  );
  if (availableAvatars.length === 0) return null; // Should not happen with player limit
  return availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
}

io.on("connection", (socket) => {
  console.log(`🔌 New user connected: ${socket.id}`);

  // Provide the list of avatars to the client on connection
  socket.emit(
    "avatarList",
    AVATARS_CONFIG.map((a) => a.file)
  );

  // --- Game Creation and Joining ---
  socket.on("createGame", ({ name }) => {
    const gameCode = generateGameCode();
    socket.join(gameCode);

    const adminAvatar =
      AVATARS_CONFIG[Math.floor(Math.random() * AVATARS_CONFIG.length)];

    games[gameCode] = {
      adminId: socket.id,
      players: [
        { id: socket.id, name, score: 0, isAdmin: true, avatar: adminAvatar },
      ],
      settings: { timer: 60, showCategory: true },
      gameState: "lobby",
      currentRound: null,
    };

    socket.emit("gameCreated", {
      gameCode,
      players: games[gameCode].players,
      settings: games[gameCode].settings,
    });
  });

  socket.on("joinGame", ({ gameCode, name }) => {
    const game = games[gameCode];
    if (!game) {
      return socket.emit("errorMsg", "המשחק לא נמצא. בדוק את הקוד שהזנת.");
    }
    // Enforce 6-player limit
    if (game.players.length >= 6) {
      return socket.emit("errorMsg", "החדר מלא, לא ניתן להצטרף.");
    }

    const playerAvatar = getAvailableAvatar(game);
    if (!playerAvatar) {
      return socket.emit("errorMsg", "שגיאה במציאת אווטאר פנוי.");
    }

    socket.join(gameCode);
    game.players.push({
      id: socket.id,
      name,
      score: 0,
      isAdmin: false,
      avatar: playerAvatar,
    });

    socket.emit("joinedSuccess", {
      players: game.players,
      settings: game.settings,
    });
    io.to(gameCode).emit("updatePlayerList", game.players);
  });

  // ... (שאר הקוד של השרת נשאר זהה לקודם)
  // --- Admin Controls ---
  socket.on("changeSettings", ({ gameCode, settings }) => {
    const game = games[gameCode];
    if (game && game.adminId === socket.id) {
      game.settings = { ...game.settings, ...settings };
      io.to(gameCode).emit("settingsUpdated", game.settings);
    }
  });

  socket.on("startGame", (gameCode) => {
    const game = games[gameCode];
    if (!game || game.adminId !== socket.id || game.players.length < 3) return;

    startNewRound(gameCode);
  });

  function startNewRound(gameCode) {
    const game = games[gameCode];
    if (!game) return;

    const categoryKeys = Object.keys(wordCategories);
    const randomCategoryKey =
      categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
    const category = wordCategories[randomCategoryKey];
    const randomWord =
      category.words[Math.floor(Math.random() * category.words.length)];

    const impostor =
      game.players[Math.floor(Math.random() * game.players.length)];

    game.currentRound = {
      word: randomWord,
      categoryName: category.categoryName,
      impostorId: impostor.id,
      votes: {},
      revealed: false,
    };

    game.gameState = "in-game";

    game.players.forEach((player) => {
      const isImpostor = player.id === impostor.id;
      io.to(player.id).emit("roundStart", {
        isImpostor,
        word: isImpostor ? null : randomWord,
        category: game.settings.showCategory ? category.categoryName : null,
        timer: game.settings.timer,
      });
    });
    console.log(
      `[Game ${gameCode}] Round started. Word: ${randomWord}, Impostor: ${impostor.name}`
    );
  }

  socket.on("getPlayersForVoting", (gameCode) => {
    const game = games[gameCode];
    if (game) {
      socket.emit("playerListForVoting", game.players);
    }
  });

  socket.on("vote", ({ gameCode, votedPlayerId }) => {
    const game = games[gameCode];
    if (!game || !game.currentRound || game.currentRound.votes[socket.id])
      return;

    game.currentRound.votes[socket.id] = votedPlayerId;
    const totalVotes = Object.keys(game.currentRound.votes).length;

    if (totalVotes === game.players.length) {
      revealResults(gameCode);
    }
  });

  function revealResults(gameCode) {
    const game = games[gameCode];
    if (!game || !game.currentRound || game.currentRound.revealed) return;

    game.currentRound.revealed = true;

    const { votes, impostorId, word } = game.currentRound;
    const voteCounts = {};
    Object.values(votes).forEach((votedId) => {
      voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
    });

    let mostVotedId = null;
    let maxVotes = -1; // Start at -1 to handle single player case
    for (const playerId in voteCounts) {
      if (voteCounts[playerId] > maxVotes) {
        maxVotes = voteCounts[playerId];
        mostVotedId = playerId;
      }
    }

    const impostorFound = mostVotedId === impostorId;
    const impostor = game.players.find((p) => p.id === impostorId);

    if (impostorFound) {
      game.players.forEach((p) => {
        if (p.id !== impostorId) p.score += 1;
      });
    } else {
      if (impostor) impostor.score += 2;
    }

    io.to(gameCode).emit("roundResult", {
      impostorFound,
      impostorName: impostor ? impostor.name : "לא ידוע",
      word,
      players: game.players,
    });

    setTimeout(() => startNewRound(gameCode), 8000);
  }

  socket.on("endGame", (gameCode) => {
    const game = games[gameCode];
    if (game && game.adminId === socket.id) {
      io.to(gameCode).emit("gameEnded");
      delete games[gameCode];
    }
  });

  socket.on("leaveGame", (gameCode) => {
    handleDisconnect(gameCode, socket);
  });

  socket.on("disconnect", () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    for (const gameCode in games) {
      const playerIndex = games[gameCode].players.findIndex(
        (p) => p.id === socket.id
      );
      if (playerIndex !== -1) {
        handleDisconnect(gameCode, socket);
        break;
      }
    }
  });

  function handleDisconnect(gameCode, sock) {
    const game = games[gameCode];
    if (!game) return;

    const playerIndex = game.players.findIndex((p) => p.id === sock.id);
    if (playerIndex === -1) return;

    const leavingPlayer = game.players[playerIndex];
    game.players.splice(playerIndex, 1);
    sock.leave(gameCode);

    if (leavingPlayer.isAdmin && game.players.length > 0) {
      // Admin left, end game
      io.to(gameCode).emit("gameEnded", "המנהל עזב, המשחק הסתיים.");
      delete games[gameCode];
    } else if (game.players.length === 0) {
      delete games[gameCode]; // Delete empty game
    } else {
      if (
        game.gameState === "in-game" &&
        game.currentRound &&
        game.currentRound.impostorId === sock.id
      ) {
        io.to(gameCode).emit("roundResult", {
          impostorFound: true,
          impostorName: leavingPlayer.name,
          word: game.currentRound.word,
          players: game.players,
          customMessage: `${leavingPlayer.name} (המתחזה) עזב את המשחק!`,
        });
        setTimeout(() => startNewRound(gameCode), 8000);
      } else {
        io.to(gameCode).emit("updatePlayerList", game.players);
      }
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is live and running on port ${PORT}`);
});
