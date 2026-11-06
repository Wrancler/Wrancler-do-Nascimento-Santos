from flask import Flask, request, jsonify, render_template, send_from_directory, Response
from urllib.parse import quote
from PIL import Image, ImageOps
from werkzeug.security import check_password_hash, generate_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from functools import wraps
from datetime import datetime, timedelta, timezone
import sqlite3
import uuid
import os
import re
import time
import hmac
import hashlib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# static_folder=None porque vamos servir os arquivos (css/js/img) manualmente abaixo,
# mantendo os mesmos caminhos relativos que o index.html e o admin.html já usam.
app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 40 * 1024 * 1024  # fotos de celular são grandes; o servidor reduz
Image.MAX_IMAGE_PIXELS = 80_000_000

def garantir_estrutura():
    """Bancos antigos ganham a coluna da foto do serviço sozinhos (sem precisar rodar nada)."""
    conn = sqlite3.connect(os.path.join(BASE_DIR, 'wn_beauty_system.db'))
    try:
        colunas = {l[1] for l in conn.execute("PRAGMA table_info(servicos)")}
        if colunas and 'imagem' not in colunas:
            conn.execute("ALTER TABLE servicos ADD COLUMN imagem TEXT")
            conn.commit()
    finally:
        conn.close()


def get_db_connection():
    conn = sqlite3.connect(os.path.join(BASE_DIR, 'wn_beauty_system.db'))
    conn.row_factory = sqlite3.Row
    return conn

try:
    garantir_estrutura()
except sqlite3.Error:
    pass

# --- REGRAS DA AGENDA ---
FUSO_BRASIL = timezone(timedelta(hours=-3))  # o servidor do PythonAnywhere roda em UTC

MENSAGENS_INDISPONIVEL = {
    'data_invalida': 'Data inválida.',
    'data_passada': 'Essa data já passou.',
    'mes_fechado': 'A agenda deste mês ainda não foi aberta.',
    'sem_expediente': 'Não há atendimento neste dia.',
    'dia_bloqueado': 'Este dia não está disponível para agendamento.',
}

def agora_brasil():
    return datetime.now(FUSO_BRASIL).replace(tzinfo=None)

def hora_para_minutos(hhmm):
    h, m = hhmm.split(':')
    return int(h) * 60 + int(m)

def minutos_para_hora(minutos):
    return f"{minutos // 60:02d}:{minutos % 60:02d}"

def obter_intervalo(conn):
    """De quanto em quanto tempo os horários são oferecidos (padrão 30 min)."""
    linha = conn.execute("SELECT valor FROM configuracoes WHERE chave = 'intervalo_min'").fetchone()
    try:
        valor = int(linha['valor'])
    except (TypeError, ValueError):
        return 30
    return valor if 5 <= valor <= 240 else 30

def dia_da_semana(data):
    """0 = domingo ... 6 = sábado (mesmo padrão do JavaScript)."""
    return (datetime.strptime(data, '%Y-%m-%d').weekday() + 1) % 7

def obter_faixas_do_dia(conn, dia_semana):
    """Faixas de atendimento do dia, em minutos: [(inicio, fim), ...]"""
    linhas = conn.execute(
        "SELECT inicio, fim FROM expediente WHERE dia_semana = ? ORDER BY inicio", (dia_semana,)
    ).fetchall()
    return [(hora_para_minutos(l['inicio']), hora_para_minutos(l['fim'])) for l in linhas]

def gerar_grade(conn, data):
    """Todos os inícios possíveis no dia, de intervalo em intervalo, dentro de cada faixa."""
    intervalo = obter_intervalo(conn)
    grade = []
    for inicio, fim in obter_faixas_do_dia(conn, dia_da_semana(data)):
        t = inicio
        while t + intervalo <= fim:
            grade.append(minutos_para_hora(t))
            t += intervalo
    return grade

def calcular_horarios_livres(conn, data, duracao_min):
    """Devolve (horarios_livres, motivo). O motivo é None quando a agenda do dia está aberta.
    Um horário só fica livre se o serviço inteiro (início + duração) couber dentro da faixa
    de atendimento e sem encostar em outro agendamento ou em um bloqueio do admin."""
    try:
        dia = datetime.strptime(data, '%Y-%m-%d')
    except (ValueError, TypeError):
        return [], 'data_invalida'

    agora = agora_brasil()
    if dia.date() < agora.date():
        return [], 'data_passada'

    # Mês que não foi aberto pelo admin = fechado (mesmo padrão da tela de Configurações)
    mes = conn.execute("SELECT status FROM meses_abertos WHERE ano_mes = ?", (data[:7],)).fetchone()
    if not mes or mes['status'] != 'aberto':
        return [], 'mes_fechado'

    faixas = obter_faixas_do_dia(conn, dia_da_semana(data))
    if not faixas:
        return [], 'sem_expediente'

    dia_bloqueado = conn.execute(
        "SELECT 1 FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NULL", (data,)
    ).fetchone()
    if dia_bloqueado:
        return [], 'dia_bloqueado'

    intervalo = obter_intervalo(conn)

    # Intervalos já ocupados no dia, em minutos: (início, fim)
    ocupados = []
    for b in conn.execute(
        "SELECT hora_bloqueio FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NOT NULL", (data,)
    ):
        inicio = hora_para_minutos(b['hora_bloqueio'])
        ocupados.append((inicio, inicio + intervalo))

    agendados = conn.execute('''
        SELECT strftime('%H:%M', a.data_hora) AS hora,
               COALESCE(a.duracao_minutos, s.duracao_minutos) AS duracao
        FROM agendamentos a
        JOIN servicos s ON a.servico_id = s.id
        WHERE date(a.data_hora) = ? AND a.status != 'cancelado'
    ''', (data,)).fetchall()
    for ag in agendados:
        inicio = hora_para_minutos(ag['hora'])
        ocupados.append((inicio, inicio + ag['duracao']))

    # Se for hoje, horários que já passaram não aparecem
    minutos_agora = agora.hour * 60 + agora.minute if dia.date() == agora.date() else -1

    livres = []
    for faixa_inicio, faixa_fim in faixas:
        t = faixa_inicio
        while t + duracao_min <= faixa_fim:
            fim_servico = t + duracao_min
            if t > minutos_agora and not any(t < o_fim and o_inicio < fim_servico for o_inicio, o_fim in ocupados):
                livres.append(minutos_para_hora(t))
            t += intervalo
    return livres, None


# --- ROTAS DE PÁGINAS E ARQUIVOS ESTÁTICOS ---
def url_base_publica():
    """Endereço público do site (para a prévia do link no WhatsApp)."""
    return request.host_url.rstrip('/')

@app.route('/')
def pagina_cliente():
    with open(os.path.join(BASE_DIR, 'index.html'), encoding='utf-8') as f:
        html = f.read().replace('__BASE_URL__', url_base_publica())
    resposta = Response(html, mimetype='text/html')
    resposta.headers['Cache-Control'] = 'no-cache'
    return resposta

