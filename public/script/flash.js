document.addEventListener("DOMContentLoaded", () => {
  const flashMessages = document.querySelectorAll(".flash-message");

  flashMessages.forEach((msg) => {
    const closeBtn = msg.querySelector(".close-flash");

    // Manual close
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        msg.classList.add("fade-out");
        setTimeout(() => msg.remove(), 300);
      });
    }

    // Auto-hide after 5s
    setTimeout(() => {
      if (msg) {
        msg.classList.add("fade-out");
        setTimeout(() => msg.remove(), 300);
      }
    }, 5000);
  });
});

