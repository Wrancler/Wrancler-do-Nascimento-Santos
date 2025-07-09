# Desejo Secreto - Loja Virtual

Uma loja virtual moderna e responsiva para dropshipping de produtos adultos, desenvolvida com HTML5, CSS3 e JavaScript puro.

## 🎨 Design

- **Paleta de Cores:**
  - Preto predominante (#000000)
  - Roxo neon (#9B59B6) para botões e detalhes
  - Branco (#ffffff) para textos principais

- **Estilo:** Ousado, elegante e sensual
- **Responsivo:** Compatível com desktop, tablet e mobile

## 🚀 Funcionalidades

### Páginas Principais
- **Página Inicial:** Banner de destaque, produtos em destaque, seções de CTA
- **Listagem de Produtos:** Filtros por categoria, preço e popularidade
- **Detalhes do Produto:** Imagem, descrição, avaliações, botão de compra
- **Carrinho de Compras:** Adicionar/remover produtos, atualizar quantidades
- **Checkout:** Formulário completo de finalização de compra
- **Contato:** Formulário de contato e informações da loja

### Funcionalidades Técnicas
- **SPA (Single Page Application):** Navegação sem recarregamento
- **Carrinho Persistente:** Dados salvos no localStorage
- **Filtros Dinâmicos:** Busca por categoria, preço e ordenação
- **Dropshipping Simulado:** Processo de envio para fornecedor
- **Responsividade Completa:** Design adaptável para todos os dispositivos
- **Animações e Efeitos:** Transições suaves e micro-interações

## 🛍️ Produtos Fictícios Incluídos

1. **Conjunto Sensual Rendado** - R$ 89,90
2. **Vibrador Premium Silicone** - R$ 159,90
3. **Óleo Massagem Sensual** - R$ 45,90
4. **Algemas Luxo Veludo** - R$ 79,90
5. **Body Transparente Sedutor** - R$ 119,90
6. **Kit Preliminares Completo** - R$ 199,90
7. **Gel Lubrificante Premium** - R$ 29,90
8. **Máscara Sensual Cetim** - R$ 39,90
9. **Camisola Transparente Luxo** - R$ 149,90
10. **Estimulador Casal Wireless** - R$ 299,90

## 📁 Estrutura do Projeto

```
DesejoSecreto/
├── index.html          # Página principal
├── css/
│   └── style.css       # Estilos CSS
├── js/
│   └── script.js       # Funcionalidades JavaScript
├── img/                # Imagens (placeholders)
│   ├── hero-banner.jpg
│   ├── produto1.jpg
│   ├── produto2.jpg
│   └── ...
└── README.md           # Este arquivo
```

## 🔧 Como Usar

### Desenvolvimento Local
1. Clone ou baixe os arquivos
2. Abra o `index.html` em um navegador
3. A loja estará funcionando localmente

### Deploy no GitHub Pages
1. Crie um repositório no GitHub
2. Faça upload de todos os arquivos
3. Vá em Settings > Pages
4. Selecione "Deploy from a branch"
5. Escolha "main" branch e "/ (root)"
6. Sua loja estará online em alguns minutos

### Personalização
- **Cores:** Edite as variáveis CSS em `:root` no arquivo `style.css`
- **Produtos:** Modifique o array `products` no arquivo `script.js`
- **Conteúdo:** Altere textos diretamente no `index.html`
- **Imagens:** Substitua os placeholders por imagens reais na pasta `img/`

## 💳 Simulação de Dropshipping

O sistema simula um processo completo de dropshipping:

1. **Adicionar ao Carrinho:** Produtos são armazenados localmente
2. **Finalizar Compra:** Formulário de checkout completo
3. **Processamento:** Simulação de envio para fornecedor
4. **Confirmação:** ID do pedido e status de processamento
5. **Rastreamento:** Simulação de código de rastreamento

### Fluxo de Compra Direta
- Botão "Comprar Agora" simula pedido direto ao fornecedor
- 90% de taxa de sucesso simulada
- Geração automática de ID do pedido
- Mensagens de status em tempo real

## 🎯 Recursos Avançados

### Carrinho de Compras
- Persistência de dados no localStorage
- Atualização dinâmica de quantidades
- Cálculo automático de totais
- Remoção individual de itens

### Filtros e Busca
- Filtro por categoria (Lingerie, Brinquedos, Cosméticos, Acessórios)
- Filtro por faixa de preço
- Ordenação por nome, preço e popularidade
- Busca por texto (funcionalidade extra)

### Responsividade
- Design mobile-first
- Breakpoints para tablet e desktop
- Menu mobile com toggle
- Grid adaptável para produtos

### Acessibilidade
- Navegação por teclado
- Cores com contraste adequado
- Textos alternativos para imagens
- Estrutura semântica HTML5

## 🔒 Considerações de Segurança

Para um ambiente de produção, considere:
- Implementar HTTPS obrigatório
- Validação de dados no backend
- Proteção contra XSS e CSRF
- Criptografia de dados sensíveis
- Integração com gateway de pagamento real

## 📱 Compatibilidade

- **Navegadores:** Chrome, Firefox, Safari, Edge (versões modernas)
- **Dispositivos:** Desktop, Tablet, Mobile
- **Resoluções:** 320px até 1920px+

## 🎨 Customização Visual

### Paleta de Cores Alternativas
Para alterar as cores, modifique as variáveis CSS:

```css
:root {
    --primary-black: #000000;    /* Cor principal */
    --primary-purple: #9B59B6;   /* Cor de destaque */
    --primary-white: #ffffff;    /* Cor do texto */
}
```

### Fontes
- Fonte principal: Poppins (Google Fonts)
- Ícones: Font Awesome 6.0

## 📈 Analytics e Tracking

O código inclui estrutura para:
- Google Analytics
- Facebook Pixel
- Eventos personalizados
- Rastreamento de conversões

## 🛠️ Tecnologias Utilizadas

- **HTML5:** Estrutura semântica
- **CSS3:** Estilos modernos com Flexbox e Grid
- **JavaScript ES6+:** Funcionalidades interativas
- **Font Awesome:** Ícones
- **Google Fonts:** Tipografia

## 📞 Suporte

Para dúvidas ou customizações:
- Email: contato@desejosecreto.com.br
- Telefone: (11) 99999-9999

---

**Desenvolvido com ❤️ para o mercado adulto brasileiro**

*Este é um projeto de demonstração. Para uso comercial, implemente medidas de segurança adequadas e integre com sistemas de pagamento reais.*

