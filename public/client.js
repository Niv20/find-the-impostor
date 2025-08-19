document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // --- State ---
  let myId = null;
  let myName = "";
  let gameCode = "";
  let isAdmin = false;
  let roundTimerInterval;
  let availableAvatars = [];
  let previewAvatarElement; // To store the preview avatar element

  // --- Screen Elements ---
  const screens = {
    home: document.getElementById("home-screen"),
    lobby: document.getElementById("lobby-screen"),
    game: document.getElementById("game-screen"),
    voting: document.getElementById("voting-screen"),
    result: document.getElementById("result-screen"),
  };

  // --- UI Elements ---
  const nameInputs = document.querySelectorAll(".name-input");
  const joinGameBtn = document.getElementById("join-game-btn");
  const createGameBtn = document.getElementById("create-game-btn");
  const exitBtn = document.getElementById("exit-btn");
  const avatarPreviewContainer = document.getElementById(
    "avatar-preview-container"
  );

  // Lobby
  const gameCodeDisplay = document.getElementById("game-code-display");
  const playerCountSpan = document.getElementById("player-count");
  const playerListUl = document.getElementById("player-list");
  const adminControls = document.getElementById("admin-controls");
  const startGameBtn = document.getElementById("start-game-btn");

  // ... (שאר הגדרות האלמנטים נשארות זהות)
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

  // --- Event Listeners ---
  createGameBtn.addEventListener("click", () => {
    const name = document.getElementById("name-input-create").value.trim();
    if (name) {
      myName = name;
      socket.emit("createGame", { name });
    } else {
      alert("אנא הזן את שמך.");
    }
  });

  joinGameBtn.addEventListener("click", () => {
    const code = document.getElementById("game-code-input").value.trim();
    const name = document.getElementById("name-input-join").value.trim();
    if (code && name) {
      gameCode = code;
      myName = name;
      socket.emit("joinGame", { gameCode: code, name });
    } else {
      alert("אנא הזן קוד משחק ושם.");
    }
  });

  // Hebrew name validation
  nameInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const hebrewRegex = /^[א-ת\s]*$/;
      if (!hebrewRegex.test(input.value)) {
        input.value = input.value.replace(/[^א-ת\s]/g, "");
      }
    });
  });

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

  startGameBtn.addEventListener("click", () => {
    socket.emit("startGame", gameCode);
  });

  toggleWordBtn.addEventListener("click", () => {
    const isHidden = wordDisplay.style.visibility === "hidden";
    wordDisplay.style.visibility = isHidden ? "visible" : "hidden";
    categoryDisplay.style.visibility = isHidden ? "visible" : "hidden";
    toggleWordBtn.textContent = isHidden ? "הסתר מילה" : "הצג מילה";
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

  // --- Socket Listeners ---
  socket.on("connect", () => {
    myId = socket.id;
  });

  socket.on("avatarList", (avatars) => {
    availableAvatars = avatars;
    showRandomAvatarPreview();
  });

  socket.on("errorMsg", (message) => {
    alert(message);
  });

  socket.on("gameCreated", (data) => {
    gameCode = data.gameCode;
    isAdmin = true;
    gameCodeDisplay.textContent = gameCode;
    adminControls.classList.remove("hidden");
    updatePlayerList(data.players);
    showScreen("lobby");
  });

  socket.on("joinedSuccess", (data) => {
    gameCodeDisplay.textContent = gameCode;
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
  function showRandomAvatarPreview() {
    if (availableAvatars.length > 0) {
      const randomAvatarFile =
        availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
      avatarPreviewContainer.innerHTML = `<img src="/avatars/${randomAvatarFile}" alt="Avatar Preview" class="avatar-circle-preview">`;
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
      startGameBtn.disabled = players.length < 2;
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
