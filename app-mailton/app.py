from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from functools import wraps
import sqlite3
import uuid
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# static_folder=None porque vamos servir os arquivos (css/js/img) manualmente abaixo,
# mantendo os mesmos caminhos relativos que o index.html e o admin.html já usam.
app = Flask(__name__, static_folder=None)

def get_db_connection():
    conn = sqlite3.connect(os.path.join(BASE_DIR, 'wn_beauty_system.db'))
    conn.row_factory = sqlite3.Row
    return conn

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
    dados = request.json
    
    nome_cliente = dados.get('nome_cliente')
    telefone_cliente = dados.get('telefone_cliente')
    servico_id = dados.get('servico_id')
    data_hora = dados.get('data_hora')
    
    if not all([nome_cliente, telefone_cliente, servico_id, data_hora]):
        return jsonify({"erro": "Faltam dados obrigatórios"}), 400

    conn = get_db_connection()
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
        (cliente_id, servico_id, data_hora, token)
    )
    
    conn.commit()
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

    # Tempo base de atendimento (isso poderá vir do banco futuramente)
    horarios_expediente = ['09:00', '10:30', '14:00', '15:30', '17:00']
    
    conn = get_db_connection()
    
    # 1. Verifica se o dia INTEIRO está bloqueado (hora_bloqueio IS NULL)
    dia_bloqueado = conn.execute(
        "SELECT id FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NULL", (data,)
    ).fetchone()
    
    if dia_bloqueado:
        conn.close()
        return jsonify([]) # Retorna lista vazia, bloqueando o dia no front-end
        
    # 2. Busca horários específicos bloqueados pelo Mailton
    bloqueios_parciais = conn.execute(
        "SELECT hora_bloqueio FROM bloqueios WHERE data_bloqueio = ? AND hora_bloqueio IS NOT NULL", (data,)
    ).fetchall()
    horarios_bloqueados_admin = [b['hora_bloqueio'] for b in bloqueios_parciais]

    # 3. Busca horários já agendados por clientes
    ocupados = conn.execute(
        "SELECT strftime('%H:%M', data_hora) as hora FROM agendamentos WHERE date(data_hora) = ? AND status != 'cancelado'", 
        (data,)
    ).fetchall()
    horarios_ocupados_clientes = [h['hora'] for h in ocupados]
    
    conn.close()
    
    # Remove da lista os horários agendados e os bloqueados manualmente
    todos_indisponiveis = set(horarios_bloqueados_admin + horarios_ocupados_clientes)
    horarios_disponiveis = [h for h in horarios_expediente if h not in todos_indisponiveis]
    
    return jsonify(horarios_disponiveis)


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
    dados = request.json
    ano_mes = dados.get('ano_mes')
    status = dados.get('status') # 'aberto' ou 'fechado'
    
    conn = get_db_connection()
    # Atualiza ou insere o estado do mês
    conn.execute('''
        INSERT INTO meses_abertos (ano_mes, status) VALUES (?, ?)
        ON CONFLICT(ano_mes) DO UPDATE SET status = excluded.status
    ''', (ano_mes, status))
    conn.commit()
    conn.close()
    
    return jsonify({"mensagem": f"Mês {ano_mes} agora está {status}!"})

if __name__ == '__main__':
    print("Servidor do WN Beauty System a iniciar...")
    # Em produção, defina WN_DEBUG=false no ambiente antes de iniciar o servidor.
    modo_debug = os.environ.get('WN_DEBUG', 'true').lower() == 'true'
    app.run(host='0.0.0.0', debug=modo_debug, port=5000)

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
    dados = request.json
    data_bloqueio = dados.get('data_bloqueio')
    hora_bloqueio = dados.get('hora_bloqueio') # Opcional
    
    conn = get_db_connection()
    
    if request.method == 'POST':
        # Cria um novo bloqueio
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