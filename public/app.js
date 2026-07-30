const form = document.getElementById("reg-form");
const nameInput = document.getElementById("name");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = passwordInput.value;
  const name = nameInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const consentGiven = document.getElementById("geo-consent").checked;

  if (!consentGiven) {
    confirmMessage.textContent = "you must consent to continue!";
    return;
  }

  if (password !== confirmPassword) {
    confirmMessage.textContent = "passwords do not match";
    return;
  }

  const response = await fetch("http://localhost:3000/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    confirmMessage.textContent = data.errors.join(", ");
  } else {
    console.log("registered", data);
  }
});
