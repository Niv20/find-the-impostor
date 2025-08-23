// קובץ לוגיקת המשחק - מכיל את כל החוקים והפונקציות של המשחק

const fs = require("fs");
const path = require("path");

// הגדרת דמויות האווטרים והצבעים שלהם לזיהוי ויזואלי
const AVATARS_CONFIG = [
  { file: "avatar1.png", color: "#f39c12" }, // כתום בוהק
  { file: "avatar2.png", color: "#3498db" }, // תכלת
  { file: "avatar3.png", color: "#e84393" }, // ורוד עז
  { file: "avatar4.png", color: "#e74c3c" }, // אדום חזק
  { file: "avatar5.png", color: "#f1c40f" }, // צהוב שמשי
  { file: "avatar6.png", color: "#2ecc71" }, // ירוק חי
];

// משתנים לניהול מצב המשחקים ברמת השרת
const games = {}; // כל המשחקים הפעילים עם מידע השחקנים והמצב
const gameTimers = {}; // הטיימרים של כל משחק לניהול תזמונים

// טעינת מילים מקבצי JSON בתיקיית המידע
const wordCategories = {}; // כל הקטגוריות והמילים שטענו מהדיסק
const dataPath = path.join(__dirname, "..", "data");

// פונקציה לטעינת כל הקטגוריות והמילים מתיקיית המידע
function loadWordCategories() {
  try {
    // עוברים על כל הקבצים בתיקיית המידע ומטענים אותם
    fs.readdirSync(dataPath).forEach((file) => {
      // בודקים שזה קובץ JSON של מילים
      if (file.endsWith(".json")) {
        // קוראים את הקובץ ומחזירים את המידע בתור קטגוריה
        const filePath = path.join(dataPath, file);
        const categoryData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        // שומרים את הקטגוריה עם השם שלה
        const categoryKey = path.basename(file, ".json");
        wordCategories[categoryKey] = categoryData;
      }
    });

    // יוצרים רשימה פשוטה של הקטגוריות לשליחה ללקוח
    const allCategoriesForClient = Object.entries(wordCategories).map(
      ([id, data]) => ({
        id,
        name: data.categoryName,
      })
    );

    // מדפיסים הודעה על הצלחת הטעינה
    console.log(
      `✅ Loaded ${Object.keys(wordCategories).length} word categories.`
    );
    return allCategoriesForClient;
  } catch (error) {
    // טיפול בשגיאות אם הטעינה נכשלה
    console.error("Error loading word categories:", error);
    return [];
  }
}

// פונקציות עזר קטנות

// יצירת קוד משחק ייחודי מארבע ספרות
function generateGameCode() {
  let code;
  do {
    // יוצרים מספר אקראי בין אלף לתשעת אלפים
    code = Math.floor(1000 + Math.random() * 9000).toString();
    // ממשיכים עד שנמצא קוד שלא קיים
  } while (games[code]);
  return code;
}

// מחזירים מידע על אווטר לפי שם הקובץ
function getAvatarByFile(fileName) {
  // מחפשים את האווטר הרצוי או מחזירים את הראשון
  return AVATARS_CONFIG.find((a) => a.file === fileName) || AVATARS_CONFIG[0];
}

// בוחרים אווטר פנוי עבור שחקן חדש
function getAvailableAvatar(game) {
  // מוצאים איזה אווטרים כבר בשימוש
  const usedAvatars = game.players.map((p) => p.avatar.file);
  // מוצאים את האווטרים הפנויים
  const availableAvatars = AVATARS_CONFIG.filter(
    (a) => !usedAvatars.includes(a.file)
  );
  // אם אין פנויים בוחרים אקראי כלשהו
  if (availableAvatars.length === 0) {
    return AVATARS_CONFIG[Math.floor(Math.random() * AVATARS_CONFIG.length)];
  }
  // אחרת בוחרים אקראי מהפנויים
  return availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
}

// פונקציות ניהול המשחק

