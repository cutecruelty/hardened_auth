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
  
});
