// Input validation utilities for game inputs

class InputValidator {
  constructor() {
    this.setupCodeInputValidation();
    this.setupNameInputValidation();
    this.setupEnterKeyHandlers();
  }

  setupCodeInputValidation() {
    const codeInputs = document.querySelectorAll(".code-input");

    codeInputs.forEach((input, index) => {
      // Allow only digits 0-9
      input.addEventListener("keydown", (e) => {
        // Allow navigation & control keys & modifiers (no flash)
        const allowedKeys = [
          "Backspace",
          "Delete",
          "Tab",
          "Enter",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "Shift",
          "Control",
          "Alt",
          "Meta",
          "CapsLock",
          "Escape",
          "F1",
          "F2",
          "F3",
          "F4",
          "F5",
          "F6",
          "F7",
          "F8",
          "F9",
          "F10",
          "F11",
          "F12",
        ];
        if (allowedKeys.includes(e.key)) return;
        // Ignore non-character keys (length>1) silently - like modifier combinations
        if (e.key.length > 1) return;
        // Only flash red for actual character input that's not a digit
        if (!/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          this.flashInvalidInput(input);
        }
      });

      input.addEventListener("input", (e) => {
        const value = e.target.value;

        // Remove any non-digit characters
        const filteredValue = value.replace(/[^0-9]/g, "");

        if (value !== filteredValue) {
          // Flash red border for invalid input
          this.flashInvalidInput(input);
          e.target.value = filteredValue;
        }

        // Auto-advance to next input if digit entered
        if (filteredValue.length === 1 && index < codeInputs.length - 1) {
          codeInputs[index + 1].focus();
        }

        // Check if all inputs are filled
        this.validateAllCodeInputs();
      });

      // Handle backspace to go to previous input
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !input.value && index > 0) {
          codeInputs[index - 1].focus();
        }
      });

