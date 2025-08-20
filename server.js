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

const AVATARS_CONFIG = [
  { file: "avatar1.png", color: "#f39c12" },
  { file: "avatar2.png", color: "#3498db" },
  { file: "avatar3.png", color: "#e84393" },
  { file: "avatar4.png", color: "#e74c3c" },
  { file: "avatar5.png", color: "#f1c40f" },
  { file: "avatar6.png", color: "#2ecc71" },
];

const games = {};
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
  ([id, data]) => ({ id, name: data.categoryName })
);
console.log(`✅ Loaded ${Object.keys(wordCategories).length} word categories.`);

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
  const available = AVATARS_CONFIG.filter((a) => !usedAvatars.includes(a.file));
  return available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : AVATARS_CONFIG[Math.floor(Math.random() * AVATARS_CONFIG.length)];
}

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
    tieBreakVotes: {},
    tieCandidates: [],
    revealed: false,
  };
  game.gameState = "in-game";

  game.players.forEach((player) => {
    const isImpostor = player.id === impostor.id;
    let categoryForPlayer = null;
    if (isImpostor && game.settings.showCategory) {
      categoryForPlayer = category.categoryName;
    }
    io.to(player.id).emit("roundStart", {
      isImpostor,
      word: isImpostor ? null : randomWord,
      category: categoryForPlayer,
      timer: game.settings.timer,
    });
  });
  console.log(
    `[Game ${gameCode}] Round started. Word: ${randomWord}, Impostor: ${impostor.name}`
  );
}

function revealResults(gameCode, isTieBreak = false) {
  const game = games[gameCode];
  if (!game || !game.currentRound || game.currentRound.revealed) return;

  const voteSource = isTieBreak
    ? game.currentRound.tieBreakVotes
    : game.currentRound.votes;
  const { impostorId, word } = game.currentRound;

  const voteCounts = {};
  Object.values(voteSource).forEach((votedId) => {
    voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
  });

  let maxVotes = 0;
  for (const count of Object.values(voteCounts)) {
    if (count > maxVotes) maxVotes = count;
  }

  const mostVotedIds = Object.keys(voteCounts).filter(
    (id) => voteCounts[id] === maxVotes
  );

  if (mostVotedIds.length > 1 && !isTieBreak) {
    const impostorIsSuspect = mostVotedIds.includes(impostorId);

    if (impostorIsSuspect && mostVotedIds.length === 2) {
      // Handle tie-break for impostor vs one other
      game.gameState = "tie-break";
      game.currentRound.tieCandidates = mostVotedIds;

      const voters = game.players.filter((p) => !mostVotedIds.includes(p.id));
      let finalVoters = [...voters];

      if (voters.length % 2 === 0 && voters.length > 0) {
        // If even number of voters, exclude one
        const excludedVoter = voters[Math.floor(Math.random() * voters.length)];
        finalVoters = voters.filter((p) => p.id !== excludedVoter.id);
        io.to(excludedVoter.id).emit("excludedFromTieVote");
      }

      const candidateData = game.players
        .filter((p) => mostVotedIds.includes(p.id))
        .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar }));
      io.to(gameCode).emit("tieVote", {
        candidates: candidateData,
        voterIds: finalVoters.map((p) => p.id),
      });
      return; // Stop here and wait for tie-break votes
    }
  }

  game.currentRound.revealed = true;
  const impostorFound =
    mostVotedIds.length === 1 && mostVotedIds[0] === impostorId;
  const impostor = game.players.find((p) => p.id === impostorId);
  let message = "";

  const oldScores = game.players.map((p) => ({ id: p.id, score: p.score }));

  if (impostorFound) {
    game.players.forEach((p) => {
      if (p.id !== impostorId) p.score += 1;
    });
    message = "המתחזה נחשף!";
  } else {
    if (impostor) impostor.score += 2;
    message = "המתחזה הצליח לברוח!";
  }

  const scoreChanges = game.players.map((p) => {
    const oldPlayer = oldScores.find((op) => op.id === p.id);
    return { id: p.id, change: p.score - oldPlayer.score };
  });

  io.to(gameCode).emit("roundResult", {
    impostorFound,
    impostorName: impostor ? impostor.name : "לא ידוע",
    word,
    players: game.players,
    message,
    scoreChanges,
  });
  // Automatic next round is removed. Waiting for admin.
}

