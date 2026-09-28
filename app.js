const statuses = [
  "Entrada",
  "Diagnostico",
  "Aguardando pecas",
  "Em servico",
  "Pronto para entrega",
  "Entregue"
];

const storageKey = "oficina-pro-data";
const apiDataUrl = "/api/data";

const seedData = {
  clients: [
    {
      id: "cli-1",
      name: "Marcos Silva",
      phone: "(11) 98888-1020",
      document: "123.456.789-00",
      email: "marcos@email.com",
      address: "Rua das Oficinas, 120"
    },
    {
      id: "cli-2",
      name: "Aline Ferreira",
      phone: "(11) 97777-2040",
      document: "987.654.321-00",
      email: "aline@email.com",
      address: "Av. Central, 800"
    }
  ],
  vehicles: [
    {
      id: "veh-1",
      clientId: "cli-1",
      vehicleName: "Volkswagen Gol 1.6",
      plate: "ABC1D23",
      color: "Prata",
      year: "2018",
      mileage: "84500"
    },
    {
      id: "veh-2",
      clientId: "cli-2",
      vehicleName: "Fiat Toro",
      plate: "DEF4G56",
      color: "Branca",
      year: "2021",
      mileage: "61200"
    }
  ],
  services: [
    { id: "srv-1", name: "Troca de oleo e filtro", price: 140 },
    { id: "srv-2", name: "Diagnostico eletronico", price: 180 },
    { id: "srv-3", name: "Revisao de freios", price: 260 }
  ],
  parts: [
    { id: "prt-1", name: "Filtro de oleo", price: 45, stock: 8 },
    { id: "prt-2", name: "Pastilha de freio", price: 210, stock: 5 },
    { id: "prt-3", name: "Vela de ignicao", price: 38, stock: 16 }
  ],
  orders: [
    {
      id: "os-1001",
      clientId: "cli-1",
      vehicleId: "veh-1",
      status: "Em servico",
      entryDate: todayOffset(-2),
      dueDate: todayOffset(1),
      clientDocument: "123.456.789-00",
      complaint: "Barulho ao frear e revisao preventiva.",
      diagnosis: "Pastilhas dianteiras gastas.",
      observation: "Discos em bom estado. Substituir pastilhas dianteiras.",
      serviceIds: ["srv-2", "srv-3"],
      partIds: ["prt-2"],
      createdAt: new Date().toISOString(),
      events: [
        timelineEvent("Entrada", "Veiculo recebido e OS aberta."),
        timelineEvent("Diagnostico", "Diagnostico eletronico finalizado."),
        timelineEvent("Em servico", "Servico de freios iniciado.")
      ]
    },
    {
      id: "os-1002",
      clientId: "cli-2",
      vehicleId: "veh-2",
      status: "Aguardando pecas",
      entryDate: todayOffset(-1),
      dueDate: todayOffset(2),
      clientDocument: "987.654.321-00",
      complaint: "Luz da injecao acesa no painel.",
      diagnosis: "Falha de ignicao identificada.",
      observation: "Aguardando peca solicitada ao fornecedor.",
      serviceIds: ["srv-2"],
      partIds: ["prt-3"],
      createdAt: new Date().toISOString(),
      events: [
        timelineEvent("Entrada", "Cliente deixou o veiculo para avaliacao."),
        timelineEvent("Aguardando pecas", "Compra de velas autorizada.")
      ]
    }
  ],
  payments: [
    {
      id: "pay-1",
      orderId: "os-1001",
      amount: 300,
      method: "Pix",
      date: todayOffset(0)
    }
  ],
  expenses: []
};

let db = loadData();
let searchTerm = "";
let undoSnapshot = null;
let selectedRecord = null;
let orderDraftItems = {
  serviceIds: [],
  partIds: [],
  partQuantities: {},
  servicePrices: {},
  partPrices: {},
  partCosts: {},
  laborAmount: 0
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const views = {
  dashboard: "Painel de controle",
  orders: "Ordens de servico",
  clients: "Cadastro de clientes",
  vehicles: "Cadastro de veiculos",
  catalog: "Mao de obra e pecas",
  cashier: "Caixa de pagamento",
  history: "Historico conectado"
};

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("dashboard-view");
  bindNavigation();
  bindForms();
  bindOrderDialog();
  bindRecordActions();
  render();
  hydrateDataFromApi();
});

function loadData() {
  const raw = localStorage.getItem(storageKey);
  return normalizeData(raw ? JSON.parse(raw) : structuredClone(seedData));
}

function normalizeData(data) {
  data.expenses = data.expenses || [];
  data.parts = data.parts.map((part) => ({
    ...part,
    cost: Number(part.cost || 0)
  }));
  data.vehicles = data.vehicles.map((vehicle) => ({
    ...vehicle,
    vehicleName: vehicle.vehicleName || [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || vehicle.model || "",
    color: vehicle.color || ""
  }));
  data.orders = data.orders.map((order) => ({
    ...order,
    partQuantities: order.partQuantities || Object.fromEntries((order.partIds || []).map((id) => [id, 1])),
    laborAmount: Number(order.laborAmount ?? serviceValuesTotalFromData(data, order)),
    serviceIds: [],
    servicePrices: {},
    partPrices: order.partPrices || Object.fromEntries((order.partIds || []).map((id) => [id, partPriceFromData(data, id)])),
    partCosts: order.partCosts || Object.fromEntries((order.partIds || []).map((id) => [id, partCostFromData(data, id)])),
    clientDocument: order.clientDocument || dbClientDocument(data, order.clientId),
    diagnosis: order.diagnosis || "",
    observation: order.observation || order.notes || ""
  }));
  return data;
}

function servicePriceFromData(data, id) {
  return Number(data.services.find((service) => service.id === id)?.price || 0);
}

function partPriceFromData(data, id) {
  return Number(data.parts.find((part) => part.id === id)?.price || 0);
}

function partCostFromData(data, id) {
  return Number(data.parts.find((part) => part.id === id)?.cost || 0);
}

function serviceValuesTotalFromData(data, order) {
  return (order.serviceIds || []).reduce((sum, id) => sum + Number(order.servicePrices?.[id] ?? servicePriceFromData(data, id)), 0);
}

function dbClientDocument(data, clientId) {
  return data.clients.find((client) => client.id === clientId)?.document || "";
}

function saveData() {
  localStorage.setItem(storageKey, JSON.stringify(db));
  saveDataToApi();
}

async function hydrateDataFromApi() {
  try {
    const response = await fetch(apiDataUrl);
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.data) {
      await saveDataToApi();
      return;
    }
    db = normalizeData(payload.data);
    localStorage.setItem(storageKey, JSON.stringify(db));
    render();
  } catch (error) {
    console.info("Banco de dados indisponivel. Usando dados locais.", error);
  }
}

async function saveDataToApi() {
  try {
    await fetch(apiDataUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(db)
    });
  } catch (error) {
    console.info("Nao foi possivel salvar no PostgreSQL. Dados mantidos localmente.", error);
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function timelineEvent(title, detail) {
  return {
    id: uid("evt"),
    title,
    detail,
    at: new Date().toISOString()
  };
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.querySelector("#global-search").addEventListener("input", (event) => {
    searchTerm = event.target.value.trim().toLowerCase();
    render();
  });
}

function bindRecordActions() {
  document.querySelector("#correct-record").addEventListener("click", correctSelectedRecord);
  document.querySelector("#undo-change").addEventListener("click", undoLastChange);
  document.querySelector("#go-dashboard").addEventListener("click", () => showView("dashboard"));
  document.querySelector("#logout-button").addEventListener("click", logout);
  document.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    const record = event.target.closest("[data-record-type][data-record-id]");
    if (!record) return;
    selectedRecord = { type: record.dataset.recordType, id: record.dataset.recordId };
    updateRecordActions();
    renderRecordSelection();
  });
}