PASTA_GALERIA = os.path.join(BASE_DIR, 'img', 'galeria')
PASTA_SERVICOS = os.path.join(BASE_DIR, 'img', 'servicos')
EXTENSOES_FOTO = ('.jpg', '.jpeg', '.png', '.webp')
TEXTO_SOBRE_PADRAO = ('Especialista em sobrancelhas e micropigmentação, com atendimento cuidadoso e '
                      'personalizado para realçar a sua beleza de forma natural.')


def fotos_da_galeria():
    """Nomes das fotos em img/galeria, da mais nova para a mais antiga."""
    if not os.path.isdir(PASTA_GALERIA):
        return []
    nomes = [n for n in os.listdir(PASTA_GALERIA) if n.lower().endswith(EXTENSOES_FOTO)]
    nomes.sort(key=lambda n: (os.path.getmtime(os.path.join(PASTA_GALERIA, n)), n), reverse=True)
    return nomes[:60]


@app.route('/api/galeria')
def listar_galeria():
    """Fotos que o Mailton enviar pelo painel (ou colocar na pasta img/galeria) aparecem na página."""
    return jsonify(['/img/galeria/' + quote(n) for n in fotos_da_galeria()])


@app.route('/api/sobre')
def texto_sobre_publico():
    conn = get_db_connection()
    try:
        linha = conn.execute("SELECT valor FROM configuracoes WHERE chave = 'sobre_texto'").fetchone()
    finally:
        conn.close()
    return jsonify({'texto': linha['valor'] if linha else TEXTO_SOBRE_PADRAO})

@app.route('/admin')
@app.route('/admin.html')
def pagina_admin():
    return send_from_directory(BASE_DIR, 'admin.html')

@app.route('/css/<path:nome_arquivo>')
def arquivos_css(nome_arquivo):
    return send_from_directory(os.path.join(BASE_DIR, 'css'), nome_arquivo)

@app.route('/js/<path:nome_arquivo>')
def arquivos_js(nome_arquivo):
    return send_from_directory(os.path.join(BASE_DIR, 'js'), nome_arquivo)

@app.route('/img/<path:nome_arquivo>')
def arquivos_img(nome_arquivo):
    return send_from_directory(os.path.join(BASE_DIR, 'img'), nome_arquivo)

# --- CONFIGURAÇÃO DE SEGURANÇA DO PAINEL ADMIN ---
# IMPORTANTE: em produção, defina estas variáveis de ambiente ANTES de rodar o servidor
# (nunca deixe a senha real em texto puro no código).
SECRET_KEY = os.environ.get('WN_SECRET_KEY', 'troque-esta-chave-antes-de-ir-para-producao')
# Senha INICIAL do painel. Vale só até o Mailton trocar a senha pelo próprio painel:
# a partir daí a senha dele fica guardada (criptografada) no banco e esta é ignorada.
ADMIN_PASSWORD_HASH = os.environ.get(
    'WN_ADMIN_PASSWORD_HASH',
    generate_password_hash('2020')  # senha padrão só para testar localmente
)
TOKEN_MAX_AGE_SEGUNDOS = 60 * 60 * 8  # o login expira depois de 8 horas

MAX_FALHAS_LOGIN = 8          # tentativas erradas permitidas...
JANELA_LOGIN_SEG = 15 * 60    # ...a cada 15 minutos, por aparelho/IP
SENHAS_FRACAS = {
    '123456', '1234567', '12345678', '123456789', '000000', '111111', '123123',
    'senha', 'senha123', 'mailton', 'mailton123', 'abc123', 'admin', 'admin123',
    'qwerty', '2020', '7195',
}

serializer = URLSafeTimedSerializer(SECRET_KEY)


def obter_hash_admin(conn):
    """Senha em uso: a que o Mailton definiu no painel (guardada no banco) ou, se ele nunca trocou, a inicial."""
    try:
        linha = conn.execute("SELECT valor FROM configuracoes WHERE chave = 'admin_senha_hash'").fetchone()
    except sqlite3.OperationalError:
        return ADMIN_PASSWORD_HASH
    return linha['valor'] if linha else ADMIN_PASSWORD_HASH


def impressao_senha(hash_senha):
    """Identificador da senha atual. Entra dentro do login: trocar a senha derruba todos os logins antigos."""
    return hashlib.sha256(hash_senha.encode('utf-8')).hexdigest()[:16]


def gerar_token_admin(hash_senha):
    return serializer.dumps({'admin': True, 'v': impressao_senha(hash_senha)})


def token_valido(token):
    try:
        dados = serializer.loads(token, max_age=TOKEN_MAX_AGE_SEGUNDOS)
    except (BadSignature, SignatureExpired):
        return False
    if dados.get('admin') is not True:
        return False
    conn = get_db_connection()
    try:
        hash_atual = obter_hash_admin(conn)
    finally:
        conn.close()
    return hmac.compare_digest(str(dados.get('v', '')), impressao_senha(hash_atual))


def requer_login_admin(funcao):
    """Decorador: bloqueia a rota se não vier um token válido no header Authorization."""
    @wraps(funcao)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"erro": "Não autenticado"}), 401
        token = auth_header.split(' ', 1)[1]
        if not token_valido(token):
            return jsonify({"erro": "Sessão inválida ou expirada"}), 401
        return funcao(*args, **kwargs)
    return wrapper


# --- PROTEÇÃO CONTRA ADIVINHAÇÃO DE SENHA ---
def ip_do_cliente():
    return (request.headers.get('X-Real-IP') or request.remote_addr or 'desconhecido')[:64]


def login_bloqueado(conn, ip):
    """True se este IP errou a senha vezes demais nos últimos minutos."""
    conn.execute('''CREATE TABLE IF NOT EXISTS tentativas_login (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, momento INTEGER NOT NULL)''')
    conn.execute("DELETE FROM tentativas_login WHERE momento < ?", (int(time.time()) - JANELA_LOGIN_SEG,))
    falhas = conn.execute("SELECT COUNT(*) FROM tentativas_login WHERE ip = ?", (ip,)).fetchone()[0]
    return falhas >= MAX_FALHAS_LOGIN


def registrar_falha_login(conn, ip):
    conn.execute("INSERT INTO tentativas_login (ip, momento) VALUES (?, ?)", (ip, int(time.time())))


def limpar_falhas_login(conn, ip):
    conn.execute("DELETE FROM tentativas_login WHERE ip = ?", (ip,))


MENSAGEM_MUITAS_TENTATIVAS = "Muitas tentativas erradas. Aguarde 15 minutos e tente de novo."