// יצירת משחק חדש עם המנהל הראשון
function createGame(adminId, adminName, adminAvatarFile, io) {
  // יוצרים קוד ייחודי למשחק
  const gameCode = generateGameCode();
  // מוצאים את האווטר שהמנהל בחר
  const adminAvatar = getAvatarByFile(adminAvatarFile);

  // יוצרים את המשחק עם ההגדרות הבסיסיות
  games[gameCode] = {
    adminId: adminId, // מזהה המנהל
    players: [
      {
        id: adminId,
        name: adminName,
        score: 0, // ניקוד התחלתי
        isAdmin: true, // סימון שזה המנהל
        avatar: adminAvatar,
      },
    ],
    settings: {
      discussionTime: 60, // זמן ברירת המחדל לדיון
      showCategoryToImpostor: true, // האם להראות קטגוריה למתחזה
      enabledCategories: Object.keys(wordCategories), // כל הקטגוריות פעילות
    },
    gameState: "lobby", // מצב המשחק כרגע
    currentRound: null, // אין סבב פעיל עדיין
  };

  // מדפיסים הודעה על יצירת המשחק
  console.log(`🎮 Game ${gameCode} created by ${adminName}`);
  return games[gameCode];
}

function joinGame(gameCode, playerId, playerName, avatarFile) {
  // Normalize name: trim & collapse internal multiple spaces
  if (typeof playerName === "string") {
    playerName = playerName.replace(/\s+/g, " ").trim();
  }
  const game = games[gameCode];
  if (!game)
    return { success: false, error: "המשחק לא נמצא. בדוק את הקוד שהזנת." };

  if (game.players.length >= 6) {
    return { success: false, error: "זה לא אישי, אבל אין מקום בחדר בשבילך" };
  }

  // Check for existing disconnected player - they can rejoin with same name
  if (game.disconnectedPlayers && game.disconnectedPlayers[playerName]) {
    const disconnectedPlayer = game.disconnectedPlayers[playerName];
    const returnedPlayer = {
      id: playerId,
      name: playerName,
      score: disconnectedPlayer.score,
      isAdmin: false,
      avatar: disconnectedPlayer.avatar,
    };

    delete game.disconnectedPlayers[playerName];

    if (
      game.gameState === "in-game" ||
      (game.currentRound && !game.currentRound.revealed)
    ) {
      if (!game.waitingPlayers) game.waitingPlayers = [];
      game.waitingPlayers.push(returnedPlayer);
      return {
        success: true,
        type: "rejoined",
        player: returnedPlayer,
        waitingForRound: true,
      };
    } else {
      game.players.push(returnedPlayer);
      return {
        success: true,
        type: "rejoined",
        player: returnedPlayer,
        waitingForRound: false,
      };
    }
  }

  // Check for duplicate names (case & space normalized) - exclude current disconnected name
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const normalizedName = norm(playerName);

  // Check active players
  const isNameTakenActive = game.players.some(
    (p) => norm(p.name) === normalizedName
  );

  // Check waiting players
  const isNameTakenWaiting =
    game.waitingPlayers &&
    game.waitingPlayers.some((p) => norm(p.name) === normalizedName);

  if (isNameTakenActive || isNameTakenWaiting) {
    return {
      success: false,
      error: "כבר יש מישהו בחדר עם השם הזה. נסה שם אחר.",
      type: "nameTaken",
    };
  }

  // Select available avatar
  const usedAvatarFiles = game.players.map((p) => p.avatar.file);
  let playerAvatar;
  if (avatarFile && !usedAvatarFiles.includes(avatarFile)) {
    playerAvatar = getAvatarByFile(avatarFile);
  } else {
    const availableAvatars = AVATARS_CONFIG.filter(
      (a) => !usedAvatarFiles.includes(a.file)
    );
    playerAvatar =
      availableAvatars.length > 0
        ? availableAvatars[Math.floor(Math.random() * availableAvatars.length)]
        : AVATARS_CONFIG[Math.floor(Math.random() * AVATARS_CONFIG.length)];
  }

  // Check if game is in progress
  if (
    game.gameState === "in-game" ||
    (game.currentRound &&
      !game.currentRound.revealed &&
      game.gameState !== "lobby")
  ) {
    if (!game.waitingPlayers) game.waitingPlayers = [];

    // Double-check before adding to waiting list
    const waitingNameCheck = game.waitingPlayers.some(
      (p) => norm(p.name) === normalizedName
    );
    if (waitingNameCheck) {
      return {
        success: false,
        error: "כבר יש מישהו בחדר עם השם הזה. נסה שם אחר.",
        type: "nameTaken",
      };
    }

    const waitingPlayer = {
      id: playerId,
      name: playerName,
      score: 0,
      isAdmin: false,
      avatar: playerAvatar,
    };

    game.waitingPlayers.push(waitingPlayer);
    return { success: true, type: "waiting", player: waitingPlayer };
  } else {
    // Double-check before adding to game to prevent duplicate names
    const finalNameCheck = game.players.some(
      (p) => norm(p.name) === normalizedName
    );
    if (finalNameCheck) {
      return {
        success: false,
        error: "כבר יש מישהו בחדר עם השם הזה. נסה שם אחר.",
        type: "nameTaken",
      };
    }

    const newPlayer = {
      id: playerId,
      name: playerName,
      score: 0,
      isAdmin: false,
      avatar: playerAvatar,
    };

    game.players.push(newPlayer);
    return { success: true, type: "joined", player: newPlayer };
  }
}

