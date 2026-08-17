/**
 * Branded customer account app using Shopify Customer Account API.
 * OAuth 2.0 PKCE flow with client-side routing on the account page.
 */

const STORAGE_PREFIX = 'rw_customer_account_';
const API_VERSION = '2026-01';

/** @typedef {'welcome' | 'orders' | 'order' | 'addresses'} AccountView */

/**
 * @param {string} key
 * @returns {string | null}
 */
function getStored(key) {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 */
function setStored(key, value) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} key
 */
function removeStored(key) {
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * @param {number} length
 */
function randomString(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {string} plain
 */
async function sha256(plain) {
  const data = new TextEncoder().encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

/**
 * @param {ArrayBuffer} buffer
 */
function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {string} verifier
 */
async function createCodeChallenge(verifier) {
  return base64UrlEncode(await sha256(verifier));
}

/**
 * @param {number} amount
 * @param {string} currencyCode
 */
function formatMoney(amount, currencyCode) {
  const numeric = Number.parseFloat(amount);
  if (Number.isNaN(numeric)) return amount;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
    }).format(numeric);
  } catch {
    return `${currencyCode} ${numeric.toFixed(2)}`;
  }
}

/**
 * @param {string | null | undefined} isoDate
 */
function formatDate(isoDate) {
  if (!isoDate) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

/**
 * @param {string | null | undefined} value
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} status
 */
function formatStatus(status) {
  if (!status) return '';
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * @param {ParentNode | null | undefined} scope
 * @param {string} selector
 */
function readTemplateHtml(scope, selector) {
  const el = scope?.querySelector(selector);
  if (!el) return '';

  if (el instanceof HTMLTemplateElement) {
    const fromInner = el.innerHTML.trim();
    if (fromInner) return fromInner;

    const wrap = document.createElement('div');
    wrap.appendChild(el.content.cloneNode(true));
    return wrap.innerHTML.trim();
  }

  return el.innerHTML.trim();
}

/**
 * OAuth redirect_uri must be an absolute https URL with no trailing slash.
 * Prefer the store's primary domain (shop.url) so preview themes still use
 * the production callback registered in Headless settings.
 * @param {string} uri
 * @param {string} [shopUrl]
 */
function normalizeRedirectUri(uri, shopUrl = '') {
  const shopBase = shopUrl.replace(/\/$/, '');
  const fallback = shopBase ? `${shopBase}/pages/account` : `${window.location.origin}/pages/account`;

  try {
    let value = uri.trim();
    if (!value) return fallback;

    if (value.startsWith('shopify://')) {
      value = value.replace(/^shopify:\/+/, '/');
    }

    if (value.startsWith('/') && shopBase) {
      value = `${shopBase}${value}`;
    }

    const url = new URL(value, shopBase || window.location.origin);
    url.hash = '';

    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return `${url.origin}${url.pathname}`;
  } catch {
    return fallback;
  }
}

/**
 * The well-known endpoint only returns GraphQL URLs — derive OAuth endpoints
 * from the shop ID embedded in the graphql_api URL.
 * @param {{ graphql_api?: string; authorization_endpoint?: string; token_endpoint?: string; logout_endpoint?: string; mcp_api?: string }} payload
 */
function resolveOAuthEndpoints(payload) {
  if (payload.authorization_endpoint && payload.token_endpoint) {
    return payload;
  }

  const graphqlApi = payload.graphql_api || '';
  const match = graphqlApi.match(/https:\/\/shopify\.com\/(\d+)\//);
  if (!match) return payload;

  const shopId = match[1];
  const authBase = `https://shopify.com/authentication/${shopId}`;

  return {
    ...payload,
    authorization_endpoint: `${authBase}/oauth/authorize`,
    token_endpoint: `${authBase}/oauth/token`,
    logout_endpoint: `${authBase}/logout`,
  };
}

/** @type {string} */
const MOCK_ORDER_1 = 'gid://shopify/Order/1001';
/** @type {string} */
const MOCK_ORDER_2 = 'gid://shopify/Order/1002';
/** @type {string} */
const MOCK_ORDER_3 = 'gid://shopify/Order/1003';

/** In-memory mock store for interactive address testing */
const mockStore = {
  customer: {
    firstName: 'Joshua',
    lastName: 'Corby',
    emailAddress: { emailAddress: 'joshua@example.com' },
  },
  defaultAddressId: 'gid://shopify/MailingAddress/1',
  addresses: [
    {
      id: 'gid://shopify/MailingAddress/1',
      firstName: 'Emily',
      lastName: 'Ashworth',
      company: '',
      address1: '12 High Street',
      address2: 'Flat 2',
      city: 'Woking',
      province: 'Surrey',
      zip: 'GU21 6BG',
      country: 'United Kingdom',
      phoneNumber: '01276451077',
    },
    {
      id: 'gid://shopify/MailingAddress/2',
      firstName: 'Emily',
      lastName: 'Ashworth',
      company: 'Rowen & Wren',
      address1: 'Hamilton Court',
      address2: 'Carthouse Lane',
      city: 'Horsell',
      province: 'Surrey',
      zip: 'GU21 4XS',
      country: 'United Kingdom',
      phoneNumber: '',
    },
  ],
  orders: [
    {
      id: MOCK_ORDER_1,
      name: '#1042',
      number: 1042,
      processedAt: '2026-07-12T10:30:00Z',
      financialStatus: 'PAID',
      fulfillmentStatus: 'FULFILLED',
      totalPrice: { amount: '248.00', currencyCode: 'GBP' },
      subtotal: { amount: '220.00', currencyCode: 'GBP' },
      totalShipping: { amount: '6.00', currencyCode: 'GBP' },
      totalTax: { amount: '22.00', currencyCode: 'GBP' },
      shippingAddress: {
        firstName: 'Emily',
        lastName: 'Ashworth',
        address1: '12 High Street',
        address2: 'Flat 2',
        city: 'Woking',
        province: 'Surrey',
        zip: 'GU21 6BG',
        country: 'United Kingdom',
      },
      billingAddress: {
        firstName: 'Emily',
        lastName: 'Ashworth',
        address1: '12 High Street',
        address2: 'Flat 2',
        city: 'Woking',
        province: 'Surrey',
        zip: 'GU21 6BG',
        country: 'United Kingdom',
      },
      discountApplications: { edges: [] },
      lineItems: {
        edges: [
          {
            node: {
              title: 'Linen Table Lamp',
              quantity: 1,
              variantTitle: 'Natural',
              originalTotalPrice: { amount: '145.00', currencyCode: 'GBP' },
              image: {
                url: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png',
                altText: 'Linen Table Lamp',
              },
            },
          },
          {
            node: {
              title: 'Ceramic Vase',
              quantity: 1,
              variantTitle: 'Ivory',
              originalTotalPrice: { amount: '75.00', currencyCode: 'GBP' },
              image: {
                url: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_large.png',
                altText: 'Ceramic Vase',
              },
            },
          },
        ],
      },
      fulfillments: {
        edges: [
          {
            node: {
              status: 'SUCCESS',
              trackingInformation: [
                {
                  company: 'Evri',
                  number: 'H01234567890',
                  url: 'https://www.evri.com/track/parcel/H01234567890',
                },
              ],
            },
          },
        ],
      },
    },
    {
      id: MOCK_ORDER_2,
      name: '#1038',
      number: 1038,
      processedAt: '2026-05-03T14:15:00Z',
      financialStatus: 'PAID',
      fulfillmentStatus: 'IN_PROGRESS',
      totalPrice: { amount: '486.00', currencyCode: 'GBP' },
      subtotal: { amount: '438.00', currencyCode: 'GBP' },
      totalShipping: { amount: '48.00', currencyCode: 'GBP' },
      totalTax: { amount: '0.00', currencyCode: 'GBP' },
      shippingAddress: {
        firstName: 'Emily',
        lastName: 'Ashworth',
        address1: 'Hamilton Court',
        address2: 'Carthouse Lane',
        city: 'Horsell',
        province: 'Surrey',
        zip: 'GU21 4XS',
        country: 'United Kingdom',
      },
      billingAddress: null,
      discountApplications: {
        edges: [
          {
            node: {
              code: 'WREN10',
              value: { amount: '43.80', currencyCode: 'GBP' },
            },
          },
        ],
      },
      lineItems: {
        edges: [
          {
            node: {
              title: 'Upholstered Dining Chair',
              quantity: 2,
              variantTitle: 'Olive Linen',
              originalTotalPrice: { amount: '438.00', currencyCode: 'GBP' },
              image: {
                url: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-3_large.png',
                altText: 'Upholstered Dining Chair',
              },
            },
          },
        ],
      },
      fulfillments: { edges: [] },
    },
    {
      id: MOCK_ORDER_3,
      name: '#1021',
      number: 1021,
      processedAt: '2026-01-18T09:00:00Z',
      financialStatus: 'REFUNDED',
      fulfillmentStatus: 'UNFULFILLED',
      totalPrice: { amount: '62.00', currencyCode: 'GBP' },
      subtotal: { amount: '56.00', currencyCode: 'GBP' },
      totalShipping: { amount: '6.00', currencyCode: 'GBP' },
      totalTax: { amount: '0.00', currencyCode: 'GBP' },
      shippingAddress: null,
      billingAddress: null,
      discountApplications: { edges: [] },
      lineItems: {
        edges: [
          {
            node: {
              title: 'Scented Candle',
              quantity: 2,
              variantTitle: 'Wild Fig',
              originalTotalPrice: { amount: '56.00', currencyCode: 'GBP' },
              image: null,
            },
          },
        ],
      },
      fulfillments: { edges: [] },
    },
  ],
};

/**
 * @param {Record<string, unknown>} order
 */
function mockOrderListNode(order) {
  const firstLineItem = order.lineItems.edges[0]?.node;
  return {
    id: order.id,
    name: order.name,
    processedAt: order.processedAt,
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    totalPrice: order.totalPrice,
    lineItems: {
      edges: firstLineItem
        ? [{ node: { title: firstLineItem.title, image: firstLineItem.image } }]
        : [],
    },
  };
}

/**
 * @param {string} query
 * @param {Record<string, unknown>} variables
 */
async function mockGraphql(query, variables = {}) {
  await new Promise((resolve) => setTimeout(resolve, 350));

  if (query.includes('CustomerOverview') || query.includes('CustomerWelcome') || query.includes('CustomerFirstName') || query.includes('CustomerOrders')) {
    const limit = query.includes('first: 5') ? 5 : 20;
    return {
      customer: {
        ...mockStore.customer,
        orders: {
          edges: mockStore.orders.slice(0, limit).map((order) => ({
            node: mockOrderListNode(order),
          })),
        },
      },
    };
  }

  if (query.includes('query CustomerOrder')) {
    const orderId = String(variables.id || '');
    const order = mockStore.orders.find((entry) => entry.id === orderId);
    return { order: order || null };
  }

  if (query.includes('CustomerAddresses')) {
    return {
      customer: {
        defaultAddress: mockStore.defaultAddressId ? { id: mockStore.defaultAddressId } : null,
        addresses: {
          edges: mockStore.addresses.map((address) => ({ node: address })),
        },
      },
    };
  }

  if (query.includes('customerAddressDelete')) {
    const id = String(variables.id || '');
    mockStore.addresses = mockStore.addresses.filter((address) => address.id !== id);
    if (mockStore.defaultAddressId === id) {
      mockStore.defaultAddressId = mockStore.addresses[0]?.id || null;
    }
    return { customerAddressDelete: { deletedAddressId: id, userErrors: [] } };
  }

  if (query.includes('customerAddressSetDefault')) {
    const id = String(variables.id || '');
    mockStore.defaultAddressId = id;
    return { customerAddressSetDefault: { customerAddress: { id }, userErrors: [] } };
  }

  if (query.includes('customerAddressUpdate')) {
    const id = String(variables.id || '');
    const addressInput = /** @type {Record<string, string>} */ (variables.address || {});
    mockStore.addresses = mockStore.addresses.map((address) =>
      address.id === id ? { ...address, ...addressInput, id } : address
    );
    return { customerAddressUpdate: { customerAddress: { id }, userErrors: [] } };
  }

  if (query.includes('customerAddressCreate')) {
    const addressInput = /** @type {Record<string, string>} */ (variables.address || {});
    const id = `gid://shopify/MailingAddress/${Date.now()}`;
    mockStore.addresses.push({ ...addressInput, id });
    if (variables.defaultAddress) mockStore.defaultAddressId = id;
    return { customerAddressCreate: { customerAddress: { id }, userErrors: [] } };
  }

  throw new Error('Mock API: unhandled query');
}

/**
 * @param {Record<string, unknown>} config
 */
function resolveMockMode(config) {
  if (config.mockMode === true) return true;
  const params = new URLSearchParams(window.location.search);
  return params.get('mock') === '1' || params.get('mock') === 'true';
}

const DEFAULT_STRINGS = {
  nav_welcome: 'A Warm Welcome',
  nav_address_book: 'My Address Book',
  nav_orders: 'My Orders',
  nav_returns: 'Returns',
  nav_logout: 'Logout',
  welcome_hero: 'Welcome {{ name }}',
  welcome_eyebrow: 'A few new additions',
  welcome_heading: 'Welcome Back',
  welcome_body:
    "It's good to see you again. You'll notice a few new things since your last visit. Pieces made to be used, lived with, and gathered around. Take a look around when it suits.",
  welcome_cta: 'Peruse our current collection',
  account_navigation: 'Account navigation',
  account_title: 'Account',
  sign_in: 'Sign In',
  email_address: 'Email address',
  password: 'Password',
  forgotten_password: 'Forgotten your password?',
  new_user: 'New User?',
  join_us: 'Join us',
  addresses_hero: 'Your Addresses',
  orders_hero: 'Your Orders',
  add_new_address: 'Add A New Address',
  your_addresses: 'Your Addresses',
  no_addresses: "You haven't added any addresses yet.",
  no_orders: "You haven't placed any orders just yet.",
  add_address: 'Add Address',
  update_address: 'Update',
  set_default_address: 'Set as default address',
  default_address: 'Default Address',
  edit: 'Edit',
  delete: 'Delete',
  back_to_orders: 'Back',
  payment_status: 'Payment Status',
  fulfillment_status: 'Fulfillment Status',
  items: 'Order Summary',
  shipping: 'Delivery',
  tax: 'Tax',
  subtotal: 'Subtotal',
  total: 'Total',
  shipping_address: 'Delivery Address',
  billing_address: 'Billing Address',
  first_name: 'First name*',
  last_name: 'Last name*',
  company: 'Company name (optional)',
  address1: 'Address line 1*',
  address2: 'Address line 2',
  city: 'Town / City',
  province: 'Province',
  postcode: 'Postcode*',
  country: 'Select Country...*',
  phone: 'Phone number',
};

class CustomerAccountApp {
  /** @type {HTMLElement | null} */
  #root = null;

  /** @type {Record<string, string>} */
  #strings = {};

  /** @type {string} */
  #clientId = '';

  /** @type {string} */
  #redirectUri = '';

  /** @type {string} */
  #registerUrl = '/account/register';

  /** @type {string} */
  #loginUrl = '/account/login';

  /** @type {string} */
  #shopDomain = '';

  /** @type {string} */
  #locale = 'en-GB';

  /** @type {string} */
  #regionCountry = 'GB';

  /** @type {{ authorization_endpoint?: string; token_endpoint?: string; logout_endpoint?: string; graphql_api?: string } | null} */
  #endpoints = null;

  /** @type {boolean} */
  #isAuthenticated = false;

  /** @type {boolean} */
  #mockMode = false;

  /** @type {boolean} */
  #mockPersistParam = false;

  /** @type {boolean} */
  #mockSignedOut = false;

  /** @type {Record<string, string>} */
  #content = {};

  /** @type {string | null} */
  #customerFirstName = null;

  /**
   * @param {HTMLElement} root
   * @param {Record<string, unknown>} config
   */
  constructor(root, config) {
    this.#root = root;
    this.#strings = /** @type {Record<string, string>} */ (config.strings || {});
    this.#content = /** @type {Record<string, string>} */ (config.content || {});
    this.#clientId = String(config.clientId || '');
    this.#redirectUri = normalizeRedirectUri(
      String(config.redirectUri || window.location.href.split('?')[0].split('#')[0]),
      String(config.shopUrl || '')
    );
    this.#registerUrl = String(config.registerUrl || '/account/register');
    this.#loginUrl = String(config.loginUrl || '/account/login');
    this.#shopDomain = String(config.shopDomain || window.location.hostname);
    this.#locale = String(config.locale || document.documentElement.lang || 'en-GB');
    this.#regionCountry = String(config.regionCountry || 'GB');
    this.#mockMode = resolveMockMode(config);
    this.#mockPersistParam = new URLSearchParams(window.location.search).has('mock');
  }

  async init() {
    if (!this.#root) return;

    const hasBootShell = Boolean(this.#root.querySelector('[data-account-boot]'));

    try {
      if (this.#mockMode && !this.#mockSignedOut) {
        this.#isAuthenticated = true;
        this.#bindPopState();
        await this.#renderCurrentView();
        this.#renderMockBanner();
        document.dispatchEvent(new CustomEvent('customer-account:auth-change', { detail: { authenticated: true } }));
        return;
      }

      if (this.#mockMode && this.#mockSignedOut) {
        this.#isAuthenticated = false;
        this.#bindPopState();
        await this.#renderCurrentView();
        return;
      }

      if (!hasBootShell) {
        this.#renderLoading();
      }

      await this.#discoverEndpoints();

      const handledCallback = await this.#handleOAuthCallback();
      if (!handledCallback) {
        await this.#ensureValidSession();
      }

      this.#bindPopState();
      await this.#renderCurrentView(hasBootShell);
    } catch (error) {
      const message = error instanceof Error ? error.message : this.#t('error_generic');
      if (this.#root?.querySelector('[data-account-boot]')) {
        this.#showGuestError(message);
        this.#bindGuestEvents();
      } else {
        this.#renderError(message);
      }
    }
  }

  #t(key, replacements = {}) {
    const fromConfig = this.#strings[key];
    const looksMissing =
      !fromConfig ||
      fromConfig === key ||
      fromConfig.startsWith('customer_account.') ||
      fromConfig.toLowerCase().startsWith('translation missing');
    let value = looksMissing ? DEFAULT_STRINGS[key] || fromConfig || key : fromConfig;
    Object.entries(replacements).forEach(([token, replacement]) => {
      value = value.replace(new RegExp(`{{\\s*${token}\\s*}}`, 'g'), String(replacement));
    });
    return value;
  }

  #renderLoading() {
    if (!this.#root) return;
    this.#root.innerHTML = `<div class="customer-account__state"><p>${escapeHtml(this.#t('loading'))}</p></div>`;
  }

  /**
   * @param {string} message
   */
  #showGuestError(message) {
    if (!this.#root) return;

    const boot = this.#root.querySelector('[data-account-boot]');
    if (!boot) {
      this.#renderError(message);
      return;
    }

    let banner = boot.querySelector('[data-account-error]');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'customer-account__state customer-account__state--error';
      banner.setAttribute('data-account-error', '');
      boot.querySelector('.customer-account__inner')?.prepend(banner);
    }

    banner.innerHTML = `<p>${escapeHtml(message)}</p>`;
  }

  #clearGuestError() {
    this.#root?.querySelector('[data-account-error]')?.remove();
  }

  /**
   * @param {string} message
   */
  #renderError(message) {
    if (!this.#root) return;
    delete this.#root.dataset.guestBound;
    this.#root.innerHTML = `
      <div class="customer-account__state customer-account__state--error">
        <p>${escapeHtml(message)}</p>
        <button type="button" class="customer-account__btn customer-account__retry">${escapeHtml(this.#t('try_again'))}</button>
      </div>
    `;
    this.#root.querySelector('.customer-account__retry')?.addEventListener('click', () => {
      this.init();
    });
  }

  async #discoverEndpoints() {
    const response = await fetch(`https://${this.#shopDomain}/.well-known/customer-account-api`);
    if (!response.ok) {
      throw new Error(this.#t('error_discovery'));
    }

    this.#endpoints = resolveOAuthEndpoints(await response.json());

    if (!this.#endpoints.authorization_endpoint || !this.#endpoints.token_endpoint) {
      throw new Error(this.#t('error_discovery'));
    }
  }

  async #handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code) return false;

    const savedState = getStored('oauth_state');
    const verifier = getStored('code_verifier');

    if (!savedState || !verifier || state !== savedState) {
      throw new Error(this.#t('error_auth_state'));
    }

    await this.#exchangeCode(code, verifier);

    removeStored('oauth_state');
    removeStored('code_verifier');

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('code');
    cleanUrl.searchParams.delete('state');
    window.history.replaceState({}, '', cleanUrl.toString());

    return true;
  }

  /**
   * @param {string} code
   * @param {string} verifier
   */
  async #exchangeCode(code, verifier) {
    if (!this.#endpoints?.token_endpoint) {
      throw new Error(this.#t('error_discovery'));
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.#clientId,
      redirect_uri: this.#redirectUri,
      code,
      code_verifier: verifier,
    });

    const response = await fetch(this.#endpoints.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(this.#t('error_auth_token'));
    }

    const payload = await response.json();
    this.#persistTokens(payload);
  }

  /**
   * @param {{ access_token?: string; refresh_token?: string; expires_in?: number }} payload
   */
  #persistTokens(payload) {
    if (!payload.access_token) {
      throw new Error(this.#t('error_auth_token'));
    }

    setStored('access_token', payload.access_token);

    if (payload.refresh_token) {
      setStored('refresh_token', payload.refresh_token);
    }

    if (payload.id_token) {
      setStored('id_token', payload.id_token);
    }

    const expiresIn = Number(payload.expires_in || 3600);
    setStored('expires_at', String(Date.now() + expiresIn * 1000));
    this.#isAuthenticated = true;
    document.dispatchEvent(new CustomEvent('customer-account:auth-change', { detail: { authenticated: true } }));
  }

  async #ensureValidSession() {
    const token = getStored('access_token');
    const expiresAt = Number(getStored('expires_at') || 0);

    if (token && expiresAt > Date.now() + 60000) {
      this.#isAuthenticated = true;
      return;
    }

    const refreshToken = getStored('refresh_token');
    if (refreshToken) {
      const refreshed = await this.#refreshAccessToken(refreshToken);
      if (refreshed) {
        this.#isAuthenticated = true;
        return;
      }
    }

    this.#isAuthenticated = false;
    document.dispatchEvent(new CustomEvent('customer-account:auth-change', { detail: { authenticated: false } }));
  }

  /**
   * @param {string} refreshToken
   */
  async #refreshAccessToken(refreshToken) {
    if (!this.#endpoints?.token_endpoint) return false;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.#clientId,
      refresh_token: refreshToken,
    });

    const response = await fetch(this.#endpoints.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      this.#clearSession();
      return false;
    }

    const payload = await response.json();
    this.#persistTokens(payload);
    return true;
  }

  #clearSession() {
    ['access_token', 'refresh_token', 'expires_at', 'id_token'].forEach(removeStored);
    this.#isAuthenticated = false;
    document.dispatchEvent(new CustomEvent('customer-account:auth-change', { detail: { authenticated: false } }));
  }

  async #startLogin() {
    if (!this.#clientId) {
      throw new Error(this.#t('error_client_id'));
    }

    if (!this.#endpoints?.authorization_endpoint) {
      throw new Error(this.#t('error_discovery'));
    }

    const verifier = randomString(64);
    const challenge = await createCodeChallenge(verifier);
    const state = randomString(32);

    setStored('code_verifier', verifier);
    setStored('oauth_state', state);

    const url = new URL(this.#endpoints.authorization_endpoint);
    url.searchParams.set('client_id', this.#clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.#redirectUri);
    url.searchParams.set('scope', 'openid email customer-account-api:full');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('locale', this.#locale);
    url.searchParams.set('region_country', this.#regionCountry);

    const emailHint = this.#root?.querySelector('[data-login-form] [name="email"]')?.value.trim();
    if (emailHint) {
      url.searchParams.set('login_hint', emailHint);
    }

    window.location.assign(url.toString());
  }

  #renderMockBanner() {
    const section = this.#root?.closest('[data-customer-account-section]');
    if (!section || section.querySelector('[data-mock-banner]')) return;

    const banner = document.createElement('div');
    banner.className = 'customer-account__mock-banner';
    banner.setAttribute('data-mock-banner', '');
    banner.innerHTML = `<p>${escapeHtml(this.#t('mock_mode_banner'))}</p>`;
    section.prepend(banner);
  }

  #removeMockBanner() {
    this.#root?.closest('[data-customer-account-section]')?.querySelector('[data-mock-banner]')?.remove();
  }

  async #logout() {
    if (this.#mockMode) {
      this.#mockSignedOut = true;
      this.#isAuthenticated = false;
      this.#removeMockBanner();
      document.dispatchEvent(new CustomEvent('customer-account:auth-change', { detail: { authenticated: false } }));
      this.#navigate('welcome');
      await this.#renderCurrentView();
      return;
    }

    const idToken = getStored('id_token');
    const logoutEndpoint = this.#endpoints?.logout_endpoint;

    this.#clearSession();
    this.#navigate('welcome');

    if (logoutEndpoint && idToken) {
      const url = new URL(logoutEndpoint);
      url.searchParams.set('id_token_hint', idToken);
      url.searchParams.set('post_logout_redirect_uri', this.#redirectUri);
      window.location.assign(url.toString());
      return;
    }

    await this.#renderCurrentView();
  }

  /**
   * @param {string} query
   * @param {Record<string, unknown>} [variables]
   */
  async #graphql(query, variables = {}) {
    if (this.#mockMode) {
      return mockGraphql(query, variables);
    }

    const token = getStored('access_token');
    if (!token || !this.#endpoints?.graphql_api) {
      throw new Error(this.#t('error_unauthenticated'));
    }

    const response = await fetch(this.#endpoints.graphql_api, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 401) {
      this.#clearSession();
      throw new Error(this.#t('error_session_expired'));
    }

    const payload = await response.json();

    if (payload.errors?.length) {
      throw new Error(payload.errors[0].message || this.#t('error_generic'));
    }

    return payload.data;
  }

  /**
   * @returns {{ view: AccountView; orderId: string | null }}
   */
  #getRoute() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('tab') || params.get('view') || 'welcome';
    const allowed = ['welcome', 'orders', 'order', 'addresses'];
    const view = /** @type {AccountView} */ (allowed.includes(raw) ? raw : 'welcome');
    const orderId = params.get('order_id');
    return { view, orderId };
  }

  /**
   * @param {AccountView} view
   * @param {{ orderId?: string | null }} [options]
   */
  #routeUrl(view, options = {}) {
    const url = new URL(window.location.href);
    url.searchParams.delete('view');

    if (!view || view === 'welcome') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', view);
    }

    if (view === 'order' && options.orderId) {
      url.searchParams.set('order_id', options.orderId);
    } else {
      url.searchParams.delete('order_id');
    }

    if (this.#mockPersistParam) {
      url.searchParams.set('mock', '1');
    }

    return url.toString();
  }

  /**
   * @param {AccountView} view
   * @param {{ orderId?: string | null }} [options]
   */
  #navigate(view, options = {}) {
    window.history.pushState({}, '', this.#routeUrl(view, options));
    this.#renderCurrentView();
  }

  #bindPopState() {
    window.addEventListener('popstate', () => {
      this.#renderCurrentView();
    });
  }

  /**
   * @param {boolean} [hydrateGuest=false]
   */
  async #renderCurrentView(hydrateGuest = false) {
    if (!this.#root) return;

    if (!this.#isAuthenticated) {
      if (hydrateGuest && this.#root.querySelector('[data-account-boot]')) {
        this.#bindGuestEvents();
        return;
      }

      this.#renderGuest();
      return;
    }

    const { view, orderId } = this.#getRoute();

    try {
      switch (view) {
        case 'orders':
          await this.#renderOrders();
          break;
        case 'order':
          await this.#renderOrderDetail(orderId);
          break;
        case 'addresses':
          await this.#renderAddresses();
          break;
        default:
          await this.#renderWelcome();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : this.#t('error_generic');
      if (message === this.#t('error_session_expired') || message === this.#t('error_unauthenticated')) {
        this.#renderGuest(message);
        return;
      }
      this.#renderError(message);
    }
  }

  /**
   * @param {string} [message]
   */
  #renderGuest(message = '') {
    if (!this.#root) return;

    if (this.#root) delete this.#root.dataset.guestBound;

    const section = this.#root.closest('[data-customer-account-section]');
    const loginImage =
      readTemplateHtml(section, '[data-login-image]') || readTemplateHtml(section, '[data-header-image]');

    this.#root.innerHTML = `
      <section class="customer-account customer-account--guest">
        <div class="customer-account__inner">
          ${message ? `<div class="customer-account__state customer-account__state--error"><p>${escapeHtml(message)}</p></div>` : ''}
          <div class="customer-account__body customer-account__body--split">
            <div class="customer-account__items">
              <div class="customer-account__item">
                <div class="customer-account__box">
                  <h2 class="customer-account__box-title">${escapeHtml(this.#t('sign_in'))}</h2>
                  <form class="customer-account__login-form" data-login-form action="#" method="post" novalidate>
                    <div class="customer-account__form-row">
                      <input class="customer-account__input" type="email" name="email" placeholder="${escapeHtml(this.#t('email_address'))}" autocomplete="email">
                    </div>
                    <div class="customer-account__form-row">
                      <input class="customer-account__input" type="password" name="password" placeholder="${escapeHtml(this.#t('password'))}" autocomplete="current-password">
                    </div>
                    <div class="customer-account__form-footer">
                      <button type="button" class="customer-account__btn customer-account__sign-in">${escapeHtml(this.#t('sign_in'))}</button>
                      <a class="customer-account__link customer-account__forgot" href="${escapeHtml(this.#loginUrl)}#recover">${escapeHtml(this.#t('forgotten_password'))}</a>
                    </div>
                  </form>
                </div>
              </div>
              <div class="customer-account__item">
                <div class="customer-account__box">
                  <h2 class="customer-account__box-title">${escapeHtml(this.#t('new_user'))}</h2>
                  <button type="button" class="customer-account__btn customer-account__sign-up">${escapeHtml(this.#t('join_us'))}</button>
                </div>
              </div>
            </div>
            <aside class="customer-account__aside">${loginImage}</aside>
          </div>
        </div>
      </section>
    `;

    this.#bindGuestEvents();
  }

  #bindGuestEvents() {
    if (this.#root?.dataset.guestBound === 'true') return;
    if (this.#root) this.#root.dataset.guestBound = 'true';

    const setButtonsDisabled = (disabled) => {
      this.#root
        ?.querySelectorAll('.customer-account__sign-in, .customer-account__sign-up')
        .forEach((button) => {
          button.disabled = disabled;
        });
    };

    const startSession = async () => {
      if (this.#mockMode || this.#mockPersistParam) {
        this.#mockMode = true;
        this.#mockSignedOut = false;
        this.init();
        return;
      }

      this.#clearGuestError();
      setButtonsDisabled(true);

      try {
        if (!this.#endpoints?.authorization_endpoint) {
          await this.#discoverEndpoints();
        }

        await this.#startLogin();
      } catch (error) {
        setButtonsDisabled(false);
        this.#showGuestError(error instanceof Error ? error.message : this.#t('error_generic'));
      }
    };

    this.#root?.querySelector('[data-login-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      startSession();
    });

    this.#root?.querySelector('.customer-account__sign-in')?.addEventListener('click', () => {
      startSession();
    });

    this.#root?.querySelector('.customer-account__sign-up')?.addEventListener('click', () => {
      startSession();
    });
  }

  #navHtml(activeView) {
    const returnsUrl = this.#content.returnsUrl || 'https://www.rowenandwren.co.uk/a/returns';
    const items = [
      { view: 'welcome', label: this.#t('nav_welcome') },
      { view: 'addresses', label: this.#t('nav_address_book') },
      { view: 'orders', label: this.#t('nav_orders') },
    ];

    const links = items
      .map((item) => {
        const active = item.view === activeView ? ' customer-account__nav-link--active' : '';
        return `<li class="customer-account__nav-item"><a href="${escapeHtml(this.#routeUrl(item.view))}" class="customer-account__nav-link${active}" data-nav-view="${item.view}">${escapeHtml(item.label)}</a></li>`;
      })
      .join('');

    return `
      <nav class="customer-account__nav" aria-label="${escapeHtml(this.#t('account_navigation'))}">
        <ul class="customer-account__nav-list">
          ${links}
          <li class="customer-account__nav-item"><a class="customer-account__nav-link${activeView === 'returns' ? ' customer-account__nav-link--active' : ''}" href="${escapeHtml(returnsUrl)}">${escapeHtml(this.#t('nav_returns'))}</a></li>
          <li class="customer-account__nav-item"><button type="button" class="customer-account__nav-button" data-logout>${escapeHtml(this.#t('nav_logout'))}</button></li>
        </ul>
      </nav>
    `;
  }

  /**
   * @param {AccountView} activeView
   */
  #bindNav(activeView) {
    this.#root?.querySelectorAll('[data-nav-view]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const view = /** @type {AccountView} */ (link.getAttribute('data-nav-view') || 'welcome');
        this.#navigate(view);
      });
    });

    this.#root?.querySelector('[data-logout]')?.addEventListener('click', () => {
      this.#logout();
    });
  }

  async #ensureCustomerFirstName() {
    if (this.#customerFirstName) return;

    const data = await this.#graphql(`
      query CustomerFirstName {
        customer {
          firstName
        }
      }
    `);

    this.#customerFirstName = data.customer?.firstName || '';
  }

  async #renderWelcome() {
    const data = await this.#graphql(`
      query CustomerWelcome {
        customer {
          firstName
        }
      }
    `);

    const firstName = data.customer?.firstName || '';
    this.#customerFirstName = firstName;

    const section = this.#root?.closest('[data-customer-account-section]');
    const welcomeImage = readTemplateHtml(section, '[data-welcome-image]') || readTemplateHtml(section, '[data-login-image]');
    const seasonalStories = readTemplateHtml(section, '[data-seasonal-stories]');

    const collectionUrl = this.#content.collectionUrl || '/collections/all';

    if (!this.#root) return;

    this.#root.innerHTML = `
      <section class="customer-account customer-account--dashboard">
        ${this.#dashboardHeaderHtml('welcome')}
        <div class="customer-account__nav-wrap">
          <div class="customer-account__inner">
            ${this.#navHtml('welcome')}
          </div>
        </div>
        <div class="customer-account__inner customer-account__page">
          <div class="customer-account__welcome-panel">
            <div class="customer-account__welcome-copy">
              <p class="customer-account__welcome-eyebrow">${escapeHtml(this.#content.welcomeEyebrow || this.#t('welcome_eyebrow'))}</p>
              <h2 class="customer-account__welcome-heading">${escapeHtml(this.#content.welcomeHeading || this.#t('welcome_heading'))}</h2>
              <p class="customer-account__welcome-body">${escapeHtml(this.#content.welcomeBody || this.#t('welcome_body'))}</p>
              <a class="customer-account__link customer-account__welcome-cta" href="${escapeHtml(collectionUrl)}">${escapeHtml(this.#content.welcomeCta || this.#t('welcome_cta'))}</a>
            </div>
            <div class="customer-account__welcome-media">${welcomeImage}</div>
          </div>
        </div>
        ${seasonalStories}
      </section>
    `;

    this.#bindNav('welcome');
  }

  async #renderOrders() {
    await this.#ensureCustomerFirstName();

    const data = await this.#graphql(`
      query CustomerOrders {
        customer {
          orders(first: 20, sortKey: PROCESSED_AT, reverse: true) {
            edges {
              node {
                id
                name
                processedAt
                financialStatus
                fulfillmentStatus
                totalPrice { amount currencyCode }
                lineItems(first: 1) {
                  edges {
                    node {
                      title
                      image { url altText }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const orders = data.customer.orders.edges.map((edge) => edge.node);
    const ordersHtml = orders.length
      ? orders.map((order) => this.#orderRowHtml(order)).join('')
      : `<p class="customer-account__order-row customer-account__order-row--empty">${escapeHtml(this.#t('no_orders'))}</p>`;

    if (!this.#root) return;

    this.#root.innerHTML = `
      <section class="customer-account customer-account--dashboard">
        ${this.#dashboardHeaderHtml('orders')}
        <div class="customer-account__nav-wrap">
          <div class="customer-account__inner">
            ${this.#navHtml('orders')}
          </div>
        </div>
        <div class="customer-account__inner customer-account__page">
          <div class="customer-account__column customer-account__column--orders">
            ${ordersHtml}
          </div>
        </div>
      </section>
    `;

    this.#bindNav('orders');
    this.#bindOrderLinks();
  }

  /**
   * @param {string | null} orderId
   */
  async #renderOrderDetail(orderId) {
    if (!orderId) {
      this.#navigate('orders');
      return;
    }

    await this.#ensureCustomerFirstName();

    const data = await this.#graphql(
      `
        query CustomerOrder($id: ID!) {
          order(id: $id) {
            id
            name
            number
            processedAt
            financialStatus
            fulfillmentStatus
            subtotal { amount currencyCode }
            totalShipping { amount currencyCode }
            totalTax { amount currencyCode }
            totalPrice { amount currencyCode }
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              zip
              country
            }
            billingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              zip
              country
            }
            discountApplications(first: 10) {
              edges {
                node {
                  ... on DiscountCodeApplication {
                    code
                    value {
                      ... on MoneyV2 { amount currencyCode }
                      ... on PricingPercentageValue { percentage }
                    }
                  }
                }
              }
            }
            lineItems(first: 50) {
              edges {
                node {
                  title
                  quantity
                  variantTitle
                  originalTotalPrice { amount currencyCode }
                  image { url altText }
                }
              }
            }
            fulfillments(first: 10) {
              edges {
                node {
                  status
                  trackingInformation { company number url }
                }
              }
            }
          }
        }
      `,
      { id: orderId }
    );

    const order = data.order;
    if (!order) {
      if (!this.#root) return;
      this.#root.innerHTML = `
        <section class="customer-account customer-account--dashboard">
          ${this.#dashboardHeaderHtml('orders')}
          <div class="customer-account__nav-wrap">
            <div class="customer-account__inner">
              ${this.#navHtml('orders')}
            </div>
          </div>
          <div class="customer-account__inner customer-account__page">
            <div class="customer-account__state"><p>${escapeHtml(this.#t('order_not_found'))}</p></div>
          </div>
        </section>
      `;
      this.#bindNav('orders');
      return;
    }

    const lineItemsHtml = order.lineItems.edges
      .map(({ node: item }) => {
        const image = item.image?.url
          ? `<img class="customer-account__line-item-image" src="${escapeHtml(item.image.url)}" alt="${escapeHtml(item.image.altText || item.title)}" loading="lazy">`
          : `<div class="customer-account__line-item-image"></div>`;

        return `
          <div class="customer-account__line-item">
            ${image}
            <div>
              <p class="customer-account__order-name">${escapeHtml(item.title)}</p>
              ${item.variantTitle ? `<p class="customer-account__order-status">${escapeHtml(item.variantTitle)}</p>` : ''}
              <p class="customer-account__order-status">${escapeHtml(this.#t('quantity'))}: ${escapeHtml(String(item.quantity))}</p>
            </div>
            <div class="customer-account__order-total">${escapeHtml(formatMoney(item.originalTotalPrice.amount, item.originalTotalPrice.currencyCode))}</div>
          </div>
        `;
      })
      .join('');

    const trackingHtml = order.fulfillments.edges
      .flatMap(({ node: fulfillment }) =>
        (fulfillment.trackingInformation || []).map((tracking) => {
          const label = [tracking.company, tracking.number].filter(Boolean).join(' – ');
          if (tracking.url) {
            return `<p class="customer-account__tracking"><a href="${escapeHtml(tracking.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></p>`;
          }
          return `<p class="customer-account__tracking">${escapeHtml(label)}</p>`;
        })
      )
      .join('');

    const discountTotal = order.discountApplications.edges.reduce((sum, { node }) => {
      const value = node.value;
      if (value?.amount) return sum + Number.parseFloat(value.amount);
      return sum;
    }, 0);

    if (!this.#root) return;

    this.#root.innerHTML = `
      <section class="customer-account customer-account--dashboard">
        ${this.#dashboardHeaderHtml('orders')}
        <div class="customer-account__nav-wrap">
          <div class="customer-account__inner">
            ${this.#navHtml('orders')}
          </div>
        </div>
        <div class="customer-account__inner customer-account__page">
          <a href="${escapeHtml(this.#routeUrl('orders'))}" class="customer-account__link customer-account__back-link" data-nav-view="orders">${escapeHtml(this.#t('back_to_orders'))}</a>
          <div class="customer-account__order-detail-grid">
            <div>
              <p class="customer-account__order-date">${escapeHtml(formatDate(order.processedAt))}</p>
              <p class="customer-account__order-status">${escapeHtml(this.#t('payment_status'))}: ${escapeHtml(formatStatus(order.financialStatus))}</p>
              <p class="customer-account__order-status">${escapeHtml(this.#t('fulfillment_status'))}: ${escapeHtml(formatStatus(order.fulfillmentStatus))}</p>
              ${trackingHtml}
              <h3 class="customer-account__section-title">${escapeHtml(this.#t('items'))}</h3>
              ${lineItemsHtml}
              <div class="customer-account__totals">
                ${this.#totalRow(this.#t('subtotal'), order.subtotal)}
                ${discountTotal > 0 ? this.#totalRow(this.#t('discounts'), { amount: String(discountTotal), currencyCode: order.totalPrice.currencyCode }) : ''}
                ${this.#totalRow(this.#t('shipping'), order.totalShipping)}
                ${order.totalTax ? this.#totalRow(this.#t('tax'), order.totalTax) : ''}
                ${this.#totalRow(this.#t('total'), order.totalPrice, true)}
              </div>
            </div>
            <div>
              <h3 class="customer-account__section-title">${escapeHtml(this.#t('shipping_address'))}</h3>
              ${this.#addressBlockHtml(order.shippingAddress)}
              <h3 class="customer-account__section-title">${escapeHtml(this.#t('billing_address'))}</h3>
              ${this.#addressBlockHtml(order.billingAddress)}
            </div>
          </div>
        </div>
      </section>
    `;

    this.#bindNav('orders');
    this.#root.querySelector('[data-nav-view="orders"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.#navigate('orders');
    });
  }

  async #renderAddresses() {
    await this.#ensureCustomerFirstName();

    const data = await this.#graphql(`
      query CustomerAddresses {
        customer {
          defaultAddress { id }
          addresses(first: 20) {
            edges {
              node {
                id
                firstName
                lastName
                company
                address1
                address2
                city
                province
                zip
                country
                phoneNumber
              }
            }
          }
        }
      }
    `);

    const defaultId = data.customer.defaultAddress?.id;
    const addresses = data.customer.addresses.edges.map((edge) => edge.node);

    const listHtml = addresses.length
      ? addresses.map((address) => this.#addressCardHtml(address, address.id === defaultId)).join('')
      : `<p class="customer-account__empty">${escapeHtml(this.#t('no_addresses'))}</p>`;

    if (!this.#root) return;

    this.#root.innerHTML = `
      <section class="customer-account customer-account--dashboard">
        ${this.#dashboardHeaderHtml('addresses')}
        <div class="customer-account__nav-wrap">
          <div class="customer-account__inner">
            ${this.#navHtml('addresses')}
          </div>
        </div>
        <div class="customer-account__inner customer-account__page">
          <div class="customer-account__columns">
            <div class="customer-account__column customer-account__column--form">
              <h2 class="customer-account__column-title">${escapeHtml(this.#t('add_new_address'))}</h2>
              <div class="customer-account__address-form customer-account__address-form--active" data-address-form="new">${this.#addressFormHtml({}, { includeDefault: true })}</div>
            </div>
            <div class="customer-account__column customer-account__column--addresses">
              <h2 class="customer-account__column-title">${escapeHtml(this.#t('your_addresses'))}</h2>
              ${listHtml}
            </div>
          </div>
        </div>
      </section>
    `;

    this.#bindNav('addresses');
    this.#bindAddressActions();
  }

  /**
   * @param {Record<string, any>} order
   */
  #orderRowHtml(order) {
    const lineItem = order.lineItems?.edges?.[0]?.node;
    const image = lineItem?.image?.url
      ? `<img class="customer-account__order-image" src="${escapeHtml(lineItem.image.url)}" alt="${escapeHtml(lineItem.image.altText || lineItem.title || '')}" loading="lazy">`
      : `<div class="customer-account__order-image"></div>`;

    return `
      <a href="${escapeHtml(this.#routeUrl('order', { orderId: order.id }))}" class="customer-account__order-row" data-order-id="${escapeHtml(order.id)}">
        ${image}
        <div class="customer-account__order-meta">
          <p class="customer-account__order-name">${escapeHtml(order.name)}</p>
          <p class="customer-account__order-date">${escapeHtml(formatDate(order.processedAt))}</p>
          <p class="customer-account__order-status">${escapeHtml(formatStatus(order.financialStatus))} · ${escapeHtml(formatStatus(order.fulfillmentStatus))}</p>
        </div>
        <div class="customer-account__order-total">${escapeHtml(formatMoney(order.totalPrice.amount, order.totalPrice.currencyCode))}</div>
      </a>
    `;
  }

  #bindOrderLinks() {
    this.#root?.querySelectorAll('[data-order-id]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const orderId = link.getAttribute('data-order-id');
        if (orderId) this.#navigate('order', { orderId });
      });
    });
  }

  /**
   * @param {'welcome' | 'orders' | 'addresses'} view
   */
  #dashboardHeaderHtml(view) {
    const section = this.#root?.closest('[data-customer-account-section]');
    const headerImage = readTemplateHtml(section, '[data-header-image]');
    const firstName = this.#customerFirstName;
    let title = this.#t('account_title');

    if (view === 'addresses') {
      title = this.#t('addresses_hero');
    } else if (view === 'orders') {
      title = this.#t('orders_hero');
    } else if (firstName) {
      title = this.#t('welcome_hero', { name: firstName });
    }

    return `
      <header class="customer-account__header customer-account__header--hero">
        <div class="customer-account__header-image">${headerImage}</div>
        <div class="customer-account__header-content">
          <h1 class="customer-account__header-title">${escapeHtml(title)}</h1>
        </div>
      </header>
    `;
  }

  /**
   * @param {Record<string, any> | null | undefined} address
   */
  #addressBlockHtml(address) {
    if (!address) return `<p>${escapeHtml(this.#t('not_available'))}</p>`;

    const lines = [
      [address.firstName, address.lastName].filter(Boolean).join(' '),
      address.company,
      address.address1,
      address.address2,
      [address.city, address.province, address.zip].filter(Boolean).join(', '),
      address.country,
      address.phoneNumber,
    ].filter(Boolean);

    return `<address>${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</address>`;
  }

  /**
   * @param {Record<string, any>} address
   * @param {boolean} isDefault
   */
  #addressCardHtml(address, isDefault) {
    return `
      <article class="customer-account__address${isDefault ? ' customer-account__address--default' : ''}" data-address-id="${escapeHtml(address.id)}">
        ${isDefault ? `<p class="customer-account__order-status">${escapeHtml(this.#t('default_address'))}</p>` : ''}
        ${this.#addressBlockHtml(address)}
        <div class="customer-account__address-actions">
          <button type="button" class="customer-account__link" data-edit-address="${escapeHtml(address.id)}">${escapeHtml(this.#t('edit'))}</button>
          <button type="button" class="customer-account__link" data-delete-address="${escapeHtml(address.id)}">${escapeHtml(this.#t('delete'))}</button>
          ${isDefault ? '' : `<button type="button" class="customer-account__link" data-default-address="${escapeHtml(address.id)}">${escapeHtml(this.#t('set_default'))}</button>`}
        </div>
        <div class="customer-account__address-form" data-address-form="${escapeHtml(address.id)}">${this.#addressFormHtml(address)}</div>
      </article>
    `;
  }

  /**
   * @param {Record<string, any>} [address]
   * @param {{ includeDefault?: boolean }} [options]
   */
  #addressFormHtml(address = {}, options = {}) {
    const id = address.id || 'new';
    const countryOptions = this.#countryOptionsHtml(address.country);

    const defaultCheckbox = options.includeDefault
      ? `<div class="customer-account__checkbox">
          <input type="checkbox" name="defaultAddress" id="AddressDefault-${escapeHtml(id)}">
          <label class="customer-account__label" for="AddressDefault-${escapeHtml(id)}">${escapeHtml(this.#t('set_default_address'))}</label>
        </div>`
      : '';

    const field = (name, key, extra = '') =>
      `<div class="customer-account__form-field"><input class="customer-account__input" type="text" name="${name}" placeholder="${escapeHtml(this.#t(key))}" value="${escapeHtml(address[name] || '')}"${extra}></div>`;

    return `
      <form class="customer-account__address-form-inner" data-address-form-inner="${escapeHtml(id)}">
        ${field('firstName', 'first_name', ' required')}
        ${field('lastName', 'last_name', ' required')}
        ${field('company', 'company')}
        ${field('address1', 'address1', ' required')}
        ${field('address2', 'address2')}
        ${field('city', 'city')}
        <div class="customer-account__form-field">
          <label class="customer-account__label" for="AddressCountry-${escapeHtml(id)}">${escapeHtml(this.#t('country'))}</label>
          <select class="customer-account__input customer-account__select" name="country" id="AddressCountry-${escapeHtml(id)}" required>
            ${countryOptions}
          </select>
        </div>
        ${field('province', 'province')}
        ${field('zip', 'postcode', ' required')}
        <div class="customer-account__form-field"><input class="customer-account__input" type="tel" name="phoneNumber" placeholder="${escapeHtml(this.#t('phone'))}" value="${escapeHtml(address.phoneNumber || '')}"></div>
        ${defaultCheckbox}
        <div class="customer-account__form-actions">
          <button type="submit" class="customer-account__btn customer-account__btn--grey">${escapeHtml(address.id ? this.#t('update_address') : this.#t('add_address'))}</button>
        </div>
      </form>
    `;
  }

  /**
   * @param {string} [selected]
   */
  #countryOptionsHtml(selected = '') {
    const section = this.#root?.closest('[data-customer-account-section]');
    const fromTheme = section?.querySelector('[data-country-options]')?.innerHTML.trim();

    const options =
      fromTheme ||
      ['United Kingdom', 'Ireland', 'France', 'Germany', 'Netherlands', 'Belgium', 'United States', 'Canada', 'Australia', 'New Zealand']
        .map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`)
        .join('');

    if (!selected) return options;

    const escaped = selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return options
      .replace(/\sselected(="[^"]*")?/gi, '')
      .replace(new RegExp(`<option value="${escaped}"`, 'i'), (match) => `${match} selected`);
  }

  #bindAddressActions() {
    this.#root?.querySelector('[data-show-address-form="new"]')?.addEventListener('click', () => {
      this.#root?.querySelector('[data-address-form="new"]')?.classList.add('customer-account__address-form--active');
    });

    this.#root?.querySelectorAll('[data-edit-address]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-edit-address');
        this.#root?.querySelector(`[data-address-form="${id}"]`)?.classList.add('customer-account__address-form--active');
      });
    });

    this.#root?.querySelectorAll('[data-delete-address]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.getAttribute('data-delete-address');
        if (!id || !window.confirm(this.#t('confirm_delete_address'))) return;
        await this.#graphql(
          `mutation DeleteAddress($id: ID!) { customerAddressDelete(addressId: $id) { deletedAddressId userErrors { message } } }`,
          { id }
        );
        await this.#renderAddresses();
      });
    });

    this.#root?.querySelectorAll('[data-default-address]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.getAttribute('data-default-address');
        if (!id) return;
        await this.#graphql(
          `mutation DefaultAddress($id: ID!) { customerAddressSetDefault(addressId: $id) { customerAddress { id } userErrors { message } } }`,
          { id }
        );
        await this.#renderAddresses();
      });
    });

    this.#root?.querySelectorAll('[data-address-form-inner]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const target = /** @type {HTMLFormElement} */ (event.currentTarget);
        const formId = target.getAttribute('data-address-form-inner');
        const formData = new FormData(target);
        const makeDefault = formData.get('defaultAddress') === 'on';
        formData.delete('defaultAddress');
        const address = Object.fromEntries(formData.entries());

        if (formId && formId !== 'new') {
          await this.#graphql(
            `mutation UpdateAddress($id: ID!, $address: CustomerAddressInput!) {
              customerAddressUpdate(addressId: $id, address: $address) {
                customerAddress { id }
                userErrors { message }
              }
            }`,
            { id: formId, address }
          );
        } else {
          const created = await this.#graphql(
            `mutation CreateAddress($address: CustomerAddressInput!, $defaultAddress: Boolean) {
              customerAddressCreate(address: $address, defaultAddress: $defaultAddress) {
                customerAddress { id }
                userErrors { message }
              }
            }`,
            { address, defaultAddress: makeDefault }
          );

          const createdId = created.customerAddressCreate?.customerAddress?.id;
          if (makeDefault && createdId) {
            await this.#graphql(
              `mutation DefaultAddress($id: ID!) { customerAddressSetDefault(addressId: $id) { customerAddress { id } userErrors { message } } }`,
              { id: createdId }
            );
          }
        }

        await this.#renderAddresses();
      });
    });
  }

  /**
   * @param {string} label
   * @param {{ amount?: string; currencyCode?: string } | null | undefined} money
   * @param {boolean} [isTotal]
   */
  #totalRow(label, money, isTotal = false) {
    if (!money?.amount) return '';
    const rowClass = isTotal ? ' customer-account__totals-row--total' : '';
    return `<div class="customer-account__totals-row${rowClass}"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatMoney(money.amount, money.currencyCode || 'GBP'))}</span></div>`;
  }
}

/**
 * @param {HTMLElement} root
 */
function parseAccountConfig(root) {
  const jsonEl = root.closest('[data-customer-account-section]')?.querySelector('[data-customer-account-config]');

  try {
    if (jsonEl?.textContent) return JSON.parse(jsonEl.textContent);
    return JSON.parse(root.dataset.customerAccountConfig || '{}');
  } catch {
    return {};
  }
}

function initCustomerAccountApp(root) {
  if (!root || root.dataset.initialized === 'true') return;

  const config = parseAccountConfig(root);

  root.dataset.initialized = 'true';
  const app = new CustomerAccountApp(root, config);
  app.init();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-customer-account-app]').forEach((root) => {
    initCustomerAccountApp(/** @type {HTMLElement} */ (root));
  });
});

/** Header auth indicator helper */
document.addEventListener('DOMContentLoaded', () => {
  const accountLinks = document.querySelectorAll('[data-customer-account-link]');
  if (!accountLinks.length) return;

  const updateLinks = () => {
    const params = new URLSearchParams(window.location.search);
    const mockActive = params.get('mock') === '1' || params.get('mock') === 'true';
    const authenticated = mockActive || Boolean(sessionStorage.getItem(`${STORAGE_PREFIX}access_token`));
    accountLinks.forEach((link) => {
      link.toggleAttribute('data-authenticated', authenticated);
    });
  };

  updateLinks();
  document.addEventListener('customer-account:auth-change', updateLinks);
});
