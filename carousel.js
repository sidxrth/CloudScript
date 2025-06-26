let currentSlide = 0;
const slides = document.querySelectorAll(".carousel-slide");

function showSlide(index) {
  slides.forEach(slide => slide.style.display = "none");
  slides[index].style.display = "block";
}

function nextSlide() {
  currentSlide = (currentSlide + 1) % slides.length;
  showSlide(currentSlide);
}

// Initialize
showSlide(currentSlide);
setInterval(nextSlide, 4000); // Change slide every 4 seconds