# --- ROTA DE LOGIN DO ADMIN ---
@app.route('/api/admin/login', methods=['POST'])
def login_admin():
    dados = request.get_json(silent=True) or {}
    senha = str(dados.get('senha', ''))
    ip = ip_do_cliente()

    conn = get_db_connection()
    try:
        if login_bloqueado(conn, ip):
            conn.commit()
            return jsonify({"erro": MENSAGEM_MUITAS_TENTATIVAS}), 429

        hash_atual = obter_hash_admin(conn)
        if check_password_hash(hash_atual, senha):
            limpar_falhas_login(conn, ip)
            conn.commit()
            return jsonify({"token": gerar_token_admin(hash_atual)})

        registrar_falha_login(conn, ip)
        conn.commit()
        return jsonify({"erro": "Senha incorreta"}), 401
    finally:
        conn.close()


def validar_senha_nova(nova, atual):
    """Devolve a mensagem de erro, ou None se a senha nova é aceitável."""
    if not 6 <= len(nova) <= 64:
        return "A nova senha deve ter de 6 a 64 caracteres."
    if nova == atual:
        return "A nova senha precisa ser diferente da atual."
    if nova.lower() in SENHAS_FRACAS or len(set(nova)) == 1:
        return "Essa senha é muito fácil de adivinhar. Escolha outra."
    return None


# --- ADMIN: trocar a senha do painel ---
@app.route('/api/admin/senha', methods=['POST'])
@requer_login_admin
def admin_trocar_senha():
    dados = request.get_json(silent=True) or {}
    atual = str(dados.get('senha_atual') or '')
    nova = str(dados.get('senha_nova') or '')
    ip = ip_do_cliente()

    conn = get_db_connection()
    try:
        if login_bloqueado(conn, ip):
            conn.commit()
            return jsonify({"erro": MENSAGEM_MUITAS_TENTATIVAS}), 429

        hash_atual = obter_hash_admin(conn)
        if not check_password_hash(hash_atual, atual):
            registrar_falha_login(conn, ip)
            conn.commit()
            # 400 (e não 401) de propósito: 401 faz o painel achar que o login expirou
            return jsonify({"erro": "A senha atual está incorreta."}), 400

        erro = validar_senha_nova(nova, atual)
        if erro:
            return jsonify({"erro": erro}), 400

        novo_hash = generate_password_hash(nova)
        conn.execute(
            "INSERT INTO configuracoes (chave, valor) VALUES ('admin_senha_hash', ?) "
            "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (novo_hash,)
        )
        limpar_falhas_login(conn, ip)
        conn.commit()
    finally:
        conn.close()

    # Devolve um login novo para quem trocou a senha não ser desconectado
    return jsonify({"mensagem": "Senha alterada com sucesso!", "token": gerar_token_admin(novo_hash)})


# --- ROTA 1: Enviar os serviços para o HTML ---
@app.route('/api/servicos', methods=['GET'])
def listar_servicos():
    conn = get_db_connection()
    servicos = conn.execute(
        'SELECT id, nome, duracao_minutos, valor, imagem FROM servicos WHERE profissional_id = 1 AND ativo = 1 ORDER BY ordem, id'
    ).fetchall()
    conn.close()
    resultado = []
    for servico in servicos:
        item = dict(servico)
        item['imagem'] = ('/img/servicos/' + quote(item['imagem'])) if item['imagem'] else None
        resultado.append(item)
    return jsonify(resultado)

# --- ROTA 1B: Dias de atendimento (usado pelo calendário do cliente) ---
@app.route('/api/expediente', methods=['GET'])
def expediente_publico():
    conn = get_db_connection()
    dias = [l['dia_semana'] for l in conn.execute("SELECT DISTINCT dia_semana FROM expediente ORDER BY dia_semana")]
    intervalo = obter_intervalo(conn)
    # Meses que o Mailton liberou (do mês atual em diante): o calendário do cliente só mostra esses
    mes_atual = agora_brasil().strftime('%Y-%m')
    meses = [l['ano_mes'] for l in conn.execute(
        "SELECT ano_mes FROM meses_abertos WHERE status = 'aberto' AND ano_mes >= ? ORDER BY ano_mes", (mes_atual,)
    )]
    conn.close()
    return jsonify({"dias": dias, "intervalo": intervalo, "meses": meses})

# --- ROTA 2: Receber e gravar o agendamento ---
@app.route('/api/agendar', methods=['POST'])
def criar_agendamento():
    dados = request.get_json(silent=True) or {}

    nome_cliente = (dados.get('nome_cliente') or '').strip()[:80]
    telefone_cliente = re.sub(r'\D', '', str(dados.get('telefone_cliente') or ''))
    servico_id = dados.get('servico_id')
    data_hora = (dados.get('data_hora') or '').strip()

    if not all([nome_cliente, telefone_cliente, servico_id, data_hora]):
        return jsonify({"erro": "Faltam dados obrigatórios"}), 400
    if len(nome_cliente) < 2:
        return jsonify({"erro": "Informe seu nome completo."}), 400
    if not 10 <= len(telefone_cliente) <= 13:
        return jsonify({"erro": "Informe um WhatsApp válido, com DDD."}), 400
    try:
        datetime.strptime(data_hora, '%Y-%m-%d %H:%M')
    except ValueError:
        return jsonify({"erro": "Data ou horário inválido."}), 400

    data, hora = data_hora.split(' ')

    conn = get_db_connection()
    try:
        # Trava o banco até o fim: evita que duas pessoas peguem o mesmo horário ao mesmo tempo
        conn.execute("BEGIN IMMEDIATE")

        servico = conn.execute(
            "SELECT id, duracao_minutos, valor FROM servicos WHERE id = ? AND profissional_id = 1 AND ativo = 1", (servico_id,)
        ).fetchone()
        if not servico:
            return jsonify({"erro": "Serviço não encontrado."}), 400

        livres, motivo = calcular_horarios_livres(conn, data, servico['duracao_minutos'])
        if hora not in livres:
            mensagem = MENSAGENS_INDISPONIVEL.get(motivo, "Esse horário não está mais disponível. Escolha outro.")
            return jsonify({"erro": mensagem}), 409

        cursor = conn.cursor()
        cursor.execute("SELECT id FROM clientes WHERE telefone = ?", (telefone_cliente,))
        cliente = cursor.fetchone()

        if cliente:
            cliente_id = cliente['id']
        else:
            cursor.execute("INSERT INTO clientes (nome, telefone) VALUES (?, ?)", (nome_cliente, telefone_cliente))
            cliente_id = cursor.lastrowid

        token = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO agendamentos (cliente_id, servico_id, data_hora, token_cancelamento, duracao_minutos, valor) VALUES (?, ?, ?, ?, ?, ?)",
            (cliente_id, servico['id'], f"{data} {hora}", token, servico['duracao_minutos'], servico['valor'])
        )
        conn.commit()
    finally:
        conn.close()

    return jsonify({
        "mensagem": "Agendamento confirmado com sucesso!",
        "token_cancelamento": token
    }), 201

