document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // --- State ---
  let myId = null;
  let myName = "";
  let gameCode = "";
  let isAdmin = false;
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
  const exitGameBtn = document.getElementById("exit-game-btn");

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
    exitGameBtn.classList.add("hidden");
    headerLogoContainer.classList.remove("hidden");

    switch (screenName) {
      case "home":
        headerCreateBtn.classList.remove("hidden");
        break;
      case "lobby":
        if (isAdmin) {
          headerSettingsBtn.classList.remove("hidden");
        } else {
          exitGameBtn.classList.remove("hidden");
        }
        break;
      case "game":
      case "voting":
      case "result":
        exitGameBtn.classList.remove("hidden");
        break;
      case "nameEntry":
      case "endGame":
        // No buttons shown, just logo
        break;
    }
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
  headerCreateBtn.addEventListener("click", () => {
    isCreatingGame = true;
    showNameEntryScreen();
  });

  exitGameBtn.addEventListener("click", () => {
    const message = isAdmin
      ? "אתה מנהל המשחק. יציאה תסיים את המשחק עבור כולם. האם אתה בטוח?"
      : "האם אתה בטוח שברצונך לצאת מהמשחק?";
    showModalMessage(message, {
      okText: isAdmin ? "סיים משחק" : "צא",
      cancelText: "ביטול",
      onOk: () => {
        if (isAdmin) {
          socket.emit("endGame", gameCode);
        } else {
          window.location.reload();
        }
      },
      onCancel: () => {},
    });
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
  });

  // מניעת הדבקה
  nameInput.addEventListener("paste", (e) => {
    e.preventDefault();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitNameBtn.click();
  });

  submitNameBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (name) {
      myName = name;
      const payload = { name, requestedAvatarFile: chosenAvatarFile };
      if (isCreatingGame) {
        socket.emit("createGame", payload);
      } else {
        payload.gameCode = gameCode;
        socket.emit("joinGame", payload);
      }
    } else {
      showModalMessage("אנא הזן את שמך.", {
        okText: "אישור",
        onOk: () => nameInput.focus(),
      });
    }
  });

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
    gameCodeDisplay.textContent = gameCode;
    gameCodeDisplay.classList.remove("hidden");
    adminControls.classList.remove("hidden");
    if (shareCodeText) shareCodeText.textContent = "שתף עם חברים את הקוד:";
    populateCategorySettings();
    updatePlayerList(data.players);
    previousPlayers = data.players;
    showScreen("lobby");
  });

  socket.on("joinedSuccess", (data) => {
    adminControls.classList.add("hidden");
    settingsBtn.classList.add("hidden");
    if (shareCodeText)
      shareCodeText.textContent = "אנא המתן עד שמנהל המשחק יתחיל...";
    updatePlayerList(data.players);
    previousPlayers = data.players;
    showScreen("lobby");
  });

  socket.on("updatePlayerList", (players) => {
    updatePlayerList(players);
    previousPlayers = players;
  });

  socket.on("roundStart", (data) => {
    wordDisplayContainer.classList.remove("hidden");
    impostorDisplay.classList.add("hidden");
    wordDisplay.classList.remove("word-hidden");
    toggleWordBtn.textContent = "הסתר מילה";
    timerDisplay.style.opacity = 0;

    if (data.isImpostor) {
      wordDisplayContainer.classList.add("hidden");
      impostorDisplay.classList.remove("hidden");
      if (data.category) {
        impostorCategoryInfo.textContent = `(קטגוריה: ${data.category})`;
      } else {
        impostorCategoryInfo.textContent = "";
      }
    } else {
      wordDisplayContainer.classList.remove("hidden");
      impostorDisplay.classList.add("hidden");
      wordDisplay.textContent = data.word;
    }

    setTimeout(() => {
      timerDisplay.style.opacity = 1;
      startTimer(data.timer);
    }, 3000);

    showScreen("game");
  });

  socket.on("startVoting", (players) => {
    showVotingScreen(players);
  });

  socket.on("roundResult", (data) => {
    const { impostor, word, correctlyGuessed, players } = data;

    // Remove voting overlay if exists
    const waitingOverlay = document.getElementById("waiting-vote-overlay");
    if (waitingOverlay) {
      waitingOverlay.classList.add("hidden");
    }

    resultTitle.textContent = correctlyGuessed
      ? "המתחזה נתפס!"
      : "המתחזה ניצח!";
    resultScreen.dataset.impostorFound = correctlyGuessed;
    resultInfo.textContent = `המתחזה היה ${impostor.name}. המילה הייתה "${word}".`;
    updateScoreList(players, scoreListUl, true);

    // Setup for next round
    if (isAdmin) {
      adminResultControls.classList.add("hidden");
      waitingForAdminMsg.textContent = "הסבב הבא יתחיל בעוד מספר שניות...";
      waitingForAdminMsg.classList.remove("hidden");
      setTimeout(() => {
        socket.emit("startGame", gameCode);
      }, 5000);
    } else {
      adminResultControls.classList.add("hidden");
      waitingForAdminMsg.textContent = "הסבב הבא יתחיל בעוד מספר שניות...";
      waitingForAdminMsg.classList.remove("hidden");
    }

    showScreen("result");
  });

  socket.on("gameEnded", (players) => {
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
                <img src="/avatars/${winner.avatar.file}" class="avatar-circle-small">
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
          if (!enabledCategories.includes(cat.id))
            enabledCategories.push(cat.id);
        } else {
          enabledCategories = enabledCategories.filter((c) => c !== cat.id);
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

  function startTimer(duration) {
    clearInterval(roundTimerInterval);
    let timer = duration;
    const update = () => {
      const minutes = Math.floor(timer / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (timer % 60).toString().padStart(2, "0");
      timerDisplay.textContent = `${minutes}:${seconds}`;
      if (--timer < 0) {
        clearInterval(roundTimerInterval);
        socket.emit("timerEnded", gameCode);
      }
    };
    update();
    roundTimerInterval = setInterval(update, 1000);
  }

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
        socket.emit("playerVote", { gameCode, votedForId: player.id });
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
        li.style.setProperty(
          "--player-highlight-color",
          hexToRgba(player.avatar.color, 0.3)
        );
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
  function showModalMessage(message, options = {}) {
    // options: { okText, cancelText, onOk, onCancel }
    const overlay = document.getElementById("modal-overlay");
    const box = document.getElementById("modal-message-box");
    const textDiv = document.getElementById("modal-message-text");
    const okBtn = document.getElementById("modal-ok-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");
    textDiv.textContent = message;
    okBtn.textContent = options.okText || "אישור";
    cancelBtn.textContent = options.cancelText || "ביטול";
    cancelBtn.classList.toggle("hidden", !options.onCancel);
    overlay.classList.remove("hidden");
    function closeModal() {
      overlay.classList.add("hidden");
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    }
    okBtn.onclick = () => {
      closeModal();
      if (options.onOk) options.onOk();
    };
    cancelBtn.onclick = () => {
      closeModal();
      if (options.onCancel) options.onCancel();
    };
  }
});
