// Utility functions (placeholder previously empty)
const Utils = {
  ensureToastContainer() {
    let c = document.getElementById("toast-container");
    if (!c) {
      c = document.createElement("div");
      c.id = "toast-container";
      document.body.appendChild(c);
    }
    return c;
  },
  showToast(message, type = "info", duration = 3000) {
    const container = this.ensureToastContainer();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    // Force reflow then add show class for transition
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      toast.addEventListener("transitionend", () => toast.remove());
    }, duration);
  },

  // Show notification when player disconnects
  showDisconnectionNotification(playerName) {
    this.showToast(`${playerName} יצא מהמשחק`, "info", 2500);
  },

  // Show notification when word is skipped
  showSkipWordNotification(adminName) {
    this.showToast(`${adminName} דילג על המילה`, "info", 2500);
  },

  // Show avatar preview
  showAvatarPreview(avatarFile, container) {
    if (container) {
      container.innerHTML = `<img src="/avatars/${avatarFile}" class="avatar-circle-large">`;
    }
  },

  // Show random avatar preview and return file name
  showRandomAvatarPreview(availableAvatars, container) {
    if (availableAvatars && availableAvatars.length > 0) {
      const randomAvatar =
        availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
      this.showAvatarPreview(randomAvatar, container);
      return randomAvatar;
    }
    return "avatar1.png"; // fallback
  },

  // Create voting waiting overlay
  createVoteWaitingOverlay(parentElement) {
    const overlay = document.createElement("div");
    overlay.id = "waiting-vote-overlay";
    overlay.className = "waiting-overlay hidden";
    overlay.innerHTML = `
      <div class="waiting-content">
        <div class="loading-spinner"></div>
        <p>ממתין לשאר השחקנים...</p>
      </div>
    `;
    parentElement.appendChild(overlay);
    return overlay;
  },

  // Format time display
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}`;
  },

  // Animate score list changes
  animateScoreListChanges(listElement, newPlayers, previousPlayers) {
    // Simple implementation - just update content
    this.updateScoreListContent(listElement, newPlayers);
  },

  // Update score list content
  updateScoreListContent(listElement, players) {
    if (!listElement) return;

    listElement.innerHTML = "";
    players.forEach((player, index) => {
      const li = document.createElement("li");
      li.className = "score-item";
      li.innerHTML = `
        <div class="score-player-info">
          <img src="/avatars/${player.avatar.file}" class="avatar-circle-small">
          <span class="player-name" style="color: ${player.avatar.color}">${player.name}</span>
        </div>
        <span class="player-score">${player.score}</span>
      `;
      listElement.appendChild(li);
    });
  },

  // Validate code inputs
  validateCodeInputs(codeInputs) {
    return Array.from(codeInputs).every((input) => input.value.length === 1);
  },

  // Request wake lock to keep screen on
  requestWakeLock() {
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").catch((err) => {
        console.log("Wake lock failed:", err);
      });
    }
  },
};

window.Utils = window.Utils || Utils;
