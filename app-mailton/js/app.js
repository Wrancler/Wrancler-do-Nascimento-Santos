let servicoSelecionadoId = null;
let servicoNomeAtual = '';
let servicoValorAtual = '';
let dataSelecionada = null;
let horarioSelecionado = null;
let servicosCache = [];
let diasAtendimento = [1, 2, 3, 4, 5, 6]; // 0 = domingo ... 6 = sábado (atualizado pelo servidor)
let mesesAbertos = null;   // ['2026-11', '2026-12', ...] liberados pelo Mailton; null = ainda não sabemos
let mesSelecionado = null; // mês que está aberto no calendário agora

// --- FORMATAÇÃO ---
function formatarDuracao(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h && m) return `${h}h ${m} min`;
    if (h) return `${h}h`;
    return `${m} min`;
}

function formatarValor(valor) {
    return 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "R$ 25" quando o valor é inteiro, "R$ 49,99" quando tem centavos
function formatarValorCurto(valor) {
    return Number.isInteger(Number(valor)) ? `R$ ${Number(valor)}` : formatarValor(valor);
}

function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// --- LISTA DE SERVIÇOS (vem do banco, o Mailton edita pelo painel) ---
function criarCardServico(s) {
    return `
        <div class="group bg-surface/50 backdrop-blur-md rounded-3xl p-5 border border-white/10 hover:border-brand-500/50 hover:bg-surface transition-all duration-300 cursor-pointer shadow-lg"
             role="button" tabindex="0" onclick="abrirModal(${s.id})"
             onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrirModal(${s.id}); }">
            <div class="flex justify-between items-center gap-4">
                <div class="min-w-0">
                    <h3 class="font-bold text-white text-lg leading-snug group-hover:text-brand-400 transition-colors">${escaparHtml(s.nome)}</h3>
                    <div class="flex items-center gap-3 mt-2">
                        <span class="bg-white/5 text-gray-300 text-sm px-3 py-1 rounded-md font-medium flex items-center gap-2">
                            <i class="fa-regular fa-clock text-brand-500"></i> ${formatarDuracao(s.duracao_minutos)}
                        </span>
                    </div>
                </div>
                <div class="text-right flex flex-col items-end shrink-0">
                    <p class="text-white font-bold text-xl">${formatarValorCurto(s.valor)}</p>
                    <span class="mt-2 text-brand-500 text-base font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        Agendar <i class="fa-solid fa-chevron-right text-xs"></i>
                    </span>
                </div>
            </div>
        </div>`;
}

async function carregarServicos() {
    const lista = document.getElementById('listaServicos');
    lista.innerHTML = '<p class="text-base text-gray-400 text-center py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Carregando serviços...</p>';

    try {
        const [respServicos, respExpediente] = await Promise.all([
            fetch('/api/servicos'),
            fetch('/api/expediente')
        ]);
        if (!respServicos.ok) throw new Error('Falha ao buscar serviços');

        servicosCache = await respServicos.json();
        if (respExpediente.ok) {
            const expediente = await respExpediente.json();
            diasAtendimento = expediente.dias;
            mesesAbertos = expediente.meses;
        }

        if (servicosCache.length === 0) {
            lista.innerHTML = '<p class="text-base text-gray-400 text-center py-10">Nenhum serviço disponível no momento. Fale com o Mailton pelo WhatsApp, logo abaixo.</p>';
            return;
        }
        lista.innerHTML = servicosCache.map(criarCardServico).join('');
    } catch (err) {
        console.error(err);
        lista.innerHTML = `
            <div class="text-center py-10">
                <p class="text-base text-red-400 mb-4">Não foi possível carregar os serviços.</p>
                <button type="button" onclick="carregarServicos()" class="px-6 py-3 rounded-2xl bg-white/10 text-white font-semibold text-base">Tentar de novo</button>
            </div>`;
    }
}

function abrirModal(id) {
    const servico = servicosCache.find(s => s.id === id);
    if (!servico) return;

    servicoSelecionadoId = servico.id;
    servicoNomeAtual = servico.nome;
    servicoValorAtual = formatarValor(servico.valor);
    
    document.getElementById('modalServicoNome').textContent = servico.nome;
    document.getElementById('modalServicoInfo').textContent = `${servicoValorAtual} • ${formatarDuracao(servico.duracao_minutos)}`;
    
    mesSelecionado = null;
    resetarSelecoes();
    gerarDatasCarrossel();
    
    document.getElementById('modalHorario').classList.remove('hidden');
}

function fecharModal() {
    document.getElementById('modalHorario').classList.add('hidden');
}

function resetarSelecoes() {
    dataSelecionada = null;
    horarioSelecionado = null;
    document.getElementById('gridHorarios').innerHTML = '<p class="text-xs text-gray-500 col-span-3 text-center py-4 bg-dark-800 rounded-xl border border-gray-700 border-dashed">Selecione uma data acima.</p>';
}

const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SIGLAS_MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

// Datas que a cliente pode escolher em um mês: do dia 1 (ou de hoje) até o fim, só dias de atendimento
function diasDoMes(anoMes) {
    const [ano, mes] = anoMes.split('-').map(Number);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const dias = [];
    const totalDias = new Date(ano, mes, 0).getDate();
    for (let dia = 1; dia <= totalDias; dia++) {
        const data = new Date(ano, mes - 1, dia);
        if (data < hoje) continue;
        if (!diasAtendimento.includes(data.getDay())) continue;
        dias.push(data);
    }
    return dias;
}

function gerarDatasCarrossel() {
    const abas = document.getElementById('abasMeses');
    const container = document.getElementById('carrosselDatas');
    const rotulo = document.getElementById('mesAtualLabel');

    // Se o servidor não informou os meses, usa o mês atual e o próximo
    let meses = mesesAbertos;
    if (!meses) {
        const agora = new Date();
        const proximo = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
        const formatar = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        meses = [formatar(agora), formatar(proximo)];
    }

    // Só entram meses que ainda têm algum dia para escolher
    const mesesComDias = meses.filter(m => diasDoMes(m).length > 0);

    abas.innerHTML = '';
    container.innerHTML = '';

    if (mesesComDias.length === 0) {
        rotulo.textContent = '';
        container.innerHTML = '<p class="text-base text-gray-400 py-4 pr-2">A agenda ainda não está aberta. Fale com o Mailton pelo WhatsApp, no final da página.</p>';
        return;
    }

    if (!mesesComDias.includes(mesSelecionado)) mesSelecionado = mesesComDias[0];

    // Abas de mês (só aparecem quando há mais de um mês aberto)
    if (mesesComDias.length > 1) {
        mesesComDias.forEach(anoMes => {
            const [, mes] = anoMes.split('-').map(Number);
            const ativa = anoMes === mesSelecionado;
            const aba = document.createElement('button');
            aba.type = 'button';
            aba.className = 'aba-mes shrink-0 px-5 py-2.5 rounded-full text-base font-semibold border transition ' +
                (ativa ? 'bg-brand-500 text-black border-brand-500' : 'bg-white/5 text-gray-200 border-white/10 hover:border-brand-500');
            aba.textContent = NOMES_MESES[mes - 1];
            aba.onclick = () => {
                mesSelecionado = anoMes;
                resetarSelecoes();
                gerarDatasCarrossel();
            };
            abas.appendChild(aba);
        });
    }

    const [anoSel, mesSel] = mesSelecionado.split('-').map(Number);
    rotulo.textContent = `${NOMES_MESES[mesSel - 1]} ${anoSel}`;

    diasDoMes(mesSelecionado).forEach(data => {
        const diaStr = String(data.getDate()).padStart(2, '0');
        const mesStr = String(data.getMonth() + 1).padStart(2, '0');
        const dataFormatada = `${data.getFullYear()}-${mesStr}-${diaStr}`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-data flex-none snap-start flex flex-col items-center justify-center p-3 rounded-xl min-w-[76px] border border-gray-700 bg-dark-800 text-gray-300 transition hover:border-brand-500';
        btn.innerHTML = `
            <span class="text-xs font-medium mb-1 tracking-wider">${DIAS_SEMANA[data.getDay()]}</span>
            <span class="text-2xl font-bold leading-none">${diaStr}</span>
            <span class="text-xs font-bold mt-1 tracking-wider text-brand-400">${SIGLAS_MESES[data.getMonth()]}</span>
        `;
        btn.onclick = () => selecionarData(btn, dataFormatada);
        container.appendChild(btn);
    });
}

async function selecionarData(botao, dataFormatoSQL) {
    dataSelecionada = dataFormatoSQL;
    
    document.querySelectorAll('.btn-data').forEach(b => {
        b.classList.remove('bg-brand-500', 'text-dark-900', 'border-brand-500');
        b.classList.add('bg-dark-800', 'text-gray-300', 'border-gray-700');
    });
    botao.classList.remove('bg-dark-800', 'text-gray-300', 'border-gray-700');
    botao.classList.add('bg-brand-500', 'text-dark-900', 'border-brand-500');

    const grid = document.getElementById('gridHorarios');
    grid.innerHTML = '<p class="text-xs text-brand-400 col-span-3 text-center py-4 bg-brand-500/10 rounded-xl border border-brand-500/20"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Buscando horários...</p>';
    horarioSelecionado = null;

    try {
        const response = await fetch(`/api/horarios?data=${dataSelecionada}&servico_id=${servicoSelecionadoId}`);
        if (!response.ok) throw new Error('Erro na comunicação');
        
        const resultado = await response.json();
        const horarios = resultado.horarios;
        grid.innerHTML = ''; 

        if (horarios.length === 0) {
            // O servidor diz o motivo (mês fechado, dia bloqueado...). Sem motivo = dia lotado.
            const mensagem = resultado.mensagem || 'Agenda lotada neste dia.';
            grid.innerHTML = `<p class="text-xs text-red-400 col-span-3 text-center py-4 bg-red-500/10 rounded-xl border border-red-500/20"><i class="fa-solid fa-calendar-xmark mr-2"></i>${mensagem}</p>`;
            return;
        }

        horarios.forEach(hora => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-horario bg-dark-800 border border-gray-700 py-3 rounded-xl text-sm font-semibold hover:border-brand-500 transition text-gray-200';
            btn.textContent = hora;
            btn.onclick = function() { selecionarHorario(this, hora); };
            grid.appendChild(btn);
        });

    } catch (err) {
        console.error(err);
        grid.innerHTML = '<p class="text-xs text-red-400 col-span-3 text-center py-4 bg-red-500/10 rounded-xl border border-red-500/20">Erro ao carregar. Verifique o terminal Python.</p>';
    }
}

