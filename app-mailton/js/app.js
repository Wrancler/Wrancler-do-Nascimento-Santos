// Página do cliente — Mailton Maia
const NUMERO_MAILTON = '5583988856096';

let servicoSelecionadoId = null;
let servicoNomeAtual = '';
let servicoValorAtual = '';
let dataSelecionada = null;
let horarioSelecionado = null;
let servicosCache = [];
let diasAtendimento = [1, 2, 3, 4, 5, 6]; // 0 = domingo ... 6 = sábado (atualizado pelo servidor)
let mesesAbertos = null;   // ['2026-11', '2026-12', ...] liberados pelo Mailton; null = ainda não sabemos
let agendaSemanal = false; // true quando o Mailton libera a agenda semana por semana
let semanasAbertas = [];   // segundas-feiras ('YYYY-MM-DD') das semanas liberadas
let mesSelecionado = null;
let linkCancelamentoAtual = '';
let enviando = false;
let temporizadorWhats = null;
const ESPERA_WHATSAPP_MS = 3500; // tempo para ela ver o "Agendado!" antes de abrir o WhatsApp

const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SIGLAS_MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const DIAS_SEMANA_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const $ = id => document.getElementById(id);

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

function textoDia(dataSQL) {
    const [a, m, d] = dataSQL.split('-').map(Number);
    const dt = new Date(a, m - 1, d);
    return `${DIAS_SEMANA_LONGO[dt.getDay()]}, ${d} de ${NOMES_MESES[m - 1].toLowerCase()}`;
}

// --- LISTA DE SERVIÇOS (vem do banco; o Mailton edita pelo painel) ---
// Permite quebrar "Micropigmentação" com hífen (Micro-pigmentação) em vez de cortar no meio da sílaba
function nomeComHifen(nome) {
    return escaparHtml(nome).replace(/micropigmenta/gi, m => m.slice(0, 5) + '&shy;' + m.slice(5));
}

function criarCardServico(s, comFotos) {
    if (comFotos) {
        // Estilo vitrine: foto grande, preço em selo, nome e tempo embaixo
        const midia = s.imagem
            ? `<img src="${escaparHtml(s.imagem)}" alt="" loading="lazy">`
            : '<div class="cartao-vazio"><span class="titulo-serifa texto-ouro">MM</span></div>';
        return `
        <button type="button" class="cartao" onclick="abrirModal(${Number(s.id)})">
            <div class="cartao-midia">${midia}<span class="preco-selo">${formatarValorCurto(s.valor)}</span></div>
            <div class="cartao-corpo">
                <h3>${nomeComHifen(s.nome)}</h3>
                <div class="linha-info">
                    <span class="duracao"><i class="fa-regular fa-clock"></i> ${formatarDuracao(s.duracao_minutos)}</span>
                    <span class="agendar-chip"><i class="fa-solid fa-chevron-right"></i></span>
                </div>
            </div>
        </button>`;
    }
    // Sem nenhuma foto cadastrada ainda: cartão compacto
    return `
        <button type="button" class="cartao" onclick="abrirModal(${Number(s.id)})">
            <div class="cartao-col">
                <h3>${nomeComHifen(s.nome)}</h3>
                <span class="duracao"><i class="fa-regular fa-clock"></i> ${formatarDuracao(s.duracao_minutos)}</span>
            </div>
            <div class="cartao-rodape">
                <span class="preco texto-ouro">${formatarValorCurto(s.valor)}</span>
                <span class="agendar-chip"><i class="fa-solid fa-chevron-right"></i></span>
            </div>
        </button>`;
}

async function carregarServicos() {
    const lista = $('listaServicos');
    lista.innerHTML = '<p class="msg-vazia"><i class="fa-solid fa-spinner fa-spin"></i> Carregando serviços...</p>';

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
            agendaSemanal = !!expediente.semanal;
            semanasAbertas = expediente.semanas || [];
        }

        if (servicosCache.length === 0) {
            lista.innerHTML = '<p class="msg-vazia">Nenhum serviço disponível no momento. Fale com o Mailton pelo WhatsApp, logo abaixo.</p>';
            return;
        }
        const comFotos = servicosCache.some(s => s.imagem);
        lista.className = 'grade-servicos' + (comFotos ? ' com-fotos' : '');
        lista.innerHTML = servicosCache.map(s => criarCardServico(s, comFotos)).join('');
        // O aviso "Agenda aberta" só aparece se a cliente realmente tem algum dia para escolher
        const temDia = (mesesAbertos || []).some(m => diasDoMes(m).length > 0);
        $('statusAgenda').classList.toggle('oculto', !temDia);
    } catch (err) {
        console.error(err);
        lista.innerHTML = `
            <div class="msg-vazia erro">
                <p style="margin-bottom:12px">Não foi possível carregar os serviços.</p>
                <button type="button" class="btn-contorno" onclick="carregarServicos()">Tentar de novo</button>
            </div>`;
    }
}

