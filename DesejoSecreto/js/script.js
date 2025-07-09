// ===== DADOS DOS PRODUTOS (SIMULAÇÃO) =====
const products = [
    {
        id: 1,
        name: "Conjunto Sensual Rendado",
        description: "Conjunto íntimo em renda delicada que realça suas curvas naturais. Peça única para momentos especiais.",
        price: 89.90,
        category: "lingerie",
        image: "img/produto1.jpg",
        featured: true,
        popular: true,
        rating: 4.8,
        reviews: 127
    },
    {
        id: 2,
        name: "Vibrador Premium Silicone",
        description: "Brinquedo íntimo de alta qualidade em silicone médico. Múltiplas velocidades para máximo prazer.",
        price: 159.90,
        category: "brinquedos",
        image: "img/produto2.jpg",
        featured: true,
        popular: true,
        rating: 4.9,
        reviews: 89
    },
    {
        id: 3,
        name: "Óleo Massagem Sensual",
        description: "Óleo corporal com fragrância afrodisíaca. Aquece ao toque e proporciona momentos únicos.",
        price: 45.90,
        category: "cosmeticos",
        image: "img/produto3.jpg",
        featured: true,
        popular: false,
        rating: 4.6,
        reviews: 203
    },
    {
        id: 4,
        name: "Algemas Luxo Veludo",
        description: "Algemas em veludo macio para jogos sensuais. Design elegante e confortável.",
        price: 79.90,
        category: "acessorios",
        image: "img/produto4.jpg",
        featured: false,
        popular: true,
        rating: 4.7,
        reviews: 156
    },
    {
        id: 5,
        name: "Body Transparente Sedutor",
        description: "Body em tecido transparente com detalhes estratégicos. Perfeito para surpreender.",
        price: 119.90,
        category: "lingerie",
        image: "img/produto5.jpg",
        featured: true,
        popular: false,
        rating: 4.5,
        reviews: 78
    },
    {
        id: 6,
        name: "Kit Preliminares Completo",
        description: "Kit com diversos acessórios para jogos preliminares. Tudo que você precisa em um só lugar.",
        price: 199.90,
        category: "brinquedos",
        image: "img/produto6.jpg",
        featured: false,
        popular: true,
        rating: 4.8,
        reviews: 234
    },
    {
        id: 7,
        name: "Gel Lubrificante Premium",
        description: "Lubrificante íntimo de longa duração. Fórmula especial para máximo conforto.",
        price: 29.90,
        category: "cosmeticos",
        image: "img/produto7.jpg",
        featured: false,
        popular: false,
        rating: 4.4,
        reviews: 167
    },
    {
        id: 8,
        name: "Máscara Sensual Cetim",
        description: "Máscara em cetim para jogos de sedução. Material macio e confortável.",
        price: 39.90,
        category: "acessorios",
        image: "img/produto8.jpg",
        featured: false,
        popular: false,
        rating: 4.3,
        reviews: 92
    },
    {
        id: 9,
        name: "Camisola Transparente Luxo",
        description: "Camisola em tecido transparente com bordados sensuais. Elegância e sensualidade.",
        price: 149.90,
        category: "lingerie",
        image: "img/produto9.jpg",
        featured: true,
        popular: true,
        rating: 4.9,
        reviews: 145
    },
    {
        id: 10,
        name: "Estimulador Casal Wireless",
        description: "Brinquedo para casais com controle remoto. Tecnologia avançada para momentos únicos.",
        price: 299.90,
        category: "brinquedos",
        image: "img/produto10.jpg",
        featured: true,
        popular: true,
        rating: 4.9,
        reviews: 67
    }
];

// ===== VARIÁVEIS GLOBAIS =====
let cart = JSON.parse(localStorage.getItem('desejoSecreto_cart')) || [];
let currentPage = 'home';
let filteredProducts = [...products];

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    updateCartCount();
    loadFeaturedProducts();
    loadAllProducts();
    setupEventListeners();
    showPage('home');
}

