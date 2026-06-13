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

    statOpenLoads: document.getElementById('statOpenLoads'),
    statActiveTrips: document.getElementById('statActiveTrips'),
    statPendingFinance: document.getElementById('statPendingFinance'),
    statDocsExpiring: document.getElementById('statDocsExpiring'),

    btnLogin: document.getElementById('btnLogin'),

    tripLoadSelect: document.querySelector('select[name="cargaViagem"]'),
    tripDriverSelect: document.querySelector('select[name="motoristaViagem"]'),
    tripTruckSelect: document.querySelector('select[name="caminhaoViagem"]'),
    paymentTripSelect: document.querySelector('select[name="viagemPagamento"]'),

    tripFreightValue: document.getElementById('tripFreightValue'),
    tripCombinedInput: document.querySelector('#tripForm input[name="valorMotorista"]'),
    tripAdvanceInput: document.querySelector('#tripForm input[name="adiantamento"]'),
    tripFinancialFreight: document.getElementById('tripFinancialFreight'),
    tripFinancialCombined: document.getElementById('tripFinancialCombined'),
    tripFinancialAdvance: document.getElementById('tripFinancialAdvance'),
    tripFinancialBalance: document.getElementById('tripFinancialBalance'),
    tripFinancialProfit: document.getElementById('tripFinancialProfit'),

    pageTabs: document.querySelectorAll('.page-tabs a'),

    modalOverlay: document.getElementById('recordModalOverlay'),
    modalTitle: document.getElementById('modalTitle'),
    modalContent: document.getElementById('recordModalContent'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    editRecordBtn: document.getElementById('editRecordBtn'),
    saveEditBtn: document.getElementById('saveEditBtn'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),
    deleteRecordBtn: document.getElementById('deleteRecordBtn'),

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
      { name: 'adiantamento', label: 'Adiantamento', type: 'money' },
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
          'Ajuda de custo',
          'Recebimento cliente',
        ],
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

  const TRIP_VIEW_SKIP = new Set(['valorFrete', 'valorMotorista', 'adiantamento']);

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
    if (typeof value !== 'string') return Number(value) || 0;
    const cleaned = value
      .replace(/\s/g, '')
      .replace(/R\$/gi, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.-]/g, '');
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  }

  function formatDate(dateString) {
    if (!dateString) return 'Sem data';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Sem data';
    return date.toLocaleDateString('pt-BR');
  }

  function toDateInputValue(value) {
    const text = safeText(value);
    if (!text) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  function getBaseUrl() {
    return `${window.location.origin}${window.location.pathname}`;
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

  function saveState(key) {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(state[key]));
  }

  function loadState() {
    for (const key of Object.keys(STORAGE_KEYS)) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS[key]);
        state[key] = raw ? JSON.parse(raw) : [];
      } catch {
        state[key] = [];
      }
    }
    normalizeLegacyData();
  }

  function normalizeLegacyData() {
    state.pagamentos = state.pagamentos.map((item) => ({
      ...item,
      observacao: item.observacao ?? item.observacoes ?? '',
      tipo: item.tipo ?? item.tipoPagamento ?? '',
      valor: moneyToNumber(item.valor ?? 0),
    }));

    state.documentos = state.documentos.map((item) => ({
      ...item,
      tipo: item.tipo ?? item.tipoDocumento ?? '',
      relacionado: item.relacionado ?? item.relacionadoDocumento ?? '',
      observacoes: item.observacoes ?? '',
      fileName: item.fileName ?? '',
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
        valorFrete: moneyToNumber(item.valorFrete ?? 0),
        valorMotorista: moneyToNumber(item.valorMotorista ?? 0),
        adiantamento: moneyToNumber(item.adiantamento ?? 0),
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

  function deleteRecord(type, id) {
    const collection = getCollectionForType(type);
    if (!collection) return false;
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

  function getDocumentDueDate(item) {
    return item.vencimentoDocumentoSistema || item.vencimentoDocumento || item.vencimento || item.dataVencimento || '';
  }

  function isWithinNextDays(dateString, days = 30) {
    if (!dateString) return false;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return false;
    const today = new Date();
    const limit = new Date();
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

  function getTripFinancialState(trip) {
    const carga = state.cargas.find((item) => item.id === trip.cargaId) || null;
    const freight = moneyToNumber(trip.valorFrete || carga?.valorFrete || 0);
    const combined = moneyToNumber(trip.valorMotorista || 0);
    const advance = moneyToNumber(trip.adiantamento || 0);
    const balance = combined - advance;
    const profit = freight - combined;
    return { carga, freight, combined, advance, balance, profit };
  }

  function recalculateTripRecord(trip) {
    const finance = getTripFinancialState(trip);
    return {
      ...trip,
      valorFrete: finance.freight,
      valorMotorista: finance.combined,
      adiantamento: finance.advance,
      saldoMotorista: finance.balance,
      lucro: finance.profit,
      observacoes: trip.observacoes ?? trip.observacao ?? '',
      status: trip.status ?? 'Planejada',
    };
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
    if (field.type === 'file') return safeText(record.fileName) || 'Sem arquivo';
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
        details: `Frete: ${formatMoney(finance.freight)} | Combinado: ${formatMoney(finance.combined)} | Saldo: ${formatMoney(finance.balance)} | Lucro: ${formatMoney(finance.profit)}`,
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
        { label: 'Valor combinado motorista', value: formatMoney(finance.combined) },
        { label: 'Adiantamento', value: formatMoney(finance.advance) },
        { label: 'Saldo a pagar', value: formatMoney(finance.balance) },
        { label: 'Lucro da viagem', value: formatMoney(finance.profit) }
      );
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
        finance.freight, finance.combined, finance.advance, finance.balance, finance.profit
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
        <button type="button" data-action="view">Visualizar</button>
        <button type="button" data-action="edit">Editar</button>
        <button type="button" data-action="delete" class="danger-btn">Apagar</button>
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
    if (action === 'view') return openRecordModal(type, id, 'view');
    if (action === 'edit') return openRecordModal(type, id, 'edit');
    if (action === 'delete') return deleteCurrentRecord(type, id);
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
    const finance = getTripFinancialState({
      cargaId: els.tripLoadSelect?.value || '',
      motoristaId: els.tripDriverSelect?.value || '',
      caminhaoId: els.tripTruckSelect?.value || '',
      valorFrete: els.tripFreightValue ? els.tripFreightValue.value : '',
      valorMotorista: els.tripCombinedInput ? els.tripCombinedInput.value : '',
      adiantamento: els.tripAdvanceInput ? els.tripAdvanceInput.value : '',
      id: '__preview__',
    });

    if (els.tripFinancialFreight) els.tripFinancialFreight.textContent = finance.freight ? formatMoney(finance.freight) : 'Selecione uma carga';
    if (els.tripFinancialCombined) els.tripFinancialCombined.textContent = finance.combined ? formatMoney(finance.combined) : 'Digite o valor combinado';
    if (els.tripFinancialAdvance) els.tripFinancialAdvance.textContent = finance.advance ? formatMoney(finance.advance) : 'Digite o adiantamento';
    if (els.tripFinancialBalance) els.tripFinancialBalance.textContent = formatMoney(finance.balance);
    if (els.tripFinancialProfit) els.tripFinancialProfit.textContent = formatMoney(finance.profit);
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
      els.tripFreightValue.value = carga ? formatMoney(carga.valorFrete || 0) : '';
      els.tripFreightValue.readOnly = true;
      els.tripFreightValue.title = 'O valor do frete vem da carga selecionada';
    }

    if (ui.tripAutoFillLoad) {
      ui.tripAutoFillLoad.innerHTML = carga
        ? `<strong>Carga</strong><div>${escapeHtml(getCargaLabel(carga))}</div><small>${escapeHtml(carga.tipoCarga || '-')} | ${escapeHtml(formatMoney(carga.valorFrete || 0))}</small>`
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
  }

  function ensureRecordModal() {
    if (els.modalOverlay && els.modalContent && els.modalTitle) return;
    let overlay = document.getElementById('recordModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'recordModalOverlay';
      overlay.className = 'modal-overlay hidden';
      overlay.innerHTML = `
        <div class="record-modal">
          <div class="record-modal-header">
            <h3 id="modalTitle">Registro</h3>
            <button type="button" id="closeModalBtn" class="close-modal-btn">✕</button>
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
  }

  function setModalButtonsForMode(mode) {
    const isView = mode === 'view';
    const isEdit = mode === 'edit';
    if (!els.editRecordBtn || !els.saveEditBtn || !els.cancelEditBtn || !els.deleteRecordBtn) return;
    els.editRecordBtn.classList.toggle('hidden', !isView);
    els.deleteRecordBtn.classList.toggle('hidden', !isView);
    els.saveEditBtn.classList.toggle('hidden', !isEdit);
    els.cancelEditBtn.classList.toggle('hidden', !isEdit);
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

  function openRecordModal(type, id, mode = 'view') {
    ensureRecordModal();
    const record = getRecord(type, id);
    if (!record) return alert('Registro não encontrado.');
    modalState.type = type;
    modalState.id = id;
    modalState.mode = mode;
    modalState.dirty = false;
    if (els.modalTitle) els.modalTitle.textContent = mode === 'edit' ? `Editar ${type.toLowerCase()}` : `${type}`;
    if (mode === 'edit') renderModalEdit(record);
    else renderModalView(record);
    if (els.modalOverlay) els.modalOverlay.classList.remove('hidden');
    setModalButtonsForMode(mode);
  }

  function closeRecordModal(force = false) {
    if (modalState.mode === 'edit' && modalState.dirty && !force) {
      if (confirm('Deseja salvar as alterações feitas?')) {
        saveCurrentRecordEdit();
        return;
      }
    }
    if (els.modalOverlay) els.modalOverlay.classList.add('hidden');
    modalState.type = null;
    modalState.id = null;
    modalState.mode = 'view';
    modalState.dirty = false;
    ui.editForm = null;
  }

  function markModalDirty() {
    modalState.dirty = true;
  }

  function saveCurrentRecordEdit() {
    if (!modalState.type || !modalState.id || !ui.editForm) return;
    const original = getRecord(modalState.type, modalState.id);
    if (!original) return;
    const schema = RECORD_SCHEMAS[modalState.type] || [];
    const formData = new FormData(ui.editForm);
    let nextRecord = { ...original };

    schema.forEach((field) => {
      if (field.type === 'file') {
        const fileInput = ui.editForm.querySelector(`input[name="${field.name}"]`);
        const file = fileInput?.files?.[0];
        if (file) nextRecord.fileName = file.name;
        else if (!nextRecord.fileName) nextRecord.fileName = original.fileName || '';
        return;
      }
      const value = formData.get(field.name);
      nextRecord[field.name] = field.type === 'money' ? moneyToNumber(String(value || 0)) : safeText(value);
    });

    if (modalState.type === 'Viagem') {
      nextRecord = recalculateTripRecord(nextRecord);
      const driver = state.motoristas.find((item) => item.id === nextRecord.motoristaId);
      if (driver && nextRecord.caminhaoId) {
        driver.truckId = nextRecord.caminhaoId;
        saveState('motoristas');
      }
    }

    nextRecord.updatedAt = new Date().toISOString();
    updateRecord(modalState.type, modalState.id, nextRecord);
    modalState.dirty = false;
    closeRecordModal(true);
    renderCurrentView();
    updateTripAutofillPreview();
  }

  function deleteCurrentRecord(type, id) {
    if (!getRecord(type, id)) return;
    if (!confirm('Deseja realmente apagar este registro?')) return;
    deleteRecord(type, id);
    closeRecordModal(true);
    renderCurrentView();
    updateTripAutofillPreview();
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
  }

  function handleTripSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const cargaId = safeText(data.get('cargaViagem'));
    const motoristaId = safeText(data.get('motoristaViagem'));
    const caminhaoId = safeText(data.get('caminhaoViagem'));
    if (!cargaId || !motoristaId || !caminhaoId) return alert('Selecione carga, motorista e caminhão.');
    const carga = state.cargas.find((item) => item.id === cargaId);
    let item = {
      id: uid(),
      cargaId,
      motoristaId,
      caminhaoId,
      valorFrete: moneyToNumber(String(data.get('valorFreteViagem') || carga?.valorFrete || 0)),
      valorMotorista: moneyToNumber(String(data.get('valorMotorista') || 0)),
      adiantamento: moneyToNumber(String(data.get('adiantamento') || 0)),
      status: safeText(data.get('statusViagem')),
      observacoes: safeText(data.get('observacoesViagem')),
      createdAt: new Date().toISOString(),
    };
    item = recalculateTripRecord(item);
    const driver = state.motoristas.find((m) => m.id === motoristaId);
    if (driver && caminhaoId) {
      driver.truckId = caminhaoId;
      saveState('motoristas');
    }
    state.viagens.unshift(item);
    saveState('viagens');
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
      tipo: safeText(data.get('tipoPagamento')),
      valor: moneyToNumber(String(data.get('valorPagamento') || 0)),
      dataPagamento: safeText(data.get('dataPagamento')),
      observacao: safeText(data.get('observacaoPagamento')),
      createdAt: new Date().toISOString(),
    };
    if (!item.viagemId) return alert('Selecione uma viagem.');
    state.pagamentos.unshift(item);
    saveState('pagamentos');
    event.currentTarget.reset();
    renderCurrentView();
    scrollToElement(activeQuickFilter || currentSearchQuery ? ui.searchPanel : els.recordsSection);
  }

  function handleDocumentSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get('arquivoDocumento');
    const item = {
      id: uid(),
      tipo: safeText(data.get('tipoDocumento')),
      relacionado: safeText(data.get('relacionadoDocumento')),
      vencimentoDocumentoSistema: safeText(data.get('vencimentoDocumentoSistema')),
      fileName: file && typeof file === 'object' ? file.name : '',
      observacoes: safeText(data.get('observacoesDocumento')),
      createdAt: new Date().toISOString(),
    };
    state.documentos.unshift(item);
    saveState('documentos');
    event.currentTarget.reset();
    renderCurrentView();
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
        deleteCurrentRecord(modalState.type, modalState.id);
      });
    }

    if (els.modalOverlay) {
      els.modalOverlay.addEventListener('click', (event) => {
        if (event.target === els.modalOverlay) closeRecordModal(false);
      });
    }

    window.addEventListener('keydown', (event) => {
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

  function setupEvents() {
    setupSearchEvents();
    if (els.loadForm) els.loadForm.addEventListener('submit', handleLoadSubmit);
    if (els.driverForm) els.driverForm.addEventListener('submit', handleDriverSubmit);
    if (els.truckForm) els.truckForm.addEventListener('submit', handleTruckSubmit);
    if (els.tripForm) els.tripForm.addEventListener('submit', handleTripSubmit);
    if (els.paymentForm) els.paymentForm.addEventListener('submit', handlePaymentSubmit);
    if (els.documentForm) els.documentForm.addEventListener('submit', handleDocumentSubmit);
    if (els.btnLogin) els.btnLogin.addEventListener('click', () => alert('A etapa de login será ligada depois com Supabase.'));
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
    removeQuickActionsSection();
    ensureSearchPanel();
    ensureRecordsToolbar();
    ensureTripAutoFillPreview();
    ensureSearchSuggestionsBox();
    ensureRecordModal();
    bindRecordContainerActions(els.recentRecords);
    bindRecordContainerActions(ui.searchResultsList);
    initFromUrl();
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
    if (currentSearchQuery && ui.searchPanel) setTimeout(() => scrollToElement(ui.searchPanel), 100);
  }

  function populateSelect(selectEl, items, placeholder, labelBuilder) {
  if (!selectEl) return;

  const currentValue = selectEl.value;

  selectEl.innerHTML = `<option value="">${placeholder}</option>`;

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = labelBuilder(item);
    selectEl.appendChild(option);
  });

  if ([...selectEl.options].some((opt) => opt.value === currentValue)) {
    selectEl.value = currentValue;
  }
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
    els.paymentTripSelect,
    state.viagens,
    'Selecione uma viagem',
    (item) => {
      const carga = state.cargas.find((c) => c.id === item.cargaId);
      return `${carga?.empresa || 'Viagem'} — ${item.status || 'Sem status'}`;
    }
  );
}

  document.addEventListener('DOMContentLoaded', init);
})();