async function logout() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } finally {
    window.location.href = "/login";
  }
}

function showView(viewName) {
  selectedRecord = null;
  document.body.classList.toggle("dashboard-view", viewName === "dashboard");
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active-view", view.id === viewName);
  });
  document.querySelector("#view-title").textContent = views[viewName];
  updateRecordActions();
}

function bindForms() {
  document.querySelector("#client-form").addEventListener("submit", saveClient);
  document.querySelector("#vehicle-form").addEventListener("submit", saveVehicle);
  const vehicleClientSearch = document.querySelector("#vehicle-form input[name='clientSearch']");
  vehicleClientSearch.addEventListener("input", updateVehicleClientSearch);
  vehicleClientSearch.addEventListener("change", updateVehicleClientSearch);
  document.querySelector("#vehicle-form").addEventListener("reset", () => {
    vehicleClientSearch.setCustomValidity("");
    document.querySelector("#vehicle-client-options").replaceChildren();
  });
  document.querySelector("#service-form").addEventListener("submit", saveService);
  document.querySelector("#part-form").addEventListener("submit", savePart);
  document.querySelector("#payment-form").addEventListener("submit", savePayment);
  const paymentOrderSearch = document.querySelector("#payment-form input[name='orderSearch']");
  paymentOrderSearch.addEventListener("input", updatePaymentOrderSearch);
  paymentOrderSearch.addEventListener("change", updatePaymentOrderSearch);
  paymentOrderSearch.addEventListener("focus", () => {
    const dateInput = document.querySelector("#payment-form input[name='date']");
    if (!dateInput.value) dateInput.value = isoToDateInput(todayOffset(0));
  });
  document.querySelector("#payment-form input[name='date']").addEventListener("input", maskDateInput);
  document.querySelector("#payment-form select[name='method']").addEventListener("change", updatePaymentMethod);
  document.querySelector("#payment-form").addEventListener("reset", () => {
    paymentOrderSearch.setCustomValidity("");
    document.querySelector("#payment-order-options").replaceChildren();
    document.querySelector("#installments-field").hidden = true;
    document.querySelector("#payment-form select[name='installments']").required = false;
  });
  document.querySelector("#history-filter").addEventListener("change", renderHistory);
  document.querySelector("#download-history-pdf").addEventListener("click", downloadHistoryPdf);
  document.querySelector("#open-cash-closing").addEventListener("click", openCashClosing);
  document.querySelectorAll("[data-close-cash-closing]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector("#cash-closing-dialog").close());
  });
  document.querySelector("#cash-closing-period").addEventListener("change", renderCashClosing);
  document.querySelector("#cost-form").addEventListener("submit", saveExpense);
  document.querySelector("#cost-form input[name='date']").addEventListener("input", maskDateInput);
}

function bindOrderDialog() {
  document.querySelectorAll("[data-open-order]").forEach((button) => {
    button.addEventListener("click", () => openOrderDialog());
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector("#order-dialog").close());
  });
  document.querySelector("#order-form").addEventListener("submit", saveOrder);
  document.querySelector("#order-dialog").addEventListener("change", updateOrderTotalPreview);
  document.querySelector("#order-labor-amount").addEventListener("input", updateOrderTotalPreview);
  document.querySelector("#open-order-part-entry").addEventListener("click", openProductDialog);
  document.querySelector("#order-part-search").addEventListener("input", updateOrderPartSearch);
  document.querySelector("#order-part-search").addEventListener("blur", () => {
    setTimeout(() => document.querySelector("#order-part-options").hidden = true, 120);
  });
  document.querySelector("#order-part-price").addEventListener("input", updateOrderTotalPreview);
  document.querySelector("#add-order-part").addEventListener("click", () => addOrderItem("part"));
  document.querySelector("#product-form").addEventListener("submit", saveProductFromOrder);
  document.querySelectorAll("[data-close-product]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector("#product-dialog").close());
  });
  document.querySelector("#order-form input[name='clientDocument']").addEventListener("input", handleDocumentLookup);
  document.querySelector("#order-form select[name='clientId']").addEventListener("change", handleOrderClientChange);
  document.querySelector("#print-order").addEventListener("click", printOrderDraft);
  document.querySelectorAll("#order-form input[name='entryDate'], #order-form input[name='dueDate']").forEach((input) => {
    input.addEventListener("input", maskDateInput);
  });
}

function saveClient(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  rememberUndo();
  if (values.id) {
    db.clients = db.clients.map((client) => client.id === values.id ? values : client);
  } else {
    db.clients.push({ ...values, id: uid("cli") });
  }
  form.reset();
  persistAndRender();
}

function saveVehicle(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  if (!values.clientId) {
    form.elements.clientSearch.setCustomValidity("Digite ao menos 4 caracteres do nome de um cliente.");
    form.elements.clientSearch.reportValidity();
    return;
  }
  rememberUndo();
  if (values.id) {
    db.vehicles = db.vehicles.map((vehicle) => vehicle.id === values.id ? values : vehicle);
  } else {
    db.vehicles.push({ ...values, id: uid("veh") });
  }
  form.reset();
  persistAndRender();
}

function saveService(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  rememberUndo();
  if (values.id) {
    db.services = db.services.map((service) => service.id === values.id
      ? { ...service, name: values.name, price: parseCurrency(values.price) }
      : service);
  } else {
    db.services.push({ id: uid("srv"), name: values.name, price: parseCurrency(values.price) });
  }
  form.reset();
  form.querySelector("[type='submit']").textContent = "Adicionar";
  persistAndRender();
}


function savePart(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  rememberUndo();
  if (values.id) {
    db.parts = db.parts.map((part) => part.id === values.id
      ? { id: values.id, name: values.name, price: parseCurrency(values.price), cost: parseCurrency(values.cost), stock: Number(values.stock || 0) }
      : part);
  } else {
    db.parts.push({
      id: uid("prt"),
      name: values.name,
      price: parseCurrency(values.price),
      cost: parseCurrency(values.cost),
      stock: Number(values.stock || 0)
    });
  }
  form.reset();
  form.querySelector("[type='submit']").textContent = "Adicionar";
  persistAndRender();
}

function savePayment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  if (!values.orderId) {
    form.elements.orderSearch.setCustomValidity("Digite os 4 ultimos numeros de uma OS em aberto.");
    form.elements.orderSearch.reportValidity();
    return;
  }
  const isoDate = dateInputToIso(values.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    form.elements.date.setCustomValidity("Informe a data no formato dia/mes/ano.");
    form.elements.date.reportValidity();
    return;
  }
  form.elements.date.setCustomValidity("");
  const isInstallmentPayment = values.method === "Cartao de credito parcelado";
  if (isInstallmentPayment && !values.installments) {
    form.elements.installments.setCustomValidity("Selecione a quantidade de parcelas.");
    form.elements.installments.reportValidity();
    return;
  }
  form.elements.installments.setCustomValidity("");
  rememberUndo();
  const payment = {
    id: values.id || uid("pay"),
    orderId: values.orderId,
    amount: parseCurrency(values.amount),
    method: values.method,
    installments: isInstallmentPayment ? Number(values.installments) : null,
    date: isoDate
  };
  if (values.id) {
    db.payments = db.payments.map((item) => item.id === values.id ? payment : item);
  } else {
    db.payments.push(payment);
    addOrderEvent(values.orderId, "Pagamento registrado", `${values.method} - ${money.format(payment.amount)}`);
  }
  form.reset();
  form.querySelector("[type='submit']").textContent = "Registrar pagamento";
  persistAndRender();
}

