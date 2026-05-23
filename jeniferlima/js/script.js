/* ========================================
   INICIALIZAÇÃO E SETUP GLOBAL
   ======================================== */

// Performance: Detectar suporte para features
const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouchDevice = () => {
  return (('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    (navigator.msMaxTouchPoints > 0));
};

// Detectar dark mode
const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

// ========================================
// DEBOUNCE E THROTTLE UTILITIES
// ========================================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ========================================
// FUNÇÕES DO MENU - ESCOPO GLOBAL (IMPORTANTE!)
// ========================================
let navToggle, navMenu, navbar;

function openMenu() {
  if (!navToggle || !navMenu) return;
  console.log('🔓 Opening menu');
  navToggle.classList.add('active');
  navMenu.classList.add('active');
  navToggle.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeMenu() {
  if (!navToggle || !navMenu) return;
  console.log('🔒 Closing menu');
  navToggle.classList.remove('active');
  navMenu.classList.remove('active');
  navToggle.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = 'auto';
}

// ========================================
// INICIALIZAR LIBRARIES (AOS, TILT)
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  // AOS initialization
  if (typeof AOS !== 'undefined') {
    AOS.init({
      duration: isReducedMotion ? 0 : 800,
      once: true,
      offset: 50,
      easing: 'ease-in-out-quad',
      disable: isReducedMotion ? true : false
    });
  }

  // Vanilla Tilt initialization (apenas em devices com hover)
  if (!isTouchDevice() && typeof VanillaTilt !== 'undefined') {
    VanillaTilt.init(document.querySelectorAll('.glass-panel'), {
      max: isTouchDevice() ? 0 : 5,
      speed: 400,
      glare: !isTouchDevice(),
      'max-glare': 0.2
    });
  }

  // Initialize particles (apenas se tiver suporte)
  if (typeof particlesJS !== 'undefined') {
    initializeParticles();
  }

  // Outras inicializações
  initializeCursorGlow();
  initializeScrollProgress();
  initializeNavbar();
  initializeWelcomeModal();
  initializeCounterAnimation();
  initializeCarousel();
  initializeFAQ();
  initializeNewsletter();
});

// ========================================
// CURSOR NEON INTERATIVO (Desktop Only)
// ========================================
function initializeCursorGlow() {
  if (isTouchDevice()) return;

  const cursorGlow = document.querySelector('.cursor-glow');
  if (!cursorGlow) return;

  document.addEventListener('mousemove', throttle((e) => {
    requestAnimationFrame(() => {
      cursorGlow.style.left = `${e.clientX}px`;
      cursorGlow.style.top = `${e.clientY}px`;
    });
  }, 16));

  const interactiveElements = document.querySelectorAll('a, button, .feature-card, .testimonial-card, .bonus-item');
  interactiveElements.forEach(element => {
    element.addEventListener('mouseenter', () => {
      cursorGlow.style.width = '500px';
      cursorGlow.style.height = '500px';
      cursorGlow.style.background = 'radial-gradient(circle, rgba(255, 105, 180, 0.2) 0%, transparent 60%)';
    });

    element.addEventListener('mouseleave', () => {
      cursorGlow.style.width = '300px';
      cursorGlow.style.height = '300px';
      cursorGlow.style.background = 'radial-gradient(circle, rgba(156, 89, 182, 0.1) 0%, transparent 60%)';
    });
  });
}

// ========================================
// SCROLL PROGRESS
// ========================================
function initializeScrollProgress() {
  window.addEventListener('scroll', throttle(() => {
    const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    const progressBar = document.getElementById('scrollProgress');
    if (progressBar) progressBar.style.width = scrollPercent + '%';
  }, 10));
}

// ========================================
// PARTICLES.JS CONFIGURATION
// ========================================
function initializeParticles() {
  const particlesConfig = {
    "particles": {
      "number": {
        "value": Math.min(isTouchDevice() ? 30 : 60, window.innerWidth / 10),
        "density": {
          "enable": true,
          "value_area": 800
        }
      },
      "color": {
        "value": ["#9c59b6", "#ff69b4"]
      },
      "shape": {
        "type": "circle"
      },
      "opacity": {
        "value": 0.3,
        "random": true,
        "anim": {
          "enable": true,
          "speed": 0.5,
          "opacity_min": 0.1,
          "sync": false
        }
      },
      "size": {
        "value": 3,
        "random": true,
        "anim": {
          "enable": false,
          "speed": 0,
          "size_min": 0,
          "sync": false
        }
      },
      "line_linked": {
        "enable": true,
        "distance": 150,
        "color": "#9c59b6",
        "opacity": 0.1,
        "width": 1
      },
      "move": {
        "enable": true,
        "speed": 1,
        "direction": "none",
        "random": true,
        "straight": false,
        "out_mode": "out",
        "bounce": false,
        "attract": {
          "enable": false,
          "rotateX": 600,
          "rotateY": 1200
        }
      }
    },
    "interactivity": {
      "detect_on": "canvas",
      "events": {
        "onhover": {
          "enable": !isTouchDevice(),
          "mode": "grab"
        },
        "onclick": {
          "enable": !isTouchDevice(),
          "mode": "push"
        },
        "resize": true
      },
      "modes": {
        "grab": {
          "distance": 200,
          "line_linked": {
            "opacity": 0.4
          }
        },
        "bubble": {
          "distance": 400,
          "size": 40,
          "duration": 2,
          "opacity": 0.8
        },
        "push": {
          "particles_nb": 2
        },
        "remove": {
          "particles_nb": 2
        }
      }
    },
    "retina_detect": true
  };

  try {
    particlesJS("particles-js", particlesConfig);

    window.addEventListener('resize', debounce(() => {
      if (window.pJSDom && window.pJSDom[0]) {
        window.pJSDom[0].pJS.particles.number.value = Math.min(
          isTouchDevice() ? 20 : 60,
          window.innerWidth / 10
        );
        window.pJSDom[0].pJS.fn.particlesRefresh();
      }
    }, 250));
  } catch (e) {
    console.warn('Particles.js initialization failed:', e);
  }
}

// ========================================
// STICKY NAVBAR & MENU
// ========================================
function initializeNavbar() {
  navbar = document.getElementById('navbar');
  navToggle = document.getElementById('navToggle');
  navMenu = document.getElementById('navMenu');

  if (!navbar || !navToggle || !navMenu) {
    console.warn('❌ Navbar elements not found');
    return;
  }

  console.log('✅ Navbar initialized');
  console.log('   - navbar:', navbar);
  console.log('   - navToggle:', navToggle);
  console.log('   - navMenu:', navMenu);

  // ====== SCROLL ======
  window.addEventListener('scroll', throttle(() => {
    const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    const progressBar = document.getElementById('scrollProgress');
    if (progressBar) progressBar.style.width = scrollPercent + '%';

    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }, 10));

  // ====== MENU TOGGLE ======
  navToggle.addEventListener('click', function(e) {
    console.log('👆 Toggle clicked');
    e.preventDefault();
    e.stopPropagation();
    
    const isActive = navToggle.classList.contains('active');
    console.log('   Menu active:', isActive);
    
    if (isActive) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // ====== FECHAR AO CLICAR EM LINK ======
  const navLinks = navMenu.querySelectorAll('.nav-link');
  console.log('   Found nav links:', navLinks.length);
  
  navLinks.forEach((link, index) => {
    link.addEventListener('click', function(e) {
      console.log('🔗 Link clicked:', link.title);
      closeMenu();
    });
  });

  // ====== FECHAR AO CLICAR FORA ======
  document.addEventListener('click', function(e) {
    if (!navbar.contains(e.target)) {
      if (navToggle.classList.contains('active')) {
        console.log('👆 Clicked outside, closing menu');
        closeMenu();
      }
    }
  });

  // ====== FECHAR AO FAZER SCROLL ======
  window.addEventListener('scroll', function() {
    if (navToggle.classList.contains('active')) {
      closeMenu();
    }
  });

  // ====== FECHAR COM ESCAPE ======
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && navToggle.classList.contains('active')) {
      console.log('⌨️ Escape pressed, closing menu');
      closeMenu();
    }
  });
}

