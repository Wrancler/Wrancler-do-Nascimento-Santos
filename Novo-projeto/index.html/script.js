// ========================================
// INICIALIZAÇÃO DO AOS (Animate On Scroll)
// ========================================
document.addEventListener('DOMContentLoaded', function() {
  AOS.init({
    duration: 1000,
    once: true,
    offset: 100,
    easing: 'ease-in-out-quad'
  });
});

// ========================================
// MENU TOGGLE
// ========================================
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');

if (menuToggle && navMenu) {
  // Toggle menu ao clicar no botão
  menuToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    navMenu.classList.toggle('hidden');
    menuToggle.setAttribute('aria-expanded', 
      menuToggle.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'
    );
  });

  // Fechar menu ao clicar em um link
  const navLinks = navMenu.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', function() {
      navMenu.classList.add('hidden');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // Fechar menu ao clicar fora
  document.addEventListener('click', function(e) {
    if (!navMenu.contains(e.target) && !menuToggle.contains(e.target)) {
      navMenu.classList.add('hidden');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Fechar menu ao pressionar ESC
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      navMenu.classList.add('hidden');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

// ========================================
// CAROUSEL AUTOMÁTICO
// ========================================
const carousel = document.getElementById('carousel');

if (carousel) {
  let currentImageIndex = 0;
  const images = carousel.querySelectorAll('.carousel-image');
  const totalImages = images.length;

  function autoScroll() {
    if (totalImages > 0) {
      currentImageIndex = (currentImageIndex + 1) % totalImages;
      const scrollAmount = carousel.clientWidth * currentImageIndex;
      
      carousel.scrollTo({
        left: scrollAmount,
        behavior: 'smooth'
      });
    }
  }

  // Auto-scroll a cada 5 segundos
  setInterval(autoScroll, 5000);

  // Resetar índice ao scroll manual
  carousel.addEventListener('scroll', function() {
    const scrollLeft = carousel.scrollLeft;
    const clientWidth = carousel.clientWidth;
    currentImageIndex = Math.round(scrollLeft / clientWidth);
  });
}

// ========================================
// SMOOTH SCROLL PARA LINKS
// ========================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href !== '#' && document.querySelector(href)) {
      e.preventDefault();
      document.querySelector(href).scrollIntoView({
        behavior: 'smooth'
      });
    }
  });
});

// ========================================
// EFEITOS DE SCROLL
// ========================================
let lastScrollTop = 0;
const header = document.querySelector('.header');

window.addEventListener('scroll', function() {
  let scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  // Adicionar classe ao header quando scroll
  if (scrollTop > 50) {
    header?.classList.add('scrolled');
  } else {
    header?.classList.remove('scrolled');
  }

  lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
});

// ========================================
// ANIMAÇÃO DE NÚMEROS (CONTADOR)
// ========================================
function animateCounter(element, target, duration = 2000) {
  let current = 0;
  const increment = target / (duration / 16);
  
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      element.textContent = target;
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
}

// ========================================
// INTERSECTION OBSERVER PARA ANIMAÇÕES
// ========================================
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      
      // Animar contadores se existirem
      const counters = entry.target.querySelectorAll('[data-count]');
      counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-count'));
        if (!counter.classList.contains('counted')) {
          animateCounter(counter, target);
          counter.classList.add('counted');
        }
      });
    }
  });
}, observerOptions);

// Observar elementos com classe 'observe-me'
document.querySelectorAll('.observe-me').forEach(el => {
  observer.observe(el);
});

// ========================================
// RIPPLE EFFECT PARA BOTÕES
// ========================================
function createRipple(event) {
  const button = event.currentTarget;
  const ripple = document.createElement('span');
  
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;
  
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  ripple.classList.add('ripple');
  
  button.appendChild(ripple);
  
  setTimeout(() => ripple.remove(), 600);
}

document.querySelectorAll('.cta-button').forEach(button => {
  button.addEventListener('click', createRipple);
});

// ========================================
// LAZY LOADING PARA IMAGENS
// ========================================
if ('IntersectionObserver' in window) {
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src || img.src;
        img.classList.add('loaded');
        observer.unobserve(img);
      }
    });
  });

  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
}

// ========================================
// SCROLL REVEAL PARA ELEMENTOS
// ========================================
const revealElements = document.querySelectorAll('[data-reveal]');

if (revealElements.length > 0) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  revealElements.forEach(el => {
    revealObserver.observe(el);
  });
}

// ========================================
// ADICIONAR ESTILOS PARA RIPPLE E ANIMAÇÕES
// ========================================
const style = document.createElement('style');
style.textContent = `
  .cta-button {
    position: relative;
    overflow: hidden;
  }

  .ripple {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    transform: scale(0);
    animation: ripple-animation 0.6s ease-out;
    pointer-events: none;
  }

  @keyframes ripple-animation {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }

  .scrolled {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .in-view {
    animation: slideInUp 0.6s ease-out;
  }

  .revealed {
    opacity: 1;
    transform: translateY(0);
  }

  [data-reveal] {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Melhorias de Performance */
  * {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }

  .feature-card,
  .bonus-item,
  .cta-button {
    -webkit-transform: translateZ(0);
    transform: translateZ(0);
  }
`;
document.head.appendChild(style);

// ========================================
// SUPORTE A TECLADO
// ========================================
document.addEventListener('keydown', function(e) {
  // Tab para navegação
  if (e.key === 'Tab') {
    document.body.classList.add('keyboard-nav');
  }
});

document.addEventListener('mousedown', function() {
  document.body.classList.remove('keyboard-nav');
});

// ========================================
// DETECÇÃO DE REDIMENSIONAMENTO
// ========================================
let resizeTimer;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimer);
  document.body.classList.add('resizing');
  
  resizeTimer = setTimeout(function() {
    document.body.classList.remove('resizing');
    // Reinicializar AOS em caso de redimensionamento
    if (window.AOS) {
      AOS.refresh();
    }
  }, 250);
});

// ========================================
// PRELOAD DE IMAGENS
// ========================================
function preloadImages(urls) {
  urls.forEach(url => {
    const img = new Image();
    img.src = url;
  });
}

// Precarregar imagens do carousel
const carouselImages = [
  'imagens/studiojeni.jpeg',
  'imagens/navimg.jpeg',
  'imagens/jeni02.jpeg'
];
preloadImages(carouselImages);

// ========================================
// LOG DE INICIALIZAÇÃO
// ========================================
console.log('✨ Jenifer Lima Makeup - Site Responsivo Carregado com Sucesso!');
console.log('📱 Totalmente otimizado para desktop, tablet e mobile');
console.log('🎨 Animações e interatividade ativadas');
