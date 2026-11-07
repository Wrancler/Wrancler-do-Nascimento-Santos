// ============================================================
//  PAINEL ADMIN - Mailton Maia
// ============================================================
let dataSelecionadaAdmin = null;
let agendamentosCache = [];
let servicosAdmin = [];
let expedienteEstado = null; // { intervalo: 30, dias: { '0': [], '1': [{inicio, fim}], ... } }
let periodoFinanceiro = 'hoje'; // hoje | semana | mes | mes_passado

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

// Envio de arquivos (fotos): igual ao api(), mas com FormData (o navegador define o Content-Type sozinho)
async function enviarArquivos(url, campo, arquivos) {
    const formulario = new FormData();
    Array.from(arquivos).forEach(a => formulario.append(campo, a));
    const response = await fetch(url, { method: 'POST', headers: getAuthHeaders(false), body: formulario });
    if (!verificarSessao(response)) return null;
    let dados = {};
    try { dados = await response.json(); } catch (e) { /* resposta sem corpo */ }
    if (response.status === 413) dados = { erro: 'A foto é grande demais. Tente uma menor.' };
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
    renderizarMesesAdmin(dados.meses);
    agendamentosCache = dados.agendamentos;
    inicializarAgenda();
    await carregarFinanceiro();
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
        carregarGaleriaAdmin();
        carregarSobreAdmin();
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

    container.innerHTML = servicosAdmin.map((s, i) => {
        const grupo = servicosAdmin.filter(x => x.ativo === s.ativo);
        const posicao = grupo.findIndex(x => x.id === s.id);
        const primeiro = posicao === 0;
        const ultimo = posicao === grupo.length - 1;
        const foto = s.imagem_url
            ? `<img src="${escaparHtml(s.imagem_url)}" alt="" class="mini-foto" onclick="abrirModalServico(${s.id})">`
            : `<button type="button" class="mini-foto-vazia" onclick="abrirModalServico(${s.id})" title="Adicionar foto" aria-label="Adicionar foto ao serviço"><i class="fa-solid fa-camera text-sm"></i></button>`;
        return `
        <div class="flex items-center justify-between gap-2 p-3 rounded-xl bg-black/20 border border-white/5 ${s.ativo ? '' : 'opacity-60'}">
            <div class="flex flex-col shrink-0">
                <button onclick="moverServico(${s.id}, 'cima')" ${primeiro ? 'disabled style="opacity:.25"' : ''} class="w-8 h-6 text-gray-300 hover:text-white" title="Subir na lista" aria-label="Subir na lista"><i class="fa-solid fa-chevron-up text-xs"></i></button>
                <button onclick="moverServico(${s.id}, 'baixo')" ${ultimo ? 'disabled style="opacity:.25"' : ''} class="w-8 h-6 text-gray-300 hover:text-white" title="Descer na lista" aria-label="Descer na lista"><i class="fa-solid fa-chevron-down text-xs"></i></button>
            </div>
            ${foto}
            <div class="min-w-0 flex-1">
                <p class="text-white font-bold text-sm leading-snug">${escaparHtml(s.nome)}</p>
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
        </div>`;
    }).join('');
}

