    
        let servicoSelecionadoId = null;
        let servicoNomeAtual = '';
        let servicoValorAtual = '';
        let dataSelecionada = null;
        let horarioSelecionado = null;

        function abrirModal(id, nome, valor, duracao) {
            servicoSelecionadoId = id;
            servicoNomeAtual = nome;
            servicoValorAtual = valor;
            
            document.getElementById('modalServicoNome').textContent = nome;
            document.getElementById('modalServicoInfo').textContent = `${valor} • ${duracao}`;
            
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

        // Gera os próximos 15 dias (pulando domingos)
        function gerarDatasCarrossel() {
            const container = document.getElementById('carrosselDatas');
            container.innerHTML = '';
            
            const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
            
            const hoje = new Date();
            document.getElementById('mesAtualLabel').textContent = meses[hoje.getMonth()];

            for(let i = 0; i < 20; i++) {
                let data = new Date();
                data.setDate(hoje.getDate() + i);

                // Se for domingo (0), não cria o botão
                if(data.getDay() === 0) continue;

                const diaStr = String(data.getDate()).padStart(2, '0');
                const mesStr = String(data.getMonth() + 1).padStart(2, '0');
                const anoStr = data.getFullYear();
                const dataFormatada = `${anoStr}-${mesStr}-${diaStr}`;
                
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-data flex-none snap-start flex flex-col items-center justify-center p-3 rounded-xl min-w-[70px] border border-gray-700 bg-dark-800 text-gray-300 transition hover:border-brand-500';
                
                btn.innerHTML = `
                    <span class="text-[10px] font-medium mb-1 tracking-wider">${diasSemana[data.getDay()]}</span>
                    <span class="text-xl font-bold">${diaStr}</span>
                `;

                btn.onclick = () => selecionarData(btn, dataFormatada);
                container.appendChild(btn);
            }
        }

        async function selecionarData(botao, dataFormatoSQL) {
            dataSelecionada = dataFormatoSQL;
            
            // Estilização dos botões de data
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
                // É AQUI que ele vai buscar no Python. O Python DEVE estar rodando!
                const response = await fetch(`http://127.0.0.1:5000/api/horarios?data=${dataSelecionada}`);
                if (!response.ok) throw new Error('Erro na comunicação');
                
                const horarios = await response.json();
                grid.innerHTML = ''; 

                if (horarios.length === 0) {
                    grid.innerHTML = '<p class="text-xs text-red-400 col-span-3 text-center py-4 bg-red-500/10 rounded-xl border border-red-500/20"><i class="fa-solid fa-calendar-xmark mr-2"></i>Agenda lotada neste dia.</p>';
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
                const response = await fetch('http://127.0.0.1:5000/api/agendar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const resultado = await response.json();

                if (response.ok) {
                    const numeroMailton = "5583900000000"; 
                    const dataBR = dataSelecionada.split('-').reverse().join('/'); 
                    const linkCancelamento = `http://127.0.0.1:5000/cancelar/${resultado.token_cancelamento}`;

                    const textoWhatsApp = `✅ *NOVO AGENDAMENTO SITE!*\n\nOlá Mailton! Acabei de me agendar pelo seu sistema:\n\n👤 *Cliente:* ${nome}\n📱 *WhatsApp:* ${telefone}\n✨ *Serviço:* ${servicoNomeAtual} (${servicoValorAtual})\n📅 *Data:* ${dataBR} às ${horarioSelecionado}\n\n🔗 *Meu link para cancelar (caso precise):*\n${linkCancelamento}`;
                    
                    window.location.href = `https://api.whatsapp.com/send?phone=${numeroMailton}&text=${encodeURIComponent(textoWhatsApp)}`;
                } else {
                    alert('Erro: ' + (resultado.erro || 'Falha ao agendar'));
                    btn.disabled = false;
                    btn.textContent = 'Confirmar Agendamento';
                }
            } catch (err) {
                alert('Não foi possível conectar ao servidor Python.');
                btn.disabled = false;
                btn.textContent = 'Confirmar Agendamento';
            }
        }
    