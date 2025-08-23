// ui.js - ניהול ממשק המשתמש והחלפת מסכים

// מחלקה לניהול כל הפעולות הויזואליות של המשחק
class UIManager {
  constructor() {
    this.currentScreen = "home";
    this.previousPlayers = []; // לאנימצית הניקוד
    this.votingInProgress = false;
    this.currentVotePlayers = [];

    this.initializeScreens();
    this.initializeElements();
    this.setupEventListeners();
    this.loadSavedSettings(); // טעינת הגדרות שמורות
  }

  // איתור והכנת כל המסכים השונים במשחק
  initializeScreens() {
    this.screens = {
      home: document.getElementById("home-screen"),
      nameEntry: document.getElementById("name-entry-screen"),
      lobby: document.getElementById("lobby-screen"),
      game: document.getElementById("game-screen"),
      voting: document.getElementById("voting-screen"),
      results: document.getElementById("result-screen"), // תיקון שם המסך
      endGame: document.getElementById("end-game-screen"), // הוספת מסך סיום המשחק
    };

    // בדיקה שכל המסכים נמצאו - הצגת אזהרה אם חסר מסך
    Object.entries(this.screens).forEach(([screenName, screenElement]) => {
      if (!screenElement) {
        console.warn(`Screen element not found: ${screenName}-screen`);
      }
    });
  }

  // איתור כל הרכיבים הדרושים מההקדמי - כפתורים, שדות טקסט וכו'
  initializeElements() {
    // שדות הזנת קוד המשחק וכפתור הצטרפות
    this.codeInputs = document.querySelectorAll(".code-input");
    this.joinGameBtn = document.getElementById("join-game-btn");

    // אלמנטים של מסך הזנת השם
    this.nameInput = document.getElementById("name-input");
    this.charCounter = document.getElementById("char-counter");
    this.submitNameBtn = document.getElementById("submit-name-btn");
    this.avatarPreviewContainer = document.getElementById(
      "avatar-preview-container"
    );

    // אלמנטים של הכותרת העליונה
    this.headerLogoContainer = document.getElementById("header-logo-container");
    this.headerCreateBtn = document.getElementById("header-create-btn");
    this.headerSettingsBtn = document.getElementById("header-settings-btn");

    // אלמנטים של מסך הלובי - המתנה לשחקנים
    this.gameCodeDisplay = document.getElementById("game-code-display");
    this.playerCountSpan = document.getElementById("player-count");
    this.playerListUl = document.getElementById("player-list");
    this.adminControls = document.getElementById("admin-controls");
    this.startGameBtn = document.getElementById("start-game-btn");
    this.startGameHint = document.getElementById("start-game-hint");
    this.shareCodeText = document.querySelector(".share-code-text");

    // אלמנטים של מסך המשחק עצמו
    this.timerDisplay = document.getElementById("timer-display");
    this.wordDisplayContainer = document.getElementById(
      "word-display-container"
    );
    this.wordDisplay = document.getElementById("word-display");
    this.toggleWordBtn = document.getElementById("toggle-word-btn");
    this.impostorDisplay = document.getElementById("impostor-display");
    this.impostorCategoryInfo = document.getElementById(
      "impostor-category-info"
    );

    // אלמנטים של מסך התוצאות בסיום כל סיבוב
    this.resultTitle = document.getElementById("result-title");
    this.resultInfo = document.getElementById("result-info");
    this.scoreListUl = document.getElementById("score-list");
    this.adminResultControls = document.getElementById("admin-result-controls");
    this.nextRoundBtn = document.getElementById("next-round-btn");
    this.endGameBtnFromResult = document.getElementById(
      "end-game-btn-from-result"
    );
    this.waitingForAdminMsg = document.getElementById("waiting-for-admin-msg");

    // אלמנטים של מסך סיום המשחק הכללי
    this.winnerListDiv = document.getElementById("winner-list");
    this.finalScoreListUl = document.getElementById("final-score-list");
    this.playAgainBtn = document.getElementById("play-again-btn");

    // אלמנטים של מסך ההגדרות
    this.settingsBtn = document.getElementById("header-settings-btn");
    this.settingsModal = document.getElementById("settings-modal");
    this.categoryListDiv = document.getElementById("category-list");
    this.showCategoryToggle = document.getElementById("show-category-toggle");

    // כפתורי הגדרות חדשים
    this.saveSettingsBtn = document.getElementById("save-settings-btn");
    this.resetSettingsBtn = document.getElementById("reset-settings-btn");
  }