function saveExpense(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  const isoDate = dateInputToIso(values.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    form.elements.date.setCustomValidity("Informe a data no formato dia/mes/ano.");
    form.elements.date.reportValidity();
    return;
  }
  form.elements.date.setCustomValidity("");
  const amount = parseCurrency(values.amount);
  if (amount <= 0) {
    form.elements.amount.setCustomValidity("Informe um custo maior que zero.");
    form.elements.amount.reportValidity();
    return;
  }
  form.elements.amount.setCustomValidity("");

  rememberUndo();
  db.expenses.push({
    id: uid("cost"),
    description: values.description.trim(),
    amount,
    date: isoDate
  });
  form.reset();
  form.elements.date.value = isoToDateInput(todayOffset(0));
  persistAndRender();
}

function saveOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  const serviceIds = [];
  const partIds = [...orderDraftItems.partIds];
  const partQuantities = { ...orderDraftItems.partQuantities };
  const servicePrices = {};
  const partPrices = { ...orderDraftItems.partPrices };
  const partCosts = { ...orderDraftItems.partCosts };
  const laborAmount = parseCurrency(document.querySelector("#order-labor-amount").value);
  const existing = db.orders.find((order) => order.id === values.id);
  rememberUndo();
  const normalizedValues = {
    ...values,
    clientDocument: documentByClient(values.clientId) || values.clientDocument,
    entryDate: dateInputToIso(values.entryDate),
    dueDate: dateInputToIso(values.dueDate)
  };

  if (existing) {
    const changedStatus = existing.status !== normalizedValues.status;
    Object.assign(existing, normalizedValues, { serviceIds, partIds, partQuantities, servicePrices, partPrices, partCosts, laborAmount });
    if (changedStatus) {
      existing.events.push(timelineEvent(normalizedValues.status, `Status alterado para ${normalizedValues.status}.`));
    }
  } else {
    db.orders.push({
      ...normalizedValues,
      id: nextOrderId(),
      serviceIds,
      partIds,
      partQuantities,
      servicePrices,
      partPrices,
      partCosts,
      laborAmount,
      createdAt: new Date().toISOString(),
      events: [timelineEvent("Entrada", "Ordem de servico aberta.")]
    });
  }

  document.querySelector("#order-dialog").close();
  persistAndRender();
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function parseCurrency(value) {
  const normalized = String(value || "0")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  return Number(normalized || 0);
}

function nextOrderId() {
  const numbers = db.orders
    .map((order) => Number(String(order.id).replace(/\D/g, "")))
    .filter(Boolean);
  return `os-${Math.max(1000, ...numbers) + 1}`;
}

function persistAndRender() {
  saveData();
  render();
}

function rememberUndo() {
  undoSnapshot = structuredClone(db);
  updateRecordActions();
}

function undoLastChange() {
  if (!undoSnapshot) return;
  db = undoSnapshot;
  undoSnapshot = null;
  selectedRecord = null;
  document.querySelectorAll("form").forEach((form) => form.reset());
  const dialog = document.querySelector("#order-dialog");
  if (dialog.open) dialog.close();
  persistAndRender();
  updateRecordActions();
}

function updateRecordActions() {
  const correctButton = document.querySelector("#correct-record");
  const undoButton = document.querySelector("#undo-change");
  if (!correctButton || !undoButton) return;
  correctButton.disabled = !selectedRecord;
  undoButton.disabled = !undoSnapshot;
}

function renderRecordSelection() {
  const records = document.querySelectorAll("[data-record-type][data-record-id]");
  const selectedExists = [...records].some((record) =>
    record.dataset.recordType === selectedRecord?.type && record.dataset.recordId === selectedRecord?.id);
  if (selectedRecord && !selectedExists) selectedRecord = null;
  records.forEach((record) => {
    const isSelected = record.dataset.recordType === selectedRecord?.type
      && record.dataset.recordId === selectedRecord?.id;
    record.classList.toggle("record-selected", isSelected);
    record.setAttribute("aria-selected", String(isSelected));
  });
  updateRecordActions();
}

function correctSelectedRecord() {
  if (!selectedRecord) return;
  const { type, id } = selectedRecord;
  if (type === "client") editClient(id);
  if (type === "vehicle") editVehicle(id);
  if (type === "order") openOrderDialog(id);
  if (type === "service") {
    fillForm("#service-form", db.services.find((item) => item.id === id));
    document.querySelector("#service-form [type='submit']").textContent = "Salvar correcao";
  }
  if (type === "part") {
    fillForm("#part-form", db.parts.find((item) => item.id === id));
    document.querySelector("#part-form [type='submit']").textContent = "Salvar correcao";
  }
  if (type === "payment") {
    const payment = db.payments.find((item) => item.id === id);
    fillForm("#payment-form", payment);
    const form = document.querySelector("#payment-form");
    if (payment.method === "Cartao de credito") {
      form.elements.method.value = payment.installments ? "Cartao de credito parcelado" : "Cartao de credito a vista";
    } else if (payment.method === "Cartao de debito") {
      form.elements.method.value = "Cartao de debito a vista";
    }
    form.elements.orderSearch.value = String(payment.orderId).replace(/\D/g, "").slice(-4);
    form.elements.date.value = isoToDateInput(payment.date);
    form.elements.installments.value = payment.installments || "";
    updatePaymentMethod({ currentTarget: form.elements.method });
    document.querySelector("#payment-form [type='submit']").textContent = "Salvar correcao";
  }
}

function render() {
  renderSelects();
  renderDashboard();
  renderClients();
  renderVehicles();
  renderCatalog();
  renderOrders();
  renderCashier();
  renderHistoryFilter();
  renderHistory();
  renderRecordSelection();
}

function renderSelects() {
  fillSelect("#order-form select[name='clientId']", db.clients, "Selecione um cliente", clientLabel);
  renderOrderVehicleSelect();

  const statusSelect = document.querySelector("#order-form select[name='status']");
  statusSelect.innerHTML = statuses.map((status) => `<option>${status}</option>`).join("");
}

function updatePaymentOrderSearch(event) {
  const form = document.querySelector("#payment-form");
  const search = event.currentTarget;
  const previousOrderId = form.elements.orderId.value;
  const digits = search.value.replace(/\D/g, "").slice(-4);
  if (search.value !== digits) search.value = digits;

  const editingPayment = form.elements.id.value
    ? db.payments.find((payment) => payment.id === form.elements.id.value)
    : null;
  const orders = db.orders.filter((order) =>
    balanceDue(order) > 0 || order.id === editingPayment?.orderId);
  const matches = digits.length === 4
    ? orders.filter((order) => String(order.id).replace(/\D/g, "").endsWith(digits))
    : [];
  document.querySelector("#payment-order-options").innerHTML = matches
    .map((order) => `<option value="${String(order.id).replace(/\D/g, "").slice(-4)}"></option>`)
    .join("");

  const selectedOrder = matches.length === 1 ? matches[0] : null;
  form.elements.orderId.value = selectedOrder?.id || "";
  if (selectedOrder && selectedOrder.id !== previousOrderId) {
    form.elements.amount.value = balanceDue(selectedOrder).toFixed(2).replace(".", ",");
  }
  search.setCustomValidity(selectedOrder ? "" : "Digite os 4 ultimos numeros de uma OS em aberto.");
}