# --- ROTA 3: Buscar horários disponíveis na data escolhida ---
@app.route('/api/horarios', methods=['GET'])
def horarios_livres():
    data = request.args.get('data')
    if not data:
        return jsonify({"erro": "Data não fornecida"}), 400

    conn = get_db_connection()
    try:
        servico_id = request.args.get('servico_id', type=int)
        if servico_id:
            servico = conn.execute(
                "SELECT duracao_minutos FROM servicos WHERE id = ? AND profissional_id = 1 AND ativo = 1", (servico_id,)
            ).fetchone()
            if not servico:
                return jsonify({"erro": "Serviço não encontrado."}), 404
            duracao = servico['duracao_minutos']
        else:
            # Sem serviço informado, usa o menor tempo (mostra tudo que poderia caber)
            menor = conn.execute(
                "SELECT MIN(duracao_minutos) AS d FROM servicos WHERE profissional_id = 1 AND ativo = 1"
            ).fetchone()
            duracao = menor['d'] or 30

        horarios, motivo = calcular_horarios_livres(conn, data, duracao)
    finally:
        conn.close()

    return jsonify({
        "horarios": horarios,
        "motivo": motivo,
        "mensagem": MENSAGENS_INDISPONIVEL.get(motivo)
    })


# --- ROTA 4: Painel Administrativo (Finanças, Agenda e Meses) ---
@app.route('/api/admin/dashboard', methods=['GET'])
@requer_login_admin
def admin_dashboard():
    conn = get_db_connection()

    # A agenda mostra de hoje em diante; o que já passou aparece na aba Finanças
    inicio_hoje = agora_brasil().strftime('%Y-%m-%d') + ' 00:00'
    agendamentos = conn.execute('''
        SELECT a.id, c.nome as cliente, c.telefone, s.nome as servico,
               COALESCE(a.valor, s.valor) AS valor,
               COALESCE(a.duracao_minutos, s.duracao_minutos) AS duracao_minutos,
               a.data_hora, a.status
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        JOIN servicos s ON a.servico_id = s.id
        WHERE a.data_hora >= ?
        ORDER BY a.data_hora DESC
    ''', (inicio_hoje,)).fetchall()

    # Meses que já foram configurados no banco
    meses = conn.execute('SELECT ano_mes, status FROM meses_abertos').fetchall()

    conn.close()
    return jsonify({
        "agendamentos": [dict(ag) for ag in agendamentos],
        "meses": [dict(m) for m in meses]
    })


# --- ADMIN: finanças por período ---
PERIODOS_FINANCEIROS = ('hoje', 'semana', 'mes', 'mes_passado')

