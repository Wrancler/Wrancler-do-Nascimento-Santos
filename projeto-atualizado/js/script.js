// ========================================
// INICIALIZAR LIBRARIES (AOS, TILT)
// ========================================
AOS.init({
  duration: 800,
  once: true,
  offset: 50,
  easing: 'ease-in-out-quad'
});

// ========================================
// CURSOR NEON INTERATIVO
// ========================================
const cursorGlow = document.querySelector('.cursor-glow');
document.addEventListener('mousemove', (e) => {
  cursorGlow.style.left = `${e.clientX}px`;
  cursorGlow.style.top = `${e.clientY}px`;
});

document.querySelectorAll('a, button, .feature-card, .testimonial-card').forEach(item => {
  item.addEventListener('mouseenter', () => {
    cursorGlow.style.width = '600px';
    cursorGlow.style.height = '600px';
    cursorGlow.style.background = 'radial-gradient(circle, rgba(255, 105, 180, 0.2) 0%, transparent 60%)';
  });
  item.addEventListener('mouseleave', () => {
    cursorGlow.style.width = '400px';
    cursorGlow.style.height = '400px';
    cursorGlow.style.background = 'radial-gradient(circle, rgba(156, 89, 182, 0.15) 0%, transparent 60%)';
  });
});

// ========================================
// PARTICLES.JS (Fundo Tecnológico)
// ========================================
particlesJS("particles-js", {
  "particles": {
    "number": { "value": 60, "density": { "enable": true, "value_area": 800 } },
    "color": { "value": ["#9c59b6", "#ff69b4"] },
    "shape": { "type": "circle" },
    "opacity": { "value": 0.3, "random": true },
    "size": { "value": 3, "random": true },
    "line_linked": { "enable": true, "distance": 150, "color": "#9c59b6", "opacity": 0.1, "width": 1 },
    "move": { "enable": true, "speed": 1.5, "direction": "none", "random": true, "out_mode": "out" }
  },
  "interactivity": {
    "detect_on": "canvas",
    "events": {
      "onhover": { "enable": true, "mode": "grab" },
      "onclick": { "enable": true, "mode": "push" },
      "resize": true
    },
    "modes": {
      "grab": { "distance": 200, "line_linked": { "opacity": 0.4 } },
      "push": { "particles_nb": 4 }
    }
  },
  "retina_detect": true
});

// ========================================
// STICKY NAVBAR & PROGRESS BAR
// ========================================
window.addEventListener('scroll', function() {
  const navbar = document.getElementById('navbar');
  const totalHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const progress = (window.scrollY / totalHeight) * 100;
  
  document.getElementById('scrollProgress').style.width = progress + '%';
  
  if (window.scrollY > 50) {
    if(navbar) navbar.classList.add('scrolled');
  } else {
    if(navbar) navbar.classList.remove('scrolled');
  }
});

// ========================================
// WELCOME MODAL
// ========================================
setTimeout(function() {
  const modal = document.getElementById('welcomeModal');
  if(modal) modal.classList.add('show');
}, 2000);

function closeWelcomeModal() {
  document.getElementById('welcomeModal').classList.remove('show');
}
const modalEl = document.getElementById('welcomeModal');
if(modalEl) {
  modalEl.addEventListener('click', function(e) {
    if (e.target === this) closeWelcomeModal();
  });
}

// ========================================
// CONTADOR ANIMADO
// ========================================
const targetCount = 500;
const duration = 2000;
const increment = targetCount / (duration / 16);
let current = 0;
const studentCountEl = document.getElementById('studentCount');

if(studentCountEl) {
  const counterInterval = setInterval(function() {
    current += increment;
    if (current >= targetCount) {
      studentCountEl.textContent = targetCount;
      clearInterval(counterInterval);
    } else {
      studentCountEl.textContent = Math.floor(current);
    }
  }, 16);
}

// ========================================
// CAROUSEL AUTOMÁTICO
// ========================================
const carousel = document.getElementById('carousel');
if(carousel) {
  let currentImageIndex = 0;
  const images = carousel.querySelectorAll('.carousel-image');
  const totalImages = images.length;

  function autoScrollCarousel() {
    if (totalImages > 0) {
      currentImageIndex = (currentImageIndex + 1) % totalImages;
      const scrollAmount = carousel.clientWidth * currentImageIndex;
      carousel.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  }

  const carouselInterval = setInterval(autoScrollCarousel, 5000);
  carousel.addEventListener('scroll', function() {
    currentImageIndex = Math.round(carousel.scrollLeft / carousel.clientWidth);
  });
  carousel.addEventListener('mouseenter', () => clearInterval(carouselInterval));
  carousel.addEventListener('mouseleave', () => setInterval(autoScrollCarousel, 5000));
}

// ========================================
// FAQ TOGGLE & SMOOTH SCROLL
// ========================================
function toggleFAQ(button) {
  const faqItem = button.parentElement;
  document.querySelectorAll('.faq-item').forEach(item => {
    if (item !== faqItem) item.classList.remove('active');
  });
  faqItem.classList.toggle('active');
}

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// ========================================
// NEWSLETTER
// ========================================
const newsletterForm = document.querySelector('.newsletter-form');
if (newsletterForm) {
  newsletterForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const emailInput = this.querySelector('.newsletter-input');
    if (emailInput.value) {
      alert('✅ Obrigada por se cadastrar! Em breve você receberá dicas exclusivas.');
      emailInput.value = '';
    }
  });
}