(() => {
  const STORAGE_KEYS = {
    cargas: 'gc_cargas',
    motoristas: 'gc_motoristas',
    caminhoes: 'gc_caminhoes',
    viagens: 'gc_viagens',
    pagamentos: 'gc_pagamentos',
    documentos: 'gc_documentos',
  };

  const state = {
    cargas: [],
    motoristas: [],
    caminhoes: [],
    viagens: [],
    pagamentos: [],
    documentos: [],
  };

  // A chave do Supabase usada aqui é pública (anon/publishable). Nunca coloque
  // uma service_role, senha de banco ou segredo neste arquivo.
  const SUPABASE_CONFIG = Object.freeze({
    url: safeText(window.GC_SUPABASE_CONFIG?.url),
    anonKey: safeText(window.GC_SUPABASE_CONFIG?.anonKey),
  });
  // Os dados em cache precisam ser separados por conta. As chaves antigas sem
  // usuário continuam intactas para uma importação única e recuperável.
  const USER_STORAGE_KEY_PREFIX = 'gc_user_state_v1_';
  const LEGACY_STORAGE_CLAIM_KEY = 'gc_legacy_state_owner_v1';
  const LEGACY_LOCAL_ACCESS_KEY = 'gc_local_access_session';
  const PASSWORD_RECOVERY_MARKER_KEY = 'gc_password_recovery_pending_v1';
  const PWA_GUIDE_KEY = 'gc_pwa_install_guide_closed';
  const CLOUD_MIGRATION_KEY_PREFIX = 'gc_supabase_imported_';
  const CLOUD_BACKUP_KEY_PREFIX = 'gc_backup_before_cloud_';
  const CLOUD_STATE_TABLE = 'estado_app';
  const CLOUD_SCHEMA_VERSION = 2;

  let supabaseClient = null;
  let activeCloudUser = null;
  let cloudSyncQueue = Promise.resolve();
  let cloudSyncEnabled = false;
  let authStateSubscription = null;
  let passwordRecoveryMode = false;
  let passwordRecoverySession = null;
  let passwordRecoveryFinishing = false;
  let passwordRecoveryValidationTimer = null;

  const els = {
    page: document.querySelector('.page'),
    hero: document.querySelector('.hero'),

    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    searchStatus: document.getElementById('searchStatus'),
    searchResultsBox: document.getElementById('searchResults'),

    loadForm: document.getElementById('loadForm'),
    driverForm: document.getElementById('driverForm'),
    truckForm: document.getElementById('truckForm'),
    tripForm: document.getElementById('tripForm'),
    paymentForm: document.getElementById('paymentForm'),
    documentForm: document.getElementById('documentForm'),

    recordsSection: document.getElementById('registrosHub'),
    recentRecords: document.getElementById('recentRecords'),
    recordActionStatus: document.getElementById('recordActionStatus'),

    statOpenLoads: document.getElementById('statOpenLoads'),
    statActiveTrips: document.getElementById('statActiveTrips'),
    statPendingFinance: document.getElementById('statPendingFinance'),
    statDocsExpiring: document.getElementById('statDocsExpiring'),

    btnLogin: document.getElementById('btnLogin'),
    loginOverlay: document.getElementById('loginOverlay'),
    loginForm: document.getElementById('loginForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginStatus: document.getElementById('loginStatus'),
    loginSubmitBtn: document.getElementById('loginSubmitBtn'),
    signupBtn: document.getElementById('signupBtn'),
    forgotPasswordBtn: document.getElementById('forgotPasswordBtn'),
    passwordResetRequestForm: document.getElementById('passwordResetRequestForm'),
    passwordResetEmail: document.getElementById('passwordResetEmail'),
    passwordResetRequestStatus: document.getElementById('passwordResetRequestStatus'),
    passwordResetRequestBtn: document.getElementById('passwordResetRequestBtn'),
    cancelPasswordResetRequestBtn: document.getElementById('cancelPasswordResetRequestBtn'),
    passwordUpdateForm: document.getElementById('passwordUpdateForm'),
    newPassword: document.getElementById('newPassword'),
    confirmNewPassword: document.getElementById('confirmNewPassword'),
    passwordUpdateStatus: document.getElementById('passwordUpdateStatus'),
    passwordUpdateBtn: document.getElementById('passwordUpdateBtn'),
    cancelPasswordUpdateBtn: document.getElementById('cancelPasswordUpdateBtn'),
    closePwaGuideBtn: document.getElementById('closePwaGuideBtn'),
    pwaInstallGuide: document.getElementById('pwaInstallGuide'),

    tripLoadSelect: document.querySelector('select[name="cargaViagem"]'),
    tripDriverSelect: document.querySelector('select[name="motoristaViagem"]'),
    tripTruckSelect: document.querySelector('select[name="caminhaoViagem"]'),
    paymentTripSelect: document.querySelector('select[name="viagemPagamento"]'),
    driverTruckSelect: document.getElementById('driverTruckSelect'),
    documentRelatedType: document.querySelector('#documentForm select[name="relacionadoDocumento"]'),
    documentRelatedSelect: document.getElementById('documentRelatedSelect'),

    tripFreightValue: document.getElementById('tripFreightValue'),
    tripCombinedInput: document.querySelector('#tripForm input[name="valorMotorista"]'),
    tripAdvanceInput: document.querySelector('#tripForm input[name="adiantamento"]'),
    // Estes campos são opcionais enquanto o formulário é atualizado.
    tripDailyInput:
      document.getElementById('tripDailyValue') ||
      document.querySelector('#tripForm input[name="diariasViagem"], #tripForm input[name="diariaPrevista"], #tripForm input[name="diarias"]'),
    tripHelperInput:
      document.getElementById('tripHelperValue') ||
      document.querySelector('#tripForm input[name="ajudantesViagem"], #tripForm input[name="ajudantePrevisto"], #tripForm input[name="ajudantes"]'),
    tripFinancialFreight: document.getElementById('tripFinancialFreight'),
    tripFinancialCombined: document.getElementById('tripFinancialCombined'),
    tripFinancialAdvance: document.getElementById('tripFinancialAdvance'),
    tripFinancialBalance: document.getElementById('tripFinancialBalance'),
    tripFinancialDaily: document.getElementById('tripFinancialDaily'),
    tripFinancialHelpers: document.getElementById('tripFinancialHelpers'),
    tripFinancialMargin: document.getElementById('tripFinancialMargin'),
    tripWhatsAppBtn: document.getElementById('tripWhatsAppBtn'),
    tripWhatsAppStatus: document.getElementById('tripWhatsAppStatus'),

    pageTabs: document.querySelectorAll('.page-tabs a'),

    modalOverlay: document.getElementById('recordModalOverlay'),
    modalTitle: document.getElementById('modalTitle'),
    modalContent: document.getElementById('recordModalContent'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    editRecordBtn: document.getElementById('editRecordBtn'),
    saveEditBtn: document.getElementById('saveEditBtn'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),
    deleteRecordBtn: document.getElementById('deleteRecordBtn'),
    deleteConfirmOverlay: document.getElementById('deleteConfirmOverlay'),
    deleteConfirmTitle: document.getElementById('deleteConfirmTitle'),
    deleteConfirmMessage: document.getElementById('deleteConfirmMessage'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

    tripAutoFillLoad: document.getElementById('tripAutoFillLoad'),
    tripAutoFillDriver: document.getElementById('tripAutoFillDriver'),
    tripAutoFillTruck: document.getElementById('tripAutoFillTruck'),
  };

  const ui = {
    searchPanel: null,
    searchPanelSummary: null,
    searchResultsList: null,
    searchPanelClearBtn: null,
    searchPanelTopBtn: null,
    recordsTopBtn: null,
    editForm: null,
  };

  const modalState = {
    type: null,
    id: null,
    mode: 'view',
    dirty: false,
    trigger: null,
  };

  const deleteDialogState = {
    type: null,
    id: null,
    trigger: null,
  };

  let currentSearchQuery = '';
  let activeQuickFilter = null;

  const TYPE_TO_COLLECTION = {
    Carga: 'cargas',
    Motorista: 'motoristas',
    'Caminhão': 'caminhoes',
    Viagem: 'viagens',
    Pagamento: 'pagamentos',
    Documento: 'documentos',
  };

  const RECORD_SCHEMAS = {
    Carga: [
      { name: 'empresa', label: 'Empresa', type: 'text' },
      { name: 'origem', label: 'Origem', type: 'text' },
      { name: 'destino', label: 'Destino', type: 'text' },
      { name: 'peso', label: 'Peso', type: 'text' },
      { name: 'valorFrete', label: 'Valor do frete', type: 'money' },
      { name: 'tipoCarga', label: 'Tipo de carga', type: 'text' },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['Aberta', 'Em andamento', 'Finalizada'],
      },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
    ],
    Motorista: [
      { name: 'nome', label: 'Nome', type: 'text' },
      { name: 'telefone', label: 'Telefone', type: 'text' },
      { name: 'pix', label: 'PIX', type: 'text' },
      { name: 'cnh', label: 'CNH', type: 'text' },
      {
        name: 'mopp',
        label: 'Curso MOPP',
        type: 'select',
        options: [
          { value: 'sim', label: 'Sim' },
          { value: 'nao', label: 'Não' },
        ],
        display: (value) => (String(value).toLowerCase() === 'sim' ? 'Sim' : 'Não'),
      },
      { name: 'vencimentoCnh', label: 'Vencimento CNH', type: 'date' },
      {
        name: 'truckId',
        label: 'Caminhão habitual',
        type: 'select',
        options: () => state.caminhoes.map((item) => ({ value: item.id, label: getTruckLabel(item) })),
        display: (value) => (value ? getTruckLabelById(value) : 'Sem caminhão habitual'),
      },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
    ],
    'Caminhão': [
      { name: 'placaCavalo', label: 'Placa do cavalo', type: 'text' },
      { name: 'placaCarreta', label: 'Placa da carreta', type: 'text' },
      { name: 'antt', label: 'ANTT / RNTRC', type: 'text' },
      { name: 'tipoCaminhao', label: 'Tipo', type: 'text' },
      { name: 'vencimentoDocumento', label: 'Vencimento documento', type: 'date' },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
    ],
    Viagem: [
      {
        name: 'cargaId',
        label: 'Carga',
        type: 'select',
        options: () =>
          state.cargas.map((item) => ({
            value: item.id,
            label: getCargaLabel(item),
          })),
        display: (value) => getCargaLabelById(value),
      },
      {
        name: 'motoristaId',
        label: 'Motorista',
        type: 'select',
        options: () =>
          state.motoristas.map((item) => ({
            value: item.id,
            label: item.nome || 'Motorista sem nome',
          })),
        display: (value) => getDriverLabelById(value),
      },
      {
        name: 'caminhaoId',
        label: 'Caminhão',
        type: 'select',
        options: () =>
          state.caminhoes.map((item) => ({
            value: item.id,
            label: getTruckLabel(item),
          })),
        display: (value) => getTruckLabelById(value),
      },
      { name: 'valorFrete', label: 'Valor do frete', type: 'money' },
      { name: 'valorMotorista', label: 'Valor combinado motorista', type: 'money' },
      { name: 'adiantamento', label: 'Adiantamento inicial', type: 'money' },
      {
        name: 'origemAdiantamento',
        label: 'Quem pagou o adiantamento?',
        type: 'select',
        options: [
          { value: 'avo', label: 'Avô' },
          { value: 'transportadora', label: 'Transportadora — Alexandre' },
          { value: 'outro', label: 'Outro' },
        ],
      },
      { name: 'diarias', label: 'Diárias previstas', type: 'money' },
      { name: 'ajudantes', label: 'Ajudantes / ajuda de custo prevista', type: 'money' },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['Planejada', 'Em andamento', 'Carregada', 'Finalizada'],
      },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
    ],
    Pagamento: [
      {
        name: 'viagemId',
        label: 'Viagem',
        type: 'select',
        options: () =>
          state.viagens.map((item) => ({
            value: item.id,
            label: getTripLabel(item),
          })),
        display: (value) => getTripLabelById(value),
      },
      {
        name: 'tipo',
        label: 'Tipo',
        type: 'select',
        options: [
          'Adiantamento',
          'Saldo motorista',
          'Diária',
          'Ajudante',
          'Ajuda de custo',
          'Recebimento cliente',
        ],
      },
      {
        name: 'origemPagamento',
        label: 'Quem pagou / recebeu',
        type: 'select',
        options: ['Avô', 'Transportadora — Alexandre', 'Outro'],
      },
      { name: 'valor', label: 'Valor', type: 'money' },
      { name: 'dataPagamento', label: 'Data', type: 'date' },
      { name: 'observacao', label: 'Observação', type: 'textarea' },
    ],
    Documento: [
      {
        name: 'tipo',
        label: 'Tipo',
        type: 'select',
        options: ['CNH', 'Documento do cavalo', 'Documento da carreta', 'ANTT', 'Nota fiscal', 'Outro'],
      },
      {
        name: 'relacionado',
        label: 'Relacionado a',
        type: 'select',
        options: ['Motorista', 'Caminhão', 'Viagem', 'Carga'],
      },
      {
        name: 'relacionadoId',
        label: 'Registro relacionado',
        type: 'select',
        options: (record) => getDocumentRelatedOptions(record.relacionado),
        display: (value, record) => getDocumentRelatedLabel(record.relacionado, value),
      },
      { name: 'vencimentoDocumentoSistema', label: 'Vencimento', type: 'date' },
      { name: 'arquivoDocumento', label: 'Arquivo', type: 'file' },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
    ],
  };

  const QUICK_FILTERS = {
    openLoads: {
      title: 'Cargas em aberto',
      subtitle: 'Mostrando só as cargas ainda não finalizadas.',
    },
    activeTrips: {
      title: 'Viagens ativas',
      subtitle: 'Mostrando as viagens em andamento e carregadas.',
    },
    pendingFinance: {
      title: 'Pendências financeiras',
      subtitle: 'Mostrando as viagens com saldo a pagar.',
    },
    docsExpiring: {
      title: 'Documentos a vencer',
      subtitle: 'Mostrando documentos e vencimentos próximos.',
    },
  };

  const TRIP_VIEW_SKIP = new Set(['valorFrete', 'valorMotorista', 'adiantamento', 'diarias', 'ajudantes']);

  const FINANCIAL_MODEL_VERSION = 2;
  const PAYMENT_KIND = Object.freeze({
    ADVANCE: 'adiantamento',
    DRIVER_BALANCE: 'saldo_motorista',
    DAILY: 'diaria',
    HELPER: 'ajudante',
    AID: 'ajuda_custo',
    CLIENT_RECEIPT: 'recebimento_cliente',
  });

  const PAYMENT_LABELS = Object.freeze({
    [PAYMENT_KIND.ADVANCE]: 'Adiantamento',
    [PAYMENT_KIND.DRIVER_BALANCE]: 'Saldo motorista',
    [PAYMENT_KIND.DAILY]: 'Diária',
    [PAYMENT_KIND.HELPER]: 'Ajudante',
    [PAYMENT_KIND.AID]: 'Ajuda de custo',
    [PAYMENT_KIND.CLIENT_RECEIPT]: 'Recebimento cliente',
  });
  const PAYMENT_SOURCE_LABELS = Object.freeze({
    avo: 'Avô',
    transportadora: 'Transportadora — Alexandre',
    outro: 'Outro',
  });

  function uid() {
    return `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function safeText(value) {
    return String(value ?? '').trim();
  }

  function escapeHtml(value) {
    return safeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return safeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function moneyToNumber(value) {
    if (typeof value !== 'string') return Number.isFinite(Number(value)) ? Number(value) : 0;
    let cleaned = value
      .replace(/\s/g, '')
      .replace(/R\$/gi, '')
      .replace(/[^0-9,.-]/g, '');
    // Aceita tanto 1.234,56 (formato brasileiro) quanto 1234.56 (valor vindo da nuvem).
    if (cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if ((cleaned.match(/\./g) || []).length > 1) {
      cleaned = cleaned.replace(/\./g, '');
    }
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
  }

  function hasMoneyValue(value) {
    return value !== null && value !== undefined && safeText(value) !== '';
  }

  function nonNegativeMoney(value) {
    return Math.max(0, moneyToNumber(value));
  }

  function normalizePaymentType(value) {
    const type = normalizeText(value).replace(/\s+/g, ' ');
    if (type === 'adiantamento') return PAYMENT_KIND.ADVANCE;
    if (type === 'saldo motorista' || type === 'saldo do motorista') return PAYMENT_KIND.DRIVER_BALANCE;
    if (type === 'diaria') return PAYMENT_KIND.DAILY;
    if (type === 'ajudante' || type === 'ajudantes') return PAYMENT_KIND.HELPER;
    if (type === 'ajuda de custo') return PAYMENT_KIND.AID;
    if (type === 'recebimento cliente' || type === 'recebimento do cliente') return PAYMENT_KIND.CLIENT_RECEIPT;
    return '';
  }

  function getPaymentLabel(value) {
    const kind = normalizePaymentType(value);
    return PAYMENT_LABELS[kind] || safeText(value);
  }

  function getPaymentSourceLabel(value) {
    const normalized = normalizeText(value);
    if (normalized === 'avo') return PAYMENT_SOURCE_LABELS.avo;
    if (normalized === 'transportadora' || normalized.includes('alexandre')) return PAYMENT_SOURCE_LABELS.transportadora;
    if (normalized === 'outro') return PAYMENT_SOURCE_LABELS.outro;
    return safeText(value);
  }

  function getFormMoneyValue(formData, names) {
    for (const name of names) {
      const value = formData.get(name);
      if (hasMoneyValue(value)) return moneyToNumber(String(value));
    }
    return 0;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  }

  function formatDate(dateString) {
    const date = parseLocalDate(dateString);
    if (Number.isNaN(date.getTime())) return 'Sem data';
    return date.toLocaleDateString('pt-BR');
  }

  function parseLocalDate(value) {
    const text = safeText(value);
    if (!text) return new Date(NaN);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(text);
  }

  function toDateInputValue(value) {
    const text = safeText(value);
    if (!text) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = parseLocalDate(text);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getBaseUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function getPasswordRecoveryRedirectUrl() {
    const url = new URL(getBaseUrl());
    url.searchParams.set('recovery', '1');
    return url.toString();
  }

  function isPasswordRecoveryCallback() {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return query.get('recovery') === '1' || query.get('type') === 'recovery' || hash.get('type') === 'recovery';
  }

  function clearPasswordRecoveryUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('recovery');
    url.searchParams.delete('code');
    url.searchParams.delete('type');
    url.hash = '';
    history.replaceState({}, document.title, `${url.pathname}${url.search}`);
  }

  function rememberPasswordRecoverySession(session) {
    const userId = safeText(session?.user?.id);
    if (!userId) return;
    try {
      sessionStorage.setItem(
        PASSWORD_RECOVERY_MARKER_KEY,
        JSON.stringify({ userId, createdAt: Date.now() })
      );
    } catch {
      // Navegadores que bloqueiam sessionStorage continuam usando o evento do Supabase.
    }
  }

  function getTrustedPasswordRecoverySession(session) {
    const userId = safeText(session?.user?.id);
    if (!userId) return null;
    try {
      const raw = sessionStorage.getItem(PASSWORD_RECOVERY_MARKER_KEY);
      const marker = raw ? JSON.parse(raw) : null;
      const isRecent = Number(marker?.createdAt) > Date.now() - 2 * 60 * 60 * 1000;
      return marker?.userId === userId && isRecent ? session : null;
    } catch {
      return null;
    }
  }

  function clearPasswordRecoverySessionMarker() {
    try {
      sessionStorage.removeItem(PASSWORD_RECOVERY_MARKER_KEY);
    } catch {
      // Não há nada a limpar quando o navegador bloqueia sessionStorage.
    }
  }

  function setUrlWithoutQuery(hash = window.location.hash || '') {
    history.replaceState({}, document.title, `${getBaseUrl()}${hash}`);
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scrollToElement(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getTimestamp(item) {
    const raw = item.updatedAt || item.createdAt || '';
    const time = new Date(raw).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function getUserStorageKey(userId, key) {
    const normalizedUserId = safeText(userId);
    if (!normalizedUserId || !STORAGE_KEYS[key]) return '';
    return `${USER_STORAGE_KEY_PREFIX}${normalizedUserId}_${key}`;
  }

  function readRecordsFromStorage(storageKey) {
    try {
      const raw = storageKey ? localStorage.getItem(storageKey) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function replaceState(snapshot = {}) {
    Object.keys(STORAGE_KEYS).forEach((key) => {
      state[key] = Array.isArray(snapshot[key]) ? snapshot[key] : [];
    });
    normalizeLegacyData();
  }

  function clearLoadedState() {
    replaceState();
  }

  function readLegacyState() {
    return Object.fromEntries(
      Object.keys(STORAGE_KEYS).map((key) => [key, readRecordsFromStorage(STORAGE_KEYS[key])])
    );
  }

  function hasSavedUserState(userId) {
    return Object.keys(STORAGE_KEYS).some((key) => localStorage.getItem(getUserStorageKey(userId, key)) !== null);
  }

  function hasRecords(snapshot) {
    return Object.keys(STORAGE_KEYS).some((key) => Array.isArray(snapshot?.[key]) && snapshot[key].length > 0);
  }

  function legacyStateBelongsToUser(user) {
    try {
      const raw = localStorage.getItem(LEGACY_LOCAL_ACCESS_KEY);
      const legacyEmail = safeText(raw ? JSON.parse(raw)?.email : '');
      return !legacyEmail || normalizeText(legacyEmail) === normalizeText(user?.email);
    } catch {
      return true;
    }
  }

  function loadStateForUser(user) {
    const userId = safeText(user?.id);
    clearLoadedState();
    if (!userId) return;

    if (hasSavedUserState(userId)) {
      const savedState = Object.fromEntries(
        Object.keys(STORAGE_KEYS).map((key) => [key, readRecordsFromStorage(getUserStorageKey(userId, key))])
      );
      replaceState(savedState);
      return;
    }

    const legacyOwnerId = safeText(localStorage.getItem(LEGACY_STORAGE_CLAIM_KEY));
    const legacyState = readLegacyState();
    if (
      (!legacyOwnerId || legacyOwnerId === userId) &&
      hasRecords(legacyState) &&
      legacyStateBelongsToUser(user)
    ) {
      replaceState(legacyState);
      localStorage.setItem(LEGACY_STORAGE_CLAIM_KEY, userId);
    }
    persistAllLocalState();
  }

  function saveState(key, { syncCloud = true } = {}) {
    const userId = safeText(activeCloudUser?.id);
    if (!STORAGE_KEYS[key] || !userId) return;
    localStorage.setItem(getUserStorageKey(userId, key), JSON.stringify(state[key]));
    if (syncCloud) queueCloudSnapshotSync();
  }

  function loadState() {
    clearLoadedState();
  }

  function persistAllLocalState() {
    if (!activeCloudUser?.id) return;
    Object.keys(STORAGE_KEYS).forEach((key) => saveState(key, { syncCloud: false }));
  }

  function createAppSnapshot() {
    return {
      version: CLOUD_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      cargas: state.cargas,
      motoristas: state.motoristas,
      caminhoes: state.caminhoes,
      viagens: state.viagens,
      pagamentos: state.pagamentos,
      documentos: state.documentos,
    };
  }

  function mergeRecordsByLatest(localRecords, remoteRecords) {
    const records = new Map();
    (Array.isArray(localRecords) ? localRecords : []).forEach((item) => {
      if (item?.id) records.set(item.id, item);
    });
    (Array.isArray(remoteRecords) ? remoteRecords : []).forEach((item) => {
      if (!item?.id) return;
      const local = records.get(item.id);
      if (!local || getTimestamp(item) >= getTimestamp(local)) records.set(item.id, item);
    });
    return [...records.values()].sort((a, b) => getTimestamp(b) - getTimestamp(a));
  }

  function mergeCloudSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    Object.keys(STORAGE_KEYS).forEach((key) => {
      if (Array.isArray(snapshot[key])) state[key] = mergeRecordsByLatest(state[key], snapshot[key]);
    });
    normalizeLegacyData();
    persistAllLocalState();
  }

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey || !window.supabase?.createClient) return null;
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      return supabaseClient;
    } catch (error) {
      console.warn('Não foi possível iniciar a conexão com a nuvem.', error);
      return null;
    }
  }

  function setLoginStatus(message = '', isError = false) {
    if (!els.loginStatus) return;
    els.loginStatus.textContent = message;
    els.loginStatus.classList.toggle('error', Boolean(isError));
  }

  function setLoginActionsBusy(isBusy) {
    if (els.loginSubmitBtn) els.loginSubmitBtn.disabled = isBusy;
    if (els.signupBtn) els.signupBtn.disabled = isBusy;
    if (els.forgotPasswordBtn) els.forgotPasswordBtn.disabled = isBusy;
  }

  function setFormStatus(element, message = '', isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', Boolean(isError));
  }

  function setPasswordResetRequestStatus(message = '', isError = false) {
    setFormStatus(els.passwordResetRequestStatus, message, isError);
  }

  function setPasswordUpdateStatus(message = '', isError = false) {
    setFormStatus(els.passwordUpdateStatus, message, isError);
  }

  function setPasswordResetRequestBusy(isBusy) {
    if (els.passwordResetRequestBtn) els.passwordResetRequestBtn.disabled = isBusy;
    if (els.cancelPasswordResetRequestBtn) els.cancelPasswordResetRequestBtn.disabled = isBusy;
  }

  function setPasswordUpdateBusy(isBusy) {
    if (els.passwordUpdateBtn) els.passwordUpdateBtn.disabled = isBusy;
    if (els.cancelPasswordUpdateBtn) els.cancelPasswordUpdateBtn.disabled = isBusy;
  }

  function setAuthView(view, { focus = true } = {}) {
    const content = {
      login: {
        title: 'Entre para abrir a caderneta',
        description: 'Use seu e-mail e senha para acessar somente os seus registros. Se ainda não tiver acesso, crie sua conta e confirme o e-mail para vincular os dados à nuvem.',
        target: els.loginEmail,
      },
      request: {
        title: 'Vamos recuperar sua senha',
        description: 'Digite o e-mail usado no sistema. Se houver uma conta, enviaremos um link seguro para criar uma nova senha.',
        target: els.passwordResetEmail,
      },
      update: {
        title: 'Escolha uma nova senha',
        description: 'O link foi confirmado. Defina uma senha nova para voltar a acessar seus registros.',
        target: els.newPassword,
      },
    };
    const activeView = content[view] || content.login;
    if (els.loginForm) els.loginForm.hidden = view !== 'login';
    if (els.passwordResetRequestForm) els.passwordResetRequestForm.hidden = view !== 'request';
    if (els.passwordUpdateForm) els.passwordUpdateForm.hidden = view !== 'update';
    const title = document.getElementById('loginTitle');
    const description = document.getElementById('loginDescription');
    if (title) title.textContent = activeView.title;
    if (description) description.textContent = activeView.description;
    if (focus && activeView.target) window.setTimeout(() => activeView.target.focus(), 0);
  }

  function openPasswordResetRequest() {
    clearPasswordRecoveryValidationTimer();
    clearPasswordRecoverySessionMarker();
    passwordRecoveryMode = false;
    passwordRecoverySession = null;
    if (els.passwordResetRequestForm) els.passwordResetRequestForm.reset();
    if (els.passwordResetEmail) els.passwordResetEmail.value = safeText(els.loginEmail?.value);
    setPasswordResetRequestStatus('');
    setAuthView('request');
  }

  function returnToLoginFromPasswordReset() {
    clearPasswordRecoveryValidationTimer();
    clearPasswordRecoverySessionMarker();
    passwordRecoveryMode = false;
    passwordRecoverySession = null;
    clearPasswordRecoveryUrl();
    if (els.passwordResetEmail?.value && els.loginEmail) els.loginEmail.value = els.passwordResetEmail.value;
    if (els.passwordUpdateForm) els.passwordUpdateForm.reset();
    setPasswordResetRequestStatus('');
    setPasswordUpdateStatus('');
    setAuthView('login');
  }

  function setApplicationAccess(isGranted) {
    document.body.classList.toggle('login-open', !isGranted);
    if (els.loginOverlay) els.loginOverlay.classList.toggle('hidden', isGranted);
    if (els.modalOverlay && !isGranted) els.modalOverlay.classList.add('hidden');
    if (els.deleteConfirmOverlay && !isGranted) els.deleteConfirmOverlay.classList.add('hidden');
    document.querySelectorAll('body > .topbar, body > .page-tabs, body > .page, body > #recordModalOverlay').forEach((element) => {
      if (isGranted) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', 'true');
    });
    if (els.btnLogin) els.btnLogin.textContent = isGranted ? 'Sair' : 'Entrar';
  }

  function announceRecordAction(message) {
    if (!els.recordActionStatus) return;
    els.recordActionStatus.textContent = '';
    window.setTimeout(() => {
      if (els.recordActionStatus) els.recordActionStatus.textContent = message;
    }, 0);
  }

  async function writeCloudSnapshot() {
    const client = getSupabaseClient();
    if (!client || !activeCloudUser || !cloudSyncEnabled) return;
    const { error } = await client.from(CLOUD_STATE_TABLE).upsert(
      {
        user_id: activeCloudUser.id,
        payload: createAppSnapshot(),
        schema_version: CLOUD_SCHEMA_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
  }

  function queueCloudSnapshotSync() {
    if (!activeCloudUser || !cloudSyncEnabled || !getSupabaseClient()) return;
    cloudSyncQueue = cloudSyncQueue
      .catch(() => undefined)
      .then(() => writeCloudSnapshot())
      .catch((error) => console.warn('A cópia na nuvem será tentada novamente na próxima alteração.', error));
  }

  async function importAndSyncCloudState(user) {
    const client = getSupabaseClient();
    if (!client || !user) return;
    const backupKey = `${CLOUD_BACKUP_KEY_PREFIX}${user.id}`;
    if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(createAppSnapshot()));

    const remote = await client.from(CLOUD_STATE_TABLE).select('payload, updated_at').eq('user_id', user.id).maybeSingle();
    if (remote.error && remote.error.code !== 'PGRST116') throw remote.error;
    if (remote.data?.payload) mergeCloudSnapshot(remote.data.payload);

    const migrationKey = `${CLOUD_MIGRATION_KEY_PREFIX}${user.id}`;
    if (!localStorage.getItem(migrationKey)) {
      const migration = await client.rpc('importar_snapshot_localstorage', { p_payload: createAppSnapshot() });
      if (migration.error) throw migration.error;
      localStorage.setItem(migrationKey, JSON.stringify({ completedAt: new Date().toISOString(), summary: migration.data || null }));
    }

    cloudSyncEnabled = true;
    await writeCloudSnapshot();
  }

  function resetSessionView() {
    currentSearchQuery = '';
    activeQuickFilter = null;
    if (els.searchInput) els.searchInput.value = '';
    [
      els.loadForm,
      els.driverForm,
      els.truckForm,
      els.tripForm,
      els.paymentForm,
      els.documentForm,
      els.passwordResetRequestForm,
      els.passwordUpdateForm,
    ].forEach((form) => form?.reset());
    modalState.type = null;
    modalState.id = null;
    modalState.mode = 'view';
    modalState.dirty = false;
    modalState.trigger = null;
    ui.editForm = null;
  }

  function lockApplication(message, isError = false) {
    clearPasswordRecoveryValidationTimer();
    clearPasswordRecoverySessionMarker();
    activeCloudUser = null;
    cloudSyncEnabled = false;
    passwordRecoveryMode = false;
    passwordRecoverySession = null;
    clearLoadedState();
    resetSessionView();
    renderCurrentView();
    setApplicationAccess(false);
    if (els.loginPassword) els.loginPassword.value = '';
    setAuthView('login', { focus: false });
    setLoginStatus(message, isError);
  }

  function clearPasswordRecoveryValidationTimer() {
    if (passwordRecoveryValidationTimer !== null) window.clearTimeout(passwordRecoveryValidationTimer);
    passwordRecoveryValidationTimer = null;
  }

  function beginPasswordRecoveryValidation() {
    if (passwordRecoverySession?.user) {
      blockApplicationForPasswordRecovery(passwordRecoverySession);
      return;
    }
    clearPasswordRecoveryValidationTimer();
    passwordRecoveryMode = true;
    activeCloudUser = null;
    cloudSyncEnabled = false;
    clearLoadedState();
    resetSessionView();
    renderCurrentView();
    setApplicationAccess(false);
    setAuthView('update', { focus: false });
    setPasswordUpdateStatus('Verificando o link seguro para trocar sua senha…');
    passwordRecoveryValidationTimer = window.setTimeout(() => {
      if (passwordRecoveryMode && !passwordRecoverySession?.user) showPasswordRecoveryUnavailable();
    }, 4000);
  }

  function blockApplicationForPasswordRecovery(session) {
    if (!session?.user) {
      showPasswordRecoveryUnavailable();
      return;
    }
    clearPasswordRecoveryValidationTimer();
    rememberPasswordRecoverySession(session);
    passwordRecoveryMode = true;
    passwordRecoverySession = session;
    activeCloudUser = null;
    cloudSyncEnabled = false;
    clearLoadedState();
    resetSessionView();
    renderCurrentView();
    setApplicationAccess(false);
    setAuthView('update');
    setPasswordUpdateStatus('Link confirmado. Agora escolha uma senha nova para entrar com segurança.');
  }

  function showPasswordRecoveryUnavailable(message = 'Este link não é mais válido ou já expirou. Peça um novo link para recuperar sua senha.') {
    clearPasswordRecoveryValidationTimer();
    clearPasswordRecoverySessionMarker();
    passwordRecoveryMode = true;
    passwordRecoverySession = null;
    activeCloudUser = null;
    cloudSyncEnabled = false;
    clearLoadedState();
    resetSessionView();
    renderCurrentView();
    setApplicationAccess(false);
    setAuthView('request');
    setPasswordResetRequestStatus(message, true);
  }

  function setupSupabaseAuthListener() {
    const client = getSupabaseClient();
    if (!client || authStateSubscription) return;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        passwordRecoveryMode = true;
        passwordRecoverySession = session || null;
        rememberPasswordRecoverySession(session);
        window.setTimeout(() => blockApplicationForPasswordRecovery(session), 0);
        return;
      }
      if (event !== 'SIGNED_OUT' && event !== 'USER_DELETED') return;
      if (passwordRecoveryFinishing) return;
      window.setTimeout(() => {
        if (!session) lockApplication('Sessão encerrada. Entre novamente para acessar os dados.');
      }, 0);
    });
    authStateSubscription = data?.subscription || null;
  }

  async function unlockForUser(user) {
    if (!safeText(user?.id)) throw new Error('Não foi possível identificar a conta autenticada.');
    passwordRecoveryFinishing = false;
    activeCloudUser = user;
    cloudSyncEnabled = false;
    loadStateForUser(user);
    renderCurrentView();
    setApplicationAccess(true);
    setLoginStatus('Conectando e conferindo a cópia segura na nuvem…');
    try {
      await importAndSyncCloudState(user);
      renderCurrentView();
      setLoginStatus('');
    } catch (error) {
      console.warn('A conta entrou, mas a sincronização inicial falhou.', error);
      setLoginStatus('Você entrou, mas a nuvem não respondeu agora. Os dados locais continuam preservados.', true);
    }
  }

  async function restoreAccess() {
    const client = getSupabaseClient();
    if (!client) {
      setLoginStatus('Não foi possível iniciar o acesso protegido. Verifique sua conexão e recarregue a página.', true);
      return;
    }

    const { data, error } = await client.auth.getSession();
    if (passwordRecoveryMode) {
      const trustedRecoverySession = getTrustedPasswordRecoverySession(data?.session);
      if (trustedRecoverySession) {
        passwordRecoverySession = trustedRecoverySession;
        blockApplicationForPasswordRecovery(trustedRecoverySession);
      } else if (error) {
        showPasswordRecoveryUnavailable('Não foi possível validar este link agora. Peça um novo link e tente novamente.');
      } else {
        beginPasswordRecoveryValidation();
      }
      return;
    }
    if (error) {
      console.warn('Não foi possível restaurar a sessão da nuvem.', error);
      setLoginStatus('Não foi possível verificar sua sessão agora. Tente entrar novamente.', true);
      return;
    }
    if (data?.session?.user) {
      await unlockForUser(data.session.user);
      return;
    }
    setLoginStatus('Entre com o e-mail e a senha cadastrados no sistema em nuvem.');
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const email = safeText(els.loginEmail?.value);
    const password = safeText(els.loginPassword?.value);
    if (!email || !password) return setLoginStatus('Informe e-mail e senha para continuar.', true);
    setLoginActionsBusy(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('O serviço de autenticação não está disponível. Verifique sua conexão e tente novamente.');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await unlockForUser(data?.user);
    } catch (error) {
      setLoginStatus(error?.message || 'Não foi possível entrar. Confira os dados e tente novamente.', true);
    } finally {
      setLoginActionsBusy(false);
    }
  }

  async function handleSignup() {
    if (els.loginForm && !els.loginForm.reportValidity()) return;
    const email = safeText(els.loginEmail?.value);
    const password = safeText(els.loginPassword?.value);
    if (!email || !password) return setLoginStatus('Informe e-mail e senha para criar a conta.', true);
    setLoginActionsBusy(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('O serviço de autenticação não está disponível. Verifique sua conexão e tente novamente.');
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      if (data?.session?.user) {
        await unlockForUser(data.session.user);
        return;
      }
      if (!data?.user) throw new Error('Não foi possível criar a conta. Tente novamente.');
      if (els.loginPassword) els.loginPassword.value = '';
      setLoginStatus('Conta criada. Confira seu e-mail para confirmar o acesso e depois entre no sistema.');
    } catch (error) {
      setLoginStatus(error?.message || 'Não foi possível criar a conta. Tente novamente.', true);
    } finally {
      setLoginActionsBusy(false);
    }
  }

  function getPasswordResetRequestErrorMessage(error) {
    const detail = normalizeText(error?.message);
    if (detail.includes('redirect')) {
      return 'Não foi possível preparar o link. Peça ajuda a quem administra o sistema para conferir o endereço do site.';
    }
    return 'Não foi possível enviar o link agora. Verifique sua conexão e tente novamente.';
  }

  function getPasswordUpdateErrorMessage(error) {
    const detail = normalizeText(error?.message);
    if (detail.includes('password') || detail.includes('weak')) {
      return 'Escolha uma senha mais forte, com pelo menos 8 caracteres.';
    }
    if (detail.includes('session') || detail.includes('token') || detail.includes('jwt') || detail.includes('expired')) {
      return 'Este link não é mais válido. Peça um novo link para recuperar sua senha.';
    }
    return 'Não foi possível salvar a nova senha. Peça um novo link e tente novamente.';
  }

  async function handlePasswordResetRequest(event) {
    event.preventDefault();
    if (els.passwordResetRequestForm && !els.passwordResetRequestForm.reportValidity()) return;
    const email = safeText(els.passwordResetEmail?.value);
    if (!email) return setPasswordResetRequestStatus('Informe seu e-mail para receber o link.', true);
    setPasswordResetRequestBusy(true);
    clearPasswordRecoveryValidationTimer();
    passwordRecoveryMode = false;
    passwordRecoverySession = null;
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('auth_unavailable');
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordRecoveryRedirectUrl(),
      });
      if (error) throw error;
      setPasswordResetRequestStatus('Se existir uma conta com esse e-mail, você receberá um link para criar uma nova senha. Confira também a pasta de spam.');
    } catch (error) {
      setPasswordResetRequestStatus(getPasswordResetRequestErrorMessage(error), true);
    } finally {
      setPasswordResetRequestBusy(false);
    }
  }

  async function finishPasswordRecovery(message) {
    passwordRecoveryFinishing = true;
    try {
      const client = getSupabaseClient();
      if (client) {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) console.warn('Não foi possível encerrar a sessão temporária de recuperação.', error);
      }
    } catch (error) {
      console.warn('Não foi possível encerrar a sessão temporária de recuperação.', error);
    } finally {
      clearPasswordRecoveryUrl();
      lockApplication(message);
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    if (els.passwordUpdateForm && !els.passwordUpdateForm.reportValidity()) return;
    if (!passwordRecoveryMode || !passwordRecoverySession?.user) {
      return setPasswordUpdateStatus('Este link não é mais válido. Peça um novo link para recuperar sua senha.', true);
    }
    const password = String(els.newPassword?.value ?? '');
    const confirmation = String(els.confirmNewPassword?.value ?? '');
    if (password.length < 8) {
      return setPasswordUpdateStatus('Escolha uma senha com pelo menos 8 caracteres.', true);
    }
    if (password !== confirmation) {
      return setPasswordUpdateStatus('As duas senhas não são iguais. Digite novamente com calma.', true);
    }
    setPasswordUpdateBusy(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('auth_unavailable');
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      if (els.passwordUpdateForm) els.passwordUpdateForm.reset();
      await finishPasswordRecovery('Senha alterada com sucesso. Agora entre com a nova senha.');
    } catch (error) {
      setPasswordUpdateStatus(getPasswordUpdateErrorMessage(error), true);
    } finally {
      setPasswordUpdateBusy(false);
    }
  }

  async function cancelPasswordUpdate() {
    await finishPasswordRecovery('A redefinição foi cancelada. Quando quiser, peça um novo link para recuperar a senha.');
  }

  async function handleLogout() {
    const client = getSupabaseClient();
    try {
      if (client) {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) console.warn('Não foi possível encerrar a sessão remota.', error);
      }
    } catch (error) {
      console.warn('Não foi possível encerrar a sessão remota.', error);
    } finally {
      lockApplication('Sessão encerrada. Entre novamente para acessar os dados.');
    }
  }

  function registerPwaServiceWorker() {
    const isSecureContext = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!isSecureContext || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Não foi possível ativar o modo aplicativo.', error));
  }

  function normalizeLegacyData() {
    state.pagamentos = state.pagamentos.map((item) => ({
      ...item,
      observacao: item.observacao ?? item.observacoes ?? '',
      tipo: getPaymentLabel(item.tipo ?? item.tipoPagamento ?? ''),
      origemPagamento: getPaymentSourceLabel(item.origemPagamento ?? item.origem ?? item.pagoPor ?? ''),
      valor: nonNegativeMoney(item.valor ?? 0),
      isInitialAdvance: Boolean(item.isInitialAdvance),
    }));

    state.documentos = state.documentos.map((item) => ({
      ...item,
      tipo: item.tipo ?? item.tipoDocumento ?? '',
      relacionado: item.relacionado ?? item.relacionadoDocumento ?? '',
      relacionadoId: item.relacionadoId ?? item.registroId ?? '',
      observacoes: item.observacoes ?? '',
      fileName: item.fileName ?? '',
      storagePath: item.storagePath ?? '',
      contentType: item.contentType ?? '',
      fileSize: Number(item.fileSize || 0),
      arquivoPendenteNuvem: Boolean(item.arquivoPendenteNuvem),
    }));

    state.cargas = state.cargas.map((item) => ({
      ...item,
      observacoes: item.observacoes ?? item.observacao ?? '',
      status: item.status ?? 'Aberta',
      valorFrete: moneyToNumber(item.valorFrete ?? 0),
    }));

    state.motoristas = state.motoristas.map((item) => ({
      ...item,
      observacoes: item.observacoes ?? item.observacao ?? '',
      mopp: item.mopp ?? 'nao',
      truckId: item.truckId ?? item.caminhaoId ?? '',
    }));

    state.caminhoes = state.caminhoes.map((item) => ({
      ...item,
      observacoes: item.observacoes ?? item.observacao ?? '',
    }));

    state.viagens = state.viagens.map((item) =>
      recalculateTripRecord({
        ...item,
        // null representa um valor ainda não definido; zero é um valor válido.
        valorFrete: hasMoneyValue(item.valorFrete) ? moneyToNumber(item.valorFrete) : null,
        valorMotorista: nonNegativeMoney(item.valorMotorista ?? 0),
        adiantamento: nonNegativeMoney(item.adiantamento ?? 0),
        diarias: nonNegativeMoney(item.diarias ?? item.diariaPrevista ?? item.diariasViagem ?? item.diaria ?? 0),
        ajudantes: nonNegativeMoney(item.ajudantes ?? item.ajudantePrevisto ?? item.ajudantesViagem ?? item.ajudante ?? 0),
        financialModelVersion: Number(item.financialModelVersion || 1),
        observacoes: item.observacoes ?? item.observacao ?? '',
        status: item.status ?? 'Planejada',
      })
    );
  }

  function getCollectionForType(type) {
    return TYPE_TO_COLLECTION[type] || null;
  }

  function getRecord(type, id) {
    const collection = getCollectionForType(type);
    if (!collection) return null;
    return state[collection].find((item) => item.id === id) || null;
  }

  function updateRecord(type, id, nextRecord) {
    const collection = getCollectionForType(type);
    if (!collection) return false;
    const index = state[collection].findIndex((item) => item.id === id);
    if (index < 0) return false;
    state[collection][index] = nextRecord;
    saveState(collection);
    return true;
  }

  function getRecordReferenceDetails(type, id) {
    const tripFieldByType = {
      Carga: 'cargaId',
      Motorista: 'motoristaId',
      'Caminhão': 'caminhaoId',
    };
    const documentTypeByRecordType = {
      Carga: 'Carga',
      Motorista: 'Motorista',
      'Caminhão': 'Caminhão',
      Viagem: 'Viagem',
    };
    const references = [];
    const linkedTrips = tripFieldByType[type]
      ? state.viagens.filter((trip) => trip[tripFieldByType[type]] === id).length
      : 0;
    if (linkedTrips) references.push({ count: linkedTrips, label: 'viagem' });
    const linkedPayments = type === 'Viagem'
      ? state.pagamentos.filter((payment) => payment.viagemId === id).length
      : 0;
    if (linkedPayments) references.push({ count: linkedPayments, label: 'pagamento' });
    const expectedDocumentType = documentTypeByRecordType[type];
    const linkedDocuments = expectedDocumentType
      ? state.documentos.filter((documento) => (
        documento.relacionadoId === id &&
        normalizeText(documento.relacionado) === normalizeText(expectedDocumentType)
      )).length
      : 0;
    if (linkedDocuments) references.push({ count: linkedDocuments, label: 'documento' });
    const linkedHabitualDrivers = type === 'Caminhão'
      ? state.motoristas.filter((motorista) => motorista.truckId === id).length
      : 0;
    if (linkedHabitualDrivers) references.push({ count: linkedHabitualDrivers, label: 'motorista' });
    return references;
  }

  function getRecordReferenceCount(type, id) {
    return getRecordReferenceDetails(type, id).reduce((total, reference) => total + reference.count, 0);
  }

  function formatRecordReferences(references) {
    return references
      .map((reference) => `${reference.count} ${reference.label}${reference.count === 1 ? '' : 's'}`)
      .join(', ');
  }

  function getRecordDeleteLabel(type, record) {
    const summary = getRecordSummary({ type, item: record });
    return summary.title || type;
  }

  function getDeleteBlockMessage(type, record) {
    if (type === 'Pagamento' && record.isInitialAdvance) {
      return 'Este adiantamento foi criado junto com a viagem. Para corrigi-lo, abra a viagem e altere o campo “Adiantamento”.';
    }
    const references = getRecordReferenceDetails(type, record.id);
    if (!references.length) return '';
    return `Não é possível apagar “${getRecordDeleteLabel(type, record)}” porque ele está ligado a: ${formatRecordReferences(references)}. Primeiro, corrija ou apague esses itens vinculados.`;
  }

  function deleteRecord(type, id) {
    const collection = getCollectionForType(type);
    const record = getRecord(type, id);
    if (!collection || !record) return false;
    const blockMessage = getDeleteBlockMessage(type, record);
    if (blockMessage) {
      alert(blockMessage);
      return false;
    }
    const before = state[collection].length;
    state[collection] = state[collection].filter((item) => item.id !== id);
    if (state[collection].length !== before) {
      saveState(collection);
      return true;
    }
    return false;
  }

  function getCargaLabel(item) {
    if (!item) return 'Carga removida';
    return `${item.empresa || 'Carga'} — ${item.origem || '?'} → ${item.destino || '?'}`;
  }

  function getCargaLabelById(id) {
    const item = state.cargas.find((entry) => entry.id === id);
    return item ? getCargaLabel(item) : 'Carga removida';
  }

  function getDriverLabelById(id) {
    const item = state.motoristas.find((entry) => entry.id === id);
    return item ? (item.nome || 'Motorista sem nome') : 'Motorista removido';
  }

  function getTruckLabel(item) {
    if (!item) return 'Caminhão removido';
    return `${item.placaCavalo || '-'} / ${item.placaCarreta || '-'}`;
  }

  function getTruckLabelById(id) {
    const item = state.caminhoes.find((entry) => entry.id === id);
    return item ? getTruckLabel(item) : 'Caminhão removido';
  }

  function getTripLabel(item) {
    if (!item) return 'Viagem removida';
    const carga = state.cargas.find((entry) => entry.id === item.cargaId);
    const motorista = state.motoristas.find((entry) => entry.id === item.motoristaId);
    return `${carga?.empresa || 'Viagem'} — ${motorista?.nome || 'Sem motorista'}`;
  }

  function getTripLabelById(id) {
    const item = state.viagens.find((entry) => entry.id === id);
    return item ? getTripLabel(item) : 'Viagem removida';
  }

  function getDocumentRelatedOptions(relatedType) {
    const type = normalizeText(relatedType);
    if (type.includes('motorista')) return state.motoristas.map((item) => ({ value: item.id, label: item.nome || 'Motorista sem nome' }));
    if (type.includes('caminhao')) return state.caminhoes.map((item) => ({ value: item.id, label: getTruckLabel(item) }));
    if (type.includes('viagem')) return state.viagens.map((item) => ({ value: item.id, label: getTripLabel(item) }));
    if (type.includes('carga')) return state.cargas.map((item) => ({ value: item.id, label: getCargaLabel(item) }));
    return [];
  }

  function getDocumentRelatedLabel(relatedType, id) {
    if (!id) return 'Não informado';
    const option = getDocumentRelatedOptions(relatedType).find((item) => item.value === id);
    return option?.label || 'Registro não encontrado';
  }

  function getDocumentDueDate(item) {
    return item.vencimentoDocumentoSistema || item.vencimentoDocumento || item.vencimento || item.dataVencimento || '';
  }

  function isWithinNextDays(dateString, days = 30) {
    if (!dateString) return false;
    const date = parseLocalDate(dateString);
    if (Number.isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const limit = new Date();
    limit.setHours(0, 0, 0, 0);
    limit.setDate(today.getDate() + days);
    return date >= today && date <= limit;
  }

  function countDocsExpiring() {
    let count = 0;
    state.motoristas.forEach((item) => {
      if (isWithinNextDays(item.vencimentoCnh, 30)) count += 1;
    });
    state.caminhoes.forEach((item) => {
      if (isWithinNextDays(item.vencimentoDocumento, 30)) count += 1;
    });
    state.documentos.forEach((item) => {
      if (isWithinNextDays(getDocumentDueDate(item), 30)) count += 1;
    });
    return count;
  }

  function getTripPayments(tripId) {
    return state.pagamentos.filter((payment) => payment.viagemId === tripId);
  }

  function sumPayments(payments, kinds) {
    const acceptedKinds = new Set(Array.isArray(kinds) ? kinds : [kinds]);
    return payments.reduce((total, payment) => {
      return acceptedKinds.has(normalizePaymentType(payment.tipo))
        ? total + nonNegativeMoney(payment.valor)
        : total;
    }, 0);
  }

  function usesPaymentLedgerForInitialAdvance(trip) {
    return Number(trip?.financialModelVersion || 1) >= FINANCIAL_MODEL_VERSION;
  }

  // A viagem antiga pode ter um adiantamento salvo nela. Nas viagens novas o
  // valor inicial vira um lançamento da caderneta, para nunca ser somado duas vezes.
  function getTripFinancialState(trip) {
    const carga = state.cargas.find((item) => item.id === trip.cargaId) || null;
    const freight = hasMoneyValue(trip.valorFrete)
      ? nonNegativeMoney(trip.valorFrete)
      : nonNegativeMoney(carga?.valorFrete ?? 0);
    const combined = nonNegativeMoney(trip.valorMotorista ?? 0);
    const payments = getTripPayments(trip.id);
    const legacyAdvance = usesPaymentLedgerForInitialAdvance(trip)
      ? 0
      : nonNegativeMoney(trip.adiantamento ?? 0);
    const advancePayments = sumPayments(payments, PAYMENT_KIND.ADVANCE);
    const driverBalancePayments = sumPayments(payments, PAYMENT_KIND.DRIVER_BALANCE);
    const dailyPayments = sumPayments(payments, PAYMENT_KIND.DAILY);
    const helperPayments = sumPayments(payments, [PAYMENT_KIND.HELPER, PAYMENT_KIND.AID]);
    const clientReceipts = sumPayments(payments, PAYMENT_KIND.CLIENT_RECEIPT);
    const dailyBudget = nonNegativeMoney(trip.diarias ?? trip.diariaPrevista ?? trip.diariasViagem ?? 0);
    const helperBudget = nonNegativeMoney(trip.ajudantes ?? trip.ajudantePrevisto ?? trip.ajudantesViagem ?? 0);

    // Quando houve lançamento real de diária/ajudante, ele substitui a previsão
    // da viagem. Assim a previsão e o pagamento não entram duas vezes na margem.
    const dailyCost = dailyPayments > 0 ? dailyPayments : dailyBudget;
    const helperCost = helperPayments > 0 ? helperPayments : helperBudget;
    const advance = legacyAdvance + advancePayments;
    const driverPaid = advance + driverBalancePayments;
    const balance = Math.max(0, combined - driverPaid);
    const driverOverpayment = Math.max(0, driverPaid - combined);
    const clientBalance = Math.max(0, freight - clientReceipts);
    const additionalCosts = dailyCost + helperCost;
    const margin = freight - combined - additionalCosts;

    return {
      carga,
      freight,
      combined,
      payments,
      advance,
      advancePayments,
      driverBalancePayments,
      driverPaid,
      balance,
      driverOverpayment,
      dailyBudget,
      helperBudget,
      dailyCost,
      helperCost,
      additionalCosts,
      clientReceipts,
      clientBalance,
      margin,
      // Alias preservado para os cartões/integrações que já usam "profit".
      profit: margin,
    };
  }

  function recalculateTripRecord(trip) {
    const finance = getTripFinancialState(trip);
    return {
      ...trip,
      valorFrete: finance.freight,
      valorMotorista: finance.combined,
      adiantamento: nonNegativeMoney(trip.adiantamento ?? 0),
      diarias: finance.dailyBudget,
      ajudantes: finance.helperBudget,
      saldoMotorista: finance.balance,
      adiantamentoPago: finance.advance,
      saldoMotoristaPago: finance.driverBalancePayments,
      saldoCliente: finance.clientBalance,
      freteRecebido: finance.clientReceipts,
      custosAdicionais: finance.additionalCosts,
      margemEstimada: finance.margin,
      lucro: finance.margin,
      observacoes: trip.observacoes ?? trip.observacao ?? '',
      status: trip.status ?? 'Planejada',
    };
  }

  function getInitialAdvancePayment(tripId) {
    return state.pagamentos.find((payment) => payment.viagemId === tripId && payment.isInitialAdvance) || null;
  }

  function syncInitialAdvancePayment(trip, value, { persist = true } = {}) {
    const amount = nonNegativeMoney(value);
    const existing = getInitialAdvancePayment(trip.id);
    let changed = false;

    if (amount === 0 && existing) {
      state.pagamentos = state.pagamentos.filter((payment) => payment.id !== existing.id);
      changed = true;
    } else if (amount > 0 && existing) {
      const origin = getPaymentSourceLabel(trip.origemAdiantamento) || 'Informado na viagem';
      if (existing.valor !== amount || existing.origemPagamento !== origin) {
        existing.valor = amount;
        existing.origemPagamento = origin;
        existing.updatedAt = new Date().toISOString();
        changed = true;
      }
    } else if (amount > 0) {
      state.pagamentos.unshift({
        id: uid(),
        viagemId: trip.id,
        tipo: PAYMENT_LABELS[PAYMENT_KIND.ADVANCE],
        origemPagamento: getPaymentSourceLabel(trip.origemAdiantamento) || 'Informado na viagem',
        valor: amount,
        dataPagamento: toDateInputValue(trip.createdAt) || new Date().toISOString().slice(0, 10),
        observacao: 'Adiantamento informado ao cadastrar a viagem.',
        isInitialAdvance: true,
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }

    if (changed && persist) saveState('pagamentos');
    return changed;
  }

  function recalculateTripsForPaymentChanges(tripIds) {
    const ids = new Set([...(Array.isArray(tripIds) ? tripIds : [tripIds])].filter(Boolean));
    if (!ids.size) return;
    let changed = false;
    state.viagens = state.viagens.map((trip) => {
      if (!ids.has(trip.id)) return trip;
      changed = true;
      return recalculateTripRecord({ ...trip, updatedAt: new Date().toISOString() });
    });
    if (changed) saveState('viagens');
  }

  function normalizeOptions(options, record) {
    const raw = typeof options === 'function' ? options(record) : options || [];
    return raw.map((option) => (typeof option === 'string' ? { value: option, label: option } : { value: option.value, label: option.label }));
  }

  function getFieldDisplayValue(field, record) {
    const value = record[field.name];
    if (field.display) return field.display(value, record);
    if (field.type === 'money') return formatMoney(value);
    if (field.type === 'date') return formatDate(value);
    if (field.type === 'file') {
      if (!safeText(record.fileName)) return 'Sem arquivo';
      return record.arquivoPendenteNuvem
        ? `${record.fileName} (reenviar para a nuvem)`
        : record.fileName;
    }
    if (field.type === 'select') {
      const options = normalizeOptions(field.options, record);
      const found = options.find((option) => String(option.value) === String(value));
      if (found) return found.label;
      if (field.name === 'mopp') return String(value).toLowerCase() === 'sim' ? 'Sim' : 'Não';
      return safeText(value) || '—';
    }
    return safeText(value) || '—';
  }

  function getFieldInputValue(field, record) {
    const value = record[field.name];
    if (field.type === 'money') return value === null || value === undefined || value === '' ? '' : formatMoney(value);
    if (field.type === 'date') return toDateInputValue(value);
    if (field.type === 'file') return '';
    return safeText(value);
  }

  function getRecordSummary(entry) {
    const { type, item } = entry;
    if (type === 'Carga') {
      return {
        title: `Carga: ${item.empresa || 'Sem empresa'}`,
        subtitle: `${item.origem || '?'} → ${item.destino || '?'}`,
        details: `${item.tipoCarga || '-'} | ${formatMoney(item.valorFrete || 0)}`,
      };
    }
    if (type === 'Motorista') {
      return {
        title: `Motorista: ${item.nome || 'Sem nome'}`,
        subtitle: item.telefone || 'Sem telefone',
        details: `CNH: ${item.cnh || '-'} | MOPP: ${String(item.mopp).toLowerCase() === 'sim' ? 'Sim' : 'Não'}`,
      };
    }
    if (type === 'Caminhão') {
      return {
        title: `Caminhão: ${item.placaCavalo || 'Sem placa'}`,
        subtitle: item.placaCarreta || 'Sem carreta',
        details: `ANTT: ${item.antt || '-'} | Tipo: ${item.tipoCaminhao || '-'}`,
      };
    }
    if (type === 'Viagem') {
      const carga = state.cargas.find((c) => c.id === item.cargaId);
      const motorista = state.motoristas.find((m) => m.id === item.motoristaId);
      const finance = getTripFinancialState(item);
      return {
        title: `Viagem: ${carga?.empresa || 'Sem carga'}`,
        subtitle: motorista?.nome || 'Sem motorista',
        details: `Frete: ${formatMoney(finance.freight)} | Saldo motorista: ${formatMoney(finance.balance)} | Margem: ${formatMoney(finance.margin)}`,
      };
    }
    if (type === 'Pagamento') return { title: `Pagamento: ${item.tipo || '-'}`, subtitle: formatMoney(item.valor || 0), details: `${formatDate(item.dataPagamento)} | ${item.observacao || '-'}` };
    if (type === 'Documento') return { title: `Documento: ${item.tipo || '-'}`, subtitle: item.relacionado || 'Sem vínculo', details: item.fileName || 'Arquivo enviado' };
    return { title: type, subtitle: '', details: '' };
  }

  function getRecordLines(type, item) {
    const schema = RECORD_SCHEMAS[type] || [];
    const lines = schema
      .filter((field) => !(type === 'Viagem' && TRIP_VIEW_SKIP.has(field.name)))
      .map((field) => ({ label: field.label, value: getFieldDisplayValue(field, item) }));

    if (type === 'Viagem') {
      const finance = getTripFinancialState(item);
      lines.push(
        { label: 'Valor do frete', value: formatMoney(finance.freight) },
        { label: 'Recebido da empresa / Metax', value: formatMoney(finance.clientReceipts) },
        { label: 'A receber da empresa / Metax', value: formatMoney(finance.clientBalance) },
        { label: 'Valor combinado motorista', value: formatMoney(finance.combined) },
        { label: 'Adiantamento pago', value: formatMoney(finance.advance) },
        { label: 'Saldo já pago ao motorista', value: formatMoney(finance.driverBalancePayments) },
        { label: 'Diárias', value: formatMoney(finance.dailyCost) },
        { label: 'Ajudantes / ajuda de custo', value: formatMoney(finance.helperCost) },
        { label: 'Saldo pendente motorista', value: formatMoney(finance.balance) },
        { label: 'Margem estimada', value: formatMoney(finance.margin) }
      );
      if (finance.driverOverpayment > 0) lines.push({ label: 'Pago a mais ao motorista', value: formatMoney(finance.driverOverpayment) });
    }

    lines.push({ label: 'Criado em', value: formatDate(item.createdAt) });
    if (item.updatedAt) lines.push({ label: 'Atualizado em', value: formatDate(item.updatedAt) });
    return lines;
  }

  function buildEntrySearchText(entry) {
    const { type, item } = entry;
    const parts = [type, ...Object.values(item)];
    if (type === 'Viagem') {
      const carga = state.cargas.find((c) => c.id === item.cargaId);
      const motorista = state.motoristas.find((m) => m.id === item.motoristaId);
      const caminhao = state.caminhoes.find((c) => c.id === item.caminhaoId);
      const finance = getTripFinancialState(item);
      parts.push(
        carga?.empresa, carga?.origem, carga?.destino,
        motorista?.nome, motorista?.telefone, motorista?.cnh,
        caminhao?.placaCavalo, caminhao?.placaCarreta,
        finance.freight, finance.combined, finance.advance, finance.driverBalancePayments,
        finance.dailyCost, finance.helperCost, finance.clientReceipts, finance.clientBalance,
        finance.balance, finance.margin
      );
    }
    return normalizeText(parts.filter(Boolean).join(' '));
  }

  function filterEntries(query) {
    const normalized = normalizeText(query);
    if (!normalized) return getAllEntries();
    return getAllEntries().filter((entry) => buildEntrySearchText(entry).includes(normalized));
  }

  function getAllEntries() {
    return [
      ...state.cargas.map((item) => ({ type: 'Carga', item })),
      ...state.motoristas.map((item) => ({ type: 'Motorista', item })),
      ...state.caminhoes.map((item) => ({ type: 'Caminhão', item })),
      ...state.viagens.map((item) => ({ type: 'Viagem', item })),
      ...state.pagamentos.map((item) => ({ type: 'Pagamento', item })),
      ...state.documentos.map((item) => ({ type: 'Documento', item })),
    ].sort((a, b) => getTimestamp(b.item) - getTimestamp(a.item));
  }

  function getSuggestionTerm(entry) {
    const { type, item } = entry;
    if (type === 'Carga') return item.empresa || item.origem || item.destino || 'Carga';
    if (type === 'Motorista') return item.nome || item.telefone || 'Motorista';
    if (type === 'Caminhão') return item.placaCavalo || item.placaCarreta || 'Caminhão';
    if (type === 'Viagem') {
      const carga = state.cargas.find((c) => c.id === item.cargaId);
      const motorista = state.motoristas.find((m) => m.id === item.motoristaId);
      return carga?.empresa || motorista?.nome || 'Viagem';
    }
    if (type === 'Pagamento') return item.tipo || 'Pagamento';
    if (type === 'Documento') return item.tipo || 'Documento';
    return type;
  }

  function createRecordCard(entry) {
    const summary = getRecordSummary(entry);
    const accessibleName = `${entry.type}: ${summary.title}`;
    const article = document.createElement('article');
    article.className = 'record-item';
    article.dataset.recordType = entry.type;
    article.dataset.recordId = entry.item.id;
    article.innerHTML = `
      <strong>${escapeHtml(summary.title)}</strong>
      <p>${escapeHtml(summary.subtitle)}</p>
      <p>${escapeHtml(summary.details)}</p>
      <small>${escapeHtml(formatDate(entry.item.updatedAt || entry.item.createdAt))}</small>
      <div class="record-actions">
        <button type="button" data-action="view" aria-label="Visualizar ${escapeHtml(accessibleName)}" title="Visualizar registro">👁️ Visualizar</button>
        <button type="button" data-action="edit" aria-label="Editar ${escapeHtml(accessibleName)}" title="Editar registro">✏️ Editar</button>
        <button type="button" data-action="delete" class="danger-btn" aria-label="Apagar ${escapeHtml(accessibleName)}" title="Apagar registro">🗑️ Apagar</button>
      </div>
    `;
    return article;
  }

  function renderEntries(container, entries, emptyMessage) {
    if (!container) return;
    container.innerHTML = '';
    if (!entries.length) {
      container.innerHTML = `
        <article class="record-item">
          <strong>${escapeHtml(emptyMessage.title)}</strong>
          <p>${escapeHtml(emptyMessage.subtitle)}</p>
        </article>
      `;
      return;
    }
    entries.forEach((entry) => container.appendChild(createRecordCard(entry)));
  }

  function bindRecordContainerActions(container) {
    if (!container || container.dataset.actionsBound === '1') return;
    container.dataset.actionsBound = '1';
    container.addEventListener('click', handleRecordActionClick);
  }

  function handleRecordActionClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const card = button.closest('[data-record-type][data-record-id]');
    if (!card) return;
    const { recordType: type, recordId: id } = card.dataset;
    const action = button.dataset.action;
    if (action === 'view') return openRecordModal(type, id, 'view', button);
    if (action === 'edit') return openRecordModal(type, id, 'edit', button);
    if (action === 'delete') return deleteCurrentRecord(type, id, button);
  }

  function ensureSearchSuggestionsBox() {
    if (els.searchResultsBox) return els.searchResultsBox;
    const box = document.createElement('div');
    box.className = 'search-results';
    box.id = 'searchResults';
    (els.searchForm ? els.searchForm : els.hero || document.body).insertAdjacentElement('afterend', box);
    els.searchResultsBox = box;
    return box;
  }

  function renderSearchSuggestionsBox(query) {
    const box = ensureSearchSuggestionsBox();
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      box.innerHTML = '';
      box.classList.remove('active');
      return;
    }
    const matches = filterEntries(normalizedQuery).slice(0, 8);
    if (!matches.length) {
      box.innerHTML = `<article class="search-result-item"><strong>Nenhuma sugestão encontrada</strong><small>Tente outro termo.</small></article>`;
      box.classList.add('active');
      return;
    }
    box.innerHTML = matches.map((entry) => {
      const summary = getRecordSummary(entry);
      const suggestionTerm = getSuggestionTerm(entry);
      return `<article class="search-result-item" role="button" tabindex="0" data-search-term="${escapeHtml(suggestionTerm)}"><strong>${escapeHtml(summary.title)}</strong><small>${escapeHtml(summary.subtitle || summary.details || 'Toque para buscar')}</small></article>`;
    }).join('');
    box.classList.add('active');
  }

  function handleSearchSuggestionsClick(event) {
    const suggestion = event.target.closest('[data-search-term]');
    if (!suggestion) return;
    if (els.searchInput) {
      els.searchInput.value = suggestion.dataset.searchTerm || '';
      currentSearchQuery = els.searchInput.value;
      activeQuickFilter = null;
      renderCurrentView();
      els.searchInput.focus();
    }
  }

  function getQuickFilterEntries(filterKey) {
    if (filterKey === 'openLoads') {
      const entries = state.cargas
        .filter((item) => normalizeText(item.status) !== 'finalizada')
        .map((item) => ({ type: 'Carga', item }));
      return { entries, total: entries.length, ...QUICK_FILTERS.openLoads };
    }
    if (filterKey === 'activeTrips') {
      const entries = state.viagens
        .filter((trip) => {
          const status = normalizeText(trip.status);
          return status === 'em andamento' || status === 'carregada';
        })
        .map((item) => ({ type: 'Viagem', item }));
      return { entries, total: entries.length, ...QUICK_FILTERS.activeTrips };
    }
    if (filterKey === 'pendingFinance') {
      const entries = state.viagens
        .filter((trip) => getTripFinancialState(trip).balance > 0)
        .map((item) => ({ type: 'Viagem', item }));
      return { entries, total: entries.length, ...QUICK_FILTERS.pendingFinance };
    }
    if (filterKey === 'docsExpiring') {
      const entries = [
        ...state.motoristas
          .filter((item) => isWithinNextDays(item.vencimentoCnh, 30))
          .map((item) => ({ type: 'Motorista', item })),
        ...state.caminhoes
          .filter((item) => isWithinNextDays(item.vencimentoDocumento, 30))
          .map((item) => ({ type: 'Caminhão', item })),
        ...state.documentos
          .filter((item) => isWithinNextDays(getDocumentDueDate(item), 30))
          .map((item) => ({ type: 'Documento', item })),
      ];
      return { entries, total: entries.length, ...QUICK_FILTERS.docsExpiring };
    }
    return { entries: [], total: 0, title: 'Filtro', subtitle: '' };
  }

  function ensureSearchPanel() {
    if (ui.searchPanel) return ui.searchPanel;
    const panel = document.createElement('section');
    panel.id = 'searchResultsHub';
    panel.className = 'card';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="section-header">
        <h2>Resultados da pesquisa em tempo real</h2>
        <p id="searchResultsSummary">Digite algo para filtrar os registros.</p>
      </div>
      <div class="records-toolbar">
        <span>Use a busca para localizar empresas, motoristas, placas, viagens, pagamentos ou documentos.</span>
        <div>
          <button type="button" id="searchPanelTopBtn">Voltar ao início</button>
          <button type="button" id="searchPanelClearBtn">Limpar pesquisa</button>
        </div>
      </div>
      <div class="records-list" id="searchResultsList"></div>
    `;
    if (els.hero) els.hero.insertAdjacentElement('afterend', panel);
    else if (els.page) els.page.insertAdjacentElement('afterbegin', panel);
    else document.body.appendChild(panel);
    ui.searchPanel = panel;
    ui.searchPanelSummary = panel.querySelector('#searchResultsSummary');
    ui.searchResultsList = panel.querySelector('#searchResultsList');
    ui.searchPanelClearBtn = panel.querySelector('#searchPanelClearBtn');
    ui.searchPanelTopBtn = panel.querySelector('#searchPanelTopBtn');
    bindRecordContainerActions(ui.searchResultsList);
    return panel;
  }

  function ensureRecordsToolbar() {
    if (!els.recordsSection) return;
    const existing = els.recordsSection.querySelector('.records-toolbar');
    if (existing) {
      ui.recordsTopBtn = existing.querySelector('#recordsTopBtn');
      return;
    }
    const header = els.recordsSection.querySelector('.section-header');
    if (!header) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'records-toolbar';
    toolbar.innerHTML = `<span>Histórico completo dos lançamentos salvos.</span><button type="button" id="recordsTopBtn">Voltar ao topo</button>`;
    header.insertAdjacentElement('afterend', toolbar);
    ui.recordsTopBtn = toolbar.querySelector('#recordsTopBtn');
  }

  function ensureTripAutoFillPreview() {
    if (!els.tripForm) return;
    let preview = els.tripForm.querySelector('.auto-fill-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'auto-fill-preview full-width';
      preview.innerHTML = `
        <div id="tripAutoFillLoad"></div>
        <div id="tripAutoFillDriver"></div>
        <div id="tripAutoFillTruck"></div>
      `;
      const obsLabel = els.tripForm.querySelector('textarea[name="observacoesViagem"]')?.closest('label');
      if (obsLabel) els.tripForm.insertBefore(preview, obsLabel);
      else {
        const actions = els.tripForm.querySelector('.form-actions');
        if (actions) els.tripForm.insertBefore(preview, actions);
        else els.tripForm.appendChild(preview);
      }
    }
    ui.tripAutoFillLoad = preview.querySelector('#tripAutoFillLoad');
    ui.tripAutoFillDriver = preview.querySelector('#tripAutoFillDriver');
    ui.tripAutoFillTruck = preview.querySelector('#tripAutoFillTruck');
  }

  function renderTripFinancialPreview() {
    const hasSelectedLoad = Boolean(els.tripLoadSelect?.value);
    const finance = getTripFinancialState({
      cargaId: els.tripLoadSelect?.value || '',
      motoristaId: els.tripDriverSelect?.value || '',
      caminhaoId: els.tripTruckSelect?.value || '',
      valorFrete: els.tripFreightValue ? els.tripFreightValue.value : '',
      valorMotorista: els.tripCombinedInput ? els.tripCombinedInput.value : '',
      adiantamento: els.tripAdvanceInput ? els.tripAdvanceInput.value : '',
      diarias: els.tripDailyInput ? els.tripDailyInput.value : '',
      ajudantes: els.tripHelperInput ? els.tripHelperInput.value : '',
      id: '__preview__',
    });

    if (els.tripFinancialFreight) els.tripFinancialFreight.textContent = hasSelectedLoad ? formatMoney(finance.freight) : 'Selecione uma carga';
    if (els.tripFinancialCombined) els.tripFinancialCombined.textContent = finance.combined ? formatMoney(finance.combined) : 'Digite o valor combinado';
    if (els.tripFinancialAdvance) els.tripFinancialAdvance.textContent = finance.advance ? formatMoney(finance.advance) : 'Digite o adiantamento';
    if (els.tripFinancialDaily) els.tripFinancialDaily.textContent = formatMoney(finance.dailyCost);
    if (els.tripFinancialHelpers) els.tripFinancialHelpers.textContent = formatMoney(finance.helperCost);
    if (els.tripFinancialBalance) els.tripFinancialBalance.textContent = formatMoney(finance.balance);
    if (els.tripFinancialMargin) els.tripFinancialMargin.textContent = formatMoney(finance.margin);
  }

  function getSuggestedTruckIdForDriver(driverId) {
    const driver = state.motoristas.find((item) => item.id === driverId);
    if (driver?.truckId) return driver.truckId;
    const recentTrip = [...state.viagens]
      .sort((a, b) => getTimestamp(b) - getTimestamp(a))
      .find((trip) => trip.motoristaId === driverId && trip.caminhaoId);
    return recentTrip ? recentTrip.caminhaoId : '';
  }

  function updateTripAutofillPreview() {
    ensureTripAutoFillPreview();
    const carga = state.cargas.find((item) => item.id === safeText(els.tripLoadSelect?.value));
    const motorista = state.motoristas.find((item) => item.id === safeText(els.tripDriverSelect?.value));
    const caminhao = state.caminhoes.find((item) => item.id === safeText(els.tripTruckSelect?.value));

    if (els.tripFreightValue) {
      els.tripFreightValue.value = carga ? formatMoney(carga.valorFrete ?? 0) : '';
      els.tripFreightValue.readOnly = true;
      els.tripFreightValue.title = 'O valor do frete vem da carga selecionada';
    }

    if (ui.tripAutoFillLoad) {
      ui.tripAutoFillLoad.innerHTML = carga
        ? `<strong>Carga</strong><div>${escapeHtml(getCargaLabel(carga))}</div><small>${escapeHtml(carga.tipoCarga || '-')} | ${escapeHtml(formatMoney(carga.valorFrete ?? 0))}</small>`
        : `<strong>Carga</strong><div>Selecione uma carga para ver os dados automáticos.</div>`;
    }

    if (ui.tripAutoFillDriver) {
      ui.tripAutoFillDriver.innerHTML = motorista
        ? `<strong>Motorista</strong><div>${escapeHtml(motorista.nome || '-')}</div><small>${escapeHtml(motorista.telefone || '-')} | CNH: ${escapeHtml(motorista.cnh || '-')} | PIX: ${escapeHtml(motorista.pix || '-')}</small>`
        : `<strong>Motorista</strong><div>Selecione um motorista para ver os dados automáticos.</div>`;
    }

    if (ui.tripAutoFillTruck) {
      ui.tripAutoFillTruck.innerHTML = caminhao
        ? `<strong>Caminhão</strong><div>${escapeHtml(getTruckLabel(caminhao))}</div><small>${escapeHtml(caminhao.antt || '-')} | ${escapeHtml(caminhao.tipoCaminhao || '-')}</small>`
        : `<strong>Caminhão</strong><div>Selecione um caminhão para ver os dados automáticos.</div>`;
    }

    renderTripFinancialPreview();
    updateTripWhatsAppState();
  }

  function normalizeWhatsAppPhone(phone) {
    let digits = safeText(phone).replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    if (!/^55\d{10,11}$/.test(digits)) return '';
    return digits;
  }

  function getTripDraftForCommunication() {
    return {
      id: '__whatsapp_preview__',
      cargaId: safeText(els.tripLoadSelect?.value),
      motoristaId: safeText(els.tripDriverSelect?.value),
      caminhaoId: safeText(els.tripTruckSelect?.value),
      valorFrete: els.tripFreightValue?.value || '',
      valorMotorista: els.tripCombinedInput?.value || '',
      adiantamento: els.tripAdvanceInput?.value || '',
      diarias: els.tripDailyInput?.value || '',
      ajudantes: els.tripHelperInput?.value || '',
      origemAdiantamento: safeText(els.tripForm?.querySelector('[name="origemAdiantamento"]')?.value),
      financialModelVersion: 1,
      observacoes: safeText(els.tripForm?.querySelector('[name="observacoesViagem"]')?.value),
    };
  }

  function buildTripWhatsAppMessage() {
    const trip = getTripDraftForCommunication();
    const carga = state.cargas.find((item) => item.id === trip.cargaId);
    const motorista = state.motoristas.find((item) => item.id === trip.motoristaId);
    const caminhao = state.caminhoes.find((item) => item.id === trip.caminhaoId);
    if (!carga || !motorista) return null;
    const finance = getTripFinancialState(trip);
    const instructions = trip.observacoes || 'Por favor, confirme o recebimento desta programação e avise qualquer alteração.';
    return {
      phone: normalizeWhatsAppPhone(motorista.telefone),
      text: [
        `Olá, ${motorista.nome || 'motorista'}! Seguem os dados da viagem:`,
        '',
        `Carga: ${carga.tipoCarga || carga.empresa || 'Carga'}`,
        `Empresa: ${carga.empresa || '-'}`,
        `Origem: ${carga.origem || '-'}`,
        `Destino: ${carga.destino || '-'}`,
        `Caminhão: ${caminhao ? getTruckLabel(caminhao) : 'A confirmar'}`,
        `Valor combinado: ${formatMoney(finance.combined)}`,
        `Adiantamento (${getPaymentSourceLabel(trip.origemAdiantamento) || 'a confirmar'}): ${formatMoney(finance.advance)}`,
        `Diárias previstas: ${formatMoney(finance.dailyCost)}`,
        `Ajudante / extra: ${formatMoney(finance.helperCost)}`,
        '',
        `Orientações: ${instructions}`,
      ].join('\n'),
    };
  }

  function updateTripWhatsAppState() {
    if (!els.tripWhatsAppBtn) return;
    const draft = buildTripWhatsAppMessage();
    const motorista = state.motoristas.find((item) => item.id === safeText(els.tripDriverSelect?.value));
    const canSend = Boolean(draft?.phone);
    els.tripWhatsAppBtn.disabled = !canSend;
    if (!els.tripWhatsAppStatus) return;
    if (!motorista) els.tripWhatsAppStatus.textContent = 'Selecione um motorista para preparar a mensagem.';
    else if (!canSend) els.tripWhatsAppStatus.textContent = 'Cadastre um telefone válido para este motorista antes de enviar.';
    else els.tripWhatsAppStatus.textContent = `Mensagem pronta para ${motorista.nome || 'o motorista'}.`;
  }

  function handleTripWhatsApp() {
    const message = buildTripWhatsAppMessage();
    if (!message?.phone) return alert('Selecione uma carga e um motorista com telefone válido antes de abrir o WhatsApp.');
    window.open(`https://wa.me/${message.phone}?text=${encodeURIComponent(message.text)}`, '_blank', 'noopener,noreferrer');
  }

  function ensureRecordModal() {
    if (els.modalOverlay && els.modalContent && els.modalTitle) return;
    let overlay = document.getElementById('recordModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'recordModalOverlay';
      overlay.className = 'modal-overlay hidden';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'modalTitle');
      overlay.innerHTML = `
        <div class="record-modal" tabindex="-1">
          <div class="record-modal-header">
            <h3 id="modalTitle">Registro</h3>
            <button type="button" id="closeModalBtn" class="close-modal-btn" aria-label="Fechar o registro">✕</button>
          </div>
          <div class="record-modal-content" id="recordModalContent"></div>
          <div class="record-modal-actions">
            <button type="button" id="editRecordBtn" class="secondary-btn">✏️ Editar</button>
            <button type="button" id="saveEditBtn" class="hidden">Salvar edição</button>
            <button type="button" id="cancelEditBtn" class="secondary-btn hidden">Cancelar</button>
            <button type="button" id="deleteRecordBtn" class="danger-btn">🗑️ Apagar</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    els.modalOverlay = overlay;
    els.modalTitle = overlay.querySelector('#modalTitle');
    els.modalContent = overlay.querySelector('#recordModalContent');
    els.closeModalBtn = overlay.querySelector('#closeModalBtn');
    els.editRecordBtn = overlay.querySelector('#editRecordBtn');
    els.saveEditBtn = overlay.querySelector('#saveEditBtn');
    els.cancelEditBtn = overlay.querySelector('#cancelEditBtn');
    els.deleteRecordBtn = overlay.querySelector('#deleteRecordBtn');
    const dialog = overlay.querySelector('.record-modal');
    if (dialog) dialog.tabIndex = -1;
    if (els.closeModalBtn) els.closeModalBtn.setAttribute('aria-label', 'Fechar o registro');
  }

  function setModalButtonsForMode(mode) {
    const isView = mode === 'view';
    const isEdit = mode === 'edit';
    if (!els.editRecordBtn || !els.saveEditBtn || !els.cancelEditBtn || !els.deleteRecordBtn) return;
    els.editRecordBtn.classList.toggle('hidden', !isView);
    els.deleteRecordBtn.classList.toggle('hidden', !isView);
    els.saveEditBtn.classList.toggle('hidden', !isEdit);
    els.cancelEditBtn.classList.toggle('hidden', !isEdit);
    const recordName = modalState.type ? modalState.type.toLowerCase() : 'registro';
    els.editRecordBtn.setAttribute('aria-label', `Editar ${recordName}`);
    els.deleteRecordBtn.setAttribute('aria-label', `Apagar ${recordName}`);
  }

  function renderModalView(record) {
    if (!els.modalContent) return;
    const lines = getRecordLines(modalState.type, record)
      .map((line) => `<div class="modal-line"><strong>${escapeHtml(line.label)}:</strong> <span>${escapeHtml(line.value).replace(/\n/g, '<br>')}</span></div>`)
      .join('');
    els.modalContent.innerHTML = lines || `<div class="modal-line"><strong>Sem dados</strong><span>Não foi possível carregar as informações.</span></div>`;
  }

  function getSelectOptionsForField(field, record) {
    const options = normalizeOptions(field.options, record);
    const currentValue = safeText(record[field.name]);
    if (currentValue && !options.some((option) => String(option.value) === currentValue)) options.unshift({ value: currentValue, label: currentValue });
    return options;
  }

  function renderModalEdit(record) {
    if (!els.modalContent) return;
    const schema = RECORD_SCHEMAS[modalState.type] || [];
    const formFields = schema.map((field) => {
      const value = getFieldInputValue(field, record);
      const currentValue = safeText(record[field.name]);
      if (field.type === 'textarea') return `<label>${escapeHtml(field.label)}<textarea name="${escapeHtml(field.name)}" rows="4">${escapeHtml(value)}</textarea></label>`;
      if (field.type === 'select') {
        const options = getSelectOptionsForField(field, record).map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === currentValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
        return `<label>${escapeHtml(field.label)}<select name="${escapeHtml(field.name)}">${options}</select></label>`;
      }
      if (field.type === 'date') return `<label>${escapeHtml(field.label)}<input type="date" name="${escapeHtml(field.name)}" value="${escapeHtml(value)}" /></label>`;
      if (field.type === 'money') return `<label>${escapeHtml(field.label)}<input type="text" name="${escapeHtml(field.name)}" value="${escapeHtml(value)}" placeholder="R$ 0,00" /></label>`;
      if (field.type === 'file') return `<label class="full-width">${escapeHtml(field.label)}<input type="file" name="${escapeHtml(field.name)}" /><small>Arquivo atual: ${escapeHtml(safeText(record.fileName) || 'Nenhum arquivo')}</small></label>`;
      return `<label>${escapeHtml(field.label)}<input type="text" name="${escapeHtml(field.name)}" value="${escapeHtml(value)}" /></label>`;
    }).join('');

    const currentFileNote = modalState.type === 'Documento' ? `<p class="search-status">Se escolher um novo arquivo, o nome antigo será substituído.</p>` : '';
    els.modalContent.innerHTML = `<form id="recordEditForm" class="form-grid">${formFields}${currentFileNote}</form>`;
    ui.editForm = els.modalContent.querySelector('#recordEditForm');
    if (ui.editForm) {
      ui.editForm.addEventListener('input', markModalDirty);
      ui.editForm.addEventListener('change', markModalDirty);
      ui.editForm.addEventListener('submit', (event) => {
        event.preventDefault();
        saveCurrentRecordEdit();
      });
    }
  }

  function openRecordModal(type, id, mode = 'view', trigger = document.activeElement) {
    ensureRecordModal();
    const record = getRecord(type, id);
    if (!record) return alert('Registro não encontrado.');
    modalState.type = type;
    modalState.id = id;
    modalState.mode = mode;
    modalState.dirty = false;
    modalState.trigger = trigger instanceof HTMLElement ? trigger : null;
    if (els.modalTitle) els.modalTitle.textContent = mode === 'edit' ? `Editar ${type.toLowerCase()}` : `${type}`;
    if (mode === 'edit') renderModalEdit(record);
    else renderModalView(record);
    if (els.modalOverlay) els.modalOverlay.classList.remove('hidden');
    setModalButtonsForMode(mode);
    window.setTimeout(() => {
      const target = mode === 'edit'
        ? ui.editForm?.querySelector('input, select, textarea')
        : els.editRecordBtn;
      target?.focus();
    }, 0);
  }

  function closeRecordModal(force = false) {
    if (modalState.mode === 'edit' && modalState.dirty && !force) {
      if (confirm('Deseja salvar as alterações feitas?')) {
        saveCurrentRecordEdit();
        return;
      }
    }
    const trigger = modalState.trigger;
    if (els.modalOverlay) els.modalOverlay.classList.add('hidden');
    modalState.type = null;
    modalState.id = null;
    modalState.mode = 'view';
    modalState.dirty = false;
    modalState.trigger = null;
    ui.editForm = null;
    if (trigger instanceof HTMLElement && trigger.isConnected) {
      window.setTimeout(() => trigger.focus(), 0);
    }
  }

  function markModalDirty() {
    modalState.dirty = true;
  }

  async function saveCurrentRecordEdit() {
    if (!modalState.type || !modalState.id || !ui.editForm) return;
    const original = getRecord(modalState.type, modalState.id);
    if (!original) return;
    const schema = RECORD_SCHEMAS[modalState.type] || [];
    const formData = new FormData(ui.editForm);
    let nextRecord = { ...original };
    let selectedFile = null;
    let attachmentPending = false;

    schema.forEach((field) => {
      if (field.type === 'file') {
        const fileInput = ui.editForm.querySelector(`input[name="${field.name}"]`);
        const file = fileInput?.files?.[0];
        if (file?.name) {
          selectedFile = file;
          nextRecord.fileName = file.name;
        }
        else if (!nextRecord.fileName) nextRecord.fileName = original.fileName || '';
        return;
      }
      const value = formData.get(field.name);
      nextRecord[field.name] = field.type === 'money' ? moneyToNumber(String(value || 0)) : safeText(value);
    });

    if (modalState.type === 'Documento') {
      if (!nextRecord.tipo || !nextRecord.relacionado || !nextRecord.relacionadoId) {
        return alert('Informe o tipo e o registro ao qual este documento pertence.');
      }
      if (!getDocumentRelatedOptions(nextRecord.relacionado).some((option) => option.value === nextRecord.relacionadoId)) {
        return alert('O registro relacionado não foi encontrado. Atualize a tela e tente novamente.');
      }
      if (selectedFile) {
        if (activeCloudUser && getSupabaseClient()) {
          try {
            Object.assign(nextRecord, await uploadDocumentFile(selectedFile, nextRecord.id));
          } catch (error) {
            console.warn('Falha no upload da edição do documento.', error);
            return alert('Não foi possível enviar o arquivo privado. A edição não foi salva para evitar um anexo inexistente.');
          }
        } else {
          attachmentPending = true;
          Object.assign(nextRecord, {
            storagePath: '',
            contentType: '',
            fileSize: 0,
            arquivoPendenteNuvem: true,
          });
        }
      }
    }

    if (modalState.type === 'Viagem') {
      const negativeValue = ['valorFrete', 'valorMotorista', 'adiantamento', 'diarias', 'ajudantes']
        .some((fieldName) => moneyToNumber(nextRecord[fieldName] ?? 0) < 0);
      if (negativeValue) return alert('Os valores financeiros não podem ser negativos.');
      // Ao editar uma viagem antiga, o adiantamento antigo é migrado uma vez
      // para a caderneta. O cálculo passa a usar somente esse lançamento.
      nextRecord.financialModelVersion = FINANCIAL_MODEL_VERSION;
      const initialAdvanceChanged = syncInitialAdvancePayment(nextRecord, nextRecord.adiantamento, { persist: false });
      nextRecord = recalculateTripRecord(nextRecord);
      const driver = state.motoristas.find((item) => item.id === nextRecord.motoristaId);
      if (driver && nextRecord.caminhaoId) {
        driver.truckId = nextRecord.caminhaoId;
        saveState('motoristas');
      }
      if (initialAdvanceChanged) saveState('pagamentos');
    }

    if (modalState.type === 'Pagamento') {
      nextRecord.tipo = getPaymentLabel(nextRecord.tipo);
      nextRecord.origemPagamento = getPaymentSourceLabel(nextRecord.origemPagamento);
      if (!nextRecord.viagemId || !state.viagens.some((trip) => trip.id === nextRecord.viagemId)) {
        return alert('Selecione uma viagem válida para o pagamento.');
      }
      if (!normalizePaymentType(nextRecord.tipo)) return alert('Escolha um tipo de pagamento válido.');
      if (moneyToNumber(nextRecord.valor) <= 0) return alert('Informe um valor maior que R$ 0,00.');
    }

    nextRecord.updatedAt = new Date().toISOString();
    updateRecord(modalState.type, modalState.id, nextRecord);
    if (modalState.type === 'Pagamento') {
      recalculateTripsForPaymentChanges([original.viagemId, nextRecord.viagemId]);
    }
    modalState.dirty = false;
    closeRecordModal(true);
    renderCurrentView();
    updateTripAutofillPreview();
    if (attachmentPending) alert('A edição foi salva, mas o arquivo precisa ser enviado novamente após configurar a nuvem.');
  }

  function setDeleteConfirmBusy(isBusy) {
    if (els.confirmDeleteBtn) els.confirmDeleteBtn.disabled = isBusy;
    if (els.cancelDeleteBtn) els.cancelDeleteBtn.disabled = isBusy;
  }

  function closeDeleteConfirmDialog({ restoreFocus = true } = {}) {
    const trigger = deleteDialogState.trigger;
    if (els.deleteConfirmOverlay) els.deleteConfirmOverlay.classList.add('hidden');
    deleteDialogState.type = null;
    deleteDialogState.id = null;
    deleteDialogState.trigger = null;
    setDeleteConfirmBusy(false);
    if (restoreFocus && trigger instanceof HTMLElement && trigger.isConnected) {
      window.setTimeout(() => trigger.focus(), 0);
    }
  }

  function openDeleteConfirmDialog(type, id, trigger = document.activeElement) {
    const record = getRecord(type, id);
    if (!record) return alert('Registro não encontrado. Atualize a página e tente novamente.');
    const blockMessage = getDeleteBlockMessage(type, record);
    if (blockMessage) return alert(blockMessage);
    if (!els.deleteConfirmOverlay || !els.deleteConfirmTitle || !els.deleteConfirmMessage) {
      return alert('Não foi possível abrir a confirmação de exclusão. Atualize a página e tente novamente.');
    }
    deleteDialogState.type = type;
    deleteDialogState.id = id;
    deleteDialogState.trigger = trigger instanceof HTMLElement ? trigger : null;
    els.deleteConfirmTitle.textContent = `Apagar ${type.toLowerCase()}?`;
    els.deleteConfirmMessage.textContent = `Tem certeza que deseja apagar “${getRecordDeleteLabel(type, record)}”? Esta ação não pode ser desfeita.`;
    els.deleteConfirmOverlay.classList.remove('hidden');
    setDeleteConfirmBusy(false);
    window.setTimeout(() => els.cancelDeleteBtn?.focus(), 0);
  }

  async function deleteDocumentStorageFile(record) {
    const storagePath = safeText(record.storagePath);
    if (!storagePath) return true;
    const client = getSupabaseClient();
    if (!client || !activeCloudUser) {
      alert('Não foi possível apagar o arquivo privado agora. O documento foi mantido para evitar deixar um arquivo sem registro.');
      return false;
    }
    const { error } = await client.storage.from('documentos-privados').remove([storagePath]);
    if (!error) return true;
    console.warn('Não foi possível apagar o arquivo privado do documento.', error);
    alert('Não foi possível apagar o arquivo privado agora. O documento foi mantido para evitar deixar um arquivo sem registro.');
    return false;
  }

  async function confirmDeleteCurrentRecord() {
    const { type, id } = deleteDialogState;
    const record = type && id ? getRecord(type, id) : null;
    if (!type || !id || !record) return closeDeleteConfirmDialog();
    const blockMessage = getDeleteBlockMessage(type, record);
    if (blockMessage) {
      alert(blockMessage);
      closeDeleteConfirmDialog();
      return;
    }
    setDeleteConfirmBusy(true);
    try {
      if (type === 'Documento' && !(await deleteDocumentStorageFile(record))) return;
      if (!deleteRecord(type, id)) return;
      if (type === 'Pagamento') recalculateTripsForPaymentChanges(record.viagemId);
      const openedRecordModal = (
        modalState.type === type &&
        modalState.id === id &&
        els.modalOverlay &&
        !els.modalOverlay.classList.contains('hidden')
      );
      closeDeleteConfirmDialog({ restoreFocus: false });
      if (openedRecordModal) closeRecordModal(true);
      renderCurrentView();
      updateTripAutofillPreview();
      announceRecordAction(`${type} apagado com sucesso.`);
    } catch (error) {
      console.warn('Não foi possível apagar o registro.', error);
      alert('Não foi possível apagar este registro agora. Tente novamente em alguns instantes.');
    } finally {
      setDeleteConfirmBusy(false);
    }
  }

  function deleteCurrentRecord(type, id, trigger) {
    openDeleteConfirmDialog(type, id, trigger);
  }

  function getCurrentViewData() {
    if (currentSearchQuery) {
      const entries = filterEntries(currentSearchQuery);
      return {
        panelTitle: 'Resultados da pesquisa em tempo real',
        panelSubtitle: `${entries.length} resultado(s) para "${currentSearchQuery}".`,
        searchStatus: `${entries.length} resultado(s) para "${currentSearchQuery}".`,
        entries,
        showSearchPanel: true,
        empty: {
          title: 'Nenhum resultado encontrado',
          subtitle: 'Tente pesquisar por outro nome, cidade, placa ou empresa.',
        },
      };
    }

    if (activeQuickFilter) {
      const meta = getQuickFilterEntries(activeQuickFilter);
      return {
        panelTitle: meta.title,
        panelSubtitle: `${meta.total} item(ns) encontrados.`,
        searchStatus: `${meta.total} item(ns) em ${meta.title.toLowerCase()}.`,
        entries: meta.entries,
        showSearchPanel: true,
        empty: {
          title: `Nenhum item em ${meta.title.toLowerCase()}`,
          subtitle: 'Não há registros para este filtro agora.',
        },
      };
    }

    const allEntries = getAllEntries();
    return {
      panelTitle: '',
      panelSubtitle: '',
      searchStatus: `Mostrando todos os registros (${allEntries.length}).`,
      entries: allEntries,
      showSearchPanel: false,
      empty: {
        title: 'Sem registros ainda',
        subtitle: 'Quando você salvar as informações, elas aparecerão aqui.',
      },
    };
  }

  function renderCurrentView() {
    const allEntries = getAllEntries();
    renderSearchSuggestionsBox(currentSearchQuery);
    const view = getCurrentViewData();

    if (view.showSearchPanel) {
      ensureSearchPanel();
      if (ui.searchPanel) ui.searchPanel.hidden = false;
      if (els.recordsSection) els.recordsSection.hidden = true;
      renderEntries(ui.searchResultsList, view.entries, view.empty);
      if (ui.searchPanelSummary) ui.searchPanelSummary.textContent = view.panelSubtitle || view.searchStatus;
      if (els.searchStatus) els.searchStatus.textContent = view.searchStatus;
    } else {
      if (ui.searchPanel) ui.searchPanel.hidden = true;
      if (els.recordsSection) els.recordsSection.hidden = false;
      renderEntries(els.recentRecords, allEntries, view.empty);
      if (els.searchStatus) els.searchStatus.textContent = view.searchStatus;
    }

    updateStats();
    refreshSelects();
    updateTripAutofillPreview();
    syncTabs();
  }

  function updateSearchView(query) {
    activeQuickFilter = null;
    currentSearchQuery = safeText(query);
    renderCurrentView();
  }

  function clearSearch() {
    currentSearchQuery = '';
    activeQuickFilter = null;
    if (els.searchInput) els.searchInput.value = '';
    if (els.searchResultsBox) {
      els.searchResultsBox.innerHTML = '';
      els.searchResultsBox.classList.remove('active');
    }
    setUrlWithoutQuery('#pesquisaHub');
    renderCurrentView();
    scrollToElement(els.hero);
    if (els.searchInput) els.searchInput.focus();
  }

  function applyQuickFilter(filterKey) {
    activeQuickFilter = filterKey;
    currentSearchQuery = '';
    if (els.searchInput) els.searchInput.value = '';
    if (els.searchResultsBox) {
      els.searchResultsBox.innerHTML = '';
      els.searchResultsBox.classList.remove('active');
    }
    renderCurrentView();
    if (ui.searchPanel) scrollToElement(ui.searchPanel);
  }

  function handleSearchInput(event) {
    currentSearchQuery = event.currentTarget.value;
    activeQuickFilter = null;
    renderCurrentView();
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    const query = safeText(els.searchInput?.value);
    if (!query) {
      scrollToElement(els.hero);
      return;
    }
    updateSearchView(query);
    window.open(`${getBaseUrl()}?q=${encodeURIComponent(query)}#searchResultsHub`, '_blank', 'noopener,noreferrer');
    if (ui.searchPanel) scrollToElement(ui.searchPanel);
  }

  function handleLoadSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const item = {
      id: uid(),
      empresa: safeText(data.get('empresa')),
      origem: safeText(data.get('origem')),
      destino: safeText(data.get('destino')),
      peso: safeText(data.get('peso')),
      valorFrete: moneyToNumber(String(data.get('valorFrete') || 0)),
      tipoCarga: safeText(data.get('tipoCarga')),
      observacoes: safeText(data.get('observacoesCarga')),
      status: 'Aberta',
      createdAt: new Date().toISOString(),
    };
    if (!item.empresa || !item.origem || !item.destino) return alert('Preencha empresa, origem e destino.');
    state.cargas.unshift(item);
    saveState('cargas');
    event.currentTarget.reset();
    renderCurrentView();
    scrollToElement(activeQuickFilter || currentSearchQuery ? ui.searchPanel : els.recordsSection);
  }

  function handleDriverSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const item = {
      id: uid(),
      nome: safeText(data.get('nomeMotorista')),
      telefone: safeText(data.get('telefoneMotorista')),
      pix: safeText(data.get('pixMotorista')),
      cnh: safeText(data.get('cnhMotorista')),
      mopp: safeText(data.get('moppMotorista')),
      vencimentoCnh: safeText(data.get('vencimentoCnh')),
      observacoes: safeText(data.get('observacoesMotorista')),
      truckId: safeText(data.get('truckId')),
      createdAt: new Date().toISOString(),
    };
    if (!item.nome) return alert('Preencha o nome do motorista.');
    state.motoristas.unshift(item);
    saveState('motoristas');
    event.currentTarget.reset();
    renderCurrentView();
    scrollToElement(activeQuickFilter || currentSearchQuery ? ui.searchPanel : els.recordsSection);
  }

  function handleTruckSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const item = {
      id: uid(),
      placaCavalo: safeText(data.get('placaCavalo')),
      placaCarreta: safeText(data.get('placaCarreta')),
      antt: safeText(data.get('antt')),
      tipoCaminhao: safeText(data.get('tipoCaminhao')),
      vencimentoDocumento: safeText(data.get('vencimentoDocumento')),
      observacoes: safeText(data.get('observacoesCaminhao')),
      createdAt: new Date().toISOString(),
    };
    if (!item.placaCavalo) return alert('Preencha a placa do cavalo.');
    state.caminhoes.unshift(item);
    saveState('caminhoes');
    event.currentTarget.reset();
    renderCurrentView();
    scrollToElement(activeQuickFilter || currentSearchQuery ? ui.searchPanel : els.recordsSection);
  }

  function syncDriverTruckSelection(driverId) {
    if (!els.tripTruckSelect) return;
    const suggestedTruckId = getSuggestedTruckIdForDriver(driverId);
    if (suggestedTruckId && els.tripTruckSelect.value !== suggestedTruckId) {
      els.tripTruckSelect.value = suggestedTruckId;
    }
  }

  function setupTripSelectListeners() {
    const refreshFromSelections = () => {
      const driverId = safeText(els.tripDriverSelect?.value);
      if (driverId) syncDriverTruckSelection(driverId);
      updateTripAutofillPreview();
    };

    if (els.tripLoadSelect) els.tripLoadSelect.addEventListener('change', refreshFromSelections);

    if (els.tripDriverSelect) {
      els.tripDriverSelect.addEventListener('change', () => {
        const driverId = safeText(els.tripDriverSelect.value);
        syncDriverTruckSelection(driverId);
        updateTripAutofillPreview();
      });
    }

    if (els.tripTruckSelect) els.tripTruckSelect.addEventListener('change', refreshFromSelections);
    if (els.tripCombinedInput) els.tripCombinedInput.addEventListener('input', () => renderTripFinancialPreview());
    if (els.tripAdvanceInput) els.tripAdvanceInput.addEventListener('input', () => renderTripFinancialPreview());
    if (els.tripDailyInput) els.tripDailyInput.addEventListener('input', () => renderTripFinancialPreview());
    if (els.tripHelperInput) els.tripHelperInput.addEventListener('input', () => renderTripFinancialPreview());
  }

  function handleTripSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const cargaId = safeText(data.get('cargaViagem'));
    const motoristaId = safeText(data.get('motoristaViagem'));
    const caminhaoId = safeText(data.get('caminhaoViagem'));
    if (!cargaId || !motoristaId || !caminhaoId) return alert('Selecione carga, motorista e caminhão.');
    const carga = state.cargas.find((item) => item.id === cargaId);
    if (!carga) return alert('A carga selecionada não foi encontrada. Atualize a página e tente novamente.');
    const freightInput = data.get('valorFreteViagem');
    let item = {
      id: uid(),
      cargaId,
      motoristaId,
      caminhaoId,
      // Não use || aqui: R$ 0,00 é um valor válido e não pode buscar o frete da carga.
      valorFrete: hasMoneyValue(freightInput) ? moneyToNumber(String(freightInput)) : nonNegativeMoney(carga.valorFrete ?? 0),
      valorMotorista: moneyToNumber(String(data.get('valorMotorista') || 0)),
      adiantamento: moneyToNumber(String(data.get('adiantamento') || 0)),
      diarias: getFormMoneyValue(data, ['diariasViagem', 'diariaPrevista', 'diarias']),
      ajudantes: getFormMoneyValue(data, ['ajudantesViagem', 'ajudantePrevisto', 'ajudantes']),
      origemAdiantamento: safeText(data.get('origemAdiantamento')),
      financialModelVersion: FINANCIAL_MODEL_VERSION,
      status: safeText(data.get('statusViagem')),
      observacoes: safeText(data.get('observacoesViagem')),
      createdAt: new Date().toISOString(),
    };
    const negativeValue = [item.valorFrete, item.valorMotorista, item.adiantamento, item.diarias, item.ajudantes].some((value) => value < 0);
    if (negativeValue) return alert('Os valores financeiros não podem ser negativos.');
    item = recalculateTripRecord(item);
    const driver = state.motoristas.find((m) => m.id === motoristaId);
    if (driver && caminhaoId) {
      driver.truckId = caminhaoId;
      saveState('motoristas');
    }
    state.viagens.unshift(item);
    const initialAdvanceChanged = syncInitialAdvancePayment(item, item.adiantamento, { persist: false });
    state.viagens[0] = recalculateTripRecord(item);
    saveState('viagens');
    if (initialAdvanceChanged) saveState('pagamentos');
    event.currentTarget.reset();
    renderCurrentView();
    updateTripAutofillPreview();
    scrollToElement(activeQuickFilter || currentSearchQuery ? ui.searchPanel : els.recordsSection);
  }

  function handlePaymentSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const item = {
      id: uid(),
      viagemId: safeText(data.get('viagemPagamento')),
      tipo: getPaymentLabel(data.get('tipoPagamento')),
      origemPagamento: getPaymentSourceLabel(data.get('origemPagamento')),
      valor: moneyToNumber(String(data.get('valorPagamento') || 0)),
      dataPagamento: safeText(data.get('dataPagamento')),
      observacao: safeText(data.get('observacaoPagamento')),
      createdAt: new Date().toISOString(),
    };
    if (!item.viagemId) return alert('Selecione uma viagem.');
    if (!state.viagens.some((trip) => trip.id === item.viagemId)) return alert('A viagem selecionada não foi encontrada.');
    if (!normalizePaymentType(item.tipo)) return alert('Escolha um tipo de pagamento válido.');
    if (item.valor <= 0) return alert('Informe um valor maior que R$ 0,00.');
    state.pagamentos.unshift(item);
    saveState('pagamentos');
    recalculateTripsForPaymentChanges(item.viagemId);
    event.currentTarget.reset();
    renderCurrentView();
    scrollToElement(activeQuickFilter || currentSearchQuery ? ui.searchPanel : els.recordsSection);
  }

  function getSelectedFile(formData, name = 'arquivoDocumento') {
    const value = formData.get(name);
    return value && typeof value === 'object' && safeText(value.name) ? value : null;
  }

  function safeFileName(name) {
    const cleaned = safeText(name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-');
    return cleaned || `arquivo-${Date.now()}`;
  }

  async function uploadDocumentFile(file, documentId) {
    const client = getSupabaseClient();
    if (!client || !activeCloudUser) return null;
    const path = `${activeCloudUser.id}/documentos/${documentId}/${safeFileName(file.name)}`;
    const { data, error } = await client.storage.from('documentos-privados').upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    return {
      storagePath: data?.path || path,
      contentType: file.type || '',
      fileSize: Number(file.size || 0),
      arquivoPendenteNuvem: false,
    };
  }

  async function handleDocumentSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = getSelectedFile(data);
    const item = {
      id: uid(),
      tipo: safeText(data.get('tipoDocumento')),
      relacionado: safeText(data.get('relacionadoDocumento')),
      relacionadoId: safeText(data.get('relacionadoId')),
      vencimentoDocumentoSistema: safeText(data.get('vencimentoDocumentoSistema')),
      fileName: file?.name || '',
      observacoes: safeText(data.get('observacoesDocumento')),
      createdAt: new Date().toISOString(),
    };
    if (!item.tipo || !item.relacionado || !item.relacionadoId) {
      return alert('Informe o tipo e o registro ao qual este documento pertence.');
    }
    if (!getDocumentRelatedOptions(item.relacionado).some((option) => option.value === item.relacionadoId)) {
      return alert('O registro relacionado não foi encontrado. Atualize a tela e tente novamente.');
    }
    let attachmentPending = false;
    if (file) {
      if (activeCloudUser && getSupabaseClient()) {
        try {
          Object.assign(item, await uploadDocumentFile(file, item.id));
        } catch (error) {
          console.warn('Falha no upload do documento.', error);
          return alert('Não foi possível enviar o arquivo privado. O documento não foi salvo para evitar um anexo inexistente.');
        }
      } else {
        attachmentPending = true;
        item.arquivoPendenteNuvem = true;
      }
    }
    state.documentos.unshift(item);
    saveState('documentos');
    event.currentTarget.reset();
    renderCurrentView();
    if (attachmentPending) alert('Os dados do documento foram salvos, mas o arquivo precisa ser enviado novamente após configurar a nuvem.');
    scrollToElement(activeQuickFilter || currentSearchQuery ? ui.searchPanel : els.recordsSection);
  }

  function setupModalEvents() {
    ensureRecordModal();

    if (els.closeModalBtn) els.closeModalBtn.addEventListener('click', () => closeRecordModal(false));

    if (els.editRecordBtn) {
      els.editRecordBtn.addEventListener('click', () => {
        if (!modalState.type || !modalState.id) return;
        const record = getRecord(modalState.type, modalState.id);
        if (!record) return;
        modalState.mode = 'edit';
        modalState.dirty = false;
        renderModalEdit(record);
        setModalButtonsForMode('edit');
        window.setTimeout(() => ui.editForm?.querySelector('input, select, textarea')?.focus(), 0);
      });
    }

    if (els.saveEditBtn) {
      els.saveEditBtn.addEventListener('click', () => {
        if (ui.editForm) ui.editForm.requestSubmit();
        else saveCurrentRecordEdit();
      });
    }

    if (els.cancelEditBtn) els.cancelEditBtn.addEventListener('click', () => closeRecordModal(false));

    if (els.deleteRecordBtn) {
      els.deleteRecordBtn.addEventListener('click', () => {
        if (!modalState.type || !modalState.id) return;
        deleteCurrentRecord(modalState.type, modalState.id, els.deleteRecordBtn);
      });
    }

    if (els.cancelDeleteBtn) els.cancelDeleteBtn.addEventListener('click', () => closeDeleteConfirmDialog());
    if (els.confirmDeleteBtn) els.confirmDeleteBtn.addEventListener('click', () => confirmDeleteCurrentRecord());

    if (els.modalOverlay) {
      els.modalOverlay.addEventListener('click', (event) => {
        if (event.target === els.modalOverlay) closeRecordModal(false);
      });
    }

    if (els.deleteConfirmOverlay) {
      els.deleteConfirmOverlay.addEventListener('click', (event) => {
        if (event.target === els.deleteConfirmOverlay && !els.confirmDeleteBtn?.disabled) closeDeleteConfirmDialog();
      });
    }

    window.addEventListener('keydown', (event) => {
      if (
        event.key === 'Escape' &&
        els.deleteConfirmOverlay &&
        !els.deleteConfirmOverlay.classList.contains('hidden') &&
        !els.confirmDeleteBtn?.disabled
      ) {
        closeDeleteConfirmDialog();
        return;
      }
      if (event.key === 'Escape' && els.modalOverlay && !els.modalOverlay.classList.contains('hidden')) {
        closeRecordModal(false);
      }
    });
  }

  function setupSearchEvents() {
    if (els.searchForm) els.searchForm.addEventListener('submit', handleSearchSubmit);
    if (els.searchInput) els.searchInput.addEventListener('input', handleSearchInput);
    if (els.clearSearchBtn) els.clearSearchBtn.addEventListener('click', clearSearch);
    if (ui.searchPanelClearBtn) ui.searchPanelClearBtn.addEventListener('click', clearSearch);
    if (ui.searchPanelTopBtn) ui.searchPanelTopBtn.addEventListener('click', () => scrollToTop());

    if (els.searchResultsBox) {
      els.searchResultsBox.addEventListener('click', handleSearchSuggestionsClick);
      els.searchResultsBox.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          const target = event.target.closest('[data-search-term]');
          if (target) {
            event.preventDefault();
            if (els.searchInput) {
              els.searchInput.value = target.dataset.searchTerm || '';
              currentSearchQuery = els.searchInput.value;
              activeQuickFilter = null;
              renderCurrentView();
            }
          }
        }
      });
    }
  }

  function syncTabs() {
    const currentHash = window.location.hash || '#pesquisaHub';
    els.pageTabs.forEach((link) => {
      const href = link.getAttribute('href');
      const active = href === currentHash;
      link.classList.toggle('active', active);
      link.style.background = active ? '#0f172a' : '';
      link.style.color = active ? '#fff' : '';
      link.style.borderColor = active ? '#0f172a' : '';
    });
  }

  function initFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const query = safeText(params.get('q'));
    if (query && els.searchInput) {
      els.searchInput.value = query;
      currentSearchQuery = query;
    }
  }

  function renderInitialRecords() {
    renderEntries(els.recentRecords, getAllEntries(), {
      title: 'Sem registros ainda',
      subtitle: 'Quando você salvar as informações, elas aparecerão aqui.',
    });
  }

  function setupAccessEvents() {
    if (els.loginForm) els.loginForm.addEventListener('submit', handleLoginSubmit);
    if (els.signupBtn) els.signupBtn.addEventListener('click', handleSignup);
    if (els.forgotPasswordBtn) els.forgotPasswordBtn.addEventListener('click', openPasswordResetRequest);
    if (els.passwordResetRequestForm) els.passwordResetRequestForm.addEventListener('submit', handlePasswordResetRequest);
    if (els.cancelPasswordResetRequestBtn) els.cancelPasswordResetRequestBtn.addEventListener('click', returnToLoginFromPasswordReset);
    if (els.passwordUpdateForm) els.passwordUpdateForm.addEventListener('submit', handlePasswordUpdate);
    if (els.cancelPasswordUpdateBtn) els.cancelPasswordUpdateBtn.addEventListener('click', cancelPasswordUpdate);
    if (els.btnLogin) {
      els.btnLogin.addEventListener('click', () => {
        if (!document.body.classList.contains('login-open')) handleLogout();
        else els.loginEmail?.focus();
      });
    }
    if (els.closePwaGuideBtn) {
      els.closePwaGuideBtn.addEventListener('click', () => {
        if (els.pwaInstallGuide) els.pwaInstallGuide.hidden = true;
        localStorage.setItem(PWA_GUIDE_KEY, '1');
      });
    }
    if (els.pwaInstallGuide && localStorage.getItem(PWA_GUIDE_KEY)) els.pwaInstallGuide.hidden = true;
    if (els.documentRelatedType) {
      els.documentRelatedType.addEventListener('change', () => {
        if (els.documentRelatedSelect) els.documentRelatedSelect.value = '';
        refreshDocumentRelatedSelect();
      });
    }
  }

  function setupEvents() {
    setupAccessEvents();
    setupSearchEvents();
    if (els.loadForm) els.loadForm.addEventListener('submit', handleLoadSubmit);
    if (els.driverForm) els.driverForm.addEventListener('submit', handleDriverSubmit);
    if (els.truckForm) els.truckForm.addEventListener('submit', handleTruckSubmit);
    if (els.tripForm) els.tripForm.addEventListener('submit', handleTripSubmit);
    if (els.paymentForm) els.paymentForm.addEventListener('submit', handlePaymentSubmit);
    if (els.documentForm) els.documentForm.addEventListener('submit', handleDocumentSubmit);
    if (els.tripWhatsAppBtn) els.tripWhatsAppBtn.addEventListener('click', handleTripWhatsApp);
    if (ui.recordsTopBtn) ui.recordsTopBtn.addEventListener('click', () => scrollToTop());
    window.addEventListener('hashchange', syncTabs);
  }

  function removeQuickActionsSection() {
    const quickSection = document.querySelector('.quick-actions')?.closest('section');
    if (quickSection) quickSection.remove();
  }

  function setupIndicatorTooltips() {
    const cards = document.querySelectorAll('.stat-card');
    cards.forEach((card) => {
      const label = normalizeText(card.querySelector('.stat-label')?.textContent || '');
      if (label.includes('cargas em aberto')) card.title = 'Clique para ver só as cargas em aberto';
      if (label.includes('viagens ativas')) card.title = 'Clique para ver só as viagens ativas';
      if (label.includes('pendências financeiras')) card.title = 'Clique para ver só as viagens com saldo pendente';
      if (label.includes('documentos a vencer')) card.title = 'Clique para ver só os documentos que vencem em breve';
    });
  }

  function updateStats() {
    const openLoads = state.cargas.filter((item) => normalizeText(item.status) !== 'finalizada').length;
    const activeTrips = state.viagens.filter((trip) => {
      const status = normalizeText(trip.status);
      return status === 'em andamento' || status === 'carregada';
    }).length;
    const pendingFinance = state.viagens.filter((trip) => getTripFinancialState(trip).balance > 0).length;
    const expiringDocs = countDocsExpiring();
    if (els.statOpenLoads) els.statOpenLoads.textContent = openLoads;
    if (els.statActiveTrips) els.statActiveTrips.textContent = activeTrips;
    if (els.statPendingFinance) els.statPendingFinance.textContent = pendingFinance;
    if (els.statDocsExpiring) els.statDocsExpiring.textContent = expiringDocs;
  }

  function updateIndicatorButtonStates() {
    // Mantido simples para não mexer no CSS existente.
  }

  function setupIndicatorClicks() {
    const cards = document.querySelectorAll('.stat-card');
    const mapping = ['openLoads', 'activeTrips', 'pendingFinance', 'docsExpiring'];
    cards.forEach((card, index) => {
      const filterKey = mapping[index];
      if (!filterKey) return;
      card.style.cursor = 'pointer';
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      const activate = () => applyQuickFilter(filterKey);
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });
  }

  function init() {
    loadState();
    setApplicationAccess(false);
    removeQuickActionsSection();
    ensureSearchPanel();
    ensureRecordsToolbar();
    ensureTripAutoFillPreview();
    ensureSearchSuggestionsBox();
    ensureRecordModal();
    bindRecordContainerActions(els.recentRecords);
    bindRecordContainerActions(ui.searchResultsList);
    initFromUrl();
    passwordRecoveryMode = isPasswordRecoveryCallback();
    if (passwordRecoveryMode) {
      setAuthView('update', { focus: false });
      setPasswordUpdateStatus('Verificando o link seguro para trocar sua senha…');
    } else {
      setAuthView('login', { focus: false });
    }
    setupEvents();
    setupModalEvents();
    setupTripSelectListeners();
    setupIndicatorClicks();
    setupIndicatorTooltips();
    refreshSelects();
    updateTripAutofillPreview();
    updateStats();
    renderCurrentView();
    syncTabs();
    registerPwaServiceWorker();
    setupSupabaseAuthListener();
    restoreAccess().catch((error) => {
      console.warn('Não foi possível restaurar o acesso.', error);
      if (passwordRecoveryMode) {
        showPasswordRecoveryUnavailable('Não foi possível validar este link agora. Peça um novo link e tente novamente.');
      } else {
        setLoginStatus('Não foi possível verificar a sessão agora. Tente entrar novamente.', true);
      }
    });
    if (currentSearchQuery && ui.searchPanel) setTimeout(() => scrollToElement(ui.searchPanel), 100);
  }

  function populateSelect(selectEl, items, placeholder, labelBuilder) {
  if (!selectEl) return;

  const currentValue = selectEl.value;

  selectEl.innerHTML = `<option value="">${placeholder}</option>`;

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id ?? item.value ?? '';
    option.textContent = labelBuilder(item);
    selectEl.appendChild(option);
  });

  if ([...selectEl.options].some((opt) => opt.value === currentValue)) {
    selectEl.value = currentValue;
  }
}