// ========================================
// WELCOME MODAL
// ========================================
function initializeWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  if (!modal) return;

  if (!sessionStorage.getItem('modalShown')) {
    setTimeout(() => {
      modal.classList.add('show');
      sessionStorage.setItem('modalShown', 'true');
    }, 2000);
  }
}

function closeWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const modalEl = document.getElementById('welcomeModal');
  if (modalEl) {
    modalEl.addEventListener('click', function(e) {
      if (e.target === this) closeWelcomeModal();
    });
  }
});

// ========================================
// CONTADOR ANIMADO
// ========================================
function initializeCounterAnimation() {
  const studentCountEl = document.getElementById('studentCount');
  if (!studentCountEl) return;

  if (studentCountEl.dataset.animated === 'true') return;

  const targetCount = 600;
  const duration = isReducedMotion ? 0 : 2500;
  const fps = 60;
  const totalFrames = (duration / 1000) * fps;
  const increment = targetCount / totalFrames;
  let currentFrame = 0;
  let current = 0;

  function animate() {
    currentFrame++;
    current = Math.floor((currentFrame / totalFrames) * targetCount);

    if (currentFrame >= totalFrames) {
      studentCountEl.textContent = targetCount;
      studentCountEl.dataset.animated = 'true';
      return;
    }

    studentCountEl.textContent = current;
    requestAnimationFrame(animate);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && studentCountEl.dataset.animated !== 'true') {
        animate();
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.5
  });

  observer.observe(studentCountEl);

  if (!('IntersectionObserver' in window)) {
    setTimeout(animate, 500);
  }
}

