// ============================================================
//  PAINEL ADMIN - Mailton Maia
// ============================================================
let dataSelecionadaAdmin = null;
let agendamentosCache = [];
let servicosAdmin = [];
let expedienteEstado = null; // { intervalo: 30, dias: { '0': [], '1': [{inicio, fim}], ... } }

const NOMES_DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // a semana começa na segunda

// ------------------------------------------------------------
//  AUTENTICAÇÃO E CHAMADAS À API
// ------------------------------------------------------------

// Monta os headers de autenticação para as rotas /api/admin/*
function getAuthHeaders(comContentType = false) {
    const token = localStorage.getItem('wn_admin_token');
    const headers = { 'Authorization': `Bearer ${token}` };
    if (comContentType) headers['Content-Type'] = 'application/json';
    return headers;
}

// Se a sessão expirou ou o token é inválido, o servidor responde 401.
// Nesse caso, forçamos o Mailton a fazer login de novo.
function verificarSessao(response) {
    if (response.status === 401) {
        alert('Sua sessão expirou. Faça login novamente.');
        localStorage.removeItem('wn_admin_token');
        location.reload();
        return false;
    }
    return true;
}

// Faz a chamada, trata sessão expirada e devolve { ok, status, dados } (ou null se a sessão caiu)
async function api(url, metodo = 'GET', corpo = null) {
    const opcoes = { method: metodo, headers: getAuthHeaders(corpo !== null) };
    if (corpo !== null) opcoes.body = JSON.stringify(corpo);
    const response = await fetch(url, opcoes);
    if (!verificarSessao(response)) return null;
    let dados = {};
    try { dados = await response.json(); } catch (e) { /* resposta sem corpo */ }
    return { ok: response.ok, status: response.status, dados };
}

// ------------------------------------------------------------
//  UTILITÁRIOS
// ------------------------------------------------------------

// Tudo que vem de clientes (nome, etc.) passa por aqui antes de entrar no HTML.
// Sem isso, um nome com código poderia rodar dentro do painel.
function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
}

function formatarMoeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarDuracao(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h && m) return `${h}h ${m} min`;
    if (h) return `${h}h`;
    return `${m} min`;
}