// --- JANELA DE AGENDAMENTO ---
function mostrarAviso(texto) {
    const el = $('avisoModal');
    if (!texto) { el.classList.add('oculto'); el.textContent = ''; return; }
    el.textContent = texto;
    el.classList.remove('oculto');
}

function irParaPasso(passo) {
    $('passoDataHora').classList.toggle('oculto', passo !== 'datahora');
    $('passoDados').classList.toggle('oculto', passo !== 'dados');
    $('passoOk').classList.toggle('oculto', passo !== 'ok');
    $('trilha2').classList.toggle('feito', passo === 'datahora' || passo === 'dados' || passo === 'ok');
    $('trilha3').classList.toggle('feito', passo === 'dados' || passo === 'ok');
    const folha = document.querySelector('.folha');
    if (folha) folha.scrollTop = 0;
}

function voltarPasso() {
    mostrarAviso('');
    irParaPasso('datahora');
}

function abrirModal(id) {
    const servico = servicosCache.find(s => s.id === id);
    if (!servico) return;

    servicoSelecionadoId = servico.id;
    servicoNomeAtual = servico.nome;
    servicoValorAtual = formatarValor(servico.valor);

    $('modalServicoNome').textContent = servico.nome;
    const fotoModal = $('modalServicoFoto');
    if (servico.imagem) { fotoModal.src = servico.imagem; fotoModal.classList.remove('oculto'); }
    else { fotoModal.classList.add('oculto'); }
    $('modalServicoInfo').innerHTML =
        `<span class="chip-preco">${servicoValorAtual}</span>` +
        `<span class="chip-duracao"><i class="fa-regular fa-clock"></i> ${formatarDuracao(servico.duracao_minutos)}</span>`;

    mesSelecionado = null;
    mostrarAviso('');
    resetarSelecoes();
    gerarDatasCarrossel();
    irParaPasso('datahora');

    $('modalHorario').classList.remove('oculto');
    document.body.style.overflow = 'hidden';
}

function fecharModal() {
    clearTimeout(temporizadorWhats); // se ela fechou a janela, não abre o WhatsApp sozinho
    $('modalHorario').classList.add('oculto');
    document.body.style.overflow = '';
}

function resetarSelecoes() {
    dataSelecionada = null;
    horarioSelecionado = null;
    $('btnContinuar').disabled = true;
    $('gridHorarios').innerHTML = '<p class="msg-vazia">Toque em um dia acima para ver os horários.</p>';
}

// Segunda-feira da semana de uma data, como 'YYYY-MM-DD' (a semana vai de segunda a domingo)
function segundaDaSemana(data) {
    const segunda = new Date(data.getFullYear(), data.getMonth(), data.getDate() - ((data.getDay() + 6) % 7));
    return `${segunda.getFullYear()}-${String(segunda.getMonth() + 1).padStart(2, '0')}-${String(segunda.getDate()).padStart(2, '0')}`;
}

// Datas que a cliente pode escolher em um mês: de hoje até o fim, só dias de atendimento
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
        if (agendaSemanal && !semanasAbertas.includes(segundaDaSemana(data))) continue;
        dias.push(data);
    }
    return dias;
}

function gerarDatasCarrossel() {
    const abas = $('abasMeses');
    const container = $('carrosselDatas');
    const rotulo = $('mesAtualLabel');

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
        container.innerHTML = '<p class="msg-vazia" style="width:100%">A agenda ainda não está aberta. Fale com o Mailton pelo WhatsApp, no final da página.</p>';
        return;
    }

    if (!mesesComDias.includes(mesSelecionado)) mesSelecionado = mesesComDias[0];

    // Abas de mês (só aparecem quando há mais de um mês aberto)
    if (mesesComDias.length > 1) {
        mesesComDias.forEach(anoMes => {
            const [, mes] = anoMes.split('-').map(Number);
            const aba = document.createElement('button');
            aba.type = 'button';
            aba.className = 'aba-mes' + (anoMes === mesSelecionado ? ' ativa' : '');
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
        btn.className = 'btn-data';
        btn.dataset.data = dataFormatada;
        btn.innerHTML = `
            <span class="ds">${DIAS_SEMANA[data.getDay()]}</span>
            <span class="dn">${diaStr}</span>
            <span class="dm">${SIGLAS_MESES[data.getMonth()]}</span>`;
        btn.onclick = () => selecionarData(btn, dataFormatada);
        container.appendChild(btn);
    });
}

