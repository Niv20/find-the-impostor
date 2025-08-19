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

  // --- Screen Elements ---
  const screens = {
    home: document.getElementById("home-screen"),
    nameEntry: document.getElementById("name-entry-screen"),
    lobby: document.getElementById("lobby-screen"),
    game: document.getElementById("game-screen"),
    voting: document.getElementById("voting-screen"),
    result: document.getElementById("result-screen"),
  };

  // --- UI Elements ---
  const codeInputs = document.querySelectorAll(".code-input");
  const joinGameBtn = document.getElementById("join-game-btn");
  const goToCreateBtn = document.getElementById("go-to-create-btn");
  const nameInput = document.getElementById("name-input");
  const charCounter = document.getElementById("char-counter");
  const submitNameBtn = document.getElementById("submit-name-btn");
  const avatarPreviewContainer = document.getElementById(
    "avatar-preview-container"
  );
  const nameEntryTitle = document.getElementById("name-entry-title");

  // Lobby
  const gameCodeDisplay = document.getElementById("game-code-display");
  const playerCountSpan = document.getElementById("player-count");
  const playerListUl = document.getElementById("player-list");
  const adminControls = document.getElementById("admin-controls");
  const startGameBtn = document.getElementById("start-game-btn");
  const startGameHint = document.getElementById("start-game-hint");
  const backToHomeBtn = document.getElementById("back-to-home-btn");

  // Settings
  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const closeSettingsBtn = document.getElementById("close-settings-btn");
  const categoryListDiv = document.getElementById("category-list");
  const showCategoryToggle = document.getElementById("show-category-toggle");

  // --- Screen Management ---
  function showScreen(screenName) {
    Object.values(screens).forEach((screen) => screen.classList.add("hidden"));
    if (screens[screenName]) {
      screens[screenName].classList.remove("hidden");
    }
  }

  function showNameEntryScreen() {
    chosenAvatarFile = showRandomAvatarPreview();
    nameInput.value = "";
    charCounter.textContent = "0/10";
    nameEntryTitle.textContent = isCreatingGame
      ? "צור משחק חדש"
      : "הצטרף למשחק";
    showScreen("nameEntry");
    nameInput.focus();
  }

  // --- Event Listeners ---

  // Home Screen
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
      } else if (e.key === "Enter" && !joinGameBtn.disabled) {
        joinGameBtn.click();
      }
    });
  });

  goToCreateBtn.addEventListener("click", () => {
    isCreatingGame = true;
    showNameEntryScreen();
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
  nameInput.addEventListener("input", () => {
    const len = nameInput.value.length;
    charCounter.textContent = `${len}/10`;
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
      alert("אנא הזן את שמך.");
    }
  });

  // Lobby & Settings
  backToHomeBtn.addEventListener("click", () => {
    if (isAdmin) {
      if (
        confirm("אתה מנהל המשחק. יציאה תסיים את המשחק עבור כולם. האם אתה בטוח?")
      ) {
        socket.emit("endGame", gameCode);
      }
    } else {
      window.location.reload();
    }
  });

  settingsBtn.addEventListener("click", () =>
    settingsModal.classList.remove("hidden")
  );
  closeSettingsBtn.addEventListener("click", () =>
    settingsModal.classList.add("hidden")
  );
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.add("hidden");
  });

  startGameBtn.addEventListener("click", () => socket.emit("startGame", gameCode));

  // --- Socket Listeners ---
  socket.on("connect", () => (myId = socket.id));
  socket.on("avatarList", (avatars) => (availableAvatars = avatars));

  socket.on("errorMsg", (message) => {
    alert(message);
    codeInputs.forEach((input) => (input.value = ""));
    joinGameBtn.disabled = true;
    showScreen("home");
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
    settingsBtn.classList.remove("hidden");

    populateCategorySettings();
    updatePlayerList(data.players);
    showScreen("lobby");
  });

  socket.on("joinedSuccess", (data) => {
    adminControls.classList.add("hidden");
    settingsBtn.classList.add("hidden");
    updatePlayerList(data.players);
    showScreen("lobby");
  });

  socket.on("updatePlayerList", (players) => updatePlayerList(players));

  // ... (rest of the socket listeners for game flow remain the same)
  socket.on("roundStart", (data) => {
    // ... same as before
  });
  socket.on("roundResult", (data) => {
    // ... same as before
  });
  socket.on("gameEnded", (message = "המשחק הסתיים.") => {
    alert(message);
    window.location.reload();
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
      const randomFile = availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
      avatarPreviewContainer.innerHTML = `<img src="/avatars/${randomFile}" alt="Avatar Preview" class="avatar-circle-preview">`;
      return randomFile;
    }
    return null;
  }

  function updatePlayerList(players) {
    playerListUl.innerHTML = "";
    players.forEach((player) => {
      const li = document.createElement("li");
      const avatarImg = `<img src="/avatars/${player.avatar.file}" class="avatar-circle-small">`;
      const nameSpan = `<span class="player-name" style="color: ${player.avatar.color};">${player.name}</span>`;
      li.innerHTML = `${avatarImg}${nameSpan}`;
      if (player.isAdmin) li.classList.add("admin");
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
      checkbox.id = `cat-${cat}`;
      checkbox.value = cat;
      checkbox.checked = enabledCategories.includes(cat);

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          enabledCategories.push(cat);
        } else {
          enabledCategories = enabledCategories.filter((c) => c !== cat);
        }
        socket.emit("changeSettings", {
          gameCode,
          settings: { enabledCategories },
        });
      });

      const label = document.createElement("label");
      label.htmlFor = `cat-${cat}`;
      label.textContent = cat;

      item.appendChild(checkbox);
      item.appendChild(label);
      categoryListDiv.appendChild(item);
    });
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

  // Dummy implementations for functions that were collapsed for brevity
  function startTimer(duration) { /* Full implementation exists */ }
  function showVotingScreen() { /* Full implementation exists */ }
  function updateScoreList(players) { /* Full implementation exists */ }
});