// ===== NAVEGAÇÃO SPA =====
function showPage(pageId) {
    // Remover classe active de todas as páginas
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Remover classe active de todos os links de navegação
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Mostrar página selecionada
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        currentPage = pageId;
        
        // Adicionar classe active ao link correspondente
        const activeLink = document.querySelector(`[onclick="showPage('${pageId}')"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
        
        // Carregar conteúdo específico da página
        switch(pageId) {
            case 'cart':
                loadCartItems();
                break;
            case 'checkout':
                loadCheckoutSummary();
                break;
        }
        
        // Scroll para o topo
        window.scrollTo(0, 0);
    }
}

// ===== PRODUTOS =====
function loadFeaturedProducts() {
    const featuredContainer = document.getElementById('featuredProducts');
    const featuredProducts = products.filter(product => product.featured);
    
    featuredContainer.innerHTML = featuredProducts.map(product => createProductCard(product)).join('');
}

function loadAllProducts() {
    const productsContainer = document.getElementById('allProducts');
    productsContainer.innerHTML = filteredProducts.map(product => createProductCard(product)).join('');
}

function createProductCard(product) {
    return `
        <div class="product-card" onclick="showProductDetail(${product.id})">
            <div class="product-image">
                <div class="placeholder-img">
                    Imagem do Produto<br>
                    ${product.name}
                </div>
            </div>
            <div class="product-info">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-description">${product.description}</p>
                <div class="product-price">R$ ${product.price.toFixed(2).replace('.', ',')}</div>
                <button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCart(${product.id})">
                    <i class="fas fa-shopping-cart"></i> Adicionar ao Carrinho
                </button>
            </div>
        </div>
    `;
}

function showProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const detailContainer = document.getElementById('productDetailContent');
    detailContainer.innerHTML = `
        <div class="product-detail">
            <div class="product-detail-image">
                <div class="placeholder-img" style="height: 500px;">
                    Imagem do Produto<br>
                    ${product.name}
                </div>
            </div>
            <div class="product-detail-info">
                <h1>${product.name}</h1>
                <div class="product-detail-price">R$ ${product.price.toFixed(2).replace('.', ',')}</div>
                <div class="product-rating">
                    <div class="stars">
                        ${'★'.repeat(Math.floor(product.rating))}${'☆'.repeat(5 - Math.floor(product.rating))}
                    </div>
                    <span>(${product.reviews} avaliações)</span>
                </div>
                <p class="product-detail-description">${product.description}</p>
                
                <div class="quantity-selector">
                    <label for="quantity">Quantidade:</label>
                    <input type="number" id="quantity" value="1" min="1" max="10">
                </div>
                
                <div class="product-actions">
                    <button class="buy-now-btn" onclick="buyNow(${product.id})">
                        <i class="fas fa-bolt"></i> Comprar Agora
                    </button>
                    <button class="add-to-cart-btn" onclick="addToCart(${product.id})">
                        <i class="fas fa-shopping-cart"></i> Adicionar ao Carrinho
                    </button>
                </div>
                
                <div class="product-features">
                    <div class="feature">
                        <i class="fas fa-shipping-fast"></i>
                        <span>Entrega Discreta</span>
                    </div>
                    <div class="feature">
                        <i class="fas fa-shield-alt"></i>
                        <span>Compra Segura</span>
                    </div>
                    <div class="feature">
                        <i class="fas fa-medal"></i>
                        <span>Qualidade Premium</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    showPage('product-detail');
}

// ===== FILTROS =====
function filterProducts() {
    const categoryFilter = document.getElementById('categoryFilter').value;
    const priceFilter = document.getElementById('priceFilter').value;
    const sortFilter = document.getElementById('sortFilter').value;
    
    // Filtrar por categoria
    filteredProducts = products.filter(product => {
        if (categoryFilter && product.category !== categoryFilter) {
            return false;
        }
        return true;
    });
    
    // Filtrar por preço
    if (priceFilter) {
        filteredProducts = filteredProducts.filter(product => {
            const price = product.price;
            switch(priceFilter) {
                case '0-50':
                    return price <= 50;
                case '50-100':
                    return price > 50 && price <= 100;
                case '100-200':
                    return price > 100 && price <= 200;
                case '200+':
                    return price > 200;
                default:
                    return true;
            }
        });
    }
    
    // Ordenar produtos
    switch(sortFilter) {
        case 'name':
            filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'price-low':
            filteredProducts.sort((a, b) => a.price - b.price);
            break;
        case 'price-high':
            filteredProducts.sort((a, b) => b.price - a.price);
            break;
        case 'popular':
            filteredProducts.sort((a, b) => b.popular - a.popular || b.rating - a.rating);
            break;
    }
    
    loadAllProducts();
}

// ===== CARRINHO DE COMPRAS =====
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const quantity = document.getElementById('quantity') ? 
        parseInt(document.getElementById('quantity').value) : 1;
    
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            id: productId,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: quantity
        });
    }
    
    updateCartCount();
    saveCart();
    showMessage('Produto adicionado ao carrinho!', 'success');
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartCount();
    saveCart();
    loadCartItems();
    showMessage('Produto removido do carrinho!', 'success');
}