def intervalo_do_periodo(periodo, hoje):
    """Devolve (primeiro_dia, ultimo_dia) do período. A semana vai de segunda a domingo."""
    if periodo == 'hoje':
        return hoje, hoje
    if periodo == 'semana':
        inicio = hoje - timedelta(days=hoje.weekday())
        return inicio, inicio + timedelta(days=6)
    if periodo == 'mes':
        inicio = hoje.replace(day=1)
    else:  # mes_passado
        inicio = (hoje.replace(day=1) - timedelta(days=1)).replace(day=1)
    fim = (inicio.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    return inicio, fim


@app.route('/api/admin/financeiro', methods=['GET'])
@requer_login_admin
def admin_financeiro():
    periodo = request.args.get('periodo', 'hoje')
    if periodo not in PERIODOS_FINANCEIROS:
        return jsonify({"erro": "Período inválido."}), 400

    agora = agora_brasil()
    primeiro, ultimo = intervalo_do_periodo(periodo, agora.date())
    limite_inferior = f"{primeiro.isoformat()} 00:00"
    limite_superior = f"{(ultimo + timedelta(days=1)).isoformat()} 00:00"
    agora_texto = agora.strftime('%Y-%m-%d %H:%M')

    conn = get_db_connection()
    linhas = conn.execute('''
        SELECT a.id, c.nome AS cliente, s.nome AS servico, a.data_hora, a.status,
               COALESCE(a.valor, s.valor) AS valor
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        JOIN servicos s ON a.servico_id = s.id
        WHERE a.data_hora >= ? AND a.data_hora < ?
        ORDER BY a.data_hora DESC
    ''', (limite_inferior, limite_superior)).fetchall()
    conn.close()

    recebido = a_receber = sem_concluir = 0.0
    qtd_concluidos = qtd_a_receber = qtd_sem_concluir = qtd_cancelados = 0
    por_servico = {}
    atendimentos = []

    for l in linhas:
        valor = l['valor'] or 0
        if l['status'] == 'cancelado':
            qtd_cancelados += 1
            continue
        if l['status'] == 'concluido':
            situacao = 'concluido'
            recebido += valor
            qtd_concluidos += 1
            item = por_servico.setdefault(l['servico'], {'servico': l['servico'], 'qtd': 0, 'total': 0.0})
            item['qtd'] += 1
            item['total'] += valor
        elif l['data_hora'] <= agora_texto:
            situacao = 'sem_concluir'   # já passou, mas ainda não foi marcado como concluído
            sem_concluir += valor
            qtd_sem_concluir += 1
        else:
            situacao = 'a_receber'      # ainda vai acontecer
            a_receber += valor
            qtd_a_receber += 1
        atendimentos.append({
            "id": l['id'], "cliente": l['cliente'], "servico": l['servico'],
            "data_hora": l['data_hora'], "valor": valor, "situacao": situacao
        })

    ranking = sorted(por_servico.values(), key=lambda i: i['total'], reverse=True)[:5]
    for item in ranking:
        item['total'] = round(item['total'], 2)

    return jsonify({
        "periodo": periodo,
        "inicio": primeiro.isoformat(),
        "fim": ultimo.isoformat(),
        "recebido": round(recebido, 2),
        "qtd_concluidos": qtd_concluidos,
        "ticket_medio": round(recebido / qtd_concluidos, 2) if qtd_concluidos else 0,
        "a_receber": round(a_receber, 2),
        "qtd_a_receber": qtd_a_receber,
        "sem_concluir": round(sem_concluir, 2),
        "qtd_sem_concluir": qtd_sem_concluir,
        "qtd_cancelados": qtd_cancelados,
        "por_servico": ranking,
        "atendimentos": atendimentos[:300],
        "limitado": len(atendimentos) > 300
    })

# --- ROTA 5: Abrir ou Fechar um Mês ---
@app.route('/api/admin/mes', methods=['POST'])
@requer_login_admin
def alternar_mes():
    dados = request.get_json(silent=True) or {}
    ano_mes = dados.get('ano_mes')
    status = dados.get('status') # 'aberto' ou 'fechado'

    if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', ano_mes or '') or status not in ('aberto', 'fechado'):
        return jsonify({"erro": "Mês ou status inválido."}), 400

    conn = get_db_connection()
    # Atualiza ou insere o estado do mês
    conn.execute('''
        INSERT INTO meses_abertos (ano_mes, status) VALUES (?, ?)
        ON CONFLICT(ano_mes) DO UPDATE SET status = excluded.status
    ''', (ano_mes, status))
    conn.commit()
    conn.close()
    
    return jsonify({"mensagem": f"Mês {ano_mes} agora está {status}!"})

# --- ROTA 6: Listar bloqueios de um mês (Painel Admin) ---
@app.route('/api/admin/bloqueios/<ano_mes>', methods=['GET'])
@requer_login_admin
def listar_bloqueios(ano_mes):
    conn = get_db_connection()
    # Busca bloqueios que começam com o ano e mês solicitados (ex: '2026-09')
    bloqueios = conn.execute(
        "SELECT * FROM bloqueios WHERE data_bloqueio LIKE ? ORDER BY data_bloqueio, hora_bloqueio", 
        (f"{ano_mes}%",)
    ).fetchall()
    conn.close()
    return jsonify([dict(b) for b in bloqueios])

# --- ROTA 6B: Horários do dia que o admin pode bloquear ---
@app.route('/api/admin/grade/<data>', methods=['GET'])
@requer_login_admin
def grade_do_dia(data):
    try:
        datetime.strptime(data, '%Y-%m-%d')
    except ValueError:
        return jsonify({"erro": "Data inválida."}), 400
    conn = get_db_connection()
    grade = gerar_grade(conn, data)
    conn.close()
    return jsonify(grade)

# --- ROTA 7: Adicionar ou Remover Bloqueio ---
@app.route('/api/admin/bloquear', methods=['POST', 'DELETE'])
@requer_login_admin
def gerenciar_bloqueio():
    dados = request.get_json(silent=True) or {}
    data_bloqueio = dados.get('data_bloqueio')
    hora_bloqueio = dados.get('hora_bloqueio') or None # Opcional

    try:
        datetime.strptime(data_bloqueio or '', '%Y-%m-%d')
    except ValueError:
        return jsonify({"erro": "Data inválida."}), 400
    if hora_bloqueio and not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', hora_bloqueio):
        return jsonify({"erro": "Horário inválido."}), 400

    conn = get_db_connection()
    
    if request.method == 'POST':
        # Cria um novo bloqueio (sem duplicar o que já existe)
        ja_existe = conn.execute(
            "SELECT 1 FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS ?",
            (data_bloqueio, hora_bloqueio)
        ).fetchone()
        if not ja_existe:
            conn.execute(
                "INSERT INTO bloqueios (data_bloqueio, hora_bloqueio) VALUES (?, ?)",
                (data_bloqueio, hora_bloqueio)
            )
        mensagem = "Bloqueio registrado com sucesso."
    elif request.method == 'DELETE':
        # Remove um bloqueio existente
        if hora_bloqueio:
            conn.execute("DELETE FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio = ?", (data_bloqueio, hora_bloqueio))
        else:
            conn.execute("DELETE FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NULL", (data_bloqueio,))
        mensagem = "Bloqueio removido."
        
    conn.commit()
    conn.close()
    return jsonify({"mensagem": mensagem})


# ============================================================
# PAINEL ADMIN: serviços, expediente e ações na agenda
# ============================================================
def existe_conflito_agendamento(conn, data, inicio_min, duracao_min, ignorar_id=None):
    """True se já existe outro agendamento (não cancelado) que se sobrepõe a este intervalo."""
    linhas = conn.execute('''
        SELECT a.id, strftime('%H:%M', a.data_hora) AS hora,
               COALESCE(a.duracao_minutos, s.duracao_minutos) AS duracao
        FROM agendamentos a
        JOIN servicos s ON a.servico_id = s.id
        WHERE date(a.data_hora) = ? AND a.status != 'cancelado'
    ''', (data,)).fetchall()
    fim = inicio_min + duracao_min
    for linha in linhas:
        if ignorar_id is not None and linha['id'] == ignorar_id:
            continue
        inicio_outro = hora_para_minutos(linha['hora'])
        if inicio_min < inicio_outro + linha['duracao'] and inicio_outro < fim:
            return True
    return False


def ler_dados_servico(dados):
    """Valida nome, duração e valor de um serviço. Devolve (campos, mensagem_de_erro)."""
    nome = str(dados.get('nome') or '').strip()
    if not 2 <= len(nome) <= 80:
        return None, "O nome do serviço deve ter entre 2 e 80 letras."
    try:
        duracao = int(dados.get('duracao_minutos'))
    except (TypeError, ValueError):
        return None, "Escolha a duração do serviço."
    if not 5 <= duracao <= 600:
        return None, "A duração deve ficar entre 5 minutos e 10 horas."
    try:
        valor = round(float(str(dados.get('valor')).replace(',', '.')), 2)
    except (TypeError, ValueError):
        return None, "Informe o valor do serviço."
    if not 0 <= valor <= 100000:
        return None, "Valor inválido."
    return {'nome': nome, 'duracao_minutos': duracao, 'valor': valor}, None


# --- ADMIN: listar serviços (inclusive os ocultos) ---
@app.route('/api/admin/servicos', methods=['GET'])
@requer_login_admin
def admin_listar_servicos():
    conn = get_db_connection()
    linhas = conn.execute('''
        SELECT s.id, s.nome, s.duracao_minutos, s.valor, s.ativo, s.ordem, s.imagem,
               (SELECT COUNT(*) FROM agendamentos a WHERE a.servico_id = s.id) AS qtd_agendamentos
        FROM servicos s
        WHERE s.profissional_id = 1
        ORDER BY s.ativo DESC, s.ordem, s.id
    ''').fetchall()
    conn.close()
    resultado = []
    for l in linhas:
        item = dict(l)
        item['imagem_url'] = ('/img/servicos/' + quote(item['imagem'])) if item['imagem'] else None
        resultado.append(item)
    return jsonify(resultado)


# --- ADMIN: criar serviço ---
@app.route('/api/admin/servicos', methods=['POST'])
@requer_login_admin
def admin_criar_servico():
    campos, erro = ler_dados_servico(request.get_json(silent=True) or {})
    if erro:
        return jsonify({"erro": erro}), 400
    conn = get_db_connection()
    try:
        proxima = conn.execute(
            "SELECT COALESCE(MAX(ordem), 0) + 1 FROM servicos WHERE profissional_id = 1"
        ).fetchone()[0]
        cursor = conn.execute(
            "INSERT INTO servicos (profissional_id, nome, duracao_minutos, valor, ordem, ativo) VALUES (1, ?, ?, ?, ?, 1)",
            (campos['nome'], campos['duracao_minutos'], campos['valor'], proxima)
        )
        conn.commit()
        novo_id = cursor.lastrowid
    finally:
        conn.close()
    return jsonify({"mensagem": "Serviço criado!", "id": novo_id}), 201


# --- ADMIN: editar serviço, ocultar ou mostrar no site ---
@app.route('/api/admin/servicos/<int:servico_id>', methods=['PUT'])
@requer_login_admin
def admin_editar_servico(servico_id):
    dados = request.get_json(silent=True) or {}
    conn = get_db_connection()
    try:
        atual = conn.execute(
            "SELECT nome, duracao_minutos, valor, ativo FROM servicos WHERE id = ? AND profissional_id = 1", (servico_id,)
        ).fetchone()
        if not atual:
            return jsonify({"erro": "Serviço não encontrado."}), 404

        mesclado = {
            'nome': dados.get('nome', atual['nome']),
            'duracao_minutos': dados.get('duracao_minutos', atual['duracao_minutos']),
            'valor': dados.get('valor', atual['valor']),
        }
        campos, erro = ler_dados_servico(mesclado)
        if erro:
            return jsonify({"erro": erro}), 400
        ativo = atual['ativo'] if 'ativo' not in dados else (1 if dados['ativo'] else 0)

        conn.execute(
            "UPDATE servicos SET nome = ?, duracao_minutos = ?, valor = ?, ativo = ? WHERE id = ?",
            (campos['nome'], campos['duracao_minutos'], campos['valor'], ativo, servico_id)
        )
        conn.commit()
    finally:
        conn.close()
    return jsonify({"mensagem": "Serviço atualizado!"})


# --- ADMIN: excluir serviço (se já teve agendamentos, só é ocultado para não perder o histórico) ---
@app.route('/api/admin/servicos/<int:servico_id>', methods=['DELETE'])
@requer_login_admin
def admin_excluir_servico(servico_id):
    conn = get_db_connection()
    try:
        existe = conn.execute(
            "SELECT 1 FROM servicos WHERE id = ? AND profissional_id = 1", (servico_id,)
        ).fetchone()
        if not existe:
            return jsonify({"erro": "Serviço não encontrado."}), 404
        usos = conn.execute("SELECT COUNT(*) FROM agendamentos WHERE servico_id = ?", (servico_id,)).fetchone()[0]
        if usos:
            conn.execute("UPDATE servicos SET ativo = 0 WHERE id = ?", (servico_id,))
            mensagem = "Esse serviço já tem agendamentos, então foi apenas ocultado do site (o histórico é mantido)."
            ocultado = True
        else:
            foto = conn.execute("SELECT imagem FROM servicos WHERE id = ?", (servico_id,)).fetchone()['imagem']
            apagar_arquivo(PASTA_SERVICOS, foto)
            conn.execute("DELETE FROM servicos WHERE id = ?", (servico_id,))
            mensagem = "Serviço excluído."
            ocultado = False
        conn.commit()
    finally:
        conn.close()
    return jsonify({"mensagem": mensagem, "ocultado": ocultado})


# ============================================================
#  FOTOS E TEXTOS EDITÁVEIS PELO MAILTON
# ============================================================
def apagar_arquivo(pasta, nome):
    if not nome or nome != os.path.basename(nome):
        return
    caminho = os.path.join(pasta, nome)
    if os.path.isfile(caminho):
        try:
            os.remove(caminho)
        except OSError:
            pass


def salvar_foto_enviada(arquivo, pasta, lado_maximo):
    """Confere que é uma foto de verdade, corrige a rotação do celular, reduz e salva em JPEG.
    Devolve (nome_do_arquivo, mensagem_de_erro)."""
    try:
        imagem = Image.open(arquivo.stream)
        imagem.load()
    except Exception:
        return None, "Esse arquivo não parece ser uma foto. Use uma imagem JPG, PNG ou WEBP."
    imagem = ImageOps.exif_transpose(imagem)
    if imagem.mode in ('RGBA', 'LA', 'P'):
        fundo = Image.new('RGB', imagem.size, (0, 0, 0))
        imagem = imagem.convert('RGBA')
        fundo.paste(imagem, mask=imagem.split()[-1])
        imagem = fundo
    else:
        imagem = imagem.convert('RGB')
    imagem.thumbnail((lado_maximo, lado_maximo))
    os.makedirs(pasta, exist_ok=True)
    nome = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}.jpg"
    imagem.save(os.path.join(pasta, nome), 'JPEG', quality=85, optimize=True)
    return nome, None


