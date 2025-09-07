document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("memberRegistrationForm");
  const flashContainer = document.getElementById("flashContainer");

  if (!form || !flashContainer) return;

  function showFlash(type, message) {
    const div = document.createElement("div");
    div.className = `flash-message ${type}`;
    div.innerHTML = `${message} <button class="close-flash">&times;</button>`;
    flashContainer.appendChild(div);

    div.querySelector(".close-flash").addEventListener("click", () => div.remove());
    setTimeout(() => div.remove(), 5000);
  }

  form.addEventListener("submit", async (e) => {
    if (!form.hasAttribute("data-ajax")) return; // allow normal POST fallback
    e.preventDefault();

    // Clear old messages
    flashContainer.querySelectorAll(".flash-message").forEach(f => f.remove());

    const data = {};
    new FormData(form).forEach((v, k) => (data[k] = v));

    try {
      const res = await fetch("/member/ajax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const json = await res.json();

      if (json.success) {
        showFlash("success", json.success);
        form.reset();
      }
      if (json.message) {
        showFlash("error", json.message);
      }
      if (json.errors) {
        Object.entries(json.errors).forEach(([key, msg]) => {
          const input = form.querySelector(`[name="${key}"]`);
          if (!input) return;
          let feedback = input.nextElementSibling;
          if (!feedback || !feedback.classList.contains("input-feedback")) {
            feedback = document.createElement("small");
            feedback.className = "input-feedback";
            input.parentNode.insertBefore(feedback, input.nextSibling);
          }
          feedback.textContent = msg;
          feedback.style.color = "red";
        });
      }
    } catch (err) {
      console.error("AJAX error:", err);
      showFlash("error", "Unexpected server error occurred");
    }
  });
});
