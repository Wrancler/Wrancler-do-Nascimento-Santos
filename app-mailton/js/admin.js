const IP_SERVIDOR = '192.168.0.7';
let dataSelecionadaAdmin = null;

// Agora os dados só são carregados quando o Mailton faz login
async function carregarDadosAdmin() {
    try {
        const response = await fetch(`http://${IP_SERVIDOR}:5000/api/admin/dashboard`);
        const dados = await response.json();
        
        // Atualiza a vista de Finanças
        document.getElementById('faturamentoAdmin').textContent = 
            `R$ ${dados.receita_total.toFixed(2).replace('.', ',')}`;

        // Atualiza a vista de Configurações (Meses)
        renderizarMesesAdmin(dados.meses);

        // Atualiza a vista da Agenda (Dias e Agendamentos)
        inicializarAgenda(dados.agendamentos);
        
    } catch (erro) {
        console.error("Erro interno:", erro);
        alert("Erro ao sincronizar dados com o servidor.");
    }
}

// --- LÓGICA DA AGENDA ---
function inicializarAgenda(agendamentos) {
    const carrossel = document.getElementById('carrosselDiasAdmin');
    carrossel.innerHTML = '';
    
    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const hoje = new Date();
    
    // Gera 15 dias no calendário do topo
    for(let i = 0; i < 15; i++) {
        let data = new Date();
        data.setDate(hoje.getDate() + i);

        const diaStr = String(data.getDate()).padStart(2, '0');
        const mesStr = String(data.getMonth() + 1).padStart(2, '0');
        const anoStr = data.getFullYear();
        const dataFormatada = `${anoStr}-${mesStr}-${diaStr}`;
        
        const btn = document.createElement('button');
        btn.className = 'btn-dia-admin flex-none snap-start flex flex-col items-center justify-center p-3 rounded-xl min-w-[65px] border border-white/10 bg-surfaceHover text-gray-400 transition hover:border-brand-500';
        btn.innerHTML = `
            <span class="text-[10px] font-medium mb-1">${diasSemana[data.getDay()]}</span>
            <span class="text-lg font-bold">${diaStr}</span>
        `;
        
        btn.onclick = () => filtrarAgendamentosPorDia(btn, dataFormatada, agendamentos);
        carrossel.appendChild(btn);
    }
}

function filtrarAgendamentosPorDia(botao, dataFiltro, todosAgendamentos) {
    dataSelecionadaAdmin = dataFiltro;

    // Destaca o botão selecionado
    document.querySelectorAll('.btn-dia-admin').forEach(b => {
        b.classList.remove('bg-brand-500', 'text-black', 'border-brand-500');
        b.classList.add('bg-surfaceHover', 'text-gray-400', 'border-white/10');
    });
    botao.classList.remove('bg-surfaceHover', 'text-gray-400', 'border-white/10');
    botao.classList.add('bg-brand-500', 'text-black', 'border-brand-500');

    const lista = document.getElementById('listaAgendamentosDia');
    lista.innerHTML = '';

    // Filtra os agendamentos que correspondem à data selecionada
    const agendamentosDoDia = todosAgendamentos.filter(ag => ag.data_hora.startsWith(dataFiltro));
    
    document.getElementById('qtdAgendamentosDia').textContent = agendamentosDoDia.length;

    if (agendamentosDoDia.length === 0) {
        lista.innerHTML = '<p class="text-xs text-gray-500 text-center py-8 bg-surfaceHover rounded-2xl border border-white/5 border-dashed">Nenhum agendamento para este dia.</p>';
        return;
    }

    agendamentosDoDia.forEach(ag => {
        let hora = ag.data_hora.split(' ')[1];

        const card = document.createElement('div');
        card.className = 'bg-surfaceHover rounded-2xl p-4 border border-white/10 flex justify-between items-center';
        card.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="bg-black/30 w-12 h-12 rounded-xl flex flex-col items-center justify-center border border-white/5 text-brand-500">
                    <i class="fa-regular fa-clock text-xs mb-1"></i>
                    <span class="text-xs font-bold">${hora}</span>
                </div>
                <div>
                    <h4 class="text-white font-bold text-sm">${ag.cliente}</h4>
                    <p class="text-gray-400 text-[10px] mt-1 uppercase tracking-wider">${ag.servico}</p>
                </div>
            </div>
            <div class="text-right flex flex-col items-end">
                <span class="px-2 py-1 mb-1 rounded-md text-[10px] font-bold uppercase ${ag.status === 'cancelado' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}">${ag.status}</span>
                <p class="text-gray-300 font-semibold text-xs mt-1">R$ ${ag.valor.toFixed(2).replace('.', ',')}</p>
            </div>
        `;
        lista.appendChild(card);
    });
}

// --- LÓGICA DE CONFIGURAÇÕES (MESES) ---
function renderizarMesesAdmin(mesesNoBanco) {
    const container = document.getElementById('containerMesesAdmin');
    container.innerHTML = '';
    
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const hoje = new Date();
    
    for(let i = 0; i < 3; i++) {
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
        await fetch(`http://${IP_SERVIDOR}:5000/api/admin/mes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ano_mes: anoMes, status: novoStatus })
        });
        carregarDadosAdmin(); 
    } catch (erro) {
        alert('Erro ao alterar o mês.');
    }
}

// --- LÓGICA DE BLOQUEIOS (EXCEÇÕES) ---
function abrirModalBloqueios() {
    if (!dataSelecionadaAdmin) {
        alert('Selecione um dia no calendário primeiro!');
        return;
    }
    
    // Formata a data para exibir bonito (ex: 24/09/2026)
    const partes = dataSelecionadaAdmin.split('-');
    document.getElementById('tituloDataBloqueio').textContent = `${partes[2]}/${partes[1]}/${partes[0]}`;
    
    const modal = document.getElementById('modalBloqueios');
    modal.classList.remove('hidden');
    
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
        const response = await fetch(`http://${IP_SERVIDOR}:5000/api/admin/bloqueios/${anoMes}`);
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
        
        // Configura os Botões de Horários Específicos
        const horarios_expediente = ['09:00', '10:30', '14:00', '15:30', '17:00'];
        grid.innerHTML = '';
        
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
        await fetch(`http://${IP_SERVIDOR}:5000/api/admin/bloquear`, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        // Refaz a leitura instantânea na tela, sem recarregar a página
        carregarEstadoBloqueios();
    } catch (erro) {
        alert("Erro ao aplicar bloqueio.");
    }
}