function horaParaMinutos(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

function minutosParaHora(minutos) {
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

function dataParaIso(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

// Número para o link do WhatsApp: só dígitos e com o 55 do Brasil quando faltar
function telefoneWhats(telefone) {
    const digitos = String(telefone || '').replace(/\D/g, '');
    return (digitos.length === 10 || digitos.length === 11) ? '55' + digitos : digitos;
}

// Aviso rápido no topo da tela (some sozinho)
function mostrarAviso(texto, tipo = 'ok') {
    let caixa = document.getElementById('caixaAvisos');
    if (!caixa) {
        caixa = document.createElement('div');
        caixa.id = 'caixaAvisos';
        caixa.className = 'fixed top-4 inset-x-0 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none';
        document.body.appendChild(caixa);
    }
    const aviso = document.createElement('div');
    aviso.className = 'pointer-events-auto max-w-sm w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ' +
        (tipo === 'erro' ? 'bg-red-500 text-white' : 'bg-green-500 text-black');
    aviso.textContent = texto;
    caixa.appendChild(aviso);
    setTimeout(() => aviso.remove(), tipo === 'erro' ? 5000 : 3000);
}

function abrirModal(id) { document.getElementById(id).classList.remove('hidden'); }
function fecharModal(id) { document.getElementById(id).classList.add('hidden'); }

// ------------------------------------------------------------
//  CARREGAMENTO DOS DADOS
// ------------------------------------------------------------

// Atualiza só o que muda com agendamentos (agenda, faturamento e meses)
async function carregarDashboard() {
    const resposta = await api('/api/admin/dashboard');
    if (!resposta) return;
    if (!resposta.ok) throw new Error('Falha ao carregar o painel');

    const dados = resposta.dados;
    document.getElementById('faturamentoAdmin').textContent = formatarMoeda(dados.receita_total);
    renderizarMesesAdmin(dados.meses);
    agendamentosCache = dados.agendamentos;
    inicializarAgenda();
}

// Carrega tudo: agenda, serviços e horários de atendimento (roda depois do login)
async function carregarDadosAdmin() {
    try {
        await carregarDashboard();

        const [servicos, expediente] = await Promise.all([
            api('/api/admin/servicos'),
            api('/api/admin/expediente')
        ]);
        if (servicos && servicos.ok) {
            servicosAdmin = servicos.dados;
            renderizarServicosAdmin();
        }
        if (expediente && expediente.ok) {
            expedienteEstado = expediente.dados;
            renderizarExpedienteAdmin();
        }
    } catch (erro) {
        console.error("Erro interno:", erro);
        alert("Erro ao sincronizar dados com o servidor.");
    }
}

// ------------------------------------------------------------
//  AGENDA
// ------------------------------------------------------------
function inicializarAgenda() {
    const carrossel = document.getElementById('carrosselDiasAdmin');
    carrossel.innerHTML = '';

    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const nomesMeses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const hoje = new Date();
    const mesesMostrados = [];

    // 30 dias a partir de hoje
    for (let i = 0; i < 30; i++) {
        const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
        const dataIso = dataParaIso(data);
        const nomeMes = nomesMeses[data.getMonth()];
        if (!mesesMostrados.includes(nomeMes)) mesesMostrados.push(nomeMes);

        const btn = document.createElement('button');
        btn.className = 'btn-dia-admin flex-none snap-start flex flex-col items-center justify-center p-3 rounded-xl min-w-[65px] border border-white/10 bg-surfaceHover text-gray-400 transition hover:border-brand-500';
        btn.dataset.data = dataIso;
        btn.innerHTML = `
            <span class="text-[10px] font-medium mb-1">${diasSemana[data.getDay()]}</span>
            <span class="text-lg font-bold">${String(data.getDate()).padStart(2, '0')}</span>
        `;
        btn.onclick = () => selecionarDiaAdmin(dataIso);
        carrossel.appendChild(btn);
    }

    const rotuloMes = document.getElementById('mesAtualAgenda');
    if (rotuloMes) rotuloMes.textContent = mesesMostrados.join(' / ');

    // Mantém o dia que estava aberto; se não houver, abre hoje
    const existe = dataSelecionadaAdmin && carrossel.querySelector(`[data-data="${dataSelecionadaAdmin}"]`);
    selecionarDiaAdmin(existe ? dataSelecionadaAdmin : dataParaIso(hoje));
}

function selecionarDiaAdmin(dataIso) {
    dataSelecionadaAdmin = dataIso;

    document.querySelectorAll('.btn-dia-admin').forEach(b => {
        const ativo = b.dataset.data === dataIso;
        b.classList.toggle('bg-brand-500', ativo);
        b.classList.toggle('text-black', ativo);
        b.classList.toggle('border-brand-500', ativo);
        b.classList.toggle('bg-surfaceHover', !ativo);
        b.classList.toggle('text-gray-400', !ativo);
        b.classList.toggle('border-white/10', !ativo);
    });

    renderizarAgendaDoDia();
}

const ESTILO_STATUS = {
    agendado: { classe: 'bg-green-500/20 text-green-400', texto: 'Agendado' },
    concluido: { classe: 'bg-sky-500/20 text-sky-400', texto: 'Concluído' },
    cancelado: { classe: 'bg-red-500/20 text-red-400', texto: 'Cancelado' }
};

function criarCardAgendamento(ag) {
    const estilo = ESTILO_STATUS[ag.status] || ESTILO_STATUS.agendado;
    const hora = ag.data_hora.split(' ')[1];
    const fimHora = minutosParaHora(horaParaMinutos(hora) + (ag.duracao_minutos || 0));
    const cancelado = ag.status === 'cancelado';

    // Botões de ação conforme a situação do agendamento
    let acoes = '';
    if (ag.status === 'agendado') {
        acoes = `
            <button onclick="mudarStatusAgendamento(${ag.id}, 'concluido')" class="flex-1 bg-green-500/15 text-green-400 border border-green-500/20 rounded-lg py-2 text-xs font-bold hover:bg-green-500/25 transition-colors"><i class="fa-solid fa-check mr-1"></i>Concluir</button>
            <button onclick="mudarStatusAgendamento(${ag.id}, 'cancelado')" class="flex-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg py-2 text-xs font-bold hover:bg-red-500/20 transition-colors"><i class="fa-solid fa-xmark mr-1"></i>Cancelar</button>`;
    } else if (ag.status === 'concluido') {
        acoes = `<button onclick="mudarStatusAgendamento(${ag.id}, 'agendado')" class="flex-1 bg-white/10 text-gray-300 rounded-lg py-2 text-xs font-bold hover:bg-white/20 transition-colors"><i class="fa-solid fa-rotate-left mr-1"></i>Desfazer</button>`;
    } else {
        acoes = `<button onclick="mudarStatusAgendamento(${ag.id}, 'agendado')" class="flex-1 bg-white/10 text-gray-300 rounded-lg py-2 text-xs font-bold hover:bg-white/20 transition-colors"><i class="fa-solid fa-rotate-left mr-1"></i>Reativar</button>`;
    }

    const card = document.createElement('div');
    card.className = 'bg-surfaceHover rounded-2xl p-4 border border-white/10' + (cancelado ? ' opacity-60' : '');
    card.innerHTML = `
        <div class="flex justify-between items-center gap-3">
            <div class="flex items-center gap-4 min-w-0">
                <div class="bg-black/30 w-12 h-12 rounded-xl flex flex-col items-center justify-center border border-white/5 text-brand-500 shrink-0">
                    <i class="fa-regular fa-clock text-xs mb-1"></i>
                    <span class="text-xs font-bold">${hora}</span>
                </div>
                <div class="min-w-0">
                    <h4 class="text-white font-bold text-sm truncate">${escaparHtml(ag.cliente)}</h4>
                    <p class="text-gray-400 text-[10px] mt-1 uppercase tracking-wider truncate">${escaparHtml(ag.servico)}</p>
                    <p class="text-gray-500 text-[10px] mt-0.5">${formatarDuracao(ag.duracao_minutos || 0)} • até ${fimHora}</p>
                </div>
            </div>
            <div class="text-right flex flex-col items-end shrink-0">
                <span class="px-2 py-1 mb-1 rounded-md text-[10px] font-bold uppercase ${estilo.classe}">${estilo.texto}</span>
                <p class="text-gray-300 font-semibold text-xs mt-1">${formatarMoeda(ag.valor)}</p>
            </div>
        </div>
        <div class="flex gap-2 mt-3 pt-3 border-t border-white/5">
            <a href="https://wa.me/${telefoneWhats(ag.telefone)}" target="_blank" rel="noopener" class="w-10 shrink-0 flex items-center justify-center bg-green-500/15 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/25 transition-colors" title="Chamar no WhatsApp">
                <i class="fa-brands fa-whatsapp text-base"></i>
            </a>
            ${acoes}
        </div>
    `;
    return card;
}

function renderizarAgendaDoDia() {
    const lista = document.getElementById('listaAgendamentosDia');
    lista.innerHTML = '';

    const doDia = agendamentosCache
        .filter(ag => ag.data_hora.startsWith(dataSelecionadaAdmin))
        .sort((a, b) => a.data_hora.localeCompare(b.data_hora));

    // O contador mostra só o que está valendo (não conta cancelados)
    document.getElementById('qtdAgendamentosDia').textContent = doDia.filter(ag => ag.status !== 'cancelado').length;

    if (doDia.length === 0) {
        lista.innerHTML = '<p class="text-xs text-gray-500 text-center py-8 bg-surfaceHover rounded-2xl border border-white/5 border-dashed">Nenhum agendamento para este dia.</p>';
        return;
    }
    doDia.forEach(ag => lista.appendChild(criarCardAgendamento(ag)));
}

async function mudarStatusAgendamento(id, novoStatus) {
    const ag = agendamentosCache.find(a => a.id === id);
    if (!ag) return;

    if (novoStatus === 'cancelado') {
        const hora = ag.data_hora.split(' ')[1];
        if (!confirm(`Cancelar o agendamento de ${ag.cliente} às ${hora}?\nO horário volta a ficar livre para novos clientes.`)) return;
    }

    try {
        const resposta = await api(`/api/admin/agendamentos/${id}/status`, 'POST', { status: novoStatus });
        if (!resposta) return;
        if (!resposta.ok) {
            mostrarAviso(resposta.dados.erro || 'Não foi possível alterar o agendamento.', 'erro');
            return;
        }
        mostrarAviso(resposta.dados.mensagem);
        await carregarDashboard();
    } catch (erro) {
        mostrarAviso('Erro de conexão com o servidor.', 'erro');
    }
}

// ------------------------------------------------------------
//  NOVO AGENDAMENTO (ENCAIXE)
// ------------------------------------------------------------
function abrirModalEncaixe() {
    const ativos = servicosAdmin.filter(s => s.ativo);
    if (ativos.length === 0) {
        mostrarAviso('Cadastre ao menos um serviço (aba Ajustes) antes de agendar.', 'erro');
        return;
    }

    document.getElementById('encServico').innerHTML = ativos
        .map(s => `<option value="${s.id}">${escaparHtml(s.nome)} • ${formatarDuracao(s.duracao_minutos)}</option>`)
        .join('');
    document.getElementById('encNome').value = '';
    document.getElementById('encTelefone').value = '';
    document.getElementById('encData').value = dataSelecionadaAdmin || dataParaIso(new Date());
    document.getElementById('encHora').value = '';
    document.getElementById('erroEncaixe').classList.add('hidden');
    abrirModal('modalEncaixe');
}

function fecharModalEncaixe() { fecharModal('modalEncaixe'); }

async function salvarEncaixe(forcar = false) {
    const erro = document.getElementById('erroEncaixe');
    erro.classList.add('hidden');

    const nome = document.getElementById('encNome').value.trim();
    const telefone = document.getElementById('encTelefone').value.trim();
    const servicoId = Number(document.getElementById('encServico').value);
    const data = document.getElementById('encData').value;
    const hora = document.getElementById('encHora').value;

    if (!nome || !telefone || !data || !hora) {
        erro.textContent = 'Preencha nome, WhatsApp, dia e horário.';
        erro.classList.remove('hidden');
        return;
    }

    const botao = document.getElementById('btnSalvarEncaixe');
    botao.disabled = true;
    try {
        const resposta = await api('/api/admin/agendar', 'POST', {
            nome_cliente: nome,
            telefone_cliente: telefone,
            servico_id: servicoId,
            data_hora: `${data} ${hora}`,
            forcar: forcar
        });
        if (!resposta) return;

        // O servidor avisa de algo (fora do expediente, bloqueado...): o Mailton decide se segue
        if (resposta.status === 409 && resposta.dados.pode_forcar) {
            botao.disabled = false;
            if (confirm(`${resposta.dados.erro}\n\nAgendar mesmo assim?`)) {
                await salvarEncaixe(true);
            }
            return;
        }
        if (!resposta.ok) {
            erro.textContent = resposta.dados.erro || 'Não foi possível agendar.';
            erro.classList.remove('hidden');
            return;
        }

        fecharModalEncaixe();
        mostrarAviso('Agendamento criado!');
        dataSelecionadaAdmin = data;
        await carregarDashboard();

        // Oferece avisar o cliente pelo WhatsApp, já com o link para cancelar
        const servico = servicosAdmin.find(s => s.id === servicoId);
        if (confirm(`Enviar a confirmação para ${nome} pelo WhatsApp?`)) {
            const dataBr = data.split('-').reverse().join('/');
            const link = `${window.location.origin}/cancelar/${resposta.dados.token_cancelamento}`;
            const texto = `Olá, ${nome}! Seu horário com o Mailton está confirmado:\n\n` +
                `✨ ${servico ? servico.nome : 'Atendimento'}\n📅 ${dataBr} às ${hora}\n\n` +
                `Se precisar cancelar, é só abrir este link:\n${link}`;
            window.open(`https://wa.me/${telefoneWhats(resposta.dados.telefone)}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
        }
    } catch (e) {
        erro.textContent = 'Erro de conexão com o servidor.';
        erro.classList.remove('hidden');
    } finally {
        botao.disabled = false;
    }
}

// ------------------------------------------------------------
//  CONFIGURAÇÕES: LIBERAÇÃO DE MESES
// ------------------------------------------------------------
function renderizarMesesAdmin(mesesNoBanco) {
    const container = document.getElementById('containerMesesAdmin');
    container.innerHTML = '';

    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const hoje = new Date();

    for (let i = 0; i < 3; i++) {
        let dataMes = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        let anoStr = dataMes.getFullYear();
        let mesStr = String(dataMes.getMonth() + 1).padStart(2, '0');
        let anoMes = `${anoStr}-${mesStr}`;

        let mesSalvo = mesesNoBanco.find(m => m.ano_mes === anoMes);
        let status = mesSalvo ? mesSalvo.status : 'fechado';
        let isAberto = status === 'aberto';

        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-3 mb-2 bg-black/20 rounded-xl border border-white/5 last:mb-0';
        div.innerHTML = `
            <div>
                <p class="text-white font-bold text-sm">${nomesMeses[dataMes.getMonth()]} ${anoStr}</p>
                <p class="text-[10px] uppercase ${isAberto ? 'text-brand-500' : 'text-gray-500'} font-bold tracking-wider mt-0.5">${isAberto ? 'Agenda Aberta' : 'Agenda Fechada'}</p>
            </div>
            <button onclick="alternarMesAdmin('${anoMes}', '${status}')" class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${isAberto ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-brand-500 text-black'}">
                ${isAberto ? 'Fechar' : 'Liberar'}
            </button>
        `;
        container.appendChild(div);
    }
}

async function alternarMesAdmin(anoMes, statusAtual) {
    const novoStatus = statusAtual === 'aberto' ? 'fechado' : 'aberto';
    try {
        const resposta = await api('/api/admin/mes', 'POST', { ano_mes: anoMes, status: novoStatus });
        if (!resposta) return;
        if (!resposta.ok) {
            mostrarAviso(resposta.dados.erro || 'Erro ao alterar o mês.', 'erro');
            return;
        }
        await carregarDashboard();
    } catch (erro) {
        mostrarAviso('Erro ao alterar o mês.', 'erro');
    }
}

// ------------------------------------------------------------
//  CONFIGURAÇÕES: MEUS SERVIÇOS
// ------------------------------------------------------------
function renderizarServicosAdmin() {
    const container = document.getElementById('containerServicosAdmin');
    if (servicosAdmin.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Nenhum serviço ainda. Toque em "Adicionar".</p>';
        return;
    }

    container.innerHTML = servicosAdmin.map(s => `
        <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/20 border border-white/5 ${s.ativo ? '' : 'opacity-60'}">
            <div class="min-w-0">
                <p class="text-white font-bold text-sm truncate">${escaparHtml(s.nome)}</p>
                <p class="text-[11px] text-gray-400 mt-0.5">${formatarDuracao(s.duracao_minutos)} • ${formatarMoeda(s.valor)}${s.ativo ? '' : ' • <span class="text-brand-500 font-bold">Oculto no site</span>'}</p>
            </div>
            <div class="flex gap-2 shrink-0">
                <button onclick="alternarServicoAtivo(${s.id})" class="w-9 h-9 rounded-lg bg-white/10 text-gray-300 hover:bg-white/20 transition-colors" title="${s.ativo ? 'Ocultar do site' : 'Mostrar no site'}" aria-label="${s.ativo ? 'Ocultar do site' : 'Mostrar no site'}">
                    <i class="fa-regular ${s.ativo ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </button>
                <button onclick="abrirModalServico(${s.id})" class="w-9 h-9 rounded-lg bg-brand-500/15 text-brand-500 hover:bg-brand-500/25 transition-colors" title="Editar" aria-label="Editar serviço">
                    <i class="fa-solid fa-pen"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function recarregarServicos() {
    const resposta = await api('/api/admin/servicos');
    if (resposta && resposta.ok) {
        servicosAdmin = resposta.dados;
        renderizarServicosAdmin();
    }
}

// Opções de duração de 15 em 15 minutos (inclui a atual, se for um valor diferente)
function preencherOpcoesDuracao(atual) {
    const valores = [];
    for (let m = 15; m <= 360; m += 15) valores.push(m);
    if (atual && !valores.includes(atual)) { valores.push(atual); valores.sort((a, b) => a - b); }
    const select = document.getElementById('servDuracao');
    select.innerHTML = valores.map(m => `<option value="${m}">${formatarDuracao(m)}</option>`).join('');
    select.value = String(atual || 60);
}

function abrirModalServico(id = null) {
    const servico = id ? servicosAdmin.find(s => s.id === id) : null;
    document.getElementById('servId').value = servico ? servico.id : '';
    document.getElementById('tituloModalServico').textContent = servico ? 'Editar serviço' : 'Novo serviço';
    document.getElementById('servNome').value = servico ? servico.nome : '';
    document.getElementById('servValor').value = servico ? String(servico.valor).replace('.', ',') : '';
    preencherOpcoesDuracao(servico ? servico.duracao_minutos : 60);
    document.getElementById('btnExcluirServico').classList.toggle('hidden', !servico);
    document.getElementById('erroServico').classList.add('hidden');
    abrirModal('modalServico');
}

function fecharModalServico() { fecharModal('modalServico'); }

async function salvarServico() {
    const erro = document.getElementById('erroServico');
    erro.classList.add('hidden');

    const id = document.getElementById('servId').value;
    const corpo = {
        nome: document.getElementById('servNome').value.trim(),
        duracao_minutos: Number(document.getElementById('servDuracao').value),
        valor: document.getElementById('servValor').value.trim()
    };
    if (!corpo.nome || corpo.valor === '') {
        erro.textContent = 'Preencha o nome e o valor do serviço.';
        erro.classList.remove('hidden');
        return;
    }

    const botao = document.getElementById('btnSalvarServico');
    botao.disabled = true;
    try {
        const resposta = id
            ? await api(`/api/admin/servicos/${id}`, 'PUT', corpo)
            : await api('/api/admin/servicos', 'POST', corpo);
        if (!resposta) return;
        if (!resposta.ok) {
            erro.textContent = resposta.dados.erro || 'Não foi possível salvar.';
            erro.classList.remove('hidden');
            return;
        }
        fecharModalServico();
        mostrarAviso(resposta.dados.mensagem);
        await recarregarServicos();
    } catch (e) {
        erro.textContent = 'Erro de conexão com o servidor.';
        erro.classList.remove('hidden');
    } finally {
        botao.disabled = false;
    }
}

async function alternarServicoAtivo(id) {
    const servico = servicosAdmin.find(s => s.id === id);
    if (!servico) return;
    try {
        const resposta = await api(`/api/admin/servicos/${id}`, 'PUT', { ativo: !servico.ativo });
        if (!resposta) return;
        if (!resposta.ok) {
            mostrarAviso(resposta.dados.erro || 'Não foi possível alterar.', 'erro');
            return;
        }
        mostrarAviso(servico.ativo ? 'Serviço ocultado do site.' : 'Serviço visível no site.');
        await recarregarServicos();
    } catch (e) {
        mostrarAviso('Erro de conexão com o servidor.', 'erro');
    }
}

async function excluirServico() {
    const id = document.getElementById('servId').value;
    const servico = servicosAdmin.find(s => s.id === Number(id));
    if (!servico) return;
    if (!confirm(`Excluir "${servico.nome}"?`)) return;
    try {
        const resposta = await api(`/api/admin/servicos/${id}`, 'DELETE');
        if (!resposta) return;
        if (!resposta.ok) {
            mostrarAviso(resposta.dados.erro || 'Não foi possível excluir.', 'erro');
            return;
        }
        fecharModalServico();
        mostrarAviso(resposta.dados.mensagem);
        await recarregarServicos();
    } catch (e) {
        mostrarAviso('Erro de conexão com o servidor.', 'erro');
    }
}

// ------------------------------------------------------------
//  CONFIGURAÇÕES: HORÁRIO DE ATENDIMENTO
// ------------------------------------------------------------
function renderizarExpedienteAdmin() {
    if (!expedienteEstado) return;
    document.getElementById('selIntervalo').value = String(expedienteEstado.intervalo);

    const campoHora = 'bg-[#09090b] border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-brand-500 min-w-0 flex-1';
    const container = document.getElementById('containerExpedienteAdmin');

    container.innerHTML = ORDEM_DIAS.map(dia => {
        const faixas = expedienteEstado.dias[String(dia)] || [];
        const atende = faixas.length > 0;

        const linhas = faixas.map((f, i) => `
            <div class="flex items-center gap-2 mt-3">
                <input type="time" step="300" value="${f.inicio}" onchange="editarFaixa(${dia}, ${i}, 'inicio', this.value)" class="${campoHora}" aria-label="Início">
                <span class="text-xs text-gray-500">às</span>
                <input type="time" step="300" value="${f.fim}" onchange="editarFaixa(${dia}, ${i}, 'fim', this.value)" class="${campoHora}" aria-label="Fim">
                <button onclick="removerFaixa(${dia}, ${i})" class="w-8 h-8 shrink-0 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" aria-label="Remover período"><i class="fa-solid fa-xmark text-xs"></i></button>
            </div>`).join('');

        return `
            <div class="p-3 rounded-xl bg-black/20 border border-white/5">
                <div class="flex items-center justify-between">
                    <p class="text-white font-bold text-sm">${NOMES_DIAS[dia]}</p>
                    <button onclick="alternarDiaExpediente(${dia})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${atende ? 'bg-brand-500 text-black' : 'bg-white/10 text-gray-300'}">${atende ? 'Atende' : 'Folga'}</button>
                </div>
                ${linhas}
                ${atende ? `<button onclick="adicionarFaixa(${dia})" class="text-brand-500 text-xs font-bold mt-3"><i class="fa-solid fa-plus mr-1"></i>Adicionar período</button>` : ''}
            </div>`;
    }).join('');
}

function alternarDiaExpediente(dia) {
    const chave = String(dia);
    expedienteEstado.dias[chave] = (expedienteEstado.dias[chave] || []).length > 0
        ? []
        : [{ inicio: '09:00', fim: '18:00' }];
    renderizarExpedienteAdmin();
}

function adicionarFaixa(dia) {
    const faixas = expedienteEstado.dias[String(dia)];
    const inicio = faixas.length ? horaParaMinutos(faixas[faixas.length - 1].fim) : 9 * 60;
    const fim = Math.min(inicio + 180, 23 * 60);
    if (fim <= inicio) {
        mostrarAviso('Não há espaço para mais um período neste dia.', 'erro');
        return;
    }
    faixas.push({ inicio: minutosParaHora(inicio), fim: minutosParaHora(fim) });
    renderizarExpedienteAdmin();
}

// Só guarda a mudança (não redesenha, para o campo não perder o foco)
function editarFaixa(dia, indice, campo, valor) {
    if (!valor) return;
    expedienteEstado.dias[String(dia)][indice][campo] = valor;
}

function removerFaixa(dia, indice) {
    expedienteEstado.dias[String(dia)].splice(indice, 1);
    renderizarExpedienteAdmin();
}

function mudarIntervalo(valor) {
    expedienteEstado.intervalo = Number(valor);
}

async function salvarExpediente() {
    if (!expedienteEstado) return;
    const botao = document.getElementById('btnSalvarExpediente');
    botao.disabled = true;
    try {
        const resposta = await api('/api/admin/expediente', 'PUT', {
            intervalo: expedienteEstado.intervalo,
            dias: expedienteEstado.dias
        });
        if (!resposta) return;
        if (!resposta.ok) {
            mostrarAviso(resposta.dados.erro || 'Não foi possível salvar os horários.', 'erro');
            return;
        }
        mostrarAviso(resposta.dados.mensagem);
    } catch (e) {
        mostrarAviso('Erro de conexão com o servidor.', 'erro');
    } finally {
        botao.disabled = false;
    }
}

// ------------------------------------------------------------
//  BLOQUEIOS (DIAS E HORÁRIOS ESPECÍFICOS)
// ------------------------------------------------------------
function abrirModalBloqueios() {
    if (!dataSelecionadaAdmin) {
        alert('Selecione um dia no calendário primeiro!');
        return;
    }

    // Formata a data para exibir bonito (ex: 24/09/2026)
    const partes = dataSelecionadaAdmin.split('-');
    document.getElementById('tituloDataBloqueio').textContent = `${partes[2]}/${partes[1]}/${partes[0]}`;

    document.getElementById('modalBloqueios').classList.remove('hidden');

    // Carrega o estado atual de bloqueios daquele dia
    carregarEstadoBloqueios();
}

function fecharModalBloqueios() {
    document.getElementById('modalBloqueios').classList.add('hidden');
}

async function carregarEstadoBloqueios() {
    const grid = document.getElementById('gridBloqueiosHorarios');
    const btnDia = document.getElementById('btnBloquearDia');

    const anoMes = dataSelecionadaAdmin.substring(0, 7); // Ex: "2026-09"

    try {
        const response = await fetch(`/api/admin/bloqueios/${anoMes}`, {
            headers: getAuthHeaders()
        });
        if (!verificarSessao(response)) return;
        const todosBloqueios = await response.json();

        // Filtra só os bloqueios do dia que o Mailton escolheu
        const bloqueiosHoje = todosBloqueios.filter(b => b.data_bloqueio === dataSelecionadaAdmin);

        // Verifica se o dia inteiro está bloqueado (hora_bloqueio = null)
        const diaInteiroBloqueado = bloqueiosHoje.some(b => b.hora_bloqueio === null);

        // Configura o Botão do Dia Inteiro
        if (diaInteiroBloqueado) {
            btnDia.textContent = 'Desbloquear';
            btnDia.className = 'text-xs font-bold px-4 py-2 rounded-xl transition-colors bg-white/10 text-white hover:bg-white/20';
            btnDia.onclick = () => alternarBloqueioServidor(null, true);
        } else {
            btnDia.textContent = 'Bloquear';
            btnDia.className = 'text-xs font-bold px-4 py-2 rounded-xl transition-colors bg-red-500 text-white hover:bg-red-400';
            btnDia.onclick = () => alternarBloqueioServidor(null, false);
        }

        // Os horários do dia vêm do servidor (expediente configurado), não de uma lista fixa
        const respGrade = await fetch(`/api/admin/grade/${dataSelecionadaAdmin}`, {
            headers: getAuthHeaders()
        });
        if (!verificarSessao(respGrade)) return;
        const horarios_expediente = await respGrade.json();
        grid.innerHTML = '';

        if (horarios_expediente.length === 0) {
            grid.innerHTML = '<p class="text-xs text-gray-500 col-span-2 text-center py-4">Não há expediente neste dia da semana.</p>';
            return;
        }

        horarios_expediente.forEach(hora => {
            const isBloqueado = diaInteiroBloqueado || bloqueiosHoje.some(b => b.hora_bloqueio === hora);

            const div = document.createElement('div');
            div.className = `flex justify-between items-center p-3 rounded-xl border transition-colors ${isBloqueado ? 'bg-red-500/10 border-red-500/30' : 'bg-surfaceHover border-white/5'}`;

            div.innerHTML = `
                <span class="text-sm font-bold ${isBloqueado ? 'text-red-400' : 'text-white'}">${hora}</span>
                <button onclick="alternarBloqueioServidor('${hora}', ${isBloqueado})" class="text-xs px-3 py-1.5 rounded-lg font-bold ${isBloqueado ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}" ${diaInteiroBloqueado ? 'disabled style="opacity: 0.5;"' : ''}>
                    ${isBloqueado ? 'Desbloquear' : 'Bloquear'}
                </button>
            `;
            grid.appendChild(div);
        });

    } catch (err) {
        console.error("Erro ao carregar bloqueios", err);
    }
}

async function alternarBloqueioServidor(hora_bloqueio, isJaBloqueado) {
    const metodo = isJaBloqueado ? 'DELETE' : 'POST';
    const payload = {
        data_bloqueio: dataSelecionadaAdmin,
        hora_bloqueio: hora_bloqueio
    };

    try {
        const response = await fetch(`/api/admin/bloquear`, {
            method: metodo,
            headers: getAuthHeaders(true),
            body: JSON.stringify(payload)
        });
        if (!verificarSessao(response)) return;

        // Refaz a leitura instantânea na tela, sem recarregar a página
        carregarEstadoBloqueios();
    } catch (erro) {
        mostrarAviso("Erro ao aplicar bloqueio.", 'erro');
    }
}