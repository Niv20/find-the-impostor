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
  // Home
  const codeInputs = document.querySelectorAll(".code-input");
  const joinGameBtn = document.getElementById("join-game-btn");
  const goToCreateBtn = document.getElementById("go-to-create-btn");

  // Name Entry
  const nameEntryTitle = document.getElementById("name-entry-title");
  const avatarPreviewContainer = document.getElementById(
    "avatar-preview-container"
  );
  const nameInput = document.getElementById("name-input");
  const charCounter = document.getElementById("char-counter");
  const submitNameBtn = document.getElementById("submit-name-btn");

  // Lobby
  const lobbyTitle = document.getElementById("lobby-title");
  const lobbySubtitle = document.getElementById("lobby-subtitle");
  const gameCodeDisplay = document.getElementById("game-code-display");
  const playerCountSpan = document.getElementById("player-count");
  const playerListUl = document.getElementById("player-list");
  const adminControls = document.getElementById("admin-controls");
  const startGameBtn = document.getElementById("start-game-btn");

  // General
  const exitBtn = document.getElementById("exit-btn");

  // Game
  const timerDisplay = document.getElementById("timer-display");
  const wordDisplayContainer = document.getElementById(
    "word-display-container"
  );
  const wordDisplay = document.getElementById("word-display");
  const categoryDisplay = document.getElementById("category-display");
  const impostorDisplay = document.getElementById("impostor-display");
  const impostorCategoryInfo = document.getElementById(
    "impostor-category-info"
  );
  const toggleWordBtn = document.getElementById("toggle-word-btn");
  const voteOptionsDiv = document.getElementById("vote-options");
  const resultScreen = document.getElementById("result-screen");
  const resultTitle = document.getElementById("result-title");
  const resultInfo = document.getElementById("result-info");
  const scoreListUl = document.getElementById("score-list");

  // --- Screen Management ---
  function showScreen(screenName) {
    Object.values(screens).forEach((screen) => screen.classList.add("hidden"));
    if (screens[screenName]) {
      screens[screenName].classList.remove("hidden");
    }
    exitBtn.classList.toggle("hidden", screenName === "home");
  }

  function showNameEntryScreen() {
    chosenAvatarFile = showRandomAvatarPreview();
    nameInput.value = "";
    charCounter.textContent = "0/10";
    if (isCreatingGame) {
      nameEntryTitle.textContent = "צור משחק חדש";
    } else {
      nameEntryTitle.textContent = "הצטרף למשחק";
    }
    showScreen("nameEntry");
  }

  // --- Event Listeners ---

  // Home Screen Logic
  codeInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      // Allow only numbers
      e.target.value = e.target.value.replace(/[^0-9]/g, "");
      if (e.target.value && index < codeInputs.length - 1) {
        codeInputs[index + 1].focus();
      }
      validateCodeInputs();
    });

    input.addEventListener("focus", (e) => {
      e.target.select();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && index > 0) {
        codeInputs[index - 1].focus();
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

  // Name Entry Screen Logic
  nameInput.addEventListener("input", () => {
    const len = nameInput.value.length;
    charCounter.textContent = `${len}/10`;
    // Hebrew name validation
    const hebrewRegex = /^[א-ת\s]*$/;
    if (!hebrewRegex.test(nameInput.value)) {
      nameInput.value = nameInput.value.replace(/[^א-ת\s]/g, "");
    }
  });

  submitNameBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (name) {
      myName = name;
      if (isCreatingGame) {
        socket.emit("createGame", { name, requestedAvatarFile: chosenAvatarFile });
      } else {
        socket.emit("joinGame", { gameCode, name, requestedAvatarFile: chosenAvatarFile });
      }
    } else {
      alert("אנא הזן את שמך.");
    }
  });

  // General
  exitBtn.addEventListener("click", () => {
    if (isAdmin) {
      if (
        confirm("אתה מנהל המשחק. יציאה תסיים את המשחק עבור כולם. האם אתה בטוח?")
      ) {
        socket.emit("endGame", gameCode);
      }
    } else {
      socket.emit("leaveGame", gameCode);
      window.location.reload();
    }
  });

  // Lobby Controls
  startGameBtn.addEventListener("click", () => {
    socket.emit("startGame", gameCode);
  });

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

  document
    .getElementById("show-category-toggle")
    .addEventListener("change", (e) => {
      socket.emit("changeSettings", {
        gameCode,
        settings: { showCategory: e.target.checked },
      });
    });

  // Game Screen
  toggleWordBtn.addEventListener("click", () => {
    const isHidden = wordDisplay.style.visibility === "hidden";
    wordDisplay.style.visibility = isHidden ? "visible" : "hidden";
    categoryDisplay.style.visibility = isHidden ? "visible" : "hidden";
    toggleWordBtn.textContent = isHidden ? "הסתר מילה" : "הצג מילה";
  });

  // --- Socket Listeners ---
  socket.on("connect", () => {
    myId = socket.id;
  });

  socket.on("avatarList", (avatars) => {
    availableAvatars = avatars;
  });

  socket.on("errorMsg", (message) => {
    alert(message);
    // Optionally reset UI, e.g., clear code inputs
    codeInputs.forEach(input => input.value = '');
    joinGameBtn.disabled = true;
    showScreen("home"); // Go back to home on error
  });

  socket.on("gameCodeValid", () => {
    isCreatingGame = false;
    showNameEntryScreen();
  });

  socket.on("gameCreated", (data) => {
    gameCode = data.gameCode;
    isAdmin = true;
    gameCodeDisplay.textContent = gameCode;
    gameCodeDisplay.classList.remove("hidden");
    adminControls.classList.remove("hidden");
    lobbyTitle.textContent = "המשחק נוצר!";
    lobbySubtitle.textContent = "שתף את הקוד עם חברים כדי שיוכלו להצטרף.";
    updatePlayerList(data.players);
    showScreen("lobby");
  });

  socket.on("joinedSuccess", (data) => {
    isAdmin = false;
    gameCodeDisplay.classList.add("hidden");
    adminControls.classList.add("hidden");
    lobbyTitle.textContent = "הצטרפת למשחק!";
    lobbySubtitle.textContent = "אנא המתן למנהל שיתחיל את המשחק...";
    updatePlayerList(data.players);
    showScreen("lobby");
  });

  socket.on("updatePlayerList", (players) => {
    updatePlayerList(players);
  });

  socket.on("roundStart", (data) => {
    wordDisplay.style.visibility = "visible";
    categoryDisplay.style.visibility = "visible";
    toggleWordBtn.textContent = "הסתר מילה";

    if (data.isImpostor) {
      wordDisplayContainer.classList.add("hidden");
      impostorDisplay.classList.remove("hidden");
      if (data.category) {
        impostorCategoryInfo.textContent = `הרמז שלך: הקטגוריה היא "${data.category}"`;
      } else {
        impostorCategoryInfo.textContent = "אין לך רמזים הפעם. בהצלחה!";
      }
    } else {
      wordDisplayContainer.classList.remove("hidden");
      impostorDisplay.classList.add("hidden");
      wordDisplay.textContent = data.word;
      categoryDisplay.textContent = `קטגוריה: ${data.category || "לא ידוע"}`;
    }

    startTimer(data.timer);
    showScreen("game");
  });

  socket.on("roundResult", (data) => {
    clearInterval(roundTimerInterval);
    resultScreen.dataset.impostorFound = data.impostorFound;

    if (data.customMessage) {
      resultTitle.textContent = data.customMessage;
    } else if (data.impostorFound) {
      resultTitle.textContent = "המתחזה נחשף!";
      resultInfo.textContent = `${data.impostorName} היה המתחזה! המילה הייתה: ${data.word}`;
    } else {
      resultTitle.textContent = "המתחזה ניצח!";
      resultInfo.textContent = `${data.impostorName} הצליח להטעות את כולם! המילה הייתה: ${data.word}`;
    }
    updateScoreList(data.players);
    showScreen("result");
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
      const randomAvatarFile =
        availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
      avatarPreviewContainer.innerHTML = `<img src="/avatars/${randomAvatarFile}" alt="Avatar Preview" class="avatar-circle-preview">`;
      return randomAvatarFile;
    } else {
      avatarPreviewContainer.innerHTML = ""; // Clear if no avatars
      return null;
    }
  }

  function createPlayerElement(player) {
    const li = document.createElement("li");
    const avatarImg = `<img src="/avatars/${player.avatar.file}" class="avatar-circle-small">`;
    const nameSpan = `<span class="player-name" style="color: ${player.avatar.color};">${player.name}</span>`;

    li.innerHTML = `${avatarImg}${nameSpan}`;

    if (player.isAdmin) {
      li.classList.add("admin");
    }
    return li;
  }

  function updatePlayerList(players) {
    playerListUl.innerHTML = "";
    players.forEach((player) => {
      playerListUl.appendChild(createPlayerElement(player));
    });
    playerCountSpan.textContent = players.length;
    if (isAdmin) {
      startGameBtn.disabled = players.length < 3;
    }
  }

  function updateScoreList(players) {
    scoreListUl.innerHTML = "";
    players.sort((a, b) => b.score - a.score);
    players.forEach((player) => {
      const li = document.createElement("li");
      const avatarImg = `<img src="/avatars/${player.avatar.file}" class="avatar-circle-small">`;
      const nameSpan = `<span class="player-name" style="color: ${player.avatar.color};">${player.name}</span>`;
      const scoreSpan = `<span>${player.score} נק'</span>`;

      li.innerHTML = `<div>${avatarImg}${nameSpan}</div>${scoreSpan}`;
      scoreListUl.appendChild(li);
    });
  }

  function startTimer(duration) {
    let timer = duration;
    clearInterval(roundTimerInterval);

    roundTimerInterval = setInterval(() => {
      const minutes = Math.floor(timer / 60);
      const seconds = timer % 60;
      timerDisplay.textContent = `${minutes}:${seconds
        .toString()
        .padStart(2, "0")}`;

      if (--timer < 0) {
        clearInterval(roundTimerInterval);
        timerDisplay.textContent = "הצבעה!";
        showVotingScreen();
      }
    }, 1000);
  }

  function showVotingScreen() {
    socket.emit("getPlayersForVoting", gameCode);
    socket.once("playerListForVoting", (players) => {
      voteOptionsDiv.innerHTML = "";
      players.forEach((player) => {
        if (player.id !== myId) {
          const btn = document.createElement("button");
          btn.className = "vote-btn";

          const avatarImg = `<img src="/avatars/${player.avatar.file}" class="avatar-circle-small">`;
          const nameSpan = `<span class="player-name" style="color: ${player.avatar.color};">${player.name}</span>`;
          btn.innerHTML = `${avatarImg}${nameSpan}`;

          btn.addEventListener("click", () => {
            voteOptionsDiv.innerHTML = "<p>תודה! ממתין לשאר השחקנים...</p>";
            socket.emit("vote", { gameCode, votedPlayerId: player.id });
          });
          voteOptionsDiv.appendChild(btn);
        }
      });
      showScreen("voting");
    });
  }
});