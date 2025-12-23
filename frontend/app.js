// frontend/app.js
const API_BASE_URL = window.location.origin + '/api'; // Assumes API is served from the same origin

document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const loadingOverlay = document.getElementById('loading-overlay');

    // Get elements for Auth tab
    const authShopIdInput = document.getElementById('auth-shop-id');
    const connectShopeeBtn = document.getElementById('connect-shopee-btn');
    const authStatusDiv = document.getElementById('auth-status');
    const accessTokenSpan = document.getElementById('access-token');
    const refreshTokenSpan = document.getElementById('refresh-token');
    const expireTimeSpan = document.getElementById('expire-time');
    const tokenUpdatedAtSpan = document.getElementById('token-updated-at');
    const refreshTokenBtn = document.getElementById('refresh-token-btn');

    // Get elements for Products tab
    const productShopIdInput = document.getElementById('product-shop-id');
    const syncProductsBtn = document.getElementById('sync-products-btn');
    const productsListDiv = document.getElementById('products-list');

    // Get elements for Orders tab
    const orderShopIdInput = document.getElementById('order-shop-id');
    const syncOrdersBtn = document.getElementById('sync-orders-btn');
    const ordersListDiv = document.getElementById('orders-list');
    const alertsListDiv = document.getElementById('alerts-list');

    // --- Utility Functions ---
    function showLoading() {
        loadingOverlay.classList.add('visible');
    }

    function hideLoading() {
        loadingOverlay.classList.remove('visible');
    }

    async function fetchApi(endpoint, options = {}) {
        try {
            showLoading();
            const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Something went wrong');
            }
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        } finally {
            hideLoading();
        }
    }

    function displayStatusMessage(element, message, type) {
        element.textContent = message;
        element.className = `status-message ${type}`;
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleDateString('pt-BR', options);
    }

    // --- Tab Switching Logic ---
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(button.dataset.tab).classList.add('active');

            // Load data when switching tabs
            const shopId = localStorage.getItem('shopee_shop_id');
            if (shopId) {
                if (button.dataset.tab === 'auth') {
                    authShopIdInput.value = shopId;
                    loadShopTokens(shopId);
                } else if (button.dataset.tab === 'products') {
                    productShopIdInput.value = shopId;
                    loadProducts(shopId);
                } else if (button.dataset.tab === 'orders') {
                    orderShopIdInput.value = shopId;
                    loadOrders(shopId);
                }
            }
        });
    });

    // --- Auth Tab Logic ---
    connectShopeeBtn.addEventListener('click', async () => {
        const shopId = authShopIdInput.value;
        if (!shopId) {
            displayStatusMessage(authStatusDiv, 'Por favor, insira o Shop ID.', 'error');
            return;
        }
        localStorage.setItem('shopee_shop_id', shopId);

        try {
            const data = await fetchApi(`/auth/shopee/url?shop_id=${shopId}`);
            window.location.href = data.authUrl; // Redirect to Shopee for authorization
        } catch (error) {
            displayStatusMessage(authStatusDiv, `Erro ao conectar: ${error.message}`, 'error');
        }
    });

    refreshTokenBtn.addEventListener('click', async () => {
        const shopId = authShopIdInput.value;
        if (!shopId) {
            displayStatusMessage(authStatusDiv, 'Por favor, insira o Shop ID.', 'error');
            return;
        }
        try {
            await fetchApi(`/auth/shopee/${shopId}/refresh`, { method: 'POST' });
            displayStatusMessage(authStatusDiv, 'Token atualizado com sucesso!', 'success');
            loadShopTokens(shopId); // Reload token info
        } catch (error) {
            displayStatusMessage(authStatusDiv, `Erro ao atualizar token: ${error.message}`, 'error');
        }
    });

    async function loadShopTokens(shopId) {
        try {
            const data = await fetchApi(`/auth/shopee/${shopId}/tokens`);
            accessTokenSpan.textContent = data.access_token;
            refreshTokenSpan.textContent = data.refresh_token;
            expireTimeSpan.textContent = formatDate(data.expire_time);
            tokenUpdatedAtSpan.textContent = formatDate(data.updatedAt);
        } catch (error) {
            accessTokenSpan.textContent = 'N/A';
            refreshTokenSpan.textContent = 'N/A';
            expireTimeSpan.textContent = 'N/A';
            tokenUpdatedAtSpan.textContent = 'N/A';
            displayStatusMessage(authStatusDiv, `Erro ao carregar tokens: ${error.message}`, 'error');
        }
    }

    // Handle Shopee callback redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('auth_success')) {
        const authSuccess = urlParams.get('auth_success') === 'true';
        const shopId = urlParams.get('shop_id');
        const error = urlParams.get('error');

        if (authSuccess && shopId) {
            localStorage.setItem('shopee_shop_id', shopId);
            authShopIdInput.value = shopId;
            displayStatusMessage(authStatusDiv, 'Autenticação Shopee realizada com sucesso!', 'success');
            loadShopTokens(shopId);
        } else if (error) {
            displayStatusMessage(authStatusDiv, `Falha na autenticação: ${decodeURIComponent(error)}`, 'error');
        }
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // --- Products Tab Logic ---
    syncProductsBtn.addEventListener('click', async () => {
        const shopId = productShopIdInput.value;
        if (!shopId) {
            displayStatusMessage(productsListDiv, 'Por favor, insira o Shop ID.', 'error');
            return;
        }
        localStorage.setItem('shopee_shop_id', shopId);

        try {
            await fetchApi(`/products/${shopId}/sync`, { method: 'POST' });
            displayStatusMessage(productsListDiv, 'Produtos sincronizados com sucesso!', 'success');
            loadProducts(shopId);
        } catch (error) {
            displayStatusMessage(productsListDiv, `Erro ao sincronizar produtos: ${error.message}`, 'error');
        }
    });

    async function loadProducts(shopId) {
        try {
            const products = await fetchApi(`/products/${shopId}`);
            productsListDiv.innerHTML = '';
            if (products.length === 0) {
                productsListDiv.innerHTML = '<p>Nenhum produto encontrado. Sincronize para ver os dados.</p>';
                return;
            }
            products.forEach(product => {
                const productCard = document.createElement('div');
                productCard.className = 'card product-card';
                productCard.innerHTML = `
                    <h3>${product.product_name}</h3>
                    <img src="${product.images[0] || 'https://via.placeholder.com/200x200?text=No+Image'}" alt="${product.product_name}" class="product-image">
                    <p><strong>ID:</strong> ${product.item_id}</p>
                    <p><strong>Preço:</strong> <span class="price">R$ ${product.price.toFixed(2)}</span></p>
                    <p><strong>Estoque:</strong> ${product.stock}</p>
                    <p><strong>Avaliação:</strong> ${product.rating_star || 'N/A'} ⭐</p>
                    <p><strong>Vendas:</strong> ${product.sales || 0}</p>
                    <p><strong>Visualizações:</strong> ${product.views || 0}</p>
                    <p><strong>Descrição:</strong> ${product.description ? product.description.substring(0, 100) + '...' : 'N/A'}</p>
                    <p><strong>Última Sinc.:</strong> ${formatDate(product.updatedAt)}</p>
                `;
                productsListDiv.appendChild(productCard);
            });
        } catch (error) {
            productsListDiv.innerHTML = `<p class="status-message error">Erro ao carregar produtos: ${error.message}</p>`;
        }
    }

    // --- Orders Tab Logic ---
    syncOrdersBtn.addEventListener('click', async () => {
        const shopId = orderShopIdInput.value;
        if (!shopId) {
            displayStatusMessage(ordersListDiv, 'Por favor, insira o Shop ID.', 'error');
            return;
        }
        localStorage.setItem('shopee_shop_id', shopId);

        try {
            await fetchApi(`/orders/${shopId}/sync`, { method: 'POST' });
            displayStatusMessage(ordersListDiv, 'Pedidos sincronizados com sucesso!', 'success');
            loadOrders(shopId);
        } catch (error) {
            displayStatusMessage(ordersListDiv, `Erro ao sincronizar pedidos: ${error.message}`, 'error');
        }
    });

    async function loadOrders(shopId) {
        try {
            const orders = await fetchApi(`/orders/${shopId}`);
            ordersListDiv.innerHTML = '';
            alertsListDiv.innerHTML = '';

            if (orders.length === 0) {
                ordersListDiv.innerHTML = '<p>Nenhum pedido encontrado. Sincronize para ver os dados.</p>';
                alertsListDiv.innerHTML = '<p>Nenhum alerta.</p>';
                return;
            }

            let hasAlerts = false;
            orders.forEach(order => {
                // Display alerts
                order.alerts.filter(alert => !alert.is_resolved).forEach(alert => {
                    hasAlerts = true;
                    const alertItem = document.createElement('div');
                    alertItem.className = 'alert-item';
                    alertItem.innerHTML = `
                        <span><strong>${alert.type.replace('_', ' ')}:</strong> ${alert.message}</span>
                        <button data-alert-id="${alert.id}">Resolver</button>
                    `;
                    alertsListDiv.appendChild(alertItem);
                });

                // Display order cards
                const orderCard = document.createElement('div');
                orderCard.className = 'card order-card';
                orderCard.innerHTML = `
                    <h3>Pedido #${order.order_sn}</h3>
                    <p><strong>Status:</strong> ${order.order_status}</p>
                    <p><strong>Total:</strong> R$ ${order.total_amount.toFixed(2)}</p>
                    <p><strong>Endereço:</strong> ${order.recipient_address ? order.recipient_address.full_address : 'N/A'}</p>
                    <p><strong>Transportadora:</strong> ${order.shipping_carrier || 'N/A'}</p>
                    <p><strong>Data Criação:</strong> ${formatDate(order.create_time)}</p>
                    <p><strong>Última Sinc.:</strong> ${formatDate(order.updatedAt)}</p>
                    <div class="order-items">
                        <h4>Itens:</h4>
                        ${order.items.map(item => `<p class="order-item">${item.quantity}x ${item.item_name} (${item.model_name || 'N/A'}) - R$ ${item.unit_price.toFixed(2)}</p>`).join('')}
                    </div>
                `;
                ordersListDiv.appendChild(orderCard);
            });

            if (!hasAlerts) {
                alertsListDiv.innerHTML = '<p>Nenhum alerta.</p>';
            }

            // Add event listeners for resolve buttons
            alertsListDiv.querySelectorAll('button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    const alertId = event.target.dataset.alertId;
                    try {
                        await fetchApi(`/alerts/${alertId}/resolve`, { method: 'PUT' });
                        displayStatusMessage(alertsListDiv, 'Alerta resolvido com sucesso!', 'success');
                        loadOrders(shopId); // Reload orders to update alerts
                    } catch (error) {
                        displayStatusMessage(alertsListDiv, `Erro ao resolver alerta: ${error.message}`, 'error');
                    }
                });
            });

        } catch (error) {
            ordersListDiv.innerHTML = `<p class="status-message error">Erro ao carregar pedidos: ${error.message}</p>`;
            alertsListDiv.innerHTML = `<p class="status-message error">Erro ao carregar alertas: ${error.message}</p>`;
        }
    }

    // --- Initial Load ---
    const initialShopId = localStorage.getItem('shopee_shop_id');
    if (initialShopId) {
        authShopIdInput.value = initialShopId;
        productShopIdInput.value = initialShopId;
        orderShopIdInput.value = initialShopId;
        loadShopTokens(initialShopId);
        loadProducts(initialShopId);
        loadOrders(initialShopId);
    } else {
        // Default to Auth tab if no shop_id is stored
        document.querySelector('.tab-button[data-tab="auth"]').click();
    }
});