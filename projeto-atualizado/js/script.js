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
// SCROLL PROGRESS BAR
// ========================================
window.addEventListener('scroll', function() {
  const totalHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const progress = (window.scrollY / totalHeight) * 100;
  document.getElementById('scrollProgress').style.width = progress + '%';
});

// ========================================
// WELCOME MODAL
// ========================================
setTimeout(function() {
  document.getElementById('welcomeModal').classList.add('show');
}, 2000);

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
// CONTADOR ANIMADO DE ALUNOS
// ========================================
const targetCount = 1247;
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

// Função para avançar o carousel
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

// Iniciar carousel automático a cada 5 segundos
const carouselInterval = setInterval(autoScrollCarousel, 5000);

// Detectar scroll manual do carousel
carousel.addEventListener('scroll', function() {
  const scrollLeft = carousel.scrollLeft;
  const clientWidth = carousel.clientWidth;
  currentImageIndex = Math.round(scrollLeft / clientWidth);
});

// Pausar carousel ao passar o mouse
carousel.addEventListener('mouseenter', function() {
  clearInterval(carouselInterval);
});

// Retomar carousel ao sair o mouse
carousel.addEventListener('mouseleave', function() {
  setInterval(autoScrollCarousel, 5000);
});

// ========================================
// FAQ TOGGLE (Accordion)
// ========================================
function toggleFAQ(button) {
  const faqItem = button.parentElement;
  const allItems = document.querySelectorAll('.faq-item');
  
  // Fechar todos os outros itens
  allItems.forEach(item => {
    if (item !== faqItem) {
      item.classList.remove('active');
    }
  });
  
  // Alternar o item clicado
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
      // Aqui você pode adicionar a lógica para enviar o email
      // Por exemplo, enviar para um servidor ou serviço de email marketing
      
      alert('✅ Obrigada por se cadastrar! Em breve você receberá nossas dicas exclusivas no email: ' + email);
      emailInput.value = '';
    }
  });
}

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
console.log('%c🎨 Site desenvolvido com ❤️ para Jenifer Lima Makeup', 'color: #ff69b4; font-size: 16px; font-weight: bold;');
console.log('%c💄 Curso de Automaquiagem - Transforme sua rotina de beleza!', 'color: #9c59b6; font-size: 14px;');