# --- ADMIN: fotos dos trabalhos ---
@app.route('/api/admin/galeria', methods=['GET'])
@requer_login_admin
def admin_listar_galeria():
    return jsonify([{'nome': n, 'url': '/img/galeria/' + quote(n)} for n in fotos_da_galeria()])


@app.route('/api/admin/galeria', methods=['POST'])
@requer_login_admin
def admin_enviar_galeria():
    arquivos = [a for a in request.files.getlist('fotos') if a and a.filename]
    if not arquivos:
        return jsonify({"erro": "Escolha pelo menos uma foto."}), 400
    if len(fotos_da_galeria()) + len(arquivos) > 60:
        return jsonify({"erro": "A galeria comporta até 60 fotos. Apague algumas antes de enviar mais."}), 400
    enviadas, erros = 0, []
    for arquivo in arquivos:
        nome, erro = salvar_foto_enviada(arquivo, PASTA_GALERIA, 1600)
        if erro:
            erros.append(erro)
        else:
            enviadas += 1
    if not enviadas:
        return jsonify({"erro": erros[0]}), 400
    mensagem = f"{enviadas} foto enviada!" if enviadas == 1 else f"{enviadas} fotos enviadas!"
    if erros:
        mensagem += f" ({len(erros)} não pôde ser usada.)"
    return jsonify({"mensagem": mensagem, "enviadas": enviadas}), 201


@app.route('/api/admin/galeria/<nome>', methods=['DELETE'])
@requer_login_admin
def admin_apagar_foto_galeria(nome):
    if nome != os.path.basename(nome) or nome not in fotos_da_galeria():
        return jsonify({"erro": "Foto não encontrada."}), 404
    apagar_arquivo(PASTA_GALERIA, nome)
    return jsonify({"mensagem": "Foto apagada."})


# --- ADMIN: foto de cada serviço ---
@app.route('/api/admin/servicos/<int:servico_id>/imagem', methods=['POST'])
@requer_login_admin
def admin_enviar_foto_servico(servico_id):
    arquivo = request.files.get('foto')
    if not arquivo or not arquivo.filename:
        return jsonify({"erro": "Escolha uma foto."}), 400
    conn = get_db_connection()
    try:
        atual = conn.execute("SELECT imagem FROM servicos WHERE id = ? AND profissional_id = 1", (servico_id,)).fetchone()
        if not atual:
            return jsonify({"erro": "Serviço não encontrado."}), 404
        nome, erro = salvar_foto_enviada(arquivo, PASTA_SERVICOS, 900)
        if erro:
            return jsonify({"erro": erro}), 400
        conn.execute("UPDATE servicos SET imagem = ? WHERE id = ?", (nome, servico_id))
        conn.commit()
        apagar_arquivo(PASTA_SERVICOS, atual['imagem'])
    finally:
        conn.close()
    return jsonify({"mensagem": "Foto do serviço salva!", "imagem_url": '/img/servicos/' + quote(nome)})