async function moverServico(id, direcao) {
    try {
        const resposta = await api(`/api/admin/servicos/${id}/mover`, 'POST', { direcao });
        if (!resposta) return;
        if (!resposta.ok) { mostrarAviso(resposta.dados.erro || 'Não foi possível mover.', 'erro'); return; }
        await recarregarServicos();
    } catch (e) {
        mostrarAviso('Erro de conexão com o servidor.', 'erro');
    }
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
    document.getElementById('servFoto').value = '';
    mostrarPreviaServico(servico && servico.imagem_url ? servico.imagem_url : null);
    document.getElementById('btnRemoverFotoServ').classList.toggle('hidden', !(servico && servico.imagem_url));
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
        const idSalvo = id || resposta.dados.id;
        const fotoEscolhida = document.getElementById('servFoto').files;
        let avisoFoto = '';
        if (fotoEscolhida.length && idSalvo) {
            const envio = await enviarArquivos(`/api/admin/servicos/${idSalvo}/imagem`, 'foto', [fotoEscolhida[0]]);
            if (envio && !envio.ok) avisoFoto = envio.dados.erro || 'A foto não pôde ser enviada.';
        }
        fecharModalServico();
        mostrarAviso(resposta.dados.mensagem);
        if (avisoFoto) mostrarAviso('O serviço foi salvo, mas: ' + avisoFoto, 'erro');
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
//  FINANÇAS
// ------------------------------------------------------------
const ROTULOS_PERIODO = {
    hoje: 'Recebido hoje',
    semana: 'Recebido na semana',
    mes: 'Recebido no mês',
    mes_passado: 'Recebido no mês passado'
};

const ESTILO_SITUACAO = {
    concluido: { classe: 'bg-sky-500/20 text-sky-400', texto: 'Concluído' },
    sem_concluir: { classe: 'bg-brand-500/20 text-brand-400', texto: 'Falta concluir' },
    a_receber: { classe: 'bg-green-500/20 text-green-400', texto: 'Agendado' }
};

function dataCurta(dataIso) {
    const [, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}`;
}

function pluralizar(qtd, singular, plural) {
    return `${qtd} ${qtd === 1 ? singular : plural}`;
}

function mudarPeriodoFinanceiro(periodo) {
    periodoFinanceiro = periodo;
    marcarPeriodoAtivo();
    carregarFinanceiro();
}

function marcarPeriodoAtivo() {
    document.querySelectorAll('#filtrosFinanceiro button').forEach(b => {
        const ativo = b.dataset.periodo === periodoFinanceiro;
        b.classList.toggle('bg-white/10', ativo);
        b.classList.toggle('text-white', ativo);
        b.classList.toggle('shadow-sm', ativo);
        b.classList.toggle('font-bold', ativo);
        b.classList.toggle('text-gray-400', !ativo);
        b.classList.toggle('font-semibold', !ativo);
    });
}

async function carregarFinanceiro() {
    marcarPeriodoAtivo();
    try {
        const resposta = await api(`/api/admin/financeiro?periodo=${periodoFinanceiro}`);
        if (!resposta) return;
        if (!resposta.ok) throw new Error('Falha ao carregar as finanças');
        renderizarFinanceiro(resposta.dados);
    } catch (erro) {
        console.error('Erro nas finanças:', erro);
        mostrarAviso('Não foi possível carregar as finanças.', 'erro');
    }
}

function renderizarFinanceiro(d) {
    document.getElementById('rotuloFinanceiro').textContent = ROTULOS_PERIODO[d.periodo];
    document.getElementById('faturamentoAdmin').textContent = formatarMoeda(d.recebido);
    document.getElementById('detalheFinanceiro').textContent = d.qtd_concluidos
        ? `${pluralizar(d.qtd_concluidos, 'atendimento concluído', 'atendimentos concluídos')} • ticket médio ${formatarMoeda(d.ticket_medio)}`
        : 'Nenhum atendimento concluído neste período';
    document.getElementById('datasFinanceiro').textContent = d.inicio === d.fim
        ? `Dia ${dataCurta(d.inicio)}/${d.inicio.slice(0, 4)}`
        : `De ${dataCurta(d.inicio)} a ${dataCurta(d.fim)}/${d.fim.slice(0, 4)}`;

    document.getElementById('finAReceber').textContent = formatarMoeda(d.a_receber);
    document.getElementById('finAReceberQtd').textContent = pluralizar(d.qtd_a_receber, 'agendado', 'agendados');
    document.getElementById('finSemConcluir').textContent = formatarMoeda(d.sem_concluir);
    document.getElementById('finSemConcluirQtd').textContent = pluralizar(d.qtd_sem_concluir, 'atendimento', 'atendimentos');

    const pendente = d.qtd_sem_concluir > 0;
    const cartao = document.getElementById('cartaoSemConcluir');
    cartao.classList.toggle('border-brand-500/60', pendente);
    cartao.classList.toggle('border-white/10', !pendente);
    document.getElementById('avisoSemConcluir').classList.toggle('hidden', !pendente);
    document.getElementById('espacoSemAviso').classList.toggle('hidden', pendente);

    // O que mais rendeu
    const bloco = document.getElementById('blocoPorServico');
    const maior = d.por_servico.length ? d.por_servico[0].total : 0;
    bloco.classList.toggle('hidden', d.por_servico.length === 0);
    document.getElementById('finPorServico').innerHTML = d.por_servico.map(s => `
        <div>
            <div class="flex justify-between items-baseline gap-3">
                <p class="text-sm font-semibold text-white truncate">${escaparHtml(s.servico)}</p>
                <p class="text-sm font-bold text-brand-400 shrink-0">${formatarMoeda(s.total)}</p>
            </div>
            <p class="text-[11px] text-gray-500 mt-0.5">${pluralizar(s.qtd, 'atendimento', 'atendimentos')}</p>
            <div class="h-1.5 bg-white/10 rounded-full mt-2"><div class="h-1.5 bg-brand-500 rounded-full" style="width: ${maior ? Math.max(4, Math.round(s.total / maior * 100)) : 0}%"></div></div>
        </div>
    `).join('');

    // Lista de atendimentos
    const lista = document.getElementById('listaFinancas');
    lista.innerHTML = '';
    if (d.atendimentos.length === 0) {
        lista.innerHTML = '<p class="text-xs text-gray-500 text-center py-8 bg-surface rounded-2xl border border-white/5 border-dashed">Nenhum atendimento neste período.</p>';
    }
    d.atendimentos.forEach(a => lista.appendChild(criarItemFinanceiro(a)));
    document.getElementById('avisoLimiteFinanceiro').classList.toggle('hidden', !d.limitado);
}

function criarItemFinanceiro(a) {
    const estilo = ESTILO_SITUACAO[a.situacao];
    const [data, hora] = a.data_hora.split(' ');

    let acoes = '';
    if (a.situacao === 'sem_concluir') {
        acoes = `
            <button onclick="acaoNoFinanceiro(${a.id}, 'concluido')" class="flex-1 bg-green-500/15 text-green-400 border border-green-500/20 rounded-lg py-2 text-xs font-bold hover:bg-green-500/25 transition-colors"><i class="fa-solid fa-check mr-1"></i>Concluir</button>
            <button onclick="acaoNoFinanceiro(${a.id}, 'cancelado')" class="flex-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg py-2 text-xs font-bold hover:bg-red-500/20 transition-colors">Não aconteceu</button>`;
    } else if (a.situacao === 'concluido') {
        acoes = `<button onclick="acaoNoFinanceiro(${a.id}, 'agendado')" class="text-[11px] text-gray-500 hover:text-gray-300 underline">Desfazer conclusão</button>`;
    }

    const item = document.createElement('div');
    item.className = 'bg-surface rounded-2xl p-4 border border-white/10';
    item.innerHTML = `
        <div class="flex justify-between items-start gap-3">
            <div class="min-w-0">
                <p class="text-white font-bold text-sm truncate">${escaparHtml(a.cliente)}</p>
                <p class="text-gray-400 text-[11px] mt-0.5 truncate">${escaparHtml(a.servico)}</p>
                <p class="text-gray-500 text-[11px] mt-0.5">${dataCurta(data)} às ${hora}</p>
            </div>
            <div class="text-right shrink-0">
                <p class="text-white font-bold text-sm">${formatarMoeda(a.valor)}</p>
                <span class="inline-block mt-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase ${estilo.classe}">${estilo.texto}</span>
            </div>
        </div>
        ${acoes ? `<div class="flex gap-2 mt-3 pt-3 border-t border-white/5 ${a.situacao === 'concluido' ? 'justify-end' : ''}">${acoes}</div>` : ''}
    `;
    return item;
}

// Concluir (ou desfazer) direto pela lista de finanças, inclusive de dias que já passaram
async function acaoNoFinanceiro(id, novoStatus) {
    if (novoStatus === 'cancelado' && !confirm('Marcar este atendimento como "não aconteceu"? Ele sai do valor a receber.')) return;
    if (novoStatus === 'agendado' && !confirm('Desfazer a conclusão? O valor sai de "recebido" e volta para "falta concluir".')) return;
    try {
        const resposta = await api(`/api/admin/agendamentos/${id}/status`, 'POST', { status: novoStatus });
        if (!resposta) return;
        if (!resposta.ok) {
            mostrarAviso(resposta.dados.erro || 'Não foi possível alterar o atendimento.', 'erro');
            return;
        }
        mostrarAviso(resposta.dados.mensagem);
        await carregarDashboard();
    } catch (erro) {
        mostrarAviso('Erro de conexão com o servidor.', 'erro');
    }
}

// ------------------------------------------------------------
//  SEGURANÇA: TROCAR A SENHA
// ------------------------------------------------------------
function alternarVisibilidadeSenhas(mostrar) {
    ['senhaAtual', 'senhaNova', 'senhaNova2'].forEach(id => {
        document.getElementById(id).type = mostrar ? 'text' : 'password';
    });
}

async function trocarSenhaAdmin() {
    const erro = document.getElementById('erroSenha');
    erro.classList.add('hidden');
    const mostrarErro = (texto) => { erro.textContent = texto; erro.classList.remove('hidden'); };

    const atual = document.getElementById('senhaAtual').value;
    const nova = document.getElementById('senhaNova').value;
    const repetida = document.getElementById('senhaNova2').value;

    if (!atual || !nova || !repetida) return mostrarErro('Preencha os três campos.');
    if (nova.length < 6) return mostrarErro('A nova senha precisa ter pelo menos 6 caracteres.');
    if (nova !== repetida) return mostrarErro('A nova senha e a repetição não são iguais.');

    const botao = document.getElementById('btnTrocarSenha');
    botao.disabled = true;
    try {
        const resposta = await api('/api/admin/senha', 'POST', { senha_atual: atual, senha_nova: nova });
        if (!resposta) return;
        if (!resposta.ok) return mostrarErro(resposta.dados.erro || 'Não foi possível trocar a senha.');

        // O login anterior deixou de valer: guarda o novo para esta tela continuar conectada
        localStorage.setItem('wn_admin_token', resposta.dados.token);
        ['senhaAtual', 'senhaNova', 'senhaNova2'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('mostrarSenhas').checked = false;
        alternarVisibilidadeSenhas(false);
        mostrarAviso('Senha alterada! Use a nova senha no próximo acesso.');
    } catch (e) {
        mostrarErro('Erro de conexão com o servidor.');
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


// Mostra a foto no campo (ou o convite para escolher uma)
function mostrarPreviaServico(url) {
    const previa = document.getElementById('servFotoPrevia');
    if (url) previa.src = url;
    previa.classList.toggle('hidden', !url);
    document.getElementById('servFotoDica').classList.toggle('hidden', !!url);
    document.getElementById('servFotoTroca').classList.toggle('hidden', !url);
}

// Ao escolher a foto, já mostra como vai ficar (antes de salvar)
function previaFotoServico(input) {
    if (!input.files.length) return;
    mostrarPreviaServico(URL.createObjectURL(input.files[0]));
}

async function removerFotoServico() {
    const id = document.getElementById('servId').value;
    if (!id) return;
    try {
        const resposta = await api(`/api/admin/servicos/${id}/imagem`, 'DELETE');
        if (!resposta) return;
        if (!resposta.ok) { mostrarAviso(resposta.dados.erro || 'Não foi possível remover.', 'erro'); return; }
        document.getElementById('servFoto').value = '';
        mostrarPreviaServico(null);
        document.getElementById('btnRemoverFotoServ').classList.add('hidden');
        mostrarAviso('Foto removida.');
        await recarregarServicos();
    } catch (e) {
        mostrarAviso('Erro de conexão com o servidor.', 'erro');
    }
}

// ------------------------------------------------------------
//  CONFIGURAÇÕES: FOTOS DOS TRABALHOS E TEXTO "SOBRE"
// ------------------------------------------------------------
async function carregarGaleriaAdmin() {
    const grade = document.getElementById('gradeGaleriaAdmin');
    const resposta = await api('/api/admin/galeria');
    if (!resposta || !resposta.ok) return;
    if (resposta.dados.length === 0) {
        grade.innerHTML = '<p class="col-span-3 text-xs text-gray-500 text-center py-3">Nenhuma foto ainda. Toque em "Adicionar fotos".</p>';
        return;
    }
    grade.innerHTML = resposta.dados.map(f => `
        <div class="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/30">
            <img src="${escaparHtml(f.url)}" alt="Foto de trabalho" loading="lazy" class="w-full h-full object-cover">
            <button onclick="apagarFotoGaleria('${escaparHtml(f.nome)}')" class="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/70 text-red-400 hover:bg-black" title="Apagar foto" aria-label="Apagar foto">
                <i class="fa-solid fa-trash text-xs"></i>
            </button>
        </div>`).join('');
}

async function enviarFotosGaleria(input) {
    if (!input.files.length) return;
    const botao = document.getElementById('btnAddGaleria');
    const textoOriginal = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Enviando... aguarde';
    try {
        const resposta = await enviarArquivos('/api/admin/galeria', 'fotos', input.files);
        if (!resposta) return;
        mostrarAviso(resposta.ok ? resposta.dados.mensagem : (resposta.dados.erro || 'Não foi possível enviar.'), resposta.ok ? 'ok' : 'erro');
        await carregarGaleriaAdmin();
    } catch (e) {
        mostrarAviso('Erro de conexão ao enviar as fotos.', 'erro');
    } finally {
        botao.disabled = false;
        botao.innerHTML = textoOriginal;
        input.value = '';
    }
}

async function apagarFotoGaleria(nome) {
    if (!confirm('Apagar esta foto do site?')) return;
    try {
        const resposta = await api(`/api/admin/galeria/${encodeURIComponent(nome)}`, 'DELETE');
        if (!resposta) return;
        mostrarAviso(resposta.ok ? 'Foto apagada.' : (resposta.dados.erro || 'Não foi possível apagar.'), resposta.ok ? 'ok' : 'erro');
        await carregarGaleriaAdmin();
    } catch (e) {
        mostrarAviso('Erro de conexão com o servidor.', 'erro');
    }
}

async function carregarSobreAdmin() {
    const resposta = await api('/api/admin/sobre');
    if (resposta && resposta.ok) document.getElementById('textoSobre').value = resposta.dados.texto || '';
}

async function salvarSobre() {
    const botao = document.getElementById('btnSalvarSobre');
    botao.disabled = true;
    try {
        const resposta = await api('/api/admin/sobre', 'PUT', { texto: document.getElementById('textoSobre').value });
        if (!resposta) return;
        mostrarAviso(resposta.ok ? resposta.dados.mensagem : (resposta.dados.erro || 'Não foi possível salvar.'), resposta.ok ? 'ok' : 'erro');
    } catch (e) {
        mostrarAviso('Erro de conexão com o servidor.', 'erro');
    } finally {
        botao.disabled = false;
    }
}
