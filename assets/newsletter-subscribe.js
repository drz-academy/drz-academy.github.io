function workerEndpoint() {
  const meta = document.querySelector('meta[name="course-notify-endpoint"]');
  return (meta?.getAttribute("content") || "").trim().replace(/\/$/, "");
}

function qsParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function showToast(message, isError = false) {
  let el = document.getElementById("newsletter-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "newsletter-toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.hidden = false;
  el.style.opacity = "1";
  window.setTimeout(() => {
    el.style.opacity = "0";
    window.setTimeout(() => { el.hidden = true; }, 300);
  }, 6000);
}

function openModal() {
  const overlay = document.getElementById("newsletter-subscribe-overlay");
  if (!overlay) return;
  overlay.classList.add("active");
  overlay.setAttribute("aria-hidden", "false");
  const input = document.getElementById("newsletter-subscribe-email");
  input?.focus();
}

function closeModal() {
  const overlay = document.getElementById("newsletter-subscribe-overlay");
  if (!overlay) return;
  overlay.classList.remove("active");
  overlay.setAttribute("aria-hidden", "true");
}

async function handleSubmit(event) {
  event.preventDefault();
  const endpoint = workerEndpoint();
  const emailInput = document.getElementById("newsletter-subscribe-email");
  const submitBtn = document.getElementById("newsletter-subscribe-submit");
  const status = document.getElementById("newsletter-subscribe-status");
  const email = String(emailInput?.value || "").trim();
  if (!endpoint) {
    showToast("Error: no se ha configurado el endpoint de suscripción", true);
    return;
  }
  if (!email) return;

  submitBtn?.setAttribute("disabled", "disabled");
  if (status) {
    status.textContent = "Enviando suscripción...";
    status.hidden = false;
  }

  try {
    const res = await fetch(`${endpoint}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, lang: "es" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "subscribe_failed");
    }
    if (data.status === "already_subscribed") {
      if (status) status.textContent = "¡Ya estabas suscrito/a!";
      showToast("¡Ya estabas suscrito/a!");
      emailInput.value = "";
      window.setTimeout(closeModal, 1800);
      return;
    }
    if (status) status.textContent = "¡Suscripción exitosa!";
    emailInput.value = "";
    showToast("¡Suscripción exitosa!");
    window.setTimeout(closeModal, 1800);
  } catch {
    if (status) status.textContent = "Hubo un error al suscribirse.";
    showToast("Hubo un error al suscribirse.", true);
  } finally {
    submitBtn?.removeAttribute("disabled");
  }
}

function applySubscribeQueryFeedback() {
  const sub = qsParam("subscribe");
  if (sub === "unsubscribed") {
    showToast("Te has desuscrito correctamente.");
  } else if (sub === "open") {
    openModal();
  }
}

function bindSubscribeUi() {
  document.getElementById("newsletter-subscribe-open")?.addEventListener("click", openModal);
  document.getElementById("newsletter-subscribe-close")?.addEventListener("click", closeModal);
  document.getElementById("newsletter-subscribe-cancel")?.addEventListener("click", closeModal);
  document.getElementById("newsletter-subscribe-overlay")?.addEventListener("click", (ev) => {
    if (ev.target?.id === "newsletter-subscribe-overlay") closeModal();
  });
  document.getElementById("newsletter-subscribe-form")?.addEventListener("submit", handleSubmit);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeModal();
  });
  applySubscribeQueryFeedback();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindSubscribeUi);
} else {
  bindSubscribeUi();
}