function startNewRound(gameCode, io) {
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

  // Clear previous timer if exists
  if (gameTimers[gameCode]) {
    clearInterval(gameTimers[gameCode].interval);
  }

  game.currentRound = {
    word: randomWord,
    categoryName: category.categoryName,
    impostorId: impostor.id,
    votes: {},
    revealed: false,
    startTime: Date.now(),
    timerDuration: game.settings.discussionTime,
  };

  game.gameState = "in-game";

  // Set up new server timer
  let timeLeft = game.settings.discussionTime;
  gameTimers[gameCode] = {
    interval: setInterval(() => {
      timeLeft--;
      io.to(gameCode).emit("timerUpdate", timeLeft);

      if (timeLeft <= 0) {
        clearInterval(gameTimers[gameCode].interval);
        delete gameTimers[gameCode];
        io.to(gameCode).emit("startVoting", game.players);
      }
    }, 1000),
    timeLeft: timeLeft,
  };

  // Send round data to each player
  game.players.forEach((player) => {
    const isImpostor = player.id === impostor.id;
    io.to(player.id).emit("roundStart", {
      isImpostor,
      word: isImpostor ? null : randomWord,
      category: game.settings.showCategoryToImpostor
        ? category.categoryName
        : null,
      timer: game.settings.discussionTime,
      timeLeft: timeLeft,
      startTime: game.currentRound.startTime,
      showCategory: game.settings.showCategoryToImpostor,
    });
  });

  console.log(
    `[Game ${gameCode}] Round started. Word: ${randomWord}, Impostor: ${impostor.name}`
  );
}

function processVote(gameCode, voterId, votedForId, io) {
  const game = games[gameCode];
  if (
    !game ||
    !game.currentRound ||
    game.currentRound.votes[voterId] ||
    game.currentRound.revealed
  ) {
    return false;
  }

  game.currentRound.votes[voterId] = votedForId;
  const totalVotes = Object.keys(game.currentRound.votes).length;

  // Check if everyone has voted
  if (totalVotes === game.players.length) {
    revealResults(gameCode, io);
    return true;
  }

  return false;
}

function revealResults(gameCode, io) {
  const game = games[gameCode];
  if (!game || !game.currentRound || game.currentRound.revealed) return;

  game.currentRound.revealed = true;
  game.gameState = "lobby"; // Game returns to a lobby-like state

  // Join waiting players to the game
  if (game.waitingPlayers && game.waitingPlayers.length > 0) {
    game.players.push(...game.waitingPlayers);

    // Send update to waiting players
    game.waitingPlayers.forEach((player) => {
      io.to(player.id).emit("joinedSuccess", {
        players: game.players,
        settings: game.settings,
      });
    });

    // Update all players about new joiners
    io.to(gameCode).emit("updatePlayerList", game.players);

    // Reset waiting players list
    game.waitingPlayers = [];
  }

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

  // List of players who participated in the current round
  const roundParticipants = Object.keys(game.currentRound.votes);

  // Update scores
  if (correctlyGuessed) {
    game.players.forEach((p) => {
      // Only players who participated in voting get points
      if (p.id !== impostorId && roundParticipants.includes(p.id)) {
        p.score += 1;
      }
    });
  } else {
    // Impostor gets points only if still in game
    if (impostor && game.players.find((p) => p.id === impostorId)) {
      impostor.score += 2;
    }
  }

  io.to(gameCode).emit("roundResult", {
    correctlyGuessed,
    impostor,
    word,
    players: game.players,
  });

  console.log(
    `[Game ${gameCode}] Round result: ${
      correctlyGuessed ? "Impostor caught" : "Impostor escaped"
    }`
  );
}

function endGame(gameCode, io) {
  const game = games[gameCode];
  if (!game) return false;

  // Clear timer if exists
  if (gameTimers[gameCode]) {
    clearInterval(gameTimers[gameCode].interval);
    delete gameTimers[gameCode];
  }

  io.to(gameCode).emit("gameEnded", game.players);
  delete games[gameCode];

  console.log(`[Game ${gameCode}] Game ended`);
  return true;
}

