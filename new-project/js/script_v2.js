// ========================================
// INICIALIZAR AOS (Animate On Scroll)
// ========================================
AOS.init({
  duration: 1000,
  once: true,
  offset: 100,
  easing: 'ease-in-out-quad'
});

// ========================================
// PARTICLES.JS CONFIGURATION
// ========================================
particlesJS('particles-js', {
  particles: {
    number: {
      value: 80,
      density: {
        enable: true,
        value_area: 800
      }
    },
    color: {
      value: ['#9c59b6', '#ff69b4']
    },
    shape: {
      type: 'circle'
    },
    opacity: {
      value: 0.5,
      random: true,
      anim: {
        enable: true,
        speed: 1,
        opacity_min: 0.1,
        sync: false
      }
    },
    size: {
      value: 3,
      random: true,
      anim: {
        enable: true,
        speed: 2,
        size_min: 0.1,
        sync: false
      }
    },
    line_linked: {
      enable: true,
      distance: 150,
      color: '#9c59b6',
      opacity: 0.4,
      width: 1
    },
    move: {
      enable: true,
      speed: 2,
      direction: 'none',
      random: false,
      straight: false,
      out_mode: 'out',
      bounce: false
    }
  },
  interactivity: {
    detect_on: 'canvas',
    events: {
      onhover: {
        enable: true,
        mode: 'repulse'
      },
      onclick: {
        enable: true,
        mode: 'push'
      },
      resize: true
    },
    modes: {
      repulse: {
        distance: 100,
        duration: 0.4
      },
      push: {
        particles_nb: 4
      }
    }
  },
  retina_detect: true
});

// ========================================
// THEME TOGGLE (Modo Escuro/Claro)
// ========================================
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

// Carregar tema salvo
const savedTheme = localStorage.getItem('theme') || 'light-mode';
body.className = savedTheme;
updateThemeIcon();

themeToggle.addEventListener('click', function() {
  if (body.classList.contains('light-mode')) {
    body.classList.remove('light-mode');
    body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark-mode');
  } else {
    body.classList.remove('dark-mode');
    body.classList.add('light-mode');
    localStorage.setItem('theme', 'light-mode');
  }
  updateThemeIcon();
});

function updateThemeIcon() {
  const icon = themeToggle.querySelector('i');
  if (body.classList.contains('dark-mode')) {
    icon.className = 'fas fa-sun';
  } else {
    icon.className = 'fas fa-moon';
  }
}

// ========================================
// MOBILE MENU TOGGLE
// ========================================
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const navMenu = document.getElementById('navMenu');

if (mobileMenuToggle && navMenu) {
  mobileMenuToggle.addEventListener('click', function() {
    this.classList.toggle('active');
    navMenu.classList.toggle('active');
  });

  // Fechar menu ao clicar em um link
  navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', function() {
      mobileMenuToggle.classList.remove('active');
      navMenu.classList.remove('active');
    });
  });
}

// ========================================
// SCROLL PROGRESS BAR
// ========================================
window.addEventListener('scroll', function() {
  const totalHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const progress = (window.scrollY / totalHeight) * 100;
  document.getElementById('scrollProgress').style.width = progress + '%';
});

// ========================================
// TIMER DE OFERTA (Countdown)
// ========================================
// Define o tempo final (24 horas a partir de agora)
const endTime = new Date().getTime() + (24 * 60 * 60 * 1000);

