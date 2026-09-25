/* =========================================================
   SETTINGS: replace these values before launch.
   Keep the quote marks "  " around each value.
   ========================================================= */
const CONFIG = {
  formEndpoint: "YOUR_FORMSPREE_ENDPOINT",
  stripePaymentLink: "YOUR_STRIPE_PAYMENT_LINK",
  businessPhone: "YOUR_PHONE_NUMBER",
  serviceArea: "Kansas City Northland"
};

/* Turn online payment on later: change false to true.
   The PAY NOW button then appears on the confirmation screen
   and opens your Stripe Payment Link. */
const ENABLE_INSTANT_PAYMENT = false;

/* ========================================================= */

(function () {
  "use strict";

  // A value counts as "set" once it no longer starts with "YOUR_".
  function isConfigured(value) {
    return typeof value === "string" && value.trim() !== "" && value.trim().indexOf("YOUR_") !== 0;
  }

  /* ---------- Service area text ---------- */
  if (isConfigured(CONFIG.serviceArea)) {
    document.querySelectorAll('[data-config="serviceArea"]').forEach(function (el) {
      el.textContent = CONFIG.serviceArea;
    });
  }

  /* ---------- Phone links (hidden until a real number is set) ---------- */
  if (isConfigured(CONFIG.businessPhone)) {
    const digits = CONFIG.businessPhone.replace(/[^\d+]/g, "");
    document.querySelectorAll("[data-phone-link]").forEach(function (el) {
      el.href = "tel:" + digits;
      el.hidden = false;
      if (el.hasAttribute("data-phone-text")) el.textContent = CONFIG.businessPhone;
    });
    document.querySelectorAll("[data-phone-wrap]").forEach(function (el) { el.hidden = false; });
  }

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Payment button (off by default) ---------- */
  function setupPaymentButton() {
    const payBtn = document.getElementById("pay-now-btn");
    if (!payBtn) return;
    if (ENABLE_INSTANT_PAYMENT && isConfigured(CONFIG.stripePaymentLink)) {
      payBtn.href = CONFIG.stripePaymentLink;
      payBtn.hidden = false;
    } else {
      payBtn.hidden = true;
    }
  }
  setupPaymentButton();

  /* ---------- Pricing buttons pre-select the service ---------- */
  const serviceSelect = document.getElementById("service");
  document.querySelectorAll("[data-service]").forEach(function (link) {
    link.addEventListener("click", function () {
      const key = link.getAttribute("data-service");
      const option = serviceSelect && serviceSelect.querySelector('option[data-key="' + key + '"]');
      if (option) {
        serviceSelect.value = option.value;
        clearFieldError(serviceSelect);
      }
    });
  });

  /* ---------- Sticky mobile BOOK bar: hide while the form is on screen ---------- */
  const sticky = document.getElementById("sticky-book");
  const bookSection = document.getElementById("book");
  if (sticky && bookSection && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle("is-hidden", entries[0].isIntersecting);
    }, { threshold: 0 }).observe(bookSection);
  }

  /* ---------- Date: no past dates ---------- */
  const dateInput = document.getElementById("date");
  function todayString() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  if (dateInput) dateInput.min = todayString();

  /* =========================================================
     Booking form
     ========================================================= */
  const form = document.getElementById("booking-form");
  if (!form) return;

  const errorBox = document.getElementById("form-errors");
  const successBox = document.getElementById("booking-success");
  const submitBtn = document.getElementById("submit-btn");
  const submitLabel = submitBtn.querySelector(".btn-label");
  const newRequestBtn = document.getElementById("new-request-btn");

  const labels = {
    name: "Name",
    phone: "Phone",
    email: "Email",
    "vehicle-year": "Vehicle year",
    "vehicle-make": "Vehicle make",
    "vehicle-model": "Vehicle model",
    mileage: "Current mileage",
    service: "Service requested",
    address: "Service address",
    city: "City",
    zip: "ZIP code",
    date: "Preferred date"
  };

  function fieldContainer(el) { return el.closest(".field"); }

  function setFieldError(el, message) {
    const wrap = fieldContainer(el);
    const id = el.id + "-error";
    let msg = document.getElementById(id);
    if (!msg) {
      msg = document.createElement("span");
      msg.className = "field-error";
      msg.id = id;
      wrap.appendChild(msg);
    }
    msg.textContent = message;
    el.setAttribute("aria-invalid", "true");
    el.setAttribute("aria-describedby", id);
  }

  function clearFieldError(el) {
    const msg = document.getElementById(el.id + "-error");
    if (msg) msg.remove();
    el.removeAttribute("aria-invalid");
    el.removeAttribute("aria-describedby");
  }

  function setGroupError(groupEl, message) {
    groupEl.classList.add("group-invalid");
    let msg = groupEl.querySelector(".field-error");
    if (!msg) {
      msg = document.createElement("span");
      msg.className = "field-error";
      groupEl.appendChild(msg);
    }
    msg.textContent = message;
  }

  function clearGroupError(groupEl) {
    groupEl.classList.remove("group-invalid");
    const msg = groupEl.querySelector(".field-error");
    if (msg) msg.remove();
  }

  function validate() {
    const problems = [];

    Object.keys(labels).forEach(function (id) {
      const el = document.getElementById(id);
      const value = el.value.trim();
      let message = "";

      if (!value) {
        message = labels[id] + " is required.";
      } else if (id === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        message = "Please enter a valid email address.";
      } else if (id === "phone" && value.replace(/\D/g, "").length < 10) {
        message = "Please enter a 10-digit phone number.";
      } else if (id === "vehicle-year") {
        const year = parseInt(value, 10);
        const max = new Date().getFullYear() + 2;
        if (!/^\d{4}$/.test(value) || year < 1960 || year > max) message = "Please enter a 4-digit vehicle year.";
      } else if (id === "mileage" && !/^\d[\d,\s]*$/.test(value)) {
        message = "Please enter mileage as a number.";
      } else if (id === "zip" && !/^\d{5}(-\d{4})?$/.test(value)) {
        message = "Please enter a 5-digit ZIP code.";
      } else if (id === "date" && value < todayString()) {
        message = "Please choose today or a future date.";
      }

      if (message) {
        setFieldError(el, message);
        problems.push({ message: message });
      } else {
        clearFieldError(el);
      }
    });

    [
      { group: "time-group", name: "preferred_time", message: "Please choose a preferred time." },
      { group: "location-group", name: "location_type", message: "Please choose a location type." }
    ].forEach(function (g) {
      const groupEl = document.getElementById(g.group);
      const checked = form.querySelector('input[name="' + g.name + '"]:checked');
      if (!checked) {
        setGroupError(groupEl, g.message);
        problems.push({ message: g.message });
      } else {
        clearGroupError(groupEl);
      }
    });

    const confirmBox = document.getElementById("confirm-surface");
    const confirmLabel = confirmBox.closest(".check-confirm");
    if (!confirmBox.checked) {
      confirmLabel.classList.add("is-invalid");
      confirmBox.setAttribute("aria-invalid", "true");
      problems.push({ message: "Please confirm the parking surface requirements." });
    } else {
      confirmLabel.classList.remove("is-invalid");
      confirmBox.removeAttribute("aria-invalid");
    }

    return problems;
  }

  function showErrors(problems) {
    errorBox.innerHTML = "";
    const heading = document.createElement("strong");
    heading.textContent = problems.length === 1 ? "Please fix 1 item:" : "Please fix " + problems.length + " items:";
    const list = document.createElement("ul");
    problems.forEach(function (p) {
      const li = document.createElement("li");
      li.textContent = p.message;
      list.appendChild(li);
    });
    errorBox.appendChild(heading);
    errorBox.appendChild(list);
    errorBox.hidden = false;
    errorBox.focus();
  }

  function showMessage(text) {
    errorBox.textContent = text;
    errorBox.hidden = false;
    errorBox.focus();
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("is-loading", isLoading);
    submitBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
    submitLabel.textContent = isLoading ? "Sending…" : "Send Booking Request";
  }

  function showSuccess() {
    form.hidden = true;
    setupPaymentButton();
    successBox.hidden = false;
    successBox.scrollIntoView({ behavior: "smooth", block: "center" });
    successBox.focus({ preventScroll: true });
  }

  // Clear a field's error as soon as it is fixed
  form.addEventListener("input", function (e) {
    const el = e.target;
    if (el.getAttribute("aria-invalid") === "true" && el.id && labels[el.id]) clearFieldError(el);
  });
  form.addEventListener("change", function (e) {
    const el = e.target;
    if (el.type === "radio") clearGroupError(el.closest(".field"));
    if (el.id === "confirm-surface" && el.checked) {
      el.closest(".check-confirm").classList.remove("is-invalid");
      el.removeAttribute("aria-invalid");
    }
    if (el.tagName === "SELECT" && el.value) clearFieldError(el);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    const problems = validate();
    if (problems.length) {
      showErrors(problems);
      return;
    }

    if (!isConfigured(CONFIG.formEndpoint)) {
      const phoneNote = isConfigured(CONFIG.businessPhone)
        ? " Please call or text " + CONFIG.businessPhone + " to book."
        : " Please check back soon.";
      showMessage("Online booking isn't connected yet." + phoneNote);
      return;
    }

    setLoading(true);

    fetch(CONFIG.formEndpoint, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Request failed: " + response.status);
        form.reset();
        showSuccess();
      })
      .catch(function () {
        const phoneNote = isConfigured(CONFIG.businessPhone)
          ? " You can also call or text " + CONFIG.businessPhone + "."
          : "";
        showMessage("Sorry, your request didn't go through. Please check your connection and try again." + phoneNote);
      })
      .finally(function () {
        setLoading(false);
      });
  });

  newRequestBtn.addEventListener("click", function () {
    successBox.hidden = true;
    form.hidden = false;
    document.getElementById("name").focus();
  });
})();
