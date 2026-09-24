const IP_SERVIDOR = '192.168.0.7';

document.addEventListener('DOMContentLoaded', carregarDashboard);

async function carregarDashboard() {
    try {
        const response = await fetch(`http://${IP_SERVIDOR}:5000/api/admin/dashboard`);
        const dados = await response.json();
        
        // 1. Atualizar Faturamento
        document.getElementById('faturamentoTotal').textContent = 
            `R$ ${dados.receita_total.toFixed(2).replace('.', ',')}`;

        // 2. Renderizar Meses
        renderizarMeses(dados.meses);

        // 3. Renderizar Agendamentos
        renderizarAgendamentos(dados.agendamentos);
        
    } catch (erro) {
        alert("Erro ao conectar ao servidor Python.");
    }
}

function renderizarMeses(mesesNoBanco) {
    const container = document.getElementById('containerMeses');
    container.innerHTML = '';
    
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const hoje = new Date();
    
    // Gera os próximos 3 meses para ele gerir
    for(let i = 0; i < 3; i++) {
        let dataMes = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        let anoStr = dataMes.getFullYear();
        let mesStr = String(dataMes.getMonth() + 1).padStart(2, '0');
        let anoMes = `${anoStr}-${mesStr}`; // Ex: "2026-09"
        
        // Verifica se o mês já está aberto no banco de dados
        let mesSalvo = mesesNoBanco.find(m => m.ano_mes === anoMes);
        let status = mesSalvo ? mesSalvo.status : 'fechado';
        let isAberto = status === 'aberto';

        const div = document.createElement('div');
        div.className = 'flex justify-between items-center py-3 border-b border-white/5 last:border-0';
        div.innerHTML = `
            <div>
                <p class="text-white font-bold text-sm">${nomesMeses[dataMes.getMonth()]} ${anoStr}</p>
                <p class="text-[10px] uppercase ${isAberto ? 'text-green-400' : 'text-red-400'} font-bold tracking-wider">${isAberto ? 'Agenda Aberta' : 'Agenda Bloqueada'}</p>
            </div>
            <button onclick="alternarMes('${anoMes}', '${status}')" class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${isAberto ? 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400' : 'bg-brand-500 text-black hover:bg-brand-400'}">
                ${isAberto ? 'Fechar' : 'Liberar'}
            </button>
        `;
        container.appendChild(div);
    }
}

async function alternarMes(anoMes, statusAtual) {
    const novoStatus = statusAtual === 'aberto' ? 'fechado' : 'aberto';
    
    try {
        await fetch(`http://${IP_SERVIDOR}:5000/api/admin/mes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ano_mes: anoMes, status: novoStatus })
        });
        
        // Recarrega o painel para atualizar a cor do botão
        carregarDashboard();
    } catch (erro) {
        alert('Erro ao alterar o mês.');
    }
}

function renderizarAgendamentos(agendamentos) {
    const lista = document.getElementById('listaAgendamentos');
    lista.innerHTML = '';

    if (agendamentos.length === 0) {
        lista.innerHTML = '<p class="text-xs text-gray-500 text-center py-4 bg-surface rounded-xl border border-white/5">Nenhum agendamento encontrado.</p>';
        return;
    }

    agendamentos.forEach(ag => {
        // Formata a data (YYYY-MM-DD HH:MM) para o padrão BR
        let dataParts = ag.data_hora.split(' ');
        let dataBR = dataParts[0].split('-').reverse().join('/');
        let hora = dataParts[1];

        const card = document.createElement('div');
        card.className = 'bg-surface rounded-2xl p-4 border border-white/10 flex flex-col gap-2';
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="text-white font-bold text-sm flex items-center gap-2"><i class="fa-regular fa-user text-brand-500"></i> ${ag.cliente}</h4>
                    <p class="text-gray-400 text-xs mt-1"><i class="fa-brands fa-whatsapp"></i> ${ag.telefone}</p>
                </div>
                <div class="text-right">
                    <p class="text-brand-400 font-bold text-sm">R$ ${ag.valor.toFixed(2).replace('.', ',')}</p>
                </div>
            </div>
            <div class="bg-black/30 rounded-xl p-3 flex justify-between items-center mt-2 border border-white/5">
                <div>
                    <p class="text-white text-xs font-semibold">${ag.servico}</p>
                    <p class="text-gray-400 text-[10px] mt-1"><i class="fa-regular fa-calendar text-brand-500"></i> ${dataBR} às ${hora}</p>
                </div>
                <span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${ag.status === 'cancelado' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}">
                    ${ag.status}
                </span>
            </div>
        `;
        lista.appendChild(card);
    });
}
