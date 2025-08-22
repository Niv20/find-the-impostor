// קובץ ניהול המשחק - מתאם בין הרשת והממשק למשחק

class GameManager {
  // יוצר מנהל משחק עם חיבור לרשת ולממשק
  constructor(networkManager, uiManager) {
    this.network = networkManager; // מנהל החיבורים
    this.ui = uiManager; // מנהל הממשק

    // מצב המשחק הנוכחי - כל המידע החשוב
    this.gameState = {
      myId: null, // מזהה השחקן הנוכחי
      myName: "", // שם השחקן
      gameCode: "", // קוד המשחק
      isAdmin: false, // האם השחקן הוא המנהל
      isCreatingGame: false, // האם במצב יצירת משחק
      chosenAvatarFile: null, // האווטר שנבחר
      allCategories: [], // כל הקטגוריות הזמינות
      enabledCategories: [], // הקטגוריות המופעלות
    };

    // הפיכת מצב המשחק לזמין בכל האפליקציה
    window.gameState = this.gameState;

    // משתנים נוספים לניהול הזמן והאווטרים
    this.roundTimerInterval = null;
    this.availableAvatars = [];

    // הגדרת מאזינים לאירועים
    this.setupSocketEventHandlers();
    this.setupUIEventHandlers();
  }