function updateTimer() {
  const now = new Date().getTime();
  const distance = endTime - now;

  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);

  // Atualizar timer do modal
  const modalHours = document.getElementById('modal-hours');
  const modalMinutes = document.getElementById('modal-minutes');
  const modalSeconds = document.getElementById('modal-seconds');

  if (modalHours) modalHours.textContent = String(hours).padStart(2, '0');
  if (modalMinutes) modalMinutes.textContent = String(minutes).padStart(2, '0');
  if (modalSeconds) modalSeconds.textContent = String(seconds).padStart(2, '0');

  // Atualizar timer do header
  const headerHours = document.getElementById('header-hours');
  const headerMinutes = document.getElementById('header-minutes');
  const headerSeconds = document.getElementById('header-seconds');

  if (headerHours) headerHours.textContent = String(hours).padStart(2, '0');
  if (headerMinutes) headerMinutes.textContent = String(minutes).padStart(2, '0');
  if (headerSeconds) headerSeconds.textContent = String(seconds).padStart(2, '0');

  if (distance < 0) {
    clearInterval(timerInterval);
    if (modalHours) modalHours.textContent = '00';
    if (modalMinutes) modalMinutes.textContent = '00';
    if (modalSeconds) modalSeconds.textContent = '00';
    if (headerHours) headerHours.textContent = '00';
    if (headerMinutes) headerMinutes.textContent = '00';
    if (headerSeconds) headerSeconds.textContent = '00';
  }
}

const timerInterval = setInterval(updateTimer, 1000);
updateTimer();

// ========================================
// WELCOME MODAL
// ========================================
setTimeout(function() {
  document.getElementById('welcomeModal').classList.add('show');
}, 9000);

function closeWelcomeModal() {
  document.getElementById('welcomeModal').classList.remove('show');
}

// Fechar modal ao clicar fora
document.getElementById('welcomeModal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeWelcomeModal();
  }
});

// ========================================
// EXIT POPUP (Popup de Saída)
// ========================================
let exitPopupShown = false;

document.addEventListener('mouseleave', function(e) {
  if (e.clientY <= 0 && !exitPopupShown) {
    document.getElementById('exitPopup').classList.add('show');
    exitPopupShown = true;
  }
});

function closeExitPopup() {
  document.getElementById('exitPopup').classList.remove('show');
}

function handleExitForm(e) {
  e.preventDefault();
  const email = e.target.querySelector('input[type="email"]').value;
  alert('🎁 Parabéns! Você ganhou 10% de desconto! Em breve enviaremos o cupom e o e-book para: ' + email);
  closeExitPopup();
}

// Fechar popup ao clicar fora
document.getElementById('exitPopup').addEventListener('click', function(e) {
  if (e.target === this) {
    closeExitPopup();
  }
});

// ========================================
// CONVERSION NOTIFICATIONS
// ========================================
const conversionNames = [
  'Maria Silva',
  'Ana Paula',
  'Juliana Costa',
  'Fernanda Santos',
  'Beatriz Lima',
  'Camila Oliveira',
  'Larissa Alves',
  'Gabriela Souza',
  'Rafaela Pereira',
  'Amanda Rodrigues'
];