@app.route('/api/admin/servicos/<int:servico_id>/imagem', methods=['DELETE'])
@requer_login_admin
def admin_remover_foto_servico(servico_id):
    conn = get_db_connection()
    try:
        atual = conn.execute("SELECT imagem FROM servicos WHERE id = ? AND profissional_id = 1", (servico_id,)).fetchone()
        if not atual:
            return jsonify({"erro": "Serviço não encontrado."}), 404
        conn.execute("UPDATE servicos SET imagem = NULL WHERE id = ?", (servico_id,))
        conn.commit()
        apagar_arquivo(PASTA_SERVICOS, atual['imagem'])
    finally:
        conn.close()
    return jsonify({"mensagem": "Foto removida."})


# --- ADMIN: subir ou descer um serviço na lista ---
@app.route('/api/admin/servicos/<int:servico_id>/mover', methods=['POST'])
@requer_login_admin
def admin_mover_servico(servico_id):
    direcao = (request.get_json(silent=True) or {}).get('direcao')
    if direcao not in ('cima', 'baixo'):
        return jsonify({"erro": "Direção inválida."}), 400
    conn = get_db_connection()
    try:
        linhas = conn.execute(
            "SELECT id, ativo FROM servicos WHERE profissional_id = 1 ORDER BY ordem, id"
        ).fetchall()
        ids = [l['id'] for l in linhas]
        if servico_id not in ids:
            return jsonify({"erro": "Serviço não encontrado."}), 404
        ativo = {l['id']: l['ativo'] for l in linhas}[servico_id]
        grupo = [l['id'] for l in linhas if l['ativo'] == ativo]  # só troca com vizinhos visíveis/ocultos do mesmo tipo
        pos = grupo.index(servico_id)
        alvo = pos - 1 if direcao == 'cima' else pos + 1
        if 0 <= alvo < len(grupo):
            a, b = ids.index(grupo[pos]), ids.index(grupo[alvo])
            ids[a], ids[b] = ids[b], ids[a]
        for nova_ordem, sid in enumerate(ids, start=1):
            conn.execute("UPDATE servicos SET ordem = ? WHERE id = ?", (nova_ordem, sid))
        conn.commit()
    finally:
        conn.close()
    return jsonify({"mensagem": "Ordem atualizada."})


# --- ADMIN: texto "Sobre" da página do cliente ---
@app.route('/api/admin/sobre', methods=['GET'])
@requer_login_admin
def admin_ler_sobre():
    return texto_sobre_publico()


@app.route('/api/admin/sobre', methods=['PUT'])
@requer_login_admin
def admin_salvar_sobre():
    texto = str((request.get_json(silent=True) or {}).get('texto') or '').strip()
    if not 10 <= len(texto) <= 700:
        return jsonify({"erro": "O texto deve ter entre 10 e 700 letras."}), 400
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO configuracoes (chave, valor) VALUES ('sobre_texto', ?) "
                     "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (texto,))
        conn.commit()
    finally:
        conn.close()
    return jsonify({"mensagem": "Texto salvo! Já está no site."})


# --- ADMIN: ver o expediente (dias, faixas e intervalo) ---
@app.route('/api/admin/expediente', methods=['GET'])
@requer_login_admin
def admin_ver_expediente():
    conn = get_db_connection()
    dias = {str(n): [] for n in range(7)}
    for l in conn.execute("SELECT dia_semana, inicio, fim FROM expediente ORDER BY dia_semana, inicio"):
        dias[str(l['dia_semana'])].append({"inicio": l['inicio'], "fim": l['fim']})
    intervalo = obter_intervalo(conn)
    conn.close()
    return jsonify({"intervalo": intervalo, "dias": dias})


# --- ADMIN: salvar o expediente ---
@app.route('/api/admin/expediente', methods=['PUT'])
@requer_login_admin
def admin_salvar_expediente():
    dados = request.get_json(silent=True) or {}

    try:
        intervalo = int(dados.get('intervalo'))
    except (TypeError, ValueError):
        return jsonify({"erro": "Escolha o intervalo entre os horários."}), 400
    if intervalo not in (15, 20, 30, 45, 60):
        return jsonify({"erro": "Intervalo inválido."}), 400

    dias = dados.get('dias')
    if not isinstance(dias, dict):
        return jsonify({"erro": "Dados do expediente inválidos."}), 400

    nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
    novas_faixas = []
    for numero in range(7):
        faixas = dias.get(str(numero)) or []
        if not isinstance(faixas, list) or len(faixas) > 4:
            return jsonify({"erro": f"Muitos períodos na {nomes[numero]}."}), 400
        validadas = []
        for faixa in faixas:
            inicio = str((faixa or {}).get('inicio') or '')
            fim = str((faixa or {}).get('fim') or '')
            if not (re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', inicio) and re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', fim)):
                return jsonify({"erro": f"Horário inválido na {nomes[numero]}."}), 400
            ini_min, fim_min = hora_para_minutos(inicio), hora_para_minutos(fim)
            if fim_min <= ini_min:
                return jsonify({"erro": f"Na {nomes[numero]}, o fim precisa ser depois do início."}), 400
            if fim_min - ini_min < intervalo:
                return jsonify({"erro": f"Na {nomes[numero]}, um período ({inicio} às {fim}) é menor que o intervalo de {intervalo} min."}), 400
            validadas.append((ini_min, fim_min, inicio, fim))
        validadas.sort()
        for anterior, seguinte in zip(validadas, validadas[1:]):
            if seguinte[0] < anterior[1]:
                return jsonify({"erro": f"Na {nomes[numero]}, os períodos estão se sobrepondo."}), 400
        for _, _, inicio, fim in validadas:
            novas_faixas.append((numero, inicio, fim))

    if not novas_faixas:
        return jsonify({"erro": "Marque pelo menos um dia de atendimento."}), 400

    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM expediente")
        conn.executemany("INSERT INTO expediente (dia_semana, inicio, fim) VALUES (?, ?, ?)", novas_faixas)
        conn.execute(
            "INSERT INTO configuracoes (chave, valor) VALUES ('intervalo_min', ?) "
            "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (str(intervalo),)
        )
        conn.commit()
    finally:
        conn.close()
    return jsonify({"mensagem": "Horários de atendimento salvos!"})