io.on("connection", (socket) => {
  // ... (createGame, joinGame, etc. remain the same)
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
        timer: 60,
        showCategory: true,
        enabledCategories: Object.keys(wordCategories),
      },
      gameState: "lobby",
      currentRound: null,
    };
    socket.emit("gameCreated", {
      gameCode,
      players: games[gameCode].players,
      settings: games[gameCode].settings,
      allCategories: allCategoriesForClient,
    });
  });
  socket.on("checkGameCode", (gameCode) => {
    const game = games[gameCode];
    if (game) {
      if (game.players.length < 6) socket.emit("gameCodeValid");
      else socket.emit("errorMsg", "החדר מלא, לא ניתן להצטרף.");
    } else socket.emit("errorMsg", "המשחק לא נמצא. בדוק את הקוד שהזנת.");
  });
  socket.on("joinGame", ({ gameCode, name, requestedAvatarFile }) => {
    const game = games[gameCode];
    if (!game) return socket.emit("errorMsg", "המשחק לא נמצא.");
    if (game.players.length >= 6)
      return socket.emit("errorMsg", "החדר מלא, לא ניתן להצטרף.");
    if (game.players.some((p) => p.name === name))
      return socket.emit("errorMsg", "השם שבחרת כבר תפוס.");

    let playerAvatar;
    const usedAvatars = game.players.map((p) => p.avatar.file);
    if (requestedAvatarFile && !usedAvatars.includes(requestedAvatarFile)) {
      playerAvatar = getAvatarByFile(requestedAvatarFile);
    } else {
      playerAvatar = getAvailableAvatar(game);
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
      game.settings = { ...game.settings, ...settings };
      io.to(gameCode).emit("settingsUpdated", game.settings);
    }
  });

  socket.on("startGame", (gameCode) => {
    const game = games[gameCode];
    if (!game || game.adminId !== socket.id) return;
    if (game.players.length < 3) return;
    if (game.settings.enabledCategories.length === 0)
      return io
        .to(socket.id)
        .emit("errorMsg", "חובה לבחור לפחות קטגוריית מילים אחת.");
    startNewRound(gameCode);
  });

  socket.on("startNextRound", (gameCode) => {
    const game = games[gameCode];
    if (game && game.adminId === socket.id) {
      startNewRound(gameCode);
    }
  });

  socket.on("vote", ({ gameCode, votedPlayerId }) => {
    const game = games[gameCode];
    if (!game || !game.currentRound || game.currentRound.votes[socket.id])
      return;
    game.currentRound.votes[socket.id] = votedPlayerId;
    const totalVotes = Object.keys(game.currentRound.votes).length;
    if (totalVotes === game.players.length) revealResults(gameCode);
  });

  socket.on("submitTieVote", ({ gameCode, votedPlayerId }) => {
    const game = games[gameCode];
    if (
      !game ||
      game.gameState !== "tie-break" ||
      game.currentRound.tieBreakVotes[socket.id]
    )
      return;
    game.currentRound.tieBreakVotes[socket.id] = votedPlayerId;

    const voters = game.players.filter(
      (p) => !game.currentRound.tieCandidates.includes(p.id)
    );
    let expectedVotes = voters.length;
    if (voters.length % 2 === 0 && voters.length > 0) expectedVotes--;

    if (Object.keys(game.currentRound.tieBreakVotes).length === expectedVotes) {
      revealResults(gameCode, true); // Process as a tie-break result
    }
  });

  socket.on("endGame", (gameCode) => {
    const game = games[gameCode];
    if (game && game.adminId === socket.id) {
      io.to(gameCode).emit("gameOver", { players: game.players });
      delete games[gameCode];
    }
  });

  // ... (disconnect logic remains similar)
  socket.on("disconnect", () => {
    for (const gameCode in games) {
      const game = games[gameCode];
      const playerIndex = game.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        const leavingPlayer = game.players[playerIndex];
        game.players.splice(playerIndex, 1);
        socket.leave(gameCode);

        if (game.players.length === 0) {
          delete games[gameCode];
        } else if (leavingPlayer.isAdmin) {
          io.to(gameCode).emit("gameOver", {
            players: game.players,
            customMessage: "המנהל עזב, המשחק הסתיים.",
          });
          delete games[gameCode];
        } else {
          io.to(gameCode).emit("updatePlayerList", game.players);
        }
        break;
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is live and running on port ${PORT}`);
});