  setupEventListeners() {
    // Character counter ניוהל כעת על ידי InputValidator
    // InputValidator יטפל גם במעקב אחר מספר התווים

    // טיפול בלחיצה על כפתורי בחירת קטגוריות - משתמש במנגנון delegation
    document.addEventListener("click", (e) => {
      if (e.target.closest(".category-toggle-btn")) {
        const btn = e.target.closest(".category-toggle-btn");
        const categoryId = btn.dataset.category;
        const checkSpan = btn.querySelector(".category-check");

        const isActive = btn.classList.contains("active");

        if (isActive) {
          // בדיקה שלא מבטלים את הקטגוריה האחרונה שנשארה
          const enabledCategories = document.querySelectorAll(
            ".category-toggle-btn.active"
          );
          if (enabledCategories.length <= 1) {
            return; // חסימת ביטול הקטגוריה האחרונה - חייב להיות לפחות אחת
          }

          btn.classList.remove("active");
          checkSpan.innerHTML = "";
        } else {
          btn.classList.add("active");
          checkSpan.innerHTML = "✓";
        }

        // שליחת עדכון ההגדרות לשרת אם זמין מנהל הרשת
        if (window.networkManager && window.gameState?.gameCode) {
          const enabledCategoryIds = Array.from(
            document.querySelectorAll(".category-toggle-btn.active")
          ).map((btn) => btn.dataset.category);

          window.networkManager.emit(
            "updateGameSettings",
            window.gameState.gameCode,
            {
              enabledCategories: enabledCategoryIds,
            }
          );
        }
      }
    });

    // כפתורי הגדרות - שמירה ואיפוס
    if (this.saveSettingsBtn) {
      this.saveSettingsBtn.addEventListener("click", () => {
        this.saveGameSettings();
      });
    }

    if (this.resetSettingsBtn) {
      this.resetSettingsBtn.addEventListener("click", () => {
        this.resetGameSettings();
      });
    }
  }

  // שמירת הגדרות המשחק
  saveGameSettings() {
    const settings = {
      timer:
        parseInt(document.querySelector(".timer-btn.active")?.dataset.time) ||
        60,
      showCategory: this.showCategoryToggle?.checked || false,
      enabledCategories: Array.from(
        document.querySelectorAll(".category-toggle-btn.active")
      ).map((btn) => btn.dataset.category),
    };

    // שמירה ב-localStorage
    localStorage.setItem("gameSettings", JSON.stringify(settings));

    // סגירת מסך ההגדרות ישירות
    if (this.settingsModal) {
      this.settingsModal.classList.add("hidden");
    }
  }

  // איפוס הגדרות למצב ברירת מחדל - ישר בלי שאלות
  resetGameSettings() {
    // איפוס טיימר ל-60 שניות
    document
      .querySelectorAll(".timer-btn")
      .forEach((btn) => btn.classList.remove("active"));
    document.querySelector('[data-time="60"]')?.classList.add("active");

    // הפעלת הצגת קטגוריה
    if (this.showCategoryToggle) {
      this.showCategoryToggle.checked = true;
    }

    // הפעלת כל הקטגוריות
    document.querySelectorAll(".category-toggle-btn").forEach((btn) => {
      btn.classList.add("active");
      const checkSpan = btn.querySelector(".category-check");
      if (checkSpan) checkSpan.innerHTML = "✓";
    });

    // מחיקה מ-localStorage
    localStorage.removeItem("gameSettings");
  }