function periodoDaHora(hhmm) {
    const h = parseInt(hhmm.split(':')[0], 10);
    if (h < 12) return { chave: 'manha', nome: 'Manhã', icone: 'fa-sun' };
    if (h < 18) return { chave: 'tarde', nome: 'Tarde', icone: 'fa-cloud-sun' };
    return { chave: 'noite', nome: 'Noite', icone: 'fa-moon' };
}

async function selecionarData(botao, dataFormatoSQL) {
    dataSelecionada = dataFormatoSQL;
    horarioSelecionado = null;
    $('btnContinuar').disabled = true;
    mostrarAviso('');

    document.querySelectorAll('.btn-data').forEach(b => b.classList.remove('selecionado'));
    botao.classList.add('selecionado');

    const grid = $('gridHorarios');
    grid.innerHTML = '<p class="msg-vazia"><i class="fa-solid fa-spinner fa-spin"></i> Buscando horários...</p>';

    try {
        const response = await fetch(`/api/horarios?data=${dataSelecionada}&servico_id=${servicoSelecionadoId}`);
        if (!response.ok) throw new Error('Erro na comunicação');

        const resultado = await response.json();
        if (dataSelecionada !== dataFormatoSQL) return; // a cliente já tocou em outro dia
        const horarios = resultado.horarios;
        grid.innerHTML = '';

        if (horarios.length === 0) {
            // O servidor diz o motivo (mês fechado, dia bloqueado...). Sem motivo = dia lotado.
            const mensagem = resultado.mensagem || 'Agenda lotada neste dia. Tente outro dia.';
            grid.innerHTML = `<p class="msg-vazia erro"><i class="fa-regular fa-calendar-xmark"></i> ${escaparHtml(mensagem)}</p>`;
            return;
        }

        // Agrupa em Manhã / Tarde / Noite
        const grupos = {};
        horarios.forEach(h => {
            const p = periodoDaHora(h);
            (grupos[p.chave] = grupos[p.chave] || { info: p, horas: [] }).horas.push(h);
        });

        ['manha', 'tarde', 'noite'].forEach(chave => {
            const g = grupos[chave];
            if (!g) return;
            const titulo = document.createElement('p');
            titulo.className = 'periodo';
            titulo.innerHTML = `<i class="fa-solid ${g.info.icone}"></i> ${g.info.nome}`;
            grid.appendChild(titulo);

            const grade = document.createElement('div');
            grade.className = 'grade-horas';
            g.horas.forEach(hora => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'opcao btn-horario';
                btn.textContent = hora;
                btn.onclick = () => selecionarHorario(btn, hora);
                grade.appendChild(btn);
            });
            grid.appendChild(grade);
        });

        $('blocoHorarios').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
        console.error(err);
        grid.innerHTML = '<p class="msg-vazia erro">Não foi possível buscar os horários. Verifique sua internet e toque no dia de novo.</p>';
    }
}

function selecionarHorario(botao, horario) {
    horarioSelecionado = horario;
    document.querySelectorAll('.btn-horario').forEach(b => b.classList.remove('selecionado'));
    botao.classList.add('selecionado');
    $('btnContinuar').disabled = false;
}

function continuarParaDados() {
    if (!dataSelecionada || !horarioSelecionado) return;
    $('resumoDia').textContent = textoDia(dataSelecionada);
    $('resumoHora').textContent = horarioSelecionado;
    $('resumoServico').textContent = servicoNomeAtual;
    $('resumoValor').textContent = servicoValorAtual;
    mostrarAviso('');
    irParaPasso('dados');
}

// Máscara (83) 99999-9999
function mascararTelefone(el) {
    let n = el.value.replace(/\D/g, '').slice(0, 11);
    if (n.length > 6) {
        const fim = n.length > 10 ? 7 : 6;
        el.value = `(${n.slice(0, 2)}) ${n.slice(2, fim)}-${n.slice(fim)}`;
    } else if (n.length > 2) {
        el.value = `(${n.slice(0, 2)}) ${n.slice(2)}`;
    } else if (n.length > 0) {
        el.value = `(${n}`;
    } else {
        el.value = '';
    }
}

