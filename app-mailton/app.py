from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from functools import wraps
from datetime import datetime, timedelta, timezone
import sqlite3
import uuid
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# static_folder=None porque vamos servir os arquivos (css/js/img) manualmente abaixo,
# mantendo os mesmos caminhos relativos que o index.html e o admin.html já usam.
app = Flask(__name__, static_folder=None)

def get_db_connection():
    conn = sqlite3.connect(os.path.join(BASE_DIR, 'wn_beauty_system.db'))
    conn.row_factory = sqlite3.Row
    return conn

# --- REGRAS DA AGENDA ---
HORARIOS_EXPEDIENTE = ['09:00', '10:30', '14:00', '15:30', '17:00']  # Etapa 2: virá do banco
INTERVALO_SLOT_MIN = 90   # quanto tempo um horário bloqueado pelo admin ocupa na agenda
FUSO_BRASIL = timezone(timedelta(hours=-3))  # o servidor do PythonAnywhere roda em UTC

MENSAGENS_INDISPONIVEL = {
    'data_invalida': 'Data inválida.',
    'data_passada': 'Essa data já passou.',
    'mes_fechado': 'A agenda deste mês ainda não foi aberta.',
    'dia_bloqueado': 'Este dia não está disponível para agendamento.',
}

def agora_brasil():
    return datetime.now(FUSO_BRASIL).replace(tzinfo=None)

def hora_para_minutos(hhmm):
    h, m = hhmm.split(':')
    return int(h) * 60 + int(m)

def calcular_horarios_livres(conn, data, duracao_min):
    """Devolve (horarios_livres, motivo). O motivo é None quando a agenda do dia está aberta.
    Um horário só fica livre se o serviço inteiro (início + duração) couber sem encostar
    em outro agendamento ou em um bloqueio do admin."""
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

    dia_bloqueado = conn.execute(
        "SELECT 1 FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NULL", (data,)
    ).fetchone()
    if dia_bloqueado:
        return [], 'dia_bloqueado'

    # Intervalos já ocupados no dia, em minutos: (início, fim)
    ocupados = []
    for b in conn.execute(
        "SELECT hora_bloqueio FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NOT NULL", (data,)
    ):
        inicio = hora_para_minutos(b['hora_bloqueio'])
        ocupados.append((inicio, inicio + INTERVALO_SLOT_MIN))

    agendados = conn.execute('''
        SELECT strftime('%H:%M', a.data_hora) AS hora, s.duracao_minutos AS duracao
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
    for hora in HORARIOS_EXPEDIENTE:
        inicio = hora_para_minutos(hora)
        fim = inicio + duracao_min
        if inicio <= minutos_agora:
            continue
        if any(inicio < o_fim and o_inicio < fim for o_inicio, o_fim in ocupados):
            continue
        livres.append(hora)
    return livres, None


# --- ROTAS DE PÁGINAS E ARQUIVOS ESTÁTICOS ---
@app.route('/')
def pagina_cliente():
    return send_from_directory(BASE_DIR, 'index.html')

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
# (nunca deixe a senha real em texto puro no código). Veja o final deste arquivo
# para o comando que gera o hash de uma senha nova.
SECRET_KEY = os.environ.get('WN_SECRET_KEY', 'troque-esta-chave-antes-de-ir-para-producao')
ADMIN_PASSWORD_HASH = os.environ.get(
    'WN_ADMIN_PASSWORD_HASH',
    generate_password_hash('2020')  # senha padrão só para testar localmente
)
TOKEN_MAX_AGE_SEGUNDOS = 60 * 60 * 8  # o token expira depois de 8 horas

serializer = URLSafeTimedSerializer(SECRET_KEY)

def gerar_token_admin():
    return serializer.dumps({'admin': True})

def token_valido(token):
    try:
        dados = serializer.loads(token, max_age=TOKEN_MAX_AGE_SEGUNDOS)
        return dados.get('admin') is True
    except (BadSignature, SignatureExpired):
        return False

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

# --- ROTA DE LOGIN DO ADMIN ---
@app.route('/api/admin/login', methods=['POST'])
def login_admin():
    dados = request.json or {}
    senha = dados.get('senha', '')
    if check_password_hash(ADMIN_PASSWORD_HASH, senha):
        return jsonify({"token": gerar_token_admin()})
    return jsonify({"erro": "Senha incorreta"}), 401

# --- ROTA 1: Enviar os serviços para o HTML ---
@app.route('/api/servicos', methods=['GET'])
def listar_servicos():
    conn = get_db_connection()
    servicos = conn.execute('SELECT id, nome, duracao_minutos, valor FROM servicos WHERE profissional_id = 1').fetchall()
    conn.close()
    return jsonify([dict(servico) for servico in servicos])

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
            "SELECT id, duracao_minutos FROM servicos WHERE id = ? AND profissional_id = 1", (servico_id,)
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
            "INSERT INTO agendamentos (cliente_id, servico_id, data_hora, token_cancelamento) VALUES (?, ?, ?, ?)",
            (cliente_id, servico['id'], f"{data} {hora}", token)
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
                "SELECT duracao_minutos FROM servicos WHERE id = ? AND profissional_id = 1", (servico_id,)
            ).fetchone()
            if not servico:
                return jsonify({"erro": "Serviço não encontrado."}), 404
            duracao = servico['duracao_minutos']
        else:
            # Sem serviço informado, usa o menor tempo (mostra tudo que poderia caber)
            menor = conn.execute(
                "SELECT MIN(duracao_minutos) AS d FROM servicos WHERE profissional_id = 1"
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
    
    # 1. Puxa os agendamentos e finanças
    query = '''
        SELECT a.id, c.nome as cliente, c.telefone, s.nome as servico, 
               s.valor, a.data_hora, a.status 
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        JOIN servicos s ON a.servico_id = s.id
        ORDER BY a.data_hora DESC
    '''
    agendamentos = conn.execute(query).fetchall()
    receita_total = sum([ag['valor'] for ag in agendamentos if ag['status'] != 'cancelado'])
    
    # 2. Puxa os meses que já foram configurados no banco
    meses = conn.execute('SELECT ano_mes, status FROM meses_abertos').fetchall()
    
    conn.close()
    return jsonify({
        "receita_total": receita_total,
        "agendamentos": [dict(ag) for ag in agendamentos],
        "meses": [dict(m) for m in meses]
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
    print("Servidor do WN Beauty System a iniciar...")
    # Em produção, defina WN_DEBUG=false no ambiente antes de iniciar o servidor.
    modo_debug = os.environ.get('WN_DEBUG', 'true').lower() == 'true'
    app.run(host='0.0.0.0', debug=modo_debug, port=5000)