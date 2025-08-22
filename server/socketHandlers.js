// קובץ מטפלי האירועים - מנהל את כל התקשורת עם הלקוחות

const gameLogic = require("./gameLogic");

// פונקציה ראשית להגדרת כל מטפלי האירועים
function setupSocketHandlers(io) {
  // טוענים את כל הקטגוריות בהפעלת השרת
  const allCategoriesForClient = gameLogic.loadWordCategories();

  // מאזינים לחיבורים חדשים של משתמשים
  io.on("connection", (socket) => {
    // מדפיסים הודעה על חיבור חדש
    console.log(`🔌 New user connected: ${socket.id}`);

    // שולחים למשתמש את רשימת האווטרים הזמינים
    socket.emit(
      "avatarList",
      gameLogic.AVATARS_CONFIG.map((a) => a.file)
    );

    // מטפל ביצירת משחק חדש
    socket.on("createGame", ({ name, requestedAvatarFile }) => {
      try {
        // יוצרים משחק חדש עם הנתונים שהתקבלו
        const game = gameLogic.createGame(
          socket.id,
          name,
          requestedAvatarFile,
          io
        );
        // מוצאים את קוד המשחק שנוצר
        const gameCode = Object.keys(gameLogic.games).find(
          (code) => gameLogic.games[code] === game
        );

        // מצרפים את המשתמש לחדר המשחק
        socket.join(gameCode);

        // שולחים למשתמש אישור על יצירת המשחק
        socket.emit("gameCreated", {
          gameCode,
          players: game.players,
          settings: game.settings,
          allCategories: allCategoriesForClient,
        });

        // מדפיסים הודעה על יצירת המשחק
        console.log(`🎮 Game ${gameCode} created by ${name}`);
      } catch (error) {
        // טיפול בשגיאות
        console.error("Error creating game:", error);
        socket.emit("errorMsg", "שגיאה ביצירת המשחק. נסה שוב.");
      }
    });

    // מטפל בבדיקת תקינות קוד משחק
    socket.on("checkGameCode", (gameCode) => {
      try {
        // בודקים אם המשחק קיים
        const game = gameLogic.games[gameCode];
        if (game) {
          // שולחים תשובה שהקוד תקין עם אווטר
          if (game.players.length < 6) {
            // בוחרים אווטר פנוי עבור השחקן החדש
            const usedAvatarFiles = game.players.map((p) => p.avatar.file);
            const availableAvatars = gameLogic.AVATARS_CONFIG.filter(
              (a) => !usedAvatarFiles.includes(a.file)
            );
            // אם יש אווטרים פנויים בוחרים אקראי מהם
            const selectedAvatar =
              availableAvatars.length > 0
                ? availableAvatars[
                    Math.floor(Math.random() * availableAvatars.length)
                  ]
                : gameLogic.AVATARS_CONFIG[
                    Math.floor(Math.random() * gameLogic.AVATARS_CONFIG.length)
                  ];

            // בודקים אם המשחק במהלך סבב פעיל
            const gameInProgress =
              game.gameState === "in-game" ||
              (game.currentRound && !game.currentRound.revealed);

            // שולחים אישור על תקינות הקוד
            socket.emit("gameCodeValid", {
              gameInProgress,
              selectedAvatar: selectedAvatar,
            });
          } else {
            // המשחק מלא - שולחים הודעת שגיאה
            socket.emit("errorMsg", "זה לא אישי, אבל אין מקום בחדר בשבילך");
          }
        } else {
          // הקוד לא קיים - שולחים הודעת שגיאה
          socket.emit(
            "errorMsg",
            "האממממ אנחנו לא מכירים את הקוד הזה. נסה שוב."
          );
        }
      } catch (error) {
        // טיפול בשגיאות בדיקת הקוד
        console.error("Error checking game code:", error);
        socket.emit("errorMsg", "שגיאה בבדיקת קוד המשחק. נסה שוב.");
      }
    });

    // מטפל בהצטרפות למשחק קיים
    socket.on("joinGame", ({ gameCode, name, requestedAvatarFile }) => {
      try {
        // מנסים להצטרף למשחק
        const result = gameLogic.joinGame(
          gameCode,
          socket.id,
          name,
          requestedAvatarFile
        );

        // בודקים אם ההצטרפות נכשלה
        if (!result.success) {
          // שולחים הודעת שגיאה מתאימה
          if (result.type === "nameTaken") {
            socket.emit("nameTakenError", result.error);
          } else {
            socket.emit("errorMsg", result.error);
          }
          return;
        }

        // מצרפים את השחקן לחדר המשחק
        socket.join(gameCode);

        // בודקים איך להגיב לפי סוג ההצטרפות
        if (result.type === "waiting") {
          // שחקן ממתין לסיום סבב
          socket.emit("joinedMidGame", {
            message: "תכף נצרף אותך למשחק! אנא המתן לסיום הסבב.",
          });
        } else if (result.type === "rejoined" && result.waitingForRound) {
          // שחקן חוזר שצריך להמתין
          socket.emit("joinedMidGame", {
            message: "תכף נצרף אותך למשחק! אנא המתן לסיום הסבב.",
            players: gameLogic.games[gameCode].players,
          });
        } else {
          // הצטרפות רגילה למשחק
          const game = gameLogic.games[gameCode];
          socket.emit("joinedSuccess", {
            players: game.players,
            settings: game.settings,
            gameState: game.gameState,
          });
          // מעדכנים את כל השחקנים על השחקן החדש
          io.to(gameCode).emit("updatePlayerList", game.players);
        }

        // מדפיסים הודעה על הצטרפות מוצלחת
        console.log(`👤 Player "${name}" joined game ${gameCode}`);
      } catch (error) {
        // טיפול בשגיאות הצטרפות
        console.error("Error joining game:", error);
        socket.emit("errorMsg", "שגיאה בהצטרפות למשחק. נסה שוב.");
      }
    });

    // מטפל בהתחלת משחק חדש
    socket.on("startGame", (gameCode) => {
      try {
        // בודקים שהמשחק קיים ושזה המנהל שמבקש
        const game = gameLogic.games[gameCode];
        if (!game || game.adminId !== socket.id) return;

        // בודקים שיש מספיק שחקנים
        if (game.players.length < 3) {
          return; // המידע שהממשק לא אמור לאפשר את זה
        }

        // בודקים שיש קטגוריות מופעלות
        if (game.settings.enabledCategories.length === 0) {
          return io
            .to(socket.id)
            .emit("errorMsg", "חובה לבחור לפחות קטגוריית מילים אחת בהגדרות.");
        }

        gameLogic.startNewRound(gameCode, io);
        console.log(`🚀 Game ${gameCode} started by admin`);
      } catch (error) {
        console.error("Error starting game:", error);
        socket.emit("errorMsg", "שגיאה בהתחלת המשחק. נסה שוב.");
      }
    });

    // Skip word handler
    socket.on("skipWord", (gameCode) => {
      try {
        const success = gameLogic.skipWord(gameCode, socket.id, io);
        if (success) {
          console.log(`⏭️ Word skipped in game ${gameCode}`);
        }
      } catch (error) {
        console.error("Error skipping word:", error);
      }
    });

    // Timer ended handler
    socket.on("timerEnded", (gameCode) => {
      try {
        const game = gameLogic.games[gameCode];
        if (game && game.gameState === "in-game") {
          console.log(`[Game ${gameCode}] Timer ended. Starting vote.`);
          io.to(gameCode).emit("startVoting", game.players);
        }
      } catch (error) {
        console.error("Error handling timer end:", error);
      }
    });

    // Player vote handler
    socket.on("playerVote", ({ gameCode, votedForId }) => {
      try {
        const success = gameLogic.processVote(
          gameCode,
          socket.id,
          votedForId,
          io
        );
        if (success) {
          console.log(`🗳️ Voting completed for game ${gameCode}`);
        }
      } catch (error) {
        console.error("Error processing vote:", error);
      }
    });

    // End game handler
    socket.on("endGame", (gameCode) => {
      try {
        const game = gameLogic.games[gameCode];
        if (game && game.adminId === socket.id) {
          gameLogic.endGame(gameCode, io);
          console.log(`🏁 Game ${gameCode} ended by admin`);
        }
      } catch (error) {
        console.error("Error ending game:", error);
      }
    });

    // Admin leaving handler
    socket.on("adminLeaving", (gameCode) => {
      try {
        const success = gameLogic.handleAdminLeaving(gameCode, socket.id, io);
        if (success) {
          console.log(`👑 Admin left game ${gameCode} voluntarily`);
        }
      } catch (error) {
        console.error("Error handling admin leaving:", error);
      }
    });

    // Rejoin game handler
    socket.on("rejoinGame", ({ gameCode, name }) => {
      try {
        console.log(
          `🔄 Player "${name}" attempting to rejoin game ${gameCode}`
        );
        const result = gameLogic.attemptRejoin(gameCode, socket.id, name);

        if (!result.success) {
          socket.emit("errorMsg", result.error);
          return;
        }

        socket.join(gameCode);

        if (result.type === "midGame") {
          socket.emit("joinedMidGame", {
            message: result.message,
            players: result.players,
          });
        } else {
          socket.emit("joinedSuccess", {
            players: result.players,
            settings: result.settings,
            gameState: result.gameState,
          });
          io.to(gameCode).emit("updatePlayerList", result.players);
        }

        console.log(
          `✅ Player "${name}" successfully rejoined game ${gameCode}`
        );
      } catch (error) {
        console.error("Error rejoining game:", error);
        socket.emit("errorMsg", "שגיאה בחזרה למשחק. נסה שוב.");
      }
    });

    // Update game settings handler
    socket.on("updateGameSettings", (gameCode, newSettings) => {
      try {
        const updatedSettings = gameLogic.updateGameSettings(
          gameCode,
          socket.id,
          newSettings
        );
        if (updatedSettings) {
          socket.emit("settingsUpdated", updatedSettings);
        }
      } catch (error) {
        console.error("Error updating game settings:", error);
      }
    });

    // Change settings handler (alternative naming)
    socket.on("changeSettings", ({ gameCode, settings }) => {
      try {
        const updatedSettings = gameLogic.updateGameSettings(
          gameCode,
          socket.id,
          settings
        );
        if (updatedSettings) {
          socket.emit("settingsUpdated", updatedSettings);
        }
      } catch (error) {
        console.error("Error changing settings:", error);
      }
    });

    // Disconnect handler
    socket.on("disconnect", (reason) => {
      try {
        console.log(`🔌 User disconnected: ${socket.id}, Reason: ${reason}`);

        // Find and handle disconnection from any game
        for (const gameCode in gameLogic.games) {
          const game = gameLogic.games[gameCode];
          const playerIndex = game.players.findIndex((p) => p.id === socket.id);

          if (playerIndex !== -1) {
            const player = game.players[playerIndex];
            console.log(
              `👤 Player "${player.name}" disconnected from game ${gameCode}`
            );
            console.log(`📊 Game state before disconnect: ${game.gameState}`);
            console.log(`👥 Players remaining: ${game.players.length - 1}`);

            gameLogic.handlePlayerDisconnect(gameCode, socket.id, io);
            break;
          }
        }
      } catch (error) {
        console.error("Error handling disconnect:", error);
      }
    });

    // Legacy vote handler (for backward compatibility)
    socket.on("vote", ({ gameCode, votedForId }) => {
      // Redirect to playerVote
      socket.emit("playerVote", { gameCode, votedForId });
    });

    // מטפל בהסרת שחקן על ידי המנהל
    socket.on("removePlayer", ({ gameCode, playerId }) => {
      try {
        const game = gameLogic.getGame(gameCode);
        if (!game) {
          socket.emit("errorMsg", "המשחק לא נמצא");
          return;
        }

        // בדיקה שהמבקש הוא המנהל
        const adminPlayer = game.players.find((p) => p.id === socket.id);
        if (!adminPlayer || !adminPlayer.isAdmin) {
          socket.emit("errorMsg", "רק המנהל יכול להסיר שחקנים");
          return;
        }

        // בדיקה שהשחקן שנבחר להסרה קיים ואינו מנהל
        const playerToRemove = game.players.find((p) => p.id === playerId);
        if (!playerToRemove) {
          socket.emit("errorMsg", "שחקן לא נמצא");
          return;
        }

        if (playerToRemove.isAdmin) {
          socket.emit("errorMsg", "לא ניתן להסיר את המנהל");
          return;
        }

        // הסרת השחקן מהמשחק
        game.players = game.players.filter((p) => p.id !== playerId);

        // שליחת עדכון לכל השחקנים
        io.to(gameCode).emit("updatePlayerList", game.players);

        // הוצאת השחקן שהוסר מהחדר
        const socketToRemove = io.sockets.sockets.get(playerId);
        if (socketToRemove) {
          socketToRemove.leave(gameCode);
          socketToRemove.emit("removedFromGame", "הוסרת מהמשחק על ידי המנהל");
        }

        console.log(
          `🚫 Player ${playerToRemove.name} removed from game ${gameCode} by admin`
        );
      } catch (error) {
        console.error("Error removing player:", error);
        socket.emit("errorMsg", "שגיאה בהסרת השחקן");
      }
    });

    // Error handler for socket events
    socket.on("error", (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  // Global error handler
  io.on("error", (error) => {
    console.error("Socket.IO error:", error);
  });

  console.log("🔌 Socket handlers initialized");
}

module.exports = { setupSocketHandlers };