function updatePaymentMethod(event) {
  const isInstallmentPayment = event.currentTarget.value === "Cartao de credito parcelado";
  const installmentsField = document.querySelector("#installments-field");
  const installmentsSelect = document.querySelector("#payment-form select[name='installments']");
  installmentsField.hidden = !isInstallmentPayment;
  installmentsSelect.required = isInstallmentPayment;
  installmentsSelect.setCustomValidity("");
  if (!isInstallmentPayment) installmentsSelect.value = "";
}

function renderOrderVehicleSelect(selectedVehicleId = "") {
  const form = document.querySelector("#order-form");
  const clientId = form?.elements.clientId.value;
  const vehicles = clientId ? db.vehicles.filter((vehicle) => vehicle.clientId === clientId) : db.vehicles;
  fillSelect("#order-form select[name='vehicleId']", vehicles, "Selecione um veiculo", vehicleLabel);
  if (selectedVehicleId) {
    form.elements.vehicleId.value = selectedVehicleId;
  } else if (clientId && vehicles.length) {
    form.elements.vehicleId.value = vehicles[0].id;
  }
}

function fillSelect(selector, items, placeholder, labeler) {
  const select = document.querySelector(selector);
  select.innerHTML = `<option value="">${placeholder}</option>` + items
    .map((item) => `<option value="${item.id}">${escapeHtml(labeler(item))}</option>`)
    .join("");
}