# --- ADMIN: concluir, cancelar ou reativar um agendamento ---
@app.route('/api/admin/agendamentos/<int:agendamento_id>/status', methods=['POST'])
@requer_login_admin
def admin_mudar_status(agendamento_id):
    dados = request.get_json(silent=True) or {}
    novo = dados.get('status')
    if novo not in ('agendado', 'concluido', 'cancelado'):
        return jsonify({"erro": "Status inválido."}), 400

    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        ag = conn.execute('''
            SELECT a.status, a.data_hora, COALESCE(a.duracao_minutos, s.duracao_minutos) AS duracao
            FROM agendamentos a JOIN servicos s ON a.servico_id = s.id
            WHERE a.id = ?
        ''', (agendamento_id,)).fetchone()
        if not ag:
            return jsonify({"erro": "Agendamento não encontrado."}), 404
        if ag['status'] == novo:
            return jsonify({"mensagem": "Nada a alterar."})

        # Reativar um cancelado só é possível se o horário ainda estiver livre
        if ag['status'] == 'cancelado' and novo != 'cancelado':
            data, hora = ag['data_hora'].split(' ')
            if existe_conflito_agendamento(conn, data, hora_para_minutos(hora), ag['duracao'], ignorar_id=agendamento_id):
                return jsonify({"erro": "Esse horário já foi ocupado por outro cliente, não dá para reativar."}), 409

        conn.execute("UPDATE agendamentos SET status = ? WHERE id = ?", (novo, agendamento_id))
        conn.commit()
    finally:
        conn.close()
    textos = {'agendado': 'Agendamento reativado.', 'concluido': 'Atendimento concluído!', 'cancelado': 'Agendamento cancelado.'}
    return jsonify({"mensagem": textos[novo]})


# --- ADMIN: novo agendamento / encaixe feito pelo próprio Mailton ---
@app.route('/api/admin/agendar', methods=['POST'])
@requer_login_admin
def admin_agendar():
    dados = request.get_json(silent=True) or {}
    nome_cliente = (dados.get('nome_cliente') or '').strip()[:80]
    telefone = re.sub(r'\D', '', str(dados.get('telefone_cliente') or ''))
    servico_id = dados.get('servico_id')
    data_hora = (dados.get('data_hora') or '').strip()
    forcar = bool(dados.get('forcar'))

    if len(nome_cliente) < 2:
        return jsonify({"erro": "Informe o nome do cliente."}), 400
    if not 10 <= len(telefone) <= 13:
        return jsonify({"erro": "Informe um WhatsApp válido, com DDD."}), 400
    try:
        momento = datetime.strptime(data_hora, '%Y-%m-%d %H:%M')
    except ValueError:
        return jsonify({"erro": "Data ou horário inválido."}), 400
    data, hora = data_hora.split(' ')
    inicio = hora_para_minutos(hora)

    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        servico = conn.execute(
            "SELECT id, duracao_minutos, valor FROM servicos WHERE id = ? AND profissional_id = 1", (servico_id,)
        ).fetchone()
        if not servico:
            return jsonify({"erro": "Escolha o serviço."}), 400
        duracao = servico['duracao_minutos']

        # Dois clientes ao mesmo tempo nunca: isso o Mailton não pode forçar
        if existe_conflito_agendamento(conn, data, inicio, duracao):
            return jsonify({"erro": "Já existe outro agendamento nesse horário."}), 409

        # Avisos: o Mailton pode confirmar e seguir mesmo assim
        avisos = []
        if momento < agora_brasil():
            avisos.append("Esse horário já passou.")
        faixas = obter_faixas_do_dia(conn, dia_da_semana(data))
        if not any(f_ini <= inicio and inicio + duracao <= f_fim for f_ini, f_fim in faixas):
            avisos.append("Esse horário está fora do seu horário de atendimento.")
        intervalo = obter_intervalo(conn)
        bloqueado = conn.execute(
            "SELECT 1 FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NULL", (data,)
        ).fetchone()
        if not bloqueado:
            for b in conn.execute(
                "SELECT hora_bloqueio FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NOT NULL", (data,)
            ):
                b_ini = hora_para_minutos(b['hora_bloqueio'])
                if inicio < b_ini + intervalo and b_ini < inicio + duracao:
                    bloqueado = True
                    break
        if bloqueado:
            avisos.append("Esse horário está bloqueado na sua agenda.")
        if avisos and not forcar:
            return jsonify({"erro": " ".join(avisos), "avisos": avisos, "pode_forcar": True}), 409

        cursor = conn.cursor()
        cursor.execute("SELECT id FROM clientes WHERE telefone = ?", (telefone,))
        cliente = cursor.fetchone()
        if cliente:
            cliente_id = cliente['id']
        else:
            cursor.execute("INSERT INTO clientes (nome, telefone) VALUES (?, ?)", (nome_cliente, telefone))
            cliente_id = cursor.lastrowid

        token = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO agendamentos (cliente_id, servico_id, data_hora, token_cancelamento, duracao_minutos, valor) VALUES (?, ?, ?, ?, ?, ?)",
            (cliente_id, servico['id'], f"{data} {hora}", token, duracao, servico['valor'])
        )
        novo_id = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()

    return jsonify({
        "mensagem": "Agendamento criado!",
        "id": novo_id,
        "token_cancelamento": token,
        "telefone": telefone
    }), 201


# --- ROTA 8: Página de Cancelamento (aberta pelo cliente via link do WhatsApp) ---
@app.route('/cancelar/<token>', methods=['GET'])
def pagina_cancelamento(token):
    conn = get_db_connection()
    agendamento = conn.execute('''
        SELECT a.status, a.data_hora, c.nome as cliente, s.nome as servico, s.valor
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        JOIN servicos s ON a.servico_id = s.id
        WHERE a.token_cancelamento = ?
    ''', (token,)).fetchone()
    conn.close()

    if not agendamento:
        return render_template('cancelar.html', encontrado=False), 404

    agendamento = dict(agendamento)

    # Formata "2026-09-30 14:00" como "30/09/2026 às 14:00"
    try:
        partes_data, hora = agendamento['data_hora'].split(' ')
        ano, mes, dia = partes_data.split('-')
        agendamento['data_formatada'] = f"{dia}/{mes}/{ano} às {hora}"
    except (ValueError, KeyError):
        agendamento['data_formatada'] = agendamento['data_hora']

    return render_template('cancelar.html', encontrado=True, agendamento=agendamento, token=token)


# --- ROTA 9: Efetivar o Cancelamento ---
@app.route('/api/cancelar/<token>', methods=['POST'])
def cancelar_agendamento(token):
    conn = get_db_connection()
    agendamento = conn.execute(
        "SELECT id, status FROM agendamentos WHERE token_cancelamento = ?", (token,)
    ).fetchone()

    if not agendamento:
        conn.close()
        return jsonify({"erro": "Agendamento não encontrado."}), 404

    if agendamento['status'] == 'cancelado':
        conn.close()
        return jsonify({"mensagem": "Este agendamento já estava cancelado."}), 200

    if agendamento['status'] == 'concluido':
        conn.close()
        return jsonify({"erro": "Este atendimento já foi concluído e não pode ser cancelado."}), 400

    conn.execute("UPDATE agendamentos SET status = 'cancelado' WHERE id = ?", (agendamento['id'],))
    conn.commit()
    conn.close()

    return jsonify({"mensagem": "Agendamento cancelado com sucesso."})


if __name__ == '__main__':
    print("Agenda do Mailton Maia a iniciar...")
    # Em produção, defina WN_DEBUG=false no ambiente antes de iniciar o servidor.
    modo_debug = os.environ.get('WN_DEBUG', 'true').lower() == 'true'
    app.run(host='0.0.0.0', debug=modo_debug, port=5000)