  // Screen management
  // החלפה בין מסכים - הסתרה של כולם והצגה של הנבחר
  showScreen(screenName) {
    this.currentScreen = screenName;
    // הסתרת כל המסכים - רק אלה שקיימים באמת
    Object.values(this.screens).forEach((screen) => {
      if (screen) {
        screen.classList.add("hidden");
      }
    });
    // הצגת המסך הנבחר
    if (this.screens[screenName]) {
      this.screens[screenName].classList.remove("hidden");
    }
    this.updateHeader(screenName);
  }

  // עדכון הכותרת העליונה בהתאם למסך הנוכחי ותפקיד השחקן
  updateHeader(screenName) {
    // הסתרת כל הכפתורים כברירת מחדל
    this.headerCreateBtn.classList.add("hidden");
    this.headerSettingsBtn.classList.add("hidden");
    this.headerLogoContainer.classList.remove("hidden");

    // איתור אלמנטים של קוד המשחק בכותרת
    const headerGameCode = document.getElementById("header-game-code");
    const headerGameCodeValue = document.getElementById(
      "header-game-code-value"
    );

    // ברירת מחדל: מסתירים קוד
    if (headerGameCode) headerGameCode.classList.add("hidden");

    // התאמת הכותרת לפי המסך הנוכחי
    switch (screenName) {
      case "home":
        // במסך הבית - הצגת כפתור יצירת משחק
        this.headerCreateBtn.classList.remove("hidden");
        break;
      case "nameEntry":
        break;
      case "lobby":
        if (window.gameState?.isAdmin) {
          this.headerSettingsBtn.classList.remove("hidden");
        }
        // לא מציגים את הקוד בלובי לפי דרישה
        break;
      case "game":
      case "voting":
      case "result":
        if (window.gameState?.isAdmin) {
          this.headerSettingsBtn.classList.remove("hidden");
        }
        if (headerGameCode && window.gameState?.gameCode) {
          headerGameCodeValue.textContent = window.gameState.gameCode;
          headerGameCode.classList.remove("hidden");
        }
        break;
      case "endGame":
        // No buttons shown, just logo
        break;
    }
  }

  refreshCurrentScreen() {
    // Refresh interface according to current screen
    switch (this.currentScreen) {
      case "lobby":
        // Show admin controls in lobby
        if (window.gameState?.isAdmin) {
          this.adminControls.classList.remove("hidden");
          const canStart =
            document.querySelectorAll("#player-list li").length >= 3;
          this.startGameBtn.disabled = !canStart;
          this.startGameHint.classList.toggle("hidden", canStart);
        } else {
          this.adminControls.classList.add("hidden");
        }
        break;
      case "game":
        // Show admin controls in game
        if (window.gameState?.isAdmin) {
          const skipWordBtn = document.querySelector(".skip-word-btn");
          if (skipWordBtn) {
            skipWordBtn.classList.remove("hidden");
          }
        }
        break;
      case "result":
        if (window.gameState?.isAdmin) {
          this.adminResultControls.classList.remove("hidden");
          this.waitingForAdminMsg.classList.add("hidden");
        } else {
          this.adminResultControls.classList.add("hidden");
          this.waitingForAdminMsg.classList.remove("hidden");
        }
        break;
      case "voting":
        // Refresh voting screen if needed
        if (this.votingInProgress) {
          this.showVotingScreen(this.currentVotePlayers);
        }
        break;
    }
  }