  // הגדרת כל המאזינים לאירועי רשת
  setupSocketEventHandlers() {
    // קבלת רשימת האווטרים הזמינים
    this.network.on("avatarList", (avatars) => {
      this.availableAvatars = avatars;
    });

    // טיפול ביצירה והצטרפות למשחקים
    this.network.on("gameCodeValid", (data) => {
      // קוד המשחק תקין - עוברים להזנת שם
      this.gameState.isCreatingGame = false;
      this.gameState.chosenAvatarFile = data.selectedAvatar.file;
      this.ui.showNameEntryScreen(data?.gameInProgress);
    });

    this.network.on("gameCreated", (data) => {
      // משחק נוצר בהצלחה - שומרים נתונים ועוברים לרובי
      this.gameState.gameCode = data.gameCode;
      this.gameState.isAdmin = true;
      this.gameState.allCategories = data.allCategories;
      this.gameState.enabledCategories = data.settings.enabledCategories;

      // מעדכנים את התצוגה
      this.updateGameCodeDisplay();
      this.ui.updatePlayerList(data.players);
      this.ui.populateCategorySettings(
        this.gameState.allCategories,
        this.gameState.enabledCategories
      );
      this.ui.showScreen("lobby");
    });

    this.network.on("joinedSuccess", (data) => {
      // הצטרפנו בהצלחה כשחקן רגיל - מסתירים כפתורי מנהל
      this.ui.adminControls.classList.add("hidden");
      this.ui.settingsBtn.classList.add("hidden");
      this.ui.gameCodeDisplay.classList.add("hidden");

      // מסתירים הודעת שיתוף הקוד
      if (this.ui.shareCodeText) {
        this.ui.shareCodeText.classList.add("hidden");
      }

      // מעדכנים רשימת שחקנים ועוברים לרובי
      this.ui.updatePlayerList(data.players);
      this.ui.showScreen("lobby");
    });

    this.network.on("joinedMidGame", (data) => {
      // הצטרפנו באמצע משחק - ממתינים לסיום הסבב
      this.ui.screens.waiting.querySelector(".waiting-message").textContent =
        data.message;
      this.ui.showScreen("waiting");
    });

    // ניהול שחקנים והצגת רשימה מעודכנת
    this.network.on("updatePlayerList", (players) => {
      // בדיקה חיונית - אם נשארו פחות משלושה שחקנים במהלך משחק פעיל
      // נצטרך לסיים את המשחק כי אי אפשר להמשיך
      if (
        players.length < 3 &&
        this.ui.currentScreen !== "home" &&
        this.ui.currentScreen !== "nameEntry" &&
        this.ui.currentScreen !== "endGame" &&
        this.ui.currentScreen !== "lobby"
      ) {
        // שליחת בקשה לסיום המשחק בגלל מחסור בשחקנים
        this.network.emit(
          "endGame",
          this.gameState.gameCode,
          "not_enough_players"
        );
      }
      // עדכון הרשימה בממשק המשתמש
      this.ui.updatePlayerList(players);
    });

    // הצגת התראה כשמישהו מתנתק מהמשחק
    this.network.on("playerDisconnected", (data) => {
      Utils.showDisconnectionNotification(data.player);
    });

    // התחלת סבב חדש - קבלת המילה והגדרת המסך
    this.network.on("roundStart", (data) => {
      // אם השחקן היה במסך המתנה, מעבירים אותו למסך המשחק
      if (this.ui.currentScreen === "waiting") {
        this.ui.showScreen("game");
      }

      // הצגת מסך המשחק עם המילה או הודעת המתחזה
      this.ui.showGameScreen(data);
      // הפעלת כפתורי מנהל אם נדרש
      this.showAdminControls();
    });

    // עדכון הטיימר בזמן אמת
    this.network.on("timerUpdate", (timeLeft) => {
      this.ui.updateTimerDisplay(timeLeft);
    });

    // הודעה על דילוג על מילה על ידי המנהל
    this.network.on("wordSkipped", (data) => {
      Utils.showSkipWordNotification(data.adminName);
    });

    // התחלת שלב ההצבעה - כל השחקנים צריכים לבחור מי המתחזה
    this.network.on("startVoting", (data, resetVotes = false) => {
      if (Array.isArray(data)) {
        // הצבעה רגילה עם רשימת כל השחקנים
        this.ui.showVotingScreen(data, resetVotes);
      } else {
        // הצבעה מיוחדת במקרה של תיקו עם הגבלות על מי יכול להצביע
        this.ui.showVotingScreen(data.players, {
          canVote: data.canVote,
          isPartOfTie: data.isPartOfTie,
          excludedFromVoting: data.excludedFromVoting,
          tiePlayers: data.tiePlayers,
        });
      }
    });

    // תוצאות הסבב - האם תפסו את המתחזה או לא
    this.network.on("roundResult", (data) => {
      // שחקן שהיה במסך המתנה מקבל הודעה מיוחדת
      if (this.ui.currentScreen === "waiting") {
        const waitingMessage = document.querySelector(".waiting-message");
        waitingMessage.textContent = "הסבב הבא מתחיל ממש עכשיו!";
        return;
      }

      // הסרת מסך ההמתנה להצבעה והצגת התוצאות
      this.removeVotingOverlay();
      this.ui.showResultScreen(data);
      // הכנת כפתורי המשך משחק או סיום עבור המנהל
      this.setupResultControls(data.players);
    });

    // סיום המשחק הסופי - הצגת הניקוד הסופי והמנצחים
    this.network.on("gameEnded", (data) => {
      const players = Array.isArray(data) ? data : data.players;

      // אם השחקן הנוכחי ניצח מפעילים אפקט קונפטי
      if (window.createConfetti && Array.isArray(players)) {
        const maxScore = Math.max(...players.map((p) => p.score), 0);
        const myPlayer = players.find((p) => p.id === this.gameState.myId);
        if (myPlayer && myPlayer.score === maxScore && maxScore > 0) {
          window.createConfetti();
        }
      }

      // הצגת מסך הניקוד הסופי
      this.ui.showEndGameScreen(players);
    });

    // שינוי מנהל - כשהמנהל עוזב ועובר התפקיד לשחקן אחר
    this.network.on("adminChanged", (data) => {
      const { newAdminId, newAdminName, players, settings, allCategories } =
        data;

      // בדיקה אם אני הפכתי למנהל החדש
      if (this.gameState.myId === newAdminId) {
        this.gameState.isAdmin = true;

        if (settings) {
          this.gameState.enabledCategories = settings.enabledCategories;
        }
        if (allCategories) {
          // עדכון המידע על הקטגוריות החדשות מהמנהל החדש
          this.gameState.allCategories = allCategories;
        }

        // עדכון הממשק להציג את התפקיד החדש כמנהל
        this.ui.updateHeader();
        this.ui.refreshCurrentScreen();

        // הצגת הודעה מוקדמת למנהל החדש על התפקיד שלו
        setTimeout(() => {
          this.ui.showModalMessage(
            "המנהל יצא מהמשחק ומעכשיו אתה מנהל המשחק. אתה קובע את קצב הסבבים.",
            { okText: "הבנתי" }
          );
        }, 100);
      } else {
        // אם אני לא המנהל החדש, מוודא שאין לי הרשאות מנהל
        this.gameState.isAdmin = false;
        this.ui.updateHeader();
      }

      // עדכון רשימת השחקנים עם המנהל החדש
      this.ui.updatePlayerList(players);
    });

    // טיפול בשגיאות שונות שיכולות להתרחש

    // שגיאת שם תפוס - כבר יש מישהו עם השם הזה במשחק
    this.network.on("nameTakenError", (message) => {
      this.ui.showModalMessage(message, {
        okText: "אישור",
        onOk: () => {
          // ניקוי שדה השם ומיקוד מחדש לבחירת שם אחר
          this.ui.nameInput.value = "";
          this.ui.nameInput.focus();
          this.ui.showScreen("nameEntry");
        },
      });
    });

    // שגיאה כללית - משהו השתבש במהלך הפעולה
    this.network.on("errorMsg", (message) => {
      this.ui.showModalMessage(message, {
        okText: "אישור",
        onOk: () => {
          // ניקוי כל שדות הקוד והחזרה לתא הראשון
          if (window.inputValidator) {
            window.inputValidator.clearCodeInputs();
          } else {
            this.ui.clearCodeInputs();
          }
          this.ui.setJoinButtonState(false);
          this.ui.showScreen("home");
        },
      });
    });

    // עדכון הגדרות המשחק שהתקבל מהשרת
    this.network.on("settingsUpdated", (settings) => {
      // שמירת הקטגוריות המופעלות שהתעדכנו
      this.gameState.enabledCategories = settings.enabledCategories;
    });

    // טיפול בהסרה מהמשחק על ידי המנהל
    this.network.on("removedFromGame", (message) => {
      this.ui.showModalMessage(message, {
        okText: "הבנתי",
        onOk: () => {
          // חזרה לעמוד הבית
          this.leaveGame();
        },
      });
    });
  }

