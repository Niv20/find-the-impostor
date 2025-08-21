document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // --- State ---
  let myId = null;
  let myName = "";
  let gameCode = "";
  let isAdmin = false;
  let wakeLock = null;

  // הפעלת מנגנון שמירת המסך דלוק מיד עם טעינת האפליקציה
  requestWakeLock();

  // מעקב אחר מצבי ניתוק
  document.addEventListener("visibilitychange", () => {
    console.log(`🔍 Tab visibility changed: ${document.visibilityState}`);
    // כשחוזרים לטאב, מנסים להתחבר מחדש
    if (document.visibilityState === "visible" && myId && gameCode) {
      console.log("🔄 Attempting to reconnect...");
    }
  });

  window.addEventListener("online", () => {
    console.log("📶 Browser is online");
    if (myId && gameCode) {
      console.log("🔄 Network restored, attempting to reconnect...");
    }
  });

  window.addEventListener("offline", () => {
    console.log("❌ Browser is offline");
  });

  socket.on("connect", () => {
    console.log("🟢 Socket connected");
    myId = socket.id;
  });

  socket.on("disconnect", (reason) => {
    console.log(`🔴 Socket disconnected. Reason: ${reason}`);
  });

  socket.on("reconnect", (attemptNumber) => {
    console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
  });

  socket.on("reconnect_attempt", (attemptNumber) => {
    console.log(`⏳ Attempting to reconnect... (attempt ${attemptNumber})`);
  });
  let isCreatingGame = false;
  let roundTimerInterval;
  let availableAvatars = [];
  let chosenAvatarFile = null;
  let allCategories = [];
  let enabledCategories = [];
  let currentScreen = "home";
  let previousPlayers = []; // For score animation

  // --- Screen Elements ---
  const screens = {
    home: document.getElementById("home-screen"),
    nameEntry: document.getElementById("name-entry-screen"),
    lobby: document.getElementById("lobby-screen"),
    game: document.getElementById("game-screen"),
    voting: document.getElementById("voting-screen"),
    result: document.getElementById("result-screen"),
    endGame: document.getElementById("end-game-screen"),
  };

  const resultScreen = screens.result; // Add this line to fix the reference error

  // --- UI Elements ---
  const codeInputs = document.querySelectorAll(".code-input");
  const joinGameBtn = document.getElementById("join-game-btn");
  const nameInput = document.getElementById("name-input");
  const charCounter = document.getElementById("char-counter");
  const submitNameBtn = document.getElementById("submit-name-btn");
  const avatarPreviewContainer = document.getElementById(
    "avatar-preview-container"
  );

  // Header
  const headerLogoContainer = document.getElementById("header-logo-container");
  const headerCreateBtn = document.getElementById("header-create-btn");
  const headerSettingsBtn = document.getElementById("header-settings-btn");
  const headerGameCode = document.createElement("div");
  headerGameCode.className = "header-game-code";
  headerGameCode.innerHTML = '<span class="game-code-value"></span>';
  headerGameCode.style.cssText =
    "display: none; margin-left: auto; font-size: 1.2em; color: var(--text-muted);";

  // Lobby
  const gameCodeDisplay = document.getElementById("game-code-display");
  const playerCountSpan = document.getElementById("player-count");
  const playerListUl = document.getElementById("player-list");
  const adminControls = document.getElementById("admin-controls");
  const startGameBtn = document.getElementById("start-game-btn");
  const startGameHint = document.getElementById("start-game-hint");
  const shareCodeText = document.querySelector(".share-code-text");

  // Game Screen
  const timerDisplay = document.getElementById("timer-display");
  const wordDisplayContainer = document.getElementById(
    "word-display-container"
  );
  const wordDisplay = document.getElementById("word-display");
  const toggleWordBtn = document.getElementById("toggle-word-btn");
  const impostorDisplay = document.getElementById("impostor-display");
  const impostorCategoryInfo = document.getElementById(
    "impostor-category-info"
  );

  // Result Screen
  const resultTitle = document.getElementById("result-title");
  const resultInfo = document.getElementById("result-info");
  const scoreListUl = document.getElementById("score-list");
  const adminResultControls = document.getElementById("admin-result-controls");
  const nextRoundBtn = document.getElementById("next-round-btn");
  const endGameBtnFromResult = document.getElementById(
    "end-game-btn-from-result"
  );
  const waitingForAdminMsg = document.getElementById("waiting-for-admin-msg");

  // End Game Screen
  const winnerListDiv = document.getElementById("winner-list");
  const finalScoreListUl = document.getElementById("final-score-list");
  const playAgainBtn = document.getElementById("play-again-btn");

  // Settings
  const settingsBtn = document.getElementById("header-settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const categoryListDiv = document.getElementById("category-list");
  const showCategoryToggle = document.getElementById("show-category-toggle");

  // --- Screen Management ---
  function updateHeader(screenName) {
    // Hide all actions by default
    headerCreateBtn.classList.add("hidden");
    headerSettingsBtn.classList.add("hidden");
    headerLogoContainer.classList.remove("hidden");
    headerGameCode.style.display = "none";

    switch (screenName) {
      case "home":
        headerCreateBtn.classList.remove("hidden");
        break;
      case "nameEntry":
        break;
      case "lobby":
        if (isAdmin) {
          // הצגת כפתור הגדרות למנהל בלובי
          const header = document.querySelector("#app-header");
          const settingsWrapper = document.createElement("div");
          settingsWrapper.className = "settings-wrapper";
          headerSettingsBtn.classList.remove("hidden");
          settingsWrapper.appendChild(headerSettingsBtn);
          header.appendChild(settingsWrapper);
        }
        break;
      case "game":
      case "voting":
      case "result":
        if (isAdmin) {
          // הצגת קוד המשחק בheader רק למנהל
          headerGameCode.style.display = "flex";
          headerGameCode.querySelector(".game-code-value").textContent =
            gameCode;
          const header = document.querySelector("#app-header");
          if (!header.contains(headerGameCode)) {
            header.appendChild(headerGameCode);
          }
          // הסתרת כפתור ההגדרות במהלך המשחק
          headerSettingsBtn.classList.add("hidden");
          const settingsWrapper = document.querySelector(".settings-wrapper");
          if (settingsWrapper) {
            settingsWrapper.classList.add("hidden");
          }
        }
        break;
      case "endGame":
        // No buttons shown, just logo
        break;
    }
  }

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        console.log("Wake Lock is active");

        // הוספת מאזין לאובדן Wake Lock (למשל כשהמסך נכבה)
        wakeLock.addEventListener("release", () => {
          console.log("Wake Lock was released");
          // ננסה להפעיל מחדש
          requestWakeLock();
        });

        // הוספת מאזין לחזרה מרקע
        document.addEventListener("visibilitychange", async () => {
          if (wakeLock !== null && document.visibilityState === "visible") {
            requestWakeLock();
          }
        });
      } else {
        console.log("Wake Lock API is not supported");
        // נפעיל את הפתרון החלופי של וידאו
        createBackgroundVideo();
      }
    } catch (err) {
      console.log("Wake Lock request failed:", err.name, err.message);
      // נפעיל את הפתרון החלופי של וידאו
      createBackgroundVideo();
    }
  }

  function createBackgroundVideo() {
    // בדיקה אם כבר קיים וידאו
    if (document.getElementById("keepAwakeVideo")) return;

    const video = document.createElement("video");
    video.id = "keepAwakeVideo";
    video.innerHTML = `
      <source src="data:video/mp4;base64,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" type="video/mp4">
    `;
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.position = "fixed";
    video.style.opacity = "0.01";
    video.style.pointerEvents = "none";
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.setAttribute("loop", "");
    document.body.appendChild(video);
    video.muted = true;
    video.play().catch((err) => console.log("Video autoplay failed:", err));
  }

  function showScreen(screenName) {
    currentScreen = screenName;
    Object.values(screens).forEach((screen) => screen.classList.add("hidden"));
    if (screens[screenName]) {
      screens[screenName].classList.remove("hidden");
    }
    updateHeader(screenName);
  }

  function showNameEntryScreen() {
    chosenAvatarFile = showRandomAvatarPreview();
    nameInput.value = "";
    charCounter.textContent = "0/10";
    showScreen("nameEntry");
    nameInput.focus();
  }

  // --- Event Listeners ---
  headerLogoContainer.addEventListener("click", () => {
    // אם אנחנו במסך הבית, לא עושים כלום
    if (currentScreen === "home") return;

    // במסך הסיום או במסכי ההתחלה (nameEntry), יציאה ישירה
    if (currentScreen === "endGame" || currentScreen === "nameEntry") {
      window.location.reload();
      return;
    }

    // במסך הלובי לפני תחילת המשחק, יציאה ישירה אם לא מנהל
    if (currentScreen === "lobby" && !isAdmin) {
      window.location.reload();
      return;
    }

    // אם זה המנהל, נציג אפשרויות מיוחדות
    if (isAdmin) {
      showModalMessage("מה ברצונך לעשות?", {
        type: "admin_leave",
        buttons: [
          {
            text: "סיים את המשחק לכולם",
            action: () => socket.emit("endGame", gameCode),
            style: "danger",
          },
          {
            text: "העבר את ניהול המשחק לשחקן אחר",
            action: () => {
              socket.emit("adminLeaving", gameCode);
              window.location.reload();
            },
            style: "primary",
          },
          {
            text: "ביטול",
            action: () => {},
            style: "cancel",
          },
        ],
        message: "שים לב: אם תצא מהמשחק, השחקן הבא בתור יקבל את תפקיד המנהל",
      });
    } else {
      // שחקן רגיל
      showModalMessage("האם אתה בטוח שברצונך לצאת מהמשחק?", {
        okText: "צא",
        cancelText: "ביטול",
        onOk: () => window.location.reload(),
        onCancel: () => {},
      });
    }
  });

  headerCreateBtn.addEventListener("click", () => {
    isCreatingGame = true;
    showNameEntryScreen();
  });

  // Home Screen
  codeInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      e.preventDefault();
      // מחיקת כל תו שאינו ספרה
      let newValue = e.target.value.replace(/[^0-9]/g, "");

      // לקחת רק את הספרה האחרונה אם הוכנס יותר מתו אחד
      if (newValue.length > 1) {
        newValue = newValue.slice(-1);
      }

      // עדכון הערך בתיבה הנוכחית
      input.value = newValue;

      // מעבר לתיבה הבאה אם הוכנסה ספרה
      if (newValue.length === 1 && index < codeInputs.length - 1) {
        setTimeout(() => {
          codeInputs[index + 1].focus();
        }, 0);
      }

      validateCodeInputs();
    });

    input.addEventListener("focus", (e) => e.target.select());

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace") {
        if (!input.value && index > 0) {
          codeInputs[index - 1].focus();
          codeInputs[index - 1].value = "";
        }
      } else if (e.key === "Enter" && !joinGameBtn.disabled) {
        joinGameBtn.click();
      } else if (e.key === "ArrowLeft" && index > 0) {
        codeInputs[index - 1].focus();
      } else if (e.key === "ArrowRight" && index < codeInputs.length - 1) {
        codeInputs[index + 1].focus();
      }
    });

    // מנע הדבקה ישירה בתיבה בודדת
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData("text");
      const digits = pastedData.replace(/[^0-9]/g, "").split("");

      // מילוי הערכים בכל התיבות
      codeInputs.forEach((input, i) => {
        if (digits[i]) {
          input.value = digits[i];
        }
      });

      // מיקוד בתיבה האחרונה שיש בה ערך
      const lastFilledIndex = Math.min(
        digits.length - 1,
        codeInputs.length - 1
      );
      if (lastFilledIndex >= 0) {
        codeInputs[lastFilledIndex].focus();
      }

      validateCodeInputs();
    });
  });

  joinGameBtn.addEventListener("click", () => {
    const code = Array.from(codeInputs)
      .map((input) => input.value)
      .join("");
    if (code.length === 4) {
      gameCode = code;
      socket.emit("checkGameCode", gameCode);
    }
  });

  // Name Entry Screen
  nameInput.addEventListener("input", (e) => {
    // מניעת רווחים ותווים שאינם עברית
    let newValue = e.target.value.replace(/[^א-ת]/g, "");

    // הגבלה ל-10 תווים
    if (newValue.length > 10) {
      newValue = newValue.slice(0, 10);
    }

    // עדכון הערך בשדה
    nameInput.value = newValue;
    const len = newValue.length;
    charCounter.textContent = `${len}/10`;

    // בדיקת תקינות השם ועדכון מצב הכפתור
    submitNameBtn.disabled = !validateName(newValue);
  });

  // מניעת הדבקה
  nameInput.addEventListener("paste", (e) => {
    e.preventDefault();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitNameBtn.click();
  });

  // פונקציה לבדיקת תקינות השם
  function validateName(name) {
    return name.trim().length > 0;
  }

  // בדיקת תקינות השם בכל שינוי
  nameInput.addEventListener("input", (e) => {
    submitNameBtn.disabled = !validateName(nameInput.value);
  });

  submitNameBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    myName = name;
    const payload = { name, requestedAvatarFile: chosenAvatarFile };
    if (isCreatingGame) {
      socket.emit("createGame", payload);
    } else {
      payload.gameCode = gameCode;
      socket.emit("joinGame", payload);
    }
  });

  // הכפתור מתחיל במצב לא פעיל
  submitNameBtn.disabled = true;

  // In-Game Buttons
  settingsBtn.addEventListener("click", () =>
    settingsModal.classList.remove("hidden")
  );
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.add("hidden");
  });
  startGameBtn.addEventListener("click", () => {
    console.log(
      "Start game button clicked, emitting startGame with code:",
      gameCode
    );
    socket.emit("startGame", gameCode);
  });
  nextRoundBtn.addEventListener("click", () =>
    socket.emit("startGame", gameCode)
  );
  endGameBtnFromResult.addEventListener("click", () => {
    showModalMessage("האם אתה בטוח שברצונך לסיים את המשחק עבור כולם?", {
      okText: "סיים משחק",
      cancelText: "ביטול",
      onOk: () => socket.emit("endGame", gameCode),
      onCancel: () => {},
    });
  });
  playAgainBtn.addEventListener("click", () => window.location.reload());
  toggleWordBtn.addEventListener("click", () => {
    wordDisplay.classList.toggle("word-hidden");
    const isHidden = wordDisplay.classList.contains("word-hidden");
    toggleWordBtn.textContent = isHidden ? "הצג מילה" : "הסתר מילה";
  });

  // --- Socket Listeners ---
  socket.on("connect", () => (myId = socket.id));
  socket.on("avatarList", (avatars) => (availableAvatars = avatars));

  // הוספת מאזין להודעות על התנתקות שחקן
  socket.on("playerDisconnected", (data) => {
    const { player } = data;

    // יצירת הודעת התנתקות
    const notification = document.createElement("div");
    notification.className = "disconnect-notification";
    notification.innerHTML = `
      <div class="disconnect-content">
        <img src="/avatars/${player.avatar.file}" class="avatar-circle-small">
        <span class="disconnect-text">${player.name} התנתק מהמשחק</span>
        <button class="close-notification">×</button>
      </div>
    `;

    // הוספת סגנונות לאנימציה
    const style = document.createElement("style");
    style.textContent = `
      .disconnect-notification {
        position: fixed;
        bottom: -100px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 9999;
        transition: bottom 0.3s ease-in-out;
        white-space: nowrap;
      }
      .disconnect-notification.show {
        bottom: 20px;
      }
      .disconnect-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .disconnect-text {
        white-space: nowrap;
      }
      .close-notification {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0 8px;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(notification);

    // הפעלת האנימציה
    setTimeout(() => notification.classList.add("show"), 100);

    // הסרת ההודעה אחרי שתי שניות
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 2000);

    // הוספת אפשרות לסגירה ידנית
    notification.querySelector(".close-notification").onclick = () => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    };
  });

  socket.on("errorMsg", (message) => {
    showModalMessage(message, {
      okText: "אישור",
      onOk: () => {
        codeInputs.forEach((input) => (input.value = ""));
        joinGameBtn.disabled = true;
        showScreen("home");
      },
    });
  });

  // טיפול בשגיאת שם כפול - השארת המשתמש במסך הזנת השם
  socket.on("nameTakenError", (message) => {
    showModalMessage(message, {
      okText: "אישור",
      onOk: () => {
        nameInput.value = "";
        nameInput.focus();
        showScreen("nameEntry");
      },
    });
  });

  socket.on("gameCodeValid", () => {
    isCreatingGame = false;
    showNameEntryScreen();
  });

  socket.on("gameCreated", (data) => {
    gameCode = data.gameCode;
    isAdmin = true;
    allCategories = data.allCategories;
    enabledCategories = data.settings.enabledCategories;

    // עדכון הצגת הקוד בריבועים
    const codeDigits = gameCodeDisplay.querySelectorAll(".code-digit");
    for (let i = 0; i < gameCode.length; i++) {
      codeDigits[i].textContent = gameCode[i];
    }
    gameCodeDisplay.classList.remove("hidden");
    adminControls.classList.remove("hidden");
    if (shareCodeText) {
      shareCodeText.textContent = "שתף עם חברים את הקוד:";
      shareCodeText.classList.remove("waiting-text");
    }
    populateCategorySettings();
    updatePlayerList(data.players);
    previousPlayers = data.players;
    showScreen("lobby");
  });

  // יצירת מסך המתנה להצטרפות באמצע משחק
  const waitingScreen = document.createElement("div");
  waitingScreen.id = "waiting-screen";
  waitingScreen.className = "screen hidden";
  waitingScreen.innerHTML = `
    <div class="waiting-content">
      <div class="loading-circle"></div>
      <h2 class="waiting-message"></h2>
    </div>
  `;
  document.body.appendChild(waitingScreen);
  screens.waiting = waitingScreen;

  // הוספת סגנונות למסך ההמתנה
  const waitingStyles = document.createElement("style");
  waitingStyles.textContent = `
    .waiting-content {
      text-align: center;
      padding: 2rem;
    }
    .loading-circle {
      width: 50px;
      height: 50px;
      border: 5px solid #f3f3f3;
      border-top: 5px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 2rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .waiting-message {
      font-size: 1.5rem;
      margin: 1rem 0;
      opacity: 0;
      animation: fadeInOut 2s ease-in-out infinite;
    }
    @keyframes fadeInOut {
      0% { opacity: 0.3; }
      50% { opacity: 1; }
      100% { opacity: 0.3; }
    }
  `;
  document.head.appendChild(waitingStyles);

  socket.on("joinedSuccess", (data) => {
    adminControls.classList.add("hidden");
    settingsBtn.classList.add("hidden");
    // הסתרת רק הקוד עבור שחקנים רגילים
    gameCodeDisplay.classList.add("hidden");
    if (shareCodeText) {
      shareCodeText.textContent = "אנא המתן עד שמנהל המשחק יתחיל...";
      shareCodeText.classList.add("waiting-text");
      shareCodeText.classList.remove("hidden");
    }
    updatePlayerList(data.players);
    previousPlayers = data.players;
    showScreen("lobby");
  });

  socket.on("joinedMidGame", (data) => {
    const waitingMessage = waitingScreen.querySelector(".waiting-message");
    waitingMessage.textContent = "המתן לסיום הסבב הנוכחי כדי להצטרף למשחק...";
    showScreen("waiting");
  });

  socket.on("updatePlayerList", (players) => {
    // בדיקה אם נותרו פחות משלושה שחקנים
    if (
      players.length < 3 &&
      currentScreen !== "home" &&
      currentScreen !== "nameEntry" &&
      currentScreen !== "endGame"
    ) {
      socket.emit("endGame", gameCode, "not_enough_players");
    }
    updatePlayerList(players);
    previousPlayers = players;
  });

  socket.on("roundStart", (data) => {
    // אם השחקן היה במסך המתנה, נעביר אותו למשחק
    if (currentScreen === "waiting") {
      showScreen("game");
    }

    // הצגת הקוד בheader כשהמשחק מתחיל
    const headerGameCode = document.querySelector(".header-game-code");
    if (headerGameCode) {
      headerGameCode.style.display = "flex";
    }

    const impostorWordDisplay = document.getElementById(
      "impostor-word-display"
    );
    const toggleImpostorBtn = document.getElementById("toggle-impostor-btn");

    wordDisplayContainer.classList.remove("hidden");
    impostorDisplay.classList.add("hidden");
    wordDisplay.classList.remove("word-hidden");
    if (impostorWordDisplay)
      impostorWordDisplay.classList.remove("word-hidden");
    toggleWordBtn.textContent = "הסתר מילה";
    if (toggleImpostorBtn) toggleImpostorBtn.textContent = "הסתר מילה";
    timerDisplay.style.opacity = 0;
    if (data.isImpostor) {
      wordDisplayContainer.classList.add("hidden");
      impostorDisplay.classList.remove("hidden");
      impostorWordDisplay.classList.remove("word-hidden");
      impostorCategoryInfo.classList.remove("word-hidden");

      if (data.category) {
        impostorCategoryInfo.textContent = `(קטגוריה: ${data.category})`;
      } else {
        impostorCategoryInfo.textContent = "";
      }

      // וידוא שיש כפתור הסתרה למתחזה ואתחול שלו
      const toggleImpostorBtn = document.getElementById("toggle-impostor-btn");
      if (toggleImpostorBtn) {
        toggleImpostorBtn.onclick = () => {
          const impostorWordDisplay = document.getElementById(
            "impostor-word-display"
          );
          if (impostorWordDisplay) {
            impostorWordDisplay.classList.toggle("word-hidden");
            impostorCategoryInfo.classList.toggle("word-hidden");
            const isHidden =
              impostorWordDisplay.classList.contains("word-hidden");
            toggleImpostorBtn.textContent = isHidden ? "הצג מילה" : "הסתר מילה";
          }
        };
      }
    } else {
      wordDisplayContainer.classList.remove("hidden");
      impostorDisplay.classList.add("hidden");
      wordDisplay.textContent = data.word;
    }

    setTimeout(() => {
      timerDisplay.style.opacity = 1;
      updateTimerDisplay(data.timeLeft);
    }, 3000);

    showScreen("game");
  });

  socket.on("startVoting", (data) => {
    // אם השחקן במסך המתנה, נעדכן את ההודעה
    if (currentScreen === "waiting") {
      const waitingMessage = document.querySelector(".waiting-message");
      waitingMessage.textContent = "ממש בעוד כמה רגעים יתחיל הסבב החדש ותיכנס";
      return;
    }

    if (typeof data === "object" && data.tieBreak) {
      // מקרה של הצבעת שובר שוויון
      showVotingScreen(data.players, {
        canVote: data.canVote,
        isPartOfTie: data.isPartOfTie,
        excludedFromVoting: data.excludedFromVoting,
        tiePlayers: data.tiePlayers,
      });
    } else {
      // הצבעה רגילה
      showVotingScreen(data);
    }
  });

  socket.on("roundResult", (data) => {
    const { impostor, word, correctlyGuessed, players } = data;

    // אם השחקן במסך המתנה, נעדכן את ההודעה
    if (currentScreen === "waiting") {
      const waitingMessage = document.querySelector(".waiting-message");
      waitingMessage.textContent = "הסבב הבא מתחיל ממש עכשיו!";
      return;
    }

    // Remove voting overlay if exists
    const waitingOverlay = document.getElementById("waiting-vote-overlay");
    if (waitingOverlay) {
      waitingOverlay.classList.add("hidden");
    }

    // בדיקה האם יש customMessage (במקרה שהמתחזה יצא באמצע)
    if (data.customMessage) {
      resultTitle.textContent = "אהמממ נראה שהמתחזה יצא מהמשחק...";
      resultTitle.style.color = "white"; // צבע ניטרלי
      resultInfo.textContent = "עצרנו את הסבב הזה מוקדם, אף אחד לא קיבל ניקוד";
    } else {
      // הצגת הודעה מותאמת לפי זהות השחקן והתוצאה
      const successColor = "#4CAF50"; // ירוק
      const failureColor = "#f44336"; // אדום

      if (correctlyGuessed) {
        if (myId === impostor.id) {
          resultTitle.textContent = "תפסו אותך!";
          resultTitle.style.color = failureColor;
          resultInfo.textContent = `המילה הייתה "${word}"`;
        } else {
          resultTitle.textContent = "הצלחתם לתפוס את המתחזה!";
          resultTitle.style.color = successColor;
          resultInfo.textContent = `המתחזה היה ${impostor.name}`;
        }
      } else {
        if (myId === impostor.id) {
          resultTitle.textContent = "ניצחת!";
          resultTitle.style.color = successColor;
          resultInfo.textContent = `המילה הייתה "${word}"`;
        } else {
          resultTitle.textContent = "המתחזה הצליח לברוח...";
          resultTitle.style.color = failureColor;
          resultInfo.textContent = `המתחזה היה ${impostor.name}`;
        }
      }
    }
    resultScreen.dataset.impostorFound = correctlyGuessed;
    updateScoreList(players, scoreListUl, true);

    // Setup controls based on user role
    if (isAdmin) {
      // Show admin controls
      adminResultControls.classList.remove("hidden");
      waitingForAdminMsg.classList.add("hidden");

      // Update next round button to be primary
      nextRoundBtn.className = "primary-button";
      nextRoundBtn.textContent = "המשך משחק";

      // Update end game button to be text-only
      endGameBtnFromResult.className = "text-button";
      endGameBtnFromResult.textContent = "סיום משחק";
    } else {
      // Find admin and update message
      const adminPlayer = players.find((p) => p.isAdmin);
      adminResultControls.classList.add("hidden");
      waitingForAdminMsg.textContent = `${adminPlayer.name} ימשיך את המשחק מיד`;
      waitingForAdminMsg.classList.remove("hidden");
    }

    showScreen("result");
  });

  socket.on("gameEnded", (data) => {
    // בדיקה האם קיבלנו אובייקט עם מידע נוסף או רק רשימת שחקנים
    const players = Array.isArray(data) ? data : data.players;
    const reason = data.reason;

    // הפעלת אנימציית קונפטי רק אם זה סיום משחק רגיל
    if (!reason) {
      createConfetti();
    }

    // עדכון כותרת לפי סיבת הסיום
    const endGameTitle = document.querySelector("#end-game-screen h2");
    if (reason === "not_enough_players") {
      endGameTitle.textContent = "המשחק נעצר כי נותרו פחות מ־3 שחקנים";
    } else {
      endGameTitle.textContent = "המשחק נגמר!";
    }

    let maxScore = -1;
    players.forEach((p) => {
      if (p.score > maxScore) maxScore = p.score;
    });
    const winners = players.filter((p) => p.score === maxScore && maxScore > 0);

    winnerListDiv.innerHTML = "";
    if (winners.length > 0) {
      winners.forEach((winner) => {
        const winnerCard = document.createElement("div");
        winnerCard.className = "winner-card";
        winnerCard.innerHTML = `
                <img src="/avatars/${winner.avatar.file}" class="avatar-circle-large">
                <span class="player-name">${winner.name}</span>
            `;
        winnerListDiv.appendChild(winnerCard);
      });
    } else {
      winnerListDiv.textContent = "אין מנצחים בסבב זה.";
    }

    updateScoreList(players, finalScoreListUl, false); // No animation for final screen
    showScreen("endGame");
  });

  // --- Helper Functions ---
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function validateCodeInputs() {
    const code = Array.from(codeInputs)
      .map((input) => input.value)
      .join("");
    joinGameBtn.disabled = code.length !== 4;
  }

  function showRandomAvatarPreview() {
    if (availableAvatars.length > 0) {
      const randomFile =
        availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
      avatarPreviewContainer.innerHTML = `<img src="/avatars/${randomFile}" alt="Avatar Preview" class="avatar-circle-preview">`;
      return randomFile;
    }
    return null;
  }

  function updatePlayerList(players) {
    playerListUl.innerHTML = "";
    players.forEach((player) => {
      const li = document.createElement("li");
      li.dataset.id = player.id;

      const playerInfoDiv = document.createElement("div");
      playerInfoDiv.innerHTML = `<img src="/avatars/${player.avatar.file}" class="avatar-circle-small">`;

      const nameSpan = document.createElement("span");
      nameSpan.className = "player-name";
      nameSpan.style.color = player.avatar.color;
      nameSpan.textContent = player.name;
      playerInfoDiv.appendChild(nameSpan);

      li.appendChild(playerInfoDiv);

      if (player.isAdmin) {
        const adminSpan = document.createElement("span");
        adminSpan.className = "admin-tag";
        adminSpan.textContent = " (מנהל)";
        adminSpan.style.color = player.avatar.color;
        adminSpan.style.opacity = "0.8";
        li.appendChild(adminSpan);
      }

      playerListUl.appendChild(li);
    });
    playerCountSpan.textContent = players.length;
    if (isAdmin) {
      const canStart = players.length >= 3;
      startGameBtn.disabled = !canStart;
      startGameHint.classList.toggle("hidden", canStart);
    }
  }

  function populateCategorySettings() {
    categoryListDiv.innerHTML = "";
    allCategories.forEach((cat) => {
      const item = document.createElement("div");
      item.className = "category-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `cat-${cat.id}`;
      checkbox.value = cat.id;
      checkbox.checked = enabledCategories.includes(cat.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          if (!enabledCategories.includes(cat.id)) {
            enabledCategories.push(cat.id);
          }
        } else {
          // בדיקה שזו לא הקטגוריה האחרונה
          if (enabledCategories.length > 1) {
            enabledCategories = enabledCategories.filter((c) => c !== cat.id);
          } else {
            // אם זו הקטגוריה האחרונה, מבטלים את השינוי
            checkbox.checked = true;
            return;
          }
        }
        socket.emit("changeSettings", {
          gameCode,
          settings: { enabledCategories },
        });
      });
      const label = document.createElement("label");
      label.htmlFor = `cat-${cat.id}`;
      label.textContent = cat.name;
      item.appendChild(checkbox);
      item.appendChild(label);
      item.addEventListener("click", (e) => {
        if (e.target === item) checkbox.click();
      });
      categoryListDiv.appendChild(item);
    });
  }

  function updateTimerDisplay(timeLeft) {
    const minutes = Math.floor(timeLeft / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (timeLeft % 60).toString().padStart(2, "0");
    timerDisplay.textContent = `${minutes}:${seconds}`;
  }

  socket.on("timerUpdate", (timeLeft) => {
    updateTimerDisplay(timeLeft);
  });

  function showVotingScreen(players) {
    // Clear previous voting state if exists
    const existingOverlay = document.getElementById("waiting-vote-overlay");
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const voteOptionsDiv = document.getElementById("vote-options");
    voteOptionsDiv.innerHTML = "";
    voteOptionsDiv.classList.remove("voting-done");

    // הצגת כותרת הצבעה
    const votingScreen = document.getElementById("voting-screen");
    const mainTitle = votingScreen.querySelector("h2");
    mainTitle.textContent = "מי המתחזה?";
    if (mainTitle) mainTitle.classList.remove("hidden");

    // יצירת overlay חדש להמתנה
    const waitingOverlay = document.createElement("div");
    waitingOverlay.id = "waiting-vote-overlay";
    waitingOverlay.className = "hidden";
    waitingOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0,0,0,0.85);
      z-index: 999;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    `;
    waitingOverlay.innerHTML = `
      <h2 style="color:white;">הצבעתך התקבלה</h2>
      <p style="color:#eee;font-size:1.2rem;">אנא המתן לשאר המשתתפים...</p>
    `;
    votingScreen.appendChild(waitingOverlay);

    // הצבעה רגילה - כל השחקנים חוץ מהמצביע עצמו
    const playersToVoteFor = players.filter((p) => p.id !== myId);

    playersToVoteFor.forEach((player) => {
      const btn = document.createElement("button");
      btn.className = "vote-btn";
      btn.addEventListener("click", () => {
        // Disable all vote buttons and show overlay
        voteOptionsDiv.classList.add("voting-done");
        document
          .querySelectorAll(".vote-btn")
          .forEach((b) => (b.disabled = true));
        document
          .getElementById("waiting-vote-overlay")
          .classList.remove("hidden");

        // Send vote to server
        socket.emit("playerVote", {
          gameCode,
          votedForId: player.id,
        });
      });
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
    showScreen("voting");
  }

  function updateScoreList(players, listElement, withAnimation) {
    const oldPositions = {};
    if (withAnimation) {
      Array.from(listElement.children).forEach((li) => {
        oldPositions[li.dataset.id] = li.getBoundingClientRect();
      });
    }

    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const maxScore = sortedPlayers.length > 0 ? sortedPlayers[0].score : 0;

    listElement.innerHTML = "";

    sortedPlayers.forEach((player) => {
      const li = document.createElement("li");
      li.dataset.id = player.id;

      if (withAnimation && maxScore > 0 && player.score === maxScore) {
        li.classList.add("top-player");
        li.style.borderColor = player.avatar.color;
      }

      const scoreDiff =
        player.score -
        (previousPlayers.find((p) => p.id === player.id)?.score || 0);

      li.innerHTML = `
            <div>
                <img src="/avatars/${player.avatar.file}" class="avatar-circle-small">
                <span class="player-name" style="color: ${player.avatar.color};">${player.name}</span>
            </div>
            <div class="player-score-wrapper">
                <span class="player-score">${player.score} נק'</span>
            </div>
        `;

      if (withAnimation && scoreDiff > 0) {
        const scoreChangeSpan = document.createElement("span");
        scoreChangeSpan.className = "score-change";
        scoreChangeSpan.textContent = `+${scoreDiff}`;
        li.querySelector(".player-score-wrapper").appendChild(scoreChangeSpan);
        scoreChangeSpan.addEventListener("animationend", () =>
          scoreChangeSpan.remove()
        );
      }

      listElement.appendChild(li);
    });

    if (withAnimation) {
      const newPositions = {};
      Array.from(listElement.children).forEach((li) => {
        newPositions[li.dataset.id] = li.getBoundingClientRect();
      });

      Array.from(listElement.children).forEach((li) => {
        const oldPos = oldPositions[li.dataset.id];
        if (!oldPos) return;
        const newPos = newPositions[li.dataset.id];
        const deltaX = oldPos.left - newPos.left;
        const deltaY = oldPos.top - newPos.top;

        requestAnimationFrame(() => {
          li.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          li.style.transition = "transform 0s";

          requestAnimationFrame(() => {
            li.style.transform = "";
            li.style.transition = "transform 0.6s ease-in-out";
          });
        });
      });
    }
    previousPlayers = players;
  }

  document.querySelectorAll(".timer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector(".timer-btn.active").classList.remove("active");
      btn.classList.add("active");
      socket.emit("changeSettings", {
        gameCode,
        settings: { timer: parseInt(btn.dataset.time) },
      });
    });
  });

  showCategoryToggle.addEventListener("change", (e) => {
    socket.emit("changeSettings", {
      gameCode,
      settings: { showCategory: e.target.checked },
    });
  });

  showScreen("home"); // Initial screen

  // --- Modal Message ---
  // טיפול בהעברת תפקיד המנהל
  socket.on("adminChanged", (data) => {
    const { newAdminId, newAdminName, players } = data;

    // עדכון המשתנים הגלובליים
    if (myId === newAdminId) {
      isAdmin = true;
      // הצגת הודעה למנהל החדש
      showModalMessage(
        "המנהל יצא מהמשחק ומעכשיו אתה מנהל המשחק. אתה קובע את קצב הסבבים. קוד המשחק נמצא בצד שמאל למעלה.",
        {
          okText: "הבנתי",
          onOk: () => {
            // מציג את כפתור ההגדרות והקוד למנהל החדש
            const headerGameCode = document.getElementById("header-game-code");
            headerGameCode.classList.remove("hidden");
            headerGameCode.textContent = gameCode;
            document
              .getElementById("header-settings-btn")
              .classList.remove("hidden");
          },
        }
      );
    }

    // עדכון רשימת השחקנים
    updatePlayerList(players);
  });

  function showModalMessage(message, options = {}) {
    const overlay = document.getElementById("modal-overlay");
    const box = document.getElementById("modal-message-box");
    const textDiv = document.getElementById("modal-message-text");
    const actionsDiv = document.getElementById("modal-message-actions");

    textDiv.textContent = message;
    overlay.classList.remove("hidden");

    // ניקוי כפתורים קיימים
    actionsDiv.innerHTML = "";

    if (options.type === "admin_leave") {
      // הוספת הודעת הסבר אם יש
      if (options.message) {
        const explanationDiv = document.createElement("div");
        explanationDiv.className = "modal-explanation";
        explanationDiv.textContent = options.message;
        explanationDiv.style.color = "var(--text-muted)";
        explanationDiv.style.fontSize = "0.9rem";
        explanationDiv.style.marginTop = "10px";
        textDiv.appendChild(explanationDiv);
      }

      // יצירת כפתורים מותאמים
      options.buttons.forEach((button) => {
        const btn = document.createElement("button");
        btn.textContent = button.text;
        btn.className = `modal-btn modal-btn-${button.style}`;
        btn.onclick = () => {
          overlay.classList.add("hidden");
          button.action();
        };
        actionsDiv.appendChild(btn);
      });
    } else {
      // הלוגיקה המקורית לכפתורי אישור/ביטול
      const okBtn = document.createElement("button");
      okBtn.textContent = options.okText || "אישור";
      okBtn.className = "modal-btn";
      okBtn.onclick = () => {
        overlay.classList.add("hidden");
        if (options.onOk) options.onOk();
      };
      actionsDiv.appendChild(okBtn);

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
    }

    // לחיצה מחוץ לחלון תסגור את החלון
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.add("hidden");
        if (options.onCancel) options.onCancel();
      }
    };
  }
});