function updateVehicleClientSearch(event) {
  const form = document.querySelector("#vehicle-form");
  const search = event.currentTarget;
  const rawQuery = search.value.trim();
  const query = normalizeSearch(rawQuery);
  const suggestions = document.querySelector("#vehicle-client-options");
  const matches = query.length >= 4
    ? db.clients.filter((client) => normalizeSearch(client.name).startsWith(query))
    : [];
  suggestions.innerHTML = matches
    .map((client) => `<option value="${escapeHtml(client.name)}"></option>`)
    .join("");

  const selectedClient = matches.length === 1 ? matches[0] : null;
  if (selectedClient && normalizeSearch(selectedClient.name) !== query) {
    search.value = selectedClient.name;
    search.setSelectionRange(rawQuery.length, selectedClient.name.length);
  }
  form.elements.clientId.value = selectedClient?.id || "";
  search.setCustomValidity(selectedClient ? "" : "Digite ao menos 4 caracteres do nome de um cliente.");
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function renderDashboard() {
  const activeOrders = db.orders.filter((order) => order.status !== "Entregue");
  document.querySelector("#open-count").textContent = `${activeOrders.length} OS abertas`;
  document.querySelector("#metric-active").textContent = activeOrders.length;
  document.querySelector("#metric-parts").textContent = db.orders.filter((order) => order.status === "Aguardando pecas").length;
  document.querySelector("#metric-ready").textContent = db.orders.filter((order) => order.status === "Pronto para entrega").length;
  document.querySelector("#metric-month").textContent = money.format(monthPaymentsTotal());

  document.querySelector("#status-board").innerHTML = statuses
    .filter((status) => status !== "Entregue")
    .map((status) => {
      const cards = db.orders.filter((order) => order.status === status).map(statusCard).join("");
      return `<div class="status-column"><h3>${status}</h3>${cards || emptyCompact()}</div>`;
    })
    .join("");

}

function renderClients() {
  const clients = filterItems(db.clients, (client) => [client.name, client.phone, client.document].join(" "));
  document.querySelector("#clients-total").textContent = `${db.clients.length} registros`;
  fillList("#clients-list", clients, clientItem);
}

function renderVehicles() {
  const vehicles = filterItems(db.vehicles, (vehicle) => [vehicle.plate, vehicle.vehicleName, vehicle.color, clientName(vehicle.clientId)].join(" "));
  document.querySelector("#vehicles-total").textContent = `${db.vehicles.length} registros`;
  fillList("#vehicles-list", vehicles, vehicleItem);
}

function renderCatalog() {
  fillList("#services-list", db.services, (service) => catalogItem(service, "service"));
  fillList("#parts-list", db.parts, (part) => catalogItem(part, "part"));
}

function renderOrders() {
  const orders = filterItems(db.orders, (order) => [order.id, order.clientDocument, clientName(order.clientId), vehicleLabel(vehicleById(order.vehicleId)), order.status].join(" "));
  fillList("#orders-list", orders, orderRow);
}

function renderCashier() {
  const total = db.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  document.querySelector("#cashier-total").textContent = money.format(total);
  fillList("#payments-list", db.payments.slice().reverse(), paymentItem);
  renderCashClosing();
}

function openCashClosing() {
  const form = document.querySelector("#cost-form");
  if (!form.elements.date.value) form.elements.date.value = isoToDateInput(todayOffset(0));
  renderCashClosing();
  document.querySelector("#cash-closing-dialog").showModal();
}

function renderCashClosing() {
  const period = document.querySelector("#cash-closing-period").value;
  const range = cashClosingRange(period);
  const payments = db.payments.filter((payment) => payment.date >= range.start && payment.date <= range.end);
  const expenses = db.expenses
    .filter((expense) => expense.date >= range.start && expense.date <= range.end)
    .slice()
    .sort((first, second) => second.date.localeCompare(first.date));
  const received = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const otherCost = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const partUsage = partsUsedInPeriod(range.start, range.end);
  const partsCost = partUsage.reduce((sum, usage) => sum + usage.totalCost, 0);
  const totalCost = otherCost + partsCost;

  document.querySelector("#cash-closing-range").textContent = range.start === range.end
    ? formatDate(range.start)
    : `${formatDate(range.start)} ate ${formatDate(range.end)}`;
  document.querySelector("#closing-received").textContent = money.format(received);
  document.querySelector("#closing-parts-cost").textContent = money.format(partsCost);
  document.querySelector("#closing-other-cost").textContent = money.format(otherCost);
  document.querySelector("#closing-cost").textContent = money.format(totalCost);
  document.querySelector("#closing-profit").textContent = money.format(received - totalCost);
  fillList("#closing-parts-list", partUsage, closingPartItem);
  fillList("#closing-costs-list", expenses, expenseItem);
}

function partsUsedInPeriod(startDate, endDate) {
  const usageByPart = new Map();
  db.orders
    .filter((order) => order.entryDate >= startDate && order.entryDate <= endDate)
    .forEach((order) => {
      (order.partIds || []).forEach((partId) => {
        const part = db.parts.find((item) => item.id === partId);
        const quantity = Number(order.partQuantities?.[partId] || 1);
        const unitCost = Number(order.partCosts?.[partId] ?? part?.cost ?? 0);
        const usage = usageByPart.get(partId) || {
          id: partId,
          name: part?.name || "Peca removida do cadastro",
          quantity: 0,
          unitCost,
          totalCost: 0
        };
        usage.quantity += quantity;
        usage.totalCost += unitCost * quantity;
        usageByPart.set(partId, usage);
      });
    });
  return [...usageByPart.values()];
}

function cashClosingRange(period, referenceDate = new Date()) {
  const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const endDate = new Date(startDate);

  if (period === "week") {
    startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
    endDate.setTime(startDate.getTime());
    endDate.setDate(endDate.getDate() + 6);
  } else if (period === "month") {
    startDate.setDate(1);
    endDate.setMonth(endDate.getMonth() + 1, 0);
  }

  return { start: localDateToIso(startDate), end: localDateToIso(endDate) };
}

function renderHistoryFilter() {
  const select = document.querySelector("#history-filter");
  const current = select.value;
  select.innerHTML = `<option value="">Todos os veiculos</option>` + db.vehicles
    .map((vehicle) => `<option value="${vehicle.id}">${escapeHtml(vehicleLabel(vehicle))}</option>`)
    .join("");
  select.value = current;
}

function renderHistory() {
  fillList("#history-list", getHistoryEvents(), historyItem);
}

function getHistoryEvents() {
  const vehicleId = document.querySelector("#history-filter").value;
  return db.orders
    .filter((order) => !vehicleId || order.vehicleId === vehicleId)
    .flatMap((order) => order.events.map((event) => ({ ...event, order })))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

async function downloadHistoryPdf() {
  if (!(await loadJsPdf())) {
    window.print();
    return;
  }

  const { jsPDF } = window.jspdf;
  const documentPdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const pageWidth = documentPdf.internal.pageSize.getWidth();
  const pageHeight = documentPdf.internal.pageSize.getHeight();
  const lineWidth = pageWidth - margin * 2;
  let y = 18;
  const ensureSpace = (height) => {
    if (y + height <= pageHeight - margin) return;
    documentPdf.addPage();
    y = margin;
  };
  const sectionTitle = (title) => {
    ensureSpace(12);
    documentPdf.setFont("helvetica", "bold");
    documentPdf.setFontSize(13);
    documentPdf.text(title, margin, y);
    y += 8;
  };

  documentPdf.setProperties({ title: "Historico da oficina" });
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(16);
  documentPdf.text("Historico da oficina", margin, y);
  y += 8;
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(10);
  const selectedVehicle = document.querySelector("#history-filter").value;
  const filterLabel = selectedVehicle ? vehicleLabel(vehicleById(selectedVehicle)) : "Todos os veiculos";
  documentPdf.text(`Filtro: ${filterLabel}`, margin, y);
  y += 6;
  documentPdf.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
  y += 10;

  sectionTitle("Lista do historico");
  const events = getHistoryEvents();
  if (!events.length) {
    documentPdf.text("Nenhum evento no historico.", margin, y);
    y += 8;
  }
  events.forEach((event, index) => {
    const order = event.order;
    const lines = [
      `${index + 1}. ${event.title} - ${order.id.toUpperCase()}`,
      `Cliente: ${clientName(order.clientId)} | Veiculo: ${vehicleLabel(vehicleById(order.vehicleId))}`,
      `Detalhe: ${event.detail}`,
      `Data: ${new Date(event.at).toLocaleString("pt-BR")}`
    ].flatMap((text) => documentPdf.splitTextToSize(text, lineWidth));
    const blockHeight = lines.length * 5 + 5;
    ensureSpace(blockHeight);
    documentPdf.setFont("helvetica", "bold");
    documentPdf.text(lines[0], margin, y);
    documentPdf.setFont("helvetica", "normal");
    documentPdf.text(lines.slice(1), margin, y + 5);
    y += blockHeight;
  });

  const received = db.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const otherCost = db.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const partUsage = partsUsedInPeriod("0000-01-01", "9999-12-31");
  const partsCost = partUsage.reduce((sum, usage) => sum + usage.totalCost, 0);
  const totalCost = otherCost + partsCost;
  const financialRows = [
    ["Valor recebido", received],
    ["Custo das pecas usadas", partsCost],
    ["Outros custos", otherCost],
    ["Custo total", totalCost],
    ["Lucro", received - totalCost]
  ];

  y += 4;
  sectionTitle("Lucro e custos");
  documentPdf.setFontSize(10);
  financialRows.forEach(([label, value]) => {
    ensureSpace(7);
    documentPdf.setFont("helvetica", label === "Lucro" ? "bold" : "normal");
    documentPdf.text(label, margin, y);
    documentPdf.text(money.format(value), pageWidth - margin, y, { align: "right" });
    y += 7;
  });

  if (partUsage.length) {
    y += 3;
    sectionTitle("Pecas usadas");
    partUsage.forEach((usage) => {
      const text = `${usage.name} x ${usage.quantity} - ${money.format(usage.totalCost)}`;
      const lines = documentPdf.splitTextToSize(text, lineWidth);
      ensureSpace(lines.length * 5 + 2);
      documentPdf.setFont("helvetica", "normal");
      documentPdf.text(lines, margin, y);
      y += lines.length * 5 + 2;
    });
  }

  documentPdf.save(`historico-oficina-${todayOffset(0)}.pdf`);
}

function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => resolve(Boolean(window.jspdf?.jsPDF));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function fillList(selector, items, renderer) {
  const element = document.querySelector(selector);
  element.innerHTML = items.length ? items.map(renderer).join("") : emptyState();
}

function filterItems(items, textBuilder) {
  if (!searchTerm) return items;
  return items.filter((item) => textBuilder(item).toLowerCase().includes(searchTerm));
}

function clientItem(client) {
  return `
    <article class="item" data-record-type="client" data-record-id="${client.id}">
      <div class="item-main">
        <div>
          <div class="item-title">${escapeHtml(client.name)}</div>
          <div class="item-meta">${escapeHtml(client.phone)} | ${escapeHtml(client.document || "sem documento")}</div>
        </div>
        <div class="item-actions">
          <button class="ghost" onclick="editClient('${client.id}')">Editar</button>
          <button class="danger" onclick="removeClient('${client.id}')">Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function vehicleItem(vehicle) {
  return `
    <article class="item" data-record-type="vehicle" data-record-id="${vehicle.id}">
      <div class="item-main">
        <div>
          <div class="item-title">${escapeHtml(vehicle.vehicleName)} | Placa ${escapeHtml(vehicle.plate)}</div>
          <div class="item-meta">${escapeHtml(clientName(vehicle.clientId))} | Cor ${escapeHtml(vehicle.color || "nao informada")} | ${escapeHtml(vehicle.year || "ano nao informado")}</div>
        </div>
        <div class="item-actions">
          <button class="ghost" onclick="editVehicle('${vehicle.id}')">Editar</button>
          <button class="danger" onclick="removeVehicle('${vehicle.id}')">Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function catalogItem(item, type) {
  const meta = type === "part" ? `${money.format(item.price)} | estoque ${item.stock}` : money.format(item.price);
  return `
    <article class="item" data-record-type="${type}" data-record-id="${item.id}">
      <div class="item-main">
        <div>
          <div class="item-title">${escapeHtml(item.name)}</div>
          <div class="item-meta">${meta}</div>
        </div>
        <button class="danger" onclick="removeCatalogItem('${type}', '${item.id}')">Excluir</button>
      </div>
    </article>
  `;
}

function orderRow(order) {
  const paid = paidTotal(order.id);
  return `
    <article class="table-row" data-record-type="order" data-record-id="${order.id}">
      <div>
        <div class="item-title">${order.id.toUpperCase()} | ${escapeHtml(vehicleLabel(vehicleById(order.vehicleId)))}</div>
        <div class="table-meta">${escapeHtml(clientName(order.clientId))} | entrada ${formatDate(order.entryDate)} | previsao ${formatDate(order.dueDate)}</div>
      </div>
      <span class="badge ${order.status === "Pronto para entrega" ? "done" : ""}">${order.status}</span>
      <div>
        <strong>${money.format(orderTotal(order))}</strong>
        <div class="table-meta">Pago: ${money.format(paid)} | Falta: ${money.format(Math.max(0, orderTotal(order) - paid))}</div>
      </div>
      <div class="item-actions">
        <button class="ghost" onclick="openOrderDialog('${order.id}')">Abrir</button>
        <button class="ghost" onclick="advanceOrder('${order.id}')">Avancar</button>
        <button class="danger" onclick="removeOrder('${order.id}')">Excluir</button>
      </div>
    </article>
  `;
}

function statusCard(order) {
  return `
    <article class="status-card" data-record-type="order" data-record-id="${order.id}">
      <strong>${order.id.toUpperCase()}</strong>
      <div class="item-meta">${escapeHtml(vehicleLabel(vehicleById(order.vehicleId)))}</div>
      <div class="item-meta">${escapeHtml(clientName(order.clientId))}</div>
      <div class="item-meta">Previsao: ${formatDate(order.dueDate)}</div>
    </article>
  `;
}

function deliveryItem(order) {
  return `
    <article class="item" data-record-type="order" data-record-id="${order.id}">
      <div class="item-main">
        <div>
          <div class="item-title">${escapeHtml(vehicleLabel(vehicleById(order.vehicleId)))}</div>
          <div class="item-meta">${order.id.toUpperCase()} | ${escapeHtml(order.status)}</div>
        </div>
        <span class="badge warn">${formatDate(order.dueDate)}</span>
      </div>
    </article>
  `;
}

function paymentItem(payment) {
  const order = orderById(payment.orderId);
  const method = paymentMethodLabel(payment);
  const installmentLabel = payment.installments ? ` - ${payment.installments}x` : "";
  return `
    <article class="item" data-record-type="payment" data-record-id="${payment.id}">
      <div class="item-main">
        <div>
          <div class="item-title">${money.format(payment.amount)} - ${escapeHtml(method)}${installmentLabel}</div>
          <div class="item-meta">${escapeHtml(payment.orderId.toUpperCase())} | ${escapeHtml(order ? clientName(order.clientId) : "OS removida")} | ${formatDate(payment.date)}</div>
        </div>
      </div>
    </article>
  `;
}

function expenseItem(expense) {
  return `
    <article class="item">
      <div class="item-main">
        <div>
          <div class="item-title">${escapeHtml(expense.description)}</div>
          <div class="item-meta">${formatDate(expense.date)}</div>
        </div>
        <div class="item-actions">
          <strong>${money.format(expense.amount)}</strong>
          <button class="danger" onclick="removeExpense('${expense.id}')">Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function closingPartItem(usage) {
  return `
    <article class="item">
      <div class="item-main">
        <div>
          <div class="item-title">${escapeHtml(usage.name)} x ${usage.quantity}</div>
          <div class="item-meta">Custo unitario ${money.format(usage.unitCost)}</div>
        </div>
        <strong>${money.format(usage.totalCost)}</strong>
      </div>
    </article>
  `;
}

function paymentMethodLabel(payment) {
  if (payment.method === "Cartao de credito") {
    return payment.installments ? "Cartao de credito parcelado" : "Cartao de credito a vista";
  }
  if (payment.method === "Cartao de debito") return "Cartao de debito a vista";
  return payment.method;
}

function historyItem(event) {
  return `
    <article class="timeline-item" data-record-type="order" data-record-id="${event.order.id}">
      <div class="item-title">${escapeHtml(event.title)} - ${event.order.id.toUpperCase()}</div>
      <div class="item-meta">${escapeHtml(vehicleLabel(vehicleById(event.order.vehicleId)))} | ${escapeHtml(clientName(event.order.clientId))}</div>
      <p>${escapeHtml(event.detail)}</p>
      <div class="item-meta">${new Date(event.at).toLocaleString("pt-BR")}</div>
    </article>
  `;
}

function emptyState() {
  return document.querySelector("#empty-template").innerHTML;
}

function emptyCompact() {
  return `<div class="item-meta">Sem OS neste status.</div>`;
}

function openOrderDialog(orderId = "") {
  renderOrderPickers();
  const form = document.querySelector("#order-form");
  form.reset();
  orderDraftItems = {
    serviceIds: [],
    partIds: [],
    partQuantities: {},
    servicePrices: {},
    partPrices: {},
    partCosts: {},
    laborAmount: 0
  };
  document.querySelector("#order-labor-amount").value = "";
  form.elements.id.value = "";
  form.elements.entryDate.value = isoToDateInput(todayOffset(0));
  form.elements.status.value = "Entrada";
  renderOrderVehicleSelect();
  updateClientSummary();

  if (orderId) {
    const order = orderById(orderId);
    Object.entries(order).forEach(([key, value]) => {
      if (form.elements[key] && !Array.isArray(value)) form.elements[key].value = value;
    });
    form.elements.clientDocument.value = order.clientDocument || documentByClient(order.clientId);
    form.elements.entryDate.value = isoToDateInput(order.entryDate);
    form.elements.dueDate.value = isoToDateInput(order.dueDate);
    renderOrderVehicleSelect(order.vehicleId);
    updateClientSummary(order.clientId);
    orderDraftItems = {
      serviceIds: [],
      partIds: [...(order.partIds || [])],
      partQuantities: { ...(order.partQuantities || {}) },
      servicePrices: {},
      partPrices: { ...(order.partPrices || {}) },
      partCosts: { ...(order.partCosts || {}) },
      laborAmount: Number(order.laborAmount || 0)
    };
    document.querySelector("#order-labor-amount").value = currencyInputValue(orderDraftItems.laborAmount);
  }

  renderSelectedOrderItems();
  updateOrderTotalPreview();
  document.querySelector("#order-dialog").showModal();
}

function renderOrderPickers() {
  document.querySelector("#order-part-search").value = "";
  document.querySelector("#order-part-id").value = "";
  document.querySelector("#order-part-unit-price").value = "";
  document.querySelector("#order-part-options").replaceChildren();
  document.querySelector("#order-part-options").hidden = true;
  document.querySelector("#order-part-price").value = "";
}

function openProductDialog() {
  const form = document.querySelector("#product-form");
  form.reset();
  document.querySelector("#product-dialog").showModal();
  form.elements.name.focus();
}

function saveProductFromOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  const cost = parseCurrency(values.cost);
  if (cost <= 0) {
    form.elements.cost.setCustomValidity("Informe o valor de custo.");
    form.elements.cost.reportValidity();
    return;
  }
  form.elements.cost.setCustomValidity("");

  rememberUndo();
  const part = {
    id: uid("prt"),
    name: values.name.trim(),
    price: cost,
    cost,
    stock: 0
  };
  db.parts.push(part);
  saveData();
  renderCatalog();
  renderOrderPickers();
  document.querySelector("#order-part-search").value = part.name;
  document.querySelector("#order-part-id").value = part.id;
  fillOrderPartPrice();
  form.reset();
  document.querySelector("#product-dialog").close();
}

function updateOrderPartSearch() {
  const search = document.querySelector("#order-part-search");
  const options = document.querySelector("#order-part-options");
  const query = normalizeSearch(search.value.trim());
  const matches = query.length >= 4
    ? db.parts.filter((part) => normalizeSearch(part.name).includes(query))
    : [];
  options.innerHTML = matches
    .map((part) => `
      <button type="button" class="part-option" onclick="selectOrderPart('${part.id}')">
        <span>${escapeHtml(part.name)}</span>
        <strong>${money.format(part.price)}</strong>
      </button>
    `)
    .join("");
  options.hidden = !matches.length;

  const selectedPart = matches.find((part) => normalizeSearch(part.name) === query);
  document.querySelector("#order-part-id").value = selectedPart?.id || "";
  fillOrderPartPrice();
}

function selectOrderPart(id) {
  const part = db.parts.find((item) => item.id === id);
  if (!part) return;
  document.querySelector("#order-part-search").value = part.name;
  document.querySelector("#order-part-id").value = part.id;
  document.querySelector("#order-part-options").hidden = true;
  fillOrderPartPrice();
}

function fillOrderPartPrice() {
  const partId = document.querySelector("#order-part-id").value;
  const unitInput = document.querySelector("#order-part-unit-price");
  const input = document.querySelector("#order-part-price");
  unitInput.value = partId ? currencyInputValue(partPrice(partId)) : "";
  input.value = partId ? currencyInputValue(orderDraftTotal()) : "";
  updateOrderTotalPreview();
}

function addOrderItem(type) {
  const search = document.querySelector("#order-part-search");
  const partIdInput = document.querySelector("#order-part-id");
  const unitPriceInput = document.querySelector("#order-part-unit-price");
  const priceInput = document.querySelector("#order-part-price");
  const id = partIdInput.value;
  if (!id) return;
  const price = parseCurrency(unitPriceInput.value);
  if (price <= 0) {
    priceInput.setCustomValidity("Informe o valor.");
    priceInput.reportValidity();
    return;
  }
  priceInput.setCustomValidity("");
  if (!orderDraftItems.partIds.includes(id)) orderDraftItems.partIds.push(id);
  orderDraftItems.partQuantities[id] = Number(orderDraftItems.partQuantities[id] || 0) + 1;
  orderDraftItems.partPrices[id] = price;
  orderDraftItems.partCosts[id] = partCost(id);
  search.value = "";
  partIdInput.value = "";
  unitPriceInput.value = "";
  priceInput.value = "";
  document.querySelector("#order-part-options").replaceChildren();
  document.querySelector("#order-part-options").hidden = true;
  renderSelectedOrderItems();
  updateOrderTotalPreview();
}

function removeOrderItem(type, id) {
  const key = type === "service" ? "serviceIds" : "partIds";
  orderDraftItems[key] = orderDraftItems[key].filter((itemId) => itemId !== id);
  if (type === "part") {
    delete orderDraftItems.partQuantities[id];
    delete orderDraftItems.partPrices[id];
    delete orderDraftItems.partCosts[id];
  } else {
    delete orderDraftItems.servicePrices[id];
  }
  renderSelectedOrderItems();
  updateOrderTotalPreview();
}

function renderSelectedOrderItems() {
  renderSelectedGroup("#order-parts", orderDraftItems.partIds, db.parts, "part");
}

function renderSelectedGroup(selector, ids, catalog, type) {
  const element = document.querySelector(selector);
  element.hidden = !ids.length;
  if (!ids.length) {
    element.innerHTML = "";
    return;
  }
  element.innerHTML = ids.map((id) => {
    const item = catalog.find((catalogItem) => catalogItem.id === id);
    const name = item?.name || "Item removido do cadastro";
    const quantity = type === "part" ? Number(orderDraftItems.partQuantities[id] || 1) : 1;
    const unitPrice = type === "service"
      ? Number(orderDraftItems.servicePrices[id] ?? servicePrice(id))
      : Number(orderDraftItems.partPrices[id] ?? partPrice(id));
    const itemPrice = unitPrice * quantity;
    const itemName = type === "part" ? `${name} x ${quantity}` : name;
    return `
      <div class="selected-item">
        <span>${escapeHtml(itemName)}</span>
        <strong>${money.format(itemPrice)}</strong>
        <button class="ghost icon" type="button" onclick="removeOrderItem('${type}', '${id}')" aria-label="Remover">x</button>
      </div>
    `;
  }).join("");
}

function updateOrderTotalPreview() {
  const total = orderDraftTotal();
  document.querySelector("#order-total-preview").textContent = money.format(total);
  const partId = document.querySelector("#order-part-id").value;
  if (partId) document.querySelector("#order-part-price").value = currencyInputValue(total);
}

function printOrderDraft() {
  const form = document.querySelector("#order-form");
  const values = formValues(form);
  const client = db.clients.find((item) => item.id === values.clientId);
  const vehicle = vehicleById(values.vehicleId);
  const total = orderDraftTotal();
  const laborAmount = parseCurrency(document.querySelector("#order-labor-amount").value);
  const serviceLines = laborAmount > 0 ? "<li>Mao de obra</li>" : "";
  const partLines = orderDraftItems.partIds.map((id) => {
    const part = db.parts.find((item) => item.id === id);
    const quantity = Number(orderDraftItems.partQuantities[id] || 1);
    return `<li>${escapeHtml(part?.name || "Peca removida do cadastro")} x ${quantity}</li>`;
  }).join("");

  const sheet = document.querySelector("#order-print-sheet");
  sheet.innerHTML = `
    <div class="print-head">
      <div>
        <strong>Oficina Pro</strong>
        <span>Ordem de servico</span>
      </div>
      <div>${escapeHtml(values.id ? values.id.toUpperCase() : "Nova OS")}</div>
    </div>
    <div class="print-grid">
      <div><strong>Cliente</strong><span>${escapeHtml(client?.name || "")}</span></div>
      <div><strong>Documento</strong><span>${escapeHtml(values.clientDocument || client?.document || "")}</span></div>
      <div><strong>Veiculo</strong><span>${escapeHtml(vehicle ? vehicleLabel(vehicle) : "")}</span></div>
      <div><strong>Status</strong><span>${escapeHtml(values.status || "")}</span></div>
      <div><strong>Entrada</strong><span>${escapeHtml(values.entryDate || "")}</span></div>
      <div><strong>Previsao</strong><span>${escapeHtml(values.dueDate || "")}</span></div>
    </div>
    <section>
      <strong>Descricao do problema</strong>
      <p>${escapeHtml(values.complaint || "")}</p>
    </section>
    <section>
      <strong>Diagnostico</strong>
      <p>${escapeHtml(values.diagnosis || "")}</p>
    </section>
    <section>
      <strong>Observacao</strong>
      <p>${escapeHtml(values.observation || "")}</p>
    </section>
    <div class="print-columns">
      <section>
        <strong>Mao de obra</strong>
        <ul>${serviceLines || "<li>Nenhum item adicionado.</li>"}</ul>
      </section>
      <section>
        <strong>Pecas</strong>
        <ul>${partLines || "<li>Nenhum item adicionado.</li>"}</ul>
      </section>
    </div>
    <div class="print-total">
      <span>Valor total</span>
      <strong>${money.format(total)}</strong>
    </div>
  `;
  document.body.classList.add("printing-order");
  window.addEventListener("afterprint", clearOrderPrintSheet, { once: true });
  window.print();
}

function clearOrderPrintSheet() {
  document.body.classList.remove("printing-order");
  document.querySelector("#order-print-sheet").innerHTML = "";
}

function orderDraftTotal() {
  const pendingPartId = document.querySelector("#order-part-id").value;
  const pendingPartPrice = pendingPartId && !orderDraftItems.partIds.includes(pendingPartId)
    ? parseCurrency(document.querySelector("#order-part-unit-price").value)
    : 0;
  return parseCurrency(document.querySelector("#order-labor-amount").value)
    + orderDraftItems.partIds.reduce((sum, id) => sum + Number(orderDraftItems.partPrices[id] ?? partPrice(id)) * Number(orderDraftItems.partQuantities[id] || 1), 0)
    + pendingPartPrice;
}

function handleDocumentLookup(event) {
  const documentValue = cleanDocument(event.target.value);
  const client = db.clients.find((item) => cleanDocument(item.document) === documentValue);
  if (!client) {
    const form = document.querySelector("#order-form");
    form.elements.clientId.value = "";
    renderOrderVehicleSelect();
    updateClientSummary();
    return;
  }
  const form = document.querySelector("#order-form");
  form.elements.clientId.value = client.id;
  if (!form.elements.entryDate.value) form.elements.entryDate.value = isoToDateInput(todayOffset(0));
  renderOrderVehicleSelect();
  updateClientSummary(client.id);
}

function handleOrderClientChange(event) {
  const clientId = event.target.value;
  const form = document.querySelector("#order-form");
  form.elements.clientDocument.value = documentByClient(clientId);
  if (!form.elements.entryDate.value) form.elements.entryDate.value = isoToDateInput(todayOffset(0));
  renderOrderVehicleSelect();
  updateClientSummary(clientId);
}

function maskDateInput(event) {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  event.target.value = parts.join("/");
}

function updateClientSummary(clientId = "") {
  const form = document.querySelector("#order-form");
  const client = db.clients.find((item) => item.id === (clientId || form.elements.clientId.value));
  const summary = document.querySelector("#order-client-summary");
  if (!client) {
    summary.classList.remove("visible");
    summary.innerHTML = "";
    return;
  }
  const vehicles = db.vehicles.filter((vehicle) => vehicle.clientId === client.id);
  summary.classList.add("visible");
  summary.innerHTML = `
    <strong>${escapeHtml(client.name)}</strong>
    <span>Documento: ${escapeHtml(client.document || "nao informado")} | Telefone: ${escapeHtml(client.phone || "nao informado")}</span><br>
    <span>Email: ${escapeHtml(client.email || "nao informado")} | Endereco: ${escapeHtml(client.address || "nao informado")}</span><br>
    <span>Veiculos: ${escapeHtml(vehicles.map(vehicleLabel).join("; ") || "nenhum veiculo cadastrado")}</span>
  `;
}

function editClient(id) {
  fillForm("#client-form", db.clients.find((client) => client.id === id));
  showView("clients");
}

function editVehicle(id) {
  fillForm("#vehicle-form", db.vehicles.find((vehicle) => vehicle.id === id));
  showView("vehicles");
}

function fillForm(selector, values) {
  const form = document.querySelector(selector);
  Object.entries(values).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  if (selector === "#vehicle-form") {
    const clientSearch = form.elements.clientSearch;
    const client = db.clients.find((item) => item.id === values.clientId);
    clientSearch.value = client ? client.name : "";
    clientSearch.setCustomValidity(client ? "" : "Digite ao menos 4 caracteres do nome de um cliente.");
  }
}

function removeClient(id) {
  if (db.vehicles.some((vehicle) => vehicle.clientId === id) || db.orders.some((order) => order.clientId === id)) {
    alert("Este cliente possui veiculo ou OS vinculada.");
    return;
  }
  rememberUndo();
  db.clients = db.clients.filter((client) => client.id !== id);
  persistAndRender();
}

function removeVehicle(id) {
  if (db.orders.some((order) => order.vehicleId === id)) {
    alert("Este veiculo possui OS vinculada.");
    return;
  }
  rememberUndo();
  db.vehicles = db.vehicles.filter((vehicle) => vehicle.id !== id);
  persistAndRender();
}

function removeCatalogItem(type, id) {
  rememberUndo();
  if (type === "service") db.services = db.services.filter((service) => service.id !== id);
  if (type === "part") db.parts = db.parts.filter((part) => part.id !== id);
  persistAndRender();
}

function removeExpense(id) {
  rememberUndo();
  db.expenses = db.expenses.filter((expense) => expense.id !== id);
  persistAndRender();
}

function removeOrder(id) {
  rememberUndo();
  db.orders = db.orders.filter((order) => order.id !== id);
  db.payments = db.payments.filter((payment) => payment.orderId !== id);
  persistAndRender();
}

function advanceOrder(id) {
  const order = orderById(id);
  const index = statuses.indexOf(order.status);
  if (index < statuses.length - 1) {
    rememberUndo();
    order.status = statuses[index + 1];
    order.events.push(timelineEvent(order.status, `Status alterado para ${order.status}.`));
    persistAndRender();
  }
}

function addOrderEvent(orderId, title, detail) {
  const order = orderById(orderId);
  if (order) order.events.push(timelineEvent(title, detail));
}

function monthPaymentsTotal() {
  const now = new Date();
  return db.payments.reduce((sum, payment) => {
    const date = new Date(`${payment.date}T00:00:00`);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
      ? sum + Number(payment.amount)
      : sum;
  }, 0);
}

function orderTotal(order) {
  return Number(order.laborAmount || 0)
    + order.partIds.reduce((sum, id) => sum + Number(order.partPrices?.[id] ?? partPrice(id)) * Number(order.partQuantities?.[id] || 1), 0);
}

function balanceDue(order) {
  return orderTotal(order) - paidTotal(order.id);
}

function paidTotal(orderId) {
  return db.payments
    .filter((payment) => payment.orderId === orderId)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
}

function servicePrice(id) {
  return Number(db.services.find((service) => service.id === id)?.price || 0);
}

function partPrice(id) {
  return Number(db.parts.find((part) => part.id === id)?.price || 0);
}

function partCost(id) {
  return Number(db.parts.find((part) => part.id === id)?.cost || 0);
}

function currencyInputValue(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function clientName(id) {
  return db.clients.find((client) => client.id === id)?.name || "Cliente removido";
}

function documentByClient(id) {
  return db.clients.find((client) => client.id === id)?.document || "";
}

function cleanDocument(value) {
  return String(value || "").replace(/\D/g, "");
}

function clientLabel(client) {
  return `${client.name} - ${client.phone}`;
}

function vehicleById(id) {
  return db.vehicles.find((vehicle) => vehicle.id === id);
}

function orderById(id) {
  return db.orders.find((order) => order.id === id);
}

function vehicleLabel(vehicle) {
  if (!vehicle) return "Veiculo removido";
  return `${vehicle.vehicleName} - ${vehicle.plate}${vehicle.color ? ` - ${vehicle.color}` : ""}`;
}

function orderLabel(order) {
  return `${order.id.toUpperCase()} - ${vehicleLabel(vehicleById(order.vehicleId))} - falta ${money.format(balanceDue(order))}`;
}

function formatDate(value) {
  if (!value) return "sem data";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function localDateToIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoToDateInput(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function dateInputToIso(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return value;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.editClient = editClient;
window.editVehicle = editVehicle;
window.removeClient = removeClient;
window.removeVehicle = removeVehicle;
window.removeCatalogItem = removeCatalogItem;
window.openOrderDialog = openOrderDialog;
window.advanceOrder = advanceOrder;
window.removeOrder = removeOrder;
window.removeOrderItem = removeOrderItem;