function updateGameSettings(gameCode, playerId, newSettings) {
  const game = games[gameCode];
  if (!game) return false;

  const player = game.players.find((p) => p.id === playerId);
  if (!player || !player.isAdmin) return false;

  console.log(
    `⚙️ Admin ${player.name} updated game settings for ${gameCode}:`,
    newSettings
  );

  game.settings = {
    ...game.settings,
    ...newSettings,
  };

  return game.settings;
}

function skipWord(gameCode, playerId, io) {
  const game = games[gameCode];
  if (!game) return false;

  const currentAdmin = game.players.find((p) => p.isAdmin);
  if (!currentAdmin || currentAdmin.id !== playerId) return false;

  io.to(gameCode).emit("wordSkipped", {
    adminName: currentAdmin.name,
  });

  // Stop current timer
  if (gameTimers[gameCode]) {
    clearInterval(gameTimers[gameCode].interval);
    delete gameTimers[gameCode];
  }

  // Start new round
  startNewRound(gameCode, io);
  return true;
}

function handlePlayerDisconnect(gameCode, playerId, io) {
  const game = games[gameCode];
  if (!game) return;

  const playerIndex = game.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return;

  const leavingPlayer = game.players[playerIndex];
  game.players.splice(playerIndex, 1);

  // Save disconnected player info
  if (!game.disconnectedPlayers) {
    game.disconnectedPlayers = {};
  }
  game.disconnectedPlayers[leavingPlayer.name] = {
    score: leavingPlayer.score,
    avatar: leavingPlayer.avatar,
  };

  console.log(`🎮 Game ${gameCode} status after disconnect:`);
  console.log(`👥 Players remaining: ${game.players.length}`);
  console.log(`🎯 Game state: ${game.gameState}`);

  // Send disconnection notification
  io.to(gameCode).emit("playerDisconnected", {
    player: leavingPlayer,
    remainingPlayers: game.players.length,
  });

  if (game.players.length === 0) {
    console.log(`[Game ${gameCode}] Game empty, deleting.`);
    if (gameTimers[gameCode]) {
      clearInterval(gameTimers[gameCode].interval);
      delete gameTimers[gameCode];
    }
    delete games[gameCode];
  } else if (game.players.length < 3) {
    // If less than 3 players remain, end the game
    console.log(
      `[Game ${gameCode}] Less than 3 players remaining, ending game.`
    );

    if (gameTimers[gameCode]) {
      clearInterval(gameTimers[gameCode].interval);
      delete gameTimers[gameCode];
    }

    io.to(gameCode).emit("gameEnded", {
      players: game.players,
      reason: "notEnoughPlayers",
    });

    delete games[gameCode];
  } else if (leavingPlayer.isAdmin) {
    // Transfer admin role to next player
    const newAdmin = game.players[0];
    if (newAdmin) {
      newAdmin.isAdmin = true;
      game.adminId = newAdmin.id;
      console.log(
        `[Game ${gameCode}] Admin role transferred to ${newAdmin.name}`
      );

      // Send message about admin role transfer
      io.to(gameCode).emit("adminChanged", {
        newAdminId: newAdmin.id,
        newAdminName: newAdmin.name,
        players: game.players,
        settings: game.settings,
        allCategories: loadWordCategories(),
      });
    } else {
      // If no other players, close the game
      io.to(gameCode).emit("gameEnded", {
        players: game.players,
        reason: "admin_left_no_players",
      });
      delete games[gameCode];
    }
  } else {
    io.to(gameCode).emit("updatePlayerList", game.players);

    if (
      game.gameState === "in-game" &&
      game.currentRound &&
      !game.currentRound.revealed
    ) {
      if (game.players.length < 2) {
        io.to(gameCode).emit("gameEnded", "אין מספיק שחקנים כדי להמשיך.");
        if (gameTimers[gameCode]) {
          clearInterval(gameTimers[gameCode].interval);
          delete gameTimers[gameCode];
        }
        delete games[gameCode];
      } else if (game.currentRound.impostorId === playerId) {
        // Impostor disconnected - stop the round
        if (gameTimers[gameCode]) {
          clearInterval(gameTimers[gameCode].interval);
          delete gameTimers[gameCode];
        }
        io.to(gameCode).emit("roundResult", {
          correctlyGuessed: true,
          impostor: leavingPlayer,
          word: game.currentRound.word,
          players: game.players,
          customMessage: `${leavingPlayer.name} (המתחזה) התנתק מהמשחק!`,
          showAdminControls: true,
        });
        game.gameState = "lobby";
      } else {
        // Regular player disconnected - if in voting, restart voting
        if (Object.keys(game.currentRound.votes || {}).length > 0) {
          // Clear existing votes
          game.currentRound.votes = {};
          // Start new voting
          io.to(gameCode).emit("startVoting", game.players, true);
        }
        io.to(gameCode).emit("updatePlayerList", game.players);
      }
    }
  }
}