function showConversionNotification() {
  const name = conversionNames[Math.floor(Math.random() * conversionNames.length)];
  const timeAgo = Math.floor(Math.random() * 30) + 1;
  const imgNumber = Math.floor(Math.random() * 70) + 1;

  const notification = document.createElement('div');
  notification.className = 'conversion-notification';
  notification.innerHTML = `
    <img src="https://i.pravatar.cc/150?img=${imgNumber}" alt="${name}">
    <div class="conversion-notification-content">
      <strong>${name}</strong>
      <small>Acabou de se inscrever há ${timeAgo} minutos</small>
    </div>
  `;

  document.getElementById('conversionNotifications').appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Mostrar primeira notificação após 10 segundos
setTimeout(showConversionNotification, 15000);

// Depois, mostrar notificação a cada 20 segundos
setTimeout(() => {
  setInterval(() => {
    showConversionNotification();
  }, 25000);
}, 11000);

// ========================================
// CONTADOR ANIMADO DE ALUNOS
// ========================================
const targetCount = 621;
const duration = 2000;
const increment = targetCount / (duration / 16);
let current = 0;

const counterInterval = setInterval(function() {
  current += increment;
  if (current >= targetCount) {
    document.getElementById('studentCount').textContent = targetCount;
    clearInterval(counterInterval);
  } else {
    document.getElementById('studentCount').textContent = Math.floor(current);
  }
}, 16);

// ========================================
// CAROUSEL AUTOMÁTICO
// ========================================
const carousel = document.getElementById('carousel');
let currentImageIndex = 0;
const images = carousel.querySelectorAll('.carousel-image');
const totalImages = images.length;

function autoScrollCarousel() {
  if (totalImages > 0) {
    currentImageIndex = (currentImageIndex + 1) % totalImages;
    const scrollAmount = carousel.clientWidth * currentImageIndex;
    carousel.scrollTo({
      left: scrollAmount,
      behavior: 'smooth'
    });
  }
}

const carouselInterval = setInterval(autoScrollCarousel, 5000);

carousel.addEventListener('scroll', function() {
  const scrollLeft = carousel.scrollLeft;
  const clientWidth = carousel.clientWidth;
  currentImageIndex = Math.round(scrollLeft / clientWidth);
});

carousel.addEventListener('mouseenter', function() {
  clearInterval(carouselInterval);
});

carousel.addEventListener('mouseleave', function() {
  setInterval(autoScrollCarousel, 5000);
});

// ========================================
// FAQ TOGGLE (Accordion)
// ========================================
function toggleFAQ(button) {
  const faqItem = button.parentElement;
  const allItems = document.querySelectorAll('.faq-item');
  
  allItems.forEach(item => {
    if (item !== faqItem) {
      item.classList.remove('active');
    }
  });
  
  faqItem.classList.toggle('active');
}

// ========================================
// FORMULÁRIO DE NEWSLETTER
// ========================================
const newsletterForm = document.querySelector('.newsletter-form');

if (newsletterForm) {
  newsletterForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const emailInput = this.querySelector('.newsletter-input');
    const email = emailInput.value;
    
    if (email) {
      alert('✅ Obrigada por se cadastrar! Em breve você receberá nossas dicas exclusivas no email: ' + email);
      emailInput.value = '';
    }
  });
}

// ========================================
// RIPPLE EFFECT
// ========================================
document.querySelectorAll('.ripple-button, .ripple-card').forEach(element => {
  element.addEventListener('click', function(e) {
    const ripple = document.createElement('span');
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');

    this.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  });
});

// ========================================
// SMOOTH SCROLL PARA LINKS INTERNOS
// ========================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// ========================================
// LAZY LOADING DE IMAGENS
// ========================================
if ('IntersectionObserver' in window) {
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
        observer.unobserve(img);
      }
    });
  });

  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
}

// ========================================
// PARALLAX EFFECT NO HEADER
// ========================================
window.addEventListener('scroll', function() {
  const scrolled = window.pageYOffset;
  const header = document.getElementById('header');
  
  if (header) {
    header.style.transform = 'translateY(' + (scrolled * 0.5) + 'px)';
  }
});

// ========================================
// DETECTAR SCROLL E ADICIONAR CLASSE AO BODY
// ========================================
let lastScroll = 0;

window.addEventListener('scroll', function() {
  const currentScroll = window.pageYOffset;
  
  if (currentScroll > 100) {
    document.body.classList.add('scrolled');
  } else {
    document.body.classList.remove('scrolled');
  }
  
  lastScroll = currentScroll;
});

// ========================================
// CONSOLE LOG - CRÉDITOS
// ========================================
console.log('%c🎨 Site Ultra-Moderno desenvolvido com ❤️ para Jenifer Lima Makeup', 'color: #ff69b4; font-size: 18px; font-weight: bold;');
console.log('%c💄 Curso de Automaquiagem - Versão 2.0 com funcionalidades avançadas!', 'color: #9c59b6; font-size: 16px;');
console.log('%c✨ Funcionalidades: Timer, Popup de Saída, Notificações, Modo Escuro, Partículas, Ripple Effect e muito mais!', 'color: #ff69b4; font-size: 14px;');