// ========================================
// CAROUSEL AUTOMÁTICO
// ========================================
function initializeCarousel() {
  const carousel = document.getElementById('carousel');
  if (!carousel) return;

  let currentImageIndex = 0;
  const images = carousel.querySelectorAll('.carousel-image');
  const totalImages = images.length;

  if (totalImages <= 1) return;

  function autoScrollCarousel() {
    if (totalImages > 0) {
      currentImageIndex = (currentImageIndex + 1) % totalImages;
      const scrollAmount = carousel.clientWidth * currentImageIndex;
      carousel.scrollTo({
        left: scrollAmount,
        behavior: isReducedMotion ? 'auto' : 'smooth'
      });
    }
  }

  let carouselInterval = setInterval(autoScrollCarousel, 5000);

  carousel.addEventListener('scroll', debounce(() => {
    currentImageIndex = Math.round(carousel.scrollLeft / carousel.clientWidth);
  }, 150));

  carousel.addEventListener('mouseenter', () => clearInterval(carouselInterval));
  carousel.addEventListener('mouseleave', () => {
    carouselInterval = setInterval(autoScrollCarousel, 5000);
  });

  carousel.addEventListener('touchstart', () => clearInterval(carouselInterval));
  carousel.addEventListener('touchend', () => {
    carouselInterval = setInterval(autoScrollCarousel, 5000);
  });
}

// ========================================
// FAQ TOGGLE
// ========================================
function initializeFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const button = item.querySelector('.faq-question');
    if (!button) return;

    button.addEventListener('click', () => {
      faqItems.forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('active');
          const otherButton = otherItem.querySelector('.faq-question');
          if (otherButton) otherButton.setAttribute('aria-expanded', 'false');
        }
      });

      item.classList.toggle('active');
      button.setAttribute('aria-expanded', item.classList.contains('active'));
    });
  });
}

function toggleFAQ(button) {
  const faqItem = button.closest('.faq-item');
  if (faqItem) {
    faqItem.classList.toggle('active');
    button.setAttribute('aria-expanded', faqItem.classList.contains('active'));
  }
}

// ========================================
// SMOOTH SCROLL PARA LINKS INTERNOS
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;

      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({
          behavior: isReducedMotion ? 'auto' : 'smooth',
          block: 'start'
        });
      }
    });
  });
});

// ========================================
// NEWSLETTER FORM
// ========================================
function initializeNewsletter() {
  const newsletterForm = document.querySelector('.newsletter-form');
  if (!newsletterForm) return;

  newsletterForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const emailInput = this.querySelector('.newsletter-input');
    const email = emailInput.value.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showNotification('Por favor, insira um email válido!', 'error');
      return;
    }

    const button = this.querySelector('button');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Enviando...';

    setTimeout(() => {
      showNotification('✅ Obrigada! Em breve você receberá dicas exclusivas no seu email.', 'success');
      emailInput.value = '';
      button.disabled = false;
      button.textContent = originalText;
    }, 1000);
  });
}

// ========================================
// NOTIFICATION SYSTEM
// ========================================
function showNotification(message, type = 'info') {
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: max(20px, env(safe-area-inset-top));
    right: max(20px, env(safe-area-inset-right));
    z-index: 3000;
    padding: 16px 24px;
    background: ${type === 'success' ? '#25d366' : type === 'error' ? '#ff6b6b' : '#9c59b6'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease;
    max-width: 90vw;
    font-size: 14px;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// ========================================
// SMOOTH SCROLL ANIMATION
// ========================================
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes slideOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100px);
    }
  }
`;
document.head.appendChild(style);

// ========================================
// FINAL INITIALIZATION CHECK
// ========================================
console.log('%c🎨 Jenifer Lima Makeup - Site carregado!', 'color: #ff69b4; font-weight: bold; font-size: 14px;');
console.log('Touch Device:', isTouchDevice());
console.log('Dark Mode:', isDarkMode);
console.log('Reduced Motion:', isReducedMotion);