function handleAdminLeaving(gameCode, adminId, io) {
  const game = games[gameCode];
  if (!game) return false;

  const adminIndex = game.players.findIndex(
    (p) => p.id === adminId && p.isAdmin
  );
  if (adminIndex === -1) return false;

  const leavingAdmin = game.players[adminIndex];
  game.players.splice(adminIndex, 1);

  // Save admin info
  if (!game.disconnectedPlayers) {
    game.disconnectedPlayers = {};
  }
  game.disconnectedPlayers[leavingAdmin.name] = {
    score: leavingAdmin.score,
    avatar: leavingAdmin.avatar,
  };

  console.log(
    `🎮 Admin "${leavingAdmin.name}" left game ${gameCode} voluntarily`
  );
  console.log(`👥 Players remaining: ${game.players.length}`);

  if (game.players.length === 0) {
    console.log(`[Game ${gameCode}] Game empty after admin left, deleting.`);
    if (gameTimers[gameCode]) {
      clearInterval(gameTimers[gameCode].interval);
      delete gameTimers[gameCode];
    }
    delete games[gameCode];
  } else if (game.players.length < 3) {
    console.log(
      `[Game ${gameCode}] Less than 3 players after admin left, ending game.`
    );

    if (gameTimers[gameCode]) {
      clearInterval(gameTimers[gameCode].interval);
      delete gameTimers[gameCode];
    }

    io.to(gameCode).emit("gameEnded", {
      players: game.players,
      reason: "notEnoughPlayers",
    });

    delete games[gameCode];
  } else {
    // Transfer admin role
    const newAdmin = game.players[0];
    newAdmin.isAdmin = true;
    game.adminId = newAdmin.id;

    console.log(
      `[Game ${gameCode}] Admin role transferred to ${newAdmin.name}`
    );

    io.to(gameCode).emit("adminChanged", {
      newAdminId: newAdmin.id,
      newAdminName: newAdmin.name,
      players: game.players,
      settings: game.settings,
      allCategories: loadWordCategories(),
    });
  }

  return true;
}

function attemptRejoin(gameCode, playerId, playerName) {
  const game = games[gameCode];
  if (!game) return { success: false, error: "המשחק לא נמצא יותר" };

  // Check if player was previously disconnected
  if (game.disconnectedPlayers && game.disconnectedPlayers[playerName]) {
    const disconnectedPlayer = game.disconnectedPlayers[playerName];
    const returnedPlayer = {
      id: playerId,
      name: playerName,
      score: disconnectedPlayer.score,
      isAdmin: false,
      avatar: disconnectedPlayer.avatar,
    };

    delete game.disconnectedPlayers[playerName];

    // Handle rejoin based on game state
    if (
      game.gameState === "in-game" &&
      game.currentRound &&
      !game.currentRound.revealed
    ) {
      if (!game.waitingPlayers) game.waitingPlayers = [];
      game.waitingPlayers.push(returnedPlayer);
      return {
        success: true,
        type: "midGame",
        message: "תכף נצרף אותך למשחק! אנא המתן לסיום הסבב.",
        players: game.players,
      };
    } else {
      game.players.push(returnedPlayer);
      return {
        success: true,
        type: "lobby",
        players: game.players,
        settings: game.settings,
        gameState: game.gameState,
      };
    }
  } else {
    return { success: false, error: "לא נמצא שחקן מנותק עם השם הזה" };
  }
}

// פונקציה לקבלת משחק לפי קוד
function getGame(gameCode) {
  return games[gameCode] || null;
}

// Export functions and data
module.exports = {
  AVATARS_CONFIG,
  games,
  gameTimers,
  wordCategories,
  loadWordCategories,
  generateGameCode,
  getAvatarByFile,
  getAvailableAvatar,
  createGame,
  joinGame,
  startNewRound,
  processVote,
  revealResults,
  endGame,
  updateGameSettings,
  skipWord,
  handlePlayerDisconnect,
  handleAdminLeaving,
  getGame, // הוספת הפונקציה החדשה
  attemptRejoin,
};