  showNameEntryScreen(gameInProgress) {
    if (window.gameState?.chosenAvatarFile) {
      Utils.showAvatarPreview(
        window.gameState.chosenAvatarFile,
        this.avatarPreviewContainer
      );
    }
    this.nameInput.value = "";
    this.charCounter.textContent = "0/10";

    // Show or hide return to game message
    const returningPlayerHint = document.getElementById(
      "returning-player-hint"
    );
    if (returningPlayerHint) {
      if (gameInProgress) {
        returningPlayerHint.textContent =
          "שיחקת כבר במשחק הזה? השתמש באותו השם כדי לחזור עם הניקוד שלך";
        returningPlayerHint.classList.remove("hidden");
      } else {
        returningPlayerHint.classList.add("hidden");
      }
    }

    this.showScreen("nameEntry");
    this.nameInput.focus();
  }

  // Modal message system
  showModalMessage(message, options = {}) {
    const overlay = document.getElementById("modal-overlay");
    const box = document.getElementById("modal-message-box");
    const textDiv = document.getElementById("modal-message-text");
    const actionsDiv = document.getElementById("modal-message-actions");

    textDiv.textContent = message;
    overlay.classList.remove("hidden");

    // Clear existing buttons
    actionsDiv.innerHTML = "";

    if (options.type === "admin_leave") {
      // Add explanation message if exists
      if (options.message) {
        const explanationDiv = document.createElement("div");
        explanationDiv.className = "modal-explanation";
        explanationDiv.textContent = options.message;
        explanationDiv.style.color = "var(--text-muted)";
        explanationDiv.style.fontSize = "0.9rem";
        explanationDiv.style.marginTop = "10px";
        textDiv.appendChild(explanationDiv);
      }

      // Create custom buttons
      let defaultButton = null;
      options.buttons.forEach((button, index) => {
        const btn = document.createElement("button");
        btn.textContent = button.text;
        btn.className = `modal-btn modal-btn-${button.style}`;
        btn.onclick = () => {
          overlay.classList.add("hidden");
          button.action();
        };

        // שמירת הכפתור הדיפולטי לEnter
        if (button.isDefault || index === 0) {
          defaultButton = btn;
        }

        actionsDiv.appendChild(btn);
      });

      // הוספת מאזין Enter
      const handleEnter = (e) => {
        if (e.key === "Enter" && defaultButton) {
          window.ignoreNextEnter = true;
          defaultButton.click();
          document.removeEventListener("keydown", handleEnter);
        } else if (e.key === "Escape") {
          overlay.classList.add("hidden");
          document.removeEventListener("keydown", handleEnter);
        }
      };
      document.addEventListener("keydown", handleEnter);
    } else {
      // Original logic for OK/Cancel buttons
      const okBtn = document.createElement("button");
      okBtn.textContent = options.okText || "אישור";
      okBtn.className = "modal-btn";
      okBtn.onclick = () => {
        overlay.classList.add("hidden");
        if (options.onOk) options.onOk();
      };
      actionsDiv.appendChild(okBtn);
      // Auto focus primary button for Enter support
      setTimeout(() => okBtn.focus(), 0);

      if (options.onCancel) {
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = options.cancelText || "ביטול";
        cancelBtn.className = "modal-btn modal-btn-cancel";
        cancelBtn.onclick = () => {
          overlay.classList.add("hidden");
          options.onCancel();
        };
        actionsDiv.appendChild(cancelBtn);
      }

      // הוספת מאזין Enter לפופאפים רגילים
      const handleEnter = (e) => {
        if (e.key === "Enter") {
          window.ignoreNextEnter = true;
          okBtn.click();
          document.removeEventListener("keydown", handleEnter);
        } else if (e.key === "Escape") {
          overlay.classList.add("hidden");
          document.removeEventListener("keydown", handleEnter);
        }
      };
      document.addEventListener("keydown", handleEnter);
    }

    // Click outside to close
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.add("hidden");
        if (options.onCancel) options.onCancel();
      }
    };
  }

  // Player list management
  // עדכון רשימת השחקנים עם כפתורי הסרה למנהל
  updatePlayerList(players) {
    if (!this.playerListUl) return;

    this.playerListUl.innerHTML = "";
    if (this.playerCountSpan) {
      this.playerCountSpan.textContent = players.length;
    }

    players.forEach((player) => {
      const li = document.createElement("li");
      li.dataset.id = player.id;
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";

      const playerInfoDiv = document.createElement("div");
      playerInfoDiv.style.display = "flex";
      playerInfoDiv.style.alignItems = "center";
      playerInfoDiv.innerHTML = `<img src="/avatars/${player.avatar.file}" class="avatar-circle-small">`;

      const nameSpan = document.createElement("span");
      nameSpan.className = "player-name";
      nameSpan.style.color = player.avatar.color;
      nameSpan.textContent = player.name;
      playerInfoDiv.appendChild(nameSpan);

      if (player.isAdmin) {
        const adminSpan = document.createElement("span");
        adminSpan.className = "admin-tag";
        adminSpan.textContent = " (מנהל)";
        adminSpan.style.color = player.avatar.color;
        adminSpan.style.opacity = "0.8";
        playerInfoDiv.appendChild(adminSpan);
      }

      li.appendChild(playerInfoDiv);

      // הוספת כפתור הסרה למנהל (רק עבור שחקנים שאינם מנהלים)
      if (window.gameState?.isAdmin && !player.isAdmin) {
        const removeBtn = document.createElement("span");
        removeBtn.className = "remove-player-btn";
        removeBtn.textContent = "הסר";
        removeBtn.style.color = "#e74c3c";
        removeBtn.style.textDecoration = "underline";
        removeBtn.style.cursor = "pointer";
        removeBtn.style.fontSize = "0.85rem";
        removeBtn.addEventListener("click", () => {
          this.showRemovePlayerDialog(player.name, player.id);
        });
        li.appendChild(removeBtn);
      }

      this.playerListUl.appendChild(li);
    });

    // עדכון מצב כפתור התחל משחק
    this.updateStartGameButton(players.length);
  }

  // עדכון מצב כפתור התחל משחק
  updateStartGameButton(playerCount) {
    const startBtn = document.getElementById("start-game-btn");
    const hintText = document.getElementById("start-game-hint");

    if (startBtn && window.gameState?.isAdmin) {
      if (playerCount >= 3) {
        startBtn.disabled = false;
        if (hintText) hintText.style.display = "none";
      } else {
        startBtn.disabled = true;
        if (hintText) hintText.style.display = "block";
      }
    }
  }

  // דיאלוג הסרת שחקן
  showRemovePlayerDialog(playerName, playerId) {
    this.showModalMessage(`האם אתה בטוח שאתה רוצה להסיר את ${playerName}?`, {
      buttons: [
        {
          text: "לא",
          action: () => {},
          style: "danger",
          isDefault: true, // Enter יפעיל את הכפתור הזה
        },
        {
          text: "כן",
          action: () => {
            // שליחת בקשה להסרת השחקן
            if (window.networkManager) {
              window.networkManager.emit("removePlayer", {
                gameCode: window.gameState.gameCode,
                playerId: playerId,
              });
            }
          },
          style: "secondary",
        },
      ],
    });
  }

  // Voting screen management
  showVotingScreen(players, resetVotes = false) {
    // Save current voting state
    this.currentVotePlayers = players;
    this.votingInProgress = true;

    // Clear previous voting state if exists
    const existingOverlay = document.getElementById("waiting-vote-overlay");
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const voteOptionsDiv = document.getElementById("vote-options");
    voteOptionsDiv.innerHTML = "";
    if (resetVotes) {
      voteOptionsDiv.classList.remove("voting-done");
    }

    // Show voting title
    const votingScreen = document.getElementById("voting-screen");
    const mainTitle = votingScreen.querySelector("h2");
    if (mainTitle) {
      mainTitle.textContent = "מי המתחזה?";
      mainTitle.classList.remove("hidden");
    }

    // Create new waiting overlay
    const waitingOverlay = Utils.createVoteWaitingOverlay(votingScreen);

    // Create voting buttons
    players.forEach((player) => {
      const btn = document.createElement("button");
      btn.className = "vote-btn";
      btn.onclick = () => {
        if (window.networkManager) {
          window.networkManager.emit("vote", {
            gameCode: window.gameState?.gameCode,
            votedForId: player.id,
          });
        }
        voteOptionsDiv.classList.add("voting-done");
        waitingOverlay.classList.remove("hidden");
      };

      const avatarImg = document.createElement("img");
      avatarImg.src = `/avatars/${player.avatar.file}`;
      avatarImg.className = "avatar-circle-small";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = player.name;
      nameSpan.style.color = player.avatar.color;
      btn.appendChild(avatarImg);
      btn.appendChild(nameSpan);
      voteOptionsDiv.appendChild(btn);
    });

    this.showScreen("voting");
  }

  // Score list management
  updateScoreList(players, listElement, withAnimation = true) {
    if (withAnimation && this.previousPlayers.length > 0) {
      Utils.animateScoreListChanges(listElement, players, this.previousPlayers);
    } else {
      Utils.updateScoreListContent(listElement, players);
    }
    this.previousPlayers = [...players];
  }

  // Timer display
  updateTimerDisplay(timeLeft) {
    if (this.timerDisplay) {
      this.timerDisplay.textContent = Utils.formatTime(timeLeft);

      // Add visual warning when time is low
      if (timeLeft <= 10) {
        this.timerDisplay.style.color = "var(--error-color)";
        this.timerDisplay.style.animation = "pulse 1s infinite";
      } else {
        this.timerDisplay.style.color = "var(--primary-color)";
        this.timerDisplay.style.animation = "none";
      }
    }
  }

  // Game screen management
  showGameScreen(data) {
    const { isImpostor, word, category, timeLeft } = data;

    if (isImpostor) {
      this.wordDisplayContainer.classList.add("hidden");
      this.impostorDisplay.classList.remove("hidden");

      if (this.impostorCategoryInfo) {
        this.impostorCategoryInfo.textContent = `הקטגוריה: ${category}`;
      }

      const toggleImpostorBtn = document.getElementById("toggle-impostor-btn");
      if (toggleImpostorBtn) {
        toggleImpostorBtn.textContent = "הסתר מילה";
        toggleImpostorBtn.onclick = () => {
          const impostorWordDisplay = document.getElementById(
            "impostor-word-display"
          );
          const impostorCategoryInfo = document.getElementById(
            "impostor-category-info"
          );

          impostorWordDisplay.classList.toggle("word-hidden");
          impostorCategoryInfo.classList.toggle("word-hidden");
          toggleImpostorBtn.textContent =
            impostorWordDisplay.classList.contains("word-hidden")
              ? "הצג מילה"
              : "הסתר מילה";
        };
      }
    } else {
      this.wordDisplayContainer.classList.remove("hidden");
      this.impostorDisplay.classList.add("hidden");
      if (this.wordDisplay) {
        this.wordDisplay.textContent = word;
      }
    }

    setTimeout(() => {
      if (this.timerDisplay) {
        this.timerDisplay.style.opacity = 1;
        this.updateTimerDisplay(timeLeft);
      }
    }, 3000);

    this.showScreen("game");
  }

  // Result screen management
  showResultScreen(data) {
    const { correctlyGuessed, impostor, word, players } = data;

    if (this.resultTitle) {
      this.resultTitle.textContent = correctlyGuessed
        ? "המתחזה נתפס!"
        : "המתחזה ברח!";
      this.resultTitle.style.color = correctlyGuessed
        ? "var(--success-color)"
        : "var(--error-color)";
    }

    if (this.resultInfo) {
      this.resultInfo.innerHTML = `
        <p><strong>המתחזה:</strong> ${impostor.name}</p>
        <p><strong>המילה הייתה:</strong> ${word}</p>
      `;
    }

    this.updateScoreList(players, this.scoreListUl, true);
    this.showScreen("result");
  }

  // End game screen management
  showEndGameScreen(players) {
    const maxScore = Math.max(...players.map((p) => p.score), 0);
    const winners = players.filter((p) => p.score === maxScore && maxScore > 0);

    if (this.winnerListDiv) {
      this.winnerListDiv.innerHTML = "";
      if (winners.length > 0) {
        winners.forEach((winner) => {
          const winnerCard = document.createElement("div");
          winnerCard.className = "winner-card";
          winnerCard.innerHTML = `
            <img src="/avatars/${winner.avatar.file}" class="avatar-circle-large">
            <span class="player-name">${winner.name}</span>
          `;
          this.winnerListDiv.appendChild(winnerCard);
        });
      } else {
        this.winnerListDiv.textContent = "אין מנצחים בסבב זה.";
      }
    }

    this.updateScoreList(players, this.finalScoreListUl, false);
    this.showScreen("endGame");
  }

  // Settings management
  populateCategorySettings(allCategories, enabledCategories) {
    if (!this.categoryListDiv) return;

    this.categoryListDiv.innerHTML = "";
    allCategories.forEach((category) => {
      const categoryItem = document.createElement("div");
      categoryItem.className = "category-item";

      const isEnabled = enabledCategories.includes(category.id);
      categoryItem.innerHTML = `
        <button class="category-toggle-btn ${
          isEnabled ? "active" : ""
        }" data-category="${category.id}">
          <span class="category-check">${isEnabled ? "✓" : ""}</span>
          <span class="category-name">${category.name}</span>
        </button>
      `;
      this.categoryListDiv.appendChild(categoryItem);
    });
  }

  // Input validation helpers
  validateCodeInputs() {
    return Utils.validateCodeInputs(this.codeInputs);
  }

  // Get current screen
  getCurrentScreen() {
    return this.currentScreen;
  }

  // Enable/disable join button
  setJoinButtonState(enabled) {
    if (this.joinGameBtn) {
      this.joinGameBtn.disabled = !enabled;
    }
  }

  // Clear code inputs
  clearCodeInputs(focusFirst = true) {
    if (window.inputValidator) {
      window.inputValidator.clearCodeInputs(focusFirst);
    }
  }

  // Focus name input
  focusNameInput() {
    if (this.nameInput) {
      this.nameInput.focus();
    }
  }

  // טעינת הגדרות שמורות מ-localStorage
  loadSavedSettings() {
    try {
      const savedSettings = localStorage.getItem("gameSettings");
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);

        // טעינת הגדרת טיימר
        if (settings.timer) {
          document
            .querySelectorAll(".timer-btn")
            .forEach((btn) => btn.classList.remove("active"));
          document
            .querySelector(`[data-time="${settings.timer}"]`)
            ?.classList.add("active");
        }

        // טעינת הגדרת הצגת קטגוריה
        if (
          this.showCategoryToggle &&
          typeof settings.showCategory === "boolean"
        ) {
          this.showCategoryToggle.checked = settings.showCategory;
        }

        // טעינת קטגוריות מופעלות
        if (
          settings.enabledCategories &&
          Array.isArray(settings.enabledCategories)
        ) {
          document.querySelectorAll(".category-toggle-btn").forEach((btn) => {
            const categoryId = btn.dataset.category;
            const checkSpan = btn.querySelector(".category-check");

            if (settings.enabledCategories.includes(categoryId)) {
              btn.classList.add("active");
              if (checkSpan) checkSpan.innerHTML = "✓";
            } else {
              btn.classList.remove("active");
              if (checkSpan) checkSpan.innerHTML = "";
            }
          });
        }
      }
    } catch (error) {
      console.warn("שגיאה בטעינת הגדרות שמורות:", error);
    }
  }

  // Get name input value
  getNameInputValue() {
    const value = this.nameInput ? this.nameInput.value : "";
    console.log("Getting name input value:", `"${value}"`); // Debug log
    return value.trim();
  }
}

// Export for global access
window.UIManager = UIManager;
