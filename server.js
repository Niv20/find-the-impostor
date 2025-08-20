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
const allCategoriesForClient = Object.entries(wordCategories).map(
  ([id, data]) => ({
    id,
    name: data.categoryName,
  })
);

console.log(`✅ Loaded ${Object.keys(wordCategories).length} word categories.`);

// --- Helper Functions ---
function generateGameCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (games[code]);
  return code;
}

function getAvatarByFile(fileName) {
  return AVATARS_CONFIG.find((a) => a.file === fileName) || AVATARS_CONFIG[0];
}

function getAvailableAvatar(game) {
  const usedAvatars = game.players.map((p) => p.avatar.file);
  const availableAvatars = AVATARS_CONFIG.filter(
    (a) => !usedAvatars.includes(a.file)
  );
  if (availableAvatars.length === 0) {
    return AVATARS_CONFIG[Math.floor(Math.random() * AVATARS_CONFIG.length)];
  }
  return availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
}

io.on("connection", (socket) => {
  console.log(`🔌 New user connected: ${socket.id}`);

  socket.emit(
    "avatarList",
    AVATARS_CONFIG.map((a) => a.file)
  );

  socket.on("createGame", ({ name, requestedAvatarFile }) => {
    const gameCode = generateGameCode();
    socket.join(gameCode);

    const adminAvatar = getAvatarByFile(requestedAvatarFile);

    games[gameCode] = {
      adminId: socket.id,
      players: [
        { id: socket.id, name, score: 0, isAdmin: true, avatar: adminAvatar },
      ],
      settings: {
        timer: 5, // Default timer set to 5 seconds for debugging
        showCategory: true,
        enabledCategories: Object.keys(wordCategories), // Default to all category IDs
      },
      gameState: "lobby",
      currentRound: null,
    };

    socket.emit("gameCreated", {
      gameCode,
      players: games[gameCode].players,
      settings: games[gameCode].settings,
      allCategories: allCategoriesForClient, // Send all category objects to admin
    });
  });

  socket.on("checkGameCode", (gameCode) => {
    const game = games[gameCode];
    if (game) {
      if (game.players.length < 6) {
        socket.emit("gameCodeValid");
      } else {
        socket.emit("errorMsg", "זה לא אישי, אבל אין מקום בחדר בשבילך");
      }
    } else {
      socket.emit("errorMsg", "האממממ אנחנו לא מכירים את הקוד הזה. נסה שוב.");
    }
  });

  socket.on("joinGame", ({ gameCode, name, requestedAvatarFile }) => {
    const game = games[gameCode];
    if (!game) {
      return socket.emit("errorMsg", "המשחק לא נמצא. בדוק את הקוד שהזנת.");
    }
    if (game.players.length >= 6) {
      return socket.emit("errorMsg", "זה לא אישי, אבל אין מקום בחדר בשבילך");
    }
    const isNameTaken = game.players.some((p) => p.name === name);
    if (isNameTaken) {
      // שלח הודעת שגיאה מיוחדת שלא תעיף את המשתמש מהמסך
      return socket.emit(
        "nameTakenError",
        "כבר יש מישהו בחדר עם השם הזה. נסה שם אחר."
      );
    }

    // בחירת אווטר פנוי בלבד
    const usedAvatarFiles = game.players.map((p) => p.avatar.file);
    let playerAvatar;
    if (requestedAvatarFile && !usedAvatarFiles.includes(requestedAvatarFile)) {
      playerAvatar = getAvatarByFile(requestedAvatarFile);
    } else {
      // בחר אווטר פנוי אקראי
      const availableAvatars = AVATARS_CONFIG.filter(
        (a) => !usedAvatarFiles.includes(a.file)
      );
      playerAvatar =
        availableAvatars.length > 0
          ? availableAvatars[
              Math.floor(Math.random() * availableAvatars.length)
            ]
          : AVATARS_CONFIG[Math.floor(Math.random() * AVATARS_CONFIG.length)];
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

  socket.on("changeSettings", ({ gameCode, settings }) => {
    const game = games[gameCode];
    if (game && game.adminId === socket.id) {
      // בדיבאג תמיד נשמור על טיימר של 5 שניות
      game.settings = {
        ...game.settings,
        ...settings,
        timer: 5, // force 5 seconds for debugging
      };
    }
  });

  socket.on("startGame", (gameCode) => {
    const game = games[gameCode];
    if (!game || game.adminId !== socket.id) return;
    if (game.players.length < 3) {
      return; // Should be prevented by client-side UI
    }
    if (game.settings.enabledCategories.length === 0) {
      return io
        .to(socket.id)
        .emit("errorMsg", "חובה לבחור לפחות קטגוריית מילים אחת בהגדרות.");
    }
    startNewRound(gameCode);
  });

  socket.on("timerEnded", (gameCode) => {
    const game = games[gameCode];
    if (game && game.gameState === "in-game") {
      console.log(`[Game ${gameCode}] Timer ended. Starting vote.`);
      io.to(gameCode).emit("startVoting", game.players);
    }
  });

  function startNewRound(gameCode) {
    const game = games[gameCode];
    if (!game) return;

    const { enabledCategories } = game.settings;
    const randomCategoryKey =
      enabledCategories[Math.floor(Math.random() * enabledCategories.length)];
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
        // Pass the showCategory setting to the client
        showCategory: game.settings.showCategory,
      });
    });
    console.log(
      `[Game ${gameCode}] Round started. Word: ${randomWord}, Impostor: ${impostor.name}`
    );
  }

  socket.on("playerVote", ({ gameCode, votedForId }) => {
    const game = games[gameCode];
    // Renamed from 'vote' to avoid conflicts, and added more checks
    if (
      !game ||
      !game.currentRound ||
      game.currentRound.votes[socket.id] ||
      game.currentRound.revealed
    ) {
      return;
    }

    game.currentRound.votes[socket.id] = votedForId;
    const totalVotes = Object.keys(game.currentRound.votes).length;

    // Check if everyone has voted
    if (totalVotes === game.players.length) {
      revealResults(gameCode);
    }
  });

  function revealResults(gameCode) {
    const game = games[gameCode];
    if (!game || !game.currentRound || game.currentRound.revealed) return;

    game.currentRound.revealed = true;
    game.gameState = "lobby"; // Game returns to a lobby-like state

    const { votes, impostorId, word, categoryName } = game.currentRound;
    const voteCounts = {};
    Object.values(votes).forEach((votedId) => {
      voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
    });

    let mostVotedId = null;
    let maxVotes = -1;
    for (const playerId in voteCounts) {
      if (voteCounts[playerId] > maxVotes) {
        maxVotes = voteCounts[playerId];
        mostVotedId = playerId;
      }
    }

    const correctlyGuessed = mostVotedId === impostorId;
    const impostor = game.players.find((p) => p.id === impostorId);

    if (correctlyGuessed) {
      game.players.forEach((p) => {
        if (p.id !== impostorId) p.score += 1;
      });
    } else {
      if (impostor) impostor.score += 2;
    }

    io.to(gameCode).emit("roundResult", {
      correctlyGuessed,
      impostor,
      word,
      players: game.players,
    });

    // REMOVED: setTimeout(() => startNewRound(gameCode), 8000);
  }

  socket.on("endGame", (gameCode) => {
    const game = games[gameCode];
    if (game && game.adminId === socket.id) {
      io.to(gameCode).emit("gameEnded", game.players);
      delete games[gameCode];
    }
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

    if (game.players.length === 0) {
      console.log(`[Game ${gameCode}] Game empty, deleting.`);
      delete games[gameCode];
    } else if (leavingPlayer.isAdmin) {
      io.to(gameCode).emit("gameEnded", game.players);
      console.log(`[Game ${gameCode}] Admin left, ending game.`);
      delete games[gameCode];
    } else {
      io.to(gameCode).emit("updatePlayerList", game.players);
      if (
        game.gameState === "in-game" &&
        game.currentRound &&
        !game.currentRound.revealed
      ) {
        if (game.players.length < 2) {
          io.to(gameCode).emit("gameEnded", "אין מספיק שחקנים כדי להמשיך.");
          delete games[gameCode];
        } else if (game.currentRound.impostorId === sock.id) {
          io.to(gameCode).emit("roundResult", {
            correctlyGuessed: true, // Treat as if impostor was found
            impostor: leavingPlayer,
            word: game.currentRound.word,
            players: game.players,
            customMessage: `${leavingPlayer.name} (המתחזה) עזב את המשחק!`,
          });
          // REMOVED: setTimeout(() => startNewRound(gameCode), 8000);
        }
      }
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is live and running on port ${PORT}`);
});