function selecionarHorario(botao, horario) {
    horarioSelecionado = horario;
    document.querySelectorAll('.btn-horario').forEach(b => {
        b.classList.remove('bg-brand-500', 'text-dark-900', 'border-brand-500');
        b.classList.add('bg-dark-800', 'text-gray-200');
    });
    botao.classList.remove('bg-dark-800', 'text-gray-200');
    botao.classList.add('bg-brand-500', 'text-dark-900', 'border-brand-500');
}

async function enviarAgendamento() {
    const nome = document.getElementById('clienteNome').value.trim();
    const telefone = document.getElementById('clienteTelefone').value.trim();

    if (!nome || !telefone || !dataSelecionada || !horarioSelecionado) {
        alert('Por favor, preencha todos os campos e escolha uma data e horário.');
        return;
    }

    const btn = document.getElementById('btnConfirmar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>A processar...';

    const payload = {
        nome_cliente: nome,
        telefone_cliente: telefone,
        servico_id: servicoSelecionadoId,
        data_hora: `${dataSelecionada} ${horarioSelecionado}`
    };

    try {
        const response = await fetch('/api/agendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const resultado = await response.json();

        if (response.ok) {
            // Feedback de sucesso Premium
            btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Agendado com Sucesso!';
            btn.classList.remove('from-brand-500', 'to-brand-400', 'text-black', 'shadow-[0_0_20px_rgba(245,158,11,0.3)]');
            btn.classList.add('bg-green-500', 'text-white', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]');

            const numeroMailton = "5583988856096"; 
            const dataBR = dataSelecionada.split('-').reverse().join('/'); 
            
            // Usa o domínio atual (funciona local ou em produção, sem IP fixo)
            const linkCancelamento = `${window.location.origin}/cancelar/${resultado.token_cancelamento}`;

            const textoWhatsApp = `✅ *NOVO AGENDAMENTO SITE!*\n\nOlá Mailton! Acabei de me agendar pelo seu sistema:\n\n👤 *Cliente:* ${nome}\n📱 *WhatsApp:* ${telefone}\n✨ *Serviço:* ${servicoNomeAtual} (${servicoValorAtual})\n📅 *Data:* ${dataBR} às ${horarioSelecionado}\n\n🔗 *Meu link para cancelar (caso precise):*\n${linkCancelamento}`;
            
            const urlWhatsApp = `https://api.whatsapp.com/send?phone=${numeroMailton}&text=${encodeURIComponent(textoWhatsApp)}`;

            // Aguarda 1.5s para o cliente ver o sucesso, depois abre o WhatsApp
            setTimeout(() => {
                window.location.href = urlWhatsApp;
                
                // Restaura o botão caso o utilizador volte à página
                btn.innerHTML = 'Confirmar Agendamento';
                btn.classList.add('from-brand-500', 'to-brand-400', 'text-black', 'shadow-[0_0_20px_rgba(245,158,11,0.3)]');
                btn.classList.remove('bg-green-500', 'text-white', 'shadow-[0_0_20px_rgba(34,197,94,0.3)]');
                btn.disabled = false;
                fecharModal();
            }, 1500);

        } else {
            alert(resultado.erro || 'Falha ao agendar');
            btn.disabled = false;
            btn.textContent = 'Confirmar Agendamento';

            // Horário foi ocupado por outra pessoa enquanto este cliente escolhia: atualiza a lista
            if (response.status === 409) {
                const btnData = document.querySelector('.btn-data.bg-brand-500');
                if (btnData) selecionarData(btnData, dataSelecionada);
            }
        }
    } catch (err) {
        alert('Não foi possível conectar ao servidor Python.');
        btn.disabled = false;
        btn.textContent = 'Confirmar Agendamento';
    }
}

// Ao abrir a página, busca os serviços no servidor
carregarServicos();