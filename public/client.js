document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // --- State ---
  let myId = null;
  let myName = "";
  let gameCode = "";
  let isAdmin = false;
  let isCreatingGame = false;
  let availableAvatars = [];
  let chosenAvatarFile = null;
  let currentScreen = "home";
  let confirmationCallback = null;

  // --- Screen Elements ---
  const screens = {
    home: document.getElementById("home-screen"),
    nameEntry: document.getElementById("name-entry-screen"),
    lobby: document.getElementById("lobby-screen"),
    game: document.getElementById("game-screen"),
    voting: document.getElementById("voting-screen"),
    result: document.getElementById("result-screen"),
    gameOver: document.getElementById("game-over-screen"),
  };

  // --- UI Elements ---
  const header = document.getElementById("app-header");
  const headerTitle = document.getElementById("header-title");
  const headerBackBtn = document.getElementById("header-back-btn");
  const headerCreateBtn = document.getElementById("header-create-btn");
  const headerSettingsBtn = document.getElementById("header-settings-btn");
  const codeInputs = document.querySelectorAll(".code-input");
  const joinGameBtn = document.getElementById("join-game-btn");
  const nameInput = document.getElementById("name-input");
  const charCounter = document.getElementById("char-counter");
  const submitNameBtn = document.getElementById("submit-name-btn");
  const avatarPreviewContainer = document.getElementById(
    "avatar-preview-container"
  );
  const shareCodeText = document.querySelector(".share-code-text");
  const gameCodeDisplay = document.getElementById("game-code-display");
  const playerCountSpan = document.getElementById("player-count");
  const playerListUl = document.getElementById("player-list");
  const adminControls = document.getElementById("admin-controls");
  const startGameBtn = document.getElementById("start-game-btn");
  const startGameHint = document.getElementById("start-game-hint");
  const timerDisplay = document.getElementById("timer-display");
  const wordDisplayContainer = document.getElementById(
    "word-display-container"
  );
  const impostorDisplay = document.getElementById("impostor-display");
  const wordDisplay = document.getElementById("word-display");
  const impostorCategoryInfo = document.getElementById(
    "impostor-category-info"
  );
  const votingTitle = document.getElementById("voting-title");
  const votingSubtitle = document.getElementById("voting-subtitle");
  const voteOptions = document.getElementById("vote-options");
  const settingsModal = document.getElementById("settings-modal");
  const closeSettingsBtn = document.getElementById("close-settings-btn");
  const toastContainer = document.getElementById("toast-container");
  const confirmationDialog = document.getElementById("confirmation-dialog");
  const confirmMsg = document.getElementById("confirmation-message");
  const confirmYesBtn = document.getElementById("confirm-yes-btn");
  const confirmNoBtn = document.getElementById("confirm-no-btn");

  // --- Toast & Confirmation System ---
  function showToast(message, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  function showConfirmation(message, callback) {
    confirmationCallback = callback;
    confirmMsg.textContent = message;
    confirmationDialog.classList.remove("hidden");
  }

  confirmYesBtn.addEventListener("click", () => {
    if (confirmationCallback) confirmationCallback(true);
    confirmationDialog.classList.add("hidden");
  });

  confirmNoBtn.addEventListener("click", () => {
    if (confirmationCallback) confirmationCallback(false);
    confirmationDialog.classList.add("hidden");
  });

  // --- Screen Management ---
  function updateHeader(screenName) {
    headerBackBtn.classList.add("hidden");
    headerCreateBtn.classList.add("hidden");
    headerSettingsBtn.classList.add("hidden");
    headerTitle.classList.remove("hidden");

    switch (screenName) {
      case "home":
        headerCreateBtn.classList.remove("hidden");
        break;
      case "nameEntry":
      case "lobby":
        headerBackBtn.classList.remove("hidden");
        if (isAdmin && screenName === "lobby") {
          headerTitle.classList.add("hidden");
          headerSettingsBtn.classList.remove("hidden");
        }
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

  headerBackBtn.addEventListener("click", () => {
    if (currentScreen === "nameEntry") showScreen("home");
    else if (currentScreen === "lobby") window.location.reload();
  });

  headerSettingsBtn.addEventListener("click", () =>
    settingsModal.classList.remove("hidden")
  );

  codeInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, "");
      if (e.target.value && index < codeInputs.length - 1) {
        codeInputs[index + 1].focus();
      }
      validateCodeInputs();
    });
    input.addEventListener("focus", (e) => e.target.select());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && index > 0) {
        codeInputs[index - 1].focus();
      }
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

  nameInput.addEventListener("input", () => {
    charCounter.textContent = `${nameInput.value.length}/10`;
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
      showToast("אנא הזן את שמך", "error");
    }
  });

  startGameBtn.addEventListener("click", () =>
    socket.emit("startGame", gameCode)
  );
  closeSettingsBtn.addEventListener("click", () =>
    settingsModal.classList.add("hidden")
  );

  document
    .getElementById("continue-btn")
    .addEventListener("click", () => socket.emit("startNextRound", gameCode));

  document.getElementById("end-game-btn").addEventListener("click", () => {
    showConfirmation("האם אתה בטוח? המשחק יסתיים לכולם.", (confirmed) => {
      if (confirmed) socket.emit("endGame", gameCode);
    });
  });

  document
    .getElementById("settings-after-round-btn")
    .addEventListener("click", () => settingsModal.classList.remove("hidden"));
  document
    .getElementById("back-to-home-btn")
    .addEventListener("click", () => window.location.reload());

  // --- Socket Listeners ---
  socket.on("connect", () => (myId = socket.id));
  socket.on("avatarList", (avatars) => (availableAvatars = avatars));
  socket.on("errorMsg", (message) => showToast(message, "error"));

  socket.on("gameCodeValid", () => {
    isCreatingGame = false;
    showNameEntryScreen();
  });

  socket.on("gameCreated", (data) => {
    gameCode = data.gameCode;
    isAdmin = true;
    myName = data.players.find((p) => p.id === myId).name;
    gameCodeDisplay.textContent = gameCode;
    updatePlayerList(data.players);
    showScreen("lobby");
  });

  socket.on("joinedSuccess", (data) => {
    gameCode = data.gameCode;
    isAdmin = false;
    myName = data.players.find((p) => p.id === myId).name;
    updatePlayerList(data.players);
    showScreen("lobby");
  });

  socket.on("updatePlayerList", (players) => updatePlayerList(players));

  socket.on("roundStart", (data) => {
    document.getElementById("score-list").innerHTML = ""; // Clear old scores
    wordDisplayContainer.classList.add("hidden");
    impostorDisplay.classList.add("hidden");
    impostorCategoryInfo.textContent = "";

    if (data.isImpostor) {
      impostorDisplay.classList.remove("hidden");
      if (data.category) {
        impostorCategoryInfo.textContent = `הקטגוריה היא: ${data.category}`;
      }
    } else {
      wordDisplayContainer.classList.remove("hidden");
      wordDisplay.textContent = data.word;
    }
    showScreen("game");
    socket.emit("getPlayersForVoting", gameCode); // Pre-fetch players for voting screen
  });

  socket.on("playerListForVoting", (players) => {
    votingTitle.textContent = "הצבעה!";
    votingSubtitle.textContent = "מי לדעתך המתחזה?";
    voteOptions.innerHTML = "";

    players
      .filter((p) => p.id !== myId)
      .forEach((player) => {
        const btn = createVoteButton(player);
        btn.addEventListener("click", () => {
          voteOptions.innerHTML = `<p style="color: var(--text-color);">תודה על הצבעתך!</p>`;
          socket.emit("vote", { gameCode, votedPlayerId: player.id });
        });
        voteOptions.appendChild(btn);
      });
    showScreen("voting");
  });

  socket.on("roundResult", (data) => {
    updateScoreList(data.players, data.scoreChanges);
    const resultTitle = document.getElementById("result-title");
    const resultInfo = document.getElementById("result-info");

    resultTitle.textContent = data.message;
    resultInfo.textContent = `המילה הייתה: ${data.word}. המתחזה היה ${data.impostorName}.`;

    const adminControls = document.getElementById("result-admin-controls");
    adminControls.classList.toggle("hidden", !isAdmin);

    showScreen("result");
  });

  socket.on("tieVote", ({ candidates, voterIds }) => {
    votingTitle.textContent = "דו-קרב!";
    voteOptions.innerHTML = "";

    const isVoter = voterIds.includes(myId);
    const isCandidate = candidates.some((c) => c.id === myId);

    if (isCandidate) {
      votingSubtitle.textContent = `נוצר תיקו! ממתין להכרעת שאר השחקנים...`;
    } else if (isVoter) {
      votingSubtitle.textContent = `הכרע: מי המתחזה מבין השניים?`;
      candidates.forEach((player) => {
        const btn = createVoteButton(player);
        btn.addEventListener("click", () => {
          voteOptions.innerHTML =
            '<p style="color: var(--text-color);">תודה על הצבעתך!</p>';
          socket.emit("submitTieVote", { gameCode, votedPlayerId: player.id });
        });
        voteOptions.appendChild(btn);
      });
    } else {
      votingSubtitle.textContent = "ממתיн להכרעת המצביעים...";
    }
    showScreen("voting");
  });

  socket.on("excludedFromTieVote", () => {
    showToast("נבחרת לא להצביע בסיבוב זה כדי למנוע תיקו נוסף.");
  });

  socket.on("gameOver", ({ players, customMessage }) => {
    if (customMessage) showToast(customMessage);

    const maxScore = Math.max(...players.map((p) => p.score));
    const winners = players.filter((p) => p.score === maxScore && maxScore > 0);
    document.getElementById("winner-name").textContent =
      winners.length > 0 ? winners.map((w) => w.name).join(", ") : "אין מנצחים";

    const finalScoreList = document.getElementById("final-score-list");
    finalScoreList.innerHTML = "";
    players
      .sort((a, b) => b.score - a.score)
      .forEach((p) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div>
                <img src="/avatars/${p.avatar.file}" class="avatar-circle-small">
                <span class="player-name" style="color: ${p.avatar.color};">${p.name}</span>
            </div>
            <span class="score-value">${p.score}</span>`;
        finalScoreList.appendChild(li);
      });

    showScreen("gameOver");
  });

  // --- Helper Functions ---
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

  function createVoteButton(player) {
    const btn = document.createElement("button");
    btn.className = "vote-btn";
    btn.innerHTML = `
        <img src="/avatars/${player.avatar.file}" class="avatar-circle-small">
        <span class="player-name" style="color: ${player.avatar.color};">${player.name}</span>`;
    return btn;
  }

  function lightenHexColor(hex, percent) {
    hex = hex.replace(/^#/, "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const newR = Math.min(255, Math.floor(r * (1 + percent / 100)));
    const newG = Math.min(255, Math.floor(g * (1 + percent / 100)));
    const newB = Math.min(255, Math.floor(b * (1 + percent / 100)));
    return `#${newR.toString(16).padStart(2, "0")}${newG
      .toString(16)
      .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
  }

  function updatePlayerList(players) {
    playerListUl.innerHTML = "";
    players.forEach((player) => {
      const li = document.createElement("li");
      li.innerHTML = `
            <img src="/avatars/${player.avatar.file}" class="avatar-circle-small">
            <span class="player-name" style="color: ${player.avatar.color};">${player.name}</span>`;
      if (player.isAdmin) {
        const adminSpan = document.createElement("span");
        adminSpan.textContent = " (מנהל)";
        adminSpan.style.color = player.avatar.color;
        adminSpan.style.fontWeight = "600";
        adminSpan.style.marginRight = "auto";
        li.appendChild(adminSpan);
      }
      playerListUl.appendChild(li);
    });
    playerCountSpan.textContent = players.length;
    adminControls.classList.toggle("hidden", !isAdmin);
    if (isAdmin) {
      startGameBtn.disabled = players.length < 3;
      startGameHint.classList.toggle("hidden", players.length >= 3);
    }
  }

  function updateScoreList(players, scoreChanges) {
    const scoreList = document.getElementById("score-list");
    const maxScore = Math.max(...players.map((p) => p.score));

    players.sort((a, b) => b.score - a.score);

    players.forEach((player, index) => {
      let li = scoreList.querySelector(`[data-id="${player.id}"]`);
      if (!li) {
        li = document.createElement("li");
        li.dataset.id = player.id;
        scoreList.appendChild(li);
      }

      li.style.order = index;
      li.innerHTML = `
            <div>
                <img src="/avatars/${player.avatar.file}" class="avatar-circle-small">
                <span class="player-name" style="color: ${player.avatar.color};">${player.name}</span>
            </div>
            <span class="score-value">${player.score}</span>
        `;

      li.classList.toggle("leader", player.score === maxScore && maxScore > 0);
      if (li.classList.contains("leader")) {
        const highlightColor = lightenHexColor(player.avatar.color, 40);
        li.style.setProperty("--highlight-color", highlightColor);
      } else {
        li.style.removeProperty("--highlight-color");
        li.style.borderColor = "transparent";
      }

      const changeData = scoreChanges.find((sc) => sc.id === player.id);
      if (changeData && changeData.change > 0) {
        const scoreSpan = li.querySelector(".score-value");
        const increaseAnim = document.createElement("span");
        increaseAnim.className = "score-increase";
        increaseAnim.textContent = `+${changeData.change}`;
        scoreSpan.appendChild(increaseAnim);
        setTimeout(() => increaseAnim.remove(), 1500);
      }
    });
  }

  showScreen("home");
});