function updateQuantity(productId, newQuantity) {
    const item = cart.find(item => item.id === productId);
    if (item) {
        if (newQuantity <= 0) {
            removeFromCart(productId);
        } else {
            item.quantity = newQuantity;
            updateCartCount();
            saveCart();
            loadCartItems();
        }
    }
}

function updateCartCount() {
    const cartCount = document.getElementById('cartCount');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
}

function loadCartItems() {
    const cartContainer = document.getElementById('cartItems');
    
    if (cart.length === 0) {
        cartContainer.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart" style="font-size: 4rem; color: var(--primary-purple); margin-bottom: 1rem;"></i>
                <h3>Seu carrinho está vazio</h3>
                <p>Adicione produtos para continuar suas compras</p>
                <button class="cta-button" onclick="showPage('products')">
                    Ver Produtos
                </button>
            </div>
        `;
    } else {
        cartContainer.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-image">
                    <div class="placeholder-img">
                        ${item.name}
                    </div>
                </div>
                <div class="cart-item-info">
                    <h3>${item.name}</h3>
                    <div class="cart-item-price">R$ ${item.price.toFixed(2).replace('.', ',')}</div>
                </div>
                <div class="cart-item-quantity">
                    <button class="quantity-btn" onclick="updateQuantity(${item.id}, ${item.quantity - 1})">-</button>
                    <span>${item.quantity}</span>
                    <button class="quantity-btn" onclick="updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
                </div>
                <button class="remove-btn" onclick="removeFromCart(${item.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }
    
    updateCartSummary();
}

function updateCartSummary() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal; // Frete grátis
    
    document.getElementById('cartSubtotal').textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    document.getElementById('cartTotal').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

function saveCart() {
    localStorage.setItem('desejoSecreto_cart', JSON.stringify(cart));
}

// ===== CHECKOUT =====
function loadCheckoutSummary() {
    const summaryContainer = document.getElementById('checkoutSummary');
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    summaryContainer.innerHTML = `
        <div class="checkout-items">
            ${cart.map(item => `
                <div class="checkout-item">
                    <span>${item.name} (${item.quantity}x)</span>
                    <span>R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
                </div>
            `).join('')}
        </div>
        <div class="checkout-totals">
            <div class="summary-item">
                <span>Subtotal:</span>
                <span>R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
            </div>
            <div class="summary-item">
                <span>Frete:</span>
                <span>Grátis</span>
            </div>
            <div class="summary-total">
                <span>Total:</span>
                <span>R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
            </div>
        </div>
    `;
}

// ===== COMPRA DIRETA (DROPSHIPPING) =====
function buyNow(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const quantity = document.getElementById('quantity') ? 
        parseInt(document.getElementById('quantity').value) : 1;
    
    // Simular processo de dropshipping
    showMessage('Processando pedido...', 'info');
    
    setTimeout(() => {
        const orderData = {
            product: product.name,
            quantity: quantity,
            total: (product.price * quantity).toFixed(2),
            orderId: generateOrderId(),
            timestamp: new Date().toLocaleString('pt-BR')
        };
        
        // Simular envio para fornecedor
        processDropshippingOrder(orderData);
    }, 2000);
}

function processDropshippingOrder(orderData) {
    // Simular comunicação com fornecedor
    showMessage('Conectando com fornecedor...', 'info');
    
    setTimeout(() => {
        // Simular confirmação do fornecedor
        const success = Math.random() > 0.1; // 90% de sucesso
        
        if (success) {
            showMessage(`
                ✅ Pedido confirmado!<br>
                <strong>ID:</strong> ${orderData.orderId}<br>
                <strong>Produto:</strong> ${orderData.product}<br>
                <strong>Total:</strong> R$ ${orderData.total.replace('.', ',')}<br>
                <br>
                Seu pedido foi enviado ao fornecedor e será processado em até 24h.
                Você receberá o código de rastreamento por email.
            `, 'success', 8000);
            
            // Limpar carrinho se o produto estava nele
            cart = cart.filter(item => item.name !== orderData.product);
            updateCartCount();
            saveCart();
            
        } else {
            showMessage(`
                ❌ Erro no processamento<br>
                Produto temporariamente indisponível no fornecedor.
                Tente novamente em alguns minutos.
            `, 'error', 5000);
        }
    }, 3000);
}

function generateOrderId() {
    return 'DS' + Date.now().toString().slice(-8) + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// ===== FORMULÁRIOS =====
function setupEventListeners() {
    // Formulário de checkout
    const checkoutForm = document.getElementById('checkoutForm');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', handleCheckoutSubmit);
    }
    
    // Formulário de contato
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactSubmit);
    }
    
    // Newsletter
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', handleNewsletterSubmit);
    }
}

function handleCheckoutSubmit(e) {
    e.preventDefault();
    
    if (cart.length === 0) {
        showMessage('Seu carrinho está vazio!', 'error');
        return;
    }
    
    // Validar formulário
    const formData = new FormData(e.target);
    const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'zipCode', 'address', 'city', 'state'];
    
    for (let field of requiredFields) {
        if (!formData.get(field)) {
            showMessage(`Por favor, preencha o campo ${field}`, 'error');
            return;
        }
    }
    
    // Simular processamento do pedido
    showMessage('Processando pedido...', 'info');
    
    setTimeout(() => {
        const orderData = {
            orderId: generateOrderId(),
            items: [...cart],
            total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            customer: {
                name: `${formData.get('firstName')} ${formData.get('lastName')}`,
                email: formData.get('email'),
                phone: formData.get('phone')
            },
            timestamp: new Date().toLocaleString('pt-BR')
        };
        
        // Simular envio para fornecedor (dropshipping)
        processDropshippingCheckout(orderData);
    }, 2000);
}

function processDropshippingCheckout(orderData) {
    showMessage('Enviando pedido para fornecedor...', 'info');
    
    setTimeout(() => {
        const success = Math.random() > 0.05; // 95% de sucesso
        
        if (success) {
            showMessage(`
                🎉 Pedido realizado com sucesso!<br>
                <strong>ID:</strong> ${orderData.orderId}<br>
                <strong>Total:</strong> R$ ${orderData.total.toFixed(2).replace('.', ',')}<br>
                <br>
                Seu pedido foi enviado ao fornecedor.<br>
                Você receberá confirmação e rastreamento por email.
            `, 'success', 10000);
            
            // Limpar carrinho
            cart = [];
            updateCartCount();
            saveCart();
            
            // Voltar para home
            setTimeout(() => {
                showPage('home');
            }, 3000);
            
        } else {
            showMessage(`
                ❌ Erro no processamento do pedido<br>
                Tente novamente ou entre em contato conosco.
            `, 'error', 5000);
        }
    }, 3000);
}

function handleContactSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const name = formData.get('contactName');
    const email = formData.get('contactEmail');
    const subject = formData.get('contactSubject');
    const message = formData.get('contactMessage');
    
    if (!name || !email || !subject || !message) {
        showMessage('Por favor, preencha todos os campos', 'error');
        return;
    }
    
    showMessage('Enviando mensagem...', 'info');
    
    setTimeout(() => {
        showMessage(`
            ✅ Mensagem enviada com sucesso!<br>
            Obrigado pelo contato, ${name}.<br>
            Responderemos em até 24 horas.
        `, 'success', 5000);
        
        e.target.reset();
    }, 2000);
}

function handleNewsletterSubmit(e) {
    e.preventDefault();
    
    const email = e.target.querySelector('input[type="email"]').value;
    
    if (!email) {
        showMessage('Por favor, insira um email válido', 'error');
        return;
    }
    
    showMessage('Cadastrando email...', 'info');
    
    setTimeout(() => {
        showMessage('✅ Email cadastrado com sucesso!', 'success');
        e.target.reset();
    }, 1500);
}

// ===== MENU MOBILE =====
function toggleMobileMenu() {
    const navList = document.querySelector('.nav-list');
    navList.style.display = navList.style.display === 'flex' ? 'none' : 'flex';
}

// ===== MENSAGENS =====
function showMessage(text, type = 'info', duration = 3000) {
    // Remover mensagem anterior se existir
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.innerHTML = text;
    
    document.body.appendChild(message);
    
    // Mostrar mensagem
    setTimeout(() => {
        message.classList.add('show');
    }, 100);
    
    // Remover mensagem após duração especificada
    setTimeout(() => {
        message.classList.remove('show');
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 300);
    }, duration);
}

// ===== UTILITÁRIOS =====
function formatPrice(price) {
    return `R$ ${price.toFixed(2).replace('.', ',')}`;
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    const re = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
    return re.test(phone);
}

// ===== EFEITOS VISUAIS =====
document.addEventListener('DOMContentLoaded', function() {
    // Efeito de parallax no hero banner
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const parallax = document.querySelector('.hero-banner');
        if (parallax) {
            const speed = scrolled * 0.5;
            parallax.style.transform = `translateY(${speed}px)`;
        }
    });
    
    // Animação de entrada dos elementos
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observar elementos para animação
    document.querySelectorAll('.product-card, .cta-card, .contact-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// ===== BUSCA (FUNCIONALIDADE EXTRA) =====
function searchProducts(query) {
    if (!query) {
        filteredProducts = [...products];
    } else {
        filteredProducts = products.filter(product => 
            product.name.toLowerCase().includes(query.toLowerCase()) ||
            product.description.toLowerCase().includes(query.toLowerCase())
        );
    }
    loadAllProducts();
}

// ===== FAVORITOS (FUNCIONALIDADE EXTRA) =====
let favorites = JSON.parse(localStorage.getItem('desejoSecreto_favorites')) || [];

function toggleFavorite(productId) {
    const index = favorites.indexOf(productId);
    if (index > -1) {
        favorites.splice(index, 1);
        showMessage('Produto removido dos favoritos', 'info');
    } else {
        favorites.push(productId);
        showMessage('Produto adicionado aos favoritos', 'success');
    }
    
    localStorage.setItem('desejoSecreto_favorites', JSON.stringify(favorites));
}

// ===== ANALYTICS SIMULADO =====
function trackEvent(eventName, data = {}) {
    console.log(`Analytics Event: ${eventName}`, data);
    // Aqui você integraria com Google Analytics, Facebook Pixel, etc.
}

// Rastrear eventos importantes
document.addEventListener('DOMContentLoaded', function() {
    trackEvent('page_view', { page: 'home' });
});

// ===== PERFORMANCE =====
// Lazy loading para imagens (quando implementadas)
function lazyLoadImages() {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

// ===== ACESSIBILIDADE =====
document.addEventListener('keydown', function(e) {
    // Navegação por teclado
    if (e.key === 'Escape') {
        // Fechar modais, menus, etc.
        const mobileMenu = document.querySelector('.nav-list');
        if (mobileMenu && mobileMenu.style.display === 'flex') {
            toggleMobileMenu();
        }
    }
});

// ===== INICIALIZAÇÃO FINAL =====
// Garantir que tudo seja carregado corretamente
window.addEventListener('load', function() {
    console.log('Desejo Secreto - Loja Virtual carregada com sucesso!');
    trackEvent('app_loaded');
});