async function enviarAgendamento() {
    if (enviando) return;
    const nome = $('clienteNome').value.trim();
    const telefone = $('clienteTelefone').value.trim();
    const digitos = telefone.replace(/\D/g, '');

    if (nome.length < 2) { mostrarAviso('Por favor, digite o seu nome.'); $('clienteNome').focus(); return; }
    if (digitos.length < 10) { mostrarAviso('Digite o seu WhatsApp com DDD. Exemplo: (83) 99999-9999.'); $('clienteTelefone').focus(); return; }
    if (!dataSelecionada || !horarioSelecionado) { mostrarAviso('Escolha o dia e o horário.'); irParaPasso('datahora'); return; }

    mostrarAviso('');
    enviando = true;
    const btn = $('btnConfirmar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aguarde...';

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
        const resultado = await response.json().catch(() => ({}));

        if (response.ok) {
            mostrarConfirmacao(nome, telefone, resultado.token_cancelamento);
        } else if (response.status === 409) {
            // Outra pessoa pegou o horário enquanto esta cliente escolhia
            irParaPasso('datahora');
            mostrarAviso(resultado.erro || 'Esse horário acabou de ser ocupado. Escolha outro, por favor.');
            const btnData = document.querySelector(`.btn-data[data-data="${dataSelecionada}"]`);
            if (btnData) selecionarData(btnData, dataSelecionada);
        } else {
            mostrarAviso(resultado.erro || 'Não foi possível agendar agora. Tente de novo em instantes.');
        }
    } catch (err) {
        console.error(err);
        mostrarAviso('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
    } finally {
        enviando = false;
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar agendamento';
    }
}

function mostrarConfirmacao(nome, telefone, token) {
    const dataBR = dataSelecionada.split('-').reverse().join('/');
    linkCancelamentoAtual = `${window.location.origin}/cancelar/${token}`;

    $('okNome').textContent = nome.split(' ')[0] + ', seu horário está reservado.';
    $('okServico').textContent = servicoNomeAtual;
    $('okData').textContent = textoDia(dataSelecionada);
    $('okHora').textContent = horarioSelecionado;
    $('okValor').textContent = servicoValorAtual;
    $('textoCopiar').textContent = 'Copiar link para cancelar';

    const texto = `✅ *NOVO AGENDAMENTO SITE!*\n\nOlá Mailton! Acabei de me agendar pelo seu sistema:\n\n👤 *Cliente:* ${nome}\n📱 *WhatsApp:* ${telefone}\n✨ *Serviço:* ${servicoNomeAtual} (${servicoValorAtual})\n📅 *Data:* ${dataBR} às ${horarioSelecionado}\n\n🔗 *Meu link para cancelar (caso precise):*\n${linkCancelamentoAtual}`;
    const linkWhats = `https://api.whatsapp.com/send?phone=${NUMERO_MAILTON}&text=${encodeURIComponent(texto)}`;
    $('btnWhats').href = linkWhats;
    guardarMeuAgendamento({ token, link: linkWhats });

    mostrarAviso('');
    irParaPasso('ok');
    prepararEnvioWhatsApp(linkWhats);
}

// Depois de agendar, abre o WhatsApp do Mailton com a mensagem pronta (a cliente só toca em enviar).
// O agendamento já está salvo no sistema: o WhatsApp é só o aviso para ele.
function prepararEnvioWhatsApp(link) {
    clearTimeout(temporizadorWhats);
    const caixa = $('envioWhats');
    caixa.classList.remove('feito');
    $('envioWhatsTexto').querySelector('span').textContent = 'Abrindo o WhatsApp para avisar o Mailton...';
    // reinicia a barrinha de espera
    const barra = $('barraEspera').firstElementChild;
    barra.style.animation = 'none'; void barra.offsetWidth; barra.style.animation = '';
    barra.style.animationDuration = `${ESPERA_WHATSAPP_MS}ms`;

    temporizadorWhats = setTimeout(() => {
        caixa.classList.add('feito');
        $('envioWhatsTexto').querySelector('span').textContent = 'Se o WhatsApp não abriu, toque no botão abaixo.';
        abrirWhatsApp(link);
    }, ESPERA_WHATSAPP_MS);
}

// Guarda neste aparelho o último horário marcado, para a cliente ver que ficou reservado ao voltar do WhatsApp
function guardarMeuAgendamento({ token, link }) {
    try { localStorage.setItem('meuAgendamento', JSON.stringify({ token, link })); } catch (e) { /* sem armazenamento: tudo bem */ }
}

async function mostrarMeuAgendamento() {
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem('meuAgendamento') || 'null'); } catch (e) { return; }
    if (!guardado || !guardado.token) return;
    try {
        const resp = await fetch(`/api/meu-agendamento/${encodeURIComponent(guardado.token)}`);
        if (!resp.ok) return;
        const ag = await resp.json();
        if (!ag.ativo) { try { localStorage.removeItem('meuAgendamento'); } catch (e) {} return; }
        $('meuQuando').textContent = `${textoDia(ag.data)}, às ${ag.hora}`;
        $('meuServico').textContent = ag.servico;
        $('meuWhats').href = guardado.link;
        $('meuCancelar').href = `/cancelar/${encodeURIComponent(guardado.token)}`;
        $('meuAgendamento').classList.remove('oculto');
    } catch (e) { /* sem internet: simplesmente não mostra */ }
}