function refreshDocumentRelatedSelect() {
  if (!els.documentRelatedSelect) return;
  const relatedType = safeText(els.documentRelatedType?.value);
  if (!relatedType) {
    els.documentRelatedSelect.innerHTML = '<option value="">Selecione primeiro o tipo</option>';
    return;
  }
  const options = getDocumentRelatedOptions(relatedType);
  populateSelect(
    els.documentRelatedSelect,
    options,
    options.length ? 'Selecione o registro' : 'Nenhum registro cadastrado',
    (item) => item.label
  );
}

function refreshSelects() {
  populateSelect(
    els.tripLoadSelect,
    state.cargas,
    'Selecione uma carga',
    (item) => `${item.empresa || 'Carga'} — ${item.origem || '?'} → ${item.destino || '?'}`
  );

  populateSelect(
    els.tripDriverSelect,
    state.motoristas,
    'Selecione um motorista',
    (item) => item.nome || 'Motorista sem nome'
  );

  populateSelect(
    els.tripTruckSelect,
    state.caminhoes,
    'Selecione um caminhão',
    (item) =>
      `${item.placaCavalo || 'Sem placa'} / ${item.placaCarreta || 'Sem carreta'}`
  );

  populateSelect(
    els.driverTruckSelect,
    state.caminhoes,
    'Sem caminhão habitual',
    (item) => getTruckLabel(item)
  );
  populateSelect(
    els.paymentTripSelect,
    state.viagens,
    'Selecione uma viagem',
    (item) => {
      const carga = state.cargas.find((c) => c.id === item.cargaId);
      return `${carga?.empresa || 'Viagem'} — ${item.status || 'Sem status'}`;
    }
  );
  refreshDocumentRelatedSelect();
}

  document.addEventListener('DOMContentLoaded', init);
})();
