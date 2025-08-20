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
  let currentScreen = 'home';
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
  const headerLogoContainer = document.getElementById('header-logo-container');
  const headerCreateBtn = document.getElementById('header-create-btn');
  const headerSettingsBtn = document.getElementById('header-settings-btn');
  const exitGameBtn = document.getElementById('exit-game-btn');

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
  const wordDisplayContainer = document.getElementById('word-display-container');
  const wordDisplay = document.getElementById('word-display');
  const toggleWordBtn = document.getElementById('toggle-word-btn');
  const impostorDisplay = document.getElementById('impostor-display');
  const impostorCategoryInfo = document.getElementById('impostor-category-info');

  // Result Screen
  const resultTitle = document.getElementById("result-title");
  const resultInfo = document.getElementById("result-info");
  const scoreListUl = document.getElementById("score-list");
  const adminResultControls = document.getElementById("admin-result-controls");
  const nextRoundBtn = document.getElementById("next-round-btn");
  const endGameBtnFromResult = document.getElementById("end-game-btn-from-result");
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
    headerCreateBtn.classList.add('hidden');
    headerSettingsBtn.classList.add('hidden');
    exitGameBtn.classList.add('hidden');
    headerLogoContainer.classList.remove('hidden');

    switch (screenName) {
      case 'home':
        headerCreateBtn.classList.remove('hidden');
        break;
      case 'lobby':
        if (isAdmin) {
            headerSettingsBtn.classList.remove('hidden');
        } else {
            exitGameBtn.classList.remove('hidden');
        }
        break;
      case 'game':
      case 'voting':
      case 'result':
        exitGameBtn.classList.remove('hidden');
        break;
      case 'nameEntry':
      case 'endGame':
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
      if (confirm(message)) {
          if (isAdmin) {
              socket.emit("endGame", gameCode);
          } else {
              window.location.reload();
          }
      }
  });

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
    const hebrewRegex = /^[א-ת\s]*$/;
    if (!hebrewRegex.test(nameInput.value)) {
      nameInput.value = nameInput.value.replace(/[^א-ת\s]/g, "");
    }
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

  // In-Game Buttons
  settingsBtn.addEventListener("click", () => settingsModal.classList.remove("hidden"));
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.add("hidden");
  });
  startGameBtn.addEventListener("click", () => {
    console.log('Start game button clicked, emitting startGame with code:', gameCode);
    socket.emit("startGame", gameCode);
  });
  nextRoundBtn.addEventListener("click", () => socket.emit("startGame", gameCode));
  endGameBtnFromResult.addEventListener("click", () => {
      if (confirm("האם אתה בטוח שברצונך לסיים את המשחק עבור כולם?")) {
          socket.emit("endGame", gameCode);
      }
  });
  playAgainBtn.addEventListener("click", () => window.location.reload());
  toggleWordBtn.addEventListener("click", () => {
      wordDisplay.classList.toggle('word-hidden');
      const isHidden = wordDisplay.classList.contains('word-hidden');
      toggleWordBtn.textContent = isHidden ? "הצג מילה" : "הסתר מילה";
  });

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
    if(shareCodeText) shareCodeText.textContent = "שתף עם חברים את הקוד:";
    populateCategorySettings();
    updatePlayerList(data.players);
    previousPlayers = data.players;
    showScreen("lobby");
  });

  socket.on("joinedSuccess", (data) => {
    adminControls.classList.add("hidden");
    settingsBtn.classList.add("hidden");
    if(shareCodeText) shareCodeText.textContent = "אנא המתן עד שמנהל המשחק יתחיל...";
    updatePlayerList(data.players);
    previousPlayers = data.players;
    showScreen("lobby");
  });

  socket.on("updatePlayerList", (players) => {
      updatePlayerList(players);
      previousPlayers = players;
  });

  socket.on("roundStart", (data) => {
    wordDisplayContainer.classList.remove('hidden');
    impostorDisplay.classList.add('hidden');
    wordDisplay.classList.remove('word-hidden');
    toggleWordBtn.textContent = "הסתר מילה";
    timerDisplay.style.opacity = 0;

    if (data.isImpostor) {
        wordDisplayContainer.classList.add('hidden');
        impostorDisplay.classList.remove('hidden');
        if (data.category) {
            impostorCategoryInfo.textContent = data.category;
        } else {
            impostorCategoryInfo.textContent = "";
        }
    } else {
        wordDisplayContainer.classList.remove('hidden');
        impostorDisplay.classList.add('hidden');
        wordDisplay.textContent = data.word;
    }
    
    setTimeout(() => {
        timerDisplay.style.opacity = 1;
        startTimer(data.timer);
    }, 3000);

    showScreen('game');
  });

  socket.on("startVoting", (players) => {
    showVotingScreen(players);
  });

  socket.on("roundResult", (data) => {
    const { impostor, word, correctlyGuessed, players } = data;
    resultTitle.textContent = correctlyGuessed ? "המתחזה נתפס!" : "המתחזה ניצח!";
    resultScreen.dataset.impostorFound = correctlyGuessed;
    resultInfo.textContent = `המתחזה היה ${impostor.name}. המילה הייתה "${word}".`;
    updateScoreList(players, scoreListUl, true);
    if (isAdmin) {
        adminResultControls.classList.remove("hidden");
        waitingForAdminMsg.classList.add("hidden");
    } else {
        adminResultControls.classList.add("hidden");
        waitingForAdminMsg.classList.remove("hidden");
    }
    showScreen("result");
  });

  socket.on("gameEnded", (players) => {
    let maxScore = -1;
    players.forEach(p => { if (p.score > maxScore) maxScore = p.score; });
    const winners = players.filter(p => p.score === maxScore && maxScore > 0);

    winnerListDiv.innerHTML = "";
    if (winners.length > 0) {
        winners.forEach(winner => {
            const winnerCard = document.createElement('div');
            winnerCard.className = 'winner-card';
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
    const code = Array.from(codeInputs).map((input) => input.value).join("");
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
      li.dataset.id = player.id;

      const playerInfoDiv = document.createElement('div');
      playerInfoDiv.innerHTML = `<img src="/avatars/${player.avatar.file}" class="avatar-circle-small">`;
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      nameSpan.style.color = player.avatar.color;
      nameSpan.textContent = player.name;
      playerInfoDiv.appendChild(nameSpan);

      li.appendChild(playerInfoDiv);

      if (player.isAdmin) {
        const adminSpan = document.createElement('span');
        adminSpan.className = 'admin-tag';
        adminSpan.textContent = ' (מנהל)';
        adminSpan.style.color = player.avatar.color;
        adminSpan.style.opacity = '0.8';
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
          if(!enabledCategories.includes(cat.id)) enabledCategories.push(cat.id);
        } else {
          enabledCategories = enabledCategories.filter((c) => c !== cat.id);
        }
        socket.emit("changeSettings", { gameCode, settings: { enabledCategories } });
      });
      const label = document.createElement("label");
      label.htmlFor = `cat-${cat.id}`;
      label.textContent = cat.name;
      item.appendChild(checkbox);
      item.appendChild(label);
      item.addEventListener('click', (e) => {
        if (e.target === item) checkbox.click();
      });
      categoryListDiv.appendChild(item);
    });
  }

  function startTimer(duration) {
    clearInterval(roundTimerInterval);
    let timer = duration;
    const update = () => {
        const minutes = Math.floor(timer / 60).toString().padStart(2, '0');
        const seconds = (timer % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${minutes}:${seconds}`;
        if (--timer < 0) {
            clearInterval(roundTimerInterval);
            socket.emit('timerEnded', gameCode);
        }
    };
    update();
    roundTimerInterval = setInterval(update, 1000);
  }

  function showVotingScreen(players) {
    const voteOptionsDiv = document.getElementById("vote-options");
    voteOptionsDiv.innerHTML = "";
    const playersToVoteFor = players.filter(p => p.id !== myId);
    playersToVoteFor.forEach((player) => {
        const btn = document.createElement("button");
        btn.className = "vote-btn";
        btn.addEventListener("click", () => {
            document.querySelectorAll('.vote-btn').forEach(b => b.disabled = true);
            socket.emit("playerVote", { gameCode, votedForId: player.id });
        });
        const avatarImg = document.createElement("img");
        avatarImg.src = `/avatars/${player.avatar.file}`;
        avatarImg.className = "avatar-circle-small";
        const nameSpan = document.createElement("span");
        nameSpan.textContent = player.name;
        btn.appendChild(avatarImg);
        btn.appendChild(nameSpan);
        voteOptionsDiv.appendChild(btn);
    });
    showScreen("voting");
  }

  function updateScoreList(players, listElement, withAnimation) {
    const oldPositions = {};
    if (withAnimation) {
        Array.from(listElement.children).forEach(li => {
            oldPositions[li.dataset.id] = li.getBoundingClientRect();
        });
    }

    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const maxScore = sortedPlayers.length > 0 ? sortedPlayers[0].score : 0;

    listElement.innerHTML = "";

    sortedPlayers.forEach(player => {
        const li = document.createElement("li");
        li.dataset.id = player.id;

        if (withAnimation && maxScore > 0 && player.score === maxScore) {
            li.classList.add("top-player");
            li.style.setProperty('--player-highlight-color', hexToRgba(player.avatar.color, 0.3));
        }

        const scoreDiff = player.score - (previousPlayers.find(p => p.id === player.id)?.score || 0);

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
            const scoreChangeSpan = document.createElement('span');
            scoreChangeSpan.className = 'score-change';
            scoreChangeSpan.textContent = `+${scoreDiff}`;
            li.querySelector('.player-score-wrapper').appendChild(scoreChangeSpan);
            scoreChangeSpan.addEventListener('animationend', () => scoreChangeSpan.remove());
        }

        listElement.appendChild(li);
    });

    if (withAnimation) {
        const newPositions = {};
        Array.from(listElement.children).forEach(li => {
            newPositions[li.dataset.id] = li.getBoundingClientRect();
        });

        Array.from(listElement.children).forEach(li => {
            const oldPos = oldPositions[li.dataset.id];
            if (!oldPos) return;
            const newPos = newPositions[li.dataset.id];
            const deltaX = oldPos.left - newPos.left;
            const deltaY = oldPos.top - newPos.top;

            requestAnimationFrame(() => {
                li.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                li.style.transition = 'transform 0s';

                requestAnimationFrame(() => {
                    li.style.transform = '';
                    li.style.transition = 'transform 0.6s ease-in-out';
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
      socket.emit("changeSettings", { gameCode, settings: { timer: parseInt(btn.dataset.time) } });
    });
  });

  showCategoryToggle.addEventListener("change", (e) => {
    socket.emit("changeSettings", { gameCode, settings: { showCategory: e.target.checked } });
  });

  showScreen('home'); // Initial screen
});