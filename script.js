document.getElementById("year").textContent = new Date().getFullYear();

// Click any real image to view it full-screen; click or press Esc to close.
const box = document.getElementById("lightbox");
const boxImg = box.querySelector("img");
document.querySelectorAll(".media img").forEach(img => {
  img.addEventListener("click", () => {
    boxImg.src = img.src;
    boxImg.alt = img.alt;
    box.classList.add("open");
  });
});
box.addEventListener("click", () => box.classList.remove("open"));
document.addEventListener("keydown", e => { if (e.key === "Escape") box.classList.remove("open"); });