  // הגדרת מאזיני אירועי ממשק המשתמש - כפתורים ושדות טקסט
  setupUIEventHandlers() {
    // לחיצה על הלוגו בכותרת - חזרה לעמוד הבית או יציאה מהמשחק
    if (this.ui.headerLogoContainer) {
      this.ui.headerLogoContainer.addEventListener("click", () => {
        this.handleHeaderLogoClick();
      });
    }

    // כפתור יצירת משחק חדש בכותרת
    if (this.ui.headerCreateBtn) {
      this.ui.headerCreateBtn.addEventListener("click", () => {
        this.createGame();
      });
    }

    // שדות הזנת קוד המשחק מטופלים על ידי InputValidator
    // InputValidator יטפל באוטומט בולידציה ובמעבר בין שדות

    // כפתור הצטרפות למשחק אחרי הזנת הקוד
    if (this.ui.joinGameBtn) {
      this.ui.joinGameBtn.addEventListener("click", () => {
        this.joinGame();
      });
    }

    // Name input - מטופל על ידי InputValidator
    // InputValidator יטפל בולידציה ובמקש Enter

    // Submit name button
    if (this.ui.submitNameBtn) {
      this.ui.submitNameBtn.addEventListener("click", () => {
        this.submitName();
      });
    }

    // Game control buttons
    if (this.ui.startGameBtn) {
      this.ui.startGameBtn.addEventListener("click", () => {
        this.network.emit("startGame", this.gameState.gameCode);
      });
    }

    if (this.ui.nextRoundBtn) {
      this.ui.nextRoundBtn.addEventListener("click", () => {
        this.network.emit("startGame", this.gameState.gameCode);
      });
    }

    if (this.ui.endGameBtnFromResult) {
      this.ui.endGameBtnFromResult.addEventListener("click", () => {
        this.handleEndGame();
      });
    }

    if (this.ui.playAgainBtn) {
      this.ui.playAgainBtn.addEventListener("click", () => {
        window.location.reload();
      });
    }

    // Settings
    if (this.ui.settingsBtn) {
      this.ui.settingsBtn.addEventListener("click", () => {
        this.ui.settingsModal.classList.remove("hidden");
      });
    }

    // סגירת חלון ההגדרות בלחיצה על הרקע
    if (this.ui.settingsModal) {
      this.ui.settingsModal.addEventListener("click", (e) => {
        if (e.target === this.ui.settingsModal) {
          this.ui.settingsModal.classList.add("hidden");
        }
      });
    }

    // כפתורי בחירת זמן הדיון - 30, 60 או 90 שניות
    document.querySelectorAll(".timer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        // הסרת הסימון מהכפתור הקודם והוספה לכפתור החדש
        document.querySelector(".timer-btn.active").classList.remove("active");
        btn.classList.add("active");
        // שליחת ההגדרה החדשה לשרת
        this.network.emit("changeSettings", {
          gameCode: this.gameState.gameCode,
          settings: { timer: parseInt(btn.dataset.time) },
        });
      });
    });

    // כפתור הצגת קטגוריה למתחזה - האם המתחזה יראה איזו קטגוריה זה
    if (this.ui.showCategoryToggle) {
      this.ui.showCategoryToggle.addEventListener("change", (e) => {
        this.network.emit("changeSettings", {
          gameCode: this.gameState.gameCode,
          settings: { showCategory: e.target.checked },
        });
      });
    }

    // כפתור דילוג על מילה - רק למנהל, נוצר באופן דינמי במהלך המשחק
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("skip-word-btn")) {
        this.network.emit("skipWord", this.gameState.gameCode);
      }
    });
  }

  // פעולות משחק עיקריות

  // יצירת משחק חדש - המשתמש הופך למנהל
  createGame() {
    this.gameState.isCreatingGame = true;
    // בחירת אווטר אקראי והצגתו למשתמש
    this.gameState.chosenAvatarFile = Utils.showRandomAvatarPreview(
      this.availableAvatars,
      this.ui.avatarPreviewContainer
    );
    this.ui.showNameEntryScreen();
  }

  // הצטרפות למשחק קיים - איסוף הקוד ובדיקת תקינותו
  joinGame() {
    // חיבור ארבעת הספרות מהשדות לקוד אחד
    const code = window.inputValidator
      ? window.inputValidator.getCodeValue()
      : Array.from(this.ui.codeInputs)
          .map((input) => input.value)
          .join("");
    this.gameState.gameCode = code;
    // שליחת הקוד לשרת לבדיקה
    this.network.emit("checkGameCode", code);
  }

  // שליחת השם שנבחר לשרת ויצירה או הצטרפות למשחק
  submitName() {
    const name = this.ui.getNameInputValue();
    console.log("Submitting name:", name); // Debug log
    this.gameState.myName = name;
    // הכנת המידע לשליחה
    const payload = {
      name,
      requestedAvatarFile: this.gameState.chosenAvatarFile,
    };

    console.log("Payload:", payload); // Debug log

    // אם זה יצירת משחק חדש או הצטרפות למשחק קיים
    if (this.gameState.isCreatingGame) {
      this.network.emit("createGame", payload);
    } else {
      payload.gameCode = this.gameState.gameCode;
      this.network.emit("joinGame", payload);
    }
  }

  // התחלת המשחק - רק למנהל המשחק
  startGame() {
    this.network.emit("startGame", this.gameState.gameCode);
  }

  // יציאה מהמשחק והחזרה לעמוד הראשי
  leaveGame() {
    this.network.emit("leaveGame", this.gameState.gameCode);
    // איפוס המצב למצב התחלתי
    this.gameState.gameCode = null;
    this.gameState.isCreatingGame = false;
    this.gameState.myName = null;
    this.gameState.myRole = null;
    this.gameState.gameData = null;
    this.gameState.chosenAvatarFile = null;
    this.ui.showMainMenu();
  }

  // הצבעה למתחזה בסיום הדיון
  vote(playerId) {
    this.network.emit("vote", {
      gameCode: this.gameState.gameCode,
      vote: playerId,
    });
  }

  // חזרה למשחק נוסף עם אותם שחקנים
  playAgain() {
    this.network.emit("playAgain", this.gameState.gameCode);
  }

  // טיפול ביציאת מנהל מהמשחק - האם לסיים למה צא רק בעצמו
  handleEndGame() {
    this.ui.showModalMessage("איך תרצה לסיים את המשחק?", {
      type: "admin_leave",
      buttons: [
        {
          text: "סיים עבור כולם",
          action: () => this.network.emit("endGame", this.gameState.gameCode),
          style: "danger",
        },
        {
          text: "צא רק בעצמך",
          action: () => {
            this.network.emit("adminLeaving", this.gameState.gameCode);
            window.location.reload();
          },
          style: "danger",
        },
      ],
      message: "סיום עבור כולם יסגור את המשחק לכל השחקנים.",
    });
  }

  // Input handlers
  // הפונקציות הבאות מטופלות כעת על ידי InputValidator:
  // handleCodeInput, handleCodeKeydown, validateNameInput

  handleHeaderLogoClick() {
    if (this.ui.currentScreen === "home") return;

    if (
      this.ui.currentScreen === "endGame" ||
      this.ui.currentScreen === "nameEntry"
    ) {
      window.location.reload();
      return;
    }

    const isGameStarted = ["game", "voting", "result"].includes(
      this.ui.currentScreen
    );

    if (isGameStarted) {
      if (this.gameState.isAdmin) {
        this.ui.showModalMessage("איך תרצה לצאת מהמשחק?", {
          type: "admin_leave",
          buttons: [
            {
              text: "סיים עבור כולם",
              action: () => {
                this.network.emit("endGame", this.gameState.gameCode);
                window.location.reload();
              },
              style: "danger",
            },
            {
              text: "צא רק בעצמך",
              action: () => {
                this.network.emit("adminLeaving", this.gameState.gameCode);
                window.location.reload();
              },
              style: "danger",
            },
          ],
          message: "סיום עבור כולם יסגור את המשחק לכל השחקנים.",
        });
      } else {
        this.ui.showModalMessage("בטוח שאתה רוצה לצאת מהמשחק?", {
          onOk: () => window.location.reload(),
          onCancel: () => {},
          okText: "צא מהמשחק",
          cancelText: "המשך לשחק",
        });
      }
    } else {
      window.location.reload();
    }
  }

  // UI helpers
  // עדכון הצגת קוד המשחק בלובי
  updateGameCodeDisplay() {
    const codeDisplays = document.querySelectorAll(
      "#game-code-display .code-digit"
    );
    console.log(
      "Updating game code display:",
      this.gameState.gameCode,
      "Elements found:",
      codeDisplays.length
    );

    if (codeDisplays.length === 4 && this.gameState.gameCode) {
      this.gameState.gameCode.split("").forEach((digit, index) => {
        codeDisplays[index].textContent = digit;
        console.log(`Set digit ${index}: ${digit}`);
      });
    } else {
      console.warn(
        "Cannot update game code display - elements or code missing"
      );
    }
  }

  showAdminControls() {
    if (this.gameState.isAdmin) {
      const adminControls = document.getElementById("admin-game-controls");
      if (adminControls) {
        adminControls.innerHTML = `
          <button class="skip-word-btn">🔄 דלג על המילה</button>
        `;
        adminControls.classList.remove("hidden");
      }
    }
  }

  setupResultControls(players) {
    const currentAdmin = players.find((p) => p.isAdmin);

    if (currentAdmin && currentAdmin.id === this.gameState.myId) {
      this.ui.adminResultControls.classList.remove("hidden");
      this.ui.waitingForAdminMsg.classList.add("hidden");

      this.ui.nextRoundBtn.className = "primary-button";
      this.ui.nextRoundBtn.textContent = "המשך משחק";
      this.ui.endGameBtnFromResult.className = "text-button";
      this.ui.endGameBtnFromResult.textContent = "סיום משחק";
    } else {
      const adminPlayer = players.find((p) => p.isAdmin);
      this.ui.adminResultControls.classList.add("hidden");
      this.ui.waitingForAdminMsg.textContent = `${adminPlayer.name} ימשיך את המשחק מיד`;
      this.ui.waitingForAdminMsg.classList.remove("hidden");
    }
  }

  removeVotingOverlay() {
    const waitingOverlay = document.getElementById("waiting-vote-overlay");
    if (waitingOverlay) {
      waitingOverlay.remove();
    }
  }

  // Initialize the game
  initialize() {
    // Set initial game state
    this.gameState.myId = this.network.getId();

    // Request wake lock to keep screen on
    Utils.requestWakeLock();

    // Show initial screen
    this.ui.showScreen("home");

    console.log("🎮 Game initialized");
  }
}

// Export for global access
window.GameManager = GameManager;