function abrirWhatsApp(link) {
    // No celular, vai direto para o app. No computador, abre em outra aba para não perder esta página.
    const celular = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (celular) { window.location.href = link; return; }
    const aba = window.open(link, '_blank');
    if (!aba) window.location.href = link; // bloqueado pelo navegador: abre na mesma aba
}

async function copiarLinkCancelamento() {
    const rotulo = $('textoCopiar');
    try {
        await navigator.clipboard.writeText(linkCancelamentoAtual);
        rotulo.textContent = 'Link copiado!';
    } catch (e) {
        window.prompt('Copie o link abaixo:', linkCancelamentoAtual);
    }
}

// --- GALERIA (aparece só quando existem fotos em img/galeria) ---
let fotosGaleria = [];
let fotoAtual = 0;

async function carregarGaleria() {
    try {
        const resp = await fetch('/api/galeria');
        if (!resp.ok) return;
        fotosGaleria = await resp.json();
        if (!fotosGaleria.length) return;
        $('galeriaGrade').innerHTML = fotosGaleria.map((url, i) =>
            `<button type="button" onclick="abrirFoto(${i})" aria-label="Ver foto ${i + 1}"><img src="${escaparHtml(url)}" alt="Trabalho do Mailton ${i + 1}" loading="lazy"></button>`
        ).join('');
        $('secaoGaleria').classList.remove('oculto');
    } catch (e) { /* sem galeria: tudo bem */ }
}

function abrirFoto(i) {
    fotoAtual = i;
    $('visorImg').src = fotosGaleria[fotoAtual];
    $('visorFoto').classList.remove('oculto');
}
function mudarFoto(delta) {
    if (!fotosGaleria.length) return;
    fotoAtual = (fotoAtual + delta + fotosGaleria.length) % fotosGaleria.length;
    $('visorImg').src = fotosGaleria[fotoAtual];
}
function fecharFoto() { $('visorFoto').classList.add('oculto'); }

// --- EFEITOS (respeitam "reduzir movimento") ---
function iniciarParticulas() {
    const canvas = $('particulas');
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    let w, h, pts = [];
    function ajustar() {
        w = canvas.width = canvas.offsetWidth;
        h = canvas.height = Math.min(canvas.offsetHeight, 900);
        pts = Array.from({ length: 34 }, () => ({
            x: Math.random() * w, y: Math.random() * h,
            r: Math.random() * 1.6 + 0.4, v: Math.random() * 0.25 + 0.05, a: Math.random() * 0.5 + 0.15
        }));
    }
    function quadro() {
        ctx.clearRect(0, 0, w, h);
        pts.forEach(p => {
            p.y -= p.v; if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
            ctx.fillStyle = `rgba(212,175,55,${p.a})`; ctx.fill();
        });
        requestAnimationFrame(quadro);
    }
    ajustar(); quadro();
    window.addEventListener('resize', ajustar);
}

function iniciarRevelacao() {
    const itens = document.querySelectorAll('.revela');
    if (!('IntersectionObserver' in window)) { itens.forEach(i => i.classList.add('visivel')); return; }
    const obs = new IntersectionObserver(entradas => {
        entradas.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visivel'); obs.unobserve(e.target); } });
    }, { threshold: 0.08 });
    itens.forEach(i => obs.observe(i));
}

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('visorFoto').classList.contains('oculto')) fecharFoto();
    else if (!$('modalHorario').classList.contains('oculto')) fecharModal();
});

document.addEventListener('DOMContentLoaded', () => {
    $('clienteTelefone').addEventListener('input', e => mascararTelefone(e.target));
    mostrarMeuAgendamento();
});

async function carregarSobre() {
    try {
        const resp = await fetch('/api/sobre');
        if (!resp.ok) return;
        const dados = await resp.json();
        if (dados.texto) $('textoSobreCliente').textContent = dados.texto;  // textContent: texto nunca vira HTML
    } catch (e) { /* mantém o texto que já está na página */ }
}

carregarServicos();
carregarGaleria();
carregarSobre();
iniciarParticulas();
iniciarRevelacao();