      // Prevent pasting non-numeric content
      input.addEventListener("paste", (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData("text");
        const digits = paste.replace(/[^0-9]/g, "");

        if (digits.length > 0) {
          // Fill inputs with pasted digits
          for (
            let i = 0;
            i < Math.min(digits.length, codeInputs.length - index);
            i++
          ) {
            if (codeInputs[index + i]) {
              codeInputs[index + i].value = digits[i];
            }
          }

          // Focus first input if error, or next logical input
          if (digits.length > codeInputs.length - index) {
            // Too many digits pasted - focus first input
            codeInputs[0].focus();
          } else {
            // Focus next empty input or last filled input
            const nextIndex = Math.min(
              index + digits.length,
              codeInputs.length - 1
            );
            codeInputs[nextIndex].focus();
          }

          this.validateAllCodeInputs();
        }
      });
    });
  }

  setupNameInputValidation() {
    const nameInput = document.getElementById("name-input");
    if (!nameInput) return;

    // Prevent extra input beyond limit & flash counter on blocked input
    nameInput.addEventListener("beforeinput", (e) => {
      // If trying to insert (not delete) while at limit
      if (
        nameInput.value.length >= 10 &&
        e.data &&
        !["deleteContentBackward", "deleteContentForward"].includes(e.inputType)
      ) {
        e.preventDefault();
        this.flashCharacterLimit(true);
      }
    });

    nameInput.addEventListener("input", (e) => {
      const value = e.target.value;

      // Allow only Hebrew letters and spaces (no hyphens or other chars)
      const hebrewChar = /[\u05D0-\u05EA ]/;

      let filteredValue = "";
      let hasInvalidChar = false;
      let isAtLimit = false;

      if (value.length > 10) {
        isAtLimit = true;
      }

      for (let i = 0; i < value.length; i++) {
        const char = value[i];

        if (filteredValue.length >= 10) {
          isAtLimit = true;
          break;
        }

        // Allow Hebrew characters & spaces
        if (!hebrewChar.test(char)) {
          hasInvalidChar = true;
          continue;
        }
        if (char === " ") {
          if (filteredValue.length === 0) {
            hasInvalidChar = true;
            continue; // no leading space
          }
          if (filteredValue.endsWith(" ")) {
            hasInvalidChar = true;
            continue; // no double space
          }
        }
        filteredValue += char;
      }

      // Don't allow trailing spaces
      if (filteredValue.endsWith(" ")) {
        filteredValue = filteredValue.trimEnd();
        hasInvalidChar = true;
      }

      // Remove accidental leading spaces created via deletion
      filteredValue = filteredValue.replace(/^\s+/, "");

      if (hasInvalidChar) {
        this.flashInvalidInput(nameInput);
      }

      if (isAtLimit) {
        this.flashCharacterLimit();
      }

      e.target.value = filteredValue;

      // Update character counter
      const charCounter = document.getElementById("char-counter");
      if (charCounter) {
        charCounter.textContent = `${filteredValue.length}/10`;
      }

      // Enable/disable submit button
      this.validateNameInput();
    });

    // Fallback keydown (for browsers not firing beforeinput as expected)
    nameInput.addEventListener("keydown", (e) => {
      const controlKeys = [
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "Tab",
        "Enter",
      ];
      if (controlKeys.includes(e.key)) return; // allow control keys

      // Prevent exceeding limit
      if (nameInput.value.length >= 10) {
        e.preventDefault();
        this.flashCharacterLimit(true);
        return;
      }
      // Validate Hebrew letter or space only
      if (e.key.length === 1 && !/[\u05D0-\u05EA ]/.test(e.key)) {
        e.preventDefault();
        this.flashInvalidInput(nameInput);
      } else if (e.key === " " && nameInput.value.length === 0) {
        // No leading space
        e.preventDefault();
        this.flashInvalidInput(nameInput);
      } else if (e.key === " " && nameInput.value.endsWith(" ")) {
        // No consecutive spaces
        e.preventDefault();
        this.flashInvalidInput(nameInput);
      }
    });
  }

  cleanupSpaces(text) {
    // Remove leading and trailing spaces, keep single spaces in middle
    return text.replace(/^\s+/, "").replace(/\s+$/, "").replace(/\s+/g, " ");
  }

  flashInvalidInput(input) {
    if (!input) return;
    // Restart animation if already applied
    input.classList.remove("invalid-input");
    void input.offsetWidth; // force reflow
    input.classList.add("invalid-input");
    // Debug (can remove later)
    // console.debug('Flashing invalid input', input.id || input.className);
    const removeListener = () => {
      input.classList.remove("invalid-input");
      input.removeEventListener("animationend", removeListener);
    };
    input.addEventListener("animationend", removeListener);
  }

  flashCharacterLimit(force = false) {
    const charCounter = document.getElementById("char-counter");
    if (!charCounter) return;
    // Always restart animation when force or not currently running
    if (force || charCounter.classList.contains("char-limit-flash")) {
      charCounter.classList.remove("char-limit-flash");
      void charCounter.offsetWidth; // reflow
    }
    charCounter.classList.add("char-limit-flash");
  }

  validateAllCodeInputs() {
    const codeInputs = document.querySelectorAll(".code-input");
    const allFilled = Array.from(codeInputs).every(
      (input) => input.value.length === 1
    );

    const joinBtn = document.getElementById("join-game-btn");
    if (joinBtn) {
      joinBtn.disabled = !allFilled;
    }

    return allFilled;
  }

  validateNameInput() {
    const nameInput = document.getElementById("name-input");
    const submitBtn = document.getElementById("submit-name-btn");

    if (nameInput && submitBtn) {
      const value = nameInput.value.trim();
      // Name must be at least 1 character after trimming
      const isValid = value.length > 0;
      submitBtn.disabled = !isValid;
    }
  }

  setupEnterKeyHandlers() {
    // Enter key for code inputs
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (window.ignoreNextEnter) {
          window.ignoreNextEnter = false;
          return;
        }
        const activeElement = document.activeElement;

        // Don't handle Enter if modal is open
        const modalOverlay = document.getElementById("modal-overlay");
        if (modalOverlay && !modalOverlay.classList.contains("hidden")) {
          return; // Let modal handle the Enter key
        }

        // Handle Enter in code inputs
        if (activeElement && activeElement.classList.contains("code-input")) {
          e.preventDefault();
          if (this.validateAllCodeInputs()) {
            // Don't flash red if all inputs are filled - this is a valid submission
            const joinBtn = document.getElementById("join-game-btn");
            if (joinBtn && !joinBtn.disabled) {
              // Use game manager if available
              if (window.gameManager && window.gameManager.joinGame) {
                window.gameManager.joinGame();
              } else {
                joinBtn.click();
              }
            }
          } else {
            // Only show red flash if not all fields are filled
            this.flashInvalidInput(activeElement);
          }
        }

        // Handle Enter in name input
        if (activeElement && activeElement.id === "name-input") {
          e.preventDefault();
          const submitBtn = document.getElementById("submit-name-btn");
          if (submitBtn && !submitBtn.disabled) {
            // Use game manager if available
            if (window.gameManager && window.gameManager.submitName) {
              window.gameManager.submitName();
            } else {
              submitBtn.click();
            }
          }
        }
      }
    });
  }

  // Get current code value
  getCodeValue() {
    const codeInputs = document.querySelectorAll(".code-input");
    return Array.from(codeInputs)
      .map((input) => input.value)
      .join("");
  }

  // Clear all code inputs and focus first one
  clearCodeInputs(focusFirst = true) {
    const codeInputs = document.querySelectorAll(".code-input");
    codeInputs.forEach((input) => (input.value = ""));
    this.validateAllCodeInputs();
    if (focusFirst) {
      setTimeout(() => {
        if (codeInputs.length > 0) {
          codeInputs[0].focus();
        }
      }, 10); // Small delay to ensure DOM is updated
    }
  }

  // Reset to first input after error
  resetToFirstInput() {
    const codeInputs = document.querySelectorAll(".code-input");
    if (codeInputs.length > 0) {
      codeInputs[0].focus();
    }
  }

  // Set code value
  setCodeValue(code) {
    const codeInputs = document.querySelectorAll(".code-input");
    const digits = code.toString().padStart(4, "0");

    codeInputs.forEach((input, index) => {
      input.value = digits[index] || "";
    });

    this.validateAllCodeInputs();
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Wait a bit for other scripts to load
  setTimeout(() => {
    window.inputValidator = new InputValidator();
    console.log("🔒 Input validation initialized");
  }, 100);
});
