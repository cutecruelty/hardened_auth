const ruleChecklist = document.getElementById("rule-checklist");

const rules = {
  length: (p) => p.length >= 8,
  upper: (p) => /[A-Z]/.test(p),
  lower: (p) => /[a-z]/.test(p),
  num: (p) => /[0-9]/.test(p),
  sym: (p) => /[!@#$%^&*(),.?":{}|<>_\-]/.test(p),
};

const passwordInput = document.getElementById("password");

passwordInput.addEventListener("input", () => {
  const value = passwordInput.value;
  for (const [ruleId, checkFn] of Object.entries(rules)) {
    const li = ruleChecklist.querySelector(`[data-rule="${ruleId}"]`);
    li.style.color = checkFn(value) ? "limegreen" : "#888";
  }
});

const confirmPasswordInput = document.getElementById("confirm-password");
const confirmMessage = document.getElementById("confirm-message");

confirmPasswordInput.addEventListener("input", () => {
  const pwValue = passwordInput.value;
  const confValue = confirmPasswordInput.value;

  confirmMessage.textContent =
    pwValue !== confValue ? "passwords do not match" : "